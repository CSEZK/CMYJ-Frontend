import assert from 'node:assert/strict';
import {
  CHARACTER_ADAPTATION_PATTERN,
  findCharacterAdaptationEntryIndex,
  injectCharacterAdaptation,
  restoreCharacterAdaptation,
} from '../src/cmyj-1.7/shared/character-adaptation.js';

const generatedBody = '\n身份与关系:\n  身份: "边地商人"\n';

const official = [
  {
    name: '栖云_SFW',
    content: '官方人设\n<!-- CANMING_CHARACTER_ADAPTATION_START -->旧适配<!-- CANMING_CHARACTER_ADAPTATION_END -->',
  },
];
const officialIndex = findCharacterAdaptationEntryIndex(official, { character: '栖云' });
assert.equal(officialIndex, 0);
const officialInjected = injectCharacterAdaptation(official[0].content, generatedBody);
assert.match(officialInjected.content, /身份: "边地商人"/);
assert.equal(officialInjected.backup.mode, 'replaced');
assert.equal(
  restoreCharacterAdaptation(officialInjected.content, officialInjected.backup),
  official[0].content,
  '带预埋标记的官方人物应原位替换并完整恢复',
);

const customContent = '<角色设定:沈云英_SFW>\n工坊人物完整原始人设\n</角色设定:沈云英_SFW>';
const customEntries = [
  { name: '沈云英_NSFW（导入）', content: '私密补充' },
  { name: '沈云英_SFW（导入）', content: customContent },
];
const customAdaptation = {
  character: '沈云英',
  personaEntries: ['沈云英_NSFW（导入）', '沈云英_SFW（导入）'],
};
assert.equal(
  findCharacterAdaptationEntryIndex(customEntries, customAdaptation),
  1,
  '存在多个关联条目时必须优先选择 SFW 完整人设',
);
const customInjected = injectCharacterAdaptation(customContent, generatedBody);
assert.equal(customInjected.backup.mode, 'created');
assert.match(customInjected.content, CHARACTER_ADAPTATION_PATTERN);
assert.equal(
  restoreCharacterAdaptation(customInjected.content, customInjected.backup),
  customContent,
  '无预埋标记的扩展人物应在卸载后恢复原文',
);

assert.equal(
  findCharacterAdaptationEntryIndex(customEntries, { character: '沈云英' }),
  1,
  '旧 DLC 没有关联条目字段时应通过人设标签兼容重命名条目',
);

console.info('DLC 扩展人物动态适配注入与卸载恢复测试通过。');
