import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const fullSource = await readFile(new URL('../src/cmyj-1.7/world-engine/index.js', import.meta.url), 'utf8');
let source = fullSource.slice(fullSource.indexOf('(() =>'));
const end = source.lastIndexOf('})();');
source =
  source.slice(0, end) +
  'globalThis.__cweTest = { normalizeIncrementalResult, buildTransitionFromOperations, callWorldModel, normalizeState };\n' +
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

const { normalizeIncrementalResult, buildTransitionFromOperations, callWorldModel, normalizeState } = sandbox.__cweTest;
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

const liveAttributesTransition = buildTransitionFromOperations(emptyState(), liveAttributesResult, currentStat);
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

// upsert 被供应商错包进 set/changes/patch 时仍应提取实体，并由脚本生成稳定 ID。
const misplacedUpsertPayloads = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 0,
    operations: [
      { type: 'hook.upsert', set: { description: '朱由检命王承恩暗查宫门值守。' } },
      { type: 'hook.upsert', changes: { content: '方家将在三日后查验赃银账簿。' } },
      { type: 'hook.upsert', patch: { summary: '驿卒若误期，塘报将在下一驿受阻。' } },
    ],
    parallel_scenes: [],
  },
  0,
);
const misplacedUpsertTransition = buildTransitionFromOperations(emptyState(), misplacedUpsertPayloads, currentStat);
assert.equal(misplacedUpsertTransition.operation_stats.accepted, 3);
assert.equal(misplacedUpsertTransition.operation_stats.rejected, 0);
assert.equal(new Set(misplacedUpsertTransition.upsert_hooks.map(item => item.id)).size, 3);
misplacedUpsertTransition.upsert_hooks.forEach(item => assert.match(item.id, /^HK-/));

const repeatedHook = buildTransitionFromOperations(
  emptyState(),
  normalizeIncrementalResult(
    {
      schema_version: 2,
      base_revision: 0,
      operations: [{ type: 'hook.upsert', value: { description: '朱由检命王承恩暗查宫门值守。' } }],
      parallel_scenes: [],
    },
    0,
  ),
  currentStat,
);
assert.equal(repeatedHook.upsert_hooks[0].id, misplacedUpsertTransition.upsert_hooks[0].id);

// legacy 增量缺 ID 时不能使用受数组顺序影响的 hook.upsert-1，应走同一稳定派生逻辑。
const legacyHookTransition = buildTransitionFromOperations(
  emptyState(),
  normalizeIncrementalResult(
    {
      baseRevision: 0,
      upsert_hooks: [{ description: '朱由检命王承恩暗查宫门值守。' }],
    },
    0,
  ),
  currentStat,
);
assert.equal(legacyHookTransition.operation_stats.accepted, 1);
assert.equal(legacyHookTransition.upsert_hooks[0].id, repeatedHook.upsert_hooks[0].id);

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

// 模型臆造语义 ID 时，优先用载荷中的唯一人物姓名回绑真实档案 ID。
const semanticPatch = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 1,
    operations: [
      {
        type: 'actor.patch',
        id: 'actor_zhu_youjian',
        set: {
          name: '朱由检',
          current_action: '命王承恩暗查宫门值守',
          updated_reason: '收到宫门换防奏报',
        },
      },
    ],
    parallel_scenes: [],
  },
  1,
);
const semanticPatchTransition = buildTransitionFromOperations(
  {
    ...emptyState(),
    actors: [
      {
        id: 'AC-real',
        name: '朱由检',
        location: '乾清宫',
        goal: '掌握京师军政',
        currentAction: '批阅奏疏',
        knowledge: [],
        doesNotKnow: [],
        nextDecision: '',
        updatedReason: '旧档案',
      },
    ],
  },
  semanticPatch,
  currentStat,
);
assert.equal(semanticPatchTransition.operation_stats.accepted, 1);
assert.equal(semanticPatchTransition.operation_stats.rejected, 0);
assert.equal(semanticPatchTransition.upsert_actors[0].id, 'AC-real');
assert.equal(semanticPatchTransition.upsert_actors[0].current_action, '命王承恩暗查宫门值守');

const semanticUpsertTransition = buildTransitionFromOperations(
  {
    ...emptyState(),
    actors: [
      {
        id: 'AC-real',
        name: '朱由检',
        location: '乾清宫',
        goal: '掌握京师军政',
        currentAction: '批阅奏疏',
        knowledge: [],
        doesNotKnow: [],
        nextDecision: '',
        updatedReason: '旧档案',
      },
    ],
  },
  normalizeIncrementalResult(
    {
      schema_version: 2,
      base_revision: 1,
      operations: [
        {
          type: 'actor.upsert',
          id: 'actor_zhu_youjian',
          value: { name: '朱由检', current_action: '召见王承恩', updated_reason: '宫门换防' },
        },
      ],
      parallel_scenes: [],
    },
    1,
  ),
  currentStat,
);
assert.equal(semanticUpsertTransition.upsert_actors[0].id, 'AC-real');
assert.equal(semanticUpsertTransition.upsert_actors[0].location, '乾清宫');
assert.equal(semanticUpsertTransition.upsert_actors[0].goal, '掌握京师军政');

// 人物尚未入档时，带姓名的未知 patch 可安全降级为 upsert；匿名 patch 仍拒绝，避免串档。
const newActorFromPatch = buildTransitionFromOperations(emptyState(), semanticPatch, currentStat);
assert.equal(newActorFromPatch.operation_stats.accepted, 1);
assert.equal(newActorFromPatch.operation_stats.rejected, 0);
assert.match(newActorFromPatch.upsert_actors[0].id, /^AC-/);
assert.notEqual(newActorFromPatch.upsert_actors[0].id, 'actor_zhu_youjian');

const anonymousPatch = buildTransitionFromOperations(
  emptyState(),
  normalizeIncrementalResult(
    {
      schema_version: 2,
      base_revision: 0,
      operations: [{ type: 'actor.patch', id: 'actor_unknown', set: { current_action: '离开京师' } }],
      parallel_scenes: [],
    },
    0,
  ),
  currentStat,
);
assert.equal(anonymousPatch.operation_stats.accepted, 0);
assert.equal(anonymousPatch.operation_stats.rejected, 1);
assert.match(anonymousPatch.operation_stats.warnings[0], /patch 目标 actor_unknown 不存在/);

const incompleteHook = buildTransitionFromOperations(
  emptyState(),
  normalizeIncrementalResult(
    {
      schema_version: 2,
      base_revision: 0,
      operations: [{ type: 'hook.upsert', set: { trigger: '三日后' } }],
      parallel_scenes: [],
    },
    0,
  ),
  currentStat,
);
assert.equal(incompleteHook.operation_stats.accepted, 0);
assert.equal(incompleteHook.operation_stats.rejected, 1);
assert.match(incompleteHook.operation_stats.warnings[0], /缺少伏线标题或内容/);

// 旧档案无 ID 时在读取阶段补齐，保证下一轮 CANONICAL_STATE 一定可被 patch。
const migratedState = normalizeState(
  {
    version: 1,
    chatId: 'test-chat',
    activeEvents: [],
    actors: [
      {
        name: '朱由检',
        currentAction: '批阅奏疏',
        nextDecision: '',
        knowledge: [],
      },
    ],
    intelPackets: [],
    hooks: [
      {
        title: '宫门暗查',
        summary: '王承恩开始暗查宫门值守。',
        stage: '潜伏中',
        trigger: '查得异常时',
        failCondition: '查验结束且无异常',
      },
    ],
  },
  'test-chat',
);
assert.match(migratedState.actors[0].id, /^AC-/);
assert.match(migratedState.hooks[0].id, /^HK-/);

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

assert.match(fullSource, /const VERSION = '1\.7\.3'/);
console.info('天下演化测试通过：供应商包装、稳定 ID 派生、语义 ID 回绑、旧档迁移与无效操作均已覆盖。');
