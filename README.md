# BlockBenchAI

Open-source AI modeling assistant for Blockbench. Early development release: a dockable chat panel that uses OpenAI-compatible tool calling to create and edit native Blockbench geometry.

> **Status:** experimental. The plugin has not yet been verified by a human in the Blockbench desktop application.

## Installation

1. Download [`blockbench_ai.js`](blockbench_ai.js) from this repository (use **Raw** / save as).
2. Open Blockbench Desktop and drag the JavaScript file into the editor, or use **File → Plugins → Load Plugin from File**.
3. Open the **Blockbench AI** sidebar panel. Choose **Settings** and add your API key, model and endpoint.
4. Start a model with **File → New**, then ask for geometry (for example, `Create a simple robot with a head, torso, arms and legs`).

Your key is kept in memory for this session only. The plugin sends your prompt and bounded project geometry context to the endpoint you configure. Do not use confidential projects with untrusted providers. The plugin does **not** contain a built-in model or free API quota.

## Current scope

- Dockable chat with configurable OpenAI-compatible API endpoint (including local OpenAI-compatible servers).
- Contextual inspection of the current project, cube creation, cube editing and grouping.
- Validated tool input, size limits, Undo integration and safeguards against switching projects mid-run.
- English-language interface; English or Spanish prompts may be used if the configured model supports them.

**Not yet included:** automatic texture painting, rigging, animation, arbitrary mesh modeling, images as prompts, or support guarantees for every third-party format. Creation is enabled only on formats advertising cube support. A cube's preview palette index is **not** a painted/exportable texture.

## Security

- No model-generated JavaScript execution.
- No automatic file writing or exports.
- Requests may use HTTPS endpoints; insecure HTTP is allowed only on localhost / loopback.
- API keys are never intentionally persisted or included in project content or error logs.
- Geometry edits are entered into Blockbench's Undo history.

## Developer checks

`node --check blockbench_ai.js` and `node --test tests/*.test.cjs` (Node.js 20+). No installation or npm dependencies are required.

## Publishing

The official Blockbench plugin repository currently does not accept generative-AI plugins. Install and distribute this one externally through GitHub.

## License

MIT — see [LICENSE](LICENSE).
