# Spec: Agent Nusa sebagai Pendamping Keuangan

Status: disetujui lewat sesi grilling, 24 Nov 2026. Diperluas 26 Nov 2026 (Catatan Pengeluaran, Ringkasan Bulanan, Pembelian Demo, Laporan Portofolio, Panel Demo).
Istilah: lihat [CONTEXT.md](../../CONTEXT.md). Keputusan arsitektur: lihat [docs/adr](../adr).

## 1. Latar belakang

Saat ini Agent Nusa adalah chatbot customer service demo. Data nasabahnya hardcode di `lib/data.js`, riwayat chat dan API key disimpan di `localStorage`, dan browser menyusun prompt sendiri lalu mengirimnya ke Netra Runtime (`deepseek/deepseek-v4.1-flash`). Selain itu, system prompt yang sekarang melarang nasihat investasi.

Fitur ini mengubah agent menjadi pendamping keuangan dengan lima kemampuan:

1. **Memahami kondisi keuangan Nasabah** (saldo, Transaksi, Pengeluaran Bulanan, Goal), lalu menjelaskannya.
2. **Menyusun Rencana Alokasi** setiap kali Gaji masuk, kemudian mengajak Nasabah menerapkannya ke Kantong.
3. **Mencatat pengeluaran** yang diceritakan Nasabah lewat chat, suara, atau telepon, lalu memberi **Ringkasan Bulanan** berstatus Hemat, Aman, atau Boros beserta sarannya.
4. **Menawarkan Produk** dari Institusi (deposito, reksadana, reksadana properti, saham, crypto) pada Momen Penawaran, lalu menjalankan **Pembelian Demo** setelah Nasabah mengonfirmasi nominalnya. Ini menjadi sumber nilai bisnis bagi Institusi.
5. **Melaporkan Kepemilikan** lewat Laporan Portofolio dengan valuasi dummy.

Untuk demo, **Panel Demo** menyediakan tombol untuk mensimulasikan kejadian (Gaji masuk, belanja, hasil investasi) dan mengembalikan data ke kondisi awal.

## 2. Tujuan dan non-tujuan

**Tujuan**
- Nasabah bisa register, login, menyelesaikan onboarding, dan langsung punya rekening demo.
- Saat Gaji masuk, Nasabah menerima Notifikasi Gajian. Notifikasi itu membuka Sesi Percakapan baru yang dimulai oleh agent dan langsung membawa kartu Rencana Alokasi.
- Nasabah bisa mengedit Rencana Alokasi lewat kartu, lalu menerapkannya sehingga dana pos yang menabung masuk ke Kantong.
- Nasabah bisa menceritakan pengeluarannya ("tadi jajan bakso 25 ribu") lewat chat, suara, atau telepon. Setelah dikonfirmasi, pengeluaran itu menjadi Transaksi dan saldo berkurang.
- Nasabah bisa meminta Ringkasan Bulanan. Jika Boros, agent memberi saran berhemat berdasarkan Keinginan terbesar. Jika Hemat atau Aman, agent memuji lalu boleh menawarkan Produk.
- Penawaran Produk muncul hanya pada Momen Penawaran dan sesuai Profil Risiko. Jika Nasabah mau, agent menyarankan nominal hasil hitungan kode, meminta konfirmasi, lalu menjalankan Pembelian Demo.
- Nasabah bisa meminta Laporan Portofolio lewat chat, suara, atau telepon.
- Sesi Percakapan tersimpan di database dan bisa dilanjutkan. Prompt disusun dengan prefix yang stabil supaya context caching DeepSeek bisa kena.

**Non-tujuan (MVP)**
- Integrasi core banking sungguhan, transfer nyata, atau pembelian Produk sungguhan. Pembelian Demo hanya mengubah buku besar demo.
- Lead dan pengiriman data Nasabah ke Institusi ([ADR 0007](../adr/0007-uang-berubah-hanya-setelah-konfirmasi.md)).
- Pencairan atau penjualan Kepemilikan.
- Properti selain satu Produk reksadana properti.
- Deteksi Gaji dengan heuristik. Di MVP, Gaji dikenali hanya dari kategori `payroll`.
- Push notification atau email.
- Mode tamu. Riwayat lama di `localStorage` juga tidak dimigrasi.
- Pilihan persona demo.
- Tool calling yang langsung menulis data. Tool hanya dipakai untuk mengenali niat dan mengambil data ([ADR 0006](../adr/0006-tool-calling-hanya-untuk-mengenali-niat.md)).

## 3. Prinsip yang tidak boleh dilanggar

1. **Angka tidak pernah berasal dari AI** ([ADR 0002](../adr/0002-alokasi-deterministik-ai-hanya-menjelaskan.md)). Nominal Rencana Alokasi dihitung oleh Aturan Alokasi di kode. AI hanya menjelaskannya. Jika Nasabah meminta perubahan lewat teks, agent mengarahkannya ke kartu.
2. **Kartu disisipkan oleh server** ([ADR 0004](../adr/0004-kartu-disisipkan-server-bukan-tool-calling.md)). Server yang memutuskan kapan kartu Rencana dan Penawaran muncul serta apa isinya.
3. **Uang hanya berubah lewat fungsi Postgres yang atomik** ([ADR 0005](../adr/0005-saldo-dihitung-dari-buku-besar.md)). Saldo selalu dihitung dari buku besar.
4. **Isolasi data per Nasabah ditegakkan oleh RLS** ([ADR 0001](../adr/0001-supabase-sebagai-database-dan-auth.md)).
5. **Prefix prompt harus stabil** ([ADR 0003](../adr/0003-sesi-disimpan-dengan-snapshot-demi-prefix-cache.md)). Lihat bagian 7.
6. Agent tetap tidak pernah meminta PIN, password, CVV, atau OTP, dan tidak pernah melakukan transaksi nyata.
7. **Uang dari percakapan hanya berubah setelah dikonfirmasi** ([ADR 0007](../adr/0007-uang-berubah-hanya-setelah-konfirmasi.md)). Catatan Pengeluaran dan Pembelian Demo selalu lewat Aksi Tertunda. Nominal Catatan Pengeluaran harus ada di ucapan Nasabah, sedangkan nominal saran Pembelian Demo dihitung kode.

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
- Setiap balasan mencatat `usage` dari API, termasuk jumlah token yang kena cache (lewat Netra: `prompt_tokens_details.cached_tokens`), untuk membuktikan cache benar-benar kena.
- **Risiko yang harus diverifikasi lebih dulu:** apakah proxy Netra Runtime meneruskan caching ke DeepSeek dan mengembalikan field cache tersebut. Jika tidak, fitur tetap berjalan, hanya tanpa penghematan biaya.

> **Hasil verifikasi lewat Netra (25 Nov 2026, `scripts/cek-cache-netra.mjs`):** caching **berfungsi**. Prompt ~2.050 token dengan prefix sama: permintaan ke-1 dan ke-2 `cached_tokens = 0`, permintaan ke-3 `cached_tokens = 1.792` (sesuai aturan DeepSeek: prefix bersama dipersist setelah permintaan ke-2). Netra mengembalikan field cache dalam format OpenAI, yaitu `usage.prompt_tokens_details.cached_tokens` (bukan `prompt_cache_hit_tokens`). `stream_options.include_usage` diterima, dan `usage` ikut di chunk terakhir stream.

## 4a. Tool calling lewat Netra

> **Hasil verifikasi lewat Netra (26 Nov 2026, `scripts/cek-tools-netra.mjs`):**
> - Non-stream: berfungsi, contoh `tool_calls`: `catat_pengeluaran({"barang": "Bakso", "nominal": 25000, "kategori": "jajan"})`, `finish_reason = tool_calls`.
> - Stream: berfungsi. Potongan `delta.tool_calls` bisa dirakit menjadi JSON yang valid (`finish_reason = tool_calls`, `usage` ikut di chunk terakhir).
> - Round-trip hasil tool (`role: "tool"`): berfungsi, model membalas teks.
> - Cache dengan definisi tool: permintaan ke-3 `cached_tokens = 2.304` (sudah kena cache sejak permintaan pertama pada uji ini karena prefix sama telah dipersist oleh uji sebelumnya).
> - Prompt yang berakhir dengan pesan `system`: menghasilkan teks.
>
> Kesimpulan: Tahap 3 memakai tool calling (ADR 0006).

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
  1. Nasabah bertanya sendiri, atau menyatakan ingin berinvestasi.
  2. Pos Investasi dari Rencana yang sudah diterapkan.
  3. Dana Darurat baru mencapai target.
  4. Ringkasan Bulanan berstatus Hemat atau Aman ("ringkasan sehat").
- Momen 2, 3, dan 4 adalah penawaran **tanpa diminta**. Batasnya maksimal 1 per minggu per Nasabah, dan tidak muncul sama sekali jika `profiles.tawaran_proaktif = false`.
- Filter Profil Risiko: tingkat risiko Produk tidak boleh melebihi batas profil. Jika Profil Risiko kosong, hanya deposito dan reksadana pasar uang yang boleh ditawarkan.
- Kartu Penawaran selalu memuat label **"Promosi"**, nama Institusi, imbal hasil indikatif, tingkat risiko, minimal pembelian, dan disclaimer.
- Status penawaran berjalan dari `ditampilkan` ke `diklik` ke `dibeli`.
- Niat dikenali lewat tool calling ([ADR 0006](../adr/0006-tool-calling-hanya-untuk-mengenali-niat.md)), lalu server menyisipkan kartu Produk hasil filter.

### 5.5 Catatan Pengeluaran
1. Nasabah bercerita lewat chat, suara, atau telepon, misalnya "tadi abis jajan bakso 25 ribu".
2. Model memanggil tool `catat_pengeluaran { barang, nominal, kategori }`. Server memeriksa bahwa nominal tersebut memang ada di ucapan Nasabah (`lib/nominal.js` mengenali "25rb", "25 ribu", "Rp25.000", "1,5 juta", dan sejenisnya). Jika tidak ada, agent menanyakan nominalnya dan tidak ada Aksi Tertunda yang dibuat.
3. Server membuat Aksi Tertunda dan menyisipkan kartu "Catat Rp 25.000 – Bakso (Jajan)? [Catat] [Batal]". Agent mengulang nominalnya dan meminta konfirmasi. Di mode telepon, agent mengucapkannya.
4. Nasabah mengonfirmasi lewat tombol atau jawaban "ya/benar/oke" di giliran berikutnya. Server menjalankan `ingest_transaksi` (arah `keluar`, kanal `catatan`, divalidasi terhadap Saldo Bebas), lalu menambahkan pesan `pembaruan` berisi saldo terbaru di akhir sesi.
5. Jika Nasabah menolak, membahas hal lain, atau tidak menjawab dalam 30 menit, aksi menjadi `batal`.

### 5.6 Ringkasan Bulanan
1. Nasabah meminta ringkasan ("pengeluaranku bulan ini gimana?"), dan model memanggil tool `minta_ringkasan`.
2. `lib/ringkasan.js` (fungsi murni) menghitung total per Kategori Belanja bulan berjalan (WIB), Batas Belanja, batas pro-rata (`Batas Belanja × hari berjalan / jumlah hari bulan ini`), dan Status Belanja: **Hemat** jika realisasi ≤ 80% batas pro-rata, **Aman** jika ≤ 100%, dan **Boros** jika lebih dari itu. Pindahan ke Kantong dan Pembelian Demo tidak dihitung sebagai belanja.
3. Server menyisipkan kartu Ringkasan. Agent menjelaskannya:
   - **Boros**: menyebut Keinginan terbesar dan menyarankan cara berhemat sampai akhir bulan. Tidak ada Penawaran.
   - **Hemat atau Aman**: memuji pengelolaan belanja Nasabah, lalu jika Momen Penawaran 4 lolos batas mingguan dan sakelar, server menyisipkan kartu Penawaran.

### 5.7 Pembelian Demo dan Laporan Portofolio
1. Nasabah menyatakan ingin berinvestasi, misalnya "yaudah aku mau coba reksadana", dan model memanggil tool `mau_investasi { jenis_produk? }`.
2. Server memilih Produk hasil filter Profil Risiko, lalu menghitung **nominal saran** dengan `lib/investasi.js`: `min(pos Investasi Rencana terakhir yang diterapkan, Saldo Bebas − 1× Pengeluaran Bulanan)`, dibulatkan ke bawah ke kelipatan 10.000, dan tidak kurang dari minimal pembelian Produk. Jika Saldo Bebas tidak cukup untuk minimal pembelian, agent menjelaskan bahwa saat ini belum disarankan berinvestasi.
3. Server membuat Aksi Tertunda dengan kartu Pembelian Demo (Produk, nominal saran yang bisa diedit, label "Promosi", dan disclaimer). Agent menyebut nominal saran dan meminta Nasabah memastikan jumlah yang ingin dikeluarkan.
4. Setelah dikonfirmasi, `beli_produk_demo` mencatat Transaksi keluar (kategori `investasi`), membuat Kepemilikan, dan mengubah status Penawaran menjadi `dibeli`, semuanya atomik. Server lalu menambahkan pesan `pembaruan`.
5. Nasabah bisa meminta laporan ("investasiku gimana?"), dan model memanggil `minta_laporan`. Server menyisipkan kartu Laporan Portofolio (modal, nilai terkini, untung atau rugi per Kepemilikan dan total) dari valuasi terakhir.
6. Valuasi berasal dari tombol Panel Demo **"Simulasikan 1 bulan hasil investasi"**. Return per bulan per jenis Produk dihitung oleh `lib/valuasi.js` dengan acak yang bisa diulang (seed = id Kepemilikan + nomor bulan): deposito dan reksadana pasar uang stabil positif, sedangkan reksadana campuran, saham, reksadana properti, dan crypto bisa positif atau negatif.

### 5.8 Panel Demo
Satu laci di `/chat`. Semua tombol lewat jalur yang sama dengan kejadian sungguhan (`ingest_transaksi`, notifikasi, dan sebagainya):
1. **Gaji masuk**
2. **Belanja acak**: satu Transaksi QRIS keluar dengan Kategori Belanja dan nominal acak yang wajar.
3. **Skenario boros**: beberapa Transaksi Jajan, Belanja, dan Hiburan sekaligus, sehingga Status Belanja menjadi Boros.
4. **Simulasikan 1 bulan hasil investasi**
5. **Penuhi Dana Darurat**: memindahkan Saldo Bebas ke Kantong Dana Darurat sampai target, sehingga memicu Momen Penawaran 3.
6. **Reset data demo**: menghapus semua data milik Nasabah (kecuali akun dan profil), lalu menjalankan ulang `seed_nasabah_baru`.

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

Nilai default (dikonfirmasi 26 Nov 2026): `persen_dana_darurat` 20%, `persen_investasi` 50%, `persen_sosial` 0%.

## 7. Susunan prompt (disusun oleh server)

Browser hanya mengirim `{ session_id, message }`. Server menyusun `messages` dengan urutan yang **selalu sama**:

1. `system`: **system prompt statis** yang memiliki nomor versi (`SYSTEM_PROMPT_V{n}`) dan tidak berisi data yang berubah (tidak ada "waktu sekarang"). Isinya mencakup aturan lama yang masih berlaku (keamanan PIN/OTP), ditambah aturan baru: AI tidak boleh mengarang nominal, harus merujuk kartu, dan tidak boleh menawarkan Produk di luar kartu Penawaran. Teks system prompt lama yang melarang nasihat investasi diganti dengan rumusan ini.
2. `system`: **Snapshot Keuangan sesi**, diambil dari `chat_sessions.snapshot` dan dirender menjadi teks dengan urutan field yang tetap serta angka yang sudah diformat (`rp()`). Snapshot dibekukan sejak sesi dibuat dan tidak pernah dirender ulang dari data terbaru.
3. Riwayat `chat_messages` sesuai urutan. Pesan yang memuat kartu dirender menjadi ringkasan teks yang deterministik.
4. Pesan baru Nasabah, diawali `[waktu: 24 Nov 2026 14:12 WIB]`.

Perubahan di tengah sesi, misalnya Rencana diterapkan atau Gaji baru masuk, ditambahkan sebagai pesan baru di akhir. Snapshot tidak diubah.
Mode suara dan telepon (`CALL_RULES`) memakai jalur yang sama. `CALL_RULES` ditambahkan sebagai pesan `system` setelah snapshot, sehingga prefix sistem dan snapshot tetap sama dengan sesi teks.
`chat_sessions.system_prompt_version` mencatat versi prompt yang dipakai. Jika versinya berubah, sesi lama tetap memakai versinya sendiri agar prefix-nya tidak berubah.
Definisi tool ([ADR 0006](../adr/0006-tool-calling-hanya-untuk-mengenali-niat.md)) bersifat statis dan ikut berversi bersama system prompt (`TOOLS_V{n}`), sehingga tidak mengubah prefix. Panggilan tool dan hasilnya disimpan sebagai pesan di riwayat, lalu dirender ulang secara deterministik pada permintaan berikutnya.
Kartu (Rencana, Catatan Pengeluaran, Ringkasan, Penawaran, Pembelian Demo, Laporan Portofolio) disimpan di `chat_messages.card`, lalu dirender ke prompt sebagai ringkasan teks yang deterministik dengan angka dari kode.

### 7.1 Keputusan pelaksanaan Tahap 1

- **Lampiran** (isi PDF dan catatan teks) ditempel ke Sesi Percakapan sebagai pesan `role = 'lampiran'` di akhir riwayat, lalu dirender sebagai pesan `system` "LAMPIRAN DARI NASABAH". Lampiran tidak bisa dilepas karena akan mengubah prefix.
- **Riwayat tidak dipotong.** Prompt lebih dari 400.000 karakter ditolak (413) dengan saran memulai Chat baru.
- **Cap waktu** pesan Nasabah diambil dari `chat_messages.created_at`.
- **Key Deepgram** masih di browser, karena WebSocket speech-to-text dibuka langsung dari browser. Halaman "Pengaturan AI" diperkecil menjadi "Pengaturan" (suara dan lampiran).
- Balasan agent disimpan tanpa di-trim.
- Klien menganggap satu giliran selesai saat stream ditutup server (bukan saat `[DONE]`), karena server baru menutup stream setelah balasan agent tersimpan. Ini menjaga urutan riwayat = urutan percakapan.
- Begitu pesan Nasabah disimpan, server langsung menyisipkan baris balasan agent kosong sebagai penanda urutan, lalu mengisinya setelah stream selesai (atau menghapus keduanya bila gagal/kosong). Baris kosong tidak pernah ikut ke prompt maupun ke tampilan.

## 8. Skema database (Supabase / Postgres)

Semua nominal bertipe `bigint` dalam rupiah. Semua tabel milik Nasabah memiliki `user_id uuid references auth.users` dan policy RLS `select using (user_id = auth.uid())`.

| Tabel | Kolom utama | Catatan |
|---|---|---|
| `profiles` | `user_id` PK, `nama_panggilan`, `pekerjaan`, `tanggal_gajian`, `pengeluaran_bulanan_koreksi` (boleh kosong), `profil_risiko` (enum `konservatif`/`moderat`/`agresif`, boleh kosong), `tawaran_proaktif` bool default true, `onboarding_selesai_at` | Nasabah boleh meng-update profilnya sendiri |
| `accounts` | `id`, `user_id`, `nomor_akhir` | MVP: satu per Nasabah |
| `transactions` | `id`, `account_id`, `user_id`, `arah` (`masuk`/`keluar`), `nominal`, `kategori` (`payroll`, `saldo_awal`, `tagihan`, `qris`, `transfer`, `investasi`, …), `kategori_belanja` (`makan`/`jajan`/`belanja`/`transportasi`/`tagihan`/`hiburan`/`lainnya`, boleh kosong; diisi untuk Transaksi keluar yang dihitung sebagai belanja), `pihak`, `kanal` (termasuk `catatan` untuk Catatan Pengeluaran), `status`, `waktu` | Buku besar Saldo Total |
| `goals` | `id`, `user_id`, `nama`, `target`, `tenggat` (boleh kosong), `is_dana_darurat`, `kelipatan_target` (khusus Dana Darurat) | Dana Darurat tidak bisa dihapus |
| `pockets` | `id`, `user_id`, `jenis` (`dana_darurat`/`goal`/`investasi`/`sosial`), `goal_id` (boleh kosong) | Satu Kantong per Goal |
| `pocket_movements` | `id`, `pocket_id`, `user_id`, `nominal` (± ), `sumber` (`rencana`/`manual`), `plan_id` (boleh kosong), `waktu` | Buku besar Kantong |
| `allocation_rules` | `user_id` PK, `persen_dana_darurat`, `persen_sosial`, `persen_investasi` | |
| `allocation_plans` | `id`, `user_id`, `transaction_id` UNIQUE, `status` (`diusulkan`/`diterapkan`/`diabaikan`), `rincian` jsonb, `kedaluwarsa_at` | Satu Rencana per Gaji |
| `institutions` | `id`, `nama`, `jenis` | Dibaca publik |
| `products` | `id`, `institution_id`, `nama`, `jenis` (`deposito`/`reksadana_pu`/`reksadana_pt`/`reksadana_saham`/`reksadana_properti`/`saham`/`crypto`), `risiko` 1–5, `minimal_nominal`, `imbal_hasil_indikatif`, `disclaimer` | Dibaca publik |
| `product_offers` | `id`, `user_id`, `product_id`, `session_id`, `momen` (`ditanya`/`rencana_investasi`/`dana_darurat_penuh`/`ringkasan_sehat`), `status` (`ditampilkan`/`diklik`/`dibeli`), `created_at` | Batas mingguan dihitung dari tabel ini |
| `pending_actions` | `id`, `user_id`, `session_id`, `jenis` (`catat_pengeluaran`/`beli_produk`), `data` jsonb, `status` (`menunggu`/`dijalankan`/`batal`), `kedaluwarsa_at`, `created_at` | Paling banyak satu `menunggu` per sesi |
| `holdings` | `id`, `user_id`, `product_id`, `offer_id` (boleh kosong), `modal`, `transaction_id`, `created_at` | Kepemilikan; tidak bisa dicairkan di MVP |
| `holding_valuations` | `id`, `holding_id`, `user_id`, `bulan_ke`, `nilai`, `created_at` | Valuasi dummy; nilai terkini = baris terakhir |
| `chat_sessions` | `id`, `user_id`, `snapshot` jsonb, `system_prompt_version`, `dimulai_oleh` (`agent`/`nasabah`), `plan_id` (boleh kosong), `created_at` | |
| `chat_messages` | `id`, `session_id`, `user_id`, `role` (`user`/`assistant`/`lampiran`/`pembaruan`/`kartu`/`tool`), `content`, `card` jsonb (boleh kosong), `tool` jsonb (boleh kosong: nama tool, argumen, id panggilan), `usage` jsonb (boleh kosong), `created_at` | |
| `notifications` | `id`, `user_id`, `jenis` (`gajian`), `ref_id`, `dibaca_at` | Realtime aktif |

View untuk saldo: `v_saldo_total` (SUM `transactions` berstatus berhasil), `v_saldo_kantong` (SUM `pocket_movements` per Kantong), dan `v_saldo_bebas` (Saldo Total dikurangi SUM semua Kantong).

View tambahan: `v_kepemilikan` (modal dan nilai terkini per Kepemilikan).

**Hak tulis**: browser hanya boleh menulis ke `profiles`, `goals` (selain Dana Darurat), dan `allocation_rules`. Tabel uang, Rencana, Penawaran, Aksi Tertunda, Kepemilikan, sesi, dan pesan hanya ditulis oleh server lewat fungsi berikut:

| Fungsi Postgres | Tugas |
|---|---|
| `ingest_transaksi(...)` | Mencatat Transaksi. Validasi Saldo Bebas untuk arah keluar. Dipakai juga oleh Catatan Pengeluaran dan Panel Demo. |
| `terapkan_rencana(plan_id, rincian)` | Memastikan status `diusulkan`, menulis semua `pocket_movements`, lalu mengubah status. Semuanya atomik. |
| `pindah_kantong(dari, ke, nominal)` | Memindahkan dana antar Kantong atau ke dan dari Saldo Bebas, dengan validasi saldo. |
| `jalankan_aksi(action_id)` | Memastikan status `menunggu` dan belum kedaluwarsa, menjalankan aksinya (`ingest_transaksi` atau `beli_produk_demo`), lalu mengubah status menjadi `dijalankan`. Semuanya atomik. |
| `beli_produk_demo(user_id, product_id, nominal, offer_id)` | Mencatat Transaksi keluar kategori `investasi`, membuat `holdings` dan valuasi bulan ke-0, lalu mengubah status Penawaran menjadi `dibeli`. |
| `simulasi_valuasi(user_id, nilai[])` | Menambahkan satu baris valuasi per Kepemilikan. Nilainya dihitung oleh `lib/valuasi.js`. |
| `reset_demo(user_id)` | Menghapus semua data Nasabah kecuali akun dan profil, lalu menjalankan ulang seed. |
| `seed_nasabah_baru(user_id)` | Membuat rekening, saldo awal, 3 bulan Transaksi, Dana Darurat, dan aturan default. |

Migrasi disimpan di `supabase/migrations/`. Seed katalog (3 Institusi beserta Produknya, termasuk satu reksadana properti) disimpan di `supabase/seed.sql`.

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
| `POST /api/offers/:id/click` | Mengubah status Penawaran menjadi `diklik` |
| `PATCH /api/actions/:id` | Mengubah nominal Aksi Tertunda Pembelian Demo dari kartu (divalidasi minimal pembelian dan Saldo Bebas) |
| `POST /api/actions/:id/confirm` · `/cancel` | Menjalankan atau membatalkan Aksi Tertunda dari tombol kartu. Konfirmasi lewat ucapan "ya" ditangani `/api/chat`. |
| `POST /api/demo/belanja` · `/boros` · `/valuasi` · `/dana-darurat-penuh` · `/reset` | Tombol Panel Demo, semuanya lewat jalur yang sama dengan kejadian sungguhan |

API key Netra dipindah ke env server `NETRA_API_KEY`. Header `x-api-key` dari browser dihapus. Halaman **Pengaturan AI** tidak lagi bisa dibuka oleh Nasabah (dipindah ke halaman admin atau disembunyikan). Model dan parameter diatur lewat env atau konstanta server.

Env baru: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (khusus server), `NETRA_API_KEY`, dan `NETRA_MODEL` (opsional).

## 10. Halaman

- `/` (landing): tetap publik.
- `/login`, `/register`: halaman baru.
- `/onboarding`: wizard 5 langkah (bagian 5.1).
- `/chat`: wajib login. Berisi daftar Sesi Percakapan, panel Saldo Total, Saldo Bebas, dan Kantong, panel Transaksi dari DB, panel Kepemilikan, lonceng Notifikasi, laci **Panel Demo** (bagian 5.8), serta kartu Rencana, Catatan Pengeluaran, Ringkasan, Penawaran, Pembelian Demo, dan Laporan Portofolio di dalam chat.
- Pengaturan: profil, Pengeluaran Bulanan, Profil Risiko, persentase Aturan Alokasi, Goal, dan sakelar "tawarkan produk".

## 11. Tahapan

Setiap tahap menjadi satu PR yang bisa didemokan.

**Tahap 1: Fondasi**
- Setup Supabase cloud, migrasi, RLS, dan `seed_nasabah_baru`.
- Register, login, dan onboarding (Profil Risiko dan Goal boleh dilewati; kuesioner Profil Risiko boleh berupa placeholder hingga Tahap 3).
- Sesi Percakapan di DB, `/api/chat` menyusun prompt di server (bagian 7), pencatatan `usage`, dan API key dipindah ke env.
- **Langkah pertama:** verifikasi apakah Netra mengembalikan jumlah token cache (hasil: ya, `prompt_tokens_details.cached_tokens`).
- Selesai jika: dua Nasabah berbeda tidak bisa saling melihat data; sesi yang dilanjutkan setelah login ulang memiliki prefix identik dan `usage` tercatat; panel saldo dan Transaksi membaca dari DB.

**Tahap 2: Alokasi**
- Goal, Kantong, `lib/alokasi.js` beserta unit test (vitest), `ingest_transaksi`, Notifikasi Gajian via Realtime, sesi yang dimulai agent, kartu Rencana yang bisa diedit, `terapkan_rencana`, dan kedaluwarsa 7 hari.
- Panel Demo versi awal: **Gaji masuk** dan **Reset data demo**.
- **Langkah pertama:** verifikasi tool calling lewat Netra (`scripts/cek-tools-netra.mjs`), baik non-stream maupun stream, dan pastikan cache tetap kena dengan definisi tool di prompt. Hasilnya menentukan jalur Tahap 3 ([ADR 0006](../adr/0006-tool-calling-hanya-untuk-mengenali-niat.md)).
- Selesai jika: mensimulasikan Gaji memunculkan notifikasi; notifikasi membuka sesi berisi kartu; setelah Rencana diterapkan, Kantong dan Saldo Bebas berubah dengan benar; semua kasus tepi di bagian 6 lulus test; Reset mengembalikan saldo ke Rp 24.380.500; hasil verifikasi tool calling tercatat di bagian 4a.

**Tahap 3: Catatan Pengeluaran dan Ringkasan Bulanan**
- Kolom `kategori_belanja` (termasuk pemetaan Transaksi seed), `lib/nominal.js`, tool `catat_pengeluaran` dan `minta_ringkasan`, `pending_actions` beserta `jalankan_aksi`, konfirmasi lewat tombol dan ucapan "ya" (chat, suara, telepon), kartu Catatan Pengeluaran dan Ringkasan, `lib/ringkasan.js`, serta tombol Panel Demo **Belanja acak** dan **Skenario boros**.
- Selesai jika: "tadi beli bakso 25 ribu" menghasilkan kartu dan, setelah "ya", Saldo Total berkurang Rp 25.000; nominal yang tidak disebut Nasabah tidak pernah menjadi Aksi Tertunda; Skenario boros mengubah Status Belanja menjadi Boros; semua kasus tepi `lib/nominal.js` dan `lib/ringkasan.js` lulus test.

**Tahap 4: Penawaran, Pembelian Demo, dan Laporan Portofolio**
- Seed 3 Institusi (Bank Nusa, Nusa Sekuritas, Nusa Kripto) beserta Produknya (termasuk satu reksadana properti), kuesioner Profil Risiko, filter risiko, Momen Penawaran (termasuk ringkasan sehat) beserta batas mingguan dan sakelar, kartu Penawaran, tool `mau_investasi` dan `minta_laporan`, `lib/investasi.js`, `beli_produk_demo`, `holdings`, `lib/valuasi.js`, kartu Laporan Portofolio, panel Kepemilikan, serta tombol Panel Demo **Simulasikan 1 bulan hasil investasi** dan **Penuhi Dana Darurat**.
- Selesai jika: Produk berisiko tinggi tidak pernah muncul untuk Nasabah konservatif atau yang belum mengisi profil; penawaran tanpa diminta tidak muncul lebih dari 1 kali per minggu; Pembelian Demo tidak pernah terjadi tanpa konfirmasi; nominal saran sesuai rumus 5.7; laporan menampilkan untung atau rugi yang sama dengan valuasi terakhir.

## 12. Hal terbuka dan risiko

- **Isi kuesioner Profil Risiko** (5 pertanyaan dan cara menilainya) perlu disusun sebelum Tahap 4.
- **Tool calling lewat Netra** belum terverifikasi. Jika tidak berfungsi, Tahap 3 dan 4 memakai panggilan AI kedua yang mengembalikan JSON ([ADR 0006](../adr/0006-tool-calling-hanya-untuk-mengenali-niat.md)).
- **Salah dengar dari suara** bisa menghasilkan nominal yang keliru. Pengamannya adalah konfirmasi lewat Aksi Tertunda, dan agent selalu mengulang nominalnya.
- **Regulasi:** ini demo dengan Institusi fiktif. Sebelum dipakai sungguhan, Penawaran Produk, saran nominal investasi, dan Pembelian wajib ditinjau dari sisi aturan OJK tentang pemasaran produk investasi dan UU PDP.
- **Pilihan Supabase cloud untuk development:** project dan key harus dibuat sendiri oleh pemilik repo.
