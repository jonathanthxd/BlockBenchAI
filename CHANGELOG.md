# Changelog

## 0.5.1 — Offline demo commands and discoverability

- Fixed `Demo Dron` typed into chat being sent to the remote AI instead of the local model generator.
- Added direct chat commands for drone, sword, android, and chest demos without any API key.
- Added a persistent **Demos** picker in the chat header, available after welcome messages disappear.
- Added 3 integration tests for offline routing, aliases, and normal AI prompts.


## 0.5.0 — Quality & provider infrastructure

- Added native **Cloudflare Workers AI** integration with Qwen 3.8 27B preset, 32-character Account ID validation, and computed OpenAI-compatible Chat Completions endpoint.
- Added a small **Probar conexión** diagnostics request with a bounded timeout and no project data transfer.
- Added high-detail deterministic local recipes for **energy sword**, **sci-fi drone**, and **treasure chest**; each builds editable geometry with generated PNG texture atlases and organized outliner groups.
- Expanded the no-token welcome gallery with additional offline models for testing geometry and UVs independently of providers.
- Prevented applying stale AI tool output after a concurrent manual change to the open model.
- Hardened error rendering to redact session credentials and common provider token forms.
- Added a public manual QA checklist, provider guide, security notes and architecture record.
- Kept all changes backwards-compatible with the existing standalone JavaScript plugin entry point.

**Testing:** Automated mocks exercise plugin registration, provider endpoints, API requests, texture generation, UV mapping, rate limiting and undo transactions. In-app Blockbench validation remains necessary.

## 0.4.0 — Context and tool efficiency

- Compact model geometry contract, context/token reduction, Gemini preset and preflight 413 defense.
- Outliner subdivisions and improved humanoid detailing.
- Offline humanoid demo.

## 0.3.0 — Pixel textures

- Generated internal PNG texture atlases and face UV mapping.
- Added procedural humanoid generation and ability to repaint existing cubes.

## 0.2.x — Native settings and rate-limit handling

- Registered native plugin settings and redesigned the chat panel.
- Added automatic cooldown on recoverable 429 responses.

## 0.1.0 — Initial prototype

- Native docked chat, compatible API tool calls, cube/group create/edit and Undo integration.
