import { dispatchSheetsRefresh } from '../../src/sheets-runtime.mjs';

export default async (request, context) => {
  const origin = context.site.url.replace(/^http:/, 'https:');
  await dispatchSheetsRefresh(origin);
};

// Every five minutes in UTC; interval is identical in Asia/Riyadh (UTC+3).
export const config = { schedule: '*/5 * * * *' };
