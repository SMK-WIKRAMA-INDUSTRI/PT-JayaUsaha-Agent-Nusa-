import { getUser } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { fail, failDb } from '../../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Panel Demo: mengembalikan data Nasabah ke kondisi seed (akun login dan profil tetap).
export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const { error } = await createAdminClient().rpc('reset_demo', { p_user: user.id });
  if (error) return failDb(error);
  return Response.json({ ok: true });
}
