import { getStore } from '@netlify/blobs';
import roster from '../../src/faculty-roster.json' with { type: 'json' };
import { createCvHandler } from '../../src/cv-api.mjs';

export default async (request, context) => createCvHandler({
  roster,
  getEnv: key => Netlify.env.get(key),
  // Each profile is one complete document; conditional replacement protects
  // edits from different devices. Preview documents are isolated from live CVs.
  openStore: () => getStore({
    name: context.deploy.published ? 'academic-cv-documents' : 'academic-cv-documents-preview',
    consistency: 'strong'
  })
})(request);

export const config = { rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: 'ip' } };
