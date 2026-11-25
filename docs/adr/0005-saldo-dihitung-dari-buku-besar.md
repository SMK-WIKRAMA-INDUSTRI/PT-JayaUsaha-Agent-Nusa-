# Saldo dihitung dari buku besar, bukan disimpan sebagai kolom

Saldo Total dihitung dari SUM tabel `transactions`. Saldo setiap Kantong dihitung dari SUM tabel `pocket_movements`. Tidak ada kolom `saldo` yang ikut di-update. Saldo awal Nasabah demo dicatat sebagai satu Transaksi "saldo awal". Dengan cara ini saldo tidak mungkin selisih dengan riwayatnya. Volume data demo juga kecil, jadi kecepatan dari kolom saldo tersimpan belum dibutuhkan.

Semua perubahan uang hanya boleh lewat fungsi Postgres yang atomik (`ingest_transaksi`, `terapkan_rencana`, `pindah_kantong`) dan dipanggil dari server. Browser hanya bisa membaca tabel uang.

## Consequences

- Jika volume data nanti membesar, tambahkan materialized view atau kolom cache saldo yang diturunkan dari buku besar. Buku besar tetap menjadi sumber kebenaran.
