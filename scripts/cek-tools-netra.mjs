// Menguji apakah Netra Runtime meneruskan tool calling DeepSeek (ADR 0006).
// Jalankan: node --env-file=.env.local scripts/cek-tools-netra.mjs
// Yang diuji:
//   1. non-stream: model memanggil tool dengan argumen yang benar
//   2. stream: potongan tool_calls bisa dirakit ulang
//   3. round-trip: hasil tool (role "tool") diterima dan model membalas teks
//   4. cache: prefix yang sama + definisi tool tetap kena cache pada permintaan ke-3
//   5. prompt yang berakhir dengan pesan system (dipakai sesi yang dimulai agent) menghasilkan teks

const BASE = (process.env.NETRA_BASE_URL || 'https://api.netraruntime.com/v1').replace(/\/+$/, '');
const KEY = process.env.NETRA_API_KEY;
const MODEL = process.env.NETRA_MODEL || 'deepseek/deepseek-v4.1-flash';
if (!KEY) {
  console.error('NETRA_API_KEY belum diisi di .env.local');
  process.exit(1);
}

const PREFIX = Array.from({ length: 120 }, (_, i) => `Aturan ${i + 1}: jawab dengan sopan dan ringkas dalam Bahasa Indonesia.`).join('\n');
const SYSTEM = PREFIX + '\nJika nasabah menceritakan pengeluaran beserta nominalnya, panggil tool catat_pengeluaran. Jangan mengarang nominal.';
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'catat_pengeluaran',
      description: 'Mencatat pengeluaran yang diceritakan nasabah. Hanya dipanggil jika nasabah menyebut nominalnya sendiri.',
      parameters: {
        type: 'object',
        properties: {
          barang: { type: 'string', description: 'Nama barang atau keperluan' },
          nominal: { type: 'integer', description: 'Nominal dalam rupiah, persis seperti yang disebut nasabah' },
          kategori: { type: 'string', enum: ['makan', 'jajan', 'belanja', 'transportasi', 'tagihan', 'hiburan', 'lainnya'] }
        },
        required: ['barang', 'nominal', 'kategori']
      }
    }
  }
];
const headers = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'X-Netra-Agent': 'agent-nusa-cs' };
const hitOf = (u) => (u ? u.prompt_cache_hit_tokens ?? (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) : undefined);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = 'tadi abis jajan bakso 25 ribu';

async function post(payload) {
  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: MODEL, max_tokens: 160, temperature: 0.3, reasoning: { enabled: false }, ...payload })
  });
  return res;
}

async function plain(messages, extra = {}) {
  const res = await post({ messages, stream: false, ...extra });
  const j = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j)}`);
  return j;
}

async function streamed(messages, extra = {}) {
  const res = await post({ messages, stream: true, stream_options: { include_usage: true }, ...extra });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const calls = [];
  let text = '';
  let usage;
  let finish;
  for (const line of (await res.text()).split('\n')) {
    const data = line.trim().startsWith('data:') ? line.trim().slice(5).trim() : '';
    if (!data || data === '[DONE]') continue;
    let j;
    try {
      j = JSON.parse(data);
    } catch {
      continue;
    }
    if (j.usage) usage = j.usage;
    const c = j.choices && j.choices[0];
    if (!c) continue;
    if (c.finish_reason) finish = c.finish_reason;
    const d = c.delta || {};
    if (d.content) text += d.content;
    for (const tc of d.tool_calls || []) {
      const slot = (calls[tc.index ?? 0] ||= { id: '', name: '', arguments: '' });
      if (tc.id) slot.id = tc.id;
      if (tc.function && tc.function.name) slot.name += tc.function.name;
      if (tc.function && tc.function.arguments) slot.arguments += tc.function.arguments;
    }
  }
  return { calls, text, usage, finish };
}

const base = [
  { role: 'system', content: SYSTEM },
  { role: 'user', content: USER }
];
const hasil = {};

console.log('--- 1. Non-stream dengan tools ---');
try {
  const j = await plain(base, { tools: TOOLS, tool_choice: 'auto' });
  const msg = j.choices[0].message;
  console.log('finish_reason =', j.choices[0].finish_reason);
  console.log('tool_calls =', JSON.stringify(msg.tool_calls));
  console.log('content =', JSON.stringify(msg.content));
  hasil.nonStream = !!(msg.tool_calls && msg.tool_calls.length);
  hasil.toolCall = msg.tool_calls && msg.tool_calls[0];
} catch (e) {
  console.log('GAGAL:', e.message);
  hasil.nonStream = false;
}

console.log('--- 2. Stream dengan tools ---');
try {
  await wait(2000);
  const s = await streamed(base, { tools: TOOLS, tool_choice: 'auto' });
  console.log('finish_reason =', s.finish, '| tool_calls =', JSON.stringify(s.calls), '| teks =', JSON.stringify(s.text));
  console.log('usage =', JSON.stringify(s.usage));
  hasil.stream = s.calls.length > 0 && s.calls.every((c) => c.name && (() => { try { JSON.parse(c.arguments); return true; } catch { return false; } })());
} catch (e) {
  console.log('GAGAL:', e.message);
  hasil.stream = false;
}

console.log('--- 3. Round-trip hasil tool ---');
if (hasil.toolCall) {
  try {
    await wait(2000);
    const tc = hasil.toolCall;
    const j = await plain(
      [
        ...base,
        { role: 'assistant', content: '', tool_calls: [tc] },
        { role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ status: 'menunggu_konfirmasi', kartu: 'Catat Rp 25.000 - Bakso (Jajan)?' }) }
      ],
      { tools: TOOLS }
    );
    console.log('balasan =', JSON.stringify(j.choices[0].message.content));
    hasil.roundTrip = !!(j.choices[0].message.content || '').trim();
  } catch (e) {
    console.log('GAGAL:', e.message);
    hasil.roundTrip = false;
  }
} else {
  console.log('dilewati: tidak ada tool_call dari langkah 1');
  hasil.roundTrip = false;
}

console.log('--- 4. Cache dengan definisi tool ---');
const hits = [];
for (const q of ['Balas satu kata: siap', 'Balas satu kata: oke', 'Balas satu kata: baik']) {
  try {
    await wait(3000);
    const j = await plain([{ role: 'system', content: SYSTEM }, { role: 'user', content: q }], { tools: TOOLS });
    console.log('usage =', JSON.stringify(j.usage), '| cache hit =', hitOf(j.usage));
    hits.push(hitOf(j.usage) || 0);
  } catch (e) {
    console.log('GAGAL:', e.message);
    hits.push(0);
  }
}
hasil.cache = hits[2] > 0;

console.log('--- 5. Prompt berakhir pesan system ---');
try {
  await wait(2000);
  const j = await plain([
    { role: 'system', content: PREFIX },
    { role: 'system', content: 'KARTU RENCANA ALOKASI\nGaji masuk: Rp 12.500.000\nSapa nasabah dan jelaskan kartu ini dalam 2 kalimat.' }
  ]);
  console.log('balasan =', JSON.stringify(j.choices[0].message.content));
  hasil.akhirSystem = !!(j.choices[0].message.content || '').trim();
} catch (e) {
  console.log('GAGAL:', e.message);
  hasil.akhirSystem = false;
}

console.log('--- RINGKASAN ---');
console.log(JSON.stringify({ nonStream: hasil.nonStream, stream: hasil.stream, roundTrip: hasil.roundTrip, cache: hasil.cache, akhirSystem: hasil.akhirSystem }));
