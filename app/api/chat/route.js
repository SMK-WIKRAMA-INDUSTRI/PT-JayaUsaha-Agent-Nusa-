// POST /api/chat { session_id, message, mode: 'text' | 'call' }
// Server menyusun prompt dari DB (lib/prompt.js), meneruskan stream Netra ke browser,
// lalu menyimpan pesan Nasabah, balasan agent, dan usage (termasuk cache hit) ke chat_messages.
// API key Netra hanya ada di env server.

import { getUser } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { buildPromptMessages } from '../../../lib/prompt';
import { createSseParser } from '../../../lib/sse';
import { fail } from '../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = (process.env.NETRA_BASE_URL || 'https://api.netraruntime.com/v1').replace(/\/+$/, '');
const MODEL = process.env.NETRA_MODEL || 'deepseek/deepseek-v4.1-flash';
const MAX_MESSAGE = 2000;
// Riwayat tidak dipotong (memotong dari depan merusak prefix cache). Sesi yang terlalu panjang ditolak.
const MAX_PROMPT_CHARS = 400000;

export async function POST(req) {
  const key = process.env.NETRA_API_KEY;
  if (!key) return fail(500, 'NETRA_API_KEY belum diatur di server.');
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

  const { data: userMsg, error: insErr } = await admin
    .from('chat_messages')
    .insert({ session_id: sessionId, user_id: user.id, role: 'user', content: message })
    .select('id')
    .single();
  if (insErr) return fail(500, insErr.message);
  const dropUserMsg = () => admin.from('chat_messages').delete().eq('id', userMsg.id);

  const { data: history, error: histErr } = await admin.from('chat_messages').select('id, role, content, created_at').eq('session_id', sessionId).order('id');
  if (histErr) {
    await dropUserMsg();
    return fail(500, histErr.message);
  }

  const messages = buildPromptMessages({ session, history, mode });
  if (messages.reduce((n, m) => n + m.content.length, 0) > MAX_PROMPT_CHARS) {
    await dropUserMsg();
    return fail(413, 'Percakapan ini sudah terlalu panjang. Tekan "Chat baru" untuk melanjutkan.');
  }

  let upstream;
  try {
    upstream = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      signal: req.signal,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'X-Netra-Agent': 'agent-nusa-cs' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 600,
        temperature: 0.3,
        reasoning: { enabled: false },
        stream: true,
        stream_options: { include_usage: true }
      })
    });
  } catch {
    await dropUserMsg();
    if (req.signal && req.signal.aborted) return new Response(null, { status: 499 });
    return fail(502, 'Server tidak bisa menjangkau API Netra.');
  }

  if (!upstream.ok || !upstream.body) {
    await dropUserMsg();
    // Status Netra tidak diteruskan apa adanya: 401 dari Netra (key server salah) bukan berarti login Nasabah berakhir.
    let detail = '';
    try {
      const j = await upstream.json();
      detail = (j && j.error && (j.error.message || j.error)) || '';
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch {
      /* bukan JSON */
    }
    const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 502;
    return fail(status, `API Netra menolak permintaan (HTTP ${upstream.status})${detail ? ': ' + detail : ''}.`);
  }

  // Teruskan stream ke browser apa adanya, sambil mengumpulkan teks dan usage untuk disimpan.
  const parser = createSseParser();
  const dec = new TextDecoder();
  let text = '';
  let usage = null;
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          for (const ev of parser.push(dec.decode(value, { stream: true }))) {
            if (ev.text) text += ev.text;
            if (ev.usage) usage = ev.usage;
          }
        }
      } catch {
        // Browser menekan "hentikan" atau koneksi putus: hentikan bacaan dari Netra, simpan teks yang sudah diterima.
        reader.cancel().catch(() => {});
      } finally {
        if (text.trim()) {
          // Disimpan apa adanya (tanpa trim): prefix permintaan berikutnya harus sama dengan output model.
          await admin.from('chat_messages').insert({ session_id: sessionId, user_id: user.id, role: 'assistant', content: text, usage });
          await admin.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
        } else {
          await dropUserMsg();
        }
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
