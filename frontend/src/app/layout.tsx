import type { Metadata, Viewport } from 'next';
import { Geist, Roboto_Mono } from 'next/font/google';
import { QueryProvider } from '@/lib/query-provider';
import { HrmsAuthProvider } from '@/lib/hrms/auth-context';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
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
    <html lang="en" className={`${geist.variable} ${robotoMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <HrmsAuthProvider>{children}</HrmsAuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
