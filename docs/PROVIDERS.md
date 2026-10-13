# Configuring AI providers

BlockBenchAI speaks the **OpenAI-style Chat Completions** protocol with tool calling. Providers are selectable under **Blockbench AI → Ajustes** and through Blockbench's native plugin Settings.

## Cloudflare Workers AI — Qwen (recommended for testing)

Cloudflare lists Qwen 3.8 27B as supporting function calling; its actual quota, price and availability depend on your Workers AI account. See the [official model documentation](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/) and [OpenAI compatibility guide](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/).

1. Sign in to Cloudflare and locate your **Account ID**.
2. Create an API token authorized to invoke Workers AI on that account. Treat the token as a secret.
3. Select **Cloudflare · Qwen Workers AI** under the plugin's Settings.
4. Enter the **32-character Cloudflare Account ID**. This is not your API key.
5. Confirm the model `@cf/qwen/qwen3.8-27b`.
6. Enter the Cloudflare API token into the session-only **API key** field.
7. Select **Probar conexión**, then **Guardar configuración**, and try generating from a fresh Generic Model.

The endpoint is assembled automatically:

```
https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1/chat/completions
```

Qwen3 30B A3B is another supported Cloudflare-hosted function-calling option; use `@cf/qwen/qwen3-30b-a3b-fp8` as the model identifier after selecting your own model. It is not guaranteed to produce better 3D results than the 27B preset.

## Gemini

- [Google AI Studio](https://aistudio.google.com/apikey) supplies API keys when eligible.
- Preset model: `gemini-3.8-flash`.
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`.
- API access, regional availability and any free quota are subject to Google's current plan rules. Do not assume free access is unlimited.

## Groq

- [Groq console](https://console.groq.com/keys)
- Preset model: `openai/gpt-oss-120b`
- Endpoint: `https://api.groq.com/openai/v1/chat/completions`

Groq can return **429** (temporary rate cap) and **413** (a request larger than your plan's token allowance). BlockBenchAI reduces context and uses concise tools, waits/retries where possible for 429, and avoids indefinite retries for 413. Limits cannot be bypassed.

## OpenAI

- Endpoint: `https://api.openai.com/v1/chat/completions`.
- Default model: `gpt-4.1-mini`.
- Requires your own account/API quota; ChatGPT subscription entitlement is separate from API billing.

## Custom/local

Use any service that truly supports **Chat Completions with tool calls**. For a local model server, an example might be `http://localhost:11434/v1/chat/completions`, with a model supported by that server. Localhost connections can omit API keys. A generic chat endpoint that doesn't implement tool calling cannot modify Blockbench geometry.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| 401/403 | Invalid key or provider permissions | Reissue a restricted token and test the endpoint |
| 404 | Wrong endpoint/account/model | Check the model name and Cloudflare Account ID |
| 413 | Too many tokens in one request | Clear a long chat or use a provider with adequate input quota |
| 429 | Quota/rate limit | Use cooldown, wait for reset, or choose another allowed provider |
| CORS/network error | Desktop/security restrictions or offline connection | Confirm endpoint is reachable and supported |
| Connection test passes, modeling fails | Missing tool-calling compatibility | Use a model that supports function/tool calling |

**Important:** The connectivity test is deliberately lightweight and does *not* guarantee that a provider supports BlockBenchAI's modeling tools.
