import type { Metadata } from 'next';
import { Be_Vietnam_Pro, Inter } from 'next/font/google';
import { Providers } from '../components/providers';
import './globals.css';

const beVietnam = Be_Vietnam_Pro({
  variable: '--font-be-vietnam',
  weight: ['500', '600', '700', '800'],
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FCare — Chăm sóc & giám sát học vụ sinh viên',
  description:
    'Hệ thống theo dõi, đánh giá, chăm sóc và cảnh báo sớm sinh viên dành cho FPT Education.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${beVietnam.variable} ${inter.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
