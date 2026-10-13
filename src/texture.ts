// BlockBenchAI FORGE — Texture Engine.
//
// Real PNG pixel atlases (never viewport palette indices): every cube face
// owns a unique 16x16 tile, materials add deterministic shading, and noise is
// seeded per tile so repaints are bit-stable.
//
// Incremental retouch (`retouch_cubes`): tiles belonging to untouched cubes
// are never repainted speculatively. When the 2D context offers drawImage the
// previous atlas bitmap is copied and only touched tiles are redrawn; without
// drawImage (older hosts, test sandbox) untouched tiles are repainted from
// their stored deterministic specs, which yields pixel-identical output.
// Either way a single Undo transaction covers the texture swap + UV remap,
// with full rollback of the previous texture references.

import { FACE_NAMES } from './types';
import type { AtlasRetouchBatch, NumberMap, PlannedPart, RetouchRequest, RetouchTouch, RunBudget, TileLookup, ToolDef, UnknownMap, ValidatedMark, ValidatedPaint } from './types';
import { adjustColor, colorCode, fail, rgb, safeName, validatePaint } from './validate';
import { activeProject, allowCubes, defineTool, findCube, redraw, resolveGroup, rollback } from './geometry';
import type { TxTracker } from './geometry';

export interface AtlasTile {
  cubeUuid: string;
  paint: ValidatedPaint;
}

export interface BuiltAtlas {
  texture: any;
  canvas: any;
  width: number;
  height: number;
  columns: number;
  tiles: AtlasTile[];
}

// texture UUID -> atlas entry. Lets retouch find the exact tile + spec that
// produced each cube's pixels, even across separate tool calls.
const atlasRegistry: Map<string, BuiltAtlas> = new Map();

export function lookupTile(cubeUuid: string): TileLookup | null {
  const entries = Array.from(atlasRegistry.values());
  for (let e = 0; e < entries.length; e++) {
    const tiles = entries[e].tiles;
    for (let t = 0; t < tiles.length; t++) {
      if (tiles[t].cubeUuid === cubeUuid) return { atlas: entries[e], index: t };
    }
  }
  return null;
}

export function paintCapability(): void {
  allowCubes();
  if (typeof Texture === 'undefined' || !Texture || !Texture.prototype || typeof Texture.prototype.fromDataURL !== 'function') {
    fail('This Blockbench version does not expose internal PNG textures.');
  }
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    fail('Canvas pixel painting is not available.');
  }
  if (Format.textures === false) fail('The active format does not support textures.');
  if (Format.single_texture && Texture.all && Texture.all.length) {
    fail('The active format supports only one texture and already has one. Use an empty Generic Model for this tool.');
  }
}

export function seededColor(seed: number, noise: number): number {
  const v = Math.sin(seed * 64.217 + 18.711) * 43758.5453;
  return (v - Math.floor(v) - 0.5) * 2 * noise * 65;
}

export function drawLineOn(ctx: any, x1: number, y1: number, x2: number, y2: number): void {
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    ctx.fillRect(x1, y1, 1, 1);
    if (x1 === x2 && y1 === y2) break;
    const jump = 2 * err;
    if (jump > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (jump < dx) {
      err += dx;
      y1 += sy;
    }
  }
}

export function drawFaceTile(ctx: any, ox: number, oy: number, paint: ValidatedPaint, direction: string, index: number): void {
  const shifts: NumberMap = { north: 0, south: -12, east: -15, west: -8, up: 16, down: -23 };
  const light = shifts[direction];
  ctx.fillStyle = adjustColor(paint.base, light);
  ctx.fillRect(ox, oy, 16, 16);
  if (paint.noise) {
    for (let yy = 0; yy < 16; yy++) {
      for (let xx = 0; xx < 16; xx++) {
        const seed = (index + 1) * 823 + (yy + 2) * 79 + (xx + 5) * 31;
        const random = Math.sin(seed * 14.156) * 45673.824;
        const fract = random - Math.floor(random);
        if (fract < Math.min(0.35, paint.noise * 1.1)) {
          ctx.fillStyle = adjustColor(paint.base, light + seededColor(seed, paint.noise) * 2);
          ctx.fillRect(ox + xx, oy + yy, 1, 1);
        }
      }
    }
  }
  const dark = adjustColor(paint.base, light - 32);
  const bright = adjustColor(paint.base, light + 34);
  const accent = paint.accent ? colorCode(paint.accent[0], paint.accent[1], paint.accent[2]) : bright;
  if (paint.material === 'metal') {
    ctx.fillStyle = bright;
    ctx.fillRect(ox + 1, oy + 1, 14, 1);
    ctx.fillRect(ox + 1, oy + 2, 1, 12);
    ctx.fillStyle = dark;
    ctx.fillRect(ox + 1, oy + 14, 14, 1);
    ctx.fillRect(ox + 14, oy + 2, 1, 12);
    ctx.fillRect(ox + 2, oy + 3, 1, 1);
    ctx.fillRect(ox + 13, oy + 12, 1, 1);
  } else if (paint.material === 'wood') {
    ctx.fillStyle = dark;
    for (let a = 3; a < 16; a += 5) {
      ctx.fillRect(ox + a, oy + 1, 1, 10);
      ctx.fillRect(ox + a + 1, oy + 9, 1, 6);
    }
    ctx.fillStyle = bright;
    ctx.fillRect(ox + 1, oy + 4, 1, 9);
  } else if (paint.material === 'fabric') {
    ctx.fillStyle = dark;
    for (let a = 0; a < 16; a += 4) ctx.fillRect(ox, oy + a, 16, 1);
    ctx.fillStyle = bright;
    ctx.fillRect(ox, oy, 16, 1);
  } else if (paint.material === 'stone') {
    ctx.fillStyle = dark;
    ctx.fillRect(ox + 2, oy + 4, 7, 1);
    ctx.fillRect(ox + 9, oy + 4, 1, 5);
    ctx.fillRect(ox + 6, oy + 10, 9, 1);
  } else if (paint.material === 'skin') {
    ctx.fillStyle = bright;
    ctx.fillRect(ox + 2, oy + 2, 12, 1);
    ctx.fillStyle = dark;
    ctx.fillRect(ox + 3, oy + 13, 10, 1);
  } else if (paint.material === 'circuit') {
    ctx.fillStyle = dark;
    ctx.fillRect(ox + 1, oy + 1, 14, 14);
    ctx.fillStyle = accent;
    ctx.fillRect(ox + 7, oy + 3, 2, 10);
    ctx.fillRect(ox + 3, oy + 7, 10, 2);
    const pads = [[3, 3], [12, 3], [3, 12], [12, 12]];
    for (let q = 0; q < pads.length; q++) ctx.fillRect(ox + pads[q][0], oy + pads[q][1], 2, 2);
  } else if (paint.material === 'gem') {
    ctx.fillStyle = bright;
    ctx.fillRect(ox + 3, oy + 3, 7, 3);
    ctx.fillStyle = dark;
    ctx.fillRect(ox + 9, oy + 8, 5, 5);
  }
  paint.marks
    .filter(function (m) {
      return m.face === direction;
    })
    .forEach(function (m: ValidatedMark) {
      ctx.fillStyle = m.color;
      if (m.shape === 'pixel') ctx.fillRect(ox + m.x, oy + m.y, 1, 1);
      else if (m.shape === 'rect') ctx.fillRect(ox + m.x, oy + m.y, Math.min(16 - m.x, m.width), Math.min(16 - m.y, m.height));
      else drawLineOn(ctx, ox + m.x, oy + m.y, ox + m.x2, oy + m.y2);
    });
}

export function paintTile(ctx: any, atlas: BuiltAtlas, index: number, paint: ValidatedPaint): void {
  FACE_NAMES.forEach(function (face, j) {
    const slot = index * 6 + j;
    const px = (slot % atlas.columns) * 16;
    const py = Math.floor(slot / atlas.columns) * 16;
    drawFaceTile(ctx, px, py, paint, face, index);
  });
}

export function buildAtlasTexture(paints: ValidatedPaint[], label: string, cubeUuids: string[]): BuiltAtlas {
  paintCapability();
  const columns = paints.length > 40 ? 32 : 16;
  const width = columns * 16;
  const rows = Math.ceil((paints.length * 6) / columns);
  const height = Math.pow(2, Math.ceil(Math.log2(Math.max(16, rows * 16))));
  if (height > 1024) fail('The painted model exceeds the safe atlas size.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) fail('Could not initialize a 2D canvas.');
  ctx.imageSmoothingEnabled = false;
  const atlas: BuiltAtlas = {
    texture: null,
    canvas: canvas,
    width: width,
    height: height,
    columns: columns,
    tiles: paints.map(function (paint, idx) {
      return { cubeUuid: cubeUuids[idx] || '', paint: paint };
    }),
  };
  paints.forEach(function (paint, idx) {
    paintTile(ctx, atlas, idx, paint);
  });
  const data = canvas.toDataURL('image/png');
  if (data.indexOf('data:image/png;base64,') !== 0) fail('Unable to encode the texture atlas as PNG.');
  const texture = new Texture({ name: 'AI_' + safeName(label).replace(/[^a-z0-9_-]/gi, '_') + '.png', width: width, height: height });
  texture.fromDataURL(data);
  texture.uv_width = width;
  texture.uv_height = height;
  atlas.texture = texture;
  atlasRegistry.set(texture.uuid, atlas);
  return atlas;
}

export function mapCubeToAtlas(cube: any, atlas: BuiltAtlas, index: number): void {
  if (typeof cube.setUVMode === 'function') cube.setUVMode(false);
  else cube.box_uv = false;
  cube.autouv = 0;
  const uSize = (typeof atlas.texture.getUVWidth === 'function' && atlas.texture.getUVWidth()) || Project.texture_width || 16;
  const vSize = (typeof atlas.texture.getUVHeight === 'function' && atlas.texture.getUVHeight()) || Project.texture_height || 16;
  FACE_NAMES.forEach(function (faceName, j) {
    const face = cube.faces && cube.faces[faceName];
    if (!face) fail('Cube face ' + faceName + ' is not available.');
    const slot = index * 6 + j;
    const px = (slot % atlas.columns) * 16;
    const py = Math.floor(slot / atlas.columns) * 16;
    face.texture = atlas.texture.uuid;
    face.uv = [(px / atlas.width) * uSize, (py / atlas.height) * vSize, ((px + 16) / atlas.width) * uSize, ((py + 16) / atlas.height) * vSize];
  });
}

export function snapshotCubeUV(cube: any): any {
  const faces: UnknownMap = {};
  FACE_NAMES.forEach(function (f) {
    faces[f] = { texture: cube.faces[f].texture, uv: cube.faces[f].uv.slice() };
  });
  return { cube: cube, box_uv: cube.box_uv, autouv: cube.autouv, faces: faces };
}

export function restoreCubeUV(saved: any): void {
  saved.cube.box_uv = saved.box_uv;
  saved.cube.autouv = saved.autouv;
  FACE_NAMES.forEach(function (face) {
    const keep = saved.faces[face];
    saved.cube.faces[face].texture = keep.texture;
    saved.cube.faces[face].uv = keep.uv.slice();
  });
}

export function buildPaintedModelOp(args: any, budget: RunBudget): any {
  paintCapability();
  const MAX_PARTS = 96;
  if (!Array.isArray(args.parts) || !args.parts.length || args.parts.length > MAX_PARTS) {
    fail('Painted model requires 1 to 96 parts.');
  }
  if (args.parts.length > budget.remainingCubes) fail('Not enough geometry budget for this request.');
  const title = safeName(args.name);
  const planned: PlannedPart[] = args.parts.map(function (part: any) {
    if (!part || typeof part !== 'object') fail('Invalid painted model part.');
    const coords = coordinates(part);
    return {
      name: safeName(part.name),
      from: coords.from,
      to: coords.to,
      group: part.group ? 'pending' : null,
      paint: validatePaint(part.paint),
    };
  });
  const rawGroups: Array<string | null> = args.parts.map(function (part: any) {
    return part.group || null;
  });
  const atlas = buildAtlasTexture(
    planned.map(function (part) {
      return part.paint;
    }),
    title,
    []
  );
  const created: any[] = [];
  const subgroups = new Map();
  let root: any = null;
  let textureAdded = false;
  Undo.initEdit({ elements: [], outliner: true, textures: [] });
  try {
    atlas.texture.add(false);
    textureAdded = true;
    root = new Group({ name: title }).init().addTo('root');
    planned.forEach(function (part, idx) {
      let target = root;
      const wanted = rawGroups[idx];
      if (wanted) {
        target = resolveGroup(wanted);
      } else if (part.name.indexOf('|') !== -1) {
        const section = part.name.split('|')[0].trim().slice(0, 32);
        if (section && section !== title && (subgroups.has(section) || subgroups.size < 22)) {
          if (!subgroups.has(section)) subgroups.set(section, new Group({ name: section }).init().addTo(root));
          target = subgroups.get(section);
        }
      }
      const cube = new Cube({ name: part.name, from: part.from, to: part.to }).init().addTo(target);
      created.push(cube);
      mapCubeToAtlas(cube, atlas, idx);
      atlas.tiles[idx].cubeUuid = cube.uuid;
    });
    Undo.finishEdit('AI: Detailed painted model ' + title, { elements: created, outliner: true, textures: [atlas.texture] });
  } catch (error) {
    created.forEach(function (c) {
      try {
        c.remove();
      } catch (ignored) {
        // best effort
      }
    });
    subgroups.forEach(function (group: any) {
      try {
        group.remove();
      } catch (ignored) {
        // best effort
      }
    });
    if (root) {
      try {
        root.remove();
      } catch (ignored) {
        // best effort
      }
    }
    if (textureAdded) {
      try {
        atlas.texture.remove(true);
      } catch (ignored) {
        // best effort
      }
    }
    atlasRegistry.delete(atlas.texture.uuid);
    rollback();
    throw error;
  }
  budget.remainingCubes -= created.length;
  redraw(created);
  return {
    group: { uuid: root.uuid, name: root.name },
    subgroups: subgroups.size,
    texture: { uuid: atlas.texture.uuid, name: atlas.texture.name, pixels: [atlas.width, atlas.height] },
    created_count: created.length,
    parts: created.slice(0, 60).map(function (c) {
      return { uuid: c.uuid, name: c.name };
    }),
  };
}

export function paintExistingCubesOp(args: any): any {
  paintCapability();
  if (!Array.isArray(args.parts) || !args.parts.length || args.parts.length > 32) {
    fail('Provide 1 to 32 cube paints.');
  }
  const planned = args.parts.map(function (p: any) {
    return { cube: findCube(p.uuid), paint: validatePaint(p.paint) };
  });
  if (
    new Set(
      planned.map(function (p: any) {
        return p.cube.uuid;
      })
    ).size !== planned.length
  ) {
    fail('Duplicate cube UUID.');
  }
  const atlas = buildAtlasTexture(
    planned.map(function (p: any) {
      return p.paint;
    }),
    'repaint_' + Date.now(),
    planned.map(function (p: any) {
      return p.cube.uuid;
    })
  );
  const original = planned.map(function (p: any) {
    return snapshotCubeUV(p.cube);
  });
  let textureAdded = false;
  Undo.initEdit({
    elements: planned.map(function (p: any) {
      return p.cube;
    }),
    textures: [],
  });
  try {
    atlas.texture.add(false);
    textureAdded = true;
    planned.forEach(function (p: any, idx: number) {
      mapCubeToAtlas(p.cube, atlas, idx);
    });
    Undo.finishEdit('AI: Paint ' + planned.length + ' cubes', {
      elements: planned.map(function (p: any) {
        return p.cube;
      }),
      textures: [atlas.texture],
    });
  } catch (error) {
    original.forEach(restoreCubeUV);
    if (textureAdded) {
      try {
        atlas.texture.remove(true);
      } catch (ignored) {
        // best effort
      }
    }
    atlasRegistry.delete(atlas.texture.uuid);
    rollback();
    throw error;
  }
  redraw(
    planned.map(function (p: any) {
      return p.cube;
    })
  );
  return {
    painted: planned.map(function (p: any) {
      return { uuid: p.cube.uuid, name: p.cube.name };
    }),
    texture: { uuid: atlas.texture.uuid, name: atlas.texture.name, pixels: [atlas.width, atlas.height] },
  };
}

// ---------------------------------------------------------------------------
// FORGE incremental retouch.
// ---------------------------------------------------------------------------

export function retouchCubesOp(args: any): any {
  paintCapability();
  const parts: Array<{ uuid: string; base?: string; paint?: unknown; marks?: unknown }> =
    Array.isArray(args && args.parts) ? args.parts : [];
  if (!parts.length || parts.length > 32) fail('retouch_cubes needs 1 to 32 cube retouches.');
  const seen = new Set();
  const planned = parts.map(function (part) {
    if (!part || typeof part.uuid !== 'string') fail('Each retouch needs a cube UUID.');
    if (seen.has(part.uuid)) fail('Duplicate cube UUID.');
    seen.add(part.uuid);
    const cube = findCube(part.uuid);
    const found = lookupTile(part.uuid);
    let base = found ? found.atlas.tiles[found.index].paint : null;
    if (!base && part.paint) base = validatePaint(part.paint);
    if (!base && part.base) base = validatePaint({ base: part.base });
    if (!base) fail('No previous paint found for ' + cube.name + '; pass a full paint specification first.');
    const extra = part.marks !== undefined ? (part.marks as Array<any>) : part.paint ? [] : [];
    const merged = mergePaintForRetouch(base, part, extra);
    return { cube: cube, merged: merged, found: found };
  });
  // Group retouches by their source atlas so each atlas is re-encoded once.
  const byAtlas = new Map();
  const orphans: Array<{ cube: any; merged: ValidatedPaint }> = [];
  planned.forEach(function (p) {
    if (p.found) {
      const key = atlasKeyOf(p.found.atlas);
      if (!byAtlas.has(key)) byAtlas.set(key, { atlas: p.found.atlas, touched: [] });
      byAtlas.get(key).touched.push(p);
    } else {
      orphans.push({ cube: p.cube, merged: p.merged });
    }
  });
  const originals: any[] = [];
  const added: any[] = [];
  const remapped: any[] = [];
  Undo.initEdit({
    elements: planned.map(function (p) {
      return p.cube;
    }),
    textures: [],
  });
  try {
    byAtlas.forEach(function (entry: AtlasRetouchBatch) {
      const next = reencodeAtlas(entry.atlas, entry.touched);
      next.texture.add(false);
      added.push(next.texture);
      entry.atlas.tiles.forEach(function (tile, idx) {
        const owner = tileOwner(tile.cubeUuid);
        if (!owner) return;
        originals.push(snapshotCubeUV(owner));
        mapCubeToAtlas(owner, next, idx);
        remapped.push(owner);
      });
    });
    if (orphans.length) {
      const fresh = buildAtlasTexture(
        orphans.map(function (o) {
          return o.merged;
        }),
        'retouch_' + Date.now(),
        orphans.map(function (o) {
          return o.cube.uuid;
        })
      );
      fresh.texture.add(false);
      added.push(fresh.texture);
      orphans.forEach(function (o, idx) {
        originals.push(snapshotCubeUV(o.cube));
        mapCubeToAtlas(o.cube, fresh, idx);
        remapped.push(o.cube);
      });
    }
    Undo.finishEdit('AI: Retouch ' + planned.length + ' cubes', { elements: remapped, textures: added });
  } catch (error) {
    originals.forEach(restoreCubeUV);
    added.forEach(function (t) {
      try {
        t.remove(true);
      } catch (ignored) {
        // best effort
      }
      atlasRegistry.delete(t.uuid);
    });
    rollback();
    throw error;
  }
  redraw(remapped);
  return {
    retouched: planned.map(function (p) {
      return { uuid: p.cube.uuid, name: p.cube.name };
    }),
    incremental: byAtlas.size > 0,
  };
}

function atlasKeyOf(atlas: BuiltAtlas): string {
  return atlas.texture.uuid;
}

function tileOwner(cubeUuid: string): any {
  const found = findCubeOrNull(cubeUuid);
  return found;
}

function findCubeOrNull(uuid: string): any {
  try {
    return findCube(uuid);
  } catch (ignored) {
    return null;
  }
}

export function mergePaintForRetouch(
  base: ValidatedPaint,
  part: RetouchRequest,
  extra: Array<any>
): ValidatedPaint {
  const merged: ValidatedPaint = {
    base: part.base ? rgb(part.base, 'base') : base.base.slice(),
    accent: base.accent ? base.accent.slice() : null,
    material: base.material,
    noise: base.noise,
    marks: base.marks.map(function (m) {
      return { face: m.face, shape: m.shape, x: m.x, y: m.y, width: m.width, height: m.height, x2: m.x2, y2: m.y2, color: m.color };
    }),
  };
  if (part.paint) {
    const full = validatePaint(part.paint);
    merged.base = full.base;
    merged.accent = full.accent;
    merged.material = full.material;
    merged.noise = full.noise;
  }
  (extra || []).forEach(function (raw) {
    if (merged.marks.length >= 24) fail('At most 24 paint marks per tile after merge.');
    const single = validatePaint({ base: '#000000', marks: [raw] });
    merged.marks.push(single.marks[0]);
  });
  return merged;
}

// Re-encode one atlas with touched tiles replaced. Untouched tiles keep
// their stored specs: with drawImage the old bitmap is copied and only
// touched tiles are redrawn; otherwise every tile is repainted
// deterministically (identical pixels for untouched tiles).
export function reencodeAtlas(atlas: BuiltAtlas, touched: RetouchTouch[]): BuiltAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = atlas.width;
  canvas.height = atlas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) fail('Could not initialize a 2D canvas.');
  ctx.imageSmoothingEnabled = false;
  const touchedIndex = new Map();
  touched.forEach(function (t) {
    const idx = atlas.tiles.findIndex(function (tile) {
      return tile.cubeUuid === t.cube.uuid;
    });
    if (idx !== -1) touchedIndex.set(idx, t.merged);
  });
  let copied = false;
  if (typeof ctx.drawImage === 'function') {
    try {
      ctx.drawImage(atlas.canvas, 0, 0);
      copied = true;
    } catch (ignored) {
      copied = false;
    }
  }
  atlas.tiles.forEach(function (tile, idx) {
    const replacement = touchedIndex.get(idx);
    if (replacement) {
      paintTile(ctx, atlas, idx, replacement);
      tile.paint = replacement;
    } else if (!copied) {
      paintTile(ctx, atlas, idx, tile.paint);
    }
  });
  const data = canvas.toDataURL('image/png');
  if (data.indexOf('data:image/png;base64,') !== 0) fail('Unable to encode the texture atlas as PNG.');
  const texture = new Texture({ name: atlas.texture.name, width: atlas.width, height: atlas.height });
  texture.fromDataURL(data);
  texture.uv_width = atlas.width;
  texture.uv_height = atlas.height;
  const next: BuiltAtlas = {
    texture: texture,
    canvas: canvas,
    width: atlas.width,
    height: atlas.height,
    columns: atlas.columns,
    tiles: atlas.tiles.map(function (tile) {
      return { cubeUuid: tile.cubeUuid, paint: tile.paint };
    }),
  };
  atlasRegistry.set(texture.uuid, next);
  return next;
}

// Neutral single-material atlas for extrusions and other raw geometry.
export function paintCubesNeutral(cubes: any[], title: string, budget: RunBudget): any {
  if (!cubes.length) return null;
  const paints = cubes.map(function () {
    return validatePaint({ base: '#8A9BA8', material: 'stone', noise: 0.05 });
  });
  const atlas = buildAtlasTexture(paints, title, cubes.map(function (c) {
    return c.uuid;
  }));
  const originals = cubes.map(snapshotCubeUV);
  Undo.initEdit({ elements: cubes, textures: [] });
  try {
    atlas.texture.add(false);
    cubes.forEach(function (cube, idx) {
      mapCubeToAtlas(cube, atlas, idx);
    });
    Undo.finishEdit('AI: Paint extrusion ' + title, { elements: cubes, textures: [atlas.texture] });
  } catch (error) {
    originals.forEach(restoreCubeUV);
    try {
      atlas.texture.remove(true);
    } catch (ignored) {
      // best effort
    }
    atlasRegistry.delete(atlas.texture.uuid);
    rollback();
    throw error;
  }
  void budget;
  return { uuid: atlas.texture.uuid, name: atlas.texture.name };
}

export function textureToolDefs(): ToolDef[] {
  return [
    defineTool(
      'retouch_cubes',
      'INCREMENTAL repaint: add pixels to existing cubes without touching other pixels. Untouched atlas tiles are preserved bit-for-bit. Prefer over paint_existing_cubes for small fixes.',
      {
        parts: {
          type: 'array',
          maxItems: 32,
          items: {
            type: 'object',
            required: ['uuid'],
            properties: {
              uuid: { type: 'string' },
              base: { type: 'string' },
              paint: { type: 'object' },
              marks: { type: 'array', maxItems: 24, items: { type: 'object' } },
            },
          },
        },
      },
      ['parts']
    ),
  ];
}
