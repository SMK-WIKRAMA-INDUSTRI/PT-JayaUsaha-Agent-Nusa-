import { describe, expect, it } from 'vitest';
import { judulPengeluaran, periksaPengeluaran, renderKartuPengeluaran, renderPengeluaranBatal, renderPengeluaranDicatat } from '../lib/pengeluaran';

const args = (o) => JSON.stringify(o);

describe('periksaPengeluaran', () => {
  it('lolos jika nominal disebut nasabah', () => {
    expect(periksaPengeluaran(args({ barang: 'bakso', nominal: 25000, kategori: 'jajan' }), 'tadi jajan bakso 25 ribu')).toEqual({
      ok: true,
      data: { barang: 'Bakso', nominal: 25000, kategori: 'jajan' }
    });
  });
  it('nominal tidak disebut', () => {
    expect(periksaPengeluaran(args({ barang: 'bakso', nominal: 25000, kategori: 'jajan' }), 'tadi jajan bakso')).toEqual({ ok: false, alasan: 'nominal_tidak_disebut' });
  });
  it('kategori tidak dikenal menjadi lainnya', () => {
    expect(periksaPengeluaran(args({ barang: 'pulsa', nominal: 50000, kategori: 'pulsa' }), 'beli pulsa 50rb').data.kategori).toBe('lainnya');
  });
  it('argumen rusak, barang kosong, dan nominal tidak valid', () => {
    expect(periksaPengeluaran('{rusak', 'x')).toEqual({ ok: false, alasan: 'data_kurang' });
    expect(periksaPengeluaran(args({ barang: ' ', nominal: 25000, kategori: 'jajan' }), '25 ribu')).toEqual({ ok: false, alasan: 'data_kurang' });
    expect(periksaPengeluaran(args({ barang: 'x', nominal: 0, kategori: 'jajan' }), '0')).toEqual({ ok: false, alasan: 'data_kurang' });
    expect(periksaPengeluaran(args({ barang: 'x', nominal: 2.5, kategori: 'jajan' }), '2,5')).toEqual({ ok: false, alasan: 'data_kurang' });
  });
  it('nominal sebagai string angka diterima', () => {
    expect(periksaPengeluaran(args({ barang: 'kopi', nominal: '18000', kategori: 'jajan' }), 'kopi 18rb').ok).toBe(true);
  });
});

describe('teks', () => {
  const d = { barang: 'Bakso', nominal: 25000, kategori: 'jajan' };
  it('judul dan kartu', () => {
    expect(judulPengeluaran(d)).toBe('Rp 25.000 – Bakso (Jajan)');
    expect(renderKartuPengeluaran(d)).toBe(
      'KARTU CATATAN PENGELUARAN\nCatat Rp 25.000 – Bakso (Jajan)?\nBelum tercatat. Nasabah bisa menekan Catat atau menjawab "ya" untuk mencatatnya, atau menekan Batal.'
    );
  });
  it('pembaruan', () => {
    expect(renderPengeluaranDicatat(d, 9975000, '2026-11-24T07:12:00Z')).toBe(
      'Catatan Pengeluaran dicatat (24 Nov 2026 14:12 WIB): Rp 25.000 – Bakso (Jajan). Saldo Bebas sekarang Rp 9.975.000.'
    );
    expect(renderPengeluaranDicatat(d, null, '2026-11-24T07:12:00Z')).toBe('Catatan Pengeluaran dicatat (24 Nov 2026 14:12 WIB): Rp 25.000 – Bakso (Jajan).');
    expect(renderPengeluaranBatal(d, 'topik_lain', '2026-11-24T07:12:00Z')).toBe(
      'Catatan Pengeluaran Rp 25.000 – Bakso (Jajan) dibatalkan (24 Nov 2026 14:12 WIB) karena nasabah membahas hal lain. Belum ada yang tercatat.'
    );
  });
});
