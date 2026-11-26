// Aturan Alokasi (spec bagian 6, ADR 0002): fungsi murni tanpa I/O, dipakai server dan kartu di browser.
// Angka Rencana Alokasi hanya berasal dari sini, bukan dari model AI.

import { fmtWaktu, rp } from './format';

const RIBU = 1000;
const bulatkan = (n) => Math.floor(n / RIBU) * RIBU; // pembulatan ke ribuan ke bawah; selisihnya masuk Keinginan
const BULAN_TANPA_TENGGAT = 12;

// Sisa bulan kalender sampai tenggat, minimal 1. Tenggat yang sudah lewat = 1 (kekurangan diminta sekaligus).
export function sisaBulan(tenggat, now) {
  if (!tenggat) return BULAN_TANPA_TENGGAT;
  const t = new Date(tenggat);
  const n = (t.getUTCFullYear() - now.getUTCFullYear()) * 12 + (t.getUTCMonth() - now.getUTCMonth());
  return Math.max(1, n);
}

const urutGoal = (a, b) => {
  if (a.tenggat && b.tenggat && a.tenggat !== b.tenggat) return a.tenggat < b.tenggat ? -1 : 1;
  if (!a.tenggat !== !b.tenggat) return a.tenggat ? -1 : 1; // Goal tanpa tenggat paling akhir
  return a.nama < b.nama ? -1 : a.nama > b.nama ? 1 : 0;
};

// danaDarurat: { target, terkumpul } atau null. goals: [{ id, nama, target, terkumpul, tenggat }] (tanpa Dana Darurat).
// rules: { persen_dana_darurat, persen_sosial, persen_investasi }.
export function hitungAlokasi({ gaji, pengeluaranBulanan, danaDarurat, goals = [], rules, now }) {
  const total = Math.floor(Number(gaji));
  if (!(total > 0)) throw new Error('Nominal Gaji harus lebih dari 0.');
  const pos = [];

  const wajib = bulatkan(Math.min(total, Math.max(0, Number(pengeluaranBulanan) || 0)));
  pos.push({ kunci: 'wajib', label: 'Pengeluaran Wajib', jenis: 'batas', nominal: wajib });
  let sisa = total - wajib;

  if (Number(rules.persen_sosial) > 0) {
    const n = bulatkan((sisa * Number(rules.persen_sosial)) / 100);
    sisa -= n;
    pos.push({ kunci: 'sosial', label: 'Sosial', jenis: 'kantong', nominal: n });
  }

  if (danaDarurat) {
    const kurang = Math.max(0, Number(danaDarurat.target) - Number(danaDarurat.terkumpul));
    const n = bulatkan(Math.min((sisa * Number(rules.persen_dana_darurat)) / 100, kurang));
    sisa -= n;
    pos.push({ kunci: 'dana_darurat', label: 'Dana Darurat', jenis: 'kantong', nominal: n });
  }

  for (const g of [...goals].sort(urutGoal)) {
    const kurang = Math.max(0, Number(g.target) - Number(g.terkumpul));
    const butuh = Math.ceil(kurang / sisaBulan(g.tenggat, now));
    const n = bulatkan(Math.min(butuh, sisa));
    sisa -= n;
    pos.push({ kunci: 'goal:' + g.id, label: g.nama, jenis: 'kantong', goal_id: g.id, nominal: n });
  }

  const investasi = bulatkan((sisa * Number(rules.persen_investasi)) / 100);
  pos.push({ kunci: 'investasi', label: 'Investasi', jenis: 'kantong', nominal: investasi });

  const dipakai = pos.reduce((a, p) => a + p.nominal, 0);
  pos.push({ kunci: 'keinginan', label: 'Keinginan', jenis: 'batas', nominal: total - dipakai });
  // Input yang tidak lengkap (misalnya target atau persentase kosong) tidak boleh diam-diam menghasilkan NaN.
  if (!pos.every((p) => Number.isSafeInteger(p.nominal) && p.nominal >= 0)) throw new Error('Data untuk Aturan Alokasi tidak lengkap.');
  return { gaji: total, pos };
}

// Nasabah mengubah nominal pos lewat kartu. Keinginan menyerap selisihnya dan tidak boleh negatif.
export function sesuaikanRincian(rincian, ubah = {}) {
  const kunci = new Set(rincian.pos.map((p) => p.kunci));
  for (const k of Object.keys(ubah)) {
    if (!kunci.has(k) || k === 'keinginan') throw new Error(`Pos "${k}" tidak bisa diubah.`);
    if (!Number.isSafeInteger(ubah[k]) || ubah[k] < 0) throw new Error('Nominal pos harus bilangan bulat 0 atau lebih.');
  }
  const pos = rincian.pos.map((p) => (Object.hasOwn(ubah, p.kunci) ? { ...p, nominal: ubah[p.kunci] } : { ...p }));
  const lain = pos.filter((p) => p.kunci !== 'keinginan').reduce((a, p) => a + p.nominal, 0);
  const keinginan = rincian.gaji - lain;
  if (keinginan < 0) throw new Error(`Total pos melebihi Gaji ${rp(rincian.gaji)}. Kurangi salah satu pos.`);
  return { gaji: rincian.gaji, pos: pos.map((p) => (p.kunci === 'keinginan' ? { ...p, nominal: keinginan } : p)) };
}

export function totalKantong(rincian) {
  return rincian.pos.filter((p) => p.jenis === 'kantong').reduce((a, p) => a + p.nominal, 0);
}

const sifat = (p) => (p.jenis === 'kantong' ? 'disimpan ke Kantong' : 'batas belanja');

// Teks kartu untuk prompt. Dibekukan saat kartu disisipkan (prefix cache), tidak dirender ulang dari status terbaru.
export function renderRencana(rincian, waktuGaji) {
  const lines = [
    'KARTU RENCANA ALOKASI (ditampilkan ke nasabah; semua angka dihitung oleh Aturan Alokasi)',
    `Gaji masuk: ${rp(rincian.gaji)} pada ${fmtWaktu(waktuGaji)}`
  ];
  for (const p of rincian.pos) lines.push(`- ${p.label}: ${rp(p.nominal)} (${sifat(p)})`);
  lines.push('Nasabah bisa mengubah angka di kartu, lalu menekan Terapkan atau Abaikan. Rencana kedaluwarsa dalam 7 hari.');
  lines.push('Saat kartu ini pertama muncul: sapa nasabah, ucapkan selamat atas gajinya, jelaskan rencana ini singkat dengan angka dari kartu, lalu ajak menerapkannya.');
  return lines.join('\n');
}

// Isi pesan pembaruan setelah Rencana diterapkan.
export function renderRencanaDiterapkan(rincian, saldoBebas, waktu) {
  const kantong = rincian.pos.filter((p) => p.jenis === 'kantong' && p.nominal > 0).map((p) => `${p.label} ${rp(p.nominal)}`);
  const batas = rincian.pos.filter((p) => p.jenis === 'batas').map((p) => `${p.label} ${rp(p.nominal)}`);
  return [
    `Rencana Alokasi diterapkan pada ${fmtWaktu(waktu)}.`,
    `Masuk Kantong: ${kantong.length ? kantong.join(', ') : 'tidak ada'}.`,
    `Batas belanja: ${batas.join(', ')}.`,
    `Saldo Bebas sekarang ${rp(saldoBebas)}.`
  ].join('\n');
}
