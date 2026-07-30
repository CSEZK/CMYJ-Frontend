import compassSeal from './assets/compass-seal-v2.webp?url';
import ledgerStyles from './styles.raw?raw';
import faithfulStyles from './styles-faithful.raw?raw';
import integratedStyles from './styles-integrated.raw?raw';

(() => {
  'use strict';

  const VERSION = '1.9.0';
  const RUNTIME_KEY = '__CMYJWorldEngineV1';
  const CHAT_STATE_KEY = 'cmyj_world_engine_v1';
  const BACKUP_SCRIPT_ID = 'cmyj-world-engine-backup-v1';
  const BACKUP_STATE_KEY = 'cmyj_world_engine_backups_v1';
  const STORAGE_INTEGRITY_INTERVAL_MS = 2000;
  const INJECTION_ID = 'cmyj-world-engine-context-v1';
  const LAMP_ID = 'canming-world-engine-lamp';
  const FRAME_ID = 'canming-world-engine-frame';
  const BANNER_ID = 'canming-world-engine-banner';
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
    'knowledge.grant',
    'knowledge.suspect',
    'knowledge.mislead',
    'knowledge.correct',
    'secret.upsert',
    'secret.patch',
    'secret.reveal',
    'trace.discover',
  ]);
  const RETIRED_OPERATION_TYPES = new Set(['summary.replace', 'fact.add']);
  const INTEL_STATUSES = Object.freeze(['queued', 'in_transit', 'arrived', 'stalled', 'distorted']);
  const INTEL_VISIBILITIES = Object.freeze(['secret', 'restricted', 'local_public', 'public']);
  const INTEL_SOURCE_TYPES = Object.freeze([
    'current_turn_witness',
    'actor_knowledge',
    'received_intel',
    'event',
    'public_information',
  ]);
  const DISTANCE_BANDS = Object.freeze([
    'same_place',
    'same_city',
    'nearby_city',
    'same_province',
    'cross_province',
    'remote',
  ]);
  const DISTANCE_MIN_DAYS = Object.freeze({
    same_place: 0,
    same_city: 0,
    nearby_city: 1,
    same_province: 2,
    cross_province: 5,
    remote: 10,
  });
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
    settingsVersion: 4,
    enabled: true,
    autoRun: true,
    lookbackRounds: 3,
    settleDelayMs: 1200,
    requestTimeoutMs: 90000,
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
    secrets: 24,
    turnFacts: 48,
    knowledgeLedgerPerActor: 40,
    cameraHistory: 18,
    parallelTurns: 24,
    checkpoints: 8,
  });

  const MAIN_MODEL_CONTEXT_LIMITS = Object.freeze({
    latestItems: 8,
    persistentItems: 4,
    relevantKnowledgeActors: 6,
    knownFacts: 12,
    softKnowledgeFacts: 8,
    itemChars: 240,
    knowledgeFactChars: 160,
  });

  const WORLD_MODEL_BUDGET = Object.freeze({
    maxPromptChars: 24000,
    maxOutputTokens: 8000,
    payloadChars: 12000,
    snapshotChars: 9000,
    worldInfoChars: 7000,
    assistantOutputChars: 12000,
    userIntentChars: 3000,
    recentMessages: 3,
    recentMessageChars: 2400,
  });
  const FACT_ROUTER_BUDGET = Object.freeze({
    maxPromptChars: 18000,
    maxOutputTokens: 6000,
    assistantOutputChars: 14000,
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
    pendingTicket: null,
    ticketCounter: 0,
    bannerTimer: null,
    mvuReady: false,
    themeTimer: null,
    integrityTimer: null,
    storageRecoveryCount: 0,
    storageWarningLogged: false,
    isOpen: false,
    activeTab: 'overview',
    lamp: null,
    frame: null,
    frameDocument: null,
    drag: null,
    dragMoved: false,
    dragJustEnded: false,
    currentChatId: '',
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

  function uniqueTextList(value, limit = 24, maxChars = 240) {
    const seen = new Set();
    return asArray(value)
      .map(item => asText(item).slice(0, maxChars))
      .filter(item => {
        const key = item.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  function enumValue(value, allowed, fallback) {
    const normalized = asText(value).toLowerCase();
    return allowed.includes(normalized) ? normalized : fallback;
  }

  function optionalFiniteNumber(value) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeIntelStatus(value, fallback = 'in_transit') {
    const text = asText(value).toLowerCase();
    if (/抵达|已达|送达|arrived|delivered/.test(text)) return 'arrived';
    if (/排队|待发|queued/.test(text)) return 'queued';
    if (/停滞|中断|stalled/.test(text)) return 'stalled';
    if (/失真|讹传|歪曲|distorted/.test(text)) return 'distorted';
    if (/传播|在途|递送|路上|in[_ -]?transit|spreading|propagating/.test(text)) return 'in_transit';
    return enumValue(text, INTEL_STATUSES, fallback);
  }

  function normalizeIntelVisibility(value, fallback = 'restricted') {
    const text = asText(value).toLowerCase();
    if (/秘密|私密|未公开|不公开|private|secret/.test(text)) return 'secret';
    if (/限定|内部|少数|restricted/.test(text)) return 'restricted';
    if (/当地|本地|城内|local/.test(text)) return 'local_public';
    if (/公开|天下|广泛|public/.test(text)) return 'public';
    return enumValue(text, INTEL_VISIBILITIES, fallback);
  }

  function minimumTransitDays(distanceBand, channel) {
    const base = DISTANCE_MIN_DAYS[enumValue(distanceBand, DISTANCE_BANDS, 'same_city')] ?? 0;
    const text = asText(channel);
    const multiplier = /飞鸽|快马|塘报|军驿|急递/.test(text) ? 0.65 : /商旅|流言|传闻|口耳/.test(text) ? 1.6 : 1;
    return Math.ceil(base * multiplier);
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
      worldDays: Math.max(0, Number(world.世界运转天数) || 0),
    };
  }

  function comparableLocation(value) {
    return asText(value)
      .normalize('NFKC')
      .replace(/[\s·，。；、：:（）()[\]{}<>《》【】]+/gu, '')
      .toLowerCase();
  }

  function locationsOverlap(left, right) {
    const a = comparableLocation(left);
    const b = comparableLocation(right);
    return Boolean(a && b && (a.includes(b) || b.includes(a)));
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
    in_transit: '流转中',
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
      .replaceAll('intel.upsert', '消息登记')
      .replaceAll('hook.upsert', '伏线登记')
      .replaceAll('hook.resolve', '伏线结案')
      .replaceAll('knowledge.grant', '知识授予')
      .replaceAll('knowledge.suspect', '人物怀疑')
      .replaceAll('knowledge.mislead', '人物误信')
      .replaceAll('knowledge.correct', '认知纠正')
      .replaceAll('secret.upsert', '秘密登记')
      .replaceAll('secret.reveal', '秘密揭示')
      .replaceAll('trace.discover', '痕迹发现')
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
      settingsVersion: 4,
      enabled,
      connectionMode,
      lookbackRounds: Math.round(clamp(raw?.lookbackRounds ?? DEFAULT_SETTINGS.lookbackRounds, 1, 8)),
      settleDelayMs: Math.round(clamp(raw?.settleDelayMs ?? DEFAULT_SETTINGS.settleDelayMs, 400, 5000)),
      requestTimeoutMs: Math.round(clamp(raw?.requestTimeoutMs ?? DEFAULT_SETTINGS.requestTimeoutMs, 30000, 900000)),
      temperature: clamp(migratedTemperature ?? DEFAULT_SETTINGS.temperature, 0, 1.5),
      maxTokens: Math.round(clamp(migratedMaxTokens ?? DEFAULT_SETTINGS.maxTokens, 1800, 16000)),
    };
  }

  let settings = loadSettings();

  function saveSettings(next) {
    settings = {
      ...DEFAULT_SETTINGS,
      ...next,
      settingsVersion: 4,
      connectionMode: next.connectionMode === 'custom' ? 'custom' : 'tavern',
      lookbackRounds: Math.round(clamp(next.lookbackRounds, 1, 8)),
      settleDelayMs: Math.round(clamp(next.settleDelayMs, 400, 5000)),
      requestTimeoutMs: Math.round(clamp(next.requestTimeoutMs, 30000, 900000)),
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
      currentWorldDays: 0,
      _storageRevision: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastProcessed: null,
      isolationCursor: 0,
      activeEvents: [],
      actors: [],
      intelPackets: [],
      hooks: [],
      secrets: [],
      turnFacts: [],
      scenePresence: {
        location: '',
        actors: [],
        updatedAt: '',
      },
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
    state._storageRevision = Math.max(0, Math.floor(Number(state._storageRevision) || 0));
    state.currentWorldDays = Math.max(0, Number(state.currentWorldDays) || 0);
    state.isolationCursor = Math.max(0, Math.floor(Number(state.isolationCursor) || 0));
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
      .map(item => {
        const id = cleanId(item?.id, 'AC', item?.name);
        const knowledge = uniqueTextList(item?.knowledge, 30, 240);
        const legacyLedger = knowledge.map(content => ({
          state: 'known',
          content,
          sourceType: 'legacy',
          sourceId: '既有档案',
          confidence: 0.8,
        }));
        return {
          ...item,
          id,
          groups: uniqueTextList(item?.groups || item?.affiliations || item?.factions, 16, 100),
          knowledge,
          doesNotKnow: uniqueTextList(item?.doesNotKnow || item?.does_not_know, 20, 240),
          knowledgeLedger: normalizeKnowledgeLedger([...legacyLedger, ...asArray(item?.knowledgeLedger)], id),
        };
      })
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
      .map(item => ({
        ...item,
        id: cleanId(item?.id, 'IN', item?.content, item?.origin),
        status: normalizeIntelStatus(item?.status),
        visibility: normalizeIntelVisibility(item?.visibility || item?.publicity),
        knownBy: uniqueTextList(item?.knownBy || item?.known_by, 30, 100),
        targetGroups: uniqueTextList(item?.targetGroups || item?.target_groups, 16, 100),
        sourceFactIds: uniqueTextList(item?.sourceFactIds || item?.source_fact_ids, 20, 100),
        sourceType: enumValue(item?.sourceType || item?.source_type, INTEL_SOURCE_TYPES, ''),
        sourceId: asText(item?.sourceId || item?.source_id),
        sourceActor: asText(item?.sourceActor || item?.source_actor),
        distanceBand: enumValue(item?.distanceBand || item?.distance_band, DISTANCE_BANDS, 'same_city'),
        departedWorldDays: optionalFiniteNumber(item?.departedWorldDays ?? item?.departed_world_days),
        availableAfterWorldDays: optionalFiniteNumber(
          item?.availableAfterWorldDays ?? item?.available_after_world_days,
        ),
      }))
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
    state.secrets = asArray(state.secrets)
      .map(item => normalizeStoredSecret(item))
      .filter(Boolean)
      .slice(-LIMITS.secrets);
    state.turnFacts = asArray(state.turnFacts)
      .map(item => normalizeStoredTurnFact(item))
      .filter(Boolean)
      .slice(-LIMITS.turnFacts);
    state.scenePresence = normalizeScenePresence(state.scenePresence);
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
            basisIds: uniqueTextList(scene?.basisIds || scene?.basis_ids, 16, 100),
            knowledgeClaimIds: uniqueTextList(scene?.knowledgeClaimIds || scene?.knowledge_claim_ids, 16, 100),
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

  function isStoredState(raw, chatId = getCurrentChatId()) {
    return Boolean(
      raw &&
      typeof raw === 'object' &&
      Number(raw.version) === 1 &&
      (!raw.chatId || String(raw.chatId) === String(chatId)),
    );
  }

  function stateStorageRevision(state) {
    return Math.max(0, Math.floor(Number(state?._storageRevision) || 0));
  }

  function stateFreshness(state) {
    return [
      stateStorageRevision(state),
      Math.max(0, Math.floor(Number(state?.revision) || 0)),
      Math.max(0, Date.parse(asText(state?.updatedAt)) || 0),
    ];
  }

  function compareStateFreshness(left, right) {
    const leftFreshness = stateFreshness(left);
    const rightFreshness = stateFreshness(right);
    for (let index = 0; index < leftFreshness.length; index += 1) {
      if (leftFreshness[index] !== rightFreshness[index]) {
        return leftFreshness[index] > rightFreshness[index] ? 1 : -1;
      }
    }
    return 0;
  }

  function backupOption() {
    return { type: 'script', script_id: BACKUP_SCRIPT_ID };
  }

  function readBackupEntries() {
    const getter = api('getVariables');
    if (typeof getter !== 'function') return {};
    try {
      const variables = getter(backupOption()) || {};
      const entries = variables[BACKUP_STATE_KEY];
      return entries && typeof entries === 'object' ? clone(entries) : {};
    } catch (error) {
      if (!runtime.storageWarningLogged) {
        runtime.storageWarningLogged = true;
        console.warn('[天下演化] 独立状态备份暂不可用，将继续使用聊天变量主副本。', error);
      }
      return {};
    }
  }

  function readBackupEntry(chatId = getCurrentChatId()) {
    if (!chatId) return null;
    const entry = readBackupEntries()[chatId];
    return entry && typeof entry === 'object' ? entry : null;
  }

  function backupEntrySequence(entry) {
    return Math.max(0, Math.floor(Number(entry?.sequence) || 0), stateStorageRevision(entry?.state));
  }

  function writeBackupEntry(chatId, entry) {
    const writer = api('insertOrAssignVariables');
    if (typeof writer !== 'function' || !chatId) return false;
    try {
      const entries = readBackupEntries();
      entries[chatId] = clone(entry);
      writer({ [BACKUP_STATE_KEY]: entries }, backupOption());
      runtime.storageWarningLogged = false;
      return true;
    } catch (error) {
      if (!runtime.storageWarningLogged) {
        runtime.storageWarningLogged = true;
        console.warn('[天下演化] 写入独立状态备份失败，将保留聊天变量主副本。', error);
      }
      return false;
    }
  }

  function writeStateBackup(state) {
    const chatId = asText(state?.chatId) || getCurrentChatId();
    if (!chatId) return false;
    return writeBackupEntry(chatId, {
      version: 1,
      chatId,
      sequence: stateStorageRevision(state),
      deleted: false,
      updatedAt: asText(state?.updatedAt) || nowIso(),
      state: clone(state),
    });
  }

  function writeBackupTombstone(chatId, sequence) {
    return writeBackupEntry(chatId, {
      version: 1,
      chatId,
      sequence: Math.max(1, Math.floor(Number(sequence) || 0)),
      deleted: true,
      updatedAt: nowIso(),
    });
  }

  function writePrimaryState(state) {
    const writer = api('insertOrAssignVariables');
    if (typeof writer !== 'function') return false;
    writer({ [CHAT_STATE_KEY]: clone(state) }, { type: 'chat' });
    return true;
  }

  function removePrimaryState() {
    const deleter = api('deleteVariable');
    if (typeof deleter !== 'function') return false;
    deleter(CHAT_STATE_KEY, { type: 'chat' });
    return true;
  }

  function noteStorageRecovery(message, detail) {
    runtime.storageRecoveryCount += 1;
    runtime.lastNotice = message;
    console.warn(`[天下演化] ${message}`, detail);
  }

  function stampLegacyState(state, backupEntry) {
    if (stateStorageRevision(state) > 0) return state;
    return normalizeState(
      {
        ...state,
        _storageRevision: Math.max(1, backupEntrySequence(backupEntry) + 1),
        updatedAt: asText(state?.updatedAt) || nowIso(),
      },
      state.chatId,
    );
  }

  function getChatState() {
    const getter = api('getVariables');
    const chatId = getCurrentChatId();
    if (typeof getter !== 'function' || !chatId) return createEmptyState(chatId);

    const variables = getter({ type: 'chat' }) || {};
    const rawPrimary = variables[CHAT_STATE_KEY];
    let primary = isStoredState(rawPrimary, chatId) ? normalizeState(rawPrimary, chatId) : null;
    const backupEntry = readBackupEntry(chatId);
    const backupState = isStoredState(backupEntry?.state, chatId) ? normalizeState(backupEntry.state, chatId) : null;
    const backupSequence = backupEntrySequence(backupEntry);

    if (backupEntry?.deleted && backupSequence >= stateStorageRevision(primary)) {
      if (primary) {
        removePrimaryState();
        noteStorageRecovery('已拦截其他脚本恢复的清空前旧档案。', {
          chatId,
          staleStorageRevision: stateStorageRevision(primary),
          tombstoneSequence: backupSequence,
        });
      }
      return createEmptyState(chatId);
    }

    if (!primary && backupState) {
      const restored = stampLegacyState(backupState, backupEntry);
      writePrimaryState(restored);
      if (stateStorageRevision(restored) !== backupSequence) writeStateBackup(restored);
      noteStorageRecovery('检测到聊天变量被外部脚本覆盖，已从独立备份恢复天下档案。', {
        chatId,
        revision: restored.revision,
        storageRevision: restored._storageRevision,
      });
      return restored;
    }

    if (!primary) return createEmptyState(chatId);

    if (stateStorageRevision(primary) === 0 && backupState && backupSequence > 0) {
      const restored = normalizeState(backupState, chatId);
      writePrimaryState(restored);
      noteStorageRecovery('检测到天下档案被无版本旧快照覆盖，已恢复最新独立备份。', {
        chatId,
        primaryRevision: primary.revision,
        backupRevision: restored.revision,
        storageRevision: restored._storageRevision,
      });
      return restored;
    }

    primary = stampLegacyState(primary, backupEntry);
    if (!backupState || compareStateFreshness(primary, backupState) > 0) {
      writePrimaryState(primary);
      writeStateBackup(primary);
      return primary;
    }

    if (compareStateFreshness(backupState, primary) > 0) {
      const restored = stampLegacyState(backupState, backupEntry);
      writePrimaryState(restored);
      noteStorageRecovery('检测到天下档案被旧快照回滚，已恢复最新独立备份。', {
        chatId,
        primaryRevision: primary.revision,
        backupRevision: restored.revision,
        storageRevision: restored._storageRevision,
      });
      return restored;
    }

    return primary;
  }

  function saveChatState(state) {
    const writer = api('insertOrAssignVariables');
    if (typeof writer !== 'function') throw new Error('未找到聊天变量写入接口。');
    const chatId = getCurrentChatId();
    const getter = api('getVariables');
    const rawPrimary = typeof getter === 'function' ? getter({ type: 'chat' })?.[CHAT_STATE_KEY] : null;
    const backupEntry = readBackupEntry(chatId);
    const nextStorageRevision =
      Math.max(
        stateStorageRevision(state),
        isStoredState(rawPrimary, chatId) ? stateStorageRevision(rawPrimary) : 0,
        backupEntrySequence(backupEntry),
      ) + 1;
    const normalized = normalizeState(
      { ...state, chatId, _storageRevision: nextStorageRevision, updatedAt: nowIso() },
      chatId,
    );
    writeStateBackup(normalized);
    writer({ [CHAT_STATE_KEY]: normalized }, { type: 'chat' });
    return normalized;
  }

  function deleteChatState() {
    const chatId = getCurrentChatId();
    const getter = api('getVariables');
    const rawPrimary = typeof getter === 'function' ? getter({ type: 'chat' })?.[CHAT_STATE_KEY] : null;
    const backupEntry = readBackupEntry(chatId);
    const tombstoneSequence =
      Math.max(
        isStoredState(rawPrimary, chatId) ? stateStorageRevision(rawPrimary) : 0,
        backupEntrySequence(backupEntry),
      ) + 1;
    writeBackupTombstone(chatId, tombstoneSequence);
    removePrimaryState();
  }

  function reconcileStateStorage() {
    const recoveryCount = runtime.storageRecoveryCount;
    const state = getChatState();
    const recovered = runtime.storageRecoveryCount !== recoveryCount;
    if (recovered) {
      if (settings.enabled) refreshInjection(state);
      if (runtime.isOpen) renderPanel();
      updateLampState();
    }
    return { state, recovered };
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
      secrets: state.secrets,
      turnFacts: state.turnFacts,
      scenePresence: state.scenePresence,
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

  function presenceFlagIsTrue(value) {
    if (value === true || value === 1) return true;
    return /^(?:true|是|在场|当前在场|已在场|1)$/i.test(asText(value));
  }

  function collectStatActorNames(currentStat, presentOnly = false) {
    const names = new Set();
    const visited = new Set();
    const walk = (value, keyHint = '', depth = 0) => {
      if (!value || typeof value !== 'object' || visited.has(value) || depth > 10) return;
      visited.add(value);
      if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, '是否在场')) {
        const name = firstOperationText(value.姓名, value.名字, value.名称, value.name, keyHint);
        if (name && (!presentOnly || presenceFlagIsTrue(value.是否在场))) names.add(name);
      }
      if (Array.isArray(value)) {
        value.forEach(item => walk(item, keyHint, depth + 1));
        return;
      }
      Object.entries(value).forEach(([key, item]) => walk(item, key, depth + 1));
    };
    walk(currentStat);
    return [...names];
  }

  function collectPresentActorNames(currentStat) {
    return collectStatActorNames(currentStat, true);
  }

  function buildSceneEvidence(baseState, currentStat, currentText) {
    const location = asText(currentStat?.世界运转?.当前地点);
    const narrativeText = stripForContext(currentText);
    const statPresent = collectPresentActorNames(currentStat);
    const knownActorNames = uniqueTextList(
      [...collectStatActorNames(currentStat), ...asArray(baseState?.actors).map(actor => actorDisplayName(actor))],
      80,
      100,
    );
    const explicitlyObserved = knownActorNames.filter(name => narrativeText.includes(name));
    const previousPresence = normalizeScenePresence(baseState?.scenePresence);
    const carried =
      location &&
      previousPresence.location &&
      comparableIdentity(location) === comparableIdentity(previousPresence.location)
        ? previousPresence.actors.filter(name =>
            statPresent.some(candidate => comparableIdentity(candidate) === comparableIdentity(name)),
          )
        : [];
    const reliableWitnesses = uniqueTextList([...explicitlyObserved, ...carried], 24, 100);
    const excludedKnownActors = knownActorNames.filter(
      name => !reliableWitnesses.some(candidate => comparableIdentity(candidate) === comparableIdentity(name)),
    );
    return {
      currentLocation: location,
      knownActorNames,
      eligibleWitnesses: uniqueTextList([...statPresent, ...explicitlyObserved], 24, 100),
      explicitlyObserved,
      carriedPresence: carried,
      reliableWitnesses,
      excludedKnownActors,
      rule: 'witnesses 只能逐字复制 reliableWitnesses 中的姓名。explicitlyObserved 来自剔除状态栏后的正文；excludedKnownActors 是已知但本轮未被核实在场的人物。',
    };
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

  function promptExcerpt(value, maxChars) {
    const text = asText(value);
    const limit = Math.max(0, Number(maxChars) || 0);
    if (!limit) return '';
    if (text.length <= limit) return text;
    const marker = '\n…（已按天下演化请求预算省略中段）…\n';
    const available = Math.max(0, limit - marker.length);
    const headLength = Math.ceil(available * 0.62);
    return `${text.slice(0, headLength)}${marker}${text.slice(-(available - headLength))}`;
  }

  function compactPromptValue(value, depth = 0) {
    if (typeof value === 'string') return promptExcerpt(value, depth <= 1 ? 420 : 280);
    if (Array.isArray(value)) return value.slice(-8).map(item => compactPromptValue(item, depth + 1));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 18)
        .map(([key, item]) => [key, compactPromptValue(item, depth + 1)]),
    );
  }

  function projectPromptRecord(record, fields) {
    if (!record || typeof record !== 'object') return record;
    return Object.fromEntries(
      fields.filter(field => record[field] !== undefined).map(field => [field, compactPromptValue(record[field], 1)]),
    );
  }

  function projectPromptRecords(records, fields) {
    return asArray(records).map(record => projectPromptRecord(record, fields));
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
    const actorFields = [
      'id',
      'name',
      'location',
      'goal',
      'currentAction',
      'knowledge',
      'doesNotKnow',
      'knowledgeLedger',
      'nextDecision',
    ];
    const eventFields = ['id', 'title', 'location', 'actors', 'summary', 'nextTrigger'];
    const actors = projectPromptRecords(
      mergeRecords(
        selectRelevantRecords(state.actors, currentText, 2, actorFields),
        rotateRecords(state.actors, state.revision, 4),
        4,
      ),
      actorFields,
    );
    const activeEvents = projectPromptRecords(
      mergeRecords(
        selectRelevantRecords(state.activeEvents, currentText, 2, eventFields),
        rotateRecords(state.activeEvents, state.revision + 1, 3),
        3,
      ),
      eventFields,
    );
    return {
      policy:
        '这是视野外行动的轮换候选，不是强制更新清单。只选择具备时间、动机、资源和机会的 0—3 名人物推进；其余保持原行动。',
      actors,
      activeEvents,
    };
  }

  function generationPatchTargets(canonicalState) {
    const project = (records, labelFields, limit = 16) =>
      asArray(records)
        .map(record => ({
          id: asText(record?.id),
          label: firstOperationText(...labelFields.map(field => record?.[field])),
        }))
        .filter(record => record.id && record.label)
        .slice(0, limit);
    return {
      actors: project(canonicalState?.actors, ['name']),
      events: project(canonicalState?.activeEvents, ['title']),
      intel: project(canonicalState?.intelPackets, ['content'], 12),
      hooks: project(canonicalState?.hooks, ['title'], 12),
      secrets: project(canonicalState?.secrets, ['title', 'content'], 12),
    };
  }

  function actorGenerationPermission(state, actor) {
    const actorName = actorDisplayName(actor);
    const actorId = asText(actor?.id);
    const knowledge = normalizeKnowledgeLedger(actor?.knowledgeLedger, actorId)
      .filter(item => ['known', 'suspected', 'believed'].includes(asText(item?.state)))
      .slice(-12)
      .map(item => ({
        id: asText(item?.id),
        state: asText(item?.state),
        content: promptExcerpt(item?.content, 180),
      }))
      .filter(item => item.id && item.content);
    const observedFactIds = asArray(state?.turnFacts)
      .filter(fact => actorAuthorizedForTurnFact(actor, fact))
      .slice(-12)
      .map(fact => asText(fact?.id))
      .filter(Boolean);
    const arrivedIntelIds = asArray(state?.intelPackets)
      .filter(item => intelHasArrived(item, state?.currentWorldDays))
      .filter(
        item =>
          actorListed(operationTextArray(item?.known_by || item?.knownBy), actor) ||
          (actorName && asText(item?.destination).includes(actorName)),
      )
      .slice(-8)
      .map(item => asText(item?.id))
      .filter(Boolean);
    const activeEventIds = asArray(state?.activeEvents)
      .filter(item => actorListed(recordActors(item), actor))
      .slice(-8)
      .map(item => asText(item?.id))
      .filter(Boolean);
    return {
      actorId,
      actorName,
      patchId: actorId,
      independentAction: {
        cause_type: actorId ? 'autonomous' : 'elapsed_time',
        cause_id: actorId || 'ELAPSED_TIME',
      },
      observationCauseIds: observedFactIds,
      knowledgeCauseEntries: knowledge,
      receivedIntelCauseIds: arrivedIntelIds,
      eventCauseIds: activeEventIds,
      doesNotKnow: uniqueTextList(actor?.doesNotKnow || actor?.does_not_know, 12, 180),
    };
  }

  function buildGenerationLicense(baseState, canonicalState, sceneEvidence, autonomyFocus) {
    const actorCandidates = asArray(autonomyFocus?.actors)
      .map(candidate =>
        asArray(baseState?.actors).find(
          actor =>
            (candidate?.id && String(actor?.id) === String(candidate.id)) ||
            comparableIdentity(actorDisplayName(actor)) === comparableIdentity(actorDisplayName(candidate)),
        ),
      )
      .filter(Boolean)
      .map(actor => actorGenerationPermission(baseState, actor));
    const existingNames = asArray(baseState?.actors).map(actor => actorDisplayName(actor));
    const newNarrativeActors = asArray(sceneEvidence?.reliableWitnesses).filter(
      name => !existingNames.some(existing => comparableIdentity(existing) === comparableIdentity(name)),
    );
    return {
      mode: 'ALLOWLIST_FIRST',
      witnessPolicy: {
        allowedNames: asArray(sceneEvidence?.reliableWitnesses),
        forbiddenKnownNames: asArray(sceneEvidence?.excludedKnownActors),
        rule: 'turn_facts.witnesses 只能从 allowedNames 逐字选择；未列名人物一律不能作为本轮目击者。',
      },
      patchTargets: generationPatchTargets(canonicalState),
      newNarrativeActorCandidates: newNarrativeActors,
      safeAutonomyCandidates: actorCandidates,
      offscreenPolicy: {
        currentTurnFactRule:
          '旁线人物只有同时列入对应 turn_fact.witnesses，或在本次 operations 中通过合法传播获得该事实，才能把该 TF-* 写入 knowledge_claim_ids 并据此行动。',
        independentRule:
          '优先从 safeAutonomyCandidates 选择人物，并只使用该人物对应列表中的 cause_id。若候选为空，可从只读上下文选一名视野外人物新建 actor.upsert，但必须使用 elapsed_time/ELAPSED_TIME，knowledge_claim_ids 必须为空，行动不得回应或复述 CURRENT_TURN。',
        emptyRule: '没有合法的视野外推进时 parallel_scenes 返回空数组，禁止为了凑旁线借用玩家本轮信息。',
      },
      referenceRules: [
        'patch/resolve/remove 的 id 只能逐字复制 patchTargets 对应分类中的 id；目标不在列表时必须 upsert。',
        'observation 只能引用人物亲历的旧 observationCauseIds，或本次输出中该人物被列为 witnesses 的 TF-*。',
        'knowledge、received_intel、event 只能分别引用该人物列出的 knowledgeCauseEntries.id、receivedIntelCauseIds、eventCauseIds，不得混用类型。',
        '新增正文人物只能从 newNarrativeActorCandidates 选择并使用 actor.upsert；不要先 patch 一个不存在的人物。',
      ],
      silentPreflight: [
        '逐项确认每个 patch/resolve/remove ID 存在于 patchTargets。',
        '逐项确认 actor cause_type 与 cause_id 所属清单一致。',
        '逐场景确认人物对 knowledge_claim_ids 中每个事实都有合法知识来源。',
        '删除无法通过上述检查的操作或场景；不要把不确定项交给脚本事后修正。',
      ],
    };
  }

  function compactStateForPrompt(state, currentText, autonomyFocus) {
    const eventFields = [
      'id',
      'title',
      'stage',
      'status',
      'location',
      'actors',
      'summary',
      'nextTrigger',
      'impactDomains',
    ];
    const actorFields = [
      'id',
      'name',
      'location',
      'groups',
      'goal',
      'currentAction',
      'knowledge',
      'doesNotKnow',
      'nextDecision',
      'updatedReason',
      'causeType',
      'causeId',
      'basisIds',
    ];
    const intelFields = [
      'id',
      'content',
      'origin',
      'destination',
      'channel',
      'status',
      'eta',
      'reliability',
      'knownBy',
      'targetGroups',
      'visibility',
      'sourceType',
      'sourceId',
      'sourceActor',
      'sourceFactIds',
      'distanceBand',
      'departedWorldDays',
      'availableAfterWorldDays',
    ];
    const hookFields = ['id', 'title', 'stage', 'summary', 'visibleSigns', 'trigger', 'failCondition'];
    const secretFields = ['id', 'title', 'content', 'holders', 'revealConditions', 'status'];
    const turnFactFields = ['id', 'alias', 'content', 'physicalResult', 'traces', 'witnesses', 'discoveredBy'];
    return {
      revision: state.revision,
      activeEvents: projectPromptRecords(
        mergeRecords(
          selectRelevantRecords(state.activeEvents, currentText, 8, eventFields),
          autonomyFocus?.activeEvents,
          10,
        ),
        eventFields,
      ),
      actors: projectPromptRecords(
        mergeRecords(selectRelevantRecords(state.actors, currentText, 10, actorFields), autonomyFocus?.actors, 12),
        actorFields,
      ),
      intelPackets: projectPromptRecords(
        selectRelevantRecords(state.intelPackets, currentText, 10, intelFields),
        intelFields,
      ),
      hooks: projectPromptRecords(selectRelevantRecords(state.hooks, currentText, 8, hookFields), hookFields),
      secrets: projectPromptRecords(
        mergeRecords(
          selectRelevantRecords(state.secrets, currentText, 12, secretFields),
          asArray(state.secrets).filter(item => ['critical', 'high'].includes(asText(item?.level))),
          16,
        ),
        secretFields,
      ),
      turnFacts: projectPromptRecords(
        selectRelevantRecords(state.turnFacts, currentText, 16, turnFactFields),
        turnFactFields,
      ),
      scenePresence: normalizeScenePresence(state.scenePresence),
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

  function factRoutingSystemPrompt() {
    return `你是《残明余烬》的事实编译器。你不续写剧情、不推演任何人物，也不读取视野外世界；你要把已经完成的主模型正文一次编译成可直接入账的最终事实包，而不是输出一批等待再次审查的候选项。

一、证据
1. 每个事实、现场人物和通信都必须附带 assistantOutput 中逐字出现的 evidence。请直接复制最短且足以支撑该项的连续原句，不要概括、改写或解释证据；一条事实确需上下文时可以复制相邻的两句。
2. 玩家意图、计划、推测、条件句、未判定行动和气氛描写不是已经发生的事实。
3. 不得补充正文没有写明的行为人、动机、目击者、接收者或传播结果。
4. 正文中已经完成的私密发现、阅读、藏匿和物理变化同样是有效事实；不要因为无人目击而漏掉，只需标记 private、清空 witnesses。

二、可见性
1. private：没有任何人物在正文中完成感知，witnesses 必须为空。
2. witnessed：只有 witness_evidence 中逐项给出感知证据的人物可以进入 witnesses。
3. addressed：只有正文明确告知、交谈或展示给的对象可以进入 witnesses。
4. local_public：正文已经明确形成当地公开告示、公开宣读或广泛议论；它不代表外地人物知道。
5. 人物仅仅被提到、出现在世界设定中、正在别处行动，均不算目击。无法确定时一律 private。

三、痕迹与通信
1. traces 只写正文已经产生或由物理结果直接留下的可发现痕迹，不得把隐藏行为人的身份和动机写进痕迹。
2. communications 只登记正文中已经实际完成的信息传递；尚未发送的打算、没有明确接收者的自言自语、只与事实背景相关但没有传达该事实的台词都不要登记。
3. 当面说话的 evidence 要连同“谁在说”一起复制；信件、口信、告示或报告的 evidence 要包含发送动作。玩家当前视角主体发送时，sender 固定写 CURRENT_VIEWPOINT。
4. fact_refs 只引用这次言语或发送行为真正传达的 facts.local_id，不能因为台词提到相近话题就挂接事实。远距离通信只登记出发，不判断已经抵达。

四、输出
1. 合并同一动作或同一通信链上的重复描述；通常只需 1—6 条 facts，每项 traces 与 discovery_conditions 各不超过 3 条。
2. facts 是本轮正文的最终客观事实账；先完整保留确已发生的事实，再严格限制谁知道。不要用“省略事实”代替“限制知情者”。
3. 只返回符合 Schema 的 JSON。没有可登记内容时数组留空。无法确认知情关系时保留事实并标记 private，不得猜测知情者。`;
  }

  function factRoutingOutputSchema() {
    const text = { type: 'string', minLength: 1, maxLength: 800 };
    const shortTextSchema = { type: 'string', maxLength: 200 };
    const textArray = { type: 'array', maxItems: 16, items: shortTextSchema };
    const witnessEvidence = {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'evidence'],
      properties: {
        name: shortTextSchema,
        evidence: text,
      },
    };
    return {
      name: 'cmyj_fact_routing_v1',
      strict: false,
      value: {
        type: 'object',
        additionalProperties: false,
        required: ['schema_version', 'facts', 'scene_entities', 'communications'],
        properties: {
          schema_version: { type: 'integer', enum: [1] },
          facts: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'local_id',
                'content',
                'evidence',
                'physical_result',
                'location',
                'visibility',
                'witnesses',
                'witness_evidence',
                'target_groups',
                'traces',
                'discovery_conditions',
              ],
              properties: {
                local_id: shortTextSchema,
                content: text,
                evidence: text,
                physical_result: text,
                location: shortTextSchema,
                visibility: {
                  type: 'string',
                  enum: ['private', 'witnessed', 'addressed', 'local_public'],
                },
                witnesses: textArray,
                witness_evidence: {
                  type: 'array',
                  maxItems: 16,
                  items: witnessEvidence,
                },
                target_groups: textArray,
                traces: textArray,
                discovery_conditions: textArray,
              },
            },
          },
          scene_entities: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'location', 'public_role', 'apparent_goal', 'current_action', 'evidence'],
              properties: {
                name: shortTextSchema,
                location: shortTextSchema,
                public_role: shortTextSchema,
                apparent_goal: shortTextSchema,
                current_action: shortTextSchema,
                evidence: text,
              },
            },
          },
          communications: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'fact_refs',
                'evidence',
                'sender',
                'recipients',
                'origin',
                'destination',
                'channel',
                'target_groups',
                'distance_band',
                'visibility',
              ],
              properties: {
                fact_refs: textArray,
                evidence: text,
                sender: shortTextSchema,
                recipients: textArray,
                origin: shortTextSchema,
                destination: shortTextSchema,
                channel: shortTextSchema,
                target_groups: textArray,
                distance_band: {
                  type: 'string',
                  enum: ['same_place', 'same_city', 'nearby_city', 'same_province', 'cross_province', 'remote'],
                },
                visibility: {
                  type: 'string',
                  enum: ['secret', 'restricted', 'local_public', 'public'],
                },
              },
            },
          },
        },
      },
    };
  }

  function buildFactRoutingPayload(baseState, messageKey, currentStat = {}) {
    const currentText = api('getChatMessages')?.(messageKey.messageId)?.[0]?.message || '';
    const clock = clockFromStatData(currentStat);
    const presentActors = collectPresentActorNames(currentStat);
    const previousPresence = normalizeScenePresence(baseState?.scenePresence);
    const carriedActors =
      clock.location && previousPresence.location && locationsOverlap(clock.location, previousPresence.location)
        ? previousPresence.actors.filter(name =>
            presentActors.some(candidate => comparableIdentity(candidate) === comparableIdentity(name)),
          )
        : [];
    return {
      task: '只编译本轮正文中的已发生事实、现场人物和已发出的通信；不要生成视野外反应。',
      messageId: messageKey.messageId,
      swipeId: messageKey.swipeId,
      clock,
      presentActors: uniqueTextList([...presentActors, ...carriedActors], 24, 100),
      assistantOutput: promptExcerpt(stripForContext(currentText), FACT_ROUTER_BUDGET.assistantOutputChars),
    };
  }

  function normalizeFactRoutingResult(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('事实分流器没有返回结构化对象。');
    }
    if (Number(result.schema_version ?? result.schemaVersion) !== 1) {
      throw new Error('事实分流器返回了不支持的 schema_version。');
    }
    return {
      schema_version: 1,
      facts: asArray(result.facts).slice(0, 8),
      scene_entities: asArray(result.scene_entities || result.sceneEntities).slice(0, 10),
      communications: asArray(result.communications).slice(0, 8),
    };
  }

  function worldChangeSystemPrompt() {
    return `你是《残明余烬》的视野外世界模拟器，不是正文审查员、事实摘录器或世界总结器。

一、输入边界
1. CURRENT_TURN 是主模型已经提交的本轮结果。直接判断它对视野外世界造成的后续影响，不要重新审核、认证或摘录玩家场景事实。
2. 玩家输入只用于理解行动意图；主模型正文、最终 MVU 和 CURRENT_STATE 共同构成当前可用状态。
3. RECENT_CONTEXT 只帮助理解因果，不得把旧内容再次写成新变化。

二、推进规则
1. 从 CURRENT_STATE 中选择至多两个确有行动机会的事件、人物、情报或伏线；允许本轮没有任何变化。
2. 只提交相对于当前记录发生变化的字段。禁止复述完整记录，禁止为了显得世界在运转而提交无效变化。
3. create 用于新增记录，merge 用于修改已有记录，delete 用于结束或移除记录。merge 和 delete 必须复用 CURRENT_STATE 中已有的稳定 ID。
4. 人物获得新知识必须存在可核对来源；世界书、CURRENT_STATE 和 CURRENT_TURN 中出现的真相都不自动等于人物知道。
5. collection 对应关系：events → activeEvents，actors → actors，intel → intelPackets，hooks → hooks。
6. create 必须给出能构成完整记录的核心字段；merge 只提交确实改变的字段，并沿用 CURRENT_STATE 的字段命名。
7. create 核心字段：events 需要 title、stage、location、summary、nextTrigger；actors 需要 name、currentAction、updatedReason；intel 需要 content、origin、destination、channel、status、eta、reliability；hooks 需要 title、stage、summary、trigger、failCondition。

三、知识与传播边界
1. 先读取 knowledgeBoundary。verifiedCurrentTurnWitnesses 是本轮正文事实的唯一现场知情白名单；forbiddenCurrentTurnKnowers 中的人物即使出现在世界书或旧档案中也不得立刻反应。
2. 每个 actor create/merge 都应提交 causeType、causeId、basisIds。因本轮亲眼观察而行动时使用 observation/CURRENT_TURN，且人物必须在 verifiedCurrentTurnWitnesses；依赖旧情报时使用 received_intel/情报稳定 ID；参与旧事件时使用 event/事件稳定 ID；无关自主行动使用 autonomous/人物稳定 ID，新建独立人物使用 elapsed_time/ELAPSED_TIME。
3. actor 的 knowledge 发生增加时，只能以 observation、received_intel 或 event 为依据；不得用 autonomous、直觉、巧合或世界书真相增加知识。
4. 新建 intel 必须额外提交：visibility（secret、restricted、local_public、public）、targetGroups、distanceBand（same_place、same_city、nearby_city、same_province、cross_province、remote）、sourceType、sourceId、sourceActor、sourceFactIds。status 必须是 in_transit，不能同轮 arrived。
5. sourceType=current_turn_witness 时，sourceId 必须为 CURRENT_TURN，sourceActor 必须逐字来自 verifiedCurrentTurnWitnesses；actor_knowledge 必须引用确实已知该内容的人物；received_intel 与 event 必须引用已有稳定 ID。
6. local_public 只表示起点当地公开，不会自动跨城、跨省或传给所有群体。人物只有在情报达到 availableAfterWorldDays、地点匹配且属于 targetGroups 后才能据此行动。
7. events 或 hooks 若直接承接 CURRENT_TURN，必须在 sourceFactIds 中写 CURRENT_TURN；事件 actors 只能包含本轮白名单中的现场知情者。秘密行动留下的客观痕迹可以登记，但不能借此让未发现痕迹的人物立刻知情。

四、旁线场景
1. scenes 最多两个，每段必须通过 based_on 引用本轮 changes 的数组下标。
2. 场景只呈现被引用变化的过程或直接结果；没有状态变化支撑时不要生成场景。
3. 场景必须位于玩家当前视野之外，不得重演玩家场景，不得凭空制造重大胜负、死亡、陷城或政局结果。
4. body 不使用 <平行世界> 标签，不写“与此同时”“玩家不知道的是”“镜头转向”等元叙事。
5. 若场景内容与 CURRENT_TURN 相关，出场人物必须是 verifiedCurrentTurnWitnesses，或已经通过本轮抵达且地点、群体匹配的情报获得消息。新建的在途情报只能展示发送与传递，不能展示终点人物已经收到或作出反应。

五、输出
只返回符合 JSON Schema 的一个 JSON 对象。changes 和 scenes 都可以为空；base_revision 必须原样回传。`;
  }

  function worldChangeOutputSchema() {
    const text = { type: 'string', minLength: 1 };
    const target = {
      type: 'object',
      additionalProperties: false,
      required: ['collection', 'id'],
      properties: {
        collection: { type: 'string', enum: ['events', 'actors', 'intel', 'hooks'] },
        id: text,
      },
    };
    const objectValue = { type: 'object', additionalProperties: true };
    const changeOperation = (op, payloadKey) => ({
      type: 'object',
      additionalProperties: false,
      required: ['op', 'target', payloadKey],
      properties: {
        op: { type: 'string', enum: [op] },
        target,
        [payloadKey]: objectValue,
      },
    });
    return {
      name: 'cmyj_world_changes_v3',
      strict: false,
      value: {
        type: 'object',
        additionalProperties: false,
        required: ['schema_version', 'base_revision', 'changes', 'scenes'],
        properties: {
          schema_version: { type: 'integer', enum: [3] },
          base_revision: { type: 'integer', minimum: 0 },
          changes: {
            type: 'array',
            maxItems: 24,
            items: {
              anyOf: [
                changeOperation('create', 'value'),
                changeOperation('merge', 'changes'),
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['op', 'target'],
                  properties: {
                    op: { type: 'string', enum: ['delete'] },
                    target,
                  },
                },
              ],
            },
          },
          scenes: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['based_on', 'location', 'time', 'actors', 'action', 'body'],
              properties: {
                based_on: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 8,
                  items: { type: 'integer', minimum: 0 },
                },
                location: { type: 'string' },
                time: { type: 'string' },
                actors: { type: 'array', maxItems: 12, items: { type: 'string' } },
                action: { type: 'string' },
                body: text,
              },
            },
          },
        },
      },
    };
  }

  function normalizeWorldChangeResult(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('副模型输出缺少可用的结构化对象。');
    }
    const schemaVersion = Number(result.schema_version ?? result.schemaVersion);
    if (schemaVersion !== 3) {
      throw new Error(`副模型输出的 schema_version=${schemaVersion || '缺失'}，当前仅接受版本 3。`);
    }
    if (!Array.isArray(result.changes) || !Array.isArray(result.scenes)) {
      throw new Error('副模型输出必须包含 changes 与 scenes 数组。');
    }
    const baseRevision = Number(result.base_revision ?? result.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision < 0) {
      throw new Error('副模型输出缺少有效的 base_revision。');
    }
    return {
      schema_version: 3,
      base_revision: baseRevision,
      changes: result.changes.slice(0, 24),
      scenes: result.scenes.slice(0, 2),
    };
  }

  function incrementalSystemPrompt() {
    return `你是《残明余烬》的天下演化史官。主模型已经完成玩家视角正文；你只提交本轮世界档案的必要变化，并写出最多两个玩家视野外场景。

零、生成许可优先
1. 先读取 GENERATION_LICENSE。它不是参考资料，而是本轮可写边界；不要先自由生成再期待脚本修正。
2. witnesses、已有记录 ID、人物行动 cause_id 和旁线知识来源必须从对应许可清单逐字选择。列表中不存在的旧目标不得 patch/resolve/remove。
3. safeAutonomyCandidates 已按人物分别列出合法的旧观察、知识、已抵达情报和参与事件 ID；cause_type 必须与所选清单一致，不能拿 TF-* 冒充 event 或 received_intel。
4. 输出前在内部逐项执行 silentPreflight。无法证明合法的操作或旁线直接不输出；不要输出检查过程，也不要为了凑数量制造变化。

一、证据边界
1. CURRENT_TURN.assistantOutput 和最终 MVU 变化是本轮新增事实的主要证据。玩家输入只代表意图。
2. 主模型当轮提示词快照与 CANONICAL_STATE 仅用于理解和延续，不得把旧资料重复当成新事实。
3. 只有明确发生的结果才能推动事件、人物、情报或延迟后果；计划、命令、传闻、失败尝试和氛围不得伪装成已经发生的结果。
4. 先把正文中会影响后续因果的结果写入 turn_facts。evidence 必须逐字摘录 assistantOutput 中能证明结果的短句；不得用玩家输入、世界书或推断代替证据。
5. visibility 只能是 private、addressed、scene_visible、local_public。private 表示无人目击，witnesses 必须为空；其他可见级别的 witnesses 只能逐字复制 GENERATION_LICENSE.witnessPolicy.allowedNames。forbiddenKnownNames 即使出现在世界书或状态栏中也不得作为目击者。local_public 仅表示当前地点内已核实的人可见，绝不等于全城或远方人物立刻知道。
6. 无人目击不等于没有发生：仍登记 physical_result、traces 与 discovery_conditions，但任何 NPC 都不得直接获得事实内容。后来只能通过 trace.discover 发现实际痕迹，并且只能得出痕迹本身支持的结论。
7. 平行场景只能展示本轮操作已经支持的变化，不能先写重大结果再用场景认证它。

二、增量原则
1. 只返回发生变化的内容，不重写完整档案。
2. patch/resolve/remove 必须逐字复用 GENERATION_LICENSE.patchTargets 中对应类别的稳定 ID；upsert 可以不提供 ID，由脚本根据实体内容生成。
   若目标尚未出现在对应档案数组中，必须使用 upsert，绝不能根据姓名自造 actor_xxx、event_xxx 一类 ID。patch 的 set 还要附带身份字段：人物 name、事件/伏线 title、情报 content，供脚本核对目标。
3. 不要总结正文、复述世界现状、记录玩家履历或重写 MVU/状态栏字段；这些由聊天记忆、变量结构与状态栏负责。
4. 事件只记录仍在自行推进、会对未来形成压力的进程，不把玩家当前任务或地图静态态势换一种说法抄入档案。
5. 人物行动仍用 actor 操作；已有角色的 knowledge 与 does_not_know 不得通过 actor.patch 偷渡改写。新增或纠正认知必须使用 knowledge.*，重要秘密必须使用 secret.*。
6. knowledge.grant/suspect/mislead/correct 必须写明人物、内容、source_type、source_id 与 confidence。引用本轮正文时 source_id 必须使用对应 turn_facts 的 TF-* 本地别名，禁止使用 CURRENT_TURN。引用本次返回的第 N 段旁线可用 PARALLEL_SCENE_N。told_by_actor 还必须填写 source_actor_id/source_actor_name，且告知者本身必须合法知情。
7. 每个 actor.upsert/patch 都要给 cause_type、cause_id 与 basis_ids。cause_type 只能是 autonomous、observation、knowledge、received_intel、event、elapsed_time，并且 cause_id 必须来自该人物在 safeAutonomyCandidates 中同名的许可清单。唯一例外是：人物被本次 turn_fact 列为 witnesses 时，可用 observation 引用该 TF-*；从只读上下文新建的独立人物只能用 elapsed_time 与 ELAPSED_TIME。不能用“听说”“感觉”绕过。
8. secret.upsert 用于登记容易被模型越权使用的重要秘密，必须提供知情者、解锁条件和证据来源；引用本轮正文也必须使用 TF-*。secret.reveal 只向通过来源校验的人物揭示秘密。
9. 情报必须有起点、终点、渠道、状态和抵达时间；人物不能无渠道获得消息。引用 local_public 事实时，起点可以是现场合法目击者，也可以是“某地邻里传闻、坊间议论、官府告示”等明确的当地公共渠道；其他可见级别仍必须从合法知情者出发。
10. 伏线只记录有明确触发条件或失效条件的延迟后果，不记录一般剧情摘要。

三、视野外人物自主行动
1. GENERATION_LICENSE.safeAutonomyCandidates 是已经整理好因果许可的轮换候选；AUTONOMY_FOCUS 只提供其详细状态。每轮只推进具备足够虚构时间、行动机会、动机和资源的 0—3 名人物；没有合理推进条件时保持原行动，不得为了凑 operations 强行变化。
2. 人物依据自己的目标、当前位置、既有行动、已知信息和资源约束做事，不等待玩家触发，也不要求所有人围绕玩家当轮行为作出反应。
3. 严守知识边界：世界书和模型上下文中的真相不等于人物知道。人物只能利用明确的 knowledge、knowledgeLedger 中的 known、亲历事实和已经抵达的情报；suspected 只能怀疑，believed 可能是误信，does_not_know 与未获授权的 secret 绝不能用于决策。
4. 先判断本轮流逝的时间与行动尺度。短暂对话不能让远方人物瞬间跨城或完成长期计划；可以只记录“继续执行”而不产生 patch。
5. 额外激活的世界书只提供身份、地点、制度、关系和行动约束，不等于本轮新事实，也不得替人物补出无来源的知识。

四、旁线场景
1. parallel_scenes 最多两个，每个包含 location、time、actors、action、body、basis_ids、knowledge_claim_ids。优先展示本次合法 actor 操作的结果；basis_ids 写支撑场景且已存在于许可清单或本次合法操作中的事件、人物行动或情报 ID，knowledge_claim_ids 只写场景中实际被人物合法使用的 TF-*。
2. 场景必须在玩家当前视野之外，优先表现合法操作推进的事件、人物行动或情报传播。
3. 不得重演玩家场景，不得凭空制造胜负、死亡、陷城或政局结果。
4. 若场景内容与某个 turn_fact 有关，必须把它列入 knowledge_claim_ids，并在输出前确认每个场景人物是该事实的 witnesses，或已经在本次 operations 中通过合法传播获得该知识。否则把场景改写为与 CURRENT_TURN 无关的自主行动；private 事实不能被旁线人物直接反应。
5. 若 safeAutonomyCandidates 为空，可以从只读上下文选择一名远方人物做独立推进，但必须同时提交 actor.upsert，使用 elapsed_time/ELAPSED_TIME，knowledge_claim_ids 为空，且行动内容不得复述或回应 CURRENT_TURN。做不到就返回空数组。
6. body 不使用 <平行世界> 标签，不写“与此同时”“玩家不知道的是”“镜头转向”等元叙事。

五、输出
1. 只返回符合 JSON Schema 的一个 JSON 对象。operations 可以为空；没有变化的字段不得凑数。base_revision 必须原样回传。
2. operations 中每一项都必须带 type 字段。type 只能是：event.upsert、event.patch、event.resolve、actor.upsert、actor.patch、intel.upsert、intel.patch、intel.remove、hook.upsert、hook.patch、hook.resolve、knowledge.grant、knowledge.suspect、knowledge.mislead、knowledge.correct、secret.upsert、secret.patch、secret.reveal、trace.discover。不得使用 op、operation、action 或自造名称代替 type。
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
      cause_type: {
        type: 'string',
        enum: ['autonomous', 'observation', 'knowledge', 'received_intel', 'event', 'elapsed_time'],
        description: '必须与 GENERATION_LICENSE.safeAutonomyCandidates 中 cause_id 所属清单一致。',
      },
      cause_id: {
        ...text,
        description: '从人物许可清单逐字复制；本次合法目击用 TF-*，独立新人物用 ELAPSED_TIME。',
      },
      basis_ids: {
        ...textArray,
        description: '只填写实际支撑行动且已存在于 GENERATION_LICENSE 或本次合法输出中的 ID。',
      },
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
      source_fact_ids: textArray,
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
    const knowledgeFields = {
      actor_id: text,
      actor_name: text,
      content: text,
      replaces: text,
      source_type: {
        type: 'string',
        enum: [
          'direct_observation',
          'witnessed_event',
          'received_intel',
          'told_by_actor',
          'public_information',
          'correction',
        ],
      },
      source_id: text,
      source_actor_id: text,
      source_actor_name: text,
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    };
    const secretFields = {
      title: text,
      content: text,
      level: { type: 'string', enum: ['critical', 'high', 'normal'] },
      holders: textArray,
      reveal_conditions: textArray,
      status: { type: 'string', enum: ['hidden', 'compromised', 'public', 'expired'] },
      source_type: {
        type: 'string',
        enum: ['direct_observation', 'witnessed_event', 'received_intel', 'public_information', 'correction'],
      },
      source_id: text,
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
    const knowledgeOperation = type => ({
      type: 'object',
      additionalProperties: false,
      required: ['type', 'value'],
      properties: {
        type: { type: 'string', enum: [type] },
        value: {
          type: 'object',
          additionalProperties: false,
          required: ['actor_name', 'content', 'source_type', 'source_id', 'confidence'],
          properties: knowledgeFields,
        },
      },
    });
    const secretRevealOperation = {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id', 'value'],
      properties: {
        type: { type: 'string', enum: ['secret.reveal'] },
        id: text,
        value: {
          type: 'object',
          additionalProperties: false,
          required: ['actor_name', 'source_type', 'source_id'],
          properties: knowledgeFields,
        },
      },
    };
    const traceDiscoverOperation = {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id', 'value'],
      properties: {
        type: { type: 'string', enum: ['trace.discover'] },
        id: text,
        value: {
          type: 'object',
          additionalProperties: false,
          required: ['actor_name', 'trace', 'conclusion', 'source_type', 'source_id', 'confidence'],
          properties: {
            actor_id: text,
            actor_name: text,
            trace: text,
            conclusion: text,
            source_type: { type: 'string', enum: ['direct_observation', 'witnessed_event'] },
            source_id: text,
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    };
    const turnFact = {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'content',
        'visibility',
        'witnesses',
        'evidence',
        'location',
        'physical_result',
        'traces',
        'discovery_conditions',
      ],
      properties: {
        id: text,
        content: text,
        visibility: { type: 'string', enum: ['private', 'addressed', 'scene_visible', 'local_public'] },
        witnesses: {
          ...textArray,
          description: '只能逐字复制 GENERATION_LICENSE.witnessPolicy.allowedNames 中的姓名。',
        },
        evidence: text,
        location: text,
        physical_result: text,
        traces: textArray,
        discovery_conditions: textArray,
      },
    };
    return {
      name: 'cmyj_world_engine_increment_v2',
      strict: false,
      value: {
        type: 'object',
        additionalProperties: false,
        required: ['schema_version', 'base_revision', 'turn_facts', 'operations', 'parallel_scenes'],
        properties: {
          schema_version: { type: 'integer', enum: [2] },
          base_revision: { type: 'integer', minimum: 0 },
          turn_facts: {
            type: 'array',
            maxItems: 12,
            items: turnFact,
          },
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
                  'cause_type',
                  'cause_id',
                  'basis_ids',
                ]),
                recordOperation('actor.patch', actorFields, 'patch', ['name', 'cause_type', 'cause_id', 'basis_ids']),
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
                knowledgeOperation('knowledge.grant'),
                knowledgeOperation('knowledge.suspect'),
                knowledgeOperation('knowledge.mislead'),
                knowledgeOperation('knowledge.correct'),
                recordOperation('secret.upsert', secretFields, 'upsert', [
                  'content',
                  'level',
                  'holders',
                  'reveal_conditions',
                  'status',
                  'source_type',
                  'source_id',
                ]),
                recordOperation('secret.patch', secretFields, 'patch'),
                secretRevealOperation,
                traceDiscoverOperation,
              ],
            },
          },
          parallel_scenes: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['location', 'time', 'actors', 'action', 'body', 'basis_ids', 'knowledge_claim_ids'],
              properties: {
                location: text,
                time: text,
                actors: textArray,
                action: text,
                body: prose,
                basis_ids: {
                  ...textArray,
                  description: '只填写已存在且确实支撑本场景的事件、人物或情报 ID。',
                },
                knowledge_claim_ids: {
                  ...textArray,
                  description: '只填写所有场景人物均获准知道的 TF-*；纯自主场景必须为空数组。',
                },
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
    const canonicalState = compactStateForPrompt(baseState, currentText, autonomyFocus);
    const sceneEvidence = buildSceneEvidence(baseState, currentStat, currentText);
    const clock = clockFromStatData(currentStat);
    delete canonicalState.secrets;
    delete canonicalState.turnFacts;
    delete canonicalState.scenePresence;
    return {
      instruction:
        'CURRENT_TURN 已经提交，不要审核、认证或摘录事实。只推进少数确有变化的视野外对象，并对 CURRENT_STATE 返回 create、merge 或 delete。',
      baseRevision: Number(baseState.revision) || 0,
      currentTurn: {
        messageId: messageKey.messageId,
        swipeId: messageKey.swipeId,
        userInputAsIntentOnly: findPreviousUserInput(messageKey.messageId),
        assistantOutput: stripForContext(currentText).slice(0, 30000),
        mvuChanges: deepDiff(previousStat, currentStat).slice(0, 100),
      },
      recentContextReadOnly: buildRecentContext(messageKey.messageId),
      canonicalState,
      knowledgeBoundary: {
        currentLocation: sceneEvidence.currentLocation,
        currentWorldDays:
          optionalFiniteNumber(currentStat?.世界运转?.世界运转天数) ??
          Math.max(0, Number(baseState?.currentWorldDays) || clock.worldDays),
        verifiedCurrentTurnWitnesses: sceneEvidence.reliableWitnesses,
        forbiddenCurrentTurnKnowers: sceneEvidence.excludedKnownActors,
        rules: [
          'CURRENT_TURN 中出现的客观真相不自动等于任何人物知道。',
          '人物因本轮正文行动时，causeType 必须为 observation，causeId 必须为 CURRENT_TURN，且人物必须在 verifiedCurrentTurnWitnesses。',
          '远方人物只能依赖自己的旧档案、已抵达且属于其地点与群体的情报，或完全无关的自主行动。',
          '新建情报只能处于 in_transit，必须声明 targetGroups、distanceBand、sourceType、sourceId；不得同轮抵达。',
          'local_public 只在起点当地公开；跨地点仍必须经过情报传播和抵达时间。',
        ],
      },
    };
  }

  function compactWorldModelPayload(payload, promptSnapshot) {
    const compacted = clone(payload);
    compacted.currentTurn ??= {};
    compacted.currentTurn.userInputAsIntentOnly = promptExcerpt(
      compacted.currentTurn.userInputAsIntentOnly,
      WORLD_MODEL_BUDGET.userIntentChars,
    );
    compacted.currentTurn.assistantOutput = promptExcerpt(
      compacted.currentTurn.assistantOutput,
      WORLD_MODEL_BUDGET.assistantOutputChars,
    );
    compacted.currentTurn.mvuChanges = compactPromptValue(compacted.currentTurn.mvuChanges, 1);
    compacted.canonicalState = compactPromptValue(compacted.canonicalState, 1);
    if (promptSnapshot) {
      delete compacted.recentContextReadOnly;
    } else {
      compacted.recentContextReadOnly = asArray(compacted.recentContextReadOnly)
        .slice(-WORLD_MODEL_BUDGET.recentMessages)
        .map(message => ({
          messageId: message?.messageId,
          role: message?.role,
          content: promptExcerpt(message?.content, WORLD_MODEL_BUDGET.recentMessageChars),
        }));
    }

    if (JSON.stringify(compacted).length > WORLD_MODEL_BUDGET.payloadChars) {
      compacted.currentTurn.assistantOutput = promptExcerpt(compacted.currentTurn.assistantOutput, 6500);
      compacted.currentTurn.userInputAsIntentOnly = promptExcerpt(compacted.currentTurn.userInputAsIntentOnly, 1800);
      compacted.recentContextReadOnly = asArray(compacted.recentContextReadOnly)
        .slice(-2)
        .map(message => ({ ...message, content: promptExcerpt(message?.content, 1600) }));
      for (const key of ['activeEvents', 'actors', 'intelPackets', 'hooks', 'secrets', 'turnFacts']) {
        if (Array.isArray(compacted.canonicalState?.[key])) {
          compacted.canonicalState[key] = compacted.canonicalState[key].slice(0, 6);
        }
      }
    }

    if (JSON.stringify(compacted).length > WORLD_MODEL_BUDGET.payloadChars) {
      compacted.currentTurn.assistantOutput = promptExcerpt(compacted.currentTurn.assistantOutput, 4500);
      for (const key of ['activeEvents', 'actors', 'intelPackets', 'hooks', 'secrets', 'turnFacts']) {
        if (Array.isArray(compacted.canonicalState?.[key])) {
          compacted.canonicalState[key] = compacted.canonicalState[key].slice(0, 3);
        }
      }
    }
    return compacted;
  }

  function customApiConfig(maxTokens = settings.maxTokens) {
    if (settings.connectionMode !== 'custom') {
      return {
        temperature: settings.temperature,
        max_tokens: maxTokens,
      };
    }
    if (!settings.apiUrl) throw new Error('独立 API 模式尚未填写 API 地址。');
    return {
      apiurl: settings.apiUrl.replace(/\/+$/, ''),
      key: settings.apiKey,
      ...(settings.model ? { model: settings.model } : {}),
      source: settings.apiSource || 'openai',
      temperature: settings.temperature,
      max_tokens: maxTokens,
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

    // 部分兼容 OpenAI 的服务会偏离提示词中的 Schema，但仍返回语义完整的常见 camelCase 结构。
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
          ? {
              location: '',
              time: '',
              actors: [],
              action: '',
              body: cleanBody(scene),
              basis_ids: [],
              knowledge_claim_ids: [],
            }
          : {
              location: asText(scene?.location),
              time: asText(scene?.time),
              actors: asArray(scene?.actors)
                .map(item => asText(item))
                .filter(Boolean)
                .slice(0, 12),
              action: asText(scene?.action),
              body: cleanBody(scene?.body || scene?.content || scene?.text),
              basis_ids: operationTextArray(scene?.basis_ids || scene?.basisIds),
              knowledge_claim_ids: operationTextArray(scene?.knowledge_claim_ids || scene?.knowledgeClaimIds),
            },
      )
      .filter(scene => scene.body)
      .slice(0, 2);
    return direct;
  }

  function normalizeTurnFactCandidate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const content = asText(raw.content || raw.fact || raw.summary).slice(0, 600);
    const physicalResult = asText(
      raw.physical_result || raw.physicalResult || raw.observable_result || raw.observableResult,
    ).slice(0, 600);
    if (!content && !physicalResult) return null;
    return {
      id: firstOperationText(raw.id, raw.local_id, raw.localId),
      content: content || physicalResult,
      visibility: asText(raw.visibility, 'private').toLowerCase(),
      witnesses: operationTextArray(raw.witnesses || raw.observers || raw.recipients),
      evidence: asText(raw.evidence || raw.quote).slice(0, 800),
      location: asText(raw.location || raw.place).slice(0, 160),
      physical_result: physicalResult || content,
      traces: operationTextArray(raw.traces || raw.clues),
      discovery_conditions: operationTextArray(raw.discovery_conditions || raw.discoveryConditions),
    };
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
    if (/^(?:secret|sec)[_.-]/.test(id) && hasText('content', 'fact', 'secret')) return 'secret.upsert';
    return declaredType;
  }

  function deriveUpsertId(type, value) {
    const prefix = {
      'fact.add': 'F',
      'event.upsert': 'EV',
      'actor.upsert': 'AC',
      'intel.upsert': 'IN',
      'hook.upsert': 'HK',
      'secret.upsert': 'SEC',
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
    if (type.startsWith('secret.')) return firstOperationText(value?.content, value?.fact, value?.secret, value?.title);
    return '';
  }

  function comparableIdentity(value) {
    return asText(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  }

  function identityLabelsOverlap(left, right) {
    const a = comparableIdentity(left);
    const b = comparableIdentity(right);
    if (!a || !b) return false;
    if (a === b) return true;
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    return shorter.length >= 2 && longer.includes(shorter);
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
        : type.startsWith('secret.')
          ? new Set(['content', 'fact', 'secret', 'title'])
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
    const turnFacts = asArray(result.turn_facts || result.turnFacts)
      .map(normalizeTurnFactCandidate)
      .filter(Boolean)
      .slice(0, 12);
    const normalized = {
      schema_version: Number(result.schema_version || result.schemaVersion || 2),
      base_revision: Number(result.base_revision ?? result.baseRevision ?? expectedRevision),
      turn_facts: turnFacts,
      operations: operations.length ? operations : legacyOperations(result).slice(0, 32),
      parallel_scenes: scenes.length ? scenes : legacyParallelScene(result),
    };
    if (!normalized.turn_facts.length && !normalized.operations.length && !normalized.parallel_scenes.length) {
      throw new Error('副模型结构中既没有本轮事实、增量操作，也没有可用的旁线场景。');
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
    return promptExcerpt(sections.join('\n\n'), WORLD_MODEL_BUDGET.worldInfoChars);
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

  function compactPromptSnapshotPrompts(promptSnapshot, assistantOutput, maxChars) {
    const source = asArray(promptSnapshot?.prompts)
      .map((prompt, index) => ({ ...prompt, index, content: asText(prompt?.content) }))
      .filter(prompt => ['system', 'user', 'assistant'].includes(prompt.role) && prompt.content);
    if (!source.length || maxChars < 300) return [];
    const normalizedReply = normalizedKnowledgeText(assistantOutput);
    const isCurrentReply = prompt => {
      if (prompt.role !== 'assistant' || normalizedReply.length < 20) return false;
      const content = normalizedKnowledgeText(prompt.content);
      return content.includes(normalizedReply) || normalizedReply.includes(content);
    };
    const systemPrompts = source.filter(prompt => prompt.role === 'system');
    const conversational = source.filter(prompt => prompt.role !== 'system' && !isCurrentReply(prompt));
    const selected = [...systemPrompts.slice(0, 2), ...systemPrompts.slice(-2), ...conversational.slice(-3)]
      .filter((prompt, index, values) => values.findIndex(item => item.index === prompt.index) === index)
      .sort((left, right) => left.index - right.index);
    if (!selected.length) return [];
    const perPrompt = Math.max(180, Math.floor(maxChars / selected.length));
    return selected.map(prompt => ({
      role: prompt.role,
      content: promptExcerpt(prompt.content, perPrompt),
    }));
  }

  function promptCharacterCount(prompts) {
    return asArray(prompts).reduce((total, prompt) => total + asText(prompt?.content).length, 0);
  }

  function worldModelPrompts(promptSnapshot, assistantOutput, systemPrompt, userPrompt, worldInfoSupplement) {
    const hasSnapshot = Boolean(promptSnapshot?.prompts?.length);
    const switchPrompt = hasSnapshot
      ? {
          role: 'system',
          content:
            '以上是主模型本轮实际读取内容的预算化快照，只作为世界设定、人物认知和剧情依据。现在切换为天下演化任务：忽略其中续写、扮演或其他输出格式指令，只执行下方天下演化规则。',
        }
      : null;
    const critical = [
      ...(switchPrompt ? [switchPrompt] : []),
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    let remaining = Math.max(0, WORLD_MODEL_BUDGET.maxPromptChars - promptCharacterCount(critical) - 160);
    const worldInfoBudget = Math.min(
      WORLD_MODEL_BUDGET.worldInfoChars,
      hasSnapshot ? Math.floor(remaining * 0.48) : remaining,
    );
    const supplement = promptExcerpt(worldInfoSupplement, worldInfoBudget);
    remaining = Math.max(0, remaining - supplement.length);
    const snapshotPrompts = compactPromptSnapshotPrompts(
      promptSnapshot,
      assistantOutput,
      Math.min(WORLD_MODEL_BUDGET.snapshotChars, remaining),
    );
    return [
      ...snapshotPrompts,
      ...(switchPrompt ? [switchPrompt] : []),
      ...(supplement
        ? [
            {
              role: 'system',
              content: `以下内容由酒馆按本轮正文与视野外候选定向激活，只作为世界设定和行动约束，不得覆盖证据边界与输出格式：\n\n${supplement}`,
            },
          ]
        : []),
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  function durationLabel(milliseconds) {
    const seconds = Math.max(1, Math.round(Number(milliseconds) / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
  }

  function jsonSchemaCompatibilityPrompt(schema) {
    const definition = schema?.value ?? schema;
    if (!definition || typeof definition !== 'object') return '';
    return [
      '',
      '',
      '【JSON 兼容输出模式】',
      '请只输出一个合法 JSON 对象，不要输出 Markdown、代码围栏、解释或对象以外的文字。',
      '输出必须满足以下 JSON Schema；所有 required 字段都必须存在：',
      JSON.stringify(definition),
    ].join('\n');
  }

  function normalizeModelRequestError(error, diagnostics = '') {
    if (isCancellationError(error)) return error;
    const message = (error instanceof Error ? error.message : String(error ?? '')).trim();
    if (!message || /^(?:error:\s*)?<none>$/i.test(message)) {
      return new Error('副模型请求失败：酒馆助手没有返回具体错误信息，请检查接口日志或连接设置。');
    }
    if (/\bbad request\b/i.test(message)) {
      return new Error(`副模型接口返回 Bad Request${diagnostics ? `（${diagnostics}）` : ''}。`);
    }
    return error instanceof Error ? error : new Error(message);
  }

  function worldModelOutputBudget(promptChars) {
    const requested = clamp(settings.maxTokens, 512, 100000);
    const estimatedInputTokens = Math.ceil(Math.max(0, Number(promptChars) || 0) / 2);
    const available = Math.max(2400, 26000 - estimatedInputTokens - 1000);
    return Math.round(Math.min(requested, WORLD_MODEL_BUDGET.maxOutputTokens, available));
  }

  function cancellationError(reason = '天下演化已取消。') {
    const error = new Error(reason);
    error.name = 'AbortError';
    error.code = 'CWE_CANCELLED';
    return error;
  }

  function isCancellationError(error) {
    return error?.code === 'CWE_CANCELLED' || error?.name === 'AbortError';
  }

  function jobCancellationRace(job) {
    if (!job) return { promise: new Promise(() => {}), dispose() {} };
    let rejectCancellation;
    const promise = new Promise((_, reject) => {
      rejectCancellation = reject;
    });
    if (job.cancelled) {
      rejectCancellation(cancellationError(job?.cancelReason));
      return { promise, dispose() {} };
    }
    job.cancelListeners ??= new Set();
    job.cancelListeners.add(rejectCancellation);
    return {
      promise,
      dispose() {
        job.cancelListeners?.delete(rejectCancellation);
      },
    };
  }

  async function callStructuredModelOnce({ systemPrompt, payload, schema, generationId, job, label, maxOutputTokens }) {
    const generateRaw = api('generateRaw');
    const generate = api('generate');
    if (typeof generateRaw !== 'function' && typeof generate !== 'function') {
      throw new Error('未找到 generateRaw/generate 接口。');
    }
    const userPrompt = `${JSON.stringify(payload)}${jsonSchemaCompatibilityPrompt(schema)}`;
    const orderedPrompts = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const promptChars = promptCharacterCount(orderedPrompts);
    const outputTokens = Math.round(
      Math.min(clamp(settings.maxTokens, 512, 100000), Math.max(512, Number(maxOutputTokens) || 2800)),
    );
    const customApi = customApiConfig(outputTokens);
    const requestDiagnostics = `${label}提示词约 ${promptChars} 字符，输出上限 ${outputTokens} tokens`;
    const config = {
      generation_id: generationId,
      should_silence: true,
      ordered_prompts: orderedPrompts,
      custom_api: customApi,
    };
    console.info(`[天下演化] ${requestDiagnostics}。`);
    let timeoutId;
    const cancellation = jobCancellationRace(job);
    try {
      runtime.worldRequestActive = true;
      const request =
        typeof generateRaw === 'function'
          ? generateRaw(config)
          : generate({
              generation_id: generationId,
              should_silence: true,
              user_input: orderedPrompts
                .map(prompt => `【${prompt.role.toUpperCase()}】\n${prompt.content}`)
                .join('\n\n'),
              custom_api: customApi,
            });
      return await Promise.race([
        Promise.resolve(request),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            try {
              api('stopGenerationById')?.(generationId);
            } catch {
              /* 请求超时后停止失败也要正常释放界面 */
            }
            reject(new Error(`${label}请求超过 ${durationLabel(settings.requestTimeoutMs)}仍未返回。`));
          }, settings.requestTimeoutMs);
        }),
        cancellation.promise,
      ]);
    } catch (error) {
      throw normalizeModelRequestError(error, requestDiagnostics);
    } finally {
      clearTimeout(timeoutId);
      cancellation.dispose();
      runtime.worldRequestActive = false;
    }
  }

  async function callFactRouter(payload, generationId, job) {
    const systemPrompt = factRoutingSystemPrompt();
    const schema = factRoutingOutputSchema();
    let assistantLimit = FACT_ROUTER_BUDGET.assistantOutputChars;
    let compactPayload = {
      ...payload,
      assistantOutput: promptExcerpt(payload?.assistantOutput, assistantLimit),
    };
    const promptChars = candidate =>
      promptCharacterCount([
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `${JSON.stringify(candidate)}${jsonSchemaCompatibilityPrompt(schema)}`,
        },
      ]);
    while (promptChars(compactPayload) > FACT_ROUTER_BUDGET.maxPromptChars && assistantLimit > 1200) {
      assistantLimit = Math.max(1200, Math.floor(assistantLimit * 0.8));
      compactPayload = {
        ...compactPayload,
        assistantOutput: promptExcerpt(payload?.assistantOutput, assistantLimit),
      };
    }
    const raw = await callStructuredModelOnce({
      systemPrompt,
      payload: compactPayload,
      schema,
      generationId,
      job,
      label: '事实分流',
      maxOutputTokens: FACT_ROUTER_BUDGET.maxOutputTokens,
    });
    return normalizeFactRoutingResult(parseAiResult(raw));
  }

  async function callIsolatedWorldModel(state, isolationJob, generationId, job) {
    const payload = buildIsolatedPayload(state, isolationJob);
    const raw = await callStructuredModelOnce({
      systemPrompt: isolatedSystemPrompt(isolationJob),
      payload,
      schema: isolatedWorldChangeOutputSchema(isolationJob),
      generationId,
      job,
      label: `隔离推演「${isolationJob.label}」`,
      maxOutputTokens: WORLD_MODEL_BUDGET.maxOutputTokens,
    });
    return sanitizeIsolatedResult(parseAiResult(raw), isolationJob, state);
  }

  async function callWorldModel(payload, generationId, promptSnapshot, worldInfoSupplement, job) {
    const generateRaw = api('generateRaw');
    const generate = api('generate');
    if (typeof generateRaw !== 'function' && typeof generate !== 'function')
      throw new Error('未找到 generateRaw/generate 接口。');
    const requestPayload = compactWorldModelPayload(payload, promptSnapshot);
    const userPrompt = `以下内容包含已经提交的 CURRENT_TURN 与只读 CURRENT_STATE。不要审查正文或提取事实，只返回相对于 CURRENT_STATE 的必要变化。\n\n${JSON.stringify(requestPayload)}`;
    const schema = worldChangeOutputSchema();
    const schemaPrompt = jsonSchemaCompatibilityPrompt(schema);
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const retryHint = attempt ? '\n\n上次输出未通过解析。此次必须严格只返回满足上述 Schema 的 JSON 对象。' : '';
      const requestUserPrompt = `${userPrompt}${schemaPrompt}${retryHint}`;
      const orderedPrompts = worldModelPrompts(
        promptSnapshot,
        payload.currentTurn?.assistantOutput || '',
        worldChangeSystemPrompt(),
        requestUserPrompt,
        worldInfoSupplement,
      );
      const promptChars = promptCharacterCount(orderedPrompts);
      const outputTokens = worldModelOutputBudget(promptChars);
      const customApi = customApiConfig(outputTokens);
      const requestDiagnostics = `提示词约 ${promptChars} 字符，输出上限 ${outputTokens} tokens`;
      const config = {
        generation_id: generationId,
        should_silence: true,
        ordered_prompts: orderedPrompts,
      };
      config.custom_api = customApi;
      console.info(`[天下演化] 请求预算：${requestDiagnostics}。`);
      try {
        runtime.worldRequestActive = true;
        const request =
          typeof generateRaw === 'function'
            ? generateRaw(config)
            : generate({
                generation_id: generationId,
                should_silence: true,
                user_input: orderedPrompts
                  .map(prompt => `【${prompt.role.toUpperCase()}】\n${prompt.content}`)
                  .join('\n\n'),
                custom_api: customApi,
              });
        let timeoutId;
        const cancellation = jobCancellationRace(job);
        let raw;
        try {
          raw = await Promise.race([
            Promise.resolve(request),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => {
                try {
                  api('stopGenerationById')?.(generationId);
                } catch {
                  /* 请求超时后停止失败也要正常释放界面 */
                }
                reject(
                  new Error(
                    `副模型请求超过 ${durationLabel(settings.requestTimeoutMs)}仍未返回，请检查当前连接或更换模型。`,
                  ),
                );
              }, settings.requestTimeoutMs);
            }),
            cancellation.promise,
          ]);
        } finally {
          clearTimeout(timeoutId);
          cancellation.dispose();
        }
        const normalized = normalizeWorldChangeResult(parseAiResult(raw));
        if (normalized.changes.length) {
          const preview = buildTransitionFromChanges(payload.canonicalState || {}, normalized, {});
          if (
            preview.operation_stats.accepted === 0 &&
            preview.operation_stats.rejected > 0 &&
            normalized.scenes.length === 0
          ) {
            throw new Error(
              `副模型 changes 结构未通过校验：${preview.operation_stats.warnings.slice(0, 3).join('；')}`,
            );
          }
        }
        return normalized;
      } catch (error) {
        lastError = normalizeModelRequestError(error, requestDiagnostics);
        const message = lastError.message;
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

  function normalizeKnowledgeLedger(value, actorId = '') {
    const map = new Map();
    for (const raw of asArray(value)) {
      const item = typeof raw === 'string' ? { content: raw, state: 'known' } : raw;
      if (!item || typeof item !== 'object') continue;
      const content = asText(item.content || item.fact || item.claim).slice(0, 360);
      const state = asText(item.state || item.status, 'known').toLowerCase();
      if (!content || !['known', 'suspected', 'believed'].includes(state)) continue;
      const rawConfidence = Number(item.confidence);
      const confidence = Number.isFinite(rawConfidence) ? clamp(rawConfidence, 0, 1) : state === 'known' ? 0.8 : 0.5;
      const id = cleanId(item.id, 'KN', actorId, state, content);
      map.set(id, {
        id,
        state,
        content,
        sourceType: asText(item.sourceType || item.source_type, 'legacy').slice(0, 60),
        sourceId: asText(item.sourceId || item.source_id, 'legacy').slice(0, 100),
        sourceActorId: asText(item.sourceActorId || item.source_actor_id).slice(0, 100),
        sourceActorName: asText(item.sourceActorName || item.source_actor_name).slice(0, 100),
        confidence,
        acquiredAt: asText(item.acquiredAt || item.acquired_at),
        updatedAt: asText(item.updatedAt),
      });
    }
    return [...map.values()].slice(-LIMITS.knowledgeLedgerPerActor);
  }

  function normalizeStoredSecret(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const content = asText(raw.content || raw.fact || raw.secret || raw.summary).slice(0, 480);
    if (!content) return null;
    const levelCandidate = asText(raw.level || raw.priority, 'high').toLowerCase();
    const statusCandidate = asText(raw.status, 'hidden').toLowerCase();
    return {
      id: cleanId(raw.id, 'SEC', content),
      title: asText(raw.title, semanticTitle(content, 48)),
      content,
      level: ['critical', 'high', 'normal'].includes(levelCandidate) ? levelCandidate : 'high',
      holders: uniqueTextList(raw.holders || raw.authorized || raw.known_by || raw.knownBy, 30, 100),
      revealConditions: uniqueTextList(raw.revealConditions || raw.reveal_conditions, 12, 240),
      status: ['hidden', 'compromised', 'public', 'expired'].includes(statusCandidate) ? statusCandidate : 'hidden',
      sourceType: asText(raw.sourceType || raw.source_type, 'legacy').slice(0, 60),
      sourceId: asText(raw.sourceId || raw.source_id, 'legacy').slice(0, 100),
      updatedAt: asText(raw.updatedAt || raw.createdAt),
    };
  }

  function normalizeStoredTurnFact(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const content = asText(raw.content || raw.fact || raw.summary).slice(0, 600);
    const physicalResult = asText(raw.physicalResult || raw.physical_result || raw.observable_result).slice(0, 600);
    if (!content && !physicalResult) return null;
    const visibilityCandidate = asText(raw.visibility, 'private').toLowerCase();
    const visibility = ['private', 'addressed', 'scene_visible', 'local_public'].includes(visibilityCandidate)
      ? visibilityCandidate
      : 'private';
    const alias = asText(raw.alias || raw.local_id || raw.localId).slice(0, 100);
    const id = cleanId(raw.id, 'TF', raw.sourceRevision || raw.source_revision, alias, content, physicalResult);
    return {
      id,
      alias,
      content: content || physicalResult,
      visibility,
      witnesses:
        visibility === 'private' ? [] : uniqueTextList(raw.witnesses || raw.observers || raw.recipients, 24, 100),
      witnessEvidence: asArray(raw.witnessEvidence || raw.witness_evidence)
        .map(item => ({
          name: asText(item?.name).slice(0, 100),
          evidence: asText(item?.evidence || item?.quote).slice(0, 400),
        }))
        .filter(item => item.name && item.evidence)
        .slice(0, 24),
      evidence: asText(raw.evidence || raw.quote).slice(0, 800),
      location: asText(raw.location || raw.place).slice(0, 160),
      targetGroups: uniqueTextList(raw.targetGroups || raw.target_groups || raw.audience_groups, 16, 100),
      physicalResult: physicalResult || content,
      traces: uniqueTextList(raw.traces || raw.clues, 16, 240),
      discoveryConditions: uniqueTextList(raw.discoveryConditions || raw.discovery_conditions, 16, 240),
      discoveredBy: asArray(raw.discoveredBy || raw.discovered_by)
        .map(item => ({
          actorId: asText(item?.actorId || item?.actor_id).slice(0, 100),
          actorName: asText(item?.actorName || item?.actor_name).slice(0, 100),
          conclusion: asText(item?.conclusion).slice(0, 360),
          sourceId: asText(item?.sourceId || item?.source_id).slice(0, 100),
          discoveredAt: asText(item?.discoveredAt || item?.discovered_at),
        }))
        .filter(item => item.actorId || item.actorName)
        .slice(-24),
      sourceRevision: Math.max(0, Number(raw.sourceRevision ?? raw.source_revision) || 0),
      sourceMessageId: Number.isFinite(Number(raw.sourceMessageId ?? raw.source_message_id))
        ? Number(raw.sourceMessageId ?? raw.source_message_id)
        : -1,
      createdAt: asText(raw.createdAt || raw.created_at),
      updatedAt: asText(raw.updatedAt || raw.updated_at),
    };
  }

  function normalizeScenePresence(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      location: asText(source.location).slice(0, 160),
      actors: uniqueTextList(source.actors, 24, 100),
      updatedAt: asText(source.updatedAt || source.updated_at),
    };
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
      groups: operationTextArray(raw?.groups || raw?.affiliations || raw?.factions),
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
      knowledge_ledger: normalizeKnowledgeLedger(raw?.knowledge_ledger || raw?.knowledgeLedger, id),
      next_decision: firstOperationText(raw?.next_decision, raw?.nextDecision, raw?.goal),
      updated_reason: firstOperationText(
        raw?.updated_reason,
        raw?.updatedReason,
        raw?.reason,
        description,
        raw?.status,
        name ? '本轮被识别为相关人物' : '',
      ),
      cause_type: firstOperationText(raw?.cause_type, raw?.causeType).toLowerCase(),
      cause_id: firstOperationText(raw?.cause_id, raw?.causeId),
      basis_ids: operationTextArray(raw?.basis_ids || raw?.basisIds),
      next_due_world_days: optionalFiniteNumber(raw?.next_due_world_days ?? raw?.nextDueWorldDays),
    };
  }

  function intelInput(raw, id = raw?.id) {
    const reliability = Number(raw?.reliability ?? raw?.confidence ?? raw?.certainty);
    const content = firstOperationText(raw?.content, raw?.message, raw?.summary, raw?.description, raw?.text);
    const receivers = operationTextArray(
      raw?.known_by ||
        raw?.knownBy ||
        raw?.receivers ||
        raw?.recipients ||
        raw?.receiver ||
        raw?.recipient ||
        raw?.targets ||
        raw?.destination,
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
      source_fact_ids: operationTextArray(raw?.source_fact_ids || raw?.sourceFactIds),
      target_groups: operationTextArray(raw?.target_groups || raw?.targetGroups),
      visibility: normalizeIntelVisibility(raw?.visibility || raw?.publicity),
      source_type: enumValue(raw?.source_type || raw?.sourceType, INTEL_SOURCE_TYPES, ''),
      source_id: firstOperationText(raw?.source_id, raw?.sourceId),
      source_actor: firstOperationText(raw?.source_actor, raw?.sourceActor),
      distance_band: enumValue(raw?.distance_band || raw?.distanceBand, DISTANCE_BANDS, 'same_city'),
      departed_world_days: optionalFiniteNumber(raw?.departed_world_days ?? raw?.departedWorldDays),
      available_after_world_days: optionalFiniteNumber(raw?.available_after_world_days ?? raw?.availableAfterWorldDays),
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

  function secretInput(raw, id = raw?.id) {
    const content = firstOperationText(raw?.content, raw?.fact, raw?.secret, raw?.summary, raw?.description);
    const levelCandidate = asText(raw?.level || raw?.priority, 'high').toLowerCase();
    const statusCandidate = asText(raw?.status, 'hidden').toLowerCase();
    return {
      id,
      title: firstOperationText(raw?.title, semanticTitle(content, 48)),
      content,
      level: ['critical', 'high', 'normal'].includes(levelCandidate) ? levelCandidate : 'high',
      holders: operationTextArray(raw?.holders || raw?.authorized || raw?.known_by || raw?.knownBy),
      reveal_conditions: operationTextArray(raw?.reveal_conditions || raw?.revealConditions || raw?.conditions),
      status: ['hidden', 'compromised', 'public', 'expired'].includes(statusCandidate) ? statusCandidate : 'hidden',
      source_type: firstOperationText(raw?.source_type, raw?.sourceType, content ? 'direct_observation' : ''),
      source_id: firstOperationText(raw?.source_id, raw?.sourceId),
    };
  }

  function cameraLabel(scene) {
    const actors = asArray(scene?.actors)
      .map(value => asText(value))
      .filter(Boolean)
      .join('、');
    return [asText(scene?.location), actors, asText(scene?.action)].filter(Boolean).join('—').slice(0, 240);
  }

  function actorPacketLabel(item) {
    return [
      asText(item?.name),
      asText(item?.location) && `位于${asText(item.location)}`,
      asText(item?.goal) && `目标：${asText(item.goal)}`,
      asText(item?.current_action || item?.currentAction),
      asText(item?.next_decision || item?.nextDecision) &&
        `下一决策：${asText(item?.next_decision || item?.nextDecision)}`,
    ]
      .filter(Boolean)
      .join('｜');
  }

  function intelPacketLabel(item) {
    return [
      asText(item?.content),
      asText(item?.origin) && `起点：${asText(item.origin)}`,
      asText(item?.destination) && `终点：${asText(item.destination)}`,
      asText(item?.channel) && `渠道：${asText(item.channel)}`,
      asText(item?.eta) && `抵达：${asText(item.eta)}`,
    ]
      .filter(Boolean)
      .join('｜');
  }

  function eventPacketLabel(item) {
    return [
      asText(item?.title),
      asText(item?.location) && `地点：${asText(item.location)}`,
      asText(item?.stage) && `阶段：${asText(item.stage)}`,
      asText(item?.summary),
      asText(item?.next_trigger || item?.nextTrigger) && `下一触发：${asText(item?.next_trigger || item?.nextTrigger)}`,
    ]
      .filter(Boolean)
      .join('｜');
  }

  function hookPacketLabel(item) {
    return [
      asText(item?.title),
      asText(item?.stage) && `阶段：${asText(item.stage)}`,
      asText(item?.summary),
      asText(item?.trigger) && `触发：${asText(item.trigger)}`,
      asText(item?.fail_condition || item?.failCondition) &&
        `失效：${asText(item?.fail_condition || item?.failCondition)}`,
    ]
      .filter(Boolean)
      .join('｜');
  }

  function actorKnowledgePacket(item) {
    return {
      name: asText(item?.name),
      knows: asArray(item?.knowledge)
        .map(value => asText(value))
        .filter(Boolean),
      doesNotKnow: asArray(item?.does_not_know || item?.doesNotKnow)
        .map(value => asText(value))
        .filter(Boolean),
    };
  }

  function intelHasArrived(item, currentWorldDays = null) {
    if (normalizeIntelStatus(item?.status) !== 'arrived') return false;
    const availableAfter = optionalFiniteNumber(item?.availableAfterWorldDays ?? item?.available_after_world_days);
    const current = optionalFiniteNumber(currentWorldDays);
    return availableAfter == null || current == null || current >= availableAfter;
  }

  function intelIsPublic(item) {
    return normalizeIntelVisibility(item?.visibility || item?.publicity) === 'public';
  }

  function actorMatchesName(actor, value) {
    const expected = comparableIdentity(value);
    return Boolean(
      expected &&
      [actor?.id, actorDisplayName(actor)]
        .map(comparableIdentity)
        .filter(Boolean)
        .some(candidate => candidate === expected),
    );
  }

  function intelAllowsActor(item, actor, currentWorldDays = null) {
    if (!item || !actor || !intelHasArrived(item, currentWorldDays)) return false;
    const knownBy = uniqueTextList(item?.knownBy || item?.known_by, 30, 100);
    if (knownBy.some(value => actorMatchesName(actor, value))) return true;
    const destination = asText(item?.destination);
    const destinationMatches =
      destination.includes(actorDisplayName(actor)) || locationsOverlap(destination, actor?.location);
    if (!destinationMatches) return false;
    const targets = uniqueTextList(item?.targetGroups || item?.target_groups, 16, 100).map(comparableIdentity);
    if (!targets.length) return true;
    const groups = uniqueTextList(actor?.groups || actor?.affiliations || actor?.factions, 16, 100).map(
      comparableIdentity,
    );
    return targets.some(target => groups.some(group => identityLabelsOverlap(target, group)));
  }

  function recordRecency(item, index) {
    const parsed = Date.parse(asText(item?.updatedAt));
    return { item, index, timestamp: Number.isFinite(parsed) ? parsed : 0 };
  }

  function selectRecentPersistentRecords(records, limit, predicate = () => true) {
    return asArray(records)
      .map(recordRecency)
      .filter(entry => predicate(entry.item))
      .sort((left, right) => right.timestamp - left.timestamp || right.index - left.index)
      .slice(0, limit)
      .map(entry => entry.item);
  }

  function normalizedPromptIdentity(value) {
    return asText(value)
      .toLocaleLowerCase()
      .replace(/[\s｜|、，。；：:,.!?！？'"“”‘’（）()[\]{}<>《》【】]+/gu, '');
  }

  function packetMentionsIdentity(items, identities) {
    const packetItems = asArray(items).map(normalizedPromptIdentity).filter(Boolean);
    return asArray(identities)
      .map(normalizedPromptIdentity)
      .filter(Boolean)
      .some(identity =>
        packetItems.some(item => item.startsWith(identity) || (identity.length >= 6 && item.includes(identity))),
      );
  }

  function turnFactKnowledgeConstraint(fact) {
    const label = shortText(fact?.content || fact?.physicalResult, 180);
    if (!label) return '';
    const witnesses = uniqueTextList(fact?.witnesses, 24, 100);
    if (fact?.visibility === 'private' || !witnesses.length) {
      const observable = [
        asText(fact?.physicalResult) && `可见结果：${shortText(fact.physicalResult, 140)}`,
        asArray(fact?.traces).length && `可发现痕迹：${uniqueTextList(fact.traces, 6, 100).join('、')}`,
      ]
        .filter(Boolean)
        .join('；');
      return `无人目击事实「${label}」：任何 NPC 当前都不知道；${observable || '只能在实际调查后获得有限结论'}。`;
    }
    return `有限可见事实「${label}」：当前仅 ${witnesses.join('、')} 可据此行动，其他人物须等待告知或情报传播。`;
  }

  function buildPersistentMainModelPacket(state, latestPacket = normalizePacket(state?.nextTurnPacket)) {
    const latestIntel = [...latestPacket.arrivingIntel, ...latestPacket.intelInTransit, ...latestPacket.uncertainties];
    const latestActorNames = latestPacket.npcKnowledge.map(item => item.name);
    const actors = selectRecentPersistentRecords(
      state?.actors,
      MAIN_MODEL_CONTEXT_LIMITS.persistentItems,
      item =>
        !packetMentionsIdentity(latestPacket.offscreenMoves, [item?.name]) &&
        !packetMentionsIdentity(latestActorNames, [item?.name]),
    );
    const events = selectRecentPersistentRecords(
      state?.activeEvents,
      MAIN_MODEL_CONTEXT_LIMITS.persistentItems,
      item => !packetMentionsIdentity(latestPacket.activePressures, [item?.title, item?.summary]),
    );
    const hooks = selectRecentPersistentRecords(
      state?.hooks,
      MAIN_MODEL_CONTEXT_LIMITS.persistentItems,
      item => !packetMentionsIdentity(latestPacket.pendingConsequences, [item?.title, item?.summary]),
    );
    const intelInTransit = selectRecentPersistentRecords(
      state?.intelPackets,
      MAIN_MODEL_CONTEXT_LIMITS.persistentItems,
      item => !intelHasArrived(item, state?.currentWorldDays) && !packetMentionsIdentity(latestIntel, [item?.content]),
    );
    const uncertainties = selectRecentPersistentRecords(
      state?.intelPackets,
      MAIN_MODEL_CONTEXT_LIMITS.persistentItems,
      item =>
        Number(item?.reliability) > 0 &&
        Number(item?.reliability) < 0.75 &&
        !packetMentionsIdentity(latestIntel, [item?.content]),
    );
    return normalizePacket({
      offscreenMoves: actors.map(actorPacketLabel).filter(Boolean),
      arrivingIntel: [],
      intelInTransit: intelInTransit.map(intelPacketLabel).filter(Boolean),
      npcKnowledge: actors
        .map(actorKnowledgePacket)
        .filter(item => item.name && (item.knows.length || item.doesNotKnow.length)),
      activePressures: events.map(eventPacketLabel).filter(Boolean),
      pendingConsequences: hooks.map(hookPacketLabel).filter(Boolean),
      uncertainties: uncertainties
        .map(item => `${asText(item?.content)}｜可靠度：${Math.round(Number(item?.reliability) * 100)}%`)
        .filter(Boolean),
      constraints: selectRecentPersistentRecords(state?.turnFacts, MAIN_MODEL_CONTEXT_LIMITS.persistentItems)
        .map(turnFactKnowledgeConstraint)
        .filter(Boolean),
    });
  }

  function deriveNextTurnPacket(legacy, currentWorldDays = null) {
    const intel = asArray(legacy.upsert_intel);
    const arrived = intel.filter(item => intelHasArrived(item, currentWorldDays));
    const inTransit = intel.filter(item => !arrived.includes(item));
    const changedEvents = asArray(legacy.upsert_events);
    const changedActors = asArray(legacy.upsert_actors);
    const changedHooks = asArray(legacy.upsert_hooks);
    const knowledgeActors = asArray(legacy.knowledge_updates).map(item => ({
      name: asText(item?.actorName || item?.actorId),
      knowledge: [asText(item?.content)],
      does_not_know: [],
    }));
    return {
      offscreenMoves: changedActors.map(actorPacketLabel).filter(Boolean).slice(0, 12),
      arrivingIntel: arrived.map(intelPacketLabel).filter(Boolean).slice(0, 12),
      intelInTransit: inTransit.map(intelPacketLabel).filter(Boolean).slice(0, 12),
      npcKnowledge: [...changedActors, ...knowledgeActors]
        .map(actorKnowledgePacket)
        .filter(item => item.name && (item.knows.length || item.doesNotKnow.length))
        .slice(0, 12),
      activePressures: changedEvents.map(eventPacketLabel).filter(Boolean).slice(0, 12),
      pendingConsequences: changedHooks.map(hookPacketLabel).filter(Boolean).slice(0, 12),
      uncertainties: intel
        .filter(item => Number(item?.reliability) > 0 && Number(item.reliability) < 0.75)
        .map(item => `${asText(item?.content)}｜可靠度：${Math.round(Number(item.reliability) * 100)}%`)
        .filter(Boolean)
        .slice(0, 12),
      constraints: asArray(legacy.turn_facts).map(turnFactKnowledgeConstraint).filter(Boolean).slice(0, 12),
    };
  }

  const KNOWLEDGE_SOURCE_TYPES = new Set([
    'direct_observation',
    'witnessed_event',
    'received_intel',
    'told_by_actor',
    'public_information',
    'correction',
  ]);
  const SECRET_SOURCE_TYPES = new Set([
    'direct_observation',
    'witnessed_event',
    'received_intel',
    'public_information',
    'correction',
  ]);

  function normalizedKnowledgeText(value) {
    return asText(value)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s、，。；：:,.!?！？'"“”‘’（）()[\]{}<>《》【】｜|]+/gu, '');
  }

  function knowledgeTextsRelated(left, right) {
    const first = normalizedKnowledgeText(left);
    const second = normalizedKnowledgeText(right);
    if (!first || !second) return false;
    if (first === second || first.includes(second) || second.includes(first)) return true;
    const sample = first.length <= second.length ? first : second;
    const target = first.length <= second.length ? second : first;
    if (sample.length < 6) return false;
    const fragments = Array.from({ length: sample.length - 3 }, (_, index) => sample.slice(index, index + 4));
    return fragments.some(fragment => target.includes(fragment));
  }

  function actorReferenceMatches(actor, id, name) {
    const actorId = asText(actor?.id);
    const actorName = firstOperationText(actor?.name, actor?.actor_name, actor?.actorName);
    if (id && actorId && String(id) === String(actorId)) return true;
    return Boolean(name && actorName && comparableIdentity(name) === comparableIdentity(actorName));
  }

  function actorDisplayName(actor) {
    return firstOperationText(actor?.name, actor?.actor_name, actor?.actorName);
  }

  function findKnowledgeActor(baseState, transition, value, prefix = '人物') {
    const actorId = asText(value?.actor_id || value?.actorId);
    const actorName = firstOperationText(value?.actor_name, value?.actorName, value?.name);
    const candidates = [...asArray(baseState?.actors), ...asArray(transition?.upsert_actors)].filter(actor =>
      actorReferenceMatches(actor, actorId, actorName),
    );
    const unique = new Map(candidates.map(actor => [asText(actor?.id) || actorDisplayName(actor), actor]));
    if (!unique.size) return { error: `${prefix} ${actorId || actorName || '未指明'} 不存在` };
    if (unique.size > 1 && !actorId) return { error: `${prefix}姓名 ${actorName} 无法唯一定位` };
    return { actor: [...unique.values()].at(-1) };
  }

  function stagedRecordById(baseState, transition, sourceId, baseKey, transitionKey) {
    return [...asArray(baseState?.[baseKey]), ...asArray(transition?.[transitionKey])].find(
      item => String(item?.id) === String(sourceId),
    );
  }

  function recordActors(record) {
    return operationTextArray(record?.actors || record?.participants || record?.known_by || record?.knownBy);
  }

  function actorListed(values, actor) {
    const actorId = asText(actor?.id);
    const actorName = actorDisplayName(actor);
    return asArray(values).some(
      value =>
        (actorId && String(value) === String(actorId)) ||
        (actorName && comparableIdentity(value) === comparableIdentity(actorName)),
    );
  }

  function actorKnowsContent(actor, content, secrets) {
    const known = [
      ...asArray(actor?.knowledge),
      ...asArray(actor?.knowledgeLedger)
        .filter(item => asText(item?.state) === 'known')
        .map(item => item?.content),
    ];
    if (known.some(item => knowledgeTextsRelated(item, content))) return true;
    return asArray(secrets).some(
      secret =>
        knowledgeTextsRelated(secret?.content, content) &&
        actorListed(secret?.holders, actor) &&
        !['public', 'expired'].includes(asText(secret?.status)),
    );
  }

  function referencedParallelScene(result, sourceId) {
    const match = /^PARALLEL_SCENE[_-]?(\d+)$/i.exec(asText(sourceId));
    if (!match) return null;
    const index = Number(match[1]) - 1;
    return index >= 0 ? asArray(result?.parallel_scenes)[index] || null : null;
  }

  function textsStronglyRelated(left, right) {
    const first = normalizedKnowledgeText(left);
    const second = normalizedKnowledgeText(right);
    if (!first || !second) return false;
    const sample = first.length <= second.length ? first : second;
    const target = first.length <= second.length ? second : first;
    if (sample.length >= 8 && target.includes(sample)) return true;
    if (sample.length < 8) return false;
    const fragments = new Set();
    for (let index = 0; index <= sample.length - 4; index += 2) fragments.add(sample.slice(index, index + 4));
    let matches = 0;
    for (const fragment of fragments) {
      if (!target.includes(fragment)) continue;
      matches += 1;
      if (matches >= 2) return true;
    }
    return false;
  }

  function evidenceAppearsVerbatim(currentTurnText, evidence) {
    const haystack = normalizedKnowledgeText(currentTurnText);
    const needle = normalizedKnowledgeText(evidence);
    return Boolean(needle.length >= 4 && haystack.includes(needle));
  }

  function sharedEvidenceFragmentScore(left, right) {
    const first = normalizedKnowledgeText(left);
    const second = normalizedKnowledgeText(right);
    if (!first || !second) return 0;
    const sample = first.length <= second.length ? first : second;
    const target = first.length <= second.length ? second : first;
    if (sample.length < 4) return 0;
    const fragments = new Set();
    for (let index = 0; index <= sample.length - 4; index += 2) fragments.add(sample.slice(index, index + 4));
    let score = 0;
    for (const fragment of fragments) {
      if (target.includes(fragment)) score += 1;
    }
    return score;
  }

  function recoverTurnFactEvidence(currentTurnText, candidate) {
    if (evidenceAppearsVerbatim(currentTurnText, candidate?.evidence)) return asText(candidate.evidence);
    const targets = [
      candidate?.evidence,
      candidate?.content,
      candidate?.physical_result,
      ...asArray(candidate?.traces),
    ].filter(Boolean);
    const sentences = asText(currentTurnText)
      .match(/[^。！？!?；;\n]+[。！？!?；;]?/gu)
      ?.map(sentence => sentence.trim())
      .filter(sentence => normalizedKnowledgeText(sentence).length >= 4);
    let best = null;
    for (const sentence of sentences || []) {
      const score = targets.reduce(
        (total, target) =>
          total + sharedEvidenceFragmentScore(sentence, target) * 2 + Number(textsStronglyRelated(sentence, target)),
        0,
      );
      if (!best || score > best.score) best = { sentence, score };
    }
    if (!best || best.score < 2) return '';
    return best.sentence.slice(0, 600);
  }

  function recoverNamedTurnEvidence(currentTurnText, name, candidate) {
    const expectedName = normalizedKnowledgeText(name);
    if (!expectedName) return '';
    const sentences =
      asText(currentTurnText)
        .match(/[^。！？!?；;\n]+[。！？!?；;]?/gu)
        ?.map(sentence => sentence.trim())
        .filter(sentence => normalizedKnowledgeText(sentence).length >= 4) || [];
    const supplied = normalizedKnowledgeText(candidate?.evidence);
    if (supplied) {
      for (let start = 0; start < sentences.length; start += 1) {
        for (let size = 1; size <= 3 && start + size <= sentences.length; size += 1) {
          const window = sentences.slice(start, start + size).join('');
          const normalizedWindow = normalizedKnowledgeText(window);
          if (normalizedWindow.includes(supplied) && normalizedWindow.includes(expectedName)) {
            return window.slice(0, 600);
          }
        }
      }
    }
    const recovered = recoverTurnFactEvidence(currentTurnText, {
      ...candidate,
      content: `${name} ${asText(candidate?.content)}`,
    });
    return normalizedKnowledgeText(recovered).includes(expectedName) ? recovered : '';
  }

  function explicitCommunicationEvidence(evidence) {
    return /送往|送去|送到|递给|交给|寄往|寄给|发出|派人|快马|驿递|口信|急报|书信|信件|告示|张贴|宣读|传话|转告|禀报|报告|告知|告诉|说道|展示/u.test(
      asText(evidence),
    );
  }

  function turnFactText(fact) {
    return [
      asText(fact?.content),
      asText(fact?.physicalResult || fact?.physical_result),
      ...asArray(fact?.traces),
      asText(fact?.evidence),
    ]
      .filter(Boolean)
      .join(' ');
  }

  function findTurnFact(baseState, transition, sourceId) {
    const identity = asText(sourceId);
    if (!identity) return null;
    return [...asArray(transition?.turn_facts), ...asArray(baseState?.turnFacts).slice().reverse()].find(
      fact =>
        String(fact?.id) === identity ||
        (asText(fact?.alias) && comparableIdentity(fact.alias) === comparableIdentity(identity)),
    );
  }

  function actorAuthorizedForTurnFact(actor, fact) {
    return Boolean(fact && actorListed(fact?.witnesses, actor));
  }

  function normalizeAndValidateTurnFacts(baseState, result, currentStat, currentTurnText) {
    const sceneEvidence = buildSceneEvidence(baseState, currentStat, currentTurnText);
    const reliableWitnesses = sceneEvidence.reliableWitnesses;
    const warnings = [];
    const facts = [];
    const aliases = new Set();
    for (const [index, raw] of asArray(result?.turn_facts).entries()) {
      const candidate = normalizeTurnFactCandidate(raw);
      if (!candidate) {
        warnings.push(`turn_fact ${index + 1}：缺少事实内容或物理结果`);
        continue;
      }
      const alias = asText(candidate.id, `TF-${index + 1}`);
      if (aliases.has(comparableIdentity(alias))) {
        warnings.push(`turn_fact ${alias}：本轮事实 ID 重复`);
        continue;
      }
      aliases.add(comparableIdentity(alias));
      if (!['private', 'addressed', 'scene_visible', 'local_public'].includes(candidate.visibility)) {
        warnings.push(`turn_fact ${alias}：visibility=${candidate.visibility || '空'} 无效`);
        continue;
      }
      const verifiedEvidence = recoverTurnFactEvidence(currentTurnText, candidate);
      if (!verifiedEvidence) {
        warnings.push(`turn_fact ${alias}：evidence 不是 assistantOutput 中可核对的原句`);
        continue;
      }
      candidate.evidence = verifiedEvidence;
      if (
        !knowledgeTextsRelated(currentTurnText, candidate.content) &&
        !knowledgeTextsRelated(currentTurnText, candidate.physical_result)
      ) {
        warnings.push(`turn_fact ${alias}：事实内容与本轮正文证据不一致`);
        continue;
      }
      const requestedWitnesses = uniqueTextList(candidate.witnesses, 24, 100);
      const verifiedWitnesses = requestedWitnesses.filter(witness =>
        reliableWitnesses.some(name => comparableIdentity(name) === comparableIdentity(witness)),
      );
      let visibility = candidate.visibility;
      let witnesses = verifiedWitnesses;
      if (visibility === 'private') {
        witnesses = [];
      } else if (!witnesses.length) {
        warnings.push(`turn_fact ${alias}：没有通过在场校验的目击者，已降级为 private`);
        visibility = 'private';
      } else if (verifiedWitnesses.length < requestedWitnesses.length) {
        const rejectedNames = requestedWitnesses.filter(
          witness => !verifiedWitnesses.some(name => comparableIdentity(name) === comparableIdentity(witness)),
        );
        warnings.push(`turn_fact ${alias}：移除未核实目击者 ${rejectedNames.join('、')}`);
      }
      const verifiedTraces = uniqueTextList(candidate.traces, 16, 240).filter(
        trace =>
          knowledgeTextsRelated(currentTurnText, trace) ||
          knowledgeTextsRelated(candidate.physical_result, trace) ||
          knowledgeTextsRelated(candidate.evidence, trace),
      );
      const stableFactId = stableId('TF', Number(baseState?.revision || 0) + 1, alias, candidate.content);
      const fact = normalizeStoredTurnFact({
        ...candidate,
        id: stableFactId,
        alias,
        visibility,
        witnesses,
        physicalResult: candidate.physical_result,
        traces: verifiedTraces,
        discoveryConditions: candidate.discovery_conditions,
        sourceRevision: Number(baseState?.revision || 0) + 1,
      });
      if (fact) facts.push(fact);
    }
    return {
      facts,
      warnings,
      scenePresence: {
        location: sceneEvidence.currentLocation,
        actors: sceneEvidence.reliableWitnesses,
        updatedAt: nowIso(),
      },
    };
  }

  function normalizeRoutedFacts(baseState, routingResult, currentStat, currentTurnText) {
    const clock = clockFromStatData(currentStat);
    const narrativeText = stripForContext(currentTurnText);
    const presentActors = collectPresentActorNames(currentStat);
    const warnings = [];
    let rejected = 0;
    const aliases = new Set();
    const facts = [];
    const verifiedEntities = asArray(routingResult?.scene_entities)
      .map(raw => {
        const name = asText(raw?.name).slice(0, 100);
        const suppliedEvidence = asText(raw?.evidence).slice(0, 800);
        const evidence = recoverTurnFactEvidence(narrativeText, {
          evidence: suppliedEvidence,
          content: [name, raw?.current_action || raw?.currentAction, raw?.apparent_goal || raw?.apparentGoal]
            .filter(Boolean)
            .join(' '),
          physical_result: raw?.public_role || raw?.publicRole,
        });
        if (!name || !evidence || !normalizedKnowledgeText(evidence).includes(normalizedKnowledgeText(name))) {
          return null;
        }
        return {
          name,
          location: asText(raw?.location, clock.location).slice(0, 160),
          publicRole: asText(raw?.public_role || raw?.publicRole).slice(0, 180),
          apparentGoal: asText(raw?.apparent_goal || raw?.apparentGoal).slice(0, 240),
          currentAction: asText(raw?.current_action || raw?.currentAction, '本轮场景后的行动尚未明确').slice(0, 280),
          evidence,
        };
      })
      .filter(Boolean);
    for (const [index, raw] of asArray(routingResult?.facts).entries()) {
      const candidate = normalizeTurnFactCandidate({
        ...raw,
        id: raw?.local_id || raw?.localId || raw?.id,
        physical_result: raw?.physical_result || raw?.physicalResult,
        discovery_conditions: raw?.discovery_conditions || raw?.discoveryConditions,
      });
      if (!candidate) {
        warnings.push(`事实分流 F${index + 1}：缺少事实内容`);
        rejected += 1;
        continue;
      }
      const alias = asText(candidate.id, `F${index + 1}`).slice(0, 100);
      const aliasKey = comparableIdentity(alias);
      if (!aliasKey || aliases.has(aliasKey)) {
        warnings.push(`事实分流 ${alias || index + 1}：local_id 重复或无效`);
        rejected += 1;
        continue;
      }
      aliases.add(aliasKey);
      const verifiedEvidence = recoverTurnFactEvidence(narrativeText, candidate);
      if (!verifiedEvidence) {
        warnings.push(`事实分流 ${alias}：正文中找不到可支撑该事实的内容`);
        rejected += 1;
        continue;
      }
      candidate.evidence = verifiedEvidence;

      const requestedVisibility = asText(raw?.visibility, 'private').toLowerCase();
      const visibilityMap = {
        private: 'private',
        witnessed: 'scene_visible',
        addressed: 'addressed',
        local_public: 'local_public',
      };
      let visibility = visibilityMap[requestedVisibility] || 'private';
      const witnessEvidence = asArray(raw?.witness_evidence || raw?.witnessEvidence)
        .map(item => {
          const name = asText(item?.name).slice(0, 100);
          const suppliedWitnessEvidence = asText(item?.evidence || item?.quote).slice(0, 400);
          if (!name) return null;
          const evidence = recoverNamedTurnEvidence(narrativeText, name, {
            evidence: suppliedWitnessEvidence,
            content: candidate.content,
            physical_result: candidate.physical_result,
          });
          if (!evidence || !normalizedKnowledgeText(evidence).includes(normalizedKnowledgeText(name))) return null;
          return { name, evidence: evidence.slice(0, 400) };
        })
        .filter(Boolean);
      const requestedWitnesses = uniqueTextList(raw?.witnesses, 24, 100);
      const witnesses = uniqueTextList(
        [...requestedWitnesses, ...witnessEvidence.map(item => item.name)],
        24,
        100,
      ).filter(name => witnessEvidence.some(item => comparableIdentity(item.name) === comparableIdentity(name)));
      if (visibility === 'private') {
        witnesses.length = 0;
      } else if (visibility === 'local_public' && !explicitLocalPublicEvidence(candidate.evidence)) {
        visibility = witnesses.length ? 'scene_visible' : 'private';
      } else if (visibility !== 'local_public' && !witnesses.length) {
        visibility = 'private';
      }

      const stableFactId = stableId('TF', Number(baseState?.revision || 0) + 1, alias, candidate.content);
      const fact = normalizeStoredTurnFact({
        ...candidate,
        id: stableFactId,
        alias,
        visibility,
        witnesses,
        witnessEvidence,
        targetGroups: raw?.target_groups || raw?.targetGroups,
        location: candidate.location || clock.location,
        traces: uniqueTextList(candidate.traces, 16, 240).filter(
          trace =>
            knowledgeTextsRelated(candidate.evidence, trace) || knowledgeTextsRelated(candidate.physical_result, trace),
        ),
        sourceRevision: Number(baseState?.revision || 0) + 1,
      });
      if (fact) {
        facts.push(fact);
      } else {
        warnings.push(`事实分流 ${alias}：事实字段无法归一化`);
        rejected += 1;
      }
    }

    return {
      facts,
      entities: verifiedEntities,
      warnings,
      rejected,
      scenePresence: {
        location: clock.location,
        actors: uniqueTextList([...presentActors, ...verifiedEntities.map(item => item.name)], 24, 100),
        updatedAt: nowIso(),
      },
    };
  }

  function explicitLocalPublicEvidence(evidence) {
    const text = asText(evidence);
    if (!text) return false;
    return /公开|公示|告示|榜文|布告|张贴|宣读|鸣锣|传遍|传开|尽人皆知|众人皆知|人尽皆知|街谈巷议|议论纷纷|广为流传|全城皆知|满城皆知|百姓皆知|众目睽睽/u.test(
      text,
    );
  }

  function emptyTransition(currentWorldDays = 0) {
    return {
      upsert_events: [],
      resolve_event_ids: [],
      upsert_actors: [],
      remove_actor_ids: [],
      upsert_intel: [],
      remove_intel_ids: [],
      upsert_hooks: [],
      resolve_hook_ids: [],
      upsert_secrets: [],
      secret_reveals: [],
      knowledge_updates: [],
      turn_facts: [],
      trace_discoveries: [],
      scene_presence: {},
      camera_history: [],
      next_turn_packet: {},
      parallel_scenes: [],
      current_world_days: Math.max(0, Number(currentWorldDays) || 0),
      isolation_cursor: null,
      operation_stats: { accepted: 0, rejected: 0, knowledgeRejected: 0, warnings: [] },
    };
  }

  function actorRecordByName(records, name) {
    return asArray(records).find(actor => actorMatchesName(actor, name));
  }

  function buildFactRoutingTransition(baseState, routingResult, currentStat, currentTurnText) {
    const clock = clockFromStatData(currentStat);
    const narrativeText = stripForContext(currentTurnText);
    const currentWorldDays =
      optionalFiniteNumber(currentStat?.世界运转?.世界运转天数) ??
      Math.max(0, Number(baseState?.currentWorldDays) || clock.worldDays);
    const routed = normalizeRoutedFacts(baseState, routingResult, currentStat, currentTurnText);
    const transition = emptyTransition(currentWorldDays);
    transition.turn_facts = routed.facts;
    transition.scene_presence = routed.scenePresence;
    transition.operation_stats.warnings.push(...routed.warnings);
    transition.operation_stats.rejected += routed.rejected;

    for (const entity of routed.entities) {
      if (actorRecordByName(baseState?.actors, entity.name)) continue;
      transition.upsert_actors.push(
        actorInput({
          id: stableId('AC', entity.name),
          name: entity.name,
          location: entity.location || clock.location,
          goal: entity.apparentGoal || entity.publicRole,
          currentAction: entity.currentAction,
          nextDecision: entity.apparentGoal,
          updatedReason: '由本轮正文中有逐字证据的现场人物登记',
          causeType: 'observation',
          causeId: routed.facts.find(fact => actorListed(fact.witnesses, { name: entity.name }))?.id || 'CURRENT_SCENE',
          basisIds: routed.facts
            .filter(fact => actorListed(fact.witnesses, { name: entity.name }))
            .map(fact => fact.id),
          nextDueWorldDays: currentWorldDays,
        }),
      );
    }

    const stagedActors = [...asArray(baseState?.actors), ...transition.upsert_actors];
    for (const fact of routed.facts) {
      for (const witnessName of asArray(fact?.witnesses)) {
        const actor = actorRecordByName(stagedActors, witnessName);
        if (!actor) continue;
        transition.knowledge_updates.push({
          actorId: asText(actor?.id),
          actorName: actorDisplayName(actor),
          state: 'known',
          mode: 'grant',
          content: fact.content,
          replaces: '',
          sourceType: 'observation',
          sourceId: fact.id,
          sourceActorId: '',
          sourceActorName: '',
          confidence: 1,
        });
      }
    }

    const factsByAlias = new Map(
      routed.facts.flatMap(fact => [
        [comparableIdentity(fact.alias), fact],
        [comparableIdentity(fact.id), fact],
      ]),
    );
    for (const communication of asArray(routingResult?.communications)) {
      const referencedFacts = uniqueTextList(communication?.fact_refs || communication?.factRefs, 12, 100)
        .map(ref => factsByAlias.get(comparableIdentity(ref)))
        .filter(Boolean);
      if (!referencedFacts.length) continue;
      const sender = asText(communication?.sender).slice(0, 100);
      const recipients = uniqueTextList(communication?.recipients, 16, 100);
      const distanceBand = enumValue(
        communication?.distance_band || communication?.distanceBand,
        DISTANCE_BANDS,
        'same_city',
      );
      const channel = asText(communication?.channel).slice(0, 160);
      const suppliedEvidence = asText(communication?.evidence).slice(0, 800);
      const viewpointSender = sender.toUpperCase() === 'CURRENT_VIEWPOINT';
      const senderEvidence = viewpointSender
        ? ''
        : recoverNamedTurnEvidence(narrativeText, sender, {
            evidence: suppliedEvidence,
            content: suppliedEvidence,
            physical_result: channel,
          });
      const evidence =
        senderEvidence ||
        recoverTurnFactEvidence(narrativeText, {
          evidence: suppliedEvidence,
          content: [sender, ...recipients, communication?.origin, communication?.destination, communication?.channel]
            .filter(Boolean)
            .join(' '),
          physical_result: '消息已经发出',
        });
      const directSamePlaceSpeech =
        distanceBand === 'same_place' &&
        /口头|口信|言辞|言语|当面|对话|交谈|传告|转告|禀告|报告|告诫|提醒|教训|争吵|威胁|告知|告诉|喊话|face[_\s-]?to[_\s-]?face|spoken|speech|shout(?:ing)?|dialogue|conversation|oral|verbal|report|warning|threat/iu.test(
          channel,
        );
      const senderActor = actorRecordByName(stagedActors, sender);
      const senderAlreadyKnows = referencedFacts.every(
        fact =>
          senderActor &&
          (actorListed(fact.witnesses, senderActor) ||
            actorKnowsContent(senderActor, fact.content, asArray(baseState?.secrets))),
      );
      const senderKnows = viewpointSender || Boolean(senderEvidence) || senderAlreadyKnows;
      const communicationIsGrounded =
        Boolean(evidence) &&
        (directSamePlaceSpeech
          ? viewpointSender || Boolean(senderEvidence) || senderAlreadyKnows
          : explicitCommunicationEvidence(evidence));
      if (!communicationIsGrounded || !senderKnows) continue;
      const content = referencedFacts
        .map(fact => fact.content)
        .join('；')
        .slice(0, 600);
      if (senderActor && senderEvidence) {
        for (const fact of referencedFacts) {
          const alreadyGranted =
            actorListed(fact.witnesses, senderActor) ||
            actorKnowsContent(senderActor, fact.content, asArray(baseState?.secrets)) ||
            transition.knowledge_updates.some(
              update =>
                actorReferenceMatches(senderActor, update.actorId, update.actorName) &&
                knowledgeTextsRelated(update.content, fact.content),
            );
          if (alreadyGranted) continue;
          transition.knowledge_updates.push({
            actorId: asText(senderActor?.id),
            actorName: actorDisplayName(senderActor),
            state: 'known',
            mode: 'grant',
            content: fact.content,
            replaces: '',
            sourceType: 'observation',
            sourceId: fact.id,
            sourceActorId: asText(senderActor?.id),
            sourceActorName: actorDisplayName(senderActor),
            confidence: 1,
          });
        }
      }
      if (distanceBand === 'same_place') {
        for (const recipientName of recipients) {
          const recipient = actorRecordByName(stagedActors, recipientName);
          if (!recipient) continue;
          transition.knowledge_updates.push({
            actorId: asText(recipient?.id),
            actorName: actorDisplayName(recipient),
            state: 'known',
            mode: 'grant',
            content,
            replaces: '',
            sourceType: 'told_by_actor',
            sourceId: referencedFacts[0].id,
            sourceActorId: asText(senderActor?.id),
            sourceActorName: viewpointSender ? '玩家当前视角主体' : actorDisplayName(senderActor) || sender,
            confidence: 0.95,
          });
        }
        continue;
      }
      const transitDays = Math.max(1, minimumTransitDays(distanceBand, communication?.channel));
      const availableAfterWorldDays = currentWorldDays + transitDays;
      transition.upsert_intel.push(
        intelInput({
          id: stableId('IN', Number(baseState?.revision || 0) + 1, sender, content),
          content,
          origin: communication?.origin || senderActor?.location || clock.location,
          destination: communication?.destination || recipients.join('、') || '去向未明',
          channel: communication?.channel || '口信',
          status: 'in_transit',
          eta: `最早于世界天数 ${availableAfterWorldDays} 抵达`,
          reliability: 0.9,
          knownBy: [sender],
          sourceFactIds: referencedFacts.map(fact => fact.id),
          targetGroups: communication?.target_groups || communication?.targetGroups,
          visibility: communication?.visibility || 'restricted',
          sourceType: viewpointSender ? 'current_turn_witness' : 'actor_knowledge',
          sourceId: viewpointSender ? referencedFacts[0].id : asText(senderActor?.id),
          sourceActor: viewpointSender ? '玩家当前视角主体' : sender,
          distanceBand,
          departedWorldDays: currentWorldDays,
          availableAfterWorldDays,
        }),
      );
    }

    for (const intel of asArray(baseState?.intelPackets)) {
      const availableAfter = optionalFiniteNumber(intel?.availableAfterWorldDays ?? intel?.available_after_world_days);
      if (
        normalizeIntelStatus(intel?.status) === 'in_transit' &&
        availableAfter != null &&
        currentWorldDays >= availableAfter
      ) {
        transition.upsert_intel.push(intelInput({ ...intel, status: 'arrived' }, intel.id));
      }
    }

    transition.operation_stats.accepted =
      transition.turn_facts.length +
      transition.upsert_actors.length +
      transition.upsert_intel.length +
      transition.knowledge_updates.length;
    return transition;
  }

  function actorGroupsMatchFact(actor, fact) {
    const targets = uniqueTextList(fact?.targetGroups || fact?.target_groups, 16, 100).map(comparableIdentity);
    if (!targets.length) return true;
    const groups = uniqueTextList(actor?.groups || actor?.affiliations || actor?.factions, 16, 100).map(
      comparableIdentity,
    );
    return targets.some(target => groups.some(group => identityLabelsOverlap(target, group)));
  }

  function actorCanReadFact(actor, fact) {
    if (!actor || !fact) return false;
    if (actorListed(fact?.witnesses, actor)) return true;
    if (
      asArray(fact?.discoveredBy).some(item =>
        actorReferenceMatches(actor, item?.actorId || item?.actor_id, item?.actorName || item?.actor_name),
      )
    ) {
      return true;
    }
    return Boolean(
      fact.visibility === 'local_public' &&
      locationsOverlap(actor?.location, fact?.location) &&
      actorGroupsMatchFact(actor, fact),
    );
  }

  function actorIsolationKnowledge(state, actor) {
    const facts = asArray(state?.turnFacts)
      .filter(fact => actorCanReadFact(actor, fact))
      .slice(-12);
    const arrivedIntel = asArray(state?.intelPackets)
      .filter(item => intelAllowsActor(item, actor, state?.currentWorldDays))
      .slice(-8);
    const ledger = normalizeKnowledgeLedger(actor?.knowledgeLedger, actor?.id)
      .filter(item => ['known', 'suspected', 'believed'].includes(item.state))
      .slice(-16);
    const relatedEvents = asArray(state?.activeEvents)
      .filter(event => actorListed(event?.actors, actor))
      .slice(-6);
    const allowedSourceIds = uniqueTextList(
      [
        actor?.id,
        ...facts.map(item => item.id),
        ...ledger.map(item => item.id),
        ...arrivedIntel.map(item => item.id),
        ...relatedEvents.map(item => item.id),
      ],
      48,
      100,
    );
    return { facts, arrivedIntel, ledger, relatedEvents, allowedSourceIds };
  }

  function buildIsolationJobs(state, routedFactIds = []) {
    const routed = new Set(asArray(routedFactIds).map(String));
    const visibleActors = uniqueTextList(state?.scenePresence?.actors, 32, 100);
    const actorIsOnStage = actor => actorListed(visibleActors, actor);
    const actorJobs = asArray(state?.actors)
      .filter(actor => !actorIsOnStage(actor))
      .map(actor => {
        const knowledge = actorIsolationKnowledge(state, actor);
        const hasFreshFact = knowledge.facts.some(fact => routed.has(String(fact.id)));
        const dueAt = optionalFiniteNumber(actor?.nextDueWorldDays ?? actor?.next_due_world_days);
        return {
          type: 'actor',
          id: asText(actor?.id),
          label: actorDisplayName(actor),
          record: actor,
          knowledge,
          priority: hasFreshFact ? 0 : dueAt != null && dueAt <= Number(state?.currentWorldDays || 0) ? 1 : 3,
          allowedSceneActors: [actorDisplayName(actor)],
          allowedCreateCollections: ['events', 'intel', 'hooks'],
        };
      });
    const eventJobs = asArray(state?.activeEvents)
      .filter(event => {
        const participants = uniqueTextList(event?.actors, 24, 100);
        return !participants.some(name =>
          visibleActors.some(visible => comparableIdentity(visible) === comparableIdentity(name)),
        );
      })
      .map(event => ({
        type: 'event',
        id: asText(event?.id),
        label: asText(event?.title),
        record: event,
        knowledge: { facts: [], arrivedIntel: [], ledger: [], relatedEvents: [], allowedSourceIds: [event?.id] },
        priority: 4,
        allowedSceneActors: uniqueTextList(event?.actors, 12, 100),
        allowedCreateCollections: ['hooks'],
      }));
    const hookJobs = asArray(state?.hooks).map(hook => ({
      type: 'hook',
      id: asText(hook?.id),
      label: asText(hook?.title),
      record: hook,
      knowledge: { facts: [], arrivedIntel: [], ledger: [], relatedEvents: [], allowedSourceIds: [hook?.id] },
      priority: 5,
      allowedSceneActors: [],
      allowedCreateCollections: [],
    }));
    return [...actorJobs, ...eventJobs, ...hookJobs].filter(job => job.id && job.label);
  }

  function selectIsolationJob(state, routedFactIds = []) {
    const jobs = buildIsolationJobs(state, routedFactIds);
    if (!jobs.length) return null;
    const bestPriority = Math.min(...jobs.map(job => job.priority));
    const eligible = jobs
      .filter(job => job.priority === bestPriority)
      .sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`, 'zh-CN'));
    const cursor = Math.max(0, Number(state?.isolationCursor) || 0);
    return eligible[cursor % eligible.length];
  }

  function isolatedSystemPrompt(job) {
    const actorRule =
      job?.type === 'actor'
        ? `本轮只允许推进人物「${job.label}」。不得替其他具名人物作决定，也不得假定其他人物知道本任务未提供的信息。`
        : job?.type === 'event'
          ? `本轮只允许推进事件「${job.label}」的既有客观进程。不得生成未由事件记录支持的人物认知变化。`
          : `本轮只允许推进伏线「${job?.label || ''}」的条件状态。`;
    return `你是《残明余烬》的隔离世界模拟器。程序已经替你完成事实分流；你只会看到当前任务合法可用的信息。

${actorRule}

硬边界：
1. ISOLATED_CONTEXT 是本任务的全部可知范围。没有出现的事实、正文、秘密、世界书内容和其他人物状态一律不可使用、不可猜测。
2. 只提交相对于当前记录真正发生的少量增量；可以返回空 changes 和空 scenes。
3. merge/delete 只能使用 LICENSE.existingTarget；create 只能使用 LICENSE.allowedCreateCollections。
4. causeId、basisIds、sourceFactIds 只能逐字选择 LICENSE.allowedSourceIds。
5. 新建消息表示刚刚发出，status 必须为 in_transit；不得声称接收者已经收到。
6. scenes 只能展示本任务变化的过程或直接结果，出场人物只能来自 LICENSE.allowedSceneActors。
7. 人物只能在自身 location 直接行动。异地消息只能引发本地决策、出发、命令或新的在途通信，不能让远方结果立刻发生。
8. 不得输出检查过程，不得复述输入，也不得生成玩家当前视角正文。

只返回符合 JSON Schema 的对象。`;
  }

  function buildIsolatedPayload(state, job) {
    const knowledge = job?.knowledge || {};
    const actor =
      job?.type === 'actor'
        ? {
            id: job.record.id,
            name: job.record.name,
            location: job.record.location,
            groups: uniqueTextList(job.record.groups, 16, 100),
            goal: job.record.goal,
            currentAction: job.record.currentAction,
            nextDecision: job.record.nextDecision,
            knownClaims: asArray(knowledge.ledger).map(item => ({
              id: item.id,
              state: item.state,
              content: item.content,
              sourceId: item.sourceId,
            })),
          }
        : null;
    return {
      schema_version: 3,
      base_revision: Number(state?.revision) || 0,
      clock: { currentWorldDays: Number(state?.currentWorldDays) || 0 },
      job: {
        type: job.type,
        id: job.id,
        label: job.label,
        record:
          job.type === 'actor'
            ? actor
            : projectPromptRecord(
                job.record,
                job.type === 'event'
                  ? ['id', 'title', 'stage', 'status', 'location', 'actors', 'summary', 'nextTrigger', 'impactDomains']
                  : ['id', 'title', 'stage', 'summary', 'visibleSigns', 'trigger', 'failCondition'],
              ),
      },
      authorizedFacts: asArray(knowledge.facts).map(fact => ({
        id: fact.id,
        content: fact.content,
        physicalResult: fact.physicalResult,
        location: fact.location,
        visibility: fact.visibility,
      })),
      arrivedMessages: asArray(knowledge.arrivedIntel).map(item => ({
        id: item.id,
        content: item.content,
        origin: item.origin,
        destination: item.destination,
        channel: item.channel,
        reliability: item.reliability,
        sourceActor: item.sourceActor || item.source_actor,
        distanceBand: item.distanceBand || item.distance_band,
        targetGroups: uniqueTextList(item.targetGroups || item.target_groups, 16, 100),
        departedWorldDays: optionalFiniteNumber(item.departedWorldDays ?? item.departed_world_days),
        availableAfterWorldDays: optionalFiniteNumber(item.availableAfterWorldDays ?? item.available_after_world_days),
      })),
      relatedEvents: asArray(knowledge.relatedEvents).map(item =>
        projectPromptRecord(item, ['id', 'title', 'stage', 'location', 'summary', 'nextTrigger']),
      ),
      LICENSE: {
        existingTarget: { collection: `${job.type}s`, id: job.id },
        allowedCreateCollections: job.allowedCreateCollections,
        allowedSourceIds: knowledge.allowedSourceIds,
        allowedSceneActors: job.allowedSceneActors,
      },
    };
  }

  function isolatedWorldChangeOutputSchema(job) {
    const text = { type: 'string', minLength: 1 };
    const objectValue = { type: 'object', additionalProperties: true };
    const collectionByJob = { actor: 'actors', event: 'events', hook: 'hooks' };
    const existingCollection = collectionByJob[job?.type] || 'actors';
    const variants = [
      {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'target', 'changes'],
        properties: {
          op: { type: 'string', enum: ['merge'] },
          target: {
            type: 'object',
            additionalProperties: false,
            required: ['collection', 'id'],
            properties: {
              collection: { type: 'string', enum: [existingCollection] },
              id: { type: 'string', enum: [job.id] },
            },
          },
          changes: objectValue,
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'target'],
        properties: {
          op: { type: 'string', enum: ['delete'] },
          target: {
            type: 'object',
            additionalProperties: false,
            required: ['collection', 'id'],
            properties: {
              collection: { type: 'string', enum: [existingCollection] },
              id: { type: 'string', enum: [job.id] },
            },
          },
        },
      },
    ];
    for (const collection of asArray(job?.allowedCreateCollections)) {
      variants.push({
        type: 'object',
        additionalProperties: false,
        required: ['op', 'target', 'value'],
        properties: {
          op: { type: 'string', enum: ['create'] },
          target: {
            type: 'object',
            additionalProperties: false,
            required: ['collection', 'id'],
            properties: {
              collection: { type: 'string', enum: [collection] },
              id: text,
            },
          },
          value: objectValue,
        },
      });
    }
    return {
      name: 'cmyj_isolated_world_changes_v1',
      strict: false,
      value: {
        type: 'object',
        additionalProperties: false,
        required: ['schema_version', 'base_revision', 'changes', 'scenes'],
        properties: {
          schema_version: { type: 'integer', enum: [3] },
          base_revision: { type: 'integer', minimum: 0 },
          changes: {
            type: 'array',
            maxItems: 8,
            items: { anyOf: variants },
          },
          scenes: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['based_on', 'location', 'time', 'actors', 'action', 'body'],
              properties: {
                based_on: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 8,
                  items: { type: 'integer', minimum: 0 },
                },
                location: { type: 'string' },
                time: { type: 'string' },
                actors: {
                  type: 'array',
                  maxItems: 12,
                  items: job.allowedSceneActors.length
                    ? { type: 'string', enum: job.allowedSceneActors }
                    : { type: 'string', enum: [''] },
                },
                action: { type: 'string' },
                body: text,
              },
            },
          },
        },
      },
    };
  }

  const V3_CHANGE_FIELDS = Object.freeze({
    events: new Set([
      'title',
      'stage',
      'status',
      'location',
      'actors',
      'summary',
      'nextTrigger',
      'impactDomains',
      'sourceFactIds',
    ]),
    actors: new Set([
      'name',
      'location',
      'groups',
      'goal',
      'currentAction',
      'knowledge',
      'doesNotKnow',
      'nextDecision',
      'updatedReason',
      'causeType',
      'causeId',
      'basisIds',
      'nextDueWorldDays',
    ]),
    intel: new Set([
      'content',
      'origin',
      'destination',
      'channel',
      'status',
      'eta',
      'reliability',
      'knownBy',
      'targetGroups',
      'visibility',
      'sourceType',
      'sourceId',
      'sourceActor',
      'sourceFactIds',
      'distanceBand',
      'departedWorldDays',
      'availableAfterWorldDays',
    ]),
    hooks: new Set(['title', 'stage', 'summary', 'visibleSigns', 'trigger', 'failCondition', 'sourceFactIds']),
  });

  function normalizeIsolatedChangePayload(collection, rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return {};
    const payload = { ...rawPayload };
    const basisIds = uniqueTextList(
      [
        payload?.causeId,
        payload?.cause_id,
        ...asArray(payload?.basisIds || payload?.basis_ids),
        ...asArray(payload?.sourceFactIds || payload?.source_fact_ids),
      ],
      20,
      100,
    );
    if (collection === 'events') {
      payload.title ||= firstOperationText(payload.label, payload.name);
      payload.summary ||= firstOperationText(payload.description, payload.body);
      payload.nextTrigger ||= firstOperationText(payload.next_trigger, payload.trigger);
      if (!asArray(payload.sourceFactIds).length && basisIds.length) payload.sourceFactIds = basisIds;
    } else if (collection === 'actors') {
      payload.name ||= asText(payload.label);
      payload.currentAction ||= firstOperationText(payload.current_action, payload.action);
      payload.nextDecision ||= firstOperationText(payload.next_decision, payload.nextAction);
      payload.updatedReason ||= firstOperationText(payload.updated_reason, payload.reason, payload.description);
      payload.causeType ||= asText(payload.cause_type);
      payload.causeId ||= asText(payload.cause_id);
      if (!asArray(payload.basisIds).length && basisIds.length) payload.basisIds = basisIds;
    } else if (collection === 'intel') {
      payload.content ||= firstOperationText(payload.description, payload.summary, payload.message);
      payload.sourceFactIds ||= payload.source_fact_ids;
      payload.targetGroups ||= payload.target_groups;
      payload.knownBy ||= payload.known_by;
      payload.distanceBand ||= payload.distance_band;
      payload.sourceType ||= payload.source_type;
      payload.sourceId ||= payload.source_id;
      payload.sourceActor ||= payload.source_actor;
      payload.departedWorldDays ??= payload.departed_world_days;
      payload.availableAfterWorldDays ??= payload.available_after_world_days;
    } else if (collection === 'hooks') {
      payload.title ||= firstOperationText(payload.label, payload.name);
      payload.summary ||= firstOperationText(payload.description, payload.body);
      payload.visibleSigns ||= payload.visible_signs;
      payload.failCondition ||= payload.fail_condition;
      if (!asArray(payload.sourceFactIds).length && basisIds.length) payload.sourceFactIds = basisIds;
    }
    const fields = V3_CHANGE_FIELDS[collection];
    if (!fields) return {};
    return Object.fromEntries(Object.entries(payload).filter(([key, value]) => fields.has(key) && value != null));
  }

  function sanitizeIsolatedResult(result, job, baseState) {
    const normalized = normalizeWorldChangeResult(result);
    const collectionByJob = { actor: 'actors', event: 'events', hook: 'hooks' };
    const existingCollection = collectionByJob[job?.type] || '';
    const allowedCreates = new Set(asArray(job?.allowedCreateCollections));
    const allowedSourceIds = new Set(asArray(job?.knowledge?.allowedSourceIds).map(String));
    const allowedSceneActors = new Set(asArray(job?.allowedSceneActors).map(comparableIdentity));
    const changes = [];
    const sourceIndexes = new Map();
    asArray(normalized.changes).forEach((change, sourceIndex) => {
      const op = asText(change?.op);
      const collection = asText(change?.target?.collection);
      const id = asText(change?.target?.id);
      let accepted = false;
      let next = change;
      const rawPayload = op === 'create' ? change?.value : change?.changes;
      const sourceReferences = uniqueTextList(
        [
          rawPayload?.causeId,
          rawPayload?.cause_id,
          rawPayload?.sourceId,
          rawPayload?.source_id,
          ...asArray(rawPayload?.basisIds || rawPayload?.basis_ids),
          ...asArray(rawPayload?.sourceFactIds || rawPayload?.source_fact_ids),
        ],
        48,
        100,
      );
      if (sourceReferences.some(reference => !allowedSourceIds.has(String(reference)))) return;
      const payload = normalizeIsolatedChangePayload(collection, rawPayload);
      if (['merge', 'delete'].includes(op) && collection === existingCollection && String(id) === String(job?.id)) {
        if (op === 'merge') {
          next = { ...change, changes: { ...payload } };
          if (
            job?.type === 'actor' &&
            asText(payload?.location) &&
            !locationsOverlap(payload.location, job?.record?.location)
          ) {
            delete next.changes.location;
          }
          if (!Object.keys(next.changes).length) return;
        }
        accepted = true;
      } else if (op === 'create' && allowedCreates.has(collection)) {
        if (
          collection === 'events' &&
          job?.type === 'actor' &&
          asText(payload?.location) &&
          !locationsOverlap(payload.location, job?.record?.location)
        ) {
          return;
        }
        const createPayload = payload;
        if (!Object.keys(createPayload).length) return;
        const identity = firstOperationText(payload?.name, payload?.title, payload?.content, id, collection);
        next = {
          ...change,
          target: {
            ...change.target,
            id: stableId(
              collection === 'events' ? 'EV' : collection === 'intel' ? 'IN' : 'HK',
              Number(baseState?.revision || 0) + 1,
              job?.id,
              identity,
              sourceIndex,
            ),
          },
          value: createPayload,
        };
        accepted = true;
      }
      if (!accepted) return;
      sourceIndexes.set(sourceIndex, changes.length);
      changes.push(next);
    });
    const scenes = asArray(normalized.scenes)
      .map(scene => {
        const references = asArray(scene?.based_on);
        if (!references.length || references.some(index => !sourceIndexes.has(index))) return null;
        const actors = uniqueTextList(scene?.actors, 12, 100);
        if (
          ['actor', 'event'].includes(job?.type) &&
          asText(job?.record?.location) &&
          !locationsOverlap(scene?.location, job.record.location)
        ) {
          return null;
        }
        if (actors.some(actor => !allowedSceneActors.size || !allowedSceneActors.has(comparableIdentity(actor)))) {
          return null;
        }
        return { ...scene, based_on: references.map(index => sourceIndexes.get(index)) };
      })
      .filter(Boolean)
      .slice(0, 2);
    return { ...normalized, changes, scenes };
  }

  const ACTOR_CAUSE_TYPES = new Set([
    'autonomous',
    'observation',
    'knowledge',
    'received_intel',
    'event',
    'elapsed_time',
  ]);

  function acceptedKnowledgeFromFact(transition, actor, fact) {
    return asArray(transition?.knowledge_updates).some(
      update =>
        actorReferenceMatches(actor, update?.actorId, update?.actorName) &&
        (String(update?.sourceId) === String(fact?.id) ||
          comparableIdentity(update?.sourceId) === comparableIdentity(fact?.alias)) &&
        ['known', 'suspected', 'believed'].includes(asText(update?.state)),
    );
  }

  function validateActorCause(baseState, transition, actor, existing, currentTurnText, context = {}) {
    const causeType = asText(actor?.cause_type || actor?.causeType).toLowerCase();
    const causeId = asText(actor?.cause_id || actor?.causeId);
    const actionText = [actor?.current_action, actor?.updated_reason, actor?.next_decision].map(asText).join(' ');
    const relatedTurnFacts = asArray(transition?.turn_facts).filter(fact =>
      knowledgeTextsRelated(turnFactText(fact), actionText),
    );
    if (!causeType || !causeId) {
      if (context?.requireExplicitCause && textsStronglyRelated(actionText, currentTurnText)) {
        return '人物行动与本轮正文直接相关，但缺少可核对的 causeType/causeId';
      }
      if (relatedTurnFacts.length) {
        return `人物行动涉及本轮事实 ${relatedTurnFacts.map(fact => fact.alias || fact.id).join('、')}，但缺少 cause_type/cause_id`;
      }
      if (!existing && textsStronglyRelated(actionText, currentTurnText)) {
        return '新增人物行动与本轮正文直接相关，但没有可核对的因果依据';
      }
      if (
        existing &&
        textsStronglyRelated(actionText, currentTurnText) &&
        !asText(currentTurnText).includes(actorDisplayName(actor))
      ) {
        return '人物行动与本轮正文直接相关，但人物未在正文中出现且没有可核对的因果依据';
      }
      actor.cause_type = existing ? 'autonomous' : 'elapsed_time';
      actor.cause_id = asText(existing?.id || actor?.id || 'ELAPSED_TIME');
      actor.basis_ids = uniqueTextList(actor?.basis_ids, 16, 100);
      return '';
    }
    if (!ACTOR_CAUSE_TYPES.has(causeType)) return `不支持的人物行动原因 ${causeType}`;

    if (causeType === 'observation') {
      if (causeId.toUpperCase() === 'CURRENT_TURN') {
        const allowedWitnesses = uniqueTextList(context?.sceneEvidence?.reliableWitnesses, 24, 100);
        if (!allowedWitnesses.some(name => actorMatchesName(actor, name))) {
          return `人物 ${actorDisplayName(actor)} 不在本轮现场知情白名单中`;
        }
        actor.cause_id = 'CURRENT_TURN';
        actor.basis_ids = uniqueTextList([...asArray(actor?.basis_ids), 'CURRENT_TURN'], 16, 100);
        return textsStronglyRelated(actionText, currentTurnText) ||
          asText(currentTurnText).includes(actorDisplayName(actor))
          ? ''
          : '人物行动与本轮现场观察不一致';
      }
      const fact = findTurnFact(baseState, transition, causeId);
      if (!fact) return `人物观察来源 ${causeId} 不存在`;
      if (!actorAuthorizedForTurnFact(actor, fact)) {
        return `人物 ${actorDisplayName(actor)} 不是本轮事实 ${fact.alias || fact.id} 的合法目击者`;
      }
      actor.cause_id = fact.id;
      actor.basis_ids = uniqueTextList(
        [...asArray(actor?.basis_ids).filter(id => comparableIdentity(id) !== comparableIdentity(causeId)), fact.id],
        16,
        100,
      );
      return knowledgeTextsRelated(turnFactText(fact), actionText) ? '' : '人物行动与所引用的目击事实不一致';
    }

    if (causeType === 'knowledge') {
      const ledger = normalizeKnowledgeLedger(existing?.knowledgeLedger || actor?.knowledge_ledger, actor?.id);
      const entry = ledger.find(item => String(item?.id) === causeId);
      const accepted = asArray(transition?.knowledge_updates).find(
        item =>
          actorReferenceMatches(actor, item?.actorId, item?.actorName) &&
          (String(item?.sourceId) === causeId || String(item?.id) === causeId),
      );
      const content = asText(entry?.content || accepted?.content);
      if (!content) return `人物已知依据 ${causeId} 不存在`;
      return knowledgeTextsRelated(content, actionText) ? '' : '人物行动与已知依据不一致';
    }

    if (causeType === 'received_intel') {
      const intel = stagedRecordById(baseState, transition, causeId, 'intelPackets', 'upsert_intel');
      if (!intel) return `人物情报依据 ${causeId} 不存在`;
      if (!intelHasArrived(intel, context?.currentWorldDays)) return `人物情报依据 ${causeId} 尚未抵达`;
      if (!intelAllowsActor(intel, actor, context?.currentWorldDays)) {
        return `情报 ${causeId} 未送达 ${actorDisplayName(actor)}`;
      }
      return knowledgeTextsRelated(intel?.content, actionText) ? '' : '人物行动与收到的情报不一致';
    }

    if (causeType === 'event') {
      const event = stagedRecordById(baseState, transition, causeId, 'activeEvents', 'upsert_events');
      if (!event) return `人物事件依据 ${causeId} 不存在`;
      if (!actorListed(recordActors(event), actor)) return `人物 ${actorDisplayName(actor)} 不在事件 ${causeId} 中`;
      return knowledgeTextsRelated(`${event?.title} ${event?.summary}`, actionText) ? '' : '人物行动与事件依据不一致';
    }

    if (findTurnFact(baseState, transition, causeId)) {
      return `${causeType} 不能直接引用本轮事实 ${causeId}`;
    }
    const unauthorized = relatedTurnFacts.filter(fact => !actorAuthorizedForTurnFact(actor, fact));
    if (unauthorized.length) {
      return `人物 ${actorDisplayName(actor)} 未获知本轮事实 ${unauthorized.map(fact => fact.alias || fact.id).join('、')}，不能据此行动`;
    }
    if (!existing && causeType === 'autonomous' && textsStronglyRelated(actionText, currentTurnText)) {
      return '新增人物不能用 autonomous 绕过本轮正文的知识边界';
    }
    if (
      context?.requireExplicitCause &&
      ['autonomous', 'elapsed_time'].includes(causeType) &&
      textsStronglyRelated(actionText, currentTurnText)
    ) {
      return `${causeType} 不能用于回应本轮正文；必须提供现场观察或已抵达消息`;
    }
    return '';
  }

  function validateRecordFactCausality(baseState, transition, type, record) {
    if (!['event.upsert', 'event.patch', 'intel.upsert', 'intel.patch', 'hook.upsert', 'hook.patch'].includes(type)) {
      return '';
    }
    const recordText = type.startsWith('event.')
      ? `${asText(record?.title)} ${asText(record?.summary)}`
      : type.startsWith('intel.')
        ? asText(record?.content)
        : `${asText(record?.title)} ${asText(record?.summary)} ${asArray(record?.visible_signs).join(' ')}`;
    const relatedFacts = asArray(transition?.turn_facts).filter(fact =>
      textsStronglyRelated(turnFactText(fact), recordText),
    );
    const sourceFactIds = uniqueTextList(record?.source_fact_ids || record?.sourceFactIds, 16, 100);
    const declaredFacts = sourceFactIds.map(id => findTurnFact(baseState, transition, id)).filter(Boolean);
    const boundFacts = [...declaredFacts, ...relatedFacts].filter(
      (fact, index, values) => values.findIndex(item => String(item?.id) === String(fact?.id)) === index,
    );
    record.source_fact_ids = boundFacts.map(fact => fact.id);
    if (type.startsWith('intel.') && boundFacts.length) {
      const origin = asText(record?.origin);
      for (const fact of boundFacts) {
        const witnessAuthorized = asArray(fact?.witnesses).some(
          witness =>
            comparableIdentity(witness) === comparableIdentity(origin) ||
            (witness.length >= 2 && origin.includes(witness)),
        );
        const publicCollectiveOrigin =
          asText(fact?.visibility) === 'local_public' &&
          /(?:传闻|邻里|街坊|坊间|市井|百姓|人群|众人|商户|伙计|客商|香客|乡民|村民|居民|告示|官差|衙门|公议|口耳)/u.test(
            origin,
          );
        const originAuthorized = witnessAuthorized || publicCollectiveOrigin;
        if (!originAuthorized) {
          return `情报起点 ${origin || '未明'} 不是本轮事实 ${fact.alias || fact.id} 的合法知情者`;
        }
      }
    }
    return '';
  }

  function validateEventFactAuthorization(baseState, transition, event, actor, content) {
    const sourceFacts = uniqueTextList(event?.source_fact_ids || event?.sourceFactIds, 16, 100)
      .map(id => findTurnFact(baseState, transition, id))
      .filter(Boolean)
      .filter(fact => knowledgeTextsRelated(turnFactText(fact), content));
    const unauthorized = sourceFacts.find(fact => !actorAuthorizedForTurnFact(actor, fact));
    return unauthorized
      ? `人物 ${actorDisplayName(actor)} 虽列在事件中，但不是来源事实 ${unauthorized.alias || unauthorized.id} 的目击者`
      : '';
  }

  function validateKnowledgeSource(baseState, transition, result, value, actor, operationType = '') {
    const sourceType = asText(value?.source_type || value?.sourceType).toLowerCase();
    const sourceId = asText(value?.source_id || value?.sourceId);
    const content = asText(value?.content);
    if (!KNOWLEDGE_SOURCE_TYPES.has(sourceType)) return `不支持的知识来源 ${sourceType || '空'}`;
    if (!sourceId) return '缺少知识来源 source_id';

    const currentTurnSource = sourceId.toUpperCase() === 'CURRENT_TURN';
    if (currentTurnSource) return 'CURRENT_TURN 不再直接授予人物知识；请引用已校验的 TF-* 本轮事实';
    const turnFact = findTurnFact(baseState, transition, sourceId);
    const event = stagedRecordById(baseState, transition, sourceId, 'activeEvents', 'upsert_events');
    const intel = stagedRecordById(baseState, transition, sourceId, 'intelPackets', 'upsert_intel');
    const parallelScene = referencedParallelScene(result, sourceId);

    if (sourceType === 'direct_observation') {
      if (
        turnFact &&
        actorAuthorizedForTurnFact(actor, turnFact) &&
        knowledgeTextsRelated(turnFactText(turnFact), content)
      ) {
        return '';
      }
      if (
        event &&
        actorListed(recordActors(event), actor) &&
        knowledgeTextsRelated(`${asText(event?.title)} ${asText(event?.summary)}`, content)
      ) {
        return validateEventFactAuthorization(baseState, transition, event, actor, content);
      }
      if (
        parallelScene &&
        actorListed(parallelScene?.actors, actor) &&
        (knowledgeTextsRelated(parallelScene?.body, content) || knowledgeTextsRelated(parallelScene?.action, content))
      ) {
        return '';
      }
      return '直接观察缺少在场人物或可核对场景';
    }

    if (sourceType === 'witnessed_event') {
      if (turnFact) {
        if (!actorAuthorizedForTurnFact(actor, turnFact)) {
          return `人物 ${actorDisplayName(actor)} 不在本轮事实 ${turnFact.alias || turnFact.id} 的目击者中`;
        }
        return knowledgeTextsRelated(turnFactText(turnFact), content)
          ? ''
          : `知识内容与本轮事实 ${turnFact.alias || turnFact.id} 不一致`;
      }
      if (!event) return `目击事件 ${sourceId} 不存在`;
      if (!actorListed(recordActors(event), actor)) return `人物 ${actorDisplayName(actor)} 不在事件参与者中`;
      if (!knowledgeTextsRelated(`${asText(event?.title)} ${asText(event?.summary)}`, content)) {
        return `知识内容与事件 ${sourceId} 不一致`;
      }
      return validateEventFactAuthorization(baseState, transition, event, actor, content);
    }

    if (sourceType === 'received_intel') {
      if (!intel) return `情报来源 ${sourceId} 不存在`;
      if (!intelHasArrived(intel)) return `情报 ${sourceId} 尚未抵达`;
      if (
        ['knowledge.grant', 'knowledge.correct', 'secret.reveal'].includes(operationType) &&
        Number(intel?.reliability) < 0.6
      ) {
        return `情报 ${sourceId} 可靠度不足，不能登记为确定知识`;
      }
      const recipients = operationTextArray(intel?.known_by || intel?.knownBy);
      const destination = asText(intel?.destination);
      if (!actorListed(recipients, actor) && !destination.includes(actorDisplayName(actor))) {
        return `情报 ${sourceId} 未送达 ${actorDisplayName(actor)}`;
      }
      return knowledgeTextsRelated(intel?.content, content) ? '' : `知识内容与情报 ${sourceId} 不一致`;
    }

    if (sourceType === 'told_by_actor') {
      const explicitSourceActorId = asText(value?.source_actor_id || value?.sourceActorId);
      const explicitSourceActorName = asText(value?.source_actor_name || value?.sourceActorName);
      const sourceActorResult = findKnowledgeActor(
        baseState,
        transition,
        {
          actor_id: explicitSourceActorId || (turnFact || event ? '' : sourceId),
          actor_name: explicitSourceActorName,
        },
        '告知者',
      );
      if (sourceActorResult.error) return sourceActorResult.error;
      const secrets = [...asArray(baseState?.secrets), ...asArray(transition?.upsert_secrets)];
      const sourceMustKnow = ['knowledge.grant', 'knowledge.correct', 'secret.reveal'].includes(operationType);
      if (sourceMustKnow && !actorKnowsContent(sourceActorResult.actor, content, secrets)) {
        return `告知者 ${actorDisplayName(sourceActorResult.actor)} 本身没有该知识`;
      }
      if (
        turnFact &&
        actorAuthorizedForTurnFact(actor, turnFact) &&
        actorAuthorizedForTurnFact(sourceActorResult.actor, turnFact) &&
        knowledgeTextsRelated(turnFactText(turnFact), content)
      ) {
        return '';
      }
      if (
        event &&
        actorListed(recordActors(event), actor) &&
        actorListed(recordActors(event), sourceActorResult.actor) &&
        knowledgeTextsRelated(`${asText(event?.title)} ${asText(event?.summary)}`, content)
      ) {
        return (
          validateEventFactAuthorization(baseState, transition, event, actor, content) ||
          validateEventFactAuthorization(baseState, transition, event, sourceActorResult.actor, content)
        );
      }
      if (
        parallelScene &&
        actorListed(parallelScene?.actors, actor) &&
        actorListed(parallelScene?.actors, sourceActorResult.actor) &&
        (knowledgeTextsRelated(parallelScene?.body, content) || knowledgeTextsRelated(parallelScene?.action, content))
      ) {
        return '';
      }
      return `没有证据表明 ${actorDisplayName(sourceActorResult.actor)} 已向 ${actorDisplayName(actor)} 传达该知识`;
    }

    if (sourceType === 'public_information') {
      if (
        turnFact &&
        turnFact.visibility === 'local_public' &&
        actorAuthorizedForTurnFact(actor, turnFact) &&
        knowledgeTextsRelated(turnFactText(turnFact), content)
      ) {
        return '';
      }
      if (intel && intelHasArrived(intel) && intelIsPublic(intel))
        return knowledgeTextsRelated(intel?.content, content) ? '' : '公开情报内容不符';
      return `公开信息来源 ${sourceId} 不存在或尚未公开`;
    }

    if (sourceType === 'correction') {
      if (
        turnFact &&
        actorAuthorizedForTurnFact(actor, turnFact) &&
        knowledgeTextsRelated(turnFactText(turnFact), content)
      ) {
        return '';
      }
      if (intel && intelHasArrived(intel) && knowledgeTextsRelated(intel?.content, content)) {
        const recipients = operationTextArray(intel?.known_by || intel?.knownBy);
        if (actorListed(recipients, actor) || asText(intel?.destination).includes(actorDisplayName(actor))) return '';
      }
      if (
        event &&
        actorListed(recordActors(event), actor) &&
        knowledgeTextsRelated(`${asText(event?.title)} ${asText(event?.summary)}`, content)
      ) {
        return validateEventFactAuthorization(baseState, transition, event, actor, content);
      }
      return `纠正来源 ${sourceId} 无法核对`;
    }

    return '知识来源无法核对';
  }

  function normalizeKnowledgeUpdate(type, value, actor) {
    const content = asText(value?.content).slice(0, 360);
    const state = {
      'knowledge.grant': 'known',
      'knowledge.suspect': 'suspected',
      'knowledge.mislead': 'believed',
      'knowledge.correct': 'known',
    }[type];
    const confidence = clamp(value?.confidence, 0, 1);
    if (!content || !state) return null;
    if (state === 'known' && confidence < 0.6) return null;
    return {
      actorId: asText(actor?.id),
      actorName: actorDisplayName(actor),
      state,
      mode: type.split('.')[1],
      content,
      replaces: asText(value?.replaces).slice(0, 360),
      sourceType: asText(value?.source_type || value?.sourceType).toLowerCase(),
      sourceId: asText(value?.source_id || value?.sourceId),
      sourceActorId: asText(value?.source_actor_id || value?.sourceActorId),
      sourceActorName: asText(value?.source_actor_name || value?.sourceActorName),
      confidence,
    };
  }

  function validateSecretSource(baseState, transition, secret, trustExistingHolders = false) {
    const sourceType = asText(secret?.source_type || secret?.sourceType).toLowerCase();
    const sourceId = asText(secret?.source_id || secret?.sourceId);
    if (!SECRET_SOURCE_TYPES.has(sourceType)) return `不支持的秘密来源 ${sourceType || '空'}`;
    if (!sourceId) return '秘密缺少 source_id';
    const holders = uniqueTextList(secret?.holders, 30, 100);
    const holdersAppearIn = values =>
      holders.every(holder =>
        asArray(values).some(
          value => comparableIdentity(value) === comparableIdentity(holder) || asText(value).includes(holder),
        ),
      );
    if (sourceId.toUpperCase() === 'CURRENT_TURN') {
      return '秘密不能再引用 CURRENT_TURN；请引用已校验的 TF-* 本轮事实';
    }
    const turnFact = findTurnFact(baseState, transition, sourceId);
    if (turnFact) {
      if (!['direct_observation', 'witnessed_event', 'public_information', 'correction'].includes(sourceType)) {
        return `秘密来源类型 ${sourceType} 与本轮事实 ${turnFact.alias || turnFact.id} 不匹配`;
      }
      if (!knowledgeTextsRelated(turnFactText(turnFact), secret?.content)) {
        return `秘密内容与本轮事实 ${turnFact.alias || turnFact.id} 不一致`;
      }
      if (sourceType === 'public_information' && turnFact.visibility !== 'local_public') {
        return `本轮事实 ${turnFact.alias || turnFact.id} 不是本地公开信息`;
      }
      return trustExistingHolders || holdersAppearIn(turnFact.witnesses)
        ? ''
        : `秘密知情者不全在本轮事实 ${turnFact.alias || turnFact.id} 的合法目击者中`;
    }
    const event = stagedRecordById(baseState, transition, sourceId, 'activeEvents', 'upsert_events');
    if (event) {
      if (!['direct_observation', 'witnessed_event', 'correction'].includes(sourceType)) {
        return `秘密来源类型 ${sourceType} 与事件 ${sourceId} 不匹配`;
      }
      if (!knowledgeTextsRelated(`${asText(event?.title)} ${asText(event?.summary)}`, secret?.content)) {
        return `秘密内容与事件 ${sourceId} 不一致`;
      }
      return trustExistingHolders || holdersAppearIn(recordActors(event))
        ? ''
        : `秘密知情者不全在事件 ${sourceId} 的参与者中`;
    }
    const intel = stagedRecordById(baseState, transition, sourceId, 'intelPackets', 'upsert_intel');
    if (intel) {
      if (!['received_intel', 'public_information', 'correction'].includes(sourceType)) {
        return `秘密来源类型 ${sourceType} 与情报 ${sourceId} 不匹配`;
      }
      if (!intelHasArrived(intel)) return `秘密来源情报 ${sourceId} 尚未抵达`;
      if (Number(intel?.reliability) < 0.6) return `秘密来源情报 ${sourceId} 可靠度不足`;
      if (sourceType === 'public_information' && !intelIsPublic(intel)) {
        return `秘密来源情报 ${sourceId} 尚未公开`;
      }
      if (!knowledgeTextsRelated(intel?.content, secret?.content)) return `秘密内容与情报 ${sourceId} 不一致`;
      const recipients = [...operationTextArray(intel?.known_by || intel?.knownBy), asText(intel?.destination)];
      return trustExistingHolders || holdersAppearIn(recipients) ? '' : `秘密知情者不全在情报 ${sourceId} 的接收者中`;
    }
    return `秘密证据来源 ${sourceId} 不存在`;
  }

  function validateTraceDiscovery(baseState, transition, result, operation, actor) {
    const value = operation?.value && typeof operation.value === 'object' ? operation.value : {};
    const fact = findTurnFact(baseState, transition, operation?.id);
    if (!fact) return { error: `痕迹所属事实 ${asText(operation?.id) || '未指明'} 不存在` };
    const trace = asText(value?.trace).slice(0, 360);
    const conclusion = asText(value?.conclusion).slice(0, 360);
    const sourceType = asText(value?.source_type || value?.sourceType).toLowerCase();
    const sourceId = asText(value?.source_id || value?.sourceId);
    const observable = [asText(fact?.physicalResult), ...asArray(fact?.traces)].filter(Boolean).join(' ');
    if (!trace || !conclusion || !sourceId) return { error: '痕迹发现缺少 trace、conclusion 或 source_id' };
    if (!['direct_observation', 'witnessed_event'].includes(sourceType)) {
      return { error: `不支持的痕迹发现来源 ${sourceType || '空'}` };
    }
    if (!knowledgeTextsRelated(observable, trace)) return { error: '所报痕迹不在该事实的可发现结果中' };
    if (!knowledgeTextsRelated(observable, conclusion)) {
      return { error: '发现结论超出了物理结果或痕迹能够支持的范围' };
    }
    if (
      fact.visibility === 'private' &&
      textsStronglyRelated(fact.content, conclusion) &&
      !textsStronglyRelated(observable, conclusion)
    ) {
      return { error: '无人目击事实的发现者不能从痕迹直接推断隐藏行为或行为人' };
    }
    const scene = referencedParallelScene(result, sourceId);
    const event = stagedRecordById(baseState, transition, sourceId, 'activeEvents', 'upsert_events');
    if (scene) {
      if (!actorListed(scene?.actors, actor)) return { error: `人物 ${actorDisplayName(actor)} 不在发现痕迹的旁线中` };
      if (!knowledgeTextsRelated(`${scene?.action} ${scene?.body}`, trace)) {
        return { error: `旁线 ${sourceId} 没有实际发现所报痕迹` };
      }
    } else if (event) {
      if (!actorListed(recordActors(event), actor))
        return { error: `人物 ${actorDisplayName(actor)} 不在发现痕迹的事件中` };
      if (!knowledgeTextsRelated(`${event?.title} ${event?.summary}`, trace)) {
        return { error: `事件 ${sourceId} 没有实际发现所报痕迹` };
      }
    } else {
      return { error: `痕迹发现来源 ${sourceId} 不存在` };
    }
    const confidence = clamp(value?.confidence, 0, 1);
    return {
      update: {
        actorId: asText(actor?.id),
        actorName: actorDisplayName(actor),
        state: confidence >= 0.6 ? 'known' : 'suspected',
        mode: confidence >= 0.6 ? 'grant' : 'suspect',
        content: conclusion,
        replaces: '',
        sourceType,
        sourceId,
        sourceActorId: '',
        sourceActorName: '',
        confidence,
      },
      discovery: {
        factId: fact.id,
        actorId: asText(actor?.id),
        actorName: actorDisplayName(actor),
        trace,
        conclusion,
        sourceId,
      },
    };
  }

  function validateParallelScenes(baseState, transition) {
    const accepted = [];
    const acceptedSourceIndexes = new Set();
    const facts = [...asArray(transition?.turn_facts), ...asArray(baseState?.turnFacts)];
    const stagedActors = [...asArray(baseState?.actors), ...asArray(transition?.upsert_actors)];
    const validBasisIds = new Set(
      [
        ...facts.flatMap(fact => [fact?.id, fact?.alias]),
        ...stagedActors.map(item => item?.id),
        ...asArray(baseState?.activeEvents).map(item => item?.id),
        ...asArray(transition?.upsert_events).map(item => item?.id),
        ...asArray(baseState?.intelPackets).map(item => item?.id),
        ...asArray(transition?.upsert_intel).map(item => item?.id),
        ...asArray(baseState?.hooks).map(item => item?.id),
        ...asArray(transition?.upsert_hooks).map(item => item?.id),
      ]
        .map(value => asText(value))
        .filter(Boolean),
    );
    for (const [index, scene] of asArray(transition?.parallel_scenes).entries()) {
      const sourceIndex = index + 1;
      const sceneText = `${asText(scene?.action)} ${asText(scene?.body)}`;
      const basisIds = uniqueTextList(scene?.basis_ids || scene?.basisIds, 16, 100);
      const claimIds = uniqueTextList(scene?.knowledge_claim_ids || scene?.knowledgeClaimIds, 16, 100);
      const invalidBasis = basisIds.filter(id => !validBasisIds.has(id));
      if (invalidBasis.length) {
        transition.operation_stats.warnings.push(
          `parallel_scene ${sourceIndex}：无效因果依据 ${invalidBasis.join('、')}`.slice(0, 300),
        );
        transition.operation_stats.rejected += 1;
        continue;
      }
      const claimedFacts = claimIds.map(id => findTurnFact(baseState, transition, id)).filter(Boolean);
      if (claimedFacts.length !== claimIds.length) {
        transition.operation_stats.warnings.push(`parallel_scene ${sourceIndex}：引用了不存在的本轮事实`);
        transition.operation_stats.rejected += 1;
        continue;
      }
      const relatedFacts = facts.filter(fact => textsStronglyRelated(turnFactText(fact), sceneText));
      const unclaimed = relatedFacts.filter(
        fact =>
          !claimIds.some(
            id => String(id) === String(fact?.id) || comparableIdentity(id) === comparableIdentity(fact?.alias),
          ),
      );
      if (unclaimed.length) {
        transition.operation_stats.warnings.push(
          `parallel_scene ${sourceIndex}：使用了本轮事实 ${unclaimed
            .map(fact => fact.alias || fact.id)
            .join('、')}，但未声明 knowledge_claim_ids`.slice(0, 300),
        );
        transition.operation_stats.rejected += 1;
        continue;
      }
      let authorizationError = '';
      for (const fact of claimedFacts) {
        for (const actorName of asArray(scene?.actors)) {
          const actor = stagedActors.find(
            item => comparableIdentity(actorDisplayName(item)) === comparableIdentity(actorName),
          ) || {
            name: actorName,
          };
          const traceDiscovery = asArray(transition?.trace_discoveries).find(
            item =>
              String(item?.factId) === String(fact?.id) &&
              actorReferenceMatches(actor, item?.actorId, item?.actorName) &&
              item?.sourceId?.toUpperCase() === `PARALLEL_SCENE_${sourceIndex}`,
          );
          const authorized =
            actorAuthorizedForTurnFact(actor, fact) ||
            acceptedKnowledgeFromFact(transition, actor, fact) ||
            Boolean(traceDiscovery);
          if (!authorized) {
            authorizationError = `${actorDisplayName(actor)} 无权使用本轮事实 ${fact.alias || fact.id}`;
            break;
          }
          if (
            fact.visibility === 'private' &&
            !actorAuthorizedForTurnFact(actor, fact) &&
            textsStronglyRelated(fact.content, sceneText)
          ) {
            authorizationError = `${actorDisplayName(actor)} 只能发现痕迹，不能直接知道无人目击的隐藏行为`;
            break;
          }
        }
        if (authorizationError) break;
      }
      if (authorizationError) {
        transition.operation_stats.warnings.push(`parallel_scene ${sourceIndex}：${authorizationError}`.slice(0, 300));
        transition.operation_stats.rejected += 1;
        continue;
      }
      accepted.push({
        ...scene,
        basis_ids: basisIds.map(id => findTurnFact(baseState, transition, id)?.id || id),
        knowledge_claim_ids: claimedFacts.map(fact => fact.id),
      });
      acceptedSourceIndexes.add(sourceIndex);
    }
    return { scenes: accepted, acceptedSourceIndexes };
  }

  function buildTransitionFromOperations(baseState, result, currentStat, currentTurnText = '') {
    const factValidation = normalizeAndValidateTurnFacts(baseState, result, currentStat, currentTurnText);
    const transition = {
      world_summary: '',
      new_facts: [],
      turn_facts: factValidation.facts,
      scene_presence: factValidation.scenePresence,
      upsert_events: [],
      resolve_event_ids: [],
      upsert_actors: [],
      upsert_intel: [],
      remove_intel_ids: [],
      upsert_hooks: [],
      resolve_hook_ids: [],
      upsert_secrets: [],
      knowledge_updates: [],
      secret_reveals: [],
      trace_discoveries: [],
      camera_history: [],
      next_turn_packet: {},
      parallel_scenes: normalizeParallelScenes(result.parallel_scenes),
      operation_stats: {
        accepted: factValidation.facts.length,
        rejected: factValidation.warnings.length,
        warnings: factValidation.warnings,
      },
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
    const deferredKnowledgeOperations = [];

    const operationPriority = operation => {
      const type = asText(operation?.type);
      if (type.startsWith('event.') || type.startsWith('intel.')) return 0;
      if (type.startsWith('hook.') || type.startsWith('secret.')) return 1;
      if (type.startsWith('actor.')) return 2;
      return 3;
    };
    const orderedOperations = asArray(result.operations)
      .map((operation, index) => ({ operation, index }))
      .sort(
        (left, right) =>
          operationPriority(left.operation) - operationPriority(right.operation) || left.index - right.index,
      )
      .map(item => item.operation);

    for (const operation of orderedOperations) {
      const type = asText(operation?.type);
      const id = asText(operation?.id);
      const value = operation?.value && typeof operation.value === 'object' ? operation.value : {};
      const patch = operation?.set && typeof operation.set === 'object' ? operation.set : {};
      try {
        if (type.startsWith('knowledge.') || type === 'secret.reveal' || type === 'trace.discover') {
          deferredKnowledgeOperations.push(operation);
          continue;
        }
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
          'secret.upsert': ['secrets', 'upsert_secrets', secretInput],
          'secret.patch': ['secrets', 'upsert_secrets', secretInput],
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

        let input = repairedUnknownPatch
          ? patch
          : isPatch || existing
            ? { ...existing, ...(isPatch ? patch : value) }
            : value;
        if (type.startsWith('actor.') && existing) {
          input = {
            ...input,
            knowledge: asArray(existing?.knowledge),
            does_not_know: asArray(existing?.doesNotKnow || existing?.does_not_know),
          };
        }
        if (type === 'secret.patch' && existing) {
          input = {
            ...input,
            holders: asArray(existing?.holders),
          };
        }
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
              : type.startsWith('secret.')
                ? merged.content
                : merged.title && merged.summary;
        const invalidReason = type.startsWith('event.')
          ? '缺少事件标题或内容'
          : type.startsWith('actor.')
            ? '缺少人物名称'
            : type.startsWith('intel.')
              ? '缺少情报内容'
              : type.startsWith('secret.')
                ? '缺少秘密内容'
                : '缺少伏线标题或内容';
        const sourceError = type.startsWith('secret.')
          ? validateSecretSource(baseState, transition, merged, type === 'secret.patch' && existing)
          : '';
        const actorCauseError = type.startsWith('actor.')
          ? validateActorCause(baseState, transition, merged, existing, currentTurnText)
          : '';
        const recordCauseError = validateRecordFactCausality(baseState, transition, type, merged);
        if (!valid) reject(operation, invalidReason);
        else if (sourceError) reject(operation, sourceError);
        else if (actorCauseError) reject(operation, actorCauseError);
        else if (recordCauseError) reject(operation, recordCauseError);
        else if (!effectiveId) reject(operation, '无法根据实体内容生成稳定 ID');
        else {
          if (type.startsWith('secret.')) {
            const sourceFact = findTurnFact(baseState, transition, merged?.source_id);
            if (sourceFact) merged.source_id = sourceFact.id;
          }
          transition[output].push(merged);
          accept();
        }
      } catch (error) {
        reject(operation, error instanceof Error ? error.message : String(error));
      }
    }

    for (const operation of deferredKnowledgeOperations) {
      const type = asText(operation?.type);
      const value = operation?.value && typeof operation.value === 'object' ? operation.value : {};
      try {
        const actorResult = findKnowledgeActor(baseState, transition, value);
        if (actorResult.error) {
          reject(operation, actorResult.error);
          continue;
        }
        if (type === 'trace.discover') {
          const traceResult = validateTraceDiscovery(baseState, transition, result, operation, actorResult.actor);
          if (traceResult.error) {
            reject(operation, traceResult.error);
            continue;
          }
          transition.knowledge_updates.push(traceResult.update);
          transition.trace_discoveries.push(traceResult.discovery);
          accept();
          continue;
        }
        if (type === 'secret.reveal') {
          const secretId = asText(operation?.id);
          const secret =
            existingById(baseState?.secrets, secretId) || existingById(transition.upsert_secrets, secretId);
          if (!secret) {
            reject(operation, `秘密 ${secretId || '未指明'} 不存在`);
            continue;
          }
          if (['public', 'expired'].includes(asText(secret?.status))) {
            reject(operation, `秘密 ${secretId} 已经公开或失效`);
            continue;
          }
          const sourceError = validateKnowledgeSource(
            baseState,
            transition,
            result,
            { ...value, content: secret.content },
            actorResult.actor,
            'secret.reveal',
          );
          if (sourceError) {
            reject(operation, sourceError);
            continue;
          }
          transition.secret_reveals.push({
            secretId,
            actorId: asText(actorResult.actor?.id),
            actorName: actorDisplayName(actorResult.actor),
          });
          const revealKnowledge = normalizeKnowledgeUpdate(
            'knowledge.grant',
            { ...value, content: secret.content, confidence: Math.max(0.8, Number(value?.confidence) || 0) },
            actorResult.actor,
          );
          const revealSourceFact = findTurnFact(baseState, transition, revealKnowledge?.sourceId);
          if (revealSourceFact) revealKnowledge.sourceId = revealSourceFact.id;
          transition.knowledge_updates.push(revealKnowledge);
          accept();
          continue;
        }

        const update = normalizeKnowledgeUpdate(type, value, actorResult.actor);
        if (!update) {
          reject(
            operation,
            type.endsWith('grant') || type.endsWith('correct') ? '确定知识置信度必须不低于 0.6' : '知识内容无效',
          );
          continue;
        }
        if (
          update.state !== 'known' &&
          (actorKnowsContent(actorResult.actor, update.content, [
            ...asArray(baseState?.secrets),
            ...asArray(transition?.upsert_secrets),
          ]) ||
            asArray(transition?.knowledge_updates).some(
              item =>
                item?.state === 'known' &&
                actorReferenceMatches(actorResult.actor, item?.actorId, item?.actorName) &&
                knowledgeTextsRelated(item?.content, update.content),
            ))
        ) {
          reject(operation, `人物 ${actorDisplayName(actorResult.actor)} 已经确定知道该内容，不能降级为怀疑或误信`);
          continue;
        }
        const sourceError = validateKnowledgeSource(baseState, transition, result, value, actorResult.actor, type);
        if (sourceError) {
          reject(operation, sourceError);
          continue;
        }
        const sourceFact = findTurnFact(baseState, transition, update.sourceId);
        if (sourceFact) update.sourceId = sourceFact.id;
        transition.knowledge_updates.push(update);
        accept();
      } catch (error) {
        reject(operation, error instanceof Error ? error.message : String(error));
      }
    }
    transition.knowledge_updates = transition.knowledge_updates.filter(Boolean);
    const validatedScenes = validateParallelScenes(baseState, transition);
    const rejectedSceneSources = new Set(
      asArray(result?.parallel_scenes)
        .map((_, index) => index + 1)
        .filter(index => !validatedScenes.acceptedSourceIndexes.has(index))
        .map(index => `PARALLEL_SCENE_${index}`),
    );
    if (rejectedSceneSources.size) {
      const rejectedKnowledge = transition.knowledge_updates.filter(update =>
        rejectedSceneSources.has(asText(update?.sourceId).toUpperCase()),
      );
      const rejectedDiscoveries = transition.trace_discoveries.filter(item =>
        rejectedSceneSources.has(asText(item?.sourceId).toUpperCase()),
      );
      const rejectedDerived = Math.max(rejectedKnowledge.length, rejectedDiscoveries.length);
      if (rejectedDerived) {
        transition.operation_stats.accepted = Math.max(0, transition.operation_stats.accepted - rejectedDerived);
        transition.operation_stats.rejected += rejectedDerived;
        transition.operation_stats.warnings.push(
          `旁线未通过因果校验，已撤销 ${rejectedDerived} 条由该旁线产生的知识或痕迹发现`,
        );
      }
      transition.knowledge_updates = transition.knowledge_updates.filter(
        update => !rejectedSceneSources.has(asText(update?.sourceId).toUpperCase()),
      );
      transition.trace_discoveries = transition.trace_discoveries.filter(
        item => !rejectedSceneSources.has(asText(item?.sourceId).toUpperCase()),
      );
    }
    transition.parallel_scenes = validatedScenes.scenes;
    transition.camera_history = transition.parallel_scenes.map(cameraLabel).filter(Boolean);
    transition.next_turn_packet = deriveNextTurnPacket(transition);
    return transition;
  }

  function applyKnowledgeUpdates(actors, updates) {
    const values = asArray(actors).map(actor => clone(actor));
    const changedAt = nowIso();

    for (const raw of asArray(updates)) {
      const update = raw && typeof raw === 'object' ? raw : {};
      const actor = values.find(item => actorReferenceMatches(item, update.actorId, update.actorName));
      const content = asText(update.content).slice(0, 360);
      if (!actor || !content) continue;

      let ledger = normalizeKnowledgeLedger(actor.knowledgeLedger, actor.id);
      const replaces = asText(update.replaces).slice(0, 360);
      if (update.mode === 'correct') {
        const correctionTarget = replaces || content;
        ledger = ledger.filter(item => !knowledgeTextsRelated(item.content, correctionTarget));
        actor.knowledge = asArray(actor.knowledge).filter(item => !knowledgeTextsRelated(item, correctionTarget));
      } else if (update.state === 'known') {
        ledger = ledger.filter(item => item.state === 'known' || !knowledgeTextsRelated(item.content, content));
      }
      ledger = ledger.filter(item => !(item.state === update.state && knowledgeTextsRelated(item.content, content)));

      const entry = {
        id: stableId('KN', actor.id, update.state, content),
        state: update.state,
        content,
        sourceType: asText(update.sourceType),
        sourceId: asText(update.sourceId),
        sourceActorId: asText(update.sourceActorId),
        sourceActorName: asText(update.sourceActorName),
        confidence: clamp(update.confidence, 0, 1),
        acquiredAt: changedAt,
        updatedAt: changedAt,
      };
      actor.knowledgeLedger = normalizeKnowledgeLedger([...ledger, entry], actor.id);

      if (update.state === 'known') {
        actor.knowledge = uniqueTextList([...asArray(actor.knowledge), content], 30, 240);
        actor.doesNotKnow = asArray(actor.doesNotKnow).filter(item => !knowledgeTextsRelated(item, content));
      }
      actor.updatedAt = changedAt;
      actor.updatedReason = asText(actor.updatedReason, '知识边界发生变化').slice(0, 240);
    }

    return values;
  }

  function applySecretReveals(secrets, reveals) {
    const values = asArray(secrets).map(secret => clone(secret));
    const changedAt = nowIso();
    for (const raw of asArray(reveals)) {
      const secret = values.find(item => String(item?.id) === String(raw?.secretId || ''));
      if (!secret) continue;
      const holder = asText(raw?.actorName || raw?.actorId);
      if (holder) secret.holders = uniqueTextList([...asArray(secret.holders), holder], 30, 100);
      if (secret.status === 'hidden') secret.status = 'compromised';
      secret.updatedAt = changedAt;
    }
    return values;
  }

  function applyTraceDiscoveries(turnFacts, discoveries) {
    const values = asArray(turnFacts).map(fact => clone(fact));
    for (const discovery of asArray(discoveries)) {
      const fact = values.find(item => String(item?.id) === String(discovery?.factId));
      if (!fact) continue;
      fact.discoveredBy = [
        ...asArray(fact.discoveredBy).filter(
          item =>
            !actorReferenceMatches(
              { id: item?.actorId, name: item?.actorName },
              discovery?.actorId,
              discovery?.actorName,
            ) || !knowledgeTextsRelated(item?.conclusion, discovery?.conclusion),
        ),
        {
          actorId: asText(discovery?.actorId),
          actorName: asText(discovery?.actorName),
          conclusion: asText(discovery?.conclusion).slice(0, 360),
          sourceId: asText(discovery?.sourceId).slice(0, 100),
          discoveredAt: nowIso(),
        },
      ].slice(-24);
      fact.updatedAt = nowIso();
    }
    return values;
  }

  function findActorByReference(records, value) {
    return asArray(records).find(actor => actorMatchesName(actor, value));
  }

  function validateV3IntelChange(baseState, transition, intel, existing, context) {
    const currentWorldDays = Math.max(0, Number(context?.currentWorldDays) || 0);
    const sourceType = enumValue(intel?.source_type || intel?.sourceType, INTEL_SOURCE_TYPES, '');
    const sourceId = asText(intel?.source_id || intel?.sourceId);
    const sourceActor = asText(intel?.source_actor || intel?.sourceActor);
    const status = normalizeIntelStatus(intel?.status);
    const distanceBand = enumValue(intel?.distance_band || intel?.distanceBand, DISTANCE_BANDS, 'same_city');
    const targetGroups = uniqueTextList(intel?.target_groups || intel?.targetGroups, 16, 100);
    const requestedDeparture = optionalFiniteNumber(intel?.departed_world_days ?? intel?.departedWorldDays);
    const existingDeparture = optionalFiniteNumber(existing?.departedWorldDays ?? existing?.departed_world_days);
    const departedWorldDays = existing
      ? Math.max(0, existingDeparture ?? requestedDeparture ?? currentWorldDays)
      : Math.max(currentWorldDays, requestedDeparture ?? currentWorldDays);
    const minimumAvailable = departedWorldDays + minimumTransitDays(distanceBand, intel?.channel);
    const requestedAvailable = optionalFiniteNumber(
      intel?.available_after_world_days ?? intel?.availableAfterWorldDays,
    );
    const availableAfterWorldDays = Math.max(minimumAvailable, requestedAvailable ?? minimumAvailable);

    intel.status = status;
    intel.visibility = normalizeIntelVisibility(intel?.visibility || intel?.publicity);
    intel.target_groups = targetGroups;
    intel.source_type = sourceType;
    intel.source_id = sourceId;
    intel.source_actor = sourceActor;
    intel.distance_band = distanceBand;
    intel.departed_world_days = departedWorldDays;
    intel.available_after_world_days = availableAfterWorldDays;

    if (!existing) {
      if (status === 'arrived') return '新建消息不能在同一轮直接抵达';
      if (!targetGroups.length) return '新建消息缺少明确的 targetGroups 接收群体';
      if (!sourceType || !sourceId) return '新建消息缺少 sourceType/sourceId 来源';
      if (
        !uniqueTextList(intel?.source_fact_ids || intel?.sourceFactIds, 20, 100).some(
          id => comparableIdentity(id) === comparableIdentity(sourceId),
        )
      ) {
        return '新建消息的 sourceFactIds 必须包含 sourceId';
      }
    } else if (status === 'arrived' && currentWorldDays < availableAfterWorldDays) {
      return `消息最早在世界天数 ${availableAfterWorldDays} 抵达，当前仅为 ${currentWorldDays}`;
    }

    const sourceChanged =
      !existing ||
      sourceType !== enumValue(existing?.sourceType || existing?.source_type, INTEL_SOURCE_TYPES, '') ||
      sourceId !== asText(existing?.sourceId || existing?.source_id) ||
      sourceActor !== asText(existing?.sourceActor || existing?.source_actor) ||
      asText(intel?.content) !== asText(existing?.content);
    if (sourceChanged && sourceType === 'current_turn_witness') {
      if (sourceId.toUpperCase() !== 'CURRENT_TURN') return '本轮现场来源的 sourceId 必须为 CURRENT_TURN';
      const witness = findActorByReference(
        uniqueTextList(context?.sceneEvidence?.reliableWitnesses, 24, 100).map(name => ({ name })),
        sourceActor,
      );
      if (!witness) return `消息发送者 ${sourceActor || '未填写'} 不在本轮现场知情白名单中`;
      if (!knowledgeTextsRelated(context?.currentTurnText, intel?.content)) {
        return '消息内容与本轮正文没有可核对关系';
      }
    } else if (sourceChanged && sourceType === 'actor_knowledge') {
      const actor = findActorByReference(
        [...asArray(baseState?.actors), ...asArray(transition?.upsert_actors)],
        sourceId || sourceActor,
      );
      if (!actor) return `消息知识来源人物 ${sourceId || sourceActor || '未填写'} 不存在`;
      if (!actorKnowsContent(actor, intel?.content, asArray(baseState?.secrets))) {
        return `消息发送者 ${actorDisplayName(actor)} 没有登记过该知识`;
      }
    } else if (sourceChanged && (sourceType === 'received_intel' || sourceType === 'public_information')) {
      const sourceIntel = asArray(baseState?.intelPackets).find(item => String(item?.id) === sourceId);
      if (!sourceIntel) return `上游消息 ${sourceId || '未填写'} 不存在`;
      if (!intelHasArrived(sourceIntel, currentWorldDays)) return `上游消息 ${sourceId} 尚未抵达`;
      if (sourceType === 'public_information' && !intelIsPublic(sourceIntel)) {
        return `上游消息 ${sourceId} 尚未成为公开信息`;
      }
      if (!knowledgeTextsRelated(sourceIntel?.content, intel?.content)) return `消息内容与上游消息 ${sourceId} 不一致`;
    } else if (sourceChanged && sourceType === 'event') {
      const event = asArray(baseState?.activeEvents).find(item => String(item?.id) === sourceId);
      if (!event) return `消息来源事件 ${sourceId || '未填写'} 不存在`;
      if (!knowledgeTextsRelated(`${event?.title} ${event?.summary}`, intel?.content)) {
        return `消息内容与来源事件 ${sourceId} 不一致`;
      }
    } else if (sourceChanged && !existing) {
      return `不支持的消息来源 ${sourceType || '空'}`;
    }

    const previousKnownBy = uniqueTextList(existing?.knownBy || existing?.known_by, 30, 100);
    const addedKnownBy = uniqueTextList(intel?.known_by || intel?.knownBy, 30, 100).filter(
      value => !previousKnownBy.some(previous => comparableIdentity(previous) === comparableIdentity(value)),
    );
    for (const holder of addedKnownBy) {
      if (sourceActor && comparableIdentity(holder) === comparableIdentity(sourceActor)) continue;
      const actor = findActorByReference(
        [...asArray(baseState?.actors), ...asArray(transition?.upsert_actors)],
        holder,
      );
      if (!actor) return `knownBy 中的 ${holder} 不是已登记人物；群体应写入 targetGroups`;
      if (!intelAllowsActor(intel, actor, currentWorldDays)) {
        return `${actorDisplayName(actor)} 尚未处于该消息的抵达地点或目标群体`;
      }
    }
    return '';
  }

  function validateV3RecordBasis(baseState, record, collection, context) {
    const currentTurnText = asText(context?.currentTurnText);
    if (!currentTurnText) return '';
    const recordText =
      collection === 'events'
        ? `${record?.title} ${record?.summary} ${record?.next_trigger || record?.nextTrigger}`
        : `${record?.title} ${record?.summary} ${record?.trigger}`;
    if (!textsStronglyRelated(recordText, currentTurnText)) return '';
    const basisIds = uniqueTextList(record?.source_fact_ids || record?.sourceFactIds, 20, 100);
    const currentTurnBasis = basisIds.some(id => id.toUpperCase() === 'CURRENT_TURN');
    const arrivedIntelBasis = basisIds.some(id => {
      const intel = asArray(baseState?.intelPackets).find(item => String(item?.id) === String(id));
      return intelHasArrived(intel, context?.currentWorldDays);
    });
    if (!currentTurnBasis && !arrivedIntelBasis) {
      return '记录直接承接本轮正文，但没有 CURRENT_TURN 或已抵达消息作为 sourceFactIds';
    }
    if (collection === 'events' && currentTurnBasis) {
      const allowed = uniqueTextList(context?.sceneEvidence?.reliableWitnesses, 24, 100);
      const unauthorized = uniqueTextList(record?.actors, 20, 100).find(
        actor => !allowed.some(name => comparableIdentity(name) === comparableIdentity(actor)),
      );
      if (unauthorized) return `事件把未在现场知情白名单中的 ${unauthorized} 写成了本轮参与者`;
    }
    return '';
  }

  function actorKnowledgeChanged(existing, actor) {
    const before = uniqueTextList(existing?.knowledge, 30, 240).map(normalizedKnowledgeText);
    const after = uniqueTextList(actor?.knowledge, 30, 240).map(normalizedKnowledgeText);
    return after.some(item => item && !before.includes(item));
  }

  function buildTransitionFromChanges(baseState, result, context = {}) {
    const currentStat = context?.currentStat || {};
    const currentTurnText = asText(context?.currentTurnText);
    const currentWorldDays =
      optionalFiniteNumber(currentStat?.世界运转?.世界运转天数) ??
      Math.max(0, Number(baseState?.currentWorldDays) || 0);
    const sceneEvidence = context?.sceneEvidence || buildSceneEvidence(baseState, currentStat, currentTurnText);
    const enforceKnowledgeBoundary = context?.enforceKnowledgeBoundary === true;
    const knowledgeContext = {
      ...context,
      currentStat,
      currentTurnText,
      currentWorldDays,
      sceneEvidence,
      requireExplicitCause: enforceKnowledgeBoundary,
    };
    const transition = {
      upsert_events: [],
      resolve_event_ids: [],
      upsert_actors: [],
      remove_actor_ids: [],
      upsert_intel: [],
      remove_intel_ids: [],
      upsert_hooks: [],
      resolve_hook_ids: [],
      upsert_secrets: [],
      secret_reveals: [],
      knowledge_updates: [],
      turn_facts: [],
      trace_discoveries: [],
      scene_presence: normalizeScenePresence(baseState?.scenePresence),
      camera_history: [],
      next_turn_packet: {},
      parallel_scenes: [],
      current_world_days: currentWorldDays,
      operation_stats: { accepted: 0, rejected: 0, knowledgeRejected: 0, warnings: [] },
    };
    const stats = transition.operation_stats;
    const acceptedIndexes = new Set();
    const acceptedChanges = new Map();
    const touchedTargets = new Set();
    const reject = (change, reason) => {
      stats.rejected += 1;
      stats.warnings.push(`${asText(change?.op, 'unknown')}：${reason}`.slice(0, 300));
    };
    const rejectKnowledge = (change, reason) => {
      stats.knowledgeRejected += 1;
      reject(change, `知识边界：${reason}`);
    };
    const existingById = (collection, id) => asArray(collection).find(item => String(item?.id) === String(id));
    const descriptors = {
      events: {
        stateKey: 'activeEvents',
        outputKey: 'upsert_events',
        deleteKey: 'resolve_event_ids',
        fields: V3_CHANGE_FIELDS.events,
        normalize: eventInput,
        valid: item => item.title && item.stage && item.location && item.summary && item.next_trigger,
      },
      actors: {
        stateKey: 'actors',
        outputKey: 'upsert_actors',
        deleteKey: 'remove_actor_ids',
        fields: V3_CHANGE_FIELDS.actors,
        normalize: actorInput,
        valid: item => item.name && item.current_action && item.updated_reason,
      },
      intel: {
        stateKey: 'intelPackets',
        outputKey: 'upsert_intel',
        deleteKey: 'remove_intel_ids',
        fields: V3_CHANGE_FIELDS.intel,
        normalize: intelInput,
        valid: item =>
          item.content &&
          item.origin &&
          item.destination &&
          item.channel &&
          item.status &&
          item.eta &&
          item.reliability > 0,
      },
      hooks: {
        stateKey: 'hooks',
        outputKey: 'upsert_hooks',
        deleteKey: 'resolve_hook_ids',
        fields: V3_CHANGE_FIELDS.hooks,
        normalize: hookInput,
        valid: item => item.title && item.stage && item.summary && item.trigger && item.fail_condition,
      },
    };

    asArray(result?.changes).forEach((change, index) => {
      const op = asText(change?.op);
      try {
        const collection = asText(change?.target?.collection);
        const id = asText(change?.target?.id);
        const descriptor = descriptors[collection];
        if (!descriptor) {
          reject(change, '未知集合');
          return;
        }
        if (!id) {
          reject(change, '缺少稳定 ID');
          return;
        }
        const targetKey = `${collection}:${id}`;
        if (touchedTargets.has(targetKey)) {
          reject(change, `同一轮重复修改目标 ${id}`);
          return;
        }
        const existing = existingById(baseState?.[descriptor.stateKey], id);
        if (op === 'delete') {
          if (!existing) {
            reject(change, `目标 ${id} 不存在`);
          } else {
            transition[descriptor.deleteKey].push(id);
            stats.accepted += 1;
            acceptedIndexes.add(index);
            touchedTargets.add(targetKey);
          }
          return;
        }
        if (!['create', 'merge'].includes(op)) {
          reject(change, '未知操作类型');
          return;
        }
        if (op === 'create' && existing) {
          reject(change, `create 目标 ${id} 已存在`);
          return;
        }
        if (op === 'merge' && !existing) {
          reject(change, `merge 目标 ${id} 不存在`);
          return;
        }
        const rawPayload = op === 'create' ? change?.value : change?.changes;
        if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
          reject(change, `${op} 缺少对象载荷`);
          return;
        }
        const entries = Object.entries(rawPayload);
        const invalidFields = entries.filter(([key]) => !descriptor.fields.has(key)).map(([key]) => key);
        if (invalidFields.length) {
          reject(change, `包含不可修改字段：${invalidFields.join('、')}`);
          return;
        }
        if (!entries.length) {
          reject(change, `${op} 没有提交任何变化字段`);
          return;
        }
        const merged = descriptor.normalize({ ...(existing || {}), ...rawPayload }, id);
        if (!descriptor.valid(merged)) {
          reject(change, '合并后的记录缺少必填字段');
          return;
        }
        if (op === 'merge' && JSON.stringify(merged) === JSON.stringify(descriptor.normalize(existing, id))) {
          return;
        }
        if (enforceKnowledgeBoundary && collection === 'actors') {
          const causeError = validateActorCause(
            baseState,
            transition,
            merged,
            existing,
            currentTurnText,
            knowledgeContext,
          );
          if (causeError) {
            rejectKnowledge(change, causeError);
            return;
          }
          if (
            actorKnowledgeChanged(existing, merged) &&
            !['observation', 'received_intel', 'event'].includes(asText(merged?.cause_type).toLowerCase())
          ) {
            rejectKnowledge(change, '人物新增知识必须来自现场观察、已抵达消息或亲历事件');
            return;
          }
        }
        if (enforceKnowledgeBoundary && collection === 'intel') {
          const intelError = validateV3IntelChange(baseState, transition, merged, existing, knowledgeContext);
          if (intelError) {
            rejectKnowledge(change, intelError);
            return;
          }
        }
        if (enforceKnowledgeBoundary && ['events', 'hooks'].includes(collection)) {
          const basisError = validateV3RecordBasis(baseState, merged, collection, knowledgeContext);
          if (basisError) {
            rejectKnowledge(change, basisError);
            return;
          }
        }
        transition[descriptor.outputKey].push(merged);
        stats.accepted += 1;
        acceptedIndexes.add(index);
        acceptedChanges.set(index, { collection, record: merged, existing, op });
        touchedTargets.add(targetKey);
      } catch (error) {
        reject(change, error instanceof Error ? error.message : String(error));
      }
    });

    const supportedScenes = asArray(result?.scenes).filter((scene, sceneIndex) => {
      const rawReferences = asArray(scene?.based_on);
      const references = rawReferences.filter(
        value => typeof value === 'number' && Number.isInteger(value) && value >= 0,
      );
      const supported =
        references.length > 0 &&
        references.length === rawReferences.length &&
        references.every(index => acceptedIndexes.has(index));
      if (!supported) {
        stats.warnings.push(`scene[${sceneIndex}]：based_on 未全部指向已接受的变化`);
        return false;
      }
      if (!enforceKnowledgeBoundary) return true;

      const referencedChanges = references.map(index => acceptedChanges.get(index)).filter(Boolean);
      const sceneActors = uniqueTextList(scene?.actors, 20, 100);
      const sceneText = `${asText(scene?.action)} ${asText(scene?.body)}`;
      const newInTransitIntel = referencedChanges.filter(
        item =>
          item?.collection === 'intel' &&
          item?.op === 'create' &&
          normalizeIntelStatus(item?.record?.status) !== 'arrived',
      );
      if (newInTransitIntel.length) {
        const currentHolders = newInTransitIntel.flatMap(item => [
          asText(item?.record?.source_actor || item?.record?.sourceActor),
          ...uniqueTextList(item?.record?.known_by || item?.record?.knownBy, 30, 100),
        ]);
        const prematureRecipient = sceneActors.find(
          actor => !currentHolders.some(holder => comparableIdentity(holder) === comparableIdentity(actor)),
        );
        if (prematureRecipient) {
          stats.warnings.push(`scene[${sceneIndex}]：${prematureRecipient} 尚未收到本轮新建的在途消息`);
          stats.rejected += 1;
          stats.knowledgeRejected += 1;
          return false;
        }
      }

      if (currentTurnText && textsStronglyRelated(sceneText, currentTurnText)) {
        const allowedWitnesses = uniqueTextList(sceneEvidence?.reliableWitnesses, 24, 100);
        const unauthorized = sceneActors.find(actorName => {
          if (allowedWitnesses.some(name => comparableIdentity(name) === comparableIdentity(actorName))) return false;
          const actor = findActorByReference(transition.upsert_actors, actorName) ||
            findActorByReference(baseState?.actors, actorName) || { name: actorName };
          return !referencedChanges.some(item => {
            if (item?.collection === 'actors' && actorMatchesName(item.record, actorName)) {
              return (
                asText(item?.record?.cause_type).toLowerCase() === 'received_intel' && asText(item?.record?.cause_id)
              );
            }
            return item?.collection === 'intel' && intelAllowsActor(item.record, actor, currentWorldDays);
          });
        });
        if (unauthorized) {
          stats.warnings.push(`scene[${sceneIndex}]：${unauthorized} 未获知本轮正文信息，旁线已拒绝`);
          stats.rejected += 1;
          stats.knowledgeRejected += 1;
          return false;
        }
      }
      return true;
    });
    transition.parallel_scenes = normalizeParallelScenes(supportedScenes);
    transition.camera_history = transition.parallel_scenes.map(cameraLabel).filter(Boolean);
    transition.next_turn_packet = deriveNextTurnPacket(transition, currentWorldDays);
    return transition;
  }

  function applyTransition(baseState, result, messageKey, currentStat) {
    const state = clone(baseState);
    const source = result && typeof result === 'object' ? result : {};
    state.revision = Number(state.revision || 0) + 1;
    state.currentWorldDays =
      optionalFiniteNumber(currentStat?.世界运转?.世界运转天数) ??
      Math.max(0, Number(baseState?.currentWorldDays) || 0);
    state.isolationCursor =
      optionalFiniteNumber(source.isolation_cursor ?? source.isolationCursor) ??
      Math.max(0, Number(baseState?.isolationCursor) || 0);

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
        sourceFactIds: uniqueTextList(raw?.source_fact_ids || raw?.sourceFactIds, 20, 100),
      };
    });

    const removedActors = new Set(asArray(source.remove_actor_ids).map(String));
    state.actors = asArray(state.actors).filter(item => !removedActors.has(String(item.id)));
    state.actors = upsertById(state.actors, source.upsert_actors, LIMITS.actors, 'NPC', raw => {
      if (!asText(raw?.name) || !asText(raw?.current_action) || !asText(raw?.updated_reason)) return null;
      return {
        id: raw?.id,
        name: asText(raw?.name),
        location: asText(raw?.location),
        groups: uniqueTextList(raw?.groups, 16, 100),
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
        knowledgeLedger: normalizeKnowledgeLedger(raw?.knowledge_ledger || raw?.knowledgeLedger, raw?.id),
        nextDecision: asText(raw?.next_decision).slice(0, 280),
        updatedReason: asText(raw?.updated_reason).slice(0, 240),
        causeType: asText(raw?.cause_type || raw?.causeType).slice(0, 60),
        causeId: asText(raw?.cause_id || raw?.causeId).slice(0, 100),
        basisIds: uniqueTextList(raw?.basis_ids || raw?.basisIds, 16, 100),
        nextDueWorldDays: optionalFiniteNumber(raw?.next_due_world_days ?? raw?.nextDueWorldDays),
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
        status: normalizeIntelStatus(raw?.status),
        eta: asText(raw?.eta),
        reliability: clamp(raw?.reliability, 0, 1),
        knownBy: uniqueTextList(raw?.known_by || raw?.knownBy, 30, 100),
        sourceFactIds: uniqueTextList(raw?.source_fact_ids || raw?.sourceFactIds, 16, 100),
        targetGroups: uniqueTextList(raw?.target_groups || raw?.targetGroups, 16, 100),
        visibility: normalizeIntelVisibility(raw?.visibility || raw?.publicity),
        sourceType: enumValue(raw?.source_type || raw?.sourceType, INTEL_SOURCE_TYPES, ''),
        sourceId: asText(raw?.source_id || raw?.sourceId),
        sourceActor: asText(raw?.source_actor || raw?.sourceActor),
        distanceBand: enumValue(raw?.distance_band || raw?.distanceBand, DISTANCE_BANDS, 'same_city'),
        departedWorldDays: optionalFiniteNumber(raw?.departed_world_days ?? raw?.departedWorldDays),
        availableAfterWorldDays: optionalFiniteNumber(raw?.available_after_world_days ?? raw?.availableAfterWorldDays),
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
        sourceFactIds: uniqueTextList(raw?.source_fact_ids || raw?.sourceFactIds, 20, 100),
      };
    });

    state.secrets = upsertById(state.secrets, source.upsert_secrets, LIMITS.secrets, 'SEC', raw =>
      normalizeStoredSecret({
        ...raw,
        revealConditions: raw?.reveal_conditions || raw?.revealConditions,
        sourceType: raw?.source_type || raw?.sourceType,
        sourceId: raw?.source_id || raw?.sourceId,
      }),
    );
    state.secrets = applySecretReveals(state.secrets, source.secret_reveals);
    state.actors = applyKnowledgeUpdates(state.actors, source.knowledge_updates);
    state.turnFacts = upsertById(
      state.turnFacts,
      asArray(source.turn_facts).map(fact => ({
        ...fact,
        sourceMessageId: messageKey.messageId,
        sourceRevision: state.revision,
        createdAt: fact?.createdAt || nowIso(),
      })),
      LIMITS.turnFacts,
      'TF',
      normalizeStoredTurnFact,
    );
    state.turnFacts = applyTraceDiscoveries(state.turnFacts, source.trace_discoveries);
    state.scenePresence = normalizeScenePresence(source.scene_presence || state.scenePresence);

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

  function previewTransitionState(baseState, transition, messageKey, currentStat) {
    const preview = applyTransition(baseState, transition, messageKey, currentStat);
    preview.revision = Number(baseState?.revision) || 0;
    preview.lastProcessed = clone(baseState?.lastProcessed);
    preview.lastRun = clone(baseState?.lastRun);
    preview.checkpoints = clone(baseState?.checkpoints || []);
    preview.parallelTurns = clone(baseState?.parallelTurns || []);
    preview.cameraHistory = clone(baseState?.cameraHistory || []);
    preview.isolationCursor = Math.max(0, Number(baseState?.isolationCursor) || 0);
    return normalizeState(preview, preview.chatId);
  }

  function combineTransitions(routingTransition, evolutionTransition, currentWorldDays = 0) {
    const routing = routingTransition || emptyTransition(currentWorldDays);
    const evolution = evolutionTransition || emptyTransition(currentWorldDays);
    const combined = emptyTransition(currentWorldDays);
    for (const key of [
      'upsert_events',
      'resolve_event_ids',
      'upsert_actors',
      'remove_actor_ids',
      'upsert_intel',
      'remove_intel_ids',
      'upsert_hooks',
      'resolve_hook_ids',
      'upsert_secrets',
      'secret_reveals',
      'knowledge_updates',
      'turn_facts',
      'trace_discoveries',
      'camera_history',
    ]) {
      combined[key] = [...asArray(routing[key]), ...asArray(evolution[key])];
    }
    combined.scene_presence =
      routing.scene_presence && Object.keys(routing.scene_presence).length
        ? routing.scene_presence
        : evolution.scene_presence;
    combined.parallel_scenes = asArray(evolution.parallel_scenes);
    combined.operation_stats = {
      accepted: Number(routing.operation_stats?.accepted || 0) + Number(evolution.operation_stats?.accepted || 0),
      rejected: Number(routing.operation_stats?.rejected || 0) + Number(evolution.operation_stats?.rejected || 0),
      knowledgeRejected: 0,
      warnings: [...asArray(routing.operation_stats?.warnings), ...asArray(evolution.operation_stats?.warnings)].slice(
        0,
        24,
      ),
    };
    combined.next_turn_packet = deriveNextTurnPacket(combined, currentWorldDays);
    return combined;
  }

  function formatBulletSection(
    title,
    items,
    limit = MAIN_MODEL_CONTEXT_LIMITS.latestItems,
    maxChars = MAIN_MODEL_CONTEXT_LIMITS.itemChars,
  ) {
    const values = asArray(items)
      .map(value => asText(value))
      .filter(Boolean)
      .slice(0, limit)
      .map(value => shortText(value, maxChars));
    if (!values.length) return '';
    return `${title}:\n${values.map(value => `- ${value}`).join('\n')}`;
  }

  function buildPacketSections(packet, persistent = false) {
    const itemLimit = persistent ? MAIN_MODEL_CONTEXT_LIMITS.persistentItems : MAIN_MODEL_CONTEXT_LIMITS.latestItems;
    return [
      formatBulletSection('玩家视野外正在进行的行动', packet.offscreenMoves, itemLimit),
      formatBulletSection('已经进入玩家可知范围的情报', packet.arrivingIntel, itemLimit),
      formatBulletSection('仍在传播、尚不可直接得知的情报', packet.intelInTransit, itemLimit),
      formatBulletSection('正在施压的世界事件', packet.activePressures, itemLimit),
      formatBulletSection('等待条件兑现的延迟后果', packet.pendingConsequences, itemLimit),
      formatBulletSection('仍未证实或彼此冲突的信息', packet.uncertainties, itemLimit),
      formatBulletSection('本轮约束', packet.constraints, itemLimit),
    ].filter(Boolean);
  }

  function recentConversationFocusText() {
    const getLast = api('getLastMessageId');
    const getMessages = api('getChatMessages');
    if (typeof getLast !== 'function' || typeof getMessages !== 'function') return '';
    const values = [];
    for (let id = Number(getLast()), count = 0; id >= 0 && count < 6; id -= 1) {
      const message = getMessages(id)?.[0];
      if (!message || !['user', 'assistant'].includes(asText(message.role))) continue;
      const text = stripForContext(message.message).slice(-5000);
      if (!text) continue;
      values.unshift(`${message.role}:${text}`);
      count += 1;
    }
    return values.join('\n').slice(-18000);
  }

  function identityAppearsInText(actor, text) {
    const normalizedText = normalizedPromptIdentity(text);
    return [actor?.id, actor?.name]
      .map(normalizedPromptIdentity)
      .filter(value => value.length >= 2)
      .some(value => normalizedText.includes(value));
  }

  function selectKnowledgeActors(state, focusText, packet) {
    const actors = asArray(state?.actors);
    const packetText = [
      ...asArray(packet?.offscreenMoves),
      ...asArray(packet?.arrivingIntel),
      ...asArray(packet?.intelInTransit),
      ...asArray(packet?.activePressures),
      ...asArray(packet?.pendingConsequences),
      ...asArray(packet?.uncertainties),
      ...asArray(packet?.npcKnowledge).flatMap(item => [
        item?.name,
        ...asArray(item?.knows),
        ...asArray(item?.doesNotKnow),
      ]),
    ].join('\n');
    const direct = actors.filter(actor => identityAppearsInText(actor, focusText));
    const packetActors = actors.filter(actor => identityAppearsInText(actor, packetText));
    const scored = selectRelevantRecords(
      actors,
      `${focusText}\n${packetText}`,
      MAIN_MODEL_CONTEXT_LIMITS.relevantKnowledgeActors,
      ['id', 'name', 'location', 'goal', 'currentAction', 'knowledge', 'doesNotKnow', 'knowledgeLedger'],
    );
    return mergeRecords([...direct, ...packetActors], scored, MAIN_MODEL_CONTEXT_LIMITS.relevantKnowledgeActors);
  }

  function knowledgeFactLabel(item) {
    const source =
      asText(item?.sourceActorName) ||
      asText(item?.sourceActorId) ||
      asText(item?.sourceId) ||
      asText(item?.sourceType);
    return `${shortText(item?.content, MAIN_MODEL_CONTEXT_LIMITS.knowledgeFactChars)}${
      source ? `〔来源：${shortText(source, 50)}〕` : ''
    }`;
  }

  function uniqueKnowledgeEntries(entries, limit) {
    const seen = new Set();
    return asArray(entries)
      .filter(item => {
        const key = normalizedKnowledgeText(item?.content);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  function formatActorKnowledgeBoundaries(state, focusText, packet) {
    const actors = selectKnowledgeActors(state, focusText, packet);
    if (!actors.length) return '';
    const cards = actors.map(actor => {
      const ledger = normalizeKnowledgeLedger(actor?.knowledgeLedger, actor?.id);
      const known = uniqueKnowledgeEntries(
        [
          ...ledger.filter(item => item.state === 'known'),
          ...asArray(actor?.knowledge).map(content => ({
            content,
            sourceType: 'legacy',
            sourceId: '既有档案',
          })),
        ],
        MAIN_MODEL_CONTEXT_LIMITS.knownFacts,
      );
      const suspected = uniqueKnowledgeEntries(
        ledger.filter(item => item.state === 'suspected'),
        MAIN_MODEL_CONTEXT_LIMITS.softKnowledgeFacts,
      );
      const believed = uniqueKnowledgeEntries(
        ledger.filter(item => item.state === 'believed'),
        MAIN_MODEL_CONTEXT_LIMITS.softKnowledgeFacts,
      );
      const doesNotKnow = uniqueTextList(
        actor?.doesNotKnow,
        LIMITS.knowledgeLedgerPerActor,
        MAIN_MODEL_CONTEXT_LIMITS.knowledgeFactChars,
      );
      const heldSecrets = asArray(state?.secrets)
        .filter(secret => secret?.status !== 'expired' && actorListed(secret?.holders, actor))
        .map(secret => `${asText(secret?.id)} ${shortText(secret?.title || secret?.content, 80)}`)
        .filter(Boolean);
      return [
        `人物：${actorDisplayName(actor)}〔${asText(actor?.id)}｜位置：${asText(actor?.location, '未知')}〕`,
        `可当作事实使用：${known.length ? known.map(knowledgeFactLabel).join('；') : '无已登记事实'}`,
        suspected.length ? `仅为怀疑：${suspected.map(knowledgeFactLabel).join('；')}` : '',
        believed.length ? `主观相信但未证实：${believed.map(knowledgeFactLabel).join('；')}` : '',
        `明确不知道：${doesNotKnow.length ? doesNotKnow.join('；') : '无逐项登记；仍执行默认拒绝规则'}`,
        `秘密权限：${heldSecrets.length ? heldSecrets.join('；') : '无；不得知晓秘密登记簿中的任何隐藏内容'}`,
      ]
        .filter(Boolean)
        .join('\n');
    });
    return `当前相关人物的知识权限卡（硬约束）:\n${cards.join('\n\n')}`;
  }

  function formatSecretRegistry(state) {
    const priority = { critical: 0, high: 1, normal: 2 };
    const secrets = asArray(state?.secrets)
      .filter(secret => ['hidden', 'compromised'].includes(asText(secret?.status)))
      .sort(
        (left, right) =>
          (priority[asText(left?.level)] ?? 9) - (priority[asText(right?.level)] ?? 9) ||
          (Date.parse(asText(right?.updatedAt)) || 0) - (Date.parse(asText(left?.updatedAt)) || 0),
      );
    if (!secrets.length) return '';
    const values = secrets.map(secret => {
      const holders = uniqueTextList(secret?.holders, 30, 100);
      const conditions = uniqueTextList(secret?.revealConditions, 12, 160);
      return [
        `- [${asText(secret?.id)}｜${asText(secret?.level)}｜${asText(secret?.status)}]`,
        shortText(secret?.title || secret?.content, 80),
        `内容：${shortText(secret?.content, 300)}`,
        `合法知情者：${holders.length ? holders.join('、') : '无人'}`,
        `允许揭露条件：${conditions.length ? conditions.join('；') : '未登记，禁止自动揭露'}`,
      ].join('｜');
    });
    return `秘密与信息盲区登记簿（系统真相，不是人物共有知识）:\n${values.join('\n')}`;
  }

  function buildMainModelInjection(state, focusText = recentConversationFocusText()) {
    const packet = normalizePacket(state.nextTurnPacket);
    const persistentPacket = buildPersistentMainModelPacket(state, packet);
    const latestSections = buildPacketSections(packet);
    const persistentSections = buildPacketSections(persistentPacket, true);
    const secretRegistry = formatSecretRegistry(state);
    const knowledgeBoundaries = formatActorKnowledgeBoundaries(state, focusText, packet);
    const sections = [
      `<天下演化上下文 version="${state.revision}">`,
      latestSections.length ? `本轮新近变化:\n\n${latestSections.join('\n\n')}` : '',
      persistentSections.length
        ? `持续核心状态（未在本轮更新，但仍未结束）:\n\n${persistentSections.join('\n\n')}`
        : '',
      secretRegistry,
      knowledgeBoundaries,
      `主模型联动协议：
  - 知识采用默认拒绝：世界书、状态栏、变量和本注入中出现的客观真相，都不自动等于人物知道。
  - 当前相关人物只能使用其“可当作事实使用”与获准秘密；“怀疑”只能表现为试探，“主观相信”可以驱动行动但不得写成已证实。
  - “明确不知道”以及无秘密权限的内容不得通过直觉、巧合、梦境或作者旁白偷渡；只有正文中实际发生观察、告知、情报抵达等传播后才可改变。
  - “无人目击事实”虽然已经改变客观世界，但 NPC 不能直接知道行为、行为人或动机；后来发现物品缺失、血迹、损坏等，只能得到痕迹本身支持的有限结论。
  - 秘密登记簿的“合法知情者”是白名单；未列名人物一律不知道，即使该秘密已写在世界书或系统上下文中。
  - 未列出权限卡的人物若临时进入正文，只能使用本轮亲历的公开信息；不得自行假定其知道档案、在途情报或隐藏秘密。
  - “持续核心状态”只作为因果与知识约束；若尚未与当前视角建立合理联系，不得强行播报或切换镜头。
  - 联动包没有列出某项档案不代表该事件已经结束；不得自行宣布未获确认的伏线、行动或情报失效。
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

  function refreshInjection(state = getChatState(), focusText = recentConversationFocusText()) {
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
        content: buildMainModelInjection(state, focusText),
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
      clearPendingSettlement();
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
    const generationRoot = `cmyj-world-${hashText(`${chatId}|${messageKey.messageId}|${messageKey.swipeId}|${Date.now()}`)}`;
    const job = { chatId, messageKey, generationId: `${generationRoot}-route`, cancelled: false };
    runtime.activeJob = job;
    runtime.busy = true;
    runtime.lastError = '';
    runtime.lastNotice = source === 'manual' ? '正在重新推演本轮天下……' : `正在结算第 ${messageId} 楼……`;
    updateLampState();
    renderPanel();
    showEvolutionBanner(
      'running',
      source === 'manual' ? '正在重新演化' : '天下演化中',
      `正在结算第 ${messageId} 楼，最长等待 ${durationLabel(settings.requestTimeoutMs)}。`,
      { cancellable: true },
    );

    try {
      const currentStat = await waitForMessageVariables(messageId, job);
      if (!jobStillValid(job)) throw new Error('聊天或回复版本已经改变，本次推演结果已作废。');
      const currentTurnText = api('getChatMessages')?.(messageKey.messageId)?.[0]?.message || '';
      const routingPayload = buildFactRoutingPayload(baseState, messageKey, currentStat || {});
      let routingResult;
      let routingFailure = '';
      try {
        job.generationId = `${generationRoot}-route`;
        routingResult = await callFactRouter(routingPayload, job.generationId, job);
      } catch (error) {
        if (job.cancelled || isCancellationError(error)) throw error;
        routingFailure = error instanceof Error ? error.message : String(error);
        routingResult = { schema_version: 1, facts: [], scene_entities: [], communications: [] };
        console.warn('[天下演化] 事实分流失败，本轮按无新增外传事实继续隔离推演。', error);
      }
      if (!jobStillValid(job)) throw new Error('聊天或回复版本已经改变，本次推演结果已作废。');
      const routingTransition = buildFactRoutingTransition(
        baseState,
        routingResult,
        currentStat || {},
        currentTurnText,
      );
      if (routingFailure) {
        routingTransition.operation_stats.warnings.unshift(`事实分流失败：${routingFailure}`.slice(0, 300));
        routingTransition.operation_stats.rejected += 1;
      }
      const routedState = previewTransitionState(baseState, routingTransition, messageKey, currentStat || {});
      const routedFactIds = routingTransition.turn_facts.map(fact => fact.id);
      const isolationJob = routingFailure ? null : selectIsolationJob(routedState, routedFactIds);
      let result = { schema_version: 3, base_revision: baseState.revision, changes: [], scenes: [] };
      let evolutionTransition = emptyTransition(routedState.currentWorldDays);
      if (isolationJob) {
        job.generationId = `${generationRoot}-evolve`;
        result = await callIsolatedWorldModel(routedState, isolationJob, job.generationId, job);
        if (!jobStillValid(job)) throw new Error('聊天或回复版本已经改变，本次推演结果已作废。');
        if (Number(result.base_revision) !== Number(baseState.revision)) {
          throw new Error(`隔离推演基线 revision ${result.base_revision} 与当前档案 ${baseState.revision} 不一致。`);
        }
        evolutionTransition = buildTransitionFromChanges(routedState, result, {
          currentStat: currentStat || {},
          currentTurnText: '',
          enforceKnowledgeBoundary: false,
        });
      }
      const transition = combineTransitions(routingTransition, evolutionTransition, routedState.currentWorldDays);
      transition.isolation_cursor = Math.max(0, Number(baseState?.isolationCursor) || 0) + (isolationJob ? 1 : 0);
      if (transition.operation_stats.rejected > 0) {
        console.warn('[天下演化] 部分结构化增量未通过机械校验', {
          accepted: transition.operation_stats.accepted,
          rejected: transition.operation_stats.rejected,
          warnings: transition.operation_stats.warnings,
          shapes: asArray(result.changes).map(change => ({
            op: asText(change?.op),
            collection: asText(change?.target?.collection),
            id: asText(change?.target?.id),
            keys: Object.keys(change || {}).slice(0, 12),
          })),
        });
      }
      const nextState = applyTransition(baseState, transition, messageKey, currentStat || {});
      const saved = saveChatState(nextState);
      refreshInjection(saved);
      const sceneCount =
        saved.parallelTurns.at(-1)?.messageId === messageId ? saved.parallelTurns.at(-1).scenes.length : 0;
      const proposedSceneCount = asArray(result.scenes).length;
      runtime.lastNotice = `第 ${messageId} 楼完成事实分流${isolationJob ? `与「${isolationJob.label}」隔离推演` : ''}：登记 ${routingTransition.turn_facts.length} 条事实，接受 ${saved.lastRun?.acceptedOperations ?? 0} 项增量，忽略 ${saved.lastRun?.rejectedOperations ?? 0} 项；生成 ${proposedSceneCount} 段旁线，收录 ${sceneCount} 段。`;
      showEvolutionBanner('success', '天下演化完成', runtime.lastNotice, { autoHideMs: 7000 });
      console.info('[天下演化] 结算完成', { chatId, messageId, revision: saved.revision });
      return saved;
    } catch (error) {
      const latestKey = getCurrentChatId() === chatId ? currentMessageKey(messageId) : null;
      if (
        source !== 'manual' &&
        !job.cancelled &&
        latestKey &&
        !sameMessageKey(latestKey, job.messageKey) &&
        settings.enabled &&
        settings.autoRun
      ) {
        runtime.lastError = '';
        runtime.lastNotice = `第 ${messageId} 楼仍在写回变量，已等待稳定版本后重新结算。`;
        hideEvolutionBanner();
        const replacement = createPendingSettlement(messageId, {
          force,
          type: 'normal',
          source: 'message-stabilized',
          waitForMvu: false,
        });
        if (replacement) {
          schedulePendingSettlement(replacement, { source: 'message-stabilized', delayMs: 350 });
        }
        console.info('[天下演化] 正文哈希在结算期间改变，旧结果已丢弃并重新排队。', {
          chatId,
          messageId,
          previousHash: job.messageKey.hash,
          nextHash: latestKey.hash,
        });
        return getChatState();
      }
      if (job.cancelled || isCancellationError(error)) {
        runtime.lastError = '';
        runtime.lastNotice = job.cancelReason || '本轮天下演化已取消。';
        showEvolutionBanner('cancelled', '天下演化已取消', runtime.lastNotice, { autoHideMs: 4500 });
        console.info('[天下演化] 本轮结算已取消', { chatId, messageId });
        return getChatState();
      }
      runtime.lastError = error instanceof Error ? error.message : String(error);
      showEvolutionBanner('error', '天下演化失败', runtime.lastError);
      console.error('[天下演化] 结算失败', error);
      throw error;
    } finally {
      if (runtime.activeJob === job) runtime.activeJob = null;
      runtime.busy = false;
      updateLampState();
      renderPanel();
    }
  }

  function cancelActiveJob(reason = '任务已取消', { notify = false } = {}) {
    const job = runtime.activeJob;
    if (!job) return;
    job.cancelled = true;
    job.cancelReason = reason;
    const error = cancellationError(reason);
    [...(job.cancelListeners || [])].forEach(reject => reject(error));
    job.cancelListeners?.clear();
    const stop = api('stopGenerationById');
    if (typeof stop === 'function') {
      try {
        stop(job.generationId);
      } catch {
        /* ignore */
      }
    }
    runtime.lastNotice = reason;
    if (notify) showEvolutionBanner('cancelled', '天下演化已取消', reason, { autoHideMs: 4500 });
  }

  function clearScheduledSettlement() {
    clearTimeout(runtime.scheduledTimer);
    runtime.scheduledTimer = null;
  }

  function clearPendingSettlement(ticketId = null) {
    if (ticketId != null && runtime.pendingTicket?.id !== ticketId) return false;
    clearScheduledSettlement();
    runtime.pendingTicket = null;
    return true;
  }

  function eligibleAssistantMessage(messageId, type = 'normal') {
    const normalizedType = String(type || '').toLowerCase();
    if (['quiet', 'extension', 'command', 'impersonate', 'first_message'].includes(normalizedType)) return null;
    if (isFirstFloor(messageId)) return null;
    const getLast = api('getLastMessageId');
    if (typeof getLast === 'function' && Number(getLast()) !== Number(messageId)) return null;
    const key = currentMessageKey(Number(messageId));
    if (!key || asText(key.message).length < 5) return null;
    return key;
  }

  function createPendingSettlement(
    messageId,
    { force = false, type = 'normal', source = 'auto', waitForMvu = runtime.mvuReady } = {},
  ) {
    const messageKey = eligibleAssistantMessage(messageId, type);
    if (!messageKey || !settings.enabled || !settings.autoRun) return null;
    const existing = runtime.pendingTicket;
    if (
      existing &&
      existing.chatId === getCurrentChatId() &&
      Number(existing.messageId) === Number(messageId) &&
      Number(existing.swipeId) === Number(messageKey.swipeId)
    ) {
      existing.force ||= Boolean(force);
      existing.messageKey = messageKey;
      existing.source = source;
      return existing;
    }
    clearPendingSettlement();
    const ticket = {
      id: ++runtime.ticketCounter,
      chatId: getCurrentChatId(),
      messageId: Number(messageId),
      swipeId: Number(messageKey.swipeId),
      messageKey,
      force: Boolean(force),
      source,
      createdAt: Date.now(),
    };
    runtime.pendingTicket = ticket;
    schedulePendingSettlement(ticket, {
      source: waitForMvu ? 'mvu-fallback' : source,
      delayMs: waitForMvu ? Math.max(settings.settleDelayMs + 12000, 15000) : settings.settleDelayMs,
    });
    return ticket;
  }

  function schedulePendingSettlement(
    ticket,
    { source = ticket?.source || 'auto', delayMs = settings.settleDelayMs } = {},
  ) {
    if (!ticket || runtime.pendingTicket?.id !== ticket.id) return;
    clearScheduledSettlement();
    runtime.scheduledTimer = setTimeout(
      () => {
        settlePendingTicket(ticket.id, source).catch(error => {
          console.error('[天下演化] 自动结算票据处理失败', error);
        });
      },
      Math.max(0, Number(delayMs) || 0),
    );
  }

  async function waitForStableMessage(ticketId, { intervalMs = 250, stableChecks = 3, timeoutMs = 5000 } = {}) {
    const startedAt = Date.now();
    let previous = null;
    let stableCount = 0;
    while (Date.now() - startedAt <= timeoutMs) {
      const ticket = runtime.pendingTicket;
      if (!ticket || ticket.id !== ticketId || ticket.chatId !== getCurrentChatId()) return null;
      const key = eligibleAssistantMessage(ticket.messageId, ticket.source);
      if (!key || Number(key.swipeId) !== Number(ticket.swipeId)) return null;
      if (previous && sameMessageKey(previous, key)) {
        stableCount += 1;
        if (stableCount >= stableChecks - 1) return key;
      } else {
        previous = key;
        stableCount = 0;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return null;
  }

  async function settlePendingTicket(ticketId, source = 'auto') {
    if (!settings.enabled || !settings.autoRun) {
      clearPendingSettlement(ticketId);
      return;
    }
    const stableKey = await waitForStableMessage(ticketId);
    const ticket = runtime.pendingTicket;
    if (!ticket || ticket.id !== ticketId) return;
    if (!stableKey) {
      clearPendingSettlement(ticketId);
      return;
    }
    if (!ticket.force && sameMessageKey(getChatState().lastProcessed, stableKey)) {
      clearPendingSettlement(ticketId);
      return;
    }
    if (runtime.busy) {
      schedulePendingSettlement(ticket, { source, delayMs: 350 });
      return;
    }
    const { messageId, force } = ticket;
    clearPendingSettlement(ticketId);
    try {
      await processMessage(messageId, { force, source });
    } catch {
      const current = currentMessageKey(messageId);
      if (current && !sameMessageKey(current, stableKey) && settings.enabled && settings.autoRun) {
        const replacement = createPendingSettlement(messageId, {
          force,
          type: 'normal',
          source: 'message-stabilized',
          waitForMvu: false,
        });
        if (replacement) schedulePendingSettlement(replacement, { source: 'message-stabilized', delayMs: 350 });
      }
    }
  }

  function releasePendingSettlementAfterMvu() {
    const ticket = runtime.pendingTicket;
    if (!ticket) return;
    const current = eligibleAssistantMessage(ticket.messageId, ticket.source);
    if (!current || Number(current.swipeId) !== Number(ticket.swipeId)) {
      clearPendingSettlement(ticket.id);
      return;
    }
    ticket.messageKey = current;
    // MVU 在 VARIABLE_UPDATE_ENDED 后仍可能继续写回聊天楼层；先留出窗口，再检查哈希稳定性。
    schedulePendingSettlement(ticket, { source: 'mvu', delayMs: 400 });
  }

  function scheduleForcedSettlement(messageId, source) {
    const ticket = createPendingSettlement(messageId, {
      force: true,
      type: 'normal',
      source,
      waitForMvu: false,
    });
    if (ticket) schedulePendingSettlement(ticket, { source, delayMs: settings.settleDelayMs });
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
        <div class="cwe-notice-body"><b>处理提示 ${index + 1}/${operationWarnings.length}</b><p>${escapeHtml(noticeLabel(value))}</p></div>
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
            const eventLocation = event.location || '地点未明';
            return `<article class="cwe-event-row ${tone}">
              <div class="cwe-event-when"><i></i><strong>${eventLabels[index]}</strong><b>${index === 0 ? '本轮' : `第 ${Math.max(1, state.revision - index)} 次`}</b><span class="cwe-event-location-rail">${escapeHtml(eventLocation)}</span></div>
              <div class="cwe-event-story">
                <header><h4>${escapeHtml(event.title || event.id || '未题名事件')}</h4>${tag(eventState, tone)}</header>
                <div class="cwe-event-location-full"><span aria-hidden="true">⌖</span>${escapeHtml(eventLocation)}</div>
                <p>${escapeHtml(event.summary || '值房尚未补录事件摘要。')}</p>
              </div>
              <dl class="cwe-event-detail"><div><dt>因由</dt><dd>${escapeHtml(cause)}</dd></div><div><dt>状态</dt><dd>${escapeHtml(eventState)}</dd></div><div><dt>影响</dt><dd>${escapeHtml(influence)}</dd></div></dl>
            </article>`;
          })
          .join('')
      : [
          ['待启', '首次推演尚未执行', '副模型完成第一轮结算后，天下世事会从这里开始入档。'],
          ['待录', '消息与人物行动尚未成卷', '主模型正文仍可正常进行；天下档案会按聊天独立保存。'],
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
          <p>${escapeHtml(focusDetail)}</p>
        </div>
        <div class="cwe-overview-status">
          <div class="cwe-statline" aria-label="天下演化统计">
            <span><i class="danger"></i>重大世事 <b>${state.activeEvents.length}</b></span>
            <span><i class="busy"></i>流转消息 <b>${state.intelPackets.length}</b></span>
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
            ${hook ? `<h3>${escapeHtml(hook.title || hook.id)}</h3><p>${escapeHtml(hook.summary)}</p><div class="cwe-hook-progress"><span>成熟度</span><i><b style="width:${hookProgress}%"></b></i></div><footer><span>${escapeHtml(statusLabel(hook.stage, '潜伏中'))}</span><span>${escapeHtml(hook.trigger ? `触发：${hook.trigger}` : '等待触发')}</span></footer>` : `<h3>伏线尚未入档</h3><p>完成一次推演后，未在玩家视角出现的因果会记录于此。</p><div class="cwe-hook-progress"><span>成熟度</span><i><b style="width:0%"></b></i></div>`}
          </section>
          <section>
            <header><small>可能延后的后果</small><b>${delayedConsequence ? '后果待至' : '尚待积累'}</b></header>
            <h3>${delayedConsequence ? '局势仍在暗处累积' : '暂无可见压力'}</h3>
            <p>${escapeHtml(delayedConsequence || '当前没有需要递延到后续回合的明确后果。')}</p>
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
        <header><div><small>${escapeHtml(item.channel || '未知渠道')} · ${Math.round(Number(item.reliability || 0) * 100)}%</small><h3>${escapeHtml(item.content)}</h3></div>${tag(statusLabel(item.status, '流转中'))}</header>
        <footer><span>${escapeHtml(item.origin || '未知')} → ${escapeHtml(item.destination || '未知')}</span><span>${escapeHtml(item.eta || '抵达时间未定')}</span></footer>
      </article>`,
          )
          .join('')
      : emptyBlock('暂无流转中的消息');
    return `<section class="cwe-section-head"><div><p>天下案牍</p><h2>世事与消息流转</h2></div><span>客观事件与消息传播分别记账</span></section>
      <section class="cwe-events-ledger">
        <div class="cwe-ledger-column"><header><h3>活跃世事</h3><span>${state.activeEvents.length} 件</span></header><div class="cwe-stack">${events}</div></div>
        <div class="cwe-ledger-column"><header><h3>消息流转</h3><span>${state.intelPackets.length} 条</span></header><div class="cwe-stack">${intel}</div></div>
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
        <div><h3>${escapeHtml(actor.name)}</h3><small>${escapeHtml(actor.location || '去向未明')}</small><p>${escapeHtml(actor.currentAction || actor.goal)}</p></div>
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
        <p>${escapeHtml(hook.summary)}</p>
        ${hook.trigger ? `<small>触发：${escapeHtml(hook.trigger)}</small>` : ''}
      </article>`,
          )
          .join('')
      : emptyBlock('暂无活跃伏线');
    const blindSpotCandidates = [
      ...asArray(state.turnFacts).map(fact => {
        const witnesses = uniqueTextList(fact?.witnesses, 24, 100);
        const traces = uniqueTextList(fact?.traces, 8, 120);
        const privateFact = fact?.visibility === 'private' || !witnesses.length;
        return {
          tone: privateFact ? '无人目击' : `有限可见·${witnesses.join('、')}`,
          value: [
            asText(fact?.content),
            asText(fact?.physicalResult) && `物理结果：${asText(fact.physicalResult)}`,
            traces.length && `可发现痕迹：${traces.join('、')}`,
          ]
            .filter(Boolean)
            .join('｜'),
        };
      }),
      ...asArray(state.secrets)
        .filter(secret => ['hidden', 'compromised'].includes(asText(secret?.status)))
        .map(secret => ({
          tone: `秘密·${asText(secret?.level, 'high')}`,
          value: `${asText(secret?.title)}｜${asText(secret?.content)}｜合法知情者：${
            uniqueTextList(secret?.holders, 30, 100).join('、') || '无人'
          }`,
        })),
      ...asArray(state.actors).flatMap(actor => [
        ...asArray(actor?.doesNotKnow).map(value => ({ tone: `${actorDisplayName(actor)}·不知道`, value })),
        ...normalizeKnowledgeLedger(actor?.knowledgeLedger, actor?.id)
          .filter(item => item.state === 'suspected')
          .map(item => ({ tone: `${actorDisplayName(actor)}·怀疑`, value: item.content })),
        ...normalizeKnowledgeLedger(actor?.knowledgeLedger, actor?.id)
          .filter(item => item.state === 'believed')
          .map(item => ({ tone: `${actorDisplayName(actor)}·误信/相信`, value: item.content })),
      ]),
      ...asArray(state.intelPackets)
        .filter(item => !intelHasArrived(item, state.currentWorldDays))
        .map(item => ({ tone: '流转中', value: intelPacketLabel(item) })),
      ...packet.uncertainties.map(value => ({ tone: '未证', value })),
    ];
    const blindSpotKeys = new Set();
    const blindSpots = blindSpotCandidates
      .filter(item => {
        const key = `${asText(item?.tone)}|${normalizedKnowledgeText(item?.value)}`;
        if (!asText(item?.value) || blindSpotKeys.has(key)) return false;
        blindSpotKeys.add(key);
        return true;
      })
      .slice(0, 60);
    const blindSpotCards = blindSpots.length
      ? blindSpots
          .map(
            item => `
      <article class="cwe-fact">
        <i></i>
        <div><p>${escapeHtml(item.value)}</p><small>${escapeHtml(item.tone)}</small></div>
      </article>`,
          )
          .join('')
      : emptyBlock('暂无流转中、未证或认知受限的信息');
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
          <label class="cwe-field"><span>副模型请求超时（秒）</span><input type="number" min="30" max="900" step="10" data-setting="requestTimeoutSeconds" value="${Math.round(settings.requestTimeoutMs / 1000)}"><small class="cwe-model-status">可设置 30—900 秒；到时仍未返回会停止本轮推演，并在酒馆主界面显示失败横幅。</small></label>
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
    const requestTimeoutSeconds = Number(get('requestTimeoutSeconds')?.value);
    return {
      enabled: Boolean(get('enabled')?.checked),
      autoRun: Boolean(get('autoRun')?.checked),
      lookbackRounds: Number(get('lookbackRounds')?.value),
      settleDelayMs: Number(get('settleDelayMs')?.value),
      requestTimeoutMs: Number.isFinite(requestTimeoutSeconds)
        ? requestTimeoutSeconds * 1000
        : settings.requestTimeoutMs,
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

  function hideEvolutionBanner() {
    clearTimeout(runtime.bannerTimer);
    runtime.bannerTimer = null;
    const banner = hostDocument.getElementById(BANNER_ID);
    if (banner) banner.hidden = true;
  }

  function showEvolutionBanner(kind, title, detail, { autoHideMs = 0, cancellable = false } = {}) {
    clearTimeout(runtime.bannerTimer);
    runtime.bannerTimer = null;
    const banner = hostDocument.getElementById(BANNER_ID);
    if (!banner) return;
    const safeKind = ['running', 'success', 'error', 'cancelled'].includes(kind) ? kind : 'running';
    const token = `${Date.now()}-${Math.random()}`;
    banner.dataset.bannerToken = token;
    banner.className = `cwe-host-banner is-${safeKind}`;
    banner.hidden = false;
    banner.setAttribute('role', safeKind === 'error' ? 'alert' : 'status');
    banner.innerHTML = `
      <div class="cwe-host-banner-mark" aria-hidden="true"><span>演</span></div>
      <div class="cwe-host-banner-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      <div class="cwe-host-banner-actions">
        ${cancellable ? '<button type="button" class="cwe-host-banner-cancel" data-banner-action="cancel">取消</button>' : ''}
        <button type="button" class="cwe-host-banner-close" data-banner-action="close" aria-label="关闭提示"><span aria-hidden="true">×</span></button>
      </div>`;
    banner.querySelector('[data-banner-action="close"]')?.addEventListener('click', hideEvolutionBanner);
    banner.querySelector('[data-banner-action="cancel"]')?.addEventListener('click', () => {
      clearPendingSettlement();
      cancelActiveJob('已由用户取消本轮天下演化。', { notify: true });
    });
    if (autoHideMs > 0) {
      runtime.bannerTimer = setTimeout(() => {
        if (banner.dataset.bannerToken === token) hideEvolutionBanner();
      }, autoHideMs);
    }
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
    hostDocument.getElementById(BANNER_ID)?.remove();
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
      #${BANNER_ID}[hidden]{display:none!important}
      #${BANNER_ID}{position:fixed;z-index:100004;top:max(12px,env(safe-area-inset-top));left:50%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;width:min(720px,calc(100vw - 28px));min-height:58px;padding:8px 10px 8px 9px;transform:translateX(-50%);overflow:hidden;border:1px solid rgba(104,78,43,.48);border-radius:12px;background:linear-gradient(102deg,rgba(251,244,221,.98),rgba(240,224,184,.98));box-shadow:0 12px 34px rgba(28,20,12,.28),inset 0 1px rgba(255,255,255,.72);color:#2e251a;font-family:"Noto Serif SC","Source Han Serif SC","Songti SC",serif;isolation:isolate;animation:cwe-banner-enter .24s cubic-bezier(.2,.8,.2,1)}
      #${BANNER_ID}:after{content:"";position:absolute;z-index:-1;inset:0;background:repeating-linear-gradient(110deg,transparent 0 18px,rgba(110,77,37,.025) 18px 19px);pointer-events:none}
      #${BANNER_ID}.is-running:before{content:"";position:absolute;left:0;bottom:0;width:42%;height:3px;background:linear-gradient(90deg,transparent,#a44232,#d39a50,transparent);animation:cwe-banner-progress 1.45s ease-in-out infinite}
      #${BANNER_ID}.is-success{border-color:rgba(63,110,82,.52)}
      #${BANNER_ID}.is-error{border-color:rgba(169,62,45,.62);background:linear-gradient(102deg,rgba(255,240,221,.98),rgba(239,211,177,.98))}
      #${BANNER_ID}.is-cancelled{filter:saturate(.72)}
      #${BANNER_ID} .cwe-host-banner-mark{display:grid;width:39px;height:39px;place-items:center;margin-right:10px;border:1px solid rgba(164,66,50,.5);border-radius:50%;background:rgba(255,250,233,.66);box-shadow:inset 0 0 0 3px rgba(164,66,50,.06)}
      #${BANNER_ID} .cwe-host-banner-mark span{font-size:18px;font-weight:800;color:#a44232}
      #${BANNER_ID}.is-success .cwe-host-banner-mark{border-color:rgba(58,112,82,.52)}
      #${BANNER_ID}.is-success .cwe-host-banner-mark span{color:#3d7358}
      #${BANNER_ID} .cwe-host-banner-copy{display:grid;min-width:0;gap:2px}
      #${BANNER_ID} .cwe-host-banner-copy strong{font-size:14px;letter-spacing:.08em}
      #${BANNER_ID} .cwe-host-banner-copy span{overflow:hidden;color:#695b49;font-family:"Noto Sans SC","Source Han Sans SC",sans-serif;font-size:12px;line-height:1.45;text-overflow:ellipsis;white-space:nowrap}
      #${BANNER_ID} .cwe-host-banner-actions{display:flex;align-items:center;gap:6px;margin-left:12px}
      #${BANNER_ID} button{min-height:34px;border:1px solid rgba(96,72,42,.28);border-radius:8px;background:rgba(255,251,238,.72);color:#514331;font:600 12px/1 "Noto Sans SC","Source Han Sans SC",sans-serif;cursor:pointer}
      #${BANNER_ID} button:hover{border-color:rgba(164,66,50,.52);color:#9b3f30}
      #${BANNER_ID} .cwe-host-banner-cancel{padding:0 14px;border-color:rgba(164,66,50,.42);color:#993f31}
      #${BANNER_ID} .cwe-host-banner-close{display:grid;width:34px;padding:0;place-items:center;font-size:20px;font-weight:400}
      @media(max-width:720px){#${BANNER_ID}{top:max(8px,env(safe-area-inset-top));width:calc(100vw - 16px);min-height:62px;padding:8px;grid-template-columns:auto minmax(0,1fr) auto;border-radius:10px}#${BANNER_ID} .cwe-host-banner-mark{width:36px;height:36px;margin-right:8px}#${BANNER_ID} .cwe-host-banner-copy strong{font-size:13px}#${BANNER_ID} .cwe-host-banner-copy span{font-size:11px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}#${BANNER_ID} .cwe-host-banner-actions{margin-left:7px;gap:4px}#${BANNER_ID} button{min-height:40px}#${BANNER_ID} .cwe-host-banner-cancel{padding:0 10px}#${BANNER_ID} .cwe-host-banner-close{width:32px}}
      @keyframes cwe-banner-enter{from{opacity:0;transform:translate(-50%,-12px) scale(.985)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
      @keyframes cwe-banner-progress{0%{transform:translateX(-110%)}50%{transform:translateX(120%)}100%{transform:translateX(260%)}}
      @keyframes cwe-lamp-pulse{50%{opacity:.35;transform:scale(.75)}}`;
    hostDocument.head.append(style);

    const banner = hostDocument.createElement('section');
    banner.id = BANNER_ID;
    banner.className = 'cwe-host-banner';
    banner.hidden = true;
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-atomic', 'true');
    hostDocument.body.append(banner);

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

    on(events.GENERATE_AFTER_DATA, (generateData, dryRun) => {
      const snapshot = chatPromptSnapshot(
        generateData?.prompt,
        dryRun ? 'dry-run/generate-after-data' : 'generate-after-data',
      );
      if (runtime.dryRunCapture && dryRun !== false) {
        runtime.dryRunCapture.resolve(snapshot);
      }
    });
    on(events.CHAT_COMPLETION_PROMPT_READY, ({ chat, dryRun } = {}) => {
      const snapshot = chatPromptSnapshot(chat, dryRun ? 'dry-run/chat-completion' : 'chat-completion');
      if (runtime.dryRunCapture && dryRun !== false) {
        runtime.dryRunCapture.resolve(snapshot);
      }
    });
    on(events.GENERATE_AFTER_COMBINE_PROMPTS, ({ prompt, dryRun } = {}) => {
      const snapshot = textPromptSnapshot(prompt, dryRun ? 'dry-run/text-completion' : 'text-completion');
      if (runtime.dryRunCapture && dryRun !== false) {
        runtime.dryRunCapture.resolve(snapshot);
      }
    });
    on(events.MESSAGE_RECEIVED, (messageId, type) => {
      createPendingSettlement(Number(messageId), {
        force: ['regenerate', 'swipe'].includes(String(type || '').toLowerCase()),
        type,
        source: 'message-received',
        waitForMvu: runtime.mvuReady,
      });
    });
    const mvu = api('Mvu');
    if (mvu?.events?.VARIABLE_UPDATE_ENDED) {
      on(mvu.events.VARIABLE_UPDATE_ENDED, () => {
        if (!settings.enabled || !settings.autoRun) return;
        releasePendingSettlementAfterMvu();
      });
    }
    on(events.MESSAGE_SWIPED, messageId => {
      if (!settings.enabled || !settings.autoRun) return;
      if (isFirstFloor(messageId)) return;
      scheduleForcedSettlement(Number(messageId), 'swipe');
    });
    on(events.MESSAGE_EDITED, messageId => {
      runtime.promptSnapshots.delete(Number(messageId));
      if (!settings.enabled || !settings.autoRun) return;
      if (isFirstFloor(messageId)) return;
      const key = currentMessageKey(Number(messageId));
      if (key) scheduleForcedSettlement(Number(messageId), 'edit');
    });
    on(events.MESSAGE_DELETED, () => {
      clearPendingSettlement();
      runtime.promptSnapshots.clear();
      setTimeout(reconcileAfterHistoryChange, 250);
    });
    on(events.CHAT_CHANGED, chatId => {
      cancelActiveJob('已切换聊天，旧聊天的推演结果将被丢弃。');
      hideEvolutionBanner();
      clearPendingSettlement();
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
    clearPendingSettlement();
    clearTimeout(runtime.bannerTimer);
    clearInterval(runtime.themeTimer);
    clearInterval(runtime.integrityTimer);
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
    hostDocument.getElementById(BANNER_ID)?.remove();
    hostDocument.getElementById(STYLE_ID)?.remove();
    if (hostWindow[RUNTIME_KEY] === runtime) delete hostWindow[RUNTIME_KEY];
  }

  async function bootstrap() {
    const waitForGlobal = api('waitGlobalInitialized');
    if (typeof waitForGlobal !== 'function') throw new Error('未找到酒馆助手全局初始化接口。');
    await waitForGlobal('Mvu');
    runtime.mvuReady = Boolean(api('Mvu'));
    runtime.currentChatId = getCurrentChatId();
    const initialState = getChatState();
    mountUi();
    runtime.themeTimer = setInterval(syncStatusbarTheme, 600);
    runtime.integrityTimer = setInterval(reconcileStateStorage, STORAGE_INTEGRITY_INTERVAL_MS);
    registerEvents();
    if (settings.enabled) refreshInjection(initialState);
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
