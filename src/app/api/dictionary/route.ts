import { NextRequest, NextResponse } from 'next/server';
import { dictionaryAttribution, lookupDictionary } from '@/lib/dictionary';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (!/^[\p{Script=Han}]{1,40}$/u.test(query))
        return NextResponse.json({ error: 'Enter Chinese text.' }, { status: 400 });
    try {
        const suggestions = await lookupDictionary(query);
        return NextResponse.json({ enabled: !!process.env.CEDICT_PATH, suggestions, attribution: dictionaryAttribution });
    }
    catch {
        return NextResponse.json({ error: 'Dictionary unavailable.' }, { status: 503 });
    }
}
