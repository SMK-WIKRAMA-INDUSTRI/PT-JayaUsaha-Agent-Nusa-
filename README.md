# Chatbot Agent Nusa (Next.js)

Chatbot customer service bank dengan tampilan glass, riwayat transaksi dummy, maskot Agent Nusa, dan AI dari Netra Runtime (`POST /v1/chat/completions`). Siap di-deploy ke Vercel.

## Tech stack

- Next.js 15 (App Router) dan React 19, JavaScript (tanpa TypeScript)
- `app/page.jsx` (`/`): landing page, dengan animasi HP di `components/PhoneDemo.jsx` (maskot bingung, membuka chat, lalu transfer berhasil) dan tab contoh percakapan di `components/FeatureTabs.jsx`; gayanya di `app/landing.css`
- `app/chat/page.jsx` (`/chat`): aplikasi chat, riwayat transaksi, dan pengaturan API key
- `app/api/chat/route.js`: proxy ke Netra, meneruskan stream jawaban apa adanya
- `lib/data.js`: data demo dan nilai default; `lib/api.js`: klien streaming
- `public/assets/`: pose maskot Agent Nusa

## Jalankan lokal

Butuh Node.js 18.18 atau lebih baru.

```
npm install
npm run dev
```

Buka http://localhost:3000, masuk ke **Pengaturan AI**, isi API key Netra, klik **Uji koneksi**, lalu **Simpan pengaturan**.

## Deploy ke Vercel

Vercel tidak menerima upload zip langsung. Pilih salah satu:

1. **Lewat GitHub (disarankan):** push folder ini ke repo GitHub, lalu di vercel.com pilih *Add New > Project*, import repo-nya. Framework terdeteksi otomatis sebagai Next.js, klik *Deploy*.
2. **Lewat CLI:** di folder ini jalankan `npx vercel`, ikuti pertanyaannya, lalu `npx vercel --prod`.

Tidak ada environment variable yang wajib. API key diisi pengguna lewat halaman Pengaturan AI.

Opsional: `NETRA_BASE_URL` untuk mengganti alamat API (default `https://api.netraruntime.com/v1`).

## Cara kerja dan keamanan

- API key dan riwayat chat disimpan di `localStorage` browser pengguna. Server tidak menyimpannya.
- Browser memanggil `/api/chat` dengan header `x-api-key`. Server meneruskan ke Netra dengan `Authorization: Bearer ...` dan label `X-Netra-Agent: agent-nusa-cs`.
- Base URL dikunci di server, jadi endpoint ini tidak bisa dipakai untuk menembak alamat lain.
- Batas durasi fungsi diset 60 detik (`maxDuration`). Jawaban panjang dengan reasoning tinggi bisa melewatinya; turunkan Max tokens atau Reasoning.
- System prompt otomatis ditambah data demo nasabah (saldo, transaksi, tagihan).
- Tombol "Hubungi agen" masih simulasi.

Semua nama, nominal, dan transaksi adalah data fiktif. Ganti `TXS` dan `demoContext()` di `lib/data.js` dengan data dari backend bank sebelum dipakai di produksi.
"# Agent-Nusa" 
