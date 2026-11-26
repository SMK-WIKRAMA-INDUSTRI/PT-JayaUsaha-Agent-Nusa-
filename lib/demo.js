// Data untuk tombol Panel Demo (spec 5.8). Fungsi murni: rand bisa diganti di test.

const MERCHANT = [
  { pihak: 'Kopi Senja', kategori_belanja: 'jajan', min: 18000, max: 55000 },
  { pihak: 'Martabak Bang Udin', kategori_belanja: 'jajan', min: 25000, max: 70000 },
  { pihak: 'Warung Makan Sederhana', kategori_belanja: 'makan', min: 15000, max: 45000 },
  { pihak: 'Ojek Online', kategori_belanja: 'transportasi', min: 12000, max: 60000 },
  { pihak: 'Minimarket Nusa', kategori_belanja: 'belanja', min: 20000, max: 150000 },
  { pihak: 'Bioskop Cinema Nusa', kategori_belanja: 'hiburan', min: 40000, max: 120000 }
];

// Satu Transaksi QRIS keluar dengan Kategori Belanja dan nominal acak yang wajar.
export function belanjaAcak(rand = Math.random) {
  const m = MERCHANT[Math.min(MERCHANT.length - 1, Math.floor(rand() * MERCHANT.length))];
  const nominal = Math.max(500, Math.round((m.min + rand() * (m.max - m.min)) / 500) * 500);
  return { pihak: m.pihak, kategori_belanja: m.kategori_belanja, nominal };
}

const BOROS = [
  { pihak: 'Toko Online Sepatu Lari', kategori_belanja: 'belanja', bobot: 35 },
  { pihak: 'Tiket Konser Musik', kategori_belanja: 'hiburan', bobot: 25 },
  { pihak: 'Kafe Kekinian', kategori_belanja: 'jajan', bobot: 15 },
  { pihak: 'Gadget Store', kategori_belanja: 'belanja', bobot: 25 }
];
const MIN_BOROS = 200000;

// Beberapa Transaksi Keinginan yang membuat total belanja 20% di atas batas pro-rata (Status Belanja Boros).
// ringkasan: hasil hitungRingkasan sebelum skenario.
export function skenarioBoros(ringkasan) {
  const target = Math.ceil((ringkasan.batas_prorata * 1.2 - ringkasan.total) / 1000) * 1000;
  const perlu = Math.max(MIN_BOROS, target);
  let terpakai = 0;
  return BOROS.map((b, i) => {
    const nominal = i === BOROS.length - 1 ? perlu - terpakai : Math.floor((perlu * b.bobot) / 100 / 1000) * 1000;
    terpakai += nominal;
    return { pihak: b.pihak, kategori_belanja: b.kategori_belanja, nominal };
  });
}
