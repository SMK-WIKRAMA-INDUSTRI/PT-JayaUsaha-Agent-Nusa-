// Kategori Belanja (CONTEXT.md). Urutan objek = urutan tampilan.
// Kebutuhan: Makan, Transportasi, Tagihan. Keinginan: Jajan, Belanja, Hiburan, Lainnya.
export const KATEGORI_BELANJA = {
  makan: { label: 'Makan', kelompok: 'kebutuhan' },
  jajan: { label: 'Jajan', kelompok: 'keinginan' },
  belanja: { label: 'Belanja', kelompok: 'keinginan' },
  transportasi: { label: 'Transportasi', kelompok: 'kebutuhan' },
  tagihan: { label: 'Tagihan', kelompok: 'kebutuhan' },
  hiburan: { label: 'Hiburan', kelompok: 'keinginan' },
  lainnya: { label: 'Lainnya', kelompok: 'keinginan' }
};

export const DAFTAR_KATEGORI = Object.keys(KATEGORI_BELANJA);

export const labelKategori = (k) => (KATEGORI_BELANJA[k] ? KATEGORI_BELANJA[k].label : 'Lainnya');
