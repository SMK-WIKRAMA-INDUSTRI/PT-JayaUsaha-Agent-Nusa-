import { describe, expect, it } from 'vitest';
import { buildSnapshot, renderSnapshot } from '../lib/snapshot';
import { snapshotInput } from './fixtures';

describe('buildSnapshot', () => {
  const s = buildSnapshot(snapshotInput);

  it('menghitung saldo dan Pengeluaran Bulanan', () => {
    expect(s.rekening).toEqual({ nomor_akhir: '4821', saldo_total: 9500000 });
    expect(s.pengeluaran_bulanan).toBe(1000000);
    expect(s.pengeluaran_bulanan_sumber).toBe('hitungan_transaksi');
  });

  it('Dana Darurat di urutan pertama dengan target turunan', () => {
    expect(s.goals[0]).toEqual({ nama: 'Dana Darurat', target: 6000000, tenggat: null, dana_darurat: true });
    expect(s.goals[1]).toEqual({ nama: 'Liburan Bali', target: 8000000, tenggat: '2027-06-01', dana_darurat: false });
  });

  it('transaksi terbaru di urutan pertama', () => {
    expect(s.transaksi_terakhir[0].pihak).toBe('Transfer ke Rina Wijaya');
  });

  it('memakai koreksi Nasabah bila ada', () => {
    const k = buildSnapshot({ ...snapshotInput, profile: { ...snapshotInput.profile, pengeluaran_bulanan_koreksi: 2000000 } });
    expect(k.pengeluaran_bulanan).toBe(2000000);
    expect(k.pengeluaran_bulanan_sumber).toBe('koreksi_nasabah');
    expect(k.goals[0].target).toBe(12000000);
  });
});

describe('renderSnapshot', () => {
  const s = buildSnapshot(snapshotInput);
  const text = renderSnapshot(s);

  it('memuat data penting dalam teks', () => {
    expect(text).toContain('DATA KEUANGAN NASABAH (dibekukan 24 Nov 2026 14:12 WIB)');
    expect(text).toContain('Nama nasabah: Dimas');
    expect(text).toContain('Profil Risiko: belum diisi');
    expect(text).toContain('Saldo Total: Rp 9.500.000');
    expect(text).toContain('Pengeluaran Bulanan: Rp 1.000.000 (dihitung dari transaksi 3 bulan terakhir)');
    expect(text).toContain('- Dana Darurat: target Rp 6.000.000');
    expect(text).toContain('- Liburan Bali: target Rp 8.000.000, tenggat 1 Jun 2027');
    expect(text).toContain('- 23 Nov 2026 13:00 WIB | Transfer ke Rina Wijaya | keluar Rp 500.000 | status: gagal (dana dikembalikan) | kanal: BI-FAST');
  });

  it('tidak bergantung pada urutan key (jsonb tidak menjaga urutan key)', () => {
    const reversed = Object.fromEntries(Object.entries(s).reverse());
    expect(renderSnapshot(reversed)).toBe(text);
  });

  it('dua kali render hasilnya identik', () => {
    expect(renderSnapshot(JSON.parse(JSON.stringify(s)))).toBe(text);
  });
});
