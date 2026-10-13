// BlockBenchAI FORGE — AI agent: intent planning, tool budgets, context.
//
// The agent never sends raw scenes: only a bounded snapshot (configurable
// counts), the last 4 history turns truncated to 280 chars, and the smallest
// tool set that can satisfy the classified intent. Token pressure is
// estimated from real UTF-8 bytes before every request (Groq OSS 120B free
// tier guard), and refinement requests are forced through inspect-first with
// a quarter geometry budget so existing work is never clobbered blindly.

import { GEMINI_ENDPOINT, GROQ_ENDPOINT, MAX_CUBES_PER_RUN, MAX_TOOL_CALLS } from './types';
import type { HistoryTurn, RunBudget, SceneInfo, ToolDef } from './types';
import { fail } from './validate';

export type Intent = 'character' | 'prop' | 'edit' | 'geometry' | 'object';

export interface Plan {
  intent: Intent;
  tools: string[];
  refine: boolean;
  cubeBudget: number;
}

const CHARACTER_RE = /(aldean|villager|androide|android|robot|personaje|character|humanoid|humano|caballero|knight|golem)/i;
const PROP_RE = /(espada|sword|katana|blade|dron|drone|quadcop|cofre|chest|baul|golem|mech|walker|walker|caminante)/i;
const EDIT_RE = /(modifica|modificar|cambia|cambiar|ajusta|ajustar|editar|edita|pinta|pintar|repinta|repaint|modify|change|color|textur|extend|alarga|mejora|improve|refina|refine|arregla|fix)/i;
const GEOMETRY_RE = /(simetr|mirror|symmetr|espejo|repet|array|matriz|fila|extru|prisma|bisel|jerarqu|agrupa|organiza|escala|scale|mueve|mover|desplaza|transform|gira|rotate)/i;

export function classifyIntent(prompt: string, populated: boolean): Intent {
  const text = String(prompt || '');
  if (populated && EDIT_RE.test(text)) return 'edit';
  if (GEOMETRY_RE.test(text)) return 'geometry';
  if (PROP_RE.test(text)) return 'prop';
  if (CHARACTER_RE.test(text)) return 'character';
  if (populated && /(crea|create|genera|generate|añade|add|construye|build)/i.test(text)) return 'object';
  if (EDIT_RE.test(text)) return 'edit';
  return 'object';
}

export function isRefinement(prompt: string): boolean {
  return /\b(refina|refinar|refine|mejora|mejorar|improve|pule|pulir|polish|retoca|retocar|termina|terminar|finish|completa|completar)\b/i.test(
    String(prompt || '')
  );
}

// Legacy-compatible tool routing. The exact tool lists for the four legacy
// intents are frozen by tests; new FORGE tools only extend the edit and
// geometry sets.
export function planTools(intent: Intent, prompt: string, populated: boolean, endpoint: string, all: ToolDef[]): ToolDef[] {
  const byName = function (name: string): ToolDef {
    const found = all.filter(function (t) {
      return t.function.name === name;
    })[0];
    if (!found) fail('Tool not registered: ' + name);
    return found;
  };
  const refine = isRefinement(prompt);
  if (intent === 'edit') {
    return [
      byName('inspect_scene'),
      byName('edit_cubes'),
      byName('paint_existing_cubes'),
      byName('retouch_cubes'),
      byName('transform_selection'),
      byName('mirror_cubes'),
      byName('repeat_array'),
      byName('organize_hierarchy'),
      byName('extrude_profile'),
    ];
  }
  if (intent === 'geometry') {
    void refine;
    return [
      byName('inspect_scene'),
      byName('mirror_cubes'),
      byName('repeat_array'),
      byName('transform_selection'),
      byName('organize_hierarchy'),
      byName('extrude_profile'),
      byName('create_cubes'),
      byName('edit_cubes'),
    ];
  }
  if (intent === 'prop') return [byName('generate_prop'), byName('inspect_scene')];
  if (intent === 'character') {
    if (endpoint === GEMINI_ENDPOINT) return [byName('generate_character'), byName('compose_model'), byName('inspect_scene')];
    return [byName('generate_character'), byName('inspect_scene')];
  }
  void populated;
  return [byName('compose_model'), byName('inspect_scene')];
}

export function planBudget(prompt: string, project: unknown): RunBudget {
  const full = MAX_CUBES_PER_RUN;
  const budget: RunBudget = { project: project, remainingCubes: full, toolCalls: 0 };
  if (isRefinement(prompt)) budget.remainingCubes = Math.floor(full / 4);
  return budget;
}

export function toolCallBudget(): number {
  return MAX_TOOL_CALLS;
}

// Conservative token estimate: 1 token per 2.8 UTF-8 bytes + output headroom.
// Mirrors the preflight guard so tests and runtime agree.
export function estimateTokens(payload: string, headroom: number): number {
  const bytes = utf8Length(payload);
  return Math.ceil(bytes / 2.8) + (headroom === undefined ? 900 : headroom);
}

export function utf8Length(text: string): number {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

export function preflightPayload(payload: string, endpoint: string, model: string): void {
  if (endpoint.indexOf(GROQ_ENDPOINT.split('/openai/')[0]) !== 0) return;
  if (!/gpt-oss-120b/i.test(model)) return;
  const estimated = estimateTokens(payload, 900);
  if (estimated > 6400) {
    fail(
      'La solicitud es demasiado grande para Groq gratis (aprox. ' +
        estimated +
        ' tokens con margen). Reduce el historial o usa Gemini en Ajustes; no enviaré una petición destinada a fallar con 413.'
    );
  }
}

export function summarizeHistory(history: HistoryTurn[]): HistoryTurn[] {
  return (history || []).slice(-4).map(function (m) {
    return { role: m.role, content: String(m.content).slice(0, 280) };
  });
}

export function compactSceneSnapshot(ctx: SceneInfo, firstRound: boolean): unknown {
  return {
    format: ctx.project.format,
    cubes_allowed: ctx.project.capabilities.cubes,
    cubes: ctx.totals.cubes,
    selected: ctx.totals.selected_cubes,
    textures: ctx.totals.textures,
    groups: ctx.groups.slice(0, firstRound ? 10 : 5).map(function (g) {
      return [g.uuid, g.name];
    }),
    items: ctx.cubes.slice(0, firstRound ? 12 : 6).map(function (c) {
      return [c.uuid, c.name, c.from, c.to];
    }),
  };
}

export function refinementGuard(plan: Plan, sceneCubes: number): string {
  if (plan.refine && sceneCubes === 0) {
    return 'Refinement requested but the scene is empty: a full generation fits the request better than edits.';
  }
  if (plan.refine) {
    return 'Refinement mode: inspect first, then apply at most a quarter-budget of small edits. Never rebuild from scratch.';
  }
  return '';
}

export function makePlan(prompt: string, populated: boolean): Plan {
  const intent = classifyIntent(prompt, populated);
  return { intent: intent, tools: [], refine: isRefinement(prompt), cubeBudget: planBudget(prompt, null).remainingCubes };
}
