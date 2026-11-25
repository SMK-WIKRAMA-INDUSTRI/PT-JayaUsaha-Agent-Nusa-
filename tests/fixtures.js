// Data contoh yang dipakai beberapa test.
export const NOW = new Date('2026-11-24T07:12:00Z');

export const snapshotInput = {
  profile: { nama_panggilan: 'Dimas', pekerjaan: 'Desainer', tanggal_gajian: 25, profil_risiko: null, pengeluaran_bulanan_koreksi: null },
  account: { nomor_akhir: '4821' },
  transactions: [
    { waktu: '2026-10-25T01:00:00+00:00', arah: 'masuk', nominal: 12500000, pihak: 'Gaji PT Nusantara Digital', kanal: 'Kredit', status: 'berhasil', catatan: null },
    { waktu: '2026-10-02T02:00:00+00:00', arah: 'keluar', nominal: 3000000, pihak: 'Sewa kos', kanal: 'BI-FAST', status: 'berhasil', catatan: null },
    { waktu: '2026-11-23T06:00:00+00:00', arah: 'keluar', nominal: 500000, pihak: 'Transfer ke Rina Wijaya', kanal: 'BI-FAST', status: 'gagal', catatan: 'dana dikembalikan' }
  ],
  goals: [
    { nama: 'Liburan Bali', target: 8000000, tenggat: '2027-06-01', is_dana_darurat: false, kelipatan_target: null, created_at: '2026-11-24T07:00:00Z' },
    { nama: 'Dana Darurat', target: null, tenggat: null, is_dana_darurat: true, kelipatan_target: 6, created_at: '2026-11-24T06:00:00Z' }
  ],
  now: NOW
};
