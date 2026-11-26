export function fail(status, message) {
  return Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Kode error dari fungsi Postgres (raise exception) -> pesan untuk Nasabah.
const PESAN_DB = {
  SALDO_BEBAS_KURANG: [409, 'Saldo Bebas tidak cukup.'],
  RENCANA_TIDAK_ADA: [404, 'Rencana Alokasi tidak ditemukan.'],
  RENCANA_SUDAH_DIPUTUSKAN: [409, 'Rencana ini sudah diterapkan atau diabaikan.'],
  RENCANA_KEDALUWARSA: [409, 'Rencana ini sudah kedaluwarsa.'],
  GOAL_TIDAK_ADA: [409, 'Salah satu Goal di rencana ini sudah dihapus.'],
  REKENING_TIDAK_ADA: [404, 'Rekening tidak ditemukan.'],
  AKSI_TIDAK_ADA: [404, 'Aksi tidak ditemukan.'],
  AKSI_SUDAH_DIPUTUSKAN: [409, 'Aksi ini sudah dicatat atau dibatalkan.'],
  AKSI_KEDALUWARSA: [409, 'Aksi ini sudah kedaluwarsa. Ceritakan lagi pengeluarannya kalau mau dicatat.'],
  AKSI_TIDAK_DIDUKUNG: [400, 'Jenis aksi ini belum didukung.']
};

export function failDb(error) {
  const msg = (error && error.message) || '';
  const kode = Object.keys(PESAN_DB).find((k) => msg.includes(k));
  if (!kode) return fail(500, msg || 'Terjadi kesalahan di database.');
  const [status, pesan] = PESAN_DB[kode];
  return fail(status, pesan);
}
