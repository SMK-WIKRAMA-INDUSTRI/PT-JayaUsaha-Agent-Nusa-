import { judulPengeluaran, periksaPengeluaran, renderKartuPengeluaran } from '../pengeluaran';
import { renderRingkasan } from '../ringkasan';
import { rp } from '../format';
import { muatRingkasan } from './ringkasan';
import { aksiMenunggu } from './aksi';

// Menjalankan satu panggilan tool (ADR 0006): tool hanya mengenali niat dan mengambil data. Server yang memvalidasi,
// menyiapkan Aksi Tertunda, dan menghitung angka. Hasil: { content: string JSON (hasil tool), card: object | null }.
// ctx: { userId, sessionId, pesan } dengan pesan = pesan Nasabah giliran ini.

const hasil = (obj, card = null) => ({ content: JSON.stringify(obj), card });

export const hasilGagal = () => hasil({ status: 'gagal', instruksi: 'Sampaikan bahwa sistem sedang gangguan dan minta nasabah mencoba lagi sebentar lagi.' });

async function catatPengeluaran(admin, ctx, call) {
  const cek = periksaPengeluaran(call.arguments, ctx.pesan);
  if (!cek.ok && cek.alasan === 'nominal_tidak_disebut') {
    return hasil({ status: 'nominal_tidak_disebut', instruksi: 'Nominal itu tidak disebut nasabah. Tanyakan berapa nominalnya dan jangan menebak.' });
  }
  if (!cek.ok) return hasil({ status: 'data_kurang', instruksi: 'Tanyakan barang dan nominal pengeluarannya.' });

  const { data: saldo } = await admin.from('v_saldo_bebas').select('saldo_bebas').eq('user_id', ctx.userId).maybeSingle();
  if (saldo && Number(saldo.saldo_bebas) < cek.data.nominal) {
    return hasil({ status: 'saldo_bebas_kurang', saldo_bebas: rp(saldo.saldo_bebas), instruksi: 'Sampaikan bahwa Saldo Bebas tidak cukup untuk mencatat pengeluaran ini.' });
  }

  // Paling banyak satu Aksi Tertunda per sesi: sisa aksi lama (jika ada) dibatalkan di sini tanpa baris PEMBARUAN.
  // batalkanAksi tidak dipakai karena alat ini berjalan setelah penanda balasan (assistant, berisi tool_calls) dipesan
  // dan sebelum baris hasil tool disisipkan: baris PEMBARUAN baru akan mendapat id di antara keduanya dan memutus
  // urutan wajib "assistant tool_calls langsung diikuti pesan tool" saat prompt disusun. Sebagai gantinya, pembatalan
  // dilaporkan ke model lewat field `aksi_lama_dibatalkan` di hasil tool.
  const lama = await aksiMenunggu(admin, ctx.sessionId);
  await admin.from('pending_actions').update({ status: 'batal', diputuskan_at: new Date().toISOString() }).eq('session_id', ctx.sessionId).eq('status', 'menunggu');
  const { data: aksi, error } = await admin
    .from('pending_actions')
    .insert({ user_id: ctx.userId, session_id: ctx.sessionId, jenis: 'catat_pengeluaran', data: cek.data })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const info = { status: 'menunggu_konfirmasi', kartu: renderKartuPengeluaran(cek.data) };
  if (lama && lama.jenis === 'catat_pengeluaran' && lama.data) info.aksi_lama_dibatalkan = judulPengeluaran(lama.data);
  return hasil(info, { jenis: 'pengeluaran', action_id: aksi.id });
}

async function mintaRingkasan(admin, ctx) {
  const r = await muatRingkasan(admin, ctx.userId);
  return hasil({ status: 'ok', kartu: renderRingkasan(r) }, { jenis: 'ringkasan', data: r });
}

// pertama: hanya panggilan pertama di satu giliran yang dijalankan.
export async function jalankanAlat(admin, ctx, call, { pertama }) {
  if (!pertama) return hasil({ status: 'diabaikan', instruksi: 'Hanya satu permintaan yang diproses per giliran.' });
  if (call.name === 'catat_pengeluaran') return catatPengeluaran(admin, ctx, call);
  if (call.name === 'minta_ringkasan') return mintaRingkasan(admin, ctx);
  return hasil({ status: 'tidak_dikenal' });
}
