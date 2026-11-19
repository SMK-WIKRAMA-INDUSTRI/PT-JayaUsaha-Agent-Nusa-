function buildBody(settings, messages, o) {
  const body = {
    model: settings.model,
    messages,
    max_tokens: o.maxTokens,
    stream: o.stream
  };
  const t = Number(settings.temperature);
  if (!Number.isNaN(t)) body.temperature = t;
  if (settings.reasoning === 'off') body.reasoning = { enabled: false };
  else if (settings.reasoning !== 'omit') body.reasoning = { enabled: true, effort: settings.reasoning, exclude: true };
  return body;
}

function friendlyError(status, msg) {
  const base = `Error ${status}${msg ? ': ' + msg : ''}`;
  if (status === 401 || status === 403) return base + '. API key tidak valid atau tidak punya akses ke model ini.';
  if (status === 402) return base + '. Kredit tidak cukup.';
  if (status === 404) return base + '. Periksa Model ID di Pengaturan AI.';
  if (status === 429) return base + '. Terlalu banyak permintaan, coba lagi sebentar.';
  if (status === 400) return base + '. Jika terkait reasoning, ubah Reasoning ke "Tidak dikirim" di Pengaturan AI.';
  if (status === 504) return base + '. Server terlalu lama menunggu jawaban. Coba lagi atau turunkan Max tokens.';
  return base;
}

// Memanggil /api/chat (proxy ke Netra). onDelta menerima potongan teks jawaban.
export async function callChat(settings, messages, o, onDelta) {
  if (!settings.apiKey) throw new Error('API key belum diisi.');

  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      signal: o.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': settings.apiKey },
      body: JSON.stringify(buildBody(settings, messages, o))
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet Anda.');
  }

  if (!res.ok) {
    let msg = '';
    try {
      const j = await res.json();
      msg = (j.error && (j.error.message || j.error)) || j.message || '';
      if (typeof msg !== 'string') msg = JSON.stringify(msg);
    } catch {
      /* bukan JSON */
    }
    throw new Error(friendlyError(res.status, msg));
  }

  if (!o.stream) {
    const j = await res.json();
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    if (text) onDelta(text);
    return text;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      let j;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.error) throw new Error(j.error.message || 'Error dari server');
      const d = j.choices && j.choices[0] && j.choices[0].delta;
      if (d && typeof d.content === 'string' && d.content) {
        full += d.content;
        onDelta(d.content);
      }
    }
  }
  return full;
}
