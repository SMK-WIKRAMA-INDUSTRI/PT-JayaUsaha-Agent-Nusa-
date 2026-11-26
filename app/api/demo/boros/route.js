import { getUser } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { skenarioBoros } from '../../../../lib/demo';
import { rp } from '../../../../lib/format';
import { fail, failDb } from '../../../../lib/server/http';
import { ingestTransaksi } from '../../../../lib/server/ingest';
import { muatRingkasan } from '../../../../lib/server/ringkasan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Panel Demo: beberapa Transaksi Keinginan sekaligus sehingga Status Belanja menjadi Boros (spec 5.8).
export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const admin = createAdminClient();
  try {
    const daftar = skenarioBoros(await muatRingkasan(admin, user.id));
    const total = daftar.reduce((a, x) => a + x.nominal, 0);
    const { data: saldo } = await admin.from('v_saldo_bebas').select('saldo_bebas').eq('user_id', user.id).maybeSingle();
    if (!saldo || Number(saldo.saldo_bebas) < total) return fail(409, `Saldo Bebas tidak cukup untuk Skenario boros (butuh ${rp(total)}).`);
    for (const x of daftar) {
      await ingestTransaksi(admin, user.id, { arah: 'keluar', nominal: x.nominal, kategori: 'qris', pihak: x.pihak, kanal: 'QRIS', kategori_belanja: x.kategori_belanja });
    }
    return Response.json({ jumlah: daftar.length, total });
  } catch (e) {
    return failDb(e);
  }
}
