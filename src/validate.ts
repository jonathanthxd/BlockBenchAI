// BlockBenchAI FORGE — validation primitives.
//
// Every value that reaches the Blockbench scene graph or a texture atlas
// passes through these guards first. Tools never throw raw: runTool catches
// fail() and returns {ok:false, error} so the agent can repair its plan.

import { FACE_NAMES } from './types';
import type { FaceMark, FromTo, MaterialName, PaintSpec, ValidatedMark, ValidatedPaint } from './types';

export function fail(message: string): never {
  throw new Error(message);
}

export function safeName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) fail('A nonempty name is required.');
  return value.trim().slice(0, 72);
}

export function vec(value: unknown, label: string): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(function (n) {
      return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 512;
    })
  ) {
    fail(label + ' must contain exactly 3 finite numbers between -512 and 512.');
  }
  return (value as number[]).slice();
}

export function checkedColor(n: unknown): number {
  if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 7) {
    fail('Palette color must be an integer from 0 to 7.');
  }
  return n as number;
}

export function checkedAxis(value: unknown): string {
  if (value === 'x' || value === 'y' || value === 'z') return value;
  fail('Axis must be one of x, y or z.');
  return 'x';
}

export function checkedCount(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(label + ' must be an integer between ' + min + ' and ' + max + '.');
  }
  return value as number;
}

export function coordinates(obj: any, existing?: any): FromTo {
  const from = obj.from !== undefined ? vec(obj.from, 'from') : existing && existing.from.slice();
  const to = obj.to !== undefined ? vec(obj.to, 'to') : existing && existing.to.slice();
  if (
    !from ||
    !to ||
    from.some(function (v, i) {
      return !(to[i] > v) || to[i] - v > 256;
    })
  ) {
    fail('Cube size must be positive on every axis and at most 256 units.');
  }
  return { from: from, to: to };
}

export function rgb(value: unknown, label: string): [number, number, number] {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    fail(label + ' must be a #RRGGBB color.');
  }
  const hex = value as string;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function colorCode(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map(function (v) {
        return Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

export function adjustColor(base: [number, number, number], delta: number): string {
  return colorCode(base[0] + delta, base[1] + delta, base[2] + delta);
}

const MATERIALS: MaterialName[] = ['metal', 'wood', 'fabric', 'stone', 'skin', 'circuit', 'gem', 'plain'];

export function validatePaint(paint: unknown): ValidatedPaint {
  const p = paint as PaintSpec;
  if (!p || typeof p !== 'object') fail('Each part requires a paint specification.');
  const material = p.material || 'plain';
  if (MATERIALS.indexOf(material as MaterialName) === -1) fail('Unsupported material');
  const noise = p.noise === undefined ? 0.09 : p.noise;
  if (typeof noise !== 'number' || noise < 0 || noise > 0.5 || !Number.isFinite(noise)) {
    fail('Noise must be between 0 and 0.5');
  }
  const out: ValidatedPaint = {
    base: rgb(p.base, 'base'),
    accent: p.accent ? rgb(p.accent, 'accent') : null,
    material: material as MaterialName,
    noise: noise,
    marks: [],
  };
  if (p.marks !== undefined && (!Array.isArray(p.marks) || p.marks.length > 24)) {
    fail('At most 24 paint marks per part.');
  }
  ((p.marks as FaceMark[]) || []).forEach(function (m) {
    if (!m || FACE_NAMES.indexOf(m.face) === -1 || ['pixel', 'rect', 'line'].indexOf(m.shape) === -1) {
      fail('Invalid face mark.');
    }
    const mark: ValidatedMark = {
      face: m.face,
      shape: m.shape,
      x: m.x,
      y: m.y,
      width: 1,
      height: 1,
      x2: 0,
      y2: 0,
      color: colorCode.apply(null, rgb(m.color, 'mark color')),
    };
    if (
      ![m.x, m.y].every(function (n) {
        return Number.isInteger(n) && n >= 0 && n <= 15;
      })
    ) {
      fail('Mark X and Y must be from 0 to 15.');
    }
    if (m.shape === 'rect') {
      mark.width = m.width === undefined ? 1 : m.width;
      mark.height = m.height === undefined ? 1 : m.height;
      if (
        ![mark.width, mark.height].every(function (n) {
          return Number.isInteger(n) && n >= 1 && n <= 16;
        })
      ) {
        fail('Invalid rectangle size.');
      }
    }
    if (m.shape === 'line') {
      if (
        ![m.x2, m.y2].every(function (n) {
          return Number.isInteger(n) && n >= 0 && n <= 15;
        })
      ) {
        fail('Line needs x2, y2 between 0 and 15.');
      }
      mark.x2 = m.x2 as number;
      mark.y2 = m.y2 as number;
    }
    out.marks.push(mark);
  });
  return out;
}

// Merge new marks over an existing validated paint (used by incremental
// retouch): base/accent/material may be overridden, marks are appended
// (capped at 24) so untouched pixels keep their previous specification.
export function mergePaintMarks(base: ValidatedPaint, extra: FaceMark[], overrideBase?: string): ValidatedPaint {
  const merged: ValidatedPaint = {
    base: overrideBase ? rgb(overrideBase, 'base') : base.base.slice(),
    accent: base.accent ? base.accent.slice() : null,
    material: base.material,
    noise: base.noise,
    marks: base.marks.map(function (m) {
      return { face: m.face, shape: m.shape, x: m.x, y: m.y, width: m.width, height: m.height, x2: m.x2, y2: m.y2, color: m.color };
    }),
  };
  (extra || []).forEach(function (raw) {
    if (merged.marks.length >= 24) fail('At most 24 paint marks per tile after merge.');
    const single = validatePaint({ base: '#000000', marks: [raw] });
    merged.marks.push(single.marks[0]);
  });
  return merged;
}
