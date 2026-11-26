// Klien browser untuk endpoint server. Key Netra tidak lagi ada di browser.
import { createSseParser } from './sse';

function friendlyError(status, msg) {
  const base = `Error ${status}${msg ? ': ' + msg : ''}`;
  if (status === 401) return 'Sesi login Anda berakhir. Muat ulang halaman lalu masuk lagi.';
  if (status === 402) return base + '. Kredit Netra tidak cukup.';
  if (status === 429) return base + '. Terlalu banyak permintaan, coba lagi sebentar.';
  if (status === 504) return base + '. Server terlalu lama menunggu jawaban. Coba lagi.';
  return base;
}

async function request(url, init) {
  let res;
  try {
    res = await fetch(url, init);
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
  return res;
}

const postJson = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function listSessions() {
  return (await (await request('/api/sessions')).json()).sessions;
}

export async function createSession() {
  return (await (await request('/api/sessions', { method: 'POST' })).json()).session;
}

export async function getSessionMessages(id) {
  return (await (await request(`/api/sessions/${encodeURIComponent(id)}`)).json()).messages;
}

export async function addAttachment(id, nama, teks) {
  await request(`/api/sessions/${encodeURIComponent(id)}/lampiran`, postJson({ nama, teks }));
}

export async function demoGaji() {
  return (await request('/api/demo/gaji', { method: 'POST' })).json();
}

export async function demoReset() {
  await request('/api/demo/reset', { method: 'POST' });
}

// Membuka Notifikasi Gajian. Mengembalikan sesi yang dimulai agent.
export async function openNotification(id) {
  return (await (await request(`/api/notifications/${encodeURIComponent(id)}/open`, { method: 'POST' })).json()).session;
}

export async function applyPlan(id, ubah) {
  return (await request(`/api/plans/${encodeURIComponent(id)}/apply`, postJson({ ubah }))).json();
}

export async function ignorePlan(id) {
  return (await request(`/api/plans/${encodeURIComponent(id)}/ignore`, { method: 'POST' })).json();
}

// Mengirim satu pesan ke sesi. onDelta menerima potongan teks jawaban.
export async function callChat(sessionId, message, { mode = 'text', signal } = {}, onDelta) {
  const res = await request('/api/chat', { ...postJson({ session_id: sessionId, message, mode }), signal });
  const parser = createSseParser();
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const ev of parser.push(dec.decode(value, { stream: true }))) {
      if (ev.error) throw new Error(ev.error);
      // [DONE] tidak dipakai sebagai tanda selesai: server baru menutup stream setelah balasan tersimpan di DB,
      // jadi pesan berikutnya tidak bisa mendahului balasan ini di riwayat (urutan riwayat = prefix cache).
      if (ev.text) {
        full += ev.text;
        onDelta(ev.text);
      }
    }
  }
  return full;
}
