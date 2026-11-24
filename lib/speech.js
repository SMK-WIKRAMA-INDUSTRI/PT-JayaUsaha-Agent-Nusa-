// Suara agent: text to speech Deepgram (lewat /api/speak), pemutaran sambil diunduh,
// animasi teks yang mengikuti suara, dan kalimat-kalimat untuk mode telepon. Dipakai oleh app/chat/page.jsx.

// Agent di telepon memperkenalkan diri dengan nama yang sama dengan suaranya.
export const AGENT_NAME = 'Fitri';

export const CALL_RULES = [
  `Namamu ${AGENT_NAME}.`,
  'Pelanggan sedang menelepon, jadi jawabanmu akan dibacakan dengan suara.',
  'Pakai bahasa lisan sehari-hari yang tetap sopan, misalnya "oke", "nah", atau "ya".',
  'Jawab paling banyak tiga kalimat pendek dan langsung ke intinya.',
  'Jangan membuka jawaban dengan sapaan atau ucapan terima kasih sudah menunggu, karena aplikasi sudah mengucapkannya.',
  'Tulis angka, jam, dan harga dengan huruf, misalnya sepuluh ribu rupiah atau pukul sembilan pagi.',
  'Jangan memakai daftar, tanda bintang, atau simbol lain.'
].join('\n');

// Kalimat jeda: agent bilang sedang mengecek, bukan diam saja selagi menunggu jawaban Netra.
export const CHECKING_LINES = ['Oke Kak, sebentar ya, saya cek dulu.', 'Baik Kak, saya cek terlebih dahulu ya.', 'Hmm, sebentar ya Kak, saya lihat datanya dulu.'];
export const STILL_CHECKING_LINE = 'Masih saya cek ya Kak, mohon ditunggu sebentar.';
export const THANKS_FOR_WAITING_LINES = ['Makasih sudah menunggu ya Kak.', 'Oke Kak, sudah saya cek ya.'];
export const CHECKING_DELAY_MS = 1000; // kalimat jeda diucapkan kalau jawaban belum siap setelah 1 detik
export const STILL_CHECKING_DELAY_MS = 6000;
// Basa-basi pendek seperti "oke makasih" tidak perlu dicek dulu.
const SMALL_TALK = /^(halo|hai|oke|ok|baik|siap|sip|iya|ya|makasih|terima kasih)\b/i;

export const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

export function needsChecking(question) {
  const q = String(question || '').trim();
  return !(q.split(/\s+/).length <= 4 && SMALL_TALK.test(q));
}

// Salam pembuka menyesuaikan jam di komputer pelanggan.
export function buildGreeting() {
  const hour = new Date().getHours();
  const time = hour < 11 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam';
  return `Halo, selamat ${time}! Dengan ${AGENT_NAME} dari customer service Agent Nusa. Ada yang bisa saya bantu?`;
}

// Hasilnya true kalau promise sudah selesai (berhasil atau gagal) sebelum ms milidetik.
export function settlesWithin(promise, ms) {
  const settled = promise.then(() => true, () => true);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), ms));
  return Promise.race([settled, timeout]);
}

// Meminta suara untuk teks. Mengembalikan Response berisi MP3 yang masih bisa dibaca bertahap.
export async function requestSpeech(apiKey, text, signal) {
  if (!apiKey) throw new Error('API key Deepgram belum diisi.');
  let res;
  try {
    res = await fetch('/api/speak', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-deepgram-key': apiKey },
      body: JSON.stringify({ text })
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new Error('Tidak bisa terhubung ke server suara. Periksa koneksi internet Anda.');
  }
  if (!res.ok) {
    let msg = '';
    try {
      const j = await res.json();
      msg = (j.error && j.error.message) || '';
    } catch {
      /* bukan JSON */
    }
    const hint = res.status === 401 || res.status === 403 ? ' Periksa API key Deepgram.' : '';
    throw new Error(`Suara agent gagal dibuat (error ${res.status}${msg ? ': ' + msg : ''}).${hint}`);
  }
  return res;
}

// Suara diputar sambil potongan berikutnya masih diunduh, jadi agent mulai bicara lebih cepat.
function streamAudio(response) {
  const mediaSource = new MediaSource();
  const audio = new Audio(URL.createObjectURL(mediaSource));
  mediaSource.addEventListener(
    'sourceopen',
    async () => {
      URL.revokeObjectURL(audio.src);
      const buffer = mediaSource.addSourceBuffer('audio/mpeg');
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer.appendBuffer(value);
          await new Promise((resolve) => buffer.addEventListener('updateend', resolve, { once: true }));
        }
        mediaSource.endOfStream();
      } catch {
        if (mediaSource.readyState === 'open') mediaSource.endOfStream('network');
      }
    },
    { once: true }
  );
  return audio;
}

const canStream = () =>
  typeof window !== 'undefined' && typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported && MediaSource.isTypeSupported('audio/mpeg');

// Browser yang belum mendukung MediaSource untuk MP3 memakai jalur cadangan: tunggu file lengkap, baru diputar.
export async function createAgentAudio(response) {
  if (canStream() && response.body) return streamAudio(response);
  const blob = await response.blob();
  return new Audio(URL.createObjectURL(blob));
}

// Kalimat jeda selalu sama, jadi suaranya diunduh sekali lalu disimpan.
const lineCache = new Map();
export function getLineAudio(apiKey, text) {
  const cacheKey = apiKey + '\u0000' + text;
  if (!lineCache.has(cacheKey)) {
    const p = requestSpeech(apiKey, text).then((res) => res.blob());
    p.catch(() => lineCache.delete(cacheKey)); // gagal: boleh dicoba lagi lain kali
    lineCache.set(cacheKey, p);
  }
  return lineCache.get(cacheKey);
}

// Perkiraan kecepatan bicara selagi panjang suara belum diketahui (suara masih diunduh).
const CHARS_PER_SECOND = 15;

// Memutar suara dan memanggil onReveal(jumlahHuruf) supaya teks muncul sejalan dengan suara.
// Selesai saat suara habis, atau saat signal dibatalkan (suara langsung dihentikan).
export function playAudio(audio, text, onReveal, signal) {
  return new Promise((resolve, reject) => {
    const total = text.length;
    let shown = -1;
    let frame = 0;
    let done = false;

    const reveal = (n) => {
      if (n > shown) {
        shown = n;
        onReveal(n);
      }
    };
    const tick = () => {
      const t = audio.currentTime || 0;
      const d = audio.duration;
      // Panjang suara sudah diketahui: teks mengikuti posisi suara. Belum: pakai perkiraan, tapi jangan sampai habis duluan.
      const n = Number.isFinite(d) && d > 0 ? Math.round((t / d) * total) : Math.min(total - 1, Math.floor(t * CHARS_PER_SECOND));
      reveal(Math.max(0, Math.min(total, n)));
      frame = requestAnimationFrame(tick);
    };
    const cleanup = () => {
      done = true;
      cancelAnimationFrame(frame);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const onEnded = () => {
      if (done) return;
      cleanup();
      reveal(total);
      resolve();
    };
    const onError = () => {
      if (done) return;
      cleanup();
      reject(new Error('Suara agent tidak bisa diputar di browser ini.'));
    };
    const onAbort = () => {
      if (done) return;
      cleanup();
      audio.pause();
      resolve();
    };

    if (signal && signal.aborted) {
      resolve();
      return;
    }
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    if (signal) signal.addEventListener('abort', onAbort);
    reveal(0);
    audio.play().then(
      () => {
        if (!done) frame = requestAnimationFrame(tick);
      },
      (e) => {
        if (done) return;
        cleanup();
        reject(
          new Error(
            e && e.name === 'NotAllowedError'
              ? 'Browser menahan suara otomatis. Klik di halaman ini sekali, lalu coba lagi.'
              : 'Suara agent tidak bisa diputar di browser ini.'
          )
        );
      }
    );
  });
}
