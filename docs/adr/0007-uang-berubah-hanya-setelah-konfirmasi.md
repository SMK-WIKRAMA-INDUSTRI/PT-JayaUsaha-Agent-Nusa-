# Uang dari percakapan hanya berubah lewat Aksi Tertunda yang dikonfirmasi Nasabah

Status: diterima, 26 Nov 2026.

Agent kini bisa mengubah saldo dari percakapan, lewat Catatan Pengeluaran dan Pembelian Demo. Setiap perubahan seperti itu disimpan dulu sebagai **Aksi Tertunda**, lalu ditampilkan sebagai kartu berisi nominal yang bisa dicek. Aksi hanya dijalankan oleh fungsi Postgres yang atomik ([ADR 0005](0005-saldo-dihitung-dari-buku-besar.md)) setelah Nasabah mengonfirmasi, baik dengan tombol di kartu maupun dengan jawaban "ya" di giliran berikutnya, supaya mode telepon tetap bisa dipakai tanpa klik. Paling banyak ada satu Aksi Tertunda per sesi. Aksi batal jika Nasabah menolak, membahas hal lain, atau tidak menjawab dalam 30 menit.

Asal nominalnya:
- Catatan Pengeluaran: nominal yang disebut sendiri oleh Nasabah ([ADR 0006](0006-tool-calling-hanya-untuk-mengenali-niat.md)).
- Pembelian Demo: nominal saran dihitung oleh kode ([ADR 0002](0002-alokasi-deterministik-ai-hanya-menjelaskan.md)), lalu boleh diedit Nasabah di kartu.

Pembelian Demo menggantikan Lead di MVP. Pembelian itu sendiri sudah menjadi bukti konversi bagi Institusi, sehingga persetujuan berbagi data ke Institusi baru diperlukan jika suatu saat ada integrasi sungguhan.

Alternatif yang ditolak: langsung mencatat lalu menyediakan tombol "batalkan" (salah dengar dari suara langsung mengubah saldo), dan konfirmasi hanya lewat tombol (mode telepon tidak bisa dipakai).
