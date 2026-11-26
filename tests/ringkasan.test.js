import { describe, expect, it } from 'vitest';
import { awalBulanWib, hitungRingkasan, renderRingkasan } from '../lib/ringkasan';

const t = (waktu, nominal, kategori_belanja, extra = {}) => ({ waktu, arah: 'keluar', nominal, status: 'berhasil', kategori_belanja, ...extra });
// 15 Nov 2026 12:00 WIB, bulan 30 hari -> hari ke-15, pro-rata = batas / 2
const NOW = new Date('2026-11-15T05:00:00Z');

describe('hitungRingkasan', () => {
  it('tanpa belanja: total 0 dan Hemat', () => {
    const r = hitungRingkasan({ transaksi: [], batasBelanja: 3000000, sumberBatas: 'rencana', now: NOW });
    expect(r).toMatchObject({ bulan: 'November 2026', hari_berjalan: 15, jumlah_hari: 30, batas: 3000000, batas_prorata: 1500000, total: 0, status: 'hemat', keinginan_terbesar: null });
    expect(r.per_kategori).toEqual([]);
  });

  it('batas status: 80% Hemat, 100% Aman, di atasnya Boros', () => {
    const run = (n) => hitungRingkasan({ transaksi: [t('2026-11-10T05:00:00Z', n, 'jajan')], batasBelanja: 3000000, sumberBatas: 'rencana', now: NOW }).status;
    expect(run(1200000)).toBe('hemat');
    expect(run(1200001)).toBe('aman');
    expect(run(1500000)).toBe('aman');
    expect(run(1500001)).toBe('boros');
  });

  it('hanya menghitung keluar, berhasil, berkategori, dan di bulan WIB berjalan', () => {
    const r = hitungRingkasan({
      transaksi: [
        t('2026-11-10T05:00:00Z', 100000, 'makan'),
        t('2026-11-10T05:00:00Z', 50000, null),
        t('2026-11-10T05:00:00Z', 70000, 'jajan', { status: 'gagal' }),
        t('2026-11-10T05:00:00Z', 90000, 'jajan', { arah: 'masuk' }),
        t('2026-10-31T16:59:00Z', 40000, 'jajan'), // 31 Okt 23:59 WIB: bulan lalu
        t('2026-10-31T17:00:00Z', 30000, 'jajan') // 1 Nov 00:00 WIB: bulan ini
      ],
      batasBelanja: 3000000,
      sumberBatas: 'rencana',
      now: NOW
    });
    expect(r.total).toBe(130000);
    expect(r.total_kebutuhan).toBe(100000);
    expect(r.total_keinginan).toBe(30000);
  });

  it('per kategori urut terbesar dan Keinginan terbesar', () => {
    const r = hitungRingkasan({
      transaksi: [t('2026-11-02T05:00:00Z', 500000, 'tagihan'), t('2026-11-03T05:00:00Z', 80000, 'jajan'), t('2026-11-04T05:00:00Z', 120000, 'hiburan'), t('2026-11-05T05:00:00Z', 20000, 'jajan')],
      batasBelanja: 3000000,
      sumberBatas: 'pengeluaran_bulanan',
      now: NOW
    });
    expect(r.per_kategori.map((k) => [k.kategori, k.total])).toEqual([['tagihan', 500000], ['hiburan', 120000], ['jajan', 100000]]);
    expect(r.keinginan_terbesar).toEqual({ kategori: 'hiburan', label: 'Hiburan', total: 120000 });
  });

  it('sisa per hari dibulatkan ke bawah ke ribuan', () => {
    const r = hitungRingkasan({ transaksi: [t('2026-11-02T05:00:00Z', 1000000, 'makan')], batasBelanja: 3000000, sumberBatas: 'rencana', now: NOW });
    expect(r.sisa_hari).toBe(16);
    expect(r.sisa_batas).toBe(2000000);
    expect(r.sisa_per_hari).toBe(125000);
  });

  it('hari pertama dan hari terakhir bulan, termasuk Februari', () => {
    const awal = hitungRingkasan({ transaksi: [], batasBelanja: 2800000, sumberBatas: 'rencana', now: new Date('2027-01-31T17:30:00Z') }); // 1 Feb 00:30 WIB
    expect(awal).toMatchObject({ bulan: 'Februari 2027', hari_berjalan: 1, jumlah_hari: 28, batas_prorata: 100000, sisa_hari: 28 });
    const akhir = hitungRingkasan({ transaksi: [], batasBelanja: 2800000, sumberBatas: 'rencana', now: new Date('2027-02-28T16:00:00Z') }); // 28 Feb 23:00 WIB
    expect(akhir).toMatchObject({ hari_berjalan: 28, batas_prorata: 2800000, sisa_hari: 1 });
  });

  it('batas 0: Boros jika ada belanja', () => {
    expect(hitungRingkasan({ transaksi: [t('2026-11-02T05:00:00Z', 1000, 'jajan')], batasBelanja: 0, sumberBatas: 'rencana', now: NOW }).status).toBe('boros');
  });

  it('awalBulanWib', () => {
    expect(awalBulanWib(NOW).toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });
});

describe('renderRingkasan', () => {
  it('teks kartu deterministik', () => {
    const r = hitungRingkasan({
      transaksi: [t('2026-11-02T05:00:00Z', 500000, 'tagihan'), t('2026-11-03T05:00:00Z', 1500000, 'jajan')],
      batasBelanja: 3000000,
      sumberBatas: 'rencana',
      now: NOW
    });
    expect(renderRingkasan(r)).toBe(
      [
        'KARTU RINGKASAN BULANAN (dibuat 15 Nov 2026 12:00 WIB)',
        'Bulan: November 2026, hari ke-15 dari 30',
        'Total belanja: Rp 2.000.000 (Kebutuhan Rp 500.000, Keinginan Rp 1.500.000)',
        'Batas Belanja bulan ini: Rp 3.000.000 (dari Rencana Alokasi terakhir yang diterapkan)',
        'Batas sampai hari ini (pro-rata): Rp 1.500.000',
        'Pemakaian: 133% dari batas sampai hari ini',
        'Status Belanja: Boros',
        'Per kategori:',
        '- Jajan (Keinginan): Rp 1.500.000',
        '- Tagihan (Kebutuhan): Rp 500.000',
        'Keinginan terbesar: Jajan Rp 1.500.000',
        'Sisa Batas Belanja: Rp 1.000.000 untuk 16 hari lagi (sekitar Rp 62.000 per hari)'
      ].join('\n')
    );
  });
});
