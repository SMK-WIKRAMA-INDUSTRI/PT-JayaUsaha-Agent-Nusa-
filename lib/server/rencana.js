import { hitungAlokasi } from '../alokasi';
import { rp } from '../format';
import { pengeluaranBulanan, targetDanaDarurat } from '../keuangan';
import { muatKeuangan } from './nasabah';

// Gaji masuk -> Rencana Alokasi (status diusulkan) + Notifikasi Gajian (spec 5.2). tx: { id, nominal, waktu }.
export async function buatRencanaGaji(admin, userId, tx) {
  const d = await muatKeuangan(admin, userId);
  const { data: rules, error: rErr } = await admin
    .from('allocation_rules')
    .select('persen_dana_darurat, persen_sosial, persen_investasi')
    .eq('user_id', userId)
    .single();
  if (rErr) throw new Error(rErr.message);

  const now = new Date(tx.waktu);
  const pb = pengeluaranBulanan(d.transactions, d.profile.pengeluaran_bulanan_koreksi, now);
  const isi = (pred) => d.kantong.filter(pred).reduce((a, k) => a + k.saldo, 0);
  const dd = d.goals.find((g) => g.is_dana_darurat);
  const rincian = hitungAlokasi({
    gaji: Number(tx.nominal),
    pengeluaranBulanan: pb,
    danaDarurat: dd ? { target: targetDanaDarurat(pb, dd.kelipatan_target), terkumpul: isi((k) => k.jenis === 'dana_darurat') } : null,
    goals: d.goals
      .filter((g) => !g.is_dana_darurat)
      .map((g) => ({ id: g.id, nama: g.nama, target: Number(g.target), tenggat: g.tenggat, terkumpul: isi((k) => k.goal_id === g.id) })),
    rules,
    now
  });

  const { data: plan, error: pErr } = await admin
    .from('allocation_plans')
    .insert({ user_id: userId, transaction_id: tx.id, rincian })
    .select('id, status, rincian, kedaluwarsa_at')
    .single();
  if (pErr) throw new Error(pErr.message);

  const { error: nErr } = await admin.from('notifications').insert({
    user_id: userId,
    jenis: 'gajian',
    ref_id: plan.id,
    isi: `Gaji ${rp(tx.nominal)} sudah masuk. Yuk atur pembagiannya bersama Agent Nusa.`
  });
  if (nErr) {
    // Rencana tanpa notifikasi tidak bisa dibuka dari UI.
    await admin.from('allocation_plans').delete().eq('id', plan.id);
    throw new Error(nErr.message);
  }
  return plan;
}

// Rencana yang tidak disentuh 7 hari menjadi diabaikan (dicek setiap kali Rencana dibaca atau diputuskan).
export async function kedaluwarsakanRencana(admin, userId) {
  const now = new Date().toISOString();
  await admin
    .from('allocation_plans')
    .update({ status: 'diabaikan', diputuskan_at: now })
    .eq('user_id', userId)
    .eq('status', 'diusulkan')
    .lt('kedaluwarsa_at', now);
}

// Menambahkan pesan pembaruan ke sesi yang membawa kartu Rencana ini (jika ada), di akhir riwayat.
export async function tambahPembaruanRencana(admin, userId, planId, content) {
  const { data: s } = await admin.from('chat_sessions').select('id').eq('plan_id', planId).eq('user_id', userId).maybeSingle();
  if (!s) return;
  await admin.from('chat_messages').insert({ session_id: s.id, user_id: userId, role: 'pembaruan', content });
  await admin.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
}
