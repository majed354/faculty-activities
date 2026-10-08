import { timingSafeEqual } from 'node:crypto';
import { sheetsCache } from '../../src/sheets-runtime.mjs';

export default async (request, context) => {
  const expected = Buffer.from(`Bearer ${Netlify.env.get('CV_SESSION_SECRET') || ''}`);
  const actual = Buffer.from(request.headers.get('authorization') || '');
  if (!Netlify.env.get('CV_SESSION_SECRET') || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return;
  const body = await request.json();
  const result = await sheetsCache(context).refresh({ force: body.force === true });
  console.log('Sheet cache refresh:', JSON.stringify(result));
};

export const config = { background: true };
