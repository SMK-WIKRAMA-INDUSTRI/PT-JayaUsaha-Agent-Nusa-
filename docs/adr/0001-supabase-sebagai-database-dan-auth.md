# Supabase sebagai database dan auth

Agent Nusa memakai Supabase (Postgres + Supabase Auth + Row Level Security + Realtime), bukan Postgres biasa dengan ORM dan auth buatan sendiri. Data keuangan wajib terisolasi per Nasabah, dan RLS menegakkan isolasi itu langsung di database, bukan hanya di kode aplikasi. Realtime juga sudah menyediakan kanal untuk notifikasi, misalnya saat gaji masuk, tanpa perlu infrastruktur tambahan.

## Consequences

- Skema tabel harus dirancang bersama policy RLS sejak awal. Setiap tabel milik Nasabah memakai kolom `user_id` yang merujuk ke `auth.users`.
- Mengganti provider auth nanti berarti migrasi akun dan menulis ulang policy.
