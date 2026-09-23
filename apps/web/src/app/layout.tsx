import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Be_Vietnam_Pro, Inter } from 'next/font/google';
import { Providers } from '../components/providers';
import { NavigationProgressBar } from '../components/ui/navigation-progress-bar';
import { FeedbackButton } from '../components/ui/feedback-button';
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
        <Suspense fallback={null}>
          <NavigationProgressBar>
            <Providers>{children}</Providers>
            <FeedbackButton />
          </NavigationProgressBar>
        </Suspense>
      </body>
    </html>
  );
}
