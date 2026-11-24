// Input suara: mikrofon -> WebSocket Deepgram -> teks. Dipakai oleh app/chat/page.jsx.

// Rekaman berhenti sendiri setelah batas ini supaya mikrofon tidak lupa dimatikan.
export const MAX_RECORDING_SECONDS = 60;

// nova-3: model Deepgram paling akurat untuk pemakaian umum. language=id: Bahasa Indonesia.
// smart_format: tanda baca dan format angka. interim_results: teks sementara selagi pelanggan bicara.
// endpointing=500: potongan kalimat ditutup setelah diam 0,5 detik (bawaan 10 ms memotong kalimat).
export const DEEPGRAM_LIVE_URL =
  'wss://api.deepgram.com/v1/listen?model=nova-3&language=id&smart_format=true&interim_results=true&endpointing=500';

// Meminta izin lalu membuka mikrofon. Error izin diubah menjadi pesan yang mudah dipahami.
export async function getMicrophone() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Browser ini belum mendukung rekam suara. Mikrofon juga hanya bisa dipakai di halaman https:// atau localhost.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const name = e && e.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('Izin mikrofon ditolak. Izinkan mikrofon untuk situs ini di pengaturan browser, lalu coba lagi.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new Error('Mikrofon tidak ditemukan. Sambungkan mikrofon, lalu coba lagi.');
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      throw new Error('Mikrofon sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.');
    }
    throw new Error('Tidak bisa membuka mikrofon.');
  }
}

// Browser tidak bisa menambah header Authorization ke WebSocket, jadi API key dikirim lewat subprotocol.
export function openDeepgramSocket(apiKey) {
  return new Promise((resolve, reject) => {
    let socket;
    try {
      socket = new WebSocket(DEEPGRAM_LIVE_URL, ['token', apiKey]);
    } catch {
      reject(new Error('API key Deepgram berisi karakter yang tidak valid.'));
      return;
    }
    const fail = () => reject(new Error('Gagal tersambung ke Deepgram. Periksa API key Deepgram dan koneksi internet Anda.'));
    socket.addEventListener('open', () => resolve(socket));
    socket.addEventListener('error', fail);
    socket.addEventListener('close', fail); // tidak berefek bila promise sudah selesai
  });
}

// Hasil sementara (is_final false) masih bisa berubah, jadi hanya hasil final yang disimpan permanen.
// Mengembalikan seluruh teks suara sejauh ini (final + sementara).
export function collectTranscript(target, data) {
  const alt = data && data.channel && data.channel.alternatives && data.channel.alternatives[0];
  const text = (alt && alt.transcript) || '';
  if (data.is_final) {
    if (text) target.finalText = `${target.finalText} ${text}`.trim();
    target.interimText = '';
  } else {
    target.interimText = text;
  }
  return `${target.finalText} ${target.interimText}`.trim();
}

export function pickRecorderMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}
