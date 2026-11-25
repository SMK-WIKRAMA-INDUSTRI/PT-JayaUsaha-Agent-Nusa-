// Format angka dan waktu yang deterministik: hasil server, browser, dan prompt selalu sama.
// Jangan memakai toLocaleString: hasilnya bisa berbeda antar mesin dan merusak prefix cache.

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const WIB_MS = 7 * 60 * 60 * 1000;
const dua = (n) => String(n).padStart(2, '0');

export const rp = (n) => 'Rp ' + String(Number(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// '2026-11-24T07:12:00Z' -> '24 Nov 2026 14:12 WIB'
export function fmtWaktu(iso) {
  const d = new Date(new Date(iso).getTime() + WIB_MS);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} ${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())} WIB`;
}

// '2027-06-01' -> '1 Jun 2027'
export function fmtTanggal(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}
