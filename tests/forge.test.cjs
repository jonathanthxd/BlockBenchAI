'use strict';
// BlockBenchAI FORGE — regression suite for the new Geometry Engine,
// incremental Texture Engine, hierarchy safety and the 8 visual benchmarks.
// Host mocks mirror tests/plugin.test.cjs; the canvas mock additionally
// records drawImage so both retouch paths (bitmap copy vs deterministic
// repaint) are exercised.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'blockbench_ai.js'), 'utf8');

function makeHost(fetchImpl, withDrawImage) {
  let nextId = 0;
  const uuid = () => 'test-' + ++nextId;
  const transactions = [];
  let plugin = null;
  let panel = null;
  const canvases = [];
  class Cube {
    static all = [];
    static isTypePermitted() { return true; }
    constructor(spec) {
      this.uuid = uuid();
      this.faces = Object.fromEntries(['north', 'south', 'east', 'west', 'up', 'down'].map(x => [x, { texture: false, uv: [0, 0, 16, 16] }]));
      Object.assign(this, { selected: false, locked: false, from: [0, 0, 0], to: [1, 1, 1], origin: [0, 0, 0], rotation: [0, 0, 0], name: 'cube', color: 0 }, spec);
    }
    init() { Cube.all.push(this); return this; }
    setUVMode(value) { this.box_uv = value; }
    addTo(group) { this.parent = group === 'root' ? null : group; return this; }
    remove() { Cube.all = Cube.all.filter(c => c !== this); }
  }
  class Texture {
    static all = [];
    constructor(spec) { this.uuid = uuid(); this.name = spec.name; this.width = spec.width; this.height = spec.height; }
    fromDataURL(url) { this.source = url; return this; }
    add() { Texture.all.push(this); return this; }
    remove() { Texture.all = Texture.all.filter(t => t !== this); }
    getUVWidth() { return 16; }
    getUVHeight() { return 16; }
  }
  class Group {
    static all = [];
    constructor(spec) { this.uuid = uuid(); this.name = spec.name; this.locked = false; }
    init() { Group.all.push(this); return this; }
    addTo(group) { this.parent = group === 'root' ? null : group; return this; }
    remove() { Group.all = Group.all.filter(g => g !== this); }
  }
  class Setting {
    constructor(id, options) { this.id = id; this.value = options.value; this.plugin = options.plugin; this.onChange = options.onChange; }
    set(value) { this.value = value; if (this.onChange) this.onChange(value); }
    delete() {}
  }
  class Dialog {
    constructor(id, options) { this.id = id; this.options = options; }
    show() { return this; }
  }
  const document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0, height: 0, commands: [], draws: [],
        getContext(contextType) {
          assert.equal(contextType, '2d');
          const ctx = { fillStyle: '#000', fillRect(x, y, w, h) { canvas.commands.push({ x, y, w, h, color: String(ctx.fillStyle).toLowerCase() }); } };
          if (withDrawImage) ctx.drawImage = function (src, dx, dy) { canvas.draws.push({ src, dx, dy }); };
          return ctx;
        },
        toDataURL(type) {
          assert.equal(type, 'image/png');
          return 'data:image/png;base64,' + Buffer.from(JSON.stringify({ w: this.width, h: this.height, n: this.commands.length })).toString('base64');
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  const world = {
    Cube, Group, Texture, Setting, Dialog, document,
    Project: { uuid: 'project-1', name: 'Forge lab', texture_width: 16, texture_height: 16 },
    Format: { id: 'free', cubes: true },
    Plugin: { register(id, cfg) { assert.equal(id, 'blockbench_ai'); plugin = cfg; } },
    Panel: class { constructor(id, cfg) { panel = cfg; } delete() {} show() {} },
    Action: class { delete() {} },
    MenuBar: { menus: { tools: { addAction() {} } } },
    Blockbench: { addCSS() { return { delete() {} }; }, showQuickMessage() {} },
    Undo: {
      initEdit(value) { transactions.push({ stage: 'init', value }); },
      finishEdit(name, value) { transactions.push({ stage: 'finish', name, value }); },
      cancelEdit() { transactions.push({ stage: 'cancel' }); },
    },
    Canvas: { updateView() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    URL, AbortController, console,
    fetch: fetchImpl,
    setTimeout, clearTimeout,
  };
  vm.runInNewContext(source, world, { filename: 'blockbench_ai.js' });
  plugin.onload();
  const component = panel.component;
  function view() {
    const state = Object.assign(component.data(), { $refs: {}, $nextTick(callback) { callback.call(this); } });
    for (const [key, value] of Object.entries(component.methods)) state[key] = value.bind(state);
    return state;
  }
  return { world, panel, plugin, view, transactions, canvases };
}

const toolCall = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
function answer(message) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }) };
}
function aiOnce(toolName, toolArgs, finalContent) {
  let n = 0;
  let toolResult = null;
  const fetch = async (_url, req) => {
    n++;
    if (n === 1) return answer({ content: null, tool_calls: [toolCall('t1', toolName, toolArgs)] });
    toolResult = JSON.parse(JSON.parse(req.body).messages.at(-1).content);
    return answer({ content: finalContent || 'ok' });
  };
  return { fetch, calls: () => n, result: () => toolResult };
}

test('geometry prompts expose mirror, array, transform, hierarchy and extrude tools', async () => {
  let tools;
  const host = makeHost(async (_url, opts) => { tools = JSON.parse(opts.body).tools.map(t => t.function.name); return answer({ content: 'ok' }); });
  new host.world.Cube({ name: 'seed' }).init();
  const v = host.view();
  v.apiKey = 'k';
  v.prompt = 'Aplica simetria espejo y repite el modelo';
  await v.send();
  for (const name of ['inspect_scene', 'mirror_cubes', 'repeat_array', 'transform_selection', 'organize_hierarchy', 'extrude_profile']) {
    assert.ok(tools.includes(name), 'missing tool ' + name);
  }
  assert.ok(!tools.includes('generate_character'));
});

test('mirror_cubes copies geometry across the YZ plane', async () => {
  let seedUuid = '';
  let toolResult = null;
  let n = 0;
  const host = makeHost(async (_url, req) => {
    n++;
    if (n === 1) return answer({ content: null, tool_calls: [toolCall('m', 'mirror_cubes', { uuids: [seedUuid], axis: 'x', plane: 0, copy: true })] });
    toolResult = JSON.parse(JSON.parse(req.body).messages.at(-1).content);
    return answer({ content: 'mirrored' });
  });
  const seed = new host.world.Cube({ name: 'wing', from: [2, 0, -1], to: [6, 1, 1] }).init();
  seedUuid = seed.uuid;
  const v = host.view();
  v.apiKey = 'k';
  v.prompt = 'duplica con simetria';
  await v.send();
  assert.equal(toolResult.ok, true, JSON.stringify(toolResult).slice(0, 200));
  assert.equal(host.world.Cube.all.length, 2);
  const copy = host.world.Cube.all.find(c => c.uuid !== seed.uuid);
  assert.deepEqual(Array.from(copy.from), [-6, 0, -1]);
  assert.deepEqual(Array.from(copy.to), [-2, 1, 1]);
  assert.equal(host.transactions.filter(t => t.stage === 'finish').length, 1);
  assert.match(v.oplog.join(' '), /Simetr/);
  assert.equal(v.phase, 'done');
});

test('mirror_cubes edits in place when copy is false', async () => {
  const seed = { cube: null };
  const sim = aiOnce('mirror_cubes', { uuids: ['test-1'], axis: 'z', plane: 1, copy: false }, 'done');
  const host = makeHost(sim.fetch);
  seed.cube = new host.world.Cube({ name: 'fin', from: [0, 0, 2], to: [1, 1, 4] }).init();
  const v = host.view();
  v.apiKey = 'k';
  v.prompt = 'espejo en su lugar';
  await v.send();
  assert.equal(sim.result().ok, true);
  assert.equal(host.world.Cube.all.length, 1);
  assert.deepEqual(Array.from(seed.cube.from), [0, 0, -2]);
  assert.deepEqual(Array.from(seed.cube.to), [1, 1, 0]);
});

test('mirror_cubes rejects a plane outside the build volume', async () => {
  const host = makeHost(null);
  const seed = new host.world.Cube({ name: 'a', from: [0, 0, 0], to: [1, 1, 1] }).init();
  const sim = aiOnce('mirror_cubes', { uuids: [seed.uuid], axis: 'x', plane: 600 }, 'done');
  const host2 = makeHost(sim.fetch);
  host2.world.Cube.all.push(seed);
  const v = host2.view();
  v.apiKey = 'k';
  v.prompt = 'espejo imposible';
  await v.send();
  assert.equal(sim.result().ok, false);
  assert.match(sim.result().error, /512/);
});

test('repeat_array builds numbered copies with spacing', async () => {
  const host = makeHost(null);
  const seed = new host.world.Cube({ name: 'pilar', from: [0, 0, 0], to: [1, 4, 1] }).init();
  const sim = aiOnce('repeat_array', { uuids: [seed.uuid], count: 3, spacing: [2, 0, 0] }, 'done');
  const host2 = makeHost(sim.fetch);
  host2.world.Cube.all.push(seed);
  const v = host2.view();
  v.apiKey = 'k';
  v.prompt = 'repite en fila';
  await v.send();
  assert.equal(sim.result().ok, true);
  assert.equal(host2.world.Cube.all.length, 3);
  const names = host2.world.Cube.all.map(c => c.name);
  assert.ok(names.includes('pilar x2'));
  assert.ok(names.includes('pilar x3'));
  const far = host2.world.Cube.all.find(c => c.name === 'pilar x3');
  assert.deepEqual(Array.from(far.from), [4, 0, 0]);
});

test('repeat_array rejects zero spacing and unit counts', async () => {
  const host = makeHost(null);
  const seed = new host.world.Cube({ name: 'a', from: [0, 0, 0], to: [1, 1, 1] }).init();
  const sim = aiOnce('repeat_array', { uuids: [seed.uuid], count: 3, spacing: [0, 0, 0] }, 'done');
  const host2 = makeHost(sim.fetch);
  host2.world.Cube.all.push(seed);
  const v = host2.view();
  v.apiKey = 'k';
  v.prompt = 'repite quieto';
  await v.send();
  assert.equal(sim.result().ok, false);
  assert.match(sim.result().error, /Spacing/);
});

test('transform_selection translates and scales around the center', async () => {
  const host = makeHost(null);
  const seed = new host.world.Cube({ name: 'box', from: [0, 0, 0], to: [2, 2, 2] }).init();
  const sim = aiOnce('transform_selection', { edits: [{ uuid: seed.uuid, translate: [1, 0, 0], scale: [2, 1, 1] }] }, 'done');
  const host2 = makeHost(sim.fetch);
  host2.world.Cube.all.push(seed);
  const v = host2.view();
  v.apiKey = 'k';
  v.prompt = 'mueve y escala';
  await v.send();
  assert.equal(sim.result().ok, true);
  assert.deepEqual(Array.from(seed.from), [0, 0, 0]);
  assert.deepEqual(Array.from(seed.to), [4, 2, 2]);
  assert.equal(host2.transactions.filter(t => t.stage === 'finish').length, 1);
});

test('transform_selection rejects non-positive scales', async () => {
  const host = makeHost(null);
  const seed = new host.world.Cube({ name: 'a', from: [0, 0, 0], to: [1, 1, 1] }).init();
  const sim = aiOnce('transform_selection', { edits: [{ uuid: seed.uuid, scale: [0, 1, 1] }] }, 'done');
  const host2 = makeHost(sim.fetch);
  host2.world.Cube.all.push(seed);
  const v = host2.view();
  v.apiKey = 'k';
  v.prompt = 'escala imposible';
  await v.send();
  assert.equal(sim.result().ok, false);
  assert.match(sim.result().error, /Scale/);
});

test('organize_hierarchy nests groups and moves cubes with rollback on cycles', async () => {
  const host = makeHost(null);
  const seed = new host.world.Cube({ name: 'gear', from: [0, 0, 0], to: [1, 1, 1] }).init();
  const sim = aiOnce('organize_hierarchy', {
    groups: [{ name: 'Machine' }, { name: 'Gears', parent: 'Machine' }],
    moves: [{ cube: seed.uuid, to: 'Gears' }],
    cleanup_empty: true,
  }, 'done');
  const host2 = makeHost(sim.fetch);
  host2.world.Cube.all.push(seed);
  const v = host2.view();
  v.apiKey = 'k';
  v.prompt = 'organiza la jerarquia';
  await v.send();
  assert.equal(sim.result().ok, true);
  const gears = host2.world.Group.all.find(g => g.name === 'Gears');
  const machine = host2.world.Group.all.find(g => g.name === 'Machine');
  assert.ok(gears && machine);
  assert.equal(gears.parent, machine);
  assert.equal(seed.parent, gears);
  assert.equal(sim.result().data.moved.length, 1);
});

test('organize_hierarchy refuses to nest a group inside itself', async () => {
  const host = makeHost(null);
  const sim = aiOnce('organize_hierarchy', { groups: [{ name: 'A' }], moves: [{ group: 'A', to: 'A' }] }, 'done');
  const host2 = makeHost(sim.fetch);
  const v = host2.view();
  v.apiKey = 'k';
  v.prompt = 'jerarquia imposible';
  await v.send();
  assert.equal(sim.result().ok, false);
  assert.match(sim.result().error, /inside itself/);
  assert.equal(host2.world.Group.all.length, 0, 'failed transaction leaves no orphan groups');
});

test('extrude_profile sweeps a convex triangle into editable boxes', async () => {
  const sim = aiOnce('extrude_profile', {
    name: 'Wedge', profile: [[0, 0], [4, 0], [0, 4]], y_base: 0, height: 2, step: 1, paint: { base: '#8A9BA8', material: 'stone' },
  }, 'done');
  const host = makeHost(sim.fetch);
  const v = host.view();
  v.apiKey = 'k';
  v.prompt = 'extruye un prisma triangular';
  await v.send();
  assert.equal(sim.result().ok, true);
  assert.ok(sim.result().data.created_count >= 6, 'triangle rows produce several boxes, got ' + sim.result().data.created_count);
  assert.equal(host.world.Group.all.length, 1);
  assert.equal(host.world.Texture.all.length, 1, 'extrusion gets a neutral atlas');
  assert.ok(host.world.Cube.all.every(c => c.faces.north.texture === host.world.Texture.all[0].uuid));
});

test('extrude_profile rejects concave polygons with an explanation', async () => {
  const sim = aiOnce('extrude_profile', {
    name: 'Arrow', profile: [[0, 0], [4, 2], [0, 4], [1, 2]], y_base: 0, height: 2,
  }, 'done');
  const host = makeHost(sim.fetch);
  const v = host.view();
  v.apiKey = 'k';
  v.prompt = 'extruye una flecha concava';
  await v.send();
  assert.equal(sim.result().ok, false);
  assert.match(sim.result().error, /convex/i);
  assert.equal(host.world.Cube.all.length, 0);
  assert.equal(host.world.Group.all.length, 0);
});

test('failed painted builds remove orphans: groups, cubes and textures', async () => {
  const sim = aiOnce('build_painted_model', {
    name: 'Broken',
    parts: [
      { name: 'fine', from: [0, 0, 0], to: [1, 1, 1], paint: { base: '#112233' } },
      { name: 'lost', from: [0, 0, 0], to: [1, 1, 1], group: 'missing-group', paint: { base: '#445566' } },
    ],
  }, 'done');
  const host = makeHost(sim.fetch);
  const v = host.view();
  v.apiKey = 'k';
  v.prompt = 'modelo roto';
  await v.send();
  assert.equal(sim.result().ok, false);
  assert.match(sim.result().error, /Unknown group/);
  assert.equal(host.world.Cube.all.length, 0);
  assert.equal(host.world.Group.all.length, 0, 'no orphan root or subgroups');
  assert.equal(host.world.Texture.all.length, 0, 'no orphan atlas');
});

test('retouch_cubes adds pixels incrementally and preserves other tiles', async () => {
  let n = 0;
  const results = [];
  let uvBefore = null;
  let textureBefore = null;
  const host = makeHost(async (_url, req) => {
    n++;
    if (n === 1) return answer({ content: null, tool_calls: [toolCall('b1', 'build_painted_model', {
      name: 'Panels',
      parts: [
        { name: 'left', from: [0, 0, 0], to: [2, 2, 2], paint: { base: '#223344', material: 'metal' } },
        { name: 'right', from: [3, 0, 0], to: [5, 2, 2], paint: { base: '#556677', material: 'metal' } },
      ],
    })] });
    if (n === 2) {
      const left = host.world.Cube.all.find(c => c.name === 'left');
      const right = host.world.Cube.all.find(c => c.name === 'right');
      uvBefore = right.faces.north.uv.slice();
      textureBefore = right.faces.north.texture;
      return answer({ content: null, tool_calls: [toolCall('b2', 'retouch_cubes', {
        parts: [{ uuid: left.uuid, marks: [{ face: 'north', shape: 'pixel', x: 4, y: 4, color: '#FF0000' }] }],
      })] });
    }
    results.push(JSON.parse(JSON.parse(req.body).messages.at(-1).content));
    return answer({ content: 'done' });
  });
  const maker = host.view();
  maker.apiKey = 'k';
  maker.prompt = 'paneles y retoque';
  await maker.send();
  assert.equal(n, 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true, 'retouch ok: ' + JSON.stringify(results[0]).slice(0, 200));
  assert.equal(results[0].data.incremental, true);
  const cubes = host.world.Cube.all;
  assert.equal(cubes.length, 2);
  const untouched = cubes.find(c => c.name === 'right');
  assert.deepEqual(Array.from(untouched.from), [3, 0, 0]);
  assert.deepEqual(Array.from(untouched.to), [5, 2, 2]);
  assert.deepEqual(Array.from(untouched.faces.north.uv), Array.from(uvBefore), 'UV layout stable across the texture swap');
  assert.notEqual(untouched.faces.north.texture, textureBefore, 'untouched cube remapped to the new atlas');
  const finishes = host.transactions.filter(t => t.stage === 'finish').map(t => t.name);
  assert.deepEqual(finishes, ['AI: Detailed painted model Panels', 'AI: Retouch 1 cubes']);
  const firstAtlas = host.canvases[0].commands;
  assert.ok(firstAtlas.length > 0);
  assert.ok(!firstAtlas.some(c => c.color === '#ff0000'), 'original atlas has no red');
  const reencoded = host.canvases[1].commands;
  const red = reencoded.filter(c => c.color === '#ff0000');
  assert.ok(red.length > 0, 'red pixel was painted');
  assert.ok(red.every(c => c.x < 96), 'red stays inside the touched tile, got x=' + red.map(c => c.x).join(','));
});

test('retouch_cubes copies the bitmap when drawImage is available', async () => {
  let n = 0;
  const host = makeHost(async () => {
    n++;
    if (n === 1) return answer({ content: null, tool_calls: [toolCall('b1', 'build_painted_model', {
      name: 'Solo',
      parts: [{ name: 'only', from: [0, 0, 0], to: [1, 1, 1], paint: { base: '#123456', material: 'plain' } }],
    })] });
    if (n === 2) {
      const cube = host.world.Cube.all[0];
      return answer({ content: null, tool_calls: [toolCall('b2', 'retouch_cubes', {
        parts: [{ uuid: cube.uuid, marks: [{ face: 'up', shape: 'pixel', x: 1, y: 1, color: '#00FF00' }] }],
      })] });
    }
    return answer({ content: 'ok' });
  }, true);
  const maker = host.view();
  maker.apiKey = 'k';
  maker.prompt = 'uno y retoque';
  await maker.send();
  assert.equal(n, 3);
  const copies = host.canvases.flatMap(c => c.draws);
  assert.equal(copies.length, 1, 'atlas bitmap copied once instead of repainting everything');
  const green = host.canvases.flatMap(c => c.commands).filter(c => c.color === '#00ff00');
  assert.ok(green.length > 0, 'green pixel was painted');
});

test('knight character generates an armored humanoid with helm details', async () => {
  const sim = aiOnce('generate_character', { name: 'Knight', style: 'knight' }, 'listo');
  const host = makeHost(sim.fetch);
  const v = host.view();
  v.apiKey = 'k';
  v.prompt = 'Crea un caballero con armadura';
  await v.send();
  assert.equal(sim.result().ok, true);
  assert.ok(host.world.Cube.all.length >= 80, 'knight adds helm/plume/greaves, got ' + host.world.Cube.all.length);
  const names = host.world.Cube.all.map(c => c.name);
  assert.ok(names.includes('Head | Visor Slit'));
  assert.ok(names.includes('Head | Plume'));
  assert.equal(host.world.Texture.all.length, 1);
});

for (const [kind, minParts] of [['crystal_golem', 28], ['mech_walker', 30]]) {
  test(kind + ' prop generates grouped editable geometry with one atlas', async () => {
    const sim = aiOnce('generate_prop', { name: kind, kind }, 'ok');
    const host = makeHost(sim.fetch);
    const v = host.view();
    v.apiKey = 'k';
    v.prompt = 'genera ' + kind;
    await v.send();
    assert.equal(sim.result().ok, true);
    assert.ok(host.world.Cube.all.length >= minParts, 'got ' + host.world.Cube.all.length);
    assert.ok(host.world.Group.all.length > 2);
    assert.equal(host.world.Texture.all.length, 1);
    assert.equal(host.world.Group.all[0].name, kind);
  });
}

test('offline benchmarks run all eight deterministic models without network', () => {
  const host = makeHost(async () => { throw new Error('must stay offline'); });
  const v = host.view();
  const expected = {
    android_villager: 75, robot: 75, knight: 80, energy_sword: 30,
    sci_fi_drone: 55, treasure_chest: 35, crystal_golem: 28, mech_walker: 30,
  };
  for (const [id, min] of Object.entries(expected)) {
    const result = v.runBenchmark(id);
    assert.ok(result, 'benchmark runs: ' + id);
    assert.ok(result.created_count >= min, id + ' produced ' + result.created_count + ', expected ' + min);
  }
  assert.equal(host.world.Texture.all.length, 8, 'each benchmark owns its atlas');
  assert.match(v.benchSummary, /OK/);
  v.runAllBenchmarks();
  assert.match(v.benchSummary, /8\/8 OK/);
  assert.match(v.messages.at(-1).content, /8 de 8 correctos/);
});

test('bundle advertises the FORGE version in the panel', () => {
  const host = makeHost(async () => answer({ content: 'ok' }));
  assert.match(host.panel.component.template, /v0\.6\.0 FORGE/);
  assert.match(host.panel.component.template, /bbai-bench-picker/);
  assert.match(host.panel.component.template, /bbai-phase-/);
});
