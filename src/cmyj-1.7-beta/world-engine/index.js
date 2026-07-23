import compassSeal from './assets/compass-seal-v2.webp?url';
import ledgerStyles from './styles.raw?raw';
import faithfulStyles from './styles-faithful.raw?raw';
import integratedStyles from './styles-integrated.raw?raw';

(() => {
  'use strict';

  const VERSION = '1.0.0-beta.3';
  const RUNTIME_KEY = '__CMYJWorldEngineV1';
  const CHAT_STATE_KEY = 'cmyj_world_engine_v1';
  const INJECTION_ID = 'cmyj-world-engine-context-v1';
  const LAMP_ID = 'canming-world-engine-lamp';
  const FRAME_ID = 'canming-world-engine-frame';
  const STYLE_ID = 'canming-world-engine-lamp-style';
  const STORAGE_PREFIX = 'canming-world-engine:';
  const STATUSBAR_THEME_KEY = 'canming-afterglow-statusbar:theme';
  const hostWindow = (() => {
    try {
      return window.parent && window.parent !== window ? window.parent : window;
    } catch {
      return window;
    }
  })();
  const hostDocument = hostWindow.document ?? document;

  if (hostWindow[RUNTIME_KEY]?.mounted) return;

  const DEFAULT_SETTINGS = Object.freeze({
    settingsVersion: 2,
    enabled: true,
    autoRun: true,
    lookbackRounds: 3,
    settleDelayMs: 1200,
    connectionMode: 'tavern',
    apiUrl: '',
    apiKey: '',
    apiSource: 'openai',
    model: '',
    temperature: 0.45,
    maxTokens: 5200,
    maxFacts: 240,
  });

  const LIMITS = Object.freeze({
    activeEvents: 24,
    actors: 48,
    intelPackets: 60,
    hooks: 16,
    facts: 240,
    cameraHistory: 18,
    checkpoints: 8,
  });

  const runtime = {
    mounted: true,
    busy: false,
    lastError: '',
    lastNotice: '',
    availableModels: [],
    modelFetchStatus: '',
    modelFetchError: false,
    activeJob: null,
    scheduledTimer: null,
    pendingMessageId: null,
    pendingForce: false,
    selfWrittenMessageHashes: new Map(),
    mvuReady: false,
    themeTimer: null,
    isOpen: false,
    activeTab: 'overview',
    lamp: null,
    frame: null,
    frameDocument: null,
    drag: null,
    dragMoved: false,
    dragJustEnded: false,
    currentChatId: '',
    cleanupFns: [],
  };
  hostWindow[RUNTIME_KEY] = runtime;

  function api(name) {
    return globalThis[name] ?? hostWindow?.[name];
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function clone(value) {
    if (value == null) return value;
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asText(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(
      /[&<>'"]/g,
      char =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;',
        })[char],
    );
  }

  function hashText(text) {
    let hash = 2166136261;
    const input = String(text || '');
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableId(prefix, ...parts) {
    return `${prefix}-${hashText(parts.filter(Boolean).join('|'))}`;
  }

  function readLocal(key, fallback = '') {
    try {
      return localStorage.getItem(`${STORAGE_PREFIX}${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(value));
    } catch {
      /* 浏览器禁用本地存储时保持当前会话可用 */
    }
  }

  function currentStatusbarTheme() {
    try {
      const value = (hostWindow.localStorage ?? localStorage).getItem(STATUSBAR_THEME_KEY) || 'day';
      return ['day', 'night', 'star', 'ink'].includes(value) ? value : 'day';
    } catch {
      return 'day';
    }
  }

  function syncStatusbarTheme() {
    const theme = currentStatusbarTheme();
    const panel = runtime.frameDocument?.querySelector('.cwe-panel');
    if (panel) {
      panel.classList.remove('theme-day', 'theme-night', 'theme-star', 'theme-ink');
      panel.classList.add(`theme-${theme}`);
    }
    const lamp = runtime.lamp;
    if (lamp) {
      lamp.classList.remove('theme-day', 'theme-night', 'theme-star', 'theme-ink');
      lamp.classList.add(`theme-${theme}`);
    }
  }

  function readJsonLocal(key, fallback) {
    try {
      const raw = readLocal(key, '');
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function loadSettings() {
    const raw = readJsonLocal('settings', {});
    const connectionMode = raw?.connectionMode === 'custom' ? 'custom' : 'tavern';
    const enabled = Number(raw?.settingsVersion || 0) >= 2 ? raw?.enabled !== false : true;
    return {
      ...DEFAULT_SETTINGS,
      ...(raw && typeof raw === 'object' ? raw : {}),
      settingsVersion: 2,
      enabled,
      connectionMode,
      lookbackRounds: Math.round(clamp(raw?.lookbackRounds ?? DEFAULT_SETTINGS.lookbackRounds, 1, 8)),
      settleDelayMs: Math.round(clamp(raw?.settleDelayMs ?? DEFAULT_SETTINGS.settleDelayMs, 400, 5000)),
      temperature: clamp(raw?.temperature ?? DEFAULT_SETTINGS.temperature, 0, 1.5),
      maxTokens: Math.round(clamp(raw?.maxTokens ?? DEFAULT_SETTINGS.maxTokens, 1800, 16000)),
      maxFacts: Math.round(clamp(raw?.maxFacts ?? DEFAULT_SETTINGS.maxFacts, 60, LIMITS.facts)),
    };
  }

  let settings = loadSettings();

  function saveSettings(next) {
    settings = {
      ...DEFAULT_SETTINGS,
      ...next,
      settingsVersion: 2,
      connectionMode: next.connectionMode === 'custom' ? 'custom' : 'tavern',
      lookbackRounds: Math.round(clamp(next.lookbackRounds, 1, 8)),
      settleDelayMs: Math.round(clamp(next.settleDelayMs, 400, 5000)),
      temperature: clamp(next.temperature, 0, 1.5),
      maxTokens: Math.round(clamp(next.maxTokens, 1800, 16000)),
      maxFacts: Math.round(clamp(next.maxFacts, 60, LIMITS.facts)),
    };
    writeLocal('settings', JSON.stringify(settings));
    updateLampState();
  }

  function getCurrentChatId() {
    try {
      const tavern = globalThis.SillyTavern ?? hostWindow.SillyTavern;
      const id = tavern?.getCurrentChatId?.();
      if (id != null && String(id).trim()) return String(id);
    } catch {
      /* fall through */
    }
    return '';
  }

  function createEmptyState(chatId = getCurrentChatId()) {
    return {
      version: 1,
      chatId,
      revision: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastProcessed: null,
      clock: { date: '', time: '', location: '', worldDays: 0 },
      worldSummary: '天下档案尚未开始结算。',
      facts: [],
      activeEvents: [],
      actors: [],
      intelPackets: [],
      hooks: [],
      cameraHistory: [],
      nextTurnPacket: {
        hardFacts: [],
        arrivedIntel: [],
        localConsequences: [],
        npcKnowledge: [],
        activePressures: [],
        cameraCandidates: [],
        constraints: [],
      },
      checkpoints: [],
      lastRun: null,
    };
  }

  function normalizePacket(packet) {
    const source = packet && typeof packet === 'object' ? packet : {};
    const stringList = key =>
      asArray(source[key])
        .map(value => asText(value))
        .filter(Boolean)
        .slice(0, 24);
    return {
      hardFacts: stringList('hardFacts'),
      arrivedIntel: stringList('arrivedIntel'),
      localConsequences: stringList('localConsequences'),
      npcKnowledge: asArray(source.npcKnowledge)
        .map(item => ({
          name: asText(item?.name),
          knows: asArray(item?.knows)
            .map(value => asText(value))
            .filter(Boolean)
            .slice(0, 12),
          doesNotKnow: asArray(item?.doesNotKnow)
            .map(value => asText(value))
            .filter(Boolean)
            .slice(0, 12),
        }))
        .filter(item => item.name)
        .slice(0, 20),
      activePressures: stringList('activePressures'),
      cameraCandidates: stringList('cameraCandidates'),
      constraints: stringList('constraints'),
    };
  }

  function normalizeState(raw, chatId = getCurrentChatId()) {
    if (!raw || typeof raw !== 'object' || Number(raw.version) !== 1 || (raw.chatId && raw.chatId !== chatId)) {
      return createEmptyState(chatId);
    }
    const state = { ...createEmptyState(chatId), ...clone(raw), chatId };
    state.facts = asArray(state.facts).slice(-LIMITS.facts);
    state.activeEvents = asArray(state.activeEvents).slice(-LIMITS.activeEvents);
    state.actors = asArray(state.actors).slice(-LIMITS.actors);
    state.intelPackets = asArray(state.intelPackets).slice(-LIMITS.intelPackets);
    state.hooks = asArray(state.hooks).slice(-LIMITS.hooks);
    state.cameraHistory = asArray(state.cameraHistory).slice(-LIMITS.cameraHistory);
    state.checkpoints = asArray(state.checkpoints).slice(-LIMITS.checkpoints);
    state.nextTurnPacket = normalizePacket(state.nextTurnPacket);
    return state;
  }

  function getChatState() {
    const getter = api('getVariables');
    if (typeof getter !== 'function') return createEmptyState();
    const variables = getter({ type: 'chat' }) || {};
    return normalizeState(variables[CHAT_STATE_KEY], getCurrentChatId());
  }

  function saveChatState(state) {
    const writer = api('insertOrAssignVariables');
    if (typeof writer !== 'function') throw new Error('未找到聊天变量写入接口。');
    const normalized = normalizeState({ ...state, updatedAt: nowIso() }, getCurrentChatId());
    writer({ [CHAT_STATE_KEY]: normalized }, { type: 'chat' });
    return normalized;
  }

  function deleteChatState() {
    const deleter = api('deleteVariable');
    if (typeof deleter === 'function') deleter(CHAT_STATE_KEY, { type: 'chat' });
  }

  function compactSnapshot(state) {
    return clone({
      version: 1,
      chatId: state.chatId,
      revision: state.revision,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      lastProcessed: state.lastProcessed,
      clock: state.clock,
      worldSummary: state.worldSummary,
      facts: state.facts,
      activeEvents: state.activeEvents,
      actors: state.actors,
      intelPackets: state.intelPackets,
      hooks: state.hooks,
      cameraHistory: state.cameraHistory,
      nextTurnPacket: state.nextTurnPacket,
      lastRun: state.lastRun,
      checkpoints: [],
    });
  }

  function stateBeforeMessage(state, messageId, force) {
    const lastId = Number(state.lastProcessed?.messageId ?? -1);
    if (!force && lastId < messageId) return clone(state);
    const older = asArray(state.checkpoints)
      .filter(checkpoint => Number(checkpoint.messageId) < messageId && checkpoint.snapshot)
      .sort((a, b) => Number(a.messageId) - Number(b.messageId));
    const base = older.length ? normalizeState(older.at(-1).snapshot, state.chatId) : createEmptyState(state.chatId);
    base.checkpoints = asArray(state.checkpoints)
      .filter(checkpoint => Number(checkpoint.messageId) < messageId)
      .slice(-LIMITS.checkpoints);
    return base;
  }

  function currentMessageKey(messageId) {
    const getMessages = api('getChatMessages');
    if (typeof getMessages !== 'function') return null;
    const selected = getMessages(messageId, { include_swipes: false })?.[0];
    if (!selected || selected.role !== 'assistant') return null;
    const withSwipes = getMessages(messageId, { include_swipes: true })?.[0];
    const swipeId = Number(withSwipes?.swipe_id ?? 0);
    return {
      messageId: Number(messageId),
      swipeId,
      hash: hashText(selected.message),
      message: selected.message || '',
      data: selected.data || {},
    };
  }

  function sameMessageKey(left, right) {
    return Boolean(
      left &&
      right &&
      Number(left.messageId) === Number(right.messageId) &&
      Number(left.swipeId) === Number(right.swipeId) &&
      String(left.hash) === String(right.hash),
    );
  }

  function findLatestAssistantMessageId() {
    const getLast = api('getLastMessageId');
    const getMessages = api('getChatMessages');
    if (typeof getLast !== 'function' || typeof getMessages !== 'function') return -1;
    for (let id = Number(getLast()); id >= 0; id -= 1) {
      const message = getMessages(id)?.[0];
      if (message?.role === 'assistant') return id;
    }
    return -1;
  }

  function stripForContext(message) {
    return String(message || '')
      .replace(/<Analysis>[\s\S]*?<\/Analysis>/gi, '')
      .replace(/<行动选项>[\s\S]*?<\/行动选项>/gi, '')
      .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi, '')
      .replace(/<initvar>[\s\S]*?<\/initvar>/gi, '')
      .replace(/<平行世界(?:\s[^>]*)?>[\s\S]*?<\/平行世界>\s*$/gi, '')
      .replace(/<StatusPlaceHolderImpl\s*\/>/gi, '')
      .trim();
  }

  function buildRecentContext(messageId) {
    const getMessages = api('getChatMessages');
    if (typeof getMessages !== 'function') return [];
    const depth = settings.lookbackRounds * 2 + 2;
    const from = Math.max(0, Number(messageId) - depth);
    return getMessages(`${from}-${messageId}`, { include_swipes: false, hide_state: 'unhidden' })
      .filter(message => message.message_id !== messageId)
      .slice(-(settings.lookbackRounds * 2 + 1))
      .map(message => ({
        messageId: message.message_id,
        role: message.role,
        content: stripForContext(message.message).slice(-9000),
      }))
      .filter(message => message.content);
  }

  function deepDiff(oldValue, newValue, path = '', output = [], limit = 100) {
    if (output.length >= limit) return output;
    if (Object.is(oldValue, newValue)) return output;
    const oldObject = oldValue && typeof oldValue === 'object' && !Array.isArray(oldValue);
    const newObject = newValue && typeof newValue === 'object' && !Array.isArray(newValue);
    if (!oldObject && !newObject) {
      const compact = value => {
        if (typeof value === 'string') return value.slice(0, 500);
        if (Array.isArray(value)) {
          const primitive = value.every(item => item == null || ['string', 'number', 'boolean'].includes(typeof item));
          return primitive ? value.slice(0, 20) : `[复杂数组，共 ${value.length} 项]`;
        }
        return value;
      };
      output.push({ path: path || '/', before: compact(oldValue), after: compact(newValue) });
      return output;
    }
    const keys = new Set([
      ...Object.keys(oldObject ? oldValue : {}),
      ...Object.keys(newObject ? newValue : {}),
    ]);
    for (const key of keys) {
      deepDiff(oldObject ? oldValue[key] : undefined, newObject ? newValue[key] : undefined, `${path}/${key}`, output, limit);
      if (output.length >= limit) break;
    }
    return output;
  }

  function findPreviousStatData(messageId) {
    const getMessages = api('getChatMessages');
    if (typeof getMessages !== 'function') return {};
    for (let id = Number(messageId) - 1; id >= 0; id -= 1) {
      const message = getMessages(id)?.[0];
      if (message?.role !== 'assistant') continue;
      const statData = getMessageStatData(id);
      if (statData) return statData;
    }
    return {};
  }

  function getMessageStatData(messageId) {
    try {
      const mvu = api('Mvu');
      const data = mvu?.getMvuData?.({ type: 'message', message_id: Number(messageId) });
      if (data?.stat_data) return data.stat_data;
    } catch {
      /* MVU 尚未就绪时继续读取楼层附带数据 */
    }
    const message = api('getChatMessages')?.(Number(messageId))?.[0];
    return message?.data?.stat_data || null;
  }

  function findPreviousUserInput(messageId) {
    const getMessages = api('getChatMessages');
    if (typeof getMessages !== 'function') return '';
    for (let id = Number(messageId) - 1; id >= 0; id -= 1) {
      const message = getMessages(id)?.[0];
      if (message?.role === 'user') return stripForContext(message.message).slice(-12000);
    }
    return '';
  }

  function clockFromStatData(statData) {
    const world = statData?.世界运转 || {};
    const hour = world?.二十四时?.小时;
    const minute = world?.二十四时?.分钟;
    return {
      date: asText(world.当前日期),
      time: Number.isFinite(Number(hour))
        ? `${String(hour).padStart(2, '0')}:${String(Number(minute) || 0).padStart(2, '0')}`
        : '',
      location: asText(world.当前地点),
      worldDays: Number(world.世界运转天数) || 0,
    };
  }

  function buildKnowledgeReference(statData, currentText) {
    const text = String(currentText || '');
    const location = asText(statData?.世界运转?.当前地点);
    const takeRelevantRecord = (record, max) =>
      Object.fromEntries(
        Object.entries(record || {})
          .filter(([name]) => text.includes(name) || location.includes(name))
          .slice(0, max),
      );
    const people = {};
    for (const [category, records] of Object.entries(statData?.人际网络 || {})) {
      const selected = takeRelevantRecord(records, 10);
      if (Object.keys(selected).length) people[category] = selected;
    }
    return {
      world: statData?.世界运转 || {},
      relevantKnownRegions: takeRelevantRecord(statData?.天下地图?.地区态势, 8),
      relevantKnownFactions: takeRelevantRecord(statData?.时局与任务?.势力关系, 10),
      relevantKnownPeople: people,
    };
  }

  function relevantMemories(state, currentText) {
    const haystack = String(currentText || '');
    const scored = asArray(state.facts).map(fact => {
      const terms = [fact.location, ...asArray(fact.actors), fact.content]
        .flatMap(value => String(value || '').split(/[\s，。；、：]/))
        .map(value => value.trim())
        .filter(value => value.length >= 2);
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? Math.min(term.length, 6) : 0), 0);
      return { fact, score };
    });
    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(item => item.fact);
  }

  function compactStateForPrompt(state, currentText) {
    return {
      clock: state.clock,
      worldSummary: state.worldSummary,
      activeEvents: state.activeEvents,
      actors: state.actors,
      intelPackets: state.intelPackets,
      hooks: state.hooks,
      recentFacts: asArray(state.facts).slice(-36),
      retrievedMemories: relevantMemories(state, currentText),
      cameraHistory: state.cameraHistory,
    };
  }

  function systemPrompt() {
    return `你是《残明余烬》的“天下演化史官”。你读取主模型已经完成的正文，将其中真正发生的事情结构化，并让不在玩家视野内的明末世界沿因果继续运转。你还要亲自撰写本轮的“平行世界”镜头；脚本会把它直接追加到刚完成的主模型消息末尾，主模型不会代写这一部分。

铁律：
1. 玩家输入只是意图，绝不能直接视为成功事实。以主模型正文实际描写的结果为准。
2. CURRENT_TURN 是唯一主要新增事实来源；RECENT_CONTEXT 只用于消解代词、承接行动和避免重复，禁止把旧事实再次提交。
3. 区分 occurred（已经发生）、planned（计划）、ordered（命令已下但结果未知）、reported（某人声称）、rumor（传闻）、failed（失败）、aborted（中止）和 descriptive（纯纹理）。只有 occurred 能直接进入硬事实。
4. 对话只证明说话者说过这句话，不证明话中内容真实。平行世界的叙述性事实属于客观世界；其中人物对话仍可能误判、撒谎或夸大。
5. 模型知道不等于人物知道。所有知识必须有目击、告知、公文、书信、驿传、商旅或流言等渠道。秘密不会瞬间传播。
6. 叙事回合不等于日期推进。正文时间未推进时，可以推进同一时刻的细小行动，不可让军队瞬移、工程完工或城池无因易手。
7. 历史时间线是未受干预时的惯性，不是强制剧本。不得跳过前提直接播放历史结果。
8. 已在 CANONICAL_STATE 中存在的事件要推进或解决，不要换名字重复创建。ID 应稳定、简短、可读。
9. 主角认知变量不等于客观真相。传闻写入认知账本时，客观世界仍可保持“待确认”。
10. 输出严格符合 JSON Schema。内容使用简体中文，简洁但保留因果。
11. 顶层字段名必须原样使用 snake_case：
world_summary、new_facts、upsert_events、resolve_event_ids、upsert_actors、upsert_intel、remove_intel_ids、upsert_hooks、resolve_hook_ids、camera_history、next_turn_packet、parallel_world。
12. parallel_world 必须是可以直接展示给玩家的成品正文：写 2 个玩家当前视角之外的电影式场景，每段以【地名·地点·时辰】单独起行，场景之间空一行。优先推进已有事件、人物行动和情报传播；若素材不足，只写低风险日常切片，不得凭空决定城池陷落、重要人物死亡或军队胜败。
13. parallel_world 内不要再包裹 <平行世界> 标签；脚本会统一添加标签。禁止“与此同时”“玩家不知道的是”“镜头转向”等转场句，也不要使用星号或破折号分隔线。

你的输出同时完成：事实提取、世界状态增量、后续主模型联动包，以及本轮平行世界正文。不要输出 JSON 之外的解释。`;
  }

  function outputSchema() {
    const stringArray = { type: 'array', items: { type: 'string' } };
    return {
      name: 'canming_world_engine_transition',
      description: '残明余烬天下演化的结构化增量',
      strict: true,
      value: {
        type: 'object',
        additionalProperties: false,
        required: [
          'world_summary',
          'new_facts',
          'upsert_events',
          'resolve_event_ids',
          'upsert_actors',
          'upsert_intel',
          'remove_intel_ids',
          'upsert_hooks',
          'resolve_hook_ids',
          'camera_history',
          'next_turn_packet',
          'parallel_world',
        ],
        properties: {
          world_summary: { type: 'string' },
          new_facts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'id',
                'content',
                'status',
                'scope',
                'location',
                'actors',
                'witnesses',
                'publicity',
                'confidence',
                'importance',
                'evidence',
              ],
              properties: {
                id: { type: 'string' },
                content: { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['occurred', 'planned', 'ordered', 'reported', 'rumor', 'failed', 'aborted', 'descriptive'],
                },
                scope: { type: 'string', enum: ['player_scene', 'parallel_world', 'variable_update'] },
                location: { type: 'string' },
                actors: stringArray,
                witnesses: stringArray,
                publicity: { type: 'string' },
                confidence: { type: 'number' },
                importance: { type: 'number' },
                evidence: { type: 'string' },
              },
            },
          },
          upsert_events: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'id',
                'title',
                'stage',
                'status',
                'location',
                'actors',
                'summary',
                'next_trigger',
                'source_fact_ids',
              ],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                stage: { type: 'string' },
                status: { type: 'string' },
                location: { type: 'string' },
                actors: stringArray,
                summary: { type: 'string' },
                next_trigger: { type: 'string' },
                source_fact_ids: stringArray,
              },
            },
          },
          resolve_event_ids: stringArray,
          upsert_actors: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'id',
                'name',
                'location',
                'goal',
                'current_action',
                'knowledge',
                'next_decision',
                'updated_reason',
              ],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                location: { type: 'string' },
                goal: { type: 'string' },
                current_action: { type: 'string' },
                knowledge: stringArray,
                next_decision: { type: 'string' },
                updated_reason: { type: 'string' },
              },
            },
          },
          upsert_intel: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'id',
                'content',
                'origin',
                'destination',
                'channel',
                'status',
                'eta',
                'reliability',
                'known_by',
              ],
              properties: {
                id: { type: 'string' },
                content: { type: 'string' },
                origin: { type: 'string' },
                destination: { type: 'string' },
                channel: { type: 'string' },
                status: { type: 'string' },
                eta: { type: 'string' },
                reliability: { type: 'number' },
                known_by: stringArray,
              },
            },
          },
          remove_intel_ids: stringArray,
          upsert_hooks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'id',
                'title',
                'stage',
                'summary',
                'visible_signs',
                'trigger',
                'fail_condition',
                'source_fact_ids',
              ],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                stage: { type: 'string' },
                summary: { type: 'string' },
                visible_signs: stringArray,
                trigger: { type: 'string' },
                fail_condition: { type: 'string' },
                source_fact_ids: stringArray,
              },
            },
          },
          resolve_hook_ids: stringArray,
          camera_history: stringArray,
          parallel_world: { type: 'string' },
          next_turn_packet: {
            type: 'object',
            additionalProperties: false,
            required: [
              'hardFacts',
              'arrivedIntel',
              'localConsequences',
              'npcKnowledge',
              'activePressures',
              'cameraCandidates',
              'constraints',
            ],
            properties: {
              hardFacts: stringArray,
              arrivedIntel: stringArray,
              localConsequences: stringArray,
              npcKnowledge: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'knows', 'doesNotKnow'],
                  properties: { name: { type: 'string' }, knows: stringArray, doesNotKnow: stringArray },
                },
              },
              activePressures: stringArray,
              cameraCandidates: stringArray,
              constraints: stringArray,
            },
          },
        },
      },
    };
  }

  function buildRequestPayload(baseState, messageKey, currentStat = getMessageStatData(messageKey.messageId) || {}) {
    const getMessages = api('getChatMessages');
    const current = getMessages(messageKey.messageId)?.[0];
    const previousStat = findPreviousStatData(messageKey.messageId);
    return {
      instruction: '只从 CURRENT_TURN 提交本轮新事实。RECENT_CONTEXT 与 CANONICAL_STATE 均为只读。',
      currentTurn: {
        messageId: messageKey.messageId,
        swipeId: messageKey.swipeId,
        userInputAsIntentOnly: findPreviousUserInput(messageKey.messageId),
        assistantOutput: stripForContext(current?.message || '').slice(0, 30000),
        currentClock: clockFromStatData(currentStat),
        mvuChanges: deepDiff(previousStat, currentStat).slice(0, 100),
        currentKnowledgeReference: buildKnowledgeReference(currentStat, current?.message || ''),
      },
      recentContextReadOnly: buildRecentContext(messageKey.messageId),
      canonicalState: compactStateForPrompt(baseState, current?.message || ''),
    };
  }

  function customApiConfig() {
    if (settings.connectionMode !== 'custom') {
      return null;
    }
    if (!settings.apiUrl) throw new Error('独立 API 模式尚未填写 API 地址。');
    return {
      apiurl: settings.apiUrl.replace(/\/+$/, ''),
      key: settings.apiKey,
      ...(settings.model ? { model: settings.model } : {}),
      source: settings.apiSource || 'openai',
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
    };
  }

  function parseAiResult(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (Array.isArray(raw.tool_calls)) throw new Error('副模型返回了工具调用，而不是结构化结果。');
      return raw;
    }
    const text = String(raw || '').trim();
    if (!text) throw new Error('副模型没有返回内容。');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const body = (fenced || text).trim();
    try {
      return JSON.parse(body);
    } catch {
      const start = body.indexOf('{');
      const end = body.lastIndexOf('}');
      if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
      throw new Error('副模型输出不是合法 JSON。');
    }
  }

  function requireParallelWorld(result) {
    if (!asText(result?.parallel_world)) {
      throw new Error('副模型结构缺少 parallel_world 平行世界正文。');
    }
    return result;
  }

  function normalizeModelResult(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('副模型输出缺少可用的结构化对象。');
    }
    if (
      'world_summary' in result ||
      'new_facts' in result ||
      'upsert_events' in result ||
      'next_turn_packet' in result
    ) {
      return requireParallelWorld({
        ...result,
        parallel_world: asText(
          result.parallel_world || result.parallelWorld || result.parallelWorldText || result.parallel_world_text,
        ),
      });
    }

    // 部分兼容 OpenAI 的服务会忽略 json_schema，但仍返回语义完整的常见 camelCase 结构。
    // 在本地归一化它，避免请求成功却被误判成“新增 0 条”。
    const incrementCandidates = [
      result.worldStateIncrement,
      result.transition,
      result.data,
      result.result,
      result,
    ];
    const increment = incrementCandidates.find(
      item =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        ('worldSummary' in item ||
          'newOrUpdatedEvents' in item ||
          'newFacts' in item ||
          'nextTurnPacket' in item ||
          'promptsForMainModel' in item),
    );
    if (!increment) {
      throw new Error('副模型没有按天下演化结构返回结果。');
    }
    const facts = asArray(result.extractedFacts || increment.extractedFacts || increment.newFacts || increment.facts);
    const events = asArray(increment.newOrUpdatedEvents || increment.events || increment.upsertEvents);
    const actors = asArray(increment.newOrUpdatedActors || increment.actors || increment.upsertActors);
    const intel = asArray(increment.newIntelPackets || increment.intelPackets || increment.upsertIntel);
    const prompts = asArray(increment.promptsForMainModel)
      .map(value => asText(value))
      .filter(Boolean);
    const camera = asText(increment.cameraActivity);

    return requireParallelWorld({
      world_summary: asText(increment.worldSummary),
      new_facts: facts.map((item, index) => ({
        id: asText(item?.id || item?.factId || `F-${index + 1}`),
        content: asText(item?.content || item?.fact),
        status: asText(item?.status, 'occurred'),
        scope: asText(item?.scope, 'player_scene'),
        location: asText(item?.location),
        actors: asArray(item?.actors),
        witnesses: asArray(item?.witnesses),
        publicity: asText(item?.publicity),
        confidence: Number(item?.confidence ?? 0.8),
        importance: Number(item?.importance ?? 60),
        evidence: asText(item?.evidence || item?.source),
      })),
      upsert_events: events.map(item => ({
        id: asText(item?.id || item?.eventId),
        title: asText(item?.title || item?.eventName),
        stage: asText(item?.stage || item?.status),
        status: asText(item?.status, 'active'),
        location: asText(item?.location),
        actors: asArray(item?.actors || item?.participants),
        summary: asText(item?.summary || item?.description),
        next_trigger: asText(item?.next_trigger || item?.nextTrigger || item?.impact),
        source_fact_ids: asArray(item?.source_fact_ids || item?.sourceFactIds),
      })),
      resolve_event_ids: asArray(increment.resolveEventIds),
      upsert_actors: actors.map(item => ({
        id: asText(item?.id || item?.actorId),
        name: asText(item?.name || item?.actorName),
        location: asText(item?.location),
        goal: asText(item?.goal || asArray(item?.knownMotivations).join('；')),
        current_action: asText(item?.current_action || item?.currentAction || item?.currentStatus),
        knowledge: asArray(item?.knowledge),
        next_decision: asText(item?.next_decision || item?.nextDecision),
        updated_reason: asText(item?.updated_reason || item?.updatedReason || item?.currentStatus),
      })),
      upsert_intel: intel.map(item => ({
        id: asText(item?.id || item?.intelId),
        content: asText(item?.content),
        origin: asText(item?.origin || item?.source),
        destination: asText(item?.destination || item?.spreadRange),
        channel: asText(item?.channel, '传闻'),
        status: asText(item?.status, '传播中'),
        eta: asText(item?.eta),
        reliability: Number(item?.reliability ?? 0.65),
        known_by: asArray(item?.known_by || item?.knownBy),
      })),
      remove_intel_ids: asArray(increment.removeIntelIds),
      upsert_hooks: asArray(increment.newOrUpdatedHooks),
      resolve_hook_ids: asArray(increment.resolveHookIds),
      camera_history: camera ? [camera] : [],
      parallel_world: asText(
        result.parallelWorld ||
          result.parallelWorldText ||
          increment.parallelWorld ||
          increment.parallelWorldText ||
          increment.parallel_world ||
          camera,
      ),
      next_turn_packet: {
        hardFacts: facts.map(item => asText(item?.content || item?.fact)).filter(Boolean),
        arrivedIntel: intel.map(item => asText(item?.content)).filter(Boolean),
        localConsequences: events.map(item => asText(item?.impact)).filter(Boolean),
        npcKnowledge: actors
          .map(item => ({
            name: asText(item?.name || item?.actorName),
            knows: asArray(item?.knowledge),
            doesNotKnow: [],
          }))
          .filter(item => item.name),
        activePressures: events
          .filter(item => asText(item?.status).toLowerCase() !== 'resolved')
          .map(item => asText(item?.description || item?.summary))
          .filter(Boolean),
        cameraCandidates: camera ? [camera] : [],
        constraints: prompts,
      },
    });
  }

  async function callWorldModel(payload, generationId) {
    const generateRaw = api('generateRaw');
    const generate = api('generate');
    if (typeof generateRaw !== 'function' && typeof generate !== 'function')
      throw new Error('未找到 generateRaw/generate 接口。');
    const userPrompt = `以下内容分为可结算的 CURRENT_TURN 与只读历史。请完成事实提取和世界增量。\n\n${JSON.stringify(payload, null, 2)}`;
    const customApi = customApiConfig();
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const retryHint = attempt ? '\n\n上次输出未通过解析。此次必须严格只返回符合 Schema 的 JSON。' : '';
      const config = {
        generation_id: generationId,
        should_silence: true,
        ordered_prompts: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: `${userPrompt}${retryHint}` },
        ],
        json_schema: outputSchema(),
      };
      if (customApi) config.custom_api = customApi;
      try {
        const request =
          typeof generateRaw === 'function'
            ? generateRaw(config)
            : generate({
                generation_id: generationId,
                should_silence: true,
                user_input: `${systemPrompt()}\n\n${userPrompt}${retryHint}`,
                json_schema: outputSchema(),
                ...(customApi ? { custom_api: customApi } : {}),
              });
        const raw = await Promise.race([
          request,
          new Promise((_, reject) =>
            setTimeout(() => {
              try {
                api('stopGenerationById')?.(generationId);
              } catch {
                /* 请求超时后停止失败也要正常释放界面 */
              }
              reject(new Error('副模型请求超过 90 秒仍未返回，请检查当前连接或更换模型。'));
            }, 90000),
          ),
        ]);
        return normalizeModelResult(parseAiResult(raw));
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const canRetry = /JSON|Schema|结构|工具调用|解析/i.test(message);
        if (!canRetry) break;
      }
    }
    throw lastError || new Error('天下推演失败。');
  }

  function cleanId(value, prefix, ...parts) {
    const text = asText(value)
      .replace(/[^\p{L}\p{N}_.·-]+/gu, '-')
      .slice(0, 80);
    return text || stableId(prefix, ...parts);
  }

  function upsertById(current, updates, limit, prefix, normalizer) {
    const map = new Map(
      asArray(current)
        .filter(item => item?.id)
        .map(item => [String(item.id), item]),
    );
    for (const raw of asArray(updates)) {
      const normalized = normalizer(raw);
      if (!normalized) continue;
      normalized.id = cleanId(normalized.id, prefix, JSON.stringify(normalized));
      map.set(normalized.id, { ...(map.get(normalized.id) || {}), ...normalized, updatedAt: nowIso() });
    }
    return [...map.values()].slice(-limit);
  }

  function applyTransition(baseState, result, messageKey, currentStat) {
    const state = clone(baseState);
    const source = result && typeof result === 'object' ? result : {};
    state.revision = Number(state.revision || 0) + 1;
    state.clock = clockFromStatData(currentStat || {});
    state.worldSummary = asText(source.world_summary, state.worldSummary).slice(0, 5000);

    const newFacts = asArray(source.new_facts)
      .map(raw => ({
        id: cleanId(raw?.id, 'F', raw?.content, messageKey.messageId),
        content: asText(raw?.content),
        status: asText(raw?.status, 'descriptive'),
        scope: asText(raw?.scope, 'player_scene'),
        location: asText(raw?.location),
        actors: asArray(raw?.actors)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 20),
        witnesses: asArray(raw?.witnesses)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 24),
        publicity: asText(raw?.publicity),
        confidence: clamp(raw?.confidence, 0, 1),
        importance: Math.round(clamp(raw?.importance, 0, 100)),
        evidence: asText(raw?.evidence).slice(0, 500),
        source: { messageId: messageKey.messageId, swipeId: messageKey.swipeId, hash: messageKey.hash },
        createdAt: nowIso(),
      }))
      .filter(fact => fact.content && fact.status !== 'descriptive' && fact.confidence >= 0.45);
    state.facts = upsertById(state.facts, newFacts, settings.maxFacts, 'F', item => item);

    const resolvedEvents = new Set(asArray(source.resolve_event_ids).map(String));
    state.activeEvents = asArray(state.activeEvents).filter(item => !resolvedEvents.has(String(item.id)));
    state.activeEvents = upsertById(state.activeEvents, source.upsert_events, LIMITS.activeEvents, 'EV', raw => {
      if (!asText(raw?.title) && !asText(raw?.summary)) return null;
      return {
        id: raw?.id,
        title: asText(raw?.title),
        stage: asText(raw?.stage),
        status: asText(raw?.status, 'active'),
        location: asText(raw?.location),
        actors: asArray(raw?.actors)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 20),
        summary: asText(raw?.summary).slice(0, 1200),
        nextTrigger: asText(raw?.next_trigger),
        sourceFactIds: asArray(raw?.source_fact_ids)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 20),
      };
    });

    state.actors = upsertById(state.actors, source.upsert_actors, LIMITS.actors, 'NPC', raw => {
      if (!asText(raw?.name)) return null;
      return {
        id: raw?.id,
        name: asText(raw?.name),
        location: asText(raw?.location),
        goal: asText(raw?.goal),
        currentAction: asText(raw?.current_action),
        knowledge: asArray(raw?.knowledge)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 30),
        nextDecision: asText(raw?.next_decision),
        updatedReason: asText(raw?.updated_reason).slice(0, 600),
      };
    });

    const removedIntel = new Set(asArray(source.remove_intel_ids).map(String));
    state.intelPackets = asArray(state.intelPackets).filter(item => !removedIntel.has(String(item.id)));
    state.intelPackets = upsertById(state.intelPackets, source.upsert_intel, LIMITS.intelPackets, 'INTEL', raw => {
      if (!asText(raw?.content)) return null;
      return {
        id: raw?.id,
        content: asText(raw?.content),
        origin: asText(raw?.origin),
        destination: asText(raw?.destination),
        channel: asText(raw?.channel),
        status: asText(raw?.status),
        eta: asText(raw?.eta),
        reliability: clamp(raw?.reliability, 0, 1),
        knownBy: asArray(raw?.known_by)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 30),
      };
    });

    const resolvedHooks = new Set(asArray(source.resolve_hook_ids).map(String));
    state.hooks = asArray(state.hooks).filter(item => !resolvedHooks.has(String(item.id)));
    state.hooks = upsertById(state.hooks, source.upsert_hooks, LIMITS.hooks, 'HOOK', raw => {
      if (!asText(raw?.title) && !asText(raw?.summary)) return null;
      return {
        id: raw?.id,
        title: asText(raw?.title),
        stage: asText(raw?.stage),
        summary: asText(raw?.summary).slice(0, 1000),
        visibleSigns: asArray(raw?.visible_signs)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 16),
        trigger: asText(raw?.trigger),
        failCondition: asText(raw?.fail_condition),
        sourceFactIds: asArray(raw?.source_fact_ids)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 20),
      };
    });

    state.cameraHistory = [
      ...state.cameraHistory,
      ...asArray(source.camera_history)
        .map(value => asText(value))
        .filter(Boolean),
    ].slice(-LIMITS.cameraHistory);
    state.nextTurnPacket = normalizePacket(source.next_turn_packet);
    state.lastProcessed = { messageId: messageKey.messageId, swipeId: messageKey.swipeId, hash: messageKey.hash };
    state.lastRun = {
      at: nowIso(),
      newFactCount: newFacts.length,
      sourceMessageId: messageKey.messageId,
      sourceSwipeId: messageKey.swipeId,
    };
    const checkpoint = {
      messageId: messageKey.messageId,
      swipeId: messageKey.swipeId,
      hash: messageKey.hash,
      revision: state.revision,
      createdAt: nowIso(),
      snapshot: null,
    };
    state.checkpoints = [
      ...asArray(baseState.checkpoints).filter(item => Number(item.messageId) < messageKey.messageId),
      checkpoint,
    ].slice(-LIMITS.checkpoints);
    checkpoint.snapshot = compactSnapshot(state);
    return normalizeState(state, state.chatId);
  }

  function formatBulletSection(title, items) {
    const values = asArray(items)
      .map(value => asText(value))
      .filter(Boolean);
    if (!values.length) return '';
    return `${title}:\n${values.map(value => `- ${value}`).join('\n')}`;
  }

  function buildMainModelInjection(state) {
    const packet = normalizePacket(state.nextTurnPacket);
    const knowledge = packet.npcKnowledge
      .map(item => {
        const knows = item.knows.length ? `已知：${item.knows.join('；')}` : '已知：无新增信息';
        const doesNotKnow = item.doesNotKnow.length ? `未知：${item.doesNotKnow.join('；')}` : '';
        return `- ${item.name}：${knows}${doesNotKnow ? `；${doesNotKnow}` : ''}`;
      })
      .join('\n');
    const sections = [
      `<天下演化上下文 version="${state.revision}">`,
      `世界时点：${[state.clock.date, state.clock.time, state.clock.location].filter(Boolean).join(' · ') || '沿用正文当前时点'}`,
      `客观世界摘要：${state.worldSummary || '暂无已结算摘要。'}`,
      formatBulletSection('客观硬事实', packet.hardFacts),
      formatBulletSection('本轮可能抵达主角处的情报', packet.arrivedIntel),
      formatBulletSection('当前地点可观察后果', packet.localConsequences),
      knowledge ? `相关人物知识边界:\n${knowledge}` : '',
      formatBulletSection('正在施压的世界事件', packet.activePressures),
      formatBulletSection('本轮约束', packet.constraints),
      `主模型联动协议：
 - 正文只允许人物使用其有合理渠道知道的内容；模型知道不等于人物知道。
 - 只负责玩家当前视角内的正文、变量更新、状态栏与行动选项，不要生成、续写或仿写 <平行世界> 标签块。
 - 平行世界由天下演化副模型在本轮正文与 MVU 更新完成后独立生成，并由脚本追加到当前消息末尾。
 - 不得让远方人物知晓尚未通过合理渠道传播的玩家秘密；世界不是围着玩家运转。
 - 未经上下文许可，不得突然确定城池陷落、人物死亡、军队胜败等重大结果。
 - 玩家本轮输入仍须由正文判定成败，本上下文不能替代行动判定。
 - 上一轮消息中的 <平行世界> 是已经发生的客观旁线，可作为世界因果参考，但不可视为当前人物自动知情。`,
      '</天下演化上下文>',
    ].filter(Boolean);
    return sections.join('\n\n');
  }

  function clearInjection() {
    const uninject = api('uninjectPrompts');
    if (typeof uninject === 'function') {
      try {
        uninject([INJECTION_ID]);
      } catch {
        /* older helper versions may not have an existing injection */
      }
    }
  }

  function refreshInjection(state = getChatState()) {
    clearInjection();
    if (!settings.enabled) return;
    const inject = api('injectPrompts');
    if (typeof inject !== 'function') return;
    inject([
      {
        id: INJECTION_ID,
        position: 'in_chat',
        depth: 0,
        role: 'system',
        content: buildMainModelInjection(state),
        should_scan: true,
      },
    ]);
  }

  function jobStillValid(job) {
    if (!job || job.cancelled) return false;
    if (getCurrentChatId() !== job.chatId) return false;
    const current = currentMessageKey(job.messageKey.messageId);
    return sameMessageKey(current, job.messageKey);
  }

  async function waitForMessageVariables(messageId, job, timeoutMs = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (!jobStillValid(job)) return null;
      const statData = getMessageStatData(messageId);
      if (statData) return statData;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    console.warn(`[天下演化] 第 ${messageId} 楼在等待期内未发现 stat_data，将使用现有正文继续结算。`);
    return {};
  }

  function normalizeParallelWorldText(value) {
    return asText(value)
      .replace(/^\s*<平行世界(?:\s[^>]*)?>/i, '')
      .replace(/<\/平行世界>\s*$/i, '')
      .replace(/^\s*(?:与此同时|玩家不知道的是|镜头转向)[：:，,\s]*/gm, '')
      .trim()
      .slice(0, 12000);
  }

  function messageWithParallelWorld(message, parallelWorld) {
    const mainOutput = String(message || '')
      .replace(/<平行世界(?:\s[^>]*)?>[\s\S]*?<\/平行世界>\s*$/i, '')
      .trimEnd();
    return `${mainOutput}\n\n<平行世界>\n${parallelWorld}\n</平行世界>`;
  }

  async function writeParallelWorldToMessage(messageKey, result) {
    const parallelWorld = normalizeParallelWorldText(result?.parallel_world);
    if (!parallelWorld) throw new Error('副模型没有生成可回写的平行世界正文。');
    const setMessages = api('setChatMessages');
    if (typeof setMessages !== 'function') throw new Error('未找到聊天消息回写接口，无法追加平行世界。');

    const current = currentMessageKey(messageKey.messageId);
    if (!sameMessageKey(current, messageKey)) throw new Error('正文版本已经改变，本次平行世界不会写入。');
    const message = messageWithParallelWorld(current.message, parallelWorld);
    const expectedHash = hashText(message);
    runtime.selfWrittenMessageHashes.set(messageKey.messageId, expectedHash);
    try {
      await setMessages([{ message_id: messageKey.messageId, message }], { refresh: 'affected' });
    } catch (error) {
      runtime.selfWrittenMessageHashes.delete(messageKey.messageId);
      throw error;
    }

    const updatedKey = currentMessageKey(messageKey.messageId);
    if (!updatedKey || updatedKey.swipeId !== messageKey.swipeId || updatedKey.message !== message) {
      throw new Error('平行世界回写后未能确认消息内容，请检查酒馆助手版本。');
    }
    return updatedKey;
  }

  async function processMessage(messageId, { force = false, source = 'auto' } = {}) {
    if (runtime.busy) throw new Error('已有天下推演正在进行。');
    const chatId = getCurrentChatId();
    if (!chatId) throw new Error('当前没有可用的聊天文件。');
    const messageKey = currentMessageKey(messageId);
    if (!messageKey) throw new Error('目标楼层不是有效的主模型回复。');

    const existing = getChatState();
    if (!force && sameMessageKey(existing.lastProcessed, messageKey)) {
      runtime.lastNotice = `第 ${messageId} 楼已经结算，无需重复推演。`;
      renderPanel();
      return existing;
    }

    const baseState = stateBeforeMessage(existing, messageKey.messageId, force);
    const generationId = `cmyj-world-${hashText(`${chatId}|${messageKey.messageId}|${messageKey.swipeId}|${Date.now()}`)}`;
    const job = { chatId, messageKey, generationId, cancelled: false };
    runtime.activeJob = job;
    runtime.busy = true;
    runtime.lastError = '';
    runtime.lastNotice = source === 'manual' ? '正在重新推演本轮天下……' : `正在结算第 ${messageId} 楼……`;
    updateLampState();
    renderPanel();

    try {
      const currentStat = await waitForMessageVariables(messageId, job);
      if (!jobStillValid(job)) throw new Error('聊天或回复版本已经改变，本次推演结果已作废。');
      const payload = buildRequestPayload(baseState, messageKey, currentStat || {});
      const result = await callWorldModel(payload, generationId);
      if (!jobStillValid(job)) throw new Error('聊天或回复版本已经改变，本次推演结果已作废。');
      const updatedMessageKey = await writeParallelWorldToMessage(messageKey, result);
      const nextState = applyTransition(baseState, result, updatedMessageKey, currentStat || {});
      const saved = saveChatState(nextState);
      refreshInjection(saved);
      runtime.pendingMessageId = null;
      runtime.lastNotice = `第 ${messageId} 楼推演完成，平行世界已追加，新增 ${saved.lastRun?.newFactCount ?? 0} 条事实。`;
      console.info('[天下演化] 结算完成', { chatId, messageId, revision: saved.revision });
      return saved;
    } catch (error) {
      runtime.lastError = error instanceof Error ? error.message : String(error);
      console.error('[天下演化] 结算失败', error);
      throw error;
    } finally {
      if (runtime.activeJob === job) runtime.activeJob = null;
      runtime.busy = false;
      updateLampState();
      renderPanel();
    }
  }

  function cancelActiveJob(reason = '任务已取消') {
    const job = runtime.activeJob;
    if (!job) return;
    job.cancelled = true;
    const stop = api('stopGenerationById');
    if (typeof stop === 'function') {
      try {
        stop(job.generationId);
      } catch {
        /* ignore */
      }
    }
    runtime.lastNotice = reason;
  }

  function scheduleProcess(messageId, { force = false, source = 'auto', delayMs = settings.settleDelayMs } = {}) {
    clearTimeout(runtime.scheduledTimer);
    runtime.pendingMessageId = Number(messageId);
    runtime.scheduledTimer = setTimeout(() => {
      if (!settings.enabled || (!settings.autoRun && source === 'auto')) return;
      processMessage(messageId, { force, source }).catch(() => {});
    }, delayMs);
  }

  async function waitForBusyJob(timeoutMs = 45000) {
    const startedAt = Date.now();
    while (runtime.busy && Date.now() - startedAt < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  async function ensureLatestTurnSettledBeforeMainGeneration(generationType, dryRun) {
    if (dryRun || !settings.enabled || !settings.autoRun) return;
    if (['regenerate', 'swipe', 'continue', 'impersonate'].includes(String(generationType || '').toLowerCase())) return;
    const messageId = findLatestAssistantMessageId();
    if (messageId < 0) return;
    const key = currentMessageKey(messageId);
    if (!key || sameMessageKey(getChatState().lastProcessed, key)) return;
    clearTimeout(runtime.scheduledTimer);
    if (runtime.busy) {
      await waitForBusyJob();
      return;
    }
    try {
      await processMessage(messageId, { force: false, source: 'pre-generation' });
    } catch {
      // 天下演化失败不能阻止玩家取得主模型回复；错误会留在悬浮窗中供检查。
    }
  }

  function reconcileAfterHistoryChange() {
    const latestAssistantId = findLatestAssistantMessageId();
    const state = getChatState();
    if (latestAssistantId < 0) return;
    if (Number(state.lastProcessed?.messageId ?? -1) <= latestAssistantId) return;
    const older = asArray(state.checkpoints)
      .filter(item => Number(item.messageId) <= latestAssistantId && item.snapshot)
      .sort((a, b) => Number(a.messageId) - Number(b.messageId));
    const restored = older.length
      ? normalizeState(older.at(-1).snapshot, state.chatId)
      : createEmptyState(state.chatId);
    restored.checkpoints = older.slice(-LIMITS.checkpoints);
    const saved = saveChatState(restored);
    refreshInjection(saved);
    runtime.lastNotice = '检测到楼层删除，天下档案已恢复到最近检查点。';
    renderPanel();
  }

  function tag(text, tone = '') {
    return `<span class="cwe-tag ${tone}">${escapeHtml(text)}</span>`;
  }

  function shortText(value, max = 180) {
    const text = asText(value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function emptyBlock(text) {
    return `<div class="cwe-empty"><span>录</span><p>${escapeHtml(text)}</p></div>`;
  }

  function renderOverview(state) {
    const processed = state.lastProcessed
      ? `第 ${state.lastProcessed.messageId} 楼 · 页 ${Number(state.lastProcessed.swipeId) + 1}`
      : '尚未结算';
    const statusTone = runtime.lastError ? 'danger' : runtime.busy ? 'busy' : settings.enabled ? 'safe' : '';
    const statusText = runtime.lastError
      ? '推演有误'
      : runtime.busy
        ? '正在推演'
        : settings.enabled
          ? '值房已开'
          : '值房封存';
    const recentEvents = state.activeEvents.slice(-4).reverse();
    const hook = state.hooks.at(-1);
    const delayedConsequence =
      state.nextTurnPacket.activePressures[0] ||
      state.nextTurnPacket.localConsequences[0] ||
      state.intelPackets.at(-1)?.content ||
      '';
    const packetSize = state.nextTurnPacket.hardFacts.length + state.nextTurnPacket.activePressures.length;
    const eventLabels = ['方才', '稍前', '先前', '在案'];
    const events = recentEvents.length
      ? recentEvents
          .map((event, index) => {
            const tone = index === 0 ? 'danger' : index === 1 ? 'busy' : 'safe';
            const cause = event.actors?.length ? event.actors.join('、') : event.stage || '因由仍在查核';
            const eventState = event.stage || event.status || '推进中';
            const influence = asArray(event.impactDomains).length
              ? event.impactDomains.join('／')
              : event.nextTrigger || '影响仍待显现';
            return `<article class="cwe-event-row ${tone}">
              <div class="cwe-event-when"><i></i><strong>${eventLabels[index]}</strong><b>${index === 0 ? escapeHtml(state.clock.time || '此刻') : `第 ${Math.max(1, state.revision - index)} 次`}</b><span>${escapeHtml(event.location || '地点未明')}</span></div>
              <div class="cwe-event-story">
                <header><h4>${escapeHtml(event.title || event.id || '未题名事件')}</h4>${tag(eventState, tone)}</header>
                <p>${escapeHtml(shortText(event.summary || '值房尚未补录事件摘要。', 240))}</p>
              </div>
              <dl class="cwe-event-detail"><div><dt>因由</dt><dd>${escapeHtml(cause)}</dd></div><div><dt>状态</dt><dd>${escapeHtml(eventState)}</dd></div><div><dt>影响</dt><dd>${escapeHtml(influence)}</dd></div></dl>
            </article>`;
          })
          .join('')
      : [
          ['待启', '首次推演尚未执行', '副模型完成第一轮结算后，天下世事会从这里开始入档。'],
          ['待报', '驿报与人物行动尚未成卷', '主模型正文仍可正常进行；天下档案会按聊天独立保存。'],
          ['待察', '伏线与后果仍在暗处', '启用值房后，玩家视角之外的因果会逐回合积累。'],
        ]
          .map(
            ([label, title, summary], index) => `<article class="cwe-event-row is-empty ${index === 1 ? 'busy' : 'safe'}">
              <div class="cwe-event-when"><i></i><strong>${label}</strong><b>未定</b><span>尚未入档</span></div>
              <div class="cwe-event-story"><header><h4>${title}</h4>${tag('待命')}</header><p>${summary}</p></div>
              <dl class="cwe-event-detail"><div><dt>因由</dt><dd>天下档案尚未结算</dd></div><div><dt>状态</dt><dd>等待首次推演</dd></div><div><dt>影响</dt><dd>不影响当前正文</dd></div></dl>
            </article>`,
          )
          .join('');
    const hookProgress = hook ? clamp(38 + state.revision * 6, 38, 86) : 0;
    return `
      <section class="cwe-overview-lead">
        <div class="cwe-world-brief">
          <div class="cwe-brief-kicker"><span>今日天下</span><span>${escapeHtml(state.clock.date || '未定年月')}</span></div>
          <h2 title="${escapeHtml(state.worldSummary || '天下档案尚未开始结算。')}">${escapeHtml(shortText(state.worldSummary || '天下档案尚未开始结算。', 160))}</h2>
          <p>${escapeHtml([state.clock.location || '地点未明', state.clock.time, `第 ${state.revision} 次演化`, processed].filter(Boolean).join(' · '))}</p>
        </div>
        <div class="cwe-overview-status">
          <div class="cwe-statline" aria-label="天下演化统计">
            <span><i class="danger"></i>重大世事 <b>${state.activeEvents.length}</b></span>
            <span><i class="busy"></i>关联驿报 <b>${state.intelPackets.length}</b></span>
            <span><i class="safe"></i>人物行动 <b>${state.actors.length}</b></span>
            <span><i></i>未决伏线 <b>${state.hooks.length}</b></span>
          </div>
          <div class="cwe-duty-strip"><span>最近结算 <b>${escapeHtml(processed)}</b></span><span>值房状态 <b>${escapeHtml(statusText)}</b></span></div>
        </div>
      </section>
      ${runtime.lastError || runtime.lastNotice ? `<section class="cwe-notice ${runtime.lastError ? 'danger' : ''}"><i></i><div><b>${runtime.lastError ? '最近一次错误' : '值房消息'}</b><p>${escapeHtml(runtime.lastError || runtime.lastNotice)}</p></div></section>` : ''}
      <section class="cwe-ledger-layout">
        <div class="cwe-ledger-main">
          <header class="cwe-ledger-head"><div><small>正在发生</small><h3>天下事次</h3></div><button type="button" data-tab="events">查看全部 ${state.activeEvents.length} 件</button></header>
          <div class="cwe-event-list">${events}</div>
        </div>
        <aside class="cwe-margin-notes">
          <section>
            <header><small>正在展开的伏线</small><b>${hook ? '伏线将熟' : '尚无伏线'}</b></header>
            ${hook ? `<h3>${escapeHtml(hook.title || hook.id)}</h3><p>${escapeHtml(shortText(hook.summary, 220))}</p><div class="cwe-hook-progress"><span>成熟度</span><i><b style="width:${hookProgress}%"></b></i></div><footer><span>${escapeHtml(hook.stage || '潜伏')}</span><span>${escapeHtml(hook.trigger ? `触发：${hook.trigger}` : '等待触发')}</span></footer>` : `<h3>伏线尚未入档</h3><p>完成一次推演后，未在玩家视角出现的因果会记录于此。</p><div class="cwe-hook-progress"><span>成熟度</span><i><b style="width:0%"></b></i></div>`}
          </section>
          <section>
            <header><small>可能延后的后果</small><b>${delayedConsequence ? '后果待至' : '尚待积累'}</b></header>
            <h3>${delayedConsequence ? '局势仍在暗处累积' : '暂无可见压力'}</h3>
            <p>${escapeHtml(shortText(delayedConsequence || '当前没有需要递延到后续回合的明确后果。', 220))}</p>
            <footer><span>联动简报 ${packetSize} 条</span><span>确认事实 ${state.facts.length} 条</span></footer>
          </section>
        </aside>
      </section>`;
  }

  function renderEvents(state) {
    const events = state.activeEvents.length
      ? state.activeEvents
          .map(
            event => `
      <article class="cwe-record cwe-record-event">
        <header><div><small>${escapeHtml(event.id)}</small><h3>${escapeHtml(event.title || '未题名事件')}</h3></div>${tag(event.stage || event.status || '进行中', 'safe')}</header>
        <p>${escapeHtml(event.summary)}</p>
        <footer><span>${escapeHtml(event.location || '地点未明')}</span><span>${escapeHtml(event.nextTrigger ? `下一触发：${event.nextTrigger}` : '等待后续')}</span></footer>
      </article>`,
          )
          .join('')
      : emptyBlock('天下暂无线索正在推进');
    const intel = state.intelPackets.length
      ? state.intelPackets
          .map(
            item => `
      <article class="cwe-record compact">
        <header><div><small>${escapeHtml(item.channel || '未知渠道')} · ${Math.round(Number(item.reliability || 0) * 100)}%</small><h3>${escapeHtml(shortText(item.content, 90))}</h3></div>${tag(item.status || '在途')}</header>
        <footer><span>${escapeHtml(item.origin || '未知')} → ${escapeHtml(item.destination || '未知')}</span><span>${escapeHtml(item.eta || '抵达时间未定')}</span></footer>
      </article>`,
          )
          .join('')
      : emptyBlock('暂无在途情报');
    return `<section class="cwe-section-head"><div><p>天下案牍</p><h2>世事与驿报</h2></div><span>客观事件与消息传播分别记账</span></section>
      <section class="cwe-events-ledger">
        <div class="cwe-ledger-column"><header><h3>活跃世事</h3><span>${state.activeEvents.length} 件</span></header><div class="cwe-stack">${events}</div></div>
        <div class="cwe-ledger-column"><header><h3>在途驿报</h3><span>${state.intelPackets.length} 封</span></header><div class="cwe-stack">${intel}</div></div>
      </section>`;
  }

  function renderMemory(state) {
    const actors = state.actors.length
      ? state.actors
          .map(
            actor => `
      <article class="cwe-person">
        <div class="cwe-avatar">${escapeHtml((actor.name || '人').slice(0, 1))}</div>
        <div><h3>${escapeHtml(actor.name)}</h3><small>${escapeHtml(actor.location || '去向未明')}</small><p>${escapeHtml(shortText(actor.currentAction || actor.goal, 140))}</p></div>
      </article>`,
          )
          .join('')
      : emptyBlock('尚未建立重要人物行动档案');
    const hooks = state.hooks.length
      ? state.hooks
          .map(
            hook => `
      <article class="cwe-hook">
        <header><h3>${escapeHtml(hook.title || hook.id)}</h3>${tag(hook.stage || '潜伏', 'hook')}</header>
        <p>${escapeHtml(shortText(hook.summary, 180))}</p>
        ${hook.trigger ? `<small>触发：${escapeHtml(hook.trigger)}</small>` : ''}
      </article>`,
          )
          .join('')
      : emptyBlock('暂无活跃伏线');
    const facts = state.facts.length
      ? state.facts
          .slice(-20)
          .reverse()
          .map(
            fact => `
      <article class="cwe-fact">
        <i class="${fact.status === 'occurred' ? 'confirmed' : ''}"></i>
        <div><p>${escapeHtml(shortText(fact.content, 220))}</p><small>第 ${escapeHtml(fact.source?.messageId ?? '?')} 楼 · ${escapeHtml(fact.location || fact.scope || '')}</small></div>
      </article>`,
          )
          .join('')
      : emptyBlock('尚无确认事实');
    return `<section class="cwe-section-head"><div><p>天下案牍</p><h2>人物、伏线与史录</h2></div><span>原文仍留在聊天楼层，此处只存可检索事实</span></section>
      <section class="cwe-archive-grid">
        <div class="cwe-archive-column"><header><div><small>人物行动</small><h3>名籍</h3></div>${tag(`${state.actors.length} 人`)}</header><div class="cwe-scroll-list">${actors}</div></div>
        <div class="cwe-archive-column"><header><div><small>尚未结算</small><h3>伏线</h3></div>${tag(`${state.hooks.length} 条`, 'hook')}</header><div class="cwe-scroll-list">${hooks}</div></div>
        <div class="cwe-archive-column"><header><div><small>最近二十条</small><h3>事实史录</h3></div>${tag(`${state.facts.length} 条`)}</header><div class="cwe-scroll-list">${facts}</div></div>
      </section>`;
  }

  function currentTavernConnection() {
    try {
      const exported = globalThis.SillyTavern ?? hostWindow.SillyTavern;
      const context = typeof exported?.getContext === 'function' ? exported.getContext() : exported;
      const mainApiValue = asText(context?.mainApi, '');
      const mainApi = mainApiValue || '当前酒馆连接';
      const chatSource = asText(context?.chatCompletionSettings?.chat_completion_source, '');
      const source = mainApi === 'openai' && chatSource ? chatSource : mainApi;
      const getModel = context?.getChatCompletionModel ?? exported?.getChatCompletionModel;
      let model = '';
      if (typeof getModel === 'function' && chatSource && context?.chatCompletionSettings) {
        try {
          model = asText(getModel.call(context, context.chatCompletionSettings), '');
        } catch {
          model = '';
        }
      }
      const sourceLabels = {
        openai: 'OpenAI / Chat Completion',
        claude: 'Claude',
        makersuite: 'Google AI Studio',
        google: 'Google',
        custom: '自定义连接（酒馆）',
        openrouter: 'OpenRouter',
        deepseek: 'DeepSeek',
        groq: 'Groq',
        cohere: 'Cohere',
        mistralai: 'Mistral AI',
        textgenerationwebui: 'Text Completion',
        kobold: 'Kobold',
      };
      return {
        source: sourceLabels[source.toLowerCase()] || source || '当前酒馆连接',
        model: model || '由酒馆当前配置决定',
      };
    } catch {
      return {
        source: '当前酒馆连接',
        model: '由酒馆当前配置决定',
      };
    }
  }

  function effectiveConnection() {
    if (settings.connectionMode === 'custom') {
      return {
        source: '独立 API',
        model: settings.model || '尚未选择模型',
      };
    }
    return currentTavernConnection();
  }

  function modelOptions(selectedModel = '') {
    return runtime.availableModels
      .map(
        model =>
          `<option value="${escapeHtml(model)}" ${model === selectedModel ? 'selected' : ''}>${escapeHtml(model)}</option>`,
      )
      .join('');
  }

  async function fetchModelList(url, key) {
    if (!url) throw new Error('请先填写 API 地址。');
    const getModelList = api('getModelList');
    if (typeof getModelList === 'function') return getModelList({ apiurl: url, key });

    const baseUrl = url
      .replace(/\/chat\/completions\/?$/i, '')
      .replace(/\/v1\/?$/i, '')
      .replace(/\/+$/, '');
    const fetcher = hostWindow.fetch?.bind(hostWindow) ?? globalThis.fetch?.bind(globalThis);
    if (typeof fetcher !== 'function') throw new Error('当前环境不支持网络请求。');
    const response = await fetcher(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return asArray(data?.data).map(item => item?.id ?? item?.name);
  }

  async function fetchModelsFromPanel() {
    const doc = runtime.frameDocument;
    const button = doc?.querySelector('[data-action="fetch-models"]');
    const input = doc?.querySelector('[data-setting="model"]');
    const select = doc?.querySelector('[data-model-select]');
    const status = doc?.querySelector('[data-model-status]');
    if (!doc || !button || !input || !select) return;

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = '获取中…';
    if (status) {
      status.textContent = '正在读取接口提供的模型列表…';
      status.classList.remove('error', 'success');
    }

    try {
      const url = doc.querySelector('[data-setting="apiUrl"]')?.value?.trim() || '';
      const key = doc.querySelector('[data-setting="apiKey"]')?.value || '';
      const models = [
        ...new Set(
          asArray(await fetchModelList(url, key))
            .map(model => String(model ?? '').trim())
            .filter(Boolean),
        ),
      ].sort((left, right) => left.localeCompare(right));
      if (!models.length) throw new Error('API 没有返回可用模型。');

      runtime.availableModels = models;
      runtime.modelFetchStatus = `已获取 ${models.length} 个可用模型。`;
      runtime.modelFetchError = false;
      select.innerHTML = modelOptions(input.value.trim());
      select.hidden = false;
      if (models.includes(input.value.trim())) select.value = input.value.trim();
      else {
        select.value = models[0];
        input.value = models[0];
      }
      if (status) {
        status.textContent = runtime.modelFetchStatus;
        status.classList.add('success');
      }
    } catch (error) {
      runtime.modelFetchStatus = `获取失败：${error instanceof Error ? error.message : String(error)}`;
      runtime.modelFetchError = true;
      if (status) {
        status.textContent = runtime.modelFetchStatus;
        status.classList.add('error');
      }
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function renderSettings(state) {
    const tavernConnection = currentTavernConnection();
    const useTavern = settings.connectionMode !== 'custom';
    return `<div class="cwe-drawer-head"><div><small>值房控制</small><h2>设置</h2><p>设置跨聊天共享，天下档案仍按聊天隔离。</p></div><button type="button" class="cwe-close-button" data-action="settings-close" aria-label="关闭设置"><span aria-hidden="true">×</span></button></div>
      <div class="cwe-settings-scroll">
        <section class="cwe-settings-section cwe-connection-card">
          <header><div><small>副模型通道</small><h3>连接方式</h3></div>${tag(useTavern ? '跟随酒馆' : '独立 API', useTavern ? 'safe' : '')}</header>
          <div class="cwe-mode-switch" role="radiogroup" aria-label="副模型连接方式">
            <label><input type="radio" name="cwe-connection-mode" data-setting="connectionMode" value="tavern" ${useTavern ? 'checked' : ''}><span><b>使用当前酒馆</b><small>直接复用正在使用的接口与模型</small></span></label>
            <label><input type="radio" name="cwe-connection-mode" data-setting="connectionMode" value="custom" ${useTavern ? '' : 'checked'}><span><b>使用独立 API</b><small>为天下演化单独指定服务</small></span></label>
          </div>
          <div class="cwe-connection-pane" data-connection-pane="tavern" ${useTavern ? '' : 'hidden'}>
            <div class="cwe-current-connection"><div><small>当前接口</small><strong data-current-source>${escapeHtml(tavernConnection.source)}</strong></div><div><small>当前模型</small><strong data-current-model>${escapeHtml(tavernConnection.model)}</strong></div><button type="button" data-action="refresh-tavern-connection">重新读取</button></div>
          <p class="cwe-help">请求直接交给酒馆当前连接与当前模型处理，脚本不会读取或保存酒馆密钥；副模型只使用天下演化的结构化提示词，不调用正文写作预设。这里与主界面显示的是同一份实时连接信息。</p>
          </div>
          <div class="cwe-connection-pane" data-connection-pane="custom" ${useTavern ? 'hidden' : ''}>
            <label class="cwe-field"><span>API 地址</span><input data-setting="apiUrl" value="${escapeHtml(settings.apiUrl)}" placeholder="https://example.com/v1/chat/completions"></label>
            <div class="cwe-field-row"><label><span>接口类型</span><select data-setting="apiSource"><option value="openai" ${settings.apiSource === 'openai' ? 'selected' : ''}>OpenAI 兼容</option><option value="claude" ${settings.apiSource === 'claude' ? 'selected' : ''}>Claude</option><option value="google" ${settings.apiSource === 'google' ? 'selected' : ''}>Google</option></select></label><label><span>API Key</span><input type="password" data-setting="apiKey" value="${escapeHtml(settings.apiKey)}" autocomplete="off"></label></div>
            <label class="cwe-field"><span>推演模型</span><div class="cwe-field-action"><input data-setting="model" value="${escapeHtml(settings.model)}" placeholder="填写或获取一个模型"><button type="button" data-action="fetch-models">获取模型</button></div><select data-model-select ${runtime.availableModels.length ? '' : 'hidden'}>${modelOptions(settings.model)}</select><small class="cwe-model-status ${runtime.modelFetchError ? 'error' : runtime.modelFetchStatus ? 'success' : ''}" data-model-status>${escapeHtml(runtime.modelFetchStatus || '填好地址和密钥后获取；也可以直接填写模型名。')}</small></label>
            <p class="cwe-help danger">独立 API 的密钥只保存在当前浏览器，不会写进角色卡或聊天档案。</p>
          </div>
        </section>
        <section class="cwe-settings-section">
          <header><div><small>运行方式</small><h3>自动结算</h3></div><label class="cwe-switch"><input type="checkbox" data-setting="enabled" ${settings.enabled ? 'checked' : ''}><i></i></label></header>
          <label class="cwe-check"><input type="checkbox" data-setting="autoRun" ${settings.autoRun ? 'checked' : ''}><span>正文与 MVU 更新完成后，由副模型推演并把平行世界追加到本楼末尾</span></label>
          <div class="cwe-field-row"><label><span>回看最近几轮</span><input type="number" min="1" max="8" data-setting="lookbackRounds" value="${settings.lookbackRounds}"></label><label><span>等待 MVU 完成（毫秒）</span><input type="number" min="400" max="5000" step="100" data-setting="settleDelayMs" value="${settings.settleDelayMs}"></label></div>
          <p class="cwe-help">最新一轮可产生新事实，回看的旧轮次只负责理解“他”“那封信”等承接关系。</p>
        </section>
        <section class="cwe-settings-section">
          <header><div><small>结构化推演</small><h3>模型参数</h3></div>${tag(`${settings.maxTokens} tokens`)}</header>
          <div class="cwe-field-row"><label><span>温度</span><input type="number" min="0" max="1.5" step="0.05" data-setting="temperature" value="${settings.temperature}"></label><label><span>最大输出</span><input type="number" min="1800" max="16000" step="100" data-setting="maxTokens" value="${settings.maxTokens}"></label></div>
          <label class="cwe-field"><span>保留近期事实</span><input type="number" min="60" max="240" step="10" data-setting="maxFacts" value="${settings.maxFacts}"></label>
          <div class="cwe-actions-row"><button class="primary" type="button" data-action="save-settings">保存设置</button><button type="button" data-action="export-state">导出档案</button><button class="danger" type="button" data-action="clear-state">清空档案</button></div>
          <p class="cwe-help">当前聊天：${escapeHtml(state.chatId || '未识别')}。清空只影响这一份聊天，不影响其他存档。</p>
        </section>
      </div>`;
  }

  function panelBody(state) {
    if (runtime.activeTab === 'events') return renderEvents(state);
    if (runtime.activeTab === 'memory') return renderMemory(state);
    return renderOverview(state);
  }

  function frameMarkup(state) {
    const connection = effectiveConnection();
    const tabs = [
      ['overview', '总览'],
      ['events', '世事'],
      ['memory', '档案'],
    ];
    return `<main class="cwe-panel theme-${currentStatusbarTheme()}">
      <header class="cwe-header">
        <div class="cwe-brand"><img class="cwe-brand-mark" src="${compassSeal}" alt=""><div class="cwe-brand-title"><div><h1>天下演化</h1><span class="cwe-title-seal" aria-hidden="true">演</span></div><p>${escapeHtml([state.clock.date || '未定年月', state.clock.location, state.clock.time].filter(Boolean).join(' · '))}</p></div></div>
        <div class="cwe-header-actions">
          <span class="cwe-connection"><i></i><span>模型：${escapeHtml(connection.model)}</span><b>连接：${escapeHtml(connection.source)}</b></span>
          <span class="cwe-live ${runtime.busy ? 'busy' : runtime.lastError ? 'error' : settings.enabled ? 'on' : ''}"><i></i>${runtime.busy ? '副模型推演中' : runtime.lastError ? '值房有误' : settings.enabled ? '值房运转中' : '值房未启用'}</span>
          <button type="button" class="cwe-close-button" data-action="close" aria-label="关闭天下演化"><span aria-hidden="true">×</span></button>
        </div>
      </header>
      <div class="cwe-shell">
        <section class="cwe-content cwe-content-${runtime.activeTab}">${panelBody(state)}</section>
        <footer class="cwe-command-bar">
          <div class="cwe-command-main">
            <nav class="cwe-tabs" aria-label="天下演化栏目">${tabs.map(([id, label]) => `<button type="button" data-tab="${id}" class="${runtime.activeTab === id ? 'active' : ''}">${label}</button>`).join('')}</nav>
            <button type="button" class="cwe-settings-button ${runtime.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">设置</button>
            <button type="button" class="cwe-run-button primary" data-action="rerun-current" ${runtime.busy ? 'disabled' : ''}>${runtime.busy ? '推演中…' : '重新推演'}</button>
          </div>
          <div class="cwe-command-meta">
            <p><span>本轮重演：${runtime.busy ? '执行中' : '待命'}</span><span>联动简报：${state.nextTurnPacket.hardFacts.length + state.nextTurnPacket.activePressures.length} 条</span><span>平行世界：${settings.enabled ? '同楼回写' : '未启用'}</span></p>
            <button type="button" class="cwe-rebuild-link" data-action="refresh-injection">重建联动</button>
          </div>
        </footer>
      </div>
      ${runtime.activeTab === 'settings' ? `<button class="cwe-drawer-backdrop" type="button" data-action="settings-close" aria-label="关闭设置"></button><aside class="cwe-settings-drawer">${renderSettings(state)}</aside>` : ''}
    </main>`;
  }

  function frameStyles() {
    return `${ledgerStyles}\n${faithfulStyles}\n${integratedStyles}`
      .replaceAll("url('__LEDGER_TEXTURE__')", 'none')
      .replaceAll("url('__FRAME_ORNAMENT__')", 'none');
  }

  function writeFrameDocument() {
    const doc = runtime.frame?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${frameStyles()}</style></head><body><div id="cwe-root"></div></body></html>`,
    );
    doc.close();
    runtime.frameDocument = doc;
    bindFrameEvents();
    renderPanel();
    syncStatusbarTheme();
  }

  function renderPanel() {
    if (!runtime.frameDocument) return;
    const root = runtime.frameDocument.getElementById('cwe-root');
    if (!root) return;
    let state;
    try {
      state = getChatState();
    } catch {
      state = createEmptyState(getCurrentChatId());
    }
    root.innerHTML = frameMarkup(state);
  }

  function readSettingsFromPanel() {
    const doc = runtime.frameDocument;
    const get = key => doc?.querySelector(`[data-setting="${key}"]`);
    return {
      enabled: Boolean(get('enabled')?.checked),
      autoRun: Boolean(get('autoRun')?.checked),
      lookbackRounds: Number(get('lookbackRounds')?.value),
      settleDelayMs: Number(get('settleDelayMs')?.value),
      connectionMode: doc?.querySelector('[data-setting="connectionMode"]:checked')?.value || 'tavern',
      apiUrl: get('apiUrl')?.value?.trim() || '',
      apiKey: get('apiKey')?.value || '',
      apiSource: get('apiSource')?.value || 'openai',
      model: get('model')?.value?.trim() || '',
      temperature: Number(get('temperature')?.value),
      maxTokens: Number(get('maxTokens')?.value),
      maxFacts: Number(get('maxFacts')?.value),
    };
  }

  function downloadState() {
    const state = getChatState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = hostDocument.createElement('a');
    anchor.href = url;
    anchor.download = `残明余烬-天下档案-${(state.chatId || '当前聊天').replace(/[\\/:*?"<>|]+/g, '_')}.json`;
    hostDocument.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bindFrameEvents() {
    const doc = runtime.frameDocument;
    if (!doc || doc.__cweBound) return;
    doc.__cweBound = true;
    doc.addEventListener('click', event => {
      const tab = event.target.closest?.('[data-tab]')?.dataset.tab;
      if (tab) {
        runtime.activeTab = tab;
        renderPanel();
        return;
      }
      const action = event.target.closest?.('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'close') {
        closePanel();
        return;
      }
      if (action === 'settings-close') {
        runtime.activeTab = 'overview';
        renderPanel();
        return;
      }
      if (action === 'rerun-current') {
        const messageId = findLatestAssistantMessageId();
        if (messageId < 0) {
          runtime.lastError = '没有可供推演的主模型回复。';
          renderPanel();
          return;
        }
        processMessage(messageId, { force: true, source: 'manual' }).catch(() => {});
        return;
      }
      if (action === 'refresh-injection') {
        refreshInjection();
        runtime.lastNotice = '已重建当前聊天的主模型联动提示。';
        runtime.lastError = '';
        renderPanel();
        return;
      }
      if (action === 'fetch-models') {
        fetchModelsFromPanel().catch(error => {
          console.error('[天下演化] 获取模型列表失败', error);
        });
        return;
      }
      if (action === 'refresh-tavern-connection') {
        const connection = currentTavernConnection();
        const source = doc.querySelector('[data-current-source]');
        const model = doc.querySelector('[data-current-model]');
        if (source) source.textContent = connection.source;
        if (model) model.textContent = connection.model;
        return;
      }
      if (action === 'save-settings') {
        const previousEnabled = settings.enabled;
        saveSettings(readSettingsFromPanel());
        if (settings.enabled) refreshInjection();
        else clearInjection();
        runtime.lastNotice =
          !previousEnabled && settings.enabled ? '天下演化已启用，将在下一次主回复后自动结算。' : '设置已保存。';
        runtime.lastError = '';
        renderPanel();
        return;
      }
      if (action === 'export-state') {
        downloadState();
        runtime.lastNotice = '当前聊天的天下档案已导出。';
        renderPanel();
        return;
      }
      if (action === 'clear-state') {
        if (
          !hostWindow.confirm(
            '确定清空当前聊天的天下演化档案吗？此操作不会影响正文和其他聊天，但本聊天的世界检查点将被删除。',
          )
        )
          return;
        cancelActiveJob('当前聊天档案已清空。');
        deleteChatState();
        clearInjection();
        runtime.lastError = '';
        runtime.lastNotice = '当前聊天的天下档案已清空。';
        renderPanel();
      }
    });
    doc.addEventListener('change', event => {
      const connectionMode = event.target.closest?.('[data-setting="connectionMode"]')?.value;
      if (connectionMode) {
        doc.querySelectorAll('[data-connection-pane]').forEach(pane => {
          pane.hidden = pane.dataset.connectionPane !== connectionMode;
        });
        return;
      }
      const modelSelect = event.target.closest?.('[data-model-select]');
      if (!modelSelect) return;
      const modelInput = doc.querySelector('[data-setting="model"]');
      if (modelInput) modelInput.value = modelSelect.value;
    });
  }

  function isMobile() {
    return hostWindow.innerWidth <= 720;
  }

  function applyLampLayout() {
    const lamp = runtime.lamp;
    if (!lamp) return;
    const size = isMobile() ? 40 : 48;
    const saved = readJsonLocal('lamp-position', null);
    const defaultTop = Math.round((hostWindow.innerHeight - size) / 2) + size + 12;
    const left = saved?.left ?? hostWindow.innerWidth - size - 24;
    const top = saved?.top ?? defaultTop;
    Object.assign(lamp.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${clamp(left, 8, hostWindow.innerWidth - size - 8)}px`,
      top: `${clamp(top, 8, hostWindow.innerHeight - size - 8)}px`,
    });
  }

  function applyFrameLayout() {
    const frame = runtime.frame;
    if (!frame) return;
    if (!runtime.isOpen) {
      frame.style.display = 'none';
      if (runtime.lamp) runtime.lamp.style.display = 'grid';
      return;
    }
    const width = hostWindow.innerWidth;
    const height = hostWindow.innerHeight;
    const compact = width <= 980;
    const panelWidth = isMobile()
      ? Math.round(width * 0.96)
      : Math.min(Math.round(width * (compact ? 0.92 : 0.8)), 1180);
    const panelHeight = isMobile()
      ? Math.round(height * 0.92)
      : Math.min(Math.round(height * (compact ? 0.9 : 0.8)), 680);
    Object.assign(frame.style, {
      display: '',
      position: 'fixed',
      border: '0',
      background: 'transparent',
      zIndex: '100001',
      width: `${panelWidth}px`,
      height: `${panelHeight}px`,
      left: `${Math.max(8, Math.round((width - panelWidth) / 2))}px`,
      top: `${Math.max(8, Math.round((height - panelHeight) / 2))}px`,
    });
    if (runtime.lamp) runtime.lamp.style.display = 'none';
  }

  function openPanel() {
    runtime.isOpen = true;
    applyFrameLayout();
    renderPanel();
  }

  function closePanel() {
    runtime.isOpen = false;
    applyFrameLayout();
  }

  function updateLampState() {
    const lamp = runtime.lamp;
    if (!lamp) return;
    lamp.classList.toggle('is-enabled', Boolean(settings.enabled));
    lamp.classList.toggle('is-busy', Boolean(runtime.busy));
    lamp.classList.toggle('has-error', Boolean(runtime.lastError));
    lamp.title = runtime.busy
      ? '天下演化：正在推演'
      : runtime.lastError
        ? `天下演化：${runtime.lastError}`
        : settings.enabled
          ? '天下演化：值房运转中'
          : '天下演化：未启用';
  }

  function mountUi() {
    hostDocument.getElementById(LAMP_ID)?.remove();
    hostDocument.getElementById(FRAME_ID)?.remove();
    hostDocument.getElementById(STYLE_ID)?.remove();

    const style = hostDocument.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${LAMP_ID}{position:fixed;display:grid;place-items:center;padding:0;border:1.5px solid rgba(197,154,89,.78);border-radius:50%;background:radial-gradient(circle at 38% 34%,#24352f 0,#151812 44%,#0d0c09 100%);box-shadow:0 7px 22px rgba(0,0,0,.64),inset 0 0 0 3px rgba(197,154,89,.07);color:#c9a364;cursor:grab;z-index:100000;touch-action:none;user-select:none;transition:border-color .2s,box-shadow .2s,transform .2s}
      #${LAMP_ID}:before{content:"";position:absolute;inset:4px;border:1px solid rgba(110,145,133,.38);border-radius:50%;pointer-events:none}
      #${LAMP_ID} .cwe-compass-wrap{position:relative;z-index:1;display:grid;width:88%;height:88%;place-items:center}
      #${LAMP_ID} .cwe-compass-image{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}
      #${LAMP_ID} .cwe-status-dot{position:absolute;z-index:2;right:-2px;top:-2px;width:9px;height:9px;border:2px solid #10100c;border-radius:50%;background:#665b4e;transition:.2s}
      #${LAMP_ID}.is-enabled .cwe-status-dot{background:#6e9185;box-shadow:0 0 8px rgba(110,145,133,.85)}
      #${LAMP_ID}.is-busy{border-color:#e0b76f;box-shadow:0 7px 22px rgba(0,0,0,.64),0 0 18px rgba(197,154,89,.34)}
      #${LAMP_ID}.is-busy .cwe-status-dot{background:#c59a59;animation:cwe-lamp-pulse 1s infinite}
      #${LAMP_ID}.has-error .cwe-status-dot{background:#d06a50;box-shadow:0 0 9px rgba(208,106,80,.9)}
      #${LAMP_ID}:hover{transform:translateY(-2px) rotate(4deg);border-color:#ddba79;box-shadow:0 10px 28px rgba(0,0,0,.7),0 0 14px rgba(110,145,133,.2)}#${LAMP_ID}:active{cursor:grabbing}
      #${LAMP_ID}.theme-day{border-color:rgba(96,65,36,.42);background:linear-gradient(145deg,#fff5d9,#dfc690);box-shadow:0 8px 22px rgba(55,31,12,.32),inset 0 0 0 3px rgba(164,61,45,.06)}
      #${LAMP_ID}.theme-day:before{border-color:rgba(164,61,45,.24)}
      #${LAMP_ID}.theme-day .cwe-status-dot{border-color:#f4e7c7}
      #${LAMP_ID}.theme-night{border-color:rgba(237,196,128,.42);background:linear-gradient(145deg,#352619,#211913)}
      #${LAMP_ID}.theme-night .cwe-status-dot{border-color:#211913}
      #${LAMP_ID}.theme-star{border-color:rgba(180,155,110,.42);background:radial-gradient(circle at 34% 28%,#1d3544,#111d28 62%,#0d1820);box-shadow:0 8px 24px rgba(0,0,0,.62),0 0 14px rgba(212,160,64,.14)}
      #${LAMP_ID}.theme-star:before{border-color:rgba(93,141,154,.42)}
      #${LAMP_ID}.theme-star .cwe-status-dot{border-color:#0d1820}
      #${LAMP_ID}.theme-ink{border-color:rgba(20,25,22,.34);background:linear-gradient(145deg,#f5f0e4,#d8d0bf);box-shadow:0 8px 22px rgba(25,30,24,.28),inset 0 0 0 3px rgba(47,105,101,.06)}
      #${LAMP_ID}.theme-ink:before{border-color:rgba(47,105,101,.32)}
      #${LAMP_ID}.theme-ink .cwe-status-dot{border-color:#eee9dc}
      @keyframes cwe-lamp-pulse{50%{opacity:.35;transform:scale(.75)}}`;
    hostDocument.head.append(style);

    const lamp = hostDocument.createElement('div');
    lamp.id = LAMP_ID;
    lamp.setAttribute('aria-label', '打开天下演化');
    lamp.setAttribute('role', 'button');
    lamp.setAttribute('title', '天下演化');
    lamp.tabIndex = 0;
    lamp.innerHTML = `<span class="cwe-compass-wrap"><img class="cwe-compass-image" src="${compassSeal}" alt=""></span><i class="cwe-status-dot"></i>`;
    hostDocument.body.append(lamp);
    runtime.lamp = lamp;
    syncStatusbarTheme();

    const frame = hostDocument.createElement('iframe');
    frame.id = FRAME_ID;
    frame.title = '残明余烬·天下演化';
    frame.setAttribute('aria-label', '残明余烬天下演化面板');
    frame.style.display = 'none';
    hostDocument.body.append(frame);
    runtime.frame = frame;
    writeFrameDocument();
    applyLampLayout();
    updateLampState();

    const onDown = event => {
      if (runtime.isOpen) return;
      const point = event.touches?.[0] ?? event;
      const rect = lamp.getBoundingClientRect();
      runtime.drag = { x: point.clientX, y: point.clientY, left: rect.left, top: rect.top, moved: false };
      runtime.dragMoved = false;
      if (event.cancelable && !event.touches) event.preventDefault();
    };
    const onMove = event => {
      if (!runtime.drag || runtime.isOpen) return;
      const point = event.touches?.[0] ?? event;
      const dx = point.clientX - runtime.drag.x;
      const dy = point.clientY - runtime.drag.y;
      if (Math.hypot(dx, dy) > 5) {
        runtime.drag.moved = true;
        runtime.dragMoved = true;
      }
      const maxLeft = hostWindow.innerWidth - lamp.offsetWidth - 8;
      const maxTop = hostWindow.innerHeight - lamp.offsetHeight - 8;
      lamp.style.left = `${clamp(runtime.drag.left + dx, 8, maxLeft)}px`;
      lamp.style.top = `${clamp(runtime.drag.top + dy, 8, maxTop)}px`;
      if (event.cancelable) event.preventDefault();
    };
    const onUp = () => {
      if (!runtime.drag) return;
      if (runtime.drag.moved) {
        writeLocal(
          'lamp-position',
          JSON.stringify({
            left: Number.parseInt(lamp.style.left, 10),
            top: Number.parseInt(lamp.style.top, 10),
          }),
        );
        runtime.dragJustEnded = true;
        setTimeout(() => {
          runtime.dragJustEnded = false;
        }, 160);
      }
      runtime.drag = null;
    };
    const onClick = () => {
      if (runtime.dragJustEnded || runtime.dragMoved) {
        runtime.dragMoved = false;
        return;
      }
      openPanel();
    };
    const onKeyDown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openPanel();
    };
    const onResize = () => {
      applyLampLayout();
      if (runtime.isOpen) applyFrameLayout();
    };
    lamp.addEventListener('pointerdown', onDown);
    lamp.addEventListener('touchstart', onDown, { passive: false });
    hostWindow.addEventListener('pointermove', onMove);
    hostWindow.addEventListener('touchmove', onMove, { passive: false });
    hostWindow.addEventListener('pointerup', onUp);
    hostWindow.addEventListener('touchend', onUp);
    hostWindow.addEventListener('resize', onResize);
    lamp.addEventListener('click', onClick);
    lamp.addEventListener('keydown', onKeyDown);
    runtime.cleanupFns.push(() => {
      hostWindow.removeEventListener('pointermove', onMove);
      hostWindow.removeEventListener('touchmove', onMove);
      hostWindow.removeEventListener('pointerup', onUp);
      hostWindow.removeEventListener('touchend', onUp);
      hostWindow.removeEventListener('resize', onResize);
    });
  }

  function registerEvents() {
    const on = api('eventOn');
    const events = globalThis.tavern_events ?? hostWindow.tavern_events;
    if (typeof on !== 'function' || !events) return;

    on(events.MESSAGE_RECEIVED, (messageId, type) => {
      if (!settings.enabled || !settings.autoRun) return;
      if (type === 'first_message' || type === 'quiet' || type === 'extension') return;
      runtime.pendingMessageId = Number(messageId);
      runtime.pendingForce = ['regenerate', 'swipe'].includes(type);
      if (runtime.mvuReady) {
        // 正常路径由 VARIABLE_UPDATE_ENDED 接手；较长兜底只防止第三方 MVU 没有发出结束事件。
        scheduleProcess(Number(messageId), {
          force: runtime.pendingForce,
          source: 'mvu-fallback',
          delayMs: Math.max(settings.settleDelayMs + 12000, 15000),
        });
      } else {
        scheduleProcess(Number(messageId), { force: runtime.pendingForce, source: 'auto' });
      }
    });
    const mvu = api('Mvu');
    if (mvu?.events?.VARIABLE_UPDATE_ENDED) {
      on(mvu.events.VARIABLE_UPDATE_ENDED, () => {
        if (!settings.enabled || !settings.autoRun) return;
        const messageId =
          runtime.pendingMessageId != null && currentMessageKey(runtime.pendingMessageId)
            ? runtime.pendingMessageId
            : findLatestAssistantMessageId();
        if (messageId < 0) return;
        scheduleProcess(messageId, { force: runtime.pendingForce, source: 'mvu', delayMs: 120 });
        runtime.pendingForce = false;
      });
    }
    on(events.GENERATION_AFTER_COMMANDS, (generationType, _options, dryRun) =>
      ensureLatestTurnSettledBeforeMainGeneration(generationType, dryRun),
    );
    on(events.MESSAGE_SWIPED, messageId => {
      if (!settings.enabled || !settings.autoRun) return;
      scheduleProcess(Number(messageId), { force: true, source: 'auto' });
    });
    on(events.MESSAGE_EDITED, messageId => {
      if (!settings.enabled || !settings.autoRun) return;
      const key = currentMessageKey(Number(messageId));
      const selfWrittenHash = runtime.selfWrittenMessageHashes.get(Number(messageId));
      if (key && selfWrittenHash === key.hash) {
        runtime.selfWrittenMessageHashes.delete(Number(messageId));
        return;
      }
      runtime.selfWrittenMessageHashes.delete(Number(messageId));
      if (key) scheduleProcess(Number(messageId), { force: true, source: 'auto' });
    });
    on(events.MESSAGE_DELETED, () => {
      clearTimeout(runtime.scheduledTimer);
      runtime.pendingMessageId = null;
      runtime.pendingForce = false;
      runtime.selfWrittenMessageHashes.clear();
      setTimeout(reconcileAfterHistoryChange, 250);
    });
    on(events.CHAT_CHANGED, chatId => {
      cancelActiveJob('已切换聊天，旧聊天的推演结果将被丢弃。');
      clearTimeout(runtime.scheduledTimer);
      runtime.pendingMessageId = null;
      runtime.pendingForce = false;
      runtime.selfWrittenMessageHashes.clear();
      clearInjection();
      runtime.currentChatId = String(chatId || getCurrentChatId());
      runtime.lastError = '';
      runtime.lastNotice = '';
      setTimeout(() => {
        refreshInjection();
        renderPanel();
        updateLampState();
      }, 250);
    });
  }

  function cleanup() {
    cancelActiveJob('天下演化脚本已卸载。');
    clearTimeout(runtime.scheduledTimer);
    clearInterval(runtime.themeTimer);
    clearInjection();
    runtime.cleanupFns.splice(0).forEach(fn => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    runtime.frame?.remove();
    runtime.lamp?.remove();
    hostDocument.getElementById(STYLE_ID)?.remove();
    if (hostWindow[RUNTIME_KEY] === runtime) delete hostWindow[RUNTIME_KEY];
  }

  async function bootstrap() {
    const waitForGlobal = api('waitGlobalInitialized');
    if (typeof waitForGlobal !== 'function') throw new Error('未找到酒馆助手全局初始化接口。');
    await waitForGlobal('Mvu');
    runtime.mvuReady = Boolean(api('Mvu'));
    runtime.currentChatId = getCurrentChatId();
    mountUi();
    runtime.themeTimer = setInterval(syncStatusbarTheme, 600);
    registerEvents();
    if (settings.enabled) refreshInjection();
    window.addEventListener('pagehide', cleanup, { once: true });
    console.info(`[天下演化] v${VERSION} 已加载，自动推演${settings.enabled ? '已启用' : '未启用'}。`);
  }

  $(() => {
    bootstrap().catch(error => {
      runtime.lastError = error instanceof Error ? error.message : String(error);
      console.error('[天下演化] 初始化失败', error);
      updateLampState();
    });
  });
})();
