-- Tahap 1: fondasi. Lihat docs/specs/agent-keuangan.md bagian 8 dan ADR 0001, 0003, 0005.
-- Semua nominal dalam rupiah (bigint). Saldo dihitung dari buku besar (view), tidak disimpan.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nama_panggilan text,
  pekerjaan text,
  tanggal_gajian smallint check (tanggal_gajian between 1 and 31),
  pengeluaran_bulanan_koreksi bigint check (pengeluaran_bulanan_koreksi >= 0),
  profil_risiko text check (profil_risiko in ('konservatif', 'moderat', 'agresif')),
  tawaran_proaktif boolean not null default true,
  onboarding_selesai_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade, -- MVP: satu rekening per Nasabah
  nomor_akhir text not null,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  arah text not null check (arah in ('masuk', 'keluar')),
  nominal bigint not null check (nominal > 0),
  kategori text not null, -- payroll, saldo_awal, tagihan, qris, transfer, belanja, topup, ...
  pihak text not null,
  kanal text not null,
  status text not null default 'berhasil' check (status in ('berhasil', 'gagal', 'diproses')),
  catatan text,
  waktu timestamptz not null default now()
);
create index transactions_user_waktu on public.transactions (user_id, waktu desc);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nama text not null,
  target bigint check (target > 0),
  tenggat date,
  is_dana_darurat boolean not null default false,
  kelipatan_target smallint check (kelipatan_target between 1 and 24),
  created_at timestamptz not null default now(),
  -- Dana Darurat: target diturunkan dari Pengeluaran Bulanan x kelipatan. Goal biasa: target wajib diisi.
  check ((is_dana_darurat and target is null and kelipatan_target is not null) or (not is_dana_darurat and target is not null))
);
create unique index goals_satu_dana_darurat on public.goals (user_id) where is_dana_darurat;

create table public.allocation_rules (
  user_id uuid primary key references auth.users (id) on delete cascade,
  persen_dana_darurat smallint not null default 20 check (persen_dana_darurat between 0 and 100),
  persen_sosial smallint not null default 0 check (persen_sosial between 0 and 100),
  persen_investasi smallint not null default 50 check (persen_investasi between 0 and 100)
);

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot jsonb not null, -- Snapshot Keuangan, dibekukan saat sesi dibuat
  system_prompt_version integer not null,
  dimulai_oleh text not null default 'nasabah' check (dimulai_oleh in ('agent', 'nasabah')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- plan_id ditambahkan di migrasi Tahap 2 bersama tabel allocation_plans
);
create index chat_sessions_user_updated on public.chat_sessions (user_id, updated_at desc);

create table public.chat_messages (
  id bigint generated always as identity primary key, -- urutan riwayat = urutan id
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'lampiran', 'pembaruan')),
  content text not null,
  card jsonb,
  usage jsonb, -- usage dari API, termasuk prompt_cache_hit_tokens
  created_at timestamptz not null default now()
);
create index chat_messages_session on public.chat_messages (session_id, id);

-- Saldo Total dihitung dari buku besar. security_invoker: RLS tabel asal tetap berlaku.
create view public.v_saldo_total with (security_invoker = true) as
select
  a.user_id,
  a.id as account_id,
  a.nomor_akhir,
  coalesce(sum(case when t.arah = 'masuk' then t.nominal else -t.nominal end) filter (where t.status = 'berhasil'), 0)::bigint as saldo_total
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

-- RLS: Nasabah hanya membaca barisnya sendiri. Tabel uang, sesi, dan pesan hanya ditulis server (service role).
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.allocation_rules enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "baca milik sendiri" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "ubah milik sendiri" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "baca milik sendiri" on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.transactions for select to authenticated using ((select auth.uid()) = user_id);

create policy "baca milik sendiri" on public.goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "tambah goal biasa" on public.goals for insert to authenticated with check ((select auth.uid()) = user_id and not is_dana_darurat);
create policy "ubah milik sendiri" on public.goals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "hapus goal biasa" on public.goals for delete to authenticated using ((select auth.uid()) = user_id and not is_dana_darurat);

create policy "baca milik sendiri" on public.allocation_rules for select to authenticated using ((select auth.uid()) = user_id);
create policy "ubah milik sendiri" on public.allocation_rules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "baca milik sendiri" on public.chat_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.chat_messages for select to authenticated using ((select auth.uid()) = user_id);

-- Seed persona demo (mirip "Dimas"): saldo awal + 3 bulan kalender penuh + 1 transfer gagal.
-- Per bulan: Gaji Rp 12.500.000, keluar Rp 9.019.500. Saldo akhir: 13.939.000 + 3 x 3.480.500 = Rp 24.380.500.
create function public.seed_nasabah_baru(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_acc uuid;
  v_bulan timestamptz;
  i int;
begin
  insert into public.profiles (user_id) values (p_user);
  insert into public.accounts (user_id, nomor_akhir)
    values (p_user, lpad(floor(random() * 10000)::int::text, 4, '0'))
    returning id into v_acc;

  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, waktu)
    values (v_acc, p_user, 'masuk', 13939000, 'saldo_awal', 'Saldo awal', 'Sistem', date_trunc('month', now()) - interval '3 months');

  for i in 1..3 loop
    v_bulan := date_trunc('month', now()) - make_interval(months => 4 - i);
    insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, waktu) values
      (v_acc, p_user, 'keluar', 3500000, 'transfer', 'Sewa kos Bu Ratna', 'BI-FAST', v_bulan + interval '1 day 9 hours'),
      (v_acc, p_user, 'keluar', 205000, 'tagihan', 'Token Listrik PLN', 'Pembayaran', v_bulan + interval '4 days 9 hours 15 minutes'),
      (v_acc, p_user, 'keluar', 350000, 'tagihan', 'Internet Rumah', 'Autodebet', v_bulan + interval '5 days 7 hours'),
      (v_acc, p_user, 'keluar', 1800000, 'belanja', 'Belanja Bulanan Supermarket', 'Kartu Debit', v_bulan + interval '7 days 19 hours'),
      (v_acc, p_user, 'keluar', 100000, 'topup', 'Top up Dompet Digital', 'Top up', v_bulan + interval '11 days 19 hours 33 minutes'),
      (v_acc, p_user, 'keluar', 2750000, 'tagihan', 'Tagihan Kartu Kredit', 'Autodebet', v_bulan + interval '12 days 20 hours 5 minutes'),
      (v_acc, p_user, 'keluar', 47500, 'qris', 'Kopi Senja', 'QRIS', v_bulan + interval '15 days 18 hours 40 minutes'),
      (v_acc, p_user, 'keluar', 85000, 'qris', 'Warung Makan Sederhana', 'QRIS', v_bulan + interval '17 days 12 hours 10 minutes'),
      (v_acc, p_user, 'keluar', 120000, 'qris', 'Toko Buku Pelangi', 'QRIS', v_bulan + interval '19 days 16 hours'),
      (v_acc, p_user, 'keluar', 62000, 'qris', 'Bakso Pak Kumis', 'QRIS', v_bulan + interval '21 days 19 hours'),
      (v_acc, p_user, 'masuk', 12500000, 'payroll', 'Gaji PT Nusantara Digital', 'Kredit', v_bulan + interval '24 days 1 hour');
  end loop;

  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, status, catatan, waktu)
    values (v_acc, p_user, 'keluar', 500000, 'transfer', 'Transfer ke Rina Wijaya', 'BI-FAST', 'gagal',
            'gagal karena gangguan di bank tujuan; dana dikembalikan ke rekening', now() - interval '1 day');

  insert into public.goals (user_id, nama, is_dana_darurat, kelipatan_target) values (p_user, 'Dana Darurat', true, 6);
  insert into public.allocation_rules (user_id) values (p_user);
end;
$$;
revoke execute on function public.seed_nasabah_baru(uuid) from public, anon, authenticated;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.seed_nasabah_baru(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
