// Ringkasan Bulanan (spec 5.6, CONTEXT.md: Status Belanja). Fungsi murni: angka dihitung kode, bukan AI.
import { fmtWaktu, rp } from './format';
import { KATEGORI_BELANJA } from './kategori';

const WIB_MS = 7 * 60 * 60 * 1000;
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const STATUS_LABEL = { hemat: 'Hemat', aman: 'Aman', boros: 'Boros' };
const URUT = Object.keys(KATEGORI_BELANJA);

function bagianWib(now) {
  const d = new Date(now.getTime() + WIB_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), hari: d.getUTCDate() };
}

// Awal bulan berjalan menurut WIB, sebagai Date (UTC).
export function awalBulanWib(now) {
  const { y, m } = bagianWib(now);
  return new Date(Date.UTC(y, m, 1) - WIB_MS);
}

// transaksi: [{ waktu, arah, nominal, status, kategori_belanja }]. sumberBatas: 'rencana' | 'pengeluaran_bulanan'.
export function hitungRingkasan({ transaksi, batasBelanja, sumberBatas, now }) {
  const { y, m, hari } = bagianWib(now);
  const jumlahHari = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const awal = Date.UTC(y, m, 1) - WIB_MS;
  const akhir = now.getTime();

  const perKategori = {};
  for (const t of transaksi) {
    if (t.arah !== 'keluar' || t.status !== 'berhasil' || !KATEGORI_BELANJA[t.kategori_belanja]) continue;
    const w = new Date(t.waktu).getTime();
    if (w < awal || w > akhir) continue;
    perKategori[t.kategori_belanja] = (perKategori[t.kategori_belanja] || 0) + Number(t.nominal);
  }
  const daftar = Object.entries(perKategori)
    .map(([kategori, total]) => ({ kategori, label: KATEGORI_BELANJA[kategori].label, kelompok: KATEGORI_BELANJA[kategori].kelompok, total }))
    .sort((a, b) => b.total - a.total || URUT.indexOf(a.kategori) - URUT.indexOf(b.kategori));

  const total = daftar.reduce((a, k) => a + k.total, 0);
  const totalKebutuhan = daftar.filter((k) => k.kelompok === 'kebutuhan').reduce((a, k) => a + k.total, 0);
  const batas = Math.max(0, Math.round(Number(batasBelanja) || 0));
  const batasProrata = Math.round((batas * hari) / jumlahHari);
  const status = total * 100 <= 80 * batasProrata ? 'hemat' : total <= batasProrata ? 'aman' : 'boros';
  const keinginan = daftar.find((k) => k.kelompok === 'keinginan');
  const sisaHari = jumlahHari - hari + 1;
  const sisaBatas = Math.max(0, batas - total);

  return {
    dibuat_pada: now.toISOString(),
    bulan: `${BULAN_PANJANG[m]} ${y}`,
    hari_berjalan: hari,
    jumlah_hari: jumlahHari,
    sumber_batas: sumberBatas,
    batas,
    batas_prorata: batasProrata,
    total,
    total_kebutuhan: totalKebutuhan,
    total_keinginan: total - totalKebutuhan,
    persen: batasProrata ? Math.round((total * 100) / batasProrata) : 0,
    status,
    per_kategori: daftar,
    keinginan_terbesar: keinginan ? { kategori: keinginan.kategori, label: keinginan.label, total: keinginan.total } : null,
    sisa_batas: sisaBatas,
    sisa_hari: sisaHari,
    sisa_per_hari: Math.floor(sisaBatas / sisaHari / 1000) * 1000
  };
}

export const labelStatus = (s) => STATUS_LABEL[s] || s;

// Teks kartu untuk prompt (dibekukan saat disisipkan).
export function renderRingkasan(r) {
  const sumber = r.sumber_batas === 'rencana' ? 'dari Rencana Alokasi terakhir yang diterapkan' : 'dari Pengeluaran Bulanan, karena belum ada Rencana Alokasi yang diterapkan';
  const lines = [
    `KARTU RINGKASAN BULANAN (dibuat ${fmtWaktu(r.dibuat_pada)})`,
    `Bulan: ${r.bulan}, hari ke-${r.hari_berjalan} dari ${r.jumlah_hari}`,
    `Total belanja: ${rp(r.total)} (Kebutuhan ${rp(r.total_kebutuhan)}, Keinginan ${rp(r.total_keinginan)})`,
    `Batas Belanja bulan ini: ${rp(r.batas)} (${sumber})`,
    `Batas sampai hari ini (pro-rata): ${rp(r.batas_prorata)}`,
    `Pemakaian: ${r.persen}% dari batas sampai hari ini`,
    `Status Belanja: ${labelStatus(r.status)}`,
    'Per kategori:'
  ];
  if (!r.per_kategori.length) lines.push('- belum ada belanja');
  for (const k of r.per_kategori) lines.push(`- ${k.label} (${k.kelompok === 'kebutuhan' ? 'Kebutuhan' : 'Keinginan'}): ${rp(k.total)}`);
  lines.push(r.keinginan_terbesar ? `Keinginan terbesar: ${r.keinginan_terbesar.label} ${rp(r.keinginan_terbesar.total)}` : 'Keinginan terbesar: belum ada');
  lines.push(`Sisa Batas Belanja: ${rp(r.sisa_batas)} untuk ${r.sisa_hari} hari lagi (sekitar ${rp(r.sisa_per_hari)} per hari)`);
  return lines.join('\n');
}
