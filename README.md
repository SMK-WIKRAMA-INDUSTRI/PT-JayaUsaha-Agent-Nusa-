# Bank Nusa: Chatbot Customer Service

Landing page dan chatbot customer service untuk bank, dengan tampilan glass, maskot animasi **Bantu**, riwayat transaksi contoh, dan AI dari [Netra Runtime](https://netra.sh). Dibangun dengan Next.js dan siap di-deploy ke Vercel.

> **Catatan:** "Bank Nusa" adalah nama fiktif untuk demo. Semua nama, nominal, dan transaksi adalah data contoh. Proyek ini bukan produk bank sungguhan dan belum terhubung ke sistem perbankan apa pun.

## Fitur

**Landing page (`/`)**
- Mockup HP dengan animasi: maskot bingung karena transfer gagal, membuka chat, bertanya ke Bantu, lalu transfer berhasil dengan konfeti
- Tombol jeda dan ulang animasi, serta tampilan diam untuk pengguna dengan pengaturan "kurangi gerakan"
- Tab contoh percakapan (status transfer, blokir kartu, tagihan kartu kredit), FAQ, dan responsif sampai layar HP

**Chatbot (`/chat`)**
- Antarmuka glass dengan chat, panel riwayat transaksi (filter masuk/keluar), dan versi mobile
- Jawaban AI bertahap (streaming) dengan tombol hentikan
- Halaman **Pengaturan** untuk fitur suara (key Deepgram) dan lampiran PDF atau catatan teks
- Login, register, dan onboarding dengan Supabase Auth; Sesi Percakapan tersimpan di database dan bisa dilanjutkan
- Pose maskot berubah mengikuti status (berpikir, bekerja, berhasil, minta maaf, belum terhubung)
- Data keuangan Nasabah dari database ikut dikirim ke AI sebagai Snapshot Keuangan, sehingga Bantu bisa menjawab pertanyaan seperti "transfer ke Rina belum masuk"
- Pengingat keamanan: Bantu tidak pernah meminta PIN, password, CVV, atau OTP
- Saldo Total, Saldo Bebas, dan Kantong (Dana Darurat, Goal, Investasi) di panel kanan
- **Panel Demo**: tombol **Gaji masuk** dan **Reset data demo**
- Saat Gaji masuk, lonceng **Notifikasi Gajian** menyala (Supabase Realtime). Membukanya memulai percakapan baru dari agent dengan **kartu Rencana Alokasi** yang bisa diedit, lalu **Terapkan** (dana masuk Kantong) atau **Abaikan**. Angka rencana dihitung oleh `lib/alokasi.js`, bukan oleh AI.

## Tech stack

- Next.js 15 (App Router) dan React 19, JavaScript
- CSS biasa (tanpa library UI), font Plus Jakarta Sans lewat `next/font`
- Supabase (Auth dan Postgres dengan Row Level Security)
- API route sebagai proxy ke Netra Runtime (`POST /v1/chat/completions`)
- Vitest untuk unit test

## Struktur proyek

```
middleware.js           menjaga sesi login dan mengarahkan halaman yang butuh login
app/
  page.jsx              landing page (/)
  landing.css           gaya landing page
  login/                halaman login
  register/             halaman register
  onboarding/           wizard onboarding Nasabah baru
  chat/page.jsx         aplikasi chat (/chat)
  api/chat/route.js     menyusun prompt di server, memanggil Netra, meneruskan stream
  api/sessions/         buat sesi, ambil riwayat sesi, tambah lampiran
  layout.jsx            layout dan font
  globals.css           gaya chat dan dasar
components/
  PhoneDemo.jsx         animasi di mockup HP
  FeatureTabs.jsx       tab contoh percakapan
lib/
  prompt.js             system prompt statis berversi dan penyusun prompt
  snapshot.js           Snapshot Keuangan sesi
  keuangan.js           hitungan saldo dan Pengeluaran Bulanan
  format.js             format rupiah dan tanggal
  sse.js                parser stream SSE
  data.js               pengaturan browser (Deepgram, lampiran) dan chip contoh
  api.js                klien streaming ke /api/chat
  supabase/             klien Supabase (browser, server, admin)
  server/               helper server untuk route sesi dan respons HTTP
supabase/migrations/    skema, RLS, dan fungsi Postgres
tests/                  unit test (vitest)
scripts/cek-cache-netra.mjs   cek context caching DeepSeek lewat Netra
public/assets/          pose maskot Bantu
```

## Menjalankan di komputer

Butuh Node.js 20.6 atau lebih baru (script `--env-file` membutuhkannya).

```bash
git clone <URL-REPO-ANDA>
cd <NAMA-FOLDER>
npm install
npm test
npm run dev
```

Sebelum chatbot bisa dipakai, siapkan Supabase dan API key (lihat bagian di bawah). Buka http://localhost:3000 untuk landing page, atau http://localhost:3000/register untuk mendaftar.

Mode produksi:

```bash
npm run build
npm start
```

## Menyiapkan Supabase dan API key

1. Buat project di supabase.com. Di **Authentication > Sign In / Providers > Email**, matikan **Confirm email** untuk demo.
2. Jalankan isi `supabase/migrations/20261124000001_fondasi.sql` di **SQL Editor**, lalu `supabase/migrations/20261126000001_alokasi.sql` (masing-masing sekali, berurutan).
3. Salin `.env.example` menjadi `.env.local`, lalu isi URL dan key Supabase serta `NETRA_API_KEY`.
4. `npm run dev`, buka http://localhost:3000/register, lalu jalani onboarding.

Key Netra sekarang hanya ada di server (`NETRA_API_KEY`). Key Deepgram untuk fitur suara masih diisi di halaman **Pengaturan**.
Cek apakah context caching DeepSeek lewat Netra bekerja: `node --env-file=.env.local scripts/cek-cache-netra.mjs`.
Cek apakah tool calling lewat Netra bekerja: `node --env-file=.env.local scripts/cek-tools-netra.mjs`.

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di [vercel.com](https://vercel.com) pilih **Add New > Project**, lalu import repo-nya.
3. Framework terdeteksi otomatis sebagai Next.js. Klik **Deploy**.

Atau lewat CLI: jalankan `npx vercel` di folder proyek.

### Environment variable

| Nama | Default | Fungsi |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | wajib | Alamat project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | wajib | Key publik (anon) Supabase untuk browser |
| `SUPABASE_SERVICE_ROLE_KEY` | wajib | Key rahasia Supabase, hanya dipakai server. Jangan diberi awalan `NEXT_PUBLIC_` |
| `NETRA_API_KEY` | wajib | API key Netra Runtime, hanya dipakai server |
| `NETRA_MODEL` | `deepseek/deepseek-v4.1-flash` | Model ID di katalog akun Netra Anda |
| `NETRA_BASE_URL` | `https://api.netraruntime.com/v1` | Mengganti alamat API Netra |

## Cara kerja dan keamanan

- Nasabah login dengan Supabase Auth. Data rekening, Transaksi, dan Sesi Percakapan disimpan di Supabase Postgres dengan Row Level Security, sehingga tiap Nasabah hanya bisa membaca datanya sendiri.
- Browser hanya mengirim `session_id` dan pesan baru. Server menyusun prompt dengan urutan tetap (system prompt statis → Snapshot Keuangan sesi → riwayat) supaya context caching DeepSeek bisa kena. Lihat `docs/adr/0003-*`.
- Setiap balasan menyimpan `usage` dari API (termasuk token cache hit) di tabel `chat_messages`.
- Alamat API dikunci di server (bukan dari klien), sehingga endpoint tidak bisa dipakai untuk menembak alamat lain.
- Batas durasi fungsi serverless diset 60 detik. Server memakai `max_tokens` 600 dan reasoning dimatikan (`app/api/chat/route.js`) supaya jawaban selesai dalam batas itu.
- Tombol **Chat baru** membuka Sesi Percakapan baru; sesi lama tetap tersimpan dan bisa dilanjutkan.
- Tombol **Hubungi agen** masih simulasi dan belum terhubung ke contact center.

## Kustomisasi

- **Data demo Nasabah baru:** fungsi `seed_nasabah_baru` di migrasi Supabase.
- **Perilaku AI:** `SYSTEM_PROMPTS` di `lib/prompt.js`. Jika teksnya diubah, tambahkan versi baru dan naikkan `SYSTEM_PROMPT_VERSION` agar sesi lama tidak kehilangan cache.
- **Maskot:** ganti gambar di `public/assets/` dengan nama file yang sama.
- **Warna:** palet ada di bagian atas `app/globals.css` dan `app/landing.css`.
- **Copy landing page:** dua isian FAQ masih placeholder (`[ISI JAM OPERASIONAL AGEN]` dan `[ISI TAUTAN KEBIJAKAN PRIVASI]`) di `app/page.jsx`.

## Sebelum dipakai di produksi

Proyek ini adalah demo. Sebelum dipakai untuk layanan nyata, perlu minimal: autentikasi nasabah (login dan OTP di kanal resmi), integrasi ke core banking dan sistem tiket, penyamaran dan penyimpanan data sesuai kebijakan bank serta regulasi yang berlaku (UU PDP dan ketentuan OJK), pengujian keamanan, dan audit jawaban AI secara berkala.

## Lisensi

Belum ditentukan. Tambahkan file `LICENSE` sesuai kebutuhan Anda.
