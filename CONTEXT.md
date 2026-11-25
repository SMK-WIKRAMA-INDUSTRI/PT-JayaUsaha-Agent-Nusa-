# Agent Nusa

Agent customer service bank yang membantu Nasabah mengelola keuangan: menjelaskan kondisi keuangannya, menyusun Rencana Alokasi, dan menawarkan Produk dari Institusi yang relevan.

## Pihak

**Nasabah**:
Orang yang punya akun di Agent Nusa dan memiliki rekening, transaksi, dan Goal sendiri. Satu akun login sama dengan satu Nasabah.
_Avoid_: user, customer, pelanggan

**Institusi**:
Pihak yang produknya ditawarkan oleh agent, misalnya bank, manajer investasi, sekuritas, exchange crypto, atau marketplace properti. MVP hanya punya satu Institusi, yaitu Bank Nusa.
_Avoid_: partner, mitra, vendor, tenant

## Keuangan Nasabah

**Transaksi**:
Mutasi dana masuk atau keluar pada rekening Nasabah. Semua Transaksi, termasuk yang disimulasikan, masuk lewat satu pintu yang sama.
_Avoid_: mutasi, history

**Gaji**:
Transaksi masuk yang ditandai berkategori payroll oleh sumbernya. Gaji memicu Notifikasi Gajian.
_Avoid_: pemasukan (terlalu umum), gajian (sebagai kata benda data)

**Pengeluaran Bulanan**:
Perkiraan kebutuhan belanja Nasabah per bulan. Nilainya dihitung dari rata-rata Transaksi keluar 3 bulan terakhir, kecuali Nasabah sudah mengoreksinya. Jika sudah dikoreksi, angka dari Nasabah yang dipakai.
_Avoid_: biaya hidup, budget

**Goal**:
Tujuan keuangan Nasabah. Isinya nama, target nominal, tenggat, dan dana terkumpul. Kebutuhan per bulannya dihitung dari (target − terkumpul) dibagi sisa bulan.
_Avoid_: target, impian, tujuan

**Dana Darurat**:
Goal khusus yang dibuat otomatis oleh sistem dan tidak bisa dihapus. Targetnya kelipatan Pengeluaran Bulanan, defaultnya 6×, dan Nasabah boleh mengubahnya.
_Avoid_: emergency fund, tabungan darurat

**Kantong**:
Sub-saldo virtual di dalam rekening Nasabah untuk menampung dana pos yang menabung, yaitu Dana Darurat, setiap Goal, Investasi, dan Sosial. Memindahkan dana ke Kantong bukan transaksi ke luar rekening.
_Avoid_: pocket, sub-rekening, dompet

**Saldo Total**:
Seluruh dana di rekening Nasabah, termasuk isi semua Kantong.
_Avoid_: saldo (tanpa keterangan)

**Saldo Bebas**:
Saldo Total dikurangi isi semua Kantong. Hanya Saldo Bebas yang bisa dipakai untuk transfer dan pembayaran.
_Avoid_: saldo tersedia, saldo efektif

**Snapshot Keuangan**:
Ringkasan kondisi keuangan Nasabah (saldo, pemasukan, pengeluaran, Goal) yang dibekukan pada satu titik waktu, lalu diberikan ke AI sebagai dasar percakapan.
_Avoid_: context, data demo

## Rekomendasi & Penawaran

**Aturan Alokasi**:
Aturan deterministik yang membagi dana ke Pos Alokasi secara berurutan. Pengeluaran Wajib dipenuhi lebih dulu, lalu Dana Darurat mendapat persentase tertentu sampai targetnya tercapai, lalu Goal sesuai kebutuhan per bulannya, dan sisanya dibagi ke Investasi dan Keinginan. Nasabah boleh mengubah persentasenya. Angka alokasi selalu berasal dari aturan ini, bukan dari model AI.
_Avoid_: saran AI, nasihat keuangan

**Pos Alokasi**:
Salah satu tujuan pembagian dana. Urutan prioritasnya: Pengeluaran Wajib, Dana Darurat, Goal, Investasi, Keinginan, dan Sosial (opsional, default 0%).
_Avoid_: kategori, bucket, amplop

**Rencana Alokasi**:
Hasil penerapan Aturan Alokasi pada satu Gaji. Isinya nominal per Pos Alokasi, dan AI hanya menjelaskannya. Statusnya **diusulkan**, lalu menjadi **diterapkan** (dana pos yang menabung masuk ke Kantong) atau **diabaikan** (ditolak, atau tidak disentuh selama 7 hari). Nasabah mengubah angkanya lewat kartu, bukan lewat teks bebas.
_Avoid_: rekomendasi, budget

**Produk**:
Produk keuangan dari Institusi di katalog kurasi, misalnya reksadana, deposito, saham, crypto, atau properti. Setiap Produk punya tingkat risiko.
_Avoid_: program, investasi (sebagai kata benda)

**Profil Risiko**:
Tingkat toleransi risiko Nasabah, diisi lewat kuesioner saat onboarding dan boleh dilewati. Profil ini menentukan Produk mana yang boleh ditawarkan. Selama Profil Risiko belum diisi, hanya Produk berisiko rendah yang boleh ditawarkan.
_Avoid_: risk appetite

**Penawaran Produk**:
Saat agent mengenalkan sebuah Produk kepada Nasabah. Penawaran selalu berlabel promosi, disertai disclaimer, dan disaring berdasarkan Profil Risiko. Statusnya **ditampilkan**, lalu **diklik**, lalu **tertarik**. Penawaran hanya muncul pada Momen Penawaran.
_Avoid_: rekomendasi investasi, saran investasi

**Momen Penawaran**:
Satu-satunya saat Penawaran Produk boleh muncul: Nasabah bertanya sendiri, pos Investasi pada Rencana Alokasi yang sudah diterapkan, atau Dana Darurat baru mencapai target. Penawaran tanpa diminta dibatasi maksimal satu per minggu, dan Nasabah bisa mematikannya.
_Avoid_: trigger, upsell

**Lead**:
Penawaran Produk berstatus tertarik yang datanya boleh diteruskan ke Institusi, setelah Nasabah memberi persetujuan eksplisit.
_Avoid_: prospek, konversi

## Percakapan

**Sesi Percakapan**:
Satu rangkaian chat antara Nasabah dan agent. Sesi menyimpan semua pesan dan Snapshot Keuangan saat sesi dibuat, sehingga bisa dilanjutkan dengan awal prompt yang sama persis.
_Avoid_: chat history, cache, session cache

**Lampiran**:
Dokumen atau catatan teks yang ditempel Nasabah ke satu Sesi Percakapan sebagai bahan jawaban agent. Lampiran tidak bisa dilepas lagi dari sesinya.
_Avoid_: konteks tambahan, context, dokumen

**Notifikasi Gajian**:
Pemberitahuan di aplikasi saat Gaji masuk. Jika dibuka, notifikasi ini memulai Sesi Percakapan baru yang dimulai oleh agent dan langsung membawa Rencana Alokasi.
_Avoid_: push, reminder
