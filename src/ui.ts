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

import { MAX_ROUNDS } from './types';
import type { HistoryTurn, ProgressEvent, StringMap } from './types';
import { activeProject } from './geometry';
import { benchmarkDefs } from './presets';
import { checkProviderConnection, cloudflareEndpoint, safeError, validCloudflareAccount } from './providers';

export function offlineDemoIntent(value: unknown): string | null {
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

export function friendlyOpName(tool: string): string {
  const names: StringMap = {
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

export function fullCss(): string {
  return CSS + '\n' + EXTRA_CSS + '\n' + DEMO_CSS + '\n' + FORGE_CSS;
}

export function makeComponent(): any {
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
      logOp: function (label: string) {
        this.oplog.push(label);
        if (this.oplog.length > 24) this.oplog.shift();
      },
      setPhase: function (phase: string, label: string) {
        this.phase = phase;
        this.phaseLabel = label;
      },
      noteProgress: function (done: number, total: number) {
        this.progressDone = done;
        this.progressTotal = Math.max(1, total);
        this.progressPct = Math.round((done / Math.max(1, total)) * 100);
      },
      generateLocalPropDemo: function (kind: string) {
        if (this.busy) return;
        try {
          activeProject();
          const titles: StringMap = {
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
      runBenchmark: function (id: string) {
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
          const failures: string[] = [];
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
      useSuggestion: function (value: string) {
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
          function (event: ProgressEvent) {
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
