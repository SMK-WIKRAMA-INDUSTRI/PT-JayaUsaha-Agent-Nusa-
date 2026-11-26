-- Tahap 2: Alokasi. Lihat docs/specs/agent-keuangan.md bagian 5.2, 5.3, 5.8, 6, 8 dan ADR 0002, 0005.
-- Uang hanya berubah lewat fungsi di bawah (dipanggil server dengan service role). Saldo selalu dihitung dari buku besar.

create table public.pockets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  jenis text not null check (jenis in ('dana_darurat', 'goal', 'investasi', 'sosial')),
  goal_id uuid references public.goals (id) on delete cascade, -- Goal dihapus: Kantong dan isinya ikut hilang, dana kembali ke Saldo Bebas
  created_at timestamptz not null default now(),
  check ((jenis = 'goal') = (goal_id is not null))
);
create unique index pockets_satu_per_jenis on public.pockets (user_id, jenis) where jenis <> 'goal';
create unique index pockets_satu_per_goal on public.pockets (goal_id) where goal_id is not null;

create table public.allocation_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null unique references public.transactions (id) on delete cascade, -- satu Rencana per Gaji
  status text not null default 'diusulkan' check (status in ('diusulkan', 'diterapkan', 'diabaikan')),
  rincian jsonb not null, -- { gaji, pos: [{ kunci, label, jenis, goal_id?, nominal }] }, lihat lib/alokasi.js
  kedaluwarsa_at timestamptz not null default now() + interval '7 days',
  diputuskan_at timestamptz,
  created_at timestamptz not null default now()
);
create index allocation_plans_user on public.allocation_plans (user_id, created_at desc);

create table public.pocket_movements (
  id uuid primary key default gen_random_uuid(),
  pocket_id uuid not null references public.pockets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nominal bigint not null check (nominal <> 0), -- positif = masuk Kantong, negatif = keluar ke Saldo Bebas
  sumber text not null check (sumber in ('rencana', 'manual')),
  plan_id uuid references public.allocation_plans (id) on delete set null,
  waktu timestamptz not null default now()
);
create index pocket_movements_pocket on public.pocket_movements (pocket_id);
create index pocket_movements_user on public.pocket_movements (user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  jenis text not null check (jenis in ('gajian')),
  ref_id uuid not null, -- gajian: allocation_plans.id
  isi text not null,
  dibaca_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

alter table public.chat_sessions add column plan_id uuid references public.allocation_plans (id) on delete set null;
create unique index chat_sessions_satu_per_rencana on public.chat_sessions (plan_id) where plan_id is not null;

alter table public.chat_messages drop constraint chat_messages_role_check;
alter table public.chat_messages add constraint chat_messages_role_check
  check (role in ('user', 'assistant', 'lampiran', 'pembaruan', 'kartu'));

-- Saldo per Kantong dan Saldo Bebas. security_invoker: RLS tabel asal tetap berlaku.
create view public.v_saldo_kantong with (security_invoker = true) as
select
  p.id as pocket_id,
  p.user_id,
  p.jenis,
  p.goal_id,
  case p.jenis when 'dana_darurat' then 'Dana Darurat' when 'investasi' then 'Investasi' when 'sosial' then 'Sosial' else g.nama end as nama,
  coalesce(sum(m.nominal), 0)::bigint as saldo
from public.pockets p
left join public.goals g on g.id = p.goal_id
left join public.pocket_movements m on m.pocket_id = p.id
group by p.id, g.nama;

create view public.v_saldo_bebas with (security_invoker = true) as
select
  s.user_id,
  s.nomor_akhir,
  s.saldo_total,
  coalesce(k.total, 0)::bigint as total_kantong,
  (s.saldo_total - coalesce(k.total, 0))::bigint as saldo_bebas
from public.v_saldo_total s
left join (select user_id, sum(saldo) as total from public.v_saldo_kantong group by user_id) k on k.user_id = s.user_id;

alter table public.pockets enable row level security;
alter table public.pocket_movements enable row level security;
alter table public.allocation_plans enable row level security;
alter table public.notifications enable row level security;

create policy "baca milik sendiri" on public.pockets for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.pocket_movements for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.allocation_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "baca milik sendiri" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);

-- Notifikasi Gajian dikirim ke browser lewat Supabase Realtime (RLS select di atas tetap berlaku).
alter publication supabase_realtime add table public.notifications;

-- Saldo Bebas satu Nasabah. Pemanggil di bawah sudah mengunci baris rekening.
create function public.saldo_bebas_nasabah(p_user uuid) returns bigint
language sql stable security definer set search_path = ''
as $$
  select (
    coalesce((select sum(case when arah = 'masuk' then nominal else -nominal end)
              from public.transactions where user_id = p_user and status = 'berhasil'), 0)
    - coalesce((select sum(nominal) from public.pocket_movements where user_id = p_user), 0)
  )::bigint
$$;

-- Satu pintu untuk semua Transaksi (termasuk simulasi). Arah keluar divalidasi terhadap Saldo Bebas.
create function public.ingest_transaksi(
  p_user uuid,
  p_arah text,
  p_nominal bigint,
  p_kategori text,
  p_pihak text,
  p_kanal text,
  p_catatan text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_acc uuid;
  v_id uuid;
begin
  select id into v_acc from public.accounts where user_id = p_user for update;
  if v_acc is null then
    raise exception 'REKENING_TIDAK_ADA';
  end if;
  if p_arah = 'keluar' and public.saldo_bebas_nasabah(p_user) < p_nominal then
    raise exception 'SALDO_BEBAS_KURANG';
  end if;
  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, catatan)
    values (v_acc, p_user, p_arah, p_nominal, p_kategori, p_pihak, p_kanal, p_catatan)
    returning id into v_id;
  return v_id;
end;
$$;

-- Menerapkan Rencana: semua pos Kantong ditulis ke pocket_movements secara atomik, lalu status berubah.
-- p_rincian sudah divalidasi server lewat sesuaikanRincian (jumlah pos = Gaji).
create function public.terapkan_rencana(p_user uuid, p_plan uuid, p_rincian jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.allocation_plans%rowtype;
  v_pos jsonb;
  v_goal uuid;
  v_jenis text;
  v_pocket uuid;
  v_nominal bigint;
  v_total bigint := 0;
begin
  perform 1 from public.accounts where user_id = p_user for update;
  select * into v_plan from public.allocation_plans where id = p_plan and user_id = p_user for update;
  if not found then
    raise exception 'RENCANA_TIDAK_ADA';
  end if;
  if v_plan.status <> 'diusulkan' then
    raise exception 'RENCANA_SUDAH_DIPUTUSKAN';
  end if;
  if v_plan.kedaluwarsa_at <= now() then
    raise exception 'RENCANA_KEDALUWARSA';
  end if;

  for v_pos in select value from jsonb_array_elements(p_rincian -> 'pos') loop
    if v_pos ->> 'jenis' = 'kantong' then
      v_total := v_total + (v_pos ->> 'nominal')::bigint;
    end if;
  end loop;
  if v_total > public.saldo_bebas_nasabah(p_user) then
    raise exception 'SALDO_BEBAS_KURANG';
  end if;

  for v_pos in select value from jsonb_array_elements(p_rincian -> 'pos') loop
    v_nominal := (v_pos ->> 'nominal')::bigint;
    continue when v_pos ->> 'jenis' <> 'kantong' or v_nominal <= 0;
    v_goal := nullif(v_pos ->> 'goal_id', '')::uuid;
    if v_goal is not null then
      if not exists (select 1 from public.goals where id = v_goal and user_id = p_user) then
        raise exception 'GOAL_TIDAK_ADA';
      end if;
      v_jenis := 'goal';
      select id into v_pocket from public.pockets where goal_id = v_goal;
    else
      v_jenis := v_pos ->> 'kunci';
      select id into v_pocket from public.pockets where user_id = p_user and jenis = v_jenis;
    end if;
    if v_pocket is null then
      insert into public.pockets (user_id, jenis, goal_id) values (p_user, v_jenis, v_goal) returning id into v_pocket;
    end if;
    insert into public.pocket_movements (pocket_id, user_id, nominal, sumber, plan_id)
      values (v_pocket, p_user, v_nominal, 'rencana', p_plan);
  end loop;

  update public.allocation_plans set status = 'diterapkan', rincian = p_rincian, diputuskan_at = now() where id = p_plan;
end;
$$;

-- Seed dipisah: seed_data_demo membuat data keuangan, seed_nasabah_baru menambah profil. reset_demo memakai seed_data_demo.
create function public.seed_data_demo(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_acc uuid;
  v_bulan timestamptz;
  i int;
begin
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

create or replace function public.seed_nasabah_baru(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (p_user);
  perform public.seed_data_demo(p_user);
end;
$$;

-- Reset data demo: semua data Nasabah dihapus kecuali akun login dan profil, lalu data seed dibuat ulang.
-- Goal buatan Nasabah (termasuk dari onboarding) ikut terhapus.
create function public.reset_demo(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.chat_sessions where user_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.allocation_plans where user_id = p_user;
  delete from public.pockets where user_id = p_user;
  delete from public.goals where user_id = p_user;
  delete from public.allocation_rules where user_id = p_user;
  delete from public.accounts where user_id = p_user; -- Transaksi ikut terhapus (cascade)
  perform public.seed_data_demo(p_user);
end;
$$;

-- Fungsi uang hanya untuk server (service role), tidak bisa dipanggil dari browser.
revoke execute on function public.saldo_bebas_nasabah(uuid) from public, anon, authenticated;
revoke execute on function public.ingest_transaksi(uuid, text, bigint, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.terapkan_rencana(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.seed_data_demo(uuid) from public, anon, authenticated;
revoke execute on function public.seed_nasabah_baru(uuid) from public, anon, authenticated;
revoke execute on function public.reset_demo(uuid) from public, anon, authenticated;
grant execute on function public.ingest_transaksi(uuid, text, bigint, text, text, text, text) to service_role;
grant execute on function public.terapkan_rencana(uuid, uuid, jsonb) to service_role;
grant execute on function public.reset_demo(uuid) to service_role;
