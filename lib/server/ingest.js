import { buatRencanaGaji } from './rencana';

// Satu pintu untuk semua Transaksi, termasuk simulasi (CONTEXT.md: Transaksi).
// t: { arah, nominal, kategori, pihak, kanal, catatan? }. Error dari fungsi Postgres dilempar apa adanya untuk failDb.
export async function ingestTransaksi(admin, userId, t) {
  const { data: id, error } = await admin.rpc('ingest_transaksi', {
    p_user: userId,
    p_arah: t.arah,
    p_nominal: t.nominal,
    p_kategori: t.kategori,
    p_pihak: t.pihak,
    p_kanal: t.kanal,
    p_catatan: t.catatan ?? null
  });
  if (error) throw new Error(error.message);
  const { data: tx, error: tErr } = await admin.from('transactions').select('id, nominal, waktu, kategori').eq('id', id).single();
  if (tErr) throw new Error(tErr.message);
  // Gaji dikenali hanya dari kategori payroll (spec bagian 2, non-tujuan).
  // Transaksi sudah tercatat: kegagalan membuat Rencana tidak boleh membuat pemanggil mengulang (Gaji tercatat dua kali).
  let plan = null;
  if (tx.kategori === 'payroll') {
    try {
      plan = await buatRencanaGaji(admin, userId, tx);
    } catch (e) {
      console.error('[ingest] Rencana Alokasi gagal dibuat:', e && e.message);
    }
  }
  return { transaksi: tx, plan };
}
