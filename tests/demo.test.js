import { describe, expect, it } from 'vitest';
import { belanjaAcak, skenarioBoros } from '../lib/demo';
import { hitungRingkasan } from '../lib/ringkasan';
import { DAFTAR_KATEGORI } from '../lib/kategori';

const urutan = (vals) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('belanjaAcak', () => {
  it('menghasilkan satu belanja wajar dengan kategori valid dan kelipatan 500', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const b = belanjaAcak(urutan([r, r]));
      expect(DAFTAR_KATEGORI).toContain(b.kategori_belanja);
      expect(b.nominal % 500).toBe(0);
      expect(b.nominal).toBeGreaterThan(0);
      expect(b.pihak).toBeTruthy();
    }
  });
});

describe('skenarioBoros', () => {
  const NOW = new Date('2026-11-15T05:00:00Z');
  it.each([0, 600000, 2000000])('total awal %i -> setelah skenario Status Belanja Boros', (awal) => {
    const sebelum = hitungRingkasan({
      transaksi: awal ? [{ waktu: '2026-11-02T05:00:00Z', arah: 'keluar', nominal: awal, status: 'berhasil', kategori_belanja: 'makan' }] : [],
      batasBelanja: 3000000,
      sumberBatas: 'rencana',
      now: NOW
    });
    const daftar = skenarioBoros(sebelum);
    expect(daftar).toHaveLength(4);
    for (const x of daftar) {
      expect(x.nominal).toBeGreaterThan(0);
      expect(x.nominal % 1000).toBe(0);
      expect(['jajan', 'belanja', 'hiburan']).toContain(x.kategori_belanja);
    }
    const tambahan = daftar.reduce((a, x) => a + x.nominal, 0);
    expect(sebelum.total + tambahan).toBeGreaterThan(sebelum.batas_prorata);
    expect(tambahan).toBeGreaterThanOrEqual(200000);
  });
});
