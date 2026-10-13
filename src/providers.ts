// BlockBenchAI FORGE — providers: endpoints, credentials hygiene, retries.
//
// One OpenAI-compatible Chat Completions transport for Cloudflare/Qwen,
// Gemini, Groq, OpenAI and local endpoints. Secrets live only in memory for
// the plugin session and are redacted from every surfaced error.

import { CLOUDFLARE_MODEL, DEFAULT_ENDPOINT, GEMINI_ENDPOINT, GROQ_ENDPOINT } from './types';
import type { ConnectionConfig, ConnectionResult, StringMap } from './types';
import { fail, safeName } from './validate';
import { preflightPayload } from './agent';

export const MAX_RATE_RETRIES: number = 4;
export const MAX_TOTAL_RATE_WAIT_MS: number = 125000;

export function providerEndpoints(): StringMap {
  return { groq: GROQ_ENDPOINT, gemini: GEMINI_ENDPOINT, openai: DEFAULT_ENDPOINT };
}

export function validCloudflareAccount(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{32}$/i.test((value as string).trim());
}

export function cloudflareEndpoint(account: unknown): string {
  if (!validCloudflareAccount(account)) fail('Introduce un Account ID válido de Cloudflare (32 caracteres hexadecimales).');
  return 'https://api.cloudflare.com/client/v4/accounts/' + String(account).trim() + '/ai/v1/chat/completions';
}

export function validateEndpoint(value: unknown): string {
  let url: URL;
  try {
    url = new URL(String(value || '').trim());
  } catch (ignored) {
    fail('Enter a valid API endpoint URL.');
    throw new Error('unreachable');
  }
  const host = url.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    fail('HTTPS is required except on localhost.');
  }
  if (url.username || url.password || url.hash) fail('API endpoints cannot include credentials or fragments.');
  return url.toString();
}

export function isLocalEndpoint(endpoint: string): boolean {
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(new URL(endpoint).hostname);
  } catch (ignored) {
    return false;
  }
}

export function safeError(message: unknown, secrets: string[]): string {
  let out = String(message || 'Error desconocido').slice(0, 640);
  (secrets || []).forEach(function (secret) {
    if (secret && secret.length > 3) out = out.split(secret).join('[REDACTED]');
  });
  const keyValue = new RegExp('("?(?:api[_-]?key|access[_-]?token|authorization)"?\\s*[:=]\\s*")([^"]+)(")', 'gi');
  return out
    .replace(/\bBearer\s+[a-z0-9._~+/-]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gsk_|sk-|AIza)[a-z0-9_-]{8,}/gi, '[REDACTED]')
    .replace(keyValue, '$1[REDACTED]$3');
}

export function retrySeconds(headers: any, detail: string, retryCount: number): number {
  const raw = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
    const asDate = Date.parse(raw);
    if (Number.isFinite(asDate)) return Math.max(0, (asDate - Date.now()) / 1000);
  }
  const match = /(?:try again in|retry after|reset in)\s+(\d+(?:\.\d+)?)\s*(s|sec|seconds|m|min|minutes)\b/i.exec(detail || '');
  if (match) return Number(match[1]) * (/^m/i.test(match[2]) ? 60 : 1);
  const reset = headers && typeof headers.get === 'function' && headers.get('x-ratelimit-reset-tokens');
  if (reset) {
    const found = /^(\d+(?:\.\d+)?)(s|ms|m)$/i.exec(reset.trim());
    if (found) return Number(found[1]) * (found[2] === 'm' ? 60 : found[2] === 'ms' ? 0.001 : 1);
  }
  return Math.min(12, 3 * Math.pow(2, retryCount));
}

export function waitForQuota(seconds: number, signal: any, onProgress: Function): Promise<void> {
  const until = Date.now() + Math.ceil(seconds * 1000);
  return new Promise(function (resolve, reject) {
    let timer: any = null;
    let settled = false;
    const cleanup = function (): void {
      if (timer !== null) clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    };
    const cancel = function (): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Solicitud cancelada.'));
    };
    const tick = function (): void {
      if (signal.aborted) {
        cancel();
        return;
      }
      const left = Math.max(0, until - Date.now());
      if (left <= 0) {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
        return;
      }
      (onProgress as Function)('Límite del proveedor: reintentando en ' + Math.ceil(left / 1000) + ' s… (puedes detenerlo)');
      timer = setTimeout(tick, Math.min(1000, left));
    };
    signal.addEventListener('abort', cancel, { once: true });
    tick();
  });
}

export function checkProviderConnection(config: ConnectionConfig): Promise<ConnectionResult> {
  const endpoint = validateEndpoint(config.provider === 'cloudflare' ? cloudflareEndpoint(config.cloudflareAccount) : config.endpoint);
  const model = safeName(config.model);
  const localHost = isLocalEndpoint(endpoint);
  if (!config.apiKey && !localHost) fail('La API key es obligatoria. Usa una clave del proveedor elegido.');
  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, 18000);
  const headers: StringMap = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = 'Bearer ' + config.apiKey;
  return fetch(endpoint, {
    method: 'POST',
    headers: headers,
    signal: controller.signal,
    body: JSON.stringify({ model: model, messages: [{ role: 'user', content: 'Reply with: OK' }], max_tokens: 16 }),
  }).then(
    function (response) {
      const done = function (value: ConnectionResult): ConnectionResult {
        clearTimeout(timeout);
        return value;
      };
      const failed = function (error: unknown): Promise<ConnectionResult> {
        clearTimeout(timeout);
        throw error;
      };
      if (!response.ok) {
        return response
          .json()
          .then(function (body) {
            return (body && body.error && body.error.message) || '';
          })
          .catch(function () {
            return '';
          })
          .then(function (message) {
            fail('Conexión rechazada (' + response.status + '). ' + safeError(message || 'Revisa tu clave, modelo y URL.', [config.apiKey]));
          });
      }
      return response
        .json()
        .then(function (data) {
          if (!data || !Array.isArray(data.choices) || !data.choices[0] || !data.choices[0].message) {
            fail('El servidor respondió, pero no devolvió el formato Chat Completions esperado.');
          }
          return done({ provider: config.provider, model: model });
        })
        .catch(function (error) {
          if (error && error.message === 'El servidor respondió, pero no devolvió el formato Chat Completions esperado.') throw error;
          return failed(error);
        });
    },
    function (error) {
      clearTimeout(timeout);
      if (controller.signal.aborted) fail('La comprobación superó el tiempo máximo de conexión (18 segundos).');
      throw error;
    }
  );
}

export function requestCompletion(
  endpoint: string,
  model: string,
  apiKey: string,
  messages: unknown[],
  signal: any,
  onProgress: Function,
  availableTools: unknown[]
): Promise<any> {
  const headers: StringMap = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  const payload = JSON.stringify({ model: model, messages: messages, tools: availableTools, tool_choice: 'auto' });
  preflightPayload(payload, endpoint, model);
  let waited = 0;
  const attempt = function (retry: number): Promise<any> {
    if (signal.aborted) return Promise.reject(new Error('Solicitud cancelada.'));
    return fetch(endpoint, { method: 'POST', headers: headers, signal: signal, body: payload }).then(
      function (response) {
        if (response.status === 413) {
          fail('La API rechazó el tamaño de la solicitud (413). Prueba el proveedor Gemini en Ajustes o reinicia el chat para reducir contexto; el error no se soluciona esperando.');
        }
        if (response.status === 429) {
          return response
            .json()
            .then(function (body) {
              return String((body && body.error && body.error.message) || '');
            })
            .catch(function () {
              return '';
            })
            .then(function (detail) {
              const seconds = retrySeconds(response.headers, detail, retry);
              const delay = Math.min(65000, Math.ceil((seconds + 0.65) * 1000));
              if (retry === MAX_RATE_RETRIES || seconds > 65 || waited + delay > MAX_TOTAL_RATE_WAIT_MS) {
                fail('El proveedor ha alcanzado su límite de uso gratuito. Espera a que se renueve tu cuota o elige otro proveedor en Ajustes. Las modificaciones ya aplicadas se conservaron.');
              }
              waited += delay;
              return waitForQuota(delay / 1000, signal, onProgress).then(function () {
                return attempt(retry + 1);
              });
            });
        }
        if (!response.ok) {
          return response
            .json()
            .then(function (body) {
              return (body.error && body.error.message) || '';
            })
            .catch(function () {
              return '';
            })
            .then(function (detail) {
              fail('API error ' + response.status + (detail ? ': ' + safeError(detail, [apiKey]) : '. Revisa tu API key, modelo y endpoint.'));
            });
        }
        return response
          .json()
          .then(function (data) {
            return data;
          })
          .catch(function () {
            fail('El proveedor devolvió una respuesta JSON inválida.');
          })
          .then(function (data: any) {
            const message = data && data.choices && data.choices[0] && data.choices[0].message;
            if (!message) fail('La API no devolvió una respuesta compatible con Chat Completions.');
            return message;
          });
      },
      function () {
        if (signal.aborted) fail('Solicitud cancelada.');
        fail('No se pudo conectar con la API. Comprueba la URL, la conexión y los permisos de red.');
      }
    );
  };
  return attempt(0);
}
