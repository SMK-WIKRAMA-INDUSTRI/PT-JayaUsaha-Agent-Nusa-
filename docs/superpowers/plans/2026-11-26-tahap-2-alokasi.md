# Tahap 2 (Alokasi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saat Gaji masuk (tombol Panel Demo), sistem membuat Rencana Alokasi deterministik dan Notifikasi Gajian. Notifikasi itu membuka Sesi Percakapan yang dimulai agent dengan kartu Rencana yang bisa diedit dan diterapkan ke Kantong. Tahap ini juga memverifikasi tool calling lewat Netra untuk Tahap 3.

**Architecture:**
- Hitungan Rencana Alokasi ada di fungsi murni `lib/alokasi.js` (vitest).
- Uang hanya berubah lewat fungsi Postgres atomik (`ingest_transaksi`, `terapkan_rencana`), dipanggil route handler dengan service role.
- Kartu disimpan sebagai baris `chat_messages` ber-role `kartu`. Isi teksnya beku (prefix cache), sedangkan status Rencana yang hidup dibaca UI dari tabel `allocation_plans`.
- Perubahan setelah sesi dibuat masuk sebagai pesan `pembaruan` di akhir riwayat.

**Tech Stack:** Next.js 15 App Router (JavaScript), React 19, Supabase (Postgres, Auth, RLS, Realtime) lewat `@supabase/ssr` dan `@supabase/supabase-js`, Netra Runtime (`deepseek/deepseek-v4.1-flash`), vitest.

**Referensi:** `docs/specs/agent-keuangan.md` (bagian 4a, 5.2, 5.3, 5.8, 6, 7, 8, 9, 11), `CONTEXT.md`, ADR 0002, 0003, 0004, 0005, 0006.

**Konvensi repo:**
- Kode dan komentar berbahasa Indonesia, mengikuti gaya file yang ada (2 spasi, kutip tunggal, titik koma).
- Semua nominal dalam rupiah bilangan bulat. Format tampilan memakai `rp()` dari `lib/format.js`.
- Klien service role (`createAdminClient`) hanya dipakai di route handler, setelah `getUser()` memverifikasi Nasabah. `user.id` selalu berasal dari `getUser()`, tidak pernah dari body.
- Commit message dalam bahasa Inggris (conventional commits), **tanpa** baris `Co-Authored-By` atau atribusi Claude.
- Jangan commit `.env.local` dan jangan menampilkan isinya.

---

## Peta file

| File | Status | Tanggung jawab |
|---|---|---|
| `scripts/cek-tools-netra.mjs` | baru | Verifikasi tool calling lewat Netra (non-stream, stream, round-trip, cache, prompt yang berakhir pesan system) |
| `lib/alokasi.js` | baru | Aturan Alokasi, penyesuaian rincian, dan render teks kartu dan pembaruan Rencana |
| `tests/alokasi.test.js` | baru | Kasus tepi bagian 6 |
| `lib/snapshot.js` | ubah | Saldo Bebas dan Kantong di Snapshot (kompatibel dengan snapshot lama) |
| `tests/snapshot.test.js` | ubah | Test Kantong |
| `lib/prompt.js` | ubah | System prompt v2 dan role `kartu` |
| `tests/prompt.test.js` | ubah | Test v1 tetap utuh, v2, dan render `kartu` |
| `supabase/migrations/20261126000001_alokasi.sql` | baru | Tabel, view, fungsi, RLS, dan Realtime Tahap 2 |
| `lib/server/netra.js` | baru | Panggilan Netra dan pemetaan error, dipakai bersama |
| `lib/server/http.js` | ubah | `failDb` untuk error dari fungsi Postgres |
| `lib/server/nasabah.js` | baru | `muatKeuangan`: memuat data keuangan satu Nasabah |
| `lib/server/sesi.js` | ubah | Snapshot dengan Kantong, `planId`, dan sesi yang dimulai agent |
| `lib/server/rencana.js` | baru | Membuat Rencana dari Gaji, kedaluwarsa, dan pesan pembaruan |
| `lib/server/ingest.js` | baru | Satu pintu Transaksi (`ingest_transaksi` dan pemicu Gaji) |
| `app/api/chat/route.js` | ubah | Memakai `lib/server/netra.js` |
| `app/api/demo/gaji/route.js` | baru | Tombol Gaji masuk |
| `app/api/demo/reset/route.js` | baru | Tombol Reset data demo |
| `app/api/notifications/[id]/open/route.js` | baru | Membuka Notifikasi Gajian menjadi sesi yang dimulai agent |
| `app/api/plans/[id]/apply/route.js` | baru | Menerapkan Rencana (dengan perubahan dari kartu) |
| `app/api/plans/[id]/ignore/route.js` | baru | Mengabaikan Rencana |
| `app/api/sessions/[id]/route.js` | ubah | Mengembalikan kolom `card` |
| `lib/api.js` | ubah | Fungsi klien untuk endpoint baru |
| `app/chat/RencanaCard.jsx` | baru | Kartu Rencana yang bisa diedit |
| `app/chat/NotifBell.jsx` | baru | Lonceng Notifikasi |
| `app/chat/DemoPanel.jsx` | baru | Laci Panel Demo |
| `app/chat/page.jsx` | ubah | Integrasi: saldo, Kantong, notifikasi Realtime, kartu, catatan, dan Panel Demo |
| `app/globals.css` | ubah | Gaya komponen baru |
| `docs/specs/agent-keuangan.md`, `README.md` | ubah | Hasil verifikasi dan keputusan pelaksanaan |

---

### Task 0: Verifikasi tool calling lewat Netra

Hasilnya menentukan jalur Tahap 3 (ADR 0006). Task ini tidak mengubah kode aplikasi.

**Files:**
- Create: `scripts/cek-tools-netra.mjs`
- Modify: `docs/specs/agent-keuangan.md` (bagian `## 4a. Tool calling lewat Netra`)

- [ ] **Step 1: Tulis script**

```js
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
```

- [ ] **Step 2: Jalankan script**

Run: `node --env-file=.env.local scripts/cek-tools-netra.mjs`
Expected: setiap bagian mencetak hasil, lalu baris `RINGKASAN` berisi lima nilai boolean. Jangan pernah mencetak `NETRA_API_KEY`.

- [ ] **Step 3: Catat hasilnya di spec**

Ganti isi bagian `## 4a. Tool calling lewat Netra` di `docs/specs/agent-keuangan.md` (saat ini "Belum diverifikasi. Diisi pada langkah pertama Tahap 2.") dengan hasil sebenarnya, dalam format:

```markdown
> **Hasil verifikasi lewat Netra (<tanggal>, `scripts/cek-tools-netra.mjs`):**
> - Non-stream: <berfungsi/tidak>, contoh `tool_calls`: `<nama dan argumen>`.
> - Stream: <berfungsi/tidak>. Potongan `delta.tool_calls` <bisa/tidak bisa> dirakit menjadi JSON yang valid.
> - Round-trip hasil tool (`role: "tool"`): <berfungsi/tidak>.
> - Cache dengan definisi tool: permintaan ke-3 `cached_tokens = <angka>`.
> - Prompt yang berakhir dengan pesan `system`: <menghasilkan teks/tidak>.
>
> Kesimpulan: Tahap 3 memakai <tool calling | panggilan AI kedua yang mengembalikan JSON> (ADR 0006).
```

Jika bagian 5 (prompt yang berakhir dengan pesan system) **gagal**, beri tahu controller: Task 8 harus menambahkan pesan `user` sintetis. Lihat catatan di Task 8.

- [ ] **Step 4: Commit**

```bash
git add scripts/cek-tools-netra.mjs docs/specs/agent-keuangan.md
git commit -m "chore: add Netra tool-calling verification script and record result"
```

---

### Task 1: Aturan Alokasi (`lib/alokasi.js`)

**Files:**
- Create: `lib/alokasi.js`
- Test: `tests/alokasi.test.js`

Bentuk `rincian` (disimpan di `allocation_plans.rincian`, urutan array dipertahankan jsonb):

```js
{
  gaji: 12500000,
  pos: [
    { kunci: 'wajib', label: 'Pengeluaran Wajib', jenis: 'batas', nominal: 9019000 },
    // { kunci: 'sosial', ... } hanya jika persen_sosial > 0
    { kunci: 'dana_darurat', label: 'Dana Darurat', jenis: 'kantong', nominal: 696000 }, // hanya jika ada Dana Darurat
    // { kunci: 'goal:<uuid>', label: '<nama Goal>', jenis: 'kantong', goal_id: '<uuid>', nominal } per Goal
    { kunci: 'investasi', label: 'Investasi', jenis: 'kantong', nominal: 1392000 },
    { kunci: 'keinginan', label: 'Keinginan', jenis: 'batas', nominal: 1393000 }
  ]
}
```

- [ ] **Step 1: Tulis test yang gagal**

```js
import { describe, expect, it } from 'vitest';
import { hitungAlokasi, renderRencana, renderRencanaDiterapkan, sesuaikanRincian, sisaBulan, totalKantong } from '../lib/alokasi';

const NOW = new Date('2026-11-26T02:00:00Z');
const RULES = { persen_dana_darurat: 20, persen_sosial: 0, persen_investasi: 50 };
const DD = { target: 54117000, terkumpul: 0 };
const base = { gaji: 12500000, pengeluaranBulanan: 9019500, danaDarurat: DD, goals: [], rules: RULES, now: NOW };
const nominal = (r) => Object.fromEntries(r.pos.map((p) => [p.kunci, p.nominal]));
const jumlah = (r) => r.pos.reduce((a, p) => a + p.nominal, 0);

describe('hitungAlokasi', () => {
  it('kasus dasar: urutan pos dan nominal sesuai aturan', () => {
    const r = hitungAlokasi(base);
    expect(r.pos.map((p) => p.kunci)).toEqual(['wajib', 'dana_darurat', 'investasi', 'keinginan']);
    expect(nominal(r)).toEqual({ wajib: 9019000, dana_darurat: 696000, investasi: 1392000, keinginan: 1393000 });
    expect(jumlah(r)).toBe(12500000);
    expect(r.pos.find((p) => p.kunci === 'wajib').jenis).toBe('batas');
    expect(r.pos.find((p) => p.kunci === 'dana_darurat').jenis).toBe('kantong');
  });

  it('Gaji lebih kecil dari Pengeluaran Bulanan: semua untuk Wajib', () => {
    const r = hitungAlokasi({ ...base, gaji: 5000000 });
    expect(nominal(r)).toEqual({ wajib: 5000000, dana_darurat: 0, investasi: 0, keinginan: 0 });
  });

  it('Dana Darurat sudah penuh: pos Dana Darurat 0', () => {
    const r = hitungAlokasi({ ...base, danaDarurat: { target: 54117000, terkumpul: 60000000 } });
    expect(nominal(r)).toEqual({ wajib: 9019000, dana_darurat: 0, investasi: 1740000, keinginan: 1741000 });
  });

  it('Dana Darurat hampir penuh: hanya mengisi kekurangannya', () => {
    const r = hitungAlokasi({ ...base, danaDarurat: { target: 54117000, terkumpul: 53800000 } });
    expect(nominal(r).dana_darurat).toBe(317000);
    expect(jumlah(r)).toBe(12500000);
  });

  it('tanpa Dana Darurat: pos Dana Darurat tidak ada', () => {
    const r = hitungAlokasi({ ...base, danaDarurat: null });
    expect(r.pos.map((p) => p.kunci)).toEqual(['wajib', 'investasi', 'keinginan']);
  });

  it('Goal diisi sesuai kebutuhan per bulan, tenggat terdekat dulu, tanpa tenggat dianggap 12 bulan', () => {
    const goals = [
      { id: 'b', nama: 'Laptop', target: 2400000, terkumpul: 0, tenggat: null },
      { id: 'a', nama: 'Liburan', target: 6000000, terkumpul: 0, tenggat: '2027-05-01' }
    ];
    const r = hitungAlokasi({ ...base, goals });
    expect(r.pos.map((p) => p.kunci)).toEqual(['wajib', 'dana_darurat', 'goal:a', 'goal:b', 'investasi', 'keinginan']);
    expect(nominal(r)).toEqual({ wajib: 9019000, dana_darurat: 696000, 'goal:a': 1000000, 'goal:b': 200000, investasi: 792000, keinginan: 793000 });
    expect(r.pos.find((p) => p.kunci === 'goal:a')).toMatchObject({ label: 'Liburan', jenis: 'kantong', goal_id: 'a' });
  });

  it('uang tidak cukup: Goal bertenggat lebih jauh mendapat lebih sedikit', () => {
    const goals = [
      { id: 'a', nama: 'Liburan', target: 6000000, terkumpul: 0, tenggat: '2027-05-01' },
      { id: 'b', nama: 'Laptop', target: 2400000, terkumpul: 0, tenggat: null }
    ];
    const r = hitungAlokasi({ ...base, gaji: 10000000, goals });
    expect(nominal(r)).toEqual({ wajib: 9019000, dana_darurat: 196000, 'goal:a': 785000, 'goal:b': 0, investasi: 0, keinginan: 0 });
  });

  it('Goal yang tenggatnya sudah lewat meminta seluruh kekurangannya (dibatasi sisa uang)', () => {
    const goals = [{ id: 'a', nama: 'Motor', target: 3000000, terkumpul: 0, tenggat: '2026-10-01' }];
    const r = hitungAlokasi({ ...base, goals });
    expect(nominal(r)['goal:a']).toBe(2785000);
    expect(nominal(r).keinginan).toBe(0);
  });

  it('Goal yang sudah tercapai mendapat 0', () => {
    const goals = [{ id: 'a', nama: 'Motor', target: 3000000, terkumpul: 3500000, tenggat: '2027-05-01' }];
    expect(nominal(hitungAlokasi({ ...base, goals }))['goal:a']).toBe(0);
  });

  it('persentase yang diubah Nasabah, termasuk Sosial', () => {
    const r = hitungAlokasi({ ...base, rules: { persen_dana_darurat: 50, persen_sosial: 10, persen_investasi: 100 } });
    expect(r.pos.map((p) => p.kunci)).toEqual(['wajib', 'sosial', 'dana_darurat', 'investasi', 'keinginan']);
    expect(nominal(r)).toEqual({ wajib: 9019000, sosial: 348000, dana_darurat: 1566000, investasi: 1567000, keinginan: 0 });
  });

  it('jumlah semua pos selalu sama dengan Gaji', () => {
    for (const gaji of [1000, 999999, 9019500, 12345678, 50000000]) {
      expect(jumlah(hitungAlokasi({ ...base, gaji }))).toBe(gaji);
    }
  });

  it('menolak Gaji 0 atau negatif', () => {
    expect(() => hitungAlokasi({ ...base, gaji: 0 })).toThrow();
  });
});

describe('sisaBulan', () => {
  it('menghitung selisih bulan kalender, minimal 1', () => {
    expect(sisaBulan('2027-05-01', NOW)).toBe(6);
    expect(sisaBulan('2026-11-30', NOW)).toBe(1);
    expect(sisaBulan('2026-01-01', NOW)).toBe(1);
    expect(sisaBulan(null, NOW)).toBe(12);
  });
});

describe('sesuaikanRincian', () => {
  const r = hitungAlokasi(base);

  it('Keinginan menyerap selisih perubahan', () => {
    const s = sesuaikanRincian(r, { investasi: 2000000 });
    expect(nominal(s)).toEqual({ wajib: 9019000, dana_darurat: 696000, investasi: 2000000, keinginan: 785000 });
    expect(jumlah(s)).toBe(12500000);
  });

  it('tanpa perubahan hasilnya sama', () => {
    expect(sesuaikanRincian(r, {})).toEqual(r);
  });

  it('menolak total yang melebihi Gaji', () => {
    expect(() => sesuaikanRincian(r, { investasi: 5000000 })).toThrow(/melebihi/);
  });

  it('menolak pos Keinginan, pos tak dikenal, dan nominal tidak valid', () => {
    expect(() => sesuaikanRincian(r, { keinginan: 1 })).toThrow();
    expect(() => sesuaikanRincian(r, { liburan: 1 })).toThrow();
    expect(() => sesuaikanRincian(r, { investasi: -1 })).toThrow();
    expect(() => sesuaikanRincian(r, { investasi: 1.5 })).toThrow();
  });

  it('totalKantong menjumlah pos yang masuk Kantong', () => {
    expect(totalKantong(r)).toBe(696000 + 1392000);
  });
});

describe('render', () => {
  const r = hitungAlokasi(base);

  it('renderRencana memuat semua pos dengan angka terformat', () => {
    const t = renderRencana(r, '2026-11-26T02:00:00Z');
    expect(t.split('\n')[0]).toBe('KARTU RENCANA ALOKASI (ditampilkan ke nasabah; semua angka dihitung oleh Aturan Alokasi)');
    expect(t).toContain('Gaji masuk: Rp 12.500.000 pada 26 Nov 2026 09:00 WIB');
    expect(t).toContain('- Pengeluaran Wajib: Rp 9.019.000 (batas belanja)');
    expect(t).toContain('- Dana Darurat: Rp 696.000 (disimpan ke Kantong)');
    expect(t).toContain('- Keinginan: Rp 1.393.000 (batas belanja)');
    expect(renderRencana(JSON.parse(JSON.stringify(r)), '2026-11-26T02:00:00Z')).toBe(t);
  });

  it('renderRencanaDiterapkan merangkum Kantong, batas belanja, dan Saldo Bebas', () => {
    const t = renderRencanaDiterapkan(r, 22000000, '2026-11-26T03:00:00Z');
    expect(t).toBe(
      [
        'Rencana Alokasi diterapkan pada 26 Nov 2026 10:00 WIB.',
        'Masuk Kantong: Dana Darurat Rp 696.000, Investasi Rp 1.392.000.',
        'Batas belanja: Pengeluaran Wajib Rp 9.019.000, Keinginan Rp 1.393.000.',
        'Saldo Bebas sekarang Rp 22.000.000.'
      ].join('\n')
    );
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/alokasi.test.js`
Expected: FAIL karena `lib/alokasi` belum ada.

- [ ] **Step 3: Tulis implementasi**

```js
// Aturan Alokasi (spec bagian 6, ADR 0002): fungsi murni tanpa I/O, dipakai server dan kartu di browser.
// Angka Rencana Alokasi hanya berasal dari sini, bukan dari model AI.

import { fmtWaktu, rp } from './format';

const RIBU = 1000;
const bulatkan = (n) => Math.floor(n / RIBU) * RIBU; // pembulatan ke ribuan ke bawah; selisihnya masuk Keinginan
const BULAN_TANPA_TENGGAT = 12;

// Sisa bulan kalender sampai tenggat, minimal 1. Tenggat yang sudah lewat = 1 (kekurangan diminta sekaligus).
export function sisaBulan(tenggat, now) {
  if (!tenggat) return BULAN_TANPA_TENGGAT;
  const t = new Date(tenggat);
  const n = (t.getUTCFullYear() - now.getUTCFullYear()) * 12 + (t.getUTCMonth() - now.getUTCMonth());
  return Math.max(1, n);
}

const urutGoal = (a, b) => {
  if (a.tenggat && b.tenggat && a.tenggat !== b.tenggat) return a.tenggat < b.tenggat ? -1 : 1;
  if (!a.tenggat !== !b.tenggat) return a.tenggat ? -1 : 1; // Goal tanpa tenggat paling akhir
  return a.nama < b.nama ? -1 : a.nama > b.nama ? 1 : 0;
};

// danaDarurat: { target, terkumpul } atau null. goals: [{ id, nama, target, terkumpul, tenggat }] (tanpa Dana Darurat).
// rules: { persen_dana_darurat, persen_sosial, persen_investasi }.
export function hitungAlokasi({ gaji, pengeluaranBulanan, danaDarurat, goals = [], rules, now }) {
  const total = Math.floor(Number(gaji));
  if (!(total > 0)) throw new Error('Nominal Gaji harus lebih dari 0.');
  const pos = [];

  const wajib = bulatkan(Math.min(total, Math.max(0, Number(pengeluaranBulanan) || 0)));
  pos.push({ kunci: 'wajib', label: 'Pengeluaran Wajib', jenis: 'batas', nominal: wajib });
  let sisa = total - wajib;

  if (Number(rules.persen_sosial) > 0) {
    const n = bulatkan((sisa * Number(rules.persen_sosial)) / 100);
    sisa -= n;
    pos.push({ kunci: 'sosial', label: 'Sosial', jenis: 'kantong', nominal: n });
  }

  if (danaDarurat) {
    const kurang = Math.max(0, Number(danaDarurat.target) - Number(danaDarurat.terkumpul));
    const n = bulatkan(Math.min((sisa * Number(rules.persen_dana_darurat)) / 100, kurang));
    sisa -= n;
    pos.push({ kunci: 'dana_darurat', label: 'Dana Darurat', jenis: 'kantong', nominal: n });
  }

  for (const g of [...goals].sort(urutGoal)) {
    const kurang = Math.max(0, Number(g.target) - Number(g.terkumpul));
    const butuh = Math.ceil(kurang / sisaBulan(g.tenggat, now));
    const n = bulatkan(Math.min(butuh, sisa));
    sisa -= n;
    pos.push({ kunci: 'goal:' + g.id, label: g.nama, jenis: 'kantong', goal_id: g.id, nominal: n });
  }

  const investasi = bulatkan((sisa * Number(rules.persen_investasi)) / 100);
  pos.push({ kunci: 'investasi', label: 'Investasi', jenis: 'kantong', nominal: investasi });

  const dipakai = pos.reduce((a, p) => a + p.nominal, 0);
  pos.push({ kunci: 'keinginan', label: 'Keinginan', jenis: 'batas', nominal: total - dipakai });
  return { gaji: total, pos };
}

// Nasabah mengubah nominal pos lewat kartu. Keinginan menyerap selisihnya dan tidak boleh negatif.
export function sesuaikanRincian(rincian, ubah = {}) {
  const kunci = new Set(rincian.pos.map((p) => p.kunci));
  for (const k of Object.keys(ubah)) {
    if (!kunci.has(k) || k === 'keinginan') throw new Error(`Pos "${k}" tidak bisa diubah.`);
    if (!Number.isSafeInteger(ubah[k]) || ubah[k] < 0) throw new Error('Nominal pos harus bilangan bulat 0 atau lebih.');
  }
  const pos = rincian.pos.map((p) => (Object.hasOwn(ubah, p.kunci) ? { ...p, nominal: ubah[p.kunci] } : { ...p }));
  const lain = pos.filter((p) => p.kunci !== 'keinginan').reduce((a, p) => a + p.nominal, 0);
  const keinginan = rincian.gaji - lain;
  if (keinginan < 0) throw new Error(`Total pos melebihi Gaji ${rp(rincian.gaji)}. Kurangi salah satu pos.`);
  return { gaji: rincian.gaji, pos: pos.map((p) => (p.kunci === 'keinginan' ? { ...p, nominal: keinginan } : p)) };
}

export function totalKantong(rincian) {
  return rincian.pos.filter((p) => p.jenis === 'kantong').reduce((a, p) => a + p.nominal, 0);
}

const sifat = (p) => (p.jenis === 'kantong' ? 'disimpan ke Kantong' : 'batas belanja');

// Teks kartu untuk prompt. Dibekukan saat kartu disisipkan (prefix cache), tidak dirender ulang dari status terbaru.
export function renderRencana(rincian, waktuGaji) {
  const lines = [
    'KARTU RENCANA ALOKASI (ditampilkan ke nasabah; semua angka dihitung oleh Aturan Alokasi)',
    `Gaji masuk: ${rp(rincian.gaji)} pada ${fmtWaktu(waktuGaji)}`
  ];
  for (const p of rincian.pos) lines.push(`- ${p.label}: ${rp(p.nominal)} (${sifat(p)})`);
  lines.push('Nasabah bisa mengubah angka di kartu, lalu menekan Terapkan atau Abaikan. Rencana kedaluwarsa dalam 7 hari.');
  lines.push('Saat kartu ini pertama muncul: sapa nasabah, ucapkan selamat atas gajinya, jelaskan rencana ini singkat dengan angka dari kartu, lalu ajak menerapkannya.');
  return lines.join('\n');
}

// Isi pesan pembaruan setelah Rencana diterapkan.
export function renderRencanaDiterapkan(rincian, saldoBebas, waktu) {
  const kantong = rincian.pos.filter((p) => p.jenis === 'kantong' && p.nominal > 0).map((p) => `${p.label} ${rp(p.nominal)}`);
  const batas = rincian.pos.filter((p) => p.jenis === 'batas').map((p) => `${p.label} ${rp(p.nominal)}`);
  return [
    `Rencana Alokasi diterapkan pada ${fmtWaktu(waktu)}.`,
    `Masuk Kantong: ${kantong.length ? kantong.join(', ') : 'tidak ada'}.`,
    `Batas belanja: ${batas.join(', ')}.`,
    `Saldo Bebas sekarang ${rp(saldoBebas)}.`
  ].join('\n');
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/alokasi.test.js`
Expected: PASS semua. Jika ada angka yang beda, periksa implementasinya, **bukan** test-nya. Angka di test sudah dihitung manual dari aturan di spec bagian 6.

- [ ] **Step 5: Commit**

```bash
git add lib/alokasi.js tests/alokasi.test.js
git commit -m "feat(alokasi): add deterministic allocation rules with edge-case tests"
```

---

### Task 2: Saldo Bebas dan Kantong di Snapshot Keuangan

Snapshot sesi lama tidak punya field `kantong`. Render-nya harus tetap **identik** dengan Tahap 1, supaya prefix sesi lama tidak berubah (ADR 0003).

**Files:**
- Modify: `lib/snapshot.js`
- Test: `tests/snapshot.test.js`

- [ ] **Step 1: Tambah test yang gagal** (di akhir `tests/snapshot.test.js`)

```js
describe('Kantong di snapshot', () => {
  const kantong = [
    { nama: 'Investasi', jenis: 'investasi', saldo: 1392000 },
    { nama: 'Dana Darurat', jenis: 'dana_darurat', saldo: 696000 }
  ];

  it('snapshot tanpa input kantong tidak memuat Saldo Bebas (kompatibel dengan sesi Tahap 1)', () => {
    const s = buildSnapshot(snapshotInput);
    expect(s.kantong).toBeUndefined();
    expect(s.rekening.saldo_bebas).toBeUndefined();
    expect(renderSnapshot(s)).not.toContain('Saldo Bebas');
  });

  it('menghitung Saldo Bebas dan mengurutkan Kantong', () => {
    const s = buildSnapshot({ ...snapshotInput, kantong });
    expect(s.rekening).toEqual({ nomor_akhir: '4821', saldo_total: 9500000, saldo_bebas: 7412000 });
    expect(s.kantong).toEqual([
      { nama: 'Dana Darurat', jenis: 'dana_darurat', saldo: 696000 },
      { nama: 'Investasi', jenis: 'investasi', saldo: 1392000 }
    ]);
  });

  it('render memuat Saldo Bebas dan isi Kantong tepat setelah baris Rekening', () => {
    const lines = renderSnapshot(buildSnapshot({ ...snapshotInput, kantong })).split('\n');
    const i = lines.findIndex((l) => l.startsWith('Rekening:'));
    expect(lines.slice(i + 1, i + 5)).toEqual([
      'Saldo Bebas: Rp 7.412.000 (Saldo Total dikurangi isi Kantong; hanya ini yang bisa dipakai)',
      'Kantong:',
      '- Dana Darurat: Rp 696.000',
      '- Investasi: Rp 1.392.000'
    ]);
  });

  it('Kantong kosong ditulis "belum ada"', () => {
    const text = renderSnapshot(buildSnapshot({ ...snapshotInput, kantong: [] }));
    expect(text).toContain('Saldo Bebas: Rp 9.500.000');
    expect(text).toContain('Kantong:\n- belum ada');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/snapshot.test.js`
Expected: FAIL pada test Kantong. Test lama tetap PASS.

- [ ] **Step 3: Ubah `lib/snapshot.js`**

Di `buildSnapshot`, ubah tanda tangan fungsi dan blok `return`, lalu tambahkan konstanta pengurutan di atas fungsi:

```js
const URUT_KANTONG = { dana_darurat: 0, goal: 1, investasi: 2, sosial: 3 };

// kantong (opsional): [{ nama, jenis, saldo }]. Tanpa kantong, snapshot sama persis dengan format Tahap 1.
export function buildSnapshot({ profile, account, transactions, goals, kantong, now }) {
```

Ganti baris `rekening: { nomor_akhir: account.nomor_akhir, saldo_total: saldoTotal(transactions) },` dan tambah field `kantong` di akhir objek. Bentuk akhirnya:

```js
  const total = saldoTotal(transactions);
  const snap = {
    dibuat_pada: now.toISOString(),
    nasabah: { /* tidak berubah */ },
    rekening: { nomor_akhir: account.nomor_akhir, saldo_total: total },
    pengeluaran_bulanan: pengeluaran,
    pengeluaran_bulanan_sumber: /* tidak berubah */,
    goals: /* tidak berubah */,
    transaksi_terakhir: /* tidak berubah */
  };
  if (kantong !== undefined) {
    const isi = kantong.reduce((a, k) => a + Number(k.saldo), 0);
    snap.rekening.saldo_bebas = total - isi;
    snap.kantong = [...kantong]
      .map((k) => ({ nama: k.nama, jenis: k.jenis, saldo: Number(k.saldo) }))
      .sort((a, b) => (URUT_KANTONG[a.jenis] ?? 9) - (URUT_KANTONG[b.jenis] ?? 9) || (a.nama < b.nama ? -1 : a.nama > b.nama ? 1 : 0));
  }
  return snap;
```

(Isi field yang ditandai "tidak berubah" disalin apa adanya dari kode sekarang.)

Di `renderSnapshot`, setelah elemen `Rekening: ...` di array `lines` dibuat, sisipkan baris Kantong hanya jika `s.kantong` ada. Ganti pembuatan `lines` menjadi:

```js
  const lines = [
    `DATA KEUANGAN NASABAH (dibekukan ${fmtWaktu(s.dibuat_pada)})`,
    `Nama nasabah: ${n.nama}`,
    `Pekerjaan: ${n.pekerjaan || 'belum diisi'}`,
    `Tanggal gajian: ${n.tanggal_gajian ? 'setiap tanggal ' + n.tanggal_gajian : 'belum diisi'}`,
    `Profil Risiko: ${n.profil_risiko || 'belum diisi'}`,
    `Rekening: Tabungan Agent Nusa berakhiran ${r.nomor_akhir}. Saldo Total: ${rp(r.saldo_total)}`
  ];
  if (s.kantong) {
    lines.push(`Saldo Bebas: ${rp(r.saldo_bebas)} (Saldo Total dikurangi isi Kantong; hanya ini yang bisa dipakai)`);
    lines.push('Kantong:');
    if (!s.kantong.length) lines.push('- belum ada');
    for (const k of s.kantong) lines.push(`- ${k.nama}: ${rp(k.saldo)}`);
  }
  lines.push(`Pengeluaran Bulanan: ${rp(s.pengeluaran_bulanan)} (${sumber})`);
  lines.push('Goal:');
```

Sisa fungsi (Goal dan Transaksi terakhir) tidak berubah.

- [ ] **Step 4: Jalankan semua test**

Run: `npm test`
Expected: PASS semua, termasuk test snapshot dan prompt lama. Test lama membuktikan render tanpa Kantong tidak berubah.

- [ ] **Step 5: Commit**

```bash
git add lib/snapshot.js tests/snapshot.test.js
git commit -m "feat(snapshot): include Saldo Bebas and Kantong for new sessions, keep old render identical"
```

---

### Task 3: System prompt v2 dan role `kartu`

Sesi lama tetap memakai system prompt v1. Teks v1 **tidak boleh** berubah satu karakter pun.

**Files:**
- Modify: `lib/prompt.js`
- Test: `tests/prompt.test.js`

- [ ] **Step 1: Tambah test yang gagal** (di akhir `tests/prompt.test.js`)

```js
describe('versi prompt dan kartu', () => {
  it('versi terbaru adalah 2, dan v1 tetap tersedia tanpa perubahan', () => {
    expect(SYSTEM_PROMPT_VERSION).toBe(2);
    expect(systemPromptFor(1)).toContain('Jangan pernah mengarang nominal: sebut angka hanya jika tertulis di data. Jangan menawarkan atau merekomendasikan produk investasi tertentu.');
    expect(systemPromptFor(1).split('\n')).toHaveLength(13);
  });

  it('v2 menjelaskan Kantong, kartu, dan cara mengubah Rencana', () => {
    const p = systemPromptFor(2);
    expect(p).toContain('KARTU');
    expect(p).toContain('Saldo Bebas');
    expect(p).toContain('Terapkan');
  });

  it('pesan kartu dirender sebagai system apa adanya', () => {
    const history = [m(1, 'kartu', 'KARTU RENCANA ALOKASI (ditampilkan ke nasabah; semua angka dihitung oleh Aturan Alokasi)\nGaji masuk: Rp 1.000', '2026-11-24T07:12:00Z')];
    const p = buildPromptMessages({ session: { ...session, system_prompt_version: 2 }, history, mode: 'text' });
    expect(p[2]).toEqual({ role: 'system', content: history[0].content });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/prompt.test.js`
Expected: FAIL (versi masih 1, dan role `kartu` melempar error).

- [ ] **Step 3: Ubah `lib/prompt.js`**

Tambah entri `2` di `SYSTEM_PROMPTS`, tepat setelah entri `1` (entri `1` tidak diubah):

```js
  2: [
    'Kamu adalah Agent Nusa, asisten virtual customer service Bank Nusa (bank fiktif untuk demo) yang juga mendampingi nasabah mengelola keuangan.',
    'Jawab dalam Bahasa Indonesia yang sopan dan ringkas (maksimal 4 kalimat). Tulis teks biasa, tanpa markdown, tanpa tabel.',
    'Gunakan hanya informasi dari DATA KEUANGAN NASABAH, KARTU yang ditampilkan ke nasabah, PEMBARUAN DATA, LAMPIRAN DARI NASABAH, dan INFO LAYANAN. Jika informasi tidak ada, katakan tidak tahu dan tawarkan untuk menghubungkan ke agen manusia.',
    'DATA KEUANGAN NASABAH dibekukan saat percakapan dimulai. PEMBARUAN DATA berisi perubahan sesudahnya dan lebih baru. Jika nasabah menanyakan data terbaru yang tidak ada, sebutkan waktu data itu dan sarankan menekan tombol "Chat baru".',
    'Setiap pesan nasabah diawali cap [waktu: ...] yang menunjukkan kapan pesan itu dikirim. Jangan menyebut cap itu kecuali relevan.',
    'Kantong adalah sub-saldo di rekening yang sama untuk Dana Darurat, Goal, Investasi, dan Sosial. Saldo Bebas adalah Saldo Total dikurangi isi Kantong, dan hanya Saldo Bebas yang bisa dipakai.',
    'Angka Rencana Alokasi dihitung oleh Aturan Alokasi bank, bukan olehmu. Jangan menghitung ulang atau mengusulkan angka lain. Jika nasabah ingin mengubah pembagian, arahkan untuk mengubah angka di kartu Rencana lalu menekan Terapkan.',
    'Jangan pernah meminta atau menerima PIN, password, CVV, atau kode OTP di chat. Jika nasabah mengetikkannya, ingatkan agar tidak membagikannya.',
    'Untuk kartu hilang, dugaan penipuan, dana hilang, atau komplain berat, arahkan nasabah menekan tombol "Hubungi agen" di atas chat.',
    'Jangan pernah mengarang nominal: sebut angka hanya jika tertulis di data atau kartu. Jangan menawarkan atau merekomendasikan produk investasi tertentu.',
    'Kamu tidak bisa melakukan transaksi nyata; jelaskan langkah-langkahnya saja.',
    'Selalu sebut tanggal dan jam data yang kamu rujuk.',
    '',
    'INFO LAYANAN',
    'Transfer BI-FAST Rp 2.500 per transaksi, limit Rp 250.000.000 per transaksi, layanan 24 jam. Transfer SKN Rp 3.500, diproses jam kerja. QRIS tanpa biaya untuk nasabah.'
  ].join('\n')
```

Ubah `export const SYSTEM_PROMPT_VERSION = 1;` menjadi `export const SYSTEM_PROMPT_VERSION = 2;`.

Di `renderStored`, tambah satu baris sebelum `throw`:

```js
  if (m.role === 'kartu') return { role: 'system', content: m.content }; // teks kartu dibekukan saat disisipkan
```

Perbarui komentar di atas berkas: pada daftar urutan, butir 4 menjadi `riwayat pesan sesuai urutan id, termasuk lampiran, kartu, dan pembaruan`.

- [ ] **Step 4: Jalankan semua test**

Run: `npm test`
Expected: PASS semua.

- [ ] **Step 5: Commit**

```bash
git add lib/prompt.js tests/prompt.test.js
git commit -m "feat(prompt): add system prompt v2 for Kantong and plan cards, render kartu messages"
```

---

### Task 4: Migrasi database Tahap 2

**Files:**
- Create: `supabase/migrations/20261126000001_alokasi.sql`

- [ ] **Step 1: Tulis migrasi**

```sql
-- Tahap 2: Alokasi. Lihat docs/specs/agent-keuangan.md bagian 5.2, 5.3, 5.8, 6, 8 dan ADR 0002, 0005.
-- Uang hanya berubah lewat fungsi di bawah (dipanggil server dengan service role). Saldo selalu dihitung dari buku besar.

create table public.pockets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  jenis text not null check (jenis in ('dana_darurat', 'goal', 'investasi', 'sosial')),
  goal_id uuid references public.goals (id) on delete cascade, -- Goal dihapus: Kantong dan isinya ikut hilang, dana kembali ke Saldo Bebas
  created_at timestamptz not null default now(),
  check ((jenis = 'goal') = (goal_id is not null))
);
create unique index pockets_satu_per_jenis on public.pockets (user_id, jenis) where jenis <> 'goal';
create unique index pockets_satu_per_goal on public.pockets (goal_id) where goal_id is not null;

create table public.allocation_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null unique references public.transactions (id) on delete cascade, -- satu Rencana per Gaji
  status text not null default 'diusulkan' check (status in ('diusulkan', 'diterapkan', 'diabaikan')),
  rincian jsonb not null, -- { gaji, pos: [{ kunci, label, jenis, goal_id?, nominal }] }, lihat lib/alokasi.js
  kedaluwarsa_at timestamptz not null default now() + interval '7 days',
  diputuskan_at timestamptz,
  created_at timestamptz not null default now()
);
create index allocation_plans_user on public.allocation_plans (user_id, created_at desc);

create table public.pocket_movements (
  id uuid primary key default gen_random_uuid(),
  pocket_id uuid not null references public.pockets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nominal bigint not null check (nominal <> 0), -- positif = masuk Kantong, negatif = keluar ke Saldo Bebas
  sumber text not null check (sumber in ('rencana', 'manual')),
  plan_id uuid references public.allocation_plans (id) on delete set null,
  waktu timestamptz not null default now()
);
create index pocket_movements_pocket on public.pocket_movements (pocket_id);
create index pocket_movements_user on public.pocket_movements (user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  jenis text not null check (jenis in ('gajian')),
  ref_id uuid not null, -- gajian: allocation_plans.id
  isi text not null,
  dibaca_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

alter table public.chat_sessions add column plan_id uuid references public.allocation_plans (id) on delete set null;
create unique index chat_sessions_satu_per_rencana on public.chat_sessions (plan_id) where plan_id is not null;

alter table public.chat_messages drop constraint chat_messages_role_check;
alter table public.chat_messages add constraint chat_messages_role_check
  check (role in ('user', 'assistant', 'lampiran', 'pembaruan', 'kartu'));

-- Saldo per Kantong dan Saldo Bebas. security_invoker: RLS tabel asal tetap berlaku.
create view public.v_saldo_kantong with (security_invoker = true) as
select
  p.id as pocket_id,
  p.user_id,
  p.jenis,
  p.goal_id,
  case p.jenis when 'dana_darurat' then 'Dana Darurat' when 'investasi' then 'Investasi' when 'sosial' then 'Sosial' else g.nama end as nama,
  coalesce(sum(m.nominal), 0)::bigint as saldo
from public.pockets p
left join public.goals g on g.id = p.goal_id
left join public.pocket_movements m on m.pocket_id = p.id
group by p.id, g.nama;

create view public.v_saldo_bebas with (security_invoker = true) as
select
  s.user_id,
  s.nomor_akhir,
  s.saldo_total,
  coalesce(k.total, 0)::bigint as total_kantong,
  (s.saldo_total - coalesce(k.total, 0))::bigint as saldo_bebas
from public.v_saldo_total s
left join (select user_id, sum(saldo) as total from public.v_saldo_kantong group by user_id) k on k.user_id = s.user_id;

alter table public.pockets enable row level security;
alter table public.pocket_movements enable row level security;
alter table public.allocation_plans enable row level security;
alter table public.notifications enable row level security;

create policy "baca milik sendiri" on public.pockets for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.pocket_movements for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.allocation_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);

-- Notifikasi Gajian dikirim ke browser lewat Supabase Realtime (RLS select di atas tetap berlaku).
alter publication supabase_realtime add table public.notifications;

-- Saldo Bebas satu Nasabah. Pemanggil di bawah sudah mengunci baris rekening.
create function public.saldo_bebas_nasabah(p_user uuid) returns bigint
language sql stable security definer set search_path = ''
as $$
  select (
    coalesce((select sum(case when arah = 'masuk' then nominal else -nominal end)
              from public.transactions where user_id = p_user and status = 'berhasil'), 0)
    - coalesce((select sum(nominal) from public.pocket_movements where user_id = p_user), 0)
  )::bigint
$$;

-- Satu pintu untuk semua Transaksi (termasuk simulasi). Arah keluar divalidasi terhadap Saldo Bebas.
create function public.ingest_transaksi(
  p_user uuid,
  p_arah text,
  p_nominal bigint,
  p_kategori text,
  p_pihak text,
  p_kanal text,
  p_catatan text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_acc uuid;
  v_id uuid;
begin
  select id into v_acc from public.accounts where user_id = p_user for update;
  if v_acc is null then
    raise exception 'REKENING_TIDAK_ADA';
  end if;
  if p_arah = 'keluar' and public.saldo_bebas_nasabah(p_user) < p_nominal then
    raise exception 'SALDO_BEBAS_KURANG';
  end if;
  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, catatan)
    values (v_acc, p_user, p_arah, p_nominal, p_kategori, p_pihak, p_kanal, p_catatan)
    returning id into v_id;
  return v_id;
end;
$$;

-- Menerapkan Rencana: semua pos Kantong ditulis ke pocket_movements secara atomik, lalu status berubah.
-- p_rincian sudah divalidasi server lewat sesuaikanRincian (jumlah pos = Gaji).
create function public.terapkan_rencana(p_user uuid, p_plan uuid, p_rincian jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.allocation_plans%rowtype;
  v_pos jsonb;
  v_goal uuid;
  v_jenis text;
  v_pocket uuid;
  v_nominal bigint;
  v_total bigint := 0;
begin
  perform 1 from public.accounts where user_id = p_user for update;
  select * into v_plan from public.allocation_plans where id = p_plan and user_id = p_user for update;
  if not found then
    raise exception 'RENCANA_TIDAK_ADA';
  end if;
  if v_plan.status <> 'diusulkan' then
    raise exception 'RENCANA_SUDAH_DIPUTUSKAN';
  end if;
  if v_plan.kedaluwarsa_at <= now() then
    raise exception 'RENCANA_KEDALUWARSA';
  end if;

  for v_pos in select value from jsonb_array_elements(p_rincian -> 'pos') loop
    if v_pos ->> 'jenis' = 'kantong' then
      v_total := v_total + (v_pos ->> 'nominal')::bigint;
    end if;
  end loop;
  if v_total > public.saldo_bebas_nasabah(p_user) then
    raise exception 'SALDO_BEBAS_KURANG';
  end if;

  for v_pos in select value from jsonb_array_elements(p_rincian -> 'pos') loop
    v_nominal := (v_pos ->> 'nominal')::bigint;
    continue when v_pos ->> 'jenis' <> 'kantong' or v_nominal <= 0;
    v_goal := nullif(v_pos ->> 'goal_id', '')::uuid;
    if v_goal is not null then
      if not exists (select 1 from public.goals where id = v_goal and user_id = p_user) then
        raise exception 'GOAL_TIDAK_ADA';
      end if;
      v_jenis := 'goal';
      select id into v_pocket from public.pockets where goal_id = v_goal;
    else
      v_jenis := v_pos ->> 'kunci';
      select id into v_pocket from public.pockets where user_id = p_user and jenis = v_jenis;
    end if;
    if v_pocket is null then
      insert into public.pockets (user_id, jenis, goal_id) values (p_user, v_jenis, v_goal) returning id into v_pocket;
    end if;
    insert into public.pocket_movements (pocket_id, user_id, nominal, sumber, plan_id)
      values (v_pocket, p_user, v_nominal, 'rencana', p_plan);
  end loop;

  update public.allocation_plans set status = 'diterapkan', rincian = p_rincian, diputuskan_at = now() where id = p_plan;
end;
$$;

-- Seed dipisah: seed_data_demo membuat data keuangan, seed_nasabah_baru menambah profil. reset_demo memakai seed_data_demo.
create function public.seed_data_demo(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_acc uuid;
  v_bulan timestamptz;
  i int;
begin
  insert into public.accounts (user_id, nomor_akhir)
    values (p_user, lpad(floor(random() * 10000)::int::text, 4, '0'))
    returning id into v_acc;

  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, waktu)
    values (v_acc, p_user, 'masuk', 13939000, 'saldo_awal', 'Saldo awal', 'Sistem', date_trunc('month', now()) - interval '3 months');

  for i in 1..3 loop
    v_bulan := date_trunc('month', now()) - make_interval(months => 4 - i);
    insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, waktu) values
      (v_acc, p_user, 'keluar', 3500000, 'transfer', 'Sewa kos Bu Ratna', 'BI-FAST', v_bulan + interval '1 day 9 hours'),
      (v_acc, p_user, 'keluar', 205000, 'tagihan', 'Token Listrik PLN', 'Pembayaran', v_bulan + interval '4 days 9 hours 15 minutes'),
      (v_acc, p_user, 'keluar', 350000, 'tagihan', 'Internet Rumah', 'Autodebet', v_bulan + interval '5 days 7 hours'),
      (v_acc, p_user, 'keluar', 1800000, 'belanja', 'Belanja Bulanan Supermarket', 'Kartu Debit', v_bulan + interval '7 days 19 hours'),
      (v_acc, p_user, 'keluar', 100000, 'topup', 'Top up Dompet Digital', 'Top up', v_bulan + interval '11 days 19 hours 33 minutes'),
      (v_acc, p_user, 'keluar', 2750000, 'tagihan', 'Tagihan Kartu Kredit', 'Autodebet', v_bulan + interval '12 days 20 hours 5 minutes'),
      (v_acc, p_user, 'keluar', 47500, 'qris', 'Kopi Senja', 'QRIS', v_bulan + interval '15 days 18 hours 40 minutes'),
      (v_acc, p_user, 'keluar', 85000, 'qris', 'Warung Makan Sederhana', 'QRIS', v_bulan + interval '17 days 12 hours 10 minutes'),
      (v_acc, p_user, 'keluar', 120000, 'qris', 'Toko Buku Pelangi', 'QRIS', v_bulan + interval '19 days 16 hours'),
      (v_acc, p_user, 'keluar', 62000, 'qris', 'Bakso Pak Kumis', 'QRIS', v_bulan + interval '21 days 19 hours'),
      (v_acc, p_user, 'masuk', 12500000, 'payroll', 'Gaji PT Nusantara Digital', 'Kredit', v_bulan + interval '24 days 1 hour');
  end loop;

  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, status, catatan, waktu)
    values (v_acc, p_user, 'keluar', 500000, 'transfer', 'Transfer ke Rina Wijaya', 'BI-FAST', 'gagal',
            'gagal karena gangguan di bank tujuan; dana dikembalikan ke rekening', now() - interval '1 day');

  insert into public.goals (user_id, nama, is_dana_darurat, kelipatan_target) values (p_user, 'Dana Darurat', true, 6);
  insert into public.allocation_rules (user_id) values (p_user);
end;
$$;

create or replace function public.seed_nasabah_baru(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (p_user);
  perform public.seed_data_demo(p_user);
end;
$$;

-- Reset data demo: semua data Nasabah dihapus kecuali akun login dan profil, lalu data seed dibuat ulang.
-- Goal buatan Nasabah (termasuk dari onboarding) ikut terhapus.
create function public.reset_demo(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.chat_sessions where user_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.allocation_plans where user_id = p_user;
  delete from public.pockets where user_id = p_user;
  delete from public.goals where user_id = p_user;
  delete from public.allocation_rules where user_id = p_user;
  delete from public.accounts where user_id = p_user; -- Transaksi ikut terhapus (cascade)
  perform public.seed_data_demo(p_user);
end;
$$;

-- Fungsi uang hanya untuk server (service role), tidak bisa dipanggil dari browser.
revoke execute on function public.saldo_bebas_nasabah(uuid) from public, anon, authenticated;
revoke execute on function public.ingest_transaksi(uuid, text, bigint, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.terapkan_rencana(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.seed_data_demo(uuid) from public, anon, authenticated;
revoke execute on function public.seed_nasabah_baru(uuid) from public, anon, authenticated;
revoke execute on function public.reset_demo(uuid) from public, anon, authenticated;
grant execute on function public.ingest_transaksi(uuid, text, bigint, text, text, text, text) to service_role;
grant execute on function public.terapkan_rencana(uuid, uuid, jsonb) to service_role;
grant execute on function public.reset_demo(uuid) to service_role;
```

- [ ] **Step 2: Periksa sintaks secara manual**

Pastikan setiap `create function` diakhiri `$$;` dan setiap `revoke` atau `grant` menyebut tipe argumen yang sama dengan definisinya. Tidak ada Postgres lokal untuk dijalankan, jadi migrasi ini dijalankan pemilik repo di SQL Editor Supabase (Task 11).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261126000001_alokasi.sql
git commit -m "feat(db): add pockets, allocation plans, notifications, money functions and demo reset"
```

> **Checkpoint controller:** setelah Task 4, minta pemilik repo menjalankan isi file migrasi ini di Supabase **SQL Editor** (sekali, utuh). Verifikasi lewat REST dengan service role: `GET /rest/v1/v_saldo_bebas?select=saldo_bebas&limit=1` harus 200. Task 5 sampai 10 bisa dikerjakan sebelum itu, tetapi verifikasi live di Task 11 butuh migrasi ini.

---

### Task 5: Helper server (Netra, error DB, data Nasabah, sesi)

**Files:**
- Create: `lib/server/netra.js`, `lib/server/nasabah.js`
- Modify: `lib/server/http.js`, `lib/server/sesi.js`, `app/api/chat/route.js`

- [ ] **Step 1: Buat `lib/server/netra.js`**

```js
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
```

- [ ] **Step 2: Ubah `app/api/chat/route.js` agar memakai helper**

- Hapus konstanta `BASE` dan `MODEL`.
- Ganti import menjadi:

```js
import { getUser } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { buildPromptMessages } from '../../../lib/prompt';
import { createSseParser } from '../../../lib/sse';
import { fail } from '../../../lib/server/http';
import { gagalNetra, netraSiap, panggilNetra } from '../../../lib/server/netra';
```

- Ganti awal `POST`:

```js
  if (!netraSiap()) return fail(500, 'NETRA_API_KEY belum diatur di server.');
```

(Baris `const key = process.env.NETRA_API_KEY;` dihapus.)

- Ganti seluruh blok `upstream = await fetch(BASE + '/chat/completions', { ... });` di dalam `try` menjadi:

```js
    upstream = await panggilNetra(messages, { stream: true, signal: req.signal });
```

- Ganti blok `if (!upstream.ok || !upstream.body) { ... }` menjadi:

```js
  if (!upstream.ok || !upstream.body) {
    await dropTurn();
    return gagalNetra(upstream);
  }
```

Sisa route (stream, penyimpanan, dan `dropTurn`) **tidak berubah**. Isi request ke Netra tetap sama: model, `max_tokens: 600`, `temperature: 0.3`, `reasoning`, `stream`, dan `stream_options`.

- [ ] **Step 3: Tambah `failDb` di `lib/server/http.js`**

```js
// Kode error dari fungsi Postgres (raise exception) -> pesan untuk Nasabah.
const PESAN_DB = {
  SALDO_BEBAS_KURANG: [409, 'Saldo Bebas tidak cukup.'],
  RENCANA_TIDAK_ADA: [404, 'Rencana Alokasi tidak ditemukan.'],
  RENCANA_SUDAH_DIPUTUSKAN: [409, 'Rencana ini sudah diterapkan atau diabaikan.'],
  RENCANA_KEDALUWARSA: [409, 'Rencana ini sudah kedaluwarsa.'],
  GOAL_TIDAK_ADA: [409, 'Salah satu Goal di rencana ini sudah dihapus.'],
  REKENING_TIDAK_ADA: [404, 'Rekening tidak ditemukan.']
};

export function failDb(error) {
  const msg = (error && error.message) || '';
  const kode = Object.keys(PESAN_DB).find((k) => msg.includes(k));
  if (!kode) return fail(500, msg || 'Terjadi kesalahan di database.');
  const [status, pesan] = PESAN_DB[kode];
  return fail(status, pesan);
}
```

- [ ] **Step 4: Buat `lib/server/nasabah.js`**

```js
// Memuat data keuangan satu Nasabah dengan klien service role. userId harus berasal dari getUser().
export async function muatKeuangan(admin, userId) {
  const [p, a, t, g, k] = await Promise.all([
    admin.from('profiles').select('nama_panggilan, pekerjaan, tanggal_gajian, profil_risiko, pengeluaran_bulanan_koreksi').eq('user_id', userId).single(),
    admin.from('accounts').select('nomor_akhir').eq('user_id', userId).single(),
    admin.from('transactions').select('waktu, arah, nominal, pihak, kanal, status, catatan').eq('user_id', userId),
    admin.from('goals').select('id, nama, target, tenggat, is_dana_darurat, kelipatan_target, created_at').eq('user_id', userId),
    admin.from('v_saldo_kantong').select('jenis, goal_id, nama, saldo').eq('user_id', userId)
  ]);
  const failed = [p, a, t, g, k].find((r) => r.error);
  if (failed) throw new Error(failed.error.message);
  return {
    profile: p.data,
    account: a.data,
    transactions: t.data,
    goals: g.data,
    kantong: k.data.map((x) => ({ ...x, saldo: Number(x.saldo) }))
  };
}
```

- [ ] **Step 5: Ubah `lib/server/sesi.js`**

Ganti seluruh isi berkas:

```js
import { SYSTEM_PROMPT_VERSION } from '../prompt';
import { buildSnapshot } from '../snapshot';
import { muatKeuangan } from './nasabah';

// Membekukan Snapshot Keuangan saat ini lalu membuat Sesi Percakapan baru (ADR 0003).
// admin: klien service role. userId harus berasal dari getUser(), bukan dari input browser.
export async function buatSesi(admin, userId, { dimulaiOleh = 'nasabah', planId = null, now = new Date() } = {}) {
  const d = await muatKeuangan(admin, userId);
  const snapshot = buildSnapshot({
    profile: d.profile,
    account: d.account,
    transactions: d.transactions,
    goals: d.goals,
    kantong: d.kantong.map(({ nama, jenis, saldo }) => ({ nama, jenis, saldo })),
    now
  });
  const { data, error } = await admin
    .from('chat_sessions')
    .insert({ user_id: userId, snapshot, system_prompt_version: SYSTEM_PROMPT_VERSION, dimulai_oleh: dimulaiOleh, plan_id: planId })
    .select('id, created_at, updated_at, dimulai_oleh')
    .single();
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 6: Build dan test**

Run: `npm test` lalu `npm run build`
Expected: test PASS dan build berhasil tanpa error.

- [ ] **Step 7: Commit**

```bash
git add lib/server app/api/chat/route.js
git commit -m "refactor(server): share Netra client, add DB error mapping and Nasabah finance loader"
```

---

### Task 6: Satu pintu Transaksi, Rencana dari Gaji, dan tombol Gaji serta Reset

**Files:**
- Create: `lib/server/rencana.js`, `lib/server/ingest.js`, `app/api/demo/gaji/route.js`, `app/api/demo/reset/route.js`

- [ ] **Step 1: Buat `lib/server/rencana.js`**

```js
import { hitungAlokasi } from '../alokasi';
import { rp } from '../format';
import { pengeluaranBulanan, targetDanaDarurat } from '../keuangan';
import { muatKeuangan } from './nasabah';

// Gaji masuk -> Rencana Alokasi (status diusulkan) + Notifikasi Gajian (spec 5.2). tx: { id, nominal, waktu }.
export async function buatRencanaGaji(admin, userId, tx) {
  const d = await muatKeuangan(admin, userId);
  const { data: rules, error: rErr } = await admin
    .from('allocation_rules')
    .select('persen_dana_darurat, persen_sosial, persen_investasi')
    .eq('user_id', userId)
    .single();
  if (rErr) throw new Error(rErr.message);

  const now = new Date(tx.waktu);
  const pb = pengeluaranBulanan(d.transactions, d.profile.pengeluaran_bulanan_koreksi, now);
  const isi = (pred) => d.kantong.filter(pred).reduce((a, k) => a + k.saldo, 0);
  const dd = d.goals.find((g) => g.is_dana_darurat);
  const rincian = hitungAlokasi({
    gaji: Number(tx.nominal),
    pengeluaranBulanan: pb,
    danaDarurat: dd ? { target: targetDanaDarurat(pb, dd.kelipatan_target), terkumpul: isi((k) => k.jenis === 'dana_darurat') } : null,
    goals: d.goals
      .filter((g) => !g.is_dana_darurat)
      .map((g) => ({ id: g.id, nama: g.nama, target: Number(g.target), tenggat: g.tenggat, terkumpul: isi((k) => k.goal_id === g.id) })),
    rules,
    now
  });

  const { data: plan, error: pErr } = await admin
    .from('allocation_plans')
    .insert({ user_id: userId, transaction_id: tx.id, rincian })
    .select('id, status, rincian, kedaluwarsa_at')
    .single();
  if (pErr) throw new Error(pErr.message);

  const { error: nErr } = await admin.from('notifications').insert({
    user_id: userId,
    jenis: 'gajian',
    ref_id: plan.id,
    isi: `Gaji ${rp(tx.nominal)} sudah masuk. Yuk atur pembagiannya bersama Agent Nusa.`
  });
  if (nErr) throw new Error(nErr.message);
  return plan;
}

// Rencana yang tidak disentuh 7 hari menjadi diabaikan (dicek setiap kali Rencana dibaca atau diputuskan).
export async function kedaluwarsakanRencana(admin, userId) {
  const now = new Date().toISOString();
  await admin
    .from('allocation_plans')
    .update({ status: 'diabaikan', diputuskan_at: now })
    .eq('user_id', userId)
    .eq('status', 'diusulkan')
    .lt('kedaluwarsa_at', now);
}

// Menambahkan pesan pembaruan ke sesi yang membawa kartu Rencana ini (jika ada), di akhir riwayat.
export async function tambahPembaruanRencana(admin, userId, planId, content) {
  const { data: s } = await admin.from('chat_sessions').select('id').eq('plan_id', planId).eq('user_id', userId).maybeSingle();
  if (!s) return;
  await admin.from('chat_messages').insert({ session_id: s.id, user_id: userId, role: 'pembaruan', content });
  await admin.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
}
```

- [ ] **Step 2: Buat `lib/server/ingest.js`**

```js
import { buatRencanaGaji } from './rencana';

// Satu pintu untuk semua Transaksi, termasuk simulasi (CONTEXT.md: Transaksi).
// t: { arah, nominal, kategori, pihak, kanal, catatan? }. Error dari fungsi Postgres dilempar apa adanya untuk failDb.
export async function ingestTransaksi(admin, userId, t) {
  const { data: id, error } = await admin.rpc('ingest_transaksi', {
    p_user: userId,
    p_arah: t.arah,
    p_nominal: t.nominal,
    p_kategori: t.kategori,
    p_pihak: t.pihak,
    p_kanal: t.kanal,
    p_catatan: t.catatan ?? null
  });
  if (error) throw new Error(error.message);
  const { data: tx, error: tErr } = await admin.from('transactions').select('id, nominal, waktu, kategori').eq('id', id).single();
  if (tErr) throw new Error(tErr.message);
  // Gaji dikenali hanya dari kategori payroll (spec bagian 2, non-tujuan).
  const plan = tx.kategori === 'payroll' ? await buatRencanaGaji(admin, userId, tx) : null;
  return { transaksi: tx, plan };
}
```

- [ ] **Step 3: Buat `app/api/demo/gaji/route.js`**

```js
import { getUser } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { fail, failDb } from '../../../../lib/server/http';
import { ingestTransaksi } from '../../../../lib/server/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Panel Demo: mensimulasikan Gaji masuk lewat jalur ingest yang sama dengan Transaksi sungguhan.
const GAJI_DEMO = { nominal: 12500000, pihak: 'Gaji PT Nusantara Digital' };

export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  try {
    const { transaksi, plan } = await ingestTransaksi(createAdminClient(), user.id, {
      arah: 'masuk',
      nominal: GAJI_DEMO.nominal,
      kategori: 'payroll',
      pihak: GAJI_DEMO.pihak,
      kanal: 'Kredit'
    });
    return Response.json({ transaksi, plan_id: plan ? plan.id : null });
  } catch (e) {
    return failDb(e);
  }
}
```

- [ ] **Step 4: Buat `app/api/demo/reset/route.js`**

```js
import { getUser } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { fail, failDb } from '../../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Panel Demo: mengembalikan data Nasabah ke kondisi seed (akun login dan profil tetap).
export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const { error } = await createAdminClient().rpc('reset_demo', { p_user: user.id });
  if (error) return failDb(error);
  return Response.json({ ok: true });
}
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: berhasil, dan route `/api/demo/gaji` serta `/api/demo/reset` muncul di daftar route.

- [ ] **Step 6: Commit**

```bash
git add lib/server/rencana.js lib/server/ingest.js app/api/demo
git commit -m "feat(api): single ingest path, salary-triggered allocation plan and demo salary/reset endpoints"
```

---

### Task 7: Menerapkan dan mengabaikan Rencana

**Files:**
- Create: `app/api/plans/[id]/apply/route.js`, `app/api/plans/[id]/ignore/route.js`

- [ ] **Step 1: Buat `app/api/plans/[id]/apply/route.js`**

```js
import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { renderRencanaDiterapkan, sesuaikanRincian } from '../../../../../lib/alokasi';
import { fail, failDb } from '../../../../../lib/server/http';
import { kedaluwarsakanRencana, tambahPembaruanRencana } from '../../../../../lib/server/rencana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { ubah: { [kunci pos]: nominal } }. Server menghitung ulang rincian (Keinginan menyerap selisih) lalu menerapkannya.
export async function POST(req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  let ubah = {};
  try {
    const j = await req.json();
    if (j && j.ubah && typeof j.ubah === 'object' && !Array.isArray(j.ubah)) ubah = j.ubah;
  } catch {
    /* body kosong = tanpa perubahan */
  }

  const admin = createAdminClient();
  await kedaluwarsakanRencana(admin, user.id);
  const { data: plan } = await admin.from('allocation_plans').select('id, user_id, rincian').eq('id', id).maybeSingle();
  if (!plan || plan.user_id !== user.id) return fail(404, 'Rencana Alokasi tidak ditemukan.');

  let rincian;
  try {
    rincian = sesuaikanRincian(plan.rincian, ubah);
  } catch (e) {
    return fail(400, e.message);
  }
  const { error } = await admin.rpc('terapkan_rencana', { p_user: user.id, p_plan: id, p_rincian: rincian });
  if (error) return failDb(error);

  const { data: saldo } = await admin.from('v_saldo_bebas').select('saldo_bebas').eq('user_id', user.id).single();
  await tambahPembaruanRencana(admin, user.id, id, renderRencanaDiterapkan(rincian, Number(saldo.saldo_bebas), new Date().toISOString()));
  return Response.json({ plan: { id, status: 'diterapkan', rincian } });
}
```

- [ ] **Step 2: Buat `app/api/plans/[id]/ignore/route.js`**

```js
import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { fmtWaktu } from '../../../../../lib/format';
import { fail } from '../../../../../lib/server/http';
import { kedaluwarsakanRencana, tambahPembaruanRencana } from '../../../../../lib/server/rencana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();
  await kedaluwarsakanRencana(admin, user.id);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('allocation_plans')
    .update({ status: 'diabaikan', diputuskan_at: now })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'diusulkan')
    .select('id');
  if (error) return fail(500, error.message);
  if (!data.length) return fail(409, 'Rencana ini sudah diterapkan, diabaikan, atau kedaluwarsa.');
  await tambahPembaruanRencana(admin, user.id, id, `Rencana Alokasi diabaikan oleh nasabah pada ${fmtWaktu(now)}. Tidak ada dana yang dipindah ke Kantong.`);
  return Response.json({ plan: { id, status: 'diabaikan' } });
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: berhasil.

- [ ] **Step 4: Commit**

```bash
git add app/api/plans
git commit -m "feat(api): apply and ignore allocation plans with session update messages"
```

---

### Task 8: Membuka Notifikasi Gajian menjadi sesi yang dimulai agent

Urutan baris di sesi baru: kartu Rencana (`role: 'kartu'`), lalu sapaan agent (`assistant`). Model butuh isi kartu untuk menjelaskannya, jadi kartu disimpan lebih dulu. UI menampilkan baris sesuai urutan id.

**Catatan dari Task 0:** jika prompt yang berakhir dengan pesan `system` **tidak** menghasilkan teks, tambahkan satu pesan `{ role: 'user', content: '[pembuka sesi]' }` ke `messages` **hanya untuk panggilan sapaan ini** (tidak disimpan). Riwayat yang tersimpan tetap kartu lalu sapaan, dan giliran berikutnya tetap mengikuti urutan bagian 7. Catat keputusan ini di spec 7.1 (Task 11).

**Files:**
- Create: `app/api/notifications/[id]/open/route.js`

- [ ] **Step 1: Buat route**

```js
import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { renderRencana } from '../../../../../lib/alokasi';
import { buildPromptMessages } from '../../../../../lib/prompt';
import { fail } from '../../../../../lib/server/http';
import { netraSiap, panggilNetra } from '../../../../../lib/server/netra';
import { kedaluwarsakanRencana } from '../../../../../lib/server/rencana';
import { buatSesi } from '../../../../../lib/server/sesi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KOLOM_SESI = 'id, created_at, updated_at, dimulai_oleh';

// Notifikasi Gajian dibuka -> Sesi Percakapan baru yang dimulai agent, berisi kartu Rencana dan sapaan (spec 5.2).
// Idempoten: membuka notifikasi yang sama lagi mengembalikan sesi yang sudah ada.
export async function POST(_req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();

  const { data: notif } = await admin.from('notifications').select('id, user_id, jenis, ref_id').eq('id', id).maybeSingle();
  if (!notif || notif.user_id !== user.id || notif.jenis !== 'gajian') return fail(404, 'Notifikasi tidak ditemukan.');
  await admin.from('notifications').update({ dibaca_at: new Date().toISOString() }).eq('id', id).is('dibaca_at', null);

  const sesiRencana = () => admin.from('chat_sessions').select(KOLOM_SESI).eq('plan_id', notif.ref_id).maybeSingle();
  const { data: existing } = await sesiRencana();
  if (existing) return Response.json({ session: existing });

  await kedaluwarsakanRencana(admin, user.id);
  const { data: plan } = await admin.from('allocation_plans').select('id, rincian, transaction_id').eq('id', notif.ref_id).maybeSingle();
  if (!plan) return fail(404, 'Rencana Alokasi untuk notifikasi ini sudah tidak ada.');
  const { data: tx } = await admin.from('transactions').select('waktu').eq('id', plan.transaction_id).single();

  let session;
  try {
    session = await buatSesi(admin, user.id, { dimulaiOleh: 'agent', planId: plan.id });
  } catch (e) {
    // Dua klik bersamaan: indeks unik plan_id menolak sesi kedua, jadi kembalikan sesi yang sudah dibuat.
    const { data: again } = await sesiRencana();
    if (again) return Response.json({ session: again });
    return fail(500, (e && e.message) || 'Gagal membuat percakapan.');
  }

  const { error: kErr } = await admin.from('chat_messages').insert({
    session_id: session.id,
    user_id: user.id,
    role: 'kartu',
    content: renderRencana(plan.rincian, tx.waktu),
    card: { jenis: 'rencana', plan_id: plan.id }
  });
  if (kErr) return fail(500, kErr.message);

  // Sapaan agent. Jika gagal, sesi tetap berisi kartu dan Nasabah bisa langsung bertanya.
  if (netraSiap()) {
    try {
      const { data: s } = await admin.from('chat_sessions').select('id, snapshot, system_prompt_version').eq('id', session.id).single();
      const { data: rows } = await admin.from('chat_messages').select('id, role, content, created_at').eq('session_id', session.id).order('id');
      const res = await panggilNetra(buildPromptMessages({ session: s, history: rows }), { maxTokens: 400 });
      if (res.ok) {
        const j = await res.json();
        const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (text && text.trim()) {
          await admin.from('chat_messages').insert({ session_id: session.id, user_id: user.id, role: 'assistant', content: text, usage: j.usage || null });
        }
      } else {
        console.error('[notifications/open] sapaan gagal: HTTP', res.status);
      }
    } catch (e) {
      console.error('[notifications/open] sapaan gagal:', e && e.message);
    }
  }
  return Response.json({ session });
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: berhasil.

- [ ] **Step 3: Commit**

```bash
git add app/api/notifications
git commit -m "feat(api): open salary notification as agent-started session with plan card and greeting"
```

---

### Task 9: Klien API dan riwayat sesi dengan kartu

**Files:**
- Modify: `app/api/sessions/[id]/route.js`, `lib/api.js`

- [ ] **Step 1: Kembalikan kolom `card` di riwayat sesi**

Di `app/api/sessions/[id]/route.js`, ganti `.select('id, role, content, created_at')` menjadi `.select('id, role, content, card, created_at')`. Sisanya tetap.

- [ ] **Step 2: Tambah fungsi di `lib/api.js`** (setelah `addAttachment`)

```js
export async function demoGaji() {
  return (await request('/api/demo/gaji', { method: 'POST' })).json();
}

export async function demoReset() {
  await request('/api/demo/reset', { method: 'POST' });
}

// Membuka Notifikasi Gajian. Mengembalikan sesi yang dimulai agent.
export async function openNotification(id) {
  return (await (await request(`/api/notifications/${encodeURIComponent(id)}/open`, { method: 'POST' })).json()).session;
}

export async function applyPlan(id, ubah) {
  return (await request(`/api/plans/${encodeURIComponent(id)}/apply`, postJson({ ubah }))).json();
}

export async function ignorePlan(id) {
  return (await request(`/api/plans/${encodeURIComponent(id)}/ignore`, { method: 'POST' })).json();
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: berhasil.

- [ ] **Step 4: Commit**

```bash
git add "app/api/sessions/[id]/route.js" lib/api.js
git commit -m "feat(client): API helpers for demo panel, notifications and plans; return cards in session history"
```

---

### Task 10: UI (kartu Rencana, lonceng, Panel Demo, saldo, dan Kantong)

**Files:**
- Create: `app/chat/RencanaCard.jsx`, `app/chat/NotifBell.jsx`, `app/chat/DemoPanel.jsx`
- Modify: `app/chat/page.jsx`, `app/globals.css`

- [ ] **Step 1: Buat `app/chat/RencanaCard.jsx`**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { sesuaikanRincian } from '../../lib/alokasi';
import { applyPlan, ignorePlan } from '../../lib/api';
import { rp } from '../../lib/format';
import { createClient } from '../../lib/supabase/browser';

const fmtNum = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Kartu Rencana Alokasi. Status dan rincian dibaca langsung dari tabel (RLS), angka dihitung lib/alokasi.js.
export default function RencanaCard({ planId, disabled, onChanged }) {
  const [plan, setPlan] = useState(null);
  const [ubah, setUbah] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from('allocation_plans')
      .select('id, status, rincian, kedaluwarsa_at')
      .eq('id', planId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setErr('Rencana Alokasi gagal dimuat.');
        else setPlan(data);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  if (!plan) return <div className="msg bot plan-card">{err || 'Memuat Rencana Alokasi…'}</div>;

  const kedaluwarsa = plan.status === 'diusulkan' && new Date(plan.kedaluwarsa_at) <= new Date();
  const terbuka = plan.status === 'diusulkan' && !kedaluwarsa;
  let preview = null;
  let previewErr = '';
  try {
    preview = sesuaikanRincian(plan.rincian, ubah);
  } catch (e) {
    previewErr = e.message;
  }
  const nilai = (p) => (Object.hasOwn(ubah, p.kunci) ? ubah[p.kunci] : p.nominal);
  const keinginan = preview ? preview.pos.find((p) => p.kunci === 'keinginan').nominal : null;

  const setNominal = (kunci, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 13);
    setUbah((u) => ({ ...u, [kunci]: digits === '' ? 0 : Number(digits) }));
  };
  const act = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      const res = await fn();
      setPlan((p) => ({ ...p, ...res.plan }));
      setUbah({});
      if (onChanged) onChanged();
    } catch (e) {
      setErr((e && e.message) || 'Gagal memproses rencana.');
    } finally {
      setBusy(false);
    }
  };

  const statusText = kedaluwarsa ? 'Kedaluwarsa' : plan.status === 'diterapkan' ? 'Sudah diterapkan' : plan.status === 'diabaikan' ? 'Diabaikan' : '';

  return (
    <div className="msg bot plan-card" role="group" aria-label="Kartu Rencana Alokasi">
      <div className="plan-title">{`Rencana Alokasi Gaji ${rp(plan.rincian.gaji)}`}</div>
      <ul className="plan-list">
        {plan.rincian.pos.map((p) => (
          <li key={p.kunci} className="plan-row">
            <span className="plan-label">
              {p.label}
              <small>{p.jenis === 'kantong' ? 'disimpan ke Kantong' : 'batas belanja'}</small>
            </span>
            {terbuka && p.kunci !== 'keinginan' ? (
              <input
                className="plan-input"
                inputMode="numeric"
                aria-label={`Nominal ${p.label} dalam rupiah`}
                value={fmtNum(nilai(p))}
                disabled={busy || disabled}
                onChange={(e) => setNominal(p.kunci, e.target.value)}
              />
            ) : (
              <span className="plan-amt">{p.kunci === 'keinginan' && terbuka ? (keinginan === null ? '—' : rp(keinginan)) : rp(p.nominal)}</span>
            )}
          </li>
        ))}
      </ul>
      {previewErr && <p className="plan-err" role="alert">{previewErr}</p>}
      {err && <p className="plan-err" role="alert">{err}</p>}
      {terbuka ? (
        <div className="row">
          <button type="button" className="btn primary" disabled={busy || disabled || !!previewErr} onClick={() => act(() => applyPlan(plan.id, ubah))}>
            Terapkan
          </button>
          <button type="button" className="btn ghost" disabled={busy || disabled} onClick={() => act(() => ignorePlan(plan.id))}>
            Abaikan
          </button>
        </div>
      ) : (
        <span className="small">{statusText}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Buat `app/chat/NotifBell.jsx`**

```jsx
'use client';

import { useState } from 'react';
import { fmtWaktu } from '../../lib/format';

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

// Lonceng Notifikasi Gajian. items: [{ id, isi, dibaca_at, created_at }].
export default function NotifBell({ items, disabled, onOpen }) {
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.dibaca_at).length;
  return (
    <div className="notif">
      <button
        type="button"
        className="btn ghost notif-btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {unread > 0 && <span className="notif-badge" aria-hidden="true">{unread}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          {items.length ? (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={'notif-item' + (n.dibaca_at ? '' : ' unread')}
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onOpen(n);
                }}
              >
                <span>{n.isi}</span>
                <small>{fmtWaktu(n.created_at)}</small>
              </button>
            ))
          ) : (
            <p className="notif-empty">Belum ada notifikasi.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Buat `app/chat/DemoPanel.jsx`**

```jsx
'use client';

// Panel Demo (spec 5.8). Tahap 2: Gaji masuk dan Reset data demo. Tombol lain menyusul di Tahap 3 dan 4.
export default function DemoPanel({ disabled, onGaji, onReset }) {
  return (
    <details className="demo-panel">
      <summary>Panel Demo</summary>
      <p className="demo-note">Simulasi untuk demo. Semua kejadian lewat jalur yang sama dengan kejadian sungguhan.</p>
      <div className="demo-actions">
        <button type="button" className="btn ghost" disabled={disabled} onClick={onGaji}>Gaji masuk</button>
        <button type="button" className="btn ghost danger" disabled={disabled} onClick={onReset}>Reset data demo</button>
      </div>
    </details>
  );
}
```

- [ ] **Step 4: Integrasikan ke `app/chat/page.jsx`**

Lakukan perubahan berikut, masing-masing persis seperti tertulis.

a. Import (ganti baris import `lib/api` dan tambah tiga komponen):

```js
import { addAttachment, callChat, createSession, demoGaji, demoReset, getSessionMessages, listSessions, openNotification } from '../../lib/api';
import RencanaCard from './RencanaCard';
import NotifBell from './NotifBell';
import DemoPanel from './DemoPanel';
```

b. Ganti `toChat`:

```js
// Pesan dari database -> isi chat. Lampiran tidak ditampilkan. Kartu Rencana menjadi komponen, pembaruan menjadi catatan kecil.
const toChat = (rows) =>
  rows.flatMap((m) => {
    if (m.role === 'user' || m.role === 'assistant') return [{ id: 'db' + m.id, role: m.role, content: m.content }];
    if (m.role === 'kartu' && m.card && m.card.jenis === 'rencana') return [{ id: 'db' + m.id, role: 'card', card: m.card }];
    if (m.role === 'pembaruan') return [{ id: 'db' + m.id, role: 'note', content: m.content.split('\n')[0] }];
    return [];
  });
```

c. State baru (setelah `const [txRows, setTxRows] = useState([]);`):

```js
  const [kantong, setKantong] = useState([]); // [{ pocket_id, nama, jenis, saldo }]
  const [notifications, setNotifications] = useState([]); // [{ id, isi, dibaca_at, created_at }]
  const [demoBusy, setDemoBusy] = useState(false);
```

d. Ganti `loadFinance` dan tambah `loadNotifications` setelahnya:

```js
  const loadFinance = async () => {
    const supabase = createClient();
    const [{ data: saldo, error: e1 }, { data: tx, error: e2 }, { data: profile, error: e3 }, { data: kt, error: e4 }] = await Promise.all([
      supabase.from('v_saldo_bebas').select('nomor_akhir, saldo_total, saldo_bebas').maybeSingle(),
      supabase.from('transactions').select('id, arah, nominal, pihak, kanal, status, waktu').order('waktu', { ascending: false }).limit(30),
      supabase.from('profiles').select('nama_panggilan').maybeSingle(),
      supabase.from('v_saldo_kantong').select('pocket_id, nama, jenis, saldo')
    ]);
    if (e1 || e2 || e3 || e4) throw new Error('Data rekening gagal dimuat.');
    if (saldo) setAccount({ ...saldo, nama: (profile && profile.nama_panggilan) || 'Nasabah' });
    setTxRows((tx || []).map(toTxRow));
    const urut = { dana_darurat: 0, goal: 1, investasi: 2, sosial: 3 };
    setKantong([...(kt || [])].sort((a, b) => (urut[a.jenis] ?? 9) - (urut[b.jenis] ?? 9) || a.nama.localeCompare(b.nama)));
  };

  const loadNotifications = async () => {
    const { data, error } = await createClient()
      .from('notifications')
      .select('id, isi, dibaca_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error('Notifikasi gagal dimuat.');
    setNotifications(data || []);
  };
```

e. Di efek mount (yang memanggil `loadFinance()`), tepat setelah baris `loadFinance().catch(...)`, tambahkan pemuatan notifikasi dan langganan Realtime:

```js
    loadNotifications().catch(() => {});
    // Notifikasi Gajian baru dikirim Supabase Realtime (spec 5.2). RLS memastikan hanya notifikasi milik sendiri.
    const supabase = createClient();
    let channel = null;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data || !data.user) return;
      channel = supabase
        .channel('notifikasi-' + data.user.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${data.user.id}` }, (payload) => {
          const n = payload.new;
          setNotifications((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list]));
          toast(n.isi);
        })
        .subscribe();
    });
```

Variabel `cancelled` sudah dideklarasikan di efek yang sama. **Pindahkan** deklarasi `let cancelled = false;` ke atas, sebelum blok di atas, jika saat ini dideklarasikan setelahnya. Di fungsi cleanup efek yang sama, tambahkan sebagai baris pertama setelah `cancelled = true;`:

```js
      if (channel) supabase.removeChannel(channel);
```

f. Fungsi aksi baru (letakkan setelah `logout`):

```js
  const refreshSession = () => {
    const sid = sessionRef.current;
    if (sid) openSession(sid).catch(() => {});
  };

  const afterPlanChange = () => {
    loadFinance().catch(() => {});
    refreshSession(); // menampilkan catatan pembaruan Rencana
  };

  const onDemoGaji = async () => {
    setDemoBusy(true);
    try {
      await demoGaji();
      await Promise.all([loadFinance(), loadNotifications()]);
      toast('Gaji masuk. Buka lonceng notifikasi untuk mengatur pembagiannya.');
    } catch (e) {
      toast((e && e.message) || 'Simulasi gaji gagal.');
    } finally {
      setDemoBusy(false);
    }
  };

  const onDemoReset = async () => {
    if (!window.confirm('Reset data demo? Semua transaksi, Kantong, Goal, notifikasi, dan percakapan akan dihapus lalu dibuat ulang.')) return;
    setDemoBusy(true);
    try {
      await demoReset();
      try {
        localStorage.removeItem(LS_SESSION);
      } catch {
        /* penyimpanan diblokir */
      }
      setSessions([]);
      await startNewSession();
      await Promise.all([loadFinance(), loadNotifications()]);
      toast('Data demo dikembalikan ke kondisi awal.');
    } catch (e) {
      toast((e && e.message) || 'Reset data demo gagal.');
    } finally {
      setDemoBusy(false);
    }
  };

  const onOpenNotification = async (n) => {
    setDemoBusy(true);
    toast('Menyiapkan Rencana Alokasi…');
    try {
      const session = await openNotification(n.id);
      setSessions((list) => (list.some((x) => x.id === session.id) ? list : [session, ...list]));
      await openSession(session.id);
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, dibaca_at: x.dibaca_at || new Date().toISOString() } : x)));
      go('chat');
    } catch (e) {
      toast((e && e.message) || 'Notifikasi gagal dibuka.');
    } finally {
      setDemoBusy(false);
    }
  };
```

g. Header: tambahkan lonceng tepat sebelum tombol `Chat baru`, dan ubah label opsi pemilih sesi:

```jsx
            <NotifBell items={notifications} disabled={busy || inCall || voiceBusy || demoBusy} onOpen={onOpenNotification} />
```

```jsx
                <option key={x.id} value={x.id}>{(x.dimulai_oleh === 'agent' ? 'Gajian · ' : '') + fmtWaktu(x.created_at)}</option>
```

h. Render isi chat: di dalam `chat.map((m) => ...)`, tangani dua role baru **sebelum** `<div className={'msg ' + ...}>`. Ganti pembuka map menjadi:

```jsx
            {chat.map((m) => {
              if (m.role === 'card') {
                return <RencanaCard key={m.id} planId={m.card.plan_id} disabled={busy || inCall || voiceBusy} onChanged={afterPlanChange} />;
              }
              if (m.role === 'note') {
                return <div key={m.id} className="msg note" role="note">{m.content}</div>;
              }
              return (
                <div key={m.id} className={'msg ' + (m.role === 'user' ? 'user' : 'bot') + (m.err ? ' err' : '')}>
                  {/* isi lama tidak berubah */}
                </div>
              );
            })}
```

(Isi `<div>` disalin persis dari kode sekarang: cabang `m.pending`, `m.shown`, dan `m.content`.)

i. Panel saldo: ganti blok `<div className="balance">…</div>` menjadi:

```jsx
          <div className="balance">
            <div className="balance-sm">{account ? `Tabungan Agent Nusa · •••• ${account.nomor_akhir}` : 'Memuat rekening…'}</div>
            <div className="balance-big">{account ? rp(account.saldo_total) : '—'}</div>
            <div className="balance-sm">{account ? `Saldo Total · Saldo Bebas ${rp(account.saldo_bebas)}` : 'Saldo Total'}</div>
          </div>
          {kantong.length > 0 && (
            <ul className="kantong-list" aria-label="Kantong">
              {kantong.map((k) => (
                <li key={k.pocket_id}>
                  <span>{k.nama}</span>
                  <b>{rp(k.saldo)}</b>
                </li>
              ))}
            </ul>
          )}
          <DemoPanel disabled={busy || inCall || voiceBusy || demoBusy} onGaji={onDemoGaji} onReset={onDemoReset} />
```

j. Periksa dengan `grep -n "m.role\|chatRef.current" app/chat/page.jsx` bahwa tidak ada kode lain (misalnya mode telepon) yang menganggap setiap item chat punya `content` string. Jika ada, lewati item ber-role `card` atau `note`.

- [ ] **Step 5: Tambah gaya di akhir `app/globals.css`**

```css
/* Tahap 2: kartu Rencana, catatan pembaruan, lonceng, Kantong, Panel Demo */
.msg.note{align-self:center;max-width:min(90%,560px);padding:8px 14px;border-radius:999px;font-size:12.5px;color:var(--txt2);background:rgba(255,255,255,.1);border:1px dashed rgba(255,255,255,.35);white-space:normal;text-align:center}
.plan-card{width:min(92%,520px);max-width:none;white-space:normal}
.plan-title{font-weight:800;font-size:14.5px;margin-bottom:8px}
.plan-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.plan-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.14)}
.plan-label{display:flex;flex-direction:column;font-weight:600;font-size:13.5px;min-width:0}
.plan-label small{font-weight:500;font-size:11.5px;color:var(--txt2)}
.plan-input{width:140px;min-height:40px;padding:0 10px;border-radius:12px;border:1px solid var(--b-ctrl);background:var(--g-ctrl);color:#fff;font-weight:700;font-size:13.5px;text-align:right}
.plan-amt{font-weight:800;font-size:13.5px}
.plan-err{margin:8px 0 0;font-size:12.5px;color:var(--bad)}
.notif{position:relative}
.notif-btn{position:relative;padding:0 12px}
.notif-badge{position:absolute;top:4px;right:4px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--bad);color:#0E2146;font-size:11px;font-weight:800;line-height:18px;text-align:center}
.notif-pop{position:absolute;right:0;top:calc(100% + 8px);z-index:20;width:min(320px,80vw);max-height:360px;overflow-y:auto;padding:8px;border-radius:18px;background:rgba(14,33,70,.96);border:1px solid var(--b-panel);box-shadow:0 18px 40px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:4px}
.notif-item{display:flex;flex-direction:column;gap:2px;width:100%;padding:10px 12px;border-radius:12px;border:0;background:transparent;color:#fff;text-align:left;font-size:13px}
.notif-item:hover{background:rgba(255,255,255,.12)}
.notif-item.unread{background:rgba(98,195,232,.2);font-weight:700}
.notif-item small{font-weight:500;font-size:11.5px;color:var(--txt2)}
.notif-empty{margin:8px;font-size:13px;color:var(--txt2)}
.kantong-list{list-style:none;margin:10px 0 0;padding:10px 14px;border-radius:18px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);display:flex;flex-direction:column;gap:6px;font-size:13px}
.kantong-list li{display:flex;justify-content:space-between;gap:10px}
.demo-panel{margin:10px 0;padding:10px 14px;border-radius:18px;border:1px dashed rgba(255,255,255,.45);background:rgba(255,255,255,.06)}
.demo-panel summary{cursor:pointer;font-weight:800;font-size:13.5px}
.demo-note{margin:8px 0;font-size:12px;color:var(--txt2)}
.demo-actions{display:flex;flex-wrap:wrap;gap:8px}
```

- [ ] **Step 6: Build dan test**

Run: `npm test` lalu `npm run build`
Expected: test PASS dan build bersih.

- [ ] **Step 7: Commit**

```bash
git add app/chat app/globals.css
git commit -m "feat(chat): plan card, notification bell with realtime, Kantong panel and demo panel"
```

---

### Task 11: Verifikasi live dan dokumentasi

Butuh migrasi Task 4 sudah dijalankan pemilik repo di Supabase SQL Editor.

**Files:**
- Modify: `docs/specs/agent-keuangan.md` (bagian 7.1 dan 9), `README.md`

- [ ] **Step 1: Jalankan dev server dan uji alur** (pakai akun uji yang ada atau register akun baru)

Checklist, yang semuanya harus terbukti:
1. Panel kanan menampilkan Saldo Total dan Saldo Bebas. Setelah register atau reset, keduanya Rp 24.380.500.
2. **Gaji masuk**: Transaksi Gaji muncul, Saldo Total bertambah Rp 12.500.000, dan lonceng menampilkan 1 notifikasi belum dibaca (lewat Realtime atau muat ulang setelah POST).
3. Membuka notifikasi membuat sesi "Gajian · …" berisi kartu Rencana, lalu sapaan agent yang menyebut angka kartu. Membuka notifikasi yang sama lagi kembali ke sesi yang sama.
4. Mengubah nominal Investasi di kartu langsung mengubah Keinginan. Total yang melebihi Gaji menampilkan error, dan Terapkan nonaktif.
5. **Terapkan**: Kantong (Dana Darurat, Investasi) muncul dengan nominal yang benar, Saldo Bebas turun sebesar total Kantong, Saldo Total tidak berubah, catatan "Rencana Alokasi diterapkan pada …" muncul, dan kartu berstatus "Sudah diterapkan".
6. Pertanyaan berikutnya di sesi itu ("berapa saldo bebasku sekarang?") dijawab dengan angka dari pembaruan. `chat_messages.usage` pada giliran ke-2 dan seterusnya menunjukkan `cached_tokens > 0`.
7. Gaji kedua lalu **Abaikan**: status Diabaikan dan Kantong tidak berubah.
8. Isolasi: akun B tidak bisa membuka notifikasi atau menerapkan Rencana akun A (404).
9. **Reset data demo**: Kantong hilang, saldo kembali Rp 24.380.500, sesi lama hilang, dan sesi baru dibuat.
10. Sesi Tahap 1 yang lama (system prompt v1) masih bisa dilanjutkan, dan cache tetap kena.

- [ ] **Step 2: Catat keputusan pelaksanaan di spec 7.1** (tambahkan butir)

```markdown
- **Kartu** disimpan sebagai `chat_messages.role = 'kartu'` dengan `card = { jenis, plan_id }`. Teks kartu di prompt dibekukan saat disisipkan. Status terbaru dibaca UI dari `allocation_plans`, dan perubahannya masuk sebagai pesan `pembaruan`.
- Di sesi yang dimulai agent, kartu Rencana disimpan **sebelum** sapaan agent, karena model butuh isi kartu untuk menjelaskannya.
- Edit kartu tidak disimpan terpisah: `POST /api/plans/:id/apply` menerima `{ ubah }`, server menghitung ulang dengan `sesuaikanRincian` (Keinginan menyerap selisih), lalu menerapkannya. `PATCH /api/plans/:id` tidak dibuat.
- Kantong dibuat saat Rencana pertama kali diterapkan, tidak saat register.
- Kedaluwarsa 7 hari dicek setiap kali Rencana dibaca atau diputuskan (tanpa cron).
- **Reset data demo** menghapus semua data kecuali akun login dan profil, termasuk Goal dari onboarding.
- System prompt v2 dipakai sesi baru. Sesi lama tetap memakai v1.
```

Tambahkan juga keputusan dari Task 0 atau Task 8 jika ada (misalnya pesan `user` sintetis untuk sapaan).

Di tabel bagian 9, hapus baris `PATCH /api/plans/:id` dan ubah baris apply menjadi `` `POST /api/plans/:id/apply` · `/ignore` | Menerapkan Rencana (body `{ ubah }` dari kartu, dihitung ulang server) atau mengabaikannya ``. Tambah baris `` `POST /api/demo/reset` | Reset data demo ``.

- [ ] **Step 3: Perbarui README**

Di bagian setup Supabase, tambahkan langkah: jalankan juga `supabase/migrations/20261126000001_alokasi.sql` di SQL Editor (setelah migrasi fondasi). Di bagian fitur, sebutkan Panel Demo (Gaji masuk, Reset data demo), lonceng Notifikasi Gajian, dan kartu Rencana Alokasi.

- [ ] **Step 4: Test, build, dan commit**

Run: `npm test` lalu `npm run build`
Expected: PASS dan build bersih.

```bash
git add docs/specs/agent-keuangan.md README.md
git commit -m "docs: record Tahap 2 implementation decisions and setup"
```

---

## Self-review (dijalankan penulis plan)

- **Cakupan spec Tahap 2:**
  - Goal dan Kantong: Task 4, 6, dan 7.
  - `lib/alokasi.js` beserta test: Task 1.
  - `ingest_transaksi`: Task 4 dan 6.
  - Notifikasi Gajian lewat Realtime: Task 4, 6, dan 10.
  - Sesi yang dimulai agent: Task 8.
  - Kartu yang bisa diedit: Task 10.
  - `terapkan_rencana`: Task 4 dan 7.
  - Kedaluwarsa 7 hari: Task 6, 7, dan 8.
  - Panel Demo Gaji dan Reset: Task 6 dan 10.
  - Verifikasi tool calling: Task 0.
  - Kriteria selesai: Task 11.
- **Di luar cakupan (sesuai spec):** `pindah_kantong` dan Kantong manual (tidak dibutuhkan alur Tahap 2), serta Pengaturan persentase dan Goal di UI (tabel sudah bisa ditulis lewat RLS; halaman Pengaturan lengkap belum diminta di kriteria Tahap 2).
- **Konsistensi nama:**
  - `hitungAlokasi`, `sesuaikanRincian`, `renderRencana`, `renderRencanaDiterapkan`, `totalKantong`, `sisaBulan` (Task 1) dipakai di Task 6, 7, 8, dan 10.
  - `muatKeuangan` (Task 5) dipakai di Task 5 dan 6.
  - `panggilNetra`, `gagalNetra`, `netraSiap` (Task 5) dipakai di Task 5 dan 8.
  - `failDb` (Task 5) dipakai di Task 6 dan 7.
  - `demoGaji`, `demoReset`, `openNotification`, `applyPlan`, `ignorePlan` (Task 9) dipakai di Task 10.
