import Link from 'next/link';
import PhoneDemo from '../components/PhoneDemo';
import FeatureTabs from '../components/FeatureTabs';
import SafetyFeatures from '../components/SafetyFeatures';
import FraudAlert from '../components/FraudAlert';
import './landing.css';

export const metadata = {
  title: 'Agent Nusa · Asisten Virtual 24 Jam',
  description: 'Agent Nusa membantu soal transfer, tagihan, kartu, dan riwayat transaksi lewat chat.'
};

const TOPICS = ['Status transfer', 'Tagihan dan pembayaran', 'Blokir kartu', 'QRIS', 'Biaya dan limit', 'Komplain', 'Info produk'];

const PLANS = [
  {
    name: 'Gratis',
    price: 'Rp0',
    cadence: 'untuk demo',
    summary: 'Coba pengalaman Agent Nusa sebelum berlangganan.',
    features: ['Chat demo Agent Nusa', 'Contoh bantuan transfer dan kartu', 'Tanpa pembayaran'],
    cta: 'Coba demo'
  },
  {
    name: 'Personal',
    price: 'Rp49.000',
    cadence: '/ bulan',
    summary: 'Untuk kebutuhan layanan nasabah sehari-hari.',
    features: ['Asisten untuk pertanyaan umum', 'Panduan transaksi dan kartu', 'Dukungan melalui chat'],
    cta: 'Lihat demo',
    featured: true
  },
  {
    name: 'Bisnis',
    price: 'Rp149.000',
    cadence: '/ bulan',
    summary: 'Untuk tim yang ingin mengeksplorasi layanan berbantuan AI.',
    features: ['Paket untuk tim layanan', 'Alur bantuan yang dapat disesuaikan', 'Diskusi kebutuhan integrasi'],
    cta: 'Lihat demo'
  }
];

const STEPS = [
  { pose: 'ask', title: 'Tanyakan langsung', text: 'Pilih topik atau tulis masalah Anda, seperti transfer gagal atau kartu hilang.' },
  { pose: 'laptop', title: 'Dapatkan jawaban', text: 'Agent Nusa memeriksa data demo dan memberi langkah atau status yang relevan.' },
  { pose: 'cheer', title: 'Selesaikan masalah', text: 'Urusan dapat beres di chat, atau diteruskan ke agen dengan ringkasan.' }
];

const FAQ = [
  ['Apakah Agent Nusa itu manusia?', 'Bukan. Agent Nusa adalah asisten virtual. Kapan pun Anda butuh orang, tekan tombol "Hubungi agen" di dalam chat.'],
  ['Apakah Agent Nusa akan meminta PIN, password, atau OTP?', 'Tidak pernah. Jangan membagikan PIN, password, CVV, atau kode OTP kepada siapa pun, termasuk kepada Agent Nusa. Verifikasi dilakukan di halaman resmi bank.'],
  ['Apa saja yang bisa ditanyakan?', 'Pembayaran dan tagihan, status transfer, blokir kartu, QRIS, biaya dan limit, komplain, serta informasi produk. Transaksi bernilai besar tetap dilakukan lewat aplikasi atau kanal resmi.'],
  ['Kapan agen manusia bisa dihubungi?', 'Agent Nusa aktif 24 jam. Jam layanan agen manusia: [ISI JAM OPERASIONAL AGEN]. Di luar jam itu, Anda bisa meninggalkan pesan atau membuat tiket komplain.'],
  ['Bagaimana data saya diperlakukan?', 'Data sensitif disamarkan di layar dan log, percakapan dienkripsi, dan pengelolaan data mengikuti kebijakan privasi bank. [ISI TAUTAN KEBIJAKAN PRIVASI]']
];

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const BankMark = () => (
  <span className="lp-logo-mark" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 4l9 5.5" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" />
    </svg>
  </span>
);

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-nav-in">
          <a href="#atas" className="lp-logo"><BankMark />Agent Nusa</a>
          <nav className="lp-links" aria-label="Menu halaman">
            <a href="#fitur">Fitur</a>
            <a href="#harga">Harga</a>
            <a href="#cara">Cara kerja</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link href="/chat" className="lp-btn dark">Coba chatbot</Link>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-hero" id="atas">
        <div className="lp-clouds" aria-hidden="true">
          <span className="lp-cloud c1" />
          <span className="lp-cloud c2" />
          <span className="lp-cloud c3" />
          <span className="lp-cloud c4" />
        </div>

        <div className="lp-hero-in">
          <span className="lp-pill"><i />Asisten virtual aktif 24 jam</span>
          <h1>Urusan bank beres, cukup lewat chat.</h1>
          <p>
            Agent Nusa menjawab soal transfer, tagihan, dan kartu kapan saja. Butuh orang? Tinggal minta agen.
          </p>
          <div className="lp-cta">
            <Link href="/chat" className="lp-btn dark big">Ngobrol dengan Agent Nusa <Arrow /></Link>
            <a href="#cara" className="lp-btn light big">Lihat cara kerja</a>
          </div>
        </div>

        <div className="lp-stage">
          <div className="lp-float f1" aria-hidden="true">
            <span className="lp-float-dot ok" />
            <span><b>Transfer terkirim</b><small>Rp 350.000 · BI-FAST</small></span>
          </div>
          <div className="lp-float f2" aria-hidden="true">
            <span className="lp-float-dot warn" />
            <span><b>Kartu diblokir sementara</b><small>•••• 4821</small></span>
          </div>
          <img className="lp-sticker s1" src="/assets/laptop.png" alt="" />
          <img className="lp-sticker s2" src="/assets/love.png" alt="" />
          <PhoneDemo />
        </div>
      </section>

      {/* TOPIK */}
      <section className="lp-topics" aria-label="Topik yang dibantu Agent Nusa">
        <p>Agent Nusa siap membantu soal</p>
        <div className="lp-topic-row">
          {TOPICS.map((t) => (
            <span key={t} className="lp-topic">{t}</span>
          ))}
        </div>
      </section>

      {/* FITUR TAB */}
      <section className="lp-sec" id="fitur">
        <div className="lp-wrap">
          <h2 className="lp-h2">Dari pertanyaan sampai jawaban</h2>
          <p className="lp-lead">Pilih satu contoh untuk melihat alur percakapannya.</p>
          <FeatureTabs />
        </div>
      </section>

      {/* KARTU */}
      <SafetyFeatures />

      {/* HARGA */}
      <section className="lp-sec lp-pricing" id="harga">
        <div className="lp-wrap">
          <p className="lp-eyebrow">Paket berlangganan</p>
          <h2 className="lp-h2">Pilih paket yang sesuai</h2>
          <p className="lp-lead">Harga per bulan dalam rupiah. Paket masih berupa konsep; pembelian belum tersedia di demo ini.</p>
          <div className="lp-plan-grid">
            {PLANS.map((plan) => (
              <article key={plan.name} className={'lp-plan' + (plan.featured ? ' featured' : '')}>
                {plan.featured && <span className="lp-plan-tag">Pilihan populer</span>}
                <h3>{plan.name}</h3>
                <p className="lp-plan-summary">{plan.summary}</p>
                <p className="lp-plan-price">
                  <strong>{plan.price}</strong>
                  <span>{plan.cadence}</span>
                </p>
                <ul>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <Link href="/chat" className={'lp-btn ' + (plan.featured ? 'dark' : 'light')}>{plan.cta}</Link>
              </article>
            ))}
          </div>
          <p className="lp-pricing-note">Harga dan fitur di atas adalah usulan awal dan dapat berubah sebelum layanan diluncurkan.</p>
        </div>
      </section>

      {/* ROW 1 */}
      <FraudAlert />

      {/* ROW 2 */}
      <section className="lp-sec">
        <div className="lp-wrap lp-row rev">
          <div className="lp-row-art sun">
            <img className="lp-row-mascot bob" src="/assets/coffee.png" alt="Maskot Agent Nusa menunggu sambil minum kopi" />
            <div className="lp-sum-card" aria-hidden="true">
              <b>Ringkasan untuk agen</b>
              <dl>
                <div><dt>Kategori</dt><dd>Transfer gagal</dd></div>
                <div><dt>Nominal</dt><dd>Rp 500.000</dd></div>
                <div><dt>Status</dt><dd>Dana kembali</dd></div>
              </dl>
            </div>
          </div>
          <div className="lp-row-text">
            <h2 className="lp-h2 left">Pindah ke agen tanpa mengulang cerita</h2>
            <p>Saat masalah perlu ditangani orang, Agent Nusa menyerahkan percakapan lengkap dengan ringkasan, kategori, dan nomor tiket.</p>
            <ul className="lp-checks">
              <li>Satu ketukan untuk menghubungi agen</li>
              <li>Ringkasan masalah terkirim otomatis</li>
              <li>Kartu hilang dan dugaan penipuan diprioritaskan</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CARA KERJA */}
      <section className="lp-sec alt" id="cara">
        <div className="lp-wrap">
          <h2 className="lp-h2">Mulai chat dalam tiga langkah</h2>
          <p className="lp-lead">Singkat, langsung, dan bisa diteruskan ke agen kapan diperlukan.</p>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="lp-step">
                <span className="lp-step-no">{i + 1}</span>
                <img src={`/assets/${s.pose}.png`} alt="" />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-sec" id="faq">
        <div className="lp-wrap lp-faq">
          <div>
            <h2 className="lp-h2 left">Pertanyaan yang sering ditanyakan</h2>
            <p className="lp-lead left">Bacaan singkat sebelum memulai percakapan.</p>
            <Link href="/chat" className="lp-btn dark">Tanya Agent Nusa <Arrow /></Link>
          </div>
          <div className="lp-faq-list">
            {FAQ.map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-final">
        <div className="lp-final-in">
          <div className="lp-final-text">
            <h2>Siap ngobrol dengan Agent Nusa?</h2>
            <p>Buka chat, pilih topik, dan lihat bagaimana urusan bank bisa selesai dalam beberapa menit.</p>
            <Link href="/chat" className="lp-btn white big">Mulai chat <Arrow /></Link>
            <small>Demo layanan memerlukan konfigurasi API oleh administrator.</small>
          </div>
          <img className="lp-final-mascot" src="/assets/hero.png" alt="Maskot Agent Nusa melambaikan tangan" />
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div>
            <a href="#atas" className="lp-logo"><BankMark />Agent Nusa</a>
            <p>Agent Nusa adalah nama fiktif untuk demo. Seluruh data, nominal, dan tampilan hanyalah contoh.</p>
          </div>
          <nav aria-label="Tautan footer">
            <a href="#fitur">Fitur</a>
            <a href="#harga">Harga</a>
            <a href="#cara">Cara kerja</a>
            <a href="#faq">FAQ</a>
            <Link href="/chat">Chat Bantuan</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
