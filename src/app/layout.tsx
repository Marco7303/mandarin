import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
export const metadata: Metadata = { title: 'Mori · Mandarin flashcards', description: 'Taiwanese Mandarin flashcards with traditional Chinese, pinyin, and English.', manifest: '/manifest.webmanifest', icons: { icon: [{ url: '/icon.svg?v=mori-1', type: 'image/svg+xml', sizes: 'any' }, { url: '/favicon.ico?v=mori-1', type: 'image/x-icon', sizes: '16x16 32x32 48x48' }], apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] }, appleWebApp: { capable: true, title: 'Mori', statusBarStyle: 'default' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f8f9f5' };
export default function RootLayout({ children }: {
    children: React.ReactNode;
}) { return <html lang="en"><body>{children}<Analytics /></body></html>; }
