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
- Halaman **Pengaturan AI**: API key, model, system prompt, max tokens, temperature, reasoning, dan uji koneksi
- Pose maskot berubah mengikuti status (berpikir, bekerja, berhasil, minta maaf, belum terhubung)
- Data demo nasabah ikut dikirim ke AI, sehingga Bantu bisa menjawab pertanyaan seperti "transfer ke Rina belum masuk"
- Pengingat keamanan: Bantu tidak pernah meminta PIN, password, CVV, atau OTP

## Tech stack

- Next.js 15 (App Router) dan React 19, JavaScript
- CSS biasa (tanpa library UI), font Plus Jakarta Sans lewat `next/font`
- API route sebagai proxy ke Netra Runtime (`POST /v1/chat/completions`)

## Struktur proyek

```
app/
  page.jsx              landing page (/)
  landing.css           gaya landing page
  chat/page.jsx         aplikasi chat (/chat)
  api/chat/route.js     proxy ke Netra, meneruskan stream jawaban
  layout.jsx            layout dan font
  globals.css           gaya chat dan dasar
components/
  PhoneDemo.jsx         animasi di mockup HP
  FeatureTabs.jsx       tab contoh percakapan
lib/
  data.js               data demo, system prompt, nilai default
  api.js                klien streaming ke /api/chat
public/assets/          pose maskot Bantu
```

## Menjalankan di komputer

Butuh Node.js 18.18 atau lebih baru.

```bash
git clone <URL-REPO-ANDA>
cd <NAMA-FOLDER>
npm install
npm run dev
```

Buka http://localhost:3000 untuk landing page, atau http://localhost:3000/chat untuk chatbot.

Mode produksi:

```bash
npm run build
npm start
```

## Mengatur API key

1. Buka `/chat`, lalu masuk ke **Pengaturan AI**.
2. Tempel API key Netra Runtime Anda.
3. Pastikan **Model ID** sama persis dengan katalog akun Anda (default: `deepseek/deepseek-v4.1-flash`).
4. Klik **Uji koneksi**, lalu **Simpan pengaturan**.

Jika API menolak parameter reasoning, ubah pilihan **Reasoning** menjadi "Tidak dikirim".

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di [vercel.com](https://vercel.com) pilih **Add New > Project**, lalu import repo-nya.
3. Framework terdeteksi otomatis sebagai Next.js. Klik **Deploy**.

Atau lewat CLI: jalankan `npx vercel` di folder proyek.

### Environment variable (opsional)

| Nama | Default | Fungsi |
| --- | --- | --- |
| `NETRA_BASE_URL` | `https://api.netraruntime.com/v1` | Mengganti alamat API Netra |

## Cara kerja dan keamanan

- API key diisi pengguna dan disimpan di `localStorage` browser mereka. Server tidak menyimpannya.
- Browser memanggil `/api/chat` dengan header `x-api-key`. Server meneruskan ke Netra dengan `Authorization: Bearer ...` dan label `X-Netra-Agent: bank-nusa-cs`.
- Alamat API dikunci di server (bukan dari klien), sehingga endpoint tidak bisa dipakai untuk menembak alamat lain.
- Batas durasi fungsi serverless diset 60 detik. Jawaban sangat panjang dengan reasoning tinggi bisa terpotong; turunkan Max tokens atau matikan Reasoning.
- Riwayat chat disimpan di browser dan bisa dihapus lewat tombol **Chat baru**.
- Tombol **Hubungi agen** masih simulasi dan belum terhubung ke contact center.

## Kustomisasi

- **Data nasabah dan transaksi:** ubah `TXS` dan `demoContext()` di `lib/data.js`. Untuk produksi, ganti dengan data dari backend bank.
- **Perilaku AI:** ubah `DEFAULT_SYSTEM_PROMPT` di `lib/data.js`, atau lewat halaman Pengaturan AI.
- **Maskot:** ganti gambar di `public/assets/` dengan nama file yang sama.
- **Warna:** palet ada di bagian atas `app/globals.css` dan `app/landing.css`.
- **Copy landing page:** dua isian FAQ masih placeholder (`[ISI JAM OPERASIONAL AGEN]` dan `[ISI TAUTAN KEBIJAKAN PRIVASI]`) di `app/page.jsx`.

## Sebelum dipakai di produksi

Proyek ini adalah demo. Sebelum dipakai untuk layanan nyata, perlu minimal: autentikasi nasabah (login dan OTP di kanal resmi), integrasi ke core banking dan sistem tiket, penyamaran dan penyimpanan data sesuai kebijakan bank serta regulasi yang berlaku (UU PDP dan ketentuan OJK), pengujian keamanan, dan audit jawaban AI secara berkala.

## Lisensi

Belum ditentukan. Tambahkan file `LICENSE` sesuai kebutuhan Anda.
