// Proxy ke Netra Runtime. Kredensial hanya dibaca di server dari environment.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = (process.env.NETRA_BASE_URL || 'https://api.netraruntime.com/v1').replace(/\/+$/, '');
const MAX_BODY = 22 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;

function fail(status, message) {
  return Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readLimitedBody(req) {
  const reader = req.body?.getReader();
  if (!reader) return '';

  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, total).toString('utf8');
    total += value.byteLength;
    if (total > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
}

function validImageBlock(block) {
  const url = block && block.image_url && block.image_url.url;
  const match = typeof url === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (!match) return false;

  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return false;
  if (bytes.toString('base64') !== match[2]) return false;

  if (match[1] === 'png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (match[1] === 'jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

function validMessageContent(content, role) {
  if (typeof content === 'string') return content.length <= 12000;
  if (role !== 'user' || !Array.isArray(content) || content.length < 1 || content.length > MAX_IMAGES + 1) return false;

  let images = 0;
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string' && block.text.length <= 12000) continue;
    if (block && block.type === 'image_url' && validImageBlock(block)) {
      images += 1;
      continue;
    }
    return false;
  }
  return images > 0 && images <= MAX_IMAGES;
}

export async function GET() {
  return Response.json(
    { configured: Boolean(process.env.NETRA_API_KEY?.trim()) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req) {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) return fail(403, 'Origin permintaan tidak diizinkan.');
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return fail(415, 'Content-Type harus application/json.');
  }
  const key = process.env.NETRA_API_KEY?.trim();
  if (!key) return fail(503, 'API belum dikonfigurasi di server.');

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY) return fail(413, 'Permintaan terlalu besar.');
  let body;
  try {
    body = await readLimitedBody(req);
  } catch {
    return fail(400, 'Body tidak dapat dibaca.');
  }
  if (body === null) return fail(413, 'Permintaan terlalu besar.');
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return fail(400, 'Body harus berupa JSON.');
  }
  if (
    !payload ||
    typeof payload.model !== 'string' ||
    payload.model.length > 120 ||
    !Array.isArray(payload.messages) ||
    payload.messages.length < 1 ||
    payload.messages.length > 40 ||
    !Number.isInteger(payload.max_tokens) ||
    payload.max_tokens < 16 ||
    payload.max_tokens > 8192 ||
    typeof payload.stream !== 'boolean' ||
    payload.messages.some(
      (message) =>
        !message ||
        !['system', 'user', 'assistant'].includes(message.role) ||
        !validMessageContent(message.content, message.role)
    ) ||
    (payload.temperature !== undefined &&
      (typeof payload.temperature !== 'number' || payload.temperature < 0 || payload.temperature > 2))
  ) {
    return fail(400, 'Format pesan tidak valid.');
  }

  const requestBody = {
    model: payload.model,
    messages: payload.messages.map(({ role, content }) => ({
      role,
      content: typeof content === 'string'
        ? content
        : content.map((block) =>
            block.type === 'text'
              ? { type: 'text', text: block.text }
              : { type: 'image_url', image_url: { url: block.image_url.url } }
          )
    })),
    max_tokens: payload.max_tokens,
    stream: payload.stream
  };
  if (payload.temperature !== undefined) requestBody.temperature = payload.temperature;
  if (payload.reasoning && typeof payload.reasoning === 'object') requestBody.reasoning = payload.reasoning;

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
      body: JSON.stringify(requestBody)
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
