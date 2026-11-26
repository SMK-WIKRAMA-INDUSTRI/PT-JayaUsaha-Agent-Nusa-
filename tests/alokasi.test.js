import { describe, expect, it } from 'vitest';
import { hitungAlokasi, renderRencana, renderRencanaDiterapkan, sesuaikanRincian, sisaBulan, totalKantong } from '../lib/alokasi';

const NOW = new Date('2026-11-26T02:00:00Z');
const RULES = { persen_dana_darurat: 20, persen_sosial: 0, persen_investasi: 50 };
const DD = { target: 54117000, terkumpul: 0 };
const base = { gaji: 12500000, pengeluaranBulanan: 9019500, danaDarurat: DD, goals: [], rules: RULES, now: NOW };
const nominal = (r) => Object.fromEntries(r.pos.map((p) => [p.kunci, p.nominal]));
const jumlah = (r) => r.pos.reduce((a, p) => a + p.nominal, 0);

describe('hitungAlokasi', () => {
  it('kasus dasar: urutan pos dan nominal sesuai aturan', () => {
    const r = hitungAlokasi(base);
    expect(r.pos.map((p) => p.kunci)).toEqual(['wajib', 'dana_darurat', 'investasi', 'keinginan']);
    expect(nominal(r)).toEqual({ wajib: 9019000, dana_darurat: 696000, investasi: 1392000, keinginan: 1393000 });
    expect(jumlah(r)).toBe(12500000);
    expect(r.pos.find((p) => p.kunci === 'wajib').jenis).toBe('batas');
    expect(r.pos.find((p) => p.kunci === 'dana_darurat').jenis).toBe('kantong');
  });

  it('Gaji lebih kecil dari Pengeluaran Bulanan: semua untuk Wajib', () => {
    const r = hitungAlokasi({ ...base, gaji: 5000000 });
    expect(nominal(r)).toEqual({ wajib: 5000000, dana_darurat: 0, investasi: 0, keinginan: 0 });
  });

  it('Dana Darurat sudah penuh: pos Dana Darurat 0', () => {
    const r = hitungAlokasi({ ...base, danaDarurat: { target: 54117000, terkumpul: 60000000 } });
    expect(nominal(r)).toEqual({ wajib: 9019000, dana_darurat: 0, investasi: 1740000, keinginan: 1741000 });
  });

  it('Dana Darurat hampir penuh: hanya mengisi kekurangannya', () => {
    const r = hitungAlokasi({ ...base, danaDarurat: { target: 54117000, terkumpul: 53800000 } });
    expect(nominal(r).dana_darurat).toBe(317000);
    expect(jumlah(r)).toBe(12500000);
  });

  it('tanpa Dana Darurat: pos Dana Darurat tidak ada', () => {
    const r = hitungAlokasi({ ...base, danaDarurat: null });
    expect(r.pos.map((p) => p.kunci)).toEqual(['wajib', 'investasi', 'keinginan']);
  });

  it('Goal diisi sesuai kebutuhan per bulan, tenggat terdekat dulu, tanpa tenggat dianggap 12 bulan', () => {
    const goals = [
      { id: 'b', nama: 'Laptop', target: 2400000, terkumpul: 0, tenggat: null },
      { id: 'a', nama: 'Liburan', target: 6000000, terkumpul: 0, tenggat: '2027-05-01' }
    ];
    const r = hitungAlokasi({ ...base, goals });
    expect(r.pos.map((p) => p.kunci)).toEqual(['wajib', 'dana_darurat', 'goal:a', 'goal:b', 'investasi', 'keinginan']);
    expect(nominal(r)).toEqual({ wajib: 9019000, dana_darurat: 696000, 'goal:a': 1000000, 'goal:b': 200000, investasi: 792000, keinginan: 793000 });
    expect(r.pos.find((p) => p.kunci === 'goal:a')).toMatchObject({ label: 'Liburan', jenis: 'kantong', goal_id: 'a' });
  });

  it('uang tidak cukup: Goal bertenggat lebih jauh mendapat lebih sedikit', () => {
    const goals = [
      { id: 'a', nama: 'Liburan', target: 6000000, terkumpul: 0, tenggat: '2027-05-01' },
      { id: 'b', nama: 'Laptop', target: 2400000, terkumpul: 0, tenggat: null }
    ];
    const r = hitungAlokasi({ ...base, gaji: 10000000, goals });
    expect(nominal(r)).toEqual({ wajib: 9019000, dana_darurat: 196000, 'goal:a': 785000, 'goal:b': 0, investasi: 0, keinginan: 0 });
  });

  it('Goal yang tenggatnya sudah lewat meminta seluruh kekurangannya (dibatasi sisa uang)', () => {
    const goals = [{ id: 'a', nama: 'Motor', target: 3000000, terkumpul: 0, tenggat: '2026-10-01' }];
    const r = hitungAlokasi({ ...base, goals });
    expect(nominal(r)['goal:a']).toBe(2785000);
    expect(nominal(r).keinginan).toBe(0);
  });

  it('Goal yang sudah tercapai mendapat 0', () => {
    const goals = [{ id: 'a', nama: 'Motor', target: 3000000, terkumpul: 3500000, tenggat: '2027-05-01' }];
    expect(nominal(hitungAlokasi({ ...base, goals }))['goal:a']).toBe(0);
  });

  it('persentase yang diubah Nasabah, termasuk Sosial', () => {
    const r = hitungAlokasi({ ...base, rules: { persen_dana_darurat: 50, persen_sosial: 10, persen_investasi: 100 } });
    expect(r.pos.map((p) => p.kunci)).toEqual(['wajib', 'sosial', 'dana_darurat', 'investasi', 'keinginan']);
    expect(nominal(r)).toEqual({ wajib: 9019000, sosial: 348000, dana_darurat: 1566000, investasi: 1567000, keinginan: 0 });
  });

  it('jumlah semua pos selalu sama dengan Gaji', () => {
    for (const gaji of [1000, 999999, 9019500, 12345678, 50000000]) {
      expect(jumlah(hitungAlokasi({ ...base, gaji }))).toBe(gaji);
    }
  });

  it('menolak Gaji 0 atau negatif', () => {
    expect(() => hitungAlokasi({ ...base, gaji: 0 })).toThrow();
    expect(() => hitungAlokasi({ ...base, gaji: -5 })).toThrow();
  });

  it('menolak input tidak lengkap alih-alih menghasilkan NaN', () => {
    expect(() => hitungAlokasi({ ...base, rules: {} })).toThrow(/tidak lengkap/);
    expect(() => hitungAlokasi({ ...base, danaDarurat: { target: 1000000 } })).toThrow(/tidak lengkap/);
  });
});

describe('sisaBulan', () => {
  it('menghitung selisih bulan kalender, minimal 1', () => {
    expect(sisaBulan('2027-05-01', NOW)).toBe(6);
    expect(sisaBulan('2026-11-30', NOW)).toBe(1);
    expect(sisaBulan('2026-01-01', NOW)).toBe(1);
    expect(sisaBulan(null, NOW)).toBe(12);
  });
});

describe('sesuaikanRincian', () => {
  const r = hitungAlokasi(base);

  it('Keinginan menyerap selisih perubahan', () => {
    const s = sesuaikanRincian(r, { investasi: 2000000 });
    expect(nominal(s)).toEqual({ wajib: 9019000, dana_darurat: 696000, investasi: 2000000, keinginan: 785000 });
    expect(jumlah(s)).toBe(12500000);
  });

  it('tanpa perubahan hasilnya sama', () => {
    expect(sesuaikanRincian(r, {})).toEqual(r);
  });

  it('menolak total yang melebihi Gaji', () => {
    expect(() => sesuaikanRincian(r, { investasi: 5000000 })).toThrow(/melebihi/);
  });

  it('menolak pos Keinginan, pos tak dikenal, dan nominal tidak valid', () => {
    expect(() => sesuaikanRincian(r, { keinginan: 1 })).toThrow();
    expect(() => sesuaikanRincian(r, { liburan: 1 })).toThrow();
    expect(() => sesuaikanRincian(r, { investasi: -1 })).toThrow();
    expect(() => sesuaikanRincian(r, { investasi: 1.5 })).toThrow();
  });

  it('totalKantong menjumlah pos yang masuk Kantong', () => {
    expect(totalKantong(r)).toBe(696000 + 1392000);
  });
});

describe('render', () => {
  const r = hitungAlokasi(base);

  it('renderRencana memuat semua pos dengan angka terformat', () => {
    const t = renderRencana(r, '2026-11-26T02:00:00Z');
    expect(t.split('\n')[0]).toBe('KARTU RENCANA ALOKASI (ditampilkan ke nasabah; semua angka dihitung oleh Aturan Alokasi)');
    expect(t).toContain('Gaji masuk: Rp 12.500.000 pada 26 Nov 2026 09:00 WIB');
    expect(t).toContain('- Pengeluaran Wajib: Rp 9.019.000 (batas belanja)');
    expect(t).toContain('- Dana Darurat: Rp 696.000 (disimpan ke Kantong)');
    expect(t).toContain('- Keinginan: Rp 1.393.000 (batas belanja)');
    expect(renderRencana(JSON.parse(JSON.stringify(r)), '2026-11-26T02:00:00Z')).toBe(t);
  });

  it('renderRencanaDiterapkan merangkum Kantong, batas belanja, dan Saldo Bebas', () => {
    const t = renderRencanaDiterapkan(r, 22000000, '2026-11-26T03:00:00Z');
    expect(t).toBe(
      [
        'Rencana Alokasi diterapkan pada 26 Nov 2026 10:00 WIB.',
        'Masuk Kantong: Dana Darurat Rp 696.000, Investasi Rp 1.392.000.',
        'Batas belanja: Pengeluaran Wajib Rp 9.019.000, Keinginan Rp 1.393.000.',
        'Saldo Bebas sekarang Rp 22.000.000.'
      ].join('\n')
    );
  });
});
