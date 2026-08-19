import assert from 'node:assert/strict';
import lodash from 'lodash';

globalThis._ = lodash;
globalThis.window = { parent: globalThis };
globalThis.waitGlobalInitialized = async () => {};

const { Schema } = await import('../src/cmyj-1.9/schema/definition.js');
const schemaMigrated = Schema.parse({
  经济: {
    流水: {
      月入: { 药材尾款: { 银两: 120, 说明: '交货后结清' } },
      月出: { 修缮工钱: { 银两: 35, 说明: '药库完工后支付' } },
    },
  },
  时局与任务: {
    当前任务: {
      抢先解析测试: { 类型: '人事', 目标: '保留旧内容', 进展: '等待回信' },
      进行状态测试: { 类型: '调查', 目标: '查清幕后主使', 进展: '尚未查清，正在追查' },
    },
  },
});
assert.deepEqual(schemaMigrated.时局与任务.未决事项.抢先解析测试, {
  状态: '等待中',
  概要: '保留旧内容',
  现状: '等待回信',
  提醒: '',
});
assert.equal(Object.hasOwn(schemaMigrated.时局与任务, '当前任务'), false);
assert.equal(Object.hasOwn(schemaMigrated.经济, '流水'), false);
assert.equal(schemaMigrated.时局与任务.未决事项.进行状态测试.状态, '推进中');
assert.equal(schemaMigrated.时局与任务.未决事项['待收：药材尾款'].状态, '等待中');
assert.equal(schemaMigrated.时局与任务.未决事项['待付：修缮工钱'].概要, '修缮工钱尚有35两白银应付，尚未实际交割。事由：药库完工后支付');

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
          联姻旧势力: { 好感度: 20, 状态: '联姻', 描述: '通过婚姻往来', 经济: {}, 军事: {} },
          合并旧势力: { 好感度: 0, 状态: '已合并', 描述: '已经并入他部', 经济: {}, 军事: {} },
        },
        当前任务: {
          旧任务: { 类型: '人事', 说明: '保住藏银', 进度: '追查中' },
          新版旧任务: { 类型: '军政', 目标: '等待援军抵达', 进展: '等待塘报' },
        },
      },
      经济: {
        流水: {
          本月结余: 85,
          月入: { 药材尾款: { 银两: 120, 说明: '交货后结清' } },
          月出: { 修缮工钱: { 银两: 35, 说明: '药库完工后支付' } },
        },
        粮秣流水: { 本月结余: 4, 本月入: {}, 本月出: {} },
      },
      风月阁: { 同房点数: 2, 器物: {}, 掌柜絮语: '旧絮语' },
    },
  },
  1: { stat_data: {} },
};

let failMessageOneOnce = true;
globalThis.getLastMessageId = () => 1;
globalThis.getVariables = option => {
  if (option.type === 'chat') return chat;
  if (option.message_id === 1 && failMessageOneOnce) {
    failMessageOneOnce = false;
    throw new Error('模拟单楼读取失败');
  }
  return messages[option.message_id];
};
globalThis.replaceVariables = (value, option) => {
  messages[option.message_id] = value;
};
globalThis.insertOrAssignVariables = value => Object.assign(chat, value);

let migration;
let migrationCallback;
globalThis.$ = callback => {
  migrationCallback = callback;
  migration = callback();
};

await import('../src/cmyj-1.9/legacy/index.js');
await migration;
assert.equal(chat._残明余烬旧档迁移版本, undefined, '存在失败楼层时不得提前标记迁移完成');
await migrationCallback();

const data = messages[0].stat_data;
assert.deepEqual(data.人际网络.在场角色, ['杨尔铭']);
assert.equal(Object.hasOwn(data.人际网络.上司.杨尔铭, '角色心声'), false);
assert.equal(Object.hasOwn(data.人际网络.上司.杨尔铭, '是否在场'), false);
assert.equal(Object.hasOwn(data.风月阁, '掌柜絮语'), false);

const power = data.时局与任务.势力关系.桐城方氏;
assert.equal(power.状态, '敌对');
assert.equal(data.时局与任务.势力关系.联姻旧势力.状态, '友好');
assert.equal(data.时局与任务.势力关系.合并旧势力.状态, '已覆灭');
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
assert.deepEqual(data.时局与任务.未决事项.旧任务, {
  状态: '推进中',
  概要: '保住藏银',
  现状: '追查中',
  提醒: '',
});
assert.deepEqual(data.时局与任务.未决事项.新版旧任务, {
  状态: '等待中',
  概要: '等待援军抵达',
  现状: '等待塘报',
  提醒: '',
});
assert.equal(data.时局与任务.未决事项['待收：药材尾款'].概要, '药材尾款尚有120两白银应收，尚未实际交割。事由：交货后结清');
assert.equal(data.时局与任务.未决事项['待付：修缮工钱'].提醒, '实际支付后更新主角私库，并移除此事项。');
assert.equal(Object.hasOwn(data.经济, '流水'), false);
assert.equal(Object.hasOwn(data.经济, '粮秣流水'), false);
assert.equal(Object.hasOwn(data.时局与任务, '当前任务'), false);
assert.equal(chat._残明余烬旧档迁移版本, 8);

console.info('残明余烬 1.9 旧档精简迁移测试通过。');
