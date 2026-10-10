import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import siteConfig from '../data/config.json' with { type: 'json' };
import { createSheetsCache } from './sheets-cache.mjs';

export function sheetsCache(context) {
  return createSheetsCache({
    store: getStore({ name: context.deploy.published ? 'scientific-activity-cache' : 'scientific-activity-cache-preview', consistency: 'strong' }),
    sourceUrl: siteConfig.google_sheets_api,
    sourceId: createHash('sha256').update(siteConfig.google_sheets_api).digest('hex'),
    fetchSource: async source => {
      const url = new URL(source); url.searchParams.set('action', 'read');
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}`);
      return response.json();
    }
  });
}

export async function dispatchSheetsRefresh(origin, force = false) {
  const secret = Netlify.env.get('CV_SESSION_SECRET');
  if (!secret) throw new Error('Sheet refresh secret is not configured.');
  const response = await fetch(new URL('/.netlify/functions/sheets-refresh', origin), {
    method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }), signal: AbortSignal.timeout(10_000)
  });
  if (response.status !== 202) throw new Error(`Refresh worker HTTP ${response.status}`);
}
