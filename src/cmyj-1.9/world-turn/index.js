import { normalReplyAnchor, worldClockKey } from './logic.js';

const RUNTIME_KEY = '__CMYJWorldTurnRuntimeV1';
const STATE_KEY = 'canming_world_turn_v1';
const STATE_EVENT = 'canming-world-turn-state';
const BANNER_ID = 'canming-world-turn-banner';
const STYLE_ID = 'canming-world-turn-style';
const DEFAULT_INTERVAL = 8;
const MIN_INTERVAL = 3;
const MAX_INTERVAL = 30;
const STALE_RUNNING_MS = 10 * 60 * 1000;

const WORLD_TURN_PROMPT = `你现在不是续写主角当前场景，而是执行一次独立的“天下推演”。

目标：以上帝视角，根据聊天历史、世界书、当前 MVU 变量与已经发生的剧情，推演同一世界中各地势力、人物与未决事件在这段时间里的自然发展。世界不会因主角不在场而停止。

硬性规则：
1. 不续写主角当前动作，不代替玩家行动，不要求玩家重新输入。
2. 使用全知叙述，但严格保持因果、交通、情报传播、行政效率与明末历史条件；不得为了热闹强造大事。
3. 角色和势力只能依据各自掌握的信息行动。报告可以写客观真相，但普通正文中的主角不能因此自动知情。
4. 各栏目都不是必填。没有值得记录的变化就省略该栏目；若整体没有显著变化，只需简短说明，不要编造变化填满格式。
5. 对已经发生、足以改变长期世界状态的结果，必须按照现有 MVU 变量更新规则输出 <UpdateVariable>。没有变量需要改变时仍输出合法的空 JSONPatch 数组。
6. 天下地图、势力关系、关键人物与未决事项是客观世界状态，不受主角是否知情限制；但不得事无巨细扩写全国，只更新本次推演确实发生实质变化的部分。
7. 不输出普通正文、思维链、解释、前言或结语，只输出报告和变量更新。

报告格式：
<world_turn>
【推演时段】本次推演覆盖的世界内时间范围
【天下大势】全国层面的显著趋势或“暂无显著变化”
【地区与势力】只写发生实质变化的地区或势力
【关键人物】只写发生关键行动、决策或处境变化的人物
【未决事项】只写长线事件的新进展、等待条件或风险变化
【确定影响】只写已经落地、将约束后续剧情的后果
</world_turn>

省略没有内容的标题。随后严格按当前角色卡的变量输出格式给出 <UpdateVariable>。`;

const getHostWindow = () => window.parent ?? window;
const getHostDocument = () => getHostWindow().document ?? document;

function clampInterval(value) {
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(Number(value) || DEFAULT_INTERVAL)));
}

function freshState(clock = '') {
  return {
    version: 1,
    enabled: true,
    interval: DEFAULT_INTERVAL,
    progress: 0,
    status: 'countdown',
    handledAnchors: [],
    lastClock: clock,
    lastError: '',
    runningSince: 0,
    lastSuccessAt: 0,
  };
}

function normalizeState(input, clock = '') {
  const state = { ...freshState(clock), ...(input && typeof input === 'object' ? input : {}) };
  state.enabled = state.enabled !== false;
  state.interval = clampInterval(state.interval);
  state.progress = Math.min(state.interval, Math.max(0, Math.round(Number(state.progress) || 0)));
  state.handledAnchors = Array.isArray(state.handledAnchors)
    ? state.handledAnchors.filter(value => typeof value === 'string').slice(-64)
    : [];
  state.lastClock = String(state.lastClock || clock || '');
  state.lastError = String(state.lastError || '');
  state.runningSince = Number(state.runningSince || 0);
  state.lastSuccessAt = Number(state.lastSuccessAt || 0);
  if (!state.enabled) state.status = 'disabled';
  else if (!['countdown', 'waiting_mvu', 'waiting_time', 'simulating', 'writing', 'success', 'failed'].includes(state.status))
    state.status = state.progress >= state.interval ? 'waiting_time' : 'countdown';
  if (
    ['simulating', 'writing'].includes(state.status) &&
    (!state.runningSince || Date.now() - state.runningSince > STALE_RUNNING_MS)
  ) {
    state.status = 'failed';
    state.lastError = '上次推演在完成前中断，请重试。';
    state.runningSince = 0;
  }
  return state;
}

function readState(clock = '') {
  try {
    return normalizeState(getVariables({ type: 'chat' })?.[STATE_KEY], clock);
  } catch {
    return normalizeState(null, clock);
  }
}

function saveState(state) {
  const normalized = normalizeState(state);
  try {
    insertOrAssignVariables({ [STATE_KEY]: normalized }, { type: 'chat' });
  } catch (error) {
    console.warn('[天下推演] 保存聊天状态失败:', error);
  }
  return normalized;
}

function latestStatData() {
  try {
    const mvu = globalThis.Mvu ?? window.parent?.Mvu;
    return mvu?.getMvuData?.({ type: 'message', message_id: 'latest' })?.stat_data || {};
  } catch {
    return {};
  }
}

function currentWorldClockKey(statData = latestStatData()) {
  return worldClockKey(statData);
}

function publicState(state) {
  const normalized = normalizeState(state);
  return {
    ...normalized,
    remaining: Math.max(0, normalized.interval - normalized.progress),
    canRetry: normalized.status === 'failed',
    canSkip: ['failed', 'waiting_time'].includes(normalized.status),
  };
}

function emitState(runtime) {
  runtime.state = saveState(runtime.state);
  renderBanner(runtime);
  getHostWindow().dispatchEvent(new CustomEvent(STATE_EVENT, { detail: publicState(runtime.state) }));
}

function bannerCopy(state) {
  if (state.status === 'simulating') return ['正在推演天下大势', '山河未眠，诸事正在暗处生长'];
  if (state.status === 'writing') return ['推演完成，正在落定世局', '正在核定并保存这一次世界变化'];
  if (state.status === 'waiting_time') return ['推演时机已到', '故事时间尚未流逝，推进后将自动开始'];
  if (state.status === 'failed') return ['天下推演中断', state.lastError || '点击提示打开设置，可重试或跳过'];
  if (state.status === 'success') return ['本次天下推演已入卷', `下一次推演还需 ${state.interval} 轮正文`];
  return ['天下推演', '点击打开设置'];
}

function ensureBannerStyle() {
  const doc = getHostDocument();
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `#${BANNER_ID}{--wt-paper:rgba(35,27,20,.94);--wt-ink:#f0dfbd;--wt-muted:#bda682;--wt-cinnabar:#c9634c;position:fixed;z-index:99996;top:max(10px,env(safe-area-inset-top));left:50%;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;width:min(520px,calc(100vw - 24px));padding:9px 13px 9px 10px;transform:translateX(-50%);border:1px solid rgba(202,163,102,.22);border-radius:4px;background:repeating-linear-gradient(90deg,transparent 0 25px,rgba(255,255,255,.012) 26px),linear-gradient(150deg,var(--wt-paper),rgba(23,18,14,.96));box-shadow:0 12px 32px rgba(0,0,0,.28);color:var(--wt-ink);font-family:"Noto Serif SC","Songti SC","STSong","SimSun",serif;cursor:pointer;backdrop-filter:blur(13px);animation:canming-world-turn-in .3s ease-out}#${BANNER_ID}::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(var(--wt-cinnabar),rgba(201,99,76,.3))}#${BANNER_ID}:hover{border-color:rgba(202,163,102,.42);box-shadow:0 15px 38px rgba(0,0,0,.34)}#${BANNER_ID} .wt-seal{display:grid;width:31px;height:31px;place-items:center;border:1px solid var(--wt-cinnabar);color:var(--wt-cinnabar);font-size:16px;transform:rotate(-3deg)}#${BANNER_ID} .wt-copy{min-width:0}#${BANNER_ID} strong,#${BANNER_ID} small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#${BANNER_ID} strong{font-size:13px;letter-spacing:.08em}#${BANNER_ID} small{margin-top:2px;color:var(--wt-muted);font-size:10px;letter-spacing:.025em}#${BANNER_ID} .wt-mark{color:var(--wt-cinnabar);font-size:11px;letter-spacing:.08em;white-space:nowrap}#${BANNER_ID}[data-status="simulating"] .wt-seal,#${BANNER_ID}[data-status="writing"] .wt-seal{animation:canming-world-turn-pulse 1.35s ease-in-out infinite}#${BANNER_ID}[data-status="failed"]{--wt-cinnabar:#d35b51}@keyframes canming-world-turn-in{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}@keyframes canming-world-turn-pulse{50%{box-shadow:0 0 0 5px rgba(201,99,76,.1);transform:rotate(3deg)}}@media(max-width:540px){#${BANNER_ID}{top:max(7px,env(safe-area-inset-top));width:calc(100vw - 16px);padding-right:10px}#${BANNER_ID} .wt-mark{display:none}}`;
  doc.head.append(style);
}

function openSettings() {
  const actions = getHostWindow().CanmingStatusbarActions;
  if (typeof actions?.openSettings === 'function') actions.openSettings('world-turn');
  else getHostWindow().dispatchEvent(new CustomEvent('canming-world-turn-open-settings'));
}

function renderBanner(runtime) {
  const doc = getHostDocument();
  const visibleStatuses = ['waiting_time', 'simulating', 'writing', 'success', 'failed'];
  clearTimeout(runtime.bannerHideTimer);
  runtime.bannerHideTimer = null;
  if (!runtime.state.enabled || !visibleStatuses.includes(runtime.state.status))
    return void doc.getElementById(BANNER_ID)?.remove();
  ensureBannerStyle();
  let banner = doc.getElementById(BANNER_ID);
  if (!banner) {
    banner = doc.createElement('aside');
    banner.id = BANNER_ID;
    banner.tabIndex = 0;
    banner.setAttribute('role', 'button');
    banner.setAttribute('aria-label', '打开天下推演设置');
    banner.innerHTML = '<span class="wt-seal">演</span><span class="wt-copy"><strong></strong><small></small></span><span class="wt-mark">山河自转</span>';
    banner.addEventListener('click', openSettings);
    banner.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openSettings();
      }
    });
    doc.body.append(banner);
  }
  const [title, detail] = bannerCopy(runtime.state);
  banner.dataset.status = runtime.state.status;
  banner.querySelector('strong').textContent = title;
  banner.querySelector('small').textContent = detail;
  if (runtime.state.status === 'waiting_time') {
    runtime.bannerHideTimer = setTimeout(() => {
      if (runtime.state.status === 'waiting_time') doc.getElementById(BANNER_ID)?.remove();
    }, 6500);
  }
}

async function handleCompletedReply(runtime, messageId, generationType = '') {
  if (runtime.disposed || runtime.running || generationType === 'first_message') return;
  const messages = (() => {
    try {
      return getChatMessages(`0-${messageId}`) || [];
    } catch {
      return null;
    }
  })();
  if (!messages) return;
  const anchor = normalReplyAnchor(messages, messageId);
  if (!anchor || runtime.state.handledAnchors.includes(anchor)) return;
  runtime.state.handledAnchors = [...runtime.state.handledAnchors, anchor].slice(-64);
  if (!runtime.state.enabled) return void emitState(runtime);
  runtime.state.progress = Math.min(runtime.state.interval, runtime.state.progress + 1);
  runtime.state.lastError = '';
  if (runtime.state.progress < runtime.state.interval) {
    runtime.state.status = 'countdown';
    return void emitState(runtime);
  }
  const clock = currentWorldClockKey();
  if (runtime.state.lastClock && clock && clock === runtime.state.lastClock) {
    runtime.state.status = 'waiting_time';
    return void emitState(runtime);
  }
  await runWorldTurn(runtime, { manual: false });
}

function scheduleCompletedReply(runtime, messageId, generationType) {
  if (!Number.isInteger(messageId) || messageId < 0) return;
  const existing = runtime.pendingMessages.get(messageId);
  if (existing) clearTimeout(existing.timer);
  if (runtime.state.enabled) {
    runtime.state.status = 'waiting_mvu';
    emitState(runtime);
  }
  const pending = {
    attempts: 0,
    timer: null,
    mvuCompleted: !runtime.normalMvuRunning && Date.now() - runtime.lastMvuEndedAt < 2500,
  };
  const inspect = () => {
    pending.attempts += 1;
    let message = null;
    try {
      message = getChatMessages(messageId)?.[0] ?? null;
    } catch {
      // 切换聊天或楼层尚未落盘时继续等待，不让轮询定时器直接中断。
    }
    if ((pending.mvuCompleted && message?.data?.stat_data) || pending.attempts >= 600) {
      runtime.pendingMessages.delete(messageId);
      if (pending.mvuCompleted && message?.data?.stat_data)
        void handleCompletedReply(runtime, messageId, generationType);
      else if (runtime.state.status === 'waiting_mvu') {
        runtime.state.status = runtime.state.progress >= runtime.state.interval ? 'waiting_time' : 'countdown';
        emitState(runtime);
        console.warn('[天下推演] 等待本轮 MVU 更新超时，本轮暂不计数。');
      }
      return;
    }
    pending.timer = setTimeout(inspect, 1000);
  };
  pending.timer = setTimeout(inspect, 0);
  runtime.pendingMessages.set(messageId, pending);
}

function normalizeGeneratedText(result) {
  const text = typeof result === 'string' ? result : result?.content;
  if (!String(text || '').trim()) throw new Error('模型没有返回推演内容。');
  const normalized = String(text)
    .trim()
    .replace(/^```(?:html|xml|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!/<world_turn>[\s\S]*?<\/world_turn>/i.test(normalized))
    throw new Error('模型返回中缺少 <world_turn> 推演报告。');
  return normalized;
}

async function runWorldTurn(runtime, { manual = false } = {}) {
  if (runtime.running || (!manual && !runtime.state.enabled)) return false;
  runtime.running = true;
  runtime.state.status = 'simulating';
  runtime.state.runningSince = Date.now();
  runtime.state.lastError = '';
  emitState(runtime);
  const generationId = `canming-world-turn-${Date.now().toString(36)}`;
  try {
    const mvu = globalThis.Mvu ?? window.parent?.Mvu;
    const generateText = globalThis.generate ?? window.parent?.generate;
    const createMessages = globalThis.createChatMessages ?? window.parent?.createChatMessages;
    if (!mvu?.getMvuData || !mvu?.parseMessage) throw new Error('MVU 尚未初始化。');
    if (typeof generateText !== 'function' || typeof createMessages !== 'function') throw new Error('酒馆生成接口不可用。');
    const result = await generateText({
      generation_id: generationId,
      user_input: WORLD_TURN_PROMPT,
      should_stream: true,
      should_silence: false,
      injects: [{ role: 'system', position: 'in_chat', depth: 0, should_scan: true, content: '本次请求处于【天下推演模式】。忽略普通续写要求，严格执行用户输入中的天下推演格式。' }],
    });
    const message = normalizeGeneratedText(result);
    runtime.state.status = 'writing';
    emitState(runtime);
    const oldData = _.cloneDeep(mvu.getMvuData({ type: 'message', message_id: 'latest' }) || {});
    const parsedData = (await mvu.parseMessage(message, oldData)) || oldData;
    await createMessages([{ role: 'assistant', message, data: parsedData, extra: { canming_world_turn: true, generated_at: Date.now() } }]);
    runtime.state.progress = 0;
    runtime.state.status = 'success';
    runtime.state.runningSince = 0;
    runtime.state.lastSuccessAt = Date.now();
    runtime.state.lastClock = worldClockKey(parsedData.stat_data || oldData.stat_data || {});
    emitState(runtime);
    clearTimeout(runtime.successTimer);
    runtime.successTimer = setTimeout(() => {
      if (runtime.state.status === 'success') {
        runtime.state.status = 'countdown';
        emitState(runtime);
      }
    }, 5000);
    console.info('[天下推演] 推演消息与 MVU 变量已写入。');
    return true;
  } catch (error) {
    runtime.state.status = 'failed';
    runtime.state.runningSince = 0;
    runtime.state.lastError = error?.message || String(error) || '未知错误';
    emitState(runtime);
    console.error('[天下推演] 执行失败:', error);
    return false;
  } finally {
    runtime.running = false;
  }
}

function exposeApi(runtime) {
  const finishReset = () => {
    runtime.state.progress = 0;
    runtime.state.status = runtime.state.enabled ? 'countdown' : 'disabled';
    runtime.state.lastError = '';
    runtime.state.runningSince = 0;
    runtime.state.lastClock = currentWorldClockKey();
    emitState(runtime);
    return publicState(runtime.state);
  };
  getHostWindow().CanmingWorldTurn = {
    _owner: runtime.owner,
    getState: () => publicState(runtime.state),
    setEnabled: enabled => {
      runtime.state.enabled = Boolean(enabled);
      runtime.state.status = runtime.state.enabled ? (runtime.state.progress >= runtime.state.interval ? 'waiting_time' : 'countdown') : 'disabled';
      if (runtime.state.enabled && !runtime.state.lastClock) runtime.state.lastClock = currentWorldClockKey();
      emitState(runtime);
      return publicState(runtime.state);
    },
    setInterval: interval => {
      runtime.state.interval = clampInterval(interval);
      return finishReset();
    },
    runNow: () => runWorldTurn(runtime, { manual: true }),
    retry: () => runWorldTurn(runtime, { manual: true }),
    reset: finishReset,
    skip: finishReset,
  };
}

function loadCurrentChat(runtime) {
  const clock = currentWorldClockKey();
  runtime.state = readState(clock);
  if (!runtime.state.lastClock) runtime.state.lastClock = clock;
  emitState(runtime);
}

function dispose(runtime) {
  runtime.disposed = true;
  clearTimeout(runtime.successTimer);
  clearTimeout(runtime.bannerHideTimer);
  for (const pending of runtime.pendingMessages.values()) clearTimeout(pending.timer);
  runtime.pendingMessages.clear();
  runtime.offMessage?.stop?.();
  runtime.offChat?.stop?.();
  runtime.offMvuStarted?.stop?.();
  runtime.offMvuEnded?.stop?.();
  getHostDocument().getElementById(BANNER_ID)?.remove();
  if (getHostWindow().CanmingWorldTurn?._owner === runtime.owner) delete getHostWindow().CanmingWorldTurn;
}

async function bootstrap() {
  const host = getHostWindow();
  host[RUNTIME_KEY]?.dispose?.();
  try {
    await waitGlobalInitialized('Mvu');
  } catch {
    // 生成时会再次检查 MVU。
  }
  const runtime = {
    owner: {},
    state: freshState(currentWorldClockKey()),
    pendingMessages: new Map(),
    running: false,
    normalMvuRunning: false,
    lastMvuEndedAt: 0,
    disposed: false,
    successTimer: null,
    bannerHideTimer: null,
    offMessage: null,
    offChat: null,
    offMvuStarted: null,
    offMvuEnded: null,
    dispose: null,
  };
  runtime.dispose = () => dispose(runtime);
  host[RUNTIME_KEY] = runtime;
  exposeApi(runtime);
  loadCurrentChat(runtime);
  runtime.offMessage = eventOn(tavern_events.MESSAGE_RECEIVED, (messageId, generationType) => {
    if (!runtime.running && generationType !== 'first_message') scheduleCompletedReply(runtime, messageId, generationType);
  });
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  if (mvu?.events?.VARIABLE_UPDATE_STARTED) {
    runtime.offMvuStarted = eventOn(mvu.events.VARIABLE_UPDATE_STARTED, () => {
      if (!runtime.running) runtime.normalMvuRunning = true;
    });
  }
  if (mvu?.events?.VARIABLE_UPDATE_ENDED) {
    runtime.offMvuEnded = eventOn(mvu.events.VARIABLE_UPDATE_ENDED, () => {
      if (runtime.running) return;
      runtime.normalMvuRunning = false;
      runtime.lastMvuEndedAt = Date.now();
      const pendingIds = [...runtime.pendingMessages.keys()];
      const latestId = pendingIds.length ? Math.max(...pendingIds) : null;
      if (latestId !== null) runtime.pendingMessages.get(latestId).mvuCompleted = true;
    });
  }
  runtime.offChat = eventOn(tavern_events.CHAT_CHANGED, () => {
    for (const pending of runtime.pendingMessages.values()) clearTimeout(pending.timer);
    runtime.pendingMessages.clear();
    runtime.running = false;
    runtime.normalMvuRunning = false;
    runtime.lastMvuEndedAt = 0;
    setTimeout(() => loadCurrentChat(runtime), 0);
  });
  window.addEventListener('pagehide', runtime.dispose, { once: true });
}

$(() => void bootstrap());
