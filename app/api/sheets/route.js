import Papa from 'papaparse';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Force dynamic rendering so Next.js never serves this route from the static cache.
export const dynamic = 'force-dynamic';

// In-memory cache for sheet data
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

function getCacheFilePath(url) {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return path.join(os.tmpdir(), `sheet-cache-${hash}.json`);
}

function readCacheFile(url) {
    try {
        const filePath = getCacheFilePath(url);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const now = Date.now();
            if (now - stats.mtimeMs < CACHE_TTL_MS) {
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            }
        }
    } catch (err) {
        console.error('Error reading file cache:', err);
    }
    return null;
}

function writeCacheFile(url, data) {
    try {
        const filePath = getCacheFilePath(url);
        fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    } catch (err) {
        console.error('Error writing file cache:', err);
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const sheetUrl = searchParams.get('url');
    const bypassCache = searchParams.get('bypassCache') === 'true' || searchParams.get('refresh') === 'true';

    if (!sheetUrl) {
        return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    const now = Date.now();
    let cachedEntry = null;

    if (cache.has(sheetUrl)) {
        cachedEntry = cache.get(sheetUrl);
    }

    // Check memory cache if not bypassing
    if (!bypassCache && cachedEntry && (now - cachedEntry.timestamp < CACHE_TTL_MS)) {
        console.log("Serving sheet from server in-memory cache:", sheetUrl);
        return NextResponse.json({ data: cachedEntry.data }, {
            headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
                'X-Cache': 'HIT-Server-Memory'
            },
        });
    }

    // Check file cache if not bypassing
    if (!bypassCache) {
        const fileCachedData = readCacheFile(sheetUrl);
        if (fileCachedData) {
            console.log("Serving sheet from server file cache:", sheetUrl);
            cache.set(sheetUrl, { data: fileCachedData, timestamp: now });
            return NextResponse.json({ data: fileCachedData }, {
                headers: {
                    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
                    'X-Cache': 'HIT-Server-Disk'
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
            throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
        }

        const csvText = await response.text();

        const { data, errors } = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
        });

        if (errors.length > 0) {
            console.warn('CSV Parsing errors:', errors);
        }

        // Store in memory and file cache
        cache.set(sheetUrl, {
            data,
            timestamp: now
        });
        writeCacheFile(sheetUrl, data);

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

        // STALE-ON-ERROR: Try to recover ANY cached data (even if expired)
        let fallbackData = null;
        let cacheSource = 'None';

        if (cachedEntry) {
            fallbackData = cachedEntry.data;
            cacheSource = 'Memory-Expired';
        } else {
            try {
                const filePath = getCacheFilePath(sheetUrl);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    fallbackData = JSON.parse(content);
                    cacheSource = 'Disk-Expired';
                }
            } catch (cacheErr) {
                console.error('Failed to read expired file cache:', cacheErr);
            }
        }

        if (fallbackData) {
            console.warn(`Serving expired cached data (${cacheSource}) as fallback due to error:`, error.message);
            return NextResponse.json({ data: fallbackData }, {
                headers: {
                    'Cache-Control': 'no-store',
                    'X-Cache': `HIT-Stale-Fallback-${cacheSource}`,
                    'X-Cache-Error': error.message
                }
            });
        }

        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


