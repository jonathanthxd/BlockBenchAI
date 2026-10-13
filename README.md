# BlockBenchAI

**BlockBenchAI** is an independent, MIT-licensed AI modeling assistant for [Blockbench](https://www.blockbench.net/). Write a prompt in the dockable chat panel to create or modify **real, editable Blockbench cubes and groups**.

> **Version 0.4.0 — experimental public test.** JavaScript syntax and mocked Blockbench integration are checked in GitHub Actions. Real Blockbench Desktop behavior still requires in-app testing.

## What's new in v0.4 — quality, Gemini, compact geometry and rate-limit control

**Reason for this update:** Groq's free GPT-OSS 120B plan enforces **8,000 tokens/minute** and returns HTTP 413 when one request would exceed that ceiling. Sending verbose tool schemas, project snapshots and repeated conversation transcripts could exceed the entire quota before any modeling began.

### Choose a free provider

In **Blockbench AI → Ajustes**, select one of the following presets and enter the API key for **that provider**:

| Provider | Model | Chat Completions endpoint | Notes |
| --- | --- | --- | --- |
| **Google Gemini (recommended)** | \`gemini-3.8-flash\` | \`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions\` | Google lists free-tier access; exact limits depend on the project and model. |
| **Groq (fast)** | \`openai/gpt-oss-120b\` | \`https://api.groq.com/openai/v1/chat/completions\` | Groq free: 8K TPM for this model, and quota resets. |
| **OpenAI** | \`gpt-4.1-mini\` | \`https://api.openai.com/v1/chat/completions\` | Requires available API credit. |
| **Custom/local** | Your model | Compatible endpoint | Requires OpenAI-style Chat Completions and tool calling. |

Get Gemini key: [Google AI Studio](https://aistudio.google.com/apikey). Groq key: [GroqCloud](https://console.groq.com/keys).

**Important:** switching providers requires entering a key issued by the newly selected provider. No API is guaranteed to be unlimited, and free quotas can change.

### Under the hood

- **Compact modeling plan:** for new non-humanoid models, AI returns compact shape strings (name, XYZ bounds, material, palette). The plugin expands geometry, shading, palette, UV tiles and PNG texture generation locally.
- **Offline verification:** the welcome screen contains **Demo local · Sin IA / API**, which generates a full detailed, textured android inside Blockbench without network access or any API key. This isolates modeling problems from provider quotas. It modifies your project (Undo is supported), so test it in a fresh Generic Model.
- **Small tools only:** the API no longer sees all the nested schemas for every possible paint operation.
- **Context budgeting:** fewer previous turns and smaller scene previews. This reduces repetitive input tokens.
- **Groq 413 protection:** conservative preflight estimate for GPT-OSS 120B, plus a descriptive provider-switch message for 413. We do **not** automatically retry a request that exceeds the per-request quota.
- **Better procedural character finish:** expressive eye-lens geometry, cheeks, collar, emblems, wrist lights, face details, boots and seams, on top of the prior base.
- **Outliner organization:** generated multi-part models gain subgroups based on component name prefixes, e.g. Head, Face, Chest, Left and Right.

**Realistic quality note:** these improvements produce a more coherent editable model, but this is still **procedural cuboid modeling** with pixel texture patterns, not image-to-3D reconstruction or advanced sculpting. Quality depends on model, prompt, available format and follow-up iterations.

### Suggested test prompts

In a **fresh Generic Model**:

> Crea un aldeano androide con generate_character, acabado detallado, ojos luminosos, placas de armadura, cables y aspecto pixel art. Paleta gris titanio, cobre y cian.

For non-character models:

> Crea una motocicleta futurista con distintas capas de geometría y texturas pixel art reales. Quiero ruedas, suspensión, faros, asiento, alerones y paneles de motor.

For the first test, keep the model empty; do not ask for rigging or arbitrary polygonal meshes yet.

## What's new in v0.3 — actual pixel texturing and detailed models

Previously, the AI could create simple untextured cube scaffolds and set *viewport palette colors*, which are **not actual texture pixels**. This release adds an internal PNG texture generation pipeline:

- **Actual paintable PNG textures:** builds color-shaded texture atlases in memory using a pixel canvas, registers them as native Blockbench textures, and assigns per-face UV rectangles to every generated cube.
- **Materials:** metal, wood, fabric, stone, skin, circuit, gem and plain. Materials include deterministic pixel details, highlights, shading, and optional accent colors.
- **Paint custom features:** individual rectangles, dots and lines in a 16×16 pixel grid per face (e.g. android eyes, panels, circuit traces).
- **Detailed procedural characters:** \`generate_character\` produces named geometry for villagers, android villagers, robots and knights. Instead of an unadorned collection of body rectangles, characters now have mechanical joints, layered faceplates, noses, boots, fingers, trim and other accents.
- **New AI tools:** \`build_painted_model\` for 1–96 colored parts, \`paint_existing_cubes\` for recoloring existing geometry, and \`generate_character\` for detailed starting points.
- **Better free-tier efficiency:** dynamically exposes only relevant tools to the provider according to your current request, reducing tool-schema token overhead.

**Recommended first test:** start a **new Generic Model** and type:

> Crea un aldeano androide detallado usando generate_character. Quiero una cara reconocible, placas mecánicas, brazos articulados, manos con dedos, botas, circuitos luminosos y una textura PNG real. Usa gris acero, cobre y luces cian.

Then try a follow-up:

> Pinta su cabeza y sus circuitos con una paleta más oscura y detalles dorados.

### Important scope and safeguards

- This is **procedural pixel art**, not generative image diffusion, manual artistic painting, or photorealistic texturing. The AI supplies palette/materials/marks and the plugin paints real pixels deterministically.
- The generated texture is a **new native PNG atlas**, not an external file that must be imported. Save the Blockbench project to keep the texture inside the project as supported by the chosen format.
- Each face is mapped independently to one 16×16 tile. This produces crisp surfaces and independent details, but it may stretch the pixels depending on a cube's aspect ratio.
- This implementation deliberately rejects painting when a **single-texture format already has a texture**, rather than overwriting your existing artwork or UV layout. For best results use a fresh **Generic Model**.
- The standalone \`create_cubes\` tool still generates plain cubes; use the new painted tools when you need real textures.
- More elaborate characters still need human iteration, custom mesh operations, rigging, and manual artistry. Texture production has **not** been verified in Blockbench Desktop itself yet.

## What's new in v0.2.1

- **Automatic Groq 429 recovery:** when its free tokens-per-minute quota is temporarily reached, the assistant reads `Retry-After` or the API response, displays a countdown, then retries up to four times. Use **Detener** to cancel immediately. If a quota does not reset soon, it shows a friendly message instead of waiting indefinitely.
- **Lower token usage:** sends a smaller project snapshot and recent conversation history and retains only the most recent tool exchanges. Geometry remains editable and the active project is inspected again at each step.
- You do **not** need to upgrade to a paid Groq plan for temporary rate limits. No software can bypass the service's quota.

## Previously added in v0.2

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

This is an early modeling prototype, **not** an all-format AI 3D asset generator yet. It can now paint procedural pixel textures, but **does not** export automatically, generate image assets with a diffusion model, build rigged animation, or create arbitrary polygon meshes. Only native cube-compatible formats are appropriate for creation. Cube palette indices are *preview colors*, not painted textures. Actual modeling quality depends on the selected AI model.

The endpoint uses the **OpenAI Chat Completions tool calling format**. Endpoints without this API format are not supported. Remote endpoints must use HTTPS; localhost may use HTTP.

If the screen appears outdated after reinstalling, verify the plugin shows **v0.4** in the chat tab and that the old local plugin has been disabled.

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
