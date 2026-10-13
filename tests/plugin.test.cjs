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
  const canvases = [];
  class Cube {
    static all = [];
    static selected = [];
    static isTypePermitted() { return true; }
    constructor(spec) {
      this.uuid = uuid();
      this.faces = Object.fromEntries(['north','south','east','west','up','down'].map(x=>[x,{texture:false,uv:[0,0,16,16]}]));
      Object.assign(this, {
        selected: false, locked: false, from: [0, 0, 0], to: [1, 1, 1],
        origin: [0, 0, 0], rotation: [0, 0, 0], name: 'cube', color: 0
      }, spec);
    }
    init() { Cube.all.push(this); return this; }
    setUVMode(value) {this.box_uv = value;}
    addTo(group) { this.parent = group === 'root' ? null : group; return this; }
    remove() { Cube.all = Cube.all.filter(c => c !== this); }
  }
  class Texture {
    static all = [];
    constructor(spec) {
      this.uuid = uuid();
      this.name = spec.name;
      this.width = spec.width;
      this.height = spec.height;
    }
    fromDataURL(url) {this.source = url; return this;}
    add() {Texture.all.push(this); return this;}
    remove() {Texture.all = Texture.all.filter(t=>t!==this);}
    getUVWidth() {return 16;}
    getUVHeight() {return 16;}
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
  const document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0, height: 0,
        commands: [],
        getContext(contextType) {
          assert.equal(contextType, '2d');
          return {
            fillStyle: '#000',
            fillRect(x,y,w,h) {canvas.commands.push({x,y,w,h,color:this.fillStyle});}
          };
        },
        toDataURL(type) {
          assert.equal(type, 'image/png');
          return 'data:image/png;base64,' + Buffer.from(JSON.stringify({width:this.width,height:this.height,paintedPixels:this.commands.length})).toString('base64');
        }
      };
      canvases.push(canvas);
      return canvas;
    }
  };
  const world = {
    Cube, Group, Texture, Setting, Dialog, document,
    Project: {uuid: 'project-1', name: 'Test project', texture_width: 16, texture_height: 16},
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
  return {world, panel, plugin, view, transactions, canvases, unloaded, notifications, nativeSettings, getKeyDialog: () => keyDialog, getSavedSettings: () => savedSettings};
}
const toolCall = (id, name, args) => ({id, type: 'function', function: {name, arguments: JSON.stringify(args)}});
function answer(message) {
  return {ok: true, status: 200, json: async () => ({choices: [{message}]})};
}
test('registers a native docked panel and cleans up on unload', () => {
  const host = makeHost(async () => answer({content: 'ok'}));
  assert.equal(host.panel.default_position.slot, 'right_bar');
  assert.equal(host.plugin.variant, 'desktop');
  assert.equal(Object.keys(host.nativeSettings).length, 5);
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
  assert.ok(JSON.parse(calls[0].options.body).tools.length <= 2, 'compact tool routing');
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
  assert.equal(s.bbai_cloudflare_account.type, 'text');
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

test('Detailed humanoid creates complex named parts with a real PNG atlas and per-face UVs', async () => {
  let n=0;
  const host=makeHost(async () => {
    n++;
    if(n===1)return answer({tool_calls:[toolCall('character', 'generate_character', {
      name:'Android Villager',style:'android_villager',primary:'#4D6470',secondary:'#293842',accent:'#46DBED'
    })]});
    return answer({content:'Aldea androide texturizado.'});
  });
  const view=host.view();
  view.apiKey='test-secret';view.prompt='Crea un aldeano androide detallado';
  await view.send();
  assert.ok(host.world.Cube.all.length>=50,'character generator must create 50+ unique shapes');
  assert.equal(host.world.Texture.all.length,1,'one actual PNG atlas texture');
  const t=host.world.Texture.all[0];
  assert.match(t.source,/^data:image\/png;base64,/);
  assert.ok(host.canvases[0].commands.length>200,'pixels are actually drawn on the atlas');
  const head=host.world.Cube.all.find(x=>x.name==='Head | Skull');
  assert.ok(head);
  assert.equal(head.faces.north.texture,t.uuid);
  assert.equal(head.box_uv,false);
  assert.notDeepEqual(Array.from(head.faces.north.uv),Array.from(head.faces.south.uv),'six faces have distinct UV tiles');
  assert.ok(host.world.Cube.all.some(x=>x.name.includes('Servo')));
  assert.ok(host.world.Cube.all.some(x=>x.name.includes('Finger')));
  assert.equal(host.transactions.filter(t=>t.stage==='finish').length,1,'model and texture share one undo operation');
  assert.equal(view.messages.at(-1).content,'Aldea androide texturizado.');
});
test('AI can paint existing cube pixels without modifying geometry', async () => {
  let n=0;
  const host=makeHost(async () => {
    n++;
    if(n===1)return answer({tool_calls:[toolCall('painted','paint_existing_cubes',{
      parts:[{uuid:'test-1',paint:{base:'#557799',material:'circuit',accent:'#23CDDD',
        marks:[{face:'north',shape:'rect',x:4,y:4,width:3,height:2,color:'#FFEEDD'}]}}]
    })]});
    return answer({content:'Textura pintada.'});
  });
  const cube=new host.world.Cube({name:'panel',from:[0,0,0],to:[3,8,3]}).init();
  const view=host.view();view.apiKey='test';view.prompt='Pinta un circuito';
  await view.send();
  assert.equal(host.world.Cube.all.length,1);
  assert.deepEqual(Array.from(cube.to),[3,8,3]);
  assert.equal(host.world.Texture.all.length,1);
  assert.equal(cube.faces.north.texture,host.world.Texture.all[0].uuid);
  assert.ok(host.canvases[0].commands.some(cmd=>cmd.color.toLowerCase()==='#ffeedd'));
});
test('build_painted_model rejects unsafe hex color before any model mutation', async () => {
  let n=0, result;
  const host=makeHost(async (_url,request)=>{
    n++;
    if(n===1)return answer({tool_calls:[toolCall('bad','build_painted_model',{
      name:'Unsafe',
      parts:[{name:'cube',from:[0,0,0],to:[3,3,3],paint:{base:'rgb(0,0,0)'}}]
    })]});
    result=JSON.parse(JSON.parse(request.body).messages.at(-1).content);
    return answer({content:'No se pudo pintar.'});
  });
  const view=host.view();view.apiKey='key';view.prompt='Create painted model';await view.send();
  assert.equal(host.world.Cube.all.length,0);
  assert.equal(host.world.Texture.all.length,0);
  assert.equal(result.ok,false);
  assert.match(result.error,/#RRGGBB/);
});
test('different painted cubes receive separate face tiles and exported color data', async () => {
  let n=0;
  const host=makeHost(async ()=>{
    n++;
    if(n===1)return answer({tool_calls:[toolCall('material','build_painted_model',{
      name:'Sword',parts:[
        {name:'blade',from:[-1,3,-.5],to:[1,14,.5],paint:{base:'#DDEEFF',material:'metal'}},
        {name:'handle',from:[-.5,0,-.5],to:[.5,3,.5],paint:{base:'#876543',material:'wood'}}
      ]
    })]});
    return answer({content:'Espada pintada.'});
  });
  const view=host.view();view.apiKey='key';view.prompt='Paint a sword';await view.send();
  assert.equal(host.world.Texture.all.length,1);
  assert.equal(host.world.Cube.all.length,2);
  assert.notDeepEqual(host.world.Cube.all[0].faces.north.uv,host.world.Cube.all[1].faces.north.uv);
  assert.ok(host.canvases[0].commands.some(cmd=>/^#/.test(cmd.color)));
});

test('Groq receives only relevant tools for character prompts to reduce token usage', async () => {
  let toolNames;
  const host=makeHost(async (_url,request)=>{
    toolNames=JSON.parse(request.body).tools.map(t=>t.function.name);
    return answer({content:'Listo'});
  });
  const v=host.view();v.apiKey='token';v.prompt='Crea un aldeano androide';await v.send();
  assert.ok(toolNames.includes('generate_character'));
  assert.ok(toolNames.includes('inspect_scene'));
  assert.equal(toolNames.length, 2, 'humanoid prompts must not ship the enormous generic paint schema');
  assert.ok(!toolNames.includes('edit_cubes'));
  assert.ok(!toolNames.includes('create_group'));
});
test('When editing an existing model, texturing tools are available instead of the character generator', async () => {
  let toolNames;
  const host=makeHost(async (_url,request)=>{
    toolNames=JSON.parse(request.body).tools.map(t=>t.function.name);
    return answer({content:'Entendido'});
  });
  new host.world.Cube({name:'body'}).init();
  const v=host.view();v.apiKey='token';v.prompt='Pinta el androide de azul';await v.send();
  assert.ok(toolNames.includes('paint_existing_cubes'));
  assert.ok(toolNames.includes('edit_cubes'));
  assert.ok(!toolNames.includes('generate_character'));
});


test('Gemini free provider preset appears in native Settings and in-panel settings', async () => {
  let requestedEndpoint, requestedModel;
  const host = makeHost(async (url,opts)=>{
    requestedEndpoint=url;
    requestedModel=JSON.parse(opts.body).model;
    return answer({content:'Gemini conectado'});
  });
  assert.equal(host.nativeSettings.bbai_provider.options.gemini,'Google Gemini');
  assert.match(host.panel.component.template,/Google Gemini/);
  host.nativeSettings.bbai_provider.set('gemini');
  assert.equal(host.nativeSettings.bbai_model.value,'gemini-3.8-flash');
  assert.equal(host.nativeSettings.bbai_endpoint.value,'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  const view=host.view();view.apiKey='gemini-test-token';
  view.prompt='Hola';await view.send();
  assert.equal(requestedEndpoint,host.nativeSettings.bbai_endpoint.value);
  assert.equal(requestedModel,'gemini-3.8-flash');
});
test('compact model tool provides a painted model via small nine-item part tuples', async () => {
  let n=0;
  const host=makeHost(async ()=>{
    n++;
    if(n===1)return answer({tool_calls:[toolCall('compact','compose_model',{
      name:'Custom Sword',
      palette:{primary:'#9FABB8',secondary:'#4A3B39',accent:'#4AE3E1'},
      parts:[
        ['Long blade',-1,5,-.5,1,19,.5,'metal','primary'],
        ['Guard',-3,4,-1,3,5,1,'m','accent'],
        ['Handle',-.5,0,-.5,.5,4,.5,'w','secondary']
      ]
    })]});
    return answer({content:'Espada detallada y pintada.'});
  });
  const view=host.view();view.apiKey='local-key';view.prompt='Crea una espada muy detallada';await view.send();
  assert.equal(host.world.Cube.all.length,3);
  assert.equal(host.world.Texture.all.length,1);
  assert.ok(host.world.Cube.all.every(c=>c.faces.north.texture===host.world.Texture.all[0].uuid));
  assert.equal(view.messages.at(-1).content,'Espada detallada y pintada.');
});
test('413 is not retried and suggests a different provider', async () => {
  let calls=0;
  const host=makeHost(async ()=>{calls++;return {ok:false,status:413,headers:{get(){return null;}},json:async()=>({error:{message:'Requested 8429 tokens'}})};});
  const view=host.view();view.apiKey='groq-key';view.prompt='Crea una nave';await view.send();
  assert.equal(calls,1);
  assert.match(view.messages.at(-1).content,/Gemini/i);
  assert.match(view.messages.at(-1).content,/413/);
});
test('compact tool schema is sent for objects and keeps Groq request small', async () => {
  let body;
  const host=makeHost(async (_url,opts)=>{body=JSON.parse(opts.body);return answer({content:'ok'});});
  const view=host.view();view.apiKey='groq-key';view.prompt='Crea una locomotora detallada';await view.send();
  assert.ok(body);
  assert.deepEqual(body.tools.map(x=>x.function.name),['compose_model','inspect_scene']);
  assert.ok(JSON.stringify(body).length<5200);
});

test('detailed android has quality finish pass and organized native outliner subgroups', async () => {
  let n=0;
  const host=makeHost(async ()=>{
    n++;
    if(n===1)return answer({tool_calls:[toolCall('decorated','generate_character',{name:'Android',style:'android_villager'})]});
    return answer({content:'Listo'});
  });
  const view=host.view();view.apiKey='dummy';view.prompt='Crea un aldeano androide';await view.send();
  assert.ok(host.world.Cube.all.length>=75,'minimum detailed character part count');
  assert.ok(host.world.Group.all.length>5,'model hierarchy should contain organized subgroups');
  const names=host.world.Cube.all.map(x=>x.name);
  for(const expected of ['Face | Left Lens','Face | Right Lens','Chest | Collar Left','Left | Knee Emblem','Right | Wrist Indicator']) {
    assert.ok(names.includes(expected),'missing detail '+expected);
  }
  const head=host.world.Cube.all.find(x=>x.name==='Head | Skull');
  assert.equal(head.parent.name,'Head');
  assert.ok(head.parent.parent.name==='Android');
  assert.equal(host.world.Texture.all.length,1);
  assert.equal(host.transactions.filter(t=>t.stage==='finish').length,1);
});
test('tool contract exposes compact nine-element parts instead of full per-face mark schemas', async () => {
  let tools;
  const host=makeHost(async (_url,opts)=>{
    tools=JSON.parse(opts.body).tools;return answer({content:'OK'});
  });
  const view=host.view();view.apiKey='token';view.prompt='Crea una locomotora detallada';await view.send();
  assert.equal(tools[0].function.name,'compose_model');
  const schema=tools[0].function.parameters.properties.parts;
  assert.equal(schema.items.type,'string');
  assert.equal(schema.maxItems,96);
  assert.ok(!JSON.stringify(tools).includes('faceMarkSchema'),'must not send huge pixel markup schema');
});

test('new string-based compact plan paints native geometry and reduces tool output size', async () => {
  let n=0; const host=makeHost(async ()=>{
    n++;
    if(n===1)return answer({tool_calls:[toolCall('compactString','compose_model',{
      name:'Pixel Bike',palette:{primary:'#778899',secondary:'#343434',accent:'#44DDDD'},
      parts:[
        'Front Wheel|-6,0,-1|-2,4,1|m|secondary',
        'Frame|-3,3,-1|8,5,1|m|primary',
        'Headlight|8,4,-1|9,6,1|g|accent'
      ]
    })]});
    return answer({content:'Motocicleta creada'});
  });
  const view=host.view();view.apiKey='test';view.prompt='Crea una motocicleta';await view.send();
  assert.equal(host.world.Cube.all.length,3);
  assert.equal(host.world.Texture.all.length,1);
  assert.equal(view.messages.at(-1).content,'Motocicleta creada');
});
test('Gemini character mode exposes a compact refinement tool in addition to the base template', async () => {
  let tools;
  const host=makeHost(async (_url,opts)=>{tools=JSON.parse(opts.body).tools.map(t=>t.function.name);return answer({content:'ok'});});
  host.nativeSettings.bbai_provider.set('gemini');
  const v=host.view();v.apiKey='test-gemini';v.prompt='Crea un androide detallado';await v.send();
  assert.deepEqual(tools,['generate_character','compose_model','inspect_scene']);
});

test('offline quality demo creates detailed painted geometry without network calls or an API key', () => {
  let contacted=false;
  const host=makeHost(async ()=>{contacted=true;return answer({content:'not used'});});
  const view=host.view();
  assert.match(host.panel.component.template,/Demo androide · Sin IA/);
  view.generateLocalDemo();
  assert.equal(contacted,false);
  assert.ok(host.world.Cube.all.length>=75);
  assert.equal(host.world.Texture.all.length,1);
  assert.match(view.messages.at(-1).content,/Demo local creada/);
  assert.match(view.messages.at(-1).content,/Ctrl\+Z/);
});

test('Cloudflare Qwen provider produces correct endpoint from validated Account ID', async () => {
  let url, req;
  const host=makeHost(async (u,o)=>{url=u;req=JSON.parse(o.body);return answer({content:'Conectado'});});
  const id='a'.repeat(32);
  host.nativeSettings.bbai_cloudflare_account.set(id);
  host.nativeSettings.bbai_provider.set('cloudflare');
  assert.equal(host.nativeSettings.bbai_model.value,'@cf/qwen/qwen3.8-27b');
  assert.equal(host.nativeSettings.bbai_endpoint.value,
    'https://api.cloudflare.com/client/v4/accounts/'+id+'/ai/v1/chat/completions');
  assert.ok(host.panel.component.template.includes('Cloudflare Account ID'));
  const v=host.view();v.apiKey='cf-test-key';v.prompt='Genera un dragón';await v.send();
  assert.equal(url,host.nativeSettings.bbai_endpoint.value);
  assert.equal(req.model,'@cf/qwen/qwen3.8-27b');
  assert.equal(v.messages.at(-1).content,'Conectado');
});
test('Cloudflare provider never uses an old endpoint with missing/invalid Account ID', async () => {
  let called=false;
  const host=makeHost(async ()=>{called=true;return answer({content:'not used'});});
  host.nativeSettings.bbai_provider.set('cloudflare');
  assert.equal(host.nativeSettings.bbai_endpoint.value,'');
  const v=host.view();v.apiKey='some-key';v.prompt='Hello';await v.send();
  assert.equal(called,false);
  assert.match(v.messages.at(-1).content,/URL|endpoint/i);
  v.openSettings();
  v.cloudflareAccount='not-valid';
  v.endpoint='https://api.groq.com/openai/v1/chat/completions';
  v.saveSettings();
  assert.equal(host.nativeSettings.bbai_endpoint.value,'');
  assert.equal(host.nativeSettings.bbai_cloudflare_account.value,'');
});
test('provider connectivity test is low-cost and does not send model tools or geometry', async () => {
  let body,authorization;
  const host=makeHost(async (_url,o)=>{
    body=JSON.parse(o.body);authorization=o.headers.Authorization;
    return answer({content:'OK'});
  });
  const v=host.view();v.apiKey='secret-test-only';
  await v.testConnection();
  assert.equal(body.max_tokens,16);
  assert.equal(body.messages.length,1);
  assert.equal(body.tools,undefined);
  assert.equal(body.messages[0].content,'Reply with: OK');
  assert.equal(authorization,'Bearer secret-test-only');
  assert.equal(v.connectionResult,'success');
  assert.equal(host.world.Cube.all.length,0);
});
test('connectivity test exposes helpful error without altering the model', async () => {
  const host=makeHost(async ()=>({ok:false,status:401,json:async()=>({error:{message:'bad auth'}})}));
  const v=host.view();v.apiKey='bad';
  await v.testConnection();
  assert.equal(v.connectionResult,'error');
  assert.match(v.connectionStatus,/401/);
  assert.equal(host.world.Texture.all.length,0);
});
for(const [kind, expected, minParts] of [
  ['energy_sword','Blade | Body',30],
  ['sci_fi_drone','Camera | Lens',55],
  ['treasure_chest','Lock | Housing',35]
]){
  test(kind+' creates organized, editable parts and one actual painted PNG texture', async () => {
    let n=0;
    const host=makeHost(async ()=>{
      n++;
      if(n===1)return answer({tool_calls:[toolCall('prop','generate_prop',{name:kind,kind})]});
      return answer({content:'Prop creado'});
    });
    const v=host.view();v.apiKey='key';v.prompt='Crea '+(kind==='energy_sword'?'espada':kind==='sci_fi_drone'?'drone':'cofre');await v.send();
    assert.equal(v.messages.at(-1).content,'Prop creado');
    assert.ok(host.world.Cube.all.length>=minParts,'Expected '+minParts+' detail components, got '+host.world.Cube.all.length);
    assert.ok(host.world.Group.all.length>2);
    assert.ok(host.world.Cube.all.some(c=>c.name===expected));
    assert.equal(host.world.Texture.all.length,1);
    assert.match(host.world.Texture.all[0].source,/^data:image\/png;base64,/);
    assert.ok(host.world.Cube.all.every(c=>c.faces.north.texture===host.world.Texture.all[0].uuid));
    assert.equal(host.transactions.filter(t=>t.stage==='finish').length,1);
  });
}
test('new props route to tiny deterministic tools rather than the verbose paint schema', async () => {
  let tools;
  const host=makeHost(async (_url,o)=>{tools=JSON.parse(o.body).tools.map(t=>t.function.name);return answer({content:'ok'});});
  const v=host.view();v.apiKey='key';v.prompt='Crea un dron futurista';await v.send();
  assert.deepEqual(tools,['generate_prop','inspect_scene']);
});

test('AI does not apply stale geometry after a user edit while the provider responds', async () => {
  let host, requests=0;
  host=makeHost(async ()=>{
    requests++;
    const old=host.world.Cube.all[0];
    old.to=[5,5,5];
    return answer({tool_calls:[toolCall('stale','edit_cubes',{
      cubes:[{uuid:old.uuid,to:[2,2,2]}]
    })]});
  });
  const original=new host.world.Cube({name:'my manual edit',from:[0,0,0],to:[1,1,1]}).init();
  const view=host.view();view.apiKey='key';
  view.prompt='Edit this cube';await view.send();
  assert.equal(requests,1);
  assert.deepEqual(Array.from(original.to),[5,5,5],'the concurrent human change wins');
  assert.match(view.messages.at(-1).content,/cambios manuales/i);
  assert.equal(host.transactions.filter(t=>t.stage==='finish').length,0);
});
test('offline prop gallery generates multiple textured models without contacting providers', () => {
  let contacted=false;
  const host=makeHost(async ()=>{contacted=true;return answer({content:'unexpected'});});
  const v=host.view();
  assert.match(host.panel.component.template,/Demo dron · Sin IA/);
  assert.match(host.panel.component.template,/Demo espada · Sin IA/);
  v.generateLocalPropDemo('energy_sword');
  assert.ok(host.world.Cube.all.length>=30);
  v.generateLocalPropDemo('sci_fi_drone');
  assert.ok(host.world.Cube.all.length>=85);
  assert.equal(host.world.Texture.all.length,2);
  assert.equal(contacted,false);
  assert.match(v.messages.at(-1).content,/Demo local creada/);
});

test('connection errors redact a just-entered API token even before saving preferences', async () => {
  const token='cf-custom-token-xyz987654321';
  const host=makeHost(async ()=>({ok:false,status:401,json:async()=>({error:{message:'Invalid token: '+token}})}));
  const v=host.view();v.apiKey=token;
  await v.testConnection();
  assert.equal(v.connectionResult,'error');
  assert.match(v.connectionStatus,/401/);
  assert.ok(!v.connectionStatus.includes(token),'secret must never be shown in error banner');
});

test('typing Demo Dron runs fully offline without requiring provider credentials', async () => {
  let network=0;
  const host=makeHost(async()=>{network++;return answer({content:'not expected'});});
  const v=host.view();v.prompt='Demo Dron';
  await v.send();
  assert.equal(network,0,'offline demo must never contact provider');
  assert.equal(v.busy,false);
  assert.equal(v.prompt,'');
  assert.ok(host.world.Cube.all.length>=55);
  assert.equal(host.world.Texture.all.length,1);
  assert.equal(v.messages[0].content,'Demo Dron');
  assert.match(v.messages.at(-1).content,/Demo local creada/);
  assert.ok(!v.messages.at(-1).content.includes('API key'));
});
test('offline demo aliases work even after the welcome screen disappears', async () => {
  let network=0;
  const host=makeHost(async()=>{network++;return answer({content:'unexpected'});});
  const v=host.view();
  v.messages.push({role:'assistant',content:'An earlier message'});
  assert.match(host.panel.component.template,/showDemos = !showDemos/);
  assert.match(host.panel.component.template,/bbai-demo-picker/);
  for(const prompt of ['Demo Dron', 'demo del dron', 'DEMO ESPADA', 'demo sin IA androide', 'demo cofre']){
    v.prompt=prompt;
    await v.send();
  }
  assert.equal(network,0);
  assert.equal(host.world.Texture.all.length,5,'each demo generates a native atlas');
  assert.ok(host.world.Cube.all.length>150);
});
test('ordinary prompts including the word demo are not silently intercepted', async () => {
  let calls=0;
  const host=makeHost(async()=>{calls++;return answer({content:'AI should handle this'});});
  const v=host.view();v.apiKey='key';
  v.prompt='Haz una demo del dron con un diseño diferente';
  await v.send();
  assert.equal(calls,1);
  assert.equal(host.world.Cube.all.length,0);
  assert.equal(v.messages.at(-1).content,'AI should handle this');
});
