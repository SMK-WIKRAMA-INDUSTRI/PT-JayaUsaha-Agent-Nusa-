-- Tahap 3: Catatan Pengeluaran dan Ringkasan Bulanan. Lihat docs/specs/agent-keuangan.md bagian 5.5, 5.6, 5.8, 8 dan ADR 0006, 0007.
-- Jalankan setelah 20261124000001_fondasi.sql dan 20261126000001_alokasi.sql.

-- Kategori Belanja (CONTEXT.md). Diisi untuk Transaksi keluar yang dihitung sebagai belanja.
alter table public.transactions add column kategori_belanja text
  check (kategori_belanja in ('makan', 'jajan', 'belanja', 'transportasi', 'tagihan', 'hiburan', 'lainnya'));

-- Transaksi seed yang sudah ada diberi Kategori Belanja (pemetaan sama dengan seed_data_demo di bawah).
update public.transactions set kategori_belanja = case pihak
    when 'Sewa kos Bu Ratna' then 'tagihan'
    when 'Token Listrik PLN' then 'tagihan'
    when 'Internet Rumah' then 'tagihan'
    when 'Belanja Bulanan Supermarket' then 'makan'
    when 'Top up Dompet Digital' then 'lainnya'
    when 'Tagihan Kartu Kredit' then 'tagihan'
    when 'Kopi Senja' then 'jajan'
    when 'Warung Makan Sederhana' then 'makan'
    when 'Toko Buku Pelangi' then 'belanja'
    when 'Bakso Pak Kumis' then 'jajan'
  end
where arah = 'keluar' and status = 'berhasil' and kategori_belanja is null;

-- Aksi Tertunda (ADR 0007): perubahan uang dari percakapan yang menunggu konfirmasi Nasabah.
create table public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  jenis text not null check (jenis in ('catat_pengeluaran', 'beli_produk')),
  data jsonb not null, -- catat_pengeluaran: { barang, nominal, kategori }
  status text not null default 'menunggu' check (status in ('menunggu', 'dijalankan', 'batal')),
  transaction_id uuid references public.transactions (id) on delete set null,
  kedaluwarsa_at timestamptz not null default now() + interval '30 minutes',
  diputuskan_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index pending_actions_satu_menunggu on public.pending_actions (session_id) where status = 'menunggu';
create index pending_actions_user on public.pending_actions (user_id, created_at desc);

alter table public.pending_actions enable row level security;
create policy "baca milik sendiri" on public.pending_actions for select to authenticated using ((select auth.uid()) = user_id);

-- Panggilan tool dan hasilnya disimpan di riwayat (spec bagian 7).
-- assistant: tool = { calls: [{ id, name, arguments }] }. tool: tool = { id, name }, content = hasil tool, card = kartu.
alter table public.chat_messages add column tool jsonb;
alter table public.chat_messages drop constraint chat_messages_role_check;
alter table public.chat_messages add constraint chat_messages_role_check
  check (role in ('user', 'assistant', 'lampiran', 'pembaruan', 'kartu', 'tool'));

-- ingest_transaksi mendapat parameter Kategori Belanja. Signature berubah, jadi fungsi lama dihapus lalu dibuat ulang.
drop function public.ingest_transaksi(uuid, text, bigint, text, text, text, text);
create function public.ingest_transaksi(
  p_user uuid,
  p_arah text,
  p_nominal bigint,
  p_kategori text,
  p_pihak text,
  p_kanal text,
  p_catatan text default null,
  p_kategori_belanja text default null
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
  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, catatan, kategori_belanja)
    values (v_acc, p_user, p_arah, p_nominal, p_kategori, p_pihak, p_kanal, p_catatan, p_kategori_belanja)
    returning id into v_id;
  return v_id;
end;
$$;

-- Menjalankan Aksi Tertunda yang sudah dikonfirmasi. Status, kedaluwarsa, saldo, dan Transaksi dicek dan ditulis atomik.
create function public.jalankan_aksi(p_user uuid, p_aksi uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aksi public.pending_actions%rowtype;
  v_tx uuid;
begin
  perform 1 from public.accounts where user_id = p_user for update;
  select * into v_aksi from public.pending_actions where id = p_aksi and user_id = p_user for update;
  if not found then
    raise exception 'AKSI_TIDAK_ADA';
  end if;
  if v_aksi.status <> 'menunggu' then
    raise exception 'AKSI_SUDAH_DIPUTUSKAN';
  end if;
  if v_aksi.kedaluwarsa_at <= now() then
    raise exception 'AKSI_KEDALUWARSA';
  end if;
  if v_aksi.jenis = 'catat_pengeluaran' then
    v_tx := public.ingest_transaksi(p_user, 'keluar', (v_aksi.data ->> 'nominal')::bigint, 'catatan',
      v_aksi.data ->> 'barang', 'Catatan', null, v_aksi.data ->> 'kategori');
  else
    raise exception 'AKSI_TIDAK_DIDUKUNG';
  end if;
  update public.pending_actions set status = 'dijalankan', transaction_id = v_tx, diputuskan_at = now() where id = p_aksi;
  return v_tx;
end;
$$;

-- Seed dengan Kategori Belanja. Nominal dan waktu sama persis dengan Tahap 2 (saldo akhir tetap Rp 24.380.500).
create or replace function public.seed_data_demo(p_user uuid) returns void
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
    insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, waktu, kategori_belanja) values
      (v_acc, p_user, 'keluar', 3500000, 'transfer', 'Sewa kos Bu Ratna', 'BI-FAST', v_bulan + interval '1 day 9 hours', 'tagihan'),
      (v_acc, p_user, 'keluar', 205000, 'tagihan', 'Token Listrik PLN', 'Pembayaran', v_bulan + interval '4 days 9 hours 15 minutes', 'tagihan'),
      (v_acc, p_user, 'keluar', 350000, 'tagihan', 'Internet Rumah', 'Autodebet', v_bulan + interval '5 days 7 hours', 'tagihan'),
      (v_acc, p_user, 'keluar', 1800000, 'belanja', 'Belanja Bulanan Supermarket', 'Kartu Debit', v_bulan + interval '7 days 19 hours', 'makan'),
      (v_acc, p_user, 'keluar', 100000, 'topup', 'Top up Dompet Digital', 'Top up', v_bulan + interval '11 days 19 hours 33 minutes', 'lainnya'),
      (v_acc, p_user, 'keluar', 2750000, 'tagihan', 'Tagihan Kartu Kredit', 'Autodebet', v_bulan + interval '12 days 20 hours 5 minutes', 'tagihan'),
      (v_acc, p_user, 'keluar', 47500, 'qris', 'Kopi Senja', 'QRIS', v_bulan + interval '15 days 18 hours 40 minutes', 'jajan'),
      (v_acc, p_user, 'keluar', 85000, 'qris', 'Warung Makan Sederhana', 'QRIS', v_bulan + interval '17 days 12 hours 10 minutes', 'makan'),
      (v_acc, p_user, 'keluar', 120000, 'qris', 'Toko Buku Pelangi', 'QRIS', v_bulan + interval '19 days 16 hours', 'belanja'),
      (v_acc, p_user, 'keluar', 62000, 'qris', 'Bakso Pak Kumis', 'QRIS', v_bulan + interval '21 days 19 hours', 'jajan'),
      (v_acc, p_user, 'masuk', 12500000, 'payroll', 'Gaji PT Nusantara Digital', 'Kredit', v_bulan + interval '24 days 1 hour', null);
  end loop;

  insert into public.transactions (account_id, user_id, arah, nominal, kategori, pihak, kanal, status, catatan, waktu)
    values (v_acc, p_user, 'keluar', 500000, 'transfer', 'Transfer ke Rina Wijaya', 'BI-FAST', 'gagal',
            'gagal karena gangguan di bank tujuan; dana dikembalikan ke rekening', now() - interval '1 day');

  insert into public.goals (user_id, nama, is_dana_darurat, kelipatan_target) values (p_user, 'Dana Darurat', true, 6);
  insert into public.allocation_rules (user_id) values (p_user);
end;
$$;

-- Reset data demo juga menghapus Aksi Tertunda.
create or replace function public.reset_demo(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.pending_actions where user_id = p_user;
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
revoke execute on function public.ingest_transaksi(uuid, text, bigint, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.jalankan_aksi(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.seed_data_demo(uuid) from public, anon, authenticated;
revoke execute on function public.reset_demo(uuid) from public, anon, authenticated;
grant execute on function public.ingest_transaksi(uuid, text, bigint, text, text, text, text, text) to service_role;
grant execute on function public.jalankan_aksi(uuid, uuid) to service_role;
grant execute on function public.reset_demo(uuid) to service_role;
