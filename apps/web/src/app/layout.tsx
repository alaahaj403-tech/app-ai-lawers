import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { directionOf } from '@voxeli/domain';
import { resolveLocale } from '@/lib/locale';
import './globals.css';

export const metadata: Metadata = {
  title: 'Voxeli — AI Voice Translator',
  description:
    'Real-time AI voice translator for calls, conversations, camera and text. Speak freely. Understand everyone.',
  applicationName: 'Voxeli',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await resolveLocale();
  return (
    <html lang={locale} dir={directionOf(locale)}>
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
