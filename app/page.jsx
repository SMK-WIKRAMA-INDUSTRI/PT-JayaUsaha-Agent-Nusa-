import Link from 'next/link';
import PhoneDemo from '../components/PhoneDemo';
import FeatureTabs from '../components/FeatureTabs';
import './landing.css';

export const metadata = {
  title: 'Agent Nusa · Asisten Virtual 24 Jam',
  description: 'Bantu, asisten virtual Agent Nusa, membantu soal transfer, tagihan, kartu, dan riwayat transaksi lewat chat.'
};

const TOPICS = ['Status transfer', 'Tagihan dan pembayaran', 'Blokir kartu', 'QRIS', 'Biaya dan limit', 'Komplain', 'Info produk'];

const CARDS = [
  {
    pose: 'ok',
    title: 'Jawaban dari sumber resmi',
    text: 'Bantu menjawab dari informasi resmi bank dan data transaksi Anda. Kalau tidak tahu, Bantu bilang tidak tahu, bukan mengarang.'
  },
  {
    pose: 'announce',
    title: 'Tidak pernah minta PIN atau OTP',
    text: 'Bantu mengingatkan Anda bila data sensitif terketik di chat, dan verifikasi dilakukan di halaman resmi bank.'
  },
  {
    pose: 'coffee',
    title: 'Agen manusia selalu bisa dihubungi',
    text: 'Satu ketukan untuk bicara dengan agen. Ringkasan percakapan ikut terkirim, jadi Anda tidak perlu mengulang cerita.'
  }
];

const STEPS = [
  { pose: 'ask', title: 'Pilih topik atau ketik pertanyaan', text: 'Mulai dari tombol topik populer seperti status transfer, tagihan, atau blokir kartu.' },
  { pose: 'laptop', title: 'Bantu mengecek untuk Anda', text: 'Untuk data pribadi, Bantu meminta login dan verifikasi di kanal resmi bank. Tidak pernah lewat kolom chat.' },
  { pose: 'cheer', title: 'Selesai, atau lanjut ke agen', text: 'Masalah beres di chat, atau diteruskan ke agen dengan ringkasan lengkap bila perlu.' }
];

const FAQ = [
  ['Apakah Bantu itu manusia?', 'Bukan. Bantu adalah asisten virtual. Kapan pun Anda butuh orang, tekan tombol "Hubungi agen" di dalam chat.'],
  ['Apakah Bantu akan meminta PIN, password, atau OTP?', 'Tidak pernah. Jangan membagikan PIN, password, CVV, atau kode OTP kepada siapa pun, termasuk kepada Bantu. Verifikasi dilakukan di halaman resmi bank.'],
  ['Apa saja yang bisa ditanyakan?', 'Pembayaran dan tagihan, status transfer, blokir kartu, QRIS, biaya dan limit, komplain, serta informasi produk. Transaksi bernilai besar tetap dilakukan lewat aplikasi atau kanal resmi.'],
  ['Kapan agen manusia bisa dihubungi?', 'Bantu aktif 24 jam. Jam layanan agen manusia: [ISI JAM OPERASIONAL AGEN]. Di luar jam itu, Anda bisa meninggalkan pesan atau membuat tiket komplain.'],
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
            Bantu, asisten virtual Agent Nusa, menjawab soal transfer, tagihan, dan kartu kapan saja. Butuh orang? Tinggal minta agen.
          </p>
          <div className="lp-cta">
            <Link href="/chat" className="lp-btn dark big">Ngobrol dengan Bantu <Arrow /></Link>
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
      <section className="lp-topics" aria-label="Topik yang dibantu Bantu">
        <p>Bantu siap membantu soal</p>
        <div className="lp-topic-row">
          {TOPICS.map((t) => (
            <span key={t} className="lp-topic">{t}</span>
          ))}
        </div>
      </section>

      {/* FITUR TAB */}
      <section className="lp-sec" id="fitur">
        <div className="lp-wrap">
          <h2 className="lp-h2">Solusi chat yang membuat urusan bank terasa ringan</h2>
          <p className="lp-lead">Pilih skenario, lihat bagaimana Bantu menjawab.</p>
          <FeatureTabs />
        </div>
      </section>

      {/* KARTU */}
      <section className="lp-sec alt">
        <div className="lp-wrap">
          <h2 className="lp-h2">Aman, jujur, dan tetap ada manusia di baliknya</h2>
          <p className="lp-lead">Tiga prinsip yang dipegang Bantu di setiap percakapan.</p>
          <div className="lp-cards">
            {CARDS.map((c) => (
              <article key={c.title} className="lp-card3">
                <img className={'lp-card3-img ' + c.pose} src={`/assets/${c.pose}.png`} alt="" />
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ROW 1 */}
      <section className="lp-sec">
        <div className="lp-wrap lp-row">
          <div className="lp-row-text">
            <h2 className="lp-h2 left">Peringatan penipuan sebelum terlambat</h2>
            <p>Modus meminta OTP, link palsu, dan telepon mengaku petugas bank terus berganti. Bantu mengingatkan Anda di saat yang tepat.</p>
            <ul className="lp-checks">
              <li>Mengingatkan agar PIN, password, dan OTP tidak dibagikan</li>
              <li>Menyamarkan nomor kartu dan rekening di layar</li>
              <li>Meneruskan transaksi mencurigakan ke tim anti-fraud</li>
            </ul>
            <Link href="/chat" className="lp-link">Coba tanya Bantu <Arrow /></Link>
          </div>
          <div className="lp-row-art mint">
            <img className="lp-row-mascot shake" src="/assets/announce.png" alt="Maskot Bantu membawa megafon" />
            <div className="lp-alert-card" aria-hidden="true">
              <b>Info penting</b>
              <span>Bank tidak pernah meminta kode OTP lewat chat atau telepon.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ROW 2 */}
      <section className="lp-sec">
        <div className="lp-wrap lp-row rev">
          <div className="lp-row-art sun">
            <img className="lp-row-mascot bob" src="/assets/coffee.png" alt="Maskot Bantu menunggu sambil minum kopi" />
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
            <p>Saat masalah perlu ditangani orang, Bantu menyerahkan percakapan lengkap dengan ringkasan, kategori, dan nomor tiket.</p>
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
          <h2 className="lp-h2">Cara kerjanya sederhana</h2>
          <p className="lp-lead">Tiga langkah dari pertanyaan sampai selesai.</p>
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
            <h2 className="lp-h2 left">Pertanyaan yang sering diajukan</h2>
            <p className="lp-lead left">Belum ketemu jawabannya? Tanyakan langsung ke Bantu.</p>
            <Link href="/chat" className="lp-btn dark">Tanya Bantu <Arrow /></Link>
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
            <h2>Siap ngobrol dengan Bantu?</h2>
            <p>Buka chat, pilih topik, dan lihat bagaimana urusan bank bisa selesai dalam beberapa menit.</p>
            <Link href="/chat" className="lp-btn white big">Mulai chat <Arrow /></Link>
            <small>Pertama kali? Masukkan API key Netra di halaman Pengaturan AI.</small>
          </div>
          <img className="lp-final-mascot" src="/assets/hero.png" alt="Maskot Bantu melambaikan tangan" />
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
            <a href="#cara">Cara kerja</a>
            <a href="#faq">FAQ</a>
            <Link href="/chat">Chat Bantuan</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
