# Tahap 3 (Catatan Pengeluaran dan Ringkasan Bulanan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nasabah bisa menceritakan pengeluaran ("tadi jajan bakso 25 ribu") lewat chat, suara, atau telepon. Agent menyiapkan Aksi Tertunda berupa kartu Catatan Pengeluaran, dan setelah dikonfirmasi (tombol atau jawaban "ya") pengeluaran menjadi Transaksi yang mengurangi saldo. Nasabah juga bisa meminta Ringkasan Bulanan berstatus Hemat, Aman, atau Boros. Panel Demo mendapat tombol **Belanja acak** dan **Skenario boros**.

**Architecture:**
- Model mengenali niat lewat tool calling (ADR 0006). Definisi tool statis dan berversi bersama system prompt v3.
- Server memvalidasi argumen tool: nominal harus ada di ucapan Nasabah (`lib/nominal.js`). Server lalu membuat Aksi Tertunda (`pending_actions`) atau menghitung ringkasan (`lib/ringkasan.js`).
- Hasil tool disimpan sebagai baris `chat_messages` ber-role `tool`, yang juga membawa kartu (`card`). Server lalu memanggil model sekali lagi supaya agent menjelaskan kartunya.
- Uang hanya berubah lewat fungsi Postgres `jalankan_aksi` setelah Nasabah mengonfirmasi (ADR 0007).
- Jawaban "ya" dikenali secara deterministik oleh `lib/konfirmasi.js`, bukan oleh AI.

**Tech Stack:** Next.js 15 App Router (JavaScript), React 19, Supabase (Postgres, Auth, RLS) lewat `@supabase/ssr` dan `@supabase/supabase-js`, Netra Runtime (`deepseek/deepseek-v4.1-flash`), vitest.

**Referensi:** `docs/specs/agent-keuangan.md` (bagian 3, 4a, 5.5, 5.6, 5.8, 7, 8, 9, 11), `CONTEXT.md`, ADR 0002, 0003, 0005, 0006, 0007.

**Konvensi repo:**
- Kode dan komentar berbahasa Indonesia, mengikuti gaya file yang ada (2 spasi, kutip tunggal, titik koma).
- Semua nominal dalam rupiah bilangan bulat. Format tampilan memakai `rp()` dan `fmtWaktu()` dari `lib/format.js`. Jangan memakai `toLocaleString`.
- Klien service role (`createAdminClient`) hanya dipakai di route handler, setelah `getUser()` memverifikasi Nasabah. `user.id` selalu berasal dari `getUser()`, tidak pernah dari body.
- Commit message dalam bahasa Inggris (conventional commits), **tanpa** baris `Co-Authored-By` atau atribusi Claude.
- Jangan commit `.env.local` dan jangan menampilkan isinya. Jangan commit folder `.claude/`.
- Test: `npm test` (vitest). Build: `npm run build`.

---

## Keputusan pelaksanaan Tahap 3

Keputusan-keputusan ini dibuat oleh penulis plan dan dicatat di spec bagian 7.3 (Task 11):

1. **Kartu dari tool disimpan di baris `tool`**: `chat_messages.role = 'tool'`, `content` = hasil tool (JSON string, beku), `tool = { id, name }`, `card = { jenis: 'pengeluaran', action_id }` atau `{ jenis: 'ringkasan', data }`. Tidak ada baris `kartu` terpisah, karena isi kartu sudah ada di hasil tool.
2. **Panggilan tool disimpan di baris `assistant`**: `tool = { calls: [{ id, name, arguments }] }`, dengan `arguments` disimpan persis seperti string dari model (prefix cache).
3. **Jawaban konfirmasi deterministik** (`lib/konfirmasi.js`): pesan pendek (maksimal 6 kata, tanpa angka) yang hanya berisi kata setuju menjadi "ya", dan yang hanya berisi kata penolakan menjadi "tidak". Selain itu dianggap "membahas hal lain" sehingga aksi dibatalkan (spec 5.5 langkah 5). Contoh: "iya tapi 30 ribu" membatalkan aksi lama, lalu model bisa memanggil tool lagi dengan nominal baru.
4. **Nominal diperiksa terhadap pesan Nasabah terakhir saja**. Alur "tadi beli bakso" → "berapa?" → "25rb" tetap lolos karena tool dipanggil pada giliran "25rb".
5. **Sesi lama (v1, v2) tidak memakai tool**, karena definisi tool akan mengubah prefix-nya. Fitur baru berlaku di sesi baru (system prompt v3).
6. **Pemetaan Kategori Belanja untuk Transaksi seed**:
   - Tagihan: Sewa kos, Token Listrik, Internet, Tagihan Kartu Kredit.
   - Makan: Belanja Bulanan Supermarket (bahan makanan), Warung Makan.
   - Lainnya: Top up Dompet Digital.
   - Jajan: Kopi Senja, Bakso.
   - Belanja: Toko Buku.
   - Transfer gagal tidak diberi kategori.
7. **Catatan Pengeluaran** dicatat dengan `kategori = 'catatan'` dan `kanal = 'Catatan'`.
8. **Skenario boros** membuat 4 Transaksi Keinginan yang totalnya dihitung dari batas pro-rata, sehingga Status Belanja dijamin menjadi Boros. Nominalnya bisa besar di akhir bulan. Total belanja dibuat 20% di atas batas pro-rata, dengan tambahan minimal Rp 200.000.
9. **Teks cadangan**: jika putaran kedua model gagal atau kosong, server menyimpan dan mengirim "Silakan cek kartu di atas ya." supaya riwayat tidak pernah berisi hasil tool tanpa balasan.
10. **Event server ke browser**: baris yang disisipkan server di tengah giliran (pembaruan dan kartu) dikirim di stream sebagai `data: {"nusa":{"pesan":<baris>}}`. Parser browser meneruskannya ke `onEvent`.

---

## Peta file

| File | Status | Tanggung jawab |
|---|---|---|
| `lib/kategori.js` | baru | Daftar Kategori Belanja, label, dan kelompok Kebutuhan atau Keinginan |
| `lib/nominal.js` | baru | Mengenali nominal rupiah di ucapan Nasabah |
| `tests/nominal.test.js` | baru | Kasus tepi nominal |
| `lib/konfirmasi.js` | baru | Menilai jawaban Nasabah: ya, tidak, atau lain |
| `tests/konfirmasi.test.js` | baru | Kasus jawaban |
| `lib/ringkasan.js` | baru | Ringkasan Bulanan dan Status Belanja (fungsi murni) beserta teks kartunya |
| `tests/ringkasan.test.js` | baru | Kasus tepi ringkasan |
| `lib/pengeluaran.js` | baru | Validasi argumen `catat_pengeluaran` serta teks kartu dan pembaruan |
| `tests/pengeluaran.test.js` | baru | Validasi dan teks |
| `lib/demo.js` | baru | Belanja acak dan Skenario boros (fungsi murni) |
| `tests/demo.test.js` | baru | Jumlah dan status hasil skenario |
| `lib/sse.js` | ubah | Event `toolCall` dan `nusa`, serta perakit tool call |
| `tests/sse.test.js` | ubah | Test event baru |
| `lib/prompt.js` | ubah | System prompt v3, `TOOLS`, `toolsFor`, dan render role `tool` serta `assistant` dengan tool call |
| `tests/prompt.test.js` | ubah | v1 dan v2 tetap utuh, v3, dan render tool |
| `supabase/migrations/20261127000001_pengeluaran.sql` | baru | `kategori_belanja`, `pending_actions`, kolom `tool`, `ingest_transaksi` baru, `jalankan_aksi`, seed, dan reset |
| `lib/server/netra.js` | ubah | Opsi `tools` |
| `lib/server/http.js` | ubah | Kode error Aksi Tertunda |
| `lib/server/nasabah.js` | ubah | Memuat `kategori_belanja` |
| `lib/server/ingest.js` | ubah | Meneruskan `kategori_belanja` |
| `lib/server/ringkasan.js` | baru | `muatRingkasan`: membaca data lalu memanggil `hitungRingkasan` |
| `lib/server/aksi.js` | baru | Membaca, menjalankan, dan membatalkan Aksi Tertunda, serta memutuskannya dari jawaban Nasabah |
| `lib/server/alat.js` | baru | Menjalankan tool `catat_pengeluaran` dan `minta_ringkasan` |
| `app/api/chat/route.js` | ubah | Konfirmasi "ya", putaran tool, event `nusa`, dan teks cadangan |
| `app/api/notifications/[id]/open/route.js` | ubah | Sapaan memakai definisi tool sesi |
| `app/api/actions/[id]/confirm/route.js` | baru | Tombol Catat |
| `app/api/actions/[id]/cancel/route.js` | baru | Tombol Batal |
| `app/api/demo/belanja/route.js` | baru | Tombol Belanja acak |
| `app/api/demo/boros/route.js` | baru | Tombol Skenario boros |
| `lib/api.js` | ubah | `onEvent` di `callChat`, aksi, dan demo baru |
| `lib/data.js` | ubah | Chip contoh baru |
| `app/chat/PengeluaranCard.jsx` | baru | Kartu Catatan Pengeluaran |
| `app/chat/RingkasanCard.jsx` | baru | Kartu Ringkasan Bulanan |
| `app/chat/RencanaCard.jsx` | ubah | Prop `tick` untuk memuat ulang status |
| `app/chat/DemoPanel.jsx` | ubah | Tombol Belanja acak dan Skenario boros |
| `app/chat/page.jsx` | ubah | Kartu baru, event `nusa` di chat, suara, dan telepon, Kategori Belanja di panel Transaksi |
| `app/globals.css` | ubah | Gaya kartu baru |
| `docs/specs/agent-keuangan.md`, `README.md` | ubah | Keputusan pelaksanaan dan cara setup |

---

### Task 1: Kategori Belanja dan pengenal nominal (`lib/kategori.js`, `lib/nominal.js`)

**Files:**
- Create: `lib/kategori.js`
- Create: `lib/nominal.js`
- Test: `tests/nominal.test.js`

- [ ] **Step 1: Tulis `lib/kategori.js`**

```js
// Kategori Belanja (CONTEXT.md). Urutan objek = urutan tampilan.
// Kebutuhan: Makan, Transportasi, Tagihan. Keinginan: Jajan, Belanja, Hiburan, Lainnya.
export const KATEGORI_BELANJA = {
  makan: { label: 'Makan', kelompok: 'kebutuhan' },
  jajan: { label: 'Jajan', kelompok: 'keinginan' },
  belanja: { label: 'Belanja', kelompok: 'keinginan' },
  transportasi: { label: 'Transportasi', kelompok: 'kebutuhan' },
  tagihan: { label: 'Tagihan', kelompok: 'kebutuhan' },
  hiburan: { label: 'Hiburan', kelompok: 'keinginan' },
  lainnya: { label: 'Lainnya', kelompok: 'keinginan' }
};

export const DAFTAR_KATEGORI = Object.keys(KATEGORI_BELANJA);

export const labelKategori = (k) => (KATEGORI_BELANJA[k] ? KATEGORI_BELANJA[k].label : 'Lainnya');
```

- [ ] **Step 2: Tulis test yang gagal `tests/nominal.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { cariNominal, nominalDisebut } from '../lib/nominal';

describe('cariNominal', () => {
  it.each([
    ['tadi jajan bakso 25 ribu', 25000],
    ['bakso 25rb', 25000],
    ['kopi 25k', 25000],
    ['bayar Rp25.000 tadi', 25000],
    ['bayar Rp 25.000,00', 25000],
    ['harganya 25000', 25000],
    ['sepatu 1,5 juta', 1500000],
    ['sepatu 1.5jt', 1500000],
    ['hp 2 juta', 2000000],
    ['laptop 1,25 juta', 1250000],
    ['dua puluh lima ribu', 25000],
    ['seratus lima puluh ribu', 150000],
    ['dua belas ribu lima ratus', 12500],
    ['setengah juta', 500000],
    ['parkir seribu', 1000],
    ['satu juta dua ratus ribu', 1200000],
    ['250 rebu', 250000]
  ])('%s -> %i', (teks, n) => {
    expect(cariNominal(teks)).toContain(n);
  });

  it('menggabungkan "1 juta 200 ribu"', () => {
    expect(cariNominal('belanja 1 juta 200 ribu')).toContain(1200000);
  });

  it('tanpa angka -> kosong', () => {
    expect(cariNominal('tadi beli kopi')).toEqual([]);
    expect(cariNominal('')).toEqual([]);
  });

  it('desimal tanpa satuan tidak dihitung', () => {
    expect(cariNominal('nilai 1,5')).toEqual([]);
  });
});

describe('nominalDisebut', () => {
  it('cocok hanya jika angka yang sama ada di ucapan', () => {
    expect(nominalDisebut('tadi beli bakso 25 ribu', 25000)).toBe(true);
    expect(nominalDisebut('tadi beli bakso 25 ribu', 250000)).toBe(false);
    expect(nominalDisebut('tadi beli bakso', 25000)).toBe(false);
    expect(nominalDisebut('bakso 25', 25000)).toBe(false);
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/nominal.test.js`
Expected: FAIL (modul `../lib/nominal` tidak ada).

- [ ] **Step 4: Tulis `lib/nominal.js`**

```js
// Mengenali nominal rupiah di ucapan Nasabah (spec 5.5, ADR 0006).
// Contoh: "25rb", "25 ribu", "25k", "Rp25.000", "1,5 juta", "1.5jt", "dua puluh lima ribu", "setengah juta".
// cariNominal(teks) -> daftar rupiah (bilangan bulat, unik). nominalDisebut(teks, n) -> boolean.

const SATUAN = { rb: 1e3, ribu: 1e3, rebu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, miliar: 1e9, milyar: 1e9 };
const POLA_ANGKA = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(rb|ribu|rebu|k|jt|juta|miliar|milyar)?(?![a-z0-9])/gi;

// "25.000" -> 25000, "25.000,00" -> 25000, "1,5" -> 1.5, "1.5" (dengan satuan) -> 1.5
function bacaAngka(s, adaSatuan) {
  const m = s.match(/^(.*)[.,](\d{1,2})$/);
  if (m && (adaSatuan || s.lastIndexOf(',') === s.length - m[2].length - 1)) {
    return Number(m[1].replace(/[.,]/g, '') + '.' + m[2]);
  }
  return Number(s.replace(/[.,]/g, ''));
}

function dariDigit(teks) {
  const hasil = [];
  for (const m of teks.matchAll(POLA_ANGKA)) {
    const satuan = m[2] ? SATUAN[m[2].toLowerCase()] : 1;
    const nilai = bacaAngka(m[1], !!m[2]) * satuan;
    if (Number.isFinite(nilai) && Number.isInteger(Math.round(nilai * 100) / 100) && nilai >= 1) {
      hasil.push({ nilai: Math.round(nilai), satuan, awal: m.index, akhir: m.index + m[0].length });
    }
  }
  // "1 juta 200 ribu": dua angka bersatuan berurutan dengan satuan menurun digabung.
  const gabungan = [];
  for (let i = 0; i + 1 < hasil.length; i++) {
    const a = hasil[i];
    const b = hasil[i + 1];
    if (a.satuan > b.satuan && b.satuan > 1 && /^\s*(dan\s*)?$/i.test(teks.slice(a.akhir, b.awal))) gabungan.push(a.nilai + b.nilai);
  }
  return [...hasil.map((h) => h.nilai), ...gabungan];
}

const DIGIT_KATA = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };

function dariKata(teks) {
  const hasil = [];
  const tokens = teks.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  let total = 0;
  let grup = 0;
  let d = 0;
  let separuh = false;
  let ada = false;
  const tutup = () => {
    if (ada) {
      const n = total + grup + d;
      if (n >= 1) hasil.push(n);
    }
    total = 0;
    grup = 0;
    d = 0;
    separuh = false;
    ada = false;
  };
  const kali = (satuan) => {
    const dasar = separuh ? 0.5 : grup + d || 1;
    total += dasar * satuan;
    grup = 0;
    d = 0;
    separuh = false;
  };
  for (const t of tokens) {
    if (DIGIT_KATA[t]) {
      d = DIGIT_KATA[t];
      ada = true;
    } else if (t === 'sepuluh') {
      grup += 10;
      ada = true;
    } else if (t === 'sebelas') {
      grup += 11;
      ada = true;
    } else if (t === 'seratus') {
      grup += 100;
      ada = true;
    } else if (t === 'belas' && ada) {
      grup += 10 + d;
      d = 0;
    } else if (t === 'puluh' && ada) {
      grup += d * 10;
      d = 0;
    } else if (t === 'ratus' && ada) {
      grup += d * 100;
      d = 0;
    } else if (t === 'setengah') {
      separuh = true;
      ada = true;
    } else if (t === 'seribu') {
      ada = true;
      kali(1e3);
    } else if (t === 'sejuta') {
      ada = true;
      kali(1e6);
    } else if ((t === 'ribu' || t === 'rebu') && ada) {
      kali(1e3);
    } else if (t === 'juta' && ada) {
      kali(1e6);
    } else {
      tutup();
    }
  }
  tutup();
  return hasil.map((n) => Math.round(n));
}

export function cariNominal(teks) {
  const s = String(teks || '');
  return [...new Set([...dariDigit(s), ...dariKata(s)])];
}

export function nominalDisebut(teks, nominal) {
  return cariNominal(teks).includes(Number(nominal));
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/nominal.test.js`
Expected: PASS. Jika ada kasus yang gagal, perbaiki `lib/nominal.js` (bukan test-nya), kecuali test-nya jelas salah. Laporkan jika test diubah.

- [ ] **Step 6: Commit**

```bash
git add lib/kategori.js lib/nominal.js tests/nominal.test.js
git commit -m "feat(nominal): recognise rupiah amounts in customer speech, add spending categories"
```

---

### Task 2: Jawaban konfirmasi (`lib/konfirmasi.js`)

**Files:**
- Create: `lib/konfirmasi.js`
- Test: `tests/konfirmasi.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
import { describe, expect, it } from 'vitest';
import { jenisJawaban } from '../lib/konfirmasi';

describe('jenisJawaban', () => {
  it.each(['ya', 'Iya', 'iya kak', 'ya, catat', 'oke', 'ok deh', 'benar', 'betul', 'bener banget', 'boleh', 'sip', 'lanjut', 'ya catat aja', 'Ya.', 'iyaa'])(
    '"%s" -> ya',
    (t) => expect(jenisJawaban(t)).toBe('ya')
  );
  it.each(['tidak', 'nggak', 'gak jadi', 'batal', 'batalkan', 'jangan', 'salah', 'bukan', 'ga usah', 'enggak kak'])('"%s" -> tidak', (t) =>
    expect(jenisJawaban(t)).toBe('tidak')
  );
  it.each([
    'iya tapi 30 ribu',
    'pengeluaranku bulan ini gimana?',
    'ya gak',
    'oh iya tadi juga beli es teh',
    '',
    'ya ya ya ya ya ya ya'
  ])('"%s" -> lain', (t) => expect(jenisJawaban(t)).toBe('lain'));
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/konfirmasi.test.js`
Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Tulis `lib/konfirmasi.js`**

```js
// Menilai jawaban Nasabah atas Aksi Tertunda (ADR 0007). Deterministik: uang tidak boleh berubah karena tebakan AI.
// 'ya'    : pesan pendek yang hanya berisi kata setuju (boleh ditambah kata pengisi)
// 'tidak' : pesan pendek yang hanya berisi kata penolakan
// 'lain'  : selain itu (termasuk pesan berisi angka), dan aksi dianggap ditinggal

const YA = new Set(['ya', 'iya', 'iyaa', 'iyap', 'yap', 'yup', 'yes', 'y', 'benar', 'bener', 'betul', 'oke', 'okay', 'okey', 'ok', 'sip', 'siap', 'boleh', 'lanjut', 'lanjutkan', 'setuju', 'catat', 'catatkan', 'gas', 'mantap']);
const TIDAK = new Set(['tidak', 'tdk', 'nggak', 'ngga', 'enggak', 'engga', 'gak', 'ga', 'nga', 'no', 'jangan', 'batal', 'batalkan', 'cancel', 'salah', 'bukan', 'gausah', 'gajadi']);
const PENGISI = new Set(['kak', 'kakak', 'min', 'deh', 'dong', 'aja', 'saja', 'sih', 'nya', 'itu', 'tolong', 'silakan', 'sekali', 'banget', 'udah', 'sudah', 'jadi', 'usah', 'dicatat', 'pak', 'bu', 'mas', 'mbak']);
const MAKS_KATA = 6;

export function jenisJawaban(teks) {
  const s = String(teks || '').toLowerCase();
  if (/\d/.test(s)) return 'lain';
  const kata = s.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!kata.length || kata.length > MAKS_KATA) return 'lain';
  const ya = kata.some((k) => YA.has(k));
  const tidak = kata.some((k) => TIDAK.has(k));
  const sisaLain = kata.some((k) => !YA.has(k) && !TIDAK.has(k) && !PENGISI.has(k));
  if (sisaLain || ya === tidak) return 'lain';
  return ya ? 'ya' : 'tidak';
}
```

Catatan: "ya ya ya ya ya ya ya" berisi 7 kata sehingga menjadi `lain`. "gak jadi" dan "ga usah" lolos sebagai `tidak` karena "jadi" dan "usah" termasuk kata pengisi.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/konfirmasi.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/konfirmasi.js tests/konfirmasi.test.js
git commit -m "feat(konfirmasi): classify customer replies to pending actions deterministically"
```

---

### Task 3: Ringkasan Bulanan (`lib/ringkasan.js`)

**Files:**
- Create: `lib/ringkasan.js`
- Test: `tests/ringkasan.test.js`

Aturan (spec 5.6, CONTEXT.md):
- Bulan berjalan dihitung menurut **WIB** (UTC+7).
- Yang dihitung hanya Transaksi `arah = 'keluar'`, `status = 'berhasil'`, `kategori_belanja` terisi, dan `waktu` di bulan WIB berjalan sampai `now`.
- `batas_prorata = round(batas × hari_berjalan / jumlah_hari)`. `hari_berjalan` adalah tanggal WIB hari ini (termasuk hari ini).
- **Hemat** jika `total × 100 ≤ 80 × batas_prorata`, **Aman** jika `total ≤ batas_prorata`, dan **Boros** jika lebih. Jika `batas_prorata = 0` dan `total = 0`, statusnya Hemat.
- `sisa_hari = jumlah_hari − hari_berjalan + 1`. `sisa_batas = max(0, batas − total)`. `sisa_per_hari` adalah `sisa_batas / sisa_hari` dibulatkan ke bawah ke ribuan.

- [ ] **Step 1: Tulis test yang gagal**

```js
import { describe, expect, it } from 'vitest';
import { awalBulanWib, hitungRingkasan, renderRingkasan } from '../lib/ringkasan';

const t = (waktu, nominal, kategori_belanja, extra = {}) => ({ waktu, arah: 'keluar', nominal, status: 'berhasil', kategori_belanja, ...extra });
// 15 Nov 2026 12:00 WIB, bulan 30 hari -> hari ke-15, pro-rata = batas / 2
const NOW = new Date('2026-11-15T05:00:00Z');

describe('hitungRingkasan', () => {
  it('tanpa belanja: total 0 dan Hemat', () => {
    const r = hitungRingkasan({ transaksi: [], batasBelanja: 3000000, sumberBatas: 'rencana', now: NOW });
    expect(r).toMatchObject({ bulan: 'November 2026', hari_berjalan: 15, jumlah_hari: 30, batas: 3000000, batas_prorata: 1500000, total: 0, status: 'hemat', keinginan_terbesar: null });
    expect(r.per_kategori).toEqual([]);
  });

  it('batas status: 80% Hemat, 100% Aman, di atasnya Boros', () => {
    const run = (n) => hitungRingkasan({ transaksi: [t('2026-11-10T05:00:00Z', n, 'jajan')], batasBelanja: 3000000, sumberBatas: 'rencana', now: NOW }).status;
    expect(run(1200000)).toBe('hemat');
    expect(run(1200001)).toBe('aman');
    expect(run(1500000)).toBe('aman');
    expect(run(1500001)).toBe('boros');
  });

  it('hanya menghitung keluar, berhasil, berkategori, dan di bulan WIB berjalan', () => {
    const r = hitungRingkasan({
      transaksi: [
        t('2026-11-10T05:00:00Z', 100000, 'makan'),
        t('2026-11-10T05:00:00Z', 50000, null),
        t('2026-11-10T05:00:00Z', 70000, 'jajan', { status: 'gagal' }),
        t('2026-11-10T05:00:00Z', 90000, 'jajan', { arah: 'masuk' }),
        t('2026-10-31T16:59:00Z', 40000, 'jajan'), // 31 Okt 23:59 WIB: bulan lalu
        t('2026-10-31T17:00:00Z', 30000, 'jajan') // 1 Nov 00:00 WIB: bulan ini
      ],
      batasBelanja: 3000000,
      sumberBatas: 'rencana',
      now: NOW
    });
    expect(r.total).toBe(130000);
    expect(r.total_kebutuhan).toBe(100000);
    expect(r.total_keinginan).toBe(30000);
  });

  it('per kategori urut terbesar dan Keinginan terbesar', () => {
    const r = hitungRingkasan({
      transaksi: [t('2026-11-02T05:00:00Z', 500000, 'tagihan'), t('2026-11-03T05:00:00Z', 80000, 'jajan'), t('2026-11-04T05:00:00Z', 120000, 'hiburan'), t('2026-11-05T05:00:00Z', 20000, 'jajan')],
      batasBelanja: 3000000,
      sumberBatas: 'pengeluaran_bulanan',
      now: NOW
    });
    expect(r.per_kategori.map((k) => [k.kategori, k.total])).toEqual([['tagihan', 500000], ['hiburan', 120000], ['jajan', 100000]]);
    expect(r.keinginan_terbesar).toEqual({ kategori: 'hiburan', label: 'Hiburan', total: 120000 });
  });

  it('sisa per hari dibulatkan ke bawah ke ribuan', () => {
    const r = hitungRingkasan({ transaksi: [t('2026-11-02T05:00:00Z', 1000000, 'makan')], batasBelanja: 3000000, sumberBatas: 'rencana', now: NOW });
    expect(r.sisa_hari).toBe(16);
    expect(r.sisa_batas).toBe(2000000);
    expect(r.sisa_per_hari).toBe(125000);
  });

  it('hari pertama dan hari terakhir bulan, termasuk Februari', () => {
    const awal = hitungRingkasan({ transaksi: [], batasBelanja: 2800000, sumberBatas: 'rencana', now: new Date('2027-01-31T17:30:00Z') }); // 1 Feb 00:30 WIB
    expect(awal).toMatchObject({ bulan: 'Februari 2027', hari_berjalan: 1, jumlah_hari: 28, batas_prorata: 100000, sisa_hari: 28 });
    const akhir = hitungRingkasan({ transaksi: [], batasBelanja: 2800000, sumberBatas: 'rencana', now: new Date('2027-02-28T16:00:00Z') }); // 28 Feb 23:00 WIB
    expect(akhir).toMatchObject({ hari_berjalan: 28, batas_prorata: 2800000, sisa_hari: 1 });
  });

  it('batas 0: Boros jika ada belanja', () => {
    expect(hitungRingkasan({ transaksi: [t('2026-11-02T05:00:00Z', 1000, 'jajan')], batasBelanja: 0, sumberBatas: 'rencana', now: NOW }).status).toBe('boros');
  });

  it('awalBulanWib', () => {
    expect(awalBulanWib(NOW).toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });
});

describe('renderRingkasan', () => {
  it('teks kartu deterministik', () => {
    const r = hitungRingkasan({
      transaksi: [t('2026-11-02T05:00:00Z', 500000, 'tagihan'), t('2026-11-03T05:00:00Z', 1500000, 'jajan')],
      batasBelanja: 3000000,
      sumberBatas: 'rencana',
      now: NOW
    });
    expect(renderRingkasan(r)).toBe(
      [
        'KARTU RINGKASAN BULANAN (dibuat 15 Nov 2026 12:00 WIB)',
        'Bulan: November 2026, hari ke-15 dari 30',
        'Total belanja: Rp 2.000.000 (Kebutuhan Rp 500.000, Keinginan Rp 1.500.000)',
        'Batas Belanja bulan ini: Rp 3.000.000 (dari Rencana Alokasi terakhir yang diterapkan)',
        'Batas sampai hari ini (pro-rata): Rp 1.500.000',
        'Pemakaian: 133% dari batas sampai hari ini',
        'Status Belanja: Boros',
        'Per kategori:',
        '- Jajan (Keinginan): Rp 1.500.000',
        '- Tagihan (Kebutuhan): Rp 500.000',
        'Keinginan terbesar: Jajan Rp 1.500.000',
        'Sisa Batas Belanja: Rp 1.000.000 untuk 16 hari lagi (sekitar Rp 62.000 per hari)'
      ].join('\n')
    );
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/ringkasan.test.js`
Expected: FAIL (modul tidak ada).

- [ ] **Step 3: Tulis `lib/ringkasan.js`**

```js
// Ringkasan Bulanan (spec 5.6, CONTEXT.md: Status Belanja). Fungsi murni: angka dihitung kode, bukan AI.
import { fmtWaktu, rp } from './format';
import { KATEGORI_BELANJA } from './kategori';

const WIB_MS = 7 * 60 * 60 * 1000;
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const STATUS_LABEL = { hemat: 'Hemat', aman: 'Aman', boros: 'Boros' };
const URUT = Object.keys(KATEGORI_BELANJA);

function bagianWib(now) {
  const d = new Date(now.getTime() + WIB_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), hari: d.getUTCDate() };
}

// Awal bulan berjalan menurut WIB, sebagai Date (UTC).
export function awalBulanWib(now) {
  const { y, m } = bagianWib(now);
  return new Date(Date.UTC(y, m, 1) - WIB_MS);
}

// transaksi: [{ waktu, arah, nominal, status, kategori_belanja }]. sumberBatas: 'rencana' | 'pengeluaran_bulanan'.
export function hitungRingkasan({ transaksi, batasBelanja, sumberBatas, now }) {
  const { y, m, hari } = bagianWib(now);
  const jumlahHari = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const awal = Date.UTC(y, m, 1) - WIB_MS;
  const akhir = now.getTime();

  const perKategori = {};
  for (const t of transaksi) {
    if (t.arah !== 'keluar' || t.status !== 'berhasil' || !KATEGORI_BELANJA[t.kategori_belanja]) continue;
    const w = new Date(t.waktu).getTime();
    if (w < awal || w > akhir) continue;
    perKategori[t.kategori_belanja] = (perKategori[t.kategori_belanja] || 0) + Number(t.nominal);
  }
  const daftar = Object.entries(perKategori)
    .map(([kategori, total]) => ({ kategori, label: KATEGORI_BELANJA[kategori].label, kelompok: KATEGORI_BELANJA[kategori].kelompok, total }))
    .sort((a, b) => b.total - a.total || URUT.indexOf(a.kategori) - URUT.indexOf(b.kategori));

  const total = daftar.reduce((a, k) => a + k.total, 0);
  const totalKebutuhan = daftar.filter((k) => k.kelompok === 'kebutuhan').reduce((a, k) => a + k.total, 0);
  const batas = Math.max(0, Math.round(Number(batasBelanja) || 0));
  const batasProrata = Math.round((batas * hari) / jumlahHari);
  const status = total * 100 <= 80 * batasProrata ? 'hemat' : total <= batasProrata ? 'aman' : 'boros';
  const keinginan = daftar.find((k) => k.kelompok === 'keinginan');
  const sisaHari = jumlahHari - hari + 1;
  const sisaBatas = Math.max(0, batas - total);

  return {
    dibuat_pada: now.toISOString(),
    bulan: `${BULAN_PANJANG[m]} ${y}`,
    hari_berjalan: hari,
    jumlah_hari: jumlahHari,
    sumber_batas: sumberBatas,
    batas,
    batas_prorata: batasProrata,
    total,
    total_kebutuhan: totalKebutuhan,
    total_keinginan: total - totalKebutuhan,
    persen: batasProrata ? Math.round((total * 100) / batasProrata) : 0,
    status,
    per_kategori: daftar,
    keinginan_terbesar: keinginan ? { kategori: keinginan.kategori, label: keinginan.label, total: keinginan.total } : null,
    sisa_batas: sisaBatas,
    sisa_hari: sisaHari,
    sisa_per_hari: Math.floor(sisaBatas / sisaHari / 1000) * 1000
  };
}

export const labelStatus = (s) => STATUS_LABEL[s] || s;

// Teks kartu untuk prompt (dibekukan saat disisipkan).
export function renderRingkasan(r) {
  const sumber = r.sumber_batas === 'rencana' ? 'dari Rencana Alokasi terakhir yang diterapkan' : 'dari Pengeluaran Bulanan, karena belum ada Rencana Alokasi yang diterapkan';
  const lines = [
    `KARTU RINGKASAN BULANAN (dibuat ${fmtWaktu(r.dibuat_pada)})`,
    `Bulan: ${r.bulan}, hari ke-${r.hari_berjalan} dari ${r.jumlah_hari}`,
    `Total belanja: ${rp(r.total)} (Kebutuhan ${rp(r.total_kebutuhan)}, Keinginan ${rp(r.total_keinginan)})`,
    `Batas Belanja bulan ini: ${rp(r.batas)} (${sumber})`,
    `Batas sampai hari ini (pro-rata): ${rp(r.batas_prorata)}`,
    `Pemakaian: ${r.persen}% dari batas sampai hari ini`,
    `Status Belanja: ${labelStatus(r.status)}`,
    'Per kategori:'
  ];
  if (!r.per_kategori.length) lines.push('- belum ada belanja');
  for (const k of r.per_kategori) lines.push(`- ${k.label} (${k.kelompok === 'kebutuhan' ? 'Kebutuhan' : 'Keinginan'}): ${rp(k.total)}`);
  lines.push(r.keinginan_terbesar ? `Keinginan terbesar: ${r.keinginan_terbesar.label} ${rp(r.keinginan_terbesar.total)}` : 'Keinginan terbesar: belum ada');
  lines.push(`Sisa Batas Belanja: ${rp(r.sisa_batas)} untuk ${r.sisa_hari} hari lagi (sekitar ${rp(r.sisa_per_hari)} per hari)`);
  return lines.join('\n');
}
```

Catatan: `sumber` di test memakai teks "dari Rencana Alokasi terakhir yang diterapkan". Teks untuk `pengeluaran_bulanan` tidak diuji persis.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/ringkasan.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ringkasan.js tests/ringkasan.test.js
git commit -m "feat(ringkasan): monthly spending summary with pro-rata Hemat/Aman/Boros status"
```

---

### Task 4: Validasi Catatan Pengeluaran dan data demo (`lib/pengeluaran.js`, `lib/demo.js`)

**Files:**
- Create: `lib/pengeluaran.js`
- Create: `lib/demo.js`
- Test: `tests/pengeluaran.test.js`
- Test: `tests/demo.test.js`

- [ ] **Step 1: Tulis test yang gagal `tests/pengeluaran.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { judulPengeluaran, periksaPengeluaran, renderKartuPengeluaran, renderPengeluaranBatal, renderPengeluaranDicatat } from '../lib/pengeluaran';

const args = (o) => JSON.stringify(o);

describe('periksaPengeluaran', () => {
  it('lolos jika nominal disebut nasabah', () => {
    expect(periksaPengeluaran(args({ barang: 'bakso', nominal: 25000, kategori: 'jajan' }), 'tadi jajan bakso 25 ribu')).toEqual({
      ok: true,
      data: { barang: 'Bakso', nominal: 25000, kategori: 'jajan' }
    });
  });
  it('nominal tidak disebut', () => {
    expect(periksaPengeluaran(args({ barang: 'bakso', nominal: 25000, kategori: 'jajan' }), 'tadi jajan bakso')).toEqual({ ok: false, alasan: 'nominal_tidak_disebut' });
  });
  it('kategori tidak dikenal menjadi lainnya', () => {
    expect(periksaPengeluaran(args({ barang: 'pulsa', nominal: 50000, kategori: 'pulsa' }), 'beli pulsa 50rb').data.kategori).toBe('lainnya');
  });
  it('argumen rusak, barang kosong, dan nominal tidak valid', () => {
    expect(periksaPengeluaran('{rusak', 'x')).toEqual({ ok: false, alasan: 'data_kurang' });
    expect(periksaPengeluaran(args({ barang: ' ', nominal: 25000, kategori: 'jajan' }), '25 ribu')).toEqual({ ok: false, alasan: 'data_kurang' });
    expect(periksaPengeluaran(args({ barang: 'x', nominal: 0, kategori: 'jajan' }), '0')).toEqual({ ok: false, alasan: 'data_kurang' });
    expect(periksaPengeluaran(args({ barang: 'x', nominal: 2.5, kategori: 'jajan' }), '2,5')).toEqual({ ok: false, alasan: 'data_kurang' });
  });
  it('nominal sebagai string angka diterima', () => {
    expect(periksaPengeluaran(args({ barang: 'kopi', nominal: '18000', kategori: 'jajan' }), 'kopi 18rb').ok).toBe(true);
  });
});

describe('teks', () => {
  const d = { barang: 'Bakso', nominal: 25000, kategori: 'jajan' };
  it('judul dan kartu', () => {
    expect(judulPengeluaran(d)).toBe('Rp 25.000 – Bakso (Jajan)');
    expect(renderKartuPengeluaran(d)).toBe(
      'KARTU CATATAN PENGELUARAN\nCatat Rp 25.000 – Bakso (Jajan)?\nBelum tercatat. Nasabah bisa menekan Catat atau menjawab "ya" untuk mencatatnya, atau menekan Batal.'
    );
  });
  it('pembaruan', () => {
    expect(renderPengeluaranDicatat(d, 9975000, '2026-11-24T07:12:00Z')).toBe(
      'Catatan Pengeluaran dicatat (24 Nov 2026 14:12 WIB): Rp 25.000 – Bakso (Jajan). Saldo Bebas sekarang Rp 9.975.000.'
    );
    expect(renderPengeluaranDicatat(d, null, '2026-11-24T07:12:00Z')).toBe('Catatan Pengeluaran dicatat (24 Nov 2026 14:12 WIB): Rp 25.000 – Bakso (Jajan).');
    expect(renderPengeluaranBatal(d, 'topik_lain', '2026-11-24T07:12:00Z')).toBe(
      'Catatan Pengeluaran Rp 25.000 – Bakso (Jajan) dibatalkan (24 Nov 2026 14:12 WIB) karena nasabah membahas hal lain. Belum ada yang tercatat.'
    );
  });
});
```

- [ ] **Step 2: Tulis test yang gagal `tests/demo.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { belanjaAcak, skenarioBoros } from '../lib/demo';
import { hitungRingkasan } from '../lib/ringkasan';
import { DAFTAR_KATEGORI } from '../lib/kategori';

const urutan = (vals) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('belanjaAcak', () => {
  it('menghasilkan satu belanja wajar dengan kategori valid dan kelipatan 500', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const b = belanjaAcak(urutan([r, r]));
      expect(DAFTAR_KATEGORI).toContain(b.kategori_belanja);
      expect(b.nominal % 500).toBe(0);
      expect(b.nominal).toBeGreaterThan(0);
      expect(b.pihak).toBeTruthy();
    }
  });
});

describe('skenarioBoros', () => {
  const NOW = new Date('2026-11-15T05:00:00Z');
  it.each([0, 600000, 2000000])('total awal %i -> setelah skenario Status Belanja Boros', (awal) => {
    const sebelum = hitungRingkasan({
      transaksi: awal ? [{ waktu: '2026-11-02T05:00:00Z', arah: 'keluar', nominal: awal, status: 'berhasil', kategori_belanja: 'makan' }] : [],
      batasBelanja: 3000000,
      sumberBatas: 'rencana',
      now: NOW
    });
    const daftar = skenarioBoros(sebelum);
    expect(daftar).toHaveLength(4);
    for (const x of daftar) {
      expect(x.nominal).toBeGreaterThan(0);
      expect(x.nominal % 1000).toBe(0);
      expect(['jajan', 'belanja', 'hiburan']).toContain(x.kategori_belanja);
    }
    const tambahan = daftar.reduce((a, x) => a + x.nominal, 0);
    expect(sebelum.total + tambahan).toBeGreaterThan(sebelum.batas_prorata);
    expect(tambahan).toBeGreaterThanOrEqual(200000);
  });
});
```

- [ ] **Step 3: Jalankan kedua test, pastikan gagal**

Run: `npx vitest run tests/pengeluaran.test.js tests/demo.test.js`
Expected: FAIL (modul tidak ada).

- [ ] **Step 4: Tulis `lib/pengeluaran.js`**

```js
// Catatan Pengeluaran (spec 5.5, ADR 0006, 0007): validasi argumen tool dan teks kartu serta pembaruan.
import { fmtWaktu, rp } from './format';
import { KATEGORI_BELANJA, labelKategori } from './kategori';
import { nominalDisebut } from './nominal';

const MAKS_NOMINAL = 100000000;
const MAKS_BARANG = 60;

const kapital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// argsJson: string argumen dari model. pesan: pesan Nasabah terakhir (nominal harus disebut di sini).
export function periksaPengeluaran(argsJson, pesan) {
  let a;
  try {
    a = JSON.parse(argsJson || '{}');
  } catch {
    return { ok: false, alasan: 'data_kurang' };
  }
  if (!a || typeof a !== 'object') return { ok: false, alasan: 'data_kurang' };
  const barang = String(a.barang ?? '').replace(/\s+/g, ' ').trim().slice(0, MAKS_BARANG);
  const nominal = typeof a.nominal === 'string' && /^\d+$/.test(a.nominal.trim()) ? Number(a.nominal.trim()) : a.nominal;
  if (!barang || !Number.isSafeInteger(nominal) || nominal <= 0 || nominal > MAKS_NOMINAL) return { ok: false, alasan: 'data_kurang' };
  if (!nominalDisebut(pesan, nominal)) return { ok: false, alasan: 'nominal_tidak_disebut' };
  const kategori = Object.hasOwn(KATEGORI_BELANJA, a.kategori) ? a.kategori : 'lainnya';
  return { ok: true, data: { barang: kapital(barang), nominal, kategori } };
}

export const judulPengeluaran = (d) => `${rp(d.nominal)} – ${d.barang} (${labelKategori(d.kategori)})`;

export function renderKartuPengeluaran(d) {
  return [
    'KARTU CATATAN PENGELUARAN',
    `Catat ${judulPengeluaran(d)}?`,
    'Belum tercatat. Nasabah bisa menekan Catat atau menjawab "ya" untuk mencatatnya, atau menekan Batal.'
  ].join('\n');
}

export function renderPengeluaranDicatat(d, saldoBebas, waktu) {
  const saldo = saldoBebas === null || saldoBebas === undefined ? '' : ` Saldo Bebas sekarang ${rp(saldoBebas)}.`;
  return `Catatan Pengeluaran dicatat (${fmtWaktu(waktu)}): ${judulPengeluaran(d)}.${saldo}`;
}

const SEBAB = {
  nasabah: 'karena ditolak nasabah',
  topik_lain: 'karena nasabah membahas hal lain',
  kedaluwarsa: 'karena tidak dikonfirmasi dalam 30 menit',
  saldo_kurang: 'karena Saldo Bebas tidak cukup'
};

export function renderPengeluaranBatal(d, sebab, waktu) {
  return `Catatan Pengeluaran ${judulPengeluaran(d)} dibatalkan (${fmtWaktu(waktu)}) ${SEBAB[sebab] || ''}. Belum ada yang tercatat.`.replace(' .', '.');
}
```

- [ ] **Step 5: Tulis `lib/demo.js`**

```js
// Data untuk tombol Panel Demo (spec 5.8). Fungsi murni: rand bisa diganti di test.

const MERCHANT = [
  { pihak: 'Kopi Senja', kategori_belanja: 'jajan', min: 18000, max: 55000 },
  { pihak: 'Martabak Bang Udin', kategori_belanja: 'jajan', min: 25000, max: 70000 },
  { pihak: 'Warung Makan Sederhana', kategori_belanja: 'makan', min: 15000, max: 45000 },
  { pihak: 'Ojek Online', kategori_belanja: 'transportasi', min: 12000, max: 60000 },
  { pihak: 'Minimarket Nusa', kategori_belanja: 'belanja', min: 20000, max: 150000 },
  { pihak: 'Bioskop Cinema Nusa', kategori_belanja: 'hiburan', min: 40000, max: 120000 }
];

// Satu Transaksi QRIS keluar dengan Kategori Belanja dan nominal acak yang wajar.
export function belanjaAcak(rand = Math.random) {
  const m = MERCHANT[Math.min(MERCHANT.length - 1, Math.floor(rand() * MERCHANT.length))];
  const nominal = Math.max(500, Math.round((m.min + rand() * (m.max - m.min)) / 500) * 500);
  return { pihak: m.pihak, kategori_belanja: m.kategori_belanja, nominal };
}

const BOROS = [
  { pihak: 'Toko Online Sepatu Lari', kategori_belanja: 'belanja', bobot: 35 },
  { pihak: 'Tiket Konser Musik', kategori_belanja: 'hiburan', bobot: 25 },
  { pihak: 'Kafe Kekinian', kategori_belanja: 'jajan', bobot: 15 },
  { pihak: 'Gadget Store', kategori_belanja: 'belanja', bobot: 25 }
];
const MIN_BOROS = 200000;

// Beberapa Transaksi Keinginan yang membuat total belanja 20% di atas batas pro-rata (Status Belanja Boros).
// ringkasan: hasil hitungRingkasan sebelum skenario.
export function skenarioBoros(ringkasan) {
  const target = Math.ceil((ringkasan.batas_prorata * 1.2 - ringkasan.total) / 1000) * 1000;
  const perlu = Math.max(MIN_BOROS, target);
  let terpakai = 0;
  return BOROS.map((b, i) => {
    const nominal = i === BOROS.length - 1 ? perlu - terpakai : Math.floor((perlu * b.bobot) / 100 / 1000) * 1000;
    terpakai += nominal;
    return { pihak: b.pihak, kategori_belanja: b.kategori_belanja, nominal };
  });
}
```

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/pengeluaran.test.js tests/demo.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/pengeluaran.js lib/demo.js tests/pengeluaran.test.js tests/demo.test.js
git commit -m "feat(pengeluaran): validate expense tool arguments, card texts, and demo spending generators"
```

---

### Task 5: Parser SSE dan prompt v3 dengan tool (`lib/sse.js`, `lib/prompt.js`)

**Files:**
- Modify: `lib/sse.js`
- Modify: `lib/prompt.js`
- Test: `tests/sse.test.js`, `tests/prompt.test.js`

- [ ] **Step 1: Tambahkan test SSE (di akhir `describe('createSseParser')` dan describe baru)**

```js
  it('meneruskan potongan tool_calls dan event nusa', () => {
    const p = createSseParser();
    expect(
      p.push(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"catat_pengeluaran","arguments":"{\\"barang\\""}}]}}]}\n' +
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"Bakso\\"}"}}]}}]}\n' +
          'data: {"nusa":{"pesan":{"id":5,"role":"pembaruan"}}}\n'
      )
    ).toEqual([
      { toolCall: { index: 0, id: 'call_1', name: 'catat_pengeluaran', arguments: '{"barang"' } },
      { toolCall: { index: 0, id: '', name: '', arguments: ':"Bakso"}' } },
      { nusa: { pesan: { id: 5, role: 'pembaruan' } } }
    ]);
  });
```

```js
describe('createToolCallCollector', () => {
  it('merakit potongan menjadi panggilan utuh per index', () => {
    const c = createToolCallCollector();
    c.push({ index: 0, id: 'call_1', name: 'catat_pengeluaran', arguments: '{"a"' });
    c.push({ index: 0, id: '', name: '', arguments: ':1}' });
    c.push({ index: 1, id: 'call_2', name: 'minta_ringkasan', arguments: '{}' });
    expect(c.list()).toEqual([
      { id: 'call_1', name: 'catat_pengeluaran', arguments: '{"a":1}' },
      { id: 'call_2', name: 'minta_ringkasan', arguments: '{}' }
    ]);
  });
  it('kosong jika tidak ada panggilan', () => {
    expect(createToolCallCollector().list()).toEqual([]);
  });
});
```

Ubah import di atas file test menjadi `import { createSseParser, createToolCallCollector } from '../lib/sse';`.

- [ ] **Step 2: Ubah `lib/sse.js`**

Ganti komentar kedua di atas dan isi loop setelah blok `if (j.error) {...}`. Hasil akhir file:

```js
// Parser stream SSE format OpenAI (dipakai Netra). Dipakai /api/chat (server) dan lib/api.js (browser).
// push(teks) mengembalikan daftar event: { text } | { usage } | { error } | { done } | { toolCall } | { nusa }.
// nusa: event dari server kita sendiri (baris yang disisipkan server di tengah giliran), bukan dari Netra.

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
        if (j.nusa) {
          events.push({ nusa: j.nusa });
          continue;
        }
        const d = j.choices && j.choices[0] && j.choices[0].delta;
        if (d && typeof d.content === 'string' && d.content) events.push({ text: d.content });
        if (d && Array.isArray(d.tool_calls)) {
          for (const tc of d.tool_calls) {
            const f = tc.function || {};
            events.push({ toolCall: { index: tc.index ?? 0, id: tc.id || '', name: f.name || '', arguments: f.arguments || '' } });
          }
        }
        if (j.usage) events.push({ usage: j.usage });
      }
      return events;
    }
  };
}

// Merakit potongan tool_calls dari stream menjadi panggilan utuh: [{ id, name, arguments }].
export function createToolCallCollector() {
  const slots = [];
  return {
    push(tc) {
      const s = (slots[tc.index] ||= { id: '', name: '', arguments: '' });
      if (tc.id) s.id = tc.id;
      if (tc.name) s.name += tc.name;
      if (tc.arguments) s.arguments += tc.arguments;
    },
    list() {
      return slots.filter((s) => s && s.name);
    }
  };
}
```

- [ ] **Step 3: Tambahkan test prompt (di `tests/prompt.test.js`)**

Tambahkan import `toolsFor` ke baris import `../lib/prompt`. Tambahkan:

```js
describe('prompt v3 dengan tool', () => {
  const s3 = { system_prompt_version: 3, snapshot: buildSnapshot(snapshotInput) };
  const calls = [{ id: 'call_1', name: 'catat_pengeluaran', arguments: '{"barang":"Bakso","nominal":25000,"kategori":"jajan"}' }];
  const riwayat = [
    { id: 1, role: 'user', content: 'tadi jajan bakso 25 ribu', created_at: '2026-11-24T07:12:00Z' },
    { id: 2, role: 'assistant', content: '', tool: { calls }, created_at: '2026-11-24T07:12:01Z' },
    { id: 3, role: 'tool', content: '{"status":"menunggu_konfirmasi"}', tool: { id: 'call_1', name: 'catat_pengeluaran' }, created_at: '2026-11-24T07:12:02Z' },
    { id: 4, role: 'assistant', content: 'Catat Rp 25.000 untuk Bakso?', created_at: '2026-11-24T07:12:03Z' }
  ];

  it('assistant dengan tool call dan hasil tool dirender format OpenAI', () => {
    const p = buildPromptMessages({ session: s3, history: riwayat });
    expect(p[3]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'catat_pengeluaran', arguments: calls[0].arguments } }]
    });
    expect(p[4]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"status":"menunggu_konfirmasi"}' });
    expect(p[5]).toEqual({ role: 'assistant', content: 'Catat Rp 25.000 untuk Bakso?' });
  });

  it('versi 3 punya tool, versi lama tidak', () => {
    expect(SYSTEM_PROMPT_VERSION).toBe(3);
    expect(toolsFor(3).map((t) => t.function.name)).toEqual(['catat_pengeluaran', 'minta_ringkasan']);
    expect(toolsFor(1)).toBeNull();
    expect(toolsFor(2)).toBeNull();
  });

  it('teks system prompt v1 dan v2 tidak berubah (prefix sesi lama)', () => {
    expect(systemPromptFor(1)).toMatch(/^Kamu adalah Agent Nusa, asisten virtual customer service Bank Nusa \(bank fiktif untuk demo\)\.\n/);
    expect(systemPromptFor(2)).toContain('Angka Rencana Alokasi dihitung oleh Aturan Alokasi bank');
    expect(systemPromptFor(2)).not.toContain('catat_pengeluaran');
    expect(systemPromptFor(3)).toContain('catat_pengeluaran');
  });
});
```

Sebelum mengubah `lib/prompt.js`, simpan salinan teks v1 dan v2 yang sekarang (misalnya `git show HEAD:lib/prompt.js`). Setelah perubahan, pastikan v1 dan v2 identik byte per byte (`git diff` hanya menambah baris, tidak mengubah baris v1 dan v2).

- [ ] **Step 4: Ubah `lib/prompt.js`**

1. Tambahkan `3:` ke `SYSTEM_PROMPTS` **setelah** entri `2` tanpa menyentuh entri 1 dan 2:

```js
  3: [
    'Kamu adalah Agent Nusa, asisten virtual customer service Bank Nusa (bank fiktif untuk demo) yang juga mendampingi nasabah mengelola keuangan.',
    'Jawab dalam Bahasa Indonesia yang sopan dan ringkas (maksimal 4 kalimat). Tulis teks biasa, tanpa markdown, tanpa tabel.',
    'Gunakan hanya informasi dari DATA KEUANGAN NASABAH, KARTU yang ditampilkan ke nasabah, hasil tool, PEMBARUAN DATA, LAMPIRAN DARI NASABAH, dan INFO LAYANAN. Jika informasi tidak ada, katakan tidak tahu dan tawarkan untuk menghubungkan ke agen manusia.',
    'DATA KEUANGAN NASABAH dibekukan saat percakapan dimulai. PEMBARUAN DATA berisi perubahan sesudahnya dan lebih baru. Jika nasabah menanyakan data terbaru yang tidak ada, sebutkan waktu data itu dan sarankan menekan tombol "Chat baru".',
    'Setiap pesan nasabah diawali cap [waktu: ...] yang menunjukkan kapan pesan itu dikirim. Jangan menyebut cap itu kecuali relevan.',
    'Kantong adalah sub-saldo di rekening yang sama untuk Dana Darurat, Goal, Investasi, dan Sosial. Saldo Bebas adalah Saldo Total dikurangi isi Kantong, dan hanya Saldo Bebas yang bisa dipakai.',
    'Angka Rencana Alokasi dihitung oleh Aturan Alokasi bank, bukan olehmu. Jangan menghitung ulang atau mengusulkan angka lain. Jika nasabah ingin mengubah pembagian, arahkan untuk mengubah angka di kartu Rencana lalu menekan Terapkan.',
    'Jika nasabah menceritakan pengeluaran yang sudah terjadi beserta nominalnya, misalnya "tadi jajan bakso 25 ribu", panggil tool catat_pengeluaran dengan nominal persis seperti yang disebut nasabah. Jika nominalnya belum disebut, tanyakan dulu dan jangan menebak.',
    'Kategori pengeluaran: makan untuk makan berat dan bahan makanan, jajan untuk camilan, kopi, dan minuman, belanja untuk barang, transportasi, tagihan, hiburan, atau lainnya.',
    'Setelah KARTU CATATAN PENGELUARAN muncul, ulangi barang dan nominalnya, lalu minta nasabah menekan Catat atau menjawab ya. Jangan mengatakan pengeluaran sudah tercatat sebelum ada PEMBARUAN DATA yang menyatakannya.',
    'Jika nasabah menanyakan kondisi atau ringkasan belanja bulan ini, panggil tool minta_ringkasan, lalu jelaskan KARTU RINGKASAN BULANAN tanpa menghitung ulang.',
    'Jika Status Belanja Boros, sebut Keinginan terbesar dan sarankan cara berhemat sampai akhir bulan dengan angka sisa per hari dari kartu. Jika Hemat atau Aman, puji pengelolaan belanja nasabah.',
    'Jangan pernah meminta atau menerima PIN, password, CVV, atau kode OTP di chat. Jika nasabah mengetikkannya, ingatkan agar tidak membagikannya.',
    'Untuk kartu hilang, dugaan penipuan, dana hilang, atau komplain berat, arahkan nasabah menekan tombol "Hubungi agen" di atas chat.',
    'Jangan pernah mengarang nominal: sebut angka hanya jika tertulis di data, kartu, atau hasil tool. Jangan menawarkan atau merekomendasikan produk investasi tertentu.',
    'Kamu tidak bisa melakukan transaksi nyata; jelaskan langkah-langkahnya saja.',
    'Selalu sebut tanggal dan jam data yang kamu rujuk.',
    '',
    'INFO LAYANAN',
    'Transfer BI-FAST Rp 2.500 per transaksi, limit Rp 250.000.000 per transaksi, layanan 24 jam. Transfer SKN Rp 3.500, diproses jam kerja. QRIS tanpa biaya untuk nasabah.'
  ].join('\n')
```

2. Ubah `export const SYSTEM_PROMPT_VERSION = 2;` menjadi `3`.

3. Tambahkan setelah `systemPromptFor`:

```js
// Definisi tool statis yang ikut berversi bersama system prompt (ADR 0006). Tool hanya mengenali niat dan mengambil data.
const TOOLS = {
  3: [
    {
      type: 'function',
      function: {
        name: 'catat_pengeluaran',
        description: 'Menyiapkan Catatan Pengeluaran dari cerita nasabah. Hanya dipanggil jika nasabah sendiri menyebut nominalnya. Pengeluaran baru tercatat setelah nasabah mengonfirmasi.',
        parameters: {
          type: 'object',
          properties: {
            barang: { type: 'string', description: 'Nama barang atau keperluan, singkat' },
            nominal: { type: 'integer', description: 'Nominal dalam rupiah, persis seperti yang disebut nasabah' },
            kategori: { type: 'string', enum: ['makan', 'jajan', 'belanja', 'transportasi', 'tagihan', 'hiburan', 'lainnya'] }
          },
          required: ['barang', 'nominal', 'kategori']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'minta_ringkasan',
        description: 'Mengambil Ringkasan Bulanan belanja nasabah bulan berjalan: total per kategori dan Status Belanja Hemat, Aman, atau Boros.',
        parameters: { type: 'object', properties: {} }
      }
    }
  ]
};

// null = sesi versi ini tidak memakai tool (definisi tool mengubah prefix, jadi sesi lama tetap tanpa tool).
export function toolsFor(version) {
  return TOOLS[version] || null;
}
```

4. Ubah `renderStored` untuk `assistant` dan tambahkan `tool`:

```js
  if (m.role === 'assistant') {
    if (m.tool && Array.isArray(m.tool.calls) && m.tool.calls.length) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.tool.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } }))
      };
    }
    return { role: 'assistant', content: m.content };
  }
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool && m.tool.id, content: m.content };
```

5. Perbarui komentar kepala file: tambahkan baris "Sesi versi 3 juga mengirim definisi tool (toolsFor). Panggilan tool dan hasilnya ada di riwayat sebagai baris assistant (tool.calls) dan tool."

- [ ] **Step 5: Jalankan semua test**

Run: `npm test`
Expected: PASS. Test lama di `tests/prompt.test.js` memakai `SYSTEM_PROMPT_VERSION`, jadi otomatis memakai v3. Jika ada test lama yang mengasumsikan versi 2 secara spesifik, sesuaikan supaya tetap menguji v2 dengan nomor `2` eksplisit, bukan menghapusnya.

- [ ] **Step 6: Commit**

```bash
git add lib/sse.js lib/prompt.js tests/sse.test.js tests/prompt.test.js
git commit -m "feat(prompt): system prompt v3 with static expense and summary tools, render tool calls in history"
```

---

### Task 6: Migrasi database Tahap 3

**Files:**
- Create: `supabase/migrations/20261127000001_pengeluaran.sql`

Tidak ada test otomatis untuk SQL. Verifikasi dilakukan di Task 12 setelah pemilik repo menjalankan migrasi di SQL Editor Supabase. Penulis migrasi **tidak boleh** menjalankan SQL ke database (tidak ada akses).

- [ ] **Step 1: Tulis migrasi**

```sql
-- Tahap 3: Catatan Pengeluaran dan Ringkasan Bulanan. Lihat docs/specs/agent-keuangan.md bagian 5.5, 5.6, 5.8, 8 dan ADR 0006, 0007.
-- Jalankan setelah 20261124000001_fondasi.sql dan 20261126000001_alokasi.sql.

-- Kategori Belanja (CONTEXT.md). Diisi untuk Transaksi keluar yang dihitung sebagai belanja.
alter table public.transactions add column kategori_belanja text
  check (kategori_belanja in ('makan', 'jajan', 'belanja', 'transportasi', 'tagihan', 'hiburan', 'lainnya'));

-- Transaksi seed yang sudah ada diberi Kategori Belanja (pemetaan sama dengan seed_data_demo di bawah).
update public.transactions set kategori_belanja = case pihak
    when 'Sewa kos Bu Ratna' then 'tagihan'
    when 'Token Listrik PLN' then 'tagihan'
    when 'Internet Rumah' then 'tagihan'
    when 'Belanja Bulanan Supermarket' then 'makan'
    when 'Top up Dompet Digital' then 'lainnya'
    when 'Tagihan Kartu Kredit' then 'tagihan'
    when 'Kopi Senja' then 'jajan'
    when 'Warung Makan Sederhana' then 'makan'
    when 'Toko Buku Pelangi' then 'belanja'
    when 'Bakso Pak Kumis' then 'jajan'
  end
where arah = 'keluar' and status = 'berhasil' and kategori_belanja is null;

-- Aksi Tertunda (ADR 0007): perubahan uang dari percakapan yang menunggu konfirmasi Nasabah.
create table public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  jenis text not null check (jenis in ('catat_pengeluaran', 'beli_produk')),
  data jsonb not null, -- catat_pengeluaran: { barang, nominal, kategori }
  status text not null default 'menunggu' check (status in ('menunggu', 'dijalankan', 'batal')),
  transaction_id uuid references public.transactions (id) on delete set null,
  kedaluwarsa_at timestamptz not null default now() + interval '30 minutes',
  diputuskan_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index pending_actions_satu_menunggu on public.pending_actions (session_id) where status = 'menunggu';
create index pending_actions_user on public.pending_actions (user_id, created_at desc);

alter table public.pending_actions enable row level security;
create policy "baca milik sendiri" on public.pending_actions for select to authenticated using ((select auth.uid()) = user_id);

-- Panggilan tool dan hasilnya disimpan di riwayat (spec bagian 7).
-- assistant: tool = { calls: [{ id, name, arguments }] }. tool: tool = { id, name }, content = hasil tool, card = kartu.
alter table public.chat_messages add column tool jsonb;
alter table public.chat_messages drop constraint chat_messages_role_check;
alter table public.chat_messages add constraint chat_messages_role_check
  check (role in ('user', 'assistant', 'lampiran', 'pembaruan', 'kartu', 'tool'));

-- ingest_transaksi mendapat parameter Kategori Belanja. Signature berubah, jadi fungsi lama dihapus lalu dibuat ulang.
drop function public.ingest_transaksi(uuid, text, bigint, text, text, text, text);
create function public.ingest_transaksi(
  p_user uuid,
  p_arah text,
  p_nominal bigint,
  p_kategori text,
  p_pihak text,
  p_kanal text,
  p_catatan text default null,
  p_kategori_belanja text default null
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
  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, catatan, kategori_belanja)
    values (v_acc, p_user, p_arah, p_nominal, p_kategori, p_pihak, p_kanal, p_catatan, p_kategori_belanja)
    returning id into v_id;
  return v_id;
end;
$$;

-- Menjalankan Aksi Tertunda yang sudah dikonfirmasi. Status, kedaluwarsa, saldo, dan Transaksi dicek dan ditulis atomik.
create function public.jalankan_aksi(p_user uuid, p_aksi uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aksi public.pending_actions%rowtype;
  v_tx uuid;
begin
  perform 1 from public.accounts where user_id = p_user for update;
  select * into v_aksi from public.pending_actions where id = p_aksi and user_id = p_user for update;
  if not found then
    raise exception 'AKSI_TIDAK_ADA';
  end if;
  if v_aksi.status <> 'menunggu' then
    raise exception 'AKSI_SUDAH_DIPUTUSKAN';
  end if;
  if v_aksi.kedaluwarsa_at <= now() then
    raise exception 'AKSI_KEDALUWARSA';
  end if;
  if v_aksi.jenis = 'catat_pengeluaran' then
    v_tx := public.ingest_transaksi(p_user, 'keluar', (v_aksi.data ->> 'nominal')::bigint, 'catatan',
      v_aksi.data ->> 'barang', 'Catatan', null, v_aksi.data ->> 'kategori');
  else
    raise exception 'AKSI_TIDAK_DIDUKUNG';
  end if;
  update public.pending_actions set status = 'dijalankan', transaction_id = v_tx, diputuskan_at = now() where id = p_aksi;
  return v_tx;
end;
$$;

-- Seed dengan Kategori Belanja. Nominal dan waktu sama persis dengan Tahap 2 (saldo akhir tetap Rp 24.380.500).
create or replace function public.seed_data_demo(p_user uuid) returns void
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
    insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, waktu, kategori_belanja) values
      (v_acc, p_user, 'keluar', 3500000, 'transfer', 'Sewa kos Bu Ratna', 'BI-FAST', v_bulan + interval '1 day 9 hours', 'tagihan'),
      (v_acc, p_user, 'keluar', 205000, 'tagihan', 'Token Listrik PLN', 'Pembayaran', v_bulan + interval '4 days 9 hours 15 minutes', 'tagihan'),
      (v_acc, p_user, 'keluar', 350000, 'tagihan', 'Internet Rumah', 'Autodebet', v_bulan + interval '5 days 7 hours', 'tagihan'),
      (v_acc, p_user, 'keluar', 1800000, 'belanja', 'Belanja Bulanan Supermarket', 'Kartu Debit', v_bulan + interval '7 days 19 hours', 'makan'),
      (v_acc, p_user, 'keluar', 100000, 'topup', 'Top up Dompet Digital', 'Top up', v_bulan + interval '11 days 19 hours 33 minutes', 'lainnya'),
      (v_acc, p_user, 'keluar', 2750000, 'tagihan', 'Tagihan Kartu Kredit', 'Autodebet', v_bulan + interval '12 days 20 hours 5 minutes', 'tagihan'),
      (v_acc, p_user, 'keluar', 47500, 'qris', 'Kopi Senja', 'QRIS', v_bulan + interval '15 days 18 hours 40 minutes', 'jajan'),
      (v_acc, p_user, 'keluar', 85000, 'qris', 'Warung Makan Sederhana', 'QRIS', v_bulan + interval '17 days 12 hours 10 minutes', 'makan'),
      (v_acc, p_user, 'keluar', 120000, 'qris', 'Toko Buku Pelangi', 'QRIS', v_bulan + interval '19 days 16 hours', 'belanja'),
      (v_acc, p_user, 'keluar', 62000, 'qris', 'Bakso Pak Kumis', 'QRIS', v_bulan + interval '21 days 19 hours', 'jajan'),
      (v_acc, p_user, 'masuk', 12500000, 'payroll', 'Gaji PT Nusantara Digital', 'Kredit', v_bulan + interval '24 days 1 hour', null);
  end loop;

  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, status, catatan, waktu)
    values (v_acc, p_user, 'keluar', 500000, 'transfer', 'Transfer ke Rina Wijaya', 'BI-FAST', 'gagal',
            'gagal karena gangguan di bank tujuan; dana dikembalikan ke rekening', now() - interval '1 day');

  insert into public.goals (user_id, nama, is_dana_darurat, kelipatan_target) values (p_user, 'Dana Darurat', true, 6);
  insert into public.allocation_rules (user_id) values (p_user);
end;
$$;

-- Reset data demo juga menghapus Aksi Tertunda.
create or replace function public.reset_demo(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.pending_actions where user_id = p_user;
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
revoke execute on function public.ingest_transaksi(uuid, text, bigint, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.jalankan_aksi(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.seed_data_demo(uuid) from public, anon, authenticated;
revoke execute on function public.reset_demo(uuid) from public, anon, authenticated;
grant execute on function public.ingest_transaksi(uuid, text, bigint, text, text, text, text, text) to service_role;
grant execute on function public.jalankan_aksi(uuid, uuid) to service_role;
grant execute on function public.reset_demo(uuid) to service_role;
```

- [ ] **Step 2: Periksa ulang dengan mata**

Bandingkan isi loop `seed_data_demo` dengan versi Tahap 2 (`supabase/migrations/20261126000001_alokasi.sql` baris 196–234). Nominal, pihak, kanal, dan interval harus sama persis. Yang berubah hanya kolom `kategori_belanja` yang ditambahkan.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261127000001_pengeluaran.sql
git commit -m "feat(db): spending categories, pending actions, tool messages and jalankan_aksi"
```

---

### Task 7: Helper server (Netra, error DB, data Nasabah, ingest, ringkasan, Aksi Tertunda, dan tool)

**Files:**
- Modify: `lib/server/netra.js`, `lib/server/http.js`, `lib/server/nasabah.js`, `lib/server/ingest.js`
- Create: `lib/server/ringkasan.js`, `lib/server/aksi.js`, `lib/server/alat.js`

Tidak ada unit test (I/O ke Supabase). Logika murni sudah diuji di Task 1–4. Verifikasi dengan `npm run build` dan Task 12.

- [ ] **Step 1: `lib/server/netra.js`**: tambahkan opsi `tools`

Ubah tanda tangan menjadi `panggilNetra(messages, { stream = false, signal, maxTokens = 600, tools = null } = {})`, lalu tambahkan ke body setelah `stream,`:

```js
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
```

- [ ] **Step 2: `lib/server/http.js`**: tambahkan ke `PESAN_DB`

```js
  AKSI_TIDAK_ADA: [404, 'Aksi tidak ditemukan.'],
  AKSI_SUDAH_DIPUTUSKAN: [409, 'Aksi ini sudah dicatat atau dibatalkan.'],
  AKSI_KEDALUWARSA: [409, 'Aksi ini sudah kedaluwarsa. Ceritakan lagi pengeluarannya kalau mau dicatat.'],
  AKSI_TIDAK_DIDUKUNG: [400, 'Jenis aksi ini belum didukung.'],
```

- [ ] **Step 3: `lib/server/nasabah.js`**: tambahkan `kategori_belanja` ke select transaksi

`'waktu, arah, nominal, pihak, kanal, status, catatan, kategori_belanja'`

Snapshot tidak berubah, karena `buildSnapshot` hanya mengambil field yang ia kenal.

- [ ] **Step 4: `lib/server/ingest.js`**: teruskan Kategori Belanja

Tambahkan `p_kategori_belanja: t.kategori_belanja ?? null` ke argumen `rpc('ingest_transaksi', ...)`. Ubah komentar `t:` menjadi `{ arah, nominal, kategori, pihak, kanal, catatan?, kategori_belanja? }`.

- [ ] **Step 5: `lib/server/ringkasan.js`**

```js
import { pengeluaranBulanan } from '../keuangan';
import { hitungRingkasan } from '../ringkasan';
import { muatKeuangan } from './nasabah';

// Ringkasan Bulanan satu Nasabah (spec 5.6). Batas Belanja = Pengeluaran Wajib + Keinginan dari Rencana terakhir
// yang diterapkan, atau Pengeluaran Bulanan jika belum ada (CONTEXT.md: Batas Belanja).
export async function muatRingkasan(admin, userId, now = new Date()) {
  const [d, { data: plan, error }] = await Promise.all([
    muatKeuangan(admin, userId),
    admin
      .from('allocation_plans')
      .select('rincian')
      .eq('user_id', userId)
      .eq('status', 'diterapkan')
      .order('diputuskan_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);
  if (error) throw new Error(error.message);
  let batasBelanja;
  let sumberBatas;
  if (plan) {
    batasBelanja = plan.rincian.pos.filter((p) => p.kunci === 'wajib' || p.kunci === 'keinginan').reduce((a, p) => a + Number(p.nominal), 0);
    sumberBatas = 'rencana';
  } else {
    batasBelanja = pengeluaranBulanan(d.transactions, d.profile.pengeluaran_bulanan_koreksi, now);
    sumberBatas = 'pengeluaran_bulanan';
  }
  return hitungRingkasan({ transaksi: d.transactions, batasBelanja, sumberBatas, now });
}
```

- [ ] **Step 6: `lib/server/aksi.js`**

```js
import { jenisJawaban } from '../konfirmasi';
import { renderPengeluaranBatal, renderPengeluaranDicatat } from '../pengeluaran';

// Aksi Tertunda (ADR 0007). Uang berubah hanya lewat jalankan_aksi setelah Nasabah mengonfirmasi.
export const KOLOM_AKSI = 'id, user_id, session_id, jenis, data, status, kedaluwarsa_at';
const KOLOM_PESAN = 'id, role, content, card, created_at';

export const kedaluwarsa = (aksi, now = new Date()) => new Date(aksi.kedaluwarsa_at) <= now;

export async function aksiMenunggu(admin, sessionId) {
  const { data } = await admin.from('pending_actions').select(KOLOM_AKSI).eq('session_id', sessionId).eq('status', 'menunggu').maybeSingle();
  return data || null;
}

// Pesan pembaruan di akhir sesi. Mengembalikan barisnya (untuk dikirim ke browser) atau null jika gagal.
async function tambahPembaruan(admin, aksi, content) {
  const { data, error } = await admin
    .from('chat_messages')
    .insert({ session_id: aksi.session_id, user_id: aksi.user_id, role: 'pembaruan', content })
    .select(KOLOM_PESAN)
    .single();
  if (error) {
    console.error('[aksi] pesan pembaruan gagal disimpan:', error.message);
    return null;
  }
  await admin.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', aksi.session_id);
  return data;
}

// sebab: 'nasabah' | 'topik_lain' | 'kedaluwarsa' | 'saldo_kurang'. Mengembalikan baris pembaruan, atau null jika aksi
// sudah diputuskan di tempat lain (tombol di tab lain) sehingga tidak ada yang dibatalkan.
export async function batalkanAksi(admin, aksi, sebab) {
  const now = new Date().toISOString();
  const { data } = await admin.from('pending_actions').update({ status: 'batal', diputuskan_at: now }).eq('id', aksi.id).eq('status', 'menunggu').select('id');
  if (!data || !data.length) return null;
  return tambahPembaruan(admin, aksi, renderPengeluaranBatal(aksi.data, sebab, now));
}

// Menjalankan aksi (error dari Postgres dilempar apa adanya untuk failDb). Mengembalikan baris pembaruan.
export async function jalankanAksi(admin, aksi) {
  const { error } = await admin.rpc('jalankan_aksi', { p_user: aksi.user_id, p_aksi: aksi.id });
  if (error) throw new Error(error.message);
  // Uang sudah berubah: kegagalan membaca saldo hanya menghilangkan kalimat saldo di pembaruan.
  const { data: saldo } = await admin.from('v_saldo_bebas').select('saldo_bebas').eq('user_id', aksi.user_id).maybeSingle();
  return tambahPembaruan(admin, aksi, renderPengeluaranDicatat(aksi.data, saldo ? Number(saldo.saldo_bebas) : null, new Date().toISOString()));
}

// Jawaban Nasabah di giliran berikutnya: "ya" menjalankan aksi, selain itu membatalkannya (spec 5.5).
// Mengembalikan baris pembaruan yang disisipkan, atau null.
export async function putuskanDariJawaban(admin, aksi, pesan) {
  if (kedaluwarsa(aksi)) return batalkanAksi(admin, aksi, 'kedaluwarsa');
  const jawaban = jenisJawaban(pesan);
  if (jawaban !== 'ya') return batalkanAksi(admin, aksi, jawaban === 'tidak' ? 'nasabah' : 'topik_lain');
  try {
    return await jalankanAksi(admin, aksi);
  } catch (e) {
    const msg = (e && e.message) || '';
    if (msg.includes('SALDO_BEBAS_KURANG')) return batalkanAksi(admin, aksi, 'saldo_kurang');
    if (msg.includes('AKSI_KEDALUWARSA')) return batalkanAksi(admin, aksi, 'kedaluwarsa');
    if (!msg.includes('AKSI_SUDAH_DIPUTUSKAN')) console.error('[aksi] gagal dijalankan:', msg);
    return null;
  }
}
```

- [ ] **Step 7: `lib/server/alat.js`**

```js
import { periksaPengeluaran, renderKartuPengeluaran } from '../pengeluaran';
import { renderRingkasan } from '../ringkasan';
import { rp } from '../format';
import { muatRingkasan } from './ringkasan';

// Menjalankan satu panggilan tool (ADR 0006): tool hanya mengenali niat dan mengambil data. Server yang memvalidasi,
// menyiapkan Aksi Tertunda, dan menghitung angka. Hasil: { content: string JSON (hasil tool), card: object | null }.
// ctx: { userId, sessionId, pesan } dengan pesan = pesan Nasabah giliran ini.

const hasil = (obj, card = null) => ({ content: JSON.stringify(obj), card });

export const hasilGagal = () => hasil({ status: 'gagal', instruksi: 'Sampaikan bahwa sistem sedang gangguan dan minta nasabah mencoba lagi sebentar lagi.' });

async function catatPengeluaran(admin, ctx, call) {
  const cek = periksaPengeluaran(call.arguments, ctx.pesan);
  if (!cek.ok && cek.alasan === 'nominal_tidak_disebut') {
    return hasil({ status: 'nominal_tidak_disebut', instruksi: 'Nominal itu tidak disebut nasabah. Tanyakan berapa nominalnya dan jangan menebak.' });
  }
  if (!cek.ok) return hasil({ status: 'data_kurang', instruksi: 'Tanyakan barang dan nominal pengeluarannya.' });

  const { data: saldo } = await admin.from('v_saldo_bebas').select('saldo_bebas').eq('user_id', ctx.userId).maybeSingle();
  if (saldo && Number(saldo.saldo_bebas) < cek.data.nominal) {
    return hasil({ status: 'saldo_bebas_kurang', saldo_bebas: rp(saldo.saldo_bebas), instruksi: 'Sampaikan bahwa Saldo Bebas tidak cukup untuk mencatat pengeluaran ini.' });
  }

  // Paling banyak satu Aksi Tertunda per sesi: sisa aksi lama (jika ada) dibatalkan diam-diam.
  await admin.from('pending_actions').update({ status: 'batal', diputuskan_at: new Date().toISOString() }).eq('session_id', ctx.sessionId).eq('status', 'menunggu');
  const { data: aksi, error } = await admin
    .from('pending_actions')
    .insert({ user_id: ctx.userId, session_id: ctx.sessionId, jenis: 'catat_pengeluaran', data: cek.data })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return hasil({ status: 'menunggu_konfirmasi', kartu: renderKartuPengeluaran(cek.data) }, { jenis: 'pengeluaran', action_id: aksi.id });
}

async function mintaRingkasan(admin, ctx) {
  const r = await muatRingkasan(admin, ctx.userId);
  return hasil({ status: 'ok', kartu: renderRingkasan(r) }, { jenis: 'ringkasan', data: r });
}

// pertama: hanya panggilan pertama di satu giliran yang dijalankan.
export async function jalankanAlat(admin, ctx, call, { pertama }) {
  if (!pertama) return hasil({ status: 'diabaikan', instruksi: 'Hanya satu permintaan yang diproses per giliran.' });
  if (call.name === 'catat_pengeluaran') return catatPengeluaran(admin, ctx, call);
  if (call.name === 'minta_ringkasan') return mintaRingkasan(admin, ctx);
  return hasil({ status: 'tidak_dikenal' });
}
```

- [ ] **Step 8: Build dan test**

Run: `npm test` lalu `npm run build`
Expected: test PASS dan build berhasil (route lama masih memakai `panggilNetra` tanpa `tools`, jadi tetap kompatibel).

- [ ] **Step 9: Commit**

```bash
git add lib/server
git commit -m "feat(server): pending action helpers, expense and summary tool handlers, monthly summary loader"
```

---

### Task 8: `/api/chat` dengan konfirmasi "ya" dan putaran tool

**Files:**
- Modify: `app/api/chat/route.js`
- Modify: `app/api/notifications/[id]/open/route.js`

Perilaku yang wajib dipertahankan dari Tahap 1 dan 2:
- Baris balasan agent disisipkan kosong lebih dulu sebagai penanda urutan, lalu diisi setelah stream selesai.
- Balasan kosong atau error di tengah stream membuang giliran (pesan Nasabah dan penanda).
- Balasan disimpan apa adanya, tanpa trim.
- Stream baru ditutup setelah balasan tersimpan.

Penanda sekarang dikenali sebagai `role = 'assistant'`, `content = ''`, **dan** `tool` kosong. Baris assistant yang berisi tool call tanpa teks bukan penanda.

- [ ] **Step 1: Tulis ulang `app/api/chat/route.js`**

```js
// POST /api/chat { session_id, message, mode: 'text' | 'call' }
// Server menyusun prompt dari DB (lib/prompt.js), meneruskan stream Netra ke browser,
// lalu menyimpan pesan Nasabah, balasan agent, dan usage (termasuk cache hit) ke chat_messages.
// Baris balasan disisipkan kosong lebih dulu (penanda urutan) dan diisi setelah stream selesai.
// Tahap 3: jawaban Nasabah atas Aksi Tertunda diputuskan lebih dulu (ADR 0007). Jika model memanggil tool (ADR 0006),
// server menjalankannya, menyimpan hasil dan kartunya, lalu memanggil model sekali lagi untuk menjelaskan kartu.
// Baris yang disisipkan server di tengah giliran dikirim ke browser sebagai event `data: {"nusa":{"pesan":...}}`.
// API key Netra hanya ada di env server.

import { getUser } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { buildPromptMessages, toolsFor } from '../../../lib/prompt';
import { createSseParser, createToolCallCollector } from '../../../lib/sse';
import { fail } from '../../../lib/server/http';
import { gagalNetra, netraSiap, panggilNetra } from '../../../lib/server/netra';
import { aksiMenunggu, putuskanDariJawaban } from '../../../lib/server/aksi';
import { hasilGagal, jalankanAlat } from '../../../lib/server/alat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_MESSAGE = 2000;
// Riwayat tidak dipotong (memotong dari depan merusak prefix cache). Sesi yang terlalu panjang ditolak.
const MAX_PROMPT_CHARS = 400000;
const KOLOM_RIWAYAT = 'id, role, content, tool, created_at';
const KOLOM_TAMPIL = 'id, role, content, card, created_at';
// Dipakai jika model tidak menjelaskan kartu (gagal atau kosong), supaya hasil tool selalu punya balasan.
const CADANGAN = 'Silakan cek kartu di atas ya.';

const enc = new TextEncoder();
const sse = (obj) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const penanda = (m) => m.role === 'assistant' && m.content === '' && !m.tool;

// Meneruskan stream Netra ke browser apa adanya sambil mengumpulkan teks, usage, dan tool call.
async function teruskan(upstream, kirim) {
  const parser = createSseParser();
  const alat = createToolCallCollector();
  const dec = new TextDecoder();
  const r = { text: '', usage: null, error: false, aborted: false, calls: [] };
  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      kirim(value);
      for (const ev of parser.push(dec.decode(value, { stream: true }))) {
        if (ev.text) r.text += ev.text;
        if (ev.usage) r.usage = ev.usage;
        if (ev.error) r.error = true;
        if (ev.toolCall) alat.push(ev.toolCall);
      }
    }
  } catch {
    // Browser menekan "hentikan" atau koneksi putus: hentikan bacaan dari Netra, simpan teks yang sudah diterima.
    r.aborted = true;
    reader.cancel().catch(() => {});
  }
  r.calls = alat.list();
  return r;
}

export async function POST(req) {
  if (!netraSiap()) return fail(500, 'NETRA_API_KEY belum diatur di server.');
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
  const tools = toolsFor(session.system_prompt_version);

  const { data: userMsg, error: insErr } = await admin
    .from('chat_messages')
    .insert({ session_id: sessionId, user_id: user.id, role: 'user', content: message })
    .select('id')
    .single();
  if (insErr) return fail(500, insErr.message);

  // Aksi Tertunda dari giliran sebelumnya: "ya" menjalankannya, jawaban lain membatalkannya (ADR 0007).
  // Pembaruannya disisipkan setelah pesan Nasabah dan sebelum balasan agent.
  const sisipan = [];
  const aksi = await aksiMenunggu(admin, sessionId);
  if (aksi) {
    const row = await putuskanDariJawaban(admin, aksi, message);
    if (row) sisipan.push(row);
  }

  // Posisi balasan agent dipesan sekarang (baris kosong), supaya urutan id tetap = urutan percakapan
  // walau pesan berikutnya masuk sebelum stream ini selesai disimpan.
  const { data: placeholder, error: phErr } = await admin
    .from('chat_messages')
    .insert({ session_id: sessionId, user_id: user.id, role: 'assistant', content: '' })
    .select('id')
    .single();
  if (phErr) {
    await admin.from('chat_messages').delete().eq('id', userMsg.id);
    return fail(500, phErr.message);
  }
  const dropTurn = () =>
    admin
      .from('chat_messages')
      .delete()
      .in('id', [userMsg.id, placeholder.id].filter((id) => id != null));

  const susun = (rows) => buildPromptMessages({ session, history: rows.filter((m) => !penanda(m)), mode });
  const { data: rows, error: histErr } = await admin.from('chat_messages').select(KOLOM_RIWAYAT).eq('session_id', sessionId).order('id');
  if (histErr) {
    await dropTurn();
    return fail(500, histErr.message);
  }
  const messages = susun(rows);
  if (messages.reduce((n, m) => n + (m.content || '').length, 0) > MAX_PROMPT_CHARS) {
    await dropTurn();
    return fail(413, 'Percakapan ini sudah terlalu panjang. Tekan "Chat baru" untuk melanjutkan.');
  }

  let upstream;
  try {
    upstream = await panggilNetra(messages, { stream: true, signal: req.signal, tools });
  } catch {
    await dropTurn();
    if (req.signal && req.signal.aborted) return new Response(null, { status: 499 });
    return fail(502, 'Server tidak bisa menjangkau API Netra.');
  }

  if (!upstream.ok || !upstream.body) {
    await dropTurn();
    return gagalNetra(upstream);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const kirim = (b) => {
        try {
          controller.enqueue(b);
        } catch {
          /* browser sudah menutup koneksi */
        }
      };
      const sentuhSesi = () => admin.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
      try {
        for (const row of sisipan) kirim(sse({ nusa: { pesan: row } }));

        const r1 = await teruskan(upstream, kirim);
        if (r1.error || (r1.aborted && r1.calls.length) || (!r1.text.trim() && !r1.calls.length)) {
          // Error di tengah stream, dihentikan saat tool call belum utuh, atau balasan kosong: buang giliran ini.
          await dropTurn();
          return;
        }

        if (!r1.calls.length) {
          // Disimpan apa adanya (tanpa trim): prefix permintaan berikutnya harus sama dengan output model.
          const { error: saveErr } = await admin.from('chat_messages').update({ content: r1.text, usage: r1.usage }).eq('id', placeholder.id);
          if (saveErr) {
            console.error('[api/chat] gagal menyimpan balasan:', saveErr.message);
            await dropTurn();
          } else {
            await sentuhSesi();
          }
          return;
        }

        // Putaran tool. Id panggilan dari model dipakai apa adanya; jika kosong, dibuat deterministik.
        const calls = r1.calls.map((c, i) => ({ id: c.id || `panggilan_${placeholder.id}_${i}`, name: c.name, arguments: c.arguments }));
        const hasilAlat = [];
        for (let i = 0; i < calls.length; i++) {
          try {
            hasilAlat.push(await jalankanAlat(admin, { userId: user.id, sessionId, pesan: message }, calls[i], { pertama: i === 0 }));
          } catch (e) {
            console.error('[api/chat] tool gagal:', calls[i].name, e && e.message);
            hasilAlat.push(hasilGagal());
          }
        }
        const { error: tcErr } = await admin.from('chat_messages').update({ content: r1.text, tool: { calls }, usage: r1.usage }).eq('id', placeholder.id);
        const { data: toolRows, error: trErr } = tcErr
          ? { data: null, error: tcErr }
          : await admin
              .from('chat_messages')
              .insert(calls.map((c, i) => ({ session_id: sessionId, user_id: user.id, role: 'tool', content: hasilAlat[i].content, tool: { id: c.id, name: c.name }, card: hasilAlat[i].card })))
              .select(KOLOM_TAMPIL);
        if (trErr) {
          // Riwayat tidak boleh berisi tool call tanpa hasil: buang giliran dan aksi yang baru dibuat.
          console.error('[api/chat] hasil tool gagal disimpan:', trErr.message);
          await admin.from('pending_actions').update({ status: 'batal', diputuskan_at: new Date().toISOString() }).eq('session_id', sessionId).eq('status', 'menunggu');
          await dropTurn();
          return;
        }
        for (const row of [...toolRows].sort((a, b) => a.id - b.id)) if (row.card) kirim(sse({ nusa: { pesan: row } }));

        // Putaran 2: agent menjelaskan kartu. Penanda kedua dipesan sebelum stream.
        const { data: ph2 } = await admin.from('chat_messages').insert({ session_id: sessionId, user_id: user.id, role: 'assistant', content: '' }).select('id').single();
        let r2 = { text: '', usage: null, error: true };
        try {
          const { data: rows2, error: h2Err } = await admin.from('chat_messages').select(KOLOM_RIWAYAT).eq('session_id', sessionId).order('id');
          if (h2Err) throw new Error(h2Err.message);
          const up2 = await panggilNetra(susun(rows2), { stream: true, signal: req.signal, tools });
          if (up2.ok && up2.body) r2 = await teruskan(up2, kirim);
          else console.error('[api/chat] putaran kedua: HTTP', up2.status);
        } catch (e) {
          console.error('[api/chat] putaran kedua gagal:', e && e.message);
        }
        // Tool call di putaran kedua diabaikan. Teks setengah jadi karena error diganti teks cadangan.
        let teks = !r2.error && r2.text.trim() ? r2.text : '';
        if (!teks) {
          teks = CADANGAN;
          kirim(sse({ choices: [{ delta: { content: (r2.text ? '\n' : '') + CADANGAN } }] }));
        }
        const isi = { content: teks, usage: r2.usage };
        const { error: s2Err } = ph2
          ? await admin.from('chat_messages').update(isi).eq('id', ph2.id)
          : await admin.from('chat_messages').insert({ session_id: sessionId, user_id: user.id, role: 'assistant', ...isi });
        if (s2Err) console.error('[api/chat] balasan putaran kedua gagal disimpan:', s2Err.message);
        await sentuhSesi();
      } finally {
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

Catatan:
- Jika `ph2` gagal disisipkan, balasan disisipkan di akhir. Urutannya tetap benar karena Nasabah tidak bisa mengirim pesan selama giliran berjalan (tombol kirim dinonaktifkan).
- Jika balasan putaran kedua gagal disimpan, penanda `ph2` tertinggal kosong dan disaring dari prompt. Hasil tool tanpa balasan masih valid bagi model.

- [ ] **Step 2: `app/api/notifications/[id]/open/route.js`**: sapaan memakai tool sesi

- Import `toolsFor` dari `lib/prompt`.
- Ubah select riwayat sapaan menjadi `'id, role, content, tool, created_at'`.
- Panggil `panggilNetra(buildPromptMessages({ session: s, history: rows }), { maxTokens: 400, signal: AbortSignal.timeout(25000), tools: toolsFor(s.system_prompt_version) })`.

Jika model membalas dengan tool call tanpa teks, `text` kosong sehingga sapaan dilewati (perilaku yang sudah ada).

- [ ] **Step 3: Build dan test**

Run: `npm test` lalu `npm run build`
Expected: PASS dan build berhasil.

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/route.js "app/api/notifications/[id]/open/route.js"
git commit -m "feat(api): confirm pending actions by reply, run expense and summary tools in chat turns"
```

---

### Task 9: Endpoint Aksi Tertunda dan Panel Demo

**Files:**
- Create: `app/api/actions/[id]/confirm/route.js`
- Create: `app/api/actions/[id]/cancel/route.js`
- Create: `app/api/demo/belanja/route.js`
- Create: `app/api/demo/boros/route.js`

- [ ] **Step 1: `app/api/actions/[id]/confirm/route.js`**

```js
import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { fail, failDb } from '../../../../../lib/server/http';
import { KOLOM_AKSI, batalkanAksi, jalankanAksi, kedaluwarsa } from '../../../../../lib/server/aksi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tombol Catat di kartu Catatan Pengeluaran (ADR 0007).
export async function POST(_req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();
  const { data: aksi } = await admin.from('pending_actions').select(KOLOM_AKSI).eq('id', id).maybeSingle();
  if (!aksi || aksi.user_id !== user.id) return fail(404, 'Aksi tidak ditemukan.');
  if (aksi.status !== 'menunggu') return fail(409, 'Aksi ini sudah dicatat atau dibatalkan.');
  if (kedaluwarsa(aksi)) {
    await batalkanAksi(admin, aksi, 'kedaluwarsa');
    return fail(409, 'Aksi ini sudah kedaluwarsa. Ceritakan lagi pengeluarannya kalau mau dicatat.');
  }
  try {
    await jalankanAksi(admin, aksi);
  } catch (e) {
    if (((e && e.message) || '').includes('SALDO_BEBAS_KURANG')) await batalkanAksi(admin, aksi, 'saldo_kurang');
    return failDb(e);
  }
  return Response.json({ action: { id, status: 'dijalankan' } });
}
```

- [ ] **Step 2: `app/api/actions/[id]/cancel/route.js`**

```js
import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { fail } from '../../../../../lib/server/http';
import { KOLOM_AKSI, batalkanAksi } from '../../../../../lib/server/aksi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tombol Batal di kartu Catatan Pengeluaran.
export async function POST(_req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();
  const { data: aksi } = await admin.from('pending_actions').select(KOLOM_AKSI).eq('id', id).maybeSingle();
  if (!aksi || aksi.user_id !== user.id) return fail(404, 'Aksi tidak ditemukan.');
  if (aksi.status !== 'menunggu') return fail(409, 'Aksi ini sudah dicatat atau dibatalkan.');
  const row = await batalkanAksi(admin, aksi, 'nasabah');
  if (!row) {
    // Status sudah berubah di antara pembacaan dan update (tab lain), atau pesan pembaruan gagal disimpan.
    const { data: now } = await admin.from('pending_actions').select('status').eq('id', id).maybeSingle();
    if (!now || now.status !== 'batal') return fail(409, 'Aksi ini sudah dicatat atau dibatalkan.');
  }
  return Response.json({ action: { id, status: 'batal' } });
}
```

- [ ] **Step 3: `app/api/demo/belanja/route.js`**

```js
import { getUser } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { belanjaAcak } from '../../../../lib/demo';
import { fail, failDb } from '../../../../lib/server/http';
import { ingestTransaksi } from '../../../../lib/server/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Panel Demo: satu Transaksi QRIS keluar acak lewat jalur ingest yang sama dengan Transaksi sungguhan.
export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const b = belanjaAcak();
  try {
    const { transaksi } = await ingestTransaksi(createAdminClient(), user.id, {
      arah: 'keluar',
      nominal: b.nominal,
      kategori: 'qris',
      pihak: b.pihak,
      kanal: 'QRIS',
      kategori_belanja: b.kategori_belanja
    });
    return Response.json({ transaksi: { ...transaksi, pihak: b.pihak, kategori_belanja: b.kategori_belanja } });
  } catch (e) {
    return failDb(e);
  }
}
```

- [ ] **Step 4: `app/api/demo/boros/route.js`**

```js
import { getUser } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { skenarioBoros } from '../../../../lib/demo';
import { rp } from '../../../../lib/format';
import { fail, failDb } from '../../../../lib/server/http';
import { ingestTransaksi } from '../../../../lib/server/ingest';
import { muatRingkasan } from '../../../../lib/server/ringkasan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Panel Demo: beberapa Transaksi Keinginan sekaligus sehingga Status Belanja menjadi Boros (spec 5.8).
export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();
  try {
    const daftar = skenarioBoros(await muatRingkasan(admin, user.id));
    const total = daftar.reduce((a, x) => a + x.nominal, 0);
    const { data: saldo } = await admin.from('v_saldo_bebas').select('saldo_bebas').eq('user_id', user.id).maybeSingle();
    if (!saldo || Number(saldo.saldo_bebas) < total) return fail(409, `Saldo Bebas tidak cukup untuk Skenario boros (butuh ${rp(total)}).`);
    for (const x of daftar) {
      await ingestTransaksi(admin, user.id, { arah: 'keluar', nominal: x.nominal, kategori: 'qris', pihak: x.pihak, kanal: 'QRIS', kategori_belanja: x.kategori_belanja });
    }
    return Response.json({ jumlah: daftar.length, total });
  } catch (e) {
    return failDb(e);
  }
}
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: berhasil, dan keempat route muncul di daftar route.

- [ ] **Step 6: Commit**

```bash
git add app/api/actions app/api/demo/belanja app/api/demo/boros
git commit -m "feat(api): confirm and cancel pending actions, random spending and overspending demo endpoints"
```

---

### Task 10: UI (kartu Catatan Pengeluaran, kartu Ringkasan, Panel Demo, dan event chat)

**Files:**
- Modify: `lib/api.js`, `lib/data.js`
- Create: `app/chat/PengeluaranCard.jsx`, `app/chat/RingkasanCard.jsx`
- Modify: `app/chat/RencanaCard.jsx`, `app/chat/DemoPanel.jsx`, `app/chat/page.jsx`, `app/globals.css`

- [ ] **Step 1: `lib/api.js`**

Tambahkan:

```js
export async function demoBelanja() {
  return (await request('/api/demo/belanja', { method: 'POST' })).json();
}

export async function demoBoros() {
  return (await request('/api/demo/boros', { method: 'POST' })).json();
}

export async function confirmAction(id) {
  return (await request(`/api/actions/${encodeURIComponent(id)}/confirm`, { method: 'POST' })).json();
}

export async function cancelAction(id) {
  return (await request(`/api/actions/${encodeURIComponent(id)}/cancel`, { method: 'POST' })).json();
}
```

Ubah `callChat` menjadi `callChat(sessionId, message, { mode = 'text', signal } = {}, onDelta, onEvent)`. Di dalam loop event, tambahkan `if (ev.nusa && onEvent) onEvent(ev.nusa);`. Ubah komentar di atasnya: "onEvent menerima event server ({ pesan }) untuk baris yang disisipkan server di tengah giliran (pembaruan, kartu)."

- [ ] **Step 2: `lib/data.js`**: ganti isi `CHIPS`

```js
export const CHIPS = [
  ['Catat jajan', 'Tadi aku jajan bakso 25 ribu.'],
  ['Belanja bulan ini', 'Pengeluaranku bulan ini gimana?'],
  ['Cek status transfer', 'Transfer saya ke Rina kemarin belum masuk, tolong dicek.'],
  ['Biaya transfer', 'Berapa biaya dan limit transfer BI-FAST?']
];
```

- [ ] **Step 3: `app/chat/RencanaCard.jsx`**: prop `tick`

Ubah tanda tangan menjadi `RencanaCard({ planId, tick, disabled, onChanged })` dan dependensi `useEffect` pemuatan menjadi `[planId, tick]`.

- [ ] **Step 4: `app/chat/PengeluaranCard.jsx`**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { cancelAction, confirmAction } from '../../lib/api';
import { rp } from '../../lib/format';
import { labelKategori } from '../../lib/kategori';
import { createClient } from '../../lib/supabase/browser';

const KOLOM = 'id, status, data, kedaluwarsa_at';

// Kartu Catatan Pengeluaran (Aksi Tertunda, ADR 0007). Status dibaca langsung dari tabel (RLS).
// tick berubah setiap kali giliran chat mengubah data, sehingga status hasil jawaban "ya" ikut tampil.
export default function PengeluaranCard({ actionId, tick, disabled, onChanged }) {
  const [aksi, setAksi] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const muat = () =>
    createClient()
      .from('pending_actions')
      .select(KOLOM)
      .eq('id', actionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) throw new Error('Catatan Pengeluaran gagal dimuat.');
        return data;
      });

  useEffect(() => {
    let cancelled = false;
    muat()
      .then((d) => !cancelled && setAksi(d))
      .catch((e) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, [actionId, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!aksi) return <div className="msg bot plan-card">{err || 'Memuat Catatan Pengeluaran…'}</div>;

  const kedaluwarsa = aksi.status === 'menunggu' && new Date(aksi.kedaluwarsa_at) <= new Date();
  const terbuka = aksi.status === 'menunggu' && !kedaluwarsa;
  const statusText = kedaluwarsa ? 'Kedaluwarsa' : aksi.status === 'dijalankan' ? 'Sudah dicatat' : aksi.status === 'batal' ? 'Dibatalkan' : '';

  const act = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      await fn(aksi.id);
      if (onChanged) onChanged();
    } catch (e) {
      setErr((e && e.message) || 'Gagal memproses catatan.');
    } finally {
      try {
        setAksi(await muat());
      } catch {
        /* status lama tetap tampil */
      }
      setBusy(false);
    }
  };

  return (
    <div className="msg bot plan-card" role="group" aria-label="Kartu Catatan Pengeluaran">
      <div className="plan-title">Catatan Pengeluaran</div>
      <ul className="plan-list">
        <li className="plan-row">
          <span className="plan-label">
            {aksi.data.barang}
            <small>{labelKategori(aksi.data.kategori)}</small>
          </span>
          <span className="plan-amt">{rp(aksi.data.nominal)}</span>
        </li>
      </ul>
      {err && <p className="plan-err" role="alert">{err}</p>}
      {terbuka ? (
        <>
          <p className="small card-hint">Belum tercatat. Tekan Catat atau jawab "ya".</p>
          <div className="row">
            <button type="button" className="btn primary" disabled={busy || disabled} onClick={() => act(confirmAction)}>
              Catat
            </button>
            <button type="button" className="btn ghost" disabled={busy || disabled} onClick={() => act(cancelAction)}>
              Batal
            </button>
          </div>
        </>
      ) : (
        <span className="small">{statusText}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `app/chat/RingkasanCard.jsx`**

```jsx
'use client';

import { fmtWaktu, rp } from '../../lib/format';
import { labelStatus } from '../../lib/ringkasan';

// Kartu Ringkasan Bulanan. Datanya dibekukan saat kartu dibuat (card.data), sama dengan teks yang dibaca agent.
export default function RingkasanCard({ data: r }) {
  const lebar = Math.min(100, r.persen);
  return (
    <div className="msg bot plan-card" role="group" aria-label="Kartu Ringkasan Bulanan">
      <div className="ring-head">
        <span className="plan-title">{`Ringkasan Belanja ${r.bulan}`}</span>
        <span className={`ring-status ${r.status}`}>{labelStatus(r.status)}</span>
      </div>
      <p className="ring-total">
        {`${rp(r.total)} dari batas ${rp(r.batas_prorata)} sampai hari ini`}
        <small>{`Hari ke-${r.hari_berjalan} dari ${r.jumlah_hari}. Batas Belanja bulan ini ${rp(r.batas)}.`}</small>
      </p>
      <div
        className={`ring-bar ${r.status}`}
        role="progressbar"
        aria-label="Pemakaian Batas Belanja sampai hari ini"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={lebar}
        aria-valuetext={`${r.persen}%`}
      >
        <span style={{ width: lebar + '%' }} />
      </div>
      <ul className="plan-list">
        {r.per_kategori.length ? (
          r.per_kategori.map((k) => (
            <li key={k.kategori} className="plan-row">
              <span className="plan-label">
                {k.label}
                <small>{k.kelompok === 'kebutuhan' ? 'Kebutuhan' : 'Keinginan'}</small>
              </span>
              <span className="plan-amt">{rp(k.total)}</span>
            </li>
          ))
        ) : (
          <li className="plan-row">
            <span className="plan-label">Belum ada belanja bulan ini</span>
          </li>
        )}
      </ul>
      <p className="small card-hint">
        {`Sisa Batas Belanja ${rp(r.sisa_batas)} untuk ${r.sisa_hari} hari lagi, sekitar ${rp(r.sisa_per_hari)} per hari. Dibuat ${fmtWaktu(r.dibuat_pada)}.`}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: `app/chat/DemoPanel.jsx`**

```jsx
'use client';

// Panel Demo (spec 5.8). Tahap 3: Gaji masuk, Belanja acak, Skenario boros, dan Reset data demo.
export default function DemoPanel({ disabled, onGaji, onBelanja, onBoros, onReset }) {
  return (
    <details className="demo-panel">
      <summary>Panel Demo</summary>
      <p className="demo-note">Simulasi untuk demo. Semua kejadian lewat jalur yang sama dengan kejadian sungguhan.</p>
      <div className="demo-actions">
        <button type="button" className="btn ghost" disabled={disabled} onClick={onGaji}>Gaji masuk</button>
        <button type="button" className="btn ghost" disabled={disabled} onClick={onBelanja}>Belanja acak</button>
        <button type="button" className="btn ghost" disabled={disabled} onClick={onBoros}>Skenario boros</button>
        <button type="button" className="btn ghost danger" disabled={disabled} onClick={onReset}>Reset data demo</button>
      </div>
    </details>
  );
}
```

- [ ] **Step 7: `app/chat/page.jsx`**

Baca seluruh file lebih dulu. Lalu lakukan perubahan berikut:

1. Import:
   - `demoBelanja` dan `demoBoros` dari `lib/api`.
   - `PengeluaranCard` dan `RingkasanCard`.
   - `labelKategori` dari `lib/kategori`.

2. `toChat`: tambahkan baris `tool` yang membawa kartu (sebelum `return []`):

```js
    if (m.role === 'tool' && m.card) return [{ id: 'db' + m.id, role: 'card', card: m.card }];
```

   Baris `assistant` dengan `content` kosong (tool call tanpa teks) tidak boleh tampil. Ubah baris pertama menjadi:

```js
    if (m.role === 'user' || (m.role === 'assistant' && m.content)) return [{ id: 'db' + m.id, role: m.role, content: m.content }];
```

3. `toTxRow`: kanal ditambah label Kategori Belanja:

```js
  channel: t.kanal + (t.kategori_belanja ? ' · ' + labelKategori(t.kategori_belanja) : ''),
```

   Di `loadFinance`, tambahkan `kategori_belanja` ke select `transactions`.

4. State baru `const [cardTick, setCardTick] = useState(0);` di dekat state lain. Lalu fungsi:

```js
  // Giliran atau tombol yang mengubah data: saldo dan status kartu dimuat ulang.
  const segarkanData = () => {
    loadFinance().catch(() => {});
    setCardTick((t) => t + 1);
  };
```

   Ubah `afterPlanChange` menjadi `afterCardChange`, isinya `segarkanData(); refreshSession();`. Ganti semua pemakaiannya.

5. Render kartu. Ganti blok `if (m.role === 'card') {...}` di `chat.map` dengan:

```jsx
              if (m.role === 'card') {
                const off = busy || inCall || voiceBusy;
                if (m.card.jenis === 'rencana') return <RencanaCard key={m.id} planId={m.card.plan_id} tick={cardTick} disabled={off} onChanged={afterCardChange} />;
                if (m.card.jenis === 'pengeluaran') return <PengeluaranCard key={m.id} actionId={m.card.action_id} tick={cardTick} disabled={off} onChanged={afterCardChange} />;
                if (m.card.jenis === 'ringkasan') return <RingkasanCard key={m.id} data={m.card.data} />;
                return null;
              }
```

6. Event `nusa` di `send`. Sebelum `try {` tambahkan:

```js
    let segar = false;
    // Baris yang disisipkan server di tengah giliran (pembaruan, kartu) tampil sebelum gelembung balasan.
    const onEvent = (ev) => {
      if (!ev.pesan) return;
      segar = true;
      const items = toChat([ev.pesan]);
      setChat((c) => {
        const baru = items.filter((x) => !c.some((m) => m.id === x.id));
        const i = c.findIndex((m) => m.id === aid);
        return i < 0 ? [...c, ...baru] : [...c.slice(0, i), ...baru, ...c.slice(i)];
      });
    };
```

   Tambahkan `onEvent` sebagai argumen kelima `callChat(...)`. Di blok `finally` sebelum `abortRef.current = null;` tambahkan `if (segar) segarkanData();`.

7. Event `nusa` di `answerCustomer` (mode telepon). Sebelum `const replyPromise = ...` tambahkan:

```js
    let segar = false;
    const onEvent = (ev) => {
      if (!ev.pesan) return;
      segar = true;
      const items = toChat([ev.pesan]);
      setChat((c) => [...c, ...items.filter((x) => !c.some((m) => m.id === x.id))]);
    };
```

   Kirim `onEvent` sebagai argumen kelima `callChat`. Setelah `try { await replyPromise; ... } catch {...}` (baik berhasil maupun gagal), panggil `if (segar) segarkanData();`. Letakkan pemanggilan di dua tempat: tepat sebelum `endCall(...)` di blok catch, dan tepat setelah blok try/catch.

8. Handler Panel Demo baru (dekat `onDemoGaji`):

```js
  const onDemoBelanja = async () => {
    setDemoBusy(true);
    try {
      const res = await demoBelanja();
      await loadFinance();
      toast(`Belanja ${res.transaksi.pihak} ${rp(res.transaksi.nominal)} tercatat.`);
    } catch (e) {
      toast((e && e.message) || 'Simulasi belanja gagal.');
    } finally {
      setDemoBusy(false);
    }
  };

  const onDemoBoros = async () => {
    setDemoBusy(true);
    try {
      const res = await demoBoros();
      await loadFinance();
      toast(`Skenario boros: ${res.jumlah} transaksi, total ${rp(res.total)}. Coba tanya "Pengeluaranku bulan ini gimana?"`);
    } catch (e) {
      toast((e && e.message) || 'Skenario boros gagal.');
    } finally {
      setDemoBusy(false);
    }
  };
```

   Teruskan ke `<DemoPanel ... onBelanja={onDemoBelanja} onBoros={onDemoBoros} />`.

   Ubah teks konfirmasi Reset menjadi: `'Reset data demo? Semua transaksi, Kantong, Goal, catatan pengeluaran, notifikasi, dan percakapan akan dihapus lalu dibuat ulang.'`

Pastikan `rp` sudah di-import di `page.jsx` (sudah dipakai di panel transaksi).

- [ ] **Step 8: `app/globals.css`**: tambahkan setelah aturan `.plan-err`

```css
.card-hint{margin:8px 0 0}
.ring-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.ring-head .plan-title{margin-bottom:0}
.ring-status{flex:none;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:800;border:1px solid transparent}
.ring-status.hemat{color:var(--ok);border-color:currentColor}
.ring-status.aman{color:var(--txt);border-color:rgba(255,255,255,.45)}
.ring-status.boros{color:var(--bad);border-color:currentColor}
.ring-total{margin:0 0 8px;font-weight:700;font-size:13.5px;display:flex;flex-direction:column;gap:2px}
.ring-total small{font-weight:500;font-size:11.5px;color:var(--txt2)}
.ring-bar{height:8px;border-radius:999px;background:rgba(255,255,255,.16);overflow:hidden;margin-bottom:8px}
.ring-bar span{display:block;height:100%;border-radius:inherit;background:var(--ok)}
.ring-bar.aman span{background:var(--txt)}
.ring-bar.boros span{background:var(--bad)}
```

Periksa bahwa `--ok`, `--bad`, `--txt`, dan `--txt2` memang ada di `:root` di `app/globals.css`. Jika `--ok` tidak ada, pakai warna hijau yang sudah dipakai `.tx-st.ok` atau `.tx-amt.in`.

- [ ] **Step 9: Build dan test**

Run: `npm test` lalu `npm run build`
Expected: PASS dan build berhasil tanpa warning baru.

- [ ] **Step 10: Commit**

```bash
git add lib/api.js lib/data.js app/chat app/globals.css
git commit -m "feat(chat): expense and summary cards, server events in chat and calls, new demo buttons"
```

---

### Task 11: Dokumentasi

**Files:**
- Modify: `docs/specs/agent-keuangan.md`, `README.md`

- [ ] **Step 1: Spec**

1. Tambahkan bagian **7.3 Keputusan pelaksanaan Tahap 3** setelah 7.2. Isinya ringkasan dari "Keputusan pelaksanaan Tahap 3" di atas file plan ini (10 poin), ditulis sebagai kalimat lengkap gaya bagian 7.2.
2. Bagian 8 baris `chat_messages`: catat bahwa hasil tool membawa kartu di kolom `card` (baris `tool`).
3. Bagian 9: pastikan `POST /api/actions/:id/confirm · /cancel` dan `/api/demo/belanja · /boros` tercantum, dan catat bahwa `PATCH /api/actions/:id` baru dibuat di Tahap 4.

- [ ] **Step 2: README**

1. Langkah setup 2: tambahkan `supabase/migrations/20261127000001_pengeluaran.sql` sebagai migrasi ketiga.
2. Bagian Fitur Chatbot: tambahkan poin Catatan Pengeluaran (chat, suara, telepon, dengan konfirmasi Catat atau "ya"), Ringkasan Bulanan (Hemat, Aman, Boros), dan tombol Panel Demo baru.
3. Tambahkan catatan: fitur Catatan Pengeluaran dan Ringkasan hanya ada di percakapan baru. Setelah update, tekan **Chat baru**.
4. Struktur proyek: tambahkan `lib/nominal.js`, `lib/ringkasan.js`, `lib/konfirmasi.js`, `lib/pengeluaran.js`, `lib/kategori.js`, dan `lib/demo.js`.

- [ ] **Step 3: Commit**

```bash
git add docs/specs/agent-keuangan.md README.md
git commit -m "docs: record Tahap 3 implementation decisions and setup"
```

---

### Task 12: Verifikasi live (dikerjakan controller, bukan subagent)

Prasyarat: pemilik repo sudah menjalankan `supabase/migrations/20261127000001_pengeluaran.sql` di SQL Editor.

- [ ] Reset data demo. Saldo Total harus Rp 24.380.500, dan Transaksi seed menampilkan label kategori di panel.
- [ ] Buat **Chat baru**, lalu ketik "tadi jajan bakso 25 ribu". Kartu Catatan Pengeluaran Rp 25.000, Bakso, Jajan muncul, dan agent mengulang nominalnya.
- [ ] Ketik "ya". Muncul catatan "Catatan Pengeluaran dicatat", Saldo Total berkurang tepat Rp 25.000, dan kartu berubah menjadi "Sudah dicatat".
- [ ] Ketik "tadi beli kopi". Agent menanyakan nominalnya dan tidak ada kartu. Lalu ketik "18rb", dan kartu Rp 18.000 muncul. Lalu tekan **Batal**: status Dibatalkan dan saldo tetap.
- [ ] Ketik "tadi parkir 5 ribu", lalu ketik "pengeluaranku bulan ini gimana?". Aksi parkir dibatalkan karena topik lain, lalu kartu Ringkasan muncul.
- [ ] Klik **Skenario boros**, lalu tanya ringkasan lagi. Status Boros, dan agent menyebut Keinginan terbesar beserta saran sisa per hari.
- [ ] Klik **Belanja acak**. Transaksi QRIS baru muncul di panel dengan labelnya.
- [ ] Mode telepon (jika key Deepgram tersedia): ucapkan "tadi jajan bakso dua puluh lima ribu", lalu "ya". Saldo berkurang.
- [ ] Usage di `chat_messages` putaran kedua menunjukkan `cached_tokens > 0` setelah beberapa giliran.
- [ ] Isolasi: akun B tidak bisa `confirm` atau `cancel` aksi milik A (404) dan tidak bisa membaca `pending_actions` milik A lewat RLS.
- [ ] Sesi lama (v2) masih bisa dilanjutkan tanpa error.

---

## Self-review (dijalankan penulis plan)

- **Cakupan spec Tahap 3:**
  - `kategori_belanja` dan pemetaan seed: Task 6.
  - `lib/nominal.js`: Task 1.
  - Tool `catat_pengeluaran` dan `minta_ringkasan`: Task 5, 7, dan 8.
  - `pending_actions` dan `jalankan_aksi`: Task 6 dan 7.
  - Konfirmasi lewat tombol (Task 9 dan 10) dan lewat ucapan "ya" di chat, suara, dan telepon (Task 2, 7, 8, dan 10).
  - Kartu Catatan Pengeluaran dan Ringkasan: Task 10.
  - `lib/ringkasan.js`: Task 3.
  - Tombol Belanja acak dan Skenario boros: Task 4, 9, dan 10.
- **Kriteria selesai:**
  - "Bakso 25 ribu" diikuti "ya" mengurangi saldo Rp 25.000: Task 12.
  - Nominal yang tidak disebut tidak pernah menjadi Aksi Tertunda: `periksaPengeluaran` (Task 4) dipanggil di `catatPengeluaran` sebelum insert (Task 7).
  - Skenario boros membuat status Boros: test di Task 4.
  - Kasus tepi nominal dan ringkasan diuji di Task 1 dan 3.
- **Konsistensi nama:**
  - `card.jenis` bernilai `'pengeluaran'`, `'ringkasan'`, dan `'rencana'`.
  - `card.action_id` dan `card.data`.
  - `tool.calls` dan `tool.id`.
  - `KOLOM_AKSI`, `putuskanDariJawaban`, `jalankanAlat`, `hasilGagal`, `muatRingkasan`, `toolsFor`, `createToolCallCollector`, dan `labelKategori`.
  - `labelStatus` dipakai `RingkasanCard` dan diekspor dari `lib/ringkasan.js`.
