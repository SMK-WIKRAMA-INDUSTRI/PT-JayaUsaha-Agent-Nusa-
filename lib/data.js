export { rp } from './format';

// Pengaturan yang masih disimpan di browser: key Deepgram (suara) dan draf catatan lampiran.
export const DEFAULTS = {
  deepgramKey: '',
  contextText: ''
};

// Batas panjang satu lampiran (catatan teks atau isi PDF). Lebih dari ini, bagian akhirnya dipotong server.
export const MAX_CONTEXT = 60000;

export function normalizeSettings(d) {
  return {
    deepgramKey: String(d.deepgramKey || '').trim(),
    contextText: String(d.contextText || '').trim()
  };
}

export const CHIPS = [
  ['Catat jajan', 'Tadi aku jajan bakso 25 ribu.'],
  ['Belanja bulan ini', 'Pengeluaranku bulan ini gimana?'],
  ['Cek status transfer', 'Transfer saya ke Rina kemarin belum masuk, tolong dicek.'],
  ['Biaya transfer', 'Berapa biaya dan limit transfer BI-FAST?']
];
