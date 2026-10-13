# Manual Blockbench Desktop test plan (required before stable release)

This is an operational acceptance plan, **not a claim that the app has already passed all tests on a real Blockbench desktop installation**.

## Environment to record

- Blockbench exact version, operating system, GPU and active model format.
- Plugin JS version, provider/model if connected, and installation method.
- Whether this is an empty project or an existing file.

## Installation/UI

- [ ] Uninstall previous local plugin, restart, install v0.5.0 and verify displayed version.
- [ ] Sidebar panel opens from Tools and remains functional when moved/resized.
- [ ] Native plugin Settings show provider, endpoint, model, Cloudflare Account ID and session-key action.
- [ ] In-panel Ajustes loads, validates and saves preferences; closing/reopening the panel preserves settings but *not the session key after plugin unload*.
- [ ] Keyboard Enter sends and Shift+Enter adds a line. Stop cancels a pending network request.

## Real offline geometry/texture smoke tests (no API key)

Perform each in a **new Generic Model**:

- [ ] Click **Demo androide**. Examine face geometry, hands/fingers, armor details and multi-group hierarchy.
- [ ] Inspect textures: one internal PNG atlas with visibly different material pixels, not just palette colors.
- [ ] Check that front/back/side cube faces display different UV regions and no solid magenta/transparent artifacts.
- [ ] Save as `.bbmodel`, close, reopen; geometry, PNG and UV mapping should remain intact.
- [ ] Undo once and verify geometry + atlas added by this operation are removed.
- [ ] Click **Demo dron**, inspect rotor hubs/blades, landing pads, camera lens and textured chassis.
- [ ] Click **Demo espada**, inspect blade, guard, engravings, hilt and colored textures.
- [ ] Undo the drone/sword operations one by one and verify no unrelated elements are removed.
- [ ] Verify no malformed zero-size cubes, duplicate editor errors or new console errors.

## Provider integration

- [ ] Groq: use **Probar conexión**, run a simple model request and verify tools appear without 413.
- [ ] Cloudflare Qwen: supply Account ID + correct token, use **Probar conexión**, generate a procedural sword or drone.
- [ ] Wrong Cloudflare Account ID: expect visible validation and *no request sent to an old provider*.
- [ ] Gemini: test a compatible model with function calling. Record exact model version.
- [ ] Custom localhost: verify a compatible local Chat Completions tool-calling model.
- [ ] Invalid key: 401 is communicated without exposing the secret.
- [ ] Temporary 429: cooldown and cancel work, with no duplicate geometry applied.

## Safety and concurrency

- [ ] With an AI request in flight, manually change a cube or group before it responds. Expect a safe cancellation due to stale context.
- [ ] Switch project mid-request. Expect cancellation with no writes to the new project.
- [ ] Lock an existing cube and ask the model to change it. Expect rejection.
- [ ] Ask for a geometry beyond the format's limits and observe a clear failure instead of corruption.
- [ ] Cancel a multi-step operation and use Undo to inspect partial steps.

## Format/export

- [ ] Generic Model `.bbmodel` round-trip.
- [ ] Minecraft Java Block/Item (expect constraints; **do not** assume arbitrary large textures or cubes work).
- [ ] Bedrock Entity (verify UV and skeleton constraints).
- [ ] At least one third-party format, recorded by ID, if supported.

## Acceptance policy

The version may be called **experimental/public testable** after automated tests pass. It should not be described as **production-stable** until the critical desktop tests above pass on multiple machines/formats/providers.
