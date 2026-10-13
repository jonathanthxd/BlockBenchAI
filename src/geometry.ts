// BlockBenchAI FORGE — Geometry Engine.
//
// All scene mutations go through validated specs + orphan-safe transactions:
// every created cube/group/texture is tracked, and ANY failure removes what
// was created (deepest first) before cancelling the Blockbench Undo edit.
// This fixes orphan groups left behind by partially-failed transactions.
//
// Only verified Blockbench Desktop 5.x APIs are used:
//   new Cube({...}).init().addTo(group|'root'), Cube.all, cube.remove(),
//   new Group({name}).init().addTo(parent), Group.all, group.remove(),
//   element.addTo(newParent) for reparenting (same path as creation),
//   Undo.initEdit/finishEdit/cancelEdit, Canvas.updateView/updateAll.

import { FACE_NAMES, MAX_ARRAY_COUNT, MAX_CUBES_PER_CALL, MAX_CUBES_PER_RUN, MAX_EXTRUDE_PARTS } from './types';
import type {
  Axis,
  ExtrudeArgs,
  FromTo,
  HierarchyGroup,
  HierarchyMove,
  MirrorArgs,
  RepeatArgs,
  RunBudget,
  ToolDef,
  TransformEdit,
} from './types';
import { checkedAxis, checkedColor, checkedCount, coordinates, fail, safeName, vec } from './validate';

export function defineTool(name: string, description: string, properties: any, required: string[]): ToolDef {
  return {
    type: 'function',
    function: {
      name: name,
      description: description,
      parameters: { type: 'object', additionalProperties: false, properties: properties, required: required || [] },
    },
  };
}

// ---------------------------------------------------------------------------
// Host accessors (Blockbench globals resolve at call time, never at load).
// ---------------------------------------------------------------------------

export function activeProject(): any {
  if (typeof Project === 'undefined' || !Project || typeof Format === 'undefined' || !Format) {
    fail('Open or create a Blockbench project first.');
  }
  return Project;
}

export function allowCubes(): void {
  activeProject();
  if (Format.cubes === false || (typeof Cube !== 'undefined' && Cube.isTypePermitted && !Cube.isTypePermitted())) {
    fail('The active format does not permit native cubes.');
  }
}

export function allCubes(): any[] {
  return typeof Cube === 'undefined' ? [] : Cube.all || [];
}

export function allGroups(): any[] {
  return typeof Group === 'undefined' ? [] : Group.all || [];
}

export function findCube(uuid: string): any {
  const found = allCubes().filter(function (c) {
    return c.uuid === uuid;
  })[0];
  if (!found) fail('Cube UUID not found: ' + String(uuid).slice(0, 80));
  if (found.locked) fail('Cube is locked: ' + found.name);
  return found;
}

export function findGroup(value: string): any {
  const matches = allGroups().filter(function (g) {
    return g.uuid === value || g.name === value;
  });
  if (matches.length === 0) fail('Unknown group: ' + String(value).slice(0, 80));
  if (matches.length > 1) fail('Ambiguous group name. Use the group UUID.');
  if (matches[0].locked) fail('The group is locked.');
  return matches[0];
}

export function resolveGroup(value: unknown): any {
  if (!value) return 'root';
  return findGroup(String(value));
}

export function selectedCubes(): any[] {
  return allCubes().filter(function (c) {
    return c.selected;
  });
}

export function redraw(elements: any[]): void {
  if (typeof Canvas === 'undefined') return;
  if (Canvas.updateView) {
    Canvas.updateView({ elements: elements || [], element_aspects: { geometry: true, faces: true, uv: true }, selection: true });
  } else if (Canvas.updateAll) {
    Canvas.updateAll();
  }
}

export function rollback(): void {
  if (typeof Undo !== 'undefined' && typeof Undo.cancelEdit === 'function') Undo.cancelEdit();
}

// ---------------------------------------------------------------------------
// Orphan-safe transaction: track everything created inside `work`; on any
// thrown error, remove created objects deepest-first, then cancel the Undo
// edit, then rethrow. Callers never leave half-built hierarchies behind.
// ---------------------------------------------------------------------------

export interface TxTracker {
  cubes: any[];
  groups: any[];
  textures: any[];
}

export function withTransaction(edit: any, label: string, work: Function): any {
  const tracker: TxTracker = { cubes: [], groups: [], textures: [] };
  Undo.initEdit(edit);
  try {
    const result = work(tracker);
    Undo.finishEdit(label, edit);
    return result;
  } catch (error) {
    const undo = function (list: any[]): void {
      for (let idx = list.length - 1; idx >= 0; idx--) {
        try {
          list[idx].remove();
        } catch (ignored) {
          // removal must be best-effort; the Undo cancel below is authoritative
        }
      }
    };
    undo(tracker.cubes);
    undo(tracker.groups);
    undo(tracker.textures);
    rollback();
    throw error;
  }
}

export function pruneEmptyGroups(except: any[]): number {
  const keep = except || [];
  let removed = 0;
  const groups = allGroups().slice();
  for (let idx = groups.length - 1; idx >= 0; idx--) {
    const group = groups[idx];
    if (keep.indexOf(group) !== -1) continue;
    if (group.locked) continue;
    const children = allCubes().filter(function (c) {
      return c.parent === group;
    });
    const subgroups = allGroups().filter(function (g) {
      return g.parent === group;
    });
    if (children.length === 0 && subgroups.length === 0) {
      try {
        group.remove();
        removed++;
      } catch (ignored) {
        // locked or host-managed groups stay
      }
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Legacy ops (behavior-compatible with v0.5.x), now transaction-hardened.
// ---------------------------------------------------------------------------

export function validatedCube(item: any): any {
  if (!item || typeof item !== 'object') fail('Invalid cube data.');
  const coords: FromTo = coordinates(item);
  const result: any = { name: safeName(item.name), from: coords.from, to: coords.to, group: resolveGroup(item.group) };
  if (item.origin !== undefined) result.origin = vec(item.origin, 'origin');
  if (item.rotation !== undefined) {
    const rot = vec(item.rotation, 'rotation');
    if (
      rot.some(function (a) {
        return a !== 0;
      })
    ) {
      fail('Rotation is not supported by this first tool version. Use axis-aligned cubes.');
    }
    result.rotation = rot;
  }
  if (item.color !== undefined) result.color = checkedColor(item.color);
  return result;
}

export function createGroupOp(args: any): any {
  allowCubes();
  const name = safeName(args && args.name);
  const parent = resolveGroup(args && args.parent);
  const created: any = withTransaction({ outliner: true }, 'AI: Create group', function (tracker: TxTracker) {
    const group = new Group({ name: name }).init().addTo(parent);
    tracker.groups.push(group);
    return group;
  });
  redraw([]);
  return { created_group: { uuid: created.uuid, name: created.name } };
}

export function createCubesOp(args: any, budget: RunBudget): any {
  allowCubes();
  if (!Array.isArray(args && args.cubes) || !args.cubes.length || args.cubes.length > MAX_CUBES_PER_CALL) {
    fail('create_cubes requires between 1 and ' + MAX_CUBES_PER_CALL + ' cubes.');
  }
  if (args.cubes.length > budget.remainingCubes) fail('Creation limit reached for this request.');
  const planned = args.cubes.map(validatedCube);
  const created: any[] = withTransaction(
    { elements: [], outliner: true },
    'AI: Create cubes',
    function (tracker: TxTracker) {
      const made: any[] = [];
      planned.forEach(function (spec: any) {
        const options: any = { name: spec.name, from: spec.from, to: spec.to };
        if (spec.origin) options.origin = spec.origin;
        if (spec.rotation) options.rotation = spec.rotation;
        if (spec.color !== undefined) options.color = spec.color;
        const cube = new Cube(options).init().addTo(spec.group);
        tracker.cubes.push(cube);
        made.push(cube);
      });
      return made;
    }
  );
  budget.remainingCubes -= created.length;
  redraw(created);
  return {
    created: created.map(function (c) {
      return { uuid: c.uuid, name: c.name };
    }),
    remaining_cubes: budget.remainingCubes,
  };
}

export function validateEdit(item: any): any {
  if (!item || typeof item.uuid !== 'string') fail('Each edit needs a cube UUID.');
  const cube = findCube(item.uuid);
  const allowed = ['uuid', 'name', 'from', 'to', 'origin', 'rotation', 'color'];
  if (
    Object.keys(item).some(function (key) {
      return allowed.indexOf(key) === -1;
    })
  ) {
    fail('Unsupported edit property.');
  }
  if (Object.keys(item).length < 2) fail('Edit is empty.');
  const changes: any = {};
  if (item.name !== undefined) changes.name = safeName(item.name);
  if (item.from !== undefined || item.to !== undefined) {
    const coords: FromTo = coordinates(item, cube);
    changes.from = coords.from;
    changes.to = coords.to;
  }
  if (item.origin !== undefined) changes.origin = vec(item.origin, 'origin');
  if (item.rotation !== undefined) {
    const rot = vec(item.rotation, 'rotation');
    if (
      rot.some(function (v) {
        return v !== 0;
      })
    ) {
      fail('Rotation edits are not supported yet.');
    }
    changes.rotation = rot;
  }
  if (item.color !== undefined) changes.color = checkedColor(item.color);
  return { cube: cube, changes: changes };
}

export function editCubesOp(args: any): any {
  allowCubes();
  if (!Array.isArray(args && args.cubes) || !args.cubes.length || args.cubes.length > MAX_CUBES_PER_CALL) {
    fail('edit_cubes requires 1 to ' + MAX_CUBES_PER_CALL + ' cube edits.');
  }
  const planned = args.cubes.map(validateEdit);
  if (
    new Set(
      planned.map(function (p: any) {
        return p.cube.uuid;
      })
    ).size !== planned.length
  ) {
    fail('Duplicate UUID in same edit.');
  }
  const originals = planned.map(function (p: any) {
    return {
      cube: p.cube,
      name: p.cube.name,
      from: p.cube.from.slice(),
      to: p.cube.to.slice(),
      origin: p.cube.origin.slice(),
      rotation: p.cube.rotation.slice(),
      color: p.cube.color,
    };
  });
  Undo.initEdit({
    elements: planned.map(function (p: any) {
      return p.cube;
    }),
  });
  try {
    planned.forEach(function (p: any) {
      Object.keys(p.changes).forEach(function (key) {
        const value = p.changes[key];
        p.cube[key] = Array.isArray(value) ? value.slice() : value;
      });
    });
    Undo.finishEdit('AI: Edit ' + planned.length + ' cubes');
  } catch (error) {
    originals.forEach(function (saved: any) {
      ['name', 'from', 'to', 'origin', 'rotation', 'color'].forEach(function (key) {
        saved.cube[key] = saved[key];
      });
    });
    rollback();
    throw error;
  }
  redraw(
    planned.map(function (p: any) {
      return p.cube;
    })
  );
  return {
    edited: planned.map(function (p: any) {
      return { uuid: p.cube.uuid, name: p.cube.name };
    }),
  };
}

// ---------------------------------------------------------------------------
// FORGE hierarchy: nested groups, safe moves, empty-group cleanup.
// ---------------------------------------------------------------------------

export function organizeHierarchyOp(args: any): any {
  allowCubes();
  const groupSpecs: HierarchyGroup[] = Array.isArray(args && args.groups) ? args.groups : [];
  const moves: HierarchyMove[] = Array.isArray(args && args.moves) ? args.moves : [];
  if (!groupSpecs.length && !moves.length) fail('organize_hierarchy needs at least one group or move.');
  if (groupSpecs.length > 24) fail('At most 24 groups per call.');
  if (moves.length > 64) fail('At most 64 moves per call.');
  const known = new Map();
  const created: any[] = [];
  const moved: Array<{ kind: string; name: string; from: string; to: string }> = [];
  const originals: Array<{ element: any; parent: any }> = [];
  Undo.initEdit({ outliner: true });
  try {
    groupSpecs.forEach(function (spec) {
      const name = safeName(spec.name);
      let parent: any = 'root';
      if (spec.parent) {
        if (known.has(spec.parent)) parent = known.get(spec.parent);
        else parent = resolveGroup(spec.parent);
      }
      const group = new Group({ name: name }).init().addTo(parent);
      created.push(group);
      known.set(spec.name, group);
      known.set(group.uuid, group);
    });
    moves.forEach(function (move) {
      let element: any = null;
      let kind = 'cube';
      if (move.cube) element = findCube(move.cube);
      else if (move.group) {
        element = findGroup(move.group);
        kind = 'group';
      } else fail('Each move needs a cube or group UUID.');
      if (element.locked) fail('Cannot move a locked element: ' + element.name);
      let target: any = 'root';
      if (move.to) {
        if (known.has(move.to)) target = known.get(move.to);
        else target = resolveGroup(move.to);
      }
      if (kind === 'group') {
        let walker: any = target;
        while (walker && walker !== 'root') {
          if (walker === element) fail('Cannot move a group inside itself.');
          walker = walker.parent;
        }
      }
      originals.push({ element: element, parent: element.parent || 'root' });
      element.addTo(target);
      moved.push({
        kind: kind,
        name: element.name,
        from: originals[originals.length - 1].parent === 'root' ? 'root' : originals[originals.length - 1].parent.name,
        to: target === 'root' ? 'root' : target.name,
      });
    });
    let pruned = 0;
    if (args && args.cleanup_empty) pruned = pruneEmptyGroups(created);
    Undo.finishEdit('AI: Organize hierarchy', { outliner: true });
    redraw([]);
    return {
      groups: created.map(function (g) {
        return { uuid: g.uuid, name: g.name };
      }),
      moved: moved,
      pruned_empty: pruned,
    };
  } catch (error) {
    originals.forEach(function (saved) {
      try {
        saved.element.addTo(saved.parent);
      } catch (ignored) {
        // best effort; Undo cancel below reverts the recorded edit
      }
    });
    for (let idx = created.length - 1; idx >= 0; idx--) {
      try {
        created[idx].remove();
      } catch (ignored) {
        // best effort
      }
    }
    rollback();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// FORGE symmetry: mirror cubes across an axis plane, in place or as copies.
// ---------------------------------------------------------------------------

export function mirrorCorners(from: number[], to: number[], axis: string, plane: number): FromTo {
  const a = mirrorPoint(from.slice(), axis, plane);
  const b = mirrorPoint(to.slice(), axis, plane);
  const lo = [0, 1, 2].map(function (ax) {
    return Math.min(a[ax], b[ax]);
  });
  const hi = [0, 1, 2].map(function (ax) {
    return Math.max(a[ax], b[ax]);
  });
  return coordinates({ from: lo, to: hi });
}

export function mirrorPoint(point: number[], axis: string, plane: number): number[] {
  const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const out = point.slice();
  out[idx] = 2 * plane - point[idx];
  if (Math.abs(out[idx]) > 512) fail('Mirrored geometry would leave the 512-unit build volume.');
  return out;
}

export function mirrorCubesOp(args: any, budget: RunBudget): any {
  allowCubes();
  const raw = args as MirrorArgs;
  const axis = checkedAxis(raw.axis || 'x');
  const plane = typeof raw.plane === 'number' && Number.isFinite(raw.plane) ? raw.plane : 0;
  if (Math.abs(plane) > 512) fail('Mirror plane must be within -512 and 512.');
  const copy = raw.copy !== false;
  const suffix = raw.suffix !== undefined ? String(raw.suffix).slice(0, 24) : ' mirrored';
  let targets: any[];
  if (Array.isArray(raw.uuids) && raw.uuids.length) {
    if (raw.uuids.length > MAX_CUBES_PER_CALL) fail('mirror_cubes handles at most ' + MAX_CUBES_PER_CALL + ' cubes.');
    targets = raw.uuids.map(findCube);
  } else {
    targets = selectedCubes();
    if (!targets.length) fail('Nothing selected: pass cube UUIDs or select cubes first.');
    if (targets.length > MAX_CUBES_PER_CALL) fail('Select at most ' + MAX_CUBES_PER_CALL + ' cubes to mirror.');
  }
  if (copy && targets.length > budget.remainingCubes) fail('Not enough geometry budget for mirrored copies.');
  const group = raw.group !== undefined ? resolveGroup(raw.group) : null;
  if (!copy) {
    const planned = targets.map(function (cube) {
      return mirrorCorners(cube.from.slice(), cube.to.slice(), axis, plane);
    });
    Undo.initEdit({ elements: targets });
    const originals = targets.map(function (cube) {
      return { cube: cube, from: cube.from.slice(), to: cube.to.slice() };
    });
    try {
      targets.forEach(function (cube, idx) {
        cube.from = planned[idx].from.slice();
        cube.to = planned[idx].to.slice();
      });
      Undo.finishEdit('AI: Mirror ' + targets.length + ' cubes');
    } catch (error) {
      originals.forEach(function (saved) {
        saved.cube.from = saved.from;
        saved.cube.to = saved.to;
      });
      rollback();
      throw error;
    }
    redraw(targets);
    return {
      mirrored: targets.map(function (c) {
        return { uuid: c.uuid, name: c.name };
      }),
      mode: 'in_place',
    };
  }
  const created: any[] = withTransaction(
    { elements: [], outliner: true },
    'AI: Mirror ' + targets.length + ' cubes',
    function (tracker: TxTracker) {
      const made: any[] = [];
      targets.forEach(function (cube) {
        const coords: FromTo = mirrorCorners(cube.from.slice(), cube.to.slice(), axis, plane);
        const options: any = { name: safeName(cube.name + suffix), from: coords.from, to: coords.to };
        if (cube.color !== undefined) options.color = cube.color;
        const parent = group || cube.parent || 'root';
        const next = new Cube(options).init().addTo(parent);
        tracker.cubes.push(next);
        made.push(next);
      });
      return made;
    }
  );
  budget.remainingCubes -= created.length;
  redraw(created);
  return {
    mirrored: created.map(function (c) {
      return { uuid: c.uuid, name: c.name };
    }),
    mode: 'copy',
    remaining_cubes: budget.remainingCubes,
  };
}

// ---------------------------------------------------------------------------
// FORGE repetition: linear arrays of cube copies with fixed spacing.
// ---------------------------------------------------------------------------

export function repeatArrayOp(args: any, budget: RunBudget): any {
  allowCubes();
  const raw = args as RepeatArgs;
  const count = checkedCount(raw.count === undefined ? 3 : raw.count, 2, MAX_ARRAY_COUNT, 'Count');
  const spacing = raw.spacing !== undefined ? vec(raw.spacing, 'spacing') : [2, 0, 0];
  if (spacing.every(function (v) {
    return v === 0;
  })) {
    fail('Spacing must move on at least one axis.');
  }
  let targets: any[];
  if (Array.isArray(raw.uuids) && raw.uuids.length) {
    if (raw.uuids.length > 8) fail('repeat_array seeds at most 8 cubes per call.');
    targets = raw.uuids.map(findCube);
  } else {
    targets = selectedCubes();
    if (!targets.length) fail('Nothing selected: pass cube UUIDs or select cubes first.');
    if (targets.length > 8) fail('Select at most 8 seed cubes.');
  }
  const total = targets.length * (count - 1);
  if (total > budget.remainingCubes) fail('Array needs ' + total + ' cubes but only ' + budget.remainingCubes + ' remain.');
  const group = raw.group !== undefined ? resolveGroup(raw.group) : null;
  const created: any[] = withTransaction(
    { elements: [], outliner: true },
    'AI: Array x' + count,
    function (tracker: TxTracker) {
      const made: any[] = [];
      targets.forEach(function (cube) {
        for (let step = 1; step < count; step++) {
          const from = cube.from.map(function (v: number, ax: number) {
            return v + spacing[ax] * step;
          });
          const to = cube.to.map(function (v: number, ax: number) {
            return v + spacing[ax] * step;
          });
          const coords: FromTo = coordinates({ from: from, to: to });
          const options: any = { name: safeName(cube.name + ' x' + (step + 1)), from: coords.from, to: coords.to };
          if (cube.color !== undefined) options.color = cube.color;
          const next = new Cube(options).init().addTo(group || cube.parent || 'root');
          tracker.cubes.push(next);
          made.push(next);
        }
      });
      return made;
    }
  );
  budget.remainingCubes -= created.length;
  redraw(created);
  return {
    created: created.map(function (c) {
      return { uuid: c.uuid, name: c.name };
    }),
    remaining_cubes: budget.remainingCubes,
  };
}

// ---------------------------------------------------------------------------
// FORGE transforms: translate and center-based non-uniform scale per cube.
// ---------------------------------------------------------------------------

export function transformCubesOp(args: any): any {
  allowCubes();
  const edits: TransformEdit[] = Array.isArray(args && args.edits) ? args.edits : [];
  if (!edits.length || edits.length > MAX_CUBES_PER_CALL) {
    fail('transform_selection needs 1 to ' + MAX_CUBES_PER_CALL + ' edits.');
  }
  const planned = edits.map(function (edit) {
    if (!edit || typeof edit.uuid !== 'string') fail('Each transform needs a cube UUID.');
    const cube = findCube(edit.uuid);
    const translate = edit.translate !== undefined ? vec(edit.translate, 'translate') : [0, 0, 0];
    let scale = [1, 1, 1];
    if (edit.scale !== undefined) {
      if (
        !Array.isArray(edit.scale) ||
        edit.scale.length !== 3 ||
        !edit.scale.every(function (v) {
          return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 8;
        })
      ) {
        fail('Scale must be 3 positive finite numbers up to 8.');
      }
      scale = (edit.scale as number[]).slice();
    }
    const center = [0, 1, 2].map(function (ax) {
      return (cube.from[ax] + cube.to[ax]) / 2;
    });
    const half = [0, 1, 2].map(function (ax) {
      return ((cube.to[ax] - cube.from[ax]) * scale[ax]) / 2;
    });
    const from = [0, 1, 2].map(function (ax) {
      return center[ax] - half[ax] + translate[ax];
    });
    const to = [0, 1, 2].map(function (ax) {
      return center[ax] + half[ax] + translate[ax];
    });
    const coords: FromTo = coordinates({ from: from, to: to });
    if (
      coords.from.some(function (v) {
        return Math.abs(v) > 512;
      }) ||
      coords.to.some(function (v) {
        return Math.abs(v) > 512;
      })
    ) {
      fail('Transformed cube would leave the 512-unit build volume: ' + cube.name);
    }
    return { cube: cube, from: coords.from, to: coords.to, name: edit.name !== undefined ? safeName(edit.name) : null };
  });
  Undo.initEdit({
    elements: planned.map(function (p) {
      return p.cube;
    }),
  });
  const originals = planned.map(function (p) {
    return { cube: p.cube, from: p.cube.from.slice(), to: p.cube.to.slice(), name: p.cube.name };
  });
  try {
    planned.forEach(function (p) {
      p.cube.from = p.from.slice();
      p.cube.to = p.to.slice();
      if (p.name) p.cube.name = p.name;
    });
    Undo.finishEdit('AI: Transform ' + planned.length + ' cubes');
  } catch (error) {
    originals.forEach(function (saved) {
      saved.cube.from = saved.from;
      saved.cube.to = saved.to;
      saved.cube.name = saved.name;
    });
    rollback();
    throw error;
  }
  redraw(
    planned.map(function (p) {
      return p.cube;
    })
  );
  return {
    transformed: planned.map(function (p) {
      return { uuid: p.cube.uuid, name: p.cube.name };
    }),
  };
}

// ---------------------------------------------------------------------------
// FORGE extrusion: convex XZ profiles swept along Y into stacked cubes.
//
// Blockbench cubes are axis-aligned, so a prism becomes one box per integer
// Z-row per Y-slab: row intervals of a convex polygon are single intervals,
// which keeps part counts predictable and every piece editable.
// ---------------------------------------------------------------------------

export function convexHull(points: number[][]): number[][] {
  const sorted = points
    .map(function (p) {
      return [p[0], p[1]];
    })
    .sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
  const cross = function (o: number[], a: number[], b: number[]): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  };
  const lower: number[][] = [];
  sorted.forEach(function (p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  });
  const upper: number[][] = [];
  for (let idx = sorted.length - 1; idx >= 0; idx--) {
    const p = sorted[idx];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function isConvexPolygon(points: number[][]): boolean {
  if (points.length < 3) return false;
  let sign = 0;
  for (let idx = 0; idx < points.length; idx++) {
    const a = points[idx];
    const b = points[(idx + 1) % points.length];
    const c = points[(idx + 2) % points.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) {
      const current = cross > 0 ? 1 : -1;
      if (sign !== 0 && current !== sign) return false;
      sign = current;
    }
  }
  return sign !== 0;
}

export function pointInConvexPolygon(x: number, z: number, polygon: number[][]): boolean {
  let sign = 0;
  for (let idx = 0; idx < polygon.length; idx++) {
    const a = polygon[idx];
    const b = polygon[(idx + 1) % polygon.length];
    const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross !== 0) {
      const current = cross > 0 ? 1 : -1;
      if (sign !== 0 && current !== sign) return false;
      sign = current;
    }
  }
  return true;
}

// Voxelize a convex XZ polygon into row boxes. Returns {from,to} pairs in
// model units for one Y-slab [y0, y1].
export function voxelizeConvexRows(polygon: number[][], y0: number, y1: number): FromTo[] {
  let minX = 512;
  let maxX = -512;
  let minZ = 512;
  let maxZ = -512;
  polygon.forEach(function (p) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[1] > maxZ) maxZ = p[1];
  });
  const rows: FromTo[] = [];
  for (let z = Math.floor(minZ); z < Math.ceil(maxZ); z++) {
    const zc = z + 0.5;
    if (zc < minZ || zc > maxZ) continue;
    let start: number | null = null;
    let end: number | null = null;
    for (let x = Math.floor(minX); x < Math.ceil(maxX); x++) {
      if (pointInConvexPolygon(x + 0.5, zc, polygon)) {
        if (start === null) start = x;
        end = x + 1;
      } else if (start !== null && end !== null && x > end + 1) {
        break; // convex rows are contiguous; safety break
      }
    }
    if (start !== null && end !== null && end > start) {
      rows.push({ from: [start, y0, z], to: [end, y1, z + 1] });
    }
  }
  return rows;
}

export function extrudeProfileOp(args: any, budget: RunBudget, paintFor: Function): any {
  allowCubes();
  const raw = args as ExtrudeArgs;
  const profile = raw.profile;
  if (!Array.isArray(profile) || profile.length < 3 || profile.length > 24) {
    fail('extrude_profile needs a polygon of 3 to 24 [x, z] points.');
  }
  const points: number[][] = profile.map(function (p, idx) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(function (v) {
      return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 256;
    })) {
      fail('Profile point ' + (idx + 1) + ' must be [x, z] within -256 and 256.');
    }
    return [p[0], p[1]];
  });
  if (!isConvexPolygon(points)) fail('The extrusion profile must be a convex polygon (concave shapes are rejected).');
  const yBase = typeof raw.y_base === 'number' && Number.isFinite(raw.y_base) ? raw.y_base : 0;
  const height = typeof raw.height === 'number' && Number.isFinite(raw.height) ? raw.height : 8;
  if (Math.abs(yBase) > 512 || height <= 0 || height > 256 || yBase + height > 512 || yBase < -512) {
    fail('Extrusion must fit the build volume with positive height up to 256.');
  }
  let step = typeof raw.step === 'number' && Number.isFinite(raw.step) ? raw.step : 1;
  if (step <= 0 || step > height) fail('Step must be positive and at most the extrusion height.');
  const title = safeName(raw.name || 'Extrusion');
  const group = raw.group !== undefined ? resolveGroup(raw.group) : null;
  const slabs: FromTo[][] = [];
  let y = yBase;
  while (y < yBase + height - 1e-9) {
    const y1 = Math.min(y + step, yBase + height);
    slabs.push(voxelizeConvexRows(points, y, y1));
    y = y1;
  }
  let total = 0;
  slabs.forEach(function (rows) {
    total += rows.length;
  });
  if (!total) fail('The profile covers no unit column; enlarge it or move it onto the grid.');
  if (total > MAX_EXTRUDE_PARTS) {
    fail('The extrusion needs ' + total + ' boxes (limit ' + MAX_EXTRUDE_PARTS + '). Use a coarser step or smaller profile.');
  }
  if (total > budget.remainingCubes) fail('Not enough geometry budget for this extrusion.');
  const paint = paintFor(raw.paint || { base: '#8A9BA8', material: 'stone' });
  const created: any[] = withTransaction(
    { elements: [], outliner: true },
    'AI: Extrude ' + title,
    function (tracker: TxTracker) {
      const root = new Group({ name: title }).init().addTo(group || 'root');
      tracker.groups.push(root);
      const made: any[] = [];
      slabs.forEach(function (rows, slab) {
        rows.forEach(function (row, idx) {
          const cube = new Cube({ name: title + ' s' + (slab + 1) + ' r' + (idx + 1), from: row.from, to: row.to })
            .init()
            .addTo(root);
          tracker.cubes.push(cube);
          made.push(cube);
        });
      });
      return made;
    }
  );
  paintFor(created, title, budget);
  budget.remainingCubes -= created.length;
  redraw(created);
  return {
    group: title,
    created_count: created.length,
    slabs: slabs.length,
    remaining_cubes: budget.remainingCubes,
  };
}

// ---------------------------------------------------------------------------
// Tool schemas for the Geometry Engine.
// ---------------------------------------------------------------------------

export function geometryToolDefs(): ToolDef[] {
  return [
    defineTool(
      'mirror_cubes',
      'Mirror cubes across an axis plane (symmetry). Omit uuids to use the current selection. copy:false edits in place.',
      {
        uuids: { type: 'array', items: { type: 'string' } },
        axis: { type: 'string', enum: ['x', 'y', 'z'] },
        plane: { type: 'number' },
        copy: { type: 'boolean' },
        group: { type: 'string' },
        suffix: { type: 'string' },
      },
      []
    ),
    defineTool(
      'repeat_array',
      'Repeat seed cubes as a linear array with fixed XYZ spacing. Names are numbered automatically.',
      {
        uuids: { type: 'array', items: { type: 'string' } },
        count: { type: 'integer', minimum: 2, maximum: MAX_ARRAY_COUNT },
        spacing: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        group: { type: 'string' },
      },
      []
    ),
    defineTool(
      'transform_selection',
      'Translate and center-scale existing cubes by UUID. Scale is per-axis, 0 to 8. Geometry stays positive and inside the build volume.',
      {
        edits: {
          type: 'array',
          maxItems: MAX_CUBES_PER_CALL,
          items: {
            type: 'object',
            required: ['uuid'],
            properties: {
              uuid: { type: 'string' },
              translate: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
              scale: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
              name: { type: 'string' },
            },
          },
        },
      },
      ['edits']
    ),
    defineTool(
      'organize_hierarchy',
      'Create nested outliner groups and move cubes/groups between them. Moves are validated (no cycles, no locked elements) and rolled back on failure.',
      {
        groups: {
          type: 'array',
          maxItems: 24,
          items: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' }, parent: { type: 'string' } },
          },
        },
        moves: {
          type: 'array',
          maxItems: 64,
          items: {
            type: 'object',
            properties: { cube: { type: 'string' }, group: { type: 'string' }, to: { type: 'string' } },
          },
        },
        cleanup_empty: { type: 'boolean' },
      },
      []
    ),
    defineTool(
      'extrude_profile',
      'Extrude a CONVEX 2D polygon (XZ points) along +Y into editable stacked boxes. Concave profiles are rejected with an explanation.',
      {
        name: { type: 'string' },
        profile: { type: 'array', minItems: 3, maxItems: 24, items: { type: 'array', items: { type: 'number' } } },
        y_base: { type: 'number' },
        height: { type: 'number' },
        step: { type: 'number' },
        paint: { type: 'object' },
        group: { type: 'string' },
      },
      ['profile']
    ),
  ];
}
