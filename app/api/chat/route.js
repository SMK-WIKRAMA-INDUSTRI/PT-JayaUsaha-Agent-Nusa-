// POST /api/chat { session_id, message, mode: 'text' | 'call' }
// Server menyusun prompt dari DB (lib/prompt.js), meneruskan stream Netra ke browser,
// lalu menyimpan pesan Nasabah, balasan agent, dan usage (termasuk cache hit) ke chat_messages.
// Baris balasan disisipkan kosong lebih dulu (penanda urutan) dan diisi setelah stream selesai.
// Tahap 3: jawaban Nasabah atas Aksi Tertunda diputuskan lebih dulu (ADR 0007). Jika model memanggil tool (ADR 0006),
// server menjalankannya, menyimpan hasil dan kartunya, lalu memanggil model sekali lagi untuk menjelaskan kartu.
// Baris yang disisipkan server di tengah giliran dikirim ke browser sebagai event `data: {"nusa":{"pesan":...}}`.
// API key Netra hanya ada di env server.

import { getUser } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { buildPromptMessages, toolsFor } from '../../../lib/prompt';
import { createSseParser, createToolCallCollector } from '../../../lib/sse';
import { fail } from '../../../lib/server/http';
import { gagalNetra, netraSiap, panggilNetra } from '../../../lib/server/netra';
import { aksiMenunggu, putuskanDariJawaban } from '../../../lib/server/aksi';
import { hasilGagal, jalankanAlat } from '../../../lib/server/alat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_MESSAGE = 2000;
// Riwayat tidak dipotong (memotong dari depan merusak prefix cache). Sesi yang terlalu panjang ditolak.
const MAX_PROMPT_CHARS = 400000;
const KOLOM_RIWAYAT = 'id, role, content, tool, created_at';
const KOLOM_TAMPIL = 'id, role, content, card, created_at';
// Dipakai jika model tidak menjelaskan kartu (gagal atau kosong), supaya hasil tool selalu punya balasan.
const CADANGAN = 'Silakan cek kartu di atas ya.';

const enc = new TextEncoder();
const sse = (obj) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const penanda = (m) => m.role === 'assistant' && m.content === '' && !m.tool;

// Meneruskan stream Netra ke browser apa adanya sambil mengumpulkan teks, usage, dan tool call.
// { lewatkanError: true }: potongan yang berisi event error tidak diteruskan (dipakai di putaran 2, diganti teks cadangan).
async function teruskan(upstream, kirim, { lewatkanError = false } = {}) {
  const parser = createSseParser();
  const alat = createToolCallCollector();
  const dec = new TextDecoder();
  const r = { text: '', usage: null, error: false, aborted: false, calls: [] };
  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let adaError = false;
      for (const ev of parser.push(dec.decode(value, { stream: true }))) {
        if (ev.text) r.text += ev.text;
        if (ev.usage) r.usage = ev.usage;
        if (ev.error) adaError = r.error = true;
        if (ev.toolCall) alat.push(ev.toolCall);
      }
      if (!(lewatkanError && adaError)) kirim(value);
    }
  } catch {
    // Browser menekan "hentikan" atau koneksi putus: hentikan bacaan dari Netra, simpan teks yang sudah diterima.
    r.aborted = true;
    reader.cancel().catch(() => {});
  }
  r.calls = alat.list();
  return r;
}

export async function POST(req) {
  if (!netraSiap()) return fail(500, 'NETRA_API_KEY belum diatur di server.');
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');

  let sessionId = '';
  let message = '';
  let mode = 'text';
  try {
    const j = await req.json();
    sessionId = String((j && j.session_id) || '');
    message = String((j && j.message) || '').trim();
    mode = j && j.mode === 'call' ? 'call' : 'text';
  } catch {
    return fail(400, 'Body harus berupa JSON.');
  }
  if (!sessionId) return fail(400, 'session_id wajib diisi.');
  if (!message) return fail(400, 'Pesan kosong.');
  if (message.length > MAX_MESSAGE) return fail(413, `Pesan maksimal ${MAX_MESSAGE} karakter.`);

  const admin = createAdminClient();
  const { data: session } = await admin.from('chat_sessions').select('id, user_id, snapshot, system_prompt_version').eq('id', sessionId).maybeSingle();
  if (!session || session.user_id !== user.id) return fail(404, 'Percakapan tidak ditemukan.');
  const tools = toolsFor(session.system_prompt_version);

  const { data: userMsg, error: insErr } = await admin
    .from('chat_messages')
    .insert({ session_id: sessionId, user_id: user.id, role: 'user', content: message })
    .select('id')
    .single();
  if (insErr) return fail(500, insErr.message);

  // Aksi Tertunda dari giliran sebelumnya: "ya" menjalankannya, jawaban lain membatalkannya (ADR 0007).
  // Pembaruannya disisipkan setelah pesan Nasabah dan sebelum balasan agent.
  const sisipan = [];
  const aksi = await aksiMenunggu(admin, sessionId);
  if (aksi) {
    const row = await putuskanDariJawaban(admin, aksi, message);
    if (row) sisipan.push(row);
  }

  // Posisi balasan agent dipesan sekarang (baris kosong), supaya urutan id tetap = urutan percakapan
  // walau pesan berikutnya masuk sebelum stream ini selesai disimpan.
  const { data: placeholder, error: phErr } = await admin
    .from('chat_messages')
    .insert({ session_id: sessionId, user_id: user.id, role: 'assistant', content: '' })
    .select('id')
    .single();
  // Membuang giliran yang gagal. Jika jawaban Nasabah sudah memutuskan Aksi Tertunda (sisipan tidak kosong),
  // uang mungkin sudah berpindah dan baris PEMBARUAN sudah tersimpan: pesan Nasabah dipertahankan supaya
  // riwayat tetap berisi "ya" sebelum PEMBARUAN; hanya penanda balasan yang dihapus.
  const buangGiliran = (placeholderId) => {
    const ids = [sisipan.length ? null : userMsg.id, placeholderId].filter((id) => id != null);
    return ids.length ? admin.from('chat_messages').delete().in('id', ids) : Promise.resolve();
  };
  if (phErr) {
    await buangGiliran(null);
    return fail(500, phErr.message);
  }
  const dropTurn = () => buangGiliran(placeholder.id);

  const susun = (rows) => buildPromptMessages({ session, history: rows.filter((m) => !penanda(m)), mode });
  const { data: rows, error: histErr } = await admin.from('chat_messages').select(KOLOM_RIWAYAT).eq('session_id', sessionId).order('id');
  if (histErr) {
    await dropTurn();
    return fail(500, histErr.message);
  }
  const messages = susun(rows);
  if (messages.reduce((n, m) => n + (m.content || '').length, 0) > MAX_PROMPT_CHARS) {
    await dropTurn();
    return fail(413, 'Percakapan ini sudah terlalu panjang. Tekan "Chat baru" untuk melanjutkan.');
  }

  let upstream;
  try {
    upstream = await panggilNetra(messages, { stream: true, signal: req.signal, tools });
  } catch {
    await dropTurn();
    if (req.signal && req.signal.aborted) return new Response(null, { status: 499 });
    return fail(502, 'Server tidak bisa menjangkau API Netra.');
  }

  if (!upstream.ok || !upstream.body) {
    await dropTurn();
    return gagalNetra(upstream);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const kirim = (b) => {
        try {
          controller.enqueue(b);
        } catch {
          /* browser sudah menutup koneksi */
        }
      };
      const sentuhSesi = () => admin.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
      try {
        for (const row of sisipan) kirim(sse({ nusa: { pesan: row } }));

        const r1 = await teruskan(upstream, kirim);
        if (r1.error || (r1.aborted && r1.calls.length) || (!r1.text.trim() && !r1.calls.length)) {
          // Error di tengah stream, dihentikan saat tool call belum utuh, atau balasan kosong: buang giliran ini.
          await dropTurn();
          return;
        }

        if (!r1.calls.length) {
          // Disimpan apa adanya (tanpa trim): prefix permintaan berikutnya harus sama dengan output model.
          const { error: saveErr } = await admin.from('chat_messages').update({ content: r1.text, usage: r1.usage }).eq('id', placeholder.id);
          if (saveErr) {
            console.error('[api/chat] gagal menyimpan balasan:', saveErr.message);
            await dropTurn();
          } else {
            await sentuhSesi();
          }
          return;
        }

        // Putaran tool. Id panggilan dari model dipakai apa adanya; jika kosong, dibuat deterministik.
        const calls = r1.calls.map((c, i) => ({ id: c.id || `panggilan_${placeholder.id}_${i}`, name: c.name, arguments: c.arguments }));
        const hasilAlat = [];
        for (let i = 0; i < calls.length; i++) {
          try {
            hasilAlat.push(await jalankanAlat(admin, { userId: user.id, sessionId, pesan: message }, calls[i], { pertama: i === 0 }));
          } catch (e) {
            console.error('[api/chat] tool gagal:', calls[i].name, e && e.message);
            hasilAlat.push(hasilGagal());
          }
        }
        const { error: tcErr } = await admin.from('chat_messages').update({ content: r1.text, tool: { calls }, usage: r1.usage }).eq('id', placeholder.id);
        const { data: toolRows, error: trErr } = tcErr
          ? { data: null, error: tcErr }
          : await admin
              .from('chat_messages')
              .insert(calls.map((c, i) => ({ session_id: sessionId, user_id: user.id, role: 'tool', content: hasilAlat[i].content, tool: { id: c.id, name: c.name }, card: hasilAlat[i].card })))
              .select(KOLOM_TAMPIL);
        if (trErr) {
          // Riwayat tidak boleh berisi tool call tanpa hasil: buang giliran dan aksi yang baru dibuat.
          console.error('[api/chat] hasil tool gagal disimpan:', trErr.message);
          await admin.from('pending_actions').update({ status: 'batal', diputuskan_at: new Date().toISOString() }).eq('session_id', sessionId).eq('status', 'menunggu');
          await dropTurn();
          // Teks putaran 1 mungkin sudah tampil: beri tahu browser bahwa giliran ini gagal, bukan selesai.
          kirim(sse({ error: { message: 'Gagal menyimpan hasil. Coba kirim ulang.' } }));
          return;
        }
        for (const row of [...toolRows].sort((a, b) => a.id - b.id)) if (row.card) kirim(sse({ nusa: { pesan: row } }));

        // Putaran 2: agent menjelaskan kartu. Penanda kedua dipesan sebelum stream.
        const { data: ph2 } = await admin.from('chat_messages').insert({ session_id: sessionId, user_id: user.id, role: 'assistant', content: '' }).select('id').single();
        let r2 = { text: '', usage: null, error: true };
        try {
          const { data: rows2, error: h2Err } = await admin.from('chat_messages').select(KOLOM_RIWAYAT).eq('session_id', sessionId).order('id');
          if (h2Err) throw new Error(h2Err.message);
          const up2 = await panggilNetra(susun(rows2), { stream: true, signal: req.signal, tools });
          if (up2.ok && up2.body) r2 = await teruskan(up2, kirim, { lewatkanError: true });
          else console.error('[api/chat] putaran kedua: HTTP', up2.status);
        } catch (e) {
          console.error('[api/chat] putaran kedua gagal:', e && e.message);
        }
        // Tool call di putaran kedua diabaikan. Teks setengah jadi karena error diganti teks cadangan.
        let teks = !r2.error && r2.text.trim() ? r2.text : '';
        if (!teks) {
          teks = CADANGAN;
          kirim(sse({ choices: [{ delta: { content: CADANGAN } }] }));
        }
        const isi = { content: teks, usage: r2.usage };
        const { error: s2Err } = ph2
          ? await admin.from('chat_messages').update(isi).eq('id', ph2.id)
          : await admin.from('chat_messages').insert({ session_id: sessionId, user_id: user.id, role: 'assistant', ...isi });
        if (s2Err) console.error('[api/chat] balasan putaran kedua gagal disimpan:', s2Err.message);
        await sentuhSesi();
      } finally {
        try {
          controller.close();
        } catch {
          /* stream sudah ditutup */
        }
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' }
  });
}
