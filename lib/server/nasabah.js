// Memuat data keuangan satu Nasabah dengan klien service role. userId harus berasal dari getUser().
export async function muatKeuangan(admin, userId) {
  const [p, a, t, g, k] = await Promise.all([
    admin.from('profiles').select('nama_panggilan, pekerjaan, tanggal_gajian, profil_risiko, pengeluaran_bulanan_koreksi').eq('user_id', userId).single(),
    admin.from('accounts').select('nomor_akhir').eq('user_id', userId).single(),
    admin.from('transactions').select('waktu, arah, nominal, pihak, kanal, status, catatan').eq('user_id', userId),
    admin.from('goals').select('id, nama, target, tenggat, is_dana_darurat, kelipatan_target, created_at').eq('user_id', userId),
    admin.from('v_saldo_kantong').select('jenis, goal_id, nama, saldo').eq('user_id', userId)
  ]);
  const failed = [p, a, t, g, k].find((r) => r.error);
  if (failed) throw new Error(failed.error.message);
  return {
    profile: p.data,
    account: a.data,
    transactions: t.data,
    goals: g.data,
    kantong: k.data.map((x) => ({ ...x, saldo: Number(x.saldo) }))
  };
}
