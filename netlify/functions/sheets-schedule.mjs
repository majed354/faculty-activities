import { dispatchSheetsRefresh } from '../../src/sheets-runtime.mjs';

export default async (request, context) => {
  const origin = context.site.url.replace(/^http:/, 'https:');
  // A prior run completes after its scheduled minute. Always refresh here,
  // otherwise a five-minute freshness check can skip every second run.
  await dispatchSheetsRefresh(origin, true);
};

// Every five minutes in UTC; interval is identical in Asia/Riyadh (UTC+3).
export const config = { schedule: '*/5 * * * *' };
