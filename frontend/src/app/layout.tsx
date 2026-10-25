import type { Metadata, Viewport } from 'next';
import { Rubik, Roboto_Mono } from 'next/font/google';
import { QueryProvider } from '@/lib/query-provider';
import { HrmsAuthProvider } from '@/lib/hrms/auth-context';
import { HrmsRealtimeSync } from '@/lib/hrms/realtime-sync';
import './globals.css';

const rubik = Rubik({
  variable: '--font-rubik',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

const robotoMono = Roboto_Mono({
  variable: '--font-roboto-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Office Ledger',
  description: 'A calmer workspace for people, work, and approvals.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${rubik.variable} ${robotoMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <HrmsAuthProvider>
            <HrmsRealtimeSync />
            {children}
          </HrmsAuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
