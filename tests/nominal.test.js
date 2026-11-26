import { describe, expect, it } from 'vitest';
import { cariNominal, nominalDisebut } from '../lib/nominal';

describe('cariNominal', () => {
  it.each([
    ['tadi jajan bakso 25 ribu', 25000],
    ['bakso 25rb', 25000],
    ['kopi 25k', 25000],
    ['bayar Rp25.000 tadi', 25000],
    ['bayar Rp 25.000,00', 25000],
    ['harganya 25000', 25000],
    ['sepatu 1,5 juta', 1500000],
    ['sepatu 1.5jt', 1500000],
    ['hp 2 juta', 2000000],
    ['laptop 1,25 juta', 1250000],
    ['dua puluh lima ribu', 25000],
    ['seratus lima puluh ribu', 150000],
    ['dua belas ribu lima ratus', 12500],
    ['setengah juta', 500000],
    ['parkir seribu', 1000],
    ['satu juta dua ratus ribu', 1200000],
    ['250 rebu', 250000]
  ])('%s -> %i', (teks, n) => {
    expect(cariNominal(teks)).toContain(n);
  });

  it('menggabungkan "1 juta 200 ribu"', () => {
    expect(cariNominal('belanja 1 juta 200 ribu')).toContain(1200000);
  });

  it('tanpa angka -> kosong', () => {
    expect(cariNominal('tadi beli kopi')).toEqual([]);
    expect(cariNominal('')).toEqual([]);
  });

  it('desimal tanpa satuan tidak dihitung', () => {
    expect(cariNominal('nilai 1,5')).toEqual([]);
  });
});

describe('nominalDisebut', () => {
  it('cocok hanya jika angka yang sama ada di ucapan', () => {
    expect(nominalDisebut('tadi beli bakso 25 ribu', 25000)).toBe(true);
    expect(nominalDisebut('tadi beli bakso 25 ribu', 250000)).toBe(false);
    expect(nominalDisebut('tadi beli bakso', 25000)).toBe(false);
    expect(nominalDisebut('bakso 25', 25000)).toBe(false);
  });
});
