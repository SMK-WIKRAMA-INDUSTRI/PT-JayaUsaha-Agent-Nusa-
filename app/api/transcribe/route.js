export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg', 'audio/flac']);

function fail(status, message) {
  return Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function hasExpectedSignature(bytes, type) {
  if (type === 'audio/webm') return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (type === 'audio/ogg') return bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'OggS';
  if (type === 'audio/mp4') return bytes.length >= 8 && bytes.toString('ascii', 4, 8) === 'ftyp';
  if (type === 'audio/wav') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
  if (type === 'audio/mpeg') {
    return bytes.length >= 3 && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0));
  }
  if (type === 'audio/flac') return bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'fLaC';
  return false;
}

async function readLimitedAudio(req) {
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, total);
    total += value.byteLength;
    if (total > MAX_AUDIO_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
}

export async function POST(req) {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) return fail(403, 'Origin permintaan tidak diizinkan.');

  const type = (req.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) return fail(415, 'Format audio tidak didukung.');

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_AUDIO_BYTES) return fail(413, 'Audio maksimal 5 MB.');

  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) return fail(503, 'Transkripsi suara belum dikonfigurasi di server.');

  let bytes;
  try {
    bytes = await readLimitedAudio(req);
  } catch {
    return fail(400, 'Audio tidak dapat dibaca.');
  }
  if (!bytes) return fail(413, 'Audio maksimal 5 MB.');
  if (!bytes.length) return fail(400, 'Audio kosong.');
  if (!hasExpectedSignature(bytes, type)) return fail(415, 'Isi file tidak cocok dengan format audio.');

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  req.signal.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(onAbort, 55000);

  try {
    const query = new URLSearchParams({ model: 'nova-3', language: 'id', smart_format: 'true' });
    const response = await fetch(`https://api.deepgram.com/v1/listen?${query}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': type
      },
      body: bytes
    });

    if (!response.ok) return fail(502, 'Deepgram gagal memproses audio. Coba rekam ulang.');

    const result = await response.json();
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (typeof transcript !== 'string') return fail(502, 'Deepgram mengembalikan hasil transkripsi yang tidak valid.');
    return Response.json(
      { transcript: transcript.slice(0, 10000) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (controller.signal.aborted) return fail(504, 'Deepgram terlalu lama memproses audio. Coba lagi.');
    return fail(502, 'Server tidak bisa menjangkau Deepgram.');
  } finally {
    clearTimeout(timeout);
    req.signal.removeEventListener('abort', onAbort);
  }
}
