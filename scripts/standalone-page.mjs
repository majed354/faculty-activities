import { transform } from 'esbuild';
import { validateConfirmedActivity } from '../src/activity-data.mjs';

export const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');

export async function readDeploySnapshot({ origin, sourceId, fetchImpl = fetch, now = Date.now() }) {
  try {
    const response = await fetchImpl(new URL('/.netlify/functions/sheets-data', origin), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    return validateConfirmedActivity(await response.json(), sourceId, now);
  } catch { return null; }
}

export async function standalonePage({ source, bootstrap, readAsset }) {
  let page = source.replace('<!-- Site bootstrap -->', () => `<script id="siteBootstrap">window.SiteBootstrap=${safeJson(bootstrap)};</script>`);
  for (const match of [...page.matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^\"]*)?">/g)]) {
    const css = await readAsset(match[1]);
    const { code } = await transform(css, { loader: 'css', minify: true });
    page = page.replace(match[0], () => `<style data-site-asset="${match[1]}">${code.replace(/<\/style/gi, '<\\/style')}</style>`);
  }
  for (const match of [...page.matchAll(/<script defer src="([^"?]+)(?:\?([^\"]*))?"><\/script>/g)]) {
    const javascript = await readAsset(match[1]);
    // Keep app.js globals: the CV and teaching modules call them by name.
    const { code } = await transform(javascript, { loader: 'js', target: 'es2020', minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false });
    page = page.replace(match[0], () => `<script data-site-asset="${match[1]}" data-version="${match[2] || ''}">${code.replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  for (const match of page.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1])) throw new Error('The main page still depends on an external script.');
  }
  return page;
}
