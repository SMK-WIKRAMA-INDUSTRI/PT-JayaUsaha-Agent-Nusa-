# Sesi Percakapan disimpan bersama Snapshot Keuangan demi prefix cache DeepSeek

Context caching DeepSeek berjalan di server DeepSeek. Cache bekerja otomatis berdasarkan prefix, yaitu awal prompt yang harus identik mulai token ke-0. Satuan cache adalah 64 token, dan cache yang tidak terpakai dihapus dalam hitungan jam sampai hari. Cache ini tidak bisa kita simpan atau ambil sendiri. Yang kita simpan di database adalah Sesi Percakapan: semua pesan beserta Snapshot Keuangan yang dibekukan saat sesi dibuat. Ketika sesi dilanjutkan, prompt disusun ulang dengan urutan tetap: system prompt statis → Snapshot Keuangan sesi → riwayat pesan → pesan baru. Dengan begitu prefix-nya sama persis dengan permintaan sebelumnya dan berpeluang kena cache.

Snapshot sengaja tidak diperbarui di tengah sesi meskipun saldo berubah. Snapshot yang segar akan mengubah prefix dan menggagalkan cache. Selain itu, snapshot yang beku menjadi catatan audit tentang data apa yang dilihat AI ketika memberi penjelasan. Perubahan data di tengah sesi disisipkan sebagai pesan baru di akhir prompt.

## Consequences

- Data yang berubah setiap permintaan (misalnya "waktu sekarang") tidak boleh ditaruh di system prompt atau snapshot.
- Perlu dicek apakah proxy Netra Runtime meneruskan caching dan mengembalikan `usage.prompt_cache_hit_tokens`.
