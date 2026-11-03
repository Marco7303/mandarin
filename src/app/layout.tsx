import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Mori · A little Mandarin, every day', description: 'A quiet space to learn Taiwanese Mandarin. Traditional characters, pinyin, and English.', manifest: '/manifest.webmanifest', icons: {icon:'/icon.svg',apple:'/icon-192.png'}, appleWebApp: { capable: true, title: 'Mori', statusBarStyle: 'default' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f8f9f5' };
export default function RootLayout({ children }: {
    children: React.ReactNode;
}) { return <html lang="en"><body>{children}</body></html>; }
