import { describe, expect, it } from 'vitest';
import { pengeluaranBulanan, pengeluaranBulananOtomatis, saldoTotal, targetDanaDarurat } from '../lib/keuangan';

const now = new Date('2026-11-24T07:00:00Z');
const tx = (waktu, arah, nominal, status = 'berhasil') => ({ waktu, arah, nominal, status });
const data = [
  tx('2026-08-01T00:00:00Z', 'masuk', 13939000), // saldo awal
  tx('2026-08-02T09:00:00Z', 'keluar', 9000000),
  tx('2026-09-10T09:00:00Z', 'keluar', 6000000),
  tx('2026-10-10T09:00:00Z', 'keluar', 3000000),
  tx('2026-10-11T09:00:00Z', 'keluar', 500000, 'gagal'), // gagal: tidak dihitung
  tx('2026-11-02T09:00:00Z', 'keluar', 999999), // bulan berjalan: tidak masuk Pengeluaran Bulanan
  tx('2026-07-30T09:00:00Z', 'keluar', 777777), // 4 bulan lalu: tidak masuk Pengeluaran Bulanan
  tx('2026-10-25T08:00:00Z', 'masuk', 12500000)
];

describe('saldoTotal', () => {
  it('menjumlahkan transaksi berhasil saja', () => {
    // masuk 26.439.000 - keluar berhasil 19.777.776
    expect(saldoTotal(data)).toBe(6661224);
  });
  it('menerima nominal berupa string', () => {
    expect(saldoTotal([tx('2026-10-01T00:00:00Z', 'masuk', '1000')])).toBe(1000);
  });
});

describe('pengeluaranBulananOtomatis', () => {
  it('rata-rata keluar berhasil pada 3 bulan kalender penuh terakhir', () => {
    expect(pengeluaranBulananOtomatis(data, now)).toBe(6000000);
  });
  it('0 bila tidak ada transaksi', () => {
    expect(pengeluaranBulananOtomatis([], now)).toBe(0);
  });
});

describe('pengeluaranBulanan', () => {
  it('memakai koreksi Nasabah bila ada', () => {
    expect(pengeluaranBulanan(data, 4500000, now)).toBe(4500000);
    expect(pengeluaranBulanan(data, 0, now)).toBe(0);
  });
  it('memakai hitungan otomatis bila koreksi kosong', () => {
    expect(pengeluaranBulanan(data, null, now)).toBe(6000000);
    expect(pengeluaranBulanan(data, undefined, now)).toBe(6000000);
  });
});

describe('targetDanaDarurat', () => {
  it('kelipatan dari Pengeluaran Bulanan', () => {
    expect(targetDanaDarurat(6000000, 6)).toBe(36000000);
  });
});
