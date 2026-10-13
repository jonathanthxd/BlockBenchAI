// BlockBenchAI FORGE — shared types and constants.
//
// This module is almost entirely type-level: interfaces vanish at build time
// and only the const values below survive into blockbench_ai.js.

export const VERSION: string = '0.6.0';
export const FORGE_LABEL: string = 'FORGE';

export const FACE_NAMES: FaceName[] = ['north', 'south', 'east', 'west', 'up', 'down'];

export const MAX_CUBES_PER_CALL: number = 32;
export const MAX_PAINTED_PARTS: number = 96;
export const MAX_CUBES_PER_RUN: number = 192;
export const MAX_TOOL_CALLS: number = 36;
export const MAX_ROUNDS: number = 12;
export const MAX_ARRAY_COUNT: number = 16;
export const MAX_EXTRUDE_PARTS: number = 96;

export const DEFAULT_ENDPOINT: string = 'https://api.openai.com/v1/chat/completions';
export const GROQ_ENDPOINT: string = 'https://api.groq.com/openai/v1/chat/completions';
export const GEMINI_ENDPOINT: string = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
export const CLOUDFLARE_MODEL: string = '@cf/qwen/qwen3.8-27b';
export const STORAGE_KEY: string = 'blockbench_ai_preferences_v1';

export type FaceName = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export type Vec3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';
export type MaterialName = 'metal' | 'wood' | 'fabric' | 'stone' | 'skin' | 'circuit' | 'gem' | 'plain';
export type MarkShape = 'pixel' | 'rect' | 'line';

export interface FaceMark {
  face: FaceName;
  shape: MarkShape;
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  color: string;
}

export interface PaintSpec {
  base: string;
  accent?: string;
  material?: MaterialName;
  noise?: number;
  marks?: FaceMark[];
}

export interface ValidatedPaint {
  base: [number, number, number];
  accent: [number, number, number] | null;
  material: MaterialName;
  noise: number;
  marks: ValidatedMark[];
}

export interface ValidatedMark {
  face: FaceName;
  shape: MarkShape;
  x: number;
  y: number;
  width: number;
  height: number;
  x2: number;
  y2: number;
  color: string;
}

export interface CubeSpec {
  name: string;
  from: Vec3;
  to: Vec3;
  origin?: Vec3;
  rotation?: Vec3;
  group?: string;
  color?: number;
}

export interface PaintedPart {
  name: string;
  from: Vec3;
  to: Vec3;
  group?: string;
  paint: PaintSpec;
}

export interface PlannedPart {
  name: string;
  from: number[];
  to: number[];
  group: unknown;
  paint: ValidatedPaint;
}

export interface ToolParams {
  type: string;
  additionalProperties: boolean;
  properties: Record<string, unknown>;
  required: string[];
}

export interface ToolFunctionDef {
  name: string;
  description: string;
  parameters: ToolParams;
}

export interface ToolDef {
  type: string;
  function: ToolFunctionDef;
}

export interface StringMap {
  [key: string]: string;
}

export interface NumberMap {
  [key: string]: number;
}

export interface RgbPalette {
  [key: string]: [number, number, number];
}

export interface UnknownMap {
  [key: string]: unknown;
}

export interface HistoryTurn {
  role: string;
  content: string;
}

export interface ConnectionConfig {
  provider: string;
  cloudflareAccount: string;
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface ConnectionResult {
  provider: string;
  model: string;
}

export interface ProgressEvent {
  kind: string;
  text: string;
  round: number;
}

export interface TileLookup {
  atlas: any;
  index: number;
}

export interface RetouchTouch {
  cube: any;
  merged: ValidatedPaint;
}

export interface AtlasRetouchBatch {
  atlas: any;
  touched: RetouchTouch[];
}

export interface RetouchRequest {
  uuid: string;
  base?: string;
  paint?: unknown;
  marks?: unknown;
}

export interface ForgeConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  history: HistoryTurn[];
}

export interface StoredPreferences {
  endpoint: string;
  model: string;
}

export interface PanelPrefs {
  provider: string;
  cloudflareAccount: string;
  endpoint: string;
  model: string;
}

export interface FromTo {
  from: number[];
  to: number[];
}

export interface RunBudget {
  project: unknown;
  remainingCubes: number;
  toolCalls: number;
}

export interface MirrorArgs {
  uuids?: string[];
  axis?: Axis;
  plane?: number;
  copy?: boolean;
  group?: string;
  suffix?: string;
}

export interface RepeatArgs {
  uuids?: string[];
  count?: number;
  spacing?: number[];
  group?: string;
}

export interface TransformEdit {
  uuid: string;
  translate?: number[];
  scale?: number[];
  name?: string;
}

export interface HierarchyGroup {
  name: string;
  parent?: string;
}

export interface HierarchyMove {
  cube?: string;
  group?: string;
  to?: string;
}

export interface ExtrudeArgs {
  name?: string;
  profile?: number[][];
  y_base?: number;
  height?: number;
  step?: number;
  paint?: PaintSpec;
  group?: string;
}

export interface RetouchPart {
  uuid: string;
  base?: string;
  paint?: PaintSpec;
  marks?: FaceMark[];
}

export interface SceneInfo {
  project: { name: string; format: string; capabilities: Record<string, boolean> };
  totals: { cubes: number; groups: number; selected_cubes: number; textures: number };
  groups: Array<{ uuid: string; name: string; parent_uuid: string | null }>;
  cubes: Array<{
    uuid: string;
    name: string;
    from: number[];
    to: number[];
    origin: number[];
    rotation: number[];
    color: number;
    selected: boolean;
    parent_uuid: string | null;
  }>;
  truncated: boolean;
}

// Blockbench host globals (Desktop 5.x). Declared for type checking only;
// at runtime they resolve from the plugin sandbox / global scope.
declare const Cube: any;
declare const Group: any;
declare const Texture: any;
declare const Project: any;
declare const Format: any;
declare const Undo: any;
declare const Canvas: any;
declare const Panel: any;
declare const Action: any;
declare const MenuBar: any;
declare const Blockbench: any;
declare const Setting: any;
declare const Dialog: any;
