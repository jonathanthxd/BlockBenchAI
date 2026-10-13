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
  const nativeSettings = {};
  let keyDialog = null;
  let savedSettings = 0;
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
  class Setting {
    constructor(id, options) {
      this.id = id;
      this.value = options.value;
      this.plugin = options.plugin;
      this.type = options.type;
      this.options = options.options;
      this.click = options.click;
      this.onChange = options.onChange;
      nativeSettings[id] = this;
    }
    set(value) {
      this.value = value;
      savedSettings++;
      if (this.onChange) this.onChange(value);
    }
    delete() {delete nativeSettings[this.id];}
  }
  class Dialog {
    constructor(id, options) {this.id = id; this.options = options; keyDialog = this;}
    show() {return this;}
  }
  const world = {
    Cube, Group, Setting, Dialog,
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
    fetch: fetchImpl,
    setTimeout, clearTimeout
  };
  vm.runInNewContext(source, world, {filename: 'blockbench_ai.js'});
  plugin.onload();
  assert.ok(panel && panel.component && panel.component.methods, 'sidebar registered');
  const component = panel.component;
  function view() {
    const state = Object.assign(component.data(), {
      $refs: {}, $nextTick(callback) {callback.call(this);}
    });
    for (const [key, value] of Object.entries(component.methods)) state[key] = value.bind(state);
    return state;
  }
  return {world, panel, plugin, view, transactions, unloaded, notifications, nativeSettings, getKeyDialog: () => keyDialog, getSavedSettings: () => savedSettings};
}
const toolCall = (id, name, args) => ({id, type: 'function', function: {name, arguments: JSON.stringify(args)}});
function answer(message) {
  return {ok: true, status: 200, json: async () => ({choices: [{message}]})};
}
test('registers a native docked panel and cleans up on unload', () => {
  const host = makeHost(async () => answer({content: 'ok'}));
  assert.equal(host.panel.default_position.slot, 'right_bar');
  assert.equal(host.plugin.variant, 'desktop');
  assert.equal(Object.keys(host.nativeSettings).length, 4);
  for (const setting of Object.values(host.nativeSettings)) assert.equal(setting.plugin, 'blockbench_ai');
  host.plugin.onunload();
  assert.equal(Object.keys(host.nativeSettings).length, 0);
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
  assert.match(view.messages.at(-1).content, /proyecto ha cambiado/i);
});
test('rejects insecure remote API endpoint', async () => {
  let contacted = false;
  const host = makeHost(async () => {contacted = true; return answer({content: 'ok'});});
  const view = host.view();
  view.apiKey = 'token';
  view.endpoint = 'http://not-local.example/v1/chat/completions';
  // Native preference storage is the source of truth for a request, not uncommitted form input.
  host.nativeSettings.bbai_endpoint.set(view.endpoint);
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
  host.nativeSettings.bbai_endpoint.set(view.endpoint);
  host.nativeSettings.bbai_model.set(view.model);
  view.prompt = 'hello';
  await view.send();
  assert.equal(view.messages.at(-1).content, 'Hello from the local model.');
});


test('native plugin Settings section has provider, model, endpoint and session key action', () => {
  const host = makeHost(async () => answer({content: 'ok'}));
  const s = host.nativeSettings;
  assert.equal(s.bbai_provider.type, 'select');
  assert.equal(s.bbai_model.type, 'text');
  assert.equal(s.bbai_endpoint.type, 'text');
  assert.equal(s.bbai_session_key.type, 'click');
  assert.equal(s.bbai_provider.value, 'groq');
  assert.equal(s.bbai_model.value, 'openai/gpt-oss-120b');
  assert.equal(s.bbai_endpoint.value, 'https://api.groq.com/openai/v1/chat/completions');
  s.bbai_session_key.click();
  const dialog = host.getKeyDialog();
  assert.equal(dialog.options.form.key.type, 'password');
  dialog.options.onConfirm({key: 'private-session-token'});
  assert.equal(host.getSavedSettings(), 0, 'session key is never stored in native settings');
  assert.equal(host.nativeSettings.bbai_session_key.value, undefined);
});
test('saving in-panel configuration synchronizes real plugin preferences', () => {
  const host = makeHost(async () => answer({content: 'ok'}));
  const view = host.view();
  view.provider = 'openai';
  view.endpoint = 'https://api.openai.com/v1/chat/completions';
  view.model = 'gpt-4.1-mini';
  view.apiKey = 'private';
  view.saveSettings();
  assert.equal(host.nativeSettings.bbai_provider.value, 'openai');
  assert.equal(host.nativeSettings.bbai_endpoint.value, view.endpoint);
  assert.equal(host.nativeSettings.bbai_model.value, view.model);
  assert.equal(view.view, 'chat');
  assert.equal(host.nativeSettings.bbai_session_key.value, undefined);
  view.openSettings();
  assert.equal(view.view, 'settings');
  assert.equal(view.model, 'gpt-4.1-mini');
});
test('changing provider selects Groq defaults and offers a polished settings view', () => {
  const host = makeHost(async () => answer({content: 'ok'}));
  const view = host.view();
  view.provider = 'openai';
  view.changeProvider();
  assert.equal(view.model, 'gpt-4.1-mini');
  view.provider = 'groq';
  view.changeProvider();
  assert.equal(view.model, 'openai/gpt-oss-120b');
  assert.match(host.panel.component.template, /bbai-settings-view/);
  assert.match(host.panel.component.template, /bbai-welcome/);
  assert.match(host.panel.component.template, /useSuggestion/);
});
test('native Settings changes update actual request provider without manual panel refresh', async () => {
  let targetURL, model;
  const host = makeHost(async (url, request) => {
    targetURL = url;
    model = JSON.parse(request.body).model;
    return answer({content: 'connected'});
  });
  const view = host.view();
  view.apiKey = 'session-test-key';
  host.nativeSettings.bbai_provider.set('openai');
  view.prompt = 'Hello';
  await view.send();
  assert.equal(targetURL, 'https://api.openai.com/v1/chat/completions');
  assert.equal(model, 'gpt-4.1-mini');
});

test('Groq 429 cooldown retries the same request without losing the chat or duplicating geometry', async () => {
  let n = 0;
  const host = makeHost(async () => {
    n++;
    if (n === 1) return {
      ok: false, status: 429, headers: {get: key => key === 'retry-after' ? '0' : null},
      json: async () => ({error: {message: 'Rate limit. Please try again in 0.01s.'}})
    };
    if (n === 2) return answer({tool_calls: [toolCall('recovered', 'create_cubes', {
      cubes: [{name: 'android villager head', from: [0, 0, 0], to: [2, 2, 2]}]
    })]});
    return answer({content: 'El aldeano androide tiene cabeza.'});
  });
  const view = host.view();
  view.apiKey = 'test-key';
  view.prompt = 'Haz un aldeano androide';
  await view.send();
  assert.equal(n, 3, 'the 429 is transparently retried before the tool round');
  assert.equal(host.world.Cube.all.length, 1, 'no geometry is applied twice');
  assert.equal(host.world.Cube.all[0].name, 'android villager head');
  assert.equal(view.messages.at(-1).content, 'El aldeano androide tiene cabeza.');
});
test('Stop aborts rate-limit wait and does not retry after cancellation', async () => {
  let n = 0;
  const host = makeHost(async () => {
    n++;
    return {
      ok: false, status: 429, headers: {get: key => key === 'retry-after' ? '4' : null},
      json: async () => ({error: {message: 'Tokens per minute exceeded'}})
    };
  });
  const view = host.view();
  view.apiKey = 'test-key';
  view.prompt = 'Make a robot';
  const sending = view.send();
  await new Promise(resolve => setTimeout(resolve, 30));
  view.cancel();
  await sending;
  assert.equal(n, 1, 'cancel prevents subsequent requests');
  assert.match(view.messages.at(-1).content, /Canceled/i);
});
test('A distant quota reset does not leave the plugin waiting indefinitely', async () => {
  let n = 0;
  const host = makeHost(async () => {
    n++;
    return {
      ok: false, status: 429, headers: {get: key => key === 'retry-after' ? '72000' : null},
      json: async () => ({error: {message: 'Daily free quota exceeded'}})
    };
  });
  const view = host.view();
  view.apiKey = 'test-key';
  view.prompt = 'Make a robot';
  await view.send();
  assert.equal(n, 1);
  assert.match(view.messages.at(-1).content, /límite de uso gratuito/i);
});
