// Optional manual check, using the existing demo's provider. The runner itself
// remains provider-neutral. No live provider is used by tests or default proof.
export async function openRouterProvider(state) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Set OPENROUTER_API_KEY for the optional --live check.');
  const messages = [
    { role: 'system', content: state.instructions },
    { role: 'user', content: state.prompt },
  ];
  for (const { turn, feedback } of state.history) {
    messages.push({ role: 'assistant', content: '', tool_calls: turn.calls.map((call) => ({
      id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
    })) });
    for (const item of feedback) messages.push({ role: 'tool', tool_call_id: item.id, content: JSON.stringify(item.result) });
  }
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', messages,
      tools: state.tools.map((tool) => ({ type: 'function', function: tool })), tool_choice: 'auto' }),
  });
  if (!response.ok) throw new Error(`Live provider HTTP ${response.status}`);
  const message = (await response.json()).choices?.[0]?.message;
  if (!message) throw new Error('Live provider returned no message.');
  return { text: message.content ?? '', calls: (message.tool_calls ?? []).map((call) => {
    let args;
    try { args = JSON.parse(call.function.arguments); } catch { args = null; }
    return { id: call.id, name: call.function.name, args };
  }) };
}
