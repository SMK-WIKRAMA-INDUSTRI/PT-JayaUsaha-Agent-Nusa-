import { jenisJawaban } from '../konfirmasi';
import { renderPengeluaranBatal, renderPengeluaranDicatat } from '../pengeluaran';

// Aksi Tertunda (ADR 0007). Uang berubah hanya lewat jalankan_aksi setelah Nasabah mengonfirmasi.
export const KOLOM_AKSI = 'id, user_id, session_id, jenis, data, status, kedaluwarsa_at';
const KOLOM_PESAN = 'id, role, content, card, created_at';

export const kedaluwarsa = (aksi, now = new Date()) => new Date(aksi.kedaluwarsa_at) <= now;

export async function aksiMenunggu(admin, sessionId) {
  const { data } = await admin.from('pending_actions').select(KOLOM_AKSI).eq('session_id', sessionId).eq('status', 'menunggu').maybeSingle();
  return data || null;
}

// Pesan pembaruan di akhir sesi. Mengembalikan barisnya (untuk dikirim ke browser) atau null jika gagal.
async function tambahPembaruan(admin, aksi, content) {
  const { data, error } = await admin
    .from('chat_messages')
    .insert({ session_id: aksi.session_id, user_id: aksi.user_id, role: 'pembaruan', content })
    .select(KOLOM_PESAN)
    .single();
  if (error) {
    console.error('[aksi] pesan pembaruan gagal disimpan:', error.message);
    return null;
  }
  await admin.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', aksi.session_id);
  return data;
}

// sebab: 'nasabah' | 'topik_lain' | 'kedaluwarsa' | 'saldo_kurang'. Mengembalikan baris pembaruan, atau null jika aksi
// sudah diputuskan di tempat lain (tombol di tab lain) sehingga tidak ada yang dibatalkan.
export async function batalkanAksi(admin, aksi, sebab) {
  const now = new Date().toISOString();
  const { data } = await admin.from('pending_actions').update({ status: 'batal', diputuskan_at: now }).eq('id', aksi.id).eq('status', 'menunggu').select('id');
  if (!data || !data.length) return null;
  return tambahPembaruan(admin, aksi, renderPengeluaranBatal(aksi.data, sebab, now));
}

// Menjalankan aksi (error dari Postgres dilempar apa adanya untuk failDb). Mengembalikan baris pembaruan.
export async function jalankanAksi(admin, aksi) {
  const { error } = await admin.rpc('jalankan_aksi', { p_user: aksi.user_id, p_aksi: aksi.id });
  if (error) throw new Error(error.message);
  // Uang sudah berubah: kegagalan membaca saldo hanya menghilangkan kalimat saldo di pembaruan.
  const { data: saldo } = await admin.from('v_saldo_bebas').select('saldo_bebas').eq('user_id', aksi.user_id).maybeSingle();
  return tambahPembaruan(admin, aksi, renderPengeluaranDicatat(aksi.data, saldo ? Number(saldo.saldo_bebas) : null, new Date().toISOString()));
}

// Jawaban Nasabah di giliran berikutnya: "ya" menjalankan aksi, selain itu membatalkannya (spec 5.5).
// Mengembalikan baris pembaruan yang disisipkan, atau null.
export async function putuskanDariJawaban(admin, aksi, pesan) {
  if (kedaluwarsa(aksi)) return batalkanAksi(admin, aksi, 'kedaluwarsa');
  const jawaban = jenisJawaban(pesan);
  if (jawaban !== 'ya') return batalkanAksi(admin, aksi, jawaban === 'tidak' ? 'nasabah' : 'topik_lain');
  try {
    return await jalankanAksi(admin, aksi);
  } catch (e) {
    const msg = (e && e.message) || '';
    if (msg.includes('SALDO_BEBAS_KURANG')) return batalkanAksi(admin, aksi, 'saldo_kurang');
    if (msg.includes('AKSI_KEDALUWARSA')) return batalkanAksi(admin, aksi, 'kedaluwarsa');
    if (!msg.includes('AKSI_SUDAH_DIPUTUSKAN')) console.error('[aksi] gagal dijalankan:', msg);
    return null;
  }
}
