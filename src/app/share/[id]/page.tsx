import type { Metadata } from 'next';
import MandarinApp from '@/components/mandarin-app';

// Deck contents are fetched without caching. Revoked links must never expose an
// old snapshot through server rendering, search indexes, or the offline shell.
export const metadata: Metadata = {
    title: 'Shared set · Mori',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
};
export default async function SharedPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <MandarinApp shareId={id} />;
}
