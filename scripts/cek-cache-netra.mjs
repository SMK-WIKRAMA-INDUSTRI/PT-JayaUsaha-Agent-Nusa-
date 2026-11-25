// Menguji apakah Netra Runtime meneruskan context caching DeepSeek.
// Jalankan: node --env-file=.env.local scripts/cek-cache-netra.mjs
// Aturan DeepSeek: prefix yang sama pada permintaan ke-1 dan ke-2 dipersist sebagai unit cache,
// sehingga permintaan ke-3 dengan prefix yang sama seharusnya kena cache.

const BASE = (process.env.NETRA_BASE_URL || 'https://api.netraruntime.com/v1').replace(/\/+$/, '');
const KEY = process.env.NETRA_API_KEY;
const MODEL = process.env.NETRA_MODEL || 'deepseek/deepseek-v4.1-flash';
if (!KEY) {
  console.error('NETRA_API_KEY belum diisi di .env.local');
  process.exit(1);
}

// Prefix panjang (jauh di atas 64 token) supaya layak di-cache.
const PREFIX = Array.from({ length: 120 }, (_, i) => `Aturan ${i + 1}: jawab dengan sopan dan ringkas dalam Bahasa Indonesia.`).join('\n');
const headers = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'X-Netra-Agent': 'agent-nusa-cs' };
const body = (q, extra) =>
  JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: PREFIX }, { role: 'user', content: q }], max_tokens: 16, reasoning: { enabled: false }, ...extra });
const hitOf = (u) => (u ? u.prompt_cache_hit_tokens ?? (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) : undefined);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function askPlain(q) {
  const res = await fetch(BASE + '/chat/completions', { method: 'POST', headers, body: body(q, { stream: false }) });
  const j = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j)}`);
  return j.usage;
}

async function askStream(q) {
  const res = await fetch(BASE + '/chat/completions', { method: 'POST', headers, body: body(q, { stream: true, stream_options: { include_usage: true } }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  let usage;
  for (const line of (await res.text()).split('\n')) {
    const data = line.trim().startsWith('data:') ? line.trim().slice(5).trim() : '';
    if (!data || data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      if (j.usage) usage = j.usage;
    } catch {
      /* baris bukan JSON */
    }
  }
  return usage;
}

console.log('--- Non-stream ---');
for (const [i, q] of ['Balas satu kata: siap', 'Balas satu kata: oke', 'Balas satu kata: baik'].entries()) {
  const u = await askPlain(q);
  console.log(`Permintaan ${i + 1}: usage =`, JSON.stringify(u), '| cache hit =', hitOf(u));
  await wait(3000);
}

console.log('--- Stream dengan stream_options.include_usage ---');
try {
  const u = await askStream('Balas satu kata: sip');
  console.log('usage di chunk terakhir =', JSON.stringify(u), '| cache hit =', hitOf(u));
  if (!u) console.log('Netra TIDAK mengirim usage saat stream.');
} catch (e) {
  console.log('Stream dengan stream_options GAGAL:', e.message);
}
