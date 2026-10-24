import { LocalSummaryMapAssistantAdapter, MapAssistantRouter, runSummaryConversation } from '../../dist/index.js';
import { openRouterProvider } from './openrouter.mjs';
import { PROMPT, STATE, OTHER_VIEW, projectLayer, mockProvider } from './fixture.mjs';

const live = process.argv.includes('--live');
if (live && !process.env.OPENROUTER_API_KEY) throw new Error('Set OPENROUTER_API_KEY for --live.');
const provider = live ? openRouterProvider : mockProvider;
console.log('# Active projects by district: local proof\n\nSynthetic data.\n');
console.log(live ? `Live provider: ${process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'}\n` : 'Scripted mock provider; no API key or network.\n');
for (const scope of ['authoritative_dataset', 'loaded_tiles']) {
  const adapter = new LocalSummaryMapAssistantAdapter({ mapState: STATE, layers: [projectLayer(scope)] });
  for (const [view, change] of [['west', {}], ['east', OTHER_VIEW]]) {
    await adapter.setView(change);
    const answer = await runSummaryConversation(new MapAssistantRouter(adapter), provider, PROMPT);
    const prefix = `${scope}-${view}`;
    console.log(`## ${scope}, ${view} viewport\n\n${PROMPT}\n\n${answer.text.replaceAll('#receipt-', `#${prefix}-receipt-`)}\n`);
    answer.evidence.forEach((item, index) => {
      console.log(`### ${prefix}-receipt-${index + 1}\n\n\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n`);
    });
  }
}
