import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { MAX_CONTEXT } from '../../../../../lib/data';
import { fail } from '../../../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Menempel lampiran (isi PDF atau catatan teks) ke akhir sesi. Lampiran tidak bisa dilepas,
// karena melepasnya akan mengubah prefix prompt (ADR 0003).
export async function POST(req, { params }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');

  let nama = '';
  let teks = '';
  try {
    const j = await req.json();
    nama = String((j && j.nama) || '').trim().slice(0, 200);
    teks = String((j && j.teks) || '').trim();
  } catch {
    return fail(400, 'Body harus berupa JSON.');
  }
  if (!nama || !teks) return fail(400, 'Nama dan isi lampiran wajib diisi.');

  const { data: session } = await supabase.from('chat_sessions').select('id').eq('id', id).maybeSingle();
  if (!session) return fail(404, 'Percakapan tidak ditemukan.');

  const content = `[Dokumen: ${nama}]\n${teks.length > MAX_CONTEXT ? teks.slice(0, MAX_CONTEXT) + '\n[...dipotong karena terlalu panjang]' : teks}`;
  const { error } = await createAdminClient().from('chat_messages').insert({ session_id: id, user_id: user.id, role: 'lampiran', content });
  if (error) return fail(500, error.message);
  return Response.json({ ok: true });
}
