import assert from 'node:assert/strict';
import {
  hasScenarioOpeningMessages,
  planScenarioWorldbookCleanup,
  scenarioWorldbookSignature,
} from '../src/cmyj-1.8/shared/scenario-cleanup.js';

const base = { name: '基础条目', content: '新版基础内容', uid: 1 };
const scenarioIdentity = { name: '[scenario]<user>身份', content: 'DLC身份', uid: 2 };
const installed = {
  worldbookEntries: ['[scenario]<user>身份', '人物概览'],
  worldbookEntryBackups: [],
  context: { openings: [{ id: 'origin-opening' }] },
  originalFirstMessages: ['基础介绍'],
};

assert.deepEqual(planScenarioWorldbookCleanup([base], installed).entries, [base], '实体已被本地同步删除时不得改写世界书');

const signed = {
  ...installed,
  worldbookEntrySignatures: { '[scenario]<user>身份': scenarioWorldbookSignature(scenarioIdentity) },
};
const localReplacement = { name: '[scenario]<user>身份', content: '本地同步后的同名内容', uid: 9 };
assert.deepEqual(
  planScenarioWorldbookCleanup([base, localReplacement], signed).entries,
  [base, localReplacement],
  '签名不一致的同名条目不得删除',
);

const cleanup = planScenarioWorldbookCleanup([base, scenarioIdentity], signed);
assert.deepEqual(cleanup.entries, [base]);
assert.deepEqual(cleanup.removedNames, ['[scenario]<user>身份']);

const overwritten = { name: '[scenario]<user>身份', content: '安装前内容', uid: 7 };
const withBackup = { ...signed, worldbookEntryBackups: [{ entry: overwritten, index: 0 }] };
assert.deepEqual(planScenarioWorldbookCleanup([scenarioIdentity, base], withBackup).entries, [overwritten, base]);

assert.equal(hasScenarioOpeningMessages(['基础介绍', '<initvar>\n世界运转:\n  _开场标识: origin-opening'], installed), true);
assert.equal(hasScenarioOpeningMessages(['本地推送后的新介绍'], installed), false);

console.info('身份DLC悬挂卸载与世界书保护测试通过。');
