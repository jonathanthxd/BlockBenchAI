# Security and privacy

BlockBenchAI executes tool calls **inside the user's Blockbench instance**. It does not require a hosted BlockBenchAI service, and it does not execute model-supplied JavaScript.

## Sensitive data

- API keys are held in the live plugin session and intentionally not persisted in localStorage, Blockbench project files, or the native Settings values.
- The selected provider, model, endpoint and Cloudflare Account ID (not secret) may be saved as preferences.
- Error messages attempt to redact recognized token patterns and the live session key. Providers can change their error formats, so do not paste unreviewed logs or screenshots publicly.
- Prompts and a **limited textual summary of project geometry** are sent to your chosen remote AI provider for normal chat/modeling requests.
- The **Probar conexión** action sends only a small fixed test message and the provider configuration, not a project snapshot.

## Endpoint trust

- Remote URLs must use HTTPS. Loopback HTTP is accepted for locally hosted endpoints.
- A custom endpoint receives your API key as a Bearer token. Do not point the plugin at untrusted URLs.
- We do not guarantee provider-specific CORS or Electron network policies. An endpoint that works with curl may require different permissions in Blockbench.

## Modeling trust boundaries

- AI output is parsed into allowed modeling operations and bounded by geometry limits.
- Texture creation uses Canvas drawing primitives; arbitrary scripting tools are not available.
- Changes are recorded through Blockbench Undo. A partially completed multi-tool request may require multiple undo actions.
- A scene revision check prevents applying tool output created against an outdated model if the user edits geometry during the network request.
- Never assume all Blockbench formats accept every texture or UV operation.

## Reporting vulnerabilities

Open a GitHub security report or issue with a minimized reproduction that contains **no actual API keys, access tokens or confidential models**. Clearly identify affected version, provider, format and reproducible steps.

## Out of scope (yet)

There is no security audit or penetration test certification. We have no independent proof of compatibility with every Blockbench release, external plugin or model provider.
