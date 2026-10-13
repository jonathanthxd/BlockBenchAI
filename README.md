# BlockBenchAI

**BlockBenchAI** is an independent, MIT-licensed AI modeling assistant for [Blockbench](https://www.blockbench.net/). Write a prompt in the dockable chat panel to create or modify **real, editable Blockbench cubes and groups**.

> **Version 0.2.0 — experimental public test.** JavaScript syntax and mocked Blockbench integration are checked in GitHub Actions. Real Blockbench Desktop behavior still requires in-app testing.

## What's new in v0.2

- **Fixed empty plugin Settings tab.** Provider, model, endpoint and a **Configure API key** action now register through Blockbench's native Setting API, so they appear under **Plugins → Blockbench AI → Settings**.
- Redesigned dockable assistant: cleaner typography, provider settings, refined messages, active progress, quick prompts, contextual project bar, and easier navigation.
- Dedicated **Ajustes** screen *inside* the sidebar as well as native plugin settings.
- Groq free-tier configuration is the default; OpenAI and custom compatible endpoints are supported.
- API key is held only in memory for the session; it is not written to Blockbench's settings or saved inside your models.
- Automated tests cover native preferences, configuration synchronization and safe geometry tools.

## Installation / updating

1. Download the latest **[blockbench_ai.js](blockbench_ai.js)** (**Raw** → Save as) or use the direct [raw JavaScript file](https://raw.githubusercontent.com/jonathanthxd/BlockBenchAI/main/blockbench_ai.js).
2. Open **Blockbench Desktop 5.x**.
3. If an earlier local version is installed, **disable / uninstall it and restart Blockbench**, then **load the new file**. This ensures Blockbench uses the updated JavaScript rather than a cached local copy.
4. Load with **File → Plugins → Load Plugin from File** (or drag the JavaScript file into Blockbench).
5. Open the docked **Blockbench AI** panel (or access it from the Tools menu).

## Configure a free model (Groq)

The plugin **does not include a built-in model or free usage allowance**. Groq offers a rate-limited free API tier, subject to availability and its own conditions. Create your key from [GroqCloud](https://console.groq.com/keys).

The default settings are:

| Field | Default |
|---|---|
| Provider | **Groq** |
| Model | **`openai/gpt-oss-120b`** |
| API endpoint | **`https://api.groq.com/openai/v1/chat/completions`** |
| API key | Paste your Groq key, **session only** |

Two ways to configure:

**Option A — in the chat panel:** open **Ajustes** in the Blockbench AI panel, enter your API key and click **Guardar configuración**.

**Option B — native plugin Settings:** open the Blockbench plugins list, select **Blockbench AI**, select **Settings**, choose **Proveedor / Modelo / Endpoint**, and click **Configurar API key (solo sesión)**. This opens a password dialog. Your API key is not persisted.

Do not add the API key to your repository, screenshots or GitHub issues.

## First test

Create a **Generic Model** in Blockbench and ask:

> Crea un robot pequeño con cabeza, torso, brazos y piernas. Utiliza cubos y organiza las partes en grupos.

The current tool set supports:

- Inspecting project format, cubes, selected cubes and group hierarchy.
- Creating groups and up to 32 cubes per tool call.
- Editing native cubes by UUID.
- Undoable edits and bounded tool execution (192 cubes and 36 tool calls per user request).
- English or Spanish prompts when supported by the provider.

### Limitations

This is an early modeling prototype, **not** an all-format AI 3D asset generator yet. It currently **does not** paint textures, export, generate images, build rigged animation, create arbitrary polygon meshes, or generate rotation-heavy geometry. Only native cube-compatible formats are appropriate for creation. Cube palette indices are *preview colors*, not painted textures. Actual modeling quality depends on the selected AI model.

The endpoint uses the **OpenAI Chat Completions tool calling format**. Endpoints without this API format are not supported. Remote endpoints must use HTTPS; localhost may use HTTP.

If the screen appears outdated after reinstalling, verify the plugin shows **v0.2** in the chat tab and that the old local plugin has been disabled.

## Testing and contributing

Requirements: Node.js 20+.

```bash
node --check blockbench_ai.js
node --test tests/*.test.cjs
```

The tests simulate Blockbench's extension APIs and mock the model's tool calls. They do **not** substitute for testing the actual desktop interface. GitHub Actions runs the same checks on pushes and pull requests.

Report issues with your Blockbench version, operating system, installation method, exact reproduction steps and the error message from developer tools (do not include API keys).

## Privacy and security

- Your configured endpoint receives the prompt and a **limited textual summary** of the active project.
- The API key is kept in memory only and removed when the plugin unloads.
- The plugin does not execute arbitrary JavaScript returned by AI or automatically write/export files.
- Geometry changes use Blockbench's Undo system. Individual completed tool calls form separate undo steps.
- Canceled requests may already have completed changes; use Blockbench Undo if needed.

## Distribution

Blockbench's official plugin repository currently does not accept generative-AI plugins, so this project is installed directly from GitHub.

## License

[MIT](LICENSE).
