// Proxy text to speech: POST /api/speak { text } -> Deepgram /v2/speak (Flux, suara Fitri, Bahasa Indonesia).
// API key Deepgram dikirim browser per permintaan lewat header x-deepgram-key, tidak disimpan di server.
// Lewat server supaya tidak bergantung pada izin CORS Deepgram. Audio MP3 diteruskan sambil diunduh (streaming).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Model Flux hanya tersedia di /v2/speak. Nama model: flux-{suara}-{bahasa}. encoding=mp3: hasil berupa MP3.
const DEEPGRAM_SPEAK_URL = 'https://api.deepgram.com/v2/speak?model=flux-fitri-id&encoding=mp3';
const MAX_TEXT = 2000;

function fail(status, message) {
  return Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req) {
  const key = (req.headers.get('x-deepgram-key') || '').trim();
  if (!key) return fail(401, 'API key Deepgram belum diisi.');

  let text = '';
  try {
    const j = await req.json();
    text = String((j && j.text) || '').trim();
  } catch {
    return fail(400, 'Body harus berupa JSON.');
  }
  if (!text) return fail(400, 'Teks kosong.');
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);

  let upstream;
  try {
    upstream = await fetch(DEEPGRAM_SPEAK_URL, {
      method: 'POST',
      signal: req.signal,
      headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
  } catch {
    if (req.signal && req.signal.aborted) return new Response(null, { status: 499 });
    return fail(502, 'Server tidak bisa menjangkau Deepgram.');
  }

  if (!upstream.ok) {
    let msg = '';
    try {
      const j = await upstream.json();
      msg = j.err_msg || j.message || (j.error && (j.error.message || j.error)) || '';
      if (typeof msg !== 'string') msg = JSON.stringify(msg);
    } catch {
      /* bukan JSON */
    }
    return fail(upstream.status, msg || 'Deepgram menolak permintaan suara.');
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no'
    }
  });
}
