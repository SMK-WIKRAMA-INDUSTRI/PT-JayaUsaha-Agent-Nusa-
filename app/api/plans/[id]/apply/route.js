import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { renderRencanaDiterapkan, sesuaikanRincian } from '../../../../../lib/alokasi';
import { fail, failDb } from '../../../../../lib/server/http';
import { kedaluwarsakanRencana, tambahPembaruanRencana } from '../../../../../lib/server/rencana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { ubah: { [kunci pos]: nominal } }. Server menghitung ulang rincian (Keinginan menyerap selisih) lalu menerapkannya.
export async function POST(req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  let ubah = {};
  try {
    const j = await req.json();
    if (j && j.ubah && typeof j.ubah === 'object' && !Array.isArray(j.ubah)) ubah = j.ubah;
  } catch {
    /* body kosong = tanpa perubahan */
  }

  const admin = createAdminClient();
  await kedaluwarsakanRencana(admin, user.id);
  const { data: plan } = await admin.from('allocation_plans').select('id, user_id, rincian').eq('id', id).maybeSingle();
  if (!plan || plan.user_id !== user.id) return fail(404, 'Rencana Alokasi tidak ditemukan.');

  let rincian;
  try {
    rincian = sesuaikanRincian(plan.rincian, ubah);
  } catch (e) {
    return fail(400, e.message);
  }
  const { error } = await admin.rpc('terapkan_rencana', { p_user: user.id, p_plan: id, p_rincian: rincian });
  if (error) return failDb(error);

  // Dana sudah dipindah: kegagalan membaca saldo tidak boleh membuat respons gagal.
  const { data: saldo } = await admin.from('v_saldo_bebas').select('saldo_bebas').eq('user_id', user.id).maybeSingle();
  if (saldo) {
    await tambahPembaruanRencana(admin, user.id, id, renderRencanaDiterapkan(rincian, Number(saldo.saldo_bebas), new Date().toISOString()));
  } else {
    console.error('[plans/apply] Saldo Bebas gagal dibaca; pesan pembaruan dilewati.');
  }
  return Response.json({ plan: { id, status: 'diterapkan', rincian } });
}
