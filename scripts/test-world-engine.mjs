import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { shouldFallbackFromJsonSchema } from '../src/cmyj-1.7/shared/api-compat.js';

const fullSource = await readFile(new URL('../src/cmyj-1.7/world-engine/index.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/cmyj-1.7/world-engine/styles-integrated.raw', import.meta.url), 'utf8');
let source = fullSource;
source = source.slice(source.indexOf('(() =>'));
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
for (const key of ['type', 'operationType', 'operation_type', 'op', 'operation', 'action']) {
  const normalized = normalizeIncrementalResult(
    {
      schema_version: 2,
      base_revision: 0,
      operations: [{ [key]: 'summary.replace', value: '天下态势未变。' }],
      parallel_scenes: [],
    },
    0,
  );
  assert.equal(normalized.operations[0].type, 'summary.replace', `未兼容操作类型字段 ${key}`);
}

assert.throws(
  () =>
    normalizeIncrementalResult(
      {
        schema_version: 2,
        base_revision: 0,
        operations: [{ id: 'EV-1', value: {} }],
        parallel_scenes: [],
      },
      0,
    ),
  /operations 结构无效/,
);

const mixed = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 0,
    operations: [
      { op: 'summary.replace', value: '天下态势未变。' },
      { id: 'EV-1', value: {} },
    ],
    parallel_scenes: [],
  },
  0,
);
const transition = buildTransitionFromOperations(
  { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  mixed,
  {},
);
assert.equal(transition.operation_stats.accepted, 1);
assert.equal(transition.operation_stats.rejected, 1);
assert.match(transition.operation_stats.warnings[0], /缺少 type/);

const compatibleShapes = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 0,
    operations: [
      { type: 'summary.replace', summary: '江北军情渐趋紧张。' },
      {
        type: 'fact.add',
        id: 'F-flat',
        content: '驿卒已经抵达桐城。',
        status: 'occurred',
        place: '桐城',
        visibility: '仅县衙知晓',
        confidence: 82,
        source: '本轮正文中驿卒当面交付文书',
      },
      {
        type: 'fact.add',
        id: 'F-nested',
        fact: {
          content: '县衙已经封存文书。',
          location: '桐城县衙',
          publicity: '内部知情',
          evidence: '本轮正文明确写出封存动作',
        },
      },
    ],
    parallel_scenes: [],
  },
  0,
);
assert.equal(compatibleShapes.operations[0].value, '江北军情渐趋紧张。');
assert.equal(compatibleShapes.operations[1].value.location, '桐城');
assert.equal(compatibleShapes.operations[1].value.publicity, '仅县衙知晓');
assert.equal(compatibleShapes.operations[1].value.confidence, 0.82);
assert.equal(compatibleShapes.operations[2].value.status, 'occurred');
assert.equal(compatibleShapes.operations[2].value.confidence, 0.8);
const compatibleTransition = buildTransitionFromOperations(
  { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  compatibleShapes,
  {},
);
assert.equal(compatibleTransition.operation_stats.accepted, 3);
assert.equal(compatibleTransition.operation_stats.rejected, 0);

const observedApiShape = normalizeIncrementalResult(
  {
    baseRevision: 0,
    operations: [
      { type: 'summary.replace', content: '桐城县退婚风波一触即发。' },
      { type: 'fact.add', content: '苏大郎遭沈大柱击中后脑后昏死。' },
      { type: 'fact.add', content: '和济堂药库遭水灾受损。' },
      { type: 'fact.add', content: '周氏登门和济堂意图退婚。' },
      {
        type: 'actor.upsert',
        id: 'su_dalang',
        name: '苏大郎',
        description: '伤后正在和济堂休养，神志已经改变。',
        status: 'recover',
        location: '桐城县和济堂药铺',
      },
      {
        type: 'actor.upsert',
        id: 'su_wantang',
        name: '苏晚棠',
        description: '正在凭大明律与往日恩情抵挡林家退婚。',
        status: 'angry',
        location: '和济堂堂屋',
      },
      {
        type: 'actor.upsert',
        id: 'lin_zhixia',
        name: '林知夏',
        description: '反对母亲退婚。',
        status: 'anxious',
        location: '林记米铺',
        goal: '保住婚约',
      },
      {
        type: 'actor.upsert',
        id: 'shen_qingyan',
        name: '沈清晏',
        description: '仍在沈记肉铺处理伤人后的余波。',
        status: 'worried',
        location: '沈记肉铺',
      },
      {
        type: 'social_dispute',
        id: 'event_engagement_crisis',
        name: '和济堂退婚风波',
        location: '桐城县和济堂',
        description: '周氏趁苏家势弱登门退婚，苏晚棠竭力周旋。',
        status: 'happening',
      },
      {
        type: 'intel.upsert',
        id: 'intel_su_madness_rumor',
        source: '桐城街坊闲谈',
        receiver: '林记米铺/周氏',
        content: '苏大郎被打伤后胡言乱语的传闻已经传到林家。',
        status: 'delivered',
        reach_time: '崇祯七年七月初四',
      },
    ],
    parallel_scenes: [],
  },
  0,
);
assert.equal(observedApiShape.operations[8].type, 'event.upsert');
const observedTransition = buildTransitionFromOperations(
  { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  observedApiShape,
  {},
);
assert.equal(observedTransition.operation_stats.accepted, 10);
assert.equal(observedTransition.operation_stats.rejected, 0);
assert.equal(observedTransition.new_facts[0].location, '本轮正文所述地点');
assert.equal(observedTransition.upsert_events[0].stage, 'social_dispute');
assert.equal(observedTransition.upsert_actors[0].current_action, '伤后正在和济堂休养，神志已经改变。');
assert.equal(observedTransition.upsert_intel[0].origin, '桐城街坊闲谈');
assert.equal(observedTransition.upsert_intel[0].destination, '林记米铺/周氏');
assert.equal(observedTransition.upsert_intel[0].eta, '崇祯七年七月初四');

const latestLiveApiShape = normalizeIncrementalResult(
  {
    baseRevision: 0,
    operations: [
      { type: 'summary.replace', content: '桐城民变后，云际寺赃银去向引起各方追查。' },
      { type: 'fact.add', content: '玩家于云际寺利用草乌毒酒击杀汪国华。' },
      { type: 'fact.add', content: '三万五千两白银被埋藏于挂车河口荒院。' },
      { type: 'fact.add', content: '方仲嘉负伤生还并知晓云际寺内情。' },
      { type: 'fact.add', content: '杨尔铭委任玩家为桐城县快班班头。' },
      {
        type: 'actor.upsert',
        name: '杨尔铭',
        born_year: 1617,
        identities: ['桐城知县'],
        location: '桐城县衙',
        goal: '平定境内民变',
        status: '疲惫且焦虑',
        description: '到任即遇民变，急需政治资本回旋。',
      },
      {
        type: 'actor.upsert',
        name: '方仲嘉',
        identities: ['荻港把总', '方氏族人'],
        location: '桐城凤仪里方宅',
        goal: '追回失踪白银',
        status: '负伤养病',
        description: '方孔炤族弟，因云际寺事变怨恨苏某。',
      },
      {
        type: 'actor.upsert',
        name: '汪国华',
        identities: ['乱民副首领'],
        status: '死亡',
        description: '于云际寺被玩家斩杀。',
      },
      {
        type: 'intel.upsert',
        source: '玩家',
        content: '白银埋藏在挂车河口荒废院落后院。',
        receivers: ['常彪', '顾明远', '赵砚'],
        importance: 10,
      },
      {
        type: 'intel.upsert',
        source: '王兵备',
        content: '云际寺原藏有巨额赃银，现已不翼而飞。',
        receivers: ['池州驻军'],
        importance: 7,
      },
      {
        type: 'hook.upsert',
        content: '方仲嘉的复仇：方家可能利用官府公文或江湖手段算计新任班头。',
        status: 'active',
      },
    ],
    parallel_scenes: [],
  },
  0,
);
const latestLiveTransition = buildTransitionFromOperations(
  { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  latestLiveApiShape,
  { 世界运转: { 当前地点: '桐城县和济堂药铺' } },
);
assert.equal(latestLiveTransition.operation_stats.accepted, 11);
assert.equal(latestLiveTransition.operation_stats.rejected, 0);
assert.equal(latestLiveTransition.upsert_intel[0].destination, '常彪、顾明远、赵砚');
assert.equal(latestLiveTransition.upsert_intel[0].channel, '口耳相传');
assert.equal(latestLiveTransition.upsert_intel[0].eta, '抵达时间未明');
assert.match(latestLiveTransition.upsert_hooks[0].title, /方仲嘉的复仇/);
assert.equal(latestLiveTransition.upsert_hooks[0].trigger, '相关人物获得行动机会时');

const minimalSemanticEvent = normalizeIncrementalResult(
  {
    base_revision: 0,
    operations: [
      {
        type: 'event.upsert',
        value: {
          event: { content: '方家开始暗中追查云际寺赃银。', status: 'active' },
          importance: 8,
        },
      },
    ],
    parallel_scenes: [],
  },
  0,
);
const minimalSemanticEventTransition = buildTransitionFromOperations(
  { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  minimalSemanticEvent,
  { 世界运转: { 当前地点: '桐城县' } },
);
assert.equal(minimalSemanticEventTransition.operation_stats.accepted, 1);
assert.equal(minimalSemanticEventTransition.operation_stats.rejected, 0);
assert.match(minimalSemanticEventTransition.upsert_events[0].title, /方家开始暗中追查/);
assert.equal(minimalSemanticEventTransition.upsert_events[0].location, '桐城县');

const nestedSemanticShape = normalizeIncrementalResult(
  {
    base_revision: 0,
    operations: [
      { type: 'summary.replace', new_summary: '苏家正面临药库受损和退婚风波。' },
      {
        type: 'fact.add',
        fact: {
          id: 'fact_001',
          content: '现代灵魂已经进入苏大郎体内。',
          significance: '核心转折',
        },
      },
      {
        type: 'fact.add',
        fact: {
          id: 'fact_002',
          content: '和济堂药库因水灾坍塌，药铺经营陷入困境。',
          significance: '家宅危机',
        },
      },
      {
        type: 'actor.upsert',
        actor: {
          id: 'actor_su_wantang',
          name: '苏晚棠',
          status: '健康',
          location: '桐城县和济堂药铺堂屋',
          goal: '拒绝林家退婚',
          knowledge: ['林记米铺借过苏家银子'],
          description: '正在堂屋与周氏争执。',
        },
      },
      {
        type: 'actor.upsert',
        actor: {
          name: '周氏',
          status: '亢奋',
          location: '桐城县和济堂药铺堂屋',
          goal: '解除婚约',
          description: '正在强行索要庚帖。',
        },
      },
      {
        type: 'actor.upsert',
        actor: {
          id: 'actor_su_wanyue',
          name: '苏晚月',
          status: '警惕',
          location: '桐城县和济堂药铺',
          goal: '观察侄儿是否真心改过',
          description: '正在观察苏大郎伤后的言行。',
        },
      },
      {
        type: 'event.upsert',
        event: {
          id: 'event_hejitang_dispute',
          name: '苏林悔婚之争',
          location: '和济堂堂屋',
          status: '进行中',
          description: '周氏趁苏家势弱登门退婚。',
          involved_actors: ['actor_su_wantang'],
        },
      },
      {
        type: 'intel.upsert',
        intel: {
          id: 'intel_crazy_rumor',
          source: '市井传闻',
          receiver: '全城百姓',
          content: '苏大郎被打坏脑子的传闻已经传播。',
          status: '已传播',
          arrival_time: '崇祯七年七月初五日',
        },
      },
    ],
    parallel_scenes: [],
  },
  0,
);
assert.equal(nestedSemanticShape.operations[0].value, '苏家正面临药库受损和退婚风波。');
assert.equal(nestedSemanticShape.operations[3].id, 'actor_su_wantang');
assert.match(nestedSemanticShape.operations[4].id, /^AC-/);
assert.equal(nestedSemanticShape.operations[5].id, 'actor_su_wanyue');
assert.equal(nestedSemanticShape.operations[6].id, 'event_hejitang_dispute');
assert.equal(nestedSemanticShape.operations[7].id, 'intel_crazy_rumor');
const movedActor = normalizeIncrementalResult(
  {
    base_revision: 0,
    operations: [
      {
        type: 'actor.upsert',
        actor: {
          name: '周氏',
          status: '离开',
          location: '林记米铺',
          description: '已经离开和济堂。',
        },
      },
    ],
    parallel_scenes: [],
  },
  0,
);
assert.equal(movedActor.operations[0].id, nestedSemanticShape.operations[4].id);
const nestedSemanticTransition = buildTransitionFromOperations(
  { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  nestedSemanticShape,
  {},
);
assert.equal(nestedSemanticTransition.operation_stats.accepted, 8);
assert.equal(nestedSemanticTransition.operation_stats.rejected, 0);

let generationCalls = 0;
sandbox.generateRaw = async () => {
  generationCalls += 1;
  return generationCalls === 1
    ? {
        schema_version: 2,
        base_revision: 0,
        operations: [{ type: 'event.upsert', id: 'EV-1', value: {} }],
        parallel_scenes: [],
      }
    : {
        schema_version: 2,
        base_revision: 0,
        operations: [{ type: 'summary.replace', value: '天下态势未变。' }],
        parallel_scenes: [],
      };
};
const retried = await callWorldModel(
  {
    baseRevision: 0,
    canonicalState: { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  },
  'cwe-test',
);
assert.equal(generationCalls, 2);
assert.equal(retried.operations[0].type, 'summary.replace');

generationCalls = 0;
sandbox.generateRaw = async () => {
  generationCalls += 1;
  return {
    schema_version: 2,
    base_revision: 0,
    operations: [{ type: 'fact.add', id: 'F-incomplete', value: {} }],
    parallel_scenes: [
      {
        location: '安庆',
        time: '当夜',
        actors: ['驿卒'],
        action: '送信',
        body: '驿卒趁夜色将密信送入城中。',
      },
    ],
  };
};
const sceneFallback = await callWorldModel(
  {
    baseRevision: 0,
    canonicalState: { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  },
  'cwe-scene-test',
);
assert.equal(generationCalls, 1);
assert.equal(sceneFallback.parallel_scenes.length, 1);

assert.match(fullSource, /data-action="dismiss-notice"/);
assert.match(fullSource, /action === 'dismiss-notice'/);
assert.match(styles, /\.cwe-notice-stack \.cwe-notice\s*\{[^}]*position: relative/s);
assert.match(styles, /\.cwe-notice-stack\s*\{[^}]*position: static/s);
assert.match(styles, /@media \(max-width: 820px\)\s*\{[\s\S]*?\.cwe-notice-stack\s*\{[^}]*gap: 8px/s);
assert.match(styles, /\.cwe-notice-close\s*\{[^}]*width: 34px/s);
for (const message of [
  '400 Bad Request',
  'HTTP 415 Unsupported Media Type: response_format',
  '422 Unprocessable Entity',
  'response_format json_schema is not supported',
  'invalid_request_error: structured output unavailable',
]) {
  assert.equal(shouldFallbackFromJsonSchema(new Error(message)), true, `未降级处理：${message}`);
}
assert.equal(shouldFallbackFromJsonSchema(new Error('401 Unauthorized')), false);
assert.equal(shouldFallbackFromJsonSchema(new Error('403 Forbidden')), false);

console.info('天下演化测试通过：真实 API 载荷兼容、旁线降级、混合操作、通知堆叠与关闭入口。');
