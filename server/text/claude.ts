/**
 * The Anthropic Messages API over fetch (lead-phase7.md P7-2): no SDK, no new dependency. A call that does not answer in time
 * is aborted and reported as 'timeout'; every other failure is 'http', 'network' or 'shape'. The caller falls back to the template.
 */

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

export interface ClaudeCall {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface ClaudeReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class TextCallError extends Error {
  constructor(readonly reason: 'timeout' | 'http' | 'network' | 'shape') {
    super(`text call failed: ${reason}`);
  }
}

export async function callClaude(c: ClaudeCall): Promise<ClaudeReply> {
  const doFetch = c.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), c.timeoutMs);
  try {
    let res: Response;
    try {
      res = await doFetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'x-api-key': c.apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
        body: JSON.stringify({ model: c.model, max_tokens: c.maxTokens, system: c.system, messages: [{ role: 'user', content: c.user }] }),
        signal: ctl.signal,
      });
    } catch {
      throw new TextCallError(ctl.signal.aborted ? 'timeout' : 'network');
    }
    if (!res.ok) throw new TextCallError('http');
    let body: { content?: { type?: string; text?: unknown }[]; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new TextCallError(ctl.signal.aborted ? 'timeout' : 'shape');
    }
    const text = (body.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('');
    if (!text) throw new TextCallError('shape');
    return { text, inputTokens: Number(body.usage?.input_tokens) || 0, outputTokens: Number(body.usage?.output_tokens) || 0 };
  } finally {
    clearTimeout(timer);
  }
}
