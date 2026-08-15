import assert from 'node:assert/strict';
import lodash from 'lodash';

globalThis._ = lodash;
globalThis.window = { parent: globalThis };
globalThis.waitGlobalInitialized = async () => {};

const chat = {};
const messages = {
  0: {
    stat_data: {
      人际网络: {
        上司: {
          杨尔铭: { 身份: '桐城知县', 好感度: 12, 角色心声: '旧心声', 是否在场: true },
        },
        亲属: {
          苏晚棠: { 身份: '母亲', 好感度: 80, 角色心声: '旧心声', 是否在场: false },
        },
      },
      时局与任务: {
        势力关系: {
          桐城方氏: {
            好感度: -35,
            状态: '明合暗斗',
            描述: '旧关系说明',
            经济: {
              财政状况: '富足',
              主要收入: '田租',
              主要支出: '家丁',
              粮草: { 数量: 260, 单位: '石', 状态: '紧缺' },
              描述: '旧经济说明',
            },
            军事: {
              总兵力: 80,
              主力兵种: '家丁',
              描述: '旧军事说明',
              下属将领: {
                方仲嘉: { 职位: '把总', 统率: 62, 武力: 70, 智谋: 58, 忠诚: 75, 兵力: 80, 驻地: '桐城', 简介: '旧简介' },
              },
              军队: {},
            },
          },
        },
        当前任务: {
          旧任务: { 类型: '人事', 说明: '保住藏银', 进度: '追查中' },
        },
      },
      风月阁: { 同房点数: 2, 器物: {}, 掌柜絮语: '旧絮语' },
    },
  },
};

globalThis.getLastMessageId = () => 0;
globalThis.getVariables = option => (option.type === 'chat' ? chat : messages[option.message_id]);
globalThis.replaceVariables = (value, option) => {
  messages[option.message_id] = value;
};
globalThis.insertOrAssignVariables = value => Object.assign(chat, value);

let migration;
globalThis.$ = callback => {
  migration = callback();
};

await import('../src/cmyj-1.9/legacy/index.js');
await migration;

const data = messages[0].stat_data;
assert.deepEqual(data.人际网络.在场角色, ['杨尔铭']);
assert.equal(Object.hasOwn(data.人际网络.上司.杨尔铭, '角色心声'), false);
assert.equal(Object.hasOwn(data.人际网络.上司.杨尔铭, '是否在场'), false);
assert.equal(Object.hasOwn(data.风月阁, '掌柜絮语'), false);

const power = data.时局与任务.势力关系.桐城方氏;
assert.equal(power.状态, '敌对');
assert.equal(power.关系摘要, '旧关系说明');
assert.deepEqual(power.经济, { 财政状况: '富足', 粮草状态: '短缺' });
assert.equal(Object.hasOwn(power.军事, '描述'), false);
assert.deepEqual(power.军事.下属将领.方仲嘉, {
  职位: '把总',
  统率: 62,
  武力: 70,
  智谋: 58,
  忠诚: 75,
  兵力: 80,
  驻地: '桐城',
  简介: '旧简介',
});
assert.deepEqual(data.时局与任务.当前任务.旧任务, {
  类型: '人事',
  目标: '保住藏银',
  进展: '追查中',
});
assert.equal(chat._残明余烬旧档迁移版本, 6);

console.info('残明余烬 1.9 旧档精简迁移测试通过。');
