/* Blockbench AI 0.6.0 FORGE — MIT License, github.com/jonathanthxd/BlockBenchAI */
/* Built from src/*.ts. Do not edit by hand; edit src/ and run `npm run build`. */
(function () {
  'use strict';

// ---- src/types.ts ----
// BlockBenchAI FORGE — shared types and constants.
//
// This module is almost entirely type-level: interfaces vanish at build time
// and only the const values below survive into blockbench_ai.js.

 const VERSION = '0.6.0';
 const FORGE_LABEL = 'FORGE';

 const FACE_NAMES = ['north', 'south', 'east', 'west', 'up', 'down'];

 const MAX_CUBES_PER_CALL = 32;
 const MAX_PAINTED_PARTS = 96;
 const MAX_CUBES_PER_RUN = 192;
 const MAX_TOOL_CALLS = 36;
 const MAX_ROUNDS = 12;
 const MAX_ARRAY_COUNT = 16;
 const MAX_EXTRUDE_PARTS = 96;

 const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
 const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
 const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
 const CLOUDFLARE_MODEL = '@cf/qwen/qwen3.8-27b';
 const STORAGE_KEY = 'blockbench_ai_preferences_v1';

 
 
 
 
 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

// Blockbench host globals (Desktop 5.x). Declared for type checking only;
// at runtime they resolve from the plugin sandbox / global scope.

// ---- src/validate.ts ----
// BlockBenchAI FORGE — validation primitives.
//
// Every value that reaches the Blockbench scene graph or a texture atlas
// passes through these guards first. Tools never throw raw: runTool catches
// fail() and returns {ok:false, error} so the agent can repair its plan.




 function fail(message){
  throw new Error(message);
}

 function safeName(value){
  if (typeof value !== 'string' || !value.trim()) fail('A nonempty name is required.');
  return value.trim().slice(0, 72);
}

 function vec(value, label){
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(function (n) {
      return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 512;
    })
  ) {
    fail(label + ' must contain exactly 3 finite numbers between -512 and 512.');
  }
  return (value ).slice();
}

 function checkedColor(n){
  if (!Number.isInteger(n) || (n ) < 0 || (n ) > 7) {
    fail('Palette color must be an integer from 0 to 7.');
  }
  return n ;
}

 function checkedAxis(value){
  if (value === 'x' || value === 'y' || value === 'z') return value;
  fail('Axis must be one of x, y or z.');
  return 'x';
}

 function checkedCount(value, min, max, label){
  if (!Number.isInteger(value) || (value ) < min || (value ) > max) {
    fail(label + ' must be an integer between ' + min + ' and ' + max + '.');
  }
  return value ;
}

 function coordinates(obj, existing){
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

 function rgb(value, label){
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    fail(label + ' must be a #RRGGBB color.');
  }
  const hex = value ;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

 function colorCode(r, g, b){
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

 function adjustColor(base, delta){
  return colorCode(base[0] + delta, base[1] + delta, base[2] + delta);
}

const MATERIALS = ['metal', 'wood', 'fabric', 'stone', 'skin', 'circuit', 'gem', 'plain'];

 function validatePaint(paint){
  const p = paint ;
  if (!p || typeof p !== 'object') fail('Each part requires a paint specification.');
  const material = p.material || 'plain';
  if (MATERIALS.indexOf(material ) === -1) fail('Unsupported material');
  const noise = p.noise === undefined ? 0.09 : p.noise;
  if (typeof noise !== 'number' || noise < 0 || noise > 0.5 || !Number.isFinite(noise)) {
    fail('Noise must be between 0 and 0.5');
  }
  const out = {
    base: rgb(p.base, 'base'),
    accent: p.accent ? rgb(p.accent, 'accent') : null,
    material: material ,
    noise: noise,
    marks: [],
  };
  if (p.marks !== undefined && (!Array.isArray(p.marks) || p.marks.length > 24)) {
    fail('At most 24 paint marks per part.');
  }
  ((p.marks ) || []).forEach(function (m) {
    if (!m || FACE_NAMES.indexOf(m.face) === -1 || ['pixel', 'rect', 'line'].indexOf(m.shape) === -1) {
      fail('Invalid face mark.');
    }
    const mark = {
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
      mark.x2 = m.x2 ;
      mark.y2 = m.y2 ;
    }
    out.marks.push(mark);
  });
  return out;
}

// Merge new marks over an existing validated paint (used by incremental
// retouch): base/accent/material may be overridden, marks are appended
// (capped at 24) so untouched pixels keep their previous specification.
 function mergePaintMarks(base, extra, overrideBase){
  const merged = {
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

// ---- src/geometry.ts ----
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





 function defineTool(name, description, properties, required){
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

 function activeProject(){
  if (typeof Project === 'undefined' || !Project || typeof Format === 'undefined' || !Format) {
    fail('Open or create a Blockbench project first.');
  }
  return Project;
}

 function allowCubes(){
  activeProject();
  if (Format.cubes === false || (typeof Cube !== 'undefined' && Cube.isTypePermitted && !Cube.isTypePermitted())) {
    fail('The active format does not permit native cubes.');
  }
}

 function allCubes(){
  return typeof Cube === 'undefined' ? [] : Cube.all || [];
}

 function allGroups(){
  return typeof Group === 'undefined' ? [] : Group.all || [];
}

 function findCube(uuid){
  const found = allCubes().filter(function (c) {
    return c.uuid === uuid;
  })[0];
  if (!found) fail('Cube UUID not found: ' + String(uuid).slice(0, 80));
  if (found.locked) fail('Cube is locked: ' + found.name);
  return found;
}

 function findGroup(value){
  const matches = allGroups().filter(function (g) {
    return g.uuid === value || g.name === value;
  });
  if (matches.length === 0) fail('Unknown group: ' + String(value).slice(0, 80));
  if (matches.length > 1) fail('Ambiguous group name. Use the group UUID.');
  if (matches[0].locked) fail('The group is locked.');
  return matches[0];
}

 function resolveGroup(value){
  if (!value) return 'root';
  return findGroup(String(value));
}

 function selectedCubes(){
  return allCubes().filter(function (c) {
    return c.selected;
  });
}

 function redraw(elements){
  if (typeof Canvas === 'undefined') return;
  if (Canvas.updateView) {
    Canvas.updateView({ elements: elements || [], element_aspects: { geometry: true, faces: true, uv: true }, selection: true });
  } else if (Canvas.updateAll) {
    Canvas.updateAll();
  }
}

 function rollback(){
  if (typeof Undo !== 'undefined' && typeof Undo.cancelEdit === 'function') Undo.cancelEdit();
}

// ---------------------------------------------------------------------------
// Orphan-safe transaction: track everything created inside `work`; on any
// thrown error, remove created objects deepest-first, then cancel the Undo
// edit, then rethrow. Callers never leave half-built hierarchies behind.
// ---------------------------------------------------------------------------

 

 function withTransaction(edit, label, work){
  const tracker = { cubes: [], groups: [], textures: [] };
  Undo.initEdit(edit);
  try {
    const result = work(tracker);
    Undo.finishEdit(label, edit);
    return result;
  } catch (error) {
    const undo = function (list){
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

 function pruneEmptyGroups(except){
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

 function validatedCube(item){
  if (!item || typeof item !== 'object') fail('Invalid cube data.');
  const coords = coordinates(item);
  const result = { name: safeName(item.name), from: coords.from, to: coords.to, group: resolveGroup(item.group) };
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

 function createGroupOp(args){
  allowCubes();
  const name = safeName(args && args.name);
  const parent = resolveGroup(args && args.parent);
  const created = withTransaction({ outliner: true }, 'AI: Create group', function (tracker) {
    const group = new Group({ name: name }).init().addTo(parent);
    tracker.groups.push(group);
    return group;
  });
  redraw([]);
  return { created_group: { uuid: created.uuid, name: created.name } };
}

 function createCubesOp(args, budget){
  allowCubes();
  if (!Array.isArray(args && args.cubes) || !args.cubes.length || args.cubes.length > MAX_CUBES_PER_CALL) {
    fail('create_cubes requires between 1 and ' + MAX_CUBES_PER_CALL + ' cubes.');
  }
  if (args.cubes.length > budget.remainingCubes) fail('Creation limit reached for this request.');
  const planned = args.cubes.map(validatedCube);
  const created = withTransaction(
    { elements: [], outliner: true },
    'AI: Create cubes',
    function (tracker) {
      const made = [];
      planned.forEach(function (spec) {
        const options = { name: spec.name, from: spec.from, to: spec.to };
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

 function validateEdit(item){
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
  const changes = {};
  if (item.name !== undefined) changes.name = safeName(item.name);
  if (item.from !== undefined || item.to !== undefined) {
    const coords = coordinates(item, cube);
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

 function editCubesOp(args){
  allowCubes();
  if (!Array.isArray(args && args.cubes) || !args.cubes.length || args.cubes.length > MAX_CUBES_PER_CALL) {
    fail('edit_cubes requires 1 to ' + MAX_CUBES_PER_CALL + ' cube edits.');
  }
  const planned = args.cubes.map(validateEdit);
  if (
    new Set(
      planned.map(function (p) {
        return p.cube.uuid;
      })
    ).size !== planned.length
  ) {
    fail('Duplicate UUID in same edit.');
  }
  const originals = planned.map(function (p) {
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
    elements: planned.map(function (p) {
      return p.cube;
    }),
  });
  try {
    planned.forEach(function (p) {
      Object.keys(p.changes).forEach(function (key) {
        const value = p.changes[key];
        p.cube[key] = Array.isArray(value) ? value.slice() : value;
      });
    });
    Undo.finishEdit('AI: Edit ' + planned.length + ' cubes');
  } catch (error) {
    originals.forEach(function (saved) {
      ['name', 'from', 'to', 'origin', 'rotation', 'color'].forEach(function (key) {
        saved.cube[key] = saved[key];
      });
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
    edited: planned.map(function (p) {
      return { uuid: p.cube.uuid, name: p.cube.name };
    }),
  };
}

// ---------------------------------------------------------------------------
// FORGE hierarchy: nested groups, safe moves, empty-group cleanup.
// ---------------------------------------------------------------------------

 function organizeHierarchyOp(args){
  allowCubes();
  const groupSpecs = Array.isArray(args && args.groups) ? args.groups : [];
  const moves = Array.isArray(args && args.moves) ? args.moves : [];
  if (!groupSpecs.length && !moves.length) fail('organize_hierarchy needs at least one group or move.');
  if (groupSpecs.length > 24) fail('At most 24 groups per call.');
  if (moves.length > 64) fail('At most 64 moves per call.');
  const known = new Map();
  const created = [];
  const moved = [];
  const originals = [];
  Undo.initEdit({ outliner: true });
  try {
    groupSpecs.forEach(function (spec) {
      const name = safeName(spec.name);
      let parent = 'root';
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
      let element = null;
      let kind = 'cube';
      if (move.cube) element = findCube(move.cube);
      else if (move.group) {
        element = findGroup(move.group);
        kind = 'group';
      } else fail('Each move needs a cube or group UUID.');
      if (element.locked) fail('Cannot move a locked element: ' + element.name);
      let target = 'root';
      if (move.to) {
        if (known.has(move.to)) target = known.get(move.to);
        else target = resolveGroup(move.to);
      }
      if (kind === 'group') {
        let walker = target;
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

 function mirrorCorners(from, to, axis, plane){
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

 function mirrorPoint(point, axis, plane){
  const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const out = point.slice();
  out[idx] = 2 * plane - point[idx];
  if (Math.abs(out[idx]) > 512) fail('Mirrored geometry would leave the 512-unit build volume.');
  return out;
}

 function mirrorCubesOp(args, budget){
  allowCubes();
  const raw = args ;
  const axis = checkedAxis(raw.axis || 'x');
  const plane = typeof raw.plane === 'number' && Number.isFinite(raw.plane) ? raw.plane : 0;
  if (Math.abs(plane) > 512) fail('Mirror plane must be within -512 and 512.');
  const copy = raw.copy !== false;
  const suffix = raw.suffix !== undefined ? String(raw.suffix).slice(0, 24) : ' mirrored';
  let targets;
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
  const created = withTransaction(
    { elements: [], outliner: true },
    'AI: Mirror ' + targets.length + ' cubes',
    function (tracker) {
      const made = [];
      targets.forEach(function (cube) {
        const coords = mirrorCorners(cube.from.slice(), cube.to.slice(), axis, plane);
        const options = { name: safeName(cube.name + suffix), from: coords.from, to: coords.to };
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

 function repeatArrayOp(args, budget){
  allowCubes();
  const raw = args ;
  const count = checkedCount(raw.count === undefined ? 3 : raw.count, 2, MAX_ARRAY_COUNT, 'Count');
  const spacing = raw.spacing !== undefined ? vec(raw.spacing, 'spacing') : [2, 0, 0];
  if (spacing.every(function (v) {
    return v === 0;
  })) {
    fail('Spacing must move on at least one axis.');
  }
  let targets;
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
  const created = withTransaction(
    { elements: [], outliner: true },
    'AI: Array x' + count,
    function (tracker) {
      const made = [];
      targets.forEach(function (cube) {
        for (let step = 1; step < count; step++) {
          const from = cube.from.map(function (v, ax) {
            return v + spacing[ax] * step;
          });
          const to = cube.to.map(function (v, ax) {
            return v + spacing[ax] * step;
          });
          const coords = coordinates({ from: from, to: to });
          const options = { name: safeName(cube.name + ' x' + (step + 1)), from: coords.from, to: coords.to };
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

 function transformCubesOp(args){
  allowCubes();
  const edits = Array.isArray(args && args.edits) ? args.edits : [];
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
      scale = (edit.scale ).slice();
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
    const coords = coordinates({ from: from, to: to });
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

 function convexHull(points){
  const sorted = points
    .map(function (p) {
      return [p[0], p[1]];
    })
    .sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
  const cross = function (o, a, b){
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  };
  const lower = [];
  sorted.forEach(function (p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  });
  const upper = [];
  for (let idx = sorted.length - 1; idx >= 0; idx--) {
    const p = sorted[idx];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

 function isConvexPolygon(points){
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

 function pointInConvexPolygon(x, z, polygon){
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
 function voxelizeConvexRows(polygon, y0, y1){
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
  const rows = [];
  for (let z = Math.floor(minZ); z < Math.ceil(maxZ); z++) {
    const zc = z + 0.5;
    if (zc < minZ || zc > maxZ) continue;
    let start = null;
    let end = null;
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

 function extrudeProfileOp(args, budget, paintFor){
  allowCubes();
  const raw = args ;
  const profile = raw.profile;
  if (!Array.isArray(profile) || profile.length < 3 || profile.length > 24) {
    fail('extrude_profile needs a polygon of 3 to 24 [x, z] points.');
  }
  const points = profile.map(function (p, idx) {
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
  const slabs = [];
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
  const created = withTransaction(
    { elements: [], outliner: true },
    'AI: Extrude ' + title,
    function (tracker) {
      const root = new Group({ name: title }).init().addTo(group || 'root');
      tracker.groups.push(root);
      const made = [];
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

 function geometryToolDefs(){
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

// ---- src/texture.ts ----
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







 

 

// texture UUID -> atlas entry. Lets retouch find the exact tile + spec that
// produced each cube's pixels, even across separate tool calls.
const atlasRegistry = new Map();

 function lookupTile(cubeUuid){
  const entries = Array.from(atlasRegistry.values());
  for (let e = 0; e < entries.length; e++) {
    const tiles = entries[e].tiles;
    for (let t = 0; t < tiles.length; t++) {
      if (tiles[t].cubeUuid === cubeUuid) return { atlas: entries[e], index: t };
    }
  }
  return null;
}

 function paintCapability(){
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

 function seededColor(seed, noise){
  const v = Math.sin(seed * 64.217 + 18.711) * 43758.5453;
  return (v - Math.floor(v) - 0.5) * 2 * noise * 65;
}

 function drawLineOn(ctx, x1, y1, x2, y2){
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

 function drawFaceTile(ctx, ox, oy, paint, direction, index){
  const shifts = { north: 0, south: -12, east: -15, west: -8, up: 16, down: -23 };
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
    .forEach(function (m) {
      ctx.fillStyle = m.color;
      if (m.shape === 'pixel') ctx.fillRect(ox + m.x, oy + m.y, 1, 1);
      else if (m.shape === 'rect') ctx.fillRect(ox + m.x, oy + m.y, Math.min(16 - m.x, m.width), Math.min(16 - m.y, m.height));
      else drawLineOn(ctx, ox + m.x, oy + m.y, ox + m.x2, oy + m.y2);
    });
}

 function paintTile(ctx, atlas, index, paint){
  FACE_NAMES.forEach(function (face, j) {
    const slot = index * 6 + j;
    const px = (slot % atlas.columns) * 16;
    const py = Math.floor(slot / atlas.columns) * 16;
    drawFaceTile(ctx, px, py, paint, face, index);
  });
}

 function buildAtlasTexture(paints, label, cubeUuids){
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
  const atlas = {
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

 function mapCubeToAtlas(cube, atlas, index){
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

 function snapshotCubeUV(cube){
  const faces = {};
  FACE_NAMES.forEach(function (f) {
    faces[f] = { texture: cube.faces[f].texture, uv: cube.faces[f].uv.slice() };
  });
  return { cube: cube, box_uv: cube.box_uv, autouv: cube.autouv, faces: faces };
}

 function restoreCubeUV(saved){
  saved.cube.box_uv = saved.box_uv;
  saved.cube.autouv = saved.autouv;
  FACE_NAMES.forEach(function (face) {
    const keep = saved.faces[face];
    saved.cube.faces[face].texture = keep.texture;
    saved.cube.faces[face].uv = keep.uv.slice();
  });
}

 function buildPaintedModelOp(args, budget){
  paintCapability();
  const MAX_PARTS = 96;
  if (!Array.isArray(args.parts) || !args.parts.length || args.parts.length > MAX_PARTS) {
    fail('Painted model requires 1 to 96 parts.');
  }
  if (args.parts.length > budget.remainingCubes) fail('Not enough geometry budget for this request.');
  const title = safeName(args.name);
  const planned = args.parts.map(function (part) {
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
  const rawGroups = args.parts.map(function (part) {
    return part.group || null;
  });
  const atlas = buildAtlasTexture(
    planned.map(function (part) {
      return part.paint;
    }),
    title,
    []
  );
  const created = [];
  const subgroups = new Map();
  let root = null;
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
    subgroups.forEach(function (group) {
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

 function paintExistingCubesOp(args){
  paintCapability();
  if (!Array.isArray(args.parts) || !args.parts.length || args.parts.length > 32) {
    fail('Provide 1 to 32 cube paints.');
  }
  const planned = args.parts.map(function (p) {
    return { cube: findCube(p.uuid), paint: validatePaint(p.paint) };
  });
  if (
    new Set(
      planned.map(function (p) {
        return p.cube.uuid;
      })
    ).size !== planned.length
  ) {
    fail('Duplicate cube UUID.');
  }
  const atlas = buildAtlasTexture(
    planned.map(function (p) {
      return p.paint;
    }),
    'repaint_' + Date.now(),
    planned.map(function (p) {
      return p.cube.uuid;
    })
  );
  const original = planned.map(function (p) {
    return snapshotCubeUV(p.cube);
  });
  let textureAdded = false;
  Undo.initEdit({
    elements: planned.map(function (p) {
      return p.cube;
    }),
    textures: [],
  });
  try {
    atlas.texture.add(false);
    textureAdded = true;
    planned.forEach(function (p, idx) {
      mapCubeToAtlas(p.cube, atlas, idx);
    });
    Undo.finishEdit('AI: Paint ' + planned.length + ' cubes', {
      elements: planned.map(function (p) {
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
    planned.map(function (p) {
      return p.cube;
    })
  );
  return {
    painted: planned.map(function (p) {
      return { uuid: p.cube.uuid, name: p.cube.name };
    }),
    texture: { uuid: atlas.texture.uuid, name: atlas.texture.name, pixels: [atlas.width, atlas.height] },
  };
}

// ---------------------------------------------------------------------------
// FORGE incremental retouch.
// ---------------------------------------------------------------------------

 function retouchCubesOp(args){
  paintCapability();
  const parts =
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
    const extra = part.marks !== undefined ? (part.marks ) : part.paint ? [] : [];
    const merged = mergePaintForRetouch(base, part, extra);
    return { cube: cube, merged: merged, found: found };
  });
  // Group retouches by their source atlas so each atlas is re-encoded once.
  const byAtlas = new Map();
  const orphans = [];
  planned.forEach(function (p) {
    if (p.found) {
      const key = atlasKeyOf(p.found.atlas);
      if (!byAtlas.has(key)) byAtlas.set(key, { atlas: p.found.atlas, touched: [] });
      byAtlas.get(key).touched.push(p);
    } else {
      orphans.push({ cube: p.cube, merged: p.merged });
    }
  });
  const originals = [];
  const added = [];
  const remapped = [];
  Undo.initEdit({
    elements: planned.map(function (p) {
      return p.cube;
    }),
    textures: [],
  });
  try {
    byAtlas.forEach(function (entry) {
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

function atlasKeyOf(atlas){
  return atlas.texture.uuid;
}

function tileOwner(cubeUuid){
  const found = findCubeOrNull(cubeUuid);
  return found;
}

function findCubeOrNull(uuid){
  try {
    return findCube(uuid);
  } catch (ignored) {
    return null;
  }
}

 function mergePaintForRetouch(
  base,
  part,
  extra){
  const merged = {
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
 function reencodeAtlas(atlas, touched){
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
  const next = {
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
 function paintCubesNeutral(cubes, title, budget){
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

 function textureToolDefs(){
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

// ---- src/presets.ts ----
// BlockBenchAI FORGE — deterministic benchmark presets.
//
// Every generator is a pure function of (style/kind, palette): no network,
// no randomness, no clock. The same arguments always produce the same parts,
// so benchmarks double as regression tests.
//
// Humanoid + prop sculpt data below is ported 1:1 from the verified v0.5.x
// builders (same coordinates, same paint specs); FORGE only adds the knight
// style, the crystal golem and the mech walker.




 

 

 const CHARACTER_STYLES = ['android_villager', 'robot', 'villager', 'knight'];
 const PROP_KINDS = ['energy_sword', 'sci_fi_drone', 'treasure_chest', 'crystal_golem', 'mech_walker'];

 function benchmarkDefs(){
  return [
    { id: 'android_villager', label: 'Androide aldeano', kind: 'character', minParts: 75, blurb: 'Humanoide articulado con placas, servos y rostro iluminado.' },
    { id: 'robot', label: 'Robot', kind: 'character', minParts: 75, blurb: 'Variante robot completa del esqueleto articulado.' },
    { id: 'knight', label: 'Caballero', kind: 'character', minParts: 80, blurb: 'Armadura de placas con yelmo, penacho y detalles dorados.' },
    { id: 'energy_sword', label: 'Espada de energía', kind: 'prop', minParts: 30, blurb: 'Hoja con runas, guarda alada y núcleo luminoso.' },
    { id: 'sci_fi_drone', label: 'Dron sci-fi', kind: 'prop', minParts: 55, blurb: 'Quad con cámara, reactor, trenes de aterrizaje y rotores.' },
    { id: 'treasure_chest', label: 'Cofre del tesoro', kind: 'prop', minParts: 35, blurb: 'Cofre con herrajes, cerradura con gema y remaches.' },
    { id: 'crystal_golem', label: 'Gólem de cristal', kind: 'prop', minParts: 28, blurb: 'Bruto rocoso con núcleo y esquirlas de gema.' },
    { id: 'mech_walker', label: 'Mech bípedo', kind: 'prop', minParts: 30, blurb: 'Caminante acorazado con cabina, cañón y piernas dobles.' },
  ];
}

function paintFor(base, material, accent, marks){
  return { base: base, material: material, accent: accent, noise: 0.07, marks: marks || [] };
}

function markRect(face, x, y, color, w, h){
  return { face: face, shape: 'rect', x: x, y: y, color: color, width: w, height: h };
}

// ---------------------------------------------------------------------------
// Humanoids (front faces -Z). Coordinates identical to the v0.5.x builder.
// ---------------------------------------------------------------------------

 function humanoidParts(style, palette){
  const primary = palette.primary;
  const secondary = palette.secondary;
  const accent = palette.accent;
  const skin = palette.skin;
  const isAndroid = style === 'android_villager' || style === 'robot';
  const light = '#A8B9C1';
  const dark = '#192129';
  const gold = '#D6AA53';
  const P = [];
  const part = function (n, x1, y1, z1, x2, y2, z2, c, material, accentColor, marks){
    P.push({
      name: n,
      from: [x1, y1, z1],
      to: [x2, y2, z2],
      paint: paintFor(c, material || 'metal', accentColor || accent, marks),
    });
  };
  part('Core | Torso', -4, 13, -2.6, 4, 24, 2.6, primary, 'metal');
  part('Chest | Armor', -3.8, 18, -3.15, 3.8, 23.1, -2.55, secondary, 'metal', accent, [
    markRect('north', 5, 5, accent, 6, 2),
    markRect('north', 7, 9, gold, 2, 2),
  ]);
  part('Core | Power Cell', -1.6, 16.4, -3.8, 1.6, 19.3, -3.1, accent, 'gem');
  part('Backplate', -3.7, 16, 2.6, 3.7, 23.7, 3.35, secondary, 'metal');
  part('Waist | Belt', -4.4, 12, -3.0, 4.4, 14, 3.0, secondary, 'metal');
  part('Waist | Buckle', -1.2, 12.2, -3.5, 1.2, 13.8, -3.0, gold, 'metal');
  part('Neck | Servo', -1.5, 23.6, -1.5, 1.5, 26, 1.5, secondary, 'circuit');
  part('Head | Skull', -4, 25, -4.0, 4, 33.1, 3.8, isAndroid ? secondary : skin, isAndroid ? 'metal' : 'skin', accent, [
    markRect('north', 3, 6, accent, 3, 2),
    markRect('north', 10, 6, accent, 3, 2),
    markRect('north', 7, 10, dark, 2, 1),
  ]);
  part('Head | Faceplate', -3.6, 26, -4.35, 3.6, 31.5, -4.0, isAndroid ? primary : skin, 'metal', accent, [
    markRect('north', 3, 5, accent, 3, 2),
    markRect('north', 10, 5, accent, 3, 2),
    markRect('north', 6, 11, dark, 4, 1),
  ]);
  part('Villager | Nose', -1.1, 26.8, -6.2, 1.1, 30.2, -4.3, isAndroid ? light : skin, isAndroid ? 'metal' : 'skin');
  part('Eyebrow | Left', -3.0, 30.7, -4.5, -0.8, 31.2, -4.1, secondary, 'metal');
  part('Eyebrow | Right', 0.8, 30.7, -4.5, 3.0, 31.2, -4.1, secondary, 'metal');
  part('Jaw | Lower', -3.1, 25.3, -4.5, 3.1, 26.4, -3.75, primary, 'metal');
  part('Head | Top Panel', -4.1, 33.0, -4.1, 4.1, 34.0, 3.8, secondary, 'metal');
  part('Head | Crest', -2, 34, -2.5, 2, 34.8, 1.3, accent, 'gem');
  part('Ear | Left Servo', -4.8, 28, -1.8, -4, 31, 1.6, secondary, 'circuit');
  part('Ear | Right Servo', 4, 28, -1.8, 4.8, 31, 1.6, secondary, 'circuit');
  part('Antenna | Stem', 1.8, 34, 0, 2.2, 36.5, 0.4, light, 'metal');
  part('Antenna | Tip', 1.3, 36.4, -0.5, 2.7, 37.7, 0.9, accent, 'gem');
  const sides = [-1, 1];
  for (let s = 0; s < sides.length; s++) {
    const side = sides[s];
    const prefix = side < 0 ? 'Left' : 'Right';
    const a = side < 0 ? [-6, -4.1] : [4.1, 6];
    const outer = side < 0 ? [-7.1, -4.1] : [4.1, 7.1];
    const joint = side < 0 ? -5.55 : 5.55;
    part(prefix + ' | Shoulder', outer[0], 20.4, -2.7, outer[1], 24, 2.7, primary, 'metal');
    part(prefix + ' | Shoulder Rim', outer[0] - 0.15, 23, -2.95, outer[1] + 0.15, 24.4, 2.95, light, 'metal');
    part(prefix + ' | Upper Arm', a[0], 16.3, -2, a[1], 21.2, 2, secondary, 'metal');
    part(prefix + ' | Elbow Joint', joint - 1, 15.4, -2.2, joint + 1, 17.3, 2.2, accent, 'circuit');
    part(prefix + ' | Forearm', outer[0], 11.3, -2.5, outer[1], 16.2, 2.5, primary, 'metal');
    part(prefix + ' | Wrist Ring', outer[0] - 0.2, 11, -2.7, outer[1] + 0.2, 12, 2.7, light, 'metal');
    part(prefix + ' | Hand', a[0] - 0.3, 8, -2, a[1] + 0.3, 11.5, 2, secondary, 'metal');
    for (let finger = 0; finger < 3; finger++) {
      const dx = outer[0] + 0.3 + finger * 0.8;
      part(prefix + ' | Finger ' + (finger + 1), dx, 6.5, -1.5, dx + 0.48, 8.1, 1.1, light, 'metal');
    }
    const lx = side < 0 ? -2.3 : 2.3;
    part(prefix + ' | Hip', lx - 1.75, 10.8, -2.35, lx + 1.75, 13.3, 2.35, secondary, 'metal');
    part(prefix + ' | Thigh', lx - 1.65, 6.2, -2, lx + 1.65, 11, 2, primary, 'metal');
    part(prefix + ' | Knee Servo', lx - 1.7, 5.8, -2.4, lx + 1.7, 7.3, 2.4, accent, 'circuit');
    part(prefix + ' | Shin', lx - 1.6, 1.9, -1.8, lx + 1.6, 6.2, 1.8, secondary, 'metal');
    part(prefix + ' | Shin Plate', lx - 1.5, 2.5, -2.15, lx + 1.5, 5.5, -1.8, primary, 'metal');
    part(prefix + ' | Boot', lx - 1.9, 0, -3.9, lx + 1.9, 2.5, 2.4, secondary, 'metal');
    part(prefix + ' | Boot Toe', lx - 1.85, 0, -4.5, lx + 1.85, 1.4, -3.9, light, 'metal');
  }
  if (isAndroid) {
    part('Back | Battery', -2, 15.5, 3.35, 2, 21.5, 4.55, secondary, 'circuit');
    part('Back | Battery LED', -0.8, 17.2, 4.5, 0.8, 19.9, 5.1, accent, 'gem');
    part('Torso | Service Vent Left', -3.6, 14.7, -3.35, -1.6, 16.6, -3.05, dark, 'circuit');
    part('Torso | Service Vent Right', 1.6, 14.7, -3.35, 3.6, 16.6, -3.05, dark, 'circuit');
  }
  const pupil = style === 'villager' ? '#214A55' : accent;
  part('Face | Left Lens', -2.8, 29.25, -4.55, -1.15, 30.35, -4.34, pupil, 'gem');
  part('Face | Right Lens', 1.15, 29.25, -4.55, 2.8, 30.35, -4.34, pupil, 'gem');
  part('Face | Nasal Seam', -0.95, 27.0, -6.29, 0.95, 27.3, -6.15, dark, 'metal');
  part('Face | Speaker', -1.5, 25.9, -4.65, 1.5, 26.45, -4.43, secondary, 'circuit');
  part('Face | Cheek Vent L', -3.45, 26.9, -4.53, -2.45, 28.4, -4.34, dark, 'circuit');
  part('Face | Cheek Vent R', 2.45, 26.9, -4.53, 3.45, 28.4, -4.34, dark, 'circuit');
  part('Chest | Collar Left', -3.45, 22.55, -3.37, -0.25, 23.2, -3.14, light, 'metal');
  part('Chest | Collar Right', 0.25, 22.55, -3.37, 3.45, 23.2, -3.14, light, 'metal');
  part('Chest | Left Detail', -3.4, 18.6, -3.43, -2.9, 21.5, -3.14, gold, 'metal');
  part('Chest | Right Detail', 2.9, 18.6, -3.43, 3.4, 21.5, -3.14, gold, 'metal');
  part('Waist | Front Buckle Detail', -0.5, 12.5, -3.7, 0.5, 13.5, -3.46, accent, 'gem');
  for (let s = 0; s < sides.length; s++) {
    const side = sides[s];
    const tag = side < 0 ? 'Left' : 'Right';
    const sx = side < 0 ? -5.6 : 5.6;
    const leg = side < 0 ? -2.3 : 2.3;
    part(tag + ' | Shoulder Inset', sx - 1, 21.7, -3.04, sx + 1, 23.0, -2.73, secondary, 'metal');
    part(tag + ' | Bicep Connector', sx - 0.72, 17.65, -2.38, sx + 0.72, 18.9, -1.99, accent, 'circuit');
    part(tag + ' | Elbow Bolt', sx - 0.45, 15.9, -2.51, sx + 0.45, 16.8, -2.15, gold, 'metal');
    part(tag + ' | Wrist Indicator', sx - 0.65, 11.5, -2.95, sx + 0.65, 11.92, -2.7, accent, 'gem');
    part(tag + ' | Knee Emblem', leg - 0.6, 6.05, -2.7, leg + 0.6, 6.85, -2.39, gold, 'metal');
    part(tag + ' | Boot Seam', leg - 1.65, 1.7, -4.08, leg + 1.65, 2.03, -3.9, light, 'metal');
  }
  if (style === 'knight') {
    part('Head | Helm Dome', -4.2, 32.6, -4.2, 4.2, 34.4, 4.0, primary, 'metal');
    part('Head | Visor Slit', -3.0, 29.6, -4.62, 3.0, 30.1, -4.4, dark, 'plain');
    part('Head | Plume Base', -0.7, 34.3, -1.8, 0.7, 35.2, 1.0, gold, 'metal');
    part('Head | Plume', -0.45, 35.1, -2.6, 0.45, 37.6, 1.6, accent, 'fabric');
    part('Chest | Tabard Plate', -2.2, 13.9, -3.3, 2.2, 18.2, -3.0, secondary, 'fabric', gold, [markRect('north', 6, 3, gold, 4, 6)]);
    part('Chest | Gorget', -2.6, 23.0, -2.6, 2.6, 24.2, 2.4, light, 'metal');
    for (let s = 0; s < sides.length; s++) {
      const side = sides[s];
      const tag = side < 0 ? 'Left' : 'Right';
      const px = side < 0 ? -7.3 : 5.9;
      part(tag + ' | Pauldron', px, 22.6, -3.1, px + 1.4, 25.2, 3.1, primary, 'metal');
      part(tag + ' | Pauldron Trim', px - 0.1, 22.4, -3.2, px + 1.5, 22.9, 3.2, gold, 'metal');
      part(tag + ' | Gauntlet', side < 0 ? -6.6 : 4.4, 8.2, -2.3, side < 0 ? -4.4 : 6.6, 11.4, 2.3, secondary, 'metal');
      part(tag + ' | Sabaton', side < 0 ? -4.4 : 0.6, 0, -5.0, side < 0 ? -0.6 : 4.4, 1.2, 2.6, secondary, 'metal');
    }
  }
  return P;
}

// ---------------------------------------------------------------------------
// Props (coordinates identical to the v0.5.x builders).
// ---------------------------------------------------------------------------

 function propParts(kind, palette){
  const primary = palette.primary;
  const secondary = palette.secondary;
  const accent = palette.accent;
  const gold = '#DBB768';
  const steel = '#AFBCC9';
  const dark = '#151F2B';
  const wood = '#79543E';
  const P = [];
  const push = function (name, a, b, c, d, e, f, base, mat, trim){
    P.push({ name: name, from: [a, b, c], to: [d, e, f], paint: { base: base, material: mat || 'metal', accent: trim || accent, noise: 0.065 } });
  };
  if (kind === 'energy_sword') {
    push('Grip | Main', -0.85, 0, -0.7, 0.85, 6, 0.7, wood, 'wood');
    push('Grip | Core', -0.55, 1, -0.85, 0.55, 5.5, -0.7, secondary, 'metal');
    push('Hilt | Pommel', -1.35, -1, -1.0, 1.35, 0.3, 1.0, secondary, 'metal');
    push('Hilt | Gem', -0.62, -1.25, -1.18, 0.62, -0.1, -0.98, accent, 'gem');
    push('Hilt | Collar', -1, 5.4, -1, 1, 6.6, 1, steel, 'metal');
    push('Hilt | Guard', -4.8, 6, -1.1, 4.8, 7.3, 1.1, secondary, 'metal');
    push('Hilt | Guard Core', -2, 6, -1.45, 2, 7.7, -1.05, gold, 'metal');
    push('Hilt | Center Jewel', -0.85, 6.3, -1.75, 0.85, 7.6, -1.4, accent, 'gem');
    push('Blade | Body', -1.55, 7, -0.68, 1.55, 24.8, 0.68, steel, 'metal');
    push('Blade | Midrib', -0.45, 7, -1.0, 0.45, 24.7, -0.7, primary, 'metal');
    push('Blade | Tip', -0.95, 24.7, -0.45, 0.95, 27.2, 0.45, steel, 'metal');
    push('Blade | Tip Crest', -0.45, 27.1, -0.2, 0.45, 28.5, 0.2, accent, 'gem');
    push('Blade | Core Glow', -0.24, 8, -1.18, 0.24, 24.4, -0.98, accent, 'gem');
    const signs = [-1, 1];
    for (let q = 0; q < signs.length; q++) {
      const sign = signs[q];
      const label = sign < 0 ? 'Left' : 'Right';
      const x = sign < 0 ? -1.8 : 1.55;
      push(label + ' Blade | Edge', x, 8, -0.43, x + 0.25, 24.3, 0.43, primary, 'metal');
      push(label + ' Blade | Tip Facet', sign < 0 ? -1.14 : 0.95, 24.5, -0.57, sign < 0 ? -0.96 : 1.13, 26.5, 0.57, gold, 'metal');
      push(label + ' Guard | Wing', sign < 0 ? -4.8 : 2.65, 7, -0.75, sign < 0 ? -2.6 : 4.85, 8.25, 0.75, primary, 'metal');
      push(label + ' Guard | Cap', sign < 0 ? -5.25 : 4.55, 7.35, -0.9, sign < 0 ? -4.5 : 5.3, 8.9, 0.9, gold, 'metal');
      push(label + ' Guard | Highlight', sign < 0 ? -4.7 : 2.8, 7.2, -1.0, sign < 0 ? -2.8 : 4.7, 7.55, -0.79, accent, 'circuit');
      for (let bnd = 0; bnd < 4; bnd++) {
        push(label + ' Grip | Binding ' + (bnd + 1), sign < 0 ? -1.05 : 0.8, 0.6 + bnd * 1.25, -0.91, sign < 0 ? -0.8 : 1.05, 1.08 + bnd * 1.25, 0.91, gold, 'metal');
      }
      for (let rn = 0; rn < 4; rn++) {
        push(label + ' Blade | Rune ' + (rn + 1), sign < 0 ? -1.08 : 0.87, 10 + rn * 3, -0.79, sign < 0 ? -0.67 : 1.08, 10.5 + rn * 3, -0.67, accent, 'gem');
      }
    }
  } else if (kind === 'sci_fi_drone') {
    push('Chassis | Core', -3.4, 7, -3.1, 3.4, 10.7, 3.1, primary, 'metal');
    push('Chassis | Top Shell', -3, 10.65, -2.75, 3, 11.65, 2.75, secondary, 'metal');
    push('Chassis | Bottom Plate', -3.15, 6.45, -2.95, 3.15, 7.25, 2.95, secondary, 'metal');
    push('Chassis | Center Reactor', -1.45, 11.6, -1.45, 1.45, 12.25, 1.45, accent, 'gem');
    push('Camera | Front Housing', -1.5, 7.4, -4.2, 1.5, 9.8, -3.05, secondary, 'metal');
    push('Camera | Lens', -0.8, 7.9, -4.65, 0.8, 9.35, -4.15, accent, 'gem');
    push('Camera | Lens Ring', -1.07, 7.65, -4.32, 1.07, 9.65, -4.1, gold, 'metal');
    push('Power | Battery', -2.05, 7, 3.1, 2.05, 9.9, 4.25, secondary, 'circuit');
    push('Power | Battery Light', -0.65, 8, 4.2, 0.65, 9.05, 4.55, accent, 'gem');
    push('Sensor | Antenna', -0.19, 11.5, 1.5, 0.19, 13.95, 1.9, steel, 'metal');
    push('Sensor | Antenna Tip', -0.65, 13.75, 1.05, 0.65, 14.55, 2.35, accent, 'gem');
    const xs = [-1, 1];
    const zs = [-1, 1];
    for (let xi = 0; xi < 2; xi++) {
      for (let zi = 0; zi < 2; zi++) {
        const x = xs[xi];
        const z = zs[zi];
        const tag = (x < 0 ? 'L' : 'R') + (z < 0 ? 'F' : 'B');
        const ax = x * 7;
        const az = z * 7;
        push(tag + ' Arm | Beam', Math.min(x * 2.0, ax) - 0.55, 8, Math.min(z * 2.1, az) - 0.56, Math.max(x * 2.0, ax) + 0.55, 9.25, Math.max(z * 2.1, az) + 0.56, primary, 'metal');
        push(tag + ' Motor | Housing', ax - 1.6, 8.0, az - 1.6, ax + 1.6, 10.7, az + 1.6, secondary, 'metal');
        push(tag + ' Motor | Core', ax - 0.7, 10.6, az - 0.7, ax + 0.7, 11.4, az + 0.7, accent, 'gem');
        push(tag + ' Rotor | Hub', ax - 0.65, 11.4, az - 0.65, ax + 0.65, 12, az + 0.65, steel, 'metal');
        push(tag + ' Rotor | Blade X', ax - 3, 11.9, az - 0.28, ax + 3, 12.2, az + 0.28, steel, 'metal');
        push(tag + ' Rotor | Blade Z', ax - 0.28, 11.9, az - 3, ax + 0.28, 12.2, az + 3, steel, 'metal');
        push(tag + ' Rotor | Blade Tip A', ax - 3.3, 11.83, az - 0.4, ax - 2.7, 12.27, az + 0.4, accent, 'gem');
        push(tag + ' Rotor | Blade Tip B', ax + 2.7, 11.83, az - 0.4, ax + 3.3, 12.27, az + 0.4, accent, 'gem');
        push(tag + ' Landing | Strut', ax - 0.28, 4.7, az - 0.28, ax + 0.28, 8.2, az + 0.28, dark, 'metal');
        push(tag + ' Landing | Foot', ax - 1.5, 4.3, az - 1.0, ax + 1.5, 4.9, az + 1, secondary, 'metal');
      }
    }
    for (let vn = 0; vn < 4; vn++) {
      const vx = -2.3 + vn * 1.5;
      push('Chassis | Vent ' + vn, vx, 9, -3.3, vx + 0.7, 9.5, -3.1, dark, 'circuit');
      push('Chassis | Trim ' + vn, vx, 10.7, -3.0, vx + 0.7, 10.85, -2.7, gold, 'metal');
    }
  } else if (kind === 'treasure_chest') {
    push('Body | Base', -7.5, 0, -4.5, 7.5, 7, 4.5, wood, 'wood');
    push('Body | Upper Lid', -8.1, 6, -5.1, 8.1, 10.5, 5.1, wood, 'wood');
    push('Body | Lid Top', -8.1, 10.3, -5.1, 8.1, 11.2, 5.1, primary, 'metal');
    push('Lock | Housing', -2.1, 4, -5.65, 2.1, 8.4, -4.5, gold, 'metal');
    push('Lock | Keyhole', -0.52, 5, -5.8, 0.52, 6.8, -5.55, dark, 'plain');
    push('Lock | Core Gem', -0.9, 7, -5.88, 0.9, 8.2, -5.7, accent, 'gem');
    const edges = [-1, 1];
    for (let ei = 0; ei < edges.length; ei++) {
      const side = edges[ei];
      const ex = side < 0 ? -8.4 : 7.6;
      const tag = side < 0 ? 'Left' : 'Right';
      push(tag + ' Edge | Vertical', ex, 0.1, -5.3, ex + 0.8, 10.8, 5.3, gold, 'metal');
      push(tag + ' Edge | Top Corner', ex, 10.3, -5.4, ex + 0.8, 11.5, 5.4, primary, 'metal');
      push(tag + ' Hinge | Housing', ex, 7.4, 4.3, ex + 0.8, 10.4, 5.3, secondary, 'metal');
      for (let rv = 0; rv < 3; rv++) {
        push(tag + ' Rivet | Front ' + rv, ex + 0.1, 1.6 + rv * 3, -5.7, ex + 0.7, 2.2 + rv * 3, -5.3, steel, 'metal');
      }
    }
    const faces = [-1, 1];
    for (let fi = 0; fi < faces.length; fi++) {
      const sign = faces[fi];
      const fz = sign < 0 ? -5.15 : 4.35;
      const label = sign < 0 ? 'Front' : 'Back';
      for (let hz = 0; hz < 3; hz++) {
        const hy = 1.15 + hz * 3.0;
        push(label + ' Trim | Horizontal ' + hz, -8.2, hy, fz, 8.2, hy + 0.48, fz + 0.8, primary, 'metal');
      }
      for (let rx = -6; rx <= 6; rx += 3) {
        push(label + ' Rivet | X' + rx, rx - 0.3, 7.5, fz - 0.2, rx + 0.3, 8.1, fz + 0.2, gold, 'metal');
      }
    }
    for (let st = 0; st < 4; st++) {
      const sx = -6.4 + st * 4;
      push('Lid | Steel Strap ' + st, sx, 7.2, -5.3, sx + 0.8, 11.5, 5.3, secondary, 'metal');
      push('Lid | Gold Inlay ' + st, sx + 0.1, 10.8, -5.2, sx + 0.7, 11.4, 5.2, gold, 'metal');
    }
    push('Base | Foot Left', -7.2, -1, -3.7, -5.6, 0.1, 3.7, dark, 'stone');
    push('Base | Foot Right', 5.6, -1, -3.7, 7.2, 0.1, 3.7, dark, 'stone');
  } else if (kind === 'crystal_golem') {
    const rock = '#6B6259';
    const moss = '#4E6B46';
    push('Torso | Core', -4, 8, -3, 4, 18, 3, rock, 'stone');
    push('Torso | Chest Boulder', -3.4, 14, -3.6, 3.4, 18.4, -2.6, rock, 'stone');
    push('Torso | Heart Crystal', -1.4, 12.6, -3.9, 1.4, 15.4, -3.2, accent, 'gem');
    push('Torso | Moss Patch', -3.8, 9.5, -3.2, -0.5, 12.5, -2.9, moss, 'fabric');
    push('Head | Boulder', -2.6, 18.2, -2.6, 2.6, 22.4, 2.4, rock, 'stone');
    push('Head | Brow Ridge', -2.8, 20.2, -3.0, 2.8, 21.2, -2.4, secondary, 'stone');
    push('Head | Left Eye', -1.9, 19.6, -3.1, -0.7, 20.4, -2.7, accent, 'gem');
    push('Head | Right Eye', 0.7, 19.6, -3.1, 1.9, 20.4, -2.7, accent, 'gem');
    push('Head | Jaw Slab', -1.8, 18.3, -2.8, 1.8, 19.3, -1.8, rock, 'stone');
    push('Head | Crown Shard', -0.8, 22.3, -0.8, 0.8, 24.6, 0.8, accent, 'gem');
    const limbs = [-1, 1];
    for (let li = 0; li < limbs.length; li++) {
      const side = limbs[li];
      const tag = side < 0 ? 'Left' : 'Right';
      const sx = side < 0 ? -5.4 : 5.4;
      push(tag + ' | Shoulder Boulder', sx - 1.8, 14.5, -2.2, sx + 1.8, 18.5, 2.2, rock, 'stone');
      push(tag + ' | Shard Pauldron', sx - 1.2, 18.4, -1.4, sx + 1.2, 20.6, 1.4, accent, 'gem');
      push(tag + ' | Upper Arm', sx - 1.4, 10.5, -1.6, sx + 1.4, 14.8, 1.6, rock, 'stone');
      push(tag + ' | Fist', sx - 1.7, 7.6, -1.9, sx + 1.7, 10.8, 1.9, secondary, 'stone');
      push(tag + ' | Knuckle Shard', sx - 1.2, 8.6, -2.4, sx + 1.2, 9.6, -1.9, accent, 'gem');
      const hx = side < 0 ? -2.6 : 2.6;
      push(tag + ' | Hip Boulder', hx - 1.7, 5.6, -2.2, hx + 1.7, 8.4, 2.2, rock, 'stone');
      push(tag + ' | Thigh', hx - 1.5, 2.6, -1.8, hx + 1.5, 5.9, 1.8, rock, 'stone');
      push(tag + ' | Foot Slab', hx - 1.8, 0, -3.2, hx + 1.8, 2.8, 2.2, secondary, 'stone');
    }
    push('Back | Shard Cluster A', -2.4, 15.5, 2.8, -0.6, 19.5, 4.2, accent, 'gem');
    push('Back | Shard Cluster B', 0.6, 14.0, 2.8, 2.4, 18.0, 4.2, accent, 'gem');
  } else if (kind === 'mech_walker') {
    push('Chassis | Pelvis', -3, 10, -2.4, 3, 13, 2.4, secondary, 'metal');
    push('Chassis | Reactor', -1.4, 10.4, -2.9, 1.4, 12.4, -2.3, accent, 'gem');
    push('Cockpit | Tub', -2.6, 13, -2.2, 2.6, 17.5, 2.2, primary, 'metal');
    push('Cockpit | Canopy', -2.0, 15.2, -2.7, 2.0, 17.2, -2.1, accent, 'gem');
    push('Cockpit | Canopy Frame', -2.3, 14.9, -2.75, 2.3, 15.4, -2.05, secondary, 'metal');
    push('Cockpit | Roof', -2.7, 17.4, -2.3, 2.7, 18.2, 2.3, secondary, 'metal');
    push('Sensor | Mast', 2.2, 18.1, 1.2, 2.5, 20.6, 1.5, steel, 'metal');
    push('Sensor | Dish', 1.7, 20.5, 0.7, 3.0, 21.2, 2.0, primary, 'metal');
    push('Weapon | Cannon Mount', -4.4, 13.4, -1.2, -2.6, 15.2, 1.2, secondary, 'metal');
    push('Weapon | Cannon Barrel', -7.6, 13.9, -0.4, -4.3, 14.7, 0.4, dark, 'metal');
    push('Weapon | Muzzle Glow', -8.1, 14.0, -0.3, -7.5, 14.6, 0.3, accent, 'gem');
    push('Weapon | Ammo Drum', -4.2, 15.3, -1.4, -2.8, 16.7, 1.4, primary, 'metal');
    const legs = [-1, 1];
    for (let gi = 0; gi < legs.length; gi++) {
      const side = legs[gi];
      const tag = side < 0 ? 'Left' : 'Right';
      const lx = side < 0 ? -2.2 : 2.2;
      push(tag + ' | Hip Joint', lx - 1.3, 8.6, -1.8, lx + 1.3, 10.4, 1.8, accent, 'circuit');
      push(tag + ' | Upper Leg', lx - 1.2, 5.2, -1.5, lx + 1.2, 8.9, 1.5, primary, 'metal');
      push(tag + ' | Knee Piston', lx - 0.5, 4.2, -1.9, lx + 0.5, 5.6, 1.9, steel, 'metal');
      push(tag + ' | Knee Plate', lx - 1.3, 4.0, -2.1, lx + 1.3, 5.4, -1.4, secondary, 'metal');
      push(tag + ' | Lower Leg', lx - 1.0, 1.4, -1.2, lx + 1.0, 4.4, 1.2, secondary, 'metal');
      push(tag + ' | Ankle Guard', lx - 1.2, 0.9, -1.6, lx + 1.2, 1.8, 1.6, gold, 'metal');
      push(tag + ' | Foot', lx - 1.6, 0, -2.8, lx + 1.6, 1.1, 2.0, dark, 'metal');
      push(tag + ' | Toe Plate', lx - 1.5, 0, -3.6, lx + 1.5, 0.7, -2.7, primary, 'metal');
      push(tag + ' | Side Thruster', side < 0 ? lx - 1.9 : lx + 0.7, 6.0, -0.6, side < 0 ? lx - 0.7 : lx + 1.9, 8.2, 0.6, secondary, 'circuit');
    }
    for (let ex = 0; ex < 3; ex++) {
      push('Chassis | Exhaust ' + ex, -2 + ex * 1.6, 12.2, 2.3, -1.2 + ex * 1.6, 13.0, 3.1, dark, 'metal');
    }
  } else {
    fail('Unsupported prop type.');
  }
  return P;
}

 function defaultPalette(style){
  if (style === 'knight') return { primary: '#7A8894', secondary: '#3A4450', accent: '#D6AA53', skin: '#BA9B79' };
  if (style === 'villager') return { primary: '#6B7B5E', secondary: '#4A4438', accent: '#D6AA53', skin: '#BA9B79' };
  if (style === 'robot') return { primary: '#5E6E7A', secondary: '#2C3640', accent: '#E05A3A', skin: '#8A8F96' };
  return { primary: '#566876', secondary: '#303842', accent: '#55D8E8', skin: '#B69B79' };
}

 function propPalette(kind){
  if (kind === 'crystal_golem') return { primary: '#6B6259', secondary: '#3E4A52', accent: '#5FE3F0', skin: '#6B6259' };
  if (kind === 'mech_walker') return { primary: '#6E7B5A', secondary: '#333C47', accent: '#FF9A3C', skin: '#6B6259' };
  return { primary: '#627B8A', secondary: '#2C3B49', accent: '#54DFEC', skin: '#BA9B79' };
}

// ---- src/agent.ts ----
// BlockBenchAI FORGE — AI agent: intent planning, tool budgets, context.
//
// The agent never sends raw scenes: only a bounded snapshot (configurable
// counts), the last 4 history turns truncated to 280 chars, and the smallest
// tool set that can satisfy the classified intent. Token pressure is
// estimated from real UTF-8 bytes before every request (Groq OSS 120B free
// tier guard), and refinement requests are forced through inspect-first with
// a quarter geometry budget so existing work is never clobbered blindly.





 

 

const CHARACTER_RE = /(aldean|villager|androide|android|robot|personaje|character|humanoid|humano|caballero|knight|golem)/i;
const PROP_RE = /(espada|sword|katana|blade|dron|drone|quadcop|cofre|chest|baul|golem|mech|walker|walker|caminante)/i;
const EDIT_RE = /(modifica|modificar|cambia|cambiar|ajusta|ajustar|editar|edita|pinta|pintar|repinta|repaint|modify|change|color|textur|extend|alarga|mejora|improve|refina|refine|arregla|fix)/i;
const GEOMETRY_RE = /(simetr|mirror|symmetr|espejo|repet|array|matriz|fila|extru|prisma|bisel|jerarqu|agrupa|organiza|escala|scale|mueve|mover|desplaza|transform|gira|rotate)/i;

 function classifyIntent(prompt, populated){
  const text = String(prompt || '');
  if (populated && EDIT_RE.test(text)) return 'edit';
  if (GEOMETRY_RE.test(text)) return 'geometry';
  if (PROP_RE.test(text)) return 'prop';
  if (CHARACTER_RE.test(text)) return 'character';
  if (populated && /(crea|create|genera|generate|añade|add|construye|build)/i.test(text)) return 'object';
  if (EDIT_RE.test(text)) return 'edit';
  return 'object';
}

 function isRefinement(prompt){
  return /\b(refina|refinar|refine|mejora|mejorar|improve|pule|pulir|polish|retoca|retocar|termina|terminar|finish|completa|completar)\b/i.test(
    String(prompt || '')
  );
}

// Legacy-compatible tool routing. The exact tool lists for the four legacy
// intents are frozen by tests; new FORGE tools only extend the edit and
// geometry sets.
 function planTools(intent, prompt, populated, endpoint, all){
  const byName = function (name){
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

 function planBudget(prompt, project){
  const full = MAX_CUBES_PER_RUN;
  const budget = { project: project, remainingCubes: full, toolCalls: 0 };
  if (isRefinement(prompt)) budget.remainingCubes = Math.floor(full / 4);
  return budget;
}

 function toolCallBudget(){
  return MAX_TOOL_CALLS;
}

// Conservative token estimate: 1 token per 2.8 UTF-8 bytes + output headroom.
// Mirrors the preflight guard so tests and runtime agree.
 function estimateTokens(payload, headroom){
  const bytes = utf8Length(payload);
  return Math.ceil(bytes / 2.8) + (headroom === undefined ? 900 : headroom);
}

 function utf8Length(text){
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

 function preflightPayload(payload, endpoint, model){
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

 function summarizeHistory(history){
  return (history || []).slice(-4).map(function (m) {
    return { role: m.role, content: String(m.content).slice(0, 280) };
  });
}

 function compactSceneSnapshot(ctx, firstRound){
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

 function refinementGuard(plan, sceneCubes){
  if (plan.refine && sceneCubes === 0) {
    return 'Refinement requested but the scene is empty: a full generation fits the request better than edits.';
  }
  if (plan.refine) {
    return 'Refinement mode: inspect first, then apply at most a quarter-budget of small edits. Never rebuild from scratch.';
  }
  return '';
}

 function makePlan(prompt, populated){
  const intent = classifyIntent(prompt, populated);
  return { intent: intent, tools: [], refine: isRefinement(prompt), cubeBudget: planBudget(prompt, null).remainingCubes };
}

// ---- src/providers.ts ----
// BlockBenchAI FORGE — providers: endpoints, credentials hygiene, retries.
//
// One OpenAI-compatible Chat Completions transport for Cloudflare/Qwen,
// Gemini, Groq, OpenAI and local endpoints. Secrets live only in memory for
// the plugin session and are redacted from every surfaced error.






 const MAX_RATE_RETRIES = 4;
 const MAX_TOTAL_RATE_WAIT_MS = 125000;

 function providerEndpoints(){
  return { groq: GROQ_ENDPOINT, gemini: GEMINI_ENDPOINT, openai: DEFAULT_ENDPOINT };
}

 function validCloudflareAccount(value){
  return typeof value === 'string' && /^[a-f0-9]{32}$/i.test((value ).trim());
}

 function cloudflareEndpoint(account){
  if (!validCloudflareAccount(account)) fail('Introduce un Account ID válido de Cloudflare (32 caracteres hexadecimales).');
  return 'https://api.cloudflare.com/client/v4/accounts/' + String(account).trim() + '/ai/v1/chat/completions';
}

 function validateEndpoint(value){
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch (ignored) {
    fail('Enter a valid API endpoint URL.');
    throw new Error('unreachable');
  }
  const host = url.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    fail('HTTPS is required except on localhost.');
  }
  if (url.username || url.password || url.hash) fail('API endpoints cannot include credentials or fragments.');
  return url.toString();
}

 function isLocalEndpoint(endpoint){
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(new URL(endpoint).hostname);
  } catch (ignored) {
    return false;
  }
}

 function safeError(message, secrets){
  let out = String(message || 'Error desconocido').slice(0, 640);
  (secrets || []).forEach(function (secret) {
    if (secret && secret.length > 3) out = out.split(secret).join('[REDACTED]');
  });
  const keyValue = new RegExp('("?(?:api[_-]?key|access[_-]?token|authorization)"?\\s*[:=]\\s*")([^"]+)(")', 'gi');
  return out
    .replace(/\bBearer\s+[a-z0-9._~+/-]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gsk_|sk-|AIza)[a-z0-9_-]{8,}/gi, '[REDACTED]')
    .replace(keyValue, '$1[REDACTED]$3');
}

 function retrySeconds(headers, detail, retryCount){
  const raw = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
    const asDate = Date.parse(raw);
    if (Number.isFinite(asDate)) return Math.max(0, (asDate - Date.now()) / 1000);
  }
  const match = /(?:try again in|retry after|reset in)\s+(\d+(?:\.\d+)?)\s*(s|sec|seconds|m|min|minutes)\b/i.exec(detail || '');
  if (match) return Number(match[1]) * (/^m/i.test(match[2]) ? 60 : 1);
  const reset = headers && typeof headers.get === 'function' && headers.get('x-ratelimit-reset-tokens');
  if (reset) {
    const found = /^(\d+(?:\.\d+)?)(s|ms|m)$/i.exec(reset.trim());
    if (found) return Number(found[1]) * (found[2] === 'm' ? 60 : found[2] === 'ms' ? 0.001 : 1);
  }
  return Math.min(12, 3 * Math.pow(2, retryCount));
}

 function waitForQuota(seconds, signal, onProgress){
  const until = Date.now() + Math.ceil(seconds * 1000);
  return new Promise(function (resolve, reject) {
    let timer = null;
    let settled = false;
    const cleanup = function (){
      if (timer !== null) clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    };
    const cancel = function (){
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Solicitud cancelada.'));
    };
    const tick = function (){
      if (signal.aborted) {
        cancel();
        return;
      }
      const left = Math.max(0, until - Date.now());
      if (left <= 0) {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
        return;
      }
      (onProgress )('Límite del proveedor: reintentando en ' + Math.ceil(left / 1000) + ' s… (puedes detenerlo)');
      timer = setTimeout(tick, Math.min(1000, left));
    };
    signal.addEventListener('abort', cancel, { once: true });
    tick();
  });
}

 function checkProviderConnection(config){
  const endpoint = validateEndpoint(config.provider === 'cloudflare' ? cloudflareEndpoint(config.cloudflareAccount) : config.endpoint);
  const model = safeName(config.model);
  const localHost = isLocalEndpoint(endpoint);
  if (!config.apiKey && !localHost) fail('La API key es obligatoria. Usa una clave del proveedor elegido.');
  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, 18000);
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = 'Bearer ' + config.apiKey;
  return fetch(endpoint, {
    method: 'POST',
    headers: headers,
    signal: controller.signal,
    body: JSON.stringify({ model: model, messages: [{ role: 'user', content: 'Reply with: OK' }], max_tokens: 16 }),
  }).then(
    function (response) {
      const done = function (value){
        clearTimeout(timeout);
        return value;
      };
      const failed = function (error){
        clearTimeout(timeout);
        throw error;
      };
      if (!response.ok) {
        return response
          .json()
          .then(function (body) {
            return (body && body.error && body.error.message) || '';
          })
          .catch(function () {
            return '';
          })
          .then(function (message) {
            fail('Conexión rechazada (' + response.status + '). ' + safeError(message || 'Revisa tu clave, modelo y URL.', [config.apiKey]));
          });
      }
      return response
        .json()
        .then(function (data) {
          if (!data || !Array.isArray(data.choices) || !data.choices[0] || !data.choices[0].message) {
            fail('El servidor respondió, pero no devolvió el formato Chat Completions esperado.');
          }
          return done({ provider: config.provider, model: model });
        })
        .catch(function (error) {
          if (error && error.message === 'El servidor respondió, pero no devolvió el formato Chat Completions esperado.') throw error;
          return failed(error);
        });
    },
    function (error) {
      clearTimeout(timeout);
      if (controller.signal.aborted) fail('La comprobación superó el tiempo máximo de conexión (18 segundos).');
      throw error;
    }
  );
}

 function requestCompletion(
  endpoint,
  model,
  apiKey,
  messages,
  signal,
  onProgress,
  availableTools){
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  const payload = JSON.stringify({ model: model, messages: messages, tools: availableTools, tool_choice: 'auto' });
  preflightPayload(payload, endpoint, model);
  let waited = 0;
  const attempt = function (retry){
    if (signal.aborted) return Promise.reject(new Error('Solicitud cancelada.'));
    return fetch(endpoint, { method: 'POST', headers: headers, signal: signal, body: payload }).then(
      function (response) {
        if (response.status === 413) {
          fail('La API rechazó el tamaño de la solicitud (413). Prueba el proveedor Gemini en Ajustes o reinicia el chat para reducir contexto; el error no se soluciona esperando.');
        }
        if (response.status === 429) {
          return response
            .json()
            .then(function (body) {
              return String((body && body.error && body.error.message) || '');
            })
            .catch(function () {
              return '';
            })
            .then(function (detail) {
              const seconds = retrySeconds(response.headers, detail, retry);
              const delay = Math.min(65000, Math.ceil((seconds + 0.65) * 1000));
              if (retry === MAX_RATE_RETRIES || seconds > 65 || waited + delay > MAX_TOTAL_RATE_WAIT_MS) {
                fail('El proveedor ha alcanzado su límite de uso gratuito. Espera a que se renueve tu cuota o elige otro proveedor en Ajustes. Las modificaciones ya aplicadas se conservaron.');
              }
              waited += delay;
              return waitForQuota(delay / 1000, signal, onProgress).then(function () {
                return attempt(retry + 1);
              });
            });
        }
        if (!response.ok) {
          return response
            .json()
            .then(function (body) {
              return (body.error && body.error.message) || '';
            })
            .catch(function () {
              return '';
            })
            .then(function (detail) {
              fail('API error ' + response.status + (detail ? ': ' + safeError(detail, [apiKey]) : '. Revisa tu API key, modelo y endpoint.'));
            });
        }
        return response
          .json()
          .then(function (data) {
            return data;
          })
          .catch(function () {
            fail('El proveedor devolvió una respuesta JSON inválida.');
          })
          .then(function (data) {
            const message = data && data.choices && data.choices[0] && data.choices[0].message;
            if (!message) fail('La API no devolvió una respuesta compatible con Chat Completions.');
            return message;
          });
      },
      function () {
        if (signal.aborted) fail('Solicitud cancelada.');
        fail('No se pudo conectar con la API. Comprueba la URL, la conexión y los permisos de red.');
      }
    );
  };
  return attempt(0);
}

// ---- src/ui.ts ----
// BlockBenchAI FORGE - copilot UX.
//
// Legacy-compatible dockable panel (same settings keys, same offline demos,
// same message flows) with honest work states: idle / working / painting /
// retry / cancelled / error / done, a step progress bar, and an operation log
// with human-readable labels. Benchmarks run the same deterministic
// generators as the AI tools, so a green picker means the pipeline works.
//
// NOTE: every non-ASCII character in this file is a \u escape on purpose,
// so the sources stay pure ASCII. Imports below are erased by the bundler;
// cross-module calls resolve in the shared closure (see docs/BUILD.md), so
// value imports must name the real top-level declaration (no aliases).







 function offlineDemoIntent(value){
  const text = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u00a1!?.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = /^(?:demo|prueba)(?: (?:local|sin ia))?(?: (?:de|del|de la))? (dron|drone|espada|sword|androide|android|robot|cofre|chest)$/.exec(
    text
  );
  if (!match) return null;
  const item = match[1];
  if (item === 'dron' || item === 'drone') return 'sci_fi_drone';
  if (item === 'espada' || item === 'sword') return 'energy_sword';
  if (item === 'cofre' || item === 'chest') return 'treasure_chest';
  return 'android_villager';
}

 function friendlyOpName(tool){
  const names = {
    inspect_scene: 'Inspeccionado el modelo',
    create_group: 'Grupo creado',
    create_cubes: 'Cubos creados',
    edit_cubes: 'Cubos editados',
    build_painted_model: 'Modelo pintado construido',
    paint_existing_cubes: 'Cubos pintados',
    retouch_cubes: 'Retoque incremental aplicado',
    generate_character: 'Personaje generado',
    generate_prop: 'Prop generado',
    compose_model: 'Modelo compacto construido',
    mirror_cubes: 'Simetr\u00eda aplicada',
    repeat_array: 'Repetici\u00f3n aplicada',
    transform_selection: 'Transformaci\u00f3n aplicada',
    organize_hierarchy: 'Jerarqu\u00eda organizada',
    extrude_profile: 'Perfil extru\u00eddo',
  };
  return names[tool] || tool;
}

const TEMPLATE = `
<section class="bbai-root">
  <header class="bbai-topbar">
    <div class="bbai-identity">
      <div class="bbai-logomark"><i class="material-icons">auto_awesome</i></div>
      <div class="bbai-brand">
        <strong>Blockbench AI</strong>
        <span>Tu asistente de modelado</span>
      </div>
    </div>
    <button class="bbai-icon-button" type="button" @click="view === 'settings' ? view = 'chat' : openSettings()" :title="view === 'settings' ? 'Volver al chat' : 'Configuraci\u00f3n'" :aria-label="view === 'settings' ? 'Volver al chat' : 'Configuraci\u00f3n'">
      <i class="material-icons">{{ view === 'settings' ? 'close' : 'tune' }}</i>
    </button>
  </header>
  <nav class="bbai-tabs" aria-label="Secciones de Blockbench AI">
    <button type="button" :class="{active: view === 'chat'}" @click="view = 'chat'"><i class="material-icons">chat_bubble_outline</i> Chat</button>
    <button type="button" :class="{active: view === 'settings'}" @click="openSettings()"><i class="material-icons">settings</i> Ajustes</button>
    <span class="bbai-version">v0.6.0 FORGE</span>
  </nav>

  <template v-if="view === 'settings'">
    <div class="bbai-settings-view">
      <div class="bbai-section-intro">
        <div class="bbai-section-icon"><i class="material-icons">tune</i></div>
        <h3>Configurar IA</h3>
        <p>Elige tu proveedor y conecta un modelo compatible con herramientas.</p>
      </div>
      <div class="bbai-config-card">
        <label class="bbai-field">
          <span>Proveedor</span>
          <select v-model="provider" @change="changeProvider">
            <option value="gemini">Google Gemini \u00b7 plan gratuito</option>
            <option value="cloudflare">Cloudflare \u00b7 Qwen Workers AI</option>
            <option value="groq">Groq \u00b7 plan gratuito</option>
            <option value="openai">OpenAI</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        <label class="bbai-field" v-if="provider === 'cloudflare'">
          <span>Cloudflare Account ID</span>
          <input v-model="cloudflareAccount" @input="updateCloudflareEndpoint" placeholder="32 caracteres hexadecimales" maxlength="32" />
        </label>
        <label class="bbai-field">
          <span>Endpoint</span>
          <input v-model="endpoint" placeholder="https://..." />
        </label>
        <label class="bbai-field">
          <span>Modelo</span>
          <input v-model="model" placeholder="model-id" />
        </label>
        <label class="bbai-field">
          <span>API key (solo sesi\u00f3n)</span>
          <input v-model="apiKey" type="password" placeholder="gsk_... / sk-..." autocomplete="off" />
        </label>
        <div class="bbai-settings-row">
          <button type="button" class="bbai-secondary-button" @click="testConnection" :disabled="testingConnection || busy">Probar conexi\u00f3n</button>
          <button type="button" class="bbai-primary-button" @click="saveSettings">Guardar</button>
        </div>
        <div v-if="connectionStatus" class="bbai-connection-status" :class="connectionResult">{{ connectionStatus }}</div>
      </div>
    </div>
  </template>

  <template v-else>
    <div class="bbai-projectbar">
      <span class="bbai-project-label">{{ projectLabel }}</span>
      <button type="button" class="bbai-quick-demo-button" @click="showDemos = !showDemos"><i class="material-icons">play_circle</i> Demos</button>
    </div>
    <div v-if="showDemos" class="bbai-demo-picker">
      <span>Demos sin IA \u00b7 generan geometr\u00eda real sin claves</span>
      <button type="button" @click="generateLocalDemo">Demo androide \u00b7 Sin IA</button>
      <button type="button" @click="generateLocalPropDemo('sci_fi_drone')">Demo dron \u00b7 Sin IA</button>
      <button type="button" @click="generateLocalPropDemo('energy_sword')">Demo espada \u00b7 Sin IA</button>
      <button type="button" @click="generateLocalPropDemo('treasure_chest')">Demo cofre \u00b7 Sin IA</button>
    </div>
    <div v-if="showDemos" class="bbai-bench-picker">
      <span>Benchmarks FORGE \u00b7 {{ benchSummary || '8 modelos deterministas' }}</span>
      <button v-for="b in benchmarks" type="button" :key="b.id" @click="runBenchmark(b.id)" :disabled="benchBusy || busy">{{ b.label }}</button>
      <button type="button" class="bbai-bench-all" @click="runAllBenchmarks" :disabled="benchBusy || busy">Ejecutar los 8</button>
    </div>
    <div v-if="!messages.length" class="bbai-welcome">
      <h3>Modela con palabras</h3>
      <p>Pide un dron, una espada o un aldeano androide. O prueba sin IA:</p>
      <div class="bbai-welcome-demos">
        <button type="button" @click="generateLocalDemo">Demo androide \u00b7 Sin IA</button>
        <button type="button" @click="generateLocalPropDemo('sci_fi_drone')">Demo dron \u00b7 Sin IA</button>
        <button type="button" @click="generateLocalPropDemo('energy_sword')">Demo espada \u00b7 Sin IA</button>
      </div>
      <div class="bbai-suggestions">
        <button type="button" @click="useSuggestion('Crea un robot de cubos con cabeza, torso, brazos y piernas.')">Robot articulado</button>
        <button type="button" @click="useSuggestion('Crea una espada de energ\u00eda con runas brillantes.')">Espada r\u00fanica</button>
        <button type="button" @click="example()">Ejemplo r\u00e1pido</button>
      </div>
    </div>
    <div v-if="busy" class="bbai-phase" :class="'bbai-phase-' + phase">
      <span class="bbai-phase-dot"></span>
      <span><strong>{{ phaseLabel }}</strong> \u00b7 {{ status }}</span>
    </div>
    <div v-if="busy && progressTotal > 1" class="bbai-progress"><div class="bbai-progress-fill" :style="{width: progressPct + '%'}"></div></div>
    <div ref="history" class="bbai-history">
      <div v-for="(m, idx) in messages" :key="idx" class="bbai-message" :class="'bbai-' + m.role">
        <span>{{ m.content }}</span>
      </div>
    </div>
    <div v-if="oplog.length" class="bbai-oplog">
      <div v-for="(op, idx) in oplog.slice(-6)" :key="idx" class="bbai-op"><i class="material-icons">check_circle</i> {{ op }}</div>
    </div>
    <form class="bbai-composer" @submit.prevent="send">
      <input v-model="prompt" placeholder="Describe el modelo..." maxlength="4000" :disabled="busy" />
      <button type="submit" :disabled="busy || !prompt.trim()"><i class="material-icons">send</i></button>
      <button type="button" v-if="busy" @click="cancel"><i class="material-icons">stop</i></button>
    </form>
  </template>
</section>
`;

const CSS = `
.bbai-root{--bbai-line:var(--color-border,#363b46);--bbai-text:var(--color-text,#e5e8f0);--bbai-bg:var(--color-back,#171a20);--bbai-surface:var(--color-ui,#242832);--bbai-accent:var(--color-accent,#688df4);height:100%;min-height:240px;display:flex;flex-direction:column;overflow:hidden;background:var(--bbai-bg);color:var(--bbai-text);font-family:inherit;font-size:12px}
.bbai-root *{box-sizing:border-box}.bbai-root button,.bbai-root input,.bbai-root select,.bbai-root textarea{font:inherit}.bbai-root button{cursor:pointer}.bbai-root button:disabled{opacity:.4;cursor:not-allowed}
.bbai-root .material-icons{font-size:16px;line-height:1;vertical-align:middle}
.bbai-topbar{min-height:59px;padding:11px 15px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bbai-line)}
.bbai-identity{display:flex;align-items:center;gap:10px;min-width:0}.bbai-logomark{height:34px;width:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px solid var(--bbai-accent);border-radius:11px;color:var(--bbai-accent)}
.bbai-logomark .material-icons{font-size:20px}.bbai-brand{display:flex;flex-direction:column;gap:4px;min-width:0}.bbai-brand strong{font-size:13px}.bbai-brand span{font-size:10px;opacity:.66}
.bbai-icon-button{background:transparent;color:var(--bbai-text);border:0;width:29px;height:29px;border-radius:8px;display:flex;align-items:center;justify-content:center}
.bbai-icon-button:hover{background:var(--bbai-surface);color:var(--bbai-accent)}.bbai-tabs{height:39px;display:flex;align-items:stretch;padding:0 12px;gap:5px;border-bottom:1px solid var(--bbai-line)}
.bbai-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;padding:0 10px;color:var(--bbai-text)}
.bbai-tabs button.active{border-bottom-color:var(--bbai-accent);color:var(--bbai-accent)}.bbai-version{margin-left:auto;align-self:center;font-size:10px;opacity:.6}
.bbai-projectbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid var(--bbai-line);font-size:11px}
.bbai-project-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.8}
.bbai-history{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:80px}
.bbai-message{max-width:100%;padding:8px 10px;border-radius:10px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.bbai-message.bbai-user{background:var(--bbai-surface);align-self:flex-end}
.bbai-message.bbai-assistant{background:transparent;border:1px solid var(--bbai-line);align-self:flex-start}
.bbai-composer{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--bbai-line)}
.bbai-composer input{flex:1;background:var(--bbai-surface);border:1px solid var(--bbai-line);border-radius:9px;padding:9px 10px;color:var(--bbai-text)}
.bbai-composer button{background:var(--bbai-accent);border:0;border-radius:9px;color:#fff;padding:0 12px;display:flex;align-items:center}
.bbai-settings-view{flex:1;overflow-y:auto;padding:14px}
.bbai-section-intro{display:flex;gap:10px;align-items:center;margin-bottom:12px}
.bbai-section-intro h3{margin:0;font-size:13px}.bbai-section-intro p{margin:2px 0 0;font-size:11px;opacity:.7}
.bbai-section-icon{height:30px;width:30px;display:flex;align-items:center;justify-content:center;border:1px solid var(--bbai-accent);border-radius:9px;color:var(--bbai-accent)}
.bbai-config-card{display:flex;flex-direction:column;gap:10px}
.bbai-field{display:flex;flex-direction:column;gap:5px;font-size:11px}
.bbai-field input,.bbai-field select{background:var(--bbai-surface);border:1px solid var(--bbai-line);border-radius:9px;padding:9px 10px;color:var(--bbai-text)}
.bbai-settings-row{display:flex;gap:8px}
.bbai-primary-button{background:var(--bbai-accent);border:0;border-radius:9px;color:#fff;padding:11px;flex:1}
`;

const EXTRA_CSS = '.bbai-secondary-button{background:var(--bbai-surface);color:var(--bbai-text);border:1px solid var(--bbai-line);border-radius:9px;padding:11px;width:100%;display:flex;align-items:center;justify-content:center;gap:7px;margin-top:11px;font-size:11px}.bbai-secondary-button:hover{border-color:var(--bbai-accent)}.bbai-connection-status{font-size:11px;line-height:1.5;padding:9px 10px;margin-top:12px;border-radius:9px;background:var(--bbai-surface);border:1px solid var(--bbai-line);overflow-wrap:anywhere}.bbai-connection-status.success{border-color:#478d77;color:#6bd1a2}.bbai-connection-status.error{border-color:#96575d;color:#f4a3a8}';

const DEMO_CSS = '.bbai-quick-demo-button{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--bbai-line);border-radius:7px;padding:5px 8px;font-size:10px;background:var(--bbai-surface);color:var(--bbai-text)}.bbai-quick-demo-button:hover{border-color:var(--bbai-accent)}.bbai-quick-demo-button .material-icons{font-size:13px}.bbai-demo-picker{padding:10px 12px;display:flex;flex-wrap:wrap;align-items:center;gap:6px;border-bottom:1px solid var(--bbai-line);background:var(--bbai-bg)}.bbai-demo-picker>span{display:block;width:100%;font-size:10px;opacity:.7;margin-bottom:3px}.bbai-demo-picker>button{border:1px solid var(--bbai-line);border-radius:8px;padding:7px 9px;background:var(--bbai-surface);color:var(--bbai-text);font-size:11px}.bbai-demo-picker>button:hover{border-color:var(--bbai-accent)}';

const FORGE_CSS = '.bbai-phase{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:11px;border-bottom:1px solid var(--bbai-line)}.bbai-phase-dot{height:8px;width:8px;border-radius:50%;background:var(--bbai-accent)}.bbai-phase-retry .bbai-phase-dot{background:#e0a53c}.bbai-phase-error .bbai-phase-dot,.bbai-phase-cancelled .bbai-phase-dot{background:#e06c6c}.bbai-phase-done .bbai-phase-dot{background:#6bd1a2}.bbai-progress{height:3px;background:var(--bbai-surface)}.bbai-progress-fill{height:100%;background:var(--bbai-accent);transition:width .2s}.bbai-oplog{padding:6px 12px;border-top:1px solid var(--bbai-line);font-size:10px;opacity:.85}.bbai-op{display:flex;align-items:center;gap:5px;padding:2px 0}.bbai-op .material-icons{font-size:12px;color:#6bd1a2}.bbai-bench-picker{padding:10px 12px;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid var(--bbai-line)}.bbai-bench-picker>span{display:block;width:100%;font-size:10px;opacity:.7}.bbai-bench-picker>button{border:1px solid var(--bbai-line);border-radius:8px;padding:6px 8px;background:transparent;color:var(--bbai-text);font-size:10px}.bbai-bench-picker>button:hover{border-color:var(--bbai-accent)}.bbai-bench-all{border-color:var(--bbai-accent)!important}.bbai-welcome{padding:16px 14px;border-bottom:1px solid var(--bbai-line)}.bbai-welcome h3{margin:0 0 6px;font-size:13px}.bbai-welcome p{margin:0 0 10px;font-size:11px;opacity:.75}.bbai-welcome-demos,.bbai-suggestions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.bbai-welcome-demos button,.bbai-suggestions button{border:1px solid var(--bbai-line);border-radius:8px;padding:7px 9px;background:var(--bbai-surface);color:var(--bbai-text);font-size:11px}';

 function fullCss(){
  return CSS + '\n' + EXTRA_CSS + '\n' + DEMO_CSS + '\n' + FORGE_CSS;
}

 function makeComponent(){
  const prefs = settingsSnapshot();
  return {
    template: TEMPLATE,
    data: function () {
      return {
        provider: prefs.provider,
        cloudflareAccount: prefs.cloudflareAccount,
        endpoint: prefs.endpoint,
        model: prefs.model,
        apiKey: sessionApiKeyForView(),
        view: 'chat',
        prompt: '',
        status: '',
        busy: false,
        showSettings: false,
        showDemos: false,
        testingConnection: false,
        connectionStatus: '',
        connectionResult: '',
        messages: [],
        history: [],
        projectIdentity: null,
        steps: 0,
        phase: 'idle',
        phaseLabel: 'En espera',
        progressDone: 0,
        progressTotal: 1,
        progressPct: 0,
        oplog: [],
        benchmarks: benchmarkDefs(),
        benchBusy: false,
        benchSummary: '',
      };
    },
    computed: {
      projectLabel: function () {
        try {
          return Project && Format ? (Project.name || 'Untitled') + '\\u00b7' + (Format.id || 'model') : 'No project open';
        } catch (ignored) {
          return 'No project open';
        }
      },
    },
    methods: {
      refreshConfiguration: function () {
        const next = settingsSnapshot();
        this.provider = next.provider;
        this.cloudflareAccount = next.cloudflareAccount;
        this.endpoint = next.endpoint;
        this.model = next.model;
      },
      syncKey: function () {
        this.apiKey = sessionApiKeyForView();
      },
      openSettings: function () {
        this.refreshConfiguration();
        this.syncKey();
        this.view = 'settings';
      },
      changeProvider: function () {
        if (this.provider === 'groq') {
          this.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
          this.model = 'openai/gpt-oss-120b';
        } else if (this.provider === 'gemini') {
          this.endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
          this.model = 'gemini-3.8-flash';
        } else if (this.provider === 'cloudflare') {
          this.model = '@cf/qwen/qwen3.8-27b';
          this.updateCloudflareEndpoint();
        } else if (this.provider === 'openai') {
          this.endpoint = 'https://api.openai.com/v1/chat/completions';
          this.model = 'gpt-4.1-mini';
        }
      },
      updateCloudflareEndpoint: function () {
        if (this.provider === 'cloudflare') {
          this.endpoint = validCloudflareAccount(this.cloudflareAccount) ? cloudflareEndpoint(this.cloudflareAccount) : '';
        }
      },
      testConnection: function () {
        if (this.testingConnection || this.busy) return Promise.resolve();
        const self = this;
        self.testingConnection = true;
        self.connectionResult = '';
        self.connectionStatus = 'Comprobando autenticaci\u00f3n y compatibilidad...';
        return checkProviderConnection({
          provider: self.provider,
          cloudflareAccount: self.cloudflareAccount,
          endpoint: self.endpoint,
          model: self.model,
          apiKey: String(self.apiKey || sessionApiKeyForView() || '').trim(),
        }).then(
          function (result) {
            self.connectionResult = 'success';
            self.connectionStatus = 'Conexi\u00f3n correcta con ' + result.model + '. La compatibilidad con herramientas se comprobar\u00e1 al modelar.';
            self.testingConnection = false;
          },
          function (error) {
            self.connectionResult = 'error';
            self.connectionStatus = safeError(error.message || error, [self.apiKey]);
            self.testingConnection = false;
          }
        );
      },
      saveSettings: function () {
        try {
          storeConfigurationForView({
            provider: this.provider,
            cloudflareAccount: this.cloudflareAccount,
            endpoint: this.endpoint,
            model: this.model,
          });
          setSessionApiKey(typeof this.apiKey === 'string' ? this.apiKey.trim() : '');
          this.view = 'chat';
          Blockbench.showQuickMessage('Configuraci\u00f3n actualizada');
        } catch (error) {
          Blockbench.showQuickMessage(safeError(error.message, []));
        }
      },
      logOp: function (label) {
        this.oplog.push(label);
        if (this.oplog.length > 24) this.oplog.shift();
      },
      setPhase: function (phase, label) {
        this.phase = phase;
        this.phaseLabel = label;
      },
      noteProgress: function (done, total) {
        this.progressDone = done;
        this.progressTotal = Math.max(1, total);
        this.progressPct = Math.round((done / Math.max(1, total)) * 100);
      },
      generateLocalPropDemo: function (kind) {
        if (this.busy) return;
        try {
          activeProject();
          const titles = {
            energy_sword: 'Energy Sword \u00b7 Offline Demo',
            sci_fi_drone: 'Sci-fi Drone \u00b7 Offline Demo',
            treasure_chest: 'Treasure Chest \u00b7 Offline Demo',
            crystal_golem: 'Crystal Golem \u00b7 Offline Demo',
            mech_walker: 'Mech Walker \u00b7 Offline Demo',
          };
          const result = generatePropLocal({ name: titles[kind] || 'Prop \u00b7 Offline Demo', kind: kind }, freshBudget());
          this.logOp(friendlyOpName('generate_prop') + ' \u00b7 ' + result.created_count + ' piezas');
          this.messages.push({
            role: 'assistant',
            content:
              'Demo local creada sin API. ' +
              result.created_count +
              ' piezas editables, ' +
              result.subgroups +
              ' grupos y PNG ' +
              result.texture.pixels.join('\u00d7') +
              '. Puedes usar Ctrl+Z para deshacer.',
          });
          this.scrollBottom();
        } catch (error) {
          this.messages.push({ role: 'assistant', content: 'Error en demo: ' + safeError(error.message, []) });
          this.scrollBottom();
        }
      },
      generateLocalDemo: function () {
        if (this.busy) return;
        try {
          activeProject();
          const result = generateCharacterLocal(
            {
              name: 'Android Villager \u00b7 Offline Demo',
              style: 'android_villager',
              primary: '#627786',
              secondary: '#273944',
              accent: '#4ED2E8',
              skin: '#BA9B79',
            },
            freshBudget()
          );
          this.logOp(friendlyOpName('generate_character') + ' \u00b7 ' + result.created_count + ' piezas');
          this.messages.push({
            role: 'assistant',
            content:
              'Demo local creada sin consumir tokens ni usar una API.\n' +
              'Piezas: ' +
              result.created_count +
              ' \u00b7 textura PNG: ' +
              result.texture.name +
              ' \u00b7 grupos: ' +
              result.subgroups +
              '. Puedes inspeccionar el atlas de texturas y deshacer la generaci\u00f3n con Ctrl+Z.',
          });
          this.scrollBottom();
        } catch (error) {
          this.messages.push({ role: 'assistant', content: 'Error en demo local: ' + safeError(error.message, []) });
          this.scrollBottom();
        }
      },
      runBenchmark: function (id) {
        if (this.busy || this.benchBusy) return null;
        this.benchBusy = true;
        try {
          activeProject();
          const started = Date.now();
          const result = runBenchmarkLocal(id, freshBudget());
          const elapsed = Date.now() - started;
          this.logOp('Benchmark ' + id + ' \u00b7 ' + result.created_count + ' piezas en ' + elapsed + ' ms');
          this.messages.push({
            role: 'assistant',
            content:
              'Benchmark ' +
              id +
              ': ' +
              result.created_count +
              ' piezas, ' +
              result.subgroups +
              ' grupos, PNG ' +
              result.texture.pixels.join('\u00d7') +
              ' en ' +
              elapsed +
              ' ms. Ctrl+Z para deshacer.',
          });
          this.benchSummary = '\u00faltimo: ' + id + ' OK';
          this.scrollBottom();
          return result;
        } catch (error) {
          this.messages.push({ role: 'assistant', content: 'Benchmark ' + id + ' fall\u00f3: ' + safeError(error.message, []) });
          this.benchSummary = '\u00faltimo: ' + id + ' FALLO';
          this.scrollBottom();
          return null;
        } finally {
          this.benchBusy = false;
        }
      },
      runAllBenchmarks: function () {
        if (this.busy || this.benchBusy) return;
        this.benchBusy = true;
        try {
          activeProject();
          const defs = benchmarkDefs();
          let ok = 0;
          let pieces = 0;
          const failures = [];
          defs.forEach(function (def) {
            try {
              const result = runBenchmarkLocal(def.id, freshBudget());
              if (result.created_count < def.minParts) throw new Error('solo ' + result.created_count + ' piezas (< ' + def.minParts + ')');
              ok++;
              pieces += result.created_count;
            } catch (ignored) {
              failures.push(def.id);
            }
          });
          this.benchSummary = ok + '/' + defs.length + ' OK \u00b7 ' + pieces + ' piezas';
          this.logOp('Benchmarks FORGE: ' + this.benchSummary);
          this.messages.push({
            role: 'assistant',
            content:
              'Benchmarks FORGE: ' +
              ok +
              ' de ' +
              defs.length +
              ' correctos (' +
              pieces +
              ' piezas en total).' +
              (failures.length ? ' Fallos: ' + failures.join(', ') + '.' : ' Todo el pipeline determinista funciona sin IA.') +
              ' Usa Ctrl+Z para deshacer.',
          });
          this.scrollBottom();
        } finally {
          this.benchBusy = false;
        }
      },
      useSuggestion: function (value) {
        this.prompt = value;
      },
      example: function () {
        this.useSuggestion('Crea un robot de cubos con cabeza, torso, brazos y piernas.');
      },
      resetChat: function () {
        this.messages = [];
        this.history = [];
        this.projectIdentity = null;
      },
      scrollBottom: function () {
        const self = this;
        this.$nextTick(function () {
          const el = self.$refs.history;
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
      cancel: function () {
        abortRunning();
        this.setPhase('cancelled', 'Detenido');
        this.status = 'Stopping...';
      },
      send: function () {
        if (this.busy || !this.prompt.trim()) return Promise.resolve();
        const self = this;
        const text = this.prompt.trim().slice(0, 4000);
        this.prompt = '';
        const current = typeof Project !== 'undefined' ? Project : null;
        if (this.projectIdentity && this.projectIdentity !== current) this.resetChat();
        this.projectIdentity = current;
        const past = this.history.slice();
        const config = settingsSnapshot();
        this.messages.push({ role: 'user', content: text });
        const demo = offlineDemoIntent(text);
        if (demo) {
          this.showDemos = false;
          if (demo === 'android_villager') this.generateLocalDemo();
          else this.generateLocalPropDemo(demo);
          return Promise.resolve();
        }
        this.busy = true;
        this.setPhase('working', 'Trabajando');
        this.noteProgress(0, MAX_ROUNDS);
        this.status = 'Preparing...';
        const controller = startRunning();
        this.scrollBottom();
        return performForge(
          text,
          { endpoint: config.endpoint, model: config.model, apiKey: sessionApiKeyForView() || this.apiKey, history: past },
          function (event) {
            self.status = event.text;
            self.noteProgress(event.round, MAX_ROUNDS);
            if (event.kind === 'retry') self.setPhase('retry', 'Esperando cuota');
            else if (event.kind === 'tool') {
              const painting = event.text.indexOf('pint') !== -1 || event.text.indexOf('Paint') !== -1;
              self.setPhase(painting ? 'painting' : 'working', painting ? 'Pintando' : 'Trabajando');
              self.logOp(event.text);
            } else if (event.kind === 'plan') self.setPhase('working', 'Planificando');
            self.scrollBottom();
          },
          controller.signal
        ).then(
          function (answer) {
            self.messages.push({ role: 'assistant', content: answer });
            self.history = past.concat([{ role: 'user', content: text }, { role: 'assistant', content: answer }]).slice(-12);
            self.setPhase('done', 'Completado');
            self.noteProgress(MAX_ROUNDS, MAX_ROUNDS);
            self.busy = false;
            self.status = '';
            self.scrollBottom();
          },
          function (error) {
            const cancelled = controller.signal.aborted;
            self.messages.push({
              role: 'assistant',
              content:
                'Error: ' +
                (cancelled ? 'Canceled. Any completed edits can be undone in Blockbench.' : safeError(error.message, [self.apiKey])),
            });
            self.setPhase(cancelled ? 'cancelled' : 'error', cancelled ? 'Detenido' : 'Error');
            self.busy = false;
            self.status = '';
            self.scrollBottom();
          }
        );
      },
    },
  };
}

// ---- src/main.ts ----
// BlockBenchAI FORGE — main: tool assembly, generators, agent loop, plugin.
//
// Wires every module into the single installable closure: legacy tool
// contracts (frozen for compatibility), FORGE geometry/texture tools, the
// compact protocol, deterministic character/prop generators, the planning
// loop with budgets and stale-edit protection, native preferences, and the
// Blockbench plugin registration.











// ---------------------------------------------------------------------------
// Plugin session state (in-memory only; never persisted to disk).
// ---------------------------------------------------------------------------

const ID = 'blockbench_ai';
let panel = null;
let action = null;
let style = null;
let runningController = null;
const registeredSettings = {};
let sessionApiKey = '';

// Late-bound accessors used by ui.ts (same closure, resolved at call time).
 function sessionApiKeyForView(){
  return sessionApiKey;
}
 function setSessionApiKey(value){
  sessionApiKey = value;
}
 function startRunning(){
  runningController = new AbortController();
  return runningController;
}
 function abortRunning(){
  if (runningController) runningController.abort();
}
 function freshBudget(){
  return { project: activeProject(), remainingCubes: MAX_CUBES_PER_RUN, toolCalls: 0 };
}

// ---------------------------------------------------------------------------
// Scene reading + integrity.
// ---------------------------------------------------------------------------

 function readScene(options){
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

 function sceneRevisionSignature(){
  let hash = 2166136261;
  const add = function (value){
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
    Texture.all.forEach(function (t) {
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

const vectorSchema = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const cubeSchema = {
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
const editSchema = {
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

 function generateCharacterOp(args, budget){
  const name = safeName(args.name);
  const style = args.style || 'android_villager';
  if (CHARACTER_STYLES.indexOf(style) === -1) fail('Unknown character style.');
  const fallback = defaultPalette(style);
  const get = function (value, color){
    if (value === undefined || value === null || value === '') return color;
    rgb(value, 'character color');
    return value ;
  };
  const palette = {
    primary: get(args.primary, fallback.primary),
    secondary: get(args.secondary, fallback.secondary),
    accent: get(args.accent, fallback.accent),
    skin: get(args.skin, fallback.skin),
  };
  return buildPaintedModelOp({ name: name, parts: humanoidParts(style, palette) }, budget);
}

 function generateCharacterLocal(args, budget){
  return generateCharacterOp(args, budget);
}

 function generatePropOp(args, budget){
  if (!args || PROP_KINDS.indexOf(args.kind) === -1) fail('Unsupported prop type.');
  const title = safeName(args.name);
  const fallback = propPalette(args.kind);
  const get = function (value, color){
    if (value === undefined || value === null || value === '') return color;
    rgb(value, 'prop palette');
    return value ;
  };
  const palette = {
    primary: get(args.primary, fallback.primary),
    secondary: get(args.secondary, fallback.secondary),
    accent: get(args.accent, fallback.accent),
    skin: fallback.skin,
  };
  return buildPaintedModelOp({ name: title, parts: propParts(args.kind, palette) }, budget);
}

 function generatePropLocal(args, budget){
  return generatePropOp(args, budget);
}

 function runBenchmarkLocal(id, budget){
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

const COMPACT_MATERIALS = {
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

 function composeModelOp(args, budget){
  if (!args || !Array.isArray(args.parts) || args.parts.length === 0 || args.parts.length > MAX_PAINTED_PARTS) {
    fail('compose_model requires 1-96 parts.');
  }
  const input = args.palette || {};
  const toHex = function (triplet){
    return colorCode(triplet[0], triplet[1], triplet[2]);
  };
  const palette = {
    primary: rgb(input.primary || '#647889', 'primary'),
    secondary: rgb(input.secondary || '#344455', 'secondary'),
    accent: rgb(input.accent || '#50D6DE', 'accent'),
    skin: rgb(input.skin || '#BA9E7E', 'skin'),
    metal: rgb('#B1BFCA', 'metal'),
    wood: rgb('#78513A', 'wood'),
    dark: rgb('#1E2632', 'dark'),
    gold: rgb('#D5AF60', 'gold'),
  };
  const parts = args.parts.map(function (p, idx) {
    let fields;
    if (typeof p === 'string') {
      const split = (p ).split('|');
      if (split.length !== 5) fail('Part ' + (idx + 1) + ' must be name|from|to|material|palette');
      const from = split[1].split(',').map(Number);
      const to = split[2].split(',').map(Number);
      if (from.length !== 3 || to.length !== 3) fail('Part ' + (idx + 1) + ' has invalid coordinates.');
      fields = [split[0], from[0], from[1], from[2], to[0], to[1], to[2], split[3], split[4]];
    } else {
      fields = p ;
    }
    if (!Array.isArray(fields) || fields.length !== 9) fail('Part ' + (idx + 1) + ' needs exactly 9 fields.');
    const material = COMPACT_MATERIALS[String(fields[7]).toLowerCase()];
    if (!material) fail('Unknown material on part ' + (idx + 1));
    const slot = String(fields[8] || 'primary').toLowerCase();
    if (!palette[slot]) fail('Unknown palette slot on part ' + (idx + 1));
    return {
      name: safeName(fields[0]),
      from: (fields ).slice(1, 4),
      to: (fields ).slice(4, 7),
      paint: { base: toHex(palette[slot]), material: material, accent: toHex(palette.accent), noise: 0.085 },
    };
  });
  return buildPaintedModelOp({ name: args.name || 'AI Model', parts: parts }, budget);
}

// ---------------------------------------------------------------------------
// Tool registry + dispatch.
// ---------------------------------------------------------------------------

const COMPACT_TOOL = defineTool(
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

const PROP_TOOL = defineTool(
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

const TOOLS = [
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

 function runTool(name, args, budget){
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
    return extrudeProfileOp(args || {}, budget, function (cubes, title) {
      paintCubesNeutral(cubes, title, budget);
    });
  }
  fail('Unknown tool: ' + name);
}

 function systemPrompt(){
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

 function performForge(
  prompt,
  config,
  onEvent,
  signal){
  return new Promise(function (resolve, reject) {
    let project;
    let endpoint;
    let model;
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
    const rounds = [];
    let round = 0;
    const emit = function (kind, text){
      try {
        onEvent({ kind: kind, text: text, round: round });
      } catch (ignored) {
        // progress reporting must never break modeling
      }
    };
    const step = function (){
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
      const messages = [
        { role: 'system', content: systemPrompt() },
        { role: 'system', content: 'Project: ' + JSON.stringify(compactSceneSnapshot(context, round === 0)) },
      ];
      history.forEach(function (m) {
        messages.push(m);
      });
      messages.push({ role: 'user', content: prompt });
      rounds.slice(-1).forEach(function (exchange) {
        (exchange ).forEach(function (item) {
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
        function (notice) {
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
          const exchange = [{ role: 'assistant', content: reply.content || null, tool_calls: calls }];
          let chain = Promise.resolve();
          calls.forEach(function (call) {
            chain = chain.then(function () {
              if (signal.aborted || Project !== project) throw new Error('Solicitud cancelada o el proyecto ha cambiado.');
              const name = (call.function && call.function.name) || 'unknown';
              emit('tool', 'Ejecutando ' + name + '…');
              budget.toolCalls++;
              let result;
              try {
                const parsed = JSON.parse((call.function && call.function.arguments) || '{}');
                result = { ok: true, data: runTool(name, parsed, budget) };
                if (name !== 'inspect_scene') emit('tool', 'Aplicado: ' + friendlyOpName(name));
              } catch (error) {
                result = { ok: false, error: safeError((error ).message, [config.apiKey]) };
              }
              const output = JSON.stringify(result);
              const wasOk = (result ).ok;
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

 function preferences(){
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

 function savePreferences(endpoint, model){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ endpoint: endpoint, model: model }));
  } catch (ignored) {
    // private mode: session-only settings still work
  }
}

 function settingsSnapshot(){
  const fallback = preferences();
  return {
    provider: registeredSettings.provider ? String(registeredSettings.provider.value) : 'groq',
    cloudflareAccount: registeredSettings.cloudflareAccount ? String(registeredSettings.cloudflareAccount.value || '') : '',
    endpoint: registeredSettings.endpoint ? String(registeredSettings.endpoint.value) : fallback.endpoint,
    model: registeredSettings.model ? String(registeredSettings.model.value) : fallback.model,
  };
}

 function updatePanelSettings(){
  if (!panel) return;
  const vm = panel.inside_vue || panel.vue;
  if (vm && typeof vm.refreshConfiguration === 'function') vm.refreshConfiguration();
}

 function storeConfigurationForView(next){
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

 function openKeyDialog(){
  new Dialog('bbai_key_dialog', {
    title: 'Blockbench AI · API key',
    icon: 'key',
    width: 470,
    form: {
      info: { type: 'info', text: 'La clave se conserva solo durante esta sesión y no se guardará en las preferencias de Blockbench.' },
      key: { type: 'password', label: 'API key', value: sessionApiKey, placeholder: 'gsk_... / sk-...' },
    },
    onConfirm: function (values) {
      sessionApiKey = typeof values.key === 'string' ? values.key.trim() : '';
      const vm = panel && (panel.inside_vue || panel.vue);
      if (vm && typeof vm.syncKey === 'function') vm.syncKey();
      Blockbench.showQuickMessage(sessionApiKey ? 'Clave configurada para esta sesión' : 'Clave de sesión eliminada');
    },
  }).show();
}

 function registerPreferences(){
  const old = preferences();
  registeredSettings.provider = new Setting('bbai_provider', {
    plugin: ID,
    name: 'Proveedor',
    type: 'select',
    description: 'Servicio de IA. Groq tiene un plan gratuito sujeto a límites.',
    value: 'groq',
    options: { groq: 'Groq', gemini: 'Google Gemini', cloudflare: 'Cloudflare Workers AI (Qwen)', openai: 'OpenAI', custom: 'Personalizado' },
    onChange: function (value) {
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
    onChange: function (value) {
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

 function unregisterPreferences(){
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

})();
