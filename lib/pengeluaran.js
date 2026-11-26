// Catatan Pengeluaran (spec 5.5, ADR 0006, 0007): validasi argumen tool dan teks kartu serta pembaruan.
import { fmtWaktu, rp } from './format';
import { KATEGORI_BELANJA, labelKategori } from './kategori';
import { nominalDisebut } from './nominal';

const MAKS_NOMINAL = 100000000;
const MAKS_BARANG = 60;

const kapital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// argsJson: string argumen dari model. pesan: pesan Nasabah terakhir (nominal harus disebut di sini).
export function periksaPengeluaran(argsJson, pesan) {
  let a;
  try {
    a = JSON.parse(argsJson || '{}');
  } catch {
    return { ok: false, alasan: 'data_kurang' };
  }
  if (!a || typeof a !== 'object') return { ok: false, alasan: 'data_kurang' };
  const barang = String(a.barang ?? '').replace(/\s+/g, ' ').trim().slice(0, MAKS_BARANG);
  const nominal = typeof a.nominal === 'string' && /^\d+$/.test(a.nominal.trim()) ? Number(a.nominal.trim()) : a.nominal;
  if (!barang || !Number.isSafeInteger(nominal) || nominal <= 0 || nominal > MAKS_NOMINAL) return { ok: false, alasan: 'data_kurang' };
  if (!nominalDisebut(pesan, nominal)) return { ok: false, alasan: 'nominal_tidak_disebut' };
  const kategori = Object.hasOwn(KATEGORI_BELANJA, a.kategori) ? a.kategori : 'lainnya';
  return { ok: true, data: { barang: kapital(barang), nominal, kategori } };
}

export const judulPengeluaran = (d) => `${rp(d.nominal)} – ${d.barang} (${labelKategori(d.kategori)})`;

export function renderKartuPengeluaran(d) {
  return [
    'KARTU CATATAN PENGELUARAN',
    `Catat ${judulPengeluaran(d)}?`,
    'Belum tercatat. Nasabah bisa menekan Catat atau menjawab "ya" untuk mencatatnya, atau menekan Batal.'
  ].join('\n');
}

export function renderPengeluaranDicatat(d, saldoBebas, waktu) {
  const saldo = saldoBebas === null || saldoBebas === undefined ? '' : ` Saldo Bebas sekarang ${rp(saldoBebas)}.`;
  return `Catatan Pengeluaran dicatat (${fmtWaktu(waktu)}): ${judulPengeluaran(d)}.${saldo}`;
}

const SEBAB = {
  nasabah: 'karena ditolak nasabah',
  topik_lain: 'karena nasabah membahas hal lain',
  kedaluwarsa: 'karena tidak dikonfirmasi dalam 30 menit',
  saldo_kurang: 'karena Saldo Bebas tidak cukup'
};

export function renderPengeluaranBatal(d, sebab, waktu) {
  return `Catatan Pengeluaran ${judulPengeluaran(d)} dibatalkan (${fmtWaktu(waktu)}) ${SEBAB[sebab] || ''}. Belum ada yang tercatat.`.replace(' .', '.');
}
