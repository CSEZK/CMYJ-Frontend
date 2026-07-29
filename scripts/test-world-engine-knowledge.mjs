import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src/cmyj-1.7-beta/world-engine/index.js');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace(/^import .+;\r?\n/gm, '');
source = source.replace(
  '  $(() => {\n    bootstrap().catch(error => {',
  `  globalThis.__worldEngineTest = {
    normalizeState,
    normalizeModelResult,
    validateEpistemicResult,
    outputSchema,
  };
  return;
  $(() => {
    bootstrap().catch(error => {`,
);

const context = {
  console,
  structuredClone,
  setTimeout,
  clearTimeout,
  window: null,
  document: {},
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(source, context, { filename: sourcePath });

const { normalizeState, normalizeModelResult, validateEpistemicResult, outputSchema } = context.__worldEngineTest;
assert.equal(typeof normalizeState, 'function');
assert.equal(typeof normalizeModelResult, 'function');
assert.equal(typeof validateEpistemicResult, 'function');
assert.equal(typeof outputSchema, 'function');

function assertStrictObjects(schema, pathLabel = 'root') {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object' && schema.additionalProperties === false) {
    const propertyNames = Object.keys(schema.properties || {}).sort();
    const requiredNames = Array.from(schema.required || []).sort();
    assert.deepEqual(requiredNames, propertyNames, `${pathLabel} 的 strict object 必须要求所有 properties`);
  }
  for (const [key, value] of Object.entries(schema.properties || {})) {
    assertStrictObjects(value, `${pathLabel}.${key}`);
  }
  assertStrictObjects(schema.items, `${pathLabel}[]`);
}

assertStrictObjects(outputSchema().value);

const oldState = normalizeState(
  {
    version: 1,
    chatId: 'test-chat',
    facts: [
      {
        id: 'F-old',
        content: '主角曾秘密进入东仓',
        status: 'occurred',
        scope: 'player_scene',
        location: '桐城县·东仓',
        actors: ['主角'],
        witnesses: ['主角'],
        publicity: '未公开',
        confidence: 0.9,
      },
    ],
    activeEvents: [],
    actors: [],
    intelPackets: [
      {
        id: 'INTEL-old',
        content: '东仓可能遭人潜入',
        origin: '桐城县',
        destination: '安庆府',
        channel: '塘报',
        status: '传播中',
        eta: '正月二十九日',
        reliability: 0.8,
        knownBy: ['桐城县衙'],
      },
    ],
  },
  'test-chat',
);

assert.equal(oldState.facts.length, 1, '旧事实不应因缺少新字段被清空');
assert.equal(oldState.facts[0].visibility, 'secret', '旧事实无法判断时应保守迁移为 secret');
assert.equal(oldState.intelPackets.length, 1, '旧消息流转不应因缺少新字段被清空');
assert.equal(oldState.intelPackets[0].factIds.length, 0);
assert.equal(oldState.intelPackets[0].distanceBand, 'same_city');

const secretFact = {
  id: 'F-new-secret',
  content: '主角秘密潜入东仓',
  status: 'occurred',
  scope: 'player_scene',
  location: '桐城县·东仓',
  actors: ['主角'],
  witnesses: ['主角'],
  publicity: '未公开',
  visibility: 'secret',
};

assert.throws(
  () =>
    validateEpistemicResult(oldState, {
      new_facts: [secretFact],
      upsert_events: [],
      upsert_actors: [],
      upsert_intel: [],
      remove_intel_ids: [],
      scene_permissions: [
        {
          scene_index: 0,
          scene_type: 'reaction',
          actors: ['方仲嘉'],
          usable_fact_ids: ['F-new-secret'],
          usable_intel_ids: [],
          event_ids: [],
        },
      ],
      parallel_world: '【安庆府·签押房·子时】\n方仲嘉立即得知主角潜入东仓。',
      next_turn_packet: { arrivedIntel: [], npcKnowledge: [] },
    }),
  /人物反应场景消费了角色尚未知晓的事实/,
);

assert.throws(
  () =>
    validateEpistemicResult(oldState, {
      new_facts: [secretFact],
      upsert_events: [],
      upsert_actors: [],
      upsert_intel: [],
      remove_intel_ids: [],
      scene_permissions: [
        {
          scene_index: 0,
          scene_type: 'independent',
          actors: ['方仲嘉'],
          usable_fact_ids: [],
          usable_intel_ids: [],
          event_ids: [],
        },
      ],
      parallel_world: '【桐城县·东仓·子时】\n方仲嘉已经断定主角秘密潜入东仓。',
      next_turn_packet: { arrivedIntel: [], npcKnowledge: [] },
    }),
  /疑似消费了未声明的本轮秘密事实/,
);

assert.doesNotThrow(() =>
  validateEpistemicResult(oldState, {
    new_facts: [secretFact],
    upsert_events: [],
    upsert_actors: [],
    upsert_intel: [],
    remove_intel_ids: [],
    scene_permissions: [
      {
        scene_index: 0,
        scene_type: 'reaction',
        actors: ['主角'],
        usable_fact_ids: ['F-new-secret'],
        usable_intel_ids: [],
        event_ids: [],
      },
    ],
    parallel_world: '【桐城县·东仓夹巷·子时】\n主角回望仓门，确认身后无人跟随。',
    next_turn_packet: { arrivedIntel: [], npcKnowledge: [] },
  }),
);

assert.throws(
  () =>
    validateEpistemicResult(oldState, {
      new_facts: [secretFact],
      upsert_events: [],
      upsert_actors: [],
      upsert_intel: [
        {
          id: 'INTEL-new',
          content: '东仓有人潜入',
          fact_ids: ['F-new-secret'],
          target_groups: ['安庆府官署'],
          status: 'in_transit',
        },
      ],
      remove_intel_ids: [],
      scene_permissions: [
        {
          scene_index: 0,
          scene_type: 'propagation',
          actors: ['主角'],
          usable_fact_ids: [],
          usable_intel_ids: ['INTEL-new'],
          event_ids: [],
        },
      ],
      parallel_world: '【桐城县·官道·子时】\n一封消息刚刚离开桐城。',
      next_turn_packet: { arrivedIntel: ['东仓有人潜入'], npcKnowledge: [] },
    }),
  /arrivedIntel 只能来自本轮实际移出队列的旧消息/,
);

const persistedKnowledgeState = normalizeState(
  {
    ...oldState,
    actors: [
      {
        id: 'NPC-fang',
        name: '方仲嘉',
        location: '安庆府',
        groups: ['官府'],
        currentAction: '核对塘报',
        knowledge: ['主角曾进入东仓'],
        knowledgeSourceFactIds: ['F-old'],
        nextDecision: '继续追查',
      },
    ],
  },
  'test-chat',
);

assert.doesNotThrow(() =>
  validateEpistemicResult(persistedKnowledgeState, {
    new_facts: [],
    upsert_events: [],
    upsert_actors: [],
    upsert_intel: [],
    remove_intel_ids: [],
    scene_permissions: [
      {
        scene_index: 0,
        scene_type: 'reaction',
        actors: ['方仲嘉'],
        usable_fact_ids: ['F-old'],
        usable_intel_ids: [],
        event_ids: [],
      },
    ],
    parallel_world: '【安庆府·签押房·午时】\n方仲嘉依据此前收到的消息继续追查。',
    next_turn_packet: { arrivedIntel: [], npcKnowledge: [] },
  }),
);

const timedIntelState = normalizeState(
  {
    ...oldState,
    clock: { date: '正月二十六日', time: '12:00', location: '桐城县', worldDays: 1 },
    intelPackets: [
      {
        id: 'INTEL-timed',
        content: '东仓可能遭人潜入',
        origin: '桐城县',
        destination: '安庆府',
        channel: '塘报',
        status: 'in_transit',
        eta: '正月三十日',
        reliability: 0.8,
        knownBy: ['桐城县衙'],
        factIds: ['F-old'],
        targetGroups: ['官府'],
        departedWorldDays: 1,
        availableAfterWorldDays: 5,
        distanceBand: 'nearby_city',
      },
    ],
  },
  'test-chat',
);

assert.throws(
  () =>
    validateEpistemicResult(
      timedIntelState,
      {
        new_facts: [],
        upsert_events: [],
        upsert_actors: [],
        upsert_intel: [],
        remove_intel_ids: ['INTEL-timed'],
        scene_permissions: [
          {
            scene_index: 0,
            scene_type: 'independent',
            actors: ['安庆府书吏'],
            usable_fact_ids: [],
            usable_intel_ids: [],
            event_ids: [],
          },
        ],
        parallel_world: '【安庆府·签押房·午时】\n书吏仍在整理旧卷。',
        next_turn_packet: { arrivedIntel: ['东仓可能遭人潜入'], npcKnowledge: [] },
      },
      { worldDays: 2 },
    ),
  /尚未达到最早可用世界天数/,
);

assert.throws(
  () =>
    validateEpistemicResult(
      timedIntelState,
      {
        new_facts: [],
        upsert_events: [],
        upsert_actors: [
          {
            id: 'NPC-merchant',
            name: '安庆商人',
            location: '安庆府',
            groups: ['商旅'],
            current_action: '谈论东仓消息',
            knowledge: ['东仓可能遭人潜入'],
            knowledge_source_fact_ids: ['F-old'],
            knowledge_source_intel_ids: ['INTEL-timed'],
            next_decision: '继续打听',
            updated_reason: '收到消息',
          },
        ],
        upsert_intel: [],
        remove_intel_ids: ['INTEL-timed'],
        scene_permissions: [
          {
            scene_index: 0,
            scene_type: 'reaction',
            actors: ['安庆商人'],
            usable_fact_ids: ['F-old'],
            usable_intel_ids: ['INTEL-timed'],
            event_ids: [],
          },
        ],
        parallel_world: '【安庆府·市集·午时】\n商人立刻谈起只送往官府的塘报。',
        next_turn_packet: { arrivedIntel: ['东仓可能遭人潜入'], npcKnowledge: [] },
      },
      { worldDays: 5 },
    ),
  /不属于其群体/,
);

assert.throws(
  () =>
    validateEpistemicResult(
      oldState,
      {
        new_facts: [secretFact],
        upsert_events: [],
        upsert_actors: [],
        upsert_intel: [
          {
            id: 'INTEL-forged',
            content: '主角潜入东仓',
            origin: '桐城县',
            destination: '安庆府',
            channel: '密信',
            status: 'in_transit',
            eta: '正月三十日',
            reliability: 0.9,
            known_by: ['方仲嘉'],
            fact_ids: ['F-new-secret'],
            target_groups: ['官府'],
            departed_at: '正月二十六日',
            distance_band: 'nearby_city',
            departed_world_days: 1,
            available_after_world_days: 2,
          },
        ],
        remove_intel_ids: [],
        scene_permissions: [
          {
            scene_index: 0,
            scene_type: 'independent',
            actors: ['桐城更夫'],
            usable_fact_ids: [],
            usable_intel_ids: [],
            event_ids: [],
          },
        ],
        parallel_world: '【桐城县·街巷·子时】\n更夫照常沿街巡夜。',
        next_turn_packet: { arrivedIntel: [], npcKnowledge: [] },
      },
      { worldDays: 1 },
    ),
  /凭空列为当前知情者/,
);

const camelCaseFallback = normalizeModelResult({
  worldStateIncrement: {
    worldSummary: '天下局势暂未发生足以改变全局的明显变化，地方消息仍在按原有渠道缓慢流转。',
    newFacts: [],
    newOrUpdatedEvents: [],
    newOrUpdatedActors: [],
    newIntelPackets: [
      {
        intelId: 'INTEL-camel',
        content: '一封公文正在路上',
        source: '桐城县',
        spreadRange: '安庆府',
      },
    ],
    scenePermissions: [],
    parallelWorld: '【桐城县·官道·午时】\n驿卒牵马经过长亭，尚未抵达安庆府。',
  },
});
assert.equal(camelCaseFallback.next_turn_packet.arrivedIntel.length, 0, '兼容分支不得把新建在途消息误写成已抵达');

console.info('world-engine knowledge-boundary tests passed');
