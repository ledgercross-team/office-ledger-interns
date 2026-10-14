import type { Metadata, Viewport } from 'next';
import { QueryProvider } from '@/lib/query-provider';
import { HrmsAuthProvider } from '@/lib/hrms/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'office-ledger',
  description: 'Attendance, tasks and subscriptions for companies',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <HrmsAuthProvider>{children}</HrmsAuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
