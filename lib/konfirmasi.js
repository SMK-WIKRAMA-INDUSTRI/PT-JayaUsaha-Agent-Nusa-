// Menilai jawaban Nasabah atas Aksi Tertunda (ADR 0007). Deterministik: uang tidak boleh berubah karena tebakan AI.
// 'ya'    : pesan pendek yang hanya berisi kata setuju (boleh ditambah kata pengisi)
// 'tidak' : pesan pendek yang hanya berisi kata penolakan
// 'lain'  : selain itu (termasuk pesan berisi angka), dan aksi dianggap ditinggal

const YA = new Set(['ya', 'iya', 'iyaa', 'iyap', 'yap', 'yup', 'yes', 'y', 'benar', 'bener', 'betul', 'oke', 'okay', 'okey', 'ok', 'sip', 'siap', 'boleh', 'lanjut', 'lanjutkan', 'setuju', 'catat', 'catatkan', 'gas', 'mantap', 'yaudah', 'yaudh', 'yoi', 'yuk', 'okee', 'okeh', 'siapp']);
const TIDAK = new Set(['tidak', 'tdk', 'nggak', 'ngga', 'enggak', 'engga', 'gak', 'ga', 'nga', 'no', 'jangan', 'batal', 'batalkan', 'cancel', 'salah', 'bukan', 'gausah', 'gajadi']);
const PENGISI = new Set(['kak', 'kakak', 'min', 'deh', 'dong', 'aja', 'saja', 'sih', 'nya', 'itu', 'tolong', 'silakan', 'sekali', 'banget', 'udah', 'sudah', 'jadi', 'usah', 'dicatat', 'pak', 'bu', 'mas', 'mbak', 'makasih', 'terima', 'kasih', 'thanks', 'thank', 'you', 'dulu', 'ajaa']);
// "enggak salah" = "itu benar": kata negasi tepat sebelum "salah" berarti setuju.
const NEGASI = new Set(['tidak', 'tdk', 'nggak', 'ngga', 'enggak', 'engga', 'gak', 'ga', 'nga']);
const MAKS_KATA = 6;

export function jenisJawaban(teks) {
  const s = String(teks || '').toLowerCase();
  if (/\d/.test(s)) return 'lain';
  const kata = s.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!kata.length || kata.length > MAKS_KATA) return 'lain';
  const inti = kata.filter((k) => !PENGISI.has(k));
  if (inti.length === 2 && NEGASI.has(inti[0]) && inti[1] === 'salah') return 'ya';
  const ya = kata.some((k) => YA.has(k));
  const tidak = kata.some((k) => TIDAK.has(k));
  const sisaLain = kata.some((k) => !YA.has(k) && !TIDAK.has(k) && !PENGISI.has(k));
  if (sisaLain || ya === tidak) return 'lain';
  return ya ? 'ya' : 'tidak';
}
