// Panggilan ke Netra Runtime (proxy DeepSeek). API key hanya ada di env server.
import { fail } from './http';

const BASE = (process.env.NETRA_BASE_URL || 'https://api.netraruntime.com/v1').replace(/\/+$/, '');
const MODEL = process.env.NETRA_MODEL || 'deepseek/deepseek-v4.1-flash';

export const netraSiap = () => !!process.env.NETRA_API_KEY;

export function panggilNetra(messages, { stream = false, signal, maxTokens = 600 } = {}) {
  return fetch(BASE + '/chat/completions', {
    method: 'POST',
    signal,
    headers: { Authorization: 'Bearer ' + process.env.NETRA_API_KEY, 'Content-Type': 'application/json', 'X-Netra-Agent': 'agent-nusa-cs' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
      reasoning: { enabled: false },
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {})
    })
  });
}

// Status Netra tidak diteruskan apa adanya: 401 dari Netra (key server salah) bukan berarti login Nasabah berakhir.
export async function gagalNetra(upstream) {
  let detail = '';
  try {
    const j = await upstream.json();
    detail = (j && j.error && (j.error.message || j.error)) || '';
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch {
    /* bukan JSON */
  }
  const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 502;
  return fail(status, `API Netra menolak permintaan (HTTP ${upstream.status})${detail ? ': ' + detail : ''}.`);
}
