import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-jakarta'
});

export const metadata = {
  title: 'Agent Nusa · Chat Bantuan',
  description: 'Demo chatbot customer service bank: pembayaran, transfer, kartu, dan riwayat transaksi.',
  icons: { icon: '/assets/ask.png' }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0E2146'
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
