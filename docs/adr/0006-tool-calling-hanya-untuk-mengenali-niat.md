# Tool calling hanya dipakai untuk mengenali niat dan mengambil data dari ucapan Nasabah

Status: diterima, 26 Nov 2026. Mengubah sebagian [ADR 0004](0004-kartu-disisipkan-server-bukan-tool-calling.md).

Fitur baru membuat agent harus mengenali beberapa niat dari kalimat bebas, termasuk teks hasil suara: mencatat pengeluaran, meminta Ringkasan Bulanan, ingin berinvestasi, dan meminta Laporan Portofolio. Kata kunci dan regex terlalu rapuh untuk itu. Karena itu kami memakai tool calling, **tetapi hanya untuk mengenali niat dan mengambil data** (barang, nominal, kategori, jenis produk). Tool tidak pernah mengubah data secara langsung. Server tetap yang menghitung angka, menyiapkan Aksi Tertunda, menyisipkan kartu, dan meminta konfirmasi.

Pengamannya:
- Nominal dari tool hanya diterima jika angka yang sama memang ada di ucapan Nasabah (misalnya "25rb", "25 ribu", "Rp25.000"). Jika tidak ada, agent menanyakan nominalnya.
- Definisi tool bersifat statis dan berversi bersama system prompt, sehingga tidak merusak prefix cache ([ADR 0003](0003-sesi-disimpan-dengan-snapshot-demi-prefix-cache.md)).
- Sebelum dipakai, tool calling lewat Netra diverifikasi dengan script (termasuk saat stream, dan cache tetap kena). Jika gagal, kami beralih ke panggilan AI kedua yang mengembalikan JSON, dengan pengaman yang sama.

Alternatif yang ditolak: kata kunci saja (sering salah tangkap, terutama untuk ucapan), dan membiarkan tool langsung menulis ke database (sulit diaudit dan melanggar prinsip bahwa uang hanya berubah setelah konfirmasi).
