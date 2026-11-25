# Spec: Agent Nusa sebagai Pendamping Keuangan

Status: disetujui lewat sesi grilling, 24 Nov 2026
Istilah: lihat [CONTEXT.md](../../CONTEXT.md). Keputusan arsitektur: lihat [docs/adr](../adr).

## 1. Latar belakang

Saat ini Agent Nusa adalah chatbot customer service demo. Data nasabahnya hardcode di `lib/data.js`, riwayat chat dan API key disimpan di `localStorage`, dan browser menyusun prompt sendiri lalu mengirimnya ke Netra Runtime (`deepseek/deepseek-v4.1-flash`). Selain itu, system prompt yang sekarang melarang nasihat investasi.

Fitur ini mengubah agent menjadi pendamping keuangan dengan tiga kemampuan:

1. **Memahami kondisi keuangan Nasabah** (saldo, Transaksi, Pengeluaran Bulanan, Goal), lalu menjelaskannya.
2. **Menyusun Rencana Alokasi** setiap kali Gaji masuk, kemudian mengajak Nasabah menerapkannya ke Kantong.
3. **Menawarkan Produk** dari Institusi (deposito, reksadana, saham, crypto) pada Momen Penawaran. Ini menjadi sumber nilai bisnis bagi Institusi.

## 2. Tujuan dan non-tujuan

**Tujuan**
- Nasabah bisa register, login, menyelesaikan onboarding, dan langsung punya rekening demo.
- Saat Gaji masuk, Nasabah menerima Notifikasi Gajian. Notifikasi itu membuka Sesi Percakapan baru yang dimulai oleh agent dan langsung membawa kartu Rencana Alokasi.
- Nasabah bisa mengedit Rencana Alokasi lewat kartu, lalu menerapkannya sehingga dana pos yang menabung masuk ke Kantong.
- Penawaran Produk muncul hanya pada Momen Penawaran, sesuai Profil Risiko, dan bisa berlanjut menjadi Lead dengan persetujuan eksplisit.
- Sesi Percakapan tersimpan di database dan bisa dilanjutkan. Prompt disusun dengan prefix yang stabil supaya context caching DeepSeek bisa kena.

**Non-tujuan (MVP)**
- Integrasi core banking sungguhan, transfer nyata, atau pembelian Produk sungguhan.
- Mengirim Lead ke sistem Institusi. Lead hanya disimpan.
- Produk properti.
- Deteksi Gaji dengan heuristik. Di MVP, Gaji dikenali hanya dari kategori `payroll`.
- Push notification atau email.
- Mode tamu. Riwayat lama di `localStorage` juga tidak dimigrasi.
- Pilihan persona demo.
- Tool/function calling.

## 3. Prinsip yang tidak boleh dilanggar

1. **Angka tidak pernah berasal dari AI** ([ADR 0002](../adr/0002-alokasi-deterministik-ai-hanya-menjelaskan.md)). Nominal Rencana Alokasi dihitung oleh Aturan Alokasi di kode. AI hanya menjelaskannya. Jika Nasabah meminta perubahan lewat teks, agent mengarahkannya ke kartu.
2. **Kartu disisipkan oleh server** ([ADR 0004](../adr/0004-kartu-disisipkan-server-bukan-tool-calling.md)). Server yang memutuskan kapan kartu Rencana dan Penawaran muncul serta apa isinya.
3. **Uang hanya berubah lewat fungsi Postgres yang atomik** ([ADR 0005](../adr/0005-saldo-dihitung-dari-buku-besar.md)). Saldo selalu dihitung dari buku besar.
4. **Isolasi data per Nasabah ditegakkan oleh RLS** ([ADR 0001](../adr/0001-supabase-sebagai-database-dan-auth.md)).
5. **Prefix prompt harus stabil** ([ADR 0003](../adr/0003-sesi-disimpan-dengan-snapshot-demi-prefix-cache.md)). Lihat bagian 7.
6. Agent tetap tidak pernah meminta PIN, password, CVV, atau OTP, dan tidak pernah melakukan transaksi nyata.

## 4. Context caching DeepSeek

> **Penting:** context caching DeepSeek berjalan **di server DeepSeek**, bukan di sistem kita.

Fakta dari dokumentasi resmi DeepSeek (Context Caching on Disk):
- Caching aktif otomatis tanpa perubahan kode, dan biaya dihitung dari cache yang benar-benar kena.
- Cache hanya kena jika **prefix identik mulai token ke-0**. Kecocokan di tengah input tidak dihitung.
- Satuan penyimpanan cache adalah 64 token. Konten di bawah 64 token tidak di-cache.
- Cache yang tidak terpakai dihapus otomatis dalam hitungan jam sampai hari, dan cache hit tidak dijamin 100%.
- Percakapan multi-turn bisa kena cache dari turn sebelumnya.

Konsekuensinya bagi kita:
- Kita **tidak menyimpan cache** itu sendiri. Yang kita simpan di database adalah **Sesi Percakapan**: semua pesan beserta **Snapshot Keuangan** yang dibekukan saat sesi dibuat.
- Ketika sesi dilanjutkan, server menyusun ulang prompt dengan urutan dan isi yang identik (bagian 7), sehingga permintaan berikutnya berpeluang kena cache, termasuk setelah Nasabah logout lalu login lagi, selama cache di DeepSeek belum kedaluwarsa.
- Setiap balasan mencatat `usage` dari API, termasuk `prompt_cache_hit_tokens` dan `prompt_cache_miss_tokens` jika tersedia, untuk membuktikan cache benar-benar kena.
- **Risiko yang harus diverifikasi lebih dulu:** apakah proxy Netra Runtime meneruskan caching ke DeepSeek dan mengembalikan field cache tersebut. Jika tidak, fitur tetap berjalan, hanya tanpa penghematan biaya.

> Hasil verifikasi lewat Netra: **belum dijalankan** (menunggu `NETRA_API_KEY`). Jalankan `node --env-file=.env.local scripts/cek-cache-netra.mjs` dan catat hasilnya di sini.

## 5. Alur utama

### 5.1 Register dan onboarding
1. Register dengan email dan password lewat Supabase Auth.
2. Isi profil singkat: nama panggilan, pekerjaan, tanggal gajian (1–31).
3. Isi Pengeluaran Bulanan. Angka hasil hitungan seed ditampilkan dan bisa dikoreksi.
4. Isi Profil Risiko lewat kuesioner 5 pertanyaan. Langkah ini **boleh dilewati**.
5. Buat Goal pertama. Langkah ini **boleh dilewati**.
6. Masuk ke `/chat`.

Saat register, sistem otomatis membuat rekening, Transaksi "saldo awal", 3 bulan Transaksi seed (persona tetap, mirip Dimas, termasuk Gaji bulanan), Goal Dana Darurat (target 6× Pengeluaran Bulanan), dan `allocation_rules` dengan nilai default.

### 5.2 Gaji masuk
1. Gaji masuk lewat endpoint ingest. Di MVP, pemicunya tombol **"Simulasikan gaji masuk"**.
2. Fungsi `ingest_transaksi` mencatat Transaksi. Jika kategorinya `payroll`, server menghitung Rencana Alokasi dengan `lib/alokasi.js`, lalu menyimpan Rencana (status `diusulkan`) dan Notifikasi Gajian.
3. Supabase Realtime mengirim notifikasi ke browser.
4. Saat Nasabah membuka notifikasi, server membuat **Sesi Percakapan baru** yang dimulai oleh agent, dengan snapshot yang dibekukan saat itu. Agent menulis sapaan dan narasi, lalu kartu Rencana disisipkan.

### 5.3 Rencana Alokasi
- Kartu menampilkan nominal per Pos Alokasi. Pengeluaran Wajib dan Keinginan ditampilkan sebagai batas belanja, sedangkan pos yang menabung ditampilkan sebagai tujuan Kantong.
- Nasabah bisa mengedit nominal per pos lewat input atau slider di kartu. Aturan Alokasi lalu menghitung ulang sisanya.
- **Terapkan** menjalankan `terapkan_rencana`, yang memindahkan dana ke Kantong secara atomik, dan status berubah menjadi `diterapkan`. Server lalu menambahkan pesan di akhir sesi.
- **Abaikan**, atau tidak ada aksi selama 7 hari, mengubah status menjadi `diabaikan`.

### 5.4 Penawaran Produk
- Penawaran hanya muncul pada **Momen Penawaran**:
  1. Nasabah bertanya sendiri.
  2. Pos Investasi dari Rencana yang sudah diterapkan.
  3. Dana Darurat baru mencapai target.
- Momen 2 dan 3 adalah penawaran **tanpa diminta**. Batasnya maksimal 1 per minggu per Nasabah, dan tidak muncul sama sekali jika `profiles.tawaran_proaktif = false`.
- Filter Profil Risiko: tingkat risiko Produk tidak boleh melebihi batas profil. Jika Profil Risiko kosong, hanya deposito dan reksadana pasar uang yang boleh ditawarkan.
- Kartu Penawaran selalu memuat label **"Promosi"**, nama Institusi, imbal hasil indikatif, tingkat risiko, dan disclaimer.
- Status penawaran berjalan dari `ditampilkan` ke `diklik` ke `tertarik`. Untuk "Saya tertarik", tampilkan dialog persetujuan yang menyebut nama Institusi dan data apa saja yang dibagikan. Jika Nasabah setuju, baris `leads` dibuat.
- Untuk momen 1 di MVP, server mendeteksi niat bertanya produk secara sederhana (kata kunci), lalu menyisipkan kartu Produk hasil filter.

## 6. Aturan Alokasi (`lib/alokasi.js`, fungsi murni)

Input: nominal Gaji, Pengeluaran Bulanan, daftar Goal (termasuk Dana Darurat beserta dana terkumpulnya), dan `allocation_rules`.
Output: nominal per pos (`wajib`, `dana_darurat`, `goal[id]`, `investasi`, `keinginan`, `sosial`). Jumlah semua pos harus sama persis dengan nominal Gaji.

Urutan pengisian:
1. **Pengeluaran Wajib** mendapat `min(gaji, Pengeluaran Bulanan)`.
2. **Sosial** mendapat `persen_sosial × sisa` (default 0%).
3. **Dana Darurat** mendapat `min(persen_dana_darurat × sisa, kekurangan target)`. Jika target sudah tercapai, pos ini 0.
4. **Goal** mendapat kebutuhan per bulan masing-masing, yaitu `ceil((target − terkumpul) / sisa bulan)`, diurutkan dari tenggat terdekat. Jika sisa uang tidak cukup, Goal dengan tenggat lebih jauh mendapat lebih sedikit.
5. **Sisa** dibagi ke Investasi dan Keinginan sesuai `persen_investasi` (default 50%). Keinginan mendapat sisanya.

Pembulatan ke ribuan rupiah ke bawah, dan selisih pembulatan masuk ke Keinginan.
Kasus tepi yang wajib diuji: Gaji lebih kecil dari Pengeluaran Bulanan (semua untuk Wajib, pos lain 0), Dana Darurat sudah penuh, tidak punya Goal, Goal yang tenggatnya sudah lewat, dan persentase yang diubah Nasabah.

> Nilai default `persen_dana_darurat` (usulan 20%) dan `persen_investasi` (usulan 50%) belum dibahas secara khusus saat grilling. Lihat bagian 12.

## 7. Susunan prompt (disusun oleh server)

Browser hanya mengirim `{ session_id, message }`. Server menyusun `messages` dengan urutan yang **selalu sama**:

1. `system`: **system prompt statis** yang memiliki nomor versi (`SYSTEM_PROMPT_V{n}`) dan tidak berisi data yang berubah (tidak ada "waktu sekarang"). Isinya mencakup aturan lama yang masih berlaku (keamanan PIN/OTP), ditambah aturan baru: AI tidak boleh mengarang nominal, harus merujuk kartu, dan tidak boleh menawarkan Produk di luar kartu Penawaran. Teks system prompt lama yang melarang nasihat investasi diganti dengan rumusan ini.
2. `system`: **Snapshot Keuangan sesi**, diambil dari `chat_sessions.snapshot` dan dirender menjadi teks dengan urutan field yang tetap serta angka yang sudah diformat (`rp()`). Snapshot dibekukan sejak sesi dibuat dan tidak pernah dirender ulang dari data terbaru.
3. Riwayat `chat_messages` sesuai urutan. Pesan yang memuat kartu dirender menjadi ringkasan teks yang deterministik.
4. Pesan baru Nasabah, diawali `[waktu: 24 Nov 2026 14:12 WIB]`.

Perubahan di tengah sesi, misalnya Rencana diterapkan atau Gaji baru masuk, ditambahkan sebagai pesan baru di akhir. Snapshot tidak diubah.
Mode suara dan telepon (`CALL_RULES`) memakai jalur yang sama. `CALL_RULES` ditambahkan sebagai pesan `system` setelah snapshot, sehingga prefix sistem dan snapshot tetap sama dengan sesi teks.
`chat_sessions.system_prompt_version` mencatat versi prompt yang dipakai. Jika versinya berubah, sesi lama tetap memakai versinya sendiri agar prefix-nya tidak berubah.

### 7.1 Keputusan pelaksanaan Tahap 1

- **Lampiran** (isi PDF dan catatan teks) ditempel ke Sesi Percakapan sebagai pesan `role = 'lampiran'` di akhir riwayat, lalu dirender sebagai pesan `system` "LAMPIRAN DARI NASABAH". Lampiran tidak bisa dilepas karena akan mengubah prefix.
- **Riwayat tidak dipotong.** Prompt lebih dari 400.000 karakter ditolak (413) dengan saran memulai Chat baru.
- **Cap waktu** pesan Nasabah diambil dari `chat_messages.created_at`.
- **Key Deepgram** masih di browser, karena WebSocket speech-to-text dibuka langsung dari browser. Halaman "Pengaturan AI" diperkecil menjadi "Pengaturan" (suara dan lampiran).
- Balasan agent disimpan tanpa di-trim.
- Klien menganggap satu giliran selesai saat stream ditutup server (bukan saat `[DONE]`), karena server baru menutup stream setelah balasan agent tersimpan. Ini menjaga urutan riwayat = urutan percakapan.

## 8. Skema database (Supabase / Postgres)

Semua nominal bertipe `bigint` dalam rupiah. Semua tabel milik Nasabah memiliki `user_id uuid references auth.users` dan policy RLS `select using (user_id = auth.uid())`.

| Tabel | Kolom utama | Catatan |
|---|---|---|
| `profiles` | `user_id` PK, `nama_panggilan`, `pekerjaan`, `tanggal_gajian`, `pengeluaran_bulanan_koreksi` (boleh kosong), `profil_risiko` (enum `konservatif`/`moderat`/`agresif`, boleh kosong), `tawaran_proaktif` bool default true, `onboarding_selesai_at` | Nasabah boleh meng-update profilnya sendiri |
| `accounts` | `id`, `user_id`, `nomor_akhir` | MVP: satu per Nasabah |
| `transactions` | `id`, `account_id`, `user_id`, `arah` (`masuk`/`keluar`), `nominal`, `kategori` (`payroll`, `saldo_awal`, `tagihan`, `qris`, `transfer`, …), `pihak`, `kanal`, `status`, `waktu` | Buku besar Saldo Total |
| `goals` | `id`, `user_id`, `nama`, `target`, `tenggat` (boleh kosong), `is_dana_darurat`, `kelipatan_target` (khusus Dana Darurat) | Dana Darurat tidak bisa dihapus |
| `pockets` | `id`, `user_id`, `jenis` (`dana_darurat`/`goal`/`investasi`/`sosial`), `goal_id` (boleh kosong) | Satu Kantong per Goal |
| `pocket_movements` | `id`, `pocket_id`, `user_id`, `nominal` (± ), `sumber` (`rencana`/`manual`), `plan_id` (boleh kosong), `waktu` | Buku besar Kantong |
| `allocation_rules` | `user_id` PK, `persen_dana_darurat`, `persen_sosial`, `persen_investasi` | |
| `allocation_plans` | `id`, `user_id`, `transaction_id` UNIQUE, `status` (`diusulkan`/`diterapkan`/`diabaikan`), `rincian` jsonb, `kedaluwarsa_at` | Satu Rencana per Gaji |
| `institutions` | `id`, `nama`, `jenis` | Dibaca publik |
| `products` | `id`, `institution_id`, `nama`, `jenis` (`deposito`/`reksadana_pu`/`reksadana_pt`/`reksadana_saham`/`saham`/`crypto`), `risiko` 1–5, `minimal_nominal`, `imbal_hasil_indikatif`, `disclaimer` | Dibaca publik |
| `product_offers` | `id`, `user_id`, `product_id`, `session_id`, `momen` (`ditanya`/`rencana_investasi`/`dana_darurat_penuh`), `status` (`ditampilkan`/`diklik`/`tertarik`), `created_at` | Batas mingguan dihitung dari tabel ini |
| `leads` | `id`, `offer_id` UNIQUE, `user_id`, `institution_id`, `persetujuan_at`, `data_dibagikan` jsonb | Belum dikirim ke mana pun |
| `chat_sessions` | `id`, `user_id`, `snapshot` jsonb, `system_prompt_version`, `dimulai_oleh` (`agent`/`nasabah`), `plan_id` (boleh kosong), `created_at` | |
| `chat_messages` | `id`, `session_id`, `user_id`, `role` (`user`/`assistant`/`lampiran`/`pembaruan`), `content`, `card` jsonb (boleh kosong), `usage` jsonb (boleh kosong), `created_at` | |
| `notifications` | `id`, `user_id`, `jenis` (`gajian`), `ref_id`, `dibaca_at` | Realtime aktif |

View untuk saldo: `v_saldo_total` (SUM `transactions` berstatus berhasil), `v_saldo_kantong` (SUM `pocket_movements` per Kantong), dan `v_saldo_bebas` (Saldo Total dikurangi SUM semua Kantong).

**Hak tulis**: browser hanya boleh menulis ke `profiles`, `goals` (selain Dana Darurat), dan `allocation_rules`. Tabel uang, Rencana, Penawaran, Lead, sesi, dan pesan hanya ditulis oleh server lewat fungsi berikut:

| Fungsi Postgres | Tugas |
|---|---|
| `ingest_transaksi(...)` | Mencatat Transaksi. Validasi Saldo Bebas untuk arah keluar. |
| `terapkan_rencana(plan_id, rincian)` | Memastikan status `diusulkan`, menulis semua `pocket_movements`, lalu mengubah status. Semuanya atomik. |
| `pindah_kantong(dari, ke, nominal)` | Memindahkan dana antar Kantong atau ke dan dari Saldo Bebas, dengan validasi saldo. |
| `seed_nasabah_baru(user_id)` | Membuat rekening, saldo awal, 3 bulan Transaksi, Dana Darurat, dan aturan default. |

Migrasi disimpan di `supabase/migrations/`. Seed katalog (3 Institusi beserta Produknya) disimpan di `supabase/seed.sql`.

## 9. API (Next.js Route Handlers)

| Endpoint | Fungsi |
|---|---|
| `POST /api/chat` | `{ session_id, message }`: menyusun prompt (bagian 7), memanggil Netra dengan stream, menyimpan pesan dan `usage` |
| `POST /api/sessions` | Membuat sesi baru yang dimulai Nasabah, dengan snapshot dibekukan saat itu |
| `GET /api/sessions/:id` | Mengambil riwayat sesi untuk dilanjutkan |
| `POST /api/demo/gaji` | Mensimulasikan Gaji masuk lewat jalur ingest yang sama |
| `POST /api/notifications/:id/open` | Membuat sesi baru yang dimulai agent untuk Notifikasi Gajian |
| `PATCH /api/plans/:id` | Mengedit rincian (dihitung ulang oleh `lib/alokasi.js`) |
| `POST /api/plans/:id/apply` · `/ignore` | Menerapkan atau mengabaikan Rencana |
| `POST /api/offers/:id/click` · `/interest` | Mengubah status Penawaran. `interest` wajib membawa persetujuan. |

API key Netra dipindah ke env server `NETRA_API_KEY`. Header `x-api-key` dari browser dihapus. Halaman **Pengaturan AI** tidak lagi bisa dibuka oleh Nasabah (dipindah ke halaman admin atau disembunyikan). Model dan parameter diatur lewat env atau konstanta server.

Env baru: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (khusus server), `NETRA_API_KEY`, dan `NETRA_MODEL` (opsional).

## 10. Halaman

- `/` (landing): tetap publik.
- `/login`, `/register`: halaman baru.
- `/onboarding`: wizard 5 langkah (bagian 5.1).
- `/chat`: wajib login. Berisi daftar Sesi Percakapan, panel Saldo Total, Saldo Bebas, dan Kantong, panel Transaksi dari DB, lonceng Notifikasi, tombol "Simulasikan gaji masuk", serta kartu Rencana dan Penawaran di dalam chat.
- Pengaturan: profil, Pengeluaran Bulanan, Profil Risiko, persentase Aturan Alokasi, Goal, dan sakelar "tawarkan produk".

## 11. Tahapan

Setiap tahap menjadi satu PR yang bisa didemokan.

**Tahap 1: Fondasi**
- Setup Supabase cloud, migrasi, RLS, dan `seed_nasabah_baru`.
- Register, login, dan onboarding (Profil Risiko dan Goal boleh dilewati; kuesioner Profil Risiko boleh berupa placeholder hingga Tahap 3).
- Sesi Percakapan di DB, `/api/chat` menyusun prompt di server (bagian 7), pencatatan `usage`, dan API key dipindah ke env.
- **Langkah pertama:** verifikasi apakah Netra mengembalikan `prompt_cache_hit_tokens`.
- Selesai jika: dua Nasabah berbeda tidak bisa saling melihat data; sesi yang dilanjutkan setelah login ulang memiliki prefix identik dan `usage` tercatat; panel saldo dan Transaksi membaca dari DB.

**Tahap 2: Alokasi**
- Goal, Kantong, `lib/alokasi.js` beserta unit test (vitest), `ingest_transaksi`, tombol simulasi Gaji, Notifikasi Gajian via Realtime, sesi yang dimulai agent, kartu Rencana yang bisa diedit, `terapkan_rencana`, dan kedaluwarsa 7 hari.
- Selesai jika: mensimulasikan Gaji memunculkan notifikasi; notifikasi membuka sesi berisi kartu; setelah Rencana diterapkan, Kantong dan Saldo Bebas berubah dengan benar; semua kasus tepi di bagian 6 lulus test.

**Tahap 3: Penawaran**
- Seed 3 Institusi (Bank Nusa, Nusa Sekuritas, Nusa Kripto) beserta Produknya, kuesioner Profil Risiko, filter risiko, Momen Penawaran beserta batas mingguan dan sakelar, kartu Penawaran, dialog persetujuan, dan `leads`.
- Selesai jika: Produk berisiko tinggi tidak pernah muncul untuk Nasabah konservatif atau yang belum mengisi profil; penawaran tanpa diminta tidak muncul lebih dari 1 kali per minggu; Lead tidak terbentuk tanpa persetujuan.

## 12. Hal terbuka dan risiko

- **Nilai default persentase** (`persen_dana_darurat` 20%, `persen_investasi` 50%) masih berupa usulan dan perlu dikonfirmasi sebelum Tahap 2.
- **Isi kuesioner Profil Risiko** (5 pertanyaan dan cara menilainya) perlu disusun sebelum Tahap 3.
- **Caching lewat Netra** belum terverifikasi (bagian 4).
- **Regulasi:** ini demo dengan Institusi fiktif. Sebelum dipakai sungguhan, Penawaran Produk dan Lead wajib ditinjau dari sisi aturan OJK tentang pemasaran produk investasi dan UU PDP.
- **Deteksi niat "bertanya produk"** di MVP memakai kata kunci, sehingga bisa terlewat atau salah tangkap. Ini kandidat untuk tool calling di kemudian hari.
- **Pilihan Supabase cloud untuk development:** project dan key harus dibuat sendiri oleh pemilik repo.
