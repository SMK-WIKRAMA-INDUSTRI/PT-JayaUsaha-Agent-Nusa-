import { getUser } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { renderRencana } from '../../../../../lib/alokasi';
import { buildPromptMessages, toolsFor } from '../../../../../lib/prompt';
import { fail } from '../../../../../lib/server/http';
import { netraSiap, panggilNetra } from '../../../../../lib/server/netra';
import { kedaluwarsakanRencana } from '../../../../../lib/server/rencana';
import { buatSesi } from '../../../../../lib/server/sesi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KOLOM_SESI = 'id, created_at, updated_at, dimulai_oleh';

// Notifikasi Gajian dibuka -> Sesi Percakapan baru yang dimulai agent, berisi kartu Rencana dan sapaan (spec 5.2).
// Idempoten: membuka notifikasi yang sama lagi mengembalikan sesi yang sudah ada.
export async function POST(_req, { params }) {
  const { id } = await params;
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();

  const { data: notif } = await admin.from('notifications').select('id, user_id, jenis, ref_id').eq('id', id).maybeSingle();
  if (!notif || notif.user_id !== user.id || notif.jenis !== 'gajian') return fail(404, 'Notifikasi tidak ditemukan.');
  await admin.from('notifications').update({ dibaca_at: new Date().toISOString() }).eq('id', id).is('dibaca_at', null);

  const sesiRencana = () => admin.from('chat_sessions').select(KOLOM_SESI).eq('plan_id', notif.ref_id).maybeSingle();
  const { data: existing } = await sesiRencana();
  if (existing) return Response.json({ session: existing });

  await kedaluwarsakanRencana(admin, user.id);
  const { data: plan } = await admin.from('allocation_plans').select('id, rincian, transaction_id').eq('id', notif.ref_id).maybeSingle();
  if (!plan) return fail(404, 'Rencana Alokasi untuk notifikasi ini sudah tidak ada.');
  const { data: tx } = await admin.from('transactions').select('waktu').eq('id', plan.transaction_id).maybeSingle();
  if (!tx) return fail(404, 'Transaksi Gaji untuk notifikasi ini sudah tidak ada.');

  let session;
  try {
    session = await buatSesi(admin, user.id, { dimulaiOleh: 'agent', planId: plan.id });
  } catch (e) {
    // Dua klik bersamaan: indeks unik plan_id menolak sesi kedua, jadi kembalikan sesi yang sudah dibuat.
    const { data: again } = await sesiRencana();
    if (again) return Response.json({ session: again });
    return fail(500, (e && e.message) || 'Gagal membuat percakapan.');
  }

  const { error: kErr } = await admin.from('chat_messages').insert({
    session_id: session.id,
    user_id: user.id,
    role: 'kartu',
    content: renderRencana(plan.rincian, tx.waktu),
    card: { jenis: 'rencana', plan_id: plan.id }
  });
  if (kErr) {
    // Jangan tinggalkan sesi tanpa kartu: membuka ulang notifikasi akan mengembalikan sesi kosong itu.
    await admin.from('chat_sessions').delete().eq('id', session.id);
    return fail(500, kErr.message);
  }

  // Sapaan agent. Jika gagal, sesi tetap berisi kartu dan Nasabah bisa langsung bertanya.
  if (netraSiap()) {
    try {
      const { data: s } = await admin.from('chat_sessions').select('id, snapshot, system_prompt_version').eq('id', session.id).single();
      const { data: rows } = await admin.from('chat_messages').select('id, role, content, tool, created_at').eq('session_id', session.id).order('id');
      const res = await panggilNetra(buildPromptMessages({ session: s, history: rows }), { maxTokens: 400, signal: AbortSignal.timeout(25000), tools: toolsFor(s.system_prompt_version) });
      if (res.ok) {
        const j = await res.json();
        const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (text && text.trim()) {
          await admin.from('chat_messages').insert({ session_id: session.id, user_id: user.id, role: 'assistant', content: text, usage: j.usage || null });
        }
      } else {
        console.error('[notifications/open] sapaan gagal: HTTP', res.status);
      }
    } catch (e) {
      console.error('[notifications/open] sapaan gagal:', e && e.message);
    }
  }
  return Response.json({ session });
}
