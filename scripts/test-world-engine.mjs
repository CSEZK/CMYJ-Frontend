import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const fullSource = await readFile(new URL('../src/cmyj-1.7/world-engine/index.js', import.meta.url), 'utf8');
let source = fullSource.slice(fullSource.indexOf('(() =>'));
const end = source.lastIndexOf('})();');
source =
  source.slice(0, end) +
  'globalThis.__cweTest = { normalizeIncrementalResult, buildTransitionFromOperations, callWorldModel };\n' +
  source.slice(end);

const sandbox = {
  window: null,
  document: {},
  globalThis: null,
  console,
  structuredClone,
  crypto,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  $: () => {},
  compassSeal: '',
  ledgerStyles: '',
  faithfulStyles: '',
  integratedStyles: '',
  deepSeekJsonSchemaPrompt: () => '',
  isOfficialDeepSeekApi: () => false,
  shouldFallbackFromJsonSchema: () => false,
};
sandbox.window = sandbox;
sandbox.window.parent = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);

const { normalizeIncrementalResult, buildTransitionFromOperations, callWorldModel } = sandbox.__cweTest;
const emptyState = () => ({ activeEvents: [], actors: [], intelPackets: [], hooks: [] });
const currentStat = { 世界运转: { 当前地点: '桐城县和济堂药铺' } };

// 2026-07-26 酒馆实测：Gemini 忽略 value 约定，把全部实体放进 attributes。
const liveAttributesResult = normalizeIncrementalResult(
  {
    baseRevision: 0,
    operations: [
      {
        type: 'event.upsert',
        id: 'event_hejitang_crisis_1634',
        attributes: {
          name: '和济堂生存危机',
          type: '经营',
          description: '和济堂正面临药材短缺、信誉受损及外部债务逼迫。',
          status: '进行中',
          startTime: '崇祯七年七月初二日',
        },
      },
      {
        type: 'event.upsert',
        id: 'event_marriage_dispute_1634',
        attributes: {
          name: '林记米铺逼婚退盟',
          type: '家事',
          description: '周氏强行登门要求退回庚帖解除婚约。',
          status: '进行中',
        },
      },
      {
        type: 'actor.upsert',
        id: 'actor_shen_dazhu',
        attributes: {
          name: '沈大柱',
          location: '桐城县西街沈记肉铺',
          goal: '保住性命与铺子',
          knowledge: ['苏大郎已经苏醒'],
          does_not_know: ['常彪正盘算如何敲诈他'],
        },
      },
      {
        type: 'actor.upsert',
        id: 'actor_zhou_shi',
        attributes: {
          name: '周氏',
          location: '和济堂药铺堂屋',
          goal: '彻底断绝婚约',
          knowledge: ['苏家药库坍塌且欠债'],
        },
      },
      {
        type: 'intel.upsert',
        id: 'intel_user_madness_rumor',
        attributes: {
          content: '和济堂苏大郎被打成了傻子',
          source: '西街目击百姓',
          destination: '桐城全县',
          status: '传播中',
          arrival_time: '崇祯七年七月初三日',
        },
      },
      {
        type: 'hook.upsert',
        id: 'hook_yamen_duty_check',
        attributes: {
          trigger: '崇祯七年七月初八日',
          description: '若主角连续七日未去县衙点卯，兵房典吏将考虑革除其皂隶职衔。',
          status: 'pending',
        },
      },
    ],
    parallel_scenes: [
      {
        location: '桐城县西街沈记肉铺',
        time: '未时七刻',
        actors: ['沈大柱'],
        action: '担忧苏家报复',
        body: '沈大柱在内间来回踱步。',
      },
    ],
  },
  0,
);

assert.equal(liveAttributesResult.operations.length, 6);
assert.equal(liveAttributesResult.operations[0].value.name, '和济堂生存危机');
assert.equal(liveAttributesResult.operations[2].value.name, '沈大柱');
assert.equal(liveAttributesResult.operations[4].value.source, '西街目击百姓');
assert.equal(liveAttributesResult.operations[5].value.description.startsWith('若主角连续七日'), true);

const liveAttributesTransition = buildTransitionFromOperations(
  emptyState(),
  liveAttributesResult,
  currentStat,
);
assert.equal(liveAttributesTransition.operation_stats.accepted, 6);
assert.equal(liveAttributesTransition.operation_stats.rejected, 0);
assert.equal(liveAttributesTransition.upsert_events[0].title, '和济堂生存危机');
assert.equal(liveAttributesTransition.upsert_events[0].location, '桐城县和济堂药铺');
assert.equal(liveAttributesTransition.upsert_actors[0].name, '沈大柱');
assert.deepEqual(Array.from(liveAttributesTransition.upsert_actors[0].does_not_know), ['常彪正盘算如何敲诈他']);
assert.equal(liveAttributesTransition.upsert_intel[0].origin, '西街目击百姓');
assert.equal(liveAttributesTransition.upsert_intel[0].eta, '崇祯七年七月初三日');
assert.match(liveAttributesTransition.upsert_hooks[0].title, /连续七日未去县衙点卯/);
assert.equal(liveAttributesTransition.upsert_hooks[0].fail_condition, '伏线被化解或失去现实条件');

// 常见供应商包装层可以相互嵌套，统一在校验前剥离。
const wrapperVariants = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 0,
    operations: [
      {
        type: 'event.upsert',
        data: {
          attributes: {
            name: '赃银追查',
            description: '方家开始暗查赃银去向。',
          },
        },
      },
      {
        type: 'actor.upsert',
        properties: {
          name: '方仲嘉',
          location: '方宅',
          goal: '追回赃银',
        },
      },
      {
        type: 'intel.upsert',
        details: {
          content: '赃银可能在挂车河口',
          source: '街谈',
          receivers: ['常彪', '顾明远'],
        },
      },
      {
        type: 'hook.upsert',
        params: {
          content: '方仲嘉准备报复新任班头。',
        },
      },
    ],
    parallel_scenes: [],
  },
  0,
);
const wrapperTransition = buildTransitionFromOperations(emptyState(), wrapperVariants, currentStat);
assert.equal(wrapperTransition.operation_stats.accepted, 4);
assert.equal(wrapperTransition.operation_stats.rejected, 0);
assert.equal(wrapperTransition.upsert_intel[0].destination, '常彪、顾明远');

// patch 使用 attributes/fields 时同样必须落到 set，而不是被当成空 patch。
const patchResult = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 1,
    operations: [
      {
        type: 'actor.patch',
        id: 'AC-1',
        attributes: {
          goal: '连夜离开桐城',
          current_action: '收拾细软',
        },
      },
    ],
    parallel_scenes: [],
  },
  1,
);
assert.equal(patchResult.operations[0].set.goal, '连夜离开桐城');
const patchTransition = buildTransitionFromOperations(
  {
    ...emptyState(),
    actors: [
      {
        id: 'AC-1',
        name: '周氏',
        location: '林记米铺',
        goal: '解除婚约',
        currentAction: '等待消息',
        knowledge: [],
        doesNotKnow: [],
        nextDecision: '',
        updatedReason: '旧档案',
      },
    ],
  },
  patchResult,
  currentStat,
);
assert.equal(patchTransition.operation_stats.accepted, 1);
assert.equal(patchTransition.operation_stats.rejected, 0);
assert.equal(patchTransition.upsert_actors[0].goal, '连夜离开桐城');

const invalid = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 0,
    operations: [{ type: 'actor.upsert', id: 'AC-invalid', attributes: { location: '桐城县' } }],
    parallel_scenes: [],
  },
  0,
);
const invalidTransition = buildTransitionFromOperations(emptyState(), invalid, currentStat);
assert.equal(invalidTransition.operation_stats.accepted, 0);
assert.equal(invalidTransition.operation_stats.rejected, 1);
assert.match(invalidTransition.operation_stats.warnings[0], /缺少人物名称/);

let generationCalls = 0;
sandbox.generateRaw = async () => {
  generationCalls += 1;
  return {
    schema_version: 2,
    base_revision: 0,
    operations: [
      {
        type: 'actor.upsert',
        attributes: {
          name: '沈大柱',
          location: '沈记肉铺',
          goal: '保住铺子',
        },
      },
    ],
    parallel_scenes: [],
  };
};
const generated = await callWorldModel(
  {
    baseRevision: 0,
    currentTurn: { assistantOutput: '' },
    canonicalState: emptyState(),
  },
  'cwe-attributes-test',
);
assert.equal(generationCalls, 1);
assert.equal(generated.operations[0].value.name, '沈大柱');

assert.match(fullSource, /const VERSION = '1\.7\.2'/);
console.info('天下演化测试通过：真实 attributes 载荷、嵌套包装、字段别名、patch 与无效操作均已覆盖。');
