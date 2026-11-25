import { getUser } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { buatSesi } from '../../../lib/server/sesi';
import { fail } from '../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daftar Sesi Percakapan milik Nasabah (dibaca lewat RLS).
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, created_at, updated_at, dimulai_oleh')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) return fail(500, error.message);
  return Response.json({ sessions: data });
}

// Sesi baru yang dimulai Nasabah, dengan snapshot dibekukan saat ini.
export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  try {
    const session = await buatSesi(createAdminClient(), user.id);
    return Response.json({ session });
  } catch (e) {
    return fail(500, (e && e.message) || 'Gagal membuat percakapan.');
  }
}
