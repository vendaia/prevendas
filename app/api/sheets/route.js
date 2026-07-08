import Papa from 'papaparse';
import { NextResponse } from 'next/server';

// Force dynamic rendering so Next.js never serves this route from the static cache.
export const dynamic = 'force-dynamic';

// In-memory cache for sheet data
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const sheetUrl = searchParams.get('url');
    const bypassCache = searchParams.get('bypassCache') === 'true' || searchParams.get('refresh') === 'true';

    if (!sheetUrl) {
        return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    const now = Date.now();

    // Check memory cache if not bypassing
    if (!bypassCache && cache.has(sheetUrl)) {
        const cachedEntry = cache.get(sheetUrl);
        if (now - cachedEntry.timestamp < CACHE_TTL_MS) {
            console.log("Serving sheet from server in-memory cache:", sheetUrl);
            return NextResponse.json({ data: cachedEntry.data }, {
                headers: {
                    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
                    'X-Cache': 'HIT-Server'
                },
            });
        }
    }

    // Smart URL conversion: convert sharing/edit URLs to CSV export URL and preserve gid.
    let fetchUrl = sheetUrl;
    if (sheetUrl.includes('docs.google.com/spreadsheets/d/')) {
        const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
            const sheetId = match[1];

            let gid = '';
            try {
                const parsedUrl = new URL(sheetUrl);
                gid = parsedUrl.searchParams.get('gid') || '';
                if (!gid && parsedUrl.hash) {
                    const hashMatch = parsedUrl.hash.match(/gid=(\d+)/);
                    if (hashMatch && hashMatch[1]) gid = hashMatch[1];
                }
            } catch {
                const rawGidMatch = sheetUrl.match(/gid=(\d+)/);
                if (rawGidMatch && rawGidMatch[1]) gid = rawGidMatch[1];
            }

            // Check if it's already an export or pub link to avoid breaking valid ones.
            if (!sheetUrl.includes('/pub') && !sheetUrl.includes('/export')) {
                // Add a cache-busting timestamp so Google's servers don't serve a cached CSV.
                const cacheBuster = now;
                fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}&t=${cacheBuster}`;
            }
        }
    }

    try {
        console.log(`Fetching sheet from URL (bypassCache=${bypassCache}):`, fetchUrl);
        // cache: 'no-store' disables Next.js data cache so every call fetches live data from Google Sheets.
        const response = await fetch(fetchUrl, { cache: 'no-store' });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch sheet: ${response.status} ${response.statusText}` },
                { status: response.status }
            );
        }

        const csvText = await response.text();

        const { data, errors } = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
        });

        if (errors.length > 0) {
            console.warn('CSV Parsing errors:', errors);
        }

        // Store in memory cache
        cache.set(sheetUrl, {
            data,
            timestamp: now
        });

        const headers = {
            'X-Cache': 'MISS-Server'
        };

        if (bypassCache) {
            headers['Cache-Control'] = 'no-store';
        } else {
            headers['Cache-Control'] = 'public, s-maxage=300, stale-while-revalidate=60';
        }

        return NextResponse.json({ data }, { headers });
    } catch (error) {
        console.error('Error fetching sheet:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

