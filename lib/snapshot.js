// Snapshot Keuangan: data yang dibekukan saat Sesi Percakapan dibuat (ADR 0003).
// buildSnapshot -> objek untuk disimpan di chat_sessions.snapshot (jsonb).
// renderSnapshot -> teks untuk prompt. Urutan baris ditulis eksplisit di sini karena jsonb tidak menjaga urutan key.

import { fmtTanggal, fmtWaktu, rp } from './format';
import { pengeluaranBulanan, saldoTotal, targetDanaDarurat } from './keuangan';

const MAX_TRANSAKSI = 15;

const URUT_KANTONG = { dana_darurat: 0, goal: 1, investasi: 2, sosial: 3 };

// kantong (opsional): [{ nama, jenis, saldo }]. Tanpa kantong, snapshot sama persis dengan format Tahap 1.
export function buildSnapshot({ profile, account, transactions, goals, kantong, now }) {
  const koreksi = profile.pengeluaran_bulanan_koreksi;
  const pengeluaran = pengeluaranBulanan(transactions, koreksi, now);
  const sortedGoals = [...goals].sort(
    (a, b) => Number(b.is_dana_darurat) - Number(a.is_dana_darurat) || new Date(a.created_at) - new Date(b.created_at)
  );
  const recent = [...transactions].sort((a, b) => new Date(b.waktu) - new Date(a.waktu)).slice(0, MAX_TRANSAKSI);

  const total = saldoTotal(transactions);
  const snap = {
    dibuat_pada: now.toISOString(),
    nasabah: {
      nama: profile.nama_panggilan || 'Nasabah',
      pekerjaan: profile.pekerjaan || null,
      tanggal_gajian: profile.tanggal_gajian ?? null,
      profil_risiko: profile.profil_risiko ?? null
    },
    rekening: { nomor_akhir: account.nomor_akhir, saldo_total: total },
    pengeluaran_bulanan: pengeluaran,
    pengeluaran_bulanan_sumber: koreksi === null || koreksi === undefined ? 'hitungan_transaksi' : 'koreksi_nasabah',
    goals: sortedGoals.map((g) => ({
      nama: g.nama,
      target: g.is_dana_darurat ? targetDanaDarurat(pengeluaran, g.kelipatan_target) : Number(g.target),
      tenggat: g.tenggat ?? null,
      dana_darurat: !!g.is_dana_darurat
    })),
    transaksi_terakhir: recent.map((t) => ({
      waktu: t.waktu,
      arah: t.arah,
      nominal: Number(t.nominal),
      pihak: t.pihak,
      kanal: t.kanal,
      status: t.status,
      catatan: t.catatan ?? null
    }))
  };
  if (kantong !== undefined) {
    const isi = kantong.reduce((a, k) => a + Number(k.saldo), 0);
    snap.rekening.saldo_bebas = total - isi;
    snap.kantong = [...kantong]
      .map((k) => ({ nama: k.nama, jenis: k.jenis, saldo: Number(k.saldo) }))
      .sort((a, b) => (URUT_KANTONG[a.jenis] ?? 9) - (URUT_KANTONG[b.jenis] ?? 9) || (a.nama < b.nama ? -1 : a.nama > b.nama ? 1 : 0));
  }
  return snap;
}

export function renderSnapshot(s) {
  const n = s.nasabah;
  const r = s.rekening;
  const sumber = s.pengeluaran_bulanan_sumber === 'koreksi_nasabah' ? 'dikoreksi nasabah' : 'dihitung dari transaksi 3 bulan terakhir';
  const lines = [
    `DATA KEUANGAN NASABAH (dibekukan ${fmtWaktu(s.dibuat_pada)})`,
    `Nama nasabah: ${n.nama}`,
    `Pekerjaan: ${n.pekerjaan || 'belum diisi'}`,
    `Tanggal gajian: ${n.tanggal_gajian ? 'setiap tanggal ' + n.tanggal_gajian : 'belum diisi'}`,
    `Profil Risiko: ${n.profil_risiko || 'belum diisi'}`,
    `Rekening: Tabungan Agent Nusa berakhiran ${r.nomor_akhir}. Saldo Total: ${rp(r.saldo_total)}`
  ];
  if (s.kantong) {
    lines.push(`Saldo Bebas: ${rp(r.saldo_bebas)} (Saldo Total dikurangi isi Kantong; hanya ini yang bisa dipakai)`);
    lines.push('Kantong:');
    if (!s.kantong.length) lines.push('- belum ada');
    for (const k of s.kantong) lines.push(`- ${k.nama}: ${rp(k.saldo)}`);
  }
  lines.push(`Pengeluaran Bulanan: ${rp(s.pengeluaran_bulanan)} (${sumber})`);
  lines.push('Goal:');
  if (!s.goals.length) lines.push('- belum ada');
  for (const g of s.goals) {
    lines.push(
      g.dana_darurat
        ? `- Dana Darurat: target ${rp(g.target)}`
        : `- ${g.nama}: target ${rp(g.target)}${g.tenggat ? ', tenggat ' + fmtTanggal(g.tenggat) : ''}`
    );
  }
  lines.push('Transaksi terakhir:');
  if (!s.transaksi_terakhir.length) lines.push('- belum ada');
  for (const t of s.transaksi_terakhir) {
    lines.push(
      `- ${fmtWaktu(t.waktu)} | ${t.pihak} | ${t.arah} ${rp(t.nominal)} | status: ${t.status}${t.catatan ? ' (' + t.catatan + ')' : ''} | kanal: ${t.kanal}`
    );
  }
  return lines.join('\n');
}
