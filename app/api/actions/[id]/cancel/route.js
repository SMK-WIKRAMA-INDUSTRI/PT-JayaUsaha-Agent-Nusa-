import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { fail } from '../../../../../lib/server/http';
import { KOLOM_AKSI, batalkanAksi } from '../../../../../lib/server/aksi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tombol Batal di kartu Catatan Pengeluaran.
export async function POST(_req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();
  const { data: aksi } = await admin.from('pending_actions').select(KOLOM_AKSI).eq('id', id).maybeSingle();
  if (!aksi || aksi.user_id !== user.id) return fail(404, 'Aksi tidak ditemukan.');
  if (aksi.status !== 'menunggu') return fail(409, 'Aksi ini sudah dicatat atau dibatalkan.');
  const row = await batalkanAksi(admin, aksi, 'nasabah');
  if (!row) {
    // Status sudah berubah di antara pembacaan dan update (tab lain), atau pesan pembaruan gagal disimpan.
    const { data: now } = await admin.from('pending_actions').select('status').eq('id', id).maybeSingle();
    if (!now || now.status !== 'batal') return fail(409, 'Aksi ini sudah dicatat atau dibatalkan.');
  }
  return Response.json({ action: { id, status: 'batal' } });
}
