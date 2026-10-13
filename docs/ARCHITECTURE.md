# BlockBenchAI architecture — current implementation

## User-facing design

BlockBenchAI is a standalone JavaScript plugin that registers a native dockable `Panel`, a Tools action and native Settings. The UI is implemented using the Vue component support exposed by Blockbench. Provider credentials are session-only.

## Runtime data flow

```text
Prompt
  ↓
Format + scene snapshot (bounded)
  ↓
Task-specific tool selection (small tool schema)
  ↓
User-selected Chat Completions endpoint
  ↓
Validated tool arguments
  ↓
Deterministic modeling operations inside Blockbench
  ↓
Native cubes + groups + internal PNG atlas + face UV
  ↓
Blockbench Undo transaction + viewport refresh
```

The AI cannot execute arbitrary code. Cloudflare, Gemini, Groq and OpenAI share the same Chat Completions transport with provider-specific presets. Actual support depends on each model's function-calling behavior.

## Modeling contracts

- **Small scene reading:** only a limited subset of objects and IDs enters prompts. Large scenes are not fully serialized.
- **Procedural presets:** `generate_character` builds a multicomponent humanoid. `generate_prop` builds energy swords, drones and treasure chests.
- **Compact custom modeling:** `compose_model` accepts `name|fromXYZ|toXYZ|materialCode|paletteSlot` records and expands to native cubes with a paintable material atlas.
- **Pixel texture pipeline:** Canvas rasterization to PNG data URL, then a native Texture record; cube faces point to unique UV tiles.
- **Edits:** `edit_cubes` and `paint_existing_cubes` operate against existing UUIDs, respecting locking/limits.
- **Undo:** operations are wrapped in Blockbench edit transactions. Generated textures and cubes are tracked in the same recorded change.
- **Concurrent modifications:** before sending a model request, a scene revision signature is collected; the result is rejected when the scene changes during the network wait.

## Quality limitations and roadmap

The current entry point is still a **single bundled JavaScript file**. This lowers installation friction but increases code-review cost. A future refactor should extract TypeScript packages with a reproducible bundler. The standalone artifact must remain available.

Priorities for future work (not implemented here):

1. Test/expand native mesh operators and rigging per format.
2. Improve procedural shading and face-specific pixel painting on a reusable atlas.
3. Better multi-turn planning and inspect/repair loops with per-project context summaries.
4. Non-destructive visual previews and approval of destructive operations.
5. End-to-end actual Blockbench desktop automation and screenshot-based regression tests.
6. A properly versioned multi-file TypeScript source tree with deterministic builds and releases.

## Compliance and distribution

The official Blockbench plugin catalog does not currently accept generative-AI plugins. This is a third-party GitHub project with an MIT license and a publicly installable standalone JS plugin.

## FORGE (0.6.0) — modular sources

The single-file entry point is now a build artifact. Authoritative sources:

```text
src/types.ts      shared contracts, limits, Blockbench host declarations
src/validate.ts   validation guards for geometry and paint specs
src/geometry.ts   Geometry Engine: transactions, hierarchy, symmetry,
                  repetition, transforms, convex extrusion
src/texture.ts    Texture Engine: PNG atlases, UV mapping, incremental retouch
src/presets.ts    8 deterministic benchmark part builders
src/agent.ts      intent planning, tool budgets, token estimates, history
src/providers.ts  Cloudflare/Gemini/Groq/OpenAI transport, retries, redaction
src/ui.ts         copilot panel: states, progress, op log, demos, benchmarks
src/main.ts       tool registry, generators, agent loop, plugin registration
```

`npm run build` concatenates them (in order) into `blockbench_ai.js` after
stripping type-level syntax; see `docs/BUILD.md` for the supported subset.
`npm run check` rebuilds, syntax-checks and runs all 63 tests.
