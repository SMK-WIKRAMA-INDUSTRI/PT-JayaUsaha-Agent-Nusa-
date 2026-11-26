import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { fail, failDb } from '../../../../../lib/server/http';
import { KOLOM_AKSI, batalkanAksi, jalankanAksi, kedaluwarsa } from '../../../../../lib/server/aksi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tombol Catat di kartu Catatan Pengeluaran (ADR 0007).
export async function POST(_req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();
  const { data: aksi } = await admin.from('pending_actions').select(KOLOM_AKSI).eq('id', id).maybeSingle();
  if (!aksi || aksi.user_id !== user.id) return fail(404, 'Aksi tidak ditemukan.');
  if (aksi.status !== 'menunggu') return fail(409, 'Aksi ini sudah dicatat atau dibatalkan.');
  if (kedaluwarsa(aksi)) {
    await batalkanAksi(admin, aksi, 'kedaluwarsa');
    return fail(409, 'Aksi ini sudah kedaluwarsa. Ceritakan lagi pengeluarannya kalau mau dicatat.');
  }
  try {
    await jalankanAksi(admin, aksi);
  } catch (e) {
    if (((e && e.message) || '').includes('SALDO_BEBAS_KURANG')) await batalkanAksi(admin, aksi, 'saldo_kurang');
    return failDb(e);
  }
  return Response.json({ action: { id, status: 'dijalankan' } });
}
