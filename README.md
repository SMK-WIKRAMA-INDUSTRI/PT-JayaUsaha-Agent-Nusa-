# Chatbot Agent Nusa (Next.js)

Chatbot customer service bank dengan tampilan glass, riwayat transaksi dummy, maskot Agent Nusa, dan AI dari Netra Runtime (`POST /v1/chat/completions`). Siap di-deploy ke Vercel.

## Tech stack

- Next.js 15 (App Router) dan React 19, JavaScript (tanpa TypeScript)
- `app/page.jsx` (`/`): landing page, dengan animasi HP di `components/PhoneDemo.jsx` (maskot bingung, membuka chat, lalu transfer berhasil) dan tab contoh percakapan di `components/FeatureTabs.jsx`; gayanya di `app/landing.css`
- `app/chat/page.jsx` (`/chat`): aplikasi chat, riwayat transaksi, dan preferensi AI
- `app/api/chat/route.js`: proxy ke Netra, meneruskan stream jawaban apa adanya
- `lib/data.js`: data demo dan nilai default; `lib/api.js`: klien streaming
- `public/assets/`: pose maskot Agent Nusa

## Jalankan lokal

Butuh Node.js 18.18 atau lebih baru.

```
npm install
npm run dev
```

Buat `.env.local` berdasarkan `.env.example`, lalu isi `NETRA_API_KEY` dan `DEEPGRAM_API_KEY` dengan kredensial masing-masing layanan. Jalankan ulang server setelah mengubah environment. Preferensi model bisa diubah dari halaman **Pengaturan AI**.

## Deploy ke Vercel

Vercel tidak menerima upload zip langsung. Pilih salah satu:

1. **Lewat GitHub (disarankan):** push folder ini ke repo GitHub, lalu di vercel.com pilih *Add New > Project*, import repo-nya. Framework terdeteksi otomatis sebagai Next.js, klik *Deploy*.
2. **Lewat CLI:** di folder ini jalankan `npx vercel`, ikuti pertanyaannya, lalu `npx vercel --prod`.

Tambahkan `NETRA_API_KEY` dan `DEEPGRAM_API_KEY` ke Environment Variables proyek Vercel. Jangan gunakan awalan `NEXT_PUBLIC_` dan jangan masukkan key ke kode atau commit. Perbarui deployment setelah mengubah nilainya.

`NETRA_BASE_URL` opsional untuk mengganti alamat API (default `https://api.netraruntime.com/v1`).

## Cara kerja dan keamanan

- API key hanya dibaca di server dari `NETRA_API_KEY`; tidak dikirim ke browser, tidak ditulis ke `localStorage`, dan tidak dikirim oleh klien pada setiap permintaan.
- Browser memanggil `/api/chat`; server meneruskan request dengan `Authorization: Bearer ...` dan label `X-Netra-Agent: agent-nusa-cs`. Hanya status boolean konfigurasi yang tersedia dari endpoint status.
- Chat mendukung sampai 3 gambar PNG/JPG/WebP, maksimal 5 MB per gambar. Tipe dan signature file divalidasi di server; gambar dikirim ke Netra bersama pesan dan tidak disimpan di riwayat lokal.
- Voice-to-text merekam maksimal 60 detik dan mengirim audio (maksimal 5 MB) ke endpoint server `/api/transcribe`, lalu server meneruskannya ke Deepgram Nova-3 untuk transkripsi Bahasa Indonesia. Audio tidak disimpan; hasil transkrip hanya dimasukkan ke kotak pesan dan tidak terkirim otomatis.
- File gambar dikirim ke Netra dan rekaman suara dikirim ke Deepgram. Jangan mengunggah atau merekam informasi sensitif yang tidak diperlukan.
- Penggunaan endpoint AI/transkripsi publik tetap membutuhkan autentikasi pengguna dan rate limiting terpusat sebelum produksi untuk mencegah penyalahgunaan kredensial dan biaya layanan.
- API hanya menerima request JSON same-origin, memvalidasi ukuran dan bentuk pesan, dan memakai `NETRA_BASE_URL` yang dikonfigurasi di server.
- `.env.local` diabaikan Git. Jika sebelumnya API key pernah dimasukkan di browser, aplikasi baru menghapus key lama dari `localStorage` saat dibuka.
- Endpoint chat belum dilengkapi autentikasi pengguna atau pembatasan kuota yang persisten. Sebelum dipakai publik/produksi, pasang autentikasi dan rate limiting terpusat agar kredensial server tidak dapat disalahgunakan melalui pemakaian endpoint.
- Batas durasi fungsi diset 60 detik (`maxDuration`). Jawaban panjang dengan reasoning tinggi bisa melewatinya; turunkan Max tokens atau Reasoning.
- System prompt otomatis ditambah data demo nasabah (saldo, transaksi, tagihan).
- Tombol "Hubungi agen" masih simulasi.

Semua nama, nominal, dan transaksi adalah data fiktif. Ganti `TXS` dan `demoContext()` di `lib/data.js` dengan data dari backend bank sebelum dipakai di produksi.

Paket harga pada landing page adalah konsep awal untuk demo; pembayaran dan aktivasi langganan belum terhubung.
"# Agent-Nusa" 
