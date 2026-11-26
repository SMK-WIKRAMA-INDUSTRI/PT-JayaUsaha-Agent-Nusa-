import { pengeluaranBulanan } from '../keuangan';
import { hitungRingkasan } from '../ringkasan';
import { muatKeuangan } from './nasabah';

// Ringkasan Bulanan satu Nasabah (spec 5.6). Batas Belanja = Pengeluaran Wajib + Keinginan dari Rencana terakhir
// yang diterapkan, atau Pengeluaran Bulanan jika belum ada (CONTEXT.md: Batas Belanja).
export async function muatRingkasan(admin, userId, now = new Date()) {
  const [d, { data: plan, error }] = await Promise.all([
    muatKeuangan(admin, userId),
    admin
      .from('allocation_plans')
      .select('rincian')
      .eq('user_id', userId)
      .eq('status', 'diterapkan')
      .order('diputuskan_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);
  if (error) throw new Error(error.message);
  let batasBelanja;
  let sumberBatas;
  if (plan) {
    batasBelanja = plan.rincian.pos.filter((p) => p.kunci === 'wajib' || p.kunci === 'keinginan').reduce((a, p) => a + Number(p.nominal), 0);
    sumberBatas = 'rencana';
  } else {
    batasBelanja = pengeluaranBulanan(d.transactions, d.profile.pengeluaran_bulanan_koreksi, now);
    sumberBatas = 'pengeluaran_bulanan';
  }
  return hitungRingkasan({ transaksi: d.transactions, batasBelanja, sumberBatas, now });
}
