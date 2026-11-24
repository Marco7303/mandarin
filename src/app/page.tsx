import MandarinApp from '@/components/mandarin-app';
import { isWritingPreview } from '@/lib/preview-sample';
export default function Page() { return <MandarinApp previewDemo={isWritingPreview(process.env.VERCEL_ENV, process.env.VERCEL_GIT_COMMIT_REF)} />; }
