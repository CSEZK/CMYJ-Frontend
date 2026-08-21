import { isWorldTurnMessage, normalReplyAnchor, reconcileWorldTurnHistory, worldClockKey } from './logic.js';

const RUNTIME_KEY = '__CMYJWorldTurnRuntimeV1';
const STATE_KEY = 'canming_world_turn_v1';
const STATE_EVENT = 'canming-world-turn-state';
const BANNER_ID = 'canming-world-turn-banner';
const STYLE_ID = 'canming-world-turn-style';
const DEFAULT_INTERVAL = 8;
const MIN_INTERVAL = 3;
const MAX_INTERVAL = 30;
const STALE_RUNNING_MS = 10 * 60 * 1000;
const MVU_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const DELETE_WAIT_TIMEOUT_MS = 5000;
const WORLD_TURN_MVU_SCOPE =
  '<mvu_update_scope>\n【本条专用强制规则，必须优先执行】本条是天下推演的回顾结算，变量更新必须以本条 <world_turn> 为直接依据。必须检查并更新其中已经落地的客观结果与已经开始的客观行动；不得忽略本条而重复结算上一条普通正文，“酝酿中”的预期结果不得写成事实。允许且应优先更新 天下地图.地区态势、天下地图.世局线、时局与任务.势力关系中的客观经济与军事、离场人物的客观长期状态；严禁更新 世界运转、主角、个人史记、人际网络.在场角色，也不得仅因后台事实改变势力对主角的好感度、状态或关系摘要。时局与任务.未决事项仅在报告中的事实直接改变既有事项时更新。若没有符合范围的变化，允许少更新或不更新，禁止为了产生更新而触碰禁区变量；不得凭空补全报告未证实的精确数值，信息不足时只作定性描述。\n</mvu_update_scope>';

function worldClockLabel(statData = latestStatData()) {
  const date = String(_.get(statData, '世界运转.当前日期', '') || '').trim();
  const hour = Number(_.get(statData, '世界运转.二十四时.小时'));
  const minute = Number(_.get(statData, '世界运转.二十四时.分钟'));
  const time = Number.isFinite(hour)
    ? `${String(Math.max(0, Math.round(hour))).padStart(2, '0')}:${String(Number.isFinite(minute) ? Math.max(0, Math.round(minute)) : 0).padStart(2, '0')}`
    : '';
  return [date, time].filter(Boolean).join(' ') || worldClockKey(statData) || '未知';
}

function worldTurnPeriod(runtime, statData = latestStatData(), periodOverride = '') {
  if (String(periodOverride || '').trim()) return String(periodOverride).trim();
  const startClock = runtime.state.lastClock || '未记录（以最近一次现存推演为准）';
  return `${startClock} → ${worldClockLabel(statData)}`;
}

function buildWorldTurnPrompt(runtime, statData = latestStatData(), periodOverride = '') {
  const period = worldTurnPeriod(runtime, statData, periodOverride);
  return `你现在不是续写主角当前场景，也不是生成“平行世界”中的场外镜头，而是执行一次独立的宏观“天下推演”。

本轮时间边界：「${period}」。只回顾该时段内在正常正文中已经流逝的世界时间；推演本身不产生额外耗时。

目标：以上帝视角，根据聊天历史、世界书、历史时间线、当前 MVU 变量与既有世局线，完成一份高信息密度的宏观因果演算。说明世界如何由状态 A 走到状态 B，以及不同地区、势力、资源和人物行动如何互相牵动。

硬性规则：
1. 不续写主角当前动作，不代替玩家行动，不要求玩家重新输入。
2. 禁止写场景、环境铺陈、人物对白、心理独白和动作过程；这些属于每轮正文末尾的“平行世界”。天下推演只能提炼其已经成立的宏观后果，不得复述或扩写镜头。
3. 主角及其势力只有在行动已经改变地区、资源、势力或传播链时才进入报告；不得让全国事件等待主角处理、为主角铺路或强行与主角建立联系。
4. 使用全知视角记录客观事实，但每个行动者仍只能依据自己掌握的信息决策；严格遵守交通、情报传播、行政效率、资源约束与明末历史条件。
5. 事件尺度必须匹配实际流逝时间：数刻至数时辰只够下令、试探、启程、局部交易或小规模行动；数日才可能出现调兵、谈判、价格与治安变化；更长时间才允许势力格局显著改变。不得为了热闹强造大事。
6. 优先延续已有世局线，其次处理历史时间线、势力内部目标与资源矛盾，最后才考虑开启新线。领域可包括政治、军事、财赋、粮价、商路、民生、人口流动、灾害、治安、派系、技术、军备、关键人物与情报传播；不要每轮都只写战争或同一批人。
7. “棋局推进”通常列出 6—10 项真正改变行动条件、资源、认知或局势的变化；时间很短或变化稀少时可以减至 3—5 项，不得用气氛、常识和同义复述凑数。
8. 每项采用“动因与目标 → 已经采取的行动 → 当前结果 → 外溢影响”的因果链。状态只用：已落地、进行中、酝酿中。已落地=行动已有明确结果；进行中=行动客观开始但结果未定；酝酿中=条件、意图或准备已出现，不得把预期结果写成事实。
9. “连锁反应”只连接报告中至少两项彼此影响的变化，用箭头写出跨地区、跨领域或跨势力的传导，不重复原文。
10. “世局线”只列本轮新生、推进、转折、停滞或收束的长线；没有变化的旧线不复读。同一因果链不得改名另建。
11. “历史偏移”仅在历史事件的前提被保留、推迟、破坏或改写时输出；说明偏移依据，不强迫世界回到原历史。
12. 不把 时局与任务.未决事项 当作议程。玩家备忘录只有被本轮客观事实直接改变时，才由后续 MVU 更新。
13. 不输出普通正文、思维链、解释、前言、结语或 <UpdateVariable>，只输出一组 <world_turn> 报告。报告写入聊天后会由 MVU 副模型结算客观变量。

报告格式：
<world_turn>
【推演时段】
写明起止时刻与实际历时。

【天下总势】
用2—4句话概括谁在取得主动、主要资源瓶颈、正在扩散的矛盾及总体方向，不逐条复述下文。

【棋局推进】
[军事·辽东｜已落地]
动因：后金粮储承压，需要缩短补给线。
行动：撤回三处外围哨骑，兵力集中保护运输线。
结果：明军误判为退兵，两个营已经前压。
外溢：双方接触距离缩短，辽东遭遇战风险上升。
情报：调动尚未传至京师，辽东经略已收到塘报。

[财赋·江南｜进行中]
继续按相同结构列出其他有效变化；“情报”仅在传播边界重要时填写。

【连锁反应】
- 江南漕粮延误 → 京畿粮价承压 → 边军拨饷顺序调整
- 后金收缩外围 → 明军误判前压 → 辽东遭遇战风险上升

【世局线】
- [推进·高] 漕运失衡：写本轮变化与仍在起作用的驱动力。
- [转折·中] 辽东试探：写转折后的当前态势。
- [收束] 已结束的旧线：写最终结果。

【历史偏移】
仅在确有偏移时写；否则整栏省略。
</world_turn>

【推演时段】【天下总势】【棋局推进】必须存在；【连锁反应】【世局线】【历史偏移】没有真实内容时整栏省略，不得用“暂无变化”占位或编造联系。整份报告通常约800—1200字，实际变化不足时可以更短，以信息密度为先。`;
}

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
  else if (
    !['countdown', 'waiting_mvu', 'waiting_time', 'simulating', 'writing', 'success', 'failed'].includes(state.status)
  )
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
  if (typeof actions?.openWorldTurn === 'function') actions.openWorldTurn();
  else if (typeof actions?.openSettings === 'function') actions.openSettings('world-turn');
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
    banner.innerHTML =
      '<span class="wt-seal">演</span><span class="wt-copy"><strong></strong><small></small></span><span class="wt-mark">山河自转</span>';
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
  const report = normalized.match(/<world_turn>[\s\S]*?<\/world_turn>/i)?.[0];
  if (!report) throw new Error('模型返回中缺少 <world_turn> 推演报告。');
  return report.trim();
}

function preserveWorldTurnScene(variables, beforeVariables) {
  if (!variables?.stat_data || !beforeVariables?.stat_data) return variables;
  const protectedPaths = ['世界运转', '主角', '人际网络.在场角色', '个人史记'];
  for (const path of protectedPaths) {
    if (_.has(beforeVariables.stat_data, path))
      _.set(variables.stat_data, path, _.cloneDeep(_.get(beforeVariables.stat_data, path)));
    else _.unset(variables.stat_data, path);
  }
  return variables;
}

function waitForWorldTurnMvu(runtime, beforeVariables) {
  if (runtime.worldTurnMvu) throw new Error('已有一轮天下推演正在等待 MVU。');
  return new Promise((resolve, reject) => {
    const pending = {
      beforeVariables,
      timer: null,
      resolve: variables => {
        clearTimeout(pending.timer);
        if (runtime.worldTurnMvu === pending) runtime.worldTurnMvu = null;
        resolve(variables);
      },
      reject: error => {
        clearTimeout(pending.timer);
        if (runtime.worldTurnMvu === pending) runtime.worldTurnMvu = null;
        reject(error);
      },
    };
    pending.timer = setTimeout(() => pending.reject(new Error('等待天下推演的 MVU 更新超时。')), MVU_WAIT_TIMEOUT_MS);
    runtime.worldTurnMvu = pending;
  });
}

function cancelWorldTurnMvu(runtime, reason = '天下推演已中断。') {
  runtime.worldTurnMvu?.reject(new Error(reason));
}

function extractWorldTurnPeriod(message) {
  const stored = String(message?.extra?.canming_world_turn_period || '').trim();
  if (stored) return stored;
  const text = String(message?.message || message?.mes || '');
  return String(text.match(/【\s*推演时段\s*】\s*([\s\S]*?)(?=\n\s*【|<\/world_turn>)/i)?.[1] || '').trim();
}

function latestWorldTurnStatus(runtime, messageId) {
  if (runtime.running || runtime.regenerating) return { allowed: false, reason: '天下推演正在运行。' };
  const requestedId = Number(messageId);
  if (!Number.isInteger(requestedId) || requestedId < 0)
    return { allowed: false, reason: '无法识别这份推演所在的楼层。' };
  let messages;
  try {
    messages = getChatMessages('0-{{lastMessageId}}') || [];
  } catch {
    return { allowed: false, reason: '暂时无法读取聊天楼层。' };
  }
  const latest = messages.at(-1);
  if (latest?.message_id !== requestedId || !isWorldTurnMessage(latest))
    return { allowed: false, reason: '只能重新推演聊天末尾的最新一卷。' };
  return { allowed: true, reason: '', message: latest };
}

async function waitUntilMessageDeleted(messageId) {
  const deadline = Date.now() + DELETE_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const messages = getChatMessages('0-{{lastMessageId}}') || [];
    if (!messages.some(message => message?.message_id === messageId)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('旧推演楼层删除超时，未继续生成。');
}

async function regenerateLatestWorldTurn(runtime, messageId) {
  const status = latestWorldTurnStatus(runtime, messageId);
  if (!status.allowed) throw new Error(status.reason);
  const deleteMessages = globalThis.deleteChatMessages ?? window.parent?.deleteChatMessages;
  if (typeof deleteMessages !== 'function') throw new Error('酒馆删除楼层接口不可用。');
  const periodOverride = extractWorldTurnPeriod(status.message);
  runtime.regenerating = true;
  try {
    await deleteMessages([Number(messageId)]);
    await waitUntilMessageDeleted(Number(messageId));
    reconcileAfterMessageDeletion(runtime);
    runtime.retryPeriodOverride = periodOverride;
  } finally {
    runtime.regenerating = false;
  }
  return runWorldTurn(runtime, { manual: true, periodOverride, regeneration: true });
}

async function runWorldTurn(runtime, { manual = false, periodOverride = '', regeneration = false } = {}) {
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
    if (!mvu?.getMvuData || !mvu?.events?.VARIABLE_UPDATE_ENDED) throw new Error('MVU 尚未初始化。');
    if (typeof generateText !== 'function' || typeof createMessages !== 'function')
      throw new Error('酒馆生成接口不可用。');
    const statData = latestStatData();
    const period = worldTurnPeriod(runtime, statData, periodOverride);
    const result = await generateText({
      generation_id: generationId,
      user_input: buildWorldTurnPrompt(runtime, statData, period),
      should_stream: true,
      should_silence: false,
      injects: [
        {
          role: 'system',
          position: 'in_chat',
          depth: 0,
          should_scan: true,
          content: '本次请求处于【天下推演模式】。忽略普通续写要求，严格执行用户输入中的天下推演格式。',
        },
      ],
    });
    const report = normalizeGeneratedText(result);
    const message = `${report}\n\n${WORLD_TURN_MVU_SCOPE}`;
    runtime.state.status = 'writing';
    emitState(runtime);
    const oldData = _.cloneDeep(mvu.getMvuData({ type: 'message', message_id: 'latest' }) || {});
    const mvuCompleted = waitForWorldTurnMvu(runtime, oldData);
    try {
      await createMessages([
        {
          role: 'assistant',
          message,
          extra: { canming_world_turn: true, canming_world_turn_period: period, generated_at: Date.now() },
        },
      ]);
    } catch (error) {
      cancelWorldTurnMvu(runtime, error?.message || '推演消息写入失败。');
      await mvuCompleted.catch(() => {});
      throw error;
    }
    const updatedData = await mvuCompleted;
    runtime.state.progress = 0;
    runtime.state.status = 'success';
    runtime.state.runningSince = 0;
    runtime.state.lastSuccessAt = Date.now();
    runtime.state.lastClock = worldClockKey(updatedData.stat_data || oldData.stat_data || {});
    runtime.retryPeriodOverride = '';
    emitState(runtime);
    clearTimeout(runtime.successTimer);
    runtime.successTimer = setTimeout(() => {
      if (runtime.state.status === 'success') {
        runtime.state.status = 'countdown';
        emitState(runtime);
      }
    }, 5000);
    console.info('[天下推演] 推演消息与单次 MVU 变量已写入。');
    return true;
  } catch (error) {
    cancelWorldTurnMvu(runtime, error?.message || '天下推演已中断。');
    runtime.state.status = 'failed';
    runtime.state.runningSince = 0;
    const errorMessage = error?.message || String(error) || '未知错误';
    runtime.state.lastError = regeneration ? `旧卷已回滚；重推失败：${errorMessage}` : errorMessage;
    emitState(runtime);
    console.error('[天下推演] 执行失败:', error);
    return false;
  } finally {
    runtime.running = false;
    if (!runtime.disposed) emitState(runtime);
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
      runtime.state.status = runtime.state.enabled
        ? runtime.state.progress >= runtime.state.interval
          ? 'waiting_time'
          : 'countdown'
        : 'disabled';
      if (runtime.state.enabled && !runtime.state.lastClock) runtime.state.lastClock = currentWorldClockKey();
      emitState(runtime);
      return publicState(runtime.state);
    },
    setInterval: interval => {
      runtime.state.interval = clampInterval(interval);
      return finishReset();
    },
    runNow: () => runWorldTurn(runtime, { manual: true }),
    retry: () =>
      runWorldTurn(runtime, {
        manual: true,
        periodOverride: runtime.retryPeriodOverride,
        regeneration: Boolean(runtime.retryPeriodOverride),
      }),
    getRegenerationStatus: messageId => {
      const status = latestWorldTurnStatus(runtime, messageId);
      return { allowed: status.allowed, reason: status.reason };
    },
    regenerateLatest: messageId => regenerateLatestWorldTurn(runtime, messageId),
    reset: finishReset,
    skip: finishReset,
  };
}

function loadCurrentChat(runtime) {
  const clock = currentWorldClockKey();
  runtime.state = readState(clock);
  try {
    const messages = getChatMessages('0-{{lastMessageId}}') || [];
    const reconciled = reconcileWorldTurnHistory(messages, runtime.state.handledAnchors, runtime.state.interval);
    runtime.state.progress = reconciled.progress;
    runtime.state.handledAnchors = reconciled.handledAnchors;
    if (reconciled.hasWorldTurn) runtime.state.lastClock = reconciled.lastWorldTurnClock || runtime.state.lastClock;
    else if (runtime.state.progress >= runtime.state.interval) runtime.state.lastClock = '';
    if (['waiting_mvu', 'success'].includes(runtime.state.status)) runtime.state.status = 'countdown';
  } catch (error) {
    console.warn('[天下推演] 载入聊天时核算楼层失败:', error);
  }
  if (!runtime.state.lastClock) runtime.state.lastClock = clock;
  emitState(runtime);
}

function reconcileAfterMessageDeletion(runtime) {
  for (const pending of runtime.pendingMessages.values()) clearTimeout(pending.timer);
  runtime.pendingMessages.clear();
  runtime.normalMvuRunning = false;
  runtime.lastMvuEndedAt = 0;

  let messages;
  try {
    messages = getChatMessages('0-{{lastMessageId}}') || [];
  } catch (error) {
    console.warn('[天下推演] 删除楼层后读取聊天失败:', error);
    return;
  }

  const reconciled = reconcileWorldTurnHistory(messages, runtime.state.handledAnchors, runtime.state.interval);
  runtime.state.progress = reconciled.progress;
  runtime.state.handledAnchors = reconciled.handledAnchors;
  runtime.state.lastError = '';
  runtime.state.runningSince = 0;
  if (reconciled.hasWorldTurn) runtime.state.lastClock = reconciled.lastWorldTurnClock || runtime.state.lastClock;
  else if (runtime.state.progress >= runtime.state.interval) runtime.state.lastClock = '';
  runtime.state.status = runtime.state.enabled ? 'countdown' : 'disabled';
  emitState(runtime);
  console.info('[天下推演] 已按删除后的现存楼层重新核算计数。');
}

function scheduleDeletionReconcile(runtime) {
  clearTimeout(runtime.deletionTimer);
  runtime.deletionTimer = setTimeout(() => {
    if (runtime.disposed) return;
    if (runtime.running) return void scheduleDeletionReconcile(runtime);
    runtime.deletionTimer = null;
    reconcileAfterMessageDeletion(runtime);
  }, 0);
}

function dispose(runtime) {
  runtime.disposed = true;
  clearTimeout(runtime.successTimer);
  clearTimeout(runtime.bannerHideTimer);
  clearTimeout(runtime.deletionTimer);
  cancelWorldTurnMvu(runtime, '天下推演脚本已卸载。');
  for (const pending of runtime.pendingMessages.values()) clearTimeout(pending.timer);
  runtime.pendingMessages.clear();
  runtime.offMessage?.stop?.();
  runtime.offDeleted?.stop?.();
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
    regenerating: false,
    retryPeriodOverride: '',
    normalMvuRunning: false,
    lastMvuEndedAt: 0,
    disposed: false,
    successTimer: null,
    bannerHideTimer: null,
    deletionTimer: null,
    worldTurnMvu: null,
    offMessage: null,
    offDeleted: null,
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
    if (!runtime.running && generationType !== 'first_message')
      scheduleCompletedReply(runtime, messageId, generationType);
  });
  runtime.offDeleted = eventOn(tavern_events.MESSAGE_DELETED, () => scheduleDeletionReconcile(runtime));
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  if (mvu?.events?.VARIABLE_UPDATE_STARTED) {
    runtime.offMvuStarted = eventOn(mvu.events.VARIABLE_UPDATE_STARTED, () => {
      if (!runtime.running) runtime.normalMvuRunning = true;
    });
  }
  if (mvu?.events?.VARIABLE_UPDATE_ENDED) {
    runtime.offMvuEnded = eventOn(mvu.events.VARIABLE_UPDATE_ENDED, (variables, variablesBeforeUpdate) => {
      if (runtime.worldTurnMvu) {
        const pending = runtime.worldTurnMvu;
        preserveWorldTurnScene(variables, pending.beforeVariables || variablesBeforeUpdate);
        runtime.lastMvuEndedAt = Date.now();
        pending.resolve(_.cloneDeep(variables));
        return;
      }
      if (runtime.running) return;
      runtime.normalMvuRunning = false;
      runtime.lastMvuEndedAt = Date.now();
      const pendingIds = [...runtime.pendingMessages.keys()];
      const latestId = pendingIds.length ? Math.max(...pendingIds) : null;
      if (latestId !== null) runtime.pendingMessages.get(latestId).mvuCompleted = true;
    });
  }
  runtime.offChat = eventOn(tavern_events.CHAT_CHANGED, () => {
    cancelWorldTurnMvu(runtime, '聊天已切换，天下推演已中断。');
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
