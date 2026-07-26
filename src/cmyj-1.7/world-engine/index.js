import compassSeal from './assets/compass-seal-v2.webp?url';
import ledgerStyles from './styles.raw?raw';
import faithfulStyles from './styles-faithful.raw?raw';
import integratedStyles from './styles-integrated.raw?raw';
import { deepSeekJsonSchemaPrompt, isOfficialDeepSeekApi, shouldFallbackFromJsonSchema } from '../shared/api-compat.js';

(() => {
  'use strict';

  const VERSION = '1.7.4';
  const RUNTIME_KEY = '__CMYJWorldEngineV1';
  const CHAT_STATE_KEY = 'cmyj_world_engine_v1';
  const INJECTION_ID = 'cmyj-world-engine-context-v1';
  const LAMP_ID = 'canming-world-engine-lamp';
  const FRAME_ID = 'canming-world-engine-frame';
  const STYLE_ID = 'canming-world-engine-lamp-style';
  const STORAGE_PREFIX = 'canming-world-engine:';
  const STATUSBAR_THEME_KEY = 'canming-afterglow-statusbar:theme';
  const SUPPORTED_OPERATION_TYPES = new Set([
    'event.upsert',
    'event.patch',
    'event.resolve',
    'actor.upsert',
    'actor.patch',
    'intel.upsert',
    'intel.patch',
    'intel.remove',
    'hook.upsert',
    'hook.patch',
    'hook.resolve',
  ]);
  const RETIRED_OPERATION_TYPES = new Set(['summary.replace', 'fact.add']);
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
    settingsVersion: 3,
    enabled: true,
    autoRun: true,
    lookbackRounds: 3,
    settleDelayMs: 1200,
    connectionMode: 'tavern',
    apiUrl: '',
    apiKey: '',
    apiSource: 'openai',
    model: '',
    temperature: 1,
    maxTokens: 10000,
  });

  const LIMITS = Object.freeze({
    activeEvents: 24,
    actors: 48,
    intelPackets: 60,
    hooks: 16,
    cameraHistory: 18,
    parallelTurns: 24,
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
    queuedProcess: null,
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
    activeMainGeneration: null,
    promptSnapshots: new Map(),
    dryRunCapture: null,
    worldRequestActive: false,
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

  const STATUS_LABELS = Object.freeze({
    occurred: '已发生',
    resolved: '已了结',
    active: '推进中',
    happening: '进行中',
    ongoing: '进行中',
    in_progress: '进行中',
    pending: '待处理',
    planned: '筹备中',
    recover: '休养中',
    recovering: '休养中',
    angry: '愤怒',
    anxious: '忧虑',
    worried: '不安',
    delivered: '已送达',
    arrived: '已抵达',
    spreading: '传播中',
    propagating: '传播中',
    in_transit: '在途',
    descriptive: '已记录',
    social_dispute: '纷争中',
    hidden: '潜伏中',
    dormant: '潜伏中',
  });

  function statusLabel(value, fallback = '状态未明') {
    const text = asText(value);
    if (!text) return fallback;
    const key = text.toLowerCase().replace(/[\s-]+/g, '_');
    if (STATUS_LABELS[key]) return STATUS_LABELS[key];
    return /[\u3400-\u9fff]/u.test(text) ? text : fallback;
  }

  function noticeLabel(value) {
    return String(value ?? '')
      .replaceAll('summary.replace', '天下摘要')
      .replaceAll('event.upsert', '世事登记')
      .replaceAll('event.resolve', '世事结案')
      .replaceAll('actor.upsert', '人物行动')
      .replaceAll('intel.upsert', '驿报登记')
      .replaceAll('hook.upsert', '伏线登记')
      .replaceAll('hook.resolve', '伏线结案')
      .replaceAll('fact.add', '事实登记')
      .replaceAll('stable ID', '稳定编号')
      .replaceAll('location', '地点')
      .replaceAll('publicity', '公开度')
      .replaceAll('evidence', '依据')
      .replaceAll('summary', '摘要');
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
    const settingsVersion = Number(raw?.settingsVersion || 0);
    const connectionMode = raw?.connectionMode === 'custom' ? 'custom' : 'tavern';
    const enabled = settingsVersion >= 2 ? raw?.enabled !== false : true;
    const migratedTemperature =
      settingsVersion < 3 && (raw?.temperature == null || Number(raw.temperature) === 0.45)
        ? DEFAULT_SETTINGS.temperature
        : raw?.temperature;
    const migratedMaxTokens =
      settingsVersion < 3 && (raw?.maxTokens == null || Number(raw.maxTokens) === 5200)
        ? DEFAULT_SETTINGS.maxTokens
        : raw?.maxTokens;
    return {
      ...DEFAULT_SETTINGS,
      ...(raw && typeof raw === 'object' ? raw : {}),
      settingsVersion: 3,
      enabled,
      connectionMode,
      lookbackRounds: Math.round(clamp(raw?.lookbackRounds ?? DEFAULT_SETTINGS.lookbackRounds, 1, 8)),
      settleDelayMs: Math.round(clamp(raw?.settleDelayMs ?? DEFAULT_SETTINGS.settleDelayMs, 400, 5000)),
      temperature: clamp(migratedTemperature ?? DEFAULT_SETTINGS.temperature, 0, 1.5),
      maxTokens: Math.round(clamp(migratedMaxTokens ?? DEFAULT_SETTINGS.maxTokens, 1800, 16000)),
    };
  }

  let settings = loadSettings();

  function saveSettings(next) {
    settings = {
      ...DEFAULT_SETTINGS,
      ...next,
      settingsVersion: 3,
      connectionMode: next.connectionMode === 'custom' ? 'custom' : 'tavern',
      lookbackRounds: Math.round(clamp(next.lookbackRounds, 1, 8)),
      settleDelayMs: Math.round(clamp(next.settleDelayMs, 400, 5000)),
      temperature: clamp(next.temperature, 0, 1.5),
      maxTokens: Math.round(clamp(next.maxTokens, 1800, 16000)),
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
      activeEvents: [],
      actors: [],
      intelPackets: [],
      hooks: [],
      cameraHistory: [],
      parallelTurns: [],
      nextTurnPacket: {
        offscreenMoves: [],
        arrivingIntel: [],
        intelInTransit: [],
        npcKnowledge: [],
        activePressures: [],
        pendingConsequences: [],
        uncertainties: [],
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
      offscreenMoves: stringList('offscreenMoves'),
      arrivingIntel: [...stringList('arrivingIntel'), ...stringList('arrivedIntel')].slice(0, 24),
      intelInTransit: stringList('intelInTransit'),
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
      pendingConsequences: stringList('pendingConsequences'),
      uncertainties: stringList('uncertainties'),
      constraints: stringList('constraints'),
    };
  }

  function normalizeState(raw, chatId = getCurrentChatId()) {
    if (!raw || typeof raw !== 'object' || Number(raw.version) !== 1 || (raw.chatId && raw.chatId !== chatId)) {
      return createEmptyState(chatId);
    }
    const state = { ...createEmptyState(chatId), ...clone(raw), chatId };
    // 早期版本允许空字段和错误归类进入档案；读取时先做保守清理，避免脏数据继续喂给副模型。
    // 长期事实与世界摘要交给聊天记忆插件；旧档案读取时不再继续携带这些重复内容。
    delete state.facts;
    delete state.worldSummary;
    delete state.clock;
    state.activeEvents = asArray(state.activeEvents)
      .filter(
        item =>
          asText(item?.title) &&
          asText(item?.summary) &&
          asText(item?.stage) &&
          asText(item?.location) &&
          asText(item?.nextTrigger),
      )
      .map(item => ({ ...item, id: cleanId(item?.id, 'EV', item?.title, item?.location) }))
      .slice(-LIMITS.activeEvents);
    state.actors = asArray(state.actors)
      .filter(
        item =>
          asText(item?.name) &&
          (asText(item?.currentAction) || asText(item?.nextDecision) || asArray(item?.knowledge).some(Boolean)),
      )
      .map(item => ({ ...item, id: cleanId(item?.id, 'AC', item?.name) }))
      .slice(-LIMITS.actors);
    state.intelPackets = asArray(state.intelPackets)
      .filter(
        item =>
          asText(item?.content) &&
          asText(item?.origin) &&
          asText(item?.destination) &&
          asText(item?.channel) &&
          asText(item?.status) &&
          asText(item?.eta) &&
          Number(item?.reliability) > 0,
      )
      .map(item => ({ ...item, id: cleanId(item?.id, 'IN', item?.content, item?.origin) }))
      .slice(-LIMITS.intelPackets);
    state.hooks = asArray(state.hooks)
      .filter(
        item =>
          asText(item?.title) &&
          asText(item?.summary) &&
          asText(item?.stage) &&
          asText(item?.trigger) &&
          asText(item?.failCondition),
      )
      .map(item => ({ ...item, id: cleanId(item?.id, 'HK', item?.title) }))
      .slice(-LIMITS.hooks);
    state.cameraHistory = asArray(state.cameraHistory).slice(-LIMITS.cameraHistory);
    state.parallelTurns = asArray(state.parallelTurns)
      .map(turn => ({
        messageId: Number(turn?.messageId ?? -1),
        swipeId: Number(turn?.swipeId ?? 0),
        revision: Number(turn?.revision ?? 0),
        createdAt: asText(turn?.createdAt),
        acceptedOperations: Math.max(0, Number(turn?.acceptedOperations) || 0),
        rejectedOperations: Math.max(0, Number(turn?.rejectedOperations) || 0),
        scenes: asArray(turn?.scenes)
          .map(scene => ({
            location: asText(scene?.location),
            time: asText(scene?.time),
            actors: asArray(scene?.actors)
              .map(value => asText(value))
              .filter(Boolean)
              .slice(0, 12),
            action: asText(scene?.action),
            body: asText(scene?.body).slice(0, 8000),
          }))
          .filter(scene => scene.body)
          .slice(0, 2),
      }))
      .filter(turn => turn.messageId >= 0 && turn.scenes.length)
      .slice(-LIMITS.parallelTurns);
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
      activeEvents: state.activeEvents,
      actors: state.actors,
      intelPackets: state.intelPackets,
      hooks: state.hooks,
      cameraHistory: state.cameraHistory,
      parallelTurns: state.parallelTurns,
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

  function isFirstFloor(messageId) {
    return Number(messageId) === 0;
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

  function isMainGenerationType(value) {
    return ['normal', 'regenerate', 'swipe', 'continue'].includes(String(value || '').toLowerCase());
  }

  function rolePromptFromSendingMessage(message) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role)) return null;
    if (typeof message.content === 'string') {
      return { role: message.role, content: message.content };
    }
    if (!Array.isArray(message.content)) return null;
    const text = [];
    const images = [];
    for (const part of message.content) {
      if (part?.type === 'text' && typeof part.text === 'string') text.push(part.text);
      else if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') images.push(part.image_url.url);
      else if (part?.type === 'video_url' && typeof part.video_url?.url === 'string') {
        text.push(`[主模型上下文包含视频：${part.video_url.url}]`);
      }
    }
    return {
      role: message.role,
      content: text.join('\n'),
      ...(images.length ? { image: images.length === 1 ? images[0] : images } : {}),
    };
  }

  function chatPromptSnapshot(messages, source, includesCurrentReply = false) {
    const prompts = asArray(messages).map(rolePromptFromSendingMessage).filter(Boolean);
    if (!prompts.length) return null;
    return {
      format: 'chat',
      source,
      capturedAt: Date.now(),
      includesCurrentReply,
      prompts,
    };
  }

  function textPromptSnapshot(prompt, source, includesCurrentReply = false) {
    const content = typeof prompt === 'string' ? prompt : '';
    if (!content) return null;
    return {
      format: 'text',
      source,
      capturedAt: Date.now(),
      includesCurrentReply,
      prompts: [{ role: 'system', content }],
    };
  }

  function rememberPromptSnapshot(messageId, snapshot) {
    const messageKey = currentMessageKey(Number(messageId));
    if (!snapshot || !messageKey) return false;
    runtime.promptSnapshots.set(Number(messageId), { ...clone(snapshot), messageKey });
    while (runtime.promptSnapshots.size > 8) {
      runtime.promptSnapshots.delete(runtime.promptSnapshots.keys().next().value);
    }
    console.info(`[天下演化] 已绑定第 ${messageId} 楼的主模型提示词快照（${snapshot.source}）。`);
    return true;
  }

  function bindActivePromptSnapshot(messageId) {
    const active = runtime.activeMainGeneration;
    if (!active?.snapshot) return false;
    if (!rememberPromptSnapshot(messageId, active.snapshot)) return false;
    runtime.activeMainGeneration = null;
    return true;
  }

  function cachedPromptSnapshot(messageKey) {
    const snapshot = runtime.promptSnapshots.get(Number(messageKey?.messageId));
    if (!snapshot) return null;
    if (!sameMessageKey(snapshot.messageKey, messageKey)) {
      runtime.promptSnapshots.delete(Number(messageKey.messageId));
      return null;
    }
    return clone(snapshot);
  }

  async function captureCurrentPromptDryRun(messageKey) {
    const tavern = api('SillyTavern');
    if (typeof tavern?.generate !== 'function' || runtime.dryRunCapture) return null;
    let resolveCapture;
    const captured = new Promise(resolve => {
      resolveCapture = resolve;
    });
    runtime.dryRunCapture = { resolve: resolveCapture, messageKey };
    let timeoutId;
    try {
      Promise.resolve(tavern.generate('normal', {}, true)).catch(error => {
        console.warn('[天下演化] 主提示词 dry-run 兜底失败，将使用兼容上下文。', error);
      });
      const snapshot = await Promise.race([
        captured,
        new Promise(resolve => {
          timeoutId = setTimeout(() => resolve(null), 8000);
        }),
      ]);
      if (snapshot) {
        const withReply = { ...snapshot, includesCurrentReply: true };
        rememberPromptSnapshot(messageKey.messageId, withReply);
        console.info(`[天下演化] 第 ${messageKey.messageId} 楼通过 dry-run 补获主模型提示词快照。`);
        return withReply;
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
      runtime.dryRunCapture = null;
    }
  }

  async function resolvePromptSnapshot(messageKey) {
    return cachedPromptSnapshot(messageKey) || (await captureCurrentPromptDryRun(messageKey));
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
    const keys = new Set([...Object.keys(oldObject ? oldValue : {}), ...Object.keys(newObject ? newValue : {})]);
    for (const key of keys) {
      deepDiff(
        oldObject ? oldValue[key] : undefined,
        newObject ? newValue[key] : undefined,
        `${path}/${key}`,
        output,
        limit,
      );
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

  function selectRelevantRecords(records, currentText, limit, fields) {
    const haystack = String(currentText || '');
    return asArray(records)
      .map((record, index) => {
        const searchable = fields
          .flatMap(field => {
            const value = record?.[field];
            return Array.isArray(value) ? value : [value];
          })
          .filter(Boolean)
          .join(' ');
        const terms = searchable
          .split(/[\s，。；、：·／/]/)
          .map(value => value.trim())
          .filter(value => value.length >= 2);
        const relevance = terms.reduce(
          (score, term) => score + (haystack.includes(term) ? Math.min(term.length, 8) : 0),
          0,
        );
        return { record, score: relevance + Math.max(0, index - records.length + limit) * 0.01 };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(item => item.record);
  }

  function rotateRecords(records, revision, limit) {
    const source = asArray(records);
    if (source.length <= limit) return source;
    const start = Math.abs(Number(revision) || 0) % source.length;
    return Array.from(
      { length: Math.min(limit, source.length) },
      (_, index) => source[(start + index) % source.length],
    );
  }

  function mergeRecords(primary, secondary, limit) {
    const seen = new Set();
    return [...asArray(primary), ...asArray(secondary)]
      .filter(record => {
        const key = asText(record?.id) || asText(record?.name) || asText(record?.title);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  function buildAutonomyFocus(state, currentText) {
    const actorFields = ['id', 'name', 'location', 'goal', 'currentAction', 'knowledge', 'doesNotKnow', 'nextDecision'];
    const eventFields = ['id', 'title', 'location', 'actors', 'summary', 'nextTrigger'];
    const actors = mergeRecords(
      selectRelevantRecords(state.actors, currentText, 2, actorFields),
      rotateRecords(state.actors, state.revision, 4),
      4,
    );
    const activeEvents = mergeRecords(
      selectRelevantRecords(state.activeEvents, currentText, 2, eventFields),
      rotateRecords(state.activeEvents, state.revision + 1, 3),
      3,
    );
    return {
      policy:
        '这是视野外行动的轮换候选，不是强制更新清单。只选择具备时间、动机、资源和机会的 0—3 名人物推进；其余保持原行动。',
      actors,
      activeEvents,
    };
  }

  function compactStateForPrompt(state, currentText, autonomyFocus) {
    return {
      revision: state.revision,
      activeEvents: mergeRecords(
        selectRelevantRecords(state.activeEvents, currentText, 8, ['id', 'title', 'location', 'actors', 'summary']),
        autonomyFocus?.activeEvents,
        10,
      ),
      actors: mergeRecords(
        selectRelevantRecords(state.actors, currentText, 10, [
          'id',
          'name',
          'location',
          'goal',
          'currentAction',
          'knowledge',
          'doesNotKnow',
        ]),
        autonomyFocus?.actors,
        12,
      ),
      intelPackets: selectRelevantRecords(state.intelPackets, currentText, 10, [
        'id',
        'content',
        'origin',
        'destination',
        'knownBy',
      ]),
      hooks: selectRelevantRecords(state.hooks, currentText, 8, ['id', 'title', 'summary', 'visibleSigns', 'trigger']),
    };
  }

  function outputSchema() {
    const nonEmptyString = { type: 'string', minLength: 1 };
    const stringArray = { type: 'array', items: nonEmptyString };
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
          world_summary: {
            type: 'string',
            minLength: 20,
            maxLength: 280,
            description: '当前天下态势快照；只写已确认且仍有效的宏观或地方局势，不复述本楼玩家场景。',
          },
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
                id: nonEmptyString,
                content: nonEmptyString,
                status: {
                  type: 'string',
                  enum: ['occurred'],
                  description: '硬事实字段只接受已经发生的结果；其他状态应进入事件、驿报或不提交。',
                },
                scope: { type: 'string', enum: ['player_scene', 'parallel_world', 'variable_update'] },
                location: nonEmptyString,
                actors: stringArray,
                witnesses: stringArray,
                publicity: nonEmptyString,
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                importance: { type: 'number', minimum: 0, maximum: 100 },
                evidence: {
                  type: 'string',
                  minLength: 1,
                  description: '具体证据来源与结果，不得只写“正文可见”。',
                },
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
                id: nonEmptyString,
                title: nonEmptyString,
                stage: nonEmptyString,
                status: nonEmptyString,
                location: nonEmptyString,
                actors: stringArray,
                summary: nonEmptyString,
                next_trigger: nonEmptyString,
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
                id: nonEmptyString,
                name: nonEmptyString,
                location: nonEmptyString,
                goal: nonEmptyString,
                current_action: {
                  type: 'string',
                  minLength: 1,
                  description: '此人物此刻正在做的具体行动；没有行动变化就不要提交该人物。',
                },
                knowledge: stringArray,
                next_decision: nonEmptyString,
                updated_reason: {
                  type: 'string',
                  minLength: 1,
                  description: '本轮为何需要更新此人物，必须对应新证据或本轮视野外行动。',
                },
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
                id: nonEmptyString,
                content: nonEmptyString,
                origin: nonEmptyString,
                destination: nonEmptyString,
                channel: nonEmptyString,
                status: nonEmptyString,
                eta: nonEmptyString,
                reliability: { type: 'number', minimum: 0.01, maximum: 1 },
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
                id: nonEmptyString,
                title: nonEmptyString,
                stage: nonEmptyString,
                summary: nonEmptyString,
                visible_signs: stringArray,
                trigger: nonEmptyString,
                fail_condition: nonEmptyString,
                source_fact_ids: stringArray,
              },
            },
          },
          resolve_hook_ids: stringArray,
          camera_history: {
            type: 'array',
            maxItems: 2,
            items: nonEmptyString,
            description: '本轮两个平行场景的短标签，不是场景正文。',
          },
          parallel_world: {
            type: 'string',
            minLength: 80,
            maxLength: 5000,
            description: '两个可直接追加到主模型消息末尾的玩家视野外成品场景，不含平行世界标签。',
          },
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
                  properties: { name: nonEmptyString, knows: stringArray, doesNotKnow: stringArray },
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

  function incrementalSystemPrompt() {
    return `你是《残明余烬》的天下演化史官。主模型已经完成玩家视角正文；你只提交本轮世界档案的必要变化，并写出最多两个玩家视野外场景。

一、证据边界
1. CURRENT_TURN.assistantOutput 和最终 MVU 变化是本轮新增事实的主要证据。玩家输入只代表意图。
2. 主模型当轮提示词快照与 CANONICAL_STATE 仅用于理解和延续，不得把旧资料重复当成新事实。
3. 只有明确发生的结果才能推动事件、人物、情报或延迟后果；计划、命令、传闻、失败尝试和氛围不得伪装成已经发生的结果。
4. 平行场景只能展示本轮操作已经支持的变化，不能先写重大结果再用场景认证它。

二、增量原则
1. 只返回发生变化的内容，不重写完整档案。
2. patch/resolve/remove 必须复用 CANONICAL_STATE 中已有的稳定 ID；upsert 可以不提供 ID，由脚本根据实体内容生成。
   若目标尚未出现在对应档案数组中，必须使用 upsert，绝不能根据姓名自造 actor_xxx、event_xxx 一类 ID。patch 的 set 还要附带身份字段：人物 name、事件/伏线 title、情报 content，供脚本核对目标。
3. 不要总结正文、复述世界现状、记录玩家履历或重写 MVU/状态栏字段；这些由聊天记忆、变量结构与状态栏负责。
4. 事件只记录仍在自行推进、会对未来形成压力的进程，不把玩家当前任务或地图静态态势换一种说法抄入档案。
5. 人物只记录玩家视野外的行动、地点、目标、knowledge、does_not_know 或下一决策变化；当前在场人物的状态由 MVU 负责。明确的认知盲区写入 does_not_know，不要只列“知道什么”。
6. 情报必须有起点、终点、渠道、状态和抵达时间；人物不能无渠道获得消息。
7. 伏线只记录有明确触发条件或失效条件的延迟后果，不记录一般剧情摘要。

三、视野外人物自主行动
1. AUTONOMY_FOCUS 是轮换候选而非强制清单。每轮只推进具备足够虚构时间、行动机会、动机和资源的 0—3 名人物；没有合理推进条件时保持原行动，不得为了凑 operations 强行变化。
2. 人物依据自己的目标、当前位置、既有行动、已知信息和资源约束做事，不等待玩家触发，也不要求所有人围绕玩家当轮行为作出反应。
3. 严守知识边界：人物只能利用 knowledge、亲历事实和已经抵达的情报；does_not_know 中的内容以及尚在传递的消息不得用于决策。
4. 先判断本轮流逝的时间与行动尺度。短暂对话不能让远方人物瞬间跨城或完成长期计划；可以只记录“继续执行”而不产生 patch。
5. 额外激活的世界书只提供身份、地点、制度、关系和行动约束，不等于本轮新事实，也不得替人物补出无来源的知识。

四、旁线场景
1. parallel_scenes 最多两个，每个包含 location、time、actors、action、body。
2. 场景必须在玩家当前视野之外，优先表现合法操作推进的事件、人物行动或情报传播。
3. 不得重演玩家场景，不得凭空制造胜负、死亡、陷城或政局结果。
4. body 不使用 <平行世界> 标签，不写“与此同时”“玩家不知道的是”“镜头转向”等元叙事。

五、输出
1. 只返回符合 JSON Schema 的一个 JSON 对象。operations 可以为空；没有变化的字段不得凑数。base_revision 必须原样回传。
2. operations 中每一项都必须带 type 字段。type 只能是：event.upsert、event.patch、event.resolve、actor.upsert、actor.patch、intel.upsert、intel.patch、intel.remove、hook.upsert、hook.patch、hook.resolve。不得使用 op、operation、action 或自造名称代替 type。
3. upsert 的 ID 可省略；脚本会生成稳定 ID。不要为了新增人物、事件或情报臆造内部 ID。只有修改或结束已有记录时才必须照抄既有 ID。`;
  }

  function incrementalOutputSchema() {
    const text = { type: 'string', maxLength: 600 };
    const prose = { type: 'string', maxLength: 3000 };
    const textArray = { type: 'array', items: text, maxItems: 20 };
    const eventFields = {
      title: text,
      stage: text,
      status: text,
      location: text,
      actors: textArray,
      summary: text,
      next_trigger: text,
      source_fact_ids: textArray,
      impact_domains: textArray,
    };
    const actorFields = {
      name: text,
      location: text,
      goal: text,
      current_action: text,
      knowledge: textArray,
      does_not_know: textArray,
      next_decision: text,
      updated_reason: text,
    };
    const intelFields = {
      content: text,
      origin: text,
      destination: text,
      channel: text,
      status: text,
      eta: text,
      reliability: { type: 'number', minimum: 0, maximum: 1 },
      known_by: textArray,
    };
    const hookFields = {
      title: text,
      stage: text,
      summary: text,
      visible_signs: textArray,
      trigger: text,
      fail_condition: text,
      source_fact_ids: textArray,
    };
    const recordOperation = (type, fields, mode, requiredFields = []) => ({
      type: 'object',
      additionalProperties: false,
      required: mode === 'patch' ? ['type', 'id', 'set'] : ['type', 'value'],
      properties: {
        type: { type: 'string', enum: [type] },
        id: text,
        ...(mode === 'patch'
          ? { set: { type: 'object', additionalProperties: false, required: requiredFields, properties: fields } }
          : {
              value: {
                type: 'object',
                additionalProperties: false,
                required: requiredFields,
                properties: fields,
              },
            }),
      },
    });
    const idOperation = type => ({
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id'],
      properties: { type: { type: 'string', enum: [type] }, id: text },
    });
    return {
      name: 'cmyj_world_engine_increment_v2',
      strict: false,
      value: {
        type: 'object',
        additionalProperties: false,
        required: ['schema_version', 'base_revision', 'operations', 'parallel_scenes'],
        properties: {
          schema_version: { type: 'integer', enum: [2] },
          base_revision: { type: 'integer', minimum: 0 },
          operations: {
            type: 'array',
            maxItems: 32,
            items: {
              anyOf: [
                recordOperation('event.upsert', eventFields, 'upsert', [
                  'title',
                  'stage',
                  'status',
                  'location',
                  'actors',
                  'summary',
                  'next_trigger',
                ]),
                recordOperation('event.patch', eventFields, 'patch', ['title']),
                idOperation('event.resolve'),
                recordOperation('actor.upsert', actorFields, 'upsert', [
                  'name',
                  'location',
                  'goal',
                  'current_action',
                  'updated_reason',
                ]),
                recordOperation('actor.patch', actorFields, 'patch', ['name']),
                recordOperation('intel.upsert', intelFields, 'upsert', [
                  'content',
                  'origin',
                  'destination',
                  'channel',
                  'status',
                  'eta',
                  'reliability',
                ]),
                recordOperation('intel.patch', intelFields, 'patch', ['content']),
                idOperation('intel.remove'),
                recordOperation('hook.upsert', hookFields, 'upsert', [
                  'title',
                  'stage',
                  'summary',
                  'trigger',
                  'fail_condition',
                ]),
                recordOperation('hook.patch', hookFields, 'patch', ['title']),
                idOperation('hook.resolve'),
              ],
            },
          },
          parallel_scenes: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['location', 'time', 'actors', 'action', 'body'],
              properties: {
                location: text,
                time: text,
                actors: textArray,
                action: text,
                body: prose,
              },
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
    const currentText = current?.message || '';
    const autonomyFocus = buildAutonomyFocus(baseState, currentText);
    return {
      instruction:
        '先判定 CURRENT_TURN 中真正发生了什么，再让具备时间与机会的视野外人物按自身目标继续行动，最后只提交必要 operations。CANONICAL_STATE 是只读工作集，patch 必须复用其中已有 ID。',
      baseRevision: Number(baseState.revision) || 0,
      currentTurn: {
        messageId: messageKey.messageId,
        swipeId: messageKey.swipeId,
        userInputAsIntentOnly: findPreviousUserInput(messageKey.messageId),
        assistantOutput: stripForContext(currentText).slice(0, 30000),
        mvuChanges: deepDiff(previousStat, currentStat).slice(0, 100),
      },
      autonomyFocus,
      recentContextReadOnly: buildRecentContext(messageKey.messageId),
      canonicalState: compactStateForPrompt(baseState, currentText, autonomyFocus),
    };
  }

  function customApiConfig() {
    if (settings.connectionMode !== 'custom') {
      return {
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
      };
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
    const incrementCandidates = [result.worldStateIncrement, result.transition, result.data, result.result, result];
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

  function normalizeParallelScenes(value) {
    const cleanBody = value =>
      asText(value)
        .replace(/<\/?(?:平行世界|parallel[_ -]?world)(?:\s[^>]*)?>/gi, '')
        .trim();
    const direct = asArray(value)
      .map(scene =>
        typeof scene === 'string'
          ? { location: '', time: '', actors: [], action: '', body: cleanBody(scene) }
          : {
              location: asText(scene?.location),
              time: asText(scene?.time),
              actors: asArray(scene?.actors)
                .map(item => asText(item))
                .filter(Boolean)
                .slice(0, 12),
              action: asText(scene?.action),
              body: cleanBody(scene?.body || scene?.content || scene?.text),
            },
      )
      .filter(scene => scene.body)
      .slice(0, 2);
    return direct;
  }

  function legacyParallelScene(result) {
    const body = asText(
      result?.parallel_world ||
        result?.parallelWorld ||
        result?.parallelWorldText ||
        result?.parallel_world_text ||
        result?.worldStateIncrement?.parallelWorld ||
        result?.transition?.parallelWorld,
    )
      .replace(/^\s*<平行世界(?:\s[^>]*)?>/i, '')
      .replace(/<\/平行世界>\s*$/i, '')
      .trim();
    return body ? [{ location: '', time: '', actors: [], action: '', body }] : [];
  }

  function legacyOperations(result) {
    const operations = [];
    const addRecords = (type, records) => {
      asArray(records).forEach(value => {
        const id = asText(value?.id);
        operations.push({
          type,
          ...(id ? { id } : {}),
          value,
        });
      });
    };
    addRecords('event.upsert', result?.upsert_events || result?.upsertEvents || result?.newOrUpdatedEvents);
    addRecords('actor.upsert', result?.upsert_actors || result?.upsertActors || result?.newOrUpdatedActors);
    addRecords('intel.upsert', result?.upsert_intel || result?.upsertIntel || result?.newIntelPackets);
    addRecords('hook.upsert', result?.upsert_hooks || result?.upsertHooks || result?.newOrUpdatedHooks);
    asArray(result?.resolve_event_ids || result?.resolveEventIds).forEach(id =>
      operations.push({ type: 'event.resolve', id }),
    );
    asArray(result?.remove_intel_ids || result?.removeIntelIds).forEach(id =>
      operations.push({ type: 'intel.remove', id }),
    );
    asArray(result?.resolve_hook_ids || result?.resolveHookIds).forEach(id =>
      operations.push({ type: 'hook.resolve', id }),
    );
    return operations;
  }

  function operationObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  function operationTextArray(value) {
    if (Array.isArray(value)) {
      return value
        .map(item => asText(item))
        .filter(Boolean)
        .slice(0, 24);
    }
    const text = asText(value);
    return text
      ? text
          .split(/[、,，/]/)
          .map(item => item.trim())
          .filter(Boolean)
          .slice(0, 24)
      : [];
  }

  function operationText(value) {
    return Array.isArray(value) ? operationTextArray(value).join('、') : asText(value);
  }

  function firstOperationText(...values) {
    for (const value of values) {
      const text = operationText(value);
      if (text) return text;
    }
    return '';
  }

  function semanticTitle(value, maxLength = 48) {
    const text = asText(value).replace(/\s+/g, ' ');
    if (!text) return '';
    return (text.split(/[。！？!?\n]/)[0] || text).trim().slice(0, maxLength);
  }

  const OPERATION_PAYLOAD_KEYS = Object.freeze([
    'value',
    'record',
    'data',
    'payload',
    'fields',
    'attributes',
    'properties',
    'details',
    'params',
    'arguments',
    // 部分兼容 OpenAI 的供应商会无视 upsert 的 value 约束，错误地沿用 patch 包装。
    // 归一化阶段统一剥离，真正的 patch 仍会在下方写回 set。
    'set',
    'changes',
    'patch',
  ]);

  function unwrapOperationPayload(value, entityKey) {
    let current = operationObject(value);
    if (!current) return null;
    current = { ...current };
    for (let depth = 0; depth < 3; depth += 1) {
      const nestedKey = [entityKey, ...OPERATION_PAYLOAD_KEYS].find(key => key && operationObject(current?.[key]));
      if (!nestedKey) break;
      const nested = current[nestedKey];
      delete current[nestedKey];
      current = { ...current, ...nested };
    }
    return current;
  }

  function inferOperationType(operation, declaredType) {
    if (SUPPORTED_OPERATION_TYPES.has(declaredType)) return declaredType;
    const source =
      OPERATION_PAYLOAD_KEYS.map(key => operationObject(operation?.[key])).find(Boolean) || operation || {};
    const id = asText(
      operation?.id ||
        operation?.target_id ||
        operation?.targetId ||
        operation?.record_id ||
        operation?.recordId ||
        source?.id,
    ).toLowerCase();
    const hasText = (...keys) => keys.some(key => asText(source?.[key] ?? operation?.[key]));
    if (
      /^event[_.-]/.test(id) ||
      (hasText('name', 'title') && hasText('description', 'summary') && hasText('location') && hasText('status'))
    ) {
      return 'event.upsert';
    }
    if (/^actor[_.-]/.test(id) && hasText('name')) return 'actor.upsert';
    if (
      /^intel[_.-]/.test(id) ||
      (hasText('content') && hasText('source', 'origin') && hasText('receiver', 'destination'))
    ) {
      return 'intel.upsert';
    }
    if (/^hook[_.-]/.test(id) && hasText('name', 'title')) return 'hook.upsert';
    return declaredType;
  }

  function deriveUpsertId(type, value) {
    const prefix = {
      'fact.add': 'F',
      'event.upsert': 'EV',
      'actor.upsert': 'AC',
      'intel.upsert': 'IN',
      'hook.upsert': 'HK',
    }[type];
    if (!prefix) return '';
    const identity = asText(
      value?.name ||
        value?.title ||
        value?.content ||
        value?.summary ||
        value?.description ||
        value?.fact ||
        value?.text,
    );
    if (!identity) return '';
    const discriminator =
      type === 'fact.add'
        ? asText(value?.location)
        : type === 'intel.upsert'
          ? asText(value?.origin || value?.source)
          : '';
    return stableId(prefix, identity, discriminator);
  }

  function operationIdentity(type, value) {
    if (type.startsWith('event.')) return firstOperationText(value?.title, value?.name);
    if (type.startsWith('actor.')) return firstOperationText(value?.name, value?.actor_name, value?.actorName);
    if (type.startsWith('intel.')) return firstOperationText(value?.content, value?.message, value?.summary);
    if (type.startsWith('hook.')) return firstOperationText(value?.title, value?.name);
    return '';
  }

  function comparableIdentity(value) {
    return asText(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  }

  function existingByIdentity(type, collection, value) {
    const identity = comparableIdentity(operationIdentity(type, value));
    if (!identity) return null;
    const matches = asArray(collection).filter(item => comparableIdentity(operationIdentity(type, item)) === identity);
    return matches.length === 1 ? matches[0] : null;
  }

  function hasOperationChangeBeyondIdentity(type, value) {
    const identityKeys = type.startsWith('actor.')
      ? new Set(['name', 'actor_name', 'actorName'])
      : type.startsWith('intel.')
        ? new Set(['content', 'message', 'summary'])
        : new Set(['title', 'name']);
    return Object.keys(value || {}).some(key => !identityKeys.has(key));
  }

  function normalizeOperationShape(operation) {
    if (!operationObject(operation)) return operation;
    const typeCandidates = [
      operation.type,
      operation.operationType,
      operation.operation_type,
      operation.op,
      operation.operation,
      operation.action,
    ]
      .map(value => asText(value))
      .filter(Boolean);
    const declaredType = typeCandidates[0] || '';
    const type =
      typeCandidates.find(candidate => SUPPORTED_OPERATION_TYPES.has(candidate)) ||
      inferOperationType(operation, declaredType);
    if (!type) return operation;

    const id = asText(
      operation.id || operation.target_id || operation.targetId || operation.record_id || operation.recordId,
    );
    if (type === 'summary.replace') {
      const valueObject = operationObject(operation.value);
      const summary =
        asText(operation.value) ||
        asText(
          operation.summary ||
            operation.new_summary ||
            operation.newSummary ||
            operation.world_summary ||
            operation.worldSummary ||
            operation.content ||
            operation.text ||
            valueObject?.summary ||
            valueObject?.new_summary ||
            valueObject?.newSummary ||
            valueObject?.world_summary ||
            valueObject?.worldSummary ||
            valueObject?.content ||
            valueObject?.text,
        );
      return { ...operation, type, ...(id ? { id } : {}), value: summary };
    }

    if (['event.resolve', 'intel.remove', 'hook.resolve'].includes(type)) {
      return { ...operation, type, ...(id ? { id } : {}) };
    }

    const entityKey = type.split('.')[0];
    const explicitValue =
      OPERATION_PAYLOAD_KEYS.map(key => operationObject(operation[key])).find(Boolean) ||
      operationObject(operation[entityKey]);
    const flatValue = { ...operation };
    [
      'type',
      'operationType',
      'operation_type',
      'op',
      'operation',
      'id',
      'target_id',
      'targetId',
      'record_id',
      'recordId',
      'value',
      'record',
      'data',
      'payload',
      'fields',
      'attributes',
      'properties',
      'details',
      'params',
      'arguments',
      'set',
      'changes',
      'patch',
    ].forEach(key => delete flatValue[key]);
    if (asText(flatValue.action) === type) delete flatValue.action;
    let value = unwrapOperationPayload(explicitValue || flatValue, entityKey) || {};
    if (type.startsWith('event.') && type !== declaredType && !asText(value.stage || value.category)) {
      value = { ...value, category: declaredType };
    }

    if (type === 'fact.add') {
      const rawConfidence = value.confidence ?? value.certainty ?? value.reliability;
      const numericConfidence = Number(rawConfidence);
      value = {
        ...value,
        content: asText(value.content || value.fact || value.description || value.summary || value.text),
        status: asText(value.status || value.state, 'occurred'),
        scope: asText(value.scope || value.source_scope || value.sourceScope, 'player_scene'),
        location: asText(value.location || value.place || value.where || value.site, '本轮正文所述地点'),
        actors: operationTextArray(value.actors || value.participants || value.people),
        witnesses: operationTextArray(value.witnesses || value.observers),
        publicity: asText(value.publicity || value.visibility || value.exposure || value.public_status, '公开程度未明'),
        confidence: Number.isFinite(numericConfidence)
          ? numericConfidence > 1 && numericConfidence <= 100
            ? numericConfidence / 100
            : numericConfidence
          : 0.8,
        importance: Number(value.importance ?? value.priority ?? 60),
        evidence: asText(value.evidence || value.source || value.basis || value.proof, '本轮正文明确叙述'),
      };
    }

    const effectiveId =
      id || asText(value?.id) || (type.endsWith('.upsert') || type === 'fact.add' ? deriveUpsertId(type, value) : '');
    const patchSource =
      operationObject(operation.set) || operationObject(operation.changes) || operationObject(operation.patch);
    const patch = unwrapOperationPayload(patchSource, entityKey) || (type.endsWith('.patch') ? value : null);
    return {
      ...operation,
      type,
      ...(effectiveId ? { id: effectiveId } : {}),
      ...(type.endsWith('.patch') ? { set: patch || {} } : { value }),
    };
  }

  function normalizeIncrementalResult(result, expectedRevision) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('副模型输出缺少可用的结构化对象。');
    }
    const rawOperations = asArray(result.operations || result.ops).slice(0, 32);
    const operations = rawOperations
      .map(normalizeOperationShape)
      .filter(operation => !RETIRED_OPERATION_TYPES.has(asText(operation?.type)));
    const declaredSchemaVersion = result.schema_version ?? result.schemaVersion;
    if (operations.length && declaredSchemaVersion != null && Number(declaredSchemaVersion) !== 2) {
      throw new Error(`副模型输出的 schema_version=${declaredSchemaVersion}，当前仅接受版本 2。`);
    }
    if (operations.length && !operations.some(operation => SUPPORTED_OPERATION_TYPES.has(asText(operation?.type)))) {
      const received = [
        ...new Set(
          operations.map(operation => {
            const type = asText(operation?.type);
            if (type) return type;
            if (!operation || typeof operation !== 'object') return typeof operation;
            const keys = Object.keys(operation).slice(0, 5).join(', ');
            return keys ? `缺少 type（收到字段：${keys}）` : '缺少 type';
          }),
        ),
      ];
      throw new Error(`副模型 operations 结构无效：${received.join('；')}`);
    }
    const scenes = normalizeParallelScenes(result.parallel_scenes || result.parallelScenes || result.scenes);
    const normalized = {
      schema_version: Number(result.schema_version || result.schemaVersion || 2),
      base_revision: Number(result.base_revision ?? result.baseRevision ?? expectedRevision),
      operations: operations.length ? operations : legacyOperations(result).slice(0, 32),
      parallel_scenes: scenes.length ? scenes : legacyParallelScene(result),
    };
    if (!normalized.operations.length && !normalized.parallel_scenes.length) {
      throw new Error('副模型结构中既没有增量操作，也没有可用的旁线场景。');
    }
    return normalized;
  }

  function worldInfoItemContent(item) {
    if (typeof item === 'string') return item.trim();
    if (!item || typeof item !== 'object') return '';
    if (Array.isArray(item.entries))
      return item.entries
        .map(value => asText(value))
        .filter(Boolean)
        .join('\n');
    return asText(item.content || item.value || item.text || item.prompt).trim();
  }

  function formatWorldInfoSupplement(result, promptSnapshot) {
    if (!result || typeof result !== 'object') return '';
    const snapshotText = asArray(promptSnapshot?.prompts)
      .map(prompt => asText(prompt?.content))
      .join('\n');
    const sections = [];
    const seen = new Set();
    const structuredValues = [
      result.worldInfoBefore,
      result.worldInfoAfter,
      ...asArray(result.worldInfoExamples),
      ...asArray(result.worldInfoDepth),
      ...asArray(result.anBefore),
      ...asArray(result.anAfter),
    ];
    const add = (label, value) => {
      const content = worldInfoItemContent(value);
      if (!content || seen.has(content) || snapshotText.includes(content)) return;
      seen.add(content);
      sections.push(`${label}\n${content}`);
    };
    add('【世界书·角色定义前】', result.worldInfoBefore);
    add('【世界书·角色定义后】', result.worldInfoAfter);
    asArray(result.worldInfoExamples).forEach(item => add('【世界书·示例】', item));
    asArray(result.worldInfoDepth).forEach(item => add('【世界书·深度注入】', item));
    asArray(result.anBefore).forEach(item => add('【世界书·作者注释前】', item));
    asArray(result.anAfter).forEach(item => add('【世界书·作者注释后】', item));
    if (!structuredValues.some(worldInfoItemContent)) add('【世界书·补充】', result.worldInfoString);
    return sections.join('\n\n').slice(0, 32000);
  }

  function worldInfoScanMessages(payload) {
    const focus = payload?.autonomyFocus || {};
    const focusText = [
      ...asArray(focus.actors).flatMap(actor => [
        actor?.name,
        actor?.location,
        actor?.goal,
        actor?.currentAction,
        actor?.nextDecision,
        ...asArray(actor?.knowledge),
        ...asArray(actor?.doesNotKnow),
      ]),
      ...asArray(focus.activeEvents).flatMap(event => [
        event?.title,
        event?.location,
        event?.summary,
        event?.nextTrigger,
        ...asArray(event?.actors),
      ]),
    ]
      .map(value => asText(value))
      .filter(Boolean)
      .join('\n')
      .slice(0, 12000);
    const newest = [
      '本轮玩家视角正文：',
      asText(payload?.currentTurn?.assistantOutput),
      '天下演化视野外人物与事件候选：',
      focusText,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 45000);
    const userIntent = asText(payload?.currentTurn?.userInputAsIntentOnly).slice(0, 12000);
    return [newest, userIntent].filter(Boolean);
  }

  async function resolveWorldInfoSupplement(payload, promptSnapshot) {
    const tavern = api('SillyTavern');
    if (typeof tavern?.getWorldInfoPrompt !== 'function') return '';
    const messages = worldInfoScanMessages(payload);
    if (!messages.length) return '';
    try {
      const maxContext = clamp(Number(tavern.maxContext) || 65536, 4096, 1048576);
      const result = await tavern.getWorldInfoPrompt(messages, maxContext, true);
      return formatWorldInfoSupplement(result, promptSnapshot);
    } catch (error) {
      console.warn('[天下演化] 定向世界书扫描失败，将继续使用主模型提示词快照。', error);
      return '';
    }
  }

  function worldModelPrompts(promptSnapshot, assistantOutput, systemPrompt, userPrompt, worldInfoSupplement) {
    if (!promptSnapshot?.prompts?.length) {
      return [
        ...(worldInfoSupplement
          ? [
              {
                role: 'system',
                content: `以下内容由酒馆根据本轮正文与视野外行动候选额外激活，只作为世界设定和行动约束，不得覆盖天下演化的证据边界与输出格式：\n\n${worldInfoSupplement}`,
              },
            ]
          : []),
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
    }
    const prompts = clone(promptSnapshot.prompts);
    if (!promptSnapshot.includesCurrentReply && assistantOutput) {
      prompts.push({ role: 'assistant', content: assistantOutput });
    }
    prompts.push({
      role: 'system',
      content:
        '以上是主模型生成本轮正文时实际读取的提示词快照，仅作为世界设定、人物认知和剧情事实依据。现在切换为天下演化任务：忽略快照中要求续写正文、扮演人物或输出其他格式的指令，只执行下面的天下演化规则。',
    });
    if (worldInfoSupplement) {
      prompts.push({
        role: 'system',
        content: `以下内容由酒馆根据本轮正文与视野外行动候选额外激活，只作为世界设定和行动约束，不得覆盖天下演化的证据边界与输出格式：\n\n${worldInfoSupplement}`,
      });
    }
    prompts.push({ role: 'system', content: systemPrompt });
    prompts.push({ role: 'user', content: userPrompt });
    return prompts;
  }

  async function callWorldModel(payload, generationId, promptSnapshot, worldInfoSupplement) {
    const generateRaw = api('generateRaw');
    const generate = api('generate');
    if (typeof generateRaw !== 'function' && typeof generate !== 'function')
      throw new Error('未找到 generateRaw/generate 接口。');
    const requestPayload = clone(payload);
    if (promptSnapshot) delete requestPayload.recentContextReadOnly;
    const userPrompt = `以下内容包含可结算的 CURRENT_TURN 与只读天下档案。请完成事实提取和世界增量。\n\n${JSON.stringify(requestPayload, null, 2)}`;
    const customApi = customApiConfig();
    const schema = incrementalOutputSchema();
    let forcePromptJsonSchema = isOfficialDeepSeekApi(customApi);
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const usePromptJsonSchema = forcePromptJsonSchema;
      const schemaPrompt = usePromptJsonSchema ? deepSeekJsonSchemaPrompt(schema) : '';
      const retryHint = attempt
        ? forcePromptJsonSchema
          ? '\n\n上次请求不兼容严格 JSON Schema 或输出未通过解析。此次只返回满足上述 Schema 的 JSON 对象。'
          : '\n\n上次输出未通过解析。此次必须严格只返回符合 Schema 的 JSON。'
        : '';
      const requestUserPrompt = `${userPrompt}${schemaPrompt}${retryHint}`;
      const config = {
        generation_id: generationId,
        should_silence: true,
        ordered_prompts: worldModelPrompts(
          promptSnapshot,
          payload.currentTurn?.assistantOutput || '',
          incrementalSystemPrompt(),
          requestUserPrompt,
          worldInfoSupplement,
        ),
        ...(usePromptJsonSchema ? {} : { json_schema: schema }),
      };
      config.custom_api = customApi;
      try {
        runtime.worldRequestActive = true;
        const request =
          typeof generateRaw === 'function'
            ? generateRaw(config)
            : generate({
                generation_id: generationId,
                should_silence: true,
                user_input: `${worldInfoSupplement ? `酒馆额外激活的世界书设定与行动约束：\n${worldInfoSupplement}\n\n` : ''}${incrementalSystemPrompt()}\n\n${requestUserPrompt}`,
                ...(usePromptJsonSchema ? {} : { json_schema: schema }),
                custom_api: customApi,
              });
        let timeoutId;
        const raw = await Promise.race([
          Promise.resolve(request).finally(() => clearTimeout(timeoutId)),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              try {
                api('stopGenerationById')?.(generationId);
              } catch {
                /* 请求超时后停止失败也要正常释放界面 */
              }
              reject(new Error('副模型请求超过 90 秒仍未返回，请检查当前连接或更换模型。'));
            }, 90000);
          }),
        ]);
        const normalized = normalizeIncrementalResult(parseAiResult(raw), payload.baseRevision);
        if (normalized.operations.length) {
          const preview = buildTransitionFromOperations(payload.canonicalState || {}, normalized, {});
          if (
            preview.operation_stats.accepted === 0 &&
            preview.operation_stats.rejected > 0 &&
            normalized.parallel_scenes.length === 0
          ) {
            throw new Error(
              `副模型 operations 结构未通过校验：${preview.operation_stats.warnings.slice(0, 3).join('；')}`,
            );
          }
        }
        return normalized;
      } catch (error) {
        lastError = error;
        if (!usePromptJsonSchema && shouldFallbackFromJsonSchema(error)) {
          forcePromptJsonSchema = true;
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        const canRetry = /JSON|Schema|结构|工具调用|解析/i.test(message);
        if (!canRetry) break;
      } finally {
        runtime.worldRequestActive = false;
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

  function eventInput(raw, id = raw?.id, fallbackLocation = '') {
    const titleSource = firstOperationText(raw?.title, raw?.name, raw?.event_name, raw?.eventName);
    const summarySource = firstOperationText(raw?.summary, raw?.description, raw?.content, raw?.text, titleSource);
    const title = titleSource || semanticTitle(summarySource);
    const summary = summarySource || title;
    return {
      id,
      title,
      stage: firstOperationText(
        raw?.stage,
        raw?.category,
        raw?.kind,
        raw?.event_type,
        raw?.eventType,
        raw?.status,
        summary ? '进行中' : '',
      ),
      status: firstOperationText(raw?.status, raw?.state, summary ? 'active' : ''),
      location: firstOperationText(
        raw?.location,
        raw?.place,
        raw?.where,
        raw?.site,
        summary ? fallbackLocation || '地点未明' : '',
      ),
      actors: operationTextArray(raw?.actors || raw?.participants || raw?.involved_actors || raw?.involvedActors),
      summary,
      next_trigger: firstOperationText(
        raw?.next_trigger,
        raw?.nextTrigger,
        raw?.next_step,
        raw?.nextStep,
        raw?.trigger,
        raw?.impact,
        summary ? '等待相关人物的下一步行动推动局势' : '',
      ),
      source_fact_ids: operationTextArray(raw?.source_fact_ids || raw?.sourceFactIds),
      impact_domains: operationTextArray(raw?.impact_domains || raw?.impactDomains),
    };
  }

  function actorInput(raw, id = raw?.id) {
    const name = firstOperationText(raw?.name, raw?.actor_name, raw?.actorName);
    const description = firstOperationText(raw?.description, raw?.summary, raw?.content);
    return {
      id,
      name,
      location: firstOperationText(raw?.location, raw?.place, raw?.where),
      goal: firstOperationText(raw?.goal, raw?.objective, raw?.intent),
      current_action: firstOperationText(
        raw?.current_action,
        raw?.currentAction,
        raw?.action,
        description,
        raw?.status,
        name ? '当前行动未明' : '',
      ),
      knowledge: operationTextArray(raw?.knowledge || raw?.knows),
      does_not_know: operationTextArray(raw?.does_not_know || raw?.doesNotKnow || raw?.unknown),
      next_decision: firstOperationText(raw?.next_decision, raw?.nextDecision, raw?.goal),
      updated_reason: firstOperationText(
        raw?.updated_reason,
        raw?.updatedReason,
        raw?.reason,
        description,
        raw?.status,
        name ? '本轮被识别为相关人物' : '',
      ),
    };
  }

  function intelInput(raw, id = raw?.id) {
    const reliability = Number(raw?.reliability ?? raw?.confidence ?? raw?.certainty);
    const content = firstOperationText(raw?.content, raw?.message, raw?.summary, raw?.description, raw?.text);
    const receivers = operationTextArray(
      raw?.receivers ||
        raw?.recipients ||
        raw?.receiver ||
        raw?.recipient ||
        raw?.destination ||
        raw?.targets ||
        raw?.known_by ||
        raw?.knownBy,
    );
    return {
      id,
      content,
      origin: firstOperationText(raw?.origin, raw?.source, raw?.sender, raw?.from, content ? '来源未明' : ''),
      destination: firstOperationText(
        raw?.destination,
        raw?.receiver,
        raw?.recipient,
        raw?.receivers,
        raw?.recipients,
        raw?.to,
        raw?.targets,
        content ? '去向未明' : '',
      ),
      channel: firstOperationText(raw?.channel, raw?.method, raw?.medium, raw?.route, content ? '口耳相传' : ''),
      status: firstOperationText(raw?.status, raw?.state, raw?.phase, content ? '传播中' : ''),
      eta: firstOperationText(
        raw?.eta,
        raw?.reach_time,
        raw?.reachTime,
        raw?.arrival_time,
        raw?.arrivalTime,
        raw?.timing,
        raw?.delay,
        content ? '抵达时间未明' : '',
      ),
      reliability:
        Number.isFinite(reliability) && reliability > 0 ? (reliability > 1 ? reliability / 100 : reliability) : 0.7,
      known_by: receivers,
    };
  }

  function hookInput(raw, id = raw?.id) {
    const titleSource = firstOperationText(raw?.title, raw?.name, raw?.hook_name, raw?.hookName);
    const summarySource = firstOperationText(raw?.summary, raw?.description, raw?.content, raw?.text, titleSource);
    const title = titleSource || semanticTitle(summarySource);
    const summary = summarySource || title;
    return {
      id,
      title,
      stage: firstOperationText(raw?.stage, raw?.status, raw?.state, summary ? '潜伏中' : ''),
      summary,
      visible_signs: operationTextArray(raw?.visible_signs || raw?.visibleSigns || raw?.signs || raw?.clues),
      trigger: firstOperationText(
        raw?.trigger,
        raw?.next_trigger,
        raw?.nextTrigger,
        raw?.condition,
        summary ? '相关人物获得行动机会时' : '',
      ),
      fail_condition: firstOperationText(
        raw?.fail_condition,
        raw?.failCondition,
        raw?.resolve_condition,
        raw?.resolveCondition,
        raw?.end_condition,
        raw?.endCondition,
        summary ? '伏线被化解或失去现实条件' : '',
      ),
      source_fact_ids: operationTextArray(raw?.source_fact_ids || raw?.sourceFactIds),
    };
  }

  function cameraLabel(scene) {
    const actors = asArray(scene?.actors)
      .map(value => asText(value))
      .filter(Boolean)
      .join('、');
    return [asText(scene?.location), actors, asText(scene?.action)].filter(Boolean).join('—').slice(0, 240);
  }

  function deriveNextTurnPacket(legacy) {
    const intel = asArray(legacy.upsert_intel);
    const intelLabel = item =>
      [
        asText(item?.content),
        asText(item?.origin) && `起点：${asText(item.origin)}`,
        asText(item?.destination) && `终点：${asText(item.destination)}`,
        asText(item?.channel) && `渠道：${asText(item.channel)}`,
        asText(item?.eta) && `抵达：${asText(item.eta)}`,
      ]
        .filter(Boolean)
        .join('｜');
    const arrived = intel.filter(item => /抵达|已达|公开|送达|arrived|delivered/i.test(asText(item?.status)));
    const inTransit = intel.filter(item => !arrived.includes(item));
    const changedEvents = asArray(legacy.upsert_events);
    const changedActors = asArray(legacy.upsert_actors);
    const changedHooks = asArray(legacy.upsert_hooks);
    return {
      offscreenMoves: changedActors
        .map(item =>
          [
            asText(item?.name),
            asText(item?.location) && `位于${asText(item.location)}`,
            asText(item?.current_action || item?.currentAction),
            asText(item?.next_decision || item?.nextDecision) &&
              `下一决策：${asText(item?.next_decision || item?.nextDecision)}`,
          ]
            .filter(Boolean)
            .join('｜'),
        )
        .filter(Boolean)
        .slice(0, 12),
      arrivingIntel: arrived.map(intelLabel).filter(Boolean).slice(0, 12),
      intelInTransit: inTransit.map(intelLabel).filter(Boolean).slice(0, 12),
      npcKnowledge: changedActors
        .filter(
          item =>
            asText(item?.name) &&
            (asArray(item?.knowledge).length || asArray(item?.does_not_know || item?.doesNotKnow).length),
        )
        .map(item => ({
          name: asText(item.name),
          knows: asArray(item.knowledge)
            .map(value => asText(value))
            .filter(Boolean)
            .slice(0, 12),
          doesNotKnow: asArray(item?.does_not_know || item?.doesNotKnow)
            .map(value => asText(value))
            .filter(Boolean)
            .slice(0, 12),
        }))
        .slice(0, 12),
      activePressures: changedEvents
        .map(item =>
          [asText(item?.summary), asText(item?.next_trigger) && `下一触发：${asText(item.next_trigger)}`]
            .filter(Boolean)
            .join('｜'),
        )
        .filter(Boolean)
        .slice(0, 12),
      pendingConsequences: changedHooks
        .map(item =>
          [
            asText(item?.title),
            asText(item?.trigger) && `触发：${asText(item.trigger)}`,
            asText(item?.fail_condition) && `失效：${asText(item.fail_condition)}`,
          ]
            .filter(Boolean)
            .join('｜'),
        )
        .filter(Boolean)
        .slice(0, 12),
      uncertainties: intel
        .filter(item => Number(item?.reliability) > 0 && Number(item.reliability) < 0.75)
        .map(item => `${asText(item?.content)}｜可靠度：${Math.round(Number(item.reliability) * 100)}%`)
        .filter(Boolean)
        .slice(0, 12),
      constraints: [],
    };
  }

  function buildTransitionFromOperations(baseState, result, currentStat) {
    const transition = {
      world_summary: '',
      new_facts: [],
      upsert_events: [],
      resolve_event_ids: [],
      upsert_actors: [],
      upsert_intel: [],
      remove_intel_ids: [],
      upsert_hooks: [],
      resolve_hook_ids: [],
      camera_history: asArray(result.parallel_scenes).map(cameraLabel).filter(Boolean),
      next_turn_packet: {},
      parallel_scenes: normalizeParallelScenes(result.parallel_scenes),
      operation_stats: { accepted: 0, rejected: 0, warnings: [] },
    };
    const stats = transition.operation_stats;
    const reject = (operation, reason) => {
      stats.rejected += 1;
      const type = asText(operation?.type);
      const label =
        type ||
        `缺少 type（字段：${
          Object.keys(operation || {})
            .slice(0, 5)
            .join(', ') || '无'
        }）`;
      stats.warnings.push(`${label}：${reason}`.slice(0, 300));
    };
    const accept = () => {
      stats.accepted += 1;
    };
    const existingById = (collection, id) => asArray(collection).find(item => String(item?.id) === String(id));

    for (const operation of asArray(result.operations)) {
      const type = asText(operation?.type);
      const id = asText(operation?.id);
      const value = operation?.value && typeof operation.value === 'object' ? operation.value : {};
      const patch = operation?.set && typeof operation.set === 'object' ? operation.set : {};
      try {
        if (type === 'summary.replace') {
          const summary = asText(operation?.value).replace(/\s+/g, ' ').slice(0, 600);
          if (!summary) reject(operation, '摘要为空');
          else {
            transition.world_summary = summary;
            accept();
          }
          continue;
        }
        if (type === 'fact.add') {
          const fact = { ...value, id: id || value?.id };
          const missing = [
            !asText(fact.content) && 'content',
            asText(fact.status) !== 'occurred' && 'status=occurred',
            !asText(fact.location) && 'location',
            !asText(fact.publicity) && 'publicity',
            !asText(fact.evidence) && 'evidence',
            (!Number.isFinite(Number(fact.confidence)) || Number(fact.confidence) < 0.6) && 'confidence≥0.6',
          ].filter(Boolean);
          if (missing.length) {
            reject(operation, `事实缺少 ${missing.join('、')}`);
          } else {
            transition.new_facts.push(fact);
            accept();
          }
          continue;
        }
        if (['event.resolve', 'intel.remove', 'hook.resolve'].includes(type)) {
          if (!id) {
            reject(operation, '缺少目标 ID');
            continue;
          }
          const mapping = {
            'event.resolve': ['activeEvents', 'resolve_event_ids'],
            'intel.remove': ['intelPackets', 'remove_intel_ids'],
            'hook.resolve': ['hooks', 'resolve_hook_ids'],
          };
          const [collection, output] = mapping[type];
          if (!existingById(baseState[collection], id)) reject(operation, `目标 ${id} 不存在`);
          else {
            transition[output].push(id);
            accept();
          }
          continue;
        }

        const descriptors = {
          'event.upsert': ['activeEvents', 'upsert_events', eventInput],
          'event.patch': ['activeEvents', 'upsert_events', eventInput],
          'actor.upsert': ['actors', 'upsert_actors', actorInput],
          'actor.patch': ['actors', 'upsert_actors', actorInput],
          'intel.upsert': ['intelPackets', 'upsert_intel', intelInput],
          'intel.patch': ['intelPackets', 'upsert_intel', intelInput],
          'hook.upsert': ['hooks', 'upsert_hooks', hookInput],
          'hook.patch': ['hooks', 'upsert_hooks', hookInput],
        };
        const descriptor = descriptors[type];
        if (!descriptor) {
          reject(operation, '未知操作类型');
          continue;
        }
        const [collection, output, normalizer] = descriptor;
        const isPatch = type.endsWith('.patch');
        if (isPatch && !Object.keys(patch).length) {
          reject(operation, 'patch 没有提交任何变化字段');
          continue;
        }

        let effectiveId = id;
        let existing = effectiveId ? existingById(baseState[collection], effectiveId) : null;
        if (!existing) {
          const identityMatch = existingByIdentity(type, baseState[collection], isPatch ? patch : value);
          if (identityMatch) {
            existing = identityMatch;
            effectiveId = asText(identityMatch.id);
          }
        }

        // 未入天下档案的人物/事件经常被模型误写成 patch，并臆造 actor_xxx 一类 ID。
        // 只有载荷带有可验证的实体身份时才本地降级为新增，避免把匿名 patch 串到错误档案。
        const repairedUnknownPatch =
          isPatch &&
          !existing &&
          Boolean(operationIdentity(type, patch)) &&
          hasOperationChangeBeyondIdentity(type, patch);
        if (isPatch && !existing && !repairedUnknownPatch) {
          reject(operation, effectiveId ? `patch 目标 ${effectiveId} 不存在` : 'patch 缺少可识别的目标身份');
          continue;
        }

        const input = repairedUnknownPatch
          ? patch
          : isPatch || existing
            ? { ...existing, ...(isPatch ? patch : value) }
            : value;
        if (!effectiveId || repairedUnknownPatch) {
          effectiveId = deriveUpsertId(type.replace('.patch', '.upsert'), input);
        }
        const merged = normalizer(input, effectiveId, asText(currentStat?.世界运转?.当前地点));
        if (isPatch && existing && JSON.stringify(merged) === JSON.stringify(normalizer(existing, effectiveId))) {
          reject(operation, 'patch 没有产生有效变化');
          continue;
        }
        const valid = type.startsWith('event.')
          ? merged.title && merged.summary
          : type.startsWith('actor.')
            ? merged.name
            : type.startsWith('intel.')
              ? merged.content
              : merged.title && merged.summary;
        const invalidReason = type.startsWith('event.')
          ? '缺少事件标题或内容'
          : type.startsWith('actor.')
            ? '缺少人物名称'
            : type.startsWith('intel.')
              ? '缺少情报内容'
              : '缺少伏线标题或内容';
        if (!valid) reject(operation, invalidReason);
        else if (!effectiveId) reject(operation, '无法根据实体内容生成稳定 ID');
        else {
          transition[output].push(merged);
          accept();
        }
      } catch (error) {
        reject(operation, error instanceof Error ? error.message : String(error));
      }
    }
    transition.next_turn_packet = deriveNextTurnPacket(transition);
    return transition;
  }

  function applyTransition(baseState, result, messageKey, currentStat) {
    const state = clone(baseState);
    const source = result && typeof result === 'object' ? result : {};
    state.revision = Number(state.revision || 0) + 1;

    const resolvedEvents = new Set(asArray(source.resolve_event_ids).map(String));
    state.activeEvents = asArray(state.activeEvents).filter(item => !resolvedEvents.has(String(item.id)));
    state.activeEvents = upsertById(state.activeEvents, source.upsert_events, LIMITS.activeEvents, 'EV', raw => {
      if (
        !asText(raw?.title) ||
        !asText(raw?.summary) ||
        !asText(raw?.stage) ||
        !asText(raw?.location) ||
        !asText(raw?.next_trigger)
      ) {
        return null;
      }
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
        summary: asText(raw?.summary).slice(0, 420),
        nextTrigger: asText(raw?.next_trigger).slice(0, 280),
        impactDomains: asArray(raw?.impact_domains)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 12),
        sourceFactIds: asArray(raw?.source_fact_ids)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 20),
      };
    });

    state.actors = upsertById(state.actors, source.upsert_actors, LIMITS.actors, 'NPC', raw => {
      if (!asText(raw?.name) || !asText(raw?.current_action) || !asText(raw?.updated_reason)) return null;
      return {
        id: raw?.id,
        name: asText(raw?.name),
        location: asText(raw?.location),
        goal: asText(raw?.goal).slice(0, 280),
        currentAction: asText(raw?.current_action).slice(0, 360),
        knowledge: asArray(raw?.knowledge)
          .map(value => asText(value).slice(0, 240))
          .filter(Boolean)
          .slice(0, 30),
        doesNotKnow: asArray(raw?.does_not_know)
          .map(value => asText(value).slice(0, 240))
          .filter(Boolean)
          .slice(0, 20),
        nextDecision: asText(raw?.next_decision).slice(0, 280),
        updatedReason: asText(raw?.updated_reason).slice(0, 240),
      };
    });

    const removedIntel = new Set(asArray(source.remove_intel_ids).map(String));
    state.intelPackets = asArray(state.intelPackets).filter(item => !removedIntel.has(String(item.id)));
    state.intelPackets = upsertById(state.intelPackets, source.upsert_intel, LIMITS.intelPackets, 'INTEL', raw => {
      if (
        !asText(raw?.content) ||
        !asText(raw?.origin) ||
        !asText(raw?.destination) ||
        !asText(raw?.channel) ||
        !asText(raw?.status) ||
        !asText(raw?.eta) ||
        Number(raw?.reliability) <= 0
      ) {
        return null;
      }
      return {
        id: raw?.id,
        content: asText(raw?.content).slice(0, 420),
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
      if (
        !asText(raw?.title) ||
        !asText(raw?.summary) ||
        !asText(raw?.stage) ||
        !asText(raw?.trigger) ||
        !asText(raw?.fail_condition)
      ) {
        return null;
      }
      return {
        id: raw?.id,
        title: asText(raw?.title),
        stage: asText(raw?.stage),
        summary: asText(raw?.summary).slice(0, 360),
        visibleSigns: asArray(raw?.visible_signs)
          .map(value => asText(value))
          .filter(Boolean)
          .slice(0, 16),
        trigger: asText(raw?.trigger).slice(0, 280),
        failCondition: asText(raw?.fail_condition).slice(0, 280),
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
    const scenes = normalizeParallelScenes(source.parallel_scenes);
    if (scenes.length) {
      state.parallelTurns = [
        ...asArray(state.parallelTurns).filter(
          turn =>
            Number(turn?.messageId) !== Number(messageKey.messageId) ||
            Number(turn?.swipeId) !== Number(messageKey.swipeId),
        ),
        {
          messageId: messageKey.messageId,
          swipeId: messageKey.swipeId,
          revision: state.revision,
          createdAt: nowIso(),
          acceptedOperations: Number(source.operation_stats?.accepted) || 0,
          rejectedOperations: Number(source.operation_stats?.rejected) || 0,
          scenes,
        },
      ].slice(-LIMITS.parallelTurns);
    }
    state.lastProcessed = { messageId: messageKey.messageId, swipeId: messageKey.swipeId, hash: messageKey.hash };
    state.lastRun = {
      at: nowIso(),
      sourceMessageId: messageKey.messageId,
      sourceSwipeId: messageKey.swipeId,
      acceptedOperations: Number(source.operation_stats?.accepted) || 0,
      rejectedOperations: Number(source.operation_stats?.rejected) || 0,
      warnings: asArray(source.operation_stats?.warnings)
        .map(value => asText(value))
        .filter(Boolean)
        .slice(0, 12),
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
      formatBulletSection('玩家视野外正在进行的行动', packet.offscreenMoves),
      formatBulletSection('已经进入玩家可知范围的情报', packet.arrivingIntel),
      formatBulletSection('仍在传播、尚不可直接得知的情报', packet.intelInTransit),
      knowledge ? `相关人物知识边界:\n${knowledge}` : '',
      formatBulletSection('正在施压的世界事件', packet.activePressures),
      formatBulletSection('等待条件兑现的延迟后果', packet.pendingConsequences),
      formatBulletSection('仍未证实或彼此冲突的信息', packet.uncertainties),
      formatBulletSection('本轮约束', packet.constraints),
      `主模型联动协议：
  - 正文只允许人物使用其有合理渠道知道的内容；模型知道不等于人物知道。
  - 只负责玩家当前视角内的正文、变量更新、状态栏与行动选项，不要生成平行世界、远景旁白或 <平行世界> 标签。
  - 玩家视野外的旁线由天下演化独立保存和展示，不属于聊天正文格式。
  - 不得让远方人物知晓尚未通过合理渠道传播的玩家秘密；世界不是围着玩家运转。
  - 未经上下文许可，不得突然确定城池陷落、人物死亡、军队胜败等重大结果。
  - 玩家本轮输入仍须由正文判定成败，本上下文不能替代行动判定。`,
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

  async function processMessage(messageId, { force = false, source = 'auto' } = {}) {
    if (isFirstFloor(messageId) && source !== 'manual') {
      runtime.pendingMessageId = null;
      runtime.pendingForce = false;
      runtime.lastNotice = '首楼是开场初始化内容，自动推演已忽略。';
      renderPanel();
      return getChatState();
    }
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
      const promptSnapshot = await resolvePromptSnapshot(messageKey);
      if (!jobStillValid(job)) throw new Error('聊天或回复版本已经改变，本次推演结果已作废。');
      if (!promptSnapshot) {
        console.warn(`[天下演化] 第 ${messageId} 楼没有可用的主模型提示词快照，将使用兼容上下文。`);
      }
      const worldInfoSupplement = await resolveWorldInfoSupplement(payload, promptSnapshot);
      if (!jobStillValid(job)) throw new Error('聊天或回复版本已经改变，本次推演结果已作废。');
      const result = await callWorldModel(payload, generationId, promptSnapshot, worldInfoSupplement);
      if (!jobStillValid(job)) throw new Error('聊天或回复版本已经改变，本次推演结果已作废。');
      if (Number(result.base_revision) !== Number(baseState.revision)) {
        throw new Error(`副模型基线 revision ${result.base_revision} 与当前档案 ${baseState.revision} 不一致。`);
      }
      const transition = buildTransitionFromOperations(baseState, result, currentStat || {});
      if (transition.operation_stats.rejected > 0) {
        console.warn('[天下演化] 部分 operations 未通过校验', {
          accepted: transition.operation_stats.accepted,
          rejected: transition.operation_stats.rejected,
          warnings: transition.operation_stats.warnings,
          shapes: asArray(result.operations).map(operation => ({
            type: asText(operation?.type),
            id: asText(operation?.id),
            keys: Object.keys(operation || {}).slice(0, 16),
            payloadKeys: Object.keys(operation?.value || operation?.set || {}).slice(0, 24),
          })),
        });
      }
      if (
        asArray(result.operations).length &&
        transition.operation_stats.accepted === 0 &&
        transition.operation_stats.rejected > 0 &&
        transition.parallel_scenes.length === 0
      ) {
        throw new Error(
          `副模型返回的 ${transition.operation_stats.rejected} 项 operations 全部无效，本轮未写入档案，请重新推演。`,
        );
      }
      const nextState = applyTransition(baseState, transition, messageKey, currentStat || {});
      const saved = saveChatState(nextState);
      refreshInjection(saved);
      runtime.pendingMessageId = null;
      const sceneCount =
        saved.parallelTurns.at(-1)?.messageId === messageId ? saved.parallelTurns.at(-1).scenes.length : 0;
      runtime.lastNotice = `第 ${messageId} 楼推演完成：接受 ${saved.lastRun?.acceptedOperations ?? 0} 项变化，忽略 ${saved.lastRun?.rejectedOperations ?? 0} 项，收录 ${sceneCount} 段旁线。`;
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
      const queued = runtime.queuedProcess;
      runtime.queuedProcess = null;
      if (queued && settings.enabled) {
        scheduleProcess(queued.messageId, queued.options);
      }
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
    if (isFirstFloor(messageId) && source !== 'manual') {
      runtime.pendingMessageId = null;
      runtime.pendingForce = false;
      return;
    }
    runtime.pendingMessageId = Number(messageId);
    runtime.scheduledTimer = setTimeout(() => {
      if (!settings.enabled || (!settings.autoRun && source === 'auto')) return;
      if (runtime.busy) {
        runtime.queuedProcess = {
          messageId: Number(messageId),
          options: { force, source, delayMs: 180 },
        };
        return;
      }
      processMessage(messageId, { force, source }).catch(() => {});
    }, delayMs);
  }

  function ensureLatestTurnSettledBeforeMainGeneration(generationType, dryRun) {
    if (dryRun || runtime.dryRunCapture || !settings.enabled || !settings.autoRun) return;
    if (['regenerate', 'swipe', 'continue', 'impersonate'].includes(String(generationType || '').toLowerCase())) return;
    const messageId = findLatestAssistantMessageId();
    if (messageId <= 0) return;
    const key = currentMessageKey(messageId);
    if (!key || sameMessageKey(getChatState().lastProcessed, key)) return;
    clearTimeout(runtime.scheduledTimer);
    if (runtime.busy) return;
    // 天下演化不再阻塞下一轮正文。完成后刷新联动包，供之后的轮次使用。
    processMessage(messageId, { force: false, source: 'pre-generation' }).catch(() => {});
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
      state.nextTurnPacket.pendingConsequences[0] ||
      state.intelPackets.at(-1)?.content ||
      '';
    const packetSize =
      state.nextTurnPacket.offscreenMoves.length +
      state.nextTurnPacket.arrivingIntel.length +
      state.nextTurnPacket.activePressures.length +
      state.nextTurnPacket.pendingConsequences.length;
    const focus = recentEvents[0];
    const focusTitle =
      focus?.title ||
      state.nextTurnPacket.offscreenMoves[0]?.split('｜')[0] ||
      state.nextTurnPacket.intelInTransit[0]?.split('｜')[0] ||
      '视野外暂无新的行动';
    const focusDetail =
      focus?.summary ||
      state.nextTurnPacket.offscreenMoves[0] ||
      state.nextTurnPacket.intelInTransit[0] ||
      '天下演化将只记录状态栏、MVU 与记忆插件没有覆盖的远方变化。';
    const operationWarnings = asArray(state.lastRun?.warnings).slice(0, 3);
    const noticeCards = [];
    if (runtime.lastError || runtime.lastNotice) {
      const isError = Boolean(runtime.lastError);
      noticeCards.push(`<section class="cwe-notice ${isError ? 'danger' : ''}" role="${isError ? 'alert' : 'status'}">
        <i aria-hidden="true"></i>
        <div class="cwe-notice-body"><b>${isError ? '最近一次错误' : '值房消息'}</b><p>${escapeHtml(noticeLabel(runtime.lastError || runtime.lastNotice))}</p></div>
        <button type="button" class="cwe-notice-close" data-action="dismiss-notice" data-notice-kind="runtime" aria-label="关闭此消息"><span aria-hidden="true">×</span></button>
      </section>`);
    }
    operationWarnings.forEach((value, index) => {
      noticeCards.push(`<section class="cwe-notice danger" role="alert">
        <i aria-hidden="true"></i>
        <div class="cwe-notice-body"><b>忽略 ${index + 1}/${operationWarnings.length}</b><p>${escapeHtml(noticeLabel(value))}</p></div>
        <button type="button" class="cwe-notice-close" data-action="dismiss-notice" data-notice-kind="warning" data-warning-index="${index}" aria-label="关闭此条操作警告"><span aria-hidden="true">×</span></button>
      </section>`);
    });
    const eventLabels = ['方才', '稍前', '先前', '在案'];
    const events = recentEvents.length
      ? recentEvents
          .map((event, index) => {
            const tone = index === 0 ? 'danger' : index === 1 ? 'busy' : 'safe';
            const cause = event.actors?.length ? event.actors.join('、') : '因由仍在查核';
            const eventState = statusLabel(event.stage || event.status, '推进中');
            const influence = asArray(event.impactDomains).length
              ? event.impactDomains.join('／')
              : event.nextTrigger || '影响仍待显现';
            return `<article class="cwe-event-row ${tone}">
              <div class="cwe-event-when"><i></i><strong>${eventLabels[index]}</strong><b>${index === 0 ? '本轮' : `第 ${Math.max(1, state.revision - index)} 次`}</b><span>${escapeHtml(event.location || '地点未明')}</span></div>
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
            (
              [label, title, summary],
              index,
            ) => `<article class="cwe-event-row is-empty ${index === 1 ? 'busy' : 'safe'}">
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
          <div class="cwe-brief-kicker"><span>视野外焦点</span><span>第 ${state.revision} 次演化</span></div>
          <h2>${escapeHtml(focusTitle)}</h2>
          <p>${escapeHtml(shortText(focusDetail, 260))}</p>
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
      ${noticeCards.length ? `<div class="cwe-notice-stack" aria-live="polite">${noticeCards.join('')}</div>` : ''}
      <section class="cwe-ledger-layout">
        <div class="cwe-ledger-main">
          <header class="cwe-ledger-head"><div><small>正在发生</small><h3>天下事次</h3></div><button type="button" data-tab="events">查看全部 ${state.activeEvents.length} 件</button></header>
          <div class="cwe-event-list">${events}</div>
        </div>
        <aside class="cwe-margin-notes">
          <section>
            <header><small>正在展开的伏线</small><b>${hook ? '伏线将熟' : '尚无伏线'}</b></header>
            ${hook ? `<h3>${escapeHtml(hook.title || hook.id)}</h3><p>${escapeHtml(shortText(hook.summary, 220))}</p><div class="cwe-hook-progress"><span>成熟度</span><i><b style="width:${hookProgress}%"></b></i></div><footer><span>${escapeHtml(statusLabel(hook.stage, '潜伏中'))}</span><span>${escapeHtml(hook.trigger ? `触发：${hook.trigger}` : '等待触发')}</span></footer>` : `<h3>伏线尚未入档</h3><p>完成一次推演后，未在玩家视角出现的因果会记录于此。</p><div class="cwe-hook-progress"><span>成熟度</span><i><b style="width:0%"></b></i></div>`}
          </section>
          <section>
            <header><small>可能延后的后果</small><b>${delayedConsequence ? '后果待至' : '尚待积累'}</b></header>
            <h3>${delayedConsequence ? '局势仍在暗处累积' : '暂无可见压力'}</h3>
            <p>${escapeHtml(shortText(delayedConsequence || '当前没有需要递延到后续回合的明确后果。', 220))}</p>
            <footer><span>有效联动 ${packetSize} 条</span><span>不重复保存聊天摘要</span></footer>
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
        <header><div><small>${escapeHtml(event.id)}</small><h3>${escapeHtml(event.title || '未题名事件')}</h3></div>${tag(statusLabel(event.stage || event.status, '进行中'), 'safe')}</header>
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
        <header><div><small>${escapeHtml(item.channel || '未知渠道')} · ${Math.round(Number(item.reliability || 0) * 100)}%</small><h3>${escapeHtml(shortText(item.content, 90))}</h3></div>${tag(statusLabel(item.status, '在途'))}</header>
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

  function renderParallelWorld(state) {
    const turns = asArray(state.parallelTurns).slice().reverse();
    if (!turns.length) {
      return `<section class="cwe-section-head"><div><p>视野之外</p><h2>平行世界</h2></div><span>旁线原文只保存在天下演化档案中</span></section>
        <section class="cwe-parallel-empty">${emptyBlock('完成一次推演后，玩家视野之外的场景会收录于此')}</section>`;
    }
    const content = turns
      .map((turn, turnIndex) => {
        const scenes = asArray(turn.scenes)
          .map((scene, sceneIndex) => {
            const paragraphs = asText(scene.body)
              .split(/\n{2,}/)
              .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
              .join('');
            return `<article class="cwe-parallel-scene">
              <header>
                <div><small>镜头 ${sceneIndex + 1}</small><h3>${escapeHtml(scene.location || '地点未明')}</h3></div>
                <span>${escapeHtml(scene.time || '与此刻相近')}</span>
              </header>
              ${scene.action ? `<blockquote>${escapeHtml(scene.action)}</blockquote>` : ''}
              <div class="cwe-parallel-prose">${paragraphs}</div>
              ${scene.actors.length ? `<footer>${scene.actors.map(actor => tag(actor)).join('')}</footer>` : ''}
            </article>`;
          })
          .join('');
        return `<section class="cwe-parallel-turn ${turnIndex === 0 ? 'is-latest' : ''}">
          <header class="cwe-parallel-turn-head">
            <div><small>${turnIndex === 0 ? '最新旁线' : '往期旁线'}</small><h3>第 ${turn.messageId} 楼 · 页 ${turn.swipeId + 1}</h3></div>
            <p><span>档案修订 ${turn.revision}</span><span>接受 ${turn.acceptedOperations} 项</span>${turn.rejectedOperations ? `<span class="danger">忽略 ${turn.rejectedOperations} 项</span>` : ''}</p>
          </header>
          <div class="cwe-parallel-scenes">${scenes}</div>
        </section>`;
      })
      .join('');
    return `<section class="cwe-section-head"><div><p>视野之外</p><h2>平行世界</h2></div><span>只在值房中留档，不进入主模型聊天历史</span></section>
      <section class="cwe-parallel-board">${content}</section>`;
  }

  function renderMemory(state) {
    const packet = normalizePacket(state.nextTurnPacket);
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
        <header><h3>${escapeHtml(hook.title || hook.id)}</h3>${tag(statusLabel(hook.stage, '潜伏中'), 'hook')}</header>
        <p>${escapeHtml(shortText(hook.summary, 180))}</p>
        ${hook.trigger ? `<small>触发：${escapeHtml(hook.trigger)}</small>` : ''}
      </article>`,
          )
          .join('')
      : emptyBlock('暂无活跃伏线');
    const blindSpots = [
      ...packet.intelInTransit.map(value => ({ tone: '在途', value })),
      ...packet.uncertainties.map(value => ({ tone: '未证', value })),
      ...packet.npcKnowledge.flatMap(item => item.doesNotKnow.map(value => ({ tone: `${item.name}未知`, value }))),
    ].slice(0, 24);
    const blindSpotCards = blindSpots.length
      ? blindSpots
          .map(
            item => `
      <article class="cwe-fact">
        <i></i>
        <div><p>${escapeHtml(shortText(item.value, 220))}</p><small>${escapeHtml(item.tone)}</small></div>
      </article>`,
          )
          .join('')
      : emptyBlock('暂无在途、未证或认知受限的信息');
    return `<section class="cwe-section-head"><div><p>天下案牍</p><h2>人物、后果与盲区</h2></div><span>只保存记忆插件和状态变量通常无法表达的世界约束</span></section>
      <section class="cwe-archive-grid">
        <div class="cwe-archive-column"><header><div><small>人物行动</small><h3>名籍</h3></div>${tag(`${state.actors.length} 人`)}</header><div class="cwe-scroll-list">${actors}</div></div>
        <div class="cwe-archive-column"><header><div><small>条件后果</small><h3>因果债</h3></div>${tag(`${state.hooks.length} 条`, 'hook')}</header><div class="cwe-scroll-list">${hooks}</div></div>
        <div class="cwe-archive-column"><header><div><small>传播与认知</small><h3>信息盲区</h3></div>${tag(`${blindSpots.length} 条`)}</header><div class="cwe-scroll-list">${blindSpotCards}</div></div>
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
          <label class="cwe-check"><input type="checkbox" data-setting="autoRun" ${settings.autoRun ? 'checked' : ''}><span>正文与 MVU 更新完成后，由副模型提交世界变化并把旁线收录到天下演化档案</span></label>
          <div class="cwe-field-row"><label><span>回看最近几轮</span><input type="number" min="1" max="8" data-setting="lookbackRounds" value="${settings.lookbackRounds}"></label><label><span>等待 MVU 完成（毫秒）</span><input type="number" min="400" max="5000" step="100" data-setting="settleDelayMs" value="${settings.settleDelayMs}"></label></div>
          <p class="cwe-help">最新一轮可产生新事实，回看的旧轮次只负责理解“他”“那封信”等承接关系。</p>
        </section>
        <section class="cwe-settings-section">
          <header><div><small>结构化推演</small><h3>模型参数</h3></div>${tag(`${settings.maxTokens} tokens`)}</header>
          <div class="cwe-field-row"><label><span>温度</span><input type="number" min="0" max="1.5" step="0.05" data-setting="temperature" value="${settings.temperature}"></label><label><span>最大输出</span><input type="number" min="1800" max="16000" step="100" data-setting="maxTokens" value="${settings.maxTokens}"></label></div>
          <div class="cwe-actions-row"><button class="primary" type="button" data-action="save-settings">保存设置</button><button type="button" data-action="refresh-injection">重建联动</button><button type="button" data-action="export-state">导出档案</button><button class="danger" type="button" data-action="clear-state">清空档案</button></div>
          <p class="cwe-help">当前聊天：${escapeHtml(state.chatId || '未识别')}。清空只影响这一份聊天，不影响其他存档。</p>
        </section>
      </div>`;
  }

  function panelBody(state) {
    if (runtime.activeTab === 'events') return renderEvents(state);
    if (runtime.activeTab === 'parallel') return renderParallelWorld(state);
    if (runtime.activeTab === 'memory') return renderMemory(state);
    return renderOverview(state);
  }

  function frameMarkup(state) {
    const connection = effectiveConnection();
    const tabs = [
      ['overview', '总览'],
      ['events', '世事'],
      ['parallel', '旁线'],
      ['memory', '档案'],
    ];
    return `<main class="cwe-panel theme-${currentStatusbarTheme()}">
      <header class="cwe-header">
        <div class="cwe-brand"><img class="cwe-brand-mark" src="${compassSeal}" alt=""><div class="cwe-brand-title"><div><h1>天下演化</h1><span class="cwe-title-seal" aria-hidden="true">演</span></div><p>视野外因果档案 · 修订 ${state.revision}</p></div></div>
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
            <p><span>本轮重演：${runtime.busy ? '执行中' : '待命'}</span><span>有效联动：${normalizePacket(state.nextTurnPacket).offscreenMoves.length + normalizePacket(state.nextTurnPacket).activePressures.length + normalizePacket(state.nextTurnPacket).pendingConsequences.length} 条</span><span>旁线留档：${state.parallelTurns.length} 轮</span></p>
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
      if (action === 'dismiss-notice') {
        const kind = event.target.closest('[data-notice-kind]')?.dataset.noticeKind;
        if (kind === 'warning') {
          const state = getChatState();
          if (state.lastRun) {
            const warningIndex = Number(event.target.closest('[data-warning-index]')?.dataset.warningIndex);
            const warnings = asArray(state.lastRun.warnings);
            if (Number.isInteger(warningIndex) && warningIndex >= 0) warnings.splice(warningIndex, 1);
            state.lastRun = { ...state.lastRun, warnings };
            saveChatState(state);
          }
        } else {
          runtime.lastError = '';
          runtime.lastNotice = '';
          updateLampState();
        }
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
    return (hostWindow.visualViewport?.width || hostWindow.innerWidth) <= 720;
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
    const viewport = hostWindow.visualViewport;
    const width = Math.round(viewport?.width || hostWindow.innerWidth);
    const height = Math.round(viewport?.height || hostWindow.innerHeight);
    const compact = width <= 980;
    const panelWidth = isMobile()
      ? Math.max(280, width - 12)
      : Math.min(Math.round(width * (compact ? 0.92 : 0.8)), 1180);
    const panelHeight = isMobile()
      ? Math.max(360, height - 12)
      : Math.min(Math.round(height * (compact ? 0.9 : 0.8)), 680);
    Object.assign(frame.style, {
      display: '',
      position: 'fixed',
      border: '0',
      background: 'transparent',
      zIndex: '100001',
      width: `${panelWidth}px`,
      height: `${panelHeight}px`,
      left: `${Math.max(6, Math.round((width - panelWidth) / 2) + Math.round(viewport?.offsetLeft || 0))}px`,
      top: `${Math.max(6, Math.round((height - panelHeight) / 2) + Math.round(viewport?.offsetTop || 0))}px`,
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
    hostWindow.visualViewport?.addEventListener('resize', onResize);
    lamp.addEventListener('click', onClick);
    lamp.addEventListener('keydown', onKeyDown);
    runtime.cleanupFns.push(() => {
      hostWindow.removeEventListener('pointermove', onMove);
      hostWindow.removeEventListener('touchmove', onMove);
      hostWindow.removeEventListener('pointerup', onUp);
      hostWindow.removeEventListener('touchend', onUp);
      hostWindow.removeEventListener('resize', onResize);
      hostWindow.visualViewport?.removeEventListener('resize', onResize);
    });
  }

  function registerEvents() {
    const on = api('eventOn');
    const events = globalThis.tavern_events ?? hostWindow.tavern_events;
    if (typeof on !== 'function' || !events) return;

    on(events.GENERATION_STARTED, (generationType, _options, dryRun) => {
      if (dryRun || runtime.dryRunCapture || runtime.worldRequestActive || !isMainGenerationType(generationType))
        return;
      runtime.activeMainGeneration = {
        type: String(generationType),
        startedAt: Date.now(),
        snapshot: null,
      };
    });
    on(events.GENERATE_AFTER_DATA, (generateData, dryRun) => {
      const snapshot = chatPromptSnapshot(
        generateData?.prompt,
        dryRun ? 'dry-run/generate-after-data' : 'generate-after-data',
      );
      if (runtime.dryRunCapture && (dryRun === true || runtime.activeMainGeneration == null)) {
        runtime.dryRunCapture.resolve(snapshot);
        return;
      }
      if (!dryRun && runtime.activeMainGeneration && snapshot) {
        runtime.activeMainGeneration.snapshot = snapshot;
      }
    });
    on(events.CHAT_COMPLETION_PROMPT_READY, ({ chat, dryRun } = {}) => {
      const snapshot = chatPromptSnapshot(chat, dryRun ? 'dry-run/chat-completion' : 'chat-completion');
      if (runtime.dryRunCapture && (dryRun === true || runtime.activeMainGeneration == null)) {
        runtime.dryRunCapture.resolve(snapshot);
        return;
      }
      if (!dryRun && runtime.activeMainGeneration && snapshot) {
        runtime.activeMainGeneration.snapshot = snapshot;
      }
    });
    on(events.GENERATE_AFTER_COMBINE_PROMPTS, ({ prompt, dryRun } = {}) => {
      const snapshot = textPromptSnapshot(prompt, dryRun ? 'dry-run/text-completion' : 'text-completion');
      if (runtime.dryRunCapture && (dryRun === true || runtime.activeMainGeneration == null)) {
        runtime.dryRunCapture.resolve(snapshot);
        return;
      }
      if (!dryRun && runtime.activeMainGeneration && snapshot) {
        runtime.activeMainGeneration.snapshot = snapshot;
      }
    });
    on(events.GENERATION_ENDED, messageId => {
      bindActivePromptSnapshot(Number(messageId));
    });
    on(events.GENERATION_STOPPED, () => {
      runtime.activeMainGeneration = null;
    });
    on(events.MESSAGE_RECEIVED, (messageId, type) => {
      bindActivePromptSnapshot(Number(messageId));
      if (!settings.enabled || !settings.autoRun) return;
      if (isFirstFloor(messageId) || type === 'first_message' || type === 'quiet' || type === 'extension') return;
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
        if (runtime.pendingMessageId == null) return;
        const messageId = currentMessageKey(runtime.pendingMessageId) ? runtime.pendingMessageId : -1;
        if (messageId <= 0) {
          runtime.pendingMessageId = null;
          runtime.pendingForce = false;
          return;
        }
        scheduleProcess(messageId, { force: runtime.pendingForce, source: 'mvu', delayMs: 120 });
        runtime.pendingForce = false;
      });
    }
    on(events.GENERATION_AFTER_COMMANDS, (generationType, _options, dryRun) =>
      ensureLatestTurnSettledBeforeMainGeneration(generationType, dryRun),
    );
    on(events.MESSAGE_SWIPED, messageId => {
      if (!settings.enabled || !settings.autoRun) return;
      if (isFirstFloor(messageId)) return;
      scheduleProcess(Number(messageId), { force: true, source: 'auto' });
    });
    on(events.MESSAGE_EDITED, messageId => {
      runtime.promptSnapshots.delete(Number(messageId));
      if (!settings.enabled || !settings.autoRun) return;
      if (isFirstFloor(messageId)) return;
      const key = currentMessageKey(Number(messageId));
      if (key) scheduleProcess(Number(messageId), { force: true, source: 'auto' });
    });
    on(events.MESSAGE_DELETED, () => {
      clearTimeout(runtime.scheduledTimer);
      runtime.pendingMessageId = null;
      runtime.pendingForce = false;
      runtime.queuedProcess = null;
      runtime.activeMainGeneration = null;
      runtime.promptSnapshots.clear();
      setTimeout(reconcileAfterHistoryChange, 250);
    });
    on(events.CHAT_CHANGED, chatId => {
      cancelActiveJob('已切换聊天，旧聊天的推演结果将被丢弃。');
      clearTimeout(runtime.scheduledTimer);
      runtime.pendingMessageId = null;
      runtime.pendingForce = false;
      runtime.queuedProcess = null;
      runtime.activeMainGeneration = null;
      runtime.promptSnapshots.clear();
      runtime.dryRunCapture = null;
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
