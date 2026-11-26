// Mengenali nominal rupiah di ucapan Nasabah (spec 5.5, ADR 0006).
// Contoh: "25rb", "25 ribu", "25k", "Rp25.000", "1,5 juta", "1.5jt", "dua puluh lima ribu", "setengah juta".
// cariNominal(teks) -> daftar rupiah (bilangan bulat, unik). nominalDisebut(teks, n) -> boolean.

const SATUAN = { rb: 1e3, ribu: 1e3, rebu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, miliar: 1e9, milyar: 1e9 };
const POLA_ANGKA = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(rb|ribu|rebu|k|jt|juta|miliar|milyar)?(?![a-z0-9])/gi;

// "25.000" -> 25000, "25.000,00" -> 25000, "1,5" -> 1.5, "1.5" (dengan satuan) -> 1.5
function bacaAngka(s, adaSatuan) {
  const m = s.match(/^(.*)[.,](\d{1,2})$/);
  if (m && (adaSatuan || s.lastIndexOf(',') === s.length - m[2].length - 1)) {
    return Number(m[1].replace(/[.,]/g, '') + '.' + m[2]);
  }
  return Number(s.replace(/[.,]/g, ''));
}

function dariDigit(teks) {
  const hasil = [];
  for (const m of teks.matchAll(POLA_ANGKA)) {
    const satuan = m[2] ? SATUAN[m[2].toLowerCase()] : 1;
    const nilai = bacaAngka(m[1], !!m[2]) * satuan;
    if (Number.isFinite(nilai) && Number.isInteger(Math.round(nilai * 100) / 100) && nilai >= 1) {
      hasil.push({ nilai: Math.round(nilai), satuan, awal: m.index, akhir: m.index + m[0].length });
    }
  }
  // "1 juta 200 ribu": dua angka bersatuan berurutan dengan satuan menurun digabung.
  const gabungan = [];
  for (let i = 0; i + 1 < hasil.length; i++) {
    const a = hasil[i];
    const b = hasil[i + 1];
    if (a.satuan > b.satuan && b.satuan > 1 && /^\s*(dan\s*)?$/i.test(teks.slice(a.akhir, b.awal))) gabungan.push(a.nilai + b.nilai);
  }
  return [...hasil.map((h) => h.nilai), ...gabungan];
}

const DIGIT_KATA = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };

function dariKata(teks) {
  const hasil = [];
  const tokens = teks.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  let total = 0;
  let grup = 0;
  let d = 0;
  // Pecahan yang menempel pada angka sebelum satuan: "satu setengah juta" (+0,5), "satu koma lima juta" (+0,5).
  let pecahan = 0;
  // Mode desimal setelah "koma": skala digit berikutnya (0,1 lalu 0,01, ...); 0 = tidak aktif.
  let skalaKoma = 0;
  // Satuan terakhir yang baru dipakai, untuk "dua juta setengah" (= setengah dari satuan itu).
  let satuanTerakhir = 0;
  let ada = false;
  const tutup = () => {
    if (ada) {
      const n = total + grup + d;
      if (n >= 1) hasil.push(n);
    }
    total = 0;
    grup = 0;
    d = 0;
    pecahan = 0;
    skalaKoma = 0;
    satuanTerakhir = 0;
    ada = false;
  };
  const kali = (satuan) => {
    const dasar = grup + d + pecahan || 1;
    total += dasar * satuan;
    grup = 0;
    d = 0;
    pecahan = 0;
    skalaKoma = 0;
    satuanTerakhir = satuan;
  };
  for (const t of tokens) {
    if (skalaKoma && (DIGIT_KATA[t] || t === 'nol')) {
      pecahan += (DIGIT_KATA[t] || 0) * skalaKoma;
      skalaKoma /= 10;
      continue;
    }
    const sesudahSatuan = satuanTerakhir;
    satuanTerakhir = 0;
    if (t === 'koma' && grup + d > 0 && !pecahan) {
      skalaKoma = 0.1;
    } else if (DIGIT_KATA[t]) {
      d = DIGIT_KATA[t];
      ada = true;
    } else if (t === 'sepuluh') {
      grup += 10;
      ada = true;
    } else if (t === 'sebelas') {
      grup += 11;
      ada = true;
    } else if (t === 'seratus') {
      grup += 100;
      ada = true;
    } else if (t === 'belas' && ada) {
      grup += 10 + d;
      d = 0;
    } else if (t === 'puluh' && ada) {
      grup += d * 10;
      d = 0;
    } else if (t === 'ratus' && ada) {
      grup += d * 100;
      d = 0;
    } else if (t === 'setengah') {
      // "dua juta setengah" -> setengah dari satuan sebelumnya; "satu setengah juta" / "setengah juta" -> +0,5 sebelum satuan.
      if (sesudahSatuan && grup + d + pecahan === 0) total += sesudahSatuan / 2;
      else pecahan += 0.5;
      ada = true;
    } else if (t === 'seribu') {
      ada = true;
      kali(1e3);
    } else if (t === 'sejuta') {
      ada = true;
      kali(1e6);
    } else if ((t === 'ribu' || t === 'rebu') && ada) {
      kali(1e3);
    } else if (t === 'juta' && ada) {
      kali(1e6);
    } else {
      tutup();
    }
  }
  tutup();
  return hasil.map((n) => Math.round(n));
}

export function cariNominal(teks) {
  const s = String(teks || '');
  return [...new Set([...dariDigit(s), ...dariKata(s)])];
}

export function nominalDisebut(teks, nominal) {
  return cariNominal(teks).includes(Number(nominal));
}
