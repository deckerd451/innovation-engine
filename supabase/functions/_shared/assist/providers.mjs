// Model providers behind one interface:
//   provider.call({ system, prompt, schema, maxTokens, signal })
//     → { output: <plain object>, usage: { inputTokens, outputTokens }, model }
// Nothing outside this file knows a provider's wire format. A provider is
// usable only when it is both configured (credential present on the server)
// and approved (listed in BUILDSPACE_AI_APPROVED_PROVIDERS). Members and
// organizations may prefer an approved provider; an unavailable preference is
// reported, never silently routed elsewhere.

export class ProviderError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const TOOL_NAME = 'submit_assistance';

export function anthropicProvider({ apiKey, model, fetchImpl, baseUrl = 'https://api.anthropic.com' }) {
  return {
    id: 'anthropic',
    label: 'Anthropic Claude',
    model,
    async call({ system, prompt, schema, maxTokens, signal }) {
      let response;
      try {
        response = await fetchImpl(`${baseUrl}/v1/messages`, {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content: prompt }],
            tools: [{ name: TOOL_NAME, description: 'Submit the structured Buildspace assistance for this member.', input_schema: schema }],
            tool_choice: { type: 'tool', name: TOOL_NAME },
          }),
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw new ProviderError('timeout');
        throw new ProviderError('network_error');
      }
      if (response.status === 401 || response.status === 403) throw new ProviderError('provider_auth');
      if (response.status === 429) throw new ProviderError('provider_rate_limited');
      if (!response.ok) throw new ProviderError('provider_error', `status ${response.status}`);
      let payload;
      try { payload = await response.json(); } catch (_) { throw new ProviderError('invalid_output', 'not JSON'); }
      const toolUse = (payload?.content || []).find(part => part?.type === 'tool_use' && part.name === TOOL_NAME);
      if (!toolUse || typeof toolUse.input !== 'object') throw new ProviderError('invalid_output', payload?.stop_reason === 'max_tokens' ? 'truncated' : 'no structured output');
      return {
        output: toolUse.input,
        usage: { inputTokens: Number(payload?.usage?.input_tokens) || 0, outputTokens: Number(payload?.usage?.output_tokens) || 0 },
        model: payload?.model || model,
      };
    },
  };
}

export function createProviderRegistry(env, fetchImpl) {
  const registry = {};
  if (env.ANTHROPIC_API_KEY) {
    registry.anthropic = anthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.BUILDSPACE_AI_ANTHROPIC_MODEL || 'claude-sonnet-5-5', fetchImpl });
  }
  return registry;
}

export function approvedProviders(env) {
  return String(env.BUILDSPACE_AI_APPROVED_PROVIDERS || '').split(',').map(id => id.trim()).filter(Boolean);
}

export function availableProviders(registry, approved) {
  return approved.filter(id => registry[id]).map(id => ({ id, label: registry[id].label }));
}

export function resolveProvider(registry, approved, preference = 'automatic') {
  const usable = availableProviders(registry, approved).map(item => item.id);
  if (preference && preference !== 'automatic') {
    return usable.includes(preference) ? { provider: registry[preference] } : { error: 'provider_unavailable' };
  }
  return usable.length ? { provider: registry[usable[0]] } : { error: 'not_configured' };
}
