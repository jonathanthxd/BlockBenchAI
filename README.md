# BlockBenchAI

**An experimental, open-source AI copilot that models inside Blockbench.** Create editable geometry, generate painted PNG atlases, and refine projects using a dockable chat. No bundled paid subscription and no backend account required.

**Current version: 0.5.1** · [MIT License](LICENSE) · **Desktop-first** · [Español](docs/README.es.md)

> The native Blockbench UI and provider integration still need hands-on verification on users' machines. Passing mocked integration tests does not guarantee all Blockbench model formats, GPUs, export codecs or providers will behave identically.

## Install / update

1. Download **[blockbench_ai.js](https://raw.githubusercontent.com/jonathanthxd/BlockBenchAI/main/blockbench_ai.js)** from the latest published `main` branch, or use the file on a tagged release when available.
2. In Blockbench Desktop 5.x, disable/remove the previous local BlockbenchAI plugin and restart Blockbench before loading a new file.
3. Use **File → Plugins → Load Plugin from File**, or drag the JS plugin file into Blockbench.
4. Create a **Generic Model** project and open **Blockbench AI** from the sidebar or the Tools menu.

> This project is distributed externally. The Blockbench official plugin repository has restrictions on generative-AI plugins.

## Fix in v0.5.1 — "Demo Dron" without an API key

Typing **`Demo Dron`** into the chat now runs the **local** drone generator directly rather than sending it to an AI provider. The same applies to **`Demo Espada`**, **`Demo Androide`** and **`Demo Cofre`** (including `demo del dron` and `demo sin IA androide`). No API key or network access is required.

The **Demos** button remains accessible in the chat's project bar even after previous messages hide the welcome screen. This is intentional: demos are editor actions, not AI prompts.

**Before trying the fix:** uninstall the previous plugin, restart Blockbench, install the latest `blockbench_ai.js`, and verify the chat says **v0.5.1**. Create a fresh **Generic Model** and either type `Demo Dron` or use **Demos → Dron**.

If you press the *actual offline demo button* and see an API-key error on v0.5.1, please report the click path and the Blockbench version; the demo handler itself does not call an AI endpoint.

## Start with free offline demos

On the chat welcome screen, select **Demo androide**, **Demo dron**, or **Demo espada**. They generate *real editable geometry and internal pixel textures without an API key*. This helps distinguish editor/UV problems from provider API problems. Start from an empty Generic Model and use **Ctrl+Z** to undo.

## Choose a model provider

Select **Ajustes** in the plugin and choose your provider.

| Provider | Preset model | What you need |
| --- | --- | --- |
| **Cloudflare Workers AI** | `@cf/qwen/qwen3.8-27b` | Cloudflare Account ID + Workers AI API token |
| Google Gemini | `gemini-3.8-flash` | Gemini API key |
| Groq | `openai/gpt-oss-120b` | Groq API key |
| OpenAI | `gpt-4.1-mini` | OpenAI API key and available billing quota |
| Custom/local | Your compatible model ID | OpenAI-compatible Chat Completions endpoint |

Each service sets its own limits and pricing. Free tiers are limited, not unlimited. Your API key is **only held in memory for the active plugin session**. Provider, model and non-secret endpoint/account ID settings may be saved by Blockbench.

**For Cloudflare:** enter the 32-character **Account ID** (not your token). The plugin constructs:

```
https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1/chat/completions
```

Then enter the **API token** in the API key field. Use **Probar conexión** to perform a small, non-modeling connectivity check, then save. Connectivity does not by itself guarantee support for tool calling.

See [Provider Guide](docs/PROVIDERS.md) for step-by-step instructions and rate-limit behavior.

## What the copilot can actually do

- Inspect an active model and selected cubes.
- Create or edit native Blockbench cubes and outliner groups.
- Generate *internal PNG pixel textures* and assign different UV regions to cube faces.
- Create procedural textured humanoids, with segmented faceplates, hands, mechanical joints and lighting details.
- Generate three detailed local prop recipes: an **energy sword**, **sci-fi drone**, and **treasure chest**.
- Build custom objects through a compact model planning tool that expands into materials and texture details locally.
- Stop tool execution, respect per-request geometry/tool limits and integrate with Blockbench Undo.
- Detect concurrent changes to geometry while an AI request is in flight and avoid applying stale operations.
- Retain your chat context during the plugin session. The plugin keeps the API key out of project files.
- Run a small provider connectivity check without uploading project geometry or tool schemas.

### Known limitations

- **Not advanced sculpting:** generated geometry is currently predominantly axis-aligned cubes, not complex polygon meshes or sculpted surfaces.
- **Procedural texturing:** pixel patterns are generated locally; this is not photorealistic generative image painting or diffusion-based texture synthesis.
- **No automatic rigging/animation** in this release.
- Textures are stored in native Blockbench structures. Exporting into a target Minecraft/game format must be manually verified.
- Some restrictive or third-party formats may reject geometry or extra atlases; use **Generic Model** for the first test.
- A painted atlas is generated per modeling task. Avoid generating too many textures in one project until later atlas-reuse support is implemented.
- Models generated via AI depend on the provider's ability to follow the tool calling format. Real API availability and quotas can change.

## Security & privacy

- Prompts and a **bounded textual model summary** are sent to the endpoint selected by the user during AI requests.
- No model-generated arbitrary JavaScript is executed.
- No automatic exports or file overwrites.
- HTTPS is required for remote endpoints; HTTP is supported only on loopback.
- API keys are intentionally not saved; sensitive strings are redacted in errors where possible.

See [Security](SECURITY.md). Do not post API keys in screenshots, tickets or public GitHub issues.

## Developer workflow

No npm dependencies are required to load the plugin. Node 20+ is recommended for automated tests.

```bash
npm run check
```

The bundle is a standalone `blockbench_ai.js`. The tests run a simulated Blockbench API; real desktop QA is documented in [Manual Test Plan](docs/MANUAL_TEST_PLAN.md).

## Contributions

Issue reports should include the Blockbench version, operating system, plugin version, model format, reproducible steps and the error message **without private API credentials**. See [Architecture](docs/ARCHITECTURE.md) and [Changelog](CHANGELOG.md).

License: [MIT](LICENSE).
