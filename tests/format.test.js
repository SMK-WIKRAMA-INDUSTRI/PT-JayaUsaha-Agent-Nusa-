import { describe, expect, it } from 'vitest';
import { fmtTanggal, fmtWaktu, rp } from '../lib/format';

describe('rp', () => {
  it('memberi titik ribuan', () => {
    expect(rp(24380500)).toBe('Rp 24.380.500');
    expect(rp(0)).toBe('Rp 0');
  });
  it('menerima string angka dari database', () => {
    expect(rp('1500000')).toBe('Rp 1.500.000');
  });
});

describe('fmtWaktu', () => {
  it('mengubah UTC ke WIB', () => {
    expect(fmtWaktu('2026-11-24T07:12:00Z')).toBe('24 Nov 2026 14:12 WIB');
  });
  it('berganti hari setelah tengah malam WIB', () => {
    expect(fmtWaktu('2026-11-24T17:30:00+00:00')).toBe('25 Nov 2026 00:30 WIB');
  });
});

describe('fmtTanggal', () => {
  it('memformat tanggal tanpa jam', () => {
    expect(fmtTanggal('2027-06-01')).toBe('1 Jun 2027');
  });
});
