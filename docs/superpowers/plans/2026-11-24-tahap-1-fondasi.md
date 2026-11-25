# Tahap 1: Fondasi (Supabase, Auth, Sesi Percakapan di DB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nasabah bisa register, login, dan onboarding, lalu langsung punya rekening demo di Supabase. Chat berjalan lewat Sesi Percakapan yang tersimpan di DB, dan prompt disusun server dengan prefix stabil supaya context caching DeepSeek bisa kena.

**Architecture:** Supabase (Postgres + Auth + RLS) menjadi sumber data. Trigger `auth.users` memanggil `seed_nasabah_baru` untuk mengisi rekening, 3 bulan Transaksi, Dana Darurat, dan Aturan Alokasi default. Route handler Next.js membaca data lewat klien Supabase milik Nasabah (RLS berlaku) dan menulis lewat klien service role. `/api/chat` menyusun prompt dengan urutan tetap (system statis → Snapshot Keuangan → riwayat), meneruskan stream dari Netra ke browser, lalu menyimpan balasan beserta `usage` (cache hit). Logika murni (format, keuangan, snapshot, prompt, parser SSE) dipisah ke `lib/` dan diuji dengan vitest.

**Tech Stack:** Next.js 15 (App Router, JavaScript), React 19, `@supabase/supabase-js`, `@supabase/ssr`, Supabase cloud (Postgres), vitest, Netra Runtime (`deepseek/deepseek-v4.1-flash`).

**Referensi:** [spec](../../specs/agent-keuangan.md) bagian 4, 5.1, 7, 8, 9, 11 (Tahap 1) · [CONTEXT.md](../../../CONTEXT.md) · ADR [0001](../../adr/0001-supabase-sebagai-database-dan-auth.md), [0003](../../adr/0003-sesi-disimpan-dengan-snapshot-demi-prefix-cache.md), [0005](../../adr/0005-saldo-dihitung-dari-buku-besar.md).

**Aturan commit di repo ini:** jangan menambahkan baris `Co-Authored-By` atau atribusi Claude di pesan commit.

---

## Keputusan pelaksanaan yang tidak tertulis eksplisit di spec

Keputusan-keputusan ini mengikuti prinsip di spec. Semuanya juga dicatat ke spec pada Task 14.

1. **Lampiran (PDF dan catatan teks) ditempel ke Sesi Percakapan**, disimpan sebagai pesan `role = 'lampiran'` di akhir riwayat. Lampiran tidak dikirim browser setiap kali chat, dan tidak bisa dilepas lagi, karena melepasnya akan mengubah prefix (ADR 0003). Untuk percakapan tanpa lampiran, Nasabah memulai Chat baru.
2. **Riwayat tidak dipotong** (kode lama memakai `.slice(-20)`). Memotong dari depan akan mengubah prefix setiap giliran sehingga cache tidak pernah kena. Sebagai gantinya ada batas ukuran prompt: lebih dari 400.000 karakter ditolak (413) dengan saran memulai Chat baru.
3. **Key Deepgram tetap di browser** pada Tahap 1, karena WebSocket speech-to-text dibuka langsung dari browser. Hanya key Netra yang pindah ke server. Halaman "Pengaturan AI" diperkecil menjadi "Pengaturan" (key Deepgram dan lampiran).
4. **Cap waktu pesan Nasabah diambil dari `chat_messages.created_at`**, bukan dari jam saat prompt disusun, sehingga riwayat yang dirender ulang selalu identik.
5. **Balasan agent disimpan apa adanya** (tidak di-trim), karena DeepSeek menyimpan cache di ujung output model.

## Struktur file

| File | Status | Tanggung jawab |
|---|---|---|
| `package.json` | ubah | dependensi Supabase, vitest, script `test` |
| `vitest.config.mjs` | baru | konfigurasi test |
| `.env.example` | baru | daftar env yang dibutuhkan |
| `scripts/cek-cache-netra.mjs` | baru | verifikasi apakah Netra meneruskan context caching |
| `supabase/migrations/20261124000001_fondasi.sql` | baru | tabel, RLS, view saldo, seed, trigger |
| `lib/format.js` | baru | `rp`, `fmtWaktu`, `fmtTanggal` (deterministik, WIB) |
| `lib/keuangan.js` | baru | `saldoTotal`, `pengeluaranBulananOtomatis`, `pengeluaranBulanan`, `targetDanaDarurat` |
| `lib/snapshot.js` | baru | `buildSnapshot`, `renderSnapshot` |
| `lib/sse.js` | baru | `createSseParser` (dipakai server dan browser) |
| `lib/prompt.js` | baru | system prompt berversi, `buildPromptMessages` |
| `lib/supabase/browser.js` | baru | klien Supabase untuk komponen client |
| `lib/supabase/server.js` | baru | klien Supabase berbasis cookie untuk server |
| `lib/supabase/admin.js` | baru | klien service role (hanya server) |
| `lib/server/http.js` | baru | `fail()` |
| `lib/server/sesi.js` | baru | `buatSesi()` (membekukan snapshot, membuat Sesi Percakapan) |
| `middleware.js` | baru | refresh sesi auth, redirect halaman yang butuh login |
| `app/auth.css` | baru | gaya halaman login, register, dan onboarding |
| `app/login/page.jsx` | baru | halaman login |
| `app/register/page.jsx` | baru | halaman register |
| `app/onboarding/page.jsx` | baru | wizard onboarding |
| `app/chat/layout.jsx` | ubah | wajib login dan onboarding selesai |
| `app/api/sessions/route.js` | baru | daftar dan buat Sesi Percakapan |
| `app/api/sessions/[id]/route.js` | baru | ambil pesan sesi |
| `app/api/sessions/[id]/lampiran/route.js` | baru | tempel lampiran |
| `app/api/chat/route.js` | tulis ulang | susun prompt di server, stream, simpan pesan dan `usage` |
| `lib/api.js` | tulis ulang | klien browser untuk endpoint di atas |
| `lib/data.js` | tulis ulang | hanya `CHIPS`, `DEFAULTS`, `MAX_CONTEXT`, `normalizeSettings`, re-export `rp` |
| `app/chat/page.jsx` | ubah | pakai sesi DB, data rekening dan Transaksi dari DB, pengaturan diperkecil, tombol keluar |
| `app/globals.css` | ubah | gaya pemilih sesi |
| `tests/*.test.js`, `tests/fixtures.js` | baru | unit test |
| `README.md`, `docs/specs/agent-keuangan.md`, `CONTEXT.md` | ubah | dokumentasi |

---

### Task 0: Verifikasi context caching lewat Netra

Tujuannya memastikan Netra meneruskan caching DeepSeek dan mengembalikan field cache di `usage`, baik untuk permintaan non-stream maupun stream. Hasilnya menentukan apakah `stream_options` dipakai di Task 12.

**Files:**
- Create: `scripts/cek-cache-netra.mjs`
- Create: `.env.example`

- [ ] **Step 1: Tulis `.env.example`**

```bash
# Supabase (Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Rahasia server. Jangan pernah diberi awalan NEXT_PUBLIC_.
SUPABASE_SERVICE_ROLE_KEY=

# Netra Runtime (dulu diisi di halaman Pengaturan AI, sekarang hanya di server)
NETRA_API_KEY=
NETRA_MODEL=deepseek/deepseek-v4.1-flash
# Opsional
NETRA_BASE_URL=https://api.netraruntime.com/v1
```

- [ ] **Step 2: Tulis script verifikasi**

```js
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
```

- [ ] **Step 3: Jalankan**

Siapkan `.env.local` berisi minimal `NETRA_API_KEY`, lalu jalankan:

```bash
node --env-file=.env.local scripts/cek-cache-netra.mjs
```

Yang diharapkan: permintaan ke-2 atau ke-3 menunjukkan `cache hit` > 0, dan bagian stream mencetak `usage` yang tidak kosong.

- [ ] **Step 4: Catat hasilnya**

Tambahkan satu paragraf di bawah bagian 4 di `docs/specs/agent-keuangan.md` dengan judul "Hasil verifikasi (tanggal)". Isinya: nama field cache yang dikembalikan, apakah cache hit > 0, dan apakah `stream_options` diterima.
- Jika `stream_options` **ditolak** (HTTP 400): di Task 12, hapus `stream_options` dari body ke Netra. `usage` akan tersimpan `null`, dan hal ini dicatat di spec.
- Jika field cache **tidak ada sama sekali**: lanjutkan rencana apa adanya (fitur tetap jalan tanpa penghematan), dan catat sebagai risiko terbuka.

- [ ] **Step 5: Commit**

```bash
git add scripts/cek-cache-netra.mjs .env.example docs/specs/agent-keuangan.md
git commit -m "chore: add Netra context-cache verification script"
```

---

### Task 1: Tooling (dependensi dan vitest)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.mjs`

- [ ] **Step 1: Pasang dependensi**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest
```

- [ ] **Step 2: Tambah script test di `package.json`**

Ubah bagian `"scripts"` menjadi:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Tulis `vitest.config.mjs`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
});
```

- [ ] **Step 4: Pastikan vitest berjalan**

Run: `npm test`
Expected: vitest berjalan dan melaporkan "No test files found" (exit code 1). Ini normal karena belum ada test.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.mjs
git commit -m "chore: add supabase deps and vitest"
```

---

### Task 2: `lib/format.js`

**Files:**
- Create: `lib/format.js`
- Modify: `lib/data.js` (fungsi `rp`)
- Test: `tests/format.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
import { describe, expect, it } from 'vitest';
import { fmtTanggal, fmtWaktu, rp } from '../lib/format';

describe('rp', () => {
  it('memberi titik ribuan', () => {
    expect(rp(24380500)).toBe('Rp 24.380.500');
    expect(rp(0)).toBe('Rp 0');
  });
  it('menerima string angka dari database', () => {
    expect(rp('1500000')).toBe('Rp 1.500.000');
  });
});

describe('fmtWaktu', () => {
  it('mengubah UTC ke WIB', () => {
    expect(fmtWaktu('2026-11-24T07:12:00Z')).toBe('24 Nov 2026 14:12 WIB');
  });
  it('berganti hari setelah tengah malam WIB', () => {
    expect(fmtWaktu('2026-11-24T17:30:00+00:00')).toBe('25 Nov 2026 00:30 WIB');
  });
});

describe('fmtTanggal', () => {
  it('memformat tanggal tanpa jam', () => {
    expect(fmtTanggal('2027-06-01')).toBe('1 Jun 2027');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/format.test.js`
Expected: FAIL karena `lib/format` tidak ditemukan.

- [ ] **Step 3: Implementasi**

```js
// Format angka dan waktu yang deterministik: hasil server, browser, dan prompt selalu sama.
// Jangan memakai toLocaleString: hasilnya bisa berbeda antar mesin dan merusak prefix cache.

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const WIB_MS = 7 * 60 * 60 * 1000;
const dua = (n) => String(n).padStart(2, '0');

export const rp = (n) => 'Rp ' + String(Number(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// '2026-11-24T07:12:00Z' -> '24 Nov 2026 14:12 WIB'
export function fmtWaktu(iso) {
  const d = new Date(new Date(iso).getTime() + WIB_MS);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} ${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())} WIB`;
}

// '2027-06-01' -> '1 Jun 2027'
export function fmtTanggal(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}
```

Di `lib/data.js`, ganti baris berikut:

```js
// Format manual agar hasil server dan browser identik (tanpa mismatch hydration).
export const rp = (n) => 'Rp ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
```

dengan:

```js
export { rp } from './format';
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npx vitest run tests/format.test.js`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add lib/format.js lib/data.js tests/format.test.js
git commit -m "feat: add deterministic rupiah and WIB formatters"
```

---

### Task 3: `lib/keuangan.js`

**Files:**
- Create: `lib/keuangan.js`
- Test: `tests/keuangan.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
import { describe, expect, it } from 'vitest';
import { pengeluaranBulanan, pengeluaranBulananOtomatis, saldoTotal, targetDanaDarurat } from '../lib/keuangan';

const now = new Date('2026-11-24T07:00:00Z');
const tx = (waktu, arah, nominal, status = 'berhasil') => ({ waktu, arah, nominal, status });
const data = [
  tx('2026-08-01T00:00:00Z', 'masuk', 13939000), // saldo awal
  tx('2026-08-02T09:00:00Z', 'keluar', 9000000),
  tx('2026-09-10T09:00:00Z', 'keluar', 6000000),
  tx('2026-10-10T09:00:00Z', 'keluar', 3000000),
  tx('2026-10-11T09:00:00Z', 'keluar', 500000, 'gagal'), // gagal: tidak dihitung
  tx('2026-11-02T09:00:00Z', 'keluar', 999999), // bulan berjalan: tidak masuk Pengeluaran Bulanan
  tx('2026-07-30T09:00:00Z', 'keluar', 777777), // 4 bulan lalu: tidak masuk Pengeluaran Bulanan
  tx('2026-10-25T08:00:00Z', 'masuk', 12500000)
];

describe('saldoTotal', () => {
  it('menjumlahkan transaksi berhasil saja', () => {
    // masuk 26.439.000 - keluar berhasil 19.777.776
    expect(saldoTotal(data)).toBe(6661224);
  });
  it('menerima nominal berupa string', () => {
    expect(saldoTotal([tx('2026-10-01T00:00:00Z', 'masuk', '1000')])).toBe(1000);
  });
});

describe('pengeluaranBulananOtomatis', () => {
  it('rata-rata keluar berhasil pada 3 bulan kalender penuh terakhir', () => {
    expect(pengeluaranBulananOtomatis(data, now)).toBe(6000000);
  });
  it('0 bila tidak ada transaksi', () => {
    expect(pengeluaranBulananOtomatis([], now)).toBe(0);
  });
});

describe('pengeluaranBulanan', () => {
  it('memakai koreksi Nasabah bila ada', () => {
    expect(pengeluaranBulanan(data, 4500000, now)).toBe(4500000);
    expect(pengeluaranBulanan(data, 0, now)).toBe(0);
  });
  it('memakai hitungan otomatis bila koreksi kosong', () => {
    expect(pengeluaranBulanan(data, null, now)).toBe(6000000);
    expect(pengeluaranBulanan(data, undefined, now)).toBe(6000000);
  });
});

describe('targetDanaDarurat', () => {
  it('kelipatan dari Pengeluaran Bulanan', () => {
    expect(targetDanaDarurat(6000000, 6)).toBe(36000000);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/keuangan.test.js`
Expected: FAIL karena `lib/keuangan` tidak ditemukan.

- [ ] **Step 3: Implementasi**

```js
// Hitungan keuangan murni (tanpa I/O). Dipakai server (snapshot) dan browser (onboarding).

const berhasil = (t) => t.status === 'berhasil';

// Saldo Total = semua Transaksi berhasil (ADR 0005: saldo dihitung dari buku besar).
export function saldoTotal(transactions) {
  let total = 0;
  for (const t of transactions) {
    if (!berhasil(t)) continue;
    total += t.arah === 'masuk' ? Number(t.nominal) : -Number(t.nominal);
  }
  return total;
}

// Rata-rata Transaksi keluar berhasil pada 3 bulan kalender penuh sebelum bulan berjalan (batas bulan UTC,
// sama dengan date_trunc di seed database).
export function pengeluaranBulananOtomatis(transactions, now) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1);
  let total = 0;
  for (const t of transactions) {
    const w = new Date(t.waktu).getTime();
    if (t.arah === 'keluar' && berhasil(t) && w >= start && w < end) total += Number(t.nominal);
  }
  return Math.round(total / 3);
}

// Koreksi Nasabah selalu menang atas hitungan otomatis.
export function pengeluaranBulanan(transactions, koreksi, now) {
  return koreksi === null || koreksi === undefined ? pengeluaranBulananOtomatis(transactions, now) : Number(koreksi);
}

export function targetDanaDarurat(pengeluaran, kelipatan) {
  return pengeluaran * kelipatan;
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npx vitest run tests/keuangan.test.js`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add lib/keuangan.js tests/keuangan.test.js
git commit -m "feat: add pure finance calculations (saldo, pengeluaran bulanan)"
```

---

### Task 4: `lib/snapshot.js`

**Files:**
- Create: `lib/snapshot.js`
- Create: `tests/fixtures.js`
- Test: `tests/snapshot.test.js`

- [ ] **Step 1: Tulis fixture bersama**

```js
// Data contoh yang dipakai beberapa test.
export const NOW = new Date('2026-11-24T07:12:00Z');

export const snapshotInput = {
  profile: { nama_panggilan: 'Dimas', pekerjaan: 'Desainer', tanggal_gajian: 25, profil_risiko: null, pengeluaran_bulanan_koreksi: null },
  account: { nomor_akhir: '4821' },
  transactions: [
    { waktu: '2026-10-25T01:00:00+00:00', arah: 'masuk', nominal: 12500000, pihak: 'Gaji PT Nusantara Digital', kanal: 'Kredit', status: 'berhasil', catatan: null },
    { waktu: '2026-10-02T02:00:00+00:00', arah: 'keluar', nominal: 3000000, pihak: 'Sewa kos', kanal: 'BI-FAST', status: 'berhasil', catatan: null },
    { waktu: '2026-11-23T06:00:00+00:00', arah: 'keluar', nominal: 500000, pihak: 'Transfer ke Rina Wijaya', kanal: 'BI-FAST', status: 'gagal', catatan: 'dana dikembalikan' }
  ],
  goals: [
    { nama: 'Liburan Bali', target: 8000000, tenggat: '2027-06-01', is_dana_darurat: false, kelipatan_target: null, created_at: '2026-11-24T07:00:00Z' },
    { nama: 'Dana Darurat', target: null, tenggat: null, is_dana_darurat: true, kelipatan_target: 6, created_at: '2026-11-24T06:00:00Z' }
  ],
  now: NOW
};
```

- [ ] **Step 2: Tulis test yang gagal**

```js
import { describe, expect, it } from 'vitest';
import { buildSnapshot, renderSnapshot } from '../lib/snapshot';
import { snapshotInput } from './fixtures';

describe('buildSnapshot', () => {
  const s = buildSnapshot(snapshotInput);

  it('menghitung saldo dan Pengeluaran Bulanan', () => {
    expect(s.rekening).toEqual({ nomor_akhir: '4821', saldo_total: 9500000 });
    expect(s.pengeluaran_bulanan).toBe(1000000);
    expect(s.pengeluaran_bulanan_sumber).toBe('hitungan_transaksi');
  });

  it('Dana Darurat di urutan pertama dengan target turunan', () => {
    expect(s.goals[0]).toEqual({ nama: 'Dana Darurat', target: 6000000, tenggat: null, dana_darurat: true });
    expect(s.goals[1]).toEqual({ nama: 'Liburan Bali', target: 8000000, tenggat: '2027-06-01', dana_darurat: false });
  });

  it('transaksi terbaru di urutan pertama', () => {
    expect(s.transaksi_terakhir[0].pihak).toBe('Transfer ke Rina Wijaya');
  });

  it('memakai koreksi Nasabah bila ada', () => {
    const k = buildSnapshot({ ...snapshotInput, profile: { ...snapshotInput.profile, pengeluaran_bulanan_koreksi: 2000000 } });
    expect(k.pengeluaran_bulanan).toBe(2000000);
    expect(k.pengeluaran_bulanan_sumber).toBe('koreksi_nasabah');
    expect(k.goals[0].target).toBe(12000000);
  });
});

describe('renderSnapshot', () => {
  const s = buildSnapshot(snapshotInput);
  const text = renderSnapshot(s);

  it('memuat data penting dalam teks', () => {
    expect(text).toContain('DATA KEUANGAN NASABAH (dibekukan 24 Nov 2026 14:12 WIB)');
    expect(text).toContain('Nama nasabah: Dimas');
    expect(text).toContain('Profil Risiko: belum diisi');
    expect(text).toContain('Saldo Total: Rp 9.500.000');
    expect(text).toContain('Pengeluaran Bulanan: Rp 1.000.000 (dihitung dari transaksi 3 bulan terakhir)');
    expect(text).toContain('- Dana Darurat: target Rp 6.000.000');
    expect(text).toContain('- Liburan Bali: target Rp 8.000.000, tenggat 1 Jun 2027');
    expect(text).toContain('- 23 Nov 2026 13:00 WIB | Transfer ke Rina Wijaya | keluar Rp 500.000 | status: gagal (dana dikembalikan) | kanal: BI-FAST');
  });

  it('tidak bergantung pada urutan key (jsonb tidak menjaga urutan key)', () => {
    const reversed = Object.fromEntries(Object.entries(s).reverse());
    expect(renderSnapshot(reversed)).toBe(text);
  });

  it('dua kali render hasilnya identik', () => {
    expect(renderSnapshot(JSON.parse(JSON.stringify(s)))).toBe(text);
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/snapshot.test.js`
Expected: FAIL karena `lib/snapshot` tidak ditemukan.

- [ ] **Step 4: Implementasi**

```js
// Snapshot Keuangan: data yang dibekukan saat Sesi Percakapan dibuat (ADR 0003).
// buildSnapshot -> objek untuk disimpan di chat_sessions.snapshot (jsonb).
// renderSnapshot -> teks untuk prompt. Urutan baris ditulis eksplisit di sini karena jsonb tidak menjaga urutan key.

import { fmtTanggal, fmtWaktu, rp } from './format';
import { pengeluaranBulanan, saldoTotal, targetDanaDarurat } from './keuangan';

const MAX_TRANSAKSI = 15;

export function buildSnapshot({ profile, account, transactions, goals, now }) {
  const koreksi = profile.pengeluaran_bulanan_koreksi;
  const pengeluaran = pengeluaranBulanan(transactions, koreksi, now);
  const sortedGoals = [...goals].sort(
    (a, b) => Number(b.is_dana_darurat) - Number(a.is_dana_darurat) || new Date(a.created_at) - new Date(b.created_at)
  );
  const recent = [...transactions].sort((a, b) => new Date(b.waktu) - new Date(a.waktu)).slice(0, MAX_TRANSAKSI);

  return {
    dibuat_pada: now.toISOString(),
    nasabah: {
      nama: profile.nama_panggilan || 'Nasabah',
      pekerjaan: profile.pekerjaan || null,
      tanggal_gajian: profile.tanggal_gajian ?? null,
      profil_risiko: profile.profil_risiko ?? null
    },
    rekening: { nomor_akhir: account.nomor_akhir, saldo_total: saldoTotal(transactions) },
    pengeluaran_bulanan: pengeluaran,
    pengeluaran_bulanan_sumber: koreksi === null || koreksi === undefined ? 'hitungan_transaksi' : 'koreksi_nasabah',
    goals: sortedGoals.map((g) => ({
      nama: g.nama,
      target: g.is_dana_darurat ? targetDanaDarurat(pengeluaran, g.kelipatan_target) : Number(g.target),
      tenggat: g.tenggat ?? null,
      dana_darurat: !!g.is_dana_darurat
    })),
    transaksi_terakhir: recent.map((t) => ({
      waktu: t.waktu,
      arah: t.arah,
      nominal: Number(t.nominal),
      pihak: t.pihak,
      kanal: t.kanal,
      status: t.status,
      catatan: t.catatan ?? null
    }))
  };
}

export function renderSnapshot(s) {
  const n = s.nasabah;
  const r = s.rekening;
  const sumber = s.pengeluaran_bulanan_sumber === 'koreksi_nasabah' ? 'dikoreksi nasabah' : 'dihitung dari transaksi 3 bulan terakhir';
  const lines = [
    `DATA KEUANGAN NASABAH (dibekukan ${fmtWaktu(s.dibuat_pada)})`,
    `Nama nasabah: ${n.nama}`,
    `Pekerjaan: ${n.pekerjaan || 'belum diisi'}`,
    `Tanggal gajian: ${n.tanggal_gajian ? 'setiap tanggal ' + n.tanggal_gajian : 'belum diisi'}`,
    `Profil Risiko: ${n.profil_risiko || 'belum diisi'}`,
    `Rekening: Tabungan Agent Nusa berakhiran ${r.nomor_akhir}. Saldo Total: ${rp(r.saldo_total)}`,
    `Pengeluaran Bulanan: ${rp(s.pengeluaran_bulanan)} (${sumber})`,
    'Goal:'
  ];
  if (!s.goals.length) lines.push('- belum ada');
  for (const g of s.goals) {
    lines.push(
      g.dana_darurat
        ? `- Dana Darurat: target ${rp(g.target)}`
        : `- ${g.nama}: target ${rp(g.target)}${g.tenggat ? ', tenggat ' + fmtTanggal(g.tenggat) : ''}`
    );
  }
  lines.push('Transaksi terakhir:');
  if (!s.transaksi_terakhir.length) lines.push('- belum ada');
  for (const t of s.transaksi_terakhir) {
    lines.push(
      `- ${fmtWaktu(t.waktu)} | ${t.pihak} | ${t.arah} ${rp(t.nominal)} | status: ${t.status}${t.catatan ? ' (' + t.catatan + ')' : ''} | kanal: ${t.kanal}`
    );
  }
  return lines.join('\n');
}
```

- [ ] **Step 5: Jalankan test, pastikan lolos**

Run: `npx vitest run tests/snapshot.test.js`
Expected: PASS (7 test).

- [ ] **Step 6: Commit**

```bash
git add lib/snapshot.js tests/fixtures.js tests/snapshot.test.js
git commit -m "feat: add frozen financial snapshot builder and renderer"
```

---

### Task 5: `lib/sse.js`

**Files:**
- Create: `lib/sse.js`
- Test: `tests/sse.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
import { describe, expect, it } from 'vitest';
import { createSseParser } from '../lib/sse';

describe('createSseParser', () => {
  it('menyambung baris yang terpotong di antara chunk', () => {
    const p = createSseParser();
    expect(p.push('data: {"choices":[{"delta":{"content":"Hal"}}]}\n\ndata: {"choices":[{"delta":{"con')).toEqual([{ text: 'Hal' }]);
    expect(
      p.push('tent":"o"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":900,"prompt_cache_hit_tokens":768}}\n\ndata: [DONE]\n\n')
    ).toEqual([{ text: 'o' }, { usage: { prompt_tokens: 900, prompt_cache_hit_tokens: 768 } }, { done: true }]);
  });

  it('meneruskan pesan error', () => {
    expect(createSseParser().push('data: {"error":{"message":"kuota habis"}}\n')).toEqual([{ error: 'kuota habis' }]);
  });

  it('mengabaikan baris non-data dan JSON rusak', () => {
    expect(createSseParser().push(': keep-alive\ndata: {rusak\n')).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/sse.test.js`
Expected: FAIL karena `lib/sse` tidak ditemukan.

- [ ] **Step 3: Implementasi**

```js
// Parser stream SSE format OpenAI (dipakai Netra). Dipakai /api/chat (server) dan lib/api.js (browser).
// push(teks) mengembalikan daftar event: { text } | { usage } | { error } | { done }.

export function createSseParser() {
  let buf = '';
  return {
    push(chunk) {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      const events = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          events.push({ done: true });
          continue;
        }
        let j;
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        if (j.error) {
          events.push({ error: j.error.message || 'Error dari server' });
          continue;
        }
        const d = j.choices && j.choices[0] && j.choices[0].delta;
        if (d && typeof d.content === 'string' && d.content) events.push({ text: d.content });
        if (j.usage) events.push({ usage: j.usage });
      }
      return events;
    }
  };
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npx vitest run tests/sse.test.js`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add lib/sse.js tests/sse.test.js
git commit -m "feat: add shared SSE parser that also captures usage"
```

---

### Task 6: `lib/prompt.js`

**Files:**
- Create: `lib/prompt.js`
- Test: `tests/prompt.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT_VERSION, buildPromptMessages, systemPromptFor } from '../lib/prompt';
import { buildSnapshot, renderSnapshot } from '../lib/snapshot';
import { CALL_RULES } from '../lib/speech';
import { snapshotInput } from './fixtures';

const session = { system_prompt_version: SYSTEM_PROMPT_VERSION, snapshot: buildSnapshot(snapshotInput) };
const m = (id, role, content, created_at) => ({ id, role, content, created_at });
const h1 = [m(1, 'user', 'Saldo saya berapa?', '2026-11-24T07:12:00Z')];

describe('buildPromptMessages', () => {
  it('urutan: system statis, snapshot, riwayat', () => {
    const p = buildPromptMessages({ session, history: h1, mode: 'text' });
    expect(p[0]).toEqual({ role: 'system', content: systemPromptFor(SYSTEM_PROMPT_VERSION) });
    expect(p[1]).toEqual({ role: 'system', content: renderSnapshot(session.snapshot) });
    expect(p[2]).toEqual({ role: 'user', content: '[waktu: 24 Nov 2026 14:12 WIB] Saldo saya berapa?' });
    expect(p).toHaveLength(3);
  });

  it('prompt giliran berikutnya diawali prompt giliran sebelumnya persis (prefix cache)', () => {
    const p1 = buildPromptMessages({ session, history: h1, mode: 'text' });
    const h2 = [...h1, m(2, 'assistant', 'Saldo Total Anda Rp 9.500.000.', '2026-11-24T07:12:05Z'), m(3, 'user', 'Terima kasih', '2026-11-24T07:13:00Z')];
    const p2 = buildPromptMessages({ session, history: h2, mode: 'text' });
    expect(p2.slice(0, p1.length)).toEqual(p1);
    expect(p2[3]).toEqual({ role: 'assistant', content: 'Saldo Total Anda Rp 9.500.000.' });
  });

  it('snapshot dari jsonb (urutan key berbeda) menghasilkan prompt identik', () => {
    const fromDb = { ...session, snapshot: Object.fromEntries(Object.entries(session.snapshot).reverse()) };
    expect(buildPromptMessages({ session: fromDb, history: h1, mode: 'text' })).toEqual(buildPromptMessages({ session, history: h1, mode: 'text' }));
  });

  it('mode telepon menyisipkan CALL_RULES setelah snapshot', () => {
    const text = buildPromptMessages({ session, history: h1, mode: 'text' });
    const call = buildPromptMessages({ session, history: h1, mode: 'call' });
    expect(call.slice(0, 2)).toEqual(text.slice(0, 2));
    expect(call[2]).toEqual({ role: 'system', content: CALL_RULES });
    expect(call[3]).toEqual(text[2]);
  });

  it('lampiran dan pembaruan dirender sebagai pesan system', () => {
    const p = buildPromptMessages({
      session,
      history: [m(1, 'lampiran', '[Dokumen: promo.pdf]\nPromo bulan ini', '2026-11-24T07:00:00Z'), m(2, 'pembaruan', 'Gaji masuk Rp 12.500.000', '2026-11-24T07:01:00Z')],
      mode: 'text'
    });
    expect(p[2]).toEqual({ role: 'system', content: 'LAMPIRAN DARI NASABAH\n[Dokumen: promo.pdf]\nPromo bulan ini' });
    expect(p[3]).toEqual({ role: 'system', content: 'PEMBARUAN DATA\nGaji masuk Rp 12.500.000' });
  });
});

describe('systemPromptFor', () => {
  it('melempar error untuk versi yang tidak dikenal', () => {
    expect(() => systemPromptFor(999)).toThrow();
  });
  it('system prompt statis tidak berisi tanggal (agar prefix stabil)', () => {
    expect(systemPromptFor(SYSTEM_PROMPT_VERSION)).not.toMatch(/\b\d{1,2} (Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des) \d{4}\b/);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/prompt.test.js`
Expected: FAIL karena `lib/prompt` tidak ditemukan.

- [ ] **Step 3: Implementasi**

```js
// Penyusun prompt (spec bagian 7, ADR 0003). Urutan selalu:
//   1. system prompt statis berversi
//   2. Snapshot Keuangan sesi
//   3. (mode telepon) CALL_RULES
//   4. riwayat pesan sesuai urutan id, termasuk lampiran dan pembaruan
// Data yang berubah setiap permintaan TIDAK boleh masuk ke bagian 1 atau 2, karena akan menggagalkan cache DeepSeek.
// Jika teks system prompt diubah, tambahkan versi baru. Sesi lama tetap memakai versinya sendiri.

import { fmtWaktu } from './format';
import { renderSnapshot } from './snapshot';
import { CALL_RULES } from './speech';

const SYSTEM_PROMPTS = {
  1: [
    'Kamu adalah Agent Nusa, asisten virtual customer service Bank Nusa (bank fiktif untuk demo).',
    'Jawab dalam Bahasa Indonesia yang sopan dan ringkas (maksimal 4 kalimat). Tulis teks biasa, tanpa markdown, tanpa tabel.',
    'Gunakan hanya informasi dari DATA KEUANGAN NASABAH, PEMBARUAN DATA, LAMPIRAN DARI NASABAH, dan INFO LAYANAN. Jika informasi tidak ada, katakan tidak tahu dan tawarkan untuk menghubungkan ke agen manusia.',
    'DATA KEUANGAN NASABAH dibekukan saat percakapan dimulai. Jika nasabah menanyakan data terbaru, sebutkan waktu data itu dan sarankan menekan tombol "Chat baru".',
    'Setiap pesan nasabah diawali cap [waktu: ...] yang menunjukkan kapan pesan itu dikirim. Jangan menyebut cap itu kecuali relevan.',
    'Jangan pernah meminta atau menerima PIN, password, CVV, atau kode OTP di chat. Jika nasabah mengetikkannya, ingatkan agar tidak membagikannya.',
    'Untuk kartu hilang, dugaan penipuan, dana hilang, atau komplain berat, arahkan nasabah menekan tombol "Hubungi agen" di atas chat.',
    'Jangan pernah mengarang nominal: sebut angka hanya jika tertulis di data. Jangan menawarkan atau merekomendasikan produk investasi tertentu.',
    'Kamu tidak bisa melakukan transaksi nyata; jelaskan langkah-langkahnya saja.',
    'Selalu sebut tanggal dan jam data yang kamu rujuk.',
    '',
    'INFO LAYANAN',
    'Transfer BI-FAST Rp 2.500 per transaksi, limit Rp 250.000.000 per transaksi, layanan 24 jam. Transfer SKN Rp 3.500, diproses jam kerja. QRIS tanpa biaya untuk nasabah.'
  ].join('\n')
};

export const SYSTEM_PROMPT_VERSION = 1;

export function systemPromptFor(version) {
  const p = SYSTEM_PROMPTS[version];
  if (!p) throw new Error(`System prompt versi ${version} tidak dikenal.`);
  return p;
}

// Satu baris chat_messages -> satu pesan untuk model. Cap waktu memakai created_at agar hasil render ulang identik.
function renderStored(m) {
  if (m.role === 'user') return { role: 'user', content: `[waktu: ${fmtWaktu(m.created_at)}] ${m.content}` };
  if (m.role === 'assistant') return { role: 'assistant', content: m.content };
  if (m.role === 'lampiran') return { role: 'system', content: `LAMPIRAN DARI NASABAH\n${m.content}` };
  if (m.role === 'pembaruan') return { role: 'system', content: `PEMBARUAN DATA\n${m.content}` };
  throw new Error(`Role pesan tidak dikenal: ${m.role}`);
}

export function buildPromptMessages({ session, history, mode = 'text' }) {
  const out = [
    { role: 'system', content: systemPromptFor(session.system_prompt_version) },
    { role: 'system', content: renderSnapshot(session.snapshot) }
  ];
  if (mode === 'call') out.push({ role: 'system', content: CALL_RULES });
  for (const m of history) out.push(renderStored(m));
  return out;
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npx vitest run tests/prompt.test.js`
Expected: PASS (7 test).

- [ ] **Step 5: Jalankan semua test**

Run: `npm test`
Expected: PASS untuk semua file test.

- [ ] **Step 6: Commit**

```bash
git add lib/prompt.js tests/prompt.test.js
git commit -m "feat: add versioned system prompt and stable-prefix prompt builder"
```

---

### Task 7: Project Supabase dan migrasi fondasi

**Files:**
- Create: `supabase/migrations/20261124000001_fondasi.sql`

- [ ] **Step 1: Buat project Supabase (dilakukan pemilik repo)**

1. Di supabase.com, buat project baru dengan region Singapore.
2. Buka **Project Settings > API**. Salin Project URL, anon key, dan service_role key ke `.env.local`, sesuai nama di `.env.example`.
3. Buka **Authentication > Sign In / Providers > Email**, lalu matikan **Confirm email** supaya register demo langsung mendapat sesi.

- [ ] **Step 2: Tulis migrasi**

```sql
-- Tahap 1: fondasi. Lihat docs/specs/agent-keuangan.md bagian 8 dan ADR 0001, 0003, 0005.
-- Semua nominal dalam rupiah (bigint). Saldo dihitung dari buku besar (view), tidak disimpan.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nama_panggilan text,
  pekerjaan text,
  tanggal_gajian smallint check (tanggal_gajian between 1 and 31),
  pengeluaran_bulanan_koreksi bigint check (pengeluaran_bulanan_koreksi >= 0),
  profil_risiko text check (profil_risiko in ('konservatif', 'moderat', 'agresif')),
  tawaran_proaktif boolean not null default true,
  onboarding_selesai_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade, -- MVP: satu rekening per Nasabah
  nomor_akhir text not null,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  arah text not null check (arah in ('masuk', 'keluar')),
  nominal bigint not null check (nominal > 0),
  kategori text not null, -- payroll, saldo_awal, tagihan, qris, transfer, belanja, topup, ...
  pihak text not null,
  kanal text not null,
  status text not null default 'berhasil' check (status in ('berhasil', 'gagal', 'diproses')),
  catatan text,
  waktu timestamptz not null default now()
);
create index transactions_user_waktu on public.transactions (user_id, waktu desc);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nama text not null,
  target bigint check (target > 0),
  tenggat date,
  is_dana_darurat boolean not null default false,
  kelipatan_target smallint check (kelipatan_target between 1 and 24),
  created_at timestamptz not null default now(),
  -- Dana Darurat: target diturunkan dari Pengeluaran Bulanan x kelipatan. Goal biasa: target wajib diisi.
  check ((is_dana_darurat and target is null and kelipatan_target is not null) or (not is_dana_darurat and target is not null))
);
create unique index goals_satu_dana_darurat on public.goals (user_id) where is_dana_darurat;

create table public.allocation_rules (
  user_id uuid primary key references auth.users (id) on delete cascade,
  persen_dana_darurat smallint not null default 20 check (persen_dana_darurat between 0 and 100),
  persen_sosial smallint not null default 0 check (persen_sosial between 0 and 100),
  persen_investasi smallint not null default 50 check (persen_investasi between 0 and 100)
);

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot jsonb not null, -- Snapshot Keuangan, dibekukan saat sesi dibuat
  system_prompt_version integer not null,
  dimulai_oleh text not null default 'nasabah' check (dimulai_oleh in ('agent', 'nasabah')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- plan_id ditambahkan di migrasi Tahap 2 bersama tabel allocation_plans
);
create index chat_sessions_user_updated on public.chat_sessions (user_id, updated_at desc);

create table public.chat_messages (
  id bigint generated always as identity primary key, -- urutan riwayat = urutan id
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'lampiran', 'pembaruan')),
  content text not null,
  card jsonb,
  usage jsonb, -- usage dari API, termasuk prompt_cache_hit_tokens
  created_at timestamptz not null default now()
);
create index chat_messages_session on public.chat_messages (session_id, id);

-- Saldo Total dihitung dari buku besar. security_invoker: RLS tabel asal tetap berlaku.
create view public.v_saldo_total with (security_invoker = true) as
select
  a.user_id,
  a.id as account_id,
  a.nomor_akhir,
  coalesce(sum(case when t.arah = 'masuk' then t.nominal else -t.nominal end) filter (where t.status = 'berhasil'), 0)::bigint as saldo_total
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

-- RLS: Nasabah hanya membaca barisnya sendiri. Tabel uang, sesi, dan pesan hanya ditulis server (service role).
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.allocation_rules enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "baca milik sendiri" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "ubah milik sendiri" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "baca milik sendiri" on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.transactions for select to authenticated using ((select auth.uid()) = user_id);

create policy "baca milik sendiri" on public.goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "tambah goal biasa" on public.goals for insert to authenticated with check ((select auth.uid()) = user_id and not is_dana_darurat);
create policy "ubah milik sendiri" on public.goals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "hapus goal biasa" on public.goals for delete to authenticated using ((select auth.uid()) = user_id and not is_dana_darurat);

create policy "baca milik sendiri" on public.allocation_rules for select to authenticated using ((select auth.uid()) = user_id);
create policy "ubah milik sendiri" on public.allocation_rules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "baca milik sendiri" on public.chat_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.chat_messages for select to authenticated using ((select auth.uid()) = user_id);

-- Seed persona demo (mirip "Dimas"): saldo awal + 3 bulan kalender penuh + 1 transfer gagal.
-- Per bulan: Gaji Rp 12.500.000, keluar Rp 9.019.500. Saldo akhir: 13.939.000 + 3 x 3.480.500 = Rp 24.380.500.
create function public.seed_nasabah_baru(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_acc uuid;
  v_bulan timestamptz;
  i int;
begin
  insert into public.profiles (user_id) values (p_user);
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
revoke execute on function public.seed_nasabah_baru(uuid) from public, anon, authenticated;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.seed_nasabah_baru(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: Jalankan migrasi**

Buka **SQL Editor** di dashboard Supabase, tempel seluruh isi file migrasi, lalu klik **Run**.
Expected: "Success. No rows returned".

Jika memakai Supabase CLI, alternatifnya: `npx supabase link --project-ref <ref>`, lalu `npx supabase db push`.

- [ ] **Step 4: Verifikasi seed lewat user uji**

Di **Authentication > Users > Add user**, buat user `uji1@contoh.test` dengan opsi "Auto confirm user". Setelah itu jalankan di SQL Editor:

```sql
select u.email, s.nomor_akhir, s.saldo_total,
       (select count(*) from public.transactions t where t.user_id = u.id) as jumlah_tx,
       (select count(*) from public.goals g where g.user_id = u.id and g.is_dana_darurat) as dana_darurat
from auth.users u join public.v_saldo_total s on s.user_id = u.id
where u.email = 'uji1@contoh.test';
```

Expected: `saldo_total = 24380500`, `jumlah_tx = 35` (1 saldo awal + 33 + 1 gagal), `dana_darurat = 1`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261124000001_fondasi.sql
git commit -m "feat(db): add foundation schema, RLS, saldo view and demo seed"
```

---

### Task 8: Klien Supabase dan middleware

**Files:**
- Create: `lib/supabase/browser.js`
- Create: `lib/supabase/server.js`
- Create: `lib/supabase/admin.js`
- Create: `lib/server/http.js`
- Create: `middleware.js`

- [ ] **Step 1: `lib/supabase/browser.js`**

```js
import { createBrowserClient } from '@supabase/ssr';

// Klien untuk komponen 'use client'. Sesi login disimpan di cookie, jadi server ikut membacanya.
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
```

- [ ] **Step 2: `lib/supabase/server.js`**

```js
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Klien server yang bertindak sebagai Nasabah yang sedang login (RLS berlaku).
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Dipanggil dari Server Component: cookie tidak bisa ditulis di sini. middleware.js yang me-refresh sesi.
        }
      }
    }
  });
}

// Mengembalikan { supabase, user }. user null bila belum login.
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return { supabase, user };
}
```

- [ ] **Step 3: `lib/supabase/admin.js`**

```js
import { createClient } from '@supabase/supabase-js';

// Klien service role: MELEWATI RLS. Hanya untuk route handler di server, setelah user diverifikasi lewat getUser().
// Jangan pernah mengimpor file ini dari komponen 'use client'.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diatur.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
```

- [ ] **Step 4: `lib/server/http.js`**

```js
export function fail(status, message) {
  return Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
```

- [ ] **Step 5: `middleware.js` (di root repo)**

```js
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Me-refresh token login di setiap permintaan (wajib untuk @supabase/ssr) dan
// mengarahkan halaman yang butuh login ke /login.
export async function middleware(request) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && (path.startsWith('/chat') || path.startsWith('/onboarding'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  if (user && (path === '/login' || path === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/chat';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/chat/:path*', '/onboarding/:path*', '/login', '/register', '/api/:path*']
};
```

- [ ] **Step 6: Pastikan build berhasil**

Run: `npm run build`
Expected: build sukses. Halaman lama masih memakai kode lama, dan itu normal.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase lib/server/http.js middleware.js
git commit -m "feat(auth): add supabase clients and session middleware"
```

---

### Task 9: Halaman login dan register

**Files:**
- Create: `app/auth.css`
- Create: `app/login/page.jsx`
- Create: `app/register/page.jsx`

- [ ] **Step 1: `app/auth.css`**

```css
.auth-page{align-items:center;justify-content:center;overflow-y:auto;padding:24px 16px}
.auth-card{position:relative;width:100%;max-width:440px;padding:28px}
.auth-card h1{margin:0 0 6px;font-size:24px;font-weight:800;letter-spacing:-.01em}
.auth-card p.lead{margin:0 0 20px;font-size:13.5px;line-height:1.55;color:var(--txt2)}
.auth-card .btn{width:100%}
.auth-alt{margin-top:16px;font-size:13.5px;color:var(--txt2);text-align:center}
.auth-alt a{color:#fff;font-weight:700}
.auth-err{min-height:20px;margin:0 0 12px;font-size:13.5px;color:var(--bad)}
.auth-steps{display:flex;gap:6px;margin:0 0 18px;padding:0;list-style:none}
.auth-steps li{flex:1;height:6px;border-radius:6px;background:rgba(255,255,255,.2)}
.auth-steps li.on{background:var(--sky-200)}
.auth-row{display:flex;gap:10px}
.auth-row .btn{flex:1}
```

- [ ] **Step 2: `app/login/page.jsx`**

```jsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/browser';
import '../auth.css';

// Hanya path internal yang boleh dipakai sebagai tujuan setelah login.
// Hanya path di situs ini yang boleh dipakai sebagai tujuan setelah login.
const safeNext = (v) => {
  if (!v) return '/chat';
  try {
    const u = new URL(v, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : '/chat';
  } catch {
    return '/chat';
  }
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setErr(error.message === 'Invalid login credentials' ? 'Email atau password salah.' : error.message);
      setBusy(false);
      return;
    }
    window.location.href = safeNext(new URLSearchParams(window.location.search).get('next'));
  };

  return (
    <div className="app auth-page">
      <div className="bg" aria-hidden="true"><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /></div>
      <main className="glass auth-card">
        <h1>Masuk</h1>
        <p className="lead">Masuk ke Agent Nusa untuk melihat rekening demo dan ngobrol dengan agent.</p>
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email"><span>Email</span></label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password"><span>Password</span></label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <p className="auth-err" role="alert">{err}</p>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
        </form>
        <p className="auth-alt">Belum punya akun? <Link href="/register">Daftar</Link></p>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: `app/register/page.jsx`**

```jsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/browser';
import '../auth.css';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    if (password.length < 8) {
      setErr('Password minimal 8 karakter.');
      return;
    }
    setBusy(true);
    const { data, error } = await createClient().auth.signUp({ email: email.trim(), password });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    if (!data.session) {
      // Konfirmasi email masih aktif di project Supabase.
      setInfo('Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.');
      setBusy(false);
      return;
    }
    window.location.href = '/onboarding';
  };

  return (
    <div className="app auth-page">
      <div className="bg" aria-hidden="true"><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /></div>
      <main className="glass auth-card">
        <h1>Daftar</h1>
        <p className="lead">Akun baru langsung mendapat rekening demo berisi saldo dan riwayat 3 bulan. Semua data fiktif.</p>
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email"><span>Email</span></label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password"><span>Password</span></label>
            <input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <small>Minimal 8 karakter.</small>
          </div>
          <p className="auth-err" role="alert">{err}</p>
          {info && <p className="lead" role="status">{info}</p>}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Memproses…' : 'Daftar'}</button>
        </form>
        <p className="auth-alt">Sudah punya akun? <Link href="/login">Masuk</Link></p>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Uji manual**

Run: `npm run dev`, lalu buka http://localhost:3000/register.
Expected:
- Register dengan email baru berpindah ke `/onboarding`. Halamannya masih 404 sampai Task 10, dan itu normal.
- Di Supabase, tabel `transactions` sekarang berisi 35 baris untuk user tersebut.
- Membuka `/login` saat sudah login langsung diarahkan ke `/chat`.

- [ ] **Step 5: Commit**

```bash
git add app/auth.css app/login app/register
git commit -m "feat(auth): add login and register pages"
```

---

### Task 10: Onboarding dan penjaga `/chat`

**Files:**
- Create: `app/onboarding/page.jsx`
- Modify: `app/chat/layout.jsx`

- [ ] **Step 1: `app/onboarding/page.jsx`**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabase/browser';
import { pengeluaranBulananOtomatis } from '../../lib/keuangan';
import { rp } from '../../lib/format';
import '../auth.css';

const LANGKAH = ['Profil', 'Pengeluaran Bulanan', 'Profil Risiko', 'Goal pertama'];
const angka = (v) => Number(String(v).replace(/\D/g, ''));

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [profil, setProfil] = useState({ nama_panggilan: '', pekerjaan: '', tanggal_gajian: '25' });
  const [otomatis, setOtomatis] = useState(null);
  const [pengeluaran, setPengeluaran] = useState('');
  const [goal, setGoal] = useState({ nama: '', target: '', tenggat: '' });

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [{ data: p }, { data: tx }] = await Promise.all([
        supabase.from('profiles').select('nama_panggilan, pekerjaan, tanggal_gajian, pengeluaran_bulanan_koreksi').maybeSingle(),
        supabase.from('transactions').select('waktu, arah, nominal, status')
      ]);
      const auto = pengeluaranBulananOtomatis(tx || [], new Date());
      setOtomatis(auto);
      if (p) setProfil({ nama_panggilan: p.nama_panggilan || '', pekerjaan: p.pekerjaan || '', tanggal_gajian: String(p.tanggal_gajian || 25) });
      setPengeluaran(String(p && p.pengeluaran_bulanan_koreksi !== null ? p.pengeluaran_bulanan_koreksi : auto));
    })();
  }, []);

  // Menjalankan fn(supabase, userId). Error Supabase dilempar lewat cek().
  const simpan = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi login berakhir. Silakan masuk lagi.');
      await fn(supabase, user.id);
      return true;
    } catch (e) {
      setErr((e && e.message) || 'Gagal menyimpan.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const cek = ({ error }) => {
    if (error) throw new Error(error.message);
  };

  const lanjutProfil = async (e) => {
    e.preventDefault();
    const nama = profil.nama_panggilan.trim();
    const tgl = Number(profil.tanggal_gajian);
    if (!nama) return setErr('Nama panggilan wajib diisi.');
    if (!Number.isInteger(tgl) || tgl < 1 || tgl > 31) return setErr('Tanggal gajian harus angka 1 sampai 31.');
    const ok = await simpan(async (s, uid) =>
      cek(await s.from('profiles').update({ nama_panggilan: nama, pekerjaan: profil.pekerjaan.trim() || null, tanggal_gajian: tgl }).eq('user_id', uid))
    );
    if (ok) setStep(1);
  };

  const lanjutPengeluaran = async (e) => {
    e.preventDefault();
    if (!String(pengeluaran).trim()) return setErr('Isi Pengeluaran Bulanan dengan angka rupiah.');
    const n = angka(pengeluaran);
    const koreksi = n === otomatis ? null : n; // sama dengan hitungan otomatis: jangan disimpan sebagai koreksi
    const ok = await simpan(async (s, uid) => cek(await s.from('profiles').update({ pengeluaran_bulanan_koreksi: koreksi }).eq('user_id', uid)));
    if (ok) setStep(2);
  };

  const selesai = async (denganGoal) => {
    const nama = goal.nama.trim();
    const target = angka(goal.target);
    if (denganGoal && (!nama || !target)) return setErr('Isi nama dan target Goal, atau pilih Lewati.');
    const ok = await simpan(async (s, uid) => {
      if (denganGoal) cek(await s.from('goals').insert({ user_id: uid, nama, target, tenggat: goal.tenggat || null }));
      cek(await s.from('profiles').update({ onboarding_selesai_at: new Date().toISOString() }).eq('user_id', uid));
    });
    if (ok) window.location.href = '/chat';
  };

  return (
    <div className="app auth-page">
      <div className="bg" aria-hidden="true"><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /></div>
      <main className="glass auth-card">
        <ol className="auth-steps" aria-label={`Langkah ${step + 1} dari ${LANGKAH.length}: ${LANGKAH[step]}`}>
          {LANGKAH.map((l, i) => <li key={l} className={i <= step ? 'on' : ''} />)}
        </ol>

        {step === 0 && (
          <form onSubmit={lanjutProfil} noValidate>
            <h1>Kenalan dulu</h1>
            <p className="lead">Agent memakai data ini untuk menyapa Anda dan mengenali jadwal gajian.</p>
            <div className="field">
              <label htmlFor="nama"><span>Nama panggilan</span></label>
              <input id="nama" value={profil.nama_panggilan} onChange={(e) => setProfil({ ...profil, nama_panggilan: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="kerja"><span>Pekerjaan (opsional)</span></label>
              <input id="kerja" value={profil.pekerjaan} onChange={(e) => setProfil({ ...profil, pekerjaan: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="tgl"><span>Tanggal gajian</span></label>
              <input id="tgl" type="number" min="1" max="31" value={profil.tanggal_gajian} onChange={(e) => setProfil({ ...profil, tanggal_gajian: e.target.value })} />
            </div>
            <p className="auth-err" role="alert">{err}</p>
            <button type="submit" className="btn primary" disabled={busy}>Lanjut</button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={lanjutPengeluaran} noValidate>
            <h1>Pengeluaran Bulanan</h1>
            <p className="lead">
              {otomatis === null
                ? 'Menghitung dari transaksi Anda…'
                : `Dari transaksi 3 bulan terakhir, rata-rata pengeluaran Anda ${rp(otomatis)} per bulan. Ubah jika kurang tepat.`}
            </p>
            <div className="field">
              <label htmlFor="keluar"><span>Pengeluaran per bulan (rupiah)</span></label>
              <input id="keluar" inputMode="numeric" value={pengeluaran} onChange={(e) => setPengeluaran(e.target.value)} />
            </div>
            <p className="auth-err" role="alert">{err}</p>
            <button type="submit" className="btn primary" disabled={busy || otomatis === null}>Lanjut</button>
          </form>
        )}

        {step === 2 && (
          <div>
            <h1>Profil Risiko</h1>
            <p className="lead">Kuesioner profil risiko akan tersedia segera. Untuk sekarang, langkah ini dilewati.</p>
            <button type="button" className="btn primary" onClick={() => setStep(3)}>Lanjut</button>
          </div>
        )}

        {step === 3 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              selesai(true);
            }}
            noValidate
          >
            <h1>Goal pertama</h1>
            <p className="lead">Misalnya liburan, laptop baru, atau DP rumah. Dana Darurat sudah dibuatkan otomatis.</p>
            <div className="field">
              <label htmlFor="gnama"><span>Nama Goal</span></label>
              <input id="gnama" value={goal.nama} onChange={(e) => setGoal({ ...goal, nama: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="gtarget"><span>Target (rupiah)</span></label>
              <input id="gtarget" inputMode="numeric" value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="gtenggat"><span>Tenggat (opsional)</span></label>
              <input id="gtenggat" type="date" value={goal.tenggat} onChange={(e) => setGoal({ ...goal, tenggat: e.target.value })} />
            </div>
            <p className="auth-err" role="alert">{err}</p>
            <div className="auth-row">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => selesai(false)}>Lewati</button>
              <button type="submit" className="btn primary" disabled={busy}>Simpan &amp; mulai</button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Ganti isi `app/chat/layout.jsx`**

```jsx
import { redirect } from 'next/navigation';
import { getUser } from '../../lib/supabase/server';

export const metadata = {
  title: 'Chat Bantuan · Agent Nusa',
  description: 'Ngobrol dengan Agent Nusa, asisten virtual Agent Nusa.'
};

// /chat wajib login dan onboarding selesai (spec 5.1, keputusan Q26).
export default async function ChatLayout({ children }) {
  const { supabase, user } = await getUser();
  if (!user) redirect('/login?next=/chat');
  const { data: profile } = await supabase.from('profiles').select('onboarding_selesai_at').maybeSingle();
  if (!profile || !profile.onboarding_selesai_at) redirect('/onboarding');
  return children;
}
```

- [ ] **Step 3: Uji manual**

Run: `npm run dev`. Register akun baru, lalu jalani semua langkah onboarding.
Expected:
- Langkah 2 menampilkan `Rp 9.019.500`.
- Setelah selesai, Anda masuk ke `/chat`.
- Di Supabase, `profiles.onboarding_selesai_at` sudah terisi.
- Membuka `/chat` dengan akun yang belum selesai onboarding mengarahkan ke `/onboarding`.

- [ ] **Step 4: Commit**

```bash
git add app/onboarding app/chat/layout.jsx
git commit -m "feat: add onboarding wizard and gate /chat behind it"
```

---

### Task 11: API Sesi Percakapan dan lampiran

**Files:**
- Create: `lib/server/sesi.js`
- Create: `app/api/sessions/route.js`
- Create: `app/api/sessions/[id]/route.js`
- Create: `app/api/sessions/[id]/lampiran/route.js`

- [ ] **Step 1: `lib/server/sesi.js`**

```js
import { SYSTEM_PROMPT_VERSION } from '../prompt';
import { buildSnapshot } from '../snapshot';

// Membekukan Snapshot Keuangan saat ini lalu membuat Sesi Percakapan baru (ADR 0003).
// admin: klien service role. userId harus berasal dari getUser(), bukan dari input browser.
export async function buatSesi(admin, userId, { dimulaiOleh = 'nasabah', now = new Date() } = {}) {
  const [p, a, t, g] = await Promise.all([
    admin.from('profiles').select('nama_panggilan, pekerjaan, tanggal_gajian, profil_risiko, pengeluaran_bulanan_koreksi').eq('user_id', userId).single(),
    admin.from('accounts').select('nomor_akhir').eq('user_id', userId).single(),
    admin.from('transactions').select('waktu, arah, nominal, pihak, kanal, status, catatan').eq('user_id', userId),
    admin.from('goals').select('nama, target, tenggat, is_dana_darurat, kelipatan_target, created_at').eq('user_id', userId)
  ]);
  const failed = [p, a, t, g].find((r) => r.error);
  if (failed) throw new Error(failed.error.message);

  const snapshot = buildSnapshot({ profile: p.data, account: a.data, transactions: t.data, goals: g.data, now });
  const { data, error } = await admin
    .from('chat_sessions')
    .insert({ user_id: userId, snapshot, system_prompt_version: SYSTEM_PROMPT_VERSION, dimulai_oleh: dimulaiOleh })
    .select('id, created_at, updated_at, dimulai_oleh')
    .single();
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 2: `app/api/sessions/route.js`**

```js
import { getUser } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { buatSesi } from '../../../lib/server/sesi';
import { fail } from '../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daftar Sesi Percakapan milik Nasabah (dibaca lewat RLS).
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, created_at, updated_at, dimulai_oleh')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) return fail(500, error.message);
  return Response.json({ sessions: data });
}

// Sesi baru yang dimulai Nasabah, dengan snapshot dibekukan saat ini.
export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  try {
    const session = await buatSesi(createAdminClient(), user.id);
    return Response.json({ session });
  } catch (e) {
    return fail(500, (e && e.message) || 'Gagal membuat percakapan.');
  }
}
```

- [ ] **Step 3: `app/api/sessions/[id]/route.js`**

```js
import { getUser } from '../../../../lib/supabase/server';
import { fail } from '../../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Riwayat pesan satu sesi. RLS memastikan Nasabah hanya bisa membaca sesinya sendiri.
export async function GET(_req, { params }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const { data: session } = await supabase.from('chat_sessions').select('id').eq('id', id).maybeSingle();
  if (!session) return fail(404, 'Percakapan tidak ditemukan.');
  const { data, error } = await supabase.from('chat_messages').select('id, role, content, created_at').eq('session_id', id).order('id');
  if (error) return fail(500, error.message);
  return Response.json({ messages: data });
}
```

- [ ] **Step 4: `app/api/sessions/[id]/lampiran/route.js`**

```js
import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { MAX_CONTEXT } from '../../../../../lib/data';
import { fail } from '../../../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Menempel lampiran (isi PDF atau catatan teks) ke akhir sesi. Lampiran tidak bisa dilepas,
// karena melepasnya akan mengubah prefix prompt (ADR 0003).
export async function POST(req, { params }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');

  let nama = '';
  let teks = '';
  try {
    const j = await req.json();
    nama = String((j && j.nama) || '').trim().slice(0, 200);
    teks = String((j && j.teks) || '').trim();
  } catch {
    return fail(400, 'Body harus berupa JSON.');
  }
  if (!nama || !teks) return fail(400, 'Nama dan isi lampiran wajib diisi.');

  const { data: session } = await supabase.from('chat_sessions').select('id').eq('id', id).maybeSingle();
  if (!session) return fail(404, 'Percakapan tidak ditemukan.');

  const content = `[Dokumen: ${nama}]\n${teks.length > MAX_CONTEXT ? teks.slice(0, MAX_CONTEXT) + '\n[...dipotong karena terlalu panjang]' : teks}`;
  const { error } = await createAdminClient().from('chat_messages').insert({ session_id: id, user_id: user.id, role: 'lampiran', content });
  if (error) return fail(500, error.message);
  return Response.json({ ok: true });
}
```

- [ ] **Step 5: Pastikan build berhasil**

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 6: Commit**

```bash
git add lib/server/sesi.js app/api/sessions
git commit -m "feat(api): add chat session and attachment endpoints"
```

---

### Task 12: Tulis ulang `/api/chat`

**Files:**
- Modify: `app/api/chat/route.js` (ganti seluruh isinya)

- [ ] **Step 1: Ganti seluruh isi file**

Jika Task 0 menunjukkan Netra menolak `stream_options`, hapus properti `stream_options` di bawah ini.

```js
// POST /api/chat { session_id, message, mode: 'text' | 'call' }
// Server menyusun prompt dari DB (lib/prompt.js), meneruskan stream Netra ke browser,
// lalu menyimpan pesan Nasabah, balasan agent, dan usage (termasuk cache hit) ke chat_messages.
// API key Netra hanya ada di env server.

import { getUser } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { buildPromptMessages } from '../../../lib/prompt';
import { createSseParser } from '../../../lib/sse';
import { fail } from '../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = (process.env.NETRA_BASE_URL || 'https://api.netraruntime.com/v1').replace(/\/+$/, '');
const MODEL = process.env.NETRA_MODEL || 'deepseek/deepseek-v4.1-flash';
const MAX_MESSAGE = 2000;
// Riwayat tidak dipotong (memotong dari depan merusak prefix cache). Sesi yang terlalu panjang ditolak.
const MAX_PROMPT_CHARS = 400000;

export async function POST(req) {
  const key = process.env.NETRA_API_KEY;
  if (!key) return fail(500, 'NETRA_API_KEY belum diatur di server.');
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');

  let sessionId = '';
  let message = '';
  let mode = 'text';
  try {
    const j = await req.json();
    sessionId = String((j && j.session_id) || '');
    message = String((j && j.message) || '').trim();
    mode = j && j.mode === 'call' ? 'call' : 'text';
  } catch {
    return fail(400, 'Body harus berupa JSON.');
  }
  if (!sessionId) return fail(400, 'session_id wajib diisi.');
  if (!message) return fail(400, 'Pesan kosong.');
  if (message.length > MAX_MESSAGE) return fail(413, `Pesan maksimal ${MAX_MESSAGE} karakter.`);

  const admin = createAdminClient();
  const { data: session } = await admin.from('chat_sessions').select('id, user_id, snapshot, system_prompt_version').eq('id', sessionId).maybeSingle();
  if (!session || session.user_id !== user.id) return fail(404, 'Percakapan tidak ditemukan.');

  const { data: userMsg, error: insErr } = await admin
    .from('chat_messages')
    .insert({ session_id: sessionId, user_id: user.id, role: 'user', content: message })
    .select('id')
    .single();
  if (insErr) return fail(500, insErr.message);
  const dropUserMsg = () => admin.from('chat_messages').delete().eq('id', userMsg.id);

  const { data: history, error: histErr } = await admin.from('chat_messages').select('id, role, content, created_at').eq('session_id', sessionId).order('id');
  if (histErr) {
    await dropUserMsg();
    return fail(500, histErr.message);
  }

  const messages = buildPromptMessages({ session, history, mode });
  if (messages.reduce((n, m) => n + m.content.length, 0) > MAX_PROMPT_CHARS) {
    await dropUserMsg();
    return fail(413, 'Percakapan ini sudah terlalu panjang. Tekan "Chat baru" untuk melanjutkan.');
  }

  let upstream;
  try {
    upstream = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      signal: req.signal,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'X-Netra-Agent': 'agent-nusa-cs' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 600,
        temperature: 0.3,
        reasoning: { enabled: false },
        stream: true,
        stream_options: { include_usage: true }
      })
    });
  } catch {
    await dropUserMsg();
    if (req.signal && req.signal.aborted) return new Response(null, { status: 499 });
    return fail(502, 'Server tidak bisa menjangkau API Netra.');
  }

  if (!upstream.ok || !upstream.body) {
    await dropUserMsg();
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' } });
  }

  // Teruskan stream ke browser apa adanya, sambil mengumpulkan teks dan usage untuk disimpan.
  const parser = createSseParser();
  const dec = new TextDecoder();
  let text = '';
  let usage = null;
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          for (const ev of parser.push(dec.decode(value, { stream: true }))) {
            if (ev.text) text += ev.text;
            if (ev.usage) usage = ev.usage;
          }
        }
      } catch {
        // Browser menekan "hentikan" atau koneksi putus: simpan teks yang sudah diterima.
      } finally {
        if (text.trim()) {
          // Disimpan apa adanya (tanpa trim): prefix permintaan berikutnya harus sama dengan output model.
          await admin.from('chat_messages').insert({ session_id: sessionId, user_id: user.id, role: 'assistant', content: text, usage });
          await admin.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
        } else {
          await dropUserMsg();
        }
        try {
          controller.close();
        } catch {
          /* stream sudah ditutup */
        }
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' }
  });
}
```

- [ ] **Step 2: Pastikan build berhasil**

Run: `npm run build`
Expected: build sukses. `app/chat/page.jsx` masih memanggil API dengan format lama dan baru diperbaiki di Task 13. Ini tidak merusak build karena kontraknya hanya runtime.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.js
git commit -m "feat(api): build prompt server-side and persist replies with cache usage"
```

---

### Task 13: Klien browser (`lib/api.js`, `lib/data.js`, `app/chat/page.jsx`)

**Files:**
- Modify: `lib/api.js` (ganti seluruh isinya)
- Modify: `lib/data.js` (ganti seluruh isinya)
- Modify: `app/chat/page.jsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Ganti seluruh isi `lib/api.js`**

```js
// Klien browser untuk endpoint server. Key Netra tidak lagi ada di browser.
import { createSseParser } from './sse';

function friendlyError(status, msg) {
  const base = `Error ${status}${msg ? ': ' + msg : ''}`;
  if (status === 401) return 'Sesi login Anda berakhir. Muat ulang halaman lalu masuk lagi.';
  if (status === 402) return base + '. Kredit Netra tidak cukup.';
  if (status === 429) return base + '. Terlalu banyak permintaan, coba lagi sebentar.';
  if (status === 504) return base + '. Server terlalu lama menunggu jawaban. Coba lagi.';
  return base;
}

async function request(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet Anda.');
  }
  if (!res.ok) {
    let msg = '';
    try {
      const j = await res.json();
      msg = (j.error && (j.error.message || j.error)) || j.message || '';
      if (typeof msg !== 'string') msg = JSON.stringify(msg);
    } catch {
      /* bukan JSON */
    }
    throw new Error(friendlyError(res.status, msg));
  }
  return res;
}

const postJson = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function listSessions() {
  return (await (await request('/api/sessions')).json()).sessions;
}

export async function createSession() {
  return (await (await request('/api/sessions', { method: 'POST' })).json()).session;
}

export async function getSessionMessages(id) {
  return (await (await request(`/api/sessions/${encodeURIComponent(id)}`)).json()).messages;
}

export async function addAttachment(id, nama, teks) {
  await request(`/api/sessions/${encodeURIComponent(id)}/lampiran`, postJson({ nama, teks }));
}

// Mengirim satu pesan ke sesi. onDelta menerima potongan teks jawaban.
export async function callChat(sessionId, message, { mode = 'text', signal } = {}, onDelta) {
  const res = await request('/api/chat', { ...postJson({ session_id: sessionId, message, mode }), signal });
  const parser = createSseParser();
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const ev of parser.push(dec.decode(value, { stream: true }))) {
      if (ev.error) throw new Error(ev.error);
      if (ev.done) return full;
      if (ev.text) {
        full += ev.text;
        onDelta(ev.text);
      }
    }
  }
  return full;
}
```

- [ ] **Step 2: Ganti seluruh isi `lib/data.js`**

```js
export { rp } from './format';

// Pengaturan yang masih disimpan di browser: key Deepgram (suara) dan draf catatan lampiran.
export const DEFAULTS = {
  deepgramKey: '',
  contextText: ''
};

// Batas panjang satu lampiran (catatan teks atau isi PDF). Lebih dari ini, bagian akhirnya dipotong server.
export const MAX_CONTEXT = 60000;

export function normalizeSettings(d) {
  return {
    deepgramKey: String(d.deepgramKey || '').trim(),
    contextText: String(d.contextText || '').trim()
  };
}

export const CHIPS = [
  ['Cek status transfer', 'Transfer saya ke Rina kemarin belum masuk, tolong dicek.'],
  ['Blokir kartu', 'Kartu debit saya hilang, tolong bantu blokir.'],
  ['Pengeluaran saya', 'Berapa rata-rata pengeluaran bulanan saya dan untuk apa saja?'],
  ['Biaya transfer', 'Berapa biaya dan limit transfer BI-FAST?']
];
```

- [ ] **Step 3: Ubah `app/chat/page.jsx`, bagian import dan konstanta**

Ganti:

```js
import { CHIPS, DEFAULTS, MAX_CONTEXT, TXS, buildContext, contextForPrompt, demoContext, normalizeSettings, rp } from '../../lib/data';
import { callChat } from '../../lib/api';
```

dengan:

```js
import { CHIPS, DEFAULTS, MAX_CONTEXT, normalizeSettings, rp } from '../../lib/data';
import { addAttachment, callChat, createSession, getSessionMessages, listSessions } from '../../lib/api';
import { fmtWaktu } from '../../lib/format';
import { createClient } from '../../lib/supabase/browser';
```

Di blok import `../../lib/speech`, hapus baris `  CALL_RULES,`.

Ganti:

```js
const LS_SETTINGS = 'nusa.settings.v1';
const LS_CHAT = 'nusa.chat.v1';
const LS_DOCS = 'nusa.docs.v1';
```

dengan:

```js
const LS_SETTINGS = 'nusa.settings.v2'; // hanya key Deepgram; key Netra sekarang di server
const LS_OLD = ['nusa.settings.v1', 'nusa.chat.v1', 'nusa.docs.v1']; // data versi lama, dihapus saat halaman dibuka
const LS_SESSION = 'nusa.session.v1'; // id Sesi Percakapan terakhir yang dibuka
```

Hapus baris `const sendable = (m) => !m.err && !m.skip && !m.pending && m.content;`.

Ganti:

```js
const buildSystemPrompt = (s, documents) => {
  const extra = contextForPrompt(s.contextText, documents);
  return s.systemPrompt + '\n\n' + demoContext() + (extra ? '\n\n' + extra : '');
};
```

dengan:

```js
// Pesan dari database -> gelembung chat. Lampiran tidak ditampilkan sebagai gelembung.
const toChat = (rows) => rows.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ id: 'db' + m.id, role: m.role, content: m.content }));
// Nama file dari isi lampiran "[Dokumen: nama]\n...".
const lampiranName = (content) => content.split('\n')[0].replace(/^\[Dokumen: /, '').replace(/\]$/, '');
// Transaksi dari database -> baris panel riwayat.
const toTxRow = (t) => ({
  id: t.id,
  ini: t.pihak.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
  name: t.pihak,
  waktu: fmtWaktu(t.waktu),
  channel: t.kanal,
  amt: Number(t.nominal),
  dir: t.arah === 'masuk' ? 'in' : 'out',
  st: t.status === 'berhasil' ? 'ok' : t.status === 'gagal' ? 'fail' : 'wait',
  status: t.status === 'berhasil' ? 'Berhasil' : t.status === 'gagal' ? 'Gagal' : 'Diproses'
});
```

- [ ] **Step 4: Ubah `app/chat/page.jsx`, bagian state dan ref**

Hapus baris `  const [showKey, setShowKey] = useState(false);`.

Ganti `  const [test, setTest] = useState({ text: '', ok: null, running: false });` dengan:

```js
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]); // { id, created_at, updated_at, dimulai_oleh }
  const [account, setAccount] = useState(null); // { nomor_akhir, saldo_total, nama }
  const [txRows, setTxRows] = useState([]);
```

Ganti `  const [documents, setDocuments] = useState([]); // { id, name, pages, text }` dengan:

```js
  const [documents, setDocuments] = useState([]); // lampiran sesi ini: { id, name, chars }
```

Ganti `  const documentsRef = useRef([]);` dengan `  const sessionRef = useRef(null);`.
Ganti `  documentsRef.current = documents;` dengan `  sessionRef.current = sessionId;`.

- [ ] **Step 5: Ubah `app/chat/page.jsx`, bagian efek muat dan simpan**

Di efek pertama (`/* ---------- muat & simpan ---------- */`), ganti semua baris dari `    const s = { ...DEFAULTS, ...readLS(LS_SETTINGS, {}) };` sampai `    setReady(true);` dengan:

```js
    const old = readLS('nusa.settings.v1', {});
    const s = { ...DEFAULTS, ...(old.deepgramKey ? { deepgramKey: old.deepgramKey } : {}), ...readLS(LS_SETTINGS, {}) };
    LS_OLD.forEach((k) => {
      try {
        localStorage.removeItem(k); // termasuk key Netra lama yang dulu disimpan di browser
      } catch {
        /* penyimpanan diblokir */
      }
    });
    setSettings(s);
    setDraft(s);
    loadFinance().catch(() => toast('Data rekening gagal dimuat.'));
    (async () => {
      try {
        const list = await listSessions();
        setSessions(list);
        const last = readLS(LS_SESSION, null);
        const pick = list.find((x) => x.id === last) || list[0];
        if (pick) await openSession(pick.id);
        else await startNewSession();
      } catch (e) {
        toast((e && e.message) || 'Percakapan gagal dimuat.');
      } finally {
        setReady(true);
      }
    })();
```

Hapus kedua efek ini:

```js
  useEffect(() => {
    if (ready && !busy && callStatus === 'off') writeLS(LS_CHAT, chat.filter(sendable).map(({ role, content }) => ({ role, content })));
  }, [ready, busy, callStatus, chat]);

  useEffect(() => {
    if (ready) writeLS(LS_DOCS, documents.map(({ name, pages, text }) => ({ name, pages, text })));
  }, [ready, documents]);
```

Ganti:

```js
  useEffect(() => {
    clearTimeout(poseTimer.current);
    setPose(settings.apiKey ? 'ask' : 'alert');
  }, [settings.apiKey]);
```

dengan:

```js
  useEffect(() => {
    clearTimeout(poseTimer.current);
    setPose(sessionId ? 'ask' : 'alert');
  }, [sessionId]);
```

Ganti `  }, [chat, view, settings.apiKey]);` dengan `  }, [chat, view, sessionId]);`.

Di `showPose`, ganti `setPose(settingsRef.current.apiKey ? 'ask' : 'alert')` dengan `setPose(sessionRef.current ? 'ask' : 'alert')`.

- [ ] **Step 6: Ubah `app/chat/page.jsx`, tambah fungsi data DB setelah fungsi `go`**

Sisipkan blok ini tepat setelah penutup fungsi `const go = (v) => { ... };`:

```js
  /* ---------- data dari database ---------- */
  const loadFinance = async () => {
    const supabase = createClient();
    const [{ data: saldo }, { data: tx }, { data: profile }] = await Promise.all([
      supabase.from('v_saldo_total').select('nomor_akhir, saldo_total').maybeSingle(),
      supabase.from('transactions').select('id, arah, nominal, pihak, kanal, status, waktu').order('waktu', { ascending: false }).limit(30),
      supabase.from('profiles').select('nama_panggilan').maybeSingle()
    ]);
    if (saldo) setAccount({ ...saldo, nama: (profile && profile.nama_panggilan) || 'Nasabah' });
    setTxRows((tx || []).map(toTxRow));
  };

  const openSession = async (id) => {
    const rows = await getSessionMessages(id);
    setSessionId(id);
    writeLS(LS_SESSION, id);
    setChat(toChat(rows));
    setDocuments(rows.filter((m) => m.role === 'lampiran').map((m) => ({ id: 'db' + m.id, name: lampiranName(m.content), chars: m.content.length })));
  };

  const startNewSession = async () => {
    const created = await createSession();
    setSessions((list) => [created, ...list]);
    setSessionId(created.id);
    writeLS(LS_SESSION, created.id);
    setChat([]);
    setDocuments([]);
  };

  const logout = async () => {
    await createClient().auth.signOut();
    try {
      localStorage.removeItem(LS_SESSION);
    } catch {
      /* penyimpanan diblokir */
    }
    window.location.href = '/login';
  };
```

- [ ] **Step 7: Ubah `app/chat/page.jsx`, fungsi `send`**

Ganti:

```js
    const s = settingsRef.current;
    if (!s.apiKey) {
      toast('Isi API key dulu di Pengaturan AI.');
      go('settings');
      return;
    }
    go('chat');

    const uid = newId();
    const aid = newId();
    const history = [...chatRef.current.filter(sendable), { role: 'user', content: text }]
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));
    const messages = [{ role: 'system', content: buildSystemPrompt(s, documentsRef.current) }, ...history];
```

dengan:

```js
    const sid = sessionRef.current;
    if (!sid) {
      toast('Percakapan belum siap, coba lagi sebentar.');
      return;
    }
    go('chat');

    const uid = newId();
    const aid = newId();
```

Ganti:

```js
      await callChat(
        s,
        messages,
        { maxTokens: Number(s.maxTokens) || 600, stream: !!s.stream, signal: ac.signal },
```

dengan:

```js
      await callChat(
        sid,
        text,
        { mode: 'text', signal: ac.signal },
```

Ganti `      if (!got.trim()) throw new Error('Model mengembalikan jawaban kosong. Coba naikkan Max tokens atau matikan Reasoning.');` dengan:

```js
      if (!got.trim()) throw new Error('Model mengembalikan jawaban kosong. Coba kirim ulang pertanyaan Anda.');
```

- [ ] **Step 8: Ubah `app/chat/page.jsx`, pengecekan sebelum rekam suara dan telepon**

Blok berikut muncul dua kali (di `startDictation` dan `startCall`). Ganti keduanya (Edit dengan `replace_all`):

```js
    const s = settingsRef.current;
    if (!s.apiKey) {
      toast('Isi API key dulu di Pengaturan AI.');
      go('settings');
      return;
    }
    if (!s.deepgramKey) {
```

dengan:

```js
    const s = settingsRef.current;
    if (!sessionRef.current) {
      toast('Percakapan belum siap, coba lagi sebentar.');
      return;
    }
    if (!s.deepgramKey) {
```

- [ ] **Step 9: Ubah `app/chat/page.jsx`, fungsi `answerCustomer`**

Ganti:

```js
    const s = settingsRef.current;
    const history = [...chatRef.current.filter(sendable), { role: 'user', content: question }]
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));
    const uid = newId();
```

dengan:

```js
    const sid = sessionRef.current;
    const uid = newId();
```

Ganti:

```js
    const messages = [{ role: 'system', content: `${buildSystemPrompt(s, documentsRef.current)}\n\n${CALL_RULES}` }, ...history];
    let reply = '';
    const replyPromise = callChat(s, messages, { maxTokens: Number(s.maxTokens) || 600, stream: false, signal: call.ac.signal }, (d) => {
```

dengan:

```js
    let reply = '';
    const replyPromise = callChat(sid, question, { mode: 'call', signal: call.ac.signal }, (d) => {
```

Ganti `      if (!reply) throw new Error('Model mengembalikan jawaban kosong. Coba naikkan Max tokens atau matikan Reasoning.');` dengan:

```js
      if (!reply) throw new Error('Model mengembalikan jawaban kosong. Coba telepon lagi.');
```

- [ ] **Step 10: Ubah `app/chat/page.jsx`, fungsi `newChat`**

Ganti:

```js
    setChat([]);
    showPose(settings.apiKey ? 'ask' : 'alert');
    toast('Percakapan baru dimulai.');
```

dengan:

```js
    startNewSession()
      .then(() => {
        showPose('ask');
        toast('Percakapan baru dimulai.');
      })
      .catch((e) => toast((e && e.message) || 'Gagal membuat percakapan baru.'));
```

- [ ] **Step 11: Ubah `app/chat/page.jsx`, handler pengaturan dan PDF**

Ganti semua kode mulai dari `  const saveSettings = (e) => {` sampai penutup fungsi `resetDefaults` (meliputi `saveSettings`, `runTest`, `clearKey`, `onPdfChange`, `removeDoc`, dan `resetDefaults`) dengan:

```js
  const saveSettings = async (e) => {
    e.preventDefault();
    const s = normalizeSettings(draft);
    if (s.contextText) {
      if (!sessionRef.current) {
        toast('Percakapan belum siap, coba lagi sebentar.');
        return;
      }
      try {
        await addAttachment(sessionRef.current, 'Catatan teks', s.contextText);
        setDocuments((docs) => [...docs, { id: newId(), name: 'Catatan teks', chars: Math.min(s.contextText.length, MAX_CONTEXT) }]);
      } catch (err) {
        toast((err && err.message) || 'Catatan gagal ditempel.');
        return;
      }
    }
    const next = { ...s, contextText: '' };
    setSettings(next);
    setDraft(next);
    toast('Pengaturan tersimpan.');
  };

  /* ---------- dokumen PDF (ditempel ke sesi yang sedang dibuka) ---------- */
  const onPdfChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // supaya file yang sama bisa dipilih lagi
    if (!files.length) return;
    const sid = sessionRef.current;
    if (!sid) {
      setPdfStatus({ text: 'Percakapan belum siap, coba lagi sebentar.', ok: false, reading: false });
      return;
    }

    setPdfStatus({ text: `Membaca ${files.length} PDF…`, ok: null, reading: true });
    const added = [];
    const failed = [];
    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf) {
        failed.push(`${file.name} (bukan PDF)`);
        continue;
      }
      if (file.size > MAX_PDF_BYTES) {
        failed.push(`${file.name} (lebih dari 20 MB)`);
        continue;
      }
      try {
        const { text } = await extractPdfText(file);
        if (!text) {
          failed.push(`${file.name} (tidak ada teks, mungkin hasil scan)`);
          continue;
        }
        await addAttachment(sid, file.name, text);
        added.push({ id: newId(), name: file.name, chars: Math.min(text.length, MAX_CONTEXT) });
      } catch (err) {
        const msg = err && err.name === 'PasswordException' ? 'dilindungi password' : (err && err.message) || 'gagal dibaca';
        failed.push(`${file.name} (${msg})`);
      }
    }

    if (added.length) setDocuments((docs) => [...docs, ...added]);
    const parts = [];
    if (added.length) parts.push(`${added.length} PDF ditempel ke percakapan ini.`);
    if (failed.length) parts.push(`Gagal: ${failed.join(', ')}.`);
    if (!added.length && failed.length && failed.length === files.length && !navigator.onLine) {
      parts.push('Periksa koneksi internet, pembaca PDF perlu diunduh saat pertama kali.');
    }
    setPdfStatus({ text: parts.join(' '), ok: failed.length ? (added.length ? null : false) : true, reading: false });
  };
```

- [ ] **Step 12: Ubah `app/chat/page.jsx`, nilai turunan**

Ganti:

```js
  const connected = ready && !!settings.apiKey;
  const poseFile = POSES[pose] || 'ask';
  const txs = TXS.filter((t) => txFilter === 'all' || t.dir === txFilter);
  const contextSize = buildContext(draft.contextText, documents).length;
```

dengan:

```js
  const connected = ready && !!sessionId;
  const poseFile = POSES[pose] || 'ask';
  const txs = txRows.filter((t) => txFilter === 'all' || t.dir === txFilter);
  const contextSize = String(draft.contextText || '').length;
```

Ganti `    : 'Belum terhubung · atur API key di Pengaturan AI';` dengan `    : 'Menyiapkan percakapan…';`.

Ganti:

```js
    setInput(`Tolong jelaskan transaksi "${t.name}" ${rp(t.amt)} tanggal ${t.date}.`);
```

dengan:

```js
    setInput(`Tolong jelaskan transaksi "${t.name}" ${rp(t.amt)} pada ${t.waktu}.`);
```

Ganti `    ['settings', 'Pengaturan AI', <GearIcon key="s" />]` dengan `    ['settings', 'Pengaturan', <GearIcon key="s" />]`.

- [ ] **Step 13: Ubah `app/chat/page.jsx`, JSX sidebar, header, dan pesan**

Di sidebar, tepat setelah penutup `{navItems.map(...)}` dan sebelum `</nav>`, sisipkan:

```jsx
            <button type="button" className="nav-item" onClick={logout}>
              Keluar
            </button>
```

Di header chat, tepat sebelum `<button type="button" className="btn ghost" onClick={newChat}>Chat baru</button>`, sisipkan:

```jsx
            <label htmlFor="session-pick" className="sr">Pilih percakapan</label>
            <select
              id="session-pick"
              className="session-pick"
              value={sessionId || ''}
              disabled={busy || inCall || voiceBusy}
              onChange={(e) => openSession(e.target.value).catch((err) => toast((err && err.message) || 'Percakapan gagal dibuka.'))}
            >
              {sessions.map((x) => (
                <option key={x.id} value={x.id}>{fmtWaktu(x.created_at)}</option>
              ))}
            </select>
```

Hapus `            <div className="stamp">Hari ini, 14:12</div>`.

Ganti `              Halo, Dimas! Saya Agent Nusa. Pilih topik di bawah atau ketik pertanyaan Anda.` dengan:

```jsx
              {`Halo, ${account ? account.nama : 'Nasabah'}! Saya Agent Nusa. Pilih topik di bawah atau ketik pertanyaan Anda.`}
```

Hapus seluruh blok:

```jsx
            {ready && !settings.apiKey && (
              <div className="msg bot">
                Agent Nusa belum bisa menjawab karena API key belum diisi.
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => go('settings')}>Atur API key</button>
                </div>
              </div>
            )}
```

- [ ] **Step 14: Ubah `app/chat/page.jsx`, panel saldo dan transaksi**

Ganti:

```jsx
            <div className="balance-sm">Tabungan Agent Nusa · •••• 4821</div>
            <div className="balance-big">Rp 24.380.500</div>
            <div className="balance-sm">Data demo · saldo per 17 Nov 2026, 14:12</div>
```

dengan:

```jsx
            <div className="balance-sm">{account ? `Tabungan Agent Nusa · •••• ${account.nomor_akhir}` : 'Memuat rekening…'}</div>
            <div className="balance-big">{account ? rp(account.saldo_total) : '—'}</div>
            <div className="balance-sm">Saldo Total · data demo</div>
```

Ganti `                key={t.name + t.date + t.time}` dengan `                key={t.id}`.
Ganti ``                  <span className="tx-meta">{`${t.date} · ${t.time} · ${t.channel}`}</span>`` dengan ``                  <span className="tx-meta">{`${t.waktu} · ${t.channel}`}</span>``.

- [ ] **Step 15: Ubah `app/chat/page.jsx`, bagian pengaturan**

Ganti seluruh elemen `<section className="glass settings" aria-label="Pengaturan AI"> ... </section>` (termasuk komentar `{/* PENGATURAN */}` di atasnya) dengan:

```jsx
        {/* PENGATURAN */}
        <section className="glass settings" aria-label="Pengaturan">
          <div className="settings-inner">
            <header className="settings-head">
              <div className="avatar"><img src="/assets/laptop.png" alt="" /></div>
              <div>
                <h1>Pengaturan</h1>
                <p>Koneksi AI sekarang diatur di server. Di sini Anda mengatur suara dan menempelkan lampiran ke percakapan yang sedang dibuka.</p>
              </div>
            </header>

            <form onSubmit={saveSettings} autoComplete="off" noValidate>
              <fieldset className="group">
                <legend>Suara</legend>
                <div className="field">
                  <label htmlFor="deepgramKey"><span>API key Deepgram (suara &amp; telepon)</span></label>
                  <div className="with-btn">
                    <input
                      id="deepgramKey"
                      type={showDgKey ? 'text' : 'password'}
                      placeholder="Tempel API key Deepgram di sini"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      value={draft.deepgramKey}
                      onChange={upd('deepgramKey')}
                    />
                    <button type="button" className="btn ghost" aria-pressed={showDgKey} onClick={() => setShowDgKey((v) => !v)}>
                      {showDgKey ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>
                  <small>Dipakai untuk tombol mic, jawaban bersuara, dan tombol Telepon. Key tersimpan di browser ini. Mikrofon hanya bisa dipakai di https:// atau localhost.</small>
                </div>
              </fieldset>

              <fieldset className="group">
                <legend>Lampiran percakapan ini</legend>
                <div className="field">
                  <label htmlFor="contextText"><span>Catatan teks</span></label>
                  <textarea
                    id="contextText"
                    rows={5}
                    placeholder="Contoh: Promo bulan ini, jam operasional cabang, kebijakan biaya terbaru…"
                    value={draft.contextText}
                    onChange={upd('contextText')}
                  />
                  <small>Catatan ditempel ke percakapan yang sedang dibuka saat Anda klik Simpan pengaturan.</small>
                </div>

                <div className="field">
                  <label htmlFor="pdf-input" className="field-label"><span>Dokumen PDF</span></label>
                  <input
                    id="pdf-input"
                    className="file-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    disabled={pdfStatus.reading}
                    onChange={onPdfChange}
                  />
                  <small>Teks PDF dibaca di browser lalu ditempel ke percakapan ini. Lampiran tidak bisa dilepas; tekan Chat baru untuk percakapan tanpa lampiran. PDF hasil scan (gambar) tidak bisa dibaca.</small>
                  <p
                    id="pdf-status"
                    className={'pdf-status' + (pdfStatus.ok === true ? ' ok' : pdfStatus.ok === false ? ' bad' : '')}
                    role="status"
                    aria-live="polite"
                  >
                    {pdfStatus.text}
                  </p>
                  {documents.length > 0 && (
                    <ul id="pdf-list" className="pdf-list">
                      {documents.map((d) => (
                        <li key={d.id}>
                          <span className="pdf-name">{d.name}</span>
                          <span className="pdf-meta">{`${fmtNum(d.chars)} karakter`}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className={'context-size' + (contextOver ? ' over' : '')}>
                  {`Ukuran catatan: ${fmtNum(contextSize)} / ${fmtNum(MAX_CONTEXT)} karakter`}
                  {contextOver && <span> · terlalu panjang, bagian akhir akan dipotong</span>}
                </div>
              </fieldset>

              <div className="actions">
                <button type="submit" className="btn primary">Simpan pengaturan</button>
              </div>
            </form>
          </div>
        </section>
```

Di bottom nav, tepat sebelum `</nav>` penutup `bottom-nav`, sisipkan:

```jsx
        <button type="button" className="nav-item" onClick={logout}>Keluar</button>
```

- [ ] **Step 16: Tambah gaya pemilih sesi di akhir `app/globals.css`**

```css
/* pemilih Sesi Percakapan */
.session-pick{min-height:44px;max-width:190px;padding:0 12px;border-radius:14px;border:1px solid var(--b-ctrl);background:var(--g-ctrl);font-size:13px;font-weight:600}
.session-pick option{color:#0E2146}
@media (max-width:640px){.session-pick{max-width:118px}}
```

- [ ] **Step 17: Pastikan tidak ada sisa referensi lama**

Run:

```bash
git grep -nE "apiKey|TXS|demoContext|buildSystemPrompt|documentsRef|sendable|LS_CHAT|LS_DOCS|setTest|runTest|clearKey|resetDefaults|removeDoc|showKey" -- app lib
```

Expected: tidak ada hasil. Satu-satunya pengecualian adalah `lib/speech.js` dan `lib/voice.js`, yang memakai nama parameter `apiKey` untuk Deepgram. Itu boleh dibiarkan.

- [ ] **Step 18: Build dan uji manual**

Run: `npm test && npm run build`
Expected: semua test PASS dan build sukses.

Lalu jalankan `npm run dev`, login dengan akun dari Task 10, buka `/chat`, dan cek:
- Panel menampilkan `Rp 24.380.500` dan 30 Transaksi terbaru dari DB, termasuk "Transfer ke Rina Wijaya" berstatus Gagal.
- Kirim "Saldo saya berapa?". Jawaban muncul bertahap dan menyebut Rp 24.380.500.
- Muat ulang halaman. Percakapan yang sama muncul lagi dari DB.
- Tekan "Chat baru". Pemilih sesi bertambah satu, dan sesi lama masih bisa dibuka lewat pemilih.
- Tempel PDF di Pengaturan, lalu tanyakan isinya. Agent bisa menjawab.

- [ ] **Step 19: Commit**

```bash
git add lib/api.js lib/data.js app/chat/page.jsx app/globals.css
git commit -m "feat(chat): use DB-backed sessions, DB finance data and server-held Netra key"
```

---

### Task 14: Dokumentasi

**Files:**
- Modify: `README.md`
- Modify: `docs/specs/agent-keuangan.md`
- Modify: `CONTEXT.md`

- [ ] **Step 1: README**

Ganti bagian "## Mengatur API key" dengan:

```markdown
## Menyiapkan Supabase dan API key

1. Buat project di supabase.com. Di **Authentication > Sign In / Providers > Email**, matikan **Confirm email** untuk demo.
2. Jalankan isi `supabase/migrations/20261124000001_fondasi.sql` di **SQL Editor**.
3. Salin `.env.example` menjadi `.env.local`, lalu isi URL dan key Supabase serta `NETRA_API_KEY`.
4. `npm run dev`, buka http://localhost:3000/register, lalu jalani onboarding.

Key Netra sekarang hanya ada di server (`NETRA_API_KEY`). Key Deepgram untuk fitur suara masih diisi di halaman **Pengaturan**.
Cek apakah context caching DeepSeek lewat Netra bekerja: `node --env-file=.env.local scripts/cek-cache-netra.mjs`.
```

Di bagian "## Cara kerja dan keamanan", ganti tiga butir pertama (yang membahas API key di `localStorage`, header `x-api-key`, dan riwayat chat di browser) dengan:

```markdown
- Nasabah login dengan Supabase Auth. Data rekening, Transaksi, dan Sesi Percakapan disimpan di Supabase Postgres dengan Row Level Security, sehingga tiap Nasabah hanya bisa membaca datanya sendiri.
- Browser hanya mengirim `session_id` dan pesan baru. Server menyusun prompt dengan urutan tetap (system prompt statis → Snapshot Keuangan sesi → riwayat) supaya context caching DeepSeek bisa kena. Lihat `docs/adr/0003-*`.
- Setiap balasan menyimpan `usage` dari API (termasuk token cache hit) di tabel `chat_messages`.
```

Di bagian "## Kustomisasi", ganti butir "Data nasabah dan transaksi" dan "Perilaku AI" dengan:

```markdown
- **Data demo Nasabah baru:** fungsi `seed_nasabah_baru` di migrasi Supabase.
- **Perilaku AI:** `SYSTEM_PROMPTS` di `lib/prompt.js`. Jika teksnya diubah, tambahkan versi baru dan naikkan `SYSTEM_PROMPT_VERSION` agar sesi lama tidak kehilangan cache.
```

Di tabel environment variable, tambahkan baris `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NETRA_API_KEY`, dan `NETRA_MODEL`, masing-masing dengan fungsi seperti di `.env.example`.

- [ ] **Step 2: Spec**

Di `docs/specs/agent-keuangan.md`, tambahkan subbagian baru setelah bagian 7:

```markdown
### 7.1 Keputusan pelaksanaan Tahap 1

- **Lampiran** (isi PDF dan catatan teks) ditempel ke Sesi Percakapan sebagai pesan `role = 'lampiran'` di akhir riwayat, lalu dirender sebagai pesan `system` "LAMPIRAN DARI NASABAH". Lampiran tidak bisa dilepas karena akan mengubah prefix.
- **Riwayat tidak dipotong.** Prompt lebih dari 400.000 karakter ditolak (413) dengan saran memulai Chat baru.
- **Cap waktu** pesan Nasabah diambil dari `chat_messages.created_at`.
- **Key Deepgram** masih di browser, karena WebSocket speech-to-text dibuka langsung dari browser. Halaman "Pengaturan AI" diperkecil menjadi "Pengaturan" (suara dan lampiran).
- Balasan agent disimpan tanpa di-trim.
```

Di bagian 8, ubah daftar role pada baris `chat_messages` menjadi `role` (`user`/`assistant`/`lampiran`/`pembaruan`).

- [ ] **Step 3: CONTEXT.md**

Tambahkan entri ini di bagian "## Percakapan", setelah **Sesi Percakapan**:

```markdown
**Lampiran**:
Dokumen atau catatan teks yang ditempel Nasabah ke satu Sesi Percakapan sebagai bahan jawaban agent. Lampiran tidak bisa dilepas lagi dari sesinya.
_Avoid_: konteks tambahan, context, dokumen
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/specs/agent-keuangan.md CONTEXT.md
git commit -m "docs: document Supabase setup and Tahap 1 implementation decisions"
```

---

### Task 15: Verifikasi kriteria selesai Tahap 1

Kriteria ini mengacu pada spec bagian 11, Tahap 1. Tidak ada kode baru di task ini.

- [ ] **Step 1: Isolasi data (RLS)**

1. Register akun A dan akun B, lalu selesaikan onboarding untuk keduanya.
2. Login sebagai A, buka `/chat`, kirim satu pesan, lalu catat `sessionId` dari localStorage (`nusa.session.v1`).
3. Login sebagai B di jendela incognito, lalu buka `http://localhost:3000/api/sessions/<sessionId milik A>`.

Expected: `404 Percakapan tidak ditemukan.`

4. Masih sebagai B, jalankan di console browser:

```js
const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: '<sessionId milik A>', message: 'halo' }) });
r.status
```

Expected: `404`.

5. Di SQL Editor, jalankan sebagai user B (`set local` hanya berlaku di dalam transaksi):

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user_id B>","role":"authenticated"}';
select count(*) from public.chat_messages; -- hanya pesan milik B
select count(*) from public.transactions;  -- 35 (hanya milik B)
rollback;
```

- [ ] **Step 2: Prefix stabil dan cache tercatat**

Dalam satu sesi, kirim tiga pesan berturut-turut, lalu jalankan:

```sql
select id, role, usage->>'prompt_tokens' as prompt, usage->>'prompt_cache_hit_tokens' as cache_hit
from public.chat_messages where session_id = '<session id>' order by id;
```

Expected: setiap baris `assistant` punya `usage`. Jika Task 0 membuktikan Netra meneruskan caching, `cache_hit` pesan ke-2 dan ke-3 > 0.

- [ ] **Step 3: Sesi bisa dilanjutkan setelah login ulang**

1. Keluar, lalu masuk lagi. Sesi terakhir terbuka otomatis.
2. Kirim satu pesan baru, lalu jalankan query yang sama dengan Step 2.

Expected: pesan baru tersimpan. Jika cache DeepSeek belum kedaluwarsa, `cache_hit` > 0.

- [ ] **Step 4: Snapshot tetap beku**

Di SQL Editor (berjalan sebagai superuser, jadi RLS tidak berlaku), tambahkan satu Transaksi masuk Rp 1.000.000 untuk akun A:

```sql
insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal)
select id, user_id, 'masuk', 1000000, 'transfer', 'Transfer dari Uji', 'BI-FAST'
from public.accounts where user_id = '<user_id A>';
```

Lalu kirim "Saldo saya berapa?" di sesi lama, kemudian di sesi baru (Chat baru).

Expected: sesi lama tetap menyebut saldo lama, sedangkan sesi baru menyebut saldo yang bertambah Rp 1.000.000.

- [ ] **Step 5: Catat hasil**

Tulis hasil Step 1–4 (lulus/gagal, beserta angka cache hit) di deskripsi PR Tahap 1.
