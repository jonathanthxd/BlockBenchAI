'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'blockbench_ai.js'), 'utf8');

function makeHost(fetchImpl) {
  let nextId = 0;
  const uuid = () => 'test-' + ++nextId;
  const transactions = [];
  const notifications = [];
  let plugin = null;
  let panel = null;
  let unloaded = {panel: false, action: false, css: false};
  class Cube {
    static all = [];
    static selected = [];
    static isTypePermitted() { return true; }
    constructor(spec) {
      this.uuid = uuid();
      Object.assign(this, {
        selected: false, locked: false, from: [0, 0, 0], to: [1, 1, 1],
        origin: [0, 0, 0], rotation: [0, 0, 0], name: 'cube', color: 0
      }, spec);
    }
    init() { Cube.all.push(this); return this; }
    addTo(group) { this.parent = group === 'root' ? null : group; return this; }
    remove() { Cube.all = Cube.all.filter(c => c !== this); }
  }
  class Group {
    static all = [];
    constructor(spec) {this.uuid = uuid(); this.name = spec.name; this.locked = false;}
    init() {Group.all.push(this); return this;}
    addTo(group) {this.parent = group === 'root' ? null : group; return this;}
    remove() {Group.all = Group.all.filter(g => g !== this);}
  }
  const world = {
    Cube, Group,
    Project: {uuid: 'project-1', name: 'Test project'},
    Format: {id: 'free', cubes: true, meshes: true},
    Plugin: {register(id, cfg) {assert.equal(id, 'blockbench_ai'); plugin = cfg;}},
    Panel: class {constructor(id, cfg) {panel = cfg;} delete() {unloaded.panel = true;} show() {}},
    Action: class {delete() {unloaded.action = true;}},
    MenuBar: {menus: {tools: {addAction() {}}}},
    Blockbench: {addCSS() {return {delete() {unloaded.css = true;}};}, showQuickMessage(v) {notifications.push(v);}},
    Undo: {
      initEdit(value) {transactions.push({stage: 'init', value});},
      finishEdit(name, value) {transactions.push({stage: 'finish', name, value});},
      cancelEdit() {transactions.push({stage: 'cancel'});}
    },
    Canvas: {updateView() {}},
    localStorage: {getItem() {return null;}, setItem() {}},
    URL, AbortController, console,
    fetch: fetchImpl
  };
  vm.runInNewContext(source, world, {filename: 'blockbench_ai.js'});
  plugin.onload();
  assert.ok(panel && panel.component && panel.component.methods, 'sidebar registered');
  const component = panel.component;
  function view() {
    const state = Object.assign(component.data(), {
      $refs: {}, $nextTick(callback) {callback();}
    });
    for (const [key, value] of Object.entries(component.methods)) state[key] = value.bind(state);
    return state;
  }
  return {world, panel, plugin, view, transactions, unloaded, notifications};
}
const toolCall = (id, name, args) => ({id, type: 'function', function: {name, arguments: JSON.stringify(args)}});
function answer(message) {
  return {ok: true, status: 200, json: async () => ({choices: [{message}]})};
}
test('registers a native docked panel and cleans up on unload', () => {
  const host = makeHost(async () => answer({content: 'ok'}));
  assert.equal(host.panel.default_position.slot, 'right_bar');
  assert.equal(host.plugin.variant, 'desktop');
  host.plugin.onunload();
  assert.deepEqual(host.unloaded, {panel: true, action: true, css: true});
});
test('AI creates a group and native cubes with Blockbench Undo operations', async () => {
  let n = 0;
  const calls = [];
  const host = makeHost(async (url, options) => {
    n++;
    calls.push({url, options});
    if (n === 1) return answer({content: null, tool_calls: [
      toolCall('a', 'create_group', {name: 'Robot'}),
      toolCall('b', 'create_cubes', {cubes: [
        {name: 'head', from: [-2, 9, -2], to: [2, 13, 2], group: 'Robot'},
        {name: 'body', from: [-3, 1, -1], to: [3, 9, 1], group: 'Robot'}
      ]})
    ]});
    return answer({content: 'Created the robot.'});
  });
  const component = host.view();
  component.apiKey = 'test-token';
  component.prompt = 'Make a robot';
  await component.send();
  assert.equal(host.world.Group.all.length, 1);
  assert.equal(host.world.Cube.all.length, 2);
  assert.equal(host.world.Cube.all[0].name, 'head');
  assert.equal(host.world.Cube.all[0].parent.name, 'Robot');
  assert.equal(component.messages.at(-1).content, 'Created the robot.');
  assert.equal(host.transactions.filter(t => t.stage === 'finish').length, 2);
  assert.equal(calls.length, 2);
  assert.ok(JSON.parse(calls[0].options.body).tools.length >= 4);
});
test('AI can edit an existing cube via UUID while preserving other fields', async () => {
  let n = 0;
  const host = makeHost(async () => {
    n++;
    if (n === 1) return answer({tool_calls: [toolCall('edit1', 'edit_cubes', {
      cubes: [{uuid: 'test-1', to: [2, 8, 2], name: 'long blade'}]
    })]});
    return answer({content: 'Blade changed.'});
  });
  new host.world.Cube({name: 'blade', from: [0, 0, 0], to: [2, 4, 2]}).init();
  const view = host.view();
  view.apiKey = 'token';
  view.prompt = 'Extend blade';
  await view.send();
  assert.deepEqual(Array.from(host.world.Cube.all[0].from), [0, 0, 0]);
  assert.deepEqual(Array.from(host.world.Cube.all[0].to), [2, 8, 2]);
  assert.equal(host.world.Cube.all[0].name, 'long blade');
  assert.equal(host.transactions.filter(t => t.stage === 'finish').length, 1);
});
test('invalid geometry is rejected and tool result describes the error', async () => {
  let n = 0, toolResult;
  const host = makeHost(async (_url, req) => {
    n++;
    if (n === 1) return answer({tool_calls: [toolCall('bad', 'create_cubes', {
      cubes: [{name: 'invalid', from: [0, 0, 0], to: [0, 1, 1]}]
    })]});
    toolResult = JSON.parse(JSON.parse(req.body).messages.at(-1).content);
    return answer({content: 'That cube was rejected.'});
  });
  const view = host.view();
  view.apiKey = 'token';
  view.prompt = 'bad cube';
  await view.send();
  assert.equal(host.world.Cube.all.length, 0);
  assert.equal(toolResult.ok, false);
  assert.match(toolResult.error, /positive/);
});
test('project switch prevents applying AI changes', async () => {
  let host;
  host = makeHost(async () => {
    host.world.Project = {uuid: 'project-2'};
    return answer({tool_calls: [toolCall('bad', 'create_cubes', {
      cubes: [{name: 'wrong-project', from: [0, 0, 0], to: [1, 1, 1]}]
    })]});
  });
  const view = host.view();
  view.apiKey = 'token';
  view.prompt = 'make a block';
  await view.send();
  assert.equal(host.world.Cube.all.length, 0);
  assert.match(view.messages.at(-1).content, /project changed/i);
});
test('rejects insecure remote API endpoint', async () => {
  let contacted = false;
  const host = makeHost(async () => {contacted = true; return answer({content: 'ok'});});
  const view = host.view();
  view.apiKey = 'token';
  view.endpoint = 'http://not-local.example/v1/chat/completions';
  view.prompt = 'help';
  await view.send();
  assert.equal(contacted, false);
  assert.match(view.messages.at(-1).content, /HTTPS/i);
});
test('localhost OpenAI-compatible endpoints do not need an API key', async () => {
  const host = makeHost(async () => answer({content: 'Hello from the local model.'}));
  const view = host.view();
  view.endpoint = 'http://localhost:11434/v1/chat/completions';
  view.model = 'qwen3';
  view.prompt = 'hello';
  await view.send();
  assert.equal(view.messages.at(-1).content, 'Hello from the local model.');
});
