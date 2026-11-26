import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { fmtWaktu } from '../../../../../lib/format';
import { fail } from '../../../../../lib/server/http';
import { kedaluwarsakanRencana, tambahPembaruanRencana } from '../../../../../lib/server/rencana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();
  await kedaluwarsakanRencana(admin, user.id);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('allocation_plans')
    .update({ status: 'diabaikan', diputuskan_at: now })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'diusulkan')
    .select('id');
  if (error) return fail(500, error.message);
  if (!data.length) return fail(409, 'Rencana ini sudah diterapkan, diabaikan, atau kedaluwarsa.');
  await tambahPembaruanRencana(admin, user.id, id, `Rencana Alokasi diabaikan oleh nasabah pada ${fmtWaktu(now)}. Tidak ada dana yang dipindah ke Kantong.`);
  return Response.json({ plan: { id, status: 'diabaikan' } });
}
