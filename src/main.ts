// BlockBenchAI FORGE — main: tool assembly, generators, agent loop, plugin.
//
// Wires every module into the single installable closure: legacy tool
// contracts (frozen for compatibility), FORGE geometry/texture tools, the
// compact protocol, deterministic character/prop generators, the planning
// loop with budgets and stale-edit protection, native preferences, and the
// Blockbench plugin registration.

import {
  CLOUDFLARE_MODEL,
  DEFAULT_ENDPOINT,
  FACE_NAMES,
  GEMINI_ENDPOINT,
  GROQ_ENDPOINT,
  MAX_CUBES_PER_CALL,
  MAX_CUBES_PER_RUN,
  MAX_PAINTED_PARTS,
  MAX_ROUNDS,
  MAX_TOOL_CALLS,
  STORAGE_KEY,
  VERSION,
} from './types';
import type { ForgeConfig, HistoryTurn, Palette, PanelPrefs, ProgressEvent, RgbPalette, RunBudget, SceneInfo, StoredPreferences, StringMap, ToolDef } from './types';
import { checkedColor, colorCode, coordinates, fail, rgb, safeName, vec } from './validate';
import {
  activeProject,
  allCubes,
  allGroups,
  createCubesOp,
  createGroupOp,
  defineTool,
  editCubesOp,
  extrudeProfileOp,
  findCube,
  geometryToolDefs,
  mirrorCubesOp,
  organizeHierarchyOp,
  redraw,
  repeatArrayOp,
  resolveGroup,
  transformCubesOp,
} from './geometry';
import {
  buildAtlasTexture,
  buildPaintedModelOp,
  lookupTile,
  mapCubeToAtlas,
  paintCapability,
  paintCubesNeutral,
  paintExistingCubesOp,
  retouchCubesOp,
  textureToolDefs,
} from './texture';
import { CHARACTER_STYLES, PROP_KINDS, benchmarkDefs, defaultPalette, humanoidParts, propParts, propPalette } from './presets';
import { classifyIntent, compactSceneSnapshot, planBudget, planTools, summarizeHistory } from './agent';
import {
  checkProviderConnection,
  cloudflareEndpoint,
  isLocalEndpoint,
  requestCompletion,
  safeError,
  validCloudflareAccount,
  validateEndpoint,
} from './providers';
import { friendlyOpName, fullCss, makeComponent } from './ui';

// ---------------------------------------------------------------------------
// Plugin session state (in-memory only; never persisted to disk).
// ---------------------------------------------------------------------------

const ID: string = 'blockbench_ai';
let panel: any = null;
let action: any = null;
let style: any = null;
let runningController: any = null;
const registeredSettings: any = {};
let sessionApiKey: string = '';

// Late-bound accessors used by ui.ts (same closure, resolved at call time).
export function sessionApiKeyForView(): string {
  return sessionApiKey;
}
export function setSessionApiKey(value: string): void {
  sessionApiKey = value;
}
export function startRunning(): any {
  runningController = new AbortController();
  return runningController;
}
export function abortRunning(): void {
  if (runningController) runningController.abort();
}
export function freshBudget(): RunBudget {
  return { project: activeProject(), remainingCubes: MAX_CUBES_PER_RUN, toolCalls: 0 };
}

// ---------------------------------------------------------------------------
// Scene reading + integrity.
// ---------------------------------------------------------------------------

export function readScene(options: any): SceneInfo {
  activeProject();
  const opts = options || {};
  const limit = Number.isInteger(opts.limit) ? Math.max(1, Math.min(120, opts.limit)) : 60;
  const search = typeof opts.query === 'string' ? opts.query.toLowerCase().slice(0, 80) : '';
  const matching = allCubes().filter(function (c) {
    return (!opts.selected_only || c.selected) && (!search || c.name.toLowerCase().indexOf(search) !== -1);
  });
  const selected = allCubes()
    .filter(function (c) {
      return c.selected;
    })
    .slice(0, 16);
  const shortlist = selected.concat(
    matching.filter(function (c) {
      return selected.indexOf(c) === -1;
    })
  );
  const textures = typeof Texture !== 'undefined' && Texture.all ? Texture.all.length : 0;
  return {
    project: {
      name: Project.name || '',
      format: Format.id || 'unknown',
      capabilities: {
        cubes: Format.cubes !== false,
        meshes: !!Format.meshes,
        bone_rig: !!Format.bone_rig,
        animation_mode: !!Format.animation_mode,
      },
    },
    totals: { cubes: allCubes().length, groups: allGroups().length, selected_cubes: selected.length, textures: textures },
    groups: allGroups()
      .slice(0, 35)
      .map(function (g) {
        return { uuid: g.uuid, name: g.name, parent_uuid: (g.parent && g.parent.uuid) || null };
      }),
    cubes: shortlist.slice(0, limit).map(function (c) {
      return {
        uuid: c.uuid,
        name: c.name,
        from: c.from.slice(),
        to: c.to.slice(),
        origin: (c.origin && c.origin.slice()) || [0, 0, 0],
        rotation: (c.rotation && c.rotation.slice()) || [0, 0, 0],
        color: c.color,
        selected: !!c.selected,
        parent_uuid: (c.parent && c.parent.uuid) || null,
      };
    }),
    truncated: matching.length > limit,
  };
}

export function sceneRevisionSignature(): number {
  let hash = 2166136261;
  const add = function (value: unknown): void {
    const text = String(value);
    for (let idx = 0; idx < text.length; idx++) {
      hash ^= text.charCodeAt(idx);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  };
  add((Project && Project.uuid) || 'unknown');
  add((Format && Format.id) || 'unknown');
  add(allCubes().length);
  allCubes().forEach(function (c) {
    add(c.uuid);
    add(c.name);
    add((c.from || []).join(','));
    add((c.to || []).join(','));
    add((c.origin || []).join(','));
    add((c.rotation || []).join(','));
    add((c.parent && c.parent.uuid) || 'root');
    add(c.locked);
    add(c.selected);
  });
  add(allGroups().length);
  allGroups().forEach(function (g) {
    add(g.uuid);
    add(g.name);
    add((g.parent && g.parent.uuid) || 'root');
  });
  if (typeof Texture !== 'undefined' && Texture.all) {
    add(Texture.all.length);
    Texture.all.forEach(function (t: any) {
      add(t.uuid);
      add(t.name);
      add(t.width);
      add(t.height);
      add((t.source && t.source.length) || 0);
    });
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Generators (deterministic; also power offline demos and benchmarks).
// ---------------------------------------------------------------------------

const vectorSchema: any = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const cubeSchema: any = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    from: vectorSchema,
    to: vectorSchema,
    origin: vectorSchema,
    rotation: vectorSchema,
    group: { type: 'string', description: 'Group UUID or exact group name, optional' },
    color: { type: 'integer', minimum: 0, maximum: 7, description: 'Blockbench viewport palette index, not a painted texture' },
  },
  required: ['name', 'from', 'to'],
};
const editSchema: any = {
  type: 'object',
  additionalProperties: false,
  properties: {
    uuid: { type: 'string' },
    name: { type: 'string' },
    from: vectorSchema,
    to: vectorSchema,
    origin: vectorSchema,
    rotation: vectorSchema,
    color: { type: 'integer', minimum: 0, maximum: 7 },
  },
  required: ['uuid'],
};

export function generateCharacterOp(args: any, budget: RunBudget): any {
  const name = safeName(args.name);
  const style = args.style || 'android_villager';
  if (CHARACTER_STYLES.indexOf(style) === -1) fail('Unknown character style.');
  const fallback = defaultPalette(style);
  const get = function (value: unknown, color: string): string {
    if (value === undefined || value === null || value === '') return color;
    rgb(value, 'character color');
    return value as string;
  };
  const palette: Palette = {
    primary: get(args.primary, fallback.primary),
    secondary: get(args.secondary, fallback.secondary),
    accent: get(args.accent, fallback.accent),
    skin: get(args.skin, fallback.skin),
  };
  return buildPaintedModelOp({ name: name, parts: humanoidParts(style, palette) }, budget);
}

export function generateCharacterLocal(args: any, budget: RunBudget): any {
  return generateCharacterOp(args, budget);
}

export function generatePropOp(args: any, budget: RunBudget): any {
  if (!args || PROP_KINDS.indexOf(args.kind) === -1) fail('Unsupported prop type.');
  const title = safeName(args.name);
  const fallback = propPalette(args.kind);
  const get = function (value: unknown, color: string): string {
    if (value === undefined || value === null || value === '') return color;
    rgb(value, 'prop palette');
    return value as string;
  };
  const palette: Palette = {
    primary: get(args.primary, fallback.primary),
    secondary: get(args.secondary, fallback.secondary),
    accent: get(args.accent, fallback.accent),
    skin: fallback.skin,
  };
  return buildPaintedModelOp({ name: title, parts: propParts(args.kind, palette) }, budget);
}

export function generatePropLocal(args: any, budget: RunBudget): any {
  return generatePropOp(args, budget);
}

export function runBenchmarkLocal(id: string, budget: RunBudget): any {
  const defs = benchmarkDefs();
  const def = defs.filter(function (d) {
    return d.id === id;
  })[0];
  if (!def) fail('Unknown benchmark: ' + String(id).slice(0, 40));
  if (def.kind === 'character') {
    const fallback = defaultPalette(id);
    return generateCharacterOp({ name: 'FORGE ' + def.label, style: id, primary: fallback.primary, secondary: fallback.secondary, accent: fallback.accent, skin: fallback.skin }, budget);
  }
  const palette = propPalette(id);
  return generatePropOp({ name: 'FORGE ' + def.label, kind: id, primary: palette.primary, secondary: palette.secondary, accent: palette.accent }, budget);
}

const COMPACT_MATERIALS: StringMap = {
  metal: 'metal',
  m: 'metal',
  steel: 'metal',
  wood: 'wood',
  w: 'wood',
  fabric: 'fabric',
  f: 'fabric',
  stone: 'stone',
  s: 'stone',
  skin: 'skin',
  k: 'skin',
  circuit: 'circuit',
  c: 'circuit',
  gem: 'gem',
  g: 'gem',
  plain: 'plain',
  p: 'plain',
};

export function composeModelOp(args: any, budget: RunBudget): any {
  if (!args || !Array.isArray(args.parts) || args.parts.length === 0 || args.parts.length > MAX_PAINTED_PARTS) {
    fail('compose_model requires 1-96 parts.');
  }
  const input = args.palette || {};
  const toHex = function (triplet: [number, number, number]): string {
    return colorCode(triplet[0], triplet[1], triplet[2]);
  };
  const palette: RgbPalette = {
    primary: rgb(input.primary || '#647889', 'primary'),
    secondary: rgb(input.secondary || '#344455', 'secondary'),
    accent: rgb(input.accent || '#50D6DE', 'accent'),
    skin: rgb(input.skin || '#BA9E7E', 'skin'),
    metal: rgb('#B1BFCA', 'metal'),
    wood: rgb('#78513A', 'wood'),
    dark: rgb('#1E2632', 'dark'),
    gold: rgb('#D5AF60', 'gold'),
  };
  const parts = args.parts.map(function (p: unknown, idx: number) {
    let fields: unknown[];
    if (typeof p === 'string') {
      const split = (p as string).split('|');
      if (split.length !== 5) fail('Part ' + (idx + 1) + ' must be name|from|to|material|palette');
      const from = split[1].split(',').map(Number);
      const to = split[2].split(',').map(Number);
      if (from.length !== 3 || to.length !== 3) fail('Part ' + (idx + 1) + ' has invalid coordinates.');
      fields = [split[0], from[0], from[1], from[2], to[0], to[1], to[2], split[3], split[4]];
    } else {
      fields = p as unknown[];
    }
    if (!Array.isArray(fields) || fields.length !== 9) fail('Part ' + (idx + 1) + ' needs exactly 9 fields.');
    const material = COMPACT_MATERIALS[String(fields[7]).toLowerCase()];
    if (!material) fail('Unknown material on part ' + (idx + 1));
    const slot = String(fields[8] || 'primary').toLowerCase();
    if (!palette[slot]) fail('Unknown palette slot on part ' + (idx + 1));
    return {
      name: safeName(fields[0]),
      from: (fields as unknown[]).slice(1, 4),
      to: (fields as unknown[]).slice(4, 7),
      paint: { base: toHex(palette[slot]), material: material, accent: toHex(palette.accent), noise: 0.085 },
    };
  });
  return buildPaintedModelOp({ name: args.name || 'AI Model', parts: parts }, budget);
}

// ---------------------------------------------------------------------------
// Tool registry + dispatch.
// ---------------------------------------------------------------------------

const COMPACT_TOOL: ToolDef = defineTool(
  'compose_model',
  'Build detailed native Blockbench painted 3D model using compact parts. Each part is compact text: name|x1,y1,z1|x2,y2,z2|material|paletteSlot. Use no pipe inside names. Example: Blade|-1,0,-0.5|1,16,0.5|m|primary. Material: m metal,w wood,f fabric,s stone,k skin,c circuit,g gem,p plain. Palette slot: primary,secondary,accent,skin,metal,wood,dark,gold. Use many small parts to sculpt silhouette. Coordinates are integers or decimals. Front faces -Z.',
  {
    name: { type: 'string' },
    palette: {
      type: 'object',
      additionalProperties: false,
      properties: { primary: { type: 'string' }, secondary: { type: 'string' }, accent: { type: 'string' }, skin: { type: 'string' } },
    },
    parts: {
      type: 'array',
      maxItems: 96,
      items: { type: 'string', maxLength: 180, description: 'Name|x,y,z|x,y,z|materialCode|paletteSlot; no extra delimiters' },
    },
  },
  ['name', 'parts']
);

const PROP_TOOL: ToolDef = defineTool(
  'generate_prop',
  'Preferred tool for swords, energy blades, drones/quads, treasure chests, crystal golems or mech walkers. Generates a high-detail editable 3D prop with real pixel textures and grouped components.',
  {
    name: { type: 'string' },
    kind: { type: 'string', enum: ['energy_sword', 'sci_fi_drone', 'treasure_chest', 'crystal_golem', 'mech_walker'] },
    primary: { type: 'string', description: 'Optional #RRGGBB main color' },
    secondary: { type: 'string', description: 'Optional #RRGGBB dark color' },
    accent: { type: 'string', description: 'Optional #RRGGBB glow or trim color' },
  },
  ['name', 'kind']
);

const TOOLS: ToolDef[] = [
  defineTool('inspect_scene', 'Read model cubes, groups, format and selection. Does not change the project.', {
    query: { type: 'string', description: 'Optional case-insensitive name filter' },
    selected_only: { type: 'boolean' },
    limit: { type: 'integer', minimum: 1, maximum: 120 },
  }),
  defineTool('create_group', 'Create one native Blockbench outliner group.', {
    name: { type: 'string' },
    parent: { type: 'string', description: 'Optional parent group UUID or exact name' },
  }, ['name']),
  defineTool(
    'create_cubes',
    'Create up to 32 axis-aligned native Blockbench cubes in one undoable action. Coordinate units are Blockbench model units.',
    { cubes: { type: 'array', minItems: 1, maxItems: MAX_CUBES_PER_CALL, items: cubeSchema } },
    ['cubes']
  ),
  defineTool('edit_cubes', 'Edit existing cubes by UUID. Supply only properties to change; never invent UUIDs.', {
    cubes: { type: 'array', minItems: 1, maxItems: MAX_CUBES_PER_CALL, items: editSchema },
  }, ['cubes']),
  defineTool(
    'build_painted_model',
    'PREFERRED for detailed objects, machines, armor and props: create up to 96 named cubes, a REAL PNG texture atlas, shaded materials and painted features. Use smaller distinct parts for fine geometry. All color values are hex RGB; viewport color indices are not textures.',
    {
      name: { type: 'string', description: 'Name of the model root group and generated texture' },
      parts: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_PAINTED_PARTS,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            from: vectorSchema,
            to: vectorSchema,
            group: { type: 'string', description: 'Existing group UUID or name. Omit to use the generated root.' },
            paint: { type: 'object' },
          },
          required: ['name', 'from', 'to', 'paint'],
        },
      },
    },
    ['name', 'parts']
  ),
  defineTool(
    'paint_existing_cubes',
    'Paint actual texture pixels on existing cube UUIDs, preserving all geometry. Creates an internal textured atlas and assigns per-face UVs. Best for adding shading, surface patterns, eyes, or circuit details.',
    {
      parts: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_CUBES_PER_CALL,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { uuid: { type: 'string' }, paint: { type: 'object' } },
          required: ['uuid', 'paint'],
        },
      },
    },
    ['parts']
  ),
  defineTool(
    'generate_character',
    'Generate a visually detailed textured humanoid automatically: articulated armor plates, segments, fingers, boots, face pixels, mechanical accents and a real PNG atlas. Styles: android_villager, robot, villager, knight. Prefer over basic cuboid scaffolds.',
    {
      name: { type: 'string' },
      style: { type: 'string', enum: ['android_villager', 'robot', 'villager', 'knight'] },
      primary: { type: 'string' },
      secondary: { type: 'string' },
      accent: { type: 'string' },
      skin: { type: 'string' },
    },
    ['name', 'style']
  ),
  COMPACT_TOOL,
  PROP_TOOL,
].concat(geometryToolDefs()).concat(textureToolDefs());

export function runTool(name: string, args: any, budget: RunBudget): any {
  if (Project !== budget.project) fail('Project changed during this request. Stopping to protect your work.');
  if (name === 'inspect_scene') return readScene(args);
  if (name === 'create_group') return createGroupOp(args || {});
  if (name === 'create_cubes') return createCubesOp(args || {}, budget);
  if (name === 'edit_cubes') return editCubesOp(args || {});
  if (name === 'build_painted_model') return buildPaintedModelOp(args || {}, budget);
  if (name === 'paint_existing_cubes') return paintExistingCubesOp(args || {});
  if (name === 'retouch_cubes') return retouchCubesOp(args || {});
  if (name === 'generate_character') return generateCharacterOp(args || {}, budget);
  if (name === 'compose_model') return composeModelOp(args || {}, budget);
  if (name === 'generate_prop') return generatePropOp(args || {}, budget);
  if (name === 'mirror_cubes') return mirrorCubesOp(args || {}, budget);
  if (name === 'repeat_array') return repeatArrayOp(args || {}, budget);
  if (name === 'transform_selection') return transformCubesOp(args || {});
  if (name === 'organize_hierarchy') return organizeHierarchyOp(args || {});
  if (name === 'extrude_profile') {
    return extrudeProfileOp(args || {}, budget, function (cubes: any[], title: string) {
      paintCubesNeutral(cubes, title, budget);
    });
  }
  fail('Unknown tool: ' + name);
}

export function systemPrompt(): string {
  return (
    'You are BlockbenchAI FORGE, a native editable 3D modeler. Use real tools; never claim unexecuted work. ' +
    'For humanoids, villagers, androids, robots and knights ALWAYS call generate_character to create a polished, textured base. ' +
    'For swords, chests, drones, golems and walkers use generate_prop for detailed procedural geometry and pixel materials. ' +
    'For all other NEW creations call compose_model: up to 96 named parts (name,fromXYZ,toXYZ,materialCode,paletteName), material and atlas painted locally. ' +
    'Prefer a strong silhouette, layered geometric components, deliberate 3D detailing and coherent palette. Front=-Z. ' +
    'For existing models inspect first, then edit by UUID, retouch pixels with retouch_cubes (incremental, preserves other pixels), ' +
    'mirror across symmetry planes, repeat arrays, transform selections, organize the hierarchy, or extrude convex profiles. ' +
    'Small fixes MUST use retouch_cubes instead of repainting everything. ' +
    'Tool execution has Blockbench Undo. Unsupported: arbitrary meshes, animation, exports or external image synthesis. ' +
    'Respond in the user language, concise. If the task is complete, stop calling tools.'
  );
}

// ---------------------------------------------------------------------------
// Agent loop with budgets, progress events and stale-edit protection.
// ---------------------------------------------------------------------------

export function performForge(
  prompt: string,
  config: ForgeConfig,
  onEvent: Function,
  signal: any
): Promise<string> {
  return new Promise(function (resolve, reject) {
    let project: unknown;
    let endpoint: string;
    let model: string;
    try {
      project = activeProject();
      endpoint = validateEndpoint(config.endpoint);
      model = safeName(config.model);
    } catch (error) {
      reject(error);
      return;
    }
    if (!config.apiKey && !isLocalEndpoint(endpoint)) {
      reject(new Error('Introduce tu API key en Ajustes. La clave no se guarda.'));
      return;
    }
    const history = summarizeHistory(config.history || []);
    const budget = planBudget(prompt, project);
    const rounds: unknown[][] = [];
    let round = 0;
    const emit = function (kind: string, text: string): void {
      try {
        onEvent({ kind: kind, text: text, round: round });
      } catch (ignored) {
        // progress reporting must never break modeling
      }
    };
    const step = function (): void {
      if (signal.aborted) {
        reject(new Error('Solicitud cancelada.'));
        return;
      }
      if (Project !== project) {
        reject(new Error('El proyecto cambió durante la solicitud. Se detuvo para proteger tu trabajo.'));
        return;
      }
      if (round >= MAX_ROUNDS) {
        resolve('He alcanzado el límite de pasos. Los cambios realizados se pueden deshacer en Blockbench. Puedes pedirme que continúe.');
        return;
      }
      emit('plan', 'Planificando modelo · paso ' + (round + 1) + '/' + MAX_ROUNDS);
      const context = readScene({ limit: round === 0 ? 12 : 6 });
      const populated = context.totals.cubes > 0;
      const intent = classifyIntent(prompt, populated);
      const availableTools = planTools(intent, prompt, populated, endpoint, TOOLS);
      const messages: unknown[] = [
        { role: 'system', content: systemPrompt() },
        { role: 'system', content: 'Project: ' + JSON.stringify(compactSceneSnapshot(context, round === 0)) },
      ];
      history.forEach(function (m) {
        messages.push(m);
      });
      messages.push({ role: 'user', content: prompt });
      rounds.slice(-1).forEach(function (exchange) {
        (exchange as unknown[]).forEach(function (item) {
          messages.push(item);
        });
      });
      const beforeRevision = sceneRevisionSignature();
      requestCompletion(
        endpoint,
        model,
        config.apiKey,
        messages,
        signal,
        function (notice: string) {
          emit('retry', String(notice));
        },
        availableTools
      ).then(
        function (reply) {
          if (signal.aborted || Project !== project) {
            reject(new Error('Solicitud cancelada o el proyecto ha cambiado.'));
            return;
          }
          if (beforeRevision !== sceneRevisionSignature()) {
            reject(
              new Error(
                'Detecté cambios manuales en el proyecto mientras la IA respondía. No apliqué operaciones desactualizadas. Vuelve a enviar la solicitud para trabajar con el modelo actualizado.'
              )
            );
            return;
          }
          const calls = reply.tool_calls || [];
          if (!calls.length) {
            resolve(String(reply.content || (budget.toolCalls ? 'Se aplicaron cambios al modelo.' : 'No se realizaron cambios.')));
            return;
          }
          if (budget.toolCalls + calls.length > MAX_TOOL_CALLS) {
            reject(new Error('Se alcanzó el límite de herramientas. Los cambios realizados siguen disponibles en el historial de deshacer.'));
            return;
          }
          const exchange: unknown[] = [{ role: 'assistant', content: reply.content || null, tool_calls: calls }];
          let chain: Promise<void> = Promise.resolve();
          calls.forEach(function (call: any) {
            chain = chain.then(function () {
              if (signal.aborted || Project !== project) throw new Error('Solicitud cancelada o el proyecto ha cambiado.');
              const name = (call.function && call.function.name) || 'unknown';
              emit('tool', 'Ejecutando ' + name + '…');
              budget.toolCalls++;
              let result: unknown;
              try {
                const parsed = JSON.parse((call.function && call.function.arguments) || '{}');
                result = { ok: true, data: runTool(name, parsed, budget) };
                if (name !== 'inspect_scene') emit('tool', 'Aplicado: ' + friendlyOpName(name));
              } catch (error) {
                result = { ok: false, error: safeError((error as Error).message, [config.apiKey]) };
              }
              const output = JSON.stringify(result);
              const wasOk = (result as any).ok;
              exchange.push({
                role: 'tool',
                tool_call_id: call.id,
                content:
                  output.length > 800
                    ? JSON.stringify({
                        ok: wasOk,
                        truncated: true,
                        preview: output.slice(0, 450),
                        note: 'Call inspect_scene with a small limit for specific cube UUIDs.',
                      })
                    : output,
              });
            });
          });
          chain.then(
            function () {
              rounds.push(exchange);
              round++;
              step();
            },
            function (error) {
              reject(error);
            }
          );
        },
        function (error) {
          reject(error);
        }
      );
    };
    step();
  });
}

// ---------------------------------------------------------------------------
// Native preferences (secrets never touch disk).
// ---------------------------------------------------------------------------

export function preferences(): StoredPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      endpoint: typeof stored.endpoint === 'string' ? stored.endpoint : DEFAULT_ENDPOINT,
      model: typeof stored.model === 'string' ? stored.model : 'gpt-4.1-mini',
    };
  } catch (ignored) {
    return { endpoint: DEFAULT_ENDPOINT, model: 'gpt-4.1-mini' };
  }
}

export function savePreferences(endpoint: string, model: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ endpoint: endpoint, model: model }));
  } catch (ignored) {
    // private mode: session-only settings still work
  }
}

export function settingsSnapshot(): PanelPrefs {
  const fallback = preferences();
  return {
    provider: registeredSettings.provider ? String(registeredSettings.provider.value) : 'groq',
    cloudflareAccount: registeredSettings.cloudflareAccount ? String(registeredSettings.cloudflareAccount.value || '') : '',
    endpoint: registeredSettings.endpoint ? String(registeredSettings.endpoint.value) : fallback.endpoint,
    model: registeredSettings.model ? String(registeredSettings.model.value) : fallback.model,
  };
}

export function updatePanelSettings(): void {
  if (!panel) return;
  const vm = panel.inside_vue || panel.vue;
  if (vm && typeof vm.refreshConfiguration === 'function') vm.refreshConfiguration();
}

export function storeConfigurationForView(next: PanelPrefs): void {
  const valid = ['groq', 'gemini', 'cloudflare', 'openai', 'custom'];
  const provider = valid.indexOf(next.provider) !== -1 ? next.provider : 'custom';
  const account = String(next.cloudflareAccount || '').trim();
  const endpoint = validateEndpoint(provider === 'cloudflare' ? cloudflareEndpoint(account) : next.endpoint);
  const model = safeName(next.model);
  if (registeredSettings.provider && registeredSettings.provider.value !== provider) registeredSettings.provider.set(provider);
  if (registeredSettings.cloudflareAccount && account !== String(registeredSettings.cloudflareAccount.value || '')) {
    registeredSettings.cloudflareAccount.set(account);
  }
  if (registeredSettings.endpoint) registeredSettings.endpoint.set(endpoint);
  if (registeredSettings.model) registeredSettings.model.set(model);
  savePreferences(endpoint, model);
  updatePanelSettings();
}

export function openKeyDialog(): void {
  new Dialog('bbai_key_dialog', {
    title: 'Blockbench AI · API key',
    icon: 'key',
    width: 470,
    form: {
      info: { type: 'info', text: 'La clave se conserva solo durante esta sesión y no se guardará en las preferencias de Blockbench.' },
      key: { type: 'password', label: 'API key', value: sessionApiKey, placeholder: 'gsk_... / sk-...' },
    },
    onConfirm: function (values: any) {
      sessionApiKey = typeof values.key === 'string' ? values.key.trim() : '';
      const vm = panel && (panel.inside_vue || panel.vue);
      if (vm && typeof vm.syncKey === 'function') vm.syncKey();
      Blockbench.showQuickMessage(sessionApiKey ? 'Clave configurada para esta sesión' : 'Clave de sesión eliminada');
    },
  }).show();
}

export function registerPreferences(): void {
  const old = preferences();
  registeredSettings.provider = new Setting('bbai_provider', {
    plugin: ID,
    name: 'Proveedor',
    type: 'select',
    description: 'Servicio de IA. Groq tiene un plan gratuito sujeto a límites.',
    value: 'groq',
    options: { groq: 'Groq', gemini: 'Google Gemini', cloudflare: 'Cloudflare Workers AI (Qwen)', openai: 'OpenAI', custom: 'Personalizado' },
    onChange: function (value: string) {
      if (value === 'groq') {
        registeredSettings.endpoint.set(GROQ_ENDPOINT);
        registeredSettings.model.set('openai/gpt-oss-120b');
      } else if (value === 'gemini') {
        registeredSettings.endpoint.set(GEMINI_ENDPOINT);
        registeredSettings.model.set('gemini-3.8-flash');
      } else if (value === 'cloudflare') {
        const acc = registeredSettings.cloudflareAccount && String(registeredSettings.cloudflareAccount.value || '');
        registeredSettings.endpoint.set(validCloudflareAccount(acc) ? cloudflareEndpoint(acc) : '');
        registeredSettings.model.set(CLOUDFLARE_MODEL);
      } else if (value === 'openai') {
        registeredSettings.endpoint.set(DEFAULT_ENDPOINT);
        registeredSettings.model.set('gpt-4.1-mini');
      }
      updatePanelSettings();
    },
  });
  registeredSettings.endpoint = new Setting('bbai_endpoint', {
    plugin: ID,
    name: 'Endpoint de la API',
    type: 'text',
    description: 'URL de Chat Completions compatible con OpenAI; HTTPS obligatorio salvo localhost.',
    value: old.endpoint === DEFAULT_ENDPOINT ? GROQ_ENDPOINT : old.endpoint,
    onChange: updatePanelSettings,
  });
  registeredSettings.model = new Setting('bbai_model', {
    plugin: ID,
    name: 'Modelo de IA',
    type: 'text',
    description: 'Identificador exacto del modelo, por ejemplo openai/gpt-oss-120b.',
    value: old.model === 'gpt-4.1-mini' ? 'openai/gpt-oss-120b' : old.model,
    onChange: updatePanelSettings,
  });
  registeredSettings.cloudflareAccount = new Setting('bbai_cloudflare_account', {
    plugin: ID,
    name: 'Cloudflare Account ID',
    type: 'text',
    value: '',
    description: 'Identificador de cuenta de 32 caracteres. No es una clave privada.',
    onChange: function (value: string) {
      if (registeredSettings.provider && registeredSettings.provider.value === 'cloudflare') {
        registeredSettings.endpoint.set(validCloudflareAccount(value) ? cloudflareEndpoint(value) : '');
      }
      updatePanelSettings();
    },
  });
  registeredSettings.key = new Setting('bbai_session_key', {
    plugin: ID,
    name: 'Configurar API key (solo sesión)',
    type: 'click',
    icon: 'key',
    description: 'Abre una ventana segura para introducir la clave. No se guarda en disco.',
    click: openKeyDialog,
  });
}

export function unregisterPreferences(): void {
  Object.keys(registeredSettings).forEach(function (key) {
    if (registeredSettings[key]) registeredSettings[key].delete();
    delete registeredSettings[key];
  });
  sessionApiKey = '';
}

// ---------------------------------------------------------------------------
// Blockbench plugin registration.
// ---------------------------------------------------------------------------

Plugin.register(ID, {
  title: 'Blockbench AI',
  author: 'jonathanthxd',
  description: 'A dockable AI chat assistant for native Blockbench geometry editing.',
  icon: 'auto_awesome',
  version: VERSION,
  min_version: '5.0.0',
  variant: 'desktop',
  tags: ['Utility'],
  onload: function () {
    registerPreferences();
    style = Blockbench.addCSS(fullCss());
    panel = new Panel('blockbench_ai_panel', {
      name: 'Blockbench AI',
      icon: 'auto_awesome',
      plugin: ID,
      growable: true,
      resizable: true,
      min_height: 240,
      default_position: { slot: 'right_bar', height: 550 },
      component: makeComponent(),
    });
    action = new Action('blockbench_ai_open', {
      name: 'Blockbench AI',
      description: 'Open the Blockbench AI modeling assistant',
      icon: 'auto_awesome',
      click: function () {
        if (panel && typeof panel.show === 'function') panel.show();
        else Blockbench.showQuickMessage('Open Blockbench AI from the sidebar.');
      },
    });
    MenuBar.menus.tools.addAction(action);
  },
  onunload: function () {
    if (runningController) runningController.abort();
    runningController = null;
    if (action) {
      action.delete();
      action = null;
    }
    if (panel) {
      panel.delete();
      panel = null;
    }
    if (style) {
      style.delete();
      style = null;
    }
    unregisterPreferences();
  },
});
