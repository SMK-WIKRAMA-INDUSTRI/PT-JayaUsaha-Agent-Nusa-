import { SYSTEM_PROMPT_VERSION } from '../prompt';
import { buildSnapshot } from '../snapshot';
import { muatKeuangan } from './nasabah';

// Membekukan Snapshot Keuangan saat ini lalu membuat Sesi Percakapan baru (ADR 0003).
// admin: klien service role. userId harus berasal dari getUser(), bukan dari input browser.
export async function buatSesi(admin, userId, { dimulaiOleh = 'nasabah', planId = null, now = new Date() } = {}) {
  const d = await muatKeuangan(admin, userId);
  const snapshot = buildSnapshot({
    profile: d.profile,
    account: d.account,
    transactions: d.transactions,
    goals: d.goals,
    kantong: d.kantong.map(({ nama, jenis, saldo }) => ({ nama, jenis, saldo })),
    now
  });
  const { data, error } = await admin
    .from('chat_sessions')
    .insert({ user_id: userId, snapshot, system_prompt_version: SYSTEM_PROMPT_VERSION, dimulai_oleh: dimulaiOleh, plan_id: planId })
    .select('id, created_at, updated_at, dimulai_oleh')
    .single();
  if (error) throw new Error(error.message);
  return data;
}
