// Hitungan keuangan murni (tanpa I/O). Dipakai server (snapshot) dan browser (onboarding).

const berhasil = (t) => t.status === 'berhasil';

// Saldo Total = semua Transaksi berhasil (ADR 0005: saldo dihitung dari buku besar).
export function saldoTotal(transactions) {
  let total = 0;
  for (const t of transactions) {
    if (!berhasil(t)) continue;
    total += t.arah === 'masuk' ? Number(t.nominal) : -Number(t.nominal);
  }
  return total;
}

// Rata-rata Transaksi keluar berhasil pada 3 bulan kalender penuh sebelum bulan berjalan (batas bulan UTC,
// sama dengan date_trunc di seed database).
export function pengeluaranBulananOtomatis(transactions, now) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1);
  let total = 0;
  for (const t of transactions) {
    const w = new Date(t.waktu).getTime();
    if (t.arah === 'keluar' && berhasil(t) && w >= start && w < end) total += Number(t.nominal);
  }
  return Math.round(total / 3);
}

// Koreksi Nasabah selalu menang atas hitungan otomatis.
export function pengeluaranBulanan(transactions, koreksi, now) {
  return koreksi === null || koreksi === undefined ? pengeluaranBulananOtomatis(transactions, now) : Number(koreksi);
}

export function targetDanaDarurat(pengeluaran, kelipatan) {
  return pengeluaran * kelipatan;
}
