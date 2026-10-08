import { createSheetsDataHandler } from '../../src/sheets-cache.mjs';
import { sheetsCache, dispatchSheetsRefresh } from '../../src/sheets-runtime.mjs';

export default async (request, context) => createSheetsDataHandler({
  cache: sheetsCache(context),
  dispatchRefresh: force => dispatchSheetsRefresh(new URL(request.url).origin, force)
})(request, context);

export const config = { rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: 'ip' } };
