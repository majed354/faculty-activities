import { resolve } from 'node:path';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { createCvPdfHandler } from '../../src/cv-pdf-service.mjs';
import { FONT_BLOBS } from '../../src/cv-fonts.generated.mjs';

// Built once per container: loading the font set is the slow part, and a warm
// instance compiles a full CV in tens of milliseconds.
let compiler = null;
const typst = () => (compiler ||= NodeCompiler.create({
  fontArgs: [{ fontBlobs: FONT_BLOBS.map(data => Buffer.from(data, 'base64')) }]
}));

const handler = createCvPdfHandler({
  compile: async (source, assets = []) => {
    const engine = typst();
    // Shadow files are keyed by absolute filesystem path, while the document
    // refers to them by the root-relative path Typst resolves against the
    // workspace. The two spellings are not interchangeable.
    const shadow = asset => resolve(process.cwd(), `.${asset.path}`);
    try {
      for (const asset of assets) engine.mapShadow(shadow(asset), asset.bytes);
      return Buffer.from(engine.pdf({ mainFileContent: source }));
    } finally {
      for (const asset of assets) { try { engine.unmapShadow(shadow(asset)); } catch { /* Already gone. */ } }
      // Sources are never reused across requests; without this the container
      // holds every CV it has rendered.
      engine.evictCache(0);
    }
  }
});

export default async request => {
  const result = await handler(request);
  return new Response(result.body, { status: result.status, headers: result.headers });
};

export const config = {
  path: '/api/cv-pdf',
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: 'ip' }
};
