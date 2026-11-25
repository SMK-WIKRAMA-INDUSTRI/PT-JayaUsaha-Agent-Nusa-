import { getUser } from '../../../../lib/supabase/server';
import { fail } from '../../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Riwayat pesan satu sesi. RLS memastikan Nasabah hanya bisa membaca sesinya sendiri.
export async function GET(_req, { params }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const { data: session } = await supabase.from('chat_sessions').select('id').eq('id', id).maybeSingle();
  if (!session) return fail(404, 'Percakapan tidak ditemukan.');
  const { data, error } = await supabase.from('chat_messages').select('id, role, content, created_at').eq('session_id', id).order('id');
  if (error) return fail(500, error.message);
  return Response.json({ messages: data });
}
