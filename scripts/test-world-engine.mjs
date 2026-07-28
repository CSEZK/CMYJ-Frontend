import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const fullSource = await readFile(new URL('../src/cmyj-1.7/world-engine/index.js', import.meta.url), 'utf8');
let source = fullSource.slice(fullSource.indexOf('(() =>'));
const end = source.lastIndexOf('})();');
source =
  source.slice(0, end) +
  'globalThis.__cweTest = { normalizeIncrementalResult, buildTransitionFromOperations, normalizeWorldChangeResult, buildTransitionFromChanges, worldChangeSystemPrompt, worldChangeOutputSchema, applyTransition, callWorldModel, normalizeState, buildPersistentMainModelPacket, buildMainModelInjection, normalizeModelRequestError, cancelActiveJob, buildSceneEvidence, buildAutonomyFocus, compactStateForPrompt, buildGenerationLicense, incrementalSystemPrompt, eligibleAssistantMessage, createPendingSettlement, releasePendingSettlementAfterMvu, clearPendingSettlement, waitForStableMessage, settlePendingTicket, registerEvents, getChatState, saveChatState, deleteChatState, reconcileStateStorage, runtime };\n' +
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

const {
  normalizeIncrementalResult,
  buildTransitionFromOperations,
  normalizeWorldChangeResult,
  buildTransitionFromChanges,
  worldChangeSystemPrompt,
  worldChangeOutputSchema,
  applyTransition,
  callWorldModel,
  normalizeState,
  buildPersistentMainModelPacket,
  buildMainModelInjection,
  normalizeModelRequestError,
  cancelActiveJob,
  buildSceneEvidence,
  buildAutonomyFocus,
  compactStateForPrompt,
  buildGenerationLicense,
  incrementalSystemPrompt,
  eligibleAssistantMessage,
  createPendingSettlement,
  releasePendingSettlementAfterMvu,
  clearPendingSettlement,
  waitForStableMessage,
  settlePendingTicket,
  registerEvents,
  getChatState,
  saveChatState,
  deleteChatState,
  reconcileStateStorage,
  runtime,
} = sandbox.__cweTest;
const emptyState = () => ({ activeEvents: [], actors: [], intelPackets: [], hooks: [], secrets: [] });
const currentStat = { 世界运转: { 当前地点: '桐城县和济堂药铺' } };

// 自动触发只能来自真实聊天楼层；任何生成生命周期事件都不得直接创建结算任务。
let triggerMessage = {
  role: 'assistant',
  name: '角色',
  message: '这是一段已经完整写入聊天记录的正文。',
  swipe_id: 0,
  data: {},
};
sandbox.SillyTavern = { getCurrentChatId: () => 'trigger-test-chat' };
sandbox.getLastMessageId = () => 7;
sandbox.getChatMessages = messageId => {
  if (Number(messageId) !== 7) return [];
  return [{ ...triggerMessage }];
};
const triggerHandlers = new Map();
sandbox.eventOn = (eventName, handler) => {
  triggerHandlers.set(eventName, handler);
};
sandbox.tavern_events = {
  GENERATION_STARTED: 'generation-started',
  GENERATE_AFTER_DATA: 'generate-after-data',
  CHAT_COMPLETION_PROMPT_READY: 'chat-completion-ready',
  GENERATE_AFTER_COMBINE_PROMPTS: 'combine-prompts',
  GENERATION_ENDED: 'generation-ended',
  GENERATION_STOPPED: 'generation-stopped',
  MESSAGE_RECEIVED: 'message-received',
  GENERATION_AFTER_COMMANDS: 'generation-after-commands',
  MESSAGE_SWIPED: 'message-swiped',
  MESSAGE_EDITED: 'message-edited',
  MESSAGE_DELETED: 'message-deleted',
  CHAT_CHANGED: 'chat-changed',
};
sandbox.Mvu = { events: { VARIABLE_UPDATE_ENDED: 'mvu-ended' } };
registerEvents();
assert.equal(
  triggerHandlers.has('generation-after-commands'),
  false,
  '插件请求和提示词查看器会触发 GENERATION_AFTER_COMMANDS，该事件不得启动天下演化',
);
assert.equal(triggerHandlers.has('generation-started'), false, '普通生成生命周期不得参与自动结算');
triggerHandlers.get('generate-after-data')({ prompt: [{ role: 'user', content: '插件假请求' }] }, false);
assert.equal(runtime.pendingTicket, null, '普通 API 生成开始不得创建结算票据');
triggerHandlers.get('message-received')(7, 'extension');
assert.equal(runtime.pendingTicket, null, '扩展写入不得创建结算票据');
triggerMessage.message = '...';
triggerHandlers.get('message-received')(7, 'normal');
assert.equal(runtime.pendingTicket, null, '请求开始阶段的省略号占位不得创建结算票据');
triggerMessage.message = '正文完成，MVU 随后会把变量更新写回这一楼。';
triggerHandlers.get('message-received')(7, 'normal');
const firstTicketId = runtime.pendingTicket?.id;
assert.ok(firstTicketId, '真实正文必须创建结算票据');
triggerHandlers.get('message-received')(7, 'normal');
assert.equal(runtime.pendingTicket?.id, firstTicketId, '重复 MESSAGE_RECEIVED 必须合并为同一张票据');
triggerMessage.message += '\n\n<UpdateVariable>_.set("时间", "夜半");</UpdateVariable>';
triggerHandlers.get('mvu-ended')();
triggerHandlers.get('mvu-ended')();
assert.equal(runtime.pendingTicket?.id, firstTicketId, '重复 MVU 结束事件不得创建第二张票据');
const stableKey = await waitForStableMessage(firstTicketId, { intervalMs: 1, stableChecks: 2, timeoutMs: 50 });
assert.equal(stableKey?.hash, eligibleAssistantMessage(7, 'normal')?.hash);
sandbox.getVariables = () => ({
  cmyj_world_engine_v1: {
    version: 1,
    chatId: 'trigger-test-chat',
    revision: 1,
    lastProcessed: stableKey,
  },
});
await Promise.all([settlePendingTicket(firstTicketId, 'mvu'), settlePendingTicket(firstTicketId, 'mvu-fallback')]);
assert.equal(runtime.pendingTicket, null);
delete sandbox.getVariables;

// 明月秋青等脚本可能用启动时旧快照整表 replace 聊天变量。
// 天下演化必须从独立脚本变量备份恢复，并拦截清空前旧副本被重新写回。
const storageChatId = 'storage-conflict-chat';
const chatVariables = {};
const scriptVariables = {};
sandbox.SillyTavern = { getCurrentChatId: () => storageChatId };
sandbox.getVariables = option => {
  if (option?.type === 'script') return scriptVariables[option.script_id] || {};
  return chatVariables;
};
sandbox.insertOrAssignVariables = (patch, option) => {
  const target =
    option?.type === 'script'
      ? (scriptVariables[option.script_id] ||= {})
      : chatVariables;
  Object.assign(target, structuredClone(patch));
  return target;
};
sandbox.deleteVariable = (key, option) => {
  const target =
    option?.type === 'script'
      ? (scriptVariables[option.script_id] ||= {})
      : chatVariables;
  delete target[key];
};

const protectedState = saveChatState(
  normalizeState(
    {
      version: 1,
      chatId: storageChatId,
      revision: 4,
      lastProcessed: { messageId: 12, swipeId: 0, hash: 'protected-state' },
    },
    storageChatId,
  ),
);
assert.equal(protectedState._storageRevision, 1, '首次双写必须生成独立存储修订号');
assert.equal(
  scriptVariables['cmyj-world-engine-backup-v1'].cmyj_world_engine_backups_v1[storageChatId].state.revision,
  4,
  '保存主状态时必须同步独立脚本变量备份',
);

delete chatVariables.cmyj_world_engine_v1;
chatVariables.mqzn_chat_data = { summaries: [{ version: 1 }] };
const recoveredMissingState = getChatState();
assert.equal(recoveredMissingState.revision, 4, '聊天变量主副本被整表删除后必须从备份恢复');
assert.equal(chatVariables.cmyj_world_engine_v1.revision, 4, '恢复结果必须重新写回聊天变量');

chatVariables.cmyj_world_engine_v1 = {
  ...structuredClone(protectedState),
  revision: 1,
  _storageRevision: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const recoveredStaleState = getChatState();
assert.equal(recoveredStaleState.revision, 4, '无存储版本的旧快照不得覆盖较新的独立备份');
assert.equal(chatVariables.cmyj_world_engine_v1._storageRevision, 1);

const advancedState = saveChatState(
  normalizeState(
    {
      ...recoveredStaleState,
      revision: 5,
      lastProcessed: { messageId: 14, swipeId: 0, hash: 'advanced-state' },
    },
    storageChatId,
  ),
);
assert.equal(advancedState._storageRevision, 2);
chatVariables.cmyj_world_engine_v1 = structuredClone(protectedState);
const recoveredVersionedSnapshot = getChatState();
assert.equal(recoveredVersionedSnapshot.revision, 5, '带旧存储版本的快照也必须让位于最新独立备份');
assert.equal(chatVariables.cmyj_world_engine_v1._storageRevision, 2);

deleteChatState();
assert.equal(chatVariables.cmyj_world_engine_v1, undefined, '主动清空必须删除聊天变量主副本');
assert.equal(
  scriptVariables['cmyj-world-engine-backup-v1'].cmyj_world_engine_backups_v1[storageChatId].deleted,
  true,
  '主动清空必须写入独立删除标记',
);
chatVariables.cmyj_world_engine_v1 = structuredClone(advancedState);
const clearedState = getChatState();
assert.equal(clearedState.revision, 0, '清空前旧副本被其他脚本写回时不得复活');
assert.equal(chatVariables.cmyj_world_engine_v1, undefined, '删除标记必须再次移除外部写回的旧副本');

const restartedState = saveChatState(
  normalizeState({ version: 1, chatId: storageChatId, revision: 1 }, storageChatId),
);
assert.ok(restartedState._storageRevision > 3, '清空后重新演化必须越过删除标记并建立新世代');
assert.equal(getChatState().revision, 1, '清空后的新演化状态必须正常保存');
assert.equal(reconcileStateStorage().recovered, false, '状态一致时完整性检查不应重复写回');

// 目击许可必须以剔除状态栏后的正文为准：状态栏滞后不能抹掉正文明确出场者，
// 但只在 initvar 中出现的远方人物也不能被误判为目击者。
const sceneEvidence = buildSceneEvidence(
  emptyState(),
  {
    世界运转: { 当前地点: '桐城县和济堂药铺后宅' },
    人物: {
      杨尔铭: { 是否在场: false },
      方孔炤: { 是否在场: false },
    },
  },
  '杨尔铭赶到后宅，当面扶起主角。<initvar>方孔炤：是否在场 false</initvar>',
);
assert.deepEqual(Array.from(sceneEvidence.reliableWitnesses), ['杨尔铭']);
assert.equal(sceneEvidence.excludedKnownActors.includes('方孔炤'), true);
assert.equal(sceneEvidence.excludedKnownActors.includes('杨尔铭'), false);

// 生成许可把人物可用的因果 ID 按类型预先列明，避免模型把 TF-* 填成 event/received_intel。
const licensedState = normalizeState(
  {
    version: 1,
    chatId: 'test-chat',
    revision: 2,
    activeEvents: [
      {
        id: 'EV-fang-duty',
        title: '安庆守备',
        stage: '整饬中',
        location: '安庆府',
        actors: ['方孔炤'],
        summary: '方孔炤整饬守备。',
        nextTrigger: '流寇前锋抵近安庆时',
        status: 'active',
      },
    ],
    actors: [
      {
        id: 'AC-fang',
        name: '方孔炤',
        location: '安庆府',
        goal: '守住府城',
        currentAction: '清点城防',
        knowledge: ['流寇逼近安庆'],
        doesNotKnow: ['桐城后宅刚发生的事情'],
      },
    ],
    intelPackets: [
      {
        id: 'IN-fang',
        content: '流寇前锋已过潜山',
        origin: '潜山塘报',
        destination: '方孔炤',
        channel: '塘马',
        status: '已抵达',
        eta: '已经抵达',
        reliability: 0.9,
        knownBy: ['方孔炤'],
      },
    ],
    hooks: [],
    secrets: [],
    turnFacts: [],
  },
  'test-chat',
);
const autonomyFocus = buildAutonomyFocus(licensedState, '');
const canonicalState = compactStateForPrompt(licensedState, '', autonomyFocus);
const generationLicense = buildGenerationLicense(licensedState, canonicalState, sceneEvidence, autonomyFocus);
assert.deepEqual(Array.from(generationLicense.witnessPolicy.allowedNames), ['杨尔铭']);
assert.equal(generationLicense.patchTargets.actors[0].id, 'AC-fang');
assert.equal(generationLicense.safeAutonomyCandidates[0].independentAction.cause_id, 'AC-fang');
assert.deepEqual(Array.from(generationLicense.safeAutonomyCandidates[0].receivedIntelCauseIds), ['IN-fang']);
assert.deepEqual(Array.from(generationLicense.safeAutonomyCandidates[0].eventCauseIds), ['EV-fang-duty']);
assert.match(incrementalSystemPrompt(), /先读取 GENERATION_LICENSE/);
assert.match(incrementalSystemPrompt(), /silentPreflight/);
assert.match(worldChangeSystemPrompt(), /不是正文审查员/);
assert.doesNotMatch(worldChangeSystemPrompt(), /GENERATION_LICENSE|silentPreflight|turn_facts/);
assert.equal(worldChangeOutputSchema().value.properties.schema_version.enum[0], 3);

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
        knowledge: ['王承恩正在暗查宫门值守'],
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
assert.equal(migratedState.actors[0].knowledgeLedger[0].state, 'known');
assert.equal(migratedState.actors[0].knowledgeLedger[0].sourceType, 'legacy');
assert.match(migratedState.hooks[0].id, /^HK-/);

// 下一轮主模型同时收到本轮变化与仍未结束的核心状态，但不接收完整档案或平行世界正文。
const mainModelState = normalizeState(
  {
    version: 1,
    chatId: 'test-chat',
    revision: 7,
    nextTurnPacket: {
      offscreenMoves: ['张三｜位于桐城县｜正在查账'],
      arrivingIntel: ['张三的回报已经送达'],
      intelInTransit: ['密信甲｜起点：京师｜终点：桐城县'],
      npcKnowledge: [{ name: '张三', knows: ['账册有缺页'], doesNotKnow: ['缺页在李四手中'] }],
      activePressures: ['新近事件｜地点：桐城县｜局势刚有变化'],
      pendingConsequences: ['新近伏线｜触发：三日后'],
      uncertainties: ['密信甲内容未核实｜可靠度：60%'],
      constraints: ['不得提前泄露密信内容'],
    },
    activeEvents: [
      {
        id: 'EV-new',
        title: '新近事件',
        summary: '局势刚有变化',
        stage: '进行中',
        status: 'active',
        location: '桐城县',
        actors: ['张三'],
        nextTrigger: '张三交账时',
        updatedAt: '2026-07-26T12:00:00.000Z',
      },
      {
        id: 'EV-old',
        title: '持续事件',
        summary: '城外粮价仍在上涨',
        stage: '发酵中',
        status: 'active',
        location: '桐城县外',
        actors: ['李四'],
        nextTrigger: '粮船仍未抵达时',
        updatedAt: '2026-07-25T12:00:00.000Z',
      },
    ],
    actors: [
      {
        id: 'AC-zhang',
        name: '张三',
        location: '桐城县',
        goal: '查清账目',
        currentAction: '正在查账',
        knowledge: ['账册有缺页'],
        doesNotKnow: ['缺页在李四手中'],
        nextDecision: '回报主角',
        updatedReason: '本轮变化',
        updatedAt: '2026-07-26T12:00:00.000Z',
      },
      {
        id: 'AC-li',
        name: '李四',
        location: '城外粮仓',
        goal: '保住粮仓',
        currentAction: '连夜清点存粮',
        knowledge: ['粮价上涨'],
        doesNotKnow: ['粮船已经改道'],
        knowledgeLedger: [
          {
            state: 'suspected',
            content: '粮商可能暗中囤粮',
            sourceType: 'received_intel',
            sourceId: 'IN-old',
            confidence: 0.5,
          },
          {
            state: 'believed',
            content: '粮船仍会按期抵达',
            sourceType: 'told_by_actor',
            sourceId: 'AC-zhang',
            confidence: 0.7,
          },
        ],
        nextDecision: '天亮后寻找粮商',
        updatedReason: '持续行动',
        updatedAt: '2026-07-25T12:00:00.000Z',
      },
    ],
    intelPackets: [
      {
        id: 'IN-new',
        content: '密信甲',
        origin: '京师',
        destination: '桐城县',
        channel: '驿递',
        status: '传播中',
        eta: '三日后',
        reliability: 0.6,
        knownBy: ['张三'],
        updatedAt: '2026-07-26T12:00:00.000Z',
      },
      {
        id: 'IN-old',
        content: '旧驿报仍在途中',
        origin: '南京',
        destination: '桐城县',
        channel: '民驿',
        status: '在途',
        eta: '五日后',
        reliability: 0.9,
        knownBy: [],
        updatedAt: '2026-07-25T12:00:00.000Z',
      },
      {
        id: 'IN-arrived',
        content: '已经公开的旧京报',
        origin: '京师',
        destination: '桐城县',
        channel: '官驿',
        status: '已抵达',
        eta: '昨日',
        reliability: 0.95,
        knownBy: ['众人'],
        updatedAt: '2026-07-24T12:00:00.000Z',
      },
    ],
    hooks: [
      {
        id: 'HK-new',
        title: '新近伏线',
        summary: '三日后有人登门',
        stage: '逼近',
        visibleSigns: [],
        trigger: '三日后',
        failCondition: '来客改道',
        updatedAt: '2026-07-26T12:00:00.000Z',
      },
      {
        id: 'HK-old',
        title: '持续伏线',
        summary: '旧债主仍在寻找主角',
        stage: '潜伏',
        visibleSigns: [],
        trigger: '债主发现主角行踪',
        failCondition: '旧债已清',
        updatedAt: '2026-07-25T12:00:00.000Z',
      },
    ],
    secrets: [
      {
        id: 'SEC-ledger',
        title: '缺页下落',
        content: '账册缺页藏在李四的旧木箱中',
        level: 'critical',
        holders: ['张三'],
        revealConditions: ['张三亲口告知或李四亲自发现'],
        status: 'hidden',
        sourceType: 'CURRENT_TURN',
        sourceId: 'CURRENT_TURN',
        updatedAt: '2026-07-26T12:00:00.000Z',
      },
    ],
    parallelTurns: [
      {
        messageId: 6,
        swipeId: 0,
        revision: 7,
        scenes: [
          {
            location: '城外',
            time: '夜间',
            actors: ['李四'],
            action: '清点存粮',
            body: '这段平行世界正文绝不能注入主模型。',
          },
        ],
      },
    ],
  },
  'test-chat',
);
const persistentPacket = buildPersistentMainModelPacket(mainModelState);
assert.equal(
  persistentPacket.offscreenMoves.some(item => item.includes('张三')),
  false,
);
assert.equal(
  persistentPacket.offscreenMoves.some(item => item.includes('李四')),
  true,
);
assert.equal(
  persistentPacket.activePressures.some(item => item.includes('新近事件')),
  false,
);
assert.equal(
  persistentPacket.activePressures.some(item => item.includes('持续事件')),
  true,
);
assert.equal(
  persistentPacket.pendingConsequences.some(item => item.includes('持续伏线')),
  true,
);
assert.equal(
  persistentPacket.intelInTransit.some(item => item.includes('旧驿报仍在途中')),
  true,
);
assert.equal(
  persistentPacket.intelInTransit.some(item => item.includes('已经公开的旧京报')),
  false,
);
assert.ok(persistentPacket.offscreenMoves.length <= 4);

const mainModelInjection = buildMainModelInjection(mainModelState, '李四正在城外粮仓清点存粮。');
assert.match(mainModelInjection, /本轮新近变化/);
assert.match(mainModelInjection, /持续核心状态（未在本轮更新，但仍未结束）/);
assert.match(mainModelInjection, /张三的回报已经送达/);
assert.match(mainModelInjection, /城外粮价仍在上涨/);
assert.match(mainModelInjection, /旧债主仍在寻找主角/);
assert.match(mainModelInjection, /连夜清点存粮/);
assert.match(mainModelInjection, /秘密与信息盲区登记簿/);
assert.match(mainModelInjection, /账册缺页藏在李四的旧木箱中/);
assert.match(mainModelInjection, /人物：李四/);
assert.match(mainModelInjection, /仅为怀疑：粮商可能暗中囤粮/);
assert.match(mainModelInjection, /主观相信但未证实：粮船仍会按期抵达/);
assert.match(mainModelInjection, /明确不知道：粮船已经改道/);
assert.match(mainModelInjection, /秘密权限：无/);
assert.match(mainModelInjection, /合法知情者.*白名单/s);
assert.match(mainModelInjection, /持续核心状态.*不代表.*本轮/s);
assert.doesNotMatch(mainModelInjection, /这段平行世界正文绝不能注入主模型/);

// 知识与秘密只做本地因果校验：合法传播写入，模型臆造的“公开消息”直接拒绝，不增加第二次生成调用。
const knowledgeBase = normalizeState(
  {
    version: 1,
    chatId: 'test-chat',
    revision: 2,
    activeEvents: [],
    actors: [
      {
        id: 'AC-zhang',
        name: '张三',
        location: '城南',
        goal: '守住旧账',
        currentAction: '看守佛塔',
        knowledge: [],
        doesNotKnow: [],
        nextDecision: '等待风声',
        updatedReason: '既有档案',
      },
      {
        id: 'AC-li',
        name: '李四',
        location: '粮仓',
        goal: '查明粮船去向',
        currentAction: '核对驿报',
        knowledge: [],
        doesNotKnow: ['旧账册藏在城南佛塔夹层'],
        nextDecision: '寻找张三',
        updatedReason: '既有档案',
      },
    ],
    intelPackets: [
      {
        id: 'IN-grain',
        content: '粮船已经改道芜湖',
        origin: '上游码头',
        destination: '李四',
        channel: '驿递',
        status: '已抵达',
        eta: '本日',
        reliability: 0.9,
        knownBy: ['李四'],
      },
    ],
    hooks: [],
    secrets: [
      {
        id: 'SEC-old-ledger',
        title: '旧账册下落',
        content: '旧账册藏在城南佛塔夹层',
        level: 'critical',
        holders: ['张三'],
        revealConditions: ['张三亲口告知'],
        status: 'hidden',
        sourceType: 'legacy',
        sourceId: '既有档案',
      },
    ],
  },
  'test-chat',
);
const knowledgeResult = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 2,
    turn_facts: [
      {
        id: 'TF-ledger-suspect',
        content: '粮仓账册可能被人调换',
        visibility: 'scene_visible',
        witnesses: ['李四'],
        evidence: '怀疑粮仓账册可能被人调换',
        location: '粮仓',
        physical_result: '账册墨迹存在可疑差异',
        traces: ['墨迹差异'],
        discovery_conditions: ['近距离核对账册墨迹'],
      },
      {
        id: 'TF-copy-found',
        content: '账房夹层另藏一份赊粮副本',
        visibility: 'scene_visible',
        witnesses: ['李四'],
        evidence: '发现里面确有一份赊粮副本',
        location: '账房',
        physical_result: '账房夹层内存在一份赊粮副本',
        traces: ['夹层被掀开', '赊粮副本'],
        discovery_conditions: ['打开账房夹层'],
      },
      {
        id: 'TF-ledger-told',
        content: '旧账册藏在城南佛塔夹层',
        visibility: 'addressed',
        witnesses: ['张三', '李四'],
        evidence: '张三随后亲口告诉李四：旧账册藏在城南佛塔夹层',
        location: '粮仓',
        physical_result: '李四已听见张三说明旧账册下落',
        traces: [],
        discovery_conditions: [],
      },
    ],
    operations: [
      {
        type: 'knowledge.grant',
        value: {
          actor_name: '李四',
          content: '粮船已经改道芜湖',
          source_type: 'received_intel',
          source_id: 'IN-grain',
          confidence: 0.9,
        },
      },
      {
        type: 'knowledge.suspect',
        value: {
          actor_name: '李四',
          content: '粮仓账册可能被人调换',
          source_type: 'direct_observation',
          source_id: 'TF-ledger-suspect',
          confidence: 0.45,
        },
      },
      {
        type: 'knowledge.grant',
        value: {
          actor_name: '李四',
          content: '皇帝已经秘密南迁',
          source_type: 'public_information',
          source_id: 'CURRENT_TURN',
          confidence: 0.95,
        },
      },
      {
        type: 'knowledge.grant',
        value: {
          actor_name: '张三',
          content: '粮船已经改道芜湖',
          source_type: 'public_information',
          source_id: 'IN-grain',
          confidence: 0.9,
        },
      },
      {
        type: 'knowledge.grant',
        value: {
          actor_name: '李四',
          content: '旧账册藏在城南佛塔夹层',
          source_type: 'told_by_actor',
          source_id: 'AC-zhang',
          source_actor_id: 'AC-zhang',
          source_actor_name: '张三',
          confidence: 0.9,
        },
      },
      {
        type: 'secret.upsert',
        id: 'SEC-new-ledger',
        value: {
          title: '账房副本',
          content: '账房夹层另藏一份赊粮副本',
          level: 'high',
          holders: ['李四'],
          reveal_conditions: ['李四亲自取出副本'],
          status: 'hidden',
          source_type: 'direct_observation',
          source_id: 'TF-copy-found',
        },
      },
      {
        type: 'secret.upsert',
        id: 'SEC-remote-leak',
        value: {
          title: '越权知情者',
          content: '账房夹层另藏一份赊粮副本',
          level: 'high',
          holders: ['王五'],
          reveal_conditions: ['王五得知'],
          status: 'hidden',
          source_type: 'direct_observation',
          source_id: 'TF-copy-found',
        },
      },
      {
        type: 'secret.reveal',
        id: 'SEC-old-ledger',
        value: {
          actor_name: '李四',
          source_type: 'told_by_actor',
          source_id: 'TF-ledger-told',
          source_actor_id: 'AC-zhang',
          source_actor_name: '张三',
          confidence: 0.9,
        },
      },
    ],
    parallel_scenes: [],
  },
  2,
);
const currentTurnText =
  '李四核对墨迹后，怀疑粮仓账册可能被人调换。他又掀开账房夹层，发现里面确有一份赊粮副本。张三随后亲口告诉李四：旧账册藏在城南佛塔夹层。';
const knowledgeTransition = buildTransitionFromOperations(knowledgeBase, knowledgeResult, currentStat, currentTurnText);
assert.equal(
  knowledgeTransition.operation_stats.accepted,
  7,
  JSON.stringify(knowledgeTransition.operation_stats, null, 2),
);
assert.equal(
  knowledgeTransition.operation_stats.rejected,
  4,
  JSON.stringify(knowledgeTransition.operation_stats, null, 2),
);
const knowledgeWarnings = knowledgeTransition.operation_stats.warnings.join('\n');
assert.match(knowledgeWarnings, /CURRENT_TURN 不再直接授予人物知识/);
assert.match(knowledgeWarnings, /公开信息来源 IN-grain 不存在或尚未公开/);
assert.match(knowledgeWarnings, /没有证据表明\s*张三\s*已向\s*李四\s*传达该知识/);
assert.match(knowledgeWarnings, /秘密知情者不全在本轮事实 TF-copy-found 的合法目击者中/);

const knowledgeApplied = applyTransition(
  knowledgeBase,
  knowledgeTransition,
  { messageId: 8, swipeId: 0, hash: 'knowledge-test' },
  currentStat,
);
const updatedLi = knowledgeApplied.actors.find(actor => actor.id === 'AC-li');
assert.equal(updatedLi.knowledge.includes('粮船已经改道芜湖'), true);
assert.equal(
  updatedLi.knowledgeLedger.some(item => item.state === 'suspected' && item.content === '粮仓账册可能被人调换'),
  true,
);
assert.equal(updatedLi.knowledge.includes('皇帝已经秘密南迁'), false);
assert.equal(
  knowledgeApplied.actors.find(actor => actor.id === 'AC-zhang').knowledge.includes('粮船已经改道芜湖'),
  false,
);
assert.equal(
  knowledgeApplied.secrets.some(secret => secret.id === 'SEC-remote-leak'),
  false,
);
assert.equal(updatedLi.doesNotKnow.includes('旧账册藏在城南佛塔夹层'), false);
assert.equal(knowledgeApplied.secrets.find(secret => secret.id === 'SEC-old-ledger').holders.includes('李四'), true);

const parallelKnowledgeResult = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: knowledgeApplied.revision,
    operations: [
      {
        type: 'knowledge.grant',
        value: {
          actor_name: '李四',
          content: '佛塔梁上刻着米铺暗记',
          source_type: 'direct_observation',
          source_id: 'PARALLEL_SCENE_1',
          confidence: 0.85,
        },
      },
      {
        type: 'knowledge.grant',
        value: {
          actor_name: '李四',
          content: '佛塔梁上刻着米铺暗记',
          source_type: 'direct_observation',
          source_id: 'FAKE_SCENE',
          confidence: 0.85,
        },
      },
    ],
    parallel_scenes: [
      {
        location: '城南佛塔',
        time: '夜间',
        actors: ['李四'],
        action: '查看梁上暗记',
        body: '李四举灯细看，发现佛塔梁上刻着米铺暗记。',
      },
    ],
  },
  knowledgeApplied.revision,
);
const parallelKnowledgeTransition = buildTransitionFromOperations(
  knowledgeApplied,
  parallelKnowledgeResult,
  currentStat,
  '',
);
assert.equal(parallelKnowledgeTransition.operation_stats.accepted, 1);
assert.equal(parallelKnowledgeTransition.operation_stats.rejected, 1);
assert.match(parallelKnowledgeTransition.operation_stats.warnings[0], /直接观察缺少在场人物或可核对场景/);

// 人物行动 patch 不能再夹带 knowledge，并且已有知识账本不能在行动更新时被清空。
const smuggledKnowledge = buildTransitionFromOperations(
  knowledgeApplied,
  normalizeIncrementalResult(
    {
      schema_version: 2,
      base_revision: knowledgeApplied.revision,
      operations: [
        {
          type: 'actor.patch',
          id: 'AC-li',
          set: {
            name: '李四',
            current_action: '前往城南佛塔',
            updated_reason: '收到张三告知',
            knowledge: ['无来源的额外秘密'],
          },
        },
      ],
      parallel_scenes: [],
    },
    knowledgeApplied.revision,
  ),
  currentStat,
  currentTurnText,
);
assert.equal(smuggledKnowledge.operation_stats.accepted, 1);
assert.equal(smuggledKnowledge.upsert_actors[0].knowledge.includes('无来源的额外秘密'), false);
const patchedKnowledgeState = applyTransition(
  knowledgeApplied,
  smuggledKnowledge,
  { messageId: 9, swipeId: 0, hash: 'actor-patch-test' },
  currentStat,
);
assert.equal(
  patchedKnowledgeState.actors
    .find(actor => actor.id === 'AC-li')
    .knowledgeLedger.some(item => item.content === '粮船已经改道芜湖'),
  true,
);

// 模型字段顺序不应影响依赖：即使 actor.patch 写在 intel.upsert 前，也先结算情报再校验人物行动。
const dependencyOrderTransition = buildTransitionFromOperations(
  knowledgeApplied,
  normalizeIncrementalResult(
    {
      schema_version: 2,
      base_revision: knowledgeApplied.revision,
      turn_facts: [],
      operations: [
        {
          type: 'actor.patch',
          id: 'AC-li',
          set: {
            name: '李四',
            current_action: '处理盐船已经抵达渡口的消息',
            updated_reason: '收到渡口驿报',
            cause_type: 'received_intel',
            cause_id: 'IN-order-test',
            basis_ids: ['IN-order-test'],
          },
        },
        {
          type: 'intel.upsert',
          id: 'IN-order-test',
          value: {
            content: '盐船已经抵达渡口',
            origin: '渡口巡丁',
            destination: '李四',
            channel: '驿报',
            status: '已抵达',
            eta: '本轮',
            reliability: 0.9,
            known_by: ['李四'],
            source_fact_ids: [],
          },
        },
      ],
      parallel_scenes: [],
    },
    knowledgeApplied.revision,
  ),
  currentStat,
  '',
);
assert.equal(dependencyOrderTransition.operation_stats.accepted, 2);
assert.equal(dependencyOrderTransition.operation_stats.rejected, 0);
assert.equal(dependencyOrderTransition.upsert_actors[0].cause_id, 'IN-order-test');

// 无人目击的玩家行为只改变客观世界：不能瞬间驱动远方人物、情报、知识或旁线。
const hiddenActionBase = normalizeState(
  {
    version: 1,
    chatId: 'hidden-action-chat',
    revision: 0,
    activeEvents: [],
    actors: [
      {
        id: 'AC-wang',
        name: '王五',
        location: '城东客栈',
        goal: '寻找失踪密信',
        currentAction: '在客栈等待线索',
        knowledge: [],
        doesNotKnow: ['苏大郎把密信藏进井台石缝'],
        nextDecision: '等待可靠消息',
        updatedReason: '既有档案',
      },
    ],
    intelPackets: [],
    hooks: [],
    secrets: [],
  },
  'hidden-action-chat',
);
const hiddenActionText = '苏大郎趁无人注意，把密信藏进井台石缝。合上石板后，井台石缝表面留下一道新擦痕。';
const hiddenActionResult = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 0,
    turn_facts: [
      {
        id: 'TF-hidden-letter',
        content: '苏大郎把密信藏进井台石缝',
        visibility: 'private',
        witnesses: ['王五'],
        evidence: '苏大郎趁无人注意，把密信藏进井台石缝',
        location: '井台',
        physical_result: '密信位于井台石缝，石缝表面留有一道新擦痕',
        traces: ['井台石缝表面留下一道新擦痕'],
        discovery_conditions: ['靠近井台检查石缝'],
      },
    ],
    operations: [
      {
        type: 'actor.patch',
        id: 'AC-wang',
        set: {
          name: '王五',
          current_action: '赶往井台取出苏大郎藏下的密信',
          updated_reason: '发现苏大郎藏信',
          cause_type: 'observation',
          cause_id: 'TF-hidden-letter',
          basis_ids: ['TF-hidden-letter'],
        },
      },
      {
        type: 'intel.upsert',
        value: {
          content: '苏大郎把密信藏进井台石缝',
          origin: '王五',
          destination: '城东同党',
          channel: '口信',
          status: '已抵达',
          eta: '立即',
          reliability: 0.9,
          known_by: ['王五'],
          source_fact_ids: ['TF-hidden-letter'],
        },
      },
      {
        type: 'knowledge.grant',
        value: {
          actor_name: '王五',
          content: '苏大郎把密信藏进井台石缝',
          source_type: 'direct_observation',
          source_id: 'TF-hidden-letter',
          confidence: 0.95,
        },
      },
      {
        type: 'secret.upsert',
        value: {
          title: '密信藏处',
          content: '苏大郎把密信藏进井台石缝',
          level: 'high',
          holders: [],
          reveal_conditions: ['检查井台石缝并发现痕迹'],
          status: 'hidden',
          source_type: 'direct_observation',
          source_id: 'TF-hidden-letter',
        },
      },
    ],
    parallel_scenes: [
      {
        location: '城东客栈',
        time: '片刻后',
        actors: ['王五'],
        action: '得知藏信地点后动身',
        body: '王五已经知道苏大郎把密信藏进井台石缝，立刻出门取信。',
        basis_ids: ['AC-wang'],
        knowledge_claim_ids: ['TF-hidden-letter'],
      },
    ],
  },
  0,
);
const hiddenActionTransition = buildTransitionFromOperations(
  hiddenActionBase,
  hiddenActionResult,
  currentStat,
  hiddenActionText,
);
assert.equal(
  hiddenActionTransition.operation_stats.accepted,
  2,
  JSON.stringify(hiddenActionTransition.operation_stats),
);
assert.equal(
  hiddenActionTransition.operation_stats.rejected,
  4,
  JSON.stringify(hiddenActionTransition.operation_stats),
);
assert.equal(hiddenActionTransition.turn_facts[0].visibility, 'private');
assert.deepEqual(Array.from(hiddenActionTransition.turn_facts[0].witnesses), []);
assert.equal(hiddenActionTransition.upsert_actors.length, 0);
assert.equal(hiddenActionTransition.upsert_intel.length, 0);
assert.equal(hiddenActionTransition.knowledge_updates.length, 0);
assert.equal(hiddenActionTransition.parallel_scenes.length, 0);
assert.match(hiddenActionTransition.operation_stats.warnings.join('\n'), /不是本轮事实 TF-hidden-letter 的合法目击者/);
assert.match(hiddenActionTransition.operation_stats.warnings.join('\n'), /情报起点 王五 不是本轮事实/);
assert.match(hiddenActionTransition.operation_stats.warnings.join('\n'), /无权使用本轮事实 TF-hidden-letter/);

const hiddenActionApplied = applyTransition(
  hiddenActionBase,
  hiddenActionTransition,
  { messageId: 10, swipeId: 0, hash: 'hidden-action' },
  currentStat,
);
assert.equal(hiddenActionApplied.turnFacts.length, 1);
assert.equal(hiddenActionApplied.turnFacts[0].witnesses.length, 0);
assert.equal(hiddenActionApplied.actors[0].knowledge.length, 0);
assert.equal(hiddenActionApplied.parallelTurns.length, 0);
const hiddenActionInjection = buildMainModelInjection(hiddenActionApplied, hiddenActionText);
assert.match(hiddenActionInjection, /无人目击事实「苏大郎把密信藏进井台石缝」/);
assert.match(hiddenActionInjection, /任何 NPC 当前都不知道/);

// 后续只允许从实际出现的痕迹得到有限结论，不能反推出隐藏行为或行为人。
const traceDiscoveryResult = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: hiddenActionApplied.revision,
    turn_facts: [],
    operations: [
      {
        type: 'trace.discover',
        id: 'TF-hidden-letter',
        value: {
          actor_name: '王五',
          trace: '井台石缝表面留下一道新擦痕',
          conclusion: '井台石缝最近被人动过',
          source_type: 'direct_observation',
          source_id: 'PARALLEL_SCENE_1',
          confidence: 0.85,
        },
      },
    ],
    parallel_scenes: [
      {
        location: '井台',
        time: '次日清晨',
        actors: ['王五'],
        action: '检查井台石缝',
        body: '王五察看井台，发现井台石缝表面留下一道新擦痕，只能判断这里最近被人动过。',
        basis_ids: ['AC-wang'],
        knowledge_claim_ids: ['TF-hidden-letter'],
      },
    ],
  },
  hiddenActionApplied.revision,
);
const traceDiscoveryTransition = buildTransitionFromOperations(
  hiddenActionApplied,
  traceDiscoveryResult,
  currentStat,
  '',
);
assert.equal(
  traceDiscoveryTransition.operation_stats.accepted,
  1,
  JSON.stringify(traceDiscoveryTransition.operation_stats),
);
assert.equal(traceDiscoveryTransition.operation_stats.rejected, 0);
assert.equal(traceDiscoveryTransition.parallel_scenes.length, 1);
assert.equal(traceDiscoveryTransition.knowledge_updates[0].content, '井台石缝最近被人动过');
const traceDiscoveryApplied = applyTransition(
  hiddenActionApplied,
  traceDiscoveryTransition,
  { messageId: 11, swipeId: 0, hash: 'trace-discovery' },
  currentStat,
);
assert.equal(traceDiscoveryApplied.actors[0].knowledge.includes('井台石缝最近被人动过'), true);
assert.equal(traceDiscoveryApplied.actors[0].knowledge.includes('苏大郎把密信藏进井台石缝'), false);
assert.equal(traceDiscoveryApplied.turnFacts[0].discoveredBy[0].actorName, '王五');

// 模型把 evidence 改写成近义句、写错 TF 别名或使用“邻里传闻”作为公开消息起点时，本地应修复引用而非误删。
const repairableFactBase = normalizeState(
  {
    version: 1,
    chatId: 'repairable-fact-chat',
    revision: 0,
    activeEvents: [],
    actors: [
      {
        id: 'AC-li-si',
        name: '李四',
        location: '西街',
        goal: '维持街面秩序',
        currentAction: '在西街巡查',
        knowledge: [],
        doesNotKnow: [],
        nextDecision: '留意城门动静',
        updatedReason: '既有档案',
      },
    ],
    intelPackets: [],
    hooks: [],
    secrets: [],
  },
  'repairable-fact-chat',
);
const repairableFactText = '李四站在西街高声宣布：城门今夜提前关闭。围观的街坊听后纷纷议论。';
const repairableFactTransition = buildTransitionFromOperations(
  repairableFactBase,
  normalizeIncrementalResult(
    {
      schema_version: 2,
      base_revision: 0,
      turn_facts: [
        {
          id: 'TF-local',
          content: '城门今夜提前关闭',
          visibility: 'local_public',
          witnesses: ['李四'],
          evidence: '李四在西街宣布今晚会提早关闭城门',
          location: '西街',
          physical_result: '城门关闭时间提前',
          traces: ['西街街坊开始议论'],
          discovery_conditions: [],
        },
      ],
      operations: [
        {
          type: 'event.upsert',
          value: {
            title: '城门提前关闭',
            stage: '本轮',
            status: '进行中',
            location: '西街',
            actors: ['李四'],
            summary: '城门今夜提前关闭，街面通行时间缩短。',
            next_trigger: '闭门时刻到来',
            source_fact_ids: ['TF-does-not-exist'],
          },
        },
        {
          type: 'intel.upsert',
          value: {
            content: '城门今夜提前关闭',
            origin: '西街邻里传闻',
            destination: '城中各坊',
            channel: '口耳相传',
            status: '传播中',
            eta: '一个时辰后',
            reliability: 0.85,
            known_by: [],
            source_fact_ids: ['TF-local'],
          },
        },
      ],
      parallel_scenes: [],
    },
    0,
  ),
  currentStat,
  repairableFactText,
);
assert.equal(repairableFactTransition.turn_facts.length, 1);
assert.equal(repairableFactTransition.turn_facts[0].evidence, '李四站在西街高声宣布：城门今夜提前关闭。');
assert.equal(
  repairableFactTransition.operation_stats.rejected,
  0,
  JSON.stringify(repairableFactTransition.operation_stats),
);
assert.equal(repairableFactTransition.upsert_events[0].source_fact_ids.length, 1);
assert.equal(repairableFactTransition.upsert_intel[0].source_fact_ids.length, 1);

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

const simpleResult = normalizeWorldChangeResult({
  schema_version: 3,
  base_revision: 0,
  changes: [
    {
      op: 'create',
      target: { collection: 'actors', id: 'NPC-shen-dazhu' },
      value: {
        name: '沈大柱',
        location: '沈记肉铺',
        goal: '保住铺子',
        currentAction: '清点存货',
        updatedReason: '天亮后重新开门',
      },
    },
  ],
  scenes: [
    {
      based_on: [0],
      location: '沈记肉铺',
      time: '清晨',
      actors: ['沈大柱'],
      action: '清点存货',
      body: '沈大柱逐一查看昨夜留下的货物，把缺项记到账本上。',
    },
  ],
});
const simpleTransition = buildTransitionFromChanges(emptyState(), simpleResult);
assert.equal(simpleTransition.operation_stats.accepted, 1);
assert.equal(simpleTransition.upsert_actors[0].id, 'NPC-shen-dazhu');
assert.equal(simpleTransition.parallel_scenes.length, 1);
assert.deepEqual(
  normalizeWorldChangeResult({ schema_version: 3, base_revision: 0, changes: [], scenes: [] }).changes,
  [],
);
const mergeBase = {
  ...emptyState(),
  activeEvents: [
    {
      id: 'EV-grain',
      title: '粮价异动',
      stage: '发酵',
      status: 'active',
      location: '开封',
      actors: ['粮商'],
      summary: '数家粮行惜售',
      nextTrigger: '官仓决定是否放粮',
      impactDomains: ['民生'],
    },
  ],
};
const mergeTransition = buildTransitionFromChanges(mergeBase, {
  changes: [
    {
      op: 'merge',
      target: { collection: 'events', id: 'EV-grain' },
      changes: { stage: '扩散', summary: '惜售已经扩散到城南粮行' },
    },
  ],
  scenes: [
    {
      based_on: [1],
      location: '开封',
      time: '午后',
      actors: ['粮商'],
      action: '闭门',
      body: '一间粮行落下门板。',
    },
  ],
});
assert.equal(mergeTransition.operation_stats.accepted, 1);
assert.equal(mergeTransition.upsert_events[0].next_trigger, '官仓决定是否放粮');
assert.equal(mergeTransition.parallel_scenes.length, 0);
assert.match(mergeTransition.operation_stats.warnings.at(-1), /based_on/);

let generationCalls = 0;
sandbox.generateRaw = async config => {
  generationCalls += 1;
  sandbox.__lastWorldModelConfig = config;
  return {
    schema_version: 3,
    base_revision: 0,
    changes: [
      {
        op: 'create',
        target: { collection: 'actors', id: 'NPC-shen-dazhu' },
        value: {
          name: '沈大柱',
          location: '沈记肉铺',
          goal: '保住铺子',
          currentAction: '清点存货',
          updatedReason: '天亮后重新开门',
        },
      },
    ],
    scenes: [],
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
assert.equal(generated.changes[0].value.name, '沈大柱');
assert.equal(
  Object.prototype.hasOwnProperty.call(sandbox.__lastWorldModelConfig, 'json_schema'),
  false,
  '天下演化不得默认向代理发送原生 json_schema',
);
assert.match(
  sandbox.__lastWorldModelConfig.ordered_prompts.at(-1).content,
  /【JSON 兼容输出模式】/,
  '天下演化必须把结构约束写入提示词',
);
assert.match(normalizeModelRequestError(new Error('<none>')).message, /没有返回具体错误信息/);
assert.match(
  normalizeModelRequestError(new Error('Bad Request'), '提示词约 42000 字符，输出上限 4000 tokens').message,
  /提示词约 42000 字符/,
);

const oversizedContext = '天下设定与人物档案。'.repeat(12000);
await callWorldModel(
  {
    baseRevision: 0,
    currentTurn: {
      assistantOutput: '本轮正文。'.repeat(6000),
      userInputAsIntentOnly: '玩家意图。'.repeat(3000),
      mvuChanges: [],
    },
    recentContextReadOnly: [{ role: 'assistant', content: oversizedContext }],
    canonicalState: {
      actors: Array.from({ length: 30 }, (_, index) => ({
        id: `AC-${index}`,
        name: `人物${index}`,
        knowledge: Array.from({ length: 30 }, () => oversizedContext.slice(0, 500)),
      })),
    },
  },
  'cwe-budget-test',
  {
    prompts: [
      { role: 'system', content: oversizedContext },
      { role: 'user', content: oversizedContext },
      { role: 'assistant', content: oversizedContext },
    ],
    includesCurrentReply: true,
  },
  oversizedContext,
);
const budgetedPromptChars = sandbox.__lastWorldModelConfig.ordered_prompts.reduce(
  (total, prompt) => total + String(prompt.content || '').length,
  0,
);
assert.ok(budgetedPromptChars <= 42000, `提示词预算失效：${budgetedPromptChars}`);
assert.ok(sandbox.__lastWorldModelConfig.custom_api.max_tokens <= 8000);
assert.match(
  sandbox.__lastWorldModelConfig.ordered_prompts.map(prompt => prompt.content).join('\n'),
  /已按天下演化请求预算省略中段/,
);

let cancelledGenerationId = '';
sandbox.stopGenerationById = generationId => {
  cancelledGenerationId = generationId;
};
sandbox.generateRaw = () => new Promise(() => {});
const cancelledJob = {
  generationId: 'cwe-cancel-test',
  cancelled: false,
};
runtime.activeJob = cancelledJob;
const cancelledRequest = callWorldModel(
  {
    baseRevision: 0,
    currentTurn: { assistantOutput: '' },
    canonicalState: emptyState(),
  },
  cancelledJob.generationId,
  null,
  '',
  cancelledJob,
);
cancelActiveJob('测试主动取消');
await assert.rejects(cancelledRequest, error => error?.code === 'CWE_CANCELLED');
assert.equal(cancelledGenerationId, cancelledJob.generationId);
assert.equal(cancelledJob.cancelled, true);

assert.match(fullSource, /const VERSION = '1\.8\.3'/);
assert.match(fullSource, /requestTimeoutMs: 90000/);
assert.match(fullSource, /data-setting="requestTimeoutSeconds"/);
assert.match(fullSource, /data-banner-action="cancel"/);
assert.match(fullSource, /stopGenerationById/);
assert.doesNotMatch(fullSource, /json_schema:\s*schema/);
console.info(
  '天下演化测试通过：真实楼层票据、MVU 去重、假请求隔离、存储自愈、主动清空、v3 增量协议、空结果、旁线引用、请求预算、稳定 ID、主动取消与旧档迁移均已覆盖。',
);
