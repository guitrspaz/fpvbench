import assert from 'node:assert/strict';
import { createAiService } from '../../src/ai-service.mjs';

export const syntheticCredential = 'SYNTHETIC_BROWSER_CREDENTIAL_ONLY';

/** Fake Responses provider with a local control seam; never transmits HTTP. */
export function createBrowserAi() {
  const calls = [];
  let quota = false;
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    const input = JSON.parse(body.input[0].content[0].text);
    calls.push({ kind: input.kind, evidence: input.evidence });
    if (quota) return new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: syntheticCredential } }), { status: 429 });
    const summary = input.kind === 'connection-check' ? 'Connected'
      : input.kind === 'flight-recap' ? 'Synthetic aggregate flight recap' : 'Synthetic setup explanation';
    const result = { summary, observations: ['Explain supplied evidence only.'], questions: input.kind === 'flight-recap' ? [] : ['Which behavior should you verify?'], limitations: input.kind === 'flight-recap' ? ['Only imported records are covered.'] : ['Sparse values remain unknown.'] };
    return new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
    }), { status: 200 });
  };
  return {
    calls,
    setQuota(value) { quota = value; },
    aiFactory: dataDir => createAiService(dataDir, { fetchImpl }),
  };
}
