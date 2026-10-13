/* Blockbench AI 0.5.0 — MIT License, github.com/jonathanthxd/BlockBenchAI */
(function () {
  'use strict';

  const ID = 'blockbench_ai';
  const VERSION = '0.5.0';
  const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const STORAGE_KEY = 'blockbench_ai_preferences_v1';
  const MAX_CUBES_PER_CALL = 32;
  const MAX_PAINTED_PARTS = 96;
  const FACE_NAMES = ['north', 'south', 'east', 'west', 'up', 'down'];
  const MAX_CUBES_PER_RUN = 192;
  const MAX_TOOL_CALLS = 36;
  const MAX_ROUNDS = 12;
  let panel = null;
  let action = null;
  let style = null;
  let runningController = null;
  const registeredSettings = {};
  let sessionApiKey = '';
  const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const CLOUDFLARE_MODEL = '@cf/qwen/qwen3.8-27b';

  const vectorSchema = {type: 'array', items: {type: 'number'}, minItems: 3, maxItems: 3};
  const cubeSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: {type: 'string'},
      from: vectorSchema,
      to: vectorSchema,
      origin: vectorSchema,
      rotation: vectorSchema,
      group: {type: 'string', description: 'Group UUID or exact group name, optional'},
      color: {type: 'integer', minimum: 0, maximum: 7, description: 'Blockbench viewport palette index, not a painted texture'}
    },
    required: ['name', 'from', 'to']
  };
  const editSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      uuid: {type: 'string'},
      name: {type: 'string'},
      from: vectorSchema,
      to: vectorSchema,
      origin: vectorSchema,
      rotation: vectorSchema,
      color: {type: 'integer', minimum: 0, maximum: 7}
    },
    required: ['uuid']
  };


  const hexSchema = {type: 'string', description: 'Hex RGB color such as #638DB4'};
  const faceMarkSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      face: {type: 'string', enum: FACE_NAMES},
      shape: {type: 'string', enum: ['pixel', 'rect', 'line']},
      x: {type: 'integer', minimum: 0, maximum: 15},
      y: {type: 'integer', minimum: 0, maximum: 15},
      width: {type: 'integer', minimum: 1, maximum: 16},
      height: {type: 'integer', minimum: 1, maximum: 16},
      x2: {type: 'integer', minimum: 0, maximum: 15},
      y2: {type: 'integer', minimum: 0, maximum: 15},
      color: hexSchema
    }, required: ['face', 'shape', 'x', 'y', 'color']
  };
  const paintSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      base: hexSchema,
      accent: hexSchema,
      material: {type: 'string', enum: ['metal', 'wood', 'fabric', 'stone', 'skin', 'circuit', 'gem', 'plain']},
      noise: {type: 'number', minimum: 0, maximum: 0.5},
      marks: {type: 'array', maxItems: 24, items: faceMarkSchema}
    }, required: ['base']
  };
  const paintedPartSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      name: {type: 'string'}, from: vectorSchema, to: vectorSchema,
      group: {type: 'string', description: 'Existing group UUID or name. Omit to use the generated root.'},
      paint: paintSchema
    }, required: ['name', 'from', 'to', 'paint']
  };

  function tool(name, description, properties, required) {
    return {type: 'function', function: {name: name, description: description,
      parameters: {type: 'object', additionalProperties: false, properties: properties, required: required || []}}};
  }
  const TOOLS = [
    tool('inspect_scene', 'Read model cubes, groups, format and selection. Does not change the project.', {
      query: {type: 'string', description: 'Optional case-insensitive name filter'},
      selected_only: {type: 'boolean'},
      limit: {type: 'integer', minimum: 1, maximum: 120}
    }),
    tool('create_group', 'Create one native Blockbench outliner group.', {
      name: {type: 'string'}, parent: {type: 'string', description: 'Optional parent group UUID or exact name'}
    }, ['name']),
    tool('create_cubes', 'Create up to 32 axis-aligned native Blockbench cubes in one undoable action. Coordinate units are Blockbench model units.', {
      cubes: {type: 'array', minItems: 1, maxItems: MAX_CUBES_PER_CALL, items: cubeSchema}
    }, ['cubes']),
    tool('edit_cubes', 'Edit existing cubes by UUID. Supply only properties to change; never invent UUIDs.', {
      cubes: {type: 'array', minItems: 1, maxItems: MAX_CUBES_PER_CALL, items: editSchema}
    }, ['cubes']),
    tool('build_painted_model', 'PREFERRED for detailed objects, machines, armor and props: create up to 96 named cubes, a REAL PNG texture atlas, shaded materials and painted features. Use smaller distinct parts for fine geometry. All color values are hex RGB; viewport color indices are not textures.', {
      name: {type: 'string', description: 'Name of the model root group and generated texture'},
      parts: {type: 'array', minItems: 1, maxItems: MAX_PAINTED_PARTS, items: paintedPartSchema}
    }, ['name','parts']),
    tool('paint_existing_cubes', 'Paint actual texture pixels on existing cube UUIDs, preserving all geometry. Creates an internal textured atlas and assigns per-face UVs. Best for adding shading, surface patterns, eyes, or circuit details.', {
      parts: {type: 'array', minItems: 1, maxItems: MAX_CUBES_PER_CALL, items: {
        type: 'object', additionalProperties: false, properties: {uuid: {type: 'string'}, paint: paintSchema},
        required: ['uuid','paint']
      }}
    }, ['parts']),
    tool('generate_character', 'Generate a visually detailed textured humanoid automatically: articulated armor plates, segments, fingers, boots, face pixels, mechanical accents and a real PNG atlas. Ideal for an android villager, robot or fantasy humanoid. Prefer over basic cuboid scaffolds.', {
      name: {type: 'string'},
      style: {type: 'string', enum: ['android_villager','robot','villager','knight']},
      primary: hexSchema, secondary: hexSchema, accent: hexSchema,
      skin: hexSchema
    }, ['name','style'])
  ];

  function fail(message) { throw new Error(message); }
  function safeName(value) {
    if (typeof value !== 'string' || !value.trim()) fail('A nonempty name is required.');
    return value.trim().slice(0, 72);
  }
  function vec(value, label) {
    if (!Array.isArray(value) || value.length !== 3 ||
      !value.every(function (n) {return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 512;})) {
      fail(label + ' must contain exactly 3 finite numbers between -512 and 512.');
    }
    return value.slice();
  }
  function checkedColor(n) {
    if (!Number.isInteger(n) || n < 0 || n > 7) fail('Palette color must be an integer from 0 to 7.');
    return n;
  }
  function coordinates(obj, existing) {
    const from = obj.from !== undefined ? vec(obj.from, 'from') : existing && existing.from.slice();
    const to = obj.to !== undefined ? vec(obj.to, 'to') : existing && existing.to.slice();
    if (!from || !to || from.some(function (v, i) {return !(to[i] > v) || to[i] - v > 256;})) {
      fail('Cube size must be positive on every axis and at most 256 units.');
    }
    return {from: from, to: to};
  }
  function activeProject() {
    if (typeof Project === 'undefined' || !Project || typeof Format === 'undefined' || !Format) {
      fail('Open or create a Blockbench project first.');
    }
    return Project;
  }
  function allowCubes() {
    activeProject();
    if (Format.cubes === false || (typeof Cube !== 'undefined' && Cube.isTypePermitted && !Cube.isTypePermitted())) {
      fail('The active format does not permit native cubes.');
    }
  }
  function cubes() {return typeof Cube === 'undefined' ? [] : (Cube.all || []);}
  function groups() {return typeof Group === 'undefined' ? [] : (Group.all || []);}
  function findCube(uuid) {
    const result = cubes().find(function (c) {return c.uuid === uuid;});
    if (!result) fail('Cube UUID not found: ' + String(uuid).slice(0, 80));
    if (result.locked) fail('Cube is locked: ' + result.name);
    return result;
  }
  function resolveGroup(value) {
    if (!value) return 'root';
    const matches = groups().filter(function (g) {return g.uuid === value || g.name === value;});
    if (matches.length === 0) fail('Unknown group: ' + String(value).slice(0, 80));
    if (matches.length > 1) fail('Ambiguous group name. Use the group UUID.');
    if (matches[0].locked) fail('The group is locked.');
    return matches[0];
  }
  function scene(options) {
    activeProject();
    options = options || {};
    const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(120, options.limit)) : 60;
    const search = typeof options.query === 'string' ? options.query.toLowerCase().slice(0, 80) : '';
    const matching = cubes().filter(function (c) {
      return (!options.selected_only || c.selected) && (!search || c.name.toLowerCase().includes(search));
    });
    const selected = cubes().filter(function (c) {return c.selected;}).slice(0, 16);
    const shortlist = selected.concat(matching.filter(function (c) {return !selected.includes(c);}));
    return {
      project: {name: Project.name || '', format: Format.id || 'unknown',
        capabilities: {cubes: Format.cubes !== false, meshes: !!Format.meshes, bone_rig: !!Format.bone_rig,
          animation_mode: !!Format.animation_mode}},
      totals: {cubes: cubes().length, groups: groups().length, selected_cubes: selected.length},
      groups: groups().slice(0, 35).map(function (g) {
        return {uuid: g.uuid, name: g.name, parent_uuid: g.parent && g.parent.uuid || null};
      }),
      cubes: shortlist.slice(0, limit).map(function (c) {
        return {uuid: c.uuid, name: c.name, from: c.from.slice(), to: c.to.slice(),
          origin: c.origin && c.origin.slice(), rotation: c.rotation && c.rotation.slice(),
          color: c.color, selected: !!c.selected, parent_uuid: c.parent && c.parent.uuid || null};
      }),
      truncated: matching.length > limit
    };
  }
  function redraw(elements) {
    if (typeof Canvas === 'undefined') return;
    if (Canvas.updateView) Canvas.updateView({elements: elements || [], element_aspects: {geometry: true, faces: true, uv: true}, selection: true});
    else if (Canvas.updateAll) Canvas.updateAll();
  }
  function rollback() {
    if (typeof Undo !== 'undefined' && typeof Undo.cancelEdit === 'function') Undo.cancelEdit();
  }
  function createGroup(args) {
    allowCubes();
    const name = safeName(args && args.name);
    const parent = resolveGroup(args.parent);
    Undo.initEdit({outliner: true});
    let created;
    try {
      created = new Group({name: name}).init().addTo(parent);
      Undo.finishEdit('AI: Create group', {outliner: true});
    } catch (error) {
      if (created && created.remove) created.remove();
      rollback();
      throw error;
    }
    redraw([]);
    return {created_group: {uuid: created.uuid, name: created.name}};
  }
  function validatedCube(item) {
    if (!item || typeof item !== 'object') fail('Invalid cube data.');
    const coords = coordinates(item);
    const result = {name: safeName(item.name), from: coords.from, to: coords.to,
      group: resolveGroup(item.group)};
    if (item.origin !== undefined) result.origin = vec(item.origin, 'origin');
    if (item.rotation !== undefined) {
      const r = vec(item.rotation, 'rotation');
      if (r.some(function (a) {return a !== 0;})) fail('Rotation is not supported by this first tool version. Use axis-aligned cubes.');
      result.rotation = r;
    }
    if (item.color !== undefined) result.color = checkedColor(item.color);
    return result;
  }
  function createCubes(args, budget) {
    allowCubes();
    if (!Array.isArray(args && args.cubes) || !args.cubes.length || args.cubes.length > MAX_CUBES_PER_CALL) {
      fail('create_cubes requires between 1 and ' + MAX_CUBES_PER_CALL + ' cubes.');
    }
    if (args.cubes.length > budget.remainingCubes) fail('Creation limit reached for this request.');
    const planned = args.cubes.map(validatedCube);
    const created = [];
    Undo.initEdit({elements: [], outliner: true});
    try {
      planned.forEach(function (spec) {
        const cubeOptions = {name: spec.name, from: spec.from, to: spec.to};
        if (spec.origin) cubeOptions.origin = spec.origin;
        if (spec.rotation) cubeOptions.rotation = spec.rotation;
        if (spec.color !== undefined) cubeOptions.color = spec.color;
        const cube = new Cube(cubeOptions).init().addTo(spec.group);
        created.push(cube);
      });
      Undo.finishEdit('AI: Create ' + created.length + ' cubes', {elements: created, outliner: true});
    } catch (error) {
      created.forEach(function (c) {try {c.remove();} catch (_) {}});
      rollback();
      throw error;
    }
    budget.remainingCubes -= created.length;
    redraw(created);
    return {created: created.map(function (c) {return {uuid: c.uuid, name: c.name};}), remaining_cubes: budget.remainingCubes};
  }
  function validateEdit(item) {
    if (!item || typeof item.uuid !== 'string') fail('Each edit needs a cube UUID.');
    const c = findCube(item.uuid);
    const allowed = ['uuid', 'name', 'from', 'to', 'origin', 'rotation', 'color'];
    if (Object.keys(item).some(function (key) {return !allowed.includes(key);})) fail('Unsupported edit property.');
    if (Object.keys(item).length < 2) fail('Edit is empty.');
    const changes = {};
    if (item.name !== undefined) changes.name = safeName(item.name);
    if (item.from !== undefined || item.to !== undefined) {
      const coords = coordinates(item, c);
      changes.from = coords.from;
      changes.to = coords.to;
    }
    if (item.origin !== undefined) changes.origin = vec(item.origin, 'origin');
    if (item.rotation !== undefined) {
      const r = vec(item.rotation, 'rotation');
      if (r.some(function (v) {return v !== 0;})) fail('Rotation edits are not supported yet.');
      changes.rotation = r;
    }
    if (item.color !== undefined) changes.color = checkedColor(item.color);
    return {cube: c, changes: changes};
  }
  function editCubes(args) {
    allowCubes();
    if (!Array.isArray(args && args.cubes) || !args.cubes.length || args.cubes.length > MAX_CUBES_PER_CALL) {
      fail('edit_cubes requires 1 to ' + MAX_CUBES_PER_CALL + ' cube edits.');
    }
    const planned = args.cubes.map(validateEdit);
    if (new Set(planned.map(function (p) {return p.cube.uuid;})).size !== planned.length) fail('Duplicate UUID in same edit.');
    const originals = planned.map(function (p) {return {cube: p.cube, name: p.cube.name, from: p.cube.from.slice(),
      to: p.cube.to.slice(), origin: p.cube.origin.slice(), rotation: p.cube.rotation.slice(), color: p.cube.color};});
    Undo.initEdit({elements: planned.map(function (p) {return p.cube;})});
    try {
      planned.forEach(function (p) {
        Object.keys(p.changes).forEach(function (key) {
          const value = p.changes[key];
          p.cube[key] = Array.isArray(value) ? value.slice() : value;
        });
      });
      Undo.finishEdit('AI: Edit ' + planned.length + ' cubes');
    } catch (error) {
      originals.forEach(function (o) {
        ['name', 'from', 'to', 'origin', 'rotation', 'color'].forEach(function (key) {o.cube[key] = o[key];});
      });
      rollback();
      throw error;
    }
    redraw(planned.map(function (p) {return p.cube;}));
    return {edited: planned.map(function (p) {return {uuid: p.cube.uuid, name: p.cube.name};})};
  }

  // Pixel painter: real PNG pixels, not Blockbench's non-exported viewport palette colors.
  // Every face receives a unique 16x16 tile, so eyes/patterns never bleed into adjacent faces.
  function rgb(value, label) {
    if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) fail(label + ' must be a #RRGGBB color.');
    return [1,3,5].map(function (i) {return parseInt(value.slice(i,i+2),16);});
  }
  function colorCode(r, g, b) {
    return '#' + [r,g,b].map(function (v) {return Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');}).join('');
  }
  function adjustColor(base, delta) {
    return colorCode(base[0]+delta,base[1]+delta,base[2]+delta);
  }
  function validatePaint(paint) {
    if (!paint || typeof paint !== 'object') fail('Each part requires a paint specification.');
    const out = {
      base: rgb(paint.base,'base'), accent: paint.accent ? rgb(paint.accent,'accent') : null,
      material: paint.material || 'plain',
      noise: paint.noise === undefined ? 0.09 : paint.noise,
      marks: []
    };
    if (!['metal','wood','fabric','stone','skin','circuit','gem','plain'].includes(out.material)) fail('Unsupported material');
    if (typeof out.noise !== 'number' || out.noise < 0 || out.noise > 0.5 || !Number.isFinite(out.noise)) fail('Noise must be between 0 and 0.5');
    if (paint.marks !== undefined && (!Array.isArray(paint.marks) || paint.marks.length > 24)) fail('At most 24 paint marks per part.');
    (paint.marks || []).forEach(function (m) {
      if (!m || !FACE_NAMES.includes(m.face) || !['pixel','rect','line'].includes(m.shape)) fail('Invalid face mark.');
      const outMark = {face: m.face, shape: m.shape, x: m.x, y: m.y, color: colorCode.apply(null,rgb(m.color,'mark color'))};
      if (![m.x,m.y].every(function (n) {return Number.isInteger(n) && n >= 0 && n <= 15;})) fail('Mark X and Y must be from 0 to 15.');
      if (m.shape === 'rect') {
        outMark.width = m.width === undefined ? 1 : m.width;
        outMark.height = m.height === undefined ? 1 : m.height;
        if (![outMark.width,outMark.height].every(function (n) {return Number.isInteger(n) && n >= 1 && n <= 16;})) fail('Invalid rectangle size.');
      }
      if (m.shape === 'line') {
        if (![m.x2,m.y2].every(function (n) {return Number.isInteger(n) && n >= 0 && n <= 15;})) fail('Line needs x2, y2 between 0 and 15.');
        outMark.x2=m.x2;outMark.y2=m.y2;
      }
      out.marks.push(outMark);
    });
    return out;
  }
  function paintCapability() {
    allowCubes();
    if (typeof Texture === 'undefined' || !Texture || !Texture.prototype || typeof Texture.prototype.fromDataURL !== 'function') {
      fail('This Blockbench version does not expose internal PNG textures.');
    }
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') fail('Canvas pixel painting is not available.');
    if (Format.textures === false) fail('The active format does not support textures.');
    if (Format.single_texture && Texture.all && Texture.all.length) {
      fail('The active format supports only one texture and already has one. Painting a separate atlas could invalidate existing UVs. Use an empty Generic Model for this tool.');
    }
  }
  function seededColor(seed, noise) {
    const v = Math.sin(seed * 64.217 + 18.711) * 43758.5453;
    return (v-Math.floor(v)-0.5)*2*noise*65;
  }
  function drawLine(ctx, x1, y1, x2, y2) {
    let dx=Math.abs(x2-x1),dy=Math.abs(y2-y1),sx=x1<x2?1:-1,sy=y1<y2?1:-1,err=dx-dy;
    while(true){ctx.fillRect(x1,y1,1,1);if(x1===x2&&y1===y2)break;const e=2*err;if(e>-dy){err-=dy;x1+=sx;}if(e<dx){err+=dx;y1+=sy;}}
  }
  function drawFace(ctx, ox, oy, paint, direction, index) {
    const shifts={north:0,south:-12,east:-15,west:-8,up:16,down:-23};
    const light=shifts[direction];
    ctx.fillStyle=adjustColor(paint.base,light);
    ctx.fillRect(ox,oy,16,16);
    if (paint.noise) {
      for(let y=0;y<16;y++)for(let x=0;x<16;x++) {
        const seed=(index+1)*823+(y+2)*79+(x+5)*31;
        const random=Math.sin(seed*14.156)*45673.824;
        const fract=random-Math.floor(random);
        if(fract<Math.min(0.35,paint.noise*1.1)){
          ctx.fillStyle=adjustColor(paint.base,light+seededColor(seed,paint.noise)*2);
          ctx.fillRect(ox+x,oy+y,1,1);
        }
      }
    }
    const dark=adjustColor(paint.base,light-32), bright=adjustColor(paint.base,light+34);
    const accent=paint.accent?colorCode.apply(null,paint.accent):bright;
    switch (paint.material) {
      case 'metal':
        ctx.fillStyle=bright;ctx.fillRect(ox+1,oy+1,14,1);ctx.fillRect(ox+1,oy+2,1,12);
        ctx.fillStyle=dark;ctx.fillRect(ox+1,oy+14,14,1);ctx.fillRect(ox+14,oy+2,1,12);
        ctx.fillRect(ox+2,oy+3,1,1);ctx.fillRect(ox+13,oy+12,1,1);
        break;
      case 'wood':
        ctx.fillStyle=dark;for(let a=3;a<16;a+=5){ctx.fillRect(ox+a,oy+1,1,10);ctx.fillRect(ox+a+1,oy+9,1,6);}
        ctx.fillStyle=bright;ctx.fillRect(ox+1,oy+4,1,9);
        break;
      case 'fabric':
        ctx.fillStyle=dark;for(let a=0;a<16;a+=4)ctx.fillRect(ox,oy+a,16,1);
        ctx.fillStyle=bright;ctx.fillRect(ox,oy,16,1);
        break;
      case 'stone':
        ctx.fillStyle=dark;ctx.fillRect(ox+2,oy+4,7,1);ctx.fillRect(ox+9,oy+4,1,5);ctx.fillRect(ox+6,oy+10,9,1);
        break;
      case 'skin':
        ctx.fillStyle=bright;ctx.fillRect(ox+2,oy+2,12,1);
        ctx.fillStyle=dark;ctx.fillRect(ox+3,oy+13,10,1);
        break;
      case 'circuit':
        ctx.fillStyle=dark;ctx.fillRect(ox+1,oy+1,14,14);
        ctx.fillStyle=accent;
        ctx.fillRect(ox+7,oy+3,2,10);ctx.fillRect(ox+3,oy+7,10,2);
        for(const [x,y] of [[3,3],[12,3],[3,12],[12,12]])ctx.fillRect(ox+x,oy+y,2,2);
        break;
      case 'gem':
        ctx.fillStyle=bright;ctx.fillRect(ox+3,oy+3,7,3);
        ctx.fillStyle=dark;ctx.fillRect(ox+9,oy+8,5,5);
        break;
      default: break;
    }
    paint.marks.filter(function(m){return m.face===direction;}).forEach(function(m){
      ctx.fillStyle=m.color;
      if(m.shape==='pixel')ctx.fillRect(ox+m.x,oy+m.y,1,1);
      else if(m.shape==='rect')ctx.fillRect(ox+m.x,oy+m.y,Math.min(16-m.x,m.width),Math.min(16-m.y,m.height));
      else drawLine(ctx,ox+m.x,oy+m.y,ox+m.x2,oy+m.y2);
    });
  }
  function buildAtlas(paints, label) {
    paintCapability();
    const columns=paints.length>40?32:16, width=columns*16;
    const rows=Math.ceil(paints.length*6/columns);
    const height=Math.pow(2,Math.ceil(Math.log2(Math.max(16,rows*16))));
    if (height>1024) fail('The painted model exceeds the safe atlas size.');
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(!ctx)fail('Could not initialize a 2D canvas.');
    ctx.imageSmoothingEnabled=false;
    paints.forEach(function(paint,i){
      FACE_NAMES.forEach(function(face,j){
        const slot=i*6+j,px=(slot%columns)*16,py=Math.floor(slot/columns)*16;
        drawFace(ctx,px,py,paint,face,i);
      });
    });
    const data=canvas.toDataURL('image/png');
    if(!data.startsWith('data:image/png;base64,'))fail('Unable to encode the texture atlas as PNG.');
    const texture=new Texture({name:'AI_'+safeName(label).replace(/[^a-z0-9_-]/gi,'_')+'.png',width:width,height:height});
    texture.fromDataURL(data);
    texture.uv_width=width;
    texture.uv_height=height;
    return {texture:texture,width:width,height:height,columns:columns,paints:paints};
  }
  function mapCubeToAtlas(cube,atlas,index) {
    if(typeof cube.setUVMode==='function')cube.setUVMode(false);
    else cube.box_uv=false;
    cube.autouv=0;
    const uSize=(typeof atlas.texture.getUVWidth==='function' && atlas.texture.getUVWidth())||Project.texture_width||16;
    const vSize=(typeof atlas.texture.getUVHeight==='function' && atlas.texture.getUVHeight())||Project.texture_height||16;
    FACE_NAMES.forEach(function(faceName,j){
      const face=cube.faces&&cube.faces[faceName];if(!face)fail('Cube face '+faceName+' is not available.');
      const slot=index*6+j, px=(slot%atlas.columns)*16,py=Math.floor(slot/atlas.columns)*16;
      face.texture=atlas.texture.uuid;
      face.uv=[px/atlas.width*uSize,py/atlas.height*vSize,(px+16)/atlas.width*uSize,(py+16)/atlas.height*vSize];
    });
  }
  function buildPaintedModel(args,budget) {
    paintCapability();
    if (!Array.isArray(args.parts)||!args.parts.length||args.parts.length>MAX_PAINTED_PARTS) fail('Painted model requires 1 to 96 parts.');
    if (args.parts.length>budget.remainingCubes) fail('Not enough geometry budget for this request.');
    const title=safeName(args.name);
    const planned=args.parts.map(function(part){
      if(!part||typeof part!=='object')fail('Invalid painted model part.');
      const coords=coordinates(part);
      return {name:safeName(part.name),from:coords.from,to:coords.to,paint:validatePaint(part.paint),
        group:part.group?resolveGroup(part.group):null};
    });
    const atlas=buildAtlas(planned.map(function(part){return part.paint;}),title);
    const created=[], rootName=title, subgroups=new Map();
    let root=null,textureAdded=false;
    Undo.initEdit({elements:[],outliner:true,textures:[]});
    try {
      atlas.texture.add(false);
      textureAdded=true;
      root=new Group({name:rootName}).init().addTo('root');
      planned.forEach(function(part,i){
        let target=part.group||root;
        if(!part.group && part.name.includes('|')){
          const section=part.name.split('|')[0].trim().slice(0,32);
          if(section && section!==rootName && (subgroups.has(section)||subgroups.size<22)){
            if(!subgroups.has(section))subgroups.set(section,new Group({name:section}).init().addTo(root));
            target=subgroups.get(section);
          }
        }
        const cube=new Cube({name:part.name,from:part.from,to:part.to}).init().addTo(target);
        created.push(cube);
        mapCubeToAtlas(cube,atlas,i);
      });
      Undo.finishEdit('AI: Detailed painted model '+title, {elements:created,outliner:true,textures:[atlas.texture]});
    } catch(error){
      created.forEach(function(c){try{c.remove();}catch(_){}});
      subgroups.forEach(function(group){try{group.remove();}catch(_){}});
      if(root)try{root.remove();}catch(_){}
      if(textureAdded)try{atlas.texture.remove(true);}catch(_){}
      rollback();throw error;
    }
    budget.remainingCubes-=created.length;
    redraw(created);
    return {group:{uuid:root.uuid,name:root.name},subgroups:subgroups.size,texture:{uuid:atlas.texture.uuid,name:atlas.texture.name,
      pixels:[atlas.width,atlas.height]},created_count:created.length,parts:created.slice(0,60).map(function(c){return {uuid:c.uuid,name:c.name};})};
  }
  function paintExistingCubes(args) {
    paintCapability();
    if (!Array.isArray(args.parts)||!args.parts.length||args.parts.length>MAX_CUBES_PER_CALL)fail('Provide 1 to 32 cube paints.');
    const planned=args.parts.map(function(p){return {cube:findCube(p.uuid),paint:validatePaint(p.paint)};});
    if(new Set(planned.map(function(p){return p.cube.uuid;})).size!==planned.length)fail('Duplicate cube UUID.');
    const atlas=buildAtlas(planned.map(function(p){return p.paint;}),'repaint_'+Date.now());
    const original=planned.map(function(p){return {cube:p.cube,box_uv:p.cube.box_uv,autouv:p.cube.autouv,
      faces:Object.fromEntries(FACE_NAMES.map(function(f){return [f,{texture:p.cube.faces[f].texture,uv:p.cube.faces[f].uv.slice()}];}))};});
    let textureAdded=false;
    Undo.initEdit({elements:planned.map(function(p){return p.cube;}),textures:[]});
    try {
      atlas.texture.add(false);textureAdded=true;
      planned.forEach(function(p,i){mapCubeToAtlas(p.cube,atlas,i);});
      Undo.finishEdit('AI: Paint '+planned.length+' cubes',{elements:planned.map(function(p){return p.cube;}),textures:[atlas.texture]});
    } catch(error){
      original.forEach(function(saved){
        saved.cube.box_uv=saved.box_uv;saved.cube.autouv=saved.autouv;
        FACE_NAMES.forEach(function(face){Object.assign(saved.cube.faces[face],saved.faces[face]);});
      });
      if(textureAdded)try{atlas.texture.remove(true);}catch(_){}
      rollback();throw error;
    }
    redraw(planned.map(function(p){return p.cube;}));
    return {painted:planned.map(function(p){return {uuid:p.cube.uuid,name:p.cube.name};}),
      texture:{uuid:atlas.texture.uuid,name:atlas.texture.name,pixels:[atlas.width,atlas.height]}};
  }

  function detailedHumanoid(args,budget) {
    const name=safeName(args.name);
    const style=args.style||'android_villager';
    if(!['android_villager','robot','villager','knight'].includes(style))fail('Unknown character style.');
    const skin=args.skin||'#B69B79';
    const primary=args.primary||'#566876';
    const secondary=args.secondary||'#303842';
    const accent=args.accent||'#55D8E8';
    [skin,primary,secondary,accent].forEach(function(c){rgb(c,'character color');});
    const isAndroid=style==='android_villager'||style==='robot';
    const P=[];
    function part(n,x1,y1,z1,x2,y2,z2,c,material,accentColor,marks) {
      P.push({name:n,from:[x1,y1,z1],to:[x2,y2,z2],
        paint:{base:c,material:material||'metal',accent:accentColor||accent,noise:0.07,marks:marks||[]}});
    }
    const light='#A8B9C1',dark='#192129',gold='#D6AA53';
    function mark(face,shape,x,y,color,width,height){return {face,shape,x,y,color,width:width||1,height:height||1};}
    // Character front faces -Z; segmented anatomy with mechanical joints and usable feet.
    part('Core | Torso',-4,13,-2.6,4,24,2.6,primary,'metal');
    part('Chest | Armor',-3.8,18,-3.15,3.8,23.1,-2.55,secondary,'metal',accent,
      [mark('north','rect',5,5,accent,6,2),mark('north','rect',7,9,gold,2,2)]);
    part('Core | Power Cell',-1.6,16.4,-3.8,1.6,19.3,-3.1,accent,'gem');
    part('Backplate',-3.7,16,2.6,3.7,23.7,3.35,secondary,'metal');
    part('Waist | Belt',-4.4,12,-3.0,4.4,14,3.0,secondary,'metal');
    part('Waist | Buckle',-1.2,12.2,-3.5,1.2,13.8,-3.0,gold,'metal');
    part('Neck | Servo',-1.5,23.6,-1.5,1.5,26,1.5,secondary,'circuit');
    part('Head | Skull',-4,25,-4.0,4,33.1,3.8,isAndroid?secondary:skin,isAndroid?'metal':'skin',accent,
      [mark('north','rect',3,6,accent,3,2),mark('north','rect',10,6,accent,3,2),mark('north','rect',7,10,dark,2,1)]);
    part('Head | Faceplate',-3.6,26,-4.35,3.6,31.5,-4.0,isAndroid?primary:skin,'metal',accent,
      [mark('north','rect',3,5,accent,3,2),mark('north','rect',10,5,accent,3,2),mark('north','rect',6,11,dark,4,1)]);
    part('Villager | Nose',-1.1,26.8,-6.2,1.1,30.2,-4.3,isAndroid?light:skin,isAndroid?'metal':'skin');
    part('Eyebrow | Left',-3.0,30.7,-4.5,-.8,31.2,-4.1,secondary,'metal');
    part('Eyebrow | Right',.8,30.7,-4.5,3.0,31.2,-4.1,secondary,'metal');
    part('Jaw | Lower',-3.1,25.3,-4.5,3.1,26.4,-3.75,primary,'metal');
    part('Head | Top Panel',-4.1,33.0,-4.1,4.1,34.0,3.8,secondary,'metal');
    part('Head | Crest',-2,34,-2.5,2,34.8,1.3,accent,'gem');
    part('Ear | Left Servo',-4.8,28,-1.8,-4,31,1.6,secondary,'circuit');
    part('Ear | Right Servo',4,28,-1.8,4.8,31,1.6,secondary,'circuit');
    part('Antenna | Stem',1.8,34,0,2.2,36.5,.4,light,'metal');
    part('Antenna | Tip',1.3,36.4,-.5,2.7,37.7,.9,accent,'gem');
    for(const side of [-1,1]) {
      const prefix=side<0?'Left':'Right';
      const a=side<0?[-6,-4.1]:[4.1,6];
      const outer=side<0?[-7.1,-4.1]:[4.1,7.1];
      const joint=side<0?-5.55:5.55;
      part(prefix+' | Shoulder',outer[0],20.4,-2.7,outer[1],24,2.7,primary,'metal');
      part(prefix+' | Shoulder Rim',outer[0]-.15,23,-2.95,outer[1]+.15,24.4,2.95,light,'metal');
      part(prefix+' | Upper Arm',a[0],16.3,-2, a[1],21.2,2,secondary,'metal');
      part(prefix+' | Elbow Joint',joint-1,15.4,-2.2,joint+1,17.3,2.2,accent,'circuit');
      part(prefix+' | Forearm',outer[0],11.3,-2.5,outer[1],16.2,2.5,primary,'metal');
      part(prefix+' | Wrist Ring',outer[0]-.2,11,-2.7,outer[1]+.2,12,2.7,light,'metal');
      part(prefix+' | Hand',a[0]-.3,8,-2, a[1]+.3,11.5,2,secondary,'metal');
      for(let finger=0;finger<3;finger++){
        const dx=outer[0]+.3+finger*.8;
        part(prefix+' | Finger '+(finger+1),dx,6.5,-1.5,dx+.48,8.1,1.1,light,'metal');
      }
      const lx=side<0?-2.3:2.3;
      part(prefix+' | Hip',lx-1.75,10.8,-2.35,lx+1.75,13.3,2.35,secondary,'metal');
      part(prefix+' | Thigh',lx-1.65,6.2,-2,lx+1.65,11,2,primary,'metal');
      part(prefix+' | Knee Servo',lx-1.7,5.8,-2.4,lx+1.7,7.3,2.4,accent,'circuit');
      part(prefix+' | Shin',lx-1.6,1.9,-1.8,lx+1.6,6.2,1.8,secondary,'metal');
      part(prefix+' | Shin Plate',lx-1.5,2.5,-2.15,lx+1.5,5.5,-1.8,primary,'metal');
      part(prefix+' | Boot',lx-1.9,0,-3.9,lx+1.9,2.5,2.4,secondary,'metal');
      part(prefix+' | Boot Toe',lx-1.85,0,-4.5,lx+1.85,1.4,-3.9,light,'metal');
    }
    if(isAndroid) {
      part('Back | Battery',-2,15.5,3.35,2,21.5,4.55,secondary,'circuit');
      part('Back | Battery LED',-.8,17.2,4.5,.8,19.9,5.1,accent,'gem');
      part('Torso | Service Vent Left',-3.6,14.7,-3.35,-1.6,16.6,-3.05,dark,'circuit');
      part('Torso | Service Vent Right',1.6,14.7,-3.35,3.6,16.6,-3.05,dark,'circuit');
    }

    // Quality pass: three-dimensional face features, surface seams, illuminated hardware,
    // bevel-like corner strips, vents and asymmetrical circuit components.
    const pupil=style==='villager'?'#214A55':accent;
    part('Face | Left Lens',-2.8,29.25,-4.55,-1.15,30.35,-4.34,pupil,'gem');
    part('Face | Right Lens',1.15,29.25,-4.55,2.8,30.35,-4.34,pupil,'gem');
    part('Face | Nasal Seam',-.95,27.0,-6.29,.95,27.3,-6.15,dark,'metal');
    part('Face | Speaker',-1.5,25.9,-4.65,1.5,26.45,-4.43,secondary,'circuit');
    part('Face | Cheek Vent L',-3.45,26.9,-4.53,-2.45,28.4,-4.34,dark,'circuit');
    part('Face | Cheek Vent R',2.45,26.9,-4.53,3.45,28.4,-4.34,dark,'circuit');
    part('Chest | Collar Left',-3.45,22.55,-3.37,-.25,23.2,-3.14,light,'metal');
    part('Chest | Collar Right',.25,22.55,-3.37,3.45,23.2,-3.14,light,'metal');
    part('Chest | Left Detail',-3.4,18.6,-3.43,-2.9,21.5,-3.14,gold,'metal');
    part('Chest | Right Detail',2.9,18.6,-3.43,3.4,21.5,-3.14,gold,'metal');
    part('Waist | Front Buckle Detail',-.5,12.5,-3.7,.5,13.5,-3.46,accent,'gem');
    for (const side of [-1,1]) {
      const tag=side<0?'Left':'Right',sx=side<0?-5.6:5.6,leg=side<0?-2.3:2.3;
      part(tag+' | Shoulder Inset',sx-1,21.7,-3.04,sx+1,23.0,-2.73,secondary,'metal');
      part(tag+' | Bicep Connector',sx-.72,17.65,-2.38,sx+.72,18.9,-1.99,accent,'circuit');
      part(tag+' | Elbow Bolt',sx-.45,15.9,-2.51,sx+.45,16.8,-2.15,gold,'metal');
      part(tag+' | Wrist Indicator',sx-.65,11.5,-2.95,sx+.65,11.92,-2.7,accent,'gem');
      part(tag+' | Knee Emblem',leg-.6,6.05,-2.7,leg+.6,6.85,-2.39,gold,'metal');
      part(tag+' | Boot Seam',leg-1.65,1.7,-4.08,leg+1.65,2.03,-3.9,light,'metal');
    }
    return buildPaintedModel({name:name,parts:P},budget);
  }


  // Compact modeling protocol: the model describes shape and palette, while BlockbenchAI
  // expands materials, shading, UV and texture pixels deterministically on-device.
  // This drastically reduces tool-schema and output tokens compared to full paintSchema.
  const COMPACT_MATERIALS = {
    metal:'metal', m:'metal', steel:'metal',
    wood:'wood', w:'wood',
    fabric:'fabric', f:'fabric',
    stone:'stone', s:'stone',
    skin:'skin', k:'skin',
    circuit:'circuit', c:'circuit',
    gem:'gem', g:'gem',
    plain:'plain', p:'plain'
  };
  const COMPACT_TOOL = tool('compose_model',
    'Build detailed native Blockbench painted 3D model using compact parts. Each part is compact text: name|x1,y1,z1|x2,y2,z2|material|paletteSlot. Use no pipe inside names. Example: Blade|-1,0,-0.5|1,16,0.5|m|primary. Material: m metal,w wood,f fabric,s stone,k skin,c circuit,g gem,p plain. Palette slot: primary,secondary,accent,skin,metal,wood,dark,gold. Use many small parts to sculpt silhouette. Coordinates are integers or decimals. Front faces -Z.',
    {
      name:{type:'string'},
      palette:{type:'object',additionalProperties:false,
        properties:{primary:{type:'string'},secondary:{type:'string'},accent:{type:'string'},skin:{type:'string'}}},
      parts:{type:'array',maxItems:96,items:{type:'string',maxLength:180,
        description:'Name|x,y,z|x,y,z|materialCode|paletteSlot; no extra delimiters'}}
    },['name','parts']);
  function composeModel(args,budget) {
    if(!args || !Array.isArray(args.parts) || args.parts.length===0 || args.parts.length>MAX_PAINTED_PARTS)fail('compose_model requires 1-96 parts.');
    const paletteInput=args.palette||{};
    const palette={
      primary:rgb(paletteInput.primary||'#647889','primary'),
      secondary:rgb(paletteInput.secondary||'#344455','secondary'),
      accent:rgb(paletteInput.accent||'#50D6DE','accent'),
      skin:rgb(paletteInput.skin||'#BA9E7E','skin'),
      metal:rgb('#B1BFCA','metal'),
      wood:rgb('#78513A','wood'),
      dark:rgb('#1E2632','dark'),
      gold:rgb('#D5AF60','gold')
    };
    const toHex=(c)=>colorCode(c[0],c[1],c[2]);
    const parts=args.parts.map(function(p,i){
      if(typeof p==='string'){
        const split=p.split('|');
        if(split.length!==5)fail('Part '+(i+1)+' must be name|from|to|material|palette');
        const from=split[1].split(',').map(Number),to=split[2].split(',').map(Number);
        if(from.length!==3||to.length!==3)fail('Part '+(i+1)+' has invalid coordinates.');
        p=[split[0],...from,...to,split[3],split[4]];
      }
      if(!Array.isArray(p)||p.length!==9)fail('Part '+(i+1)+' needs exactly 9 fields.');
      const material=COMPACT_MATERIALS[String(p[7]).toLowerCase()];
      if(!material)fail('Unknown material on part '+(i+1));
      const slot=String(p[8]||'primary').toLowerCase();
      if(!palette[slot])fail('Unknown palette slot on part '+(i+1));
      const primary=toHex(palette[slot]);
      const accent=toHex(palette.accent);
      return {name:safeName(p[0]),from:p.slice(1,4),to:p.slice(4,7),
        paint:{base:primary,material:material,accent:accent,noise:.085}};
    });
    return buildPaintedModel({name:args.name||'AI Model',parts:parts},budget);
  }


  // High-quality deterministic props: all geometry remains individually editable. The model
  // only supplies an art direction and palette; precise shape math runs locally.
  const PROP_TOOL = tool('generate_prop',
    'Preferred tool for swords, energy blades, drones/quads, or treasure chests. Generates a high-detail editable 3D prop with real pixel textures and grouped components.',
    {
      name:{type:'string'},
      kind:{type:'string',enum:['energy_sword','sci_fi_drone','treasure_chest']},
      primary:{type:'string',description:'Optional #RRGGBB main color'},
      secondary:{type:'string',description:'Optional #RRGGBB dark color'},
      accent:{type:'string',description:'Optional #RRGGBB glow or trim color'}
    },['name','kind']);

  function generateProp(args,budget) {
    if(!args || !['energy_sword','sci_fi_drone','treasure_chest'].includes(args.kind))fail('Unsupported prop type.');
    const title=safeName(args.name);
    const primary=args.primary||'#627B8A',secondary=args.secondary||'#2C3B49',
      accent=args.accent||'#54DFEC';
    [primary,secondary,accent].forEach(function(c){rgb(c,'prop palette');});
    const gold='#DBB768',steel='#AFBCC9',dark='#151F2B',wood='#79543E';
    const P=[];
    function p(name,a,b,c,d,e,f,base,mat,trim) {
      P.push({name:name,from:[a,b,c],to:[d,e,f],
        paint:{base:base,material:mat||'metal',accent:trim||accent,noise:.065}});
    }
    if(args.kind==='energy_sword'){
      p('Grip | Main',-.85,0,-.7,.85,6,.7,wood,'wood');
      p('Grip | Core',-.55,1,-.85,.55,5.5,-.7,secondary,'metal');
      p('Hilt | Pommel',-1.35,-1,-1.0,1.35,.3,1.0,secondary,'metal');
      p('Hilt | Gem',-.62,-1.25,-1.18,.62,-.1,-.98,accent,'gem');
      p('Hilt | Collar',-1,5.4,-1,1,6.6,1,steel,'metal');
      p('Hilt | Guard',-4.8,6,-1.1,4.8,7.3,1.1,secondary,'metal');
      p('Hilt | Guard Core',-2,6,-1.45,2,7.7,-1.05,gold,'metal');
      p('Hilt | Center Jewel',-.85,6.3,-1.75,.85,7.6,-1.4,accent,'gem');
      p('Blade | Body',-1.55,7,-.68,1.55,24.8,.68,steel,'metal');
      p('Blade | Midrib',-.45,7,-1.0,.45,24.7,-.7,primary,'metal');
      p('Blade | Tip',-.95,24.7,-.45,.95,27.2,.45,steel,'metal');
      p('Blade | Tip Crest',-.45,27.1,-.2,.45,28.5,.2,accent,'gem');
      p('Blade | Core Glow',-.24,8,-1.18,.24,24.4,-.98,accent,'gem');
      for(const sign of [-1,1]){
        const label=sign<0?'Left':'Right';
        const x=sign<0?-1.8:1.55;
        p(label+' Blade | Edge',x,8,-.43,x+.25,24.3,.43,primary,'metal');
        p(label+' Blade | Tip Facet',sign<0?-1.14:.95,24.5,-.57,sign<0?-.96:1.13,26.5,.57,gold,'metal');
        p(label+' Guard | Wing',sign<0?-4.8:2.65,7,-.75,sign<0?-2.6:4.85,8.25,.75,primary,'metal');
        p(label+' Guard | Cap',sign<0?-5.25:4.55,7.35,-.9,sign<0?-4.5:5.3,8.9,.9,gold,'metal');
        p(label+' Guard | Highlight',sign<0?-4.7:2.8,7.2,-1.0,sign<0?-2.8:4.7,7.55,-.79,accent,'circuit');
        for(let i=0;i<4;i++){
          p(label+' Grip | Binding '+(i+1),sign<0?-1.05:.8,.6+i*1.25,-.91,sign<0?-.8:1.05,1.08+i*1.25,.91,gold,'metal');
        }
        for(let i=0;i<4;i++){
          p(label+' Blade | Rune '+(i+1),sign<0?-1.08:.87,10+i*3,-.79,sign<0?-.67:1.08,10.5+i*3,-.67,accent,'gem');
        }
      }
    } else if(args.kind==='sci_fi_drone'){
      p('Chassis | Core',-3.4,7,-3.1,3.4,10.7,3.1,primary,'metal');
      p('Chassis | Top Shell',-3,10.65,-2.75,3,11.65,2.75,secondary,'metal');
      p('Chassis | Bottom Plate',-3.15,6.45,-2.95,3.15,7.25,2.95,secondary,'metal');
      p('Chassis | Center Reactor',-1.45,11.6,-1.45,1.45,12.25,1.45,accent,'gem');
      p('Camera | Front Housing',-1.5,7.4,-4.2,1.5,9.8,-3.05,secondary,'metal');
      p('Camera | Lens',-.8,7.9,-4.65,.8,9.35,-4.15,accent,'gem');
      p('Camera | Lens Ring',-1.07,7.65,-4.32,1.07,9.65,-4.1,gold,'metal');
      p('Power | Battery',-2.05,7,3.1,2.05,9.9,4.25,secondary,'circuit');
      p('Power | Battery Light',-.65,8,4.2,.65,9.05,4.55,accent,'gem');
      p('Sensor | Antenna',-.19,11.5,1.5,.19,13.95,1.9,steel,'metal');
      p('Sensor | Antenna Tip',-.65,13.75,1.05,.65,14.55,2.35,accent,'gem');
      for(const xs of [-1,1])for(const zs of [-1,1]){
        const tag=(xs<0?'L':'R')+(zs<0?'F':'B');
        const ax=xs*7, az=zs*7;
        p(tag+' Arm | Beam',Math.min(xs*2.0,ax)-.55,8,Math.min(zs*2.1,az)-.56,
          Math.max(xs*2.0,ax)+.55,9.25,Math.max(zs*2.1,az)+.56,primary,'metal');
        p(tag+' Motor | Housing',ax-1.6,8.0,az-1.6,ax+1.6,10.7,az+1.6,secondary,'metal');
        p(tag+' Motor | Core',ax-.7,10.6,az-.7,ax+.7,11.4,az+.7,accent,'gem');
        p(tag+' Rotor | Hub',ax-.65,11.4,az-.65,ax+.65,12,az+.65,steel,'metal');
        p(tag+' Rotor | Blade X',ax-3,11.9,az-.28,ax+3,12.2,az+.28,steel,'metal');
        p(tag+' Rotor | Blade Z',ax-.28,11.9,az-3,ax+.28,12.2,az+3,steel,'metal');
        p(tag+' Rotor | Blade Tip A',ax-3.3,11.83,az-.4,ax-2.7,12.27,az+.4,accent,'gem');
        p(tag+' Rotor | Blade Tip B',ax+2.7,11.83,az-.4,ax+3.3,12.27,az+.4,accent,'gem');
        p(tag+' Landing | Strut',ax-.28,4.7,az-.28,ax+.28,8.2,az+.28,dark,'metal');
        p(tag+' Landing | Foot',ax-1.5,4.3,az-1.0,ax+1.5,4.9,az+1,secondary,'metal');
      }
      for(let i=0;i<4;i++){
        const x=-2.3+i*1.5;
        p('Chassis | Vent '+i,x,9,-3.3,x+.7,9.5,-3.1,dark,'circuit');
        p('Chassis | Trim '+i,x,10.7,-3.0,x+.7,10.85,-2.7,gold,'metal');
      }
    } else {
      p('Body | Base',-7.5,0,-4.5,7.5,7,4.5,wood,'wood');
      p('Body | Upper Lid',-8.1,6,-5.1,8.1,10.5,5.1,wood,'wood');
      p('Body | Lid Top',-8.1,10.3,-5.1,8.1,11.2,5.1,primary,'metal');
      p('Lock | Housing',-2.1,4,-5.65,2.1,8.4,-4.5,gold,'metal');
      p('Lock | Keyhole',-.52,5,-5.8,.52,6.8,-5.55,dark,'plain');
      p('Lock | Core Gem',-.9,7,-5.88,.9,8.2,-5.7,accent,'gem');
      for(const side of [-1,1]){
        const x=side<0?-8.4:7.6;
        const tag=side<0?'Left':'Right';
        p(tag+' Edge | Vertical',x,.1,-5.3,x+.8,10.8,5.3,gold,'metal');
        p(tag+' Edge | Top Corner',x,10.3,-5.4,x+.8,11.5,5.4,primary,'metal');
        p(tag+' Hinge | Housing',x,7.4,4.3,x+.8,10.4,5.3,secondary,'metal');
        for(let i=0;i<3;i++){
          p(tag+' Rivet | Front '+i,x+.1,1.6+i*3,-5.7,x+.7,2.2+i*3,-5.3,steel,'metal');
        }
      }
      for(const sign of [-1,1]){
        const z=sign<0?-5.15:4.35;
        const side=sign<0?'Front':'Back';
        for(let i=0;i<3;i++){
          const y=1.15+i*3.0;
          p(side+' Trim | Horizontal '+i,-8.2,y,z,8.2,y+.48,z+.8,primary,'metal');
        }
        for(let x=-6;x<=6;x+=3){
          p(side+' Rivet | X'+x,x-.3,7.5,z-.2,x+.3,8.1,z+.2,gold,'metal');
        }
      }
      for(let i=0;i<4;i++){
        const x=-6.4+i*4;
        p('Lid | Steel Strap '+i,x,7.2,-5.3,x+.8,11.5,5.3,secondary,'metal');
        p('Lid | Gold Inlay '+i,x+.1,10.8,-5.2,x+.7,11.4,5.2,gold,'metal');
      }
      p('Base | Foot Left',-7.2,-1,-3.7,-5.6,0.1,3.7,dark,'stone');
      p('Base | Foot Right',5.6,-1,-3.7,7.2,0.1,3.7,dark,'stone');
    }
    if(P.length>MAX_PAINTED_PARTS)fail('Generator exceeded max textured parts ('+P.length+').');
    return buildPaintedModel({name:title,parts:P},budget);
  }

  function runTool(name, args, budget) {
    if (Project !== budget.project) fail('Project changed during this request. Stopping to protect your work.');
    if (name === 'inspect_scene') return scene(args);
    if (name === 'create_group') return createGroup(args || {});
    if (name === 'create_cubes') return createCubes(args || {}, budget);
    if (name === 'edit_cubes') return editCubes(args || {});
    if (name === 'build_painted_model') return buildPaintedModel(args || {}, budget);
    if (name === 'paint_existing_cubes') return paintExistingCubes(args || {});
    if (name === 'generate_character') return detailedHumanoid(args || {}, budget);
    if (name === 'compose_model') return composeModel(args || {}, budget);
    if (name === 'generate_prop') return generateProp(args || {}, budget);
    fail('Unknown tool: ' + name);
  }

  function validateEndpoint(value) {
    let url;
    try {url = new URL(String(value || '').trim());} catch (_) {fail('Enter a valid API endpoint URL.');}
    const host = url.hostname.toLowerCase();
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) fail('HTTPS is required except on localhost.');
    if (url.username || url.password || url.hash) fail('API endpoints cannot include credentials or fragments.');
    return url.toString();
  }
  function safeError(message) {
    return String(message || 'Unknown error').slice(0, 360).replace(/sk-[a-z0-9_-]{8,}/gi, '[REDACTED]');
  }
  function preferences() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {endpoint: typeof stored.endpoint === 'string' ? stored.endpoint : DEFAULT_ENDPOINT,
        model: typeof stored.model === 'string' ? stored.model : 'gpt-4.1-mini'};
    } catch (_) {return {endpoint: DEFAULT_ENDPOINT, model: 'gpt-4.1-mini'};}
  }
  function savePreferences(endpoint, model) {
    try {localStorage.setItem(STORAGE_KEY, JSON.stringify({endpoint: endpoint, model: model}));} catch (_) {}
  }

  // Real Blockbench plugin preferences, displayed in the Plugins > Settings tab.
  // Credentials are deliberately excluded from native preferences: those persist to disk.
  function validCloudflareAccount(value) {
    return typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value.trim());
  }
  function cloudflareEndpoint(account) {
    if (!validCloudflareAccount(account)) fail('Introduce un Account ID válido de Cloudflare (32 caracteres hexadecimales).');
    return 'https://api.cloudflare.com/client/v4/accounts/' + account.trim() + '/ai/v1/chat/completions';
  }
  function settingsSnapshot() {
    const fallback = preferences();
    return {
      provider: registeredSettings.provider ? String(registeredSettings.provider.value) : 'groq',
      cloudflareAccount: registeredSettings.cloudflareAccount ? String(registeredSettings.cloudflareAccount.value || '') : '',
      endpoint: registeredSettings.endpoint ? String(registeredSettings.endpoint.value) : fallback.endpoint,
      model: registeredSettings.model ? String(registeredSettings.model.value) : fallback.model
    };
  }
  function updatePanelSettings() {
    if (!panel) return;
    const vm = panel.inside_vue || panel.vue;
    if (vm && typeof vm.refreshConfiguration === 'function') vm.refreshConfiguration();
  }
  function storeConfiguration(next) {
    const provider = ['groq', 'gemini', 'cloudflare', 'openai', 'custom'].includes(next.provider) ? next.provider : 'custom';
    const account = String(next.cloudflareAccount || '').trim();
    const endpoint = validateEndpoint(provider === 'cloudflare' ? cloudflareEndpoint(account) : next.endpoint);
    const model = safeName(next.model);
    if (registeredSettings.provider && registeredSettings.provider.value !== provider) registeredSettings.provider.set(provider);
    if (registeredSettings.cloudflareAccount && account !== String(registeredSettings.cloudflareAccount.value || '')) registeredSettings.cloudflareAccount.set(account);
    if (registeredSettings.endpoint) registeredSettings.endpoint.set(endpoint);
    if (registeredSettings.model) registeredSettings.model.set(model);
    savePreferences(endpoint, model);
    updatePanelSettings();
  }
  function openKeyDialog() {
    new Dialog('bbai_key_dialog', {
      title: 'Blockbench AI · API key',
      icon: 'key',
      width: 470,
      form: {
        info: {type: 'info', text: 'La clave se conserva solo durante esta sesión y no se guardará en las preferencias de Blockbench.'},
        key: {type: 'password', label: 'API key', value: sessionApiKey,
          placeholder: 'gsk_... / sk-...'}
      },
      onConfirm: function (values) {
        sessionApiKey = typeof values.key === 'string' ? values.key.trim() : '';
        const vm = panel && (panel.inside_vue || panel.vue);
        if (vm && typeof vm.syncKey === 'function') vm.syncKey();
        Blockbench.showQuickMessage(sessionApiKey ? 'Clave configurada para esta sesión' : 'Clave de sesión eliminada');
      }
    }).show();
  }
  function registerPreferences() {
    const old = preferences();
    registeredSettings.provider = new Setting('bbai_provider', {
      plugin: ID, name: 'Proveedor', type: 'select',
      description: 'Servicio de IA. Groq tiene un plan gratuito sujeto a límites.',
      value: 'groq', options: {groq: 'Groq', gemini: 'Google Gemini', cloudflare: 'Cloudflare Workers AI (Qwen)', openai: 'OpenAI', custom: 'Personalizado'},
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
      }
    });
    registeredSettings.endpoint = new Setting('bbai_endpoint', {
      plugin: ID, name: 'Endpoint de la API', type: 'text',
      description: 'URL de Chat Completions compatible con OpenAI; HTTPS obligatorio salvo localhost.',
      value: old.endpoint === DEFAULT_ENDPOINT ? GROQ_ENDPOINT : old.endpoint,
      onChange: updatePanelSettings
    });
    registeredSettings.model = new Setting('bbai_model', {
      plugin: ID, name: 'Modelo de IA', type: 'text',
      description: 'Identificador exacto del modelo, por ejemplo openai/gpt-oss-120b.',
      value: old.model === 'gpt-4.1-mini' ? 'openai/gpt-oss-120b' : old.model,
      onChange: updatePanelSettings
    });
    registeredSettings.cloudflareAccount = new Setting('bbai_cloudflare_account', {
      plugin: ID, name: 'Cloudflare Account ID', type: 'text', value: '',
      description: 'Identificador de cuenta de 32 caracteres. No es una clave privada.',
      onChange: function (value) {
        if (registeredSettings.provider && registeredSettings.provider.value === 'cloudflare') {
          registeredSettings.endpoint.set(validCloudflareAccount(value) ? cloudflareEndpoint(value) : '');
        }
        updatePanelSettings();
      }
    });
    registeredSettings.key = new Setting('bbai_session_key', {
      plugin: ID, name: 'Configurar API key (solo sesión)', type: 'click', icon: 'key',
      description: 'Abre una ventana segura para introducir la clave. No se guarda en disco.',
      click: openKeyDialog
    });
  }
  function unregisterPreferences() {
    Object.keys(registeredSettings).forEach(function (key) {
      if (registeredSettings[key]) registeredSettings[key].delete();
      delete registeredSettings[key];
    });
    sessionApiKey = '';
  }

  function systemPrompt() {
    return 'You are BlockbenchAI, a native editable 3D modeler. Use real tools; never claim unexecuted work. '+
      'For humanoids/villagers/androids/robots ALWAYS call generate_character to create a polished, textured base. '+
      'For swords, chests and sci-fi drones use generate_prop for detailed procedural geometry and pixel materials. '+
      'For all other NEW creations call compose_model: up to 96 named parts (name,fromXYZ,toXYZ,materialCode,paletteName), material and atlas painted locally. '+
      'Prefer a strong silhouette, layered geometric components, deliberate 3D detailing and coherent palette. Front=-Z. '+
      'For existing models inspect first, then edit by UUID or paint existing cubes. Do not destroy unrelated parts. '+
      'Tool execution has Blockbench Undo. Unsupported: arbitrary meshes, animation, exports or external image synthesis. '+
      'Respond in the user language, concise. If the task is complete, stop calling tools.';
  }

  const MAX_RATE_RETRIES = 4;
  const MAX_TOTAL_RATE_WAIT_MS = 125000;

  function retrySeconds(headers, detail, retryCount) {
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
      const m = /^(\d+(?:\.\d+)?)(s|ms|m)$/i.exec(reset.trim());
      if (m) return Number(m[1]) * (m[2] === 'm' ? 60 : m[2] === 'ms' ? .001 : 1);
    }
    return Math.min(12, 3 * Math.pow(2, retryCount));
  }

  function waitForQuota(seconds, signal, onProgress) {
    // Interruptible delay: Stop in the panel cancels both an in-flight request and a 429 cooldown.
    const until = Date.now() + Math.ceil(seconds * 1000);
    return new Promise(function (resolve, reject) {
      let timer = null;
      let settled = false;
      function cleanup() {
        if (timer !== null) clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
      }
      function cancel() {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Solicitud cancelada.'));
      }
      function tick() {
        if (signal.aborted) return cancel();
        const left = Math.max(0, until - Date.now());
        if (left <= 0) {
          if (!settled) {settled = true; cleanup(); resolve();}
          return;
        }
        onProgress('Límite del proveedor: reintentando en ' + Math.ceil(left / 1000) + ' s… (puedes detenerlo)');
        timer = setTimeout(tick, Math.min(1000, left));
      }
      signal.addEventListener('abort', cancel, {once: true});
      tick();
    });
  }


  function selectTools(prompt, populated, advanced) {
    const lower=String(prompt||'').toLowerCase();
    const prop=/(espada|sword|katana|blade|dron|drone|quadcop|cofre|chest|baúl|baul)/i.test(lower);
    const character=/(aldean|villager|androide|android|robot|personaje|character|humanoid|humano|caballero|knight|golem)/i.test(lower);
    const edit=populated&&/(modifica|modificar|cambia|cambiar|ajusta|ajustar|editar|edita|pinta|pintar|repinta|repaint|modify|change|color|textur|extend|alarga|mejora|improve)/i.test(lower);
    // No huge nested paint schema unless the user explicitly asks for a repaint.
    if(edit) return TOOLS.filter(function(t){return ['inspect_scene','edit_cubes','paint_existing_cubes'].includes(t.function.name);});
    if(prop) return [PROP_TOOL,TOOLS.find(t=>t.function.name==='inspect_scene')];
    if(character) return advanced ? [TOOLS.find(t=>t.function.name==='generate_character'),COMPACT_TOOL,TOOLS.find(t=>t.function.name==='inspect_scene')] : TOOLS.filter(function(t){return ['generate_character','inspect_scene'].includes(t.function.name);});
    return [COMPACT_TOOL, TOOLS.find(function(t){return t.function.name==='inspect_scene';})];
  }
  function compactSceneSnapshot(ctx, firstRound) {
    return {
      format:ctx.project.format, cubes_allowed:ctx.project.capabilities.cubes,
      cubes:ctx.totals.cubes, selected:ctx.totals.selected_cubes,
      groups:ctx.groups.slice(0,firstRound?10:5).map(function(g){return [g.uuid,g.name];}),
      items:ctx.cubes.slice(0,firstRound?12:6).map(function(c){return [c.uuid,c.name,c.from,c.to];})
    };
  }
  // Preflight guard for the documented 8K TPM Groq OSS 120B quota.
  // Estimates are intentionally conservative and capped below the server's 8000 tokens.
  function preflightPayload(payload, endpoint, model) {
    if(!endpoint.startsWith(GROQ_ENDPOINT.split('/openai/')[0]))return;
    // Arabic, Cyrillic, Chinese and emoji JSON escape differently; this measures actual JSON bytes
    // and conservatively budgets 1 token per 2.8 UTF-8 bytes, plus output headroom.
    if(!/gpt-oss-120b/i.test(model))return;
    const bytes=typeof TextEncoder==='function' ? new TextEncoder().encode(payload).length : unescape(encodeURIComponent(payload)).length;
    const estimated=Math.ceil(bytes/2.8)+900;
    if(estimated>6400)fail('La solicitud es demasiado grande para Groq gratis (aprox. '+estimated+' tokens con margen). Reduce el historial o usa Gemini en Ajustes; no enviaré una petición destinada a fallar con 413.');
  }

  async function checkProviderConnection(config) {
    const endpoint = validateEndpoint(config.provider === 'cloudflare' ? cloudflareEndpoint(config.cloudflareAccount) : config.endpoint);
    const model = safeName(config.model);
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(new URL(endpoint).hostname);
    if (!config.apiKey && !localHost) fail('La API key es obligatoria. Usa una clave del proveedor elegido.');
    const controller = new AbortController();
    const timeout = setTimeout(function () {controller.abort();}, 18000);
    try {
      const headers = {'Content-Type':'application/json'};
      if (config.apiKey) headers.Authorization = 'Bearer ' + config.apiKey;
      const response = await fetch(endpoint, {
        method:'POST', headers:headers, signal:controller.signal,
        body:JSON.stringify({model:model,messages:[{role:'user',content:'Reply with: OK'}],max_tokens:16})
      });
      if (!response.ok) {
        let message='';
        try {const body=await response.json();message=body && body.error && body.error.message || '';}catch(_){}
        fail('Conexión rechazada ('+response.status+'). '+safeError(message || 'Revisa tu clave, modelo y URL.'));
      }
      const data=await response.json();
      if (!data || !Array.isArray(data.choices) || !data.choices[0] || !data.choices[0].message) {
        fail('El servidor respondió, pero no devolvió el formato Chat Completions esperado.');
      }
      return {provider:config.provider,model:model};
    } catch(error) {
      if (controller.signal.aborted) fail('La comprobación superó el tiempo máximo de conexión (18 segundos).');
      throw error;
    } finally {clearTimeout(timeout);}
  }

  async function requestCompletion(endpoint, model, apiKey, messages, signal, onProgress, availableTools) {
    const headers = {'Content-Type': 'application/json'};
    if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
    const payload = JSON.stringify({model: model, messages: messages, tools: availableTools, tool_choice: 'auto'});
    preflightPayload(payload, endpoint, model);
    let waited = 0;
    for (let retry = 0; retry <= MAX_RATE_RETRIES; retry++) {
      if (signal.aborted) fail('Solicitud cancelada.');
      let response;
      try {
        response = await fetch(endpoint, {method: 'POST', headers: headers, signal: signal, body: payload});
      } catch (error) {
        if (signal.aborted) fail('Solicitud cancelada.');
        fail('No se pudo conectar con la API. Comprueba la URL, la conexión y los permisos de red.');
      }
      if (response.status === 413) {
        fail('La API rechazó el tamaño de la solicitud (413). Prueba el proveedor Gemini en Ajustes o reinicia el chat para reducir contexto; el error no se soluciona esperando.');
      }
      if (response.status === 429) {
        let detail = '';
        try {const body = await response.json(); detail = String(body && body.error && body.error.message || '');} catch (_) {}
        const seconds = retrySeconds(response.headers, detail, retry);
        const delay = Math.min(65000, Math.ceil((seconds + 0.65) * 1000));
        if (retry === MAX_RATE_RETRIES || seconds > 65 || waited + delay > MAX_TOTAL_RATE_WAIT_MS) {
          fail('El proveedor ha alcanzado su límite de uso gratuito. Espera a que se renueve tu cuota o elige otro proveedor en Ajustes. Las modificaciones ya aplicadas se conservaron.');
        }
        waited += delay;
        await waitForQuota(delay / 1000, signal, onProgress || function () {});
        continue;
      }
      if (!response.ok) {
        let detail = '';
        try {const body = await response.json(); detail = body.error && body.error.message || '';} catch (_) {}
        fail('API error ' + response.status + (detail ? ': ' + safeError(detail) : '. Revisa tu API key, modelo y endpoint.'));
      }
      let data;
      try {data = await response.json();} catch (_) {fail('El proveedor devolvió una respuesta JSON inválida.');}
      const message = data && data.choices && data.choices[0] && data.choices[0].message;
      if (!message) fail('La API no devolvió una respuesta compatible con Chat Completions.');
      return message;
    }
    fail('No fue posible completar la solicitud con la cuota disponible.');
  }

  async function perform(prompt, config, onProgress, signal) {
    const project = activeProject();
    const endpoint = validateEndpoint(config.endpoint);
    const model = safeName(config.model);
    const isLocal = new URL(endpoint).hostname.match(/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/);
    if (!config.apiKey && !isLocal) fail('Introduce tu API key en Ajustes. La clave no se guarda.');
    // Only the most recent conversation is sent. Large scene dumps and the full tool transcript
    // used to be resent on every round, rapidly exhausting Groq's 8K TPM free allowance.
    const history = (config.history || []).slice(-4).map(function (m) {
      return {role: m.role, content: String(m.content).slice(0, 280)};
    });
    const rounds = [];
    const budget = {project: project, remainingCubes: MAX_CUBES_PER_RUN, toolCalls: 0};
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (signal.aborted) fail('Solicitud cancelada.');
      if (Project !== project) fail('El proyecto cambió durante la solicitud. Se detuvo para proteger tu trabajo.');
      onProgress('Planificando modelo · paso ' + (round + 1) + '/' + MAX_ROUNDS);
      const context = scene({limit: round===0?12:6});
      const messages = [
        {role: 'system', content: systemPrompt()},
        {role: 'system', content: 'Project: ' + JSON.stringify(compactSceneSnapshot(context,round===0))},
        ...history,
        {role: 'user', content: prompt},
        ...rounds.slice(-1).flat()
      ];
      const availableTools=selectTools(prompt,context.totals.cubes>0,endpoint===GEMINI_ENDPOINT);
      const reply = await requestCompletion(endpoint, model, config.apiKey, messages, signal, onProgress, availableTools);
      if (signal.aborted || Project !== project) fail('Solicitud cancelada o el proyecto ha cambiado.');
      const calls = reply.tool_calls || [];
      if (!calls.length) return String(reply.content || (budget.toolCalls ? 'Se aplicaron cambios al modelo.' : 'No se realizaron cambios.'));
      if (budget.toolCalls + calls.length > MAX_TOOL_CALLS) fail('Se alcanzó el límite de herramientas. Los cambios realizados siguen disponibles en el historial de deshacer.');
      const exchange = [{role: 'assistant', content: reply.content || null, tool_calls: calls}];
      for (const call of calls) {
        if (signal.aborted || Project !== project) fail('Solicitud cancelada o el proyecto ha cambiado.');
        const name = call.function && call.function.name || 'unknown';
        onProgress('Ejecutando ' + name + '…');
        budget.toolCalls++;
        let result;
        try {
          const args = JSON.parse(call.function && call.function.arguments || '{}');
          result = {ok: true, data: runTool(name, args, budget)};
          if (name !== 'inspect_scene') onProgress('Aplicado: ' + name);
        } catch (error) {
          result = {ok: false, error: safeError(error && error.message)};
        }
        const output = JSON.stringify(result);
        exchange.push({role: 'tool', tool_call_id: call.id, content: output.length > 800
          ? JSON.stringify({ok: result.ok, truncated: true, preview: output.slice(0, 450),
              note: 'Call inspect_scene with a small limit for specific cube UUIDs.'}) : output});
      }
      rounds.push(exchange);
    }
    return 'He alcanzado el límite de pasos. Los cambios realizados se pueden deshacer en Blockbench. Puedes pedirme que continúe.';
  }

  const TEMPLATE = "\n<section class=\"bbai-root\">\n  <header class=\"bbai-topbar\">\n    <div class=\"bbai-identity\">\n      <div class=\"bbai-logomark\"><i class=\"material-icons\">auto_awesome</i></div>\n      <div class=\"bbai-brand\">\n        <strong>Blockbench AI</strong>\n        <span>Tu asistente de modelado</span>\n      </div>\n    </div>\n    <button class=\"bbai-icon-button\" type=\"button\" @click=\"view === 'settings' ? view = 'chat' : openSettings()\" :title=\"view === 'settings' ? 'Volver al chat' : 'Configuración'\" :aria-label=\"view === 'settings' ? 'Volver al chat' : 'Configuración'\">\n      <i class=\"material-icons\">{{ view === 'settings' ? 'close' : 'tune' }}</i>\n    </button>\n  </header>\n  <nav class=\"bbai-tabs\" aria-label=\"Secciones de Blockbench AI\">\n    <button type=\"button\" :class=\"{active: view === 'chat'}\" @click=\"view = 'chat'\"><i class=\"material-icons\">chat_bubble_outline</i> Chat</button>\n    <button type=\"button\" :class=\"{active: view === 'settings'}\" @click=\"openSettings()\"><i class=\"material-icons\">settings</i> Ajustes</button>\n    <span class=\"bbai-version\">v0.5</span>\n  </nav>\n\n  <template v-if=\"view === 'settings'\">\n    <div class=\"bbai-settings-view\">\n      <div class=\"bbai-section-intro\">\n        <div class=\"bbai-section-icon\"><i class=\"material-icons\">tune</i></div>\n        <h3>Configurar IA</h3>\n        <p>Elige tu proveedor y conecta un modelo compatible con herramientas.</p>\n      </div>\n      <div class=\"bbai-config-card\">\n        <label class=\"bbai-field\">\n          <span>Proveedor</span>\n          <select v-model=\"provider\" @change=\"changeProvider\">\n            <option value=\"gemini\">Google Gemini · plan gratuito</option>\n            <option value=\"cloudflare\">Cloudflare · Qwen Workers AI</option>\n            <option value=\"groq\">Groq · plan gratuito</option>\n            <option value=\"openai\">OpenAI</option>\n            <option value=\"custom\">Personalizado / local</option>\n          </select>\n        </label>\n        <label v-if=\"provider === 'cloudflare'\" class=\"bbai-field\">\n          <span>Cloudflare Account ID</span>\n          <input v-model.trim=\"cloudflareAccount\" @input=\"updateCloudflareEndpoint()\" spellcheck=\"false\" maxlength=\"32\" placeholder=\"32 caracteres hexadecimales\">\n          <small>Solo se usa para construir la URL de Workers AI. No es tu token secreto.</small>\n        </label>\n        <label class=\"bbai-field\">\n          <span>Modelo</span>\n          <input v-model.trim=\"model\" type=\"text\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"openai/gpt-oss-120b\">\n          <small>Usa el identificador exacto indicado por tu proveedor.</small>\n        </label>\n        <label class=\"bbai-field\">\n          <span>Endpoint de Chat Completions</span>\n          <input v-model.trim=\"endpoint\" type=\"url\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"https://.../chat/completions\">\n        </label>\n        <label class=\"bbai-field\">\n          <span>API key <em>Solo esta sesión</em></span>\n          <input v-model=\"apiKey\" type=\"password\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"Introduce tu API key\">\n          <small>Tu clave no se guarda en el proyecto ni en las preferencias de Blockbench.</small>\n        </label>\n      </div>\n      <div class=\"bbai-notice\"><i class=\"material-icons\">verified_user</i><p>Los mensajes y un resumen del modelo se envían al endpoint elegido. Usa únicamente proveedores en los que confíes.</p></div>\n      <div v-if=\"connectionStatus\" class=\"bbai-connection-status\" role=\"status\" :class=\"connectionResult\">{{ connectionStatus }}</div>\n      <button type=\"button\" class=\"bbai-secondary-button\" @click=\"testConnection()\" :disabled=\"testingConnection || busy\"><i class=\"material-icons\">wifi_tethering</i> {{ testingConnection ? 'Comprobando...' : 'Probar conexión' }}</button>\n      <button type=\"button\" class=\"bbai-primary-button bbai-save\" @click=\"saveSettings()\">\n        <i class=\"material-icons\">check</i> Guardar configuración\n      </button>\n      <p class=\"bbai-settings-foot\">También encontrarás proveedor, modelo y endpoint en la pestaña <strong>Settings</strong> del plugin. La clave se introduce aquí o mediante su botón de configuración.</p>\n    </div>\n  </template>\n\n  <template v-else>\n    <div class=\"bbai-context-bar\">\n      <span class=\"bbai-live-dot\"></span>\n      <span class=\"bbai-context-project\" :title=\"projectLabel\">{{ projectLabel }}</span>\n      <button class=\"bbai-icon-button bbai-reset\" type=\"button\" @click=\"resetChat()\" :disabled=\"busy\" title=\"Nueva conversación\" aria-label=\"Nueva conversación\"><i class=\"material-icons\">edit_square</i></button>\n    </div>\n\n    <main class=\"bbai-conversation\" ref=\"history\" aria-live=\"polite\">\n      <div v-if=\"!messages.length\" class=\"bbai-welcome\">\n        <div class=\"bbai-welcome-badge\"><i class=\"material-icons\">auto_awesome</i><span>Tu espacio creativo</span></div>\n        <div class=\"bbai-orb\"><i class=\"material-icons\">view_in_ar</i></div>\n        <h2>Imagina. Describe.<br><span>Construye.</span></h2>\n        <p>Tu modelo empieza con una idea. Pídeme que cree geometrías, organice partes o edite los cubos de tu proyecto.</p>\n        <div class=\"bbai-suggestions\">\n          <button type=\"button\" @click=\"generateLocalDemo()\"><i class=\"material-icons\">offline_bolt</i><span>Demo local · Sin IA / API</span><i class=\"material-icons bbai-chevron\">north_east</i></button>\n          <button type=\"button\" @click=\"useSuggestion('Crea un pequeño robot con cabeza, torso, brazos y piernas. Organiza sus partes en grupos.')\"><i class=\"material-icons\">smart_toy</i><span>Crear un robot</span><i class=\"material-icons bbai-chevron\">north_east</i></button>\n          <button type=\"button\" @click=\"useSuggestion('Diseña una espada medieval con hoja, guarda, empuñadura y pomo usando cubos.')\"><i class=\"material-icons\">auto_fix_high</i><span>Diseñar una espada</span><i class=\"material-icons bbai-chevron\">north_east</i></button>\n          <button type=\"button\" @click=\"useSuggestion('Inspecciona el modelo actual y dime cómo están organizados sus elementos.')\"><i class=\"material-icons\">account_tree</i><span>Analizar el modelo</span><i class=\"material-icons bbai-chevron\">north_east</i></button>\n        </div>\n      </div>\n\n      <article v-for=\"(message, index) in messages\" :key=\"index\" class=\"bbai-entry\" :class=\"'bbai-entry-' + message.role\">\n        <div class=\"bbai-entry-meta\">\n          <span v-if=\"message.role === 'assistant'\" class=\"bbai-entry-avatar\"><i class=\"material-icons\">auto_awesome</i></span>\n          <span v-else class=\"bbai-user-avatar\"><i class=\"material-icons\">person</i></span>\n          <strong>{{ message.role === 'user' ? 'Tú' : 'Blockbench AI' }}</strong>\n        </div>\n        <div class=\"bbai-entry-text\">{{ message.content }}</div>\n      </article>\n      <div v-if=\"busy\" class=\"bbai-active-step\" role=\"status\">\n        <span class=\"bbai-thinking-icon\"><i class=\"material-icons\">auto_awesome</i></span>\n        <div><strong>Trabajando en tu modelo</strong><span>{{ status }}</span></div>\n        <span class=\"bbai-pulse-dot\"></span>\n      </div>\n    </main>\n\n    <div class=\"bbai-bottom\">\n      <div v-if=\"!apiKey\" class=\"bbai-setup-hint\"><i class=\"material-icons\">key</i><span>¿Aún no conectas tu IA?</span><button type=\"button\" @click=\"openSettings()\">Configurar</button></div>\n      <form class=\"bbai-composer\" @submit.prevent=\"send()\">\n        <textarea v-model=\"prompt\" :disabled=\"busy\" @keydown.enter.exact.prevent=\"send()\" placeholder=\"Describe lo que quieres crear...\" rows=\"3\" maxlength=\"4000\" aria-label=\"Mensaje para Blockbench AI\"></textarea>\n        <div class=\"bbai-compose-toolbar\">\n          <span class=\"bbai-compose-tip\"><i class=\"material-icons\">deployed_code</i> Geometría editable</span>\n          <button v-if=\"busy\" class=\"bbai-stop-button\" type=\"button\" @click=\"cancel()\" title=\"Cancelar solicitud\"><i class=\"material-icons\">stop</i> Detener</button>\n          <button v-else class=\"bbai-send-button\" type=\"submit\" :disabled=\"!prompt.trim()\" title=\"Enviar mensaje\" aria-label=\"Enviar mensaje\"><i class=\"material-icons\">arrow_upward</i></button>\n        </div>\n      </form>\n      <div class=\"bbai-footer\"><span>Enter para enviar · Shift + Enter para nueva línea</span><span class=\"bbai-footer-status\"><i class=\"material-icons\">history</i> Undo</span></div>\n    </div>\n  </template>\n</section>";

  function makeComponent() {
    const prefs = settingsSnapshot();
    return {
      template: TEMPLATE,
      data: function () {
        return {provider: prefs.provider, cloudflareAccount: prefs.cloudflareAccount, endpoint: prefs.endpoint, model: prefs.model, apiKey: sessionApiKey,
          view: 'chat', prompt: '', status: '', busy: false, showSettings: false,
          testingConnection: false, connectionStatus: '', connectionResult: '',
          messages: [], history: [], projectIdentity: null, steps: 0};
      },
      computed: {
        projectLabel: function () {
          try {return Project && Format ? ((Project.name || 'Untitled') + ' · ' + (Format.id || 'model')) : 'No project open';}
          catch (_) {return 'No project open';}
        }
      },
      methods: {
        refreshConfiguration: function () {
          const prefs = settingsSnapshot();
          this.provider = prefs.provider;
          this.cloudflareAccount = prefs.cloudflareAccount;
          this.endpoint = prefs.endpoint;
          this.model = prefs.model;
        },
        syncKey: function () {this.apiKey = sessionApiKey;},
        openSettings: function () {this.refreshConfiguration(); this.syncKey(); this.view = 'settings';},
        changeProvider: function () {
          if (this.provider === 'groq') {
            this.endpoint = GROQ_ENDPOINT;
            this.model = 'openai/gpt-oss-120b';
          } else if (this.provider === 'gemini') {
            this.endpoint = GEMINI_ENDPOINT;
            this.model = 'gemini-3.8-flash';
          } else if (this.provider === 'cloudflare') {
            this.model = CLOUDFLARE_MODEL;
            this.updateCloudflareEndpoint();
          } else if (this.provider === 'openai') {
            this.endpoint = DEFAULT_ENDPOINT;
            this.model = 'gpt-4.1-mini';
          }
        },
        updateCloudflareEndpoint: function () {
          if (this.provider === 'cloudflare') this.endpoint = validCloudflareAccount(this.cloudflareAccount) ? cloudflareEndpoint(this.cloudflareAccount) : '';
        },
        testConnection: async function () {
          if (this.testingConnection || this.busy) return;
          this.testingConnection=true;
          this.connectionResult='';
          this.connectionStatus='Comprobando autenticación y compatibilidad...';
          try {
            const result=await checkProviderConnection({
              provider:this.provider,cloudflareAccount:this.cloudflareAccount,endpoint:this.endpoint,
              model:this.model,apiKey:String(this.apiKey || sessionApiKey || '').trim()
            });
            this.connectionResult='success';
            this.connectionStatus='Conexión correcta con '+result.model+'. La compatibilidad con herramientas se comprobará al modelar.';
          } catch(error){
            this.connectionResult='error';
            this.connectionStatus=safeError(error.message || error);
          } finally {this.testingConnection=false;}
        },
        saveSettings: function () {
          try {
            storeConfiguration({provider: this.provider, cloudflareAccount: this.cloudflareAccount, endpoint: this.endpoint, model: this.model});
            sessionApiKey = typeof this.apiKey === 'string' ? this.apiKey.trim() : '';
            this.view = 'chat';
            Blockbench.showQuickMessage('Configuración actualizada');
          } catch (error) {Blockbench.showQuickMessage(safeError(error.message));}
        },
        generateLocalDemo: function () {
          if (this.busy) return;
          try {
            activeProject();
            const result=detailedHumanoid({
              name:'Android Villager · Offline Demo',
              style:'android_villager',
              primary:'#627786',secondary:'#273944',accent:'#4ED2E8',skin:'#BA9B79'
            },{project:Project,remainingCubes:MAX_CUBES_PER_RUN,toolCalls:0});
            this.messages.push({role:'assistant',content:
              'Demo local creada sin consumir tokens ni usar una API.\n'+
              'Piezas: '+result.created_count+' · textura PNG: '+result.texture.name+
              ' · grupos: '+result.subgroups+'. Puedes inspeccionar el atlas de texturas y deshacer la generación con Ctrl+Z.'});
            this.scrollBottom();
          } catch(error) {
            this.messages.push({role:'assistant',content:'Error en demo local: '+safeError(error.message)});
            this.scrollBottom();
          }
        },
        useSuggestion: function (value) {this.prompt = value;},
        example: function () {this.useSuggestion('Crea un robot de cubos con cabeza, torso, brazos y piernas.');},
        resetChat: function () {this.messages = []; this.history = []; this.projectIdentity = null;},
        scrollBottom: function () {
          this.$nextTick(() => {
            const el = this.$refs.history;
            if (el) el.scrollTop = el.scrollHeight;
          });
        },
        cancel: function () {
          if (runningController) runningController.abort();
          this.status = 'Stopping...';
        },
        send: async function () {
          if (this.busy || !this.prompt.trim()) return;
          const text = this.prompt.trim().slice(0, 4000);
          this.prompt = '';
          const current = typeof Project !== 'undefined' ? Project : null;
          if (this.projectIdentity && this.projectIdentity !== current) this.resetChat();
          this.projectIdentity = current;
          const past = this.history.slice();
          const config = settingsSnapshot();
          this.messages.push({role: 'user', content: text});
          this.busy = true;
          this.status = 'Preparing...';
          runningController = new AbortController();
          const controller = runningController;
          this.scrollBottom();
          try {
            const answer = await perform(text, {endpoint: config.endpoint, model: config.model,
              apiKey: sessionApiKey || this.apiKey, history: past}, (s) => {this.status = s; this.scrollBottom();}, controller.signal);
            this.messages.push({role: 'assistant', content: answer});
            this.history = past.concat([{role: 'user', content: text}, {role: 'assistant', content: answer}]).slice(-12);
          } catch (error) {
            const msg = controller.signal.aborted ? 'Canceled. Any completed edits can be undone in Blockbench.' : safeError(error.message);
            this.messages.push({role: 'assistant', content: 'Error: ' + msg});
          } finally {
            if (runningController === controller) runningController = null;
            this.busy = false;
            this.status = '';
            this.scrollBottom();
          }
        }
      }
    };
  }

  const CSS = "\n.bbai-root{--bbai-line:var(--color-border,#363b46);--bbai-text:var(--color-text,#e5e8f0);--bbai-muted:var(--color-text,#a4a9b7);--bbai-bg:var(--color-back,#171a20);--bbai-surface:var(--color-ui,#242832);--bbai-accent:var(--color-accent,#688df4);height:100%;min-height:240px;display:flex;flex-direction:column;overflow:hidden;background:var(--bbai-bg);color:var(--bbai-text);font-family:inherit;font-size:12px}\n.bbai-root *{box-sizing:border-box}.bbai-root button,.bbai-root input,.bbai-root select,.bbai-root textarea{font:inherit}.bbai-root button{cursor:pointer}.bbai-root button:disabled{opacity:.4;cursor:not-allowed}\n.bbai-root .material-icons{font-size:16px;line-height:1;vertical-align:middle}\n.bbai-topbar{min-height:59px;padding:11px 15px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bbai-line)}\n.bbai-identity{display:flex;align-items:center;gap:10px;min-width:0}.bbai-logomark{height:34px;width:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--bbai-accent),transparent 69%);border-radius:11px;background:color-mix(in srgb,var(--bbai-accent),transparent 87%);color:var(--bbai-accent)}\n.bbai-logomark .material-icons{font-size:20px}.bbai-brand{display:flex;flex-direction:column;gap:4px;min-width:0}.bbai-brand strong{font-size:13px;letter-spacing:-.1px}.bbai-brand span{font-size:10px;color:var(--bbai-muted);opacity:.66}\n.bbai-icon-button{background:transparent;color:var(--bbai-text);border:0;width:29px;height:29px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:background .16s,color .16s}\n.bbai-icon-button:hover{background:var(--bbai-surface);color:var(--bbai-accent)}.bbai-tabs{height:39px;display:flex;align-items:stretch;padding:0 12px;gap:5px;border-bottom:1px solid var(--bbai-line)}\n.bbai-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;padding:0 10px;color:var(--bbai-muted);opacity:.65;display:flex;align-items:center;gap:7px;font-size:11px;font-weight:500}\n.bbai-tabs button.active{border-bottom-color:var(--bbai-accent);color:var(--bbai-text);opacity:1}.bbai-tabs button:hover{opacity:1}.bbai-tabs .material-icons{font-size:14px}\n.bbai-version{margin:auto 2px auto auto;opacity:.42;font-size:10px}.bbai-context-bar{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 13px;background:color-mix(in srgb,var(--bbai-surface),transparent 50%);border-bottom:1px solid var(--bbai-line)}\n.bbai-live-dot{width:6px;height:6px;border-radius:50%;background:#45c7a2;box-shadow:0 0 0 3px rgba(69,199,162,.1);flex-shrink:0}\n.bbai-context-project{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;font-size:10px;opacity:.74}\n.bbai-context-bar .bbai-reset{width:24px;height:24px}.bbai-conversation{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;overscroll-behavior:contain;padding:16px 13px 21px;display:flex;flex-direction:column;gap:18px}\n.bbai-welcome{margin:auto 0;display:flex;flex-direction:column;align-items:center;text-align:center;padding:16px 5px 6px}\n.bbai-welcome-badge{display:flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--bbai-line);border-radius:99px;color:var(--bbai-muted);opacity:.87;font-size:10px}\n.bbai-welcome-badge .material-icons{font-size:13px;color:var(--bbai-accent)}.bbai-orb{margin:20px 0 14px;width:66px;height:66px;border-radius:22px;display:grid;place-items:center;background:radial-gradient(circle at 25% 25%,color-mix(in srgb,var(--bbai-accent),transparent 76%),transparent 70%),var(--bbai-surface);border:1px solid var(--bbai-line);box-shadow:0 12px 36px rgba(0,0,0,.08)}\n.bbai-orb .material-icons{font-size:34px;color:var(--bbai-accent)}.bbai-welcome h2{margin:0;font-size:21px;line-height:1.24;font-weight:700;letter-spacing:-.6px}.bbai-welcome h2 span{color:var(--bbai-accent)}\n.bbai-welcome p{margin:12px 0 20px;max-width:280px;line-height:1.65;color:var(--bbai-muted);opacity:.72;font-size:11px}.bbai-suggestions{width:100%;display:flex;flex-direction:column;gap:7px}\n.bbai-suggestions button{border:1px solid var(--bbai-line);background:var(--bbai-surface);color:var(--bbai-text);border-radius:10px;text-align:left;min-height:42px;padding:0 11px;display:flex;align-items:center;gap:9px;transition:border-color .15s,transform .15s}\n.bbai-suggestions button:hover{border-color:var(--bbai-accent);transform:translateY(-1px)}.bbai-suggestions button .material-icons:first-child{color:var(--bbai-accent)}.bbai-suggestions button span{flex:1;font-size:11px}\n.bbai-suggestions .bbai-chevron{font-size:13px;opacity:.4}.bbai-entry{display:flex;flex-direction:column;gap:8px;min-width:0}.bbai-entry-meta{display:flex;gap:7px;align-items:center}.bbai-entry-meta strong{font-size:10px;opacity:.82}\n.bbai-entry-avatar,.bbai-user-avatar{width:22px;height:22px;border:1px solid var(--bbai-line);border-radius:7px;display:grid;place-items:center;background:var(--bbai-surface);color:var(--bbai-accent)}\n.bbai-user-avatar{color:var(--bbai-text)}.bbai-entry-avatar .material-icons,.bbai-user-avatar .material-icons{font-size:14px}\n.bbai-entry-text{white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;font-size:12px;line-height:1.7;padding-left:29px}.bbai-entry-user .bbai-entry-text{padding:10px 12px;margin-left:29px;background:var(--bbai-surface);border:1px solid var(--bbai-line);border-radius:11px}\n.bbai-active-step{display:flex;align-items:center;gap:9px;background:var(--bbai-surface);border:1px solid var(--bbai-line);border-radius:10px;padding:11px}\n.bbai-active-step>div{display:flex;flex:1;min-width:0;flex-direction:column;gap:5px}.bbai-active-step strong{font-size:11px}.bbai-active-step div span{font-size:10px;opacity:.7;overflow-wrap:anywhere}\n.bbai-thinking-icon{color:var(--bbai-accent)}.bbai-thinking-icon .material-icons{font-size:19px;animation:bbai-shimmer 1.8s ease-in-out infinite}\n.bbai-pulse-dot{width:6px;height:6px;flex-shrink:0;border-radius:50%;background:var(--bbai-accent);animation:bbai-shimmer 1.4s ease-in-out infinite}\n@keyframes bbai-shimmer{50%{opacity:.35;transform:scale(.94)}}.bbai-bottom{padding:8px 10px 11px;border-top:1px solid var(--bbai-line);background:var(--bbai-bg)}\n.bbai-setup-hint{margin-bottom:8px;display:flex;align-items:center;gap:5px;background:color-mix(in srgb,var(--bbai-accent),transparent 91%);padding:9px 8px;border:1px solid color-mix(in srgb,var(--bbai-accent),transparent 79%);border-radius:8px;font-size:10px}\n.bbai-setup-hint .material-icons{font-size:14px;color:var(--bbai-accent)}.bbai-setup-hint span{flex:1;min-width:0}.bbai-setup-hint button{background:none;border:0;color:var(--bbai-accent);font-weight:700;font-size:10px;padding:2px}\n.bbai-composer{border:1px solid var(--bbai-line);background:var(--bbai-surface);border-radius:12px;padding:8px 9px 7px;transition:border-color .15s}\n.bbai-composer:focus-within{border-color:var(--bbai-accent)}.bbai-composer textarea{width:100%;min-height:46px;max-height:180px;resize:vertical;border:0;outline:none;background:transparent;color:var(--bbai-text);font-size:12px;line-height:1.5;display:block;padding:2px 0;scrollbar-width:thin}\n.bbai-composer textarea::placeholder{opacity:.45;color:var(--bbai-text)}.bbai-compose-toolbar{display:flex;align-items:center;justify-content:space-between;margin-top:5px;gap:7px}\n.bbai-compose-tip{font-size:10px;display:flex;align-items:center;gap:5px;opacity:.6}.bbai-compose-tip .material-icons{font-size:13px}\n.bbai-send-button,.bbai-stop-button{height:28px;min-width:28px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:var(--bbai-accent);color:#fff}\n.bbai-stop-button{gap:5px;padding:0 9px;background:var(--bbai-line);color:var(--bbai-text)}.bbai-footer{display:flex;justify-content:space-between;gap:3px;margin:8px 2px 0;color:var(--bbai-muted);opacity:.47;font-size:9px}\n.bbai-footer-status{display:flex;align-items:center;gap:4px;white-space:nowrap}.bbai-footer .material-icons{font-size:12px}\n.bbai-settings-view{overflow-y:auto;flex:1;min-height:0;padding:17px 13px 20px;scrollbar-width:thin}.bbai-section-intro{text-align:left;margin-bottom:17px}\n.bbai-section-icon{width:35px;height:35px;border-radius:10px;display:grid;place-items:center;color:var(--bbai-accent);background:var(--bbai-surface);border:1px solid var(--bbai-line)}\n.bbai-section-intro h3{font-size:17px;letter-spacing:-.3px;margin:12px 0 6px}.bbai-section-intro p{font-size:11px;line-height:1.55;opacity:.65;margin:0}\n.bbai-config-card{padding:13px;border:1px solid var(--bbai-line);border-radius:12px;background:var(--bbai-surface);display:flex;flex-direction:column;gap:16px}\n.bbai-field{display:flex;flex-direction:column;gap:7px;min-width:0}.bbai-field>span{font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:5px}\n.bbai-field em{font-size:9px;font-style:normal;font-weight:400;opacity:.6}\n.bbai-field input,.bbai-field select{background:var(--bbai-bg);color:var(--bbai-text);border:1px solid var(--bbai-line);border-radius:8px;padding:10px 9px;font-size:11px;min-width:0;width:100%;outline:none}\n.bbai-field input:focus,.bbai-field select:focus{border-color:var(--bbai-accent)}.bbai-field small{font-size:10px;opacity:.6;line-height:1.5}\n.bbai-notice{display:flex;gap:9px;padding:13px 10px;border:1px solid var(--bbai-line);border-radius:10px;margin-top:12px;align-items:start}\n.bbai-notice .material-icons{color:var(--bbai-accent);flex-shrink:0}.bbai-notice p{margin:0;font-size:10px;line-height:1.55;opacity:.73}\n.bbai-primary-button{background:var(--bbai-accent);color:white;border:0;border-radius:9px;display:flex;align-items:center;justify-content:center;gap:7px;padding:11px;width:100%;font-size:11px;font-weight:600}\n.bbai-save{margin-top:14px}.bbai-settings-foot{font-size:10px;line-height:1.6;opacity:.6;margin:13px 2px 0}\n@media(max-width:290px){.bbai-brand span,.bbai-footer-status{display:none}.bbai-welcome h2{font-size:18px}.bbai-section-intro h3{font-size:15px}}\n";

  const EXTRA_CSS = '.bbai-secondary-button{background:var(--bbai-surface);color:var(--bbai-text);border:1px solid var(--bbai-line);border-radius:9px;padding:11px;width:100%;display:flex;align-items:center;justify-content:center;gap:7px;margin-top:11px;font-size:11px}.bbai-secondary-button:hover{border-color:var(--bbai-accent)}.bbai-connection-status{font-size:11px;line-height:1.5;padding:9px 10px;margin-top:12px;border-radius:9px;background:var(--bbai-surface);border:1px solid var(--bbai-line);overflow-wrap:anywhere}.bbai-connection-status.success{border-color:#478d77;color:#6bd1a2}.bbai-connection-status.error{border-color:#96575d;color:#f4a3a8}';

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
      style = Blockbench.addCSS(CSS + '\n' + EXTRA_CSS);
      panel = new Panel('blockbench_ai_panel', {
        name: 'Blockbench AI',
        icon: 'auto_awesome',
        plugin: ID,
        growable: true,
        resizable: true,
        min_height: 240,
        default_position: {slot: 'right_bar', height: 550},
        component: makeComponent()
      });
      action = new Action('blockbench_ai_open', {
        name: 'Blockbench AI',
        description: 'Open the Blockbench AI modeling assistant',
        icon: 'auto_awesome',
        click: function () {
          if (panel && typeof panel.show === 'function') panel.show();
          else Blockbench.showQuickMessage('Open Blockbench AI from the sidebar.');
        }
      });
      MenuBar.menus.tools.addAction(action);
    },
    onunload: function () {
      if (runningController) runningController.abort();
      runningController = null;
      if (action) {action.delete(); action = null;}
      if (panel) {panel.delete(); panel = null;}
      if (style) {style.delete(); style = null;}
      unregisterPreferences();
    }
  });
})();
