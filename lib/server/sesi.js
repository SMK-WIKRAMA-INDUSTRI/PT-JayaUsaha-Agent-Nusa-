import { SYSTEM_PROMPT_VERSION } from '../prompt';
import { buildSnapshot } from '../snapshot';

// Membekukan Snapshot Keuangan saat ini lalu membuat Sesi Percakapan baru (ADR 0003).
// admin: klien service role. userId harus berasal dari getUser(), bukan dari input browser.
export async function buatSesi(admin, userId, { dimulaiOleh = 'nasabah', now = new Date() } = {}) {
  const [p, a, t, g] = await Promise.all([
    admin.from('profiles').select('nama_panggilan, pekerjaan, tanggal_gajian, profil_risiko, pengeluaran_bulanan_koreksi').eq('user_id', userId).single(),
    admin.from('accounts').select('nomor_akhir').eq('user_id', userId).single(),
    admin.from('transactions').select('waktu, arah, nominal, pihak, kanal, status, catatan').eq('user_id', userId),
    admin.from('goals').select('nama, target, tenggat, is_dana_darurat, kelipatan_target, created_at').eq('user_id', userId)
  ]);
  const failed = [p, a, t, g].find((r) => r.error);
  if (failed) throw new Error(failed.error.message);

  const snapshot = buildSnapshot({ profile: p.data, account: a.data, transactions: t.data, goals: g.data, now });
  const { data, error } = await admin
    .from('chat_sessions')
    .insert({ user_id: userId, snapshot, system_prompt_version: SYSTEM_PROMPT_VERSION, dimulai_oleh: dimulaiOleh })
    .select('id, created_at, updated_at, dimulai_oleh')
    .single();
  if (error) throw new Error(error.message);
  return data;
}
