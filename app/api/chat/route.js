// Proxy ke Netra Runtime: POST /api/chat -> {NETRA_BASE_URL}/chat/completions
// API key tidak disimpan di server. Browser mengirimnya per permintaan lewat header x-api-key.
// Base URL dikunci di server (bukan dari klien) supaya endpoint ini tidak bisa dipakai sebagai proxy ke alamat lain.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = (process.env.NETRA_BASE_URL || 'https://api.netraruntime.com/v1').replace(/\/+$/, '');
const MAX_BODY = 2 * 1024 * 1024;

function fail(status, message) {
  return Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req) {
  const key = (req.headers.get('x-api-key') || '').trim();
  if (!key) return fail(401, 'API key belum diisi.');

  const body = await req.text();
  if (body.length > MAX_BODY) return fail(413, 'Permintaan terlalu besar.');
  try {
    JSON.parse(body);
  } catch {
    return fail(400, 'Body harus berupa JSON.');
  }

  let upstream;
  try {
    upstream = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      signal: req.signal,
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'X-Netra-Agent': 'agent-nusa-cs'
      },
      body
    });
  } catch (e) {
    if (req.signal && req.signal.aborted) return new Response(null, { status: 499 });
    return fail(502, 'Server tidak bisa menjangkau API Netra.');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  });
}
