import ORIGINAL_TONGCHENG_CHARACTER_ADAPTATIONS from './original-tongcheng-character-adaptations.json';

const STATUSBAR_ID = 'canming-afterglow-statusbar';
const STATUSBAR_VERSION = '1.7.0-beta.9';
const STORAGE_PREFIX = 'canming-afterglow-statusbar:';
const VARIABLE_EDITOR_FILE = '变量修改器.js';
const CHARACTER_GENERATOR_FILE = '万象生成器.js';
const SCENARIO_GENERATOR_FILE = '开局生成器.js';
const WORKSHOP_FILE = '云端创意工坊.js';
const CORE_REMOTE_SCRIPT_NAMES = new Set([
  '变量结构',
  '旧档兼容',
  '云端创意工坊',
  '状态栏',
  '万象生成器',
  '开局生成器',
  '变量修改器',
]);
const PORTRAIT_LIBRARY_STORAGE_KEY = 'portrait_library_v1';
const CHARACTER_PROFILE_STORAGE_KEY = 'canming-dlc-staging:character-profiles-v1';
const ACTIVE_DLC_STORAGE_PREFIX = 'canming-dlc-staging:active-scenario-v1:';
const CHARACTER_PACKAGE_FORMAT = 'canming-character-package';
const WORKSHOP_PACKAGE_FORMAT = 'canming-workshop-package';
const STATUSBAR_ACTIONS_OWNER = {};
const BUILTIN_TONGCHENG_OPENINGS = [
  {
    entry: '[scenario_builtin]桐城开局-街头魂穿',
    id: 'tongcheng-rebirth',
    name: '街头魂穿',
    subtitle: '崇祯七年七月初五 · 桐城皂隶',
  },
  {
    entry: '[scenario_builtin]桐城开局-云际寺夺银',
    id: 'tongcheng-yunjisi',
    name: '云际寺夺银',
    subtitle: '崇祯七年八月 · 桐城皂隶',
  },
  {
    entry: '[scenario_builtin]桐城开局-凤阳惊变',
    id: 'tongcheng-fengyang',
    name: '凤阳惊变',
    subtitle: '崇祯八年正月 · 桐城快班班头',
  },
];

const STATUSBAR_SCRIPT_SRC = document.currentScript?.src || '';
const WORKSHOP_API = 'https://cm-yj-workshop-staging.canming-cloud.workers.dev';
const WORKSHOP_TOKEN_KEY = 'canming-workshop-staging:token';
const WORKSHOP_NOTICE_INTERVAL_MS = 10 * 60 * 1000;
const WORKSHOP_NOTICE_RESUME_THROTTLE_MS = 15000;
const WORKSHOP_NOTICE_RUNTIME_KEY = '_canmingWorkshopStagingNoticeRuntime';
const WORKSHOP_NOTICE_OWNER = {};
let workshopUnreadCount = 0;

function getWorkshopNoticeRuntime() {
  const hostWindow = window.parent ?? window;
  if (!hostWindow[WORKSHOP_NOTICE_RUNTIME_KEY]) {
    hostWindow[WORKSHOP_NOTICE_RUNTIME_KEY] = {
      timer: null,
      listeners: null,
      syncHandler: null,
      syncOwner: null,
      owner: null,
      inflight: null,
      latestNoticeId: '',
      unreadCount: 0,
      lastCheckedAt: 0,
    };
  }
  return hostWindow[WORKSHOP_NOTICE_RUNTIME_KEY];
}

function setWorkshopUnreadCount(runtime, value) {
  workshopUnreadCount = Math.max(0, Number(value || 0));
  runtime.unreadCount = workshopUnreadCount;
  updateWorkshopNoticeIndicator();
}

function updateWorkshopNoticeIndicator() {
  const dot = frameDocument?.querySelector?.('[data-workshop-notice-dot]');
  if (!dot) return;
  dot.hidden = workshopUnreadCount < 1;
  dot.textContent = workshopUnreadCount > 99 ? '99+' : String(workshopUnreadCount || '');
}

function registerWorkshopNoticeSync() {
  const hostWindow = window.parent ?? window;
  const runtime = getWorkshopNoticeRuntime();
  if (runtime.syncHandler) {
    hostWindow.removeEventListener('canming-workshop-notifications-changed', runtime.syncHandler);
  }
  workshopUnreadCount = Math.max(0, Number(runtime.unreadCount || 0));
  runtime.syncHandler = event => {
    setWorkshopUnreadCount(runtime, event?.detail?.unread);
  };
  runtime.syncOwner = WORKSHOP_NOTICE_OWNER;
  hostWindow.addEventListener('canming-workshop-notifications-changed', runtime.syncHandler);
}

function showWorkshopNoticeBanner(onlyWhenNew = false, { force = false } = {}) {
  const hostWindow = window.parent ?? window;
  const hostDocument = hostWindow.document ?? document;
  const runtime = getWorkshopNoticeRuntime();
  const now = Date.now();
  if (runtime.inflight) return runtime.inflight;
  if (!force && now - Number(runtime.lastCheckedAt || 0) < WORKSHOP_NOTICE_RESUME_THROTTLE_MS) {
    setWorkshopUnreadCount(runtime, runtime.unreadCount);
    return Promise.resolve(null);
  }
  let token = '';
  try {
    token = hostWindow.localStorage?.getItem(WORKSHOP_TOKEN_KEY) || localStorage.getItem(WORKSHOP_TOKEN_KEY) || '';
  } catch {
    return;
  }
  if (!token) {
    setWorkshopUnreadCount(runtime, 0);
    return Promise.resolve(null);
  }
  runtime.lastCheckedAt = now;
  const request = fetch(`${WORKSHOP_API}/api/me/notifications?page=1&pageSize=20`, {
    headers: { authorization: `Bearer ${token}` },
  })
    .then(response => (response.ok ? response.json() : null))
    .then(data => {
      setWorkshopUnreadCount(runtime, data?.unread);
      const notice = data?.items?.find?.(item => !item?.is_read);
      if (!notice?.title) return;
      const firstAvailableNotice = !runtime.latestNoticeId;
      const changed = Boolean(runtime.latestNoticeId && runtime.latestNoticeId !== notice.id);
      runtime.latestNoticeId = notice.id;
      if (onlyWhenNew && !changed && !firstAvailableNotice) return;
      hostDocument.getElementById('canming-workshop-notice-banner')?.remove();
      const banner = hostDocument.createElement('aside');
      banner.id = 'canming-workshop-notice-banner';
      banner.innerHTML = `<div class="canming-workshop-notice-mark">✦</div><div class="canming-workshop-notice-copy"><small>云端创意工坊 · 最近通知</small><strong></strong><p></p></div><button type="button" aria-label="关闭通知">×</button>`;
      banner.querySelector('strong').textContent = String(notice.title);
      banner.querySelector('p').textContent = String(notice.content || '你有一条来自创意工坊的新消息。');
      banner.querySelector('button').addEventListener('click', () => banner.remove());
      hostDocument.body.append(banner);
      if (!hostDocument.getElementById('canming-workshop-notice-banner-style')) {
        const style = hostDocument.createElement('style');
        style.id = 'canming-workshop-notice-banner-style';
        style.textContent = `#canming-workshop-notice-banner{position:fixed;z-index:99999;top:max(18px,env(safe-area-inset-top));left:50%;display:flex;align-items:center;gap:12px;width:min(560px,calc(100vw - 28px));padding:13px 15px;transform:translateX(-50%);border:1px solid color-mix(in srgb,var(--SmartThemeBodyColor,#e8d2aa) 34%,transparent);border-radius:16px;background:linear-gradient(115deg,color-mix(in srgb,var(--SmartThemeBlurTintColor,#261a13) 92%,#000),color-mix(in srgb,var(--SmartThemeBlurTintColor,#261a13) 78%,#a95d38));box-shadow:0 16px 40px rgba(0,0,0,.32);backdrop-filter:blur(14px);color:var(--SmartThemeBodyColor,#f1dfbd);animation:canming-notice-in .32s ease-out}#canming-workshop-notice-banner .canming-workshop-notice-mark{display:grid;flex:0 0 31px;width:31px;height:31px;place-items:center;border-radius:50%;background:#c9784f;color:#fff;font-size:17px}#canming-workshop-notice-banner .canming-workshop-notice-copy{min-width:0;flex:1}#canming-workshop-notice-banner small{display:block;margin-bottom:3px;color:#d79a73;font-size:11px;letter-spacing:.08em}#canming-workshop-notice-banner strong{display:block;overflow:hidden;font-size:15px;text-overflow:ellipsis;white-space:nowrap}#canming-workshop-notice-banner p{display:-webkit-box;overflow:hidden;margin:3px 0 0;color:color-mix(in srgb,var(--SmartThemeBodyColor,#f1dfbd) 72%,transparent);font-size:13px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2}#canming-workshop-notice-banner button{border:0;background:transparent;color:inherit;cursor:pointer;font-size:23px;line-height:1;opacity:.72}@keyframes canming-notice-in{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}`;
        hostDocument.head.append(style);
      }
      hostWindow.setTimeout(() => banner.remove(), 9000);
    })
    .catch(() => null)
    .finally(() => {
      if (runtime.inflight === request) runtime.inflight = null;
    });
  runtime.inflight = request;
  return request;
}

function clearWorkshopNoticePolling(runtime) {
  const listeners = runtime.listeners;
  if (runtime.timer !== null) {
    (listeners?.hostWindow ?? window.parent ?? window).clearInterval(runtime.timer);
    runtime.timer = null;
  }
  if (listeners) {
    listeners.hostWindow.removeEventListener('focus', listeners.onFocus);
    listeners.hostWindow.removeEventListener('pageshow', listeners.onPageShow);
    listeners.hostDocument.removeEventListener('visibilitychange', listeners.onVisibilityChange);
    runtime.listeners = null;
  }
}

function startWorkshopNoticePolling() {
  const hostWindow = window.parent ?? window;
  const hostDocument = hostWindow.document ?? document;
  const runtime = getWorkshopNoticeRuntime();

  // 接管旧脚本或旧 iframe 留下的轮询，整个酒馆始终只保留一个通知定时器。
  clearWorkshopNoticePolling(runtime);
  hostWindow.clearInterval(hostWindow._canmingWorkshopNoticeTimer);
  if (window !== hostWindow) window.clearInterval(window._canmingWorkshopNoticeTimer);
  try {
    delete hostWindow._canmingWorkshopNoticeTimer;
  } catch {
    hostWindow._canmingWorkshopNoticeTimer = null;
  }
  try {
    delete window._canmingWorkshopNoticeTimer;
  } catch {
    window._canmingWorkshopNoticeTimer = null;
  }

  const checkAfterResume = () => {
    if (hostDocument.visibilityState === 'hidden') return;
    showWorkshopNoticeBanner(true);
  };
  const onFocus = () => checkAfterResume();
  const onPageShow = () => checkAfterResume();
  const onVisibilityChange = () => {
    if (hostDocument.visibilityState === 'visible') checkAfterResume();
  };

  runtime.owner = WORKSHOP_NOTICE_OWNER;
  runtime.listeners = { hostWindow, hostDocument, onFocus, onPageShow, onVisibilityChange };
  hostWindow.addEventListener('focus', onFocus);
  hostWindow.addEventListener('pageshow', onPageShow);
  hostDocument.addEventListener('visibilitychange', onVisibilityChange);
  runtime.timer = hostWindow.setInterval(() => {
    const elapsed = Date.now() - Number(runtime.lastCheckedAt || 0);
    if (hostDocument.visibilityState !== 'hidden' && elapsed >= WORKSHOP_NOTICE_INTERVAL_MS) {
      showWorkshopNoticeBanner(true);
    }
  }, WORKSHOP_NOTICE_INTERVAL_MS);

  // 整个宿主首次加载时立即同步；后续 iframe/状态栏重建沿用共享检查时间，
  // 避免每生成一条新消息都把“首次加载”放大成一次网络请求。
  showWorkshopNoticeBanner(false, { force: !runtime.lastCheckedAt });
}

function cleanupWorkshopNoticePolling() {
  const hostWindow = window.parent ?? window;
  const runtime = hostWindow[WORKSHOP_NOTICE_RUNTIME_KEY];
  if (!runtime) return;
  if (runtime.owner === WORKSHOP_NOTICE_OWNER) {
    clearWorkshopNoticePolling(runtime);
    runtime.owner = null;
  }
  if (runtime.syncOwner === WORKSHOP_NOTICE_OWNER && runtime.syncHandler) {
    hostWindow.removeEventListener('canming-workshop-notifications-changed', runtime.syncHandler);
    runtime.syncHandler = null;
    runtime.syncOwner = null;
  }
}
const BASE_TABS = [
  ['overview', '总览'],
  ['self', '个人信息'],
  ['money', '钱粮收支'],
  ['people', '人情往来'],
  ['private', '私帷小记'],
  ['portraits', '人物志'],
  ['military', '营伍军务'],
  ['situation', '时局任务'],
  ['tech', '技术进展'],
  ['history', '生平史记'],
  ['map', '天下舆图'],
  ['graph', '人物谱系'],
];

const MARKET_SPREAD = 0.03;
const MARKET_CATEGORIES = [
  ['粮食', '五谷粮秣'],
  ['军需', '基础军需'],
  ['常用物资', '民生物料'],
];
const MARKET_ITEMS = [
  {
    id: 'rice',
    name: '稻米',
    category: '粮食',
    unit: '石',
    basePrice: 0.6,
    monthlyStock: 200,
    defaultQty: 10,
    desc: '南方常见主粮，可直接充作军粮或赈济用粮。',
  },
  {
    id: 'wheat',
    name: '小麦',
    category: '粮食',
    unit: '石',
    basePrice: 0.55,
    monthlyStock: 150,
    defaultQty: 10,
    desc: '耐储耐运，磨面后便于行军携带。',
  },
  {
    id: 'millet',
    name: '粟米',
    category: '粮食',
    unit: '石',
    basePrice: 0.5,
    monthlyStock: 150,
    defaultQty: 10,
    desc: '北地常用口粮，炊煮方便，适合作为营中军粮。',
  },
  {
    id: 'mixed_grain',
    name: '杂粮',
    category: '粮食',
    unit: '石',
    basePrice: 0.4,
    monthlyStock: 200,
    defaultQty: 10,
    desc: '高粱、大麦与荞麦等混装粗粮，价廉而耐放。',
  },
  {
    id: 'soybean',
    name: '黄豆',
    category: '粮食',
    unit: '石',
    basePrice: 0.65,
    monthlyStock: 80,
    defaultQty: 10,
    desc: '可煮食、磨浆或制成豆食，适合补充军粮。',
  },
  {
    id: 'fodder',
    name: '草料',
    category: '粮食',
    unit: '石',
    basePrice: 0.2,
    monthlyStock: 200,
    defaultQty: 10,
    desc: '供牲畜与运输畜力消耗，不计入士卒口粮。',
  },
  {
    id: 'spear',
    name: '长枪',
    category: '军需',
    unit: '杆',
    basePrice: 0.18,
    monthlyStock: 200,
    defaultQty: 10,
    desc: '木杆铁首的基础长兵，适合成批装备步卒。',
  },
  {
    id: 'sabre_shield',
    name: '刀盾',
    category: '军需',
    unit: '套',
    basePrice: 0.6,
    monthlyStock: 100,
    defaultQty: 10,
    desc: '腰刀与藤木盾成套出售，供近战兵卒使用。',
  },
  {
    id: 'bow_arrow',
    name: '弓箭',
    category: '军需',
    unit: '套',
    basePrice: 0.8,
    monthlyStock: 100,
    defaultQty: 10,
    desc: '步弓一张配常用箭矢，适合基础弓手操练。',
  },
  {
    id: 'cotton_armour',
    name: '棉甲',
    category: '军需',
    unit: '领',
    basePrice: 1.5,
    monthlyStock: 100,
    defaultQty: 10,
    desc: '多层棉布缀甲片制成，价格与防护较为均衡。',
  },
  {
    id: 'salt',
    name: '食盐',
    category: '常用物资',
    unit: '斤',
    basePrice: 0.035,
    monthlyStock: 500,
    defaultQty: 50,
    desc: '炊食、腌藏与赈济皆不可缺少的民生物资。',
  },
  {
    id: 'cotton_cloth',
    name: '棉布',
    category: '常用物资',
    unit: '匹',
    basePrice: 0.25,
    monthlyStock: 100,
    defaultQty: 10,
    desc: '可制衣被、军服、包扎布与各类日常用品。',
  },
  {
    id: 'pig_iron',
    name: '生铁',
    category: '常用物资',
    unit: '斤',
    basePrice: 0.03,
    monthlyStock: 1000,
    defaultQty: 50,
    desc: '打造农具、修补军械和作坊生产所需原料。',
  },
  {
    id: 'timber',
    name: '木料',
    category: '常用物资',
    unit: '方',
    basePrice: 0.08,
    monthlyStock: 100,
    defaultQty: 10,
    desc: '用于修缮房舍、车辆、仓场与简易工事。',
  },
  {
    id: 'medicine',
    name: '药材',
    category: '常用物资',
    unit: '份',
    basePrice: 0.12,
    monthlyStock: 100,
    defaultQty: 10,
    desc: '常用内外伤药材合包，适合药铺与军营储备。',
  },
  {
    id: 'vegetable_oil',
    name: '菜油',
    category: '常用物资',
    unit: '斤',
    basePrice: 0.02,
    monthlyStock: 300,
    defaultQty: 20,
    desc: '可供炊食、照明及部分作坊生产使用。',
  },
];

function buildTabs() {
  if (shopEnabled) {
    return [...BASE_TABS, ['fengyue', '风月阁']];
  }
  return BASE_TABS;
}

const DIFFICULTIES = [
  ['casual', '休闲', '银钱宽裕·敌军偏弱·失败可挽回'],
  ['normal', '中等', '该赢赢该输输·努力有回报'],
  ['hard', '真实', '钱不够·敌将强·步步惊心'],
  ['hell', '绝境', '敌谋如网·灾祸连环·九死一生'],
];

const PORTRAIT_DATA = {
  白瑶: {
    日常: 'https://i.postimg.cc/gkgxQf0L/bai-yao-ri-chang.png',
    情趣: 'https://i.postimg.cc/RVS3PMvK/bai-yao-qing-qu.png',
    裸体: 'https://i.postimg.cc/KvGK9ZmT/bai-yao-luo-ti.png',
    性爱: 'https://i.postimg.cc/TYtKFZPm/bai-yao-xing-ai.png',
    骑乘: 'https://i.postimg.cc/Qx8B6Xj9/bai-yao-qi-cheng.png',
    后入: 'https://i.postimg.cc/m2LcdbT1/bai-yao-hou-ru.png',
    足交: 'https://i.postimg.cc/nc3Xg6LG/bai-yao-zu-jiao.png',
  },
  翠儿: {
    日常: 'https://i.postimg.cc/sD4YX6g2/cui-er-ri-chang.png',
    情趣: 'https://i.postimg.cc/020YQWyy/cui-er-qing-qu.png',
    裸体: 'https://i.postimg.cc/yYymdQ87/cui-er-luo-ti.png',
    性爱: 'https://i.postimg.cc/vHtrBqZT/cui-er-xing-ai.png',
    骑乘: 'https://i.postimg.cc/kXvQ41gX/cui-er-qi-cheng.png',
    后入: 'https://i.postimg.cc/qMTcpV4z/cui-er-hou-ru.png',
    足交: 'https://i.postimg.cc/ncG4zRhC/cui-er-zu-jiao.png',
  },
  方子衿: {
    日常: 'https://i.postimg.cc/5NsXTZ0W/fang-zi-jin-ri-chang.png',
    情趣: 'https://i.postimg.cc/xT6XhWdw/fang-zi-jin-qing-qu.png',
    裸体: 'https://i.postimg.cc/CLcRXWKQ/fang-zi-jin-luo-ti.png',
    性爱: 'https://i.postimg.cc/L8hJpNq0/fang-zi-jin-xing-ai.png',
    骑乘: 'https://i.postimg.cc/jdMDmGjm/fang-zi-jin-qi-cheng.png',
    后入: 'https://i.postimg.cc/tCBswLgk/fang-zi-jin-hou-ru.png',
    足交: 'https://i.postimg.cc/nhMXJ0s6/fang-zi-jin-zu-jiao.png',
  },
  林知夏: {
    日常: 'https://i.postimg.cc/L63tXC8B/lin-zhi-xia-ri-chang.png',
    情趣: 'https://i.postimg.cc/7Yn36sZ3/lin-zhi-xia-qing-qu.png',
    裸体: 'https://i.postimg.cc/7Yn36sZT/lin-zhi-xia-luo-ti.png',
    性爱: 'https://i.postimg.cc/CLsG1Pxs/lin-zhi-xia-xing-ai.png',
    骑乘: 'https://i.postimg.cc/GhxF27mv/lin-zhi-xia-qi-cheng.png',
    后入: 'https://i.postimg.cc/bN9xJCwG/lin-zhi-xia-hou-ru.png',
    足交: 'https://i.postimg.cc/m2yYDXgw/lin-zhi-xia-zu-jiao.png',
  },
  洪天妹: {
    日常: 'https://i.postimg.cc/Pq4n8N1n/hong-tian-mei-ri-chang.png',
    情趣: 'https://i.postimg.cc/q7LHCgy9/hong-tian-mei-qing-qu.png',
    裸体: 'https://i.postimg.cc/KYNhg4Bs/hong-tian-mei-luo-ti.png',
    性爱: 'https://i.postimg.cc/TP9vWhnM/hong-tian-mei-xing-ai.png',
    骑乘: 'https://i.postimg.cc/nLkfQMBR/hong-tian-mei-qi-cheng.png',
    后入: 'https://i.postimg.cc/Pq4n8NYS/hong-tian-mei-hou-ru.png',
    口交: 'https://i.postimg.cc/Pq4n8NYV/hong-tian-mei-kou-jiao.png',
  },
  柳如是: {
    日常: 'https://i.postimg.cc/RZ8NVKKV/liu-ru-shi-ri-chang.png',
    情趣: 'https://i.postimg.cc/zG3yr0bL/liu-ru-shi-qing-qu.png',
    裸体: 'https://i.postimg.cc/dVDhY4kw/liu-ru-shi-luo-ti.png',
    性爱: 'https://i.postimg.cc/52G6NLLy/liu-ru-shi-xing-ai.png',
    骑乘: 'https://i.postimg.cc/zG3yr0bz/liu-ru-shi-qi-cheng.png',
    后入: 'https://i.postimg.cc/52jXVnYc/liu-ru-shi-hou-ru.png',
    足交: 'https://i.postimg.cc/Z5gCKppv/liu-ru-shi-zu-jiao.png',
  },
  柳氏: {
    日常: 'https://i.postimg.cc/nhVvQ4X1/liu-shi-ri-chang.png',
    情趣: 'https://i.postimg.cc/DwfqbrSQ/liu-shi-qing-qu.png',
    裸体: 'https://i.postimg.cc/zXFCBtGx/liu-shi-luo-ti.png',
    性爱: 'https://i.postimg.cc/kgMxtQ2T/liu-shi-xing-ai.png',
    骑乘: 'https://i.postimg.cc/YC21m6vY/liu-shi-qi-cheng.png',
    后入: 'https://i.postimg.cc/DyPrZjw6/liu-shi-hou-ru.png',
    足交: 'https://i.postimg.cc/jSqzJHD3/liu-shi-zu-jiao.png',
  },
  陆挽星: {
    日常: 'https://i.postimg.cc/g0ZrwjHy/lu-wan-xing-ri-chang.png',
    情趣: 'https://i.postimg.cc/Sx5JNCCg/lu-wan-xing-qing-qu.png',
    裸体: 'https://i.postimg.cc/P5cPrYYw/lu-wan-xing-(luo-ti).png',
    性爱: 'https://i.postimg.cc/CKqdZ5sN/lu-wan-xing-xing-ai.png',
    骑乘: 'https://i.postimg.cc/CxtzLkkC/lu-wan-xing-(qi-cheng).png',
    后入: 'https://i.postimg.cc/9QSrFZZ1/lu-wan-xing-hou-ru.png',
    足交: 'https://i.postimg.cc/VNC5SvW7/lu-wan-xing-zu-jiao.png',
  },
  栖月: {
    日常: 'https://i.postimg.cc/x1jKbvkn/qi-yue-ri-chang.png',
    情趣: 'https://i.postimg.cc/Vk7X9Jtx/qi-yue-qing-qu.png',
    裸体: 'https://i.postimg.cc/qvB8CsN9/qi-yue-luo-ti.png',
    性爱: 'https://i.postimg.cc/Qd6cgF7z/qi-yue-xing-ai.png',
    骑乘: 'https://i.postimg.cc/kgMxtQVd/qi-yue-qi-cheng.png',
    后入: 'https://i.postimg.cc/9QXGqdDn/qi-yue-hou-ru.png',
    足交: 'https://i.postimg.cc/fRHY7VdF/qi-yue-zu-jiao.png',
  },
  栖云: {
    日常: 'https://i.postimg.cc/YCXQNvgq/qi-yun-ri-chang.png',
    情趣: 'https://i.postimg.cc/T3knjKmT/qi-yun-qing-qu.png',
    裸体: 'https://i.postimg.cc/dVWGRhdY/qi-yun-luo-ti.png',
    性爱: 'https://i.postimg.cc/HkSb0r5L/qi-yun-xing-ai.png',
    骑乘: 'https://i.postimg.cc/bw610Zbp/qi-yun-qi-cheng.png',
    后入: 'https://i.postimg.cc/fRHY7VXQ/qi-yun-hou-ru.png',
    足交: 'https://i.postimg.cc/NjNR8KTL/qi-yun-zu-jiao.png',
  },
  沈清晏: {
    日常: 'https://i.postimg.cc/9frZLct0/shen-qing-yan-ri-chang.png',
    情趣: 'https://i.postimg.cc/hGfT2Kbj/shen-qing-yan-qing-qu.png',
    裸体: 'https://i.postimg.cc/YCXQNvgm/shen-qing-yan-luo-ti.png',
    性爱: 'https://i.postimg.cc/QMH1fjkW/shen-qing-yan-xing-ai.png',
    骑乘: 'https://i.postimg.cc/YCXQNvgg/shen-qing-yan-qi-cheng.png',
    后入: 'https://i.postimg.cc/W190mdrD/shen-qing-yan-hou-ru.png',
    足交: 'https://i.postimg.cc/jjLPMRQN/shen-qing-yan-zu-jiao.png',
  },
  苏晚棠: {
    日常: 'https://i.postimg.cc/fbpXF1Bj/su-wan-tang-ri-chang.png',
    情趣: 'https://i.postimg.cc/FK73ThgW/su-wan-tang-qing-qu.png',
    裸体: 'https://i.postimg.cc/YShYdtf6/su-wan-tang-luo-ti.png',
    性爱: 'https://i.postimg.cc/5tTvGDnS/su-wan-tang-xing-ai.png',
    骑乘: 'https://i.postimg.cc/s2v7T39n/su-wan-tang-qi-cheng.png',
    后入: 'https://i.postimg.cc/QMH1fjkc/su-wan-tang-hou-ru.png',
    足交: 'https://i.postimg.cc/wBZJPn02/su-wan-tang-zu-jiao.png',
  },
  苏晚月: {
    日常: 'https://i.postimg.cc/qvVV7Ncy/su-wan-yue-ri-chang.png',
    情趣: 'https://i.postimg.cc/hvvgVNhN/su-wan-yue-qing-qu.png',
    裸体: 'https://i.postimg.cc/2ytYGTZS/su-wan-yue-luo-ti.png',
    性爱: 'https://i.postimg.cc/qRZWHqMF/su-wan-yue-xing-ai.png',
    骑乘: 'https://i.postimg.cc/Y0P7R8WK/su-wan-yue-qi-cheng.png',
    后入: 'https://i.postimg.cc/Bv5q3xdg/su-wan-yue-hou-ru.png',
    足交: 'https://i.postimg.cc/C5BXh0zm/su-wan-yue-zu-jiao.png',
  },
  周皇后: {
    日常: 'https://i.postimg.cc/02yQYcCr/zhou-huang-hou-ri-chang.png',
    情趣: 'https://i.postimg.cc/bNwJx3Ry/zhou-huang-hou-qing-qu.png',
    裸体: 'https://i.postimg.cc/MZDHfh1n/zhou-huang-hou-luo-ti.png',
    性爱: 'https://i.postimg.cc/4Nxd6B1K/zhou-huang-hou-xing-ai.png',
    骑乘: 'https://i.postimg.cc/3rBN0P2y/zhou-huang-hou-qi-cheng.png',
    后入: 'https://i.postimg.cc/tR5JnLF7/zhou-huang-hou-hou-ru.png',
    足交: 'https://i.postimg.cc/X7YJfQgy/zhou-huang-hou-zu-jiao.png',
  },
  安娜: {
    日常: 'https://i.postimg.cc/nr0L8DnB/an-na-ri-chang.png',
    情趣: 'https://i.postimg.cc/rsQp6rq4/an-na-qing-qu.png',
    裸体: 'https://i.postimg.cc/4yB3C9XK/an-na-luo-ti.png',
    性爱: 'https://i.postimg.cc/8ctC86Tm/an-na-xing-ai.png',
    骑乘: 'https://i.postimg.cc/4yB3C9Xh/an-na-qi-cheng.png',
    后入: 'https://i.postimg.cc/VvDNyCzv/an-na-hou-ru.png',
    足交: 'https://i.postimg.cc/MZDHfhVL/an-na-zu-jiao.png',
  },
  朱徽媞: {
    日常: 'https://i.postimg.cc/BQn6TMCB/zhu-hui-shi-ri-chang.png',
    情趣: 'https://i.postimg.cc/wTjvX0k5/zhu-hui-shi-qing-qu.png',
    裸体: 'https://i.postimg.cc/8Pz5Rtbh/zhu-hui-shi-luo-ti.png',
    性爱: 'https://i.postimg.cc/NfjM6pxx/zhu-hui-shi-xing-ai.png',
    骑乘: 'https://i.postimg.cc/zXGBC0kC/zhu-hui-shi-qi-cheng.png',
    后入: 'https://i.postimg.cc/kXg4Qfy8/zhu-hui-shi-hou-ru.png',
    足交: 'https://i.postimg.cc/Ghm2FqjK/zhu-hui-shi-zu-jiao.png',
  },
  陈圆圆: {
    日常: 'https://i.postimg.cc/XN8qBT9b/chen-yuan-yuan-ri-chang.png',
    情趣: 'https://i.postimg.cc/7PVhJpSv/chen-yuan-yuan-qing-qu.png',
    裸体: 'https://i.postimg.cc/Dfg04tLt/chen-yuan-yuan-luo-ti.png',
    性爱: 'https://i.postimg.cc/660q4DCK/chen-yuan-yuan-xing-ai.png',
    骑乘: 'https://i.postimg.cc/593yQZLh/chen-yuan-yuan-qi-cheng.png',
    后入: 'https://i.postimg.cc/T2915ZgF/chen-yuan-yuan-hou-ru.png',
    足交: 'https://i.postimg.cc/3rBN0P2N/chen-yuan-yuan-zu-jiao.png',
  },
  周氏: {
    日常: 'https://i.postimg.cc/qvtvYqSn/zhou-shi-ri-chang.png',
    情趣: 'https://i.postimg.cc/GmBmNtVs/zhou-shi-qing-qu.png',
    裸体: 'https://i.postimg.cc/Mpcp4HNv/zhou-shi-luo-ti.png',
    性爱: 'https://i.postimg.cc/3xyx6NV2/zhou-shi-xing-ai.png',
    骑乘: 'https://i.postimg.cc/0y6y3jFz/zhou-shi-qi-cheng.png',
    后入: 'https://i.postimg.cc/XYZYhqmX/zhou-shi-hou-ru.png',
    足交: 'https://i.postimg.cc/t4L4HyGY/zhou-shi-zu-jiao.png',
  },
  张嫣: {
    日常: 'https://i.postimg.cc/nhsh5rgF/zhang-yan-ri-chang.png',
    情趣: 'https://i.postimg.cc/QdBdPCwr/zhang-yan-qing-qu.png',
    裸体: 'https://i.postimg.cc/Mpcp4HNJ/zhang-yan-luo-ti.png',
    性爱: 'https://i.postimg.cc/rwdwbs3y/zhang-yan-xing-ai.png',
    骑乘: 'https://i.postimg.cc/nhsh5rgJ/zhang-yan-qi-cheng.png',
    后入: 'https://i.postimg.cc/x1k178hr/zhang-yan-hou-ru.png',
    足交: 'https://i.postimg.cc/jSWS92md/zhang-yan-zu-jiao.png',
  },
  杨尔铭: {
    日常: 'https://i.postimg.cc/rFZpQxn8/yang-er-ming-ri-chang.png',
    情趣: 'https://i.postimg.cc/157zJwCy/yang-er-ming-qing-qu.png',
    裸体: 'https://i.postimg.cc/fTqbBm2s/yang-er-ming-luo-ti.png',
    性爱: 'https://i.postimg.cc/4xKxMyMq/yang-er-ming-xing-ai.png',
    骑乘: 'https://i.postimg.cc/9FgfJZ8V/yang-er-ming-qi-cheng.png',
    后入: 'https://i.postimg.cc/c4kJXw9S/yang-er-ming-hou-ru.png',
    足交: 'https://i.postimg.cc/g2w25j5C/yang-er-ming-zu-jiao.png',
  },
  温素弦: {
    日常: 'https://i.postimg.cc/c4kJXwDp/wen-su-xian-ri-chang.png',
    情趣: 'https://i.postimg.cc/bNVv3k64/wen-su-xian-qing-qu.png',
    裸体: 'https://i.postimg.cc/m2pr8Cdn/wen-su-xian-luo-ti.png',
    性爱: 'https://i.postimg.cc/CLrKmkPy/wen-su-xian-xing-ai.png',
    骑乘: 'https://i.postimg.cc/J4YhPZTv/wen-su-xian-qi-cheng.png',
    后入: 'https://i.postimg.cc/fTqbBmHr/wen-su-xian-hou-ru.png',
    足交: 'https://i.postimg.cc/KvpYJBqS/wen-su-xian-zu-jiao.png',
  },
};

const SHOP_CATEGORIES = [
  {
    name: '闺中秘器',
    items: [
      {
        id: 'mianling',
        name: '缅铃',
        price: 5,
        desc: '缅甸货，空心银铃铛，里头灌了水银。给你家姑娘塞进去，走一步它就在里头滚一圈，你能听见声儿算我输。她白天戴着出门，晚上回来腿都夹不紧了。洗干净塞进去就成，然后你就等着验收成果吧。',
      },
      {
        id: 'jiaoxiansheng',
        name: '角先生',
        price: 4,
        desc: '羊脂白玉的，你摸摸。你不在家的时候它就是代你值班的，温水泡热了跟活人似的。别嫌它比你秀气，它又不会喘气不会说情话，抢不走你的人。',
      },
      {
        id: 'guangdongrenshi',
        name: '广东人事',
        price: 4,
        desc: '广东老师傅用黄杨木削的，比角先生粗一圈。木头有个好处，捂热了跟真人皮肤似的，越用越润。用法跟角先生一样，温水泡软了给你家姑娘，她用了就知道什么叫广东功夫。',
      },
      {
        id: 'shuangtoulong',
        name: '双头龙',
        price: 5,
        desc: '两头都做成龟首的样子，中间牛筋连着。她俩可以一起用，你自个儿也可以一边一个。别拿那种眼神看我，来我这儿买这个的客官多了去了，你又不是第一个。',
      },
      {
        id: 'yintuozi',
        name: '银托子',
        price: 4,
        desc: '精银圆环，套你根部的。箍着它你就没那么快交代，多撑一会儿她念你的好。勒太紧废了我可不赔，后半辈子你就只能天天来我这进货角先生了。',
      },
      {
        id: 'xuanyuhuan',
        name: '悬玉环',
        price: 3,
        desc: '羊脂白玉的细环，系着绛色丝绦。行房的时候挂在腰上或者帐钩上，托着你那话儿，让你悠着点发力。说白了就是个温柔的银托子，好看还管用。',
      },
      {
        id: 'liuhuangquan',
        name: '硫磺圈',
        price: 3,
        desc: '硫磺跟蜂蜡合炼的，套你根部的。跟银托子不一样，这个遇热会微微发烫，酸酸胀胀的，让你想交代又交代不了。喜欢被吊着的感觉就试这个。',
      },
      {
        id: 'lujiao',
        name: '鹿角',
        price: 3,
        desc: '嫩鹿茸尖磨的，天然微弯，触体温润。用法我说了怕你不好意思，反正你拿着看两秒就懂了。比角先生野，适合胆子大的姑娘。',
      },
      {
        id: 'xiangyachou',
        name: '象牙筹',
        price: 2,
        desc: '象牙磨的细长薄片，两头圆圆的。按穴位用的，从脖子一路划到腿根，轻轻重重的，她痒你就对了。下手重了也能当小鞭子使，看你会不会玩。',
      },
      {
        id: 'yuruyi',
        name: '玉如意',
        price: 3,
        desc: '巴掌大的袖珍青玉如意。挠背可惜了，换个地方挠，你家姑娘叫起来的时候你就知道这钱没白花。',
      },
      {
        id: 'muma',
        name: '木马',
        price: 5,
        desc: '木头的马架子，不是让你骑上去打仗的。姑娘趴上去，手脚刚好够着四个角，后面的事你自己琢磨。做工扎实，承重够，翻不下来。家里有地方的客官才买，住客栈的就别想了。',
      },
      {
        id: 'yushi',
        name: '玉势',
        price: 2,
        desc: '角先生的小妹，比角先生小两圈，手指粗细。好处是小，姑娘出门塞包袱里都没人知道。翡翠的羊脂玉的都有，先到先挑。你家那位刚入门的拿这个试，不吓人。',
      },
      {
        id: 'fuchen',
        name: '拂尘',
        price: 2,
        desc: '白麈尾毛扎的拂尘，道士手里那个见过吧？我这把不扫灰，扫人。从后颈一路拂到腰眼，轻一下重一下，她痒得扭成麻花你负责。比手好用，够不着的地方它够得着。',
      },
    ],
  },
  {
    name: '炉中秘药',
    items: [
      {
        id: 'nuanqingxiang',
        name: '暖情香',
        price: 2,
        desc: '西域方子，点上之后满屋子那个味儿。闻着闻着她身子就热了，她热了你还能凉着？掰一小块搁香炉里就行，别整块丢进去，又不是烧柴火。',
      },
      {
        id: 'chanshengjiao',
        name: '颤声娇',
        price: 4,
        desc: '西域秘药，绿豆大一颗含舌头底下。含完以后浑身酥酥麻麻的，跟有蚂蚁爬似的，碰哪儿都痒，叫出来的声儿比平时好听十倍。名字就是这么来的。',
      },
      {
        id: 'fengqigao',
        name: '封脐膏',
        price: 3,
        desc: '肉桂丁香蛇床子炼的膏药。贴肚脐下面三指，热力顺着丹田往下走，用不了一盏茶她就主动往你身上蹭了。贴之前先把那儿的毛刮一刮，不然撕的时候别怪我。',
      },
      {
        id: 'cuizhenzi',
        name: '催阵子',
        price: 3,
        desc: '黄豆大的药丸子，扔浴桶里化开。人泡进去浑身发烫，皮肤敏感得跟换了个人似的。泡完出来不用我教了吧？床就在那儿，水温刚好，人更刚好。',
      },
      {
        id: 'xiangsidan',
        name: '相思丹',
        price: 4,
        desc: '朱红小药丸，绿豆大。吃下去一刻钟面颊生晕心跳加速，她自个儿就湿了，跟喝了酒似的但又没醉。给她吃还是自己吃都行，俩人一起吃更好。',
      },
      {
        id: 'shenxujiao',
        name: '慎恤胶',
        price: 5,
        desc: '汉朝古方，鹿茸海马紫河车炼的，龙眼大一颗。黄酒送服，提前半个时辰吃。一颗下去今晚你想停她未必让你停。赵飞燕用过，她后来吃太多了，你比她惜命，一颗够了。第二天腿软别怨我，反正也不是天天用。',
      },
      {
        id: 'dongqingsan',
        name: '动情散',
        price: 2,
        desc: '粉末状的，跟胡椒面似的。洒在酒里茶里都行，无色无味，一杯下去一盏茶的功夫她就往你身上贴。比药丸子快，比膏药隐蔽，饭桌上就能把事办了。一包三回的量，省着用。',
      },
      {
        id: 'zhuqinghua',
        name: '助情花',
        price: 3,
        desc: '西域干花瓣，搁炭火上焙，不用明火。焙出来的味儿跟桂花有点像又不太像，反正闻着闻着裤子就紧了。比暖情香省事，不用香炉，炭火盆就成。一包能焙三四回。',
      },
      {
        id: 'huangudan',
        name: '换骨丹',
        price: 5,
        desc: '道门里传出来的方子，名字听着唬人，其实就是让你家姑娘浑身酥得跟没骨头似的。吃下去以后你碰哪儿她都软，轻轻摸一下跟过电一样。一颗管一个时辰，提前一刻钟吃。别跟慎恤胶一块儿用，药性叠了别来找我。',
      },
    ],
  },
  {
    name: '枕边小物',
    items: [
      {
        id: 'hehuanling',
        name: '合欢铃',
        price: 3,
        desc: '小铜铃一对，系她脚踝上。你一动她就响，她一动也响，叮叮当当的跟给你俩打拍子似的。系手腕也行系哪儿都行，反正响起来你就知道使对地方了。',
      },
      {
        id: 'bailingdai',
        name: '白绫带',
        price: 1,
        desc: '素白丝绫编的，又软又韧。绑手腕、束腰、蒙眼睛，怎么用全看你想象力。便宜，但玩好了花样最多。新手先拿这个练手，玩不坏。',
      },
      {
        id: 'qinxian',
        name: '琴弦',
        price: 2,
        desc: '蚕丝绞的细弦，柔韧里带点涩。系在腕上腰上，你一动它就收紧，你一停它就松，跟弹琴似的，越动弹越有滋味。系松点，别勒出印子。',
      },
      {
        id: 'jinlianbei',
        name: '金莲杯',
        price: 2,
        desc: '绣花弓鞋一双，崭新的。斟了酒从鞋里嘬着喝，你一口她一口，喝着喝着嘴就凑一块儿去了。文人管这叫风雅，我说就是换个花样摸腿，别装了。',
      },
      {
        id: 'chungongtuce',
        name: '春宫图册',
        price: 2,
        desc: '唐寅真迹摹本，十二页，纸墨精良。画得讲究，姿势含蓄但有味道。跟你家姑娘一块儿翻着看，翻两页她自己就脸红了，脸红了你手就可以动了。',
      },
      {
        id: 'bihuotu',
        name: '避火图',
        price: 1,
        desc: '民间刻版秘戏图谱，三十六页不重样，该露的全露。跟你家姑娘翻到哪页学哪页，学完了告诉我哪页最好使。挂床头避火，避的是哪种火你心里有数。',
      },
      {
        id: 'xiangsitao',
        name: '相思套',
        price: 2,
        desc: '羊肠做的，薄得跟蝉翅膀似的。两个用处，避妊是一个，另一个嘛你用了就知道了，比不用舒服。用前温水泡软了套上，别干套，干套疼。',
      },
      {
        id: 'yubiaotao',
        name: '鱼膘套',
        price: 1,
        desc: '黄河大鲤鱼的鱼鳔做的，比羊肠还薄还透。就一个毛病，尺寸偏小。你要是天生本钱大就别试了，勒得慌。普通身板的客官买这个比相思套划算。',
      },
      {
        id: 'hongsheng',
        name: '红绳',
        price: 2,
        desc: '朱红丝绳，比白绫带细，比琴弦软，专门绑手腕脚踝的。颜色衬得皮肤白，比白绫带多了层闺房秀色的意思。系法有讲究，系松了挣得开，系紧了勒印子，回头买了我教你几个结。',
      },
      {
        id: 'xiyangsiva',
        name: '西洋丝袜',
        price: 3,
        desc: '西洋舶来货，蚕丝织的，薄得透肉。顺着腿往上一拉，那个紧那个滑，你家姑娘穿上以后你眼睛就不想往别处看了。两条腿缠你腰上的时候跟没穿差不多，又比没穿强。就一双，省着穿，勾了丝别来找我。',
      },
    ],
  },
];

const SHOP_ITEMS = SHOP_CATEGORIES.flatMap(c => c.items);
const WORKSHOP_FENGYUE_STORAGE_KEY = 'workshop_fengyue_items';

function getWorkshopFengyueItems() {
  const stored = readJsonStorage(WORKSHOP_FENGYUE_STORAGE_KEY, []);
  return Array.isArray(stored) ? stored.filter(item => item && item.id && item.name) : [];
}

function getShopCategories() {
  const imported = getWorkshopFengyueItems();
  return imported.length ? [...SHOP_CATEGORIES, { name: '云端藏品', items: imported }] : SHOP_CATEGORIES;
}

function getShopItems() {
  return getShopCategories().flatMap(category => category.items);
}

// ============================================================
// 人物谱系图 —— 硬编码数据（不读变量，固定关系）
// ============================================================
function activeDlcStorage() {
  try {
    return window.parent?.localStorage ?? localStorage;
  } catch {
    return localStorage;
  }
}
function readActiveDlcContext(characterName) {
  if (!characterName) return null;
  try {
    const storage = activeDlcStorage();
    const key = `${ACTIVE_DLC_STORAGE_PREFIX}${characterName}`;
    const legacyKey = `${STORAGE_PREFIX}${key}`;
    const raw = storage.getItem(key) || storage.getItem(legacyKey);
    if (!raw) return null;
    const context = JSON.parse(raw);
    if (context && typeof context === 'object' && !storage.getItem(key)) storage.setItem(key, raw);
    return context && typeof context === 'object' ? context : null;
  } catch {
    return null;
  }
}
function writeActiveDlcContext(characterName, context) {
  const storage = activeDlcStorage();
  const key = `${ACTIVE_DLC_STORAGE_PREFIX}${characterName}`;
  storage.setItem(key, JSON.stringify(context));
  storage.removeItem(`${STORAGE_PREFIX}${key}`);
}
function removeActiveDlcContext(characterName) {
  try {
    const storage = activeDlcStorage();
    const key = `${ACTIVE_DLC_STORAGE_PREFIX}${characterName}`;
    storage.removeItem(key);
    storage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    /* ignore */
  }
}

let ACTIVE_DLC_CONTEXT = (() => {
  const runtimeContext = globalThis.__CMYJ_DLC_CONTEXT_V1__;
  if (runtimeContext && typeof runtimeContext === 'object') return runtimeContext;
  try {
    const getCurrentName = globalThis.getCurrentCharacterName ?? window.parent?.getCurrentCharacterName;
    const characterName = typeof getCurrentName === 'function' ? getCurrentName() : '';
    return readActiveDlcContext(characterName);
  } catch {
    return null;
  }
})();
const DLC_RELATIONSHIP_GRAPH = ACTIVE_DLC_CONTEXT?.ui?.relationshipGraph;

const GRAPH_CATEGORIES = Array.isArray(DLC_RELATIONSHIP_GRAPH?.categories)
  ? DLC_RELATIONSHIP_GRAPH.categories
  : [{ name: '未安装身份DLC', color: '#8b8178', symbol: 'circle' }];
const GRAPH_NODES =
  Array.isArray(DLC_RELATIONSHIP_GRAPH?.nodes) && DLC_RELATIONSHIP_GRAPH.nodes.length > 0
    ? DLC_RELATIONSHIP_GRAPH.nodes
    : [
        {
          id: '主角',
          name: '主角',
          category: 0,
          symbolSize: 64,
          symbol: 'circle',
          desc: '尚未安装身份 DLC；主角身份、关系与开场均未定义。',
        },
      ];
const GRAPH_LINKS = Array.isArray(DLC_RELATIONSHIP_GRAPH?.links) ? DLC_RELATIONSHIP_GRAPH.links : [];

const STAT_DATA_SHELL = {
  世界运转: {},
  主角: {},
  人际网络: {},
  军事: {},
  经济: {},
  科技: {},
  个人史记: {},
  天下地图: {},
  时局与任务: {},
  风月阁: {},
};
const DEFAULT_DATA = STAT_DATA_SHELL;
let frame;
let lamp;
let frameDocument;
let statData = DEFAULT_DATA;
let lastError = '';
let isOpen = false;
let theme = loadStorage('theme', 'day');
let customBackgroundUrl = loadStorage('background_url', '');
let customBackgroundOpacity = Math.min(1, Math.max(0.15, Number(loadStorage('background_opacity', '0.42')) || 0.42));
let activeTab = loadStorage('tab', 'overview');
let moneyView = loadStorage('money_view', 'ledger');
let marketPaymentCurrency = loadStorage('market_payment_currency', '白银');
let activeDifficulty = loadStorage('difficulty', 'normal');
let worldbookSyncing = false;
let shopEnabled = loadStorage('shop_enabled', '1') === '1';
let illustrationsEnabled = loadStorage('illustrations_enabled', '1') === '1';
let refreshTimer;
let lastMessageId = null;
let dragState = null;
let lampDragMoved = false;
let lampDragJustEnded = false;
let lastRefreshAt = '';
let lastViewport = '';
let modalState = null;
let mapSelected = null;
let graphSelected = '主角';
let graphSearch = '';
let portraitSelected = null;
let portraitGalleryFilter = 'all';
let echartsInstance = null;
let echartsReady = false;
let echartsGeoState = null;
let echartsGraphInstance = null;
let savedFoldState = new Set();
let savedTabsScrollLeft = 0;
let savedTabsScrollTop = 0;
let renderedTab = activeTab;
const savedContentScroll = {};
const pendingDeletedPaths = new Set();
let settleSessionId = ''; // 会话标记：换档时清空 pendingDeletedPaths
let mapMode = loadStorage('mapMode', 'status');
let marketTransactionPending = false;

// ============================================================
// 东亚 GeoJSON 子集 —— 从 WORLD_1629 筛选
// ============================================================

/** 从 WORLD_1629 中筛选东亚相关特征，构造精简 FeatureCollection */
function buildEastAsiaGeo() {
  const W = frame.contentWindow?.WORLD_1629;
  if (!W || !W.features) return { type: 'FeatureCollection', features: [] };
  const TARGETS = new Set([
    // 直接匹配（一一对应）
    '北直隶',
    '山东布政使司',
    '山西布政使司',
    '河南布政使司',
    '陕西布政使司',
    '陕西行都司',
    '四川布政使司',
    '江西布政使司',
    '浙江布政使司',
    '福建布政使司',
    '广东布政使司',
    '广西布政使司',
    '云南布政使司',
    '贵州布政使司',
    '辽东都司',
    '宁夏卫',
    '莫卧儿帝国',
    '阿瑜陀耶王朝(暹罗)',
    '不丹竺巴',
    '尼泊尔马拉王朝',
    '西属菲律宾',
    '马打蓝苏丹国',
    '藏巴汗',
    '叶尔羌汗国',
    '和硕特部',
    '康区土司',
    '澜沧·真腊',
    // 合并用（一个残明区域 = 多个 GeoJSON 特征）
    '建州女真(后金)',
    '野人女真诸部',
    '蒙古察哈尔部',
    '蒙古土默特部',
    '朵颜三卫',
    '喀尔喀蒙古',
    '南直隶(江南)',
    '南直隶(江北)',
    '湖广布政使司(北)',
    '湖广布政使司(南)',
    '后黎朝·郑主',
    '阮主(广南)',
    '澳大利亚(原住民)',
  ]);

  let features = W.features
    .filter(f => TARGETS.has(f.properties.name))
    .map(f => {
      const display = GEO_NAME_DISPLAY[f.properties.name];
      if (display) {
        return { ...f, properties: { ...f.properties, name: display } };
      }
      return f;
    });

  // 拆分德川幕府 → 日本 + 朝鲜 + 东番
  const tokugawa = W.features.find(f => f.properties.name === '德川幕府');
  if (tokugawa && tokugawa.geometry.type === 'MultiPolygon') {
    const coords = tokugawa.geometry.coordinates;
    // Poly 1 (765 pts, lng 124-130, lat 34-43) = 朝鲜半岛
    // Poly 18 (254 pts, lng 120-122, lat 22-25) = 东番/台湾
    // 其余 = 日本列岛
    const koreaCoords = [coords[1]];
    const taiwanCoords = [coords[18]];
    const japanCoords = coords.filter((_, i) => i !== 1 && i !== 18);

    features.push({
      type: 'Feature',
      properties: { name: '朝鲜' },
      geometry: { type: 'MultiPolygon', coordinates: koreaCoords },
    });
    features.push({
      type: 'Feature',
      properties: { name: '东番' },
      geometry: { type: 'MultiPolygon', coordinates: taiwanCoords },
    });
    features.push({
      type: 'Feature',
      properties: { name: '日本' },
      geometry: { type: 'MultiPolygon', coordinates: japanCoords },
    });
  }

  return { type: 'FeatureCollection', features };
}

/** 残明区域名 → GeoJSON 特征名（支持多对一合并） */
const REGION_GEO_MAP = {
  后金: ['后金', '野人女真'],
  北直隶: ['北直隶'],
  山东: ['山东'],
  山西: ['山西'],
  河南: ['河南'],
  陕西: ['陕西'],
  四川: ['四川'],
  江西: ['江西'],
  浙江: ['浙江'],
  福建: ['福建'],
  广东: ['广东'],
  广西: ['广西'],
  云南: ['云南'],
  贵州: ['贵州'],
  辽东: ['辽东'],
  宁夏: ['宁夏'],
  日本: ['日本'],
  朝鲜: ['朝鲜'],
  东番: ['东番'],
  莫卧儿: ['莫卧儿'],
  暹罗: ['暹罗'],
  不丹: ['不丹'],
  尼婆罗: ['尼婆罗'],
  吕宋: ['吕宋'],
  爪哇: ['爪哇'],
  乌思藏: ['乌思藏'],
  西域: ['西域'],
  青海: ['青海'],
  漠南蒙古: ['察哈尔', '土默特', '朵颜三卫'],
  漠北: ['喀尔喀'],
  南直隶: ['南直隶'],
  湖广: ['湖广'],
  安南: ['郑主', '广南'],
  澳洲: ['澳洲'],
  '澜沧·真腊': ['澜沧'],
};

/** GeoJSON 原名 → 显示名（ECharts nameMap） */
const GEO_NAME_DISPLAY = {
  山东布政使司: '山东',
  山西布政使司: '山西',
  河南布政使司: '河南',
  陕西布政使司: '陕西',
  陕西行都司: '陕西',
  四川布政使司: '四川',
  江西布政使司: '江西',
  浙江布政使司: '浙江',
  福建布政使司: '福建',
  广东布政使司: '广东',
  广西布政使司: '广西',
  云南布政使司: '云南',
  贵州布政使司: '贵州',
  '湖广布政使司(北)': '湖广',
  '湖广布政使司(南)': '湖广',
  '南直隶(江南)': '南直隶',
  '南直隶(江北)': '南直隶',
  辽东都司: '辽东',
  宁夏卫: '宁夏',
  莫卧儿帝国: '莫卧儿',
  '阿瑜陀耶王朝(暹罗)': '暹罗',
  不丹竺巴: '不丹',
  尼泊尔马拉王朝: '尼婆罗',
  西属菲律宾: '吕宋',
  马打蓝苏丹国: '爪哇',
  藏巴汗: '乌思藏',
  康区土司: '乌思藏',
  叶尔羌汗国: '西域',
  和硕特部: '青海',
  '建州女真(后金)': '后金',
  野人女真诸部: '野人女真',
  蒙古察哈尔部: '察哈尔',
  蒙古土默特部: '土默特',
  朵颜三卫: '朵颜三卫',
  喀尔喀蒙古: '喀尔喀',
  '后黎朝·郑主': '郑主',
  '阮主(广南)': '广南',
  '澳大利亚(原住民)': '澳洲',
  '澜沧·真腊': '澜沧',
};

/** 反向查找：GeoJSON 特征名 → 残明区域名 */
const GEO_TO_REGION = (() => {
  const map = {};
  for (const [regionName, geoNames] of Object.entries(REGION_GEO_MAP)) {
    for (const geoName of geoNames) {
      map[geoName] = regionName;
    }
  }
  return map;
})();

function findRegionByGeoName(geoName) {
  return GEO_TO_REGION[geoName] || null;
}

/** 归属着色只读取当前结构中的显式阵营。 */
function normalizeOwner(raw) {
  return Object.prototype.hasOwnProperty.call(OWNERSHIP_COLORS_DAY, raw) ? raw : '未知';
}

const OWNERSHIP_COLORS_DAY = {
  主角方: '#c04040',
  明廷: '#b5654b',
  后金: '#4a6fa5',
  流寇: '#b8953a',
  地方中立: '#9c9c9c',
  未知: '#d4c5a0',
};

const OWNERSHIP_COLORS_NIGHT = {
  主角方: '#d4604a',
  明廷: '#bf6f55',
  后金: '#5a7fb5',
  流寇: '#c8a53a',
  地方中立: '#6a6a6a',
  未知: '#4a3828',
};

/** 构建 ECharts series data：按 mapMode 分发 */
function buildRegionData() {
  const regions = get(statData, '天下地图.地区态势', {});
  const isNight = theme === 'night' || theme === 'star';
  if (mapMode === 'ownership') {
    return buildOwnershipData(regions, isNight);
  }
  return buildStatusData(regions, isNight);
}

function buildStatusData(regions, isNight) {
  const colorMap = {
    稳定: isNight ? '#6b8a58' : '#7b9b6a',
    动荡: isNight ? '#b88944' : '#c49750',
    争夺中: isNight ? '#b0543e' : '#bf5b46',
    沦陷: isNight ? '#35231d' : '#43312a',
    失控: isNight ? '#564465' : '#6a507a',
  };
  const result = [];
  for (const [regionName, geoNames] of Object.entries(REGION_GEO_MAP)) {
    const status = regions[regionName]?.争夺状态;
    const color = status ? colorMap[status] : isNight ? '#4a3828' : '#d4c5a0';
    for (const geoName of geoNames) {
      result.push({ name: geoName, itemStyle: { areaColor: color } });
    }
  }
  return result;
}

function buildOwnershipData(regions, isNight) {
  const colors = isNight ? OWNERSHIP_COLORS_NIGHT : OWNERSHIP_COLORS_DAY;
  const result = [];
  for (const [regionName, geoNames] of Object.entries(REGION_GEO_MAP)) {
    const owner = normalizeOwner(regions[regionName]?.实控阵营);
    const color = colors[owner];
    for (const geoName of geoNames) {
      result.push({ name: geoName, itemStyle: { areaColor: color } });
    }
  }
  return result;
}

/** 初始化/刷新 ECharts 地图 */
function initEChartsMap() {
  const win = frame.contentWindow;
  const echarts = win?.echarts;
  if (!echarts || !win?.WORLD_1629) {
    echartsReady = false;
    return;
  }
  const dom = frameDocument.getElementById('echarts-map');
  if (!dom) return;
  echartsReady = true;

  // 注册地图（仅首次）
  if (!echarts.getMap('east_asia_1629')) {
    echarts.registerMap('east_asia_1629', buildEastAsiaGeo());
  }

  // 销毁旧实例避免重复初始化
  if (echartsInstance) {
    echartsInstance.dispose();
  }
  echartsInstance = echarts.init(dom);

  // 不使用 geo 组件，全部配置集中在 map series（确保 per-region 着色生效）
  const regionData = buildRegionData();
  const isNight = theme === 'night' || theme === 'star';
  echartsInstance.setOption({
    backgroundColor: 'transparent',
    series: [
      {
        type: 'map',
        map: 'east_asia_1629',
        roam: true,
        center: echartsGeoState?.center || [110, 35],
        zoom: echartsGeoState?.zoom || 1.5,
        scaleLimit: { min: 1, max: 8 },
        label: { show: false },
        itemStyle: {
          areaColor: isNight ? 'rgba(42,36,32,0.85)' : 'rgba(175,148,115,0.82)',
          borderColor: isNight ? 'rgba(227,193,147,0.45)' : 'rgba(130,90,40,0.5)',
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            areaColor: isNight ? 'rgba(60,50,44,0.95)' : 'rgba(155,125,90,0.92)',
            borderColor: isNight ? 'rgba(227,193,147,0.8)' : 'rgba(110,70,30,0.75)',
            borderWidth: 1.5,
          },
          label: { show: true, color: '#e3c193', fontSize: 11 },
        },
        data: regionData,
        selectedMode: false,
      },
    ],
  });
  echartsGeoState = null;

  // 点击事件：直接更新详情面板，不触发全量 render（避免销毁地图 DOM）
  echartsInstance.on('click', 'series', params => {
    const geoName = params.name;
    const regionName = findRegionByGeoName(geoName);
    if (regionName) {
      mapSelected = regionName;
      const overlay = frameDocument.getElementById('cm-map-overlay');
      if (overlay) {
        overlay.innerHTML = renderMapDetail();
        overlay.classList.add('active');
      }
    }
  });

  // 阻止滚轮事件冒泡到 iframe 滚动容器（解决地图缩放与页面滚动冲突）
  // 策略：在 body 层拦截，仅当事件源在地图区域内时取消滚动
  if (!frameDocument.body._wheelFixed) {
    frameDocument.body._wheelFixed = true;
    frameDocument.body.addEventListener(
      'wheel',
      e => {
        if (e.target.closest('#echarts-map-wrapper') && !e.target.closest('.cm-map-overlay-card')) {
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }
}

function getGraphNode(id) {
  return GRAPH_NODES.find(n => n.id === id || n.name === id) || null;
}

function getGraphCategoryName(node) {
  if (!node) return '未知';
  if (node.id === '主角') return '主角';
  return GRAPH_CATEGORIES[node.category]?.name || '未知';
}

function getGraphRelations(id) {
  return GRAPH_LINKS.filter(l => l.source === id || l.target === id).map(l => ({
    label: l.label,
    other: l.source === id ? l.target : l.source,
  }));
}

function centerGraphMatches(matchedIds = null) {
  if (!echartsGraphInstance) return;
  const q = graphSearch.trim();
  let ids = matchedIds;
  if (!ids) {
    ids = GRAPH_NODES.filter(
      n => q && (n.name.includes(q) || n.id.includes(q) || n.desc.includes(q) || getGraphCategoryName(n).includes(q)),
    ).map(n => n.id);
  }
  if (!ids.length) return;

  if (!graphSelected || !ids.includes(graphSelected)) graphSelected = ids[0];
  const detail = frameDocument.getElementById('cm-graph-detail');
  if (detail) detail.innerHTML = renderGraphDetail();

  // 等力导向布局完成一帧后再取节点坐标，避免刚 setOption 时位置还没稳定
  setTimeout(() => {
    try {
      const series = echartsGraphInstance.getModel().getSeriesByIndex(0);
      const data = series.getData();
      const points = [];
      ids.forEach(id => {
        const idx = data.indexOfName(id);
        if (idx >= 0) {
          const layout = data.getItemLayout(idx);
          if (Array.isArray(layout) && Number.isFinite(layout[0]) && Number.isFinite(layout[1])) {
            const pixel = echartsGraphInstance.convertToPixel({ seriesIndex: 0 }, layout);
            points.push(Array.isArray(pixel) ? pixel : layout);
          }
        }
      });
      if (!points.length) return;
      const avg = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]).map(v => v / points.length);
      const dom = frameDocument.getElementById('echarts-graph');
      if (!dom) return;
      const center = [dom.clientWidth / 2, dom.clientHeight / 2];
      echartsGraphInstance.dispatchAction({
        type: 'graphRoam',
        seriesIndex: 0,
        dx: center[0] - avg[0],
        dy: center[1] - avg[1],
      });
    } catch (error) {
      console.warn('[状态栏] 人物谱系居中失败:', error);
    }
  }, 80);
}

function applyGraphSearch() {
  if (!echartsGraphInstance) return;
  const q = graphSearch.trim();
  const selectedId = graphSelected;
  const matched = new Set();
  const isNight = theme === 'night' || theme === 'star';
  const textColor = isNight ? '#c0b090' : '#5c4530';

  if (q) {
    GRAPH_NODES.forEach(n => {
      if (n.name.includes(q) || n.id.includes(q) || n.desc.includes(q) || getGraphCategoryName(n).includes(q)) {
        matched.add(n.id);
      }
    });
  }

  const adjacent = new Set([selectedId]);
  getGraphRelations(selectedId).forEach(r => adjacent.add(r.other));

  const nodes = GRAPH_NODES.map(n => {
    const isSearchHit = q && matched.has(n.id);
    const isSelected = n.id === selectedId;
    const isAdjacent = adjacent.has(n.id);
    const dim = q ? !isSearchHit : !(isSelected || isAdjacent);
    return {
      id: n.id,
      name: n.name,
      category: n.id === '主角' ? 0 : n.category + 1,
      symbolSize: n.symbolSize,
      symbol: n.symbol,
      desc: n.desc,
      label: { show: true, fontSize: 12, color: textColor, distance: 16, opacity: dim ? 0.35 : 1 },
      itemStyle: {
        opacity: dim ? 0.22 : 1,
        borderWidth: isSelected || isSearchHit ? 3 : n.id === '主角' ? 2 : 0,
        borderColor: isSelected
          ? '#f2d27a'
          : isSearchHit
            ? '#fff1b0'
            : n.id === '主角'
              ? isNight
                ? '#e8d090'
                : '#8a6a20'
              : undefined,
        color: n.id === '主角' ? '#d4a040' : undefined,
      },
    };
  });

  const links = GRAPH_LINKS.map(l => {
    const connected = l.source === selectedId || l.target === selectedId;
    const searchConnected = q && (matched.has(l.source) || matched.has(l.target));
    const dim = q ? !searchConnected : !connected;
    return {
      source: l.source,
      target: l.target,
      label: { show: true, formatter: l.label, fontSize: 11, color: textColor, opacity: dim ? 0.08 : 1 },
      lineStyle: {
        color: l.lineStyle?.color || (isNight ? '#6a5a40' : '#c0b090'),
        width: connected || searchConnected ? 3 : l.lineStyle?.width || 1,
        type: l.lineStyle?.type || 'solid',
        curveness: 0.15,
        opacity: dim ? 0.16 : 0.9,
      },
    };
  });

  echartsGraphInstance.setOption({ series: [{ nodes, links }] });
}

function initGraphChart() {
  const win = frame.contentWindow;
  const echarts = win?.echarts;
  if (!echarts) return;

  const dom = frameDocument.getElementById('echarts-graph');
  if (!dom) return;

  // 销毁旧实例
  if (echartsGraphInstance) {
    echartsGraphInstance.dispose();
  }
  echartsGraphInstance = echarts.init(dom);

  const isNight = theme === 'night' || theme === 'star';
  const textColor = isNight ? '#c0b090' : '#5c4530';
  const bgColor = 'transparent';

  // 构建 ECharts graph 数据
  const categories = [
    { name: '主角', symbol: 'circle', itemStyle: { color: '#d4a040' } },
    ...GRAPH_CATEGORIES.map(c => ({
      name: c.name,
      symbol: c.symbol || 'circle',
      itemStyle: { color: c.color },
    })),
  ];

  // 构建节点 lookup map
  const nodeMap = {};
  GRAPH_NODES.forEach(n => {
    nodeMap[n.id] = n;
  });

  const nodes = GRAPH_NODES.map(n => ({
    id: n.id,
    name: n.name,
    category: n.id === '主角' ? 0 : n.category + 1, // 主角用 cat 0，其余偏移
    symbolSize: n.symbolSize,
    symbol: n.symbol,
    desc: n.desc,
    label: { show: true, fontSize: 12, color: textColor, distance: 16 },
    itemStyle:
      n.id === '主角' ? { color: '#d4a040', borderColor: isNight ? '#e8d090' : '#8a6a20', borderWidth: 2 } : {},
  }));

  const links = GRAPH_LINKS.map(l => ({
    source: l.source,
    target: l.target,
    label: { show: true, formatter: l.label, fontSize: 11, color: textColor },
    lineStyle: {
      color: l.lineStyle?.color || (isNight ? '#6a5a40' : '#c0b090'),
      width: l.lineStyle?.width || 1,
      type: l.lineStyle?.type || 'solid',
      curveness: 0.15,
    },
  }));

  echartsGraphInstance.setOption({
    backgroundColor: bgColor,
    tooltip: {
      formatter: params =>
        params.dataType === 'node'
          ? `<b>${params.name}</b><br/><span style="font-size:12px;color:#999">${nodeMap[params.data.id]?.desc || ''}</span>`
          : params.data.label?.formatter || params.data.label || '',
      backgroundColor: isNight ? 'rgba(30,22,16,.94)' : 'rgba(255,248,226,.94)',
      borderColor: isNight ? 'rgba(180,140,100,.3)' : 'rgba(150,120,80,.3)',
      textStyle: { color: textColor },
    },
    legend: { show: false },
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        categories,
        nodes,
        links,
        force: {
          repulsion: 1200,
          edgeLength: [120, 350],
          gravity: 0.12,
          friction: 0.6,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 3 },
        },
        scaleLimit: { min: 0.4, max: 4 },
        lineStyle: {
          color: 'source',
          curveness: 0.15,
        },
      },
    ],
  });

  // 点击节点：更新右侧人物详情
  echartsGraphInstance.on('click', 'series', params => {
    if (params.dataType === 'node') {
      graphSelected = params.data.id;
      const detail = frameDocument.getElementById('cm-graph-detail');
      if (detail) detail.innerHTML = renderGraphDetail();
      applyGraphSearch();
      centerGraphMatches([graphSelected]);
    }
  });

  applyGraphSearch();
}

function mapColor(regionName) {
  const region = get(statData, `天下地图.地区态势.${regionName}`, null);
  if (!region || !region.争夺状态) return 'var(--bar-track)';
  const status = String(region.争夺状态);
  if (status === '稳定') return 'var(--map-stable,#6f8a67)';
  if (status === '动荡') return 'var(--map-unrest,#b78645)';
  if (status === '争夺中') return 'var(--map-contested,#a94b3b)';
  if (status === '沦陷') return 'var(--map-fallen,#3d2b22)';
  if (status === '失控') return 'var(--map-chaos,#5e4d6b)';
  return 'var(--bar-track)';
}

const MAP_LEGEND = [
  ['var(--map-stable,#6f8a67)', '稳定'],
  ['var(--map-unrest,#b78645)', '动荡'],
  ['var(--map-contested,#a94b3b)', '争夺中'],
  ['var(--map-fallen,#3d2b22)', '沦陷'],
  ['var(--map-chaos,#5e4d6b)', '失控'],
];

const OWNERSHIP_LEGEND = [
  ['#c04040', '主角方', '#d4604a'],
  ['#b5654b', '明廷', '#bf6f55'],
  ['#4a6fa5', '后金', '#5a7fb5'],
  ['#b8953a', '流寇', '#c8a53a'],
  ['#9c9c9c', '地方中立', '#6a6a6a'],
  ['#d4c5a0', '未知', '#4a3828'],
];

function renderMap() {
  const isNight = theme === 'night' || theme === 'star';
  return `
    <div class="cm-map-wrap">
      <div class="cm-map-mode-bar">
        <span class="cm-map-mode-toggles">
          <button class="cm-map-mode-btn${mapMode === 'status' ? ' active' : ''}" data-action="map-mode" data-mode="status">态势</button>
          <button class="cm-map-mode-btn${mapMode === 'ownership' ? ' active' : ''}" data-action="map-mode" data-mode="ownership">归属</button>
        </span>
        <span class="cm-map-legend">${(mapMode === 'ownership' ? OWNERSHIP_LEGEND : MAP_LEGEND)
          .map(
            ([color, label, nightColor]) => `
          <span class="cm-map-legend-item"><i style="background:${isNight && nightColor ? nightColor : color}"></i>${html(label)}</span>`,
          )
          .join('')}</span>
      </div>
      <div id="echarts-map-wrapper">
        <div id="echarts-map"></div>
        <div id="cm-map-overlay" class="cm-map-overlay${mapSelected ? ' active' : ''}">${mapSelected ? renderMapDetail() : ''}</div>
      </div>
    </div>
    ${!echartsReady ? emptyLine('舆图尚在绘就中……') : ''}`;
}

function renderMapDetail() {
  const region = get(statData, `天下地图.地区态势.${mapSelected}`, {});
  const powers = region.主要势力 || {};
  return `
    <div class="cm-map-overlay-card">
      <header class="cm-map-detail-head">
        <h3>${html(mapSelected)}</h3>
        <button class="cm-map-overlay-close" id="btn-close-map-overlay">×</button>
      </header>
      <div class="cm-map-overlay-body">
        <div class="cm-info-grid">
          ${meta('名义归属', region.名义归属 || '未载')}
          ${meta('实控势力', region.实控势力 || '未载')}
          ${meta('实控阵营', region.实控阵营 || '未知')}
          ${meta('争夺状态', region.争夺状态 || '未载')}
        </div>
        <p>${html(region.最近大事 || '暂无最近大事。')}</p>
        ${
          entries(powers).length
            ? `
          <h4>主要势力</h4>
          <div class="cm-map-powers">${entries(powers)
            .map(
              ([name, power]) => `
            <div class="cm-map-power">
              <div class="cm-meta"><span>${html(name)}</span><b>影响力 ${power.影响力 ?? 0}</b></div>
              <div class="cm-bar"><i class="mid" style="width:${clamp(power.影响力 ?? 0, 0, 100)}%"></i></div>
              <p class="cm-line">${html(power.军事存在 || '军事存在未知')}</p>
              <p class="cm-heart">${html(power.描述 || '暂无描述')}</p>
            </div>`,
            )
            .join('')}</div>`
            : ''
        }
        ${region.军事态势 ? `<p><small>军事态势：${html(region.军事态势)}</small></p>` : ''}
        ${region.经济态势 ? `<p><small>经济态势：${html(region.经济态势)}</small></p>` : ''}
      </div>
    </div>`;
}

function renderGraph() {
  const legendColors = GRAPH_CATEGORIES.map(c => c.color);
  const legendNames = ['主角', ...GRAPH_CATEGORIES.map(c => c.name)];
  const legendColorsAll = ['#d4a040', ...legendColors]; // 主角金色
  return `
    <div class="cm-graph-wrap">
      <div class="cm-graph-toolbar">
        <label class="cm-graph-search">
          <span>寻人</span>
          <input id="cm-graph-search-input" value="${html(graphSearch)}" placeholder="输入人名、地点、身份……" autocomplete="off" />
        </label>
        <button class="cm-mini-action" data-action="graph-search">搜索</button>
      </div>
      <div class="cm-graph-legend">${legendNames
        .map(
          (name, i) => `
        <span class="cm-graph-legend-item"><i style="background:${legendColorsAll[i]}"></i>${html(name)}</span>`,
        )
        .join('')}</span>
      </div>
      <div class="cm-graph-stage">
        <div id="echarts-graph-wrapper">
          <div id="echarts-graph"></div>
        </div>
        <aside id="cm-graph-detail" class="cm-graph-detail">${renderGraphDetail()}</aside>
      </div>
    </div>
    <p class="cm-empty">可拖拽节点 · 滚轮缩放 · 点击人物查看详情 · 搜索会高亮匹配人物</p>`;
}

function renderGraphDetail() {
  const node = getGraphNode(graphSelected) || getGraphNode('主角');
  const relations = getGraphRelations(node.id);
  const category = getGraphCategoryName(node);
  return `
    <div class="cm-graph-detail-card">
      <p class="cm-kicker">人物档案</p>
      <h3>${html(node.name)}</h3>
      <div class="cm-graph-detail-cat">${html(category)}</div>
      <p class="cm-heart">${html(node.desc || '暂无记载。')}</p>
      ${
        relations.length
          ? `
        <h4>关联人物</h4>
        <div class="cm-graph-relations">${relations
          .map(
            r => `
          <button class="cm-graph-relation" data-action="graph-select" data-node-id="${html(r.other)}">
            <b>${html(r.other)}</b><span>${html(r.label)}</span>
          </button>`,
          )
          .join('')}</div>`
          : ''
      }
    </div>`;
}

function loadStorage(key, fallback) {
  try {
    return (window.parent?.localStorage ?? localStorage).getItem(`${STORAGE_PREFIX}${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    (window.parent?.localStorage ?? localStorage).setItem(`${STORAGE_PREFIX}${key}`, value);
  } catch {
    // ignore storage failure
  }
}

function readJsonStorage(key, fallback) {
  try {
    const value = loadStorage(key, '');
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function html(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeBackgroundUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // 本地上传的安全栅格图片会以 Data URL 保存；不接受 SVG，避免脚本载荷。
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function renderCustomBackground() {
  const url = normalizeBackgroundUrl(customBackgroundUrl);
  if (!url) return '';
  return `<div class="cm-custom-background" style="background-image:url('${html(url)}');opacity:${customBackgroundOpacity}"></div>`;
}

function isPortraitUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;

  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function createDefaultPortraitLibrary() {
  const entries = {};
  for (const [name, portraits] of Object.entries(PORTRAIT_DATA)) {
    entries[name] = {
      name,
      aliases: [],
      title: '内置角色',
      summary: '',
      enabled: false,
      gallery: 'beauties',
      source: 'builtin',
      portraits: { ...portraits },
    };
  }
  return { version: 1, entries };
}

const PORTRAIT_GALLERY_OPTIONS = [
  ['none', '不加入人物志'],
  ['beauties', '群芳'],
  ['heroes', '英杰'],
  ['beings', '众生'],
];

function normalizePortraitGallery(value, source = 'custom') {
  const normalized = String(value || '').trim();
  if (PORTRAIT_GALLERY_OPTIONS.some(([key]) => key === normalized)) return normalized;
  return source === 'builtin' ? 'beauties' : 'none';
}

function normalizePortraitLibrary(library) {
  let changed = false;
  for (const entry of Object.values(library.entries || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const gallery = normalizePortraitGallery(entry.gallery, entry.source);
    if (entry.gallery !== gallery) {
      entry.gallery = gallery;
      changed = true;
    }
  }
  return changed;
}

function applyActiveDlcPortraits(library, context = ACTIVE_DLC_CONTEXT) {
  const profiles = Array.isArray(context?.portraitProfiles) ? context.portraitProfiles : [];
  const allowedNames = new Set(profiles.map(profile => profile?.name).filter(Boolean));
  let changed = false;
  for (const [name, portraits] of Object.entries(PORTRAIT_DATA)) {
    const entry = library.entries[name] || {
      name,
      aliases: [],
      title: '内置角色',
      summary: '',
      gallery: 'beauties',
      source: 'builtin',
      portraits: { ...portraits },
    };
    const enabled = allowedNames.has(name);
    if (!library.entries[name] || entry.enabled !== enabled) changed = true;
    entry.enabled = enabled;
    if (entry.source !== 'custom') entry.source = 'builtin';
    library.entries[name] = entry;
  }
  for (const [name, entry] of Object.entries(library.entries)) {
    if (entry?.source === 'scenario' && !allowedNames.has(name)) {
      delete library.entries[name];
      changed = true;
    }
  }
  for (const profile of profiles) {
    if (!profile?.name || !profile.portraits || typeof profile.portraits !== 'object') continue;
    const previous = library.entries[profile.name] || {};
    const next = {
      ...previous,
      name: profile.name,
      aliases: Array.isArray(profile.aliases) ? profile.aliases : [],
      title: profile.title || '',
      summary: profile.summary || '',
      enabled: true,
      gallery: normalizePortraitGallery(profile.gallery, 'scenario'),
      source: Object.hasOwn(PORTRAIT_DATA, profile.name) ? 'builtin' : 'scenario',
      scenarioId: context?.id || '',
      worldbookEntries: Array.isArray(profile.worldbookEntries) ? profile.worldbookEntries : [],
      portraits: { ...profile.portraits },
    };
    if (JSON.stringify(previous) !== JSON.stringify(next)) changed = true;
    library.entries[profile.name] = next;
  }
  return changed;
}

function getPortraitLibrary() {
  const stored = readJsonStorage(PORTRAIT_LIBRARY_STORAGE_KEY, null);
  if (stored?.version === 1 && stored.entries && typeof stored.entries === 'object') {
    let changed = normalizePortraitLibrary(stored);
    for (const [name, portraits] of Object.entries(PORTRAIT_DATA)) {
      if (stored.entries[name]) continue;
      stored.entries[name] = {
        name,
        aliases: [],
        title: '内置角色',
        summary: '',
        enabled: false,
        gallery: 'beauties',
        source: 'builtin',
        portraits: { ...portraits },
      };
      changed = true;
    }
    changed = applyActiveDlcPortraits(stored) || changed;
    if (changed) saveStorage(PORTRAIT_LIBRARY_STORAGE_KEY, JSON.stringify(stored));
    return stored;
  }
  const library = createDefaultPortraitLibrary();
  applyActiveDlcPortraits(library);
  saveStorage(PORTRAIT_LIBRARY_STORAGE_KEY, JSON.stringify(library));
  return library;
}

function savePortraitLibrary(library) {
  saveStorage(PORTRAIT_LIBRARY_STORAGE_KEY, JSON.stringify(library));
  window.CanmingPortraitLibrary = library;
  if (window.parent && window.parent !== window) window.parent.CanmingPortraitLibrary = library;
}

function getPortraitEntries() {
  return getPortraitLibrary().entries;
}

function collectPortraitData({ includeDisabled = false } = {}) {
  const data = {};
  for (const [name, entry] of Object.entries(getPortraitEntries())) {
    if (!includeDisabled && entry?.enabled === false) continue;
    if (!entry?.portraits || typeof entry.portraits !== 'object') continue;
    const portraits = Object.fromEntries(Object.entries(entry.portraits).filter(([, source]) => isPortraitUrl(source)));
    if (!Object.keys(portraits).length) continue;
    data[name] = portraits;
    for (const alias of entry.aliases || []) {
      if (alias && !data[alias]) data[alias] = data[name];
    }
  }
  return data;
}

function getPortraitData() {
  return collectPortraitData();
}

function getAllPortraitData() {
  return collectPortraitData({ includeDisabled: true });
}

function get(source, path, fallback = '') {
  const value = String(path)
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => (current == null ? undefined : current[key]), source);
  return value == null || value === '' ? fallback : value;
}

function entries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value);
}

function findInterpersonalPerson(data, name) {
  const network = _.get(data, '人际网络', {});
  for (const category of ['上司', '故友与同僚', '下属与幕僚', '三教九流', '仇敌', '亲属', '私帷']) {
    const person = network?.[category]?.[name];
    if (person && typeof person === 'object') return { category, person };
  }
  return null;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== 'object') parent[key] = {};
  return parent[key];
}

function normalizeStatDataKeys(data) {
  if (!data || typeof data !== 'object') return false;
  let changed = false;
  const reputation = Number(_.get(data, '主角.声望'));
  const stage = computeReputationStage(reputation);
  if (stage && _.get(data, '主角.声望阶段') !== stage) {
    _.set(data, '主角.声望阶段', stage);
    changed = true;
  }
  return changed;
}

function getMergedLatestVariables(mvu) {
  const latest = mvu.getMvuData({ type: 'message', message_id: 'latest' }) || {};
  // 直接用 latest 已有的 stat_data，不做逐层合并，也不回退 getAllVariables()
  // —— 避免世界书 [initvar] 的旧结构污染合并结果。
  if (!latest.stat_data || typeof latest.stat_data !== 'object') {
    latest.stat_data = {};
  }
  normalizeStatDataKeys(latest.stat_data);
  return latest;
}

function sumMoneyRecord(record, filter = null) {
  return Math.round(
    entries(record).reduce((sum, [key, item]) => {
      if (filter && !filter(key, item)) return sum;
      return sum + number(item?.银两, 0);
    }, 0),
  );
}

function reconcileEconomy(data) {
  if (!data) return 0;
  const economy = ensureObject(data, '经济');
  const flow = ensureObject(economy, '流水');
  if (!flow.月入 || typeof flow.月入 !== 'object') flow.月入 = {};
  if (!flow.月出 || typeof flow.月出 !== 'object') flow.月出 = {};
  const income = sumMoneyRecord(flow.月入);
  const outcome = sumMoneyRecord(flow.月出);
  flow.本月结余 = income - outcome;
  return flow.本月结余;
}

// ============================================================
// 月度结算系统 —— 由脚本接管，AI 无需执行
// ============================================================

const ARMY_GRAIN_KEYS = ['军粮', '粮食', '米', '稻米', '谷物', '麦', '粟', '杂粮', '黄豆'];
const NON_HUMAN_GRAIN_KEYS = ['草料', '马料', '饲料', '豆饼'];
const GRAIN_SILVER_RATE = 2; // 军粮缺口折银汇率：1石 = 2两

/** 从中文日期中提取"年月"标识，用于跨月去重比较 */
function extractYearMonth(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  // 匹配：崇祯十七年三月、甲申年三月、1644年3月、崇祯十七年 三月 等
  const m = s.match(/(.+?年)\s*(闰?\S{1,3}?月)/);
  if (m) return m[1] + m[2];
  // fallback：公历格式 1644-03 或 1644/3
  const m2 = s.match(/(\d{3,4})\s*[年\/\-]\s*(\d{1,2})\s*月/);
  if (m2) return m2[1] + '年' + m2[2] + '月';
  return null;
}

function roundMarketNumber(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((number(value, 0) + Number.EPSILON) * factor) / factor;
}

function createMonthlyMarketStock() {
  return Object.fromEntries(MARKET_ITEMS.map(item => [item.id, item.monthlyStock]));
}

function ensureMarketState(data, currentYM = '') {
  const economy = ensureObject(data, '经济');
  const market = ensureObject(economy, '市场');
  const indices = ensureObject(market, '价格指数');
  const rates = ensureObject(market, '汇率');
  for (const [category] of MARKET_CATEGORIES) {
    indices[category] = Math.round(clamp(number(indices[category], 100), 50, 500));
  }
  rates.一两黄金兑白银 = roundMarketNumber(clamp(number(rates.一两黄金兑白银, 6), 3, 20));
  rates.一两白银兑铜钱 = Math.round(clamp(number(rates.一两白银兑铜钱, 1200), 500, 5000));
  if (typeof market.市况 !== 'string' || !market.市况.trim()) market.市况 = '平稳';

  const monthChanged = Boolean(currentYM && market._库存月份 !== currentYM);
  if (monthChanged || !market._剩余库存 || typeof market._剩余库存 !== 'object') {
    market._剩余库存 = createMonthlyMarketStock();
    if (currentYM) market._库存月份 = currentYM;
  } else {
    for (const item of MARKET_ITEMS) {
      if (market._剩余库存[item.id] == null) market._剩余库存[item.id] = item.monthlyStock;
      market._剩余库存[item.id] = Math.round(
        clamp(number(market._剩余库存[item.id], item.monthlyStock), 0, item.monthlyStock),
      );
    }
    if (currentYM && !market._库存月份) market._库存月份 = currentYM;
  }
  return market;
}

function resetMonthlyMarketStock(data, currentYM) {
  const market = ensureMarketState(data, '');
  market._库存月份 = currentYM || market._库存月份 || '';
  market._剩余库存 = createMonthlyMarketStock();
  return market;
}

function getMarketItemPriceInSilver(item, market, quantity = 1) {
  const index = clamp(number(market?.价格指数?.[item.category], 100), 50, 500);
  return roundMarketNumber(item.basePrice * (index / 100) * Math.max(0, quantity));
}

function getMarketPaymentQuote(silverPrice, currency, market) {
  const goldRate = clamp(number(market?.汇率?.一两黄金兑白银, 6), 3, 20);
  const copperRate = clamp(number(market?.汇率?.一两白银兑铜钱, 1200), 500, 5000);
  if (currency === '黄金') {
    const amount = Math.ceil((silverPrice / goldRate) * 1000) / 1000;
    return { key: '黄金', amount, text: `${roundMarketNumber(amount)} 两黄金` };
  }
  if (currency === '铜钱') {
    const amount = Math.ceil(silverPrice * copperRate);
    return { key: '铜钱', amount, text: `${amount} 文铜钱` };
  }
  const amount = roundMarketNumber(silverPrice);
  return { key: '白银', amount, text: `${amount} 两白银` };
}

function classifyCampType(camp) {
  const text = `${camp?.兵种 || ''} ${camp?.等级 || ''} ${camp?.装备 || ''}`;
  if (/[家丁亲兵内丁]/.test(text)) return 'retinue';
  if (/[骑马骡驼]/.test(text)) return 'cavalry';
  if (/[水师船舟]/.test(text)) return 'navy';
  if (/[火器鸟铳铳炮车营]/.test(text)) return 'firearm';
  if (/[民壮乡勇团练]/.test(text)) return 'militia';
  return 'infantry';
}

function campLevelFactor(level, kind = 'money') {
  const moneyFactors = { 乌合: 0.5, 新募: 0.7, 可用: 0.85, 良好: 1, 精锐: 1.25, 名军: 1.5 };
  const grainFactors = { 乌合: 0.9, 新募: 0.95, 可用: 1, 良好: 1.05, 精锐: 1.1, 名军: 1.15 };
  const factors = kind === 'grain' ? grainFactors : moneyFactors;
  return factors[level] ?? 1;
}

function estimateCampMonthlyCost(camp) {
  const people = Math.max(0, Math.round(number(camp?.人数, 0)));
  if (!people) return 0;
  const rates = { militia: 0.35, infantry: 0.75, firearm: 0.95, navy: 1, cavalry: 1.4, retinue: 1.8 };
  const type = classifyCampType(camp);
  return Math.round(people * rates[type] * campLevelFactor(camp?.等级, 'money'));
}

function estimateCampMonthlyGrain(camp) {
  const people = Math.max(0, Math.round(number(camp?.人数, 0)));
  if (!people) return 0;
  const rates = { militia: 0.25, infantry: 0.35, firearm: 0.38, navy: 0.38, cavalry: 0.4, retinue: 0.42 };
  const type = classifyCampType(camp);
  return Math.ceil(people * rates[type] * campLevelFactor(camp?.等级, 'grain'));
}

function estimateArmyMonthlySupply(data) {
  const camps = entries(_.get(data, '军事.各营', {}));
  const details = camps
    .map(([name, camp]) => {
      const people = Math.max(0, Math.round(number(camp?.人数, 0)));
      const cost = estimateCampMonthlyCost(camp);
      const grain = estimateCampMonthlyGrain(camp);
      return { name, people, cost, grain };
    })
    .filter(item => item.people > 0);
  return {
    cost: Math.round(details.reduce((sum, item) => sum + item.cost, 0)),
    grain: Math.round(details.reduce((sum, item) => sum + item.grain, 0)),
    people: Math.round(details.reduce((sum, item) => sum + item.people, 0)),
    details,
  };
}

function grainStorageEntries(storage) {
  return entries(storage)
    .filter(([, item]) => item && typeof item === 'object')
    .filter(([name, item]) => {
      const unit = String(item.单位 || '');
      const itemName = String(name);
      if (NON_HUMAN_GRAIN_KEYS.some(key => itemName.includes(key))) return false;
      return unit === '石' || ARMY_GRAIN_KEYS.some(key => itemName.includes(key));
    })
    .sort(([a], [b]) => {
      const score = name => ARMY_GRAIN_KEYS.findIndex(key => String(name).includes(key));
      const sa = score(a);
      const sb = score(b);
      return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb);
    });
}

function consumeArmyGrain(data, required) {
  const need = Math.max(0, Math.round(number(required, 0)));
  const economy = ensureObject(data, '经济');
  const storage = ensureObject(economy, '仓储');
  let remaining = need;
  let grainConsumed = 0;

  // 第一步：消耗仓储粮食
  for (const [, item] of grainStorageEntries(storage)) {
    if (remaining <= 0) break;
    const available = Math.max(0, Math.round(number(item.数量, 0)));
    if (!available) continue;
    const used = Math.min(available, remaining);
    item.数量 = available - used;
    grainConsumed += used;
    remaining -= used;
  }

  // 第二步：白银兜底 —— 缺口按汇率折银从私库扣除
  let silverSpent = 0;
  let silverCovered = 0;
  if (remaining > 0) {
    const coins = ensureObject(ensureObject(data, '主角'), '私库').金银铜;
    const silverNeeded = remaining * GRAIN_SILVER_RATE;
    const currentSilver = Math.round(number(coins.白银, 0));
    const silverAvailable = Math.max(0, currentSilver);
    silverSpent = Math.min(silverAvailable, silverNeeded);
    // 负白银表示已有债务，粮食折银时不得将其归零吞掉。
    coins.白银 = currentSilver - silverSpent;
    silverCovered = Math.floor(silverSpent / GRAIN_SILVER_RATE);
    remaining -= silverCovered;
  }

  const totalConsumed = grainConsumed + silverCovered;
  return {
    required: need,
    consumed: totalConsumed,
    grainConsumed,
    silverSpent,
    silverCovered,
    shortage: Math.max(0, need - totalConsumed),
    ratio: need > 0 ? clamp(totalConsumed / need, 0, 1) : 1,
  };
}

function shortagePenalty(ratio, type) {
  if (ratio >= 1) return { morale: 0, logistics: 0 };
  if (type === 'money') {
    if (ratio >= 0.8) return { morale: -1, logistics: 0 };
    if (ratio >= 0.6) return { morale: -2, logistics: -1 };
    if (ratio >= 0.4) return { morale: -3, logistics: -2 };
    if (ratio >= 0.2) return { morale: -5, logistics: -3 };
    return { morale: -6, logistics: -4 };
  }
  if (ratio >= 0.8) return { morale: 0, logistics: -1 };
  if (ratio >= 0.6) return { morale: -1, logistics: -2 };
  if (ratio >= 0.4) return { morale: -2, logistics: -4 };
  if (ratio >= 0.2) return { morale: -3, logistics: -6 };
  return { morale: -4, logistics: -8 };
}

function applyArmySupplyEffects(data, payRatio, grainRatio) {
  const moneyPenalty = shortagePenalty(payRatio, 'money');
  const grainPenalty = shortagePenalty(grainRatio, 'grain');
  const moraleDelta = Math.max(-8, moneyPenalty.morale + grainPenalty.morale);
  const logisticsDelta = Math.max(-10, moneyPenalty.logistics + grainPenalty.logistics);
  if (!moraleDelta && !logisticsDelta) return { moraleDelta: 0, logisticsDelta: 0, affected: 0 };
  let affected = 0;
  for (const [, camp] of entries(_.get(data, '军事.各营', {}))) {
    if (!camp || number(camp.人数, 0) <= 0) continue;
    camp.士气 = Math.round(clamp(number(camp.士气, 50) + moraleDelta, 0, 100));
    camp.后勤 = Math.round(clamp(number(camp.后勤, 50) + logisticsDelta, 0, 100));
    affected += 1;
  }
  return { moraleDelta, logisticsDelta, affected };
}

function sumAssetIncome(assets) {
  let assetIncome = 0;
  for (const asset of Object.values(assets || {})) {
    if (asset && typeof asset.月入 === 'number' && Number.isFinite(asset.月入)) {
      assetIncome += asset.月入;
    }
  }
  return Math.round(assetIncome);
}

/** 执行月度结算：直接修改 variables 对象（用于事件回调中的就地修改） */
function doSettlementInPlace(variables, options = {}) {
  const data = _.get(variables, 'stat_data');
  if (!data) return null;

  // 确保路径存在
  if (!data.主角) data.主角 = {};
  if (!data.主角.私库) data.主角.私库 = {};
  if (!data.主角.私库.金银铜) data.主角.私库.金银铜 = { 黄金: 0, 白银: 0, 铜钱: 0 };
  if (!data.经济) data.经济 = {};
  if (!data.经济.流水) data.经济.流水 = {};

  const coins = data.主角.私库.金银铜;
  const assets = data.经济.资产 || {};
  const flow = ensureObject(data.经济, '流水');
  if (!flow.月入 || typeof flow.月入 !== 'object') flow.月入 = {};
  if (!flow.月出 || typeof flow.月出 !== 'object') flow.月出 = {};

  const closeYM = options.closeYM || extractYearMonth(_.get(variables, 'stat_data.世界运转.当前日期', ''));
  const applyArmy = options.applyArmy !== false;

  // 资产月入：仅自动结算收取
  const assetIncome = applyArmy ? sumAssetIncome(assets) : 0;

  // 流水轧差（月入 - 月出，不含军费——军费不走变量）
  const income = sumMoneyRecord(flow.月入);
  const ordinaryOutcome = sumMoneyRecord(flow.月出);
  const balance = income - ordinaryOutcome;
  const beforeSilver = Math.round(number(coins.白银, 0));

  // 军费：仅自动结算时按当前营伍实时估算
  let armyExpense = 0;
  let armySupply = null;
  let payRatio = 1;
  if (applyArmy) {
    armySupply = estimateArmyMonthlySupply(data);
    armyExpense = armySupply.cost;
    if (armyExpense > 0) {
      const silverBeforeArmy = beforeSilver + assetIncome + balance;
      payRatio = clamp(Math.max(0, silverBeforeArmy) / armyExpense, 0, 1);
    }
  }

  // 私库结算
  if (applyArmy && armyExpense > 0) {
    // 不足部分保留为负白银（净负债/欠饷），不得归零后再清空流水。
    coins.白银 = Math.round(beforeSilver + assetIncome + balance - armyExpense);
  } else {
    coins.白银 = Math.round(beforeSilver + assetIncome + balance);
  }

  // 军粮 & 惩罚：仅自动结算
  let grainResult = {
    required: 0,
    consumed: 0,
    grainConsumed: 0,
    silverSpent: 0,
    silverCovered: 0,
    shortage: 0,
    ratio: 1,
  };
  let supplyEffect = { moraleDelta: 0, logisticsDelta: 0, affected: 0 };
  if (applyArmy && armySupply && armySupply.grain > 0) {
    grainResult = consumeArmyGrain(data, armySupply.grain);
    supplyEffect = applyArmySupplyEffects(data, payRatio, grainResult.ratio);
  }

  // 本月结余归零并清空月入/月出字典
  // 将每条子路径加入删除集，防止旧消息楼层的数据在合并时复活
  data.经济.流水.本月结余 = 0;
  const incomeBeforeClear = income;
  const outcomeBeforeClear = ordinaryOutcome;
  for (const key of Object.keys(flow.月入 || {})) {
    pendingDeletedPaths.add(`经济.流水.月入.${key}`);
  }
  for (const key of Object.keys(flow.月出 || {})) {
    pendingDeletedPaths.add(`经济.流水.月出.${key}`);
  }
  data.经济.流水.月入 = {};
  data.经济.流水.月出 = {};
  // 写入会话标记：换档后标记不匹配，pendingDeletedPaths 自动清空
  if (settleSessionId) data.经济._结算标记 = settleSessionId;
  reconcileEconomy(data);

  const result = {
    assetIncome,
    balance,
    totalTransfer: Math.round(number(coins.白银, 0) - beforeSilver),
    armyExpense,
    totalIncome: incomeBeforeClear,
    totalOutcome: outcomeBeforeClear,
    payRatio,
    grain: grainResult,
    supplyEffect,
    settledYM: closeYM,
    afterSilver: Math.round(number(coins.白银, 0)),
  };

  // 写入结算记录，供 UI 展示
  writeSettlementRecord(data, result, applyArmy);

  return result;
}

/** 将结算结果写入 stat_data，供 UI 展示 */
function writeSettlementRecord(data, result, isAuto) {
  if (!data || !result) return;
  const economy = ensureObject(data, '经济');
  economy.上次结算 = {
    日期: result.settledYM || '未知',
    类型: isAuto ? '自动跨月结算' : '手动结算',
    资产月入: result.assetIncome || 0,
    月入合计: result.totalIncome || 0,
    普通月出: result.totalOutcome || 0,
    军费支出: result.armyExpense || 0,
    仓储耗粮: result.grain?.grainConsumed || 0,
    折银补粮: result.grain?.silverSpent || 0,
    粮秣缺口: result.grain?.shortage || 0,
    士气变动: result.supplyEffect?.moraleDelta || 0,
    后勤变动: result.supplyEffect?.logisticsDelta || 0,
    受影响的营: result.supplyEffect?.affected || 0,
    私库变动: result.totalTransfer || 0,
    私库余额: result.afterSilver || 0,
  };
}

/** 手动月度结算（用户点击按钮） */
async function manualSettle() {
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  if (!mvu?.getMvuData || !mvu?.replaceMvuData) {
    showToast('MVU 尚未初始化，无法结算。', 'err');
    return;
  }
  try {
    const variables = getMergedLatestVariables(mvu);
    const currentYM = extractYearMonth(_.get(variables, 'stat_data.世界运转.当前日期', ''));
    const result = doSettlementInPlace(variables, {
      closeYM: currentYM,
      applyArmy: false,
    });
    await mvu.replaceMvuData(variables, { type: 'message', message_id: 'latest' });
    statData = _.get(variables, 'stat_data', {});
    lastError = '';
    lastRefreshAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    if (currentYM) saveStorage('last_settled_ym', currentYM);
    const armyHint = result?.armyExpense
      ? ` · 本月养军预估 ${result.armyExpense} 两 / ${result.grain?.required || 0} 石（跨月时自动扣除）`
      : '';
    const detail = result
      ? `流水轧差 ${result.totalTransfer >= 0 ? '+' : ''}${result.totalTransfer} 两${armyHint}`
      : '';
    showToast(`✓ 月度结算完成${detail ? '（' + detail + '）' : ''}`, 'ok');
  } catch (error) {
    showToast(`✗ 结算失败：${error?.message || '未知错误'}`, 'err');
  }
}

/** 根据二十四时自动计算十二时辰 */
function computeShichen(hour, minute) {
  if (typeof hour !== 'number' || typeof minute !== 'number') return null;
  const NAMES = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];
  // 每个时辰2小时：子=23/0, 丑=1/2, 寅=3/4, ...
  let idx;
  if (hour === 23 || hour === 0) {
    idx = 0;
  } else {
    idx = Math.floor((hour + 1) / 2);
  }
  const 时辰 = NAMES[idx];

  // 每时辰120分钟，分八刻
  const isFirstHour = hour === 23 || hour % 2 === 1;
  const posIn120 = isFirstHour ? minute : 60 + minute;

  let 刻;
  if (posIn120 < 15) 刻 = '初刻';
  else if (posIn120 < 30) 刻 = '一刻';
  else if (posIn120 < 45) 刻 = '二刻';
  else if (posIn120 < 60) 刻 = '三刻';
  else if (posIn120 < 75) 刻 = '四刻';
  else if (posIn120 < 90) 刻 = '五刻';
  else if (posIn120 < 105) 刻 = '六刻';
  else 刻 = '七刻';

  return { 时辰, 刻 };
}

/** 声望阶段是声望数值的派生字段，不交由 AI 重复维护 */
function computeReputationStage(value) {
  const reputation = Number(value);
  if (!Number.isFinite(reputation)) return null;
  if (reputation >= 801) return '名垂千古';
  if (reputation >= 501) return '天下景仰';
  if (reputation >= 201) return '威震一方';
  if (reputation >= 51) return '声名鹊起';
  if (reputation >= 0) return '默默无闻';
  if (reputation >= -150) return '毁誉参半';
  if (reputation >= -400) return '众矢之的';
  if (reputation >= -700) return '声名狼藉';
  return '遗臭万年';
}

// ============================================================
// 生育系统 —— 脚本接管周期推进、时期判定、怀孕判定、预产期、产后恢复
// AI 只需负责：写末次同房、写分娩剧情
// ============================================================

/** 周期值 → 时期 */
function periodToPhase(period) {
  const p = Number(period) || 1;
  if (p >= 1 && p <= 5) return '经期';
  if (p >= 14 && p <= 17) return '危险期';
  return '安全期';
}

/** 推进生育系统 N 天（在 VARIABLE_UPDATE_ENDED 中调用） */
function advanceReproductiveSystem(variables, days, oldDay) {
  const data = _.get(variables, 'stat_data');
  if (!data || days <= 0) return;

  const women = _.get(data, '人际网络.私帷', {});
  const startDayIdx = Number(oldDay ?? Number(_.get(data, '世界运转.世界运转天数', 0)) - days) || 0;

  for (let d = 0; d < days; d++) {
    const dayIdx = startDayIdx + d + 1;

    for (const [, woman] of Object.entries(women)) {
      if (!woman || !woman.生育) continue;
      const f = woman.生育;

      switch (f.状态) {
        case '未孕': {
          f.周期 = (Number(f.周期) || 1) + 1;

          // 归1判定
          if (f.周期 > 28) {
            f.周期 = 1;
            const last = f.末次同房;
            let pregnant = false;
            if (last && Number(last.判定概率) > 0) {
              pregnant = Math.random() * 100 < Number(last.判定概率);
            }

            if (pregnant) {
              f.状态 = '已孕';
              f.时期 = '安全期';
              f._预产天数 = dayIdx + 280;
              f._产后天数 = 0;
              f.预产期 = `第${f._预产天数}日左右`;
            } else {
              f.时期 = periodToPhase(f.周期);
            }

            // 不论成功与否，重置末次同房
            f.末次同房 = { 日期: '', 周期日: 0, 判定概率: 0 };
          } else {
            f.时期 = periodToPhase(f.周期);
          }
          break;
        }

        case '已孕': {
          f.时期 = '安全期';
          const dueDay = Number(f._预产天数) || 0;
          if (dueDay > 0 && dayIdx >= dueDay) {
            f.状态 = '待产';
          }
          break;
        }

        case '待产':
          // 不动，等 AI 写分娩剧情后手动改为'产后'
          f.时期 = '安全期';
          break;

        case '产后': {
          f.时期 = '安全期';
          f._预产天数 = 0;
          f.预产期 = '';
          f._产后天数 = Number(f._产后天数) + 1;
          if (f._产后天数 >= 35) {
            f.状态 = '未孕';
            f.周期 = 1;
            f.时期 = '安全期';
            f._产后天数 = 0;
          }
          break;
        }
      }
    }
  }

  // 清理：AI 手动改状态（如流产）后，清除内部计数器
  for (const [, woman] of Object.entries(women)) {
    if (!woman?.生育) continue;
    const f = woman.生育;
    const st = f.状态;
    if (st !== '已孕' && st !== '待产') {
      f._预产天数 = 0;
      if (st !== '产后') f.预产期 = '';
    }
    if (st !== '产后') {
      f._产后天数 = 0;
    }
  }
}

function formatTime() {
  const hour = String(get(statData, '世界运转.二十四时.小时', 0)).padStart(2, '0');
  const minute = String(get(statData, '世界运转.二十四时.分钟', 0)).padStart(2, '0');
  const 时辰 = get(statData, '世界运转.十二时辰.时辰', '卯时');
  const 刻 = get(statData, '世界运转.十二时辰.刻', '三刻');
  return `${时辰}${刻} / ${hour}:${minute}`;
}

function card(title, body, extraClass = '') {
  return `<section class="cm-card ${extraClass}"><h3>${html(title)}</h3>${body || emptyLine()}</section>`;
}

function emptyLine(text = '此簿暂无记载。') {
  return `<p class="cm-empty">${html(text)}</p>`;
}

function tag(text, tone = '') {
  return `<span class="cm-tag ${tone}">${html(text)}</span>`;
}

function actionButton(label, action, path) {
  return `<button class="cm-mini-action" data-action="${html(action)}" data-path="${html(path)}">${html(label)}</button>`;
}

function portraitButton(name) {
  if (!getPortraitData()[name]) return '';
  return `<button class="cm-mini-action cm-mini-portrait" data-action="view-portrait" data-portrait-name="${html(name)}">立绘</button>`;
}

function deleteByPath(source, path) {
  const keys = String(path).split('.').filter(Boolean);
  const last = keys.pop();
  const parent = keys.reduce((current, key) => (current == null ? undefined : current[key]), source);
  if (parent && last && Object.prototype.hasOwnProperty.call(parent, last)) {
    delete parent[last];
    return true;
  }
  return false;
}

function hasByPath(source, path) {
  const keys = String(path).split('.').filter(Boolean);
  if (!keys.length) return false;
  let current = source;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) return false;
    current = current[key];
  }
  return true;
}

async function deleteMvuPathEverywhere(mvu, path) {
  // 参考变量管理器做法：直接读取 latest 合并快照、删除路径、写回。
  // 不再逐层遍历消息楼层 —— 逐层遍历只会增加不必要的 API 开销，而且
  // 如果某层 stat_data 本身为空或缺失父键，"从底层恢复"的风险依然存在。
  // latest 是唯一的合并且可读写的快照，所有修改都通过它即可。
  let touchedCount = 0;
  const latest = mvu.getMvuData({ type: 'message', message_id: 'latest' }) || {};
  const data = _.get(latest, 'stat_data', null);

  if (data && typeof data === 'object' && hasByPath(data, path)) {
    deleteByPath(data, path);
    await mvu.replaceMvuData(latest, { type: 'message', message_id: 'latest' });
    touchedCount = 1;
  }

  return { deletedCount: touchedCount, touchedCount };
}

function applyPendingDeletedPaths(data) {
  if (!data || !pendingDeletedPaths.size) return;
  for (const path of pendingDeletedPaths) {
    deleteByPath(data, path);
  }
}

function meta(label, value) {
  return `<div class="cm-meta"><span>${html(label)}</span><b>${html(value || '未载')}</b></div>`;
}

function bar(label, value, options = {}) {
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  const current = number(value, 0);
  const percent = clamp(((current - min) / (max - min)) * 100, 0, 100);
  const tone = options.tone ?? (current < 30 ? 'low' : current > 70 ? 'high' : 'mid');
  return `
    <div class="cm-bar-row">
      <div class="cm-bar-head"><span>${html(label)}</span><b>${html(current)}</b></div>
      <div class="cm-bar"><i class="${tone}" style="width:${percent}%"></i></div>
    </div>`;
}

function recordList(record, renderer, emptyText = '此簿暂无记载。') {
  const list = entries(record);
  if (!list.length) return emptyLine(emptyText);
  return `<div class="cm-list">${list.map(([name, value]) => renderer(name, value || {})).join('')}</div>`;
}

function foldGroup(title, body, emptyText = '此簿暂无记载。') {
  const isOpen = savedFoldState.has(title);
  return `
    <details class="cm-fold" data-fold-key="${html(title)}"${isOpen ? ' open' : ''}>
      <summary><span>${html(title)}</span></summary>
      <div class="cm-fold-body">${body || emptyLine(emptyText)}</div>
    </details>`;
}

function foldItem(title, summary, body, extraClass = '') {
  const isOpen = savedFoldState.has(title);
  return `
    <details class="cm-fold cm-fold-item ${extraClass}" data-fold-key="${html(title)}"${isOpen ? ' open' : ''}>
      <summary><span>${html(title)}</span><span class="cm-row-tags">${summary || ''}</span></summary>
      <div class="cm-fold-body">${body || emptyLine()}</div>
    </details>`;
}

function rowList(record, renderer, emptyText = '此簿暂无记载。') {
  const list = entries(record);
  if (!list.length) return emptyLine(emptyText);
  return `<div class="cm-row-list">${list.map(([name, value]) => renderer(name, value || {})).join('')}</div>`;
}

function compactObject(record, valueRenderer) {
  const list = entries(record);
  if (!list.length) return emptyLine();
  return `<div class="cm-compact-list">${list.map(([name, value]) => valueRenderer(name, value || {})).join('')}</div>`;
}

function sceneTone(scene) {
  if (scene === 'WAR') return 'war';
  if (scene === 'NSFW') return 'private';
  return 'safe';
}

function renderOverview() {
  const scene = get(statData, '世界运转.场景', 'SFW');
  const 五维 = get(statData, '主角.五维', {});
  const tasks = entries(get(statData, '时局与任务.当前任务', {})).slice(0, 5);
  return `
    <div class="cm-hero">
      <div>
        <h2>${html(get(statData, '世界运转.当前日期', '未载日期'))}</h2>
        <p>${html(formatTime())} · ${html(get(statData, '世界运转.天气', '未载天气'))} · ${tag(scene, sceneTone(scene))}</p>
        <p class="cm-place">${html(get(statData, '世界运转.当前地点', '未载地点'))}</p>
      </div>
    </div>
    <div class="cm-grid two">
      ${card(
        '此身',
        `
        ${meta('官职', get(statData, '主角.官职', '未载'))}
        ${meta('声望', `${get(statData, '主角.声望', 0)} · ${get(statData, '主角.声望阶段', '默默无闻')}`)}
        <div class="cm-mini-bars">
          ${['生命', '武力', '统率', '智谋', '政治'].map(key => bar(key, 五维[key] ?? 0)).join('')}
        </div>`,
      )}
      ${card(
        '当前事务',
        tasks.length
          ? `<div class="cm-list">${tasks
              .map(
                ([name, task]) => `
        <article class="cm-item">
          <div class="cm-item-title"><b>${html(name)}</b>${tag(task.类型 || '未分类')}</div>
          <p>${html(task.说明 || '无说明')}</p>
          ${task.进度 ? meta('进度', task.进度) : ''}
        </article>`,
              )
              .join('')}</div>`
          : emptyLine('眼下暂无明记之事。'),
      )}
    </div>`;
}

function renderSelf() {
  const 五维 = get(statData, '主角.五维', {});
  const items = get(statData, '主角.私库.重要物品', {});
  return `
    <div class="cm-grid two">
      ${card(
        '履历',
        `
        ${meta('官职', get(statData, '主角.官职', '未载'))}
        ${meta('声望', get(statData, '主角.声望', 0))}
        ${meta('声望阶段', get(statData, '主角.声望阶段', '默默无闻'))}`,
      )}
      ${card('五维', ['生命', '武力', '统率', '智谋', '政治'].map(key => bar(key, 五维[key] ?? 0)).join(''))}
    </div>
    ${card(
      '随身要物',
      recordList(
        items,
        (name, item) => `
      <article class="cm-item">
        <div class="cm-item-title"><b>${html(name)}</b><span class="cm-title-actions">${tag(`×${item.数量 ?? 1}`)}${actionButton('丢弃', 'remove-variable', `主角.私库.重要物品.${name}`)}</span></div>
        <p>${html(item.简介 || '无简介')}</p>
      </article>`,
        '暂无重要物品。',
      ),
    )}`;
}

function renderSettleSnapshot(s) {
  const sign = n => (n > 0 ? '+' : '');
  const lines = [
    `${s.类型 || '结算'} · ${s.日期 || ''}`,
    `资产月入 ${s.资产月入 || 0} 两 · 月入合计 ${s.月入合计 || 0} 两`,
    `普通月出 ${s.普通月出 || 0} 两${s.军费支出 ? ' · 军费 ' + s.军费支出 + ' 两' : ''}`,
  ];
  if (s.仓储耗粮 || s.折银补粮) {
    const parts = [];
    if (s.仓储耗粮) parts.push(`耗粮 ${s.仓储耗粮} 石`);
    if (s.折银补粮) parts.push(`折银 ${s.折银补粮} 两`);
    if (s.粮秣缺口) parts.push(`缺口 ${s.粮秣缺口} 石`);
    lines.push(parts.join(' · '));
  }
  if (s.士气变动 || s.后勤变动) {
    lines.push(
      `士气 ${sign(s.士气变动)}${s.士气变动} · 后勤 ${sign(s.后勤变动)}${s.后勤变动}（${s.受影响的营 || 0} 营）`,
    );
  }
  lines.push(`私库 ${sign(s.私库变动)}${s.私库变动} 两 → 余额 ${s.私库余额 || 0} 两`);
  return `<div class="cm-settle-snapshot">${lines.map(l => `<p>${html(l)}</p>`).join('')}</div>`;
}

function renderMoneyViewSwitch() {
  return `<div class="cm-money-switch" role="tablist" aria-label="钱粮页面">
    <button type="button" class="${moneyView === 'ledger' ? 'active' : ''}" data-money-view="ledger">账房</button>
    <button type="button" class="${moneyView === 'market' ? 'active' : ''}" data-money-view="market">市集</button>
  </div>`;
}

function renderMarketItem(item, market) {
  const remaining = Math.round(clamp(number(market?._剩余库存?.[item.id], item.monthlyStock), 0, item.monthlyStock));
  const soldOut = remaining <= 0;
  const defaultQty = Math.max(1, Math.min(item.defaultQty, remaining || item.defaultQty));
  const quote = getMarketPaymentQuote(getMarketItemPriceInSilver(item, market), marketPaymentCurrency, market);
  const stockRatio = item.monthlyStock > 0 ? clamp(remaining / item.monthlyStock, 0, 1) : 0;
  return `<article class="cm-market-item${soldOut ? ' sold-out' : ''}" data-market-item="${html(item.id)}">
    <div class="cm-market-item-head">
      <div><small>${html(item.category)}</small><h4>${html(item.name)}</h4></div>
      <span class="cm-market-price">${html(quote.text)}<small>/ ${html(item.unit)}</small></span>
    </div>
    <p>${html(item.desc)}</p>
    <div class="cm-market-stock-line"><span>本月余货 ${remaining} / ${item.monthlyStock} ${html(item.unit)}</span><i style="--stock:${Math.round(stockRatio * 100)}%"></i></div>
    <div class="cm-market-buy-row">
      <label>数量<input type="number" min="1" max="${remaining}" step="1" value="${defaultQty}" data-market-quantity aria-label="购买${html(item.name)}数量" ${soldOut ? 'disabled' : ''}></label>
      <span>${html(item.unit)}</span>
      <button type="button" class="cm-market-buy" data-action="market-buy" data-item-id="${html(item.id)}" ${soldOut ? 'disabled' : ''}>${soldOut ? '本月售罄' : '买入'}</button>
    </div>
  </article>`;
}

function renderMarket() {
  const currentYM = extractYearMonth(get(statData, '世界运转.当前日期', '')) || '';
  const market = ensureMarketState(statData, currentYM);
  const coins = get(statData, '主角.私库.金银铜', {});
  const goldRate = number(market.汇率?.一两黄金兑白银, 6);
  const copperRate = number(market.汇率?.一两白银兑铜钱, 1200);
  const feePercent = Math.round(MARKET_SPREAD * 100);
  return `${renderMoneyViewSwitch()}
    <section class="cm-market-hero">
      <div>
        <p class="cm-kicker">城中市易 · ${html(market._库存月份 || currentYM || '本月')}</p>
        <h2>平码有数，月初换新</h2>
        <p>${html(market.市况 || '平稳')}。货物每月按定额补齐，售罄后须待下月。</p>
      </div>
      <div class="cm-market-wallet">
        <span>金 <b>${roundMarketNumber(coins.黄金 ?? 0)}</b> 两</span>
        <span>银 <b>${roundMarketNumber(coins.白银 ?? 0)}</b> 两</span>
        <span>钱 <b>${Math.round(number(coins.铜钱, 0))}</b> 文</span>
      </div>
    </section>
    <div class="cm-market-toolbar">
      <div>${MARKET_CATEGORIES.map(([key, label]) => `<span><b>${html(label)}</b>${number(market.价格指数?.[key], 100)}%</span>`).join('')}</div>
      <label>支付钱币<select data-market-payment>${['白银', '铜钱', '黄金'].map(currency => `<option value="${currency}"${marketPaymentCurrency === currency ? ' selected' : ''}>${currency}</option>`).join('')}</select></label>
    </div>
    ${MARKET_CATEGORIES.map(([category, label]) =>
      foldGroup(
        label,
        `<div class="cm-market-grid">${MARKET_ITEMS.filter(item => item.category === category)
          .map(item => renderMarketItem(item, market))
          .join('')}</div>`,
      ),
    ).join('')}
    <section class="cm-exchange-board">
      <div class="cm-exchange-head"><div><p class="cm-kicker">钱庄水牌</p><h3>金银兑钱</h3></div><span>双向折价 ${feePercent}%</span></div>
      <p class="cm-exchange-note">市价一两金兑 ${goldRate} 两银，一两银兑 ${copperRate} 文。兑入与兑出均按钱庄折价成交。</p>
      <div class="cm-exchange-grid">
        <div class="cm-exchange-row">
          <label>黄金数量<input type="number" min="0.001" step="0.001" value="1" data-exchange-amount="gold"></label>
          <button type="button" data-action="market-exchange" data-exchange-kind="sell-gold">黄金兑银</button>
          <button type="button" data-action="market-exchange" data-exchange-kind="buy-gold">白银购金</button>
        </div>
        <div class="cm-exchange-row">
          <label>白银数量<input type="number" min="0.001" step="0.001" value="1" data-exchange-amount="silver"></label>
          <button type="button" data-action="market-exchange" data-exchange-kind="sell-silver">白银兑钱</button>
          <button type="button" data-action="market-exchange" data-exchange-kind="buy-silver">铜钱购银</button>
        </div>
      </div>
    </section>`;
}

function renderMoney() {
  if (moneyView === 'market') return renderMarket();
  const coins = get(statData, '主角.私库.金银铜', {});
  const assets = get(statData, '经济.资产', {});
  const storage = get(statData, '经济.仓储', {});
  const income = get(statData, '经济.流水.月入', {});
  const outcome = get(statData, '经济.流水.月出', {});
  const armySupply = estimateArmyMonthlySupply(statData);
  const lastSettle = get(statData, '经济.上次结算', null);
  return `${renderMoneyViewSwitch()}
    ${foldGroup(
      '经济规则',
      `
      <p><b>私库</b>——你的钱袋子。日常小额开销（几文到几钱银子，如喝茶、剃头、打赏下人）AI 直接从私库扣除，不记流水。</p>
      <p><b>流水</b>——本月账本。大额收支（≥1两或具剧情重要性，如赏赐、修葺、军械采购、犒赏等）AI 写入月入/月出，<em>不动私库</em>。结算时脚本统一轧差入库，<em>结算后流水清空</em>，下月重新记账。</p>
      <p><b>资产</b>——田庄、铺面、作坊等，每月自动产生月入。买卖资产的本金直接从私库走，不记流水（一次性资本支出）。</p>
      <p><b>手动结算</b>（点击按钮）：仅处理流水账目 + 资产月入。<br>私库余额 + 资产月入 + 流水月入 − 流水月出 → 新私库余额。<em>军费不动</em>，流水清空。</p>
      <p><b>跨月自动结算</b>（日期跨月时自动触发）：在手动结算的基础上，额外扣除养军军费、消耗仓储军粮。钱粮不足时按 1石=2两 折银补粮，并压低各营士气与后勤。<br>私库余额 + 资产月入 + 流水月入 − 流水月出 − 军费 − 折银补粮 → 新私库余额</p>
      <p><b>一句话</b>：日常走私库，大事记流水，手动结流水，跨月扣军费。</p>`,
    )}
    <div class="cm-grid three">
      ${card(
        '私库',
        `
        ${meta('黄金', `${coins.黄金 ?? 0} 两`)}
        ${meta('白银', `${coins.白银 ?? 0} 两`)}
        ${meta('铜钱', `${coins.铜钱 ?? 0} 文`)}`,
      )}
      ${card(
        '流水',
        `
        ${meta('本月结余', `${get(statData, '经济.流水.本月结余', 0)} 两`)}
        ${meta('月入', `${sumMoneyRecord(income)} 两`)}
        ${meta('月出', `${sumMoneyRecord(outcome)} 两`)}
        ${armySupply.cost > 0 ? meta('本月养军', `${armySupply.cost} 两 / ${armySupply.grain} 石`) : ''}
        <p class="cm-empty" style="text-align:left;margin:8px 0 0;font-size:12px">流水由 AI 按剧情写入。结算时轧差入库并清空流水；军费仅在跨月时自动扣除。展开上方「经济规则」查看详情。</p>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="cm-mini-action cm-mini-settle" data-action="manual-settle">月度结算</button>
        </div>
        ${lastSettle ? renderSettleSnapshot(lastSettle) : ''}`,
      )}
      ${card(
        '仓储概览',
        compactObject(
          storage,
          (name, item) => `
        <span class="cm-pill"><b>${html(name)}</b>${html(item.数量 ?? 0)}${html(item.单位 || '')}</span>`,
        ),
      )}
    </div>
    <div class="cm-grid two">
      ${card(
        '资产',
        recordList(
          assets,
          (name, asset) => `
        <article class="cm-item">
          <div class="cm-item-title"><b>${html(name)}</b>${tag(`${asset.月入 ?? 0} 两/月`)}</div>
          <p>${html(asset.说明 || '无说明')}</p>
        </article>`,
          '暂无资产。',
        ),
      )}
      ${card(
        '收支明细',
        `<button class="cm-mini-action cm-mini-clear" data-action="clear-money" style="margin-bottom:10px">一键清空</button>
        <h4>月入</h4>${recordList(income, (name, item) => `<article class="cm-item"><div class="cm-item-title"><b>${html(name)}</b>${tag(`${item.银两 ?? 0} 两`)}</div>${item.说明 ? `<p>说明：${html(item.说明)}</p>` : ''}</article>`, '暂无月入。')}
        <h4>月出</h4>${recordList(outcome, (name, item) => `<article class="cm-item"><div class="cm-item-title"><b>${html(name)}</b>${tag(`${item.银两 ?? 0} 两`)}</div>${item.说明 ? `<p>说明：${html(item.说明)}</p>` : ''}</article>`, '暂无月出。')}`,
      )}
    </div>`;
}

function personCard(name, person, options = {}) {
  const scoreName = options.enemy ? '仇恨度' : '好感度';
  const score = options.enemy ? person.仇恨度 : person.好感度;
  const range = options.enemy
    ? { min: 0, max: 100, tone: 'danger' }
    : { min: -100, max: 100, tone: number(score) < 0 ? 'danger' : 'high' };
  return `
    <article class="cm-item ${options.private ? 'private' : ''}">
      <div class="cm-item-title"><b>${html(name)}</b><span>${person.是否在场 ? tag('在场', 'safe') : tag('不在场')}${portraitButton(name)}${options.path ? actionButton('遗忘', 'remove-variable', options.path) : ''}</span></div>
      ${person.身份 ? `<p class="cm-line">身份：${html(person.身份)}</p>` : ''}
      ${options.private && person.关系 ? `<p class="cm-line">关系：${html(person.关系)}</p>` : ''}
      ${bar(scoreName, score ?? 0, range)}
      ${person.忠心 != null ? bar('忠心', person.忠心, { tone: 'mid' }) : ''}
      ${options.private && person.生育 ? renderBirth(person.生育) : ''}
      <p class="cm-heart">${html(person.角色心声 || '暂无心声。')}</p>
    </article>`;
}

function renderPeople() {
  const groups = [
    ['上官名录', '上司', get(statData, '人际网络.上司', {})],
    ['同袍故旧', '故友与同僚', get(statData, '人际网络.故友与同僚', {})],
    ['门下僚属', '下属与幕僚', get(statData, '人际网络.下属与幕僚', {})],
    ['江湖市井', '三教九流', get(statData, '人际网络.三教九流', {})],
    ['恩怨仇雠', '仇敌', get(statData, '人际网络.仇敌', {}), { enemy: true }],
    ['血脉亲族', '亲属', get(statData, '人际网络.亲属', {})],
  ];
  return groups
    .map(([title, key, record, options]) => {
      const body = recordList(record, (name, person) =>
        personCard(name, person, { ...(options || {}), path: `人际网络.${key}.${name}` }),
      );
      return foldGroup(title, body);
    })
    .join('');
}

function renderBirth(data) {
  const parts = [
    tag(`周期 ${data.周期 ?? 1}`),
    tag(data.时期 ?? '安全期'),
    tag(data.状态 ?? '未孕', data.状态 === '已孕' || data.状态 === '待产' ? 'private' : ''),
  ];
  if ((data.状态 === '已孕' || data.状态 === '待产') && data.预产期) {
    parts.push(tag(`预产 ${data.预产期}`, 'private'));
  }
  return `<div class="cm-birth">${parts.join('')}</div>`;
}

function privateRow(name, person) {
  const imgs = getPortraitData()[name];
  return `
    <button class="cm-private-row" data-private-name="${html(name)}">
      ${imgs ? `<span class="cm-private-avatar"><img src="${html(imgs.日常)}" alt="${html(name)}" /></span>` : `<span class="cm-private-avatar cm-private-avatar-empty"></span>`}
      <span class="cm-private-body">
        <span class="cm-private-name">${html(name)}</span>
        <span class="cm-private-tags">
          ${tag(`好感 ${person.好感度 ?? 0}`)}${person.是否在场 ? tag('在场', 'safe') : tag('不在场')}
          ${imgs ? `<span class="cm-mini-action cm-mini-portrait" data-action="view-portrait" data-portrait-name="${html(name)}">立绘</span>` : ''}
        </span>
        <span class="cm-private-heart">${html(person.角色心声 || '暂无心声。')}</span>
      </span>
      <span class="cm-private-chevron">›</span>
    </button>`;
}

function renderPrivate() {
  const record = get(statData, '人际网络.私帷', {});
  return rowList(record, (name, person) => privateRow(name, person), '私帷暂无记载。');
}

function renderMilitary() {
  const camps = get(statData, '军事.各营', {});
  const generals = get(statData, '军事.将领', {});
  const battles = get(statData, '军事.战斗记录', {});
  const armySupply = estimateArmyMonthlySupply(statData);
  const supplyHint =
    armySupply.cost > 0
      ? `本月养军预估需银 ${armySupply.cost} 两、军粮 ${armySupply.grain} 石。跨月时脚本会自动结算军费、扣除仓储粮食；钱粮不足会压低士气与后勤。`
      : '暂无成建制营伍；招募部队后，脚本会按人数、兵种、等级自动估算每月军费与军粮。';
  return `
    ${card('养军提示', `<p class="cm-empty" style="text-align:left;margin:0;font-size:12px">${html(supplyHint)}</p>`)}
    ${foldGroup(
      '营伍名册',
      recordList(
        camps,
        (name, camp) => `
      <article class="cm-item">
        <div class="cm-item-title"><b>${html(name)}</b>${tag(`${camp.人数 ?? 0} 人`)}</div>
        <div class="cm-info-grid">
          ${meta('兵种', camp.兵种 || '未知')}
          ${meta('将领', camp.将领 || '未定')}
          ${meta('驻地', camp.驻地 || '未载')}
          ${meta('人数', `${camp.人数 ?? 0} 人`)}
          ${meta('装备', camp.装备 || '未载')}
          ${meta('等级', camp.等级 || '未载')}
        </div>
        ${bar('士气', camp.士气 ?? 0)}${bar('训练', camp.训练 ?? 0)}${bar('后勤', camp.后勤 ?? 0)}
      </article>`,
        '暂无营伍。',
      ),
      '暂无营伍。',
    )}
    ${foldGroup(
      '将领名册',
      recordList(
        generals,
        (name, general) => `
      <article class="cm-item">
        <div class="cm-item-title"><b>${html(name)}</b></div>
        <div class="cm-mini-bars">${['统率', '武力', '智谋', '政治', '威望'].map(key => bar(key, general[key] ?? 0)).join('')}${bar('忠心', findInterpersonalPerson(statData, name)?.person?.忠心 ?? 0)}</div>
      </article>`,
        '暂无将领。',
      ),
      '暂无将领。',
    )}
    ${foldGroup(
      '战斗记录',
      recordList(
        battles,
        (name, battle) => {
          const knownFields = ['日期', '对手', '结果', '战利品', '摘要'];
          const extraFields = Object.keys(battle || {}).filter(k => !knownFields.includes(k));
          return `
      <article class="cm-item">
        <div class="cm-item-title"><b>${html(name)}</b>${tag(battle.日期 || '未载日期')}</div>
        <div class="cm-info-grid">
          ${meta('对手', battle.对手 || '未载')}
          ${meta('结果', battle.结果 || '未载')}
          ${battle.战利品 ? meta('战利品', battle.战利品) : ''}
          ${extraFields.map(k => meta(k, battle[k])).join('')}
        </div>
        ${battle.摘要 ? `<p class="cm-heart">${html(battle.摘要)}</p>` : ''}
      </article>`;
        },
        '暂无战斗记录。',
      ),
      '暂无战斗记录。',
    )}`;
}

function renderSituation() {
  const powers = entries(get(statData, '时局与任务.势力关系', {}));
  const tasks = get(statData, '时局与任务.当前任务', {});
  const powersBody = powers.length
    ? `<div class="cm-row-list">${powers
        .map(([name, power]) => {
          const 好感 = power.好感度 ?? 0;
          const 兵力 = get(power, '军事.总兵力', 0);
          const 兵种 = get(power, '军事.主力兵种', '');
          const tone = 好感 < 0 ? 'danger' : 好感 > 30 ? 'high' : 'mid';
          return `
    <button class="cm-power-row" data-power-name="${html(name)}">
      <span class="cm-power-avatar">${html(name[0])}</span>
      <span class="cm-power-body">
        <span class="cm-power-name">
          ${html(name)}
          <span class="cm-power-tags">
            ${tag(power.状态 || '未接触', 好感 < 0 ? 'war' : 'safe')}
            ${好感 !== 0 ? tag(`好感 ${好感 > 0 ? '+' : ''}${好感}`, tone) : ''}
          </span>
        </span>
        <span class="cm-power-summary">
          ${兵力 ? `兵 ${兵力.toLocaleString()} · ` : ''}${兵种 || '详情未明'}
        </span>
      </span>
      <span class="cm-power-chevron">›</span>
    </button>`;
        })
        .join('')}</div>`
    : emptyLine('暂无势力档案。');
  return `
    ${foldGroup(
      '当前任务',
      recordList(
        tasks,
        (name, task) => `
      <article class="cm-item">
        <div class="cm-item-title"><b>${html(name)}</b><span class="cm-title-actions">${tag(task.类型 || '未分类')}${actionButton('放弃', 'remove-variable', `时局与任务.当前任务.${name}`)}</span></div>
        <p>${html(task.说明 || '无说明')}</p>
        ${task.进度 ? meta('进度', task.进度) : ''}
      </article>`,
        '暂无任务。',
      ),
      '暂无任务。',
    )}
    ${foldGroup('势力关系', powersBody, '暂无势力档案。')}`;
}

function renderTech() {
  const record = get(statData, '科技', {});
  return rowList(
    record,
    (name, tech) =>
      foldItem(
        name,
        `${tag(tech.进度 || '未开始')}`,
        `<article class="cm-item">
      <p>效果：${html(tech.效果 || '未载')}</p>
      <small>${html(tech.描述 || '')}</small>
    </article>`,
      ),
    '暂无技术条目。',
  );
}

function renderHistory() {
  const record = get(statData, '个人史记.大事记', {});
  // 展平并按日期排序
  const flatList = entries(record).map(([name, event]) => ({ name, event: event || {} }));
  flatList.sort((a, b) => {
    const dateA = a.event.日期 || '';
    const dateB = b.event.日期 || '';
    const numA = extractYearNumber(dateA);
    const numB = extractYearNumber(dateB);
    if (numA !== null && numB !== null && numA !== numB) return numA - numB;
    if (numA !== null && numB === null) return -1;
    if (numA === null && numB !== null) return 1;
    return String(dateA).localeCompare(String(dateB), 'zh-CN');
  });
  // 按类型分组（保持排序后的顺序）
  const grouped = flatList.reduce((acc, { name, event }) => {
    const type = event.类型 || '其他';
    if (!acc[type]) acc[type] = [];
    acc[type].push({ name, event });
    return acc;
  }, {});
  return (
    entries(grouped)
      .map(([type, items]) =>
        foldGroup(
          type,
          `<div class="cm-list">${items
            .map(
              ({ name, event }) => `
      <article class="cm-item">
        <div class="cm-item-title"><b>${html(name)}</b><span class="cm-title-actions">${tag(event.日期 || '未载日期')}${actionButton('勾销', 'remove-variable', `个人史记.大事记.${name}`)}</span></div>
        ${event.地点 ? meta('地点', event.地点) : ''}
        <p>${html(event.事迹 || '无事迹')}</p>
        ${event.影响 ? `<p class="cm-heart">${html(event.影响)}</p>` : ''}
      </article>`,
            )
            .join('')}</div>`,
          '尚无大事入志。',
        ),
      )
      .join('') || emptyLine('尚无大事入志。')
  );
}

/** 从中文日期字符串中提取年份数字，用于排序 */
function extractYearNumber(dateStr) {
  if (!dateStr) return null;
  // 匹配：崇祯十七年、乙酉年、1644年 等
  const eraMatch = String(dateStr).match(/([一二三四五六七八九十百千万]+)年/);
  if (eraMatch) {
    return chineseToNumber(eraMatch[1]);
  }
  const arabicMatch = String(dateStr).match(/(\d{3,4})年/);
  if (arabicMatch) {
    return parseInt(arabicMatch[1], 10);
  }
  return null;
}

/** 中文数字转阿拉伯数字（仅用于年份） */
function chineseToNumber(str) {
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  // 处理如"二十"、"三十"等
  if (str.length === 2 && str[1] === '十') {
    return (map[str[0]] || 0) * 10;
  }
  // 处理如"十七"
  if (str.length === 2 && str[0] === '十') {
    return 10 + (map[str[1]] || 0);
  }
  // 处理如"二十三"
  if (str.length === 3 && str[1] === '十') {
    return (map[str[0]] || 0) * 10 + (map[str[2]] || 0);
  }
  // 纯数字如"十"
  if (str === '十') return 10;
  // 单数字如"三"
  return map[str] || null;
}

function renderTabContent() {
  if (lastError) {
    return `<div class="cm-error"><h2>暂未读得变量数据</h2><p>${html(lastError)}</p><p class="cm-empty">请先生成至少一轮剧情，或刷新后重试</p></div>`;
  }
  switch (activeTab) {
    case 'self':
      return renderSelf();
    case 'money':
      return renderMoney();
    case 'people':
      return renderPeople();
    case 'private':
      return renderPrivate();
    case 'military':
      return renderMilitary();
    case 'situation':
      return renderSituation();
    case 'tech':
      return renderTech();
    case 'history':
      return renderHistory();
    case 'map':
      return renderMap();
    case 'graph':
      return renderGraph();
    case 'portraits':
      return renderPortraits();
    case 'fengyue':
      if (!shopEnabled) {
        activeTab = 'overview';
        return renderOverview();
      }
      return renderShop();
    default:
      return renderOverview();
  }
}

function renderPortraits() {
  const entries = getPortraitEntries();
  const filters = [['all', '全部'], ...PORTRAIT_GALLERY_OPTIONS.filter(([key]) => key !== 'none')];
  const counts = Object.values(entries).reduce(
    (result, entry) => {
      const gallery = normalizePortraitGallery(entry?.gallery, entry?.source);
      if (gallery !== 'none') {
        result.all += 1;
        result[gallery] = (result[gallery] || 0) + 1;
      }
      return result;
    },
    { all: 0, beauties: 0, heroes: 0, beings: 0 },
  );
  const names = Object.keys(entries).filter(name => {
    const gallery = normalizePortraitGallery(entries[name]?.gallery, entries[name]?.source);
    return gallery !== 'none' && (portraitGalleryFilter === 'all' || gallery === portraitGalleryFilter);
  });
  return `
    <style>
      .cm-personage-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:16px;padding:4px 2px 14px;border-bottom:1px solid var(--line)}
      .cm-personage-title h2{margin:0 0 5px;color:var(--ink);font-size:24px;letter-spacing:.12em}.cm-personage-title p{margin:0;color:var(--muted);font-size:12px}
      .cm-personage-filters{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.cm-personage-filter{border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--muted);padding:7px 12px;cursor:pointer}.cm-personage-filter.active{border-color:var(--accent);background:var(--accent);color:#fff;box-shadow:0 5px 14px var(--glow)}
      .cm-personage-note{margin-top:14px;padding:10px 12px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:12px;line-height:1.7;background:rgba(255,255,255,.04)}
      @media(max-width:640px){.cm-personage-head{align-items:stretch;flex-direction:column}.cm-personage-filters{justify-content:flex-start}.cm-personage-filter{padding:6px 10px}}
    </style>
    <div class="cm-personage-head">
      <div class="cm-personage-title"><h2>人物志</h2><p>立绘与人物归属分开管理，不按性别自动判断。</p></div>
      <div class="cm-personage-filters" role="tablist" aria-label="人物志分类">
        ${filters.map(([key, label]) => `<button type="button" class="cm-personage-filter${portraitGalleryFilter === key ? ' active' : ''}" data-portrait-gallery="${key}">${label} ${counts[key] || 0}</button>`).join('')}
      </div>
    </div>
    <div class="cm-portrait-grid">
      ${names
        .map(name => {
          const imgs = getAllPortraitData()[name] || {};
          const cover = imgs.日常 || Object.values(imgs)[0] || '';
          return `
        <button class="cm-portrait-card" data-portrait-name="${html(name)}">
          <div class="cm-portrait-img-wrap">
            ${cover ? `<img src="${html(cover)}" alt="${html(name)}" loading="lazy" />` : ''}
          </div>
          <span class="cm-portrait-label">${html(name)}</span>
        </button>`;
        })
        .join('')}
    </div>
    ${names.length ? '' : '<p class="cm-empty">此分类暂未收录人物。</p>'}
    <p class="cm-personage-note">内置人物立绘始终保留在人物志中；身份 DLC 只决定正文插图当前可以调用哪些人物，不再删减这里的收藏。</p>`;
}

function renderPortraitDetail() {
  const imgs = getAllPortraitData()[portraitSelected];
  if (!imgs) return '';
  const categories = Object.entries(imgs);
  return `
    <div class="cm-portrait-detail">
      <h3>${html(portraitSelected)} · 全部分类</h3>
      <div class="cm-portrait-detail-grid">
        ${categories
          .map(
            ([cat, url]) => `
          <figure class="cm-portrait-figure">
            <img src="${html(url)}" alt="${html(portraitSelected)}-${html(cat)}" loading="lazy" />
            <figcaption>${html(cat)}</figcaption>
          </figure>`,
          )
          .join('')}
      </div>
    </div>`;
}

function renderShop() {
  const 点数 = number(get(statData, '风月阁.同房点数', 0));
  const 絮语 = get(statData, '风月阁.掌柜絮语', '');
  const 已拥有 = get(statData, '风月阁.器物', {});
  return `
    <div class="cm-shop">
      ${card(
        '掌柜·云儿',
        `
        <div class="cm-shop-keeper">
          <p class="cm-heart" style="margin:0;font-style:italic">${html(絮语 || '哟，客官来了～今儿个有好东西，进来瞧瞧？')}</p>
        </div>
        <div class="cm-shop-points">
          <span class="cm-shop-coin">⿓</span>
          <span>同房点数：<b>${点数}</b></span>
        </div>
      `,
      )}
      <div class="cm-grid two">
        <div>
          <h3 style="color:var(--accent);margin:0 0 12px">货架</h3>
          ${getShopCategories()
            .map(cat => {
              if (!cat.items.length) return '';
              return foldGroup(
                cat.name,
                `
              <div class="cm-shop-grid">${cat.items
                .map(item => {
                  const owned = 已拥有[item.name];
                  const count = owned ? (owned.数量 ?? 0) : 0;
                  const canBuy = 点数 >= item.price;
                  return `
              <div class="cm-shop-item">
                <div class="cm-shop-item-body">
                  <div class="cm-item-title">
                    <b>${html(item.name)}</b>
                    <span class="cm-shop-price">${item.price} 点</span>
                  </div>
                  <p class="cm-shop-desc">${html(item.desc)}</p>
                  ${count > 0 ? `<small style="color:var(--accent2)">已拥有 ×${count}</small>` : ''}
                </div>
                <button class="cm-mini-action cm-shop-buy${!canBuy ? ' disabled' : ''}"
                  data-action="shop-buy" data-item-id="${html(item.id)}"
                  ${!canBuy ? 'disabled' : ''}>
                  ${count > 0 ? '再买' : '购买'}
                </button>
              </div>`;
                })
                .join('')}</div>
            `,
              );
            })
            .join('')}
        </div>
        <div>
          <h3 style="color:var(--accent);margin:0 0 12px">我的器物</h3>
          ${
            entries(已拥有).length
              ? `<div class="cm-list">${entries(已拥有)
                  .map(([name, item]) => {
                    return `
            <article class="cm-item">
              <div class="cm-item-title"><b>${html(name)}</b>${tag(`×${item.数量 ?? 1}`)}</div>
              <p class="cm-shop-desc">${html(item.简介 || '')}</p>
            </article>`;
                  })
                  .join('')}</div>`
              : emptyLine('尚未购买任何器物。来都来了，不看看？')
          }
        </div>
      </div>
    </div>`;
}

function renderPowerModal() {
  const power = get(statData, `时局与任务.势力关系.${modalState.name}`, {});
  const 将领 = entries(get(power, '军事.下属将领', {}));
  const 军队 = entries(get(power, '军事.军队', {}));
  const 好感 = power.好感度 ?? 0;
  return `
    <div class="cm-modal-mask" data-action="close-modal">
      <section class="cm-modal cm-modal-power" role="dialog" aria-modal="true">
        <header class="cm-modal-head">
          <div>
            <p class="cm-kicker">势力档案</p>
            <h2>${html(modalState.name)}</h2>
          </div>
          <button data-action="close-modal">&times;</button>
        </header>
        <div class="cm-modal-body">
          ${bar('好感度', 好感, { min: -100, max: 100, tone: 好感 < 0 ? 'danger' : 'high' })}
          ${meta('状态', power.状态 || '未接触')}
          ${power.描述 ? `<p class="cm-heart">${html(power.描述)}</p>` : ''}

          <h3>经济</h3>
          <div class="cm-info-grid">
            ${meta('财政状况', get(power, '经济.财政状况', '未知'))}
            ${meta('主要收入', get(power, '经济.主要收入', '未知'))}
            ${meta('主要支出', get(power, '经济.主要支出', '未知'))}
            ${meta('粮草', `${get(power, '经济.粮草.状态', '未知')} ${get(power, '经济.粮草.数量', 0)}${get(power, '经济.粮草.单位', '')}`)}
          </div>
          ${get(power, '经济.描述') ? `<p class="cm-line">${html(get(power, '经济.描述'))}</p>` : ''}

          <h3>军事</h3>
          <div class="cm-info-grid">
            ${meta('总兵力', get(power, '军事.总兵力', 0).toLocaleString())}
            ${meta('主力兵种', get(power, '军事.主力兵种', '未知'))}
          </div>
          ${get(power, '军事.描述') ? `<p class="cm-heart">${html(get(power, '军事.描述'))}</p>` : ''}

          ${
            将领.length
              ? foldGroup(
                  '下属将领',
                  `<div class="cm-list">${将领
                    .map(
                      ([gName, g]) => `
            <article class="cm-item">
              <div class="cm-item-title"><b>${html(gName)}</b>${tag(g.职位 || '')}</div>
              <div class="cm-mini-bars">
                ${bar('统率', g.统率 ?? 0)}${bar('武力', g.武力 ?? 0)}${bar('智谋', g.智谋 ?? 0)}${bar('忠诚', g.忠诚 ?? 0)}
              </div>
              <p class="cm-line">兵 ${(g.兵力 ?? 0).toLocaleString()} · ${g.驻地 || '驻地未明'}${g.简介 ? ` · ${html(g.简介)}` : ''}</p>
            </article>`,
                    )
                    .join('')}</div>`,
                )
              : ''
          }

          ${
            军队.length
              ? foldGroup(
                  '军队',
                  `<div class="cm-list">${军队
                    .map(
                      ([aName, a]) => `
            <article class="cm-item">
              <div class="cm-item-title"><b>${html(aName)}</b>${tag(`${a.人数 ?? 0} 人`)}</div>
              <div class="cm-info-grid">
                ${meta('兵种', a.兵种 || '未知')}
                ${meta('将领', a.将领 || '未定')}
                ${meta('装备', a.装备 || '未载')}
                ${meta('等级', a.等级 || '未载')}
                ${meta('驻地', a.驻地 || '未载')}
                ${meta('状态', a.状态 || '—')}
              </div>
              ${bar('士气', a.士气 ?? 0)}${bar('训练', a.训练 ?? 0)}${bar('后勤', a.后勤 ?? 0)}
            </article>`,
                    )
                    .join('')}</div>`,
                )
              : ''
          }
        </div>
      </section>
    </div>`;
}

function renderModal() {
  if (!modalState) return '';
  if (modalState.type === 'settings') return renderSettingsModal();
  if (modalState.type === 'confirm') return renderConfirmModal();
  if (modalState.type === 'portrait') return renderPortraitOverlay();
  if (modalState.type === 'character-studio') return renderCharacterStudioModal();
  if (modalState.type === 'power') return renderPowerModal();
  const person = get(statData, `人际网络.私帷.${modalState.name}`, {});
  return `
    <div class="cm-modal-mask" data-action="close-modal">
      <section class="cm-modal" role="dialog" aria-modal="true">
        <header class="cm-modal-head">
          <div>
            <p class="cm-kicker">私帷详情</p>
            <h2>${html(modalState.name)}</h2>
          </div>
          <button data-action="close-modal">×</button>
        </header>
        <div class="cm-modal-body">
          ${meta('身份', person.身份 || '未载')}
          ${meta('关系', person.关系 || '未载')}
          ${meta('是否在场', person.是否在场 ? '在场' : '不在场')}
          ${bar('好感度', person.好感度 ?? 0, { min: -100, max: 100, tone: number(person.好感度) < 0 ? 'danger' : 'high' })}
          ${bar('忠心', person.忠心 ?? 50, { tone: 'mid' })}
          <p class="cm-heart">${html(person.角色心声 || '暂无心声。')}</p>
          <h3>月信</h3>
          <div class="cm-info-grid">
            ${meta('周期', person.生育?.周期 ?? 1)}
            ${meta('时期', person.生育?.时期 || '安全期')}
            ${meta('状态', person.生育?.状态 || '未孕')}
          </div>
          ${
            person.生育?.末次同房?.日期
              ? `
          <h3>上次同房</h3>
          <div class="cm-info-grid">
            ${meta('日期', person.生育.末次同房.日期)}
            ${meta('受孕概率', `${person.生育.末次同房.判定概率 ?? 0}%`)}
          </div>`
              : ''
          }
          ${person.生育?.预产期 ? meta('预产期', person.生育.预产期) : ''}
        </div>
      </section>
    </div>`;
}

function themeIcon() {
  if (theme === 'day')
    return '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  if (theme === 'night')
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21.64 13a1 1 0 0 0-1.05-.14 8.05 8.05 0 0 1-3.37.73 8.15 8.15 0 0 1-8.14-8.1 8.59 8.59 0 0 1 .25-2A1 1 0 0 0 8 2.36a10.14 10.14 0 1 0 14 11.69 1 1 0 0 0-.36-1.05z"/></svg>';
  if (theme === 'star')
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z"/></svg>';
  return '<svg class="cm-mountain-icon" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18.5c3.2-4.7 5.2-7.7 6-9 .5-.7 1.1-.7 1.6 0l2.3 3.5"/><path d="M10.5 18.5c2.5-3.5 4.3-6 5.3-7.4.5-.7 1.1-.7 1.6.1l3.6 7.3"/><path d="M5 18.5h15"/><path d="M8.8 10.1c.9.6 1.8.6 2.7 0"/><path d="M14.8 12.3c.8.5 1.5.5 2.3 0"/></svg>';
}

function characterGeneratorIcon() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/><path d="M19 8l2 2-6.5 6.5-3 1 1-3z"/></svg>';
}

function toolIcon() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6.2 6.2a2.1 2.1 0 0 1-3-3l6.2-6.2a6 6 0 0 1 7.9-7.9z"/></svg>';
}

function editIcon() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
}

function portraitAddIcon() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
}

function characterManagerIcon() {
  return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3.2"/><path d="M5.5 21c.7-4 3-6 6.5-6s5.8 2 6.5 6"/><path d="M19 6v5M16.5 8.5h5"/></svg>';
}

function getCharacterGenerator() {
  return globalThis.CanmingCharacterGenerator ?? window.parent?.CanmingCharacterGenerator;
}

function getRemoteScriptRuntime() {
  return globalThis.__CMYJRemoteScripts ?? window.parent?.__CMYJRemoteScripts;
}

function loadCharacterGeneratorScript() {
  if (getCharacterGenerator()) return Promise.resolve(getCharacterGenerator());
  if (window._canmingCharacterGeneratorLoading) return window._canmingCharacterGeneratorLoading;

  const remoteRuntime = getRemoteScriptRuntime();
  if (typeof remoteRuntime?.boot === 'function') {
    window._canmingCharacterGeneratorLoading = remoteRuntime.boot('generator').then(() => {
      const generator = getCharacterGenerator();
      if (!generator) throw new Error('万象生成器远程脚本已加载，但接口未注册。');
      return generator;
    });
    return window._canmingCharacterGeneratorLoading;
  }

  window._canmingCharacterGeneratorLoading = new Promise((resolve, reject) => {
    if (!STATUSBAR_SCRIPT_SRC) {
      reject(new Error('无法定位状态栏脚本地址，请确认万象生成器脚本已被加载。'));
      return;
    }
    const script = document.createElement('script');
    script.src = new URL(CHARACTER_GENERATOR_FILE, STATUSBAR_SCRIPT_SRC).href;
    script.onload = () => resolve(getCharacterGenerator());
    script.onerror = () => reject(new Error(`无法加载 ${CHARACTER_GENERATOR_FILE}`));
    document.head.appendChild(script);
  });

  return window._canmingCharacterGeneratorLoading;
}

async function openCharacterGenerator() {
  try {
    const generator = getCharacterGenerator() ?? (await loadCharacterGeneratorScript());
    if (!generator?.open) throw new Error('万象生成器接口未注册。');
    generator.open({
      mountDocument: frameDocument,
      theme,
      showToast,
      openWorkshop: workshopOptions => openCanmingWorkshop(workshopOptions),
    });
  } catch (error) {
    showToast(`✗ 打开万象生成器失败：${error?.message || '未知错误'}`, 'err');
  }
}

function scenarioGeneratorIcon() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M16 3v4h4M8 11h8M8 15h5"/><path d="m15.5 18.5 3-3"/></svg>';
}

function getScenarioGenerator() {
  return globalThis.CanmingScenarioGenerator ?? window.parent?.CanmingScenarioGenerator;
}

function loadScenarioGeneratorScript() {
  if (getScenarioGenerator()) return Promise.resolve(getScenarioGenerator());
  if (window._canmingScenarioGeneratorLoading) return window._canmingScenarioGeneratorLoading;
  const remoteRuntime = getRemoteScriptRuntime();
  if (typeof remoteRuntime?.boot === 'function') {
    window._canmingScenarioGeneratorLoading = remoteRuntime.boot('scenario-generator').then(() => {
      const generator = getScenarioGenerator();
      if (!generator?.open) throw new Error('开局生成器远程脚本已加载，但接口未注册。');
      return generator;
    });
    return window._canmingScenarioGeneratorLoading;
  }
  window._canmingScenarioGeneratorLoading = new Promise((resolve, reject) => {
    if (!STATUSBAR_SCRIPT_SRC) {
      reject(new Error('无法定位状态栏脚本地址，请确认开局生成器脚本已被加载。'));
      return;
    }
    const script = document.createElement('script');
    script.src = new URL(SCENARIO_GENERATOR_FILE, STATUSBAR_SCRIPT_SRC).href;
    script.onload = () => resolve(getScenarioGenerator());
    script.onerror = () => reject(new Error(`无法加载 ${SCENARIO_GENERATOR_FILE}`));
    document.head.appendChild(script);
  });
  return window._canmingScenarioGeneratorLoading;
}

async function openScenarioGenerator() {
  try {
    if (!isOpen) {
      isOpen = true;
      applyFrameLayout();
      render();
    }
    const generator = getScenarioGenerator() ?? (await loadScenarioGeneratorScript());
    if (!generator?.open) throw new Error('开局生成器接口未注册。');
    return generator.open({
      mountDocument: frameDocument,
      theme,
      showToast,
      openWorkshop: workshopOptions => openCanmingWorkshop(workshopOptions),
      installScenarioPackage: bundle => importScenarioWorkshopPackage(bundle),
    });
  } catch (error) {
    showToast(`✗ 打开开局生成器失败：${error?.message || '未知错误'}`, 'err');
  }
}

function exposeStatusbarActions() {
  const hostWindow = window.parent ?? window;
  hostWindow.CanmingStatusbarActions = {
    ...(hostWindow.CanmingStatusbarActions || {}),
    _owner: STATUSBAR_ACTIONS_OWNER,
    openScenarioGenerator: () => openScenarioGenerator(),
    installOriginalScenario: () => installBuiltinTongchengScenario(),
    uninstallCurrentScenario: () => uninstallCurrentScenario(),
    getInstalledScenario: () => getInstalledScenarioInfo(),
  };
}

function getCanmingWorkshop() {
  return globalThis.CanmingWorkshop ?? window.parent?.CanmingWorkshop;
}

function loadCanmingWorkshopScript() {
  const loadedWorkshop = getCanmingWorkshop();
  if (loadedWorkshop?.open && Number(loadedWorkshop.apiVersion || 1) === 1) return Promise.resolve(loadedWorkshop);
  if (loadedWorkshop) {
    try {
      loadedWorkshop.destroy?.();
    } catch {}
    try {
      delete globalThis.CanmingWorkshop;
    } catch {}
    try {
      if (window.parent) delete window.parent.CanmingWorkshop;
    } catch {}
    window._canmingWorkshopLoading = null;
  }
  if (window._canmingWorkshopLoading) return window._canmingWorkshopLoading;
  const remoteRuntime = getRemoteScriptRuntime();
  if (typeof remoteRuntime?.boot === 'function') {
    window._canmingWorkshopLoading = remoteRuntime.boot('workshop').then(() => {
      const workshop = getCanmingWorkshop();
      if (!workshop?.open) throw new Error('云端创意工坊远程脚本已加载，但接口未注册。');
      return workshop;
    });
    return window._canmingWorkshopLoading;
  }
  window._canmingWorkshopLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    try {
      const getTrees = globalThis.getScriptTrees ?? window.parent?.getScriptTrees;
      const trees = typeof getTrees === 'function' ? getTrees({ type: 'character' }) : [];
      const scripts = trees.flatMap(item => (item?.type === 'folder' ? item.scripts || [] : [item]));
      const expectedName = WORKSHOP_FILE.replace(/\.js$/i, '');
      const moduleScript = scripts.find(item => item?.name === expectedName || item?.name === WORKSHOP_FILE);
      if (moduleScript?.content) {
        script.textContent = moduleScript.content;
        document.head.appendChild(script);
        resolve(getCanmingWorkshop());
        return;
      }
    } catch {}
    if (STATUSBAR_SCRIPT_SRC) {
      try {
        script.src = new URL(WORKSHOP_FILE, STATUSBAR_SCRIPT_SRC).href;
        script.onload = () => resolve(getCanmingWorkshop());
        script.onerror = () => reject(new Error(`无法加载 ${WORKSHOP_FILE}`));
        document.head.appendChild(script);
        return;
      } catch {}
    }
    reject(new Error('当前角色卡尚未注册“云端创意工坊”脚本。'));
  });
  return window._canmingWorkshopLoading;
}

function workshopMetadata(metadata, fallbackTitle, fallbackSummary = '') {
  return {
    title: String(metadata?.title || fallbackTitle || '').trim(),
    summary: String(metadata?.summary || fallbackSummary || '').trim(),
    tags: Array.isArray(metadata?.tags) ? metadata.tags.map(value => String(value).trim()).filter(Boolean) : [],
  };
}

async function buildCharacterWorkshopPackage(profileId, metadata = {}) {
  const profile = getCharacterProfiles().profiles.find(item => item.id === profileId);
  if (!profile) throw new Error('找不到所选角色档案。');
  const allEntries = await readCharacterWorldbookEntries();
  const linked = new Set(profile.worldbookEntries || []);
  const worldbookEntries = allEntries
    .filter(entry => linked.has(entry.name))
    .map(entry => JSON.parse(JSON.stringify(entry)));
  const portraits = {};
  for (const [category, source] of Object.entries(getPortraitEntries()[profile.name]?.portraits || {})) {
    if (!isPortraitUrl(source)) throw new Error(`立绘「${category}」不是 HTTP/HTTPS 链接`);
    portraits[category] = { type: 'url', value: source };
  }
  return {
    format: WORKSHOP_PACKAGE_FORMAT,
    version: 2,
    kind: 'character',
    createdAt: new Date().toISOString(),
    metadata: workshopPackageMetadata(metadata, profile.name),
    resources: [
      {
        id: `character-${profile.id || Date.now()}`,
        kind: 'character',
        name: profile.name,
        character: {
          ...JSON.parse(JSON.stringify(profile)),
          worldbookEntries: worldbookEntries.map(entry => entry.name),
        },
        portraits,
        worldbookEntries,
      },
    ],
  };
}

async function buildGeneratorWorkshopPackage(metadata = {}) {
  const generator = getCharacterGenerator() ?? (await loadCharacterGeneratorScript());
  if (typeof generator?.getCurrentWork !== 'function') throw new Error('万象生成器版本过旧，缺少作品读取接口。');
  const work = generator.getCurrentWork();
  if (!work?.entries?.length) throw new Error('请先在万象生成器完成一次生成。');
  const entries = JSON.parse(JSON.stringify(work.entries));
  if (work.type === 'character-package') {
    const result = work.result || {};
    const character = {
      id: `generated-${Date.now()}`,
      name: String(result.name || work.title || '未命名角色').trim(),
      aliases: Array.isArray(result.alias) ? result.alias.map(String).filter(Boolean) : [],
      title: '',
      summary: String(metadata.summary || ''),
      worldbookEntries: entries.map(entry => entry.name),
    };
    return {
      format: WORKSHOP_PACKAGE_FORMAT,
      version: 2,
      kind: 'character',
      createdAt: new Date().toISOString(),
      metadata: workshopPackageMetadata(metadata, metadata.title || character.name),
      resources: [
        {
          id: `generator-character-${Date.now()}`,
          kind: 'character',
          name: character.name,
          character,
          portraits: {},
          worldbookEntries: entries,
          source: 'canming-generator',
        },
      ],
    };
  }
  return {
    format: WORKSHOP_PACKAGE_FORMAT,
    version: 2,
    kind: 'worldbook',
    createdAt: new Date().toISOString(),
    metadata: workshopPackageMetadata(metadata, metadata.title || work.title || entries[0].name),
    resources: [
      {
        id: `generator-worldbook-${Date.now()}`,
        kind: 'worldbook',
        name: String(work.title || entries[0].name),
        entries,
        source: 'canming-generator',
      },
    ],
  };
}

function listWorkshopGenerators() {
  const generator = getCharacterGenerator();
  return typeof generator?.listShareableGenerators === 'function' ? generator.listShareableGenerators() : [];
}

function buildGeneratorDefinitionWorkshopPackage(ids, metadata = {}) {
  const generator = getCharacterGenerator();
  if (typeof generator?.exportGeneratorDefinition !== 'function')
    throw new Error('万象生成器版本过旧，缺少生成器共享接口。');
  const selected = new Set(Array.isArray(ids) ? ids : []);
  const definitions = listWorkshopGenerators()
    .filter(item => selected.has(item.id))
    .map(item => generator.exportGeneratorDefinition(item.id));
  if (!definitions.length) throw new Error('请至少选择一个生成器。');
  return {
    format: WORKSHOP_PACKAGE_FORMAT,
    version: 2,
    kind: 'generator',
    createdAt: new Date().toISOString(),
    metadata: workshopPackageMetadata(metadata, metadata.title || definitions[0].name || definitions[0].tag),
    resources: [
      {
        id: `generator-${Date.now()}`,
        kind: 'generator',
        name: metadata.resourceName || definitions[0].name || definitions[0].tag,
        definitions,
      },
    ],
  };
}

function importWorkshopGenerators(definitions) {
  const generator = getCharacterGenerator();
  if (typeof generator?.importGeneratorDefinition !== 'function')
    throw new Error('万象生成器版本过旧，缺少生成器共享接口。');
  return (definitions || []).map(definition => generator.importGeneratorDefinition(definition)).length;
}

function workshopPackageMetadata(metadata, fallbackTitle = '', fallbackSummary = '') {
  const base = workshopMetadata(metadata, fallbackTitle, fallbackSummary);
  return {
    ...base,
    categories: Array.isArray(metadata?.categories)
      ? metadata.categories
          .map(value => String(value).trim())
          .filter(Boolean)
          .slice(0, 3)
      : [],
    coverUrl: metadata?.coverUrl ? normalizeBackgroundUrl(metadata.coverUrl) : '',
  };
}

async function listWorkshopWorldbooks() {
  const getNames = getWorkshopApi('getWorldbookNames');
  try {
    const names = typeof getNames === 'function' ? await getNames() : [getWorldbookName()];
    return [...new Set((names || []).map(name => String(name || '').trim()).filter(Boolean))];
  } catch {
    const fallback = String(getWorldbookName() || '').trim();
    return fallback ? [fallback] : [];
  }
}

async function listWorkshopWorldbookEntries(worldbookName = '') {
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  if (typeof worldbook !== 'function') return [];
  const names = await listWorkshopWorldbooks();
  const selected = worldbookName ? [worldbookName] : names;
  const result = [];
  for (const name of selected) {
    try {
      const entries = (await worldbook(name)) || [];
      result.push(
        ...entries
          .filter(entry => entry?.name && typeof entry.content === 'string')
          .map(entry => ({ ...JSON.parse(JSON.stringify(entry)), __worldbook: name })),
      );
    } catch {
      /* 跳过无权读取或不存在的世界书 */
    }
  }
  return result;
}

async function buildWorldbookWorkshopPackage(entryNames, metadata = {}) {
  const requested = Array.isArray(entryNames) ? entryNames : [];
  const selected = new Set(requested.filter(entry => typeof entry === 'string'));
  const supplied = requested
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => {
      const copy = JSON.parse(JSON.stringify(entry));
      delete copy.__worldbook;
      return copy;
    });
  const entries = supplied.length
    ? supplied
    : (await listWorkshopWorldbookEntries()).filter(entry => selected.has(entry.name));
  if (!entries.length) throw new Error('请至少选择一条世界书条目。');
  return {
    format: WORKSHOP_PACKAGE_FORMAT,
    version: 2,
    kind: 'worldbook',
    createdAt: new Date().toISOString(),
    metadata: workshopPackageMetadata(metadata, metadata.title || entries[0].name),
    resources: [
      { id: `worldbook-${Date.now()}`, kind: 'worldbook', name: metadata.resourceName || entries[0].name, entries },
    ],
  };
}

function buildCustomWorldbookWorkshopPackage(entry, metadata = {}) {
  if (!entry?.name || !entry?.content) throw new Error('自定义世界书需要填写条目名称与正文。');
  return {
    format: WORKSHOP_PACKAGE_FORMAT,
    version: 2,
    kind: 'worldbook',
    createdAt: new Date().toISOString(),
    metadata: workshopPackageMetadata(metadata, metadata.title || entry.name),
    resources: [
      {
        id: `worldbook-${Date.now()}`,
        kind: 'worldbook',
        name: entry.name,
        entries: [JSON.parse(JSON.stringify(entry))],
      },
    ],
  };
}

function getWorkshopApi(name) {
  return globalThis[name] ?? window.parent?.[name];
}

function listWorkshopRegexes() {
  const getter = getWorkshopApi('getTavernRegexes');
  if (typeof getter !== 'function') return [];
  try {
    return JSON.parse(JSON.stringify(getter({ type: 'character', name: 'current' }) || []));
  } catch {
    return [];
  }
}

function buildRegexWorkshopPackage(regexIds, metadata = {}) {
  const selected = new Set(Array.isArray(regexIds) ? regexIds : []);
  const regexes = listWorkshopRegexes().filter(regex => selected.has(regex.id));
  if (!regexes.length) throw new Error('请至少选择一条正则。');
  return {
    format: WORKSHOP_PACKAGE_FORMAT,
    version: 2,
    kind: 'regex',
    createdAt: new Date().toISOString(),
    metadata: workshopPackageMetadata(metadata, metadata.title || regexes[0].script_name),
    resources: [
      { id: `regex-${Date.now()}`, kind: 'regex', name: metadata.resourceName || regexes[0].script_name, regexes },
    ],
  };
}

function listWorkshopScripts() {
  const getter = getWorkshopApi('getScriptTrees');
  if (typeof getter !== 'function') return [];
  try {
    return (getter({ type: 'character' }) || [])
      .flatMap(node =>
        node?.type === 'folder' ? (node.scripts || []).map(script => ({ ...script, folder: node.name })) : [node],
      )
      .filter(script => script?.type === 'script' && script.name && typeof script.content === 'string')
      .filter(script => !CORE_REMOTE_SCRIPT_NAMES.has(String(script.name).replace(/\.js$/i, '')))
      .map(script => JSON.parse(JSON.stringify(script)));
  } catch {
    return [];
  }
}

function buildScriptWorkshopPackage(scriptIds, metadata = {}) {
  const selected = new Set(Array.isArray(scriptIds) ? scriptIds : []);
  const scripts = listWorkshopScripts()
    .filter(script => selected.has(script.id))
    .map(script => ({ ...script, enabled: false, button: { ...(script.button || {}), enabled: false } }));
  if (!scripts.length) throw new Error('请至少选择一段角色卡脚本。');
  return {
    format: WORKSHOP_PACKAGE_FORMAT,
    version: 2,
    kind: 'script',
    createdAt: new Date().toISOString(),
    metadata: workshopPackageMetadata(metadata, metadata.title || scripts[0].name),
    resources: [
      {
        id: `script-${Date.now()}`,
        kind: 'script',
        name: metadata.resourceName || scripts[0].name,
        scripts,
        disabledByDefault: true,
      },
    ],
  };
}

function buildCustomFengyueWorkshopPackage(rawItem, metadata = {}) {
  const item = {
    id: String(rawItem?.id || '').trim() || `workshop-${Date.now()}`,
    name: String(rawItem?.name || '').trim(),
    price: Math.max(0, Number(rawItem?.price || 0)),
    desc: String(rawItem?.desc || '').trim(),
  };
  if (!item.name || !item.desc) throw new Error('请填写风月阁物品名称与说明。');
  return {
    format: WORKSHOP_PACKAGE_FORMAT,
    version: 2,
    kind: 'fengyue-item',
    createdAt: new Date().toISOString(),
    metadata: workshopPackageMetadata(metadata, metadata.title || item.name),
    resources: [
      { id: `fengyue-${Date.now()}`, kind: 'fengyue-item', name: metadata.resourceName || item.name, items: [item] },
    ],
  };
}

async function importWorkshopRegexes(regexes, options = {}) {
  const getter = getWorkshopApi('getTavernRegexes');
  const replacer = getWorkshopApi('replaceTavernRegexes');
  if (typeof getter !== 'function' || typeof replacer !== 'function') throw new Error('酒馆正则接口不可用。');
  const current = getter({ type: 'character', name: 'current' }) || [];
  const names = new Set(current.map(item => item.script_name));
  const additions = (regexes || []).map(raw => {
    const regex = JSON.parse(JSON.stringify(raw));
    while (names.has(regex.script_name)) regex.script_name = `${regex.script_name}（导入）`;
    names.add(regex.script_name);
    regex.id = `cmw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    regex.enabled = options.enabled === true;
    return regex;
  });
  await replacer([...current, ...additions], { type: 'character', name: 'current' });
  return additions.length;
}

function importWorkshopScripts(scripts, options = {}) {
  const getter = getWorkshopApi('getScriptTrees');
  const replacer = getWorkshopApi('replaceScriptTrees');
  if (typeof getter !== 'function' || typeof replacer !== 'function') throw new Error('角色卡脚本接口不可用。');
  const current = JSON.parse(JSON.stringify(getter({ type: 'character' }) || []));
  const existing = new Set(
    current.flatMap(node => (node?.type === 'folder' ? node.scripts || [] : [node])).map(script => script?.name),
  );
  const additions = (scripts || []).map(raw => {
    const script = JSON.parse(JSON.stringify(raw));
    while (existing.has(script.name)) script.name = `${script.name}（导入）`;
    existing.add(script.name);
    script.id = `cmw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    script.enabled = options.enabled === true;
    script.button = { ...(script.button || {}), enabled: options.enabled === true };
    return script;
  });
  replacer([...current, ...additions], { type: 'character' });
  return additions.length;
}

function importWorkshopFengyueItems(items) {
  const current = getWorkshopFengyueItems();
  const ids = new Set(getShopItems().map(item => item.id));
  const additions = (items || []).map(raw => {
    const item = {
      id: String(raw.id || '').trim(),
      name: String(raw.name || '').trim(),
      price: Math.max(0, Number(raw.price || 0)),
      desc: String(raw.desc || '').trim(),
    };
    if (!item.id || !item.name || !item.desc) throw new Error('风月阁物品数据不完整。');
    while (ids.has(item.id)) item.id = `${item.id}-imported`;
    ids.add(item.id);
    return item;
  });
  saveStorage(WORKSHOP_FENGYUE_STORAGE_KEY, JSON.stringify([...current, ...additions]));
  return additions.length;
}

function nextImportedName(base, usedNames) {
  let index = 1;
  let name = `${base}（导入）`;
  while (usedNames.has(name)) name = `${base}（导入${++index}）`;
  usedNames.add(name);
  return name;
}

async function importWorldbookWorkshopPackage(bundle) {
  const workshop = getCanmingWorkshop();
  const checked = typeof workshop?.validatePackage === 'function' ? workshop.validatePackage(bundle) : bundle;
  if (checked?.format !== WORKSHOP_PACKAGE_FORMAT) throw new Error('不是有效的世界书作品包。');
  const resource = checked.version === 2 ? checked.resources?.find(item => item.kind === 'worldbook') : null;
  if (checked.version === 2 && !resource) throw new Error('作品包没有世界书资源。');
  if (checked.version !== 2 && checked.type !== 'worldbook-entry') throw new Error('不是有效的世界书作品包。');
  const entries = resource?.entries || checked.payload?.entries;
  if (!Array.isArray(entries) || !entries.length) throw new Error('作品包没有可导入的世界书条目。');
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  const replaceWorldbook = globalThis.replaceWorldbook ?? window.parent?.replaceWorldbook;
  const createEntries = globalThis.createWorldbookEntries ?? window.parent?.createWorldbookEntries;
  if (typeof worldbook !== 'function' || typeof replaceWorldbook !== 'function' || typeof createEntries !== 'function')
    throw new Error('世界书接口不可用。');
  const worldbookName = getWorldbookName();
  const current = [...((await worldbook(worldbookName)) || [])];
  const conflicts = entries.filter(entry => current.some(item => item.name === entry.name));
  let mode = 'append';
  if (conflicts.length) {
    const names = conflicts.map(entry => entry.name).join('、');
    if (
      await canmingUiDialog(`世界书中已存在：${names}\n\n是否覆盖同名条目？`, {
        title: '导入世界书作品',
        confirmText: '覆盖',
        cancelText: '其他选项',
      })
    ) {
      mode = 'overwrite';
    } else if (
      await canmingUiDialog('是否将冲突条目自动重命名后导入？', {
        title: '导入世界书作品',
        confirmText: '重命名并导入',
        cancelText: '取消',
      })
    ) {
      mode = 'rename';
    } else {
      throw new Error('已取消导入。');
    }
  }
  const names = new Set(current.map(entry => entry.name));
  const additions = [];
  let replaced = false;
  for (const rawEntry of entries) {
    const entry = JSON.parse(JSON.stringify(rawEntry));
    const index = current.findIndex(item => item.name === entry.name);
    if (index >= 0 && mode === 'overwrite') {
      entry.uid = current[index].uid;
      current[index] = entry;
      replaced = true;
    } else {
      if (index >= 0) entry.name = nextImportedName(entry.name, names);
      delete entry.uid;
      additions.push(entry);
    }
  }
  if (replaced)
    await replaceWorldbook(worldbookName, current, { render: additions.length ? 'debounced' : 'immediate' });
  if (additions.length) await createEntries(worldbookName, additions, { render: 'immediate' });
  showToast(`✓ 已导入 ${entries.length} 条世界书作品`, 'ok');
  return { worldbookName, count: entries.length, mode };
}

const CHARACTER_ADAPTATION_PATTERN =
  /(<!-- CANMING_CHARACTER_ADAPTATION_START -->)([\s\S]*?)(<!-- CANMING_CHARACTER_ADAPTATION_END -->)/;

function normalizeUserReference(value) {
  const sentinel = '\u0000CMYJ_USER_TOKEN\u0000';
  return String(value || '')
    .replace(/<\s*user\s*>/gi, sentinel)
    .replace(/\{\{\s*user\s*\}\}/gi, sentinel)
    .replace(/\buser\b/gi, sentinel)
    .replaceAll(sentinel, '<user>');
}

function characterAdaptationBody(adaptation, version = 2) {
  const scalar = value => JSON.stringify(normalizeUserReference(value));
  const isV3 = Number(version) >= 3;
  // v2 mixed long-term positioning with an opening snapshot. Keep accepting old
  // packages, but deliberately map only information that remains useful after
  // the first scene; current goals, knowledge, presence and similar fields are
  // initialized through MVU and must never be written into a persistent persona.
  const identityPosition = isV3 ? adaptation.identityPosition || adaptation.identity : adaptation.identity;
  const activityRange = isV3 ? adaptation.activityRange || adaptation.activityArea : '';
  const factionAlignment = isV3 ? adaptation.factionAlignment || adaptation.faction : adaptation.faction;
  const userRelationshipOrigin = isV3
    ? adaptation.userRelationshipOrigin || adaptation.relationshipOrigin || adaptation.userRelation
    : /尚未相识|当前|当期|开场/.test(String(adaptation.userRelation || ''))
      ? ''
      : adaptation.userRelation;
  const relationshipPattern = isV3
    ? adaptation.relationshipPattern
    : /尚未相识|初始|当前|当期|开场/.test(String(adaptation.relationshipTone || ''))
      ? ''
      : adaptation.relationshipTone;
  const addressPrinciples = isV3 ? adaptation.addressPrinciples : '';
  const characterToUser =
    adaptation.characterToUser ||
    (addressPrinciples && typeof addressPrinciples === 'object' ? addressPrinciples.characterToUser : '');
  const userToCharacter =
    adaptation.userToCharacter ||
    (addressPrinciples && typeof addressPrinciples === 'object' ? addressPrinciples.userToCharacter : '');
  const rules = isV3 ? adaptation.adaptationPrinciples : adaptation.interactionRules;
  const adaptationPrinciples = Array.isArray(rules) ? rules.filter(Boolean) : [];
  const persistentPrinciples = isV3
    ? adaptationPrinciples
    : adaptationPrinciples.filter(rule => !/开场|当期|当前|此刻|正在|出场/.test(String(rule)));
  const relationships = Array.isArray(adaptation.nonFixedRelationships)
    ? adaptation.nonFixedRelationships.filter(item => item?.character && item?.relation)
    : [];
  const lines = ['', '身份与关系:'];
  if (identityPosition) lines.push(`  身份: ${scalar(identityPosition)}`);
  if (activityRange) lines.push(`  活动范围: ${scalar(activityRange)}`);
  if (factionAlignment) lines.push(`  势力归属: ${scalar(factionAlignment)}`);
  if (userRelationshipOrigin) lines.push(`  与<user>的过往: ${scalar(userRelationshipOrigin)}`);
  if (relationshipPattern) lines.push(`  相处方式: ${scalar(relationshipPattern)}`);
  if (isV3 && adaptation.longTermSituation) lines.push(`  长期处境: ${scalar(adaptation.longTermSituation)}`);
  if (typeof addressPrinciples === 'string' && addressPrinciples)
    lines.push(`  称呼原则: ${scalar(addressPrinciples)}`);
  else if (characterToUser || userToCharacter) {
    lines.push(
      '  彼此称呼:',
      `    角色称呼<user>: ${scalar(characterToUser)}`,
      `    <user>称呼角色: ${scalar(userToCharacter)}`,
    );
  }
  if (relationships.length) {
    lines.push('  与其他人物:');
    for (const relationship of relationships) {
      lines.push(`    - 角色: ${scalar(relationship.character)}`, `      关系: ${scalar(relationship.relation)}`);
    }
  }
  lines.push(
    '  演绎要点:',
    ...(persistentPrinciples.length
      ? persistentPrinciples.map(rule => `    - ${scalar(rule)}`)
      : ['    - "不得改变原始人设的性格核心、重要经历与人物关系。"']),
    '',
  );
  return lines.join('\n');
}

async function applyScenarioCharacterAdaptations(adaptations, version = 2) {
  if (!Array.isArray(adaptations) || !adaptations.length) return [];
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;
  if (typeof worldbook !== 'function' || typeof replaceWorldbook !== 'function')
    throw new Error('角色适配需要世界书读写接口。');
  const worldbookName = getWorldbookName();
  const current = (await worldbook(worldbookName)) || [];
  const updates = new Map();
  const backups = [];
  for (const adaptation of adaptations) {
    const candidates = [`${adaptation.character}_SFW`, adaptation.character];
    const index = current.findIndex(entry => candidates.includes(entry?.name));
    if (index < 0) throw new Error(`基础卡缺少角色条目「${adaptation.character}」。`);
    const content = String(current[index].content || '');
    const match = content.match(CHARACTER_ADAPTATION_PATTERN);
    if (!match) throw new Error(`角色「${adaptation.character}」缺少动态人设标记，请更新基础卡。`);
    backups.push({ entryName: current[index].name, previousBlock: match[2] });
    updates.set(index, {
      ...current[index],
      content: content.replace(
        CHARACTER_ADAPTATION_PATTERN,
        (_match, start, _previous, end) => `${start}${characterAdaptationBody(adaptation, version)}${end}`,
      ),
    });
  }
  const next = current.map((entry, index) => updates.get(index) || entry);
  await replaceWorldbook(worldbookName, next, { render: 'immediate' });
  return backups;
}

async function restoreScenarioCharacterAdaptations(backups) {
  if (!Array.isArray(backups) || !backups.length) return;
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;
  if (typeof worldbook !== 'function' || typeof replaceWorldbook !== 'function')
    throw new Error('角色适配恢复需要世界书读写接口。');
  const worldbookName = getWorldbookName();
  const current = (await worldbook(worldbookName)) || [];
  const backupMap = new Map(backups.map(item => [item.entryName, item.previousBlock]));
  const missing = backups.filter(
    item =>
      !current.some(
        entry => entry?.name === item.entryName && CHARACTER_ADAPTATION_PATTERN.test(String(entry.content || '')),
      ),
  );
  if (missing.length)
    throw new Error(`无法恢复角色适配：${missing.map(item => item.entryName).join('、')} 缺少条目或标记。`);
  const next = current.map(entry => {
    if (!backupMap.has(entry?.name)) return entry;
    return {
      ...entry,
      content: String(entry.content || '').replace(
        CHARACTER_ADAPTATION_PATTERN,
        (_match, start, _previous, end) => `${start}${backupMap.get(entry.name)}${end}`,
      ),
    };
  });
  await replaceWorldbook(worldbookName, next, { render: 'immediate' });
}

function builtinTongchengOverviewEntry(overviews) {
  const data = JSON.stringify(overviews, null, 2);
  return {
    name: '人物概览',
    enabled: true,
    content: `@@preprocessing
<%_
var characterOverviews = ${data};
var openingId = getvar('stat_data.世界运转._开场标识', { defaults: '' });
var people = characterOverviews[openingId] || [];
if (people.length > 0) {
_%>
<人物概览>
<%_ for (var i = 0; i < people.length; i++) { _%>
- <%- people[i].name %>：<%- people[i].summary %>
<%_ } _%>
</人物概览>
<%_ } _%>`,
    strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] } },
    position: { type: 'after_character_definition', role: 'system', depth: 0, order: 0 },
    recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
    probability: 100,
    effect: { sticky: null, cooldown: null, delay: null },
  };
}

async function getInstalledScenarioInfo() {
  const getCurrentName = getWorkshopApi('getCurrentCharacterName');
  const getCharacter = getWorkshopApi('getCharacter');
  const characterName = typeof getCurrentName === 'function' ? getCurrentName() : '';
  if (!characterName || typeof getCharacter !== 'function') return null;
  const character = await getCharacter(characterName);
  const installed = character?.extensions?.canming_dlc;
  if (!installed?.id) return null;
  return {
    id: installed.id,
    name: installed.name || installed.id,
    version: installed.version || '',
    context: installed.context || readActiveDlcContext(characterName) || null,
  };
}

async function repairBuiltinTongchengCharacterAdaptations() {
  const getCurrentName = getWorkshopApi('getCurrentCharacterName');
  const getCharacter = getWorkshopApi('getCharacter');
  const replaceCharacter = getWorkshopApi('replaceCharacter');
  if (
    typeof getCurrentName !== 'function' ||
    typeof getCharacter !== 'function' ||
    typeof replaceCharacter !== 'function'
  )
    throw new Error('角色卡更新接口不可用。');
  const characterName = getCurrentName();
  if (!characterName) throw new Error('请先打开《残明余烬》基础卡。');
  const character = await getCharacter(characterName);
  const extension = character?.extensions?.canming_dlc;
  if (extension?.id !== 'cmyj.original.tongcheng') throw new Error('当前安装的不是原版桐城开局。');

  if (extension.characterAdaptationBackups?.length)
    await restoreScenarioCharacterAdaptations(extension.characterAdaptationBackups);
  const characterAdaptationBackups = await applyScenarioCharacterAdaptations(
    ORIGINAL_TONGCHENG_CHARACTER_ADAPTATIONS,
    3,
  );
  const context = {
    ...(extension.context || {}),
    characterAdaptationVersion: 3,
    characterAdaptations: JSON.parse(JSON.stringify(ORIGINAL_TONGCHENG_CHARACTER_ADAPTATIONS)),
  };
  extension.characterAdaptationBackups = characterAdaptationBackups;
  extension.context = context;
  character.extensions.canming_dlc = extension;
  await replaceCharacter(characterName, character, { render: 'immediate' });
  const verifiedCharacter = await getCharacter(characterName);
  if (
    !Array.isArray(verifiedCharacter?.extensions?.canming_dlc?.context?.characterAdaptations) ||
    verifiedCharacter.extensions.canming_dlc.context.characterAdaptations.length <
      ORIGINAL_TONGCHENG_CHARACTER_ADAPTATIONS.length
  )
    throw new Error('原版桐城角色人设写入后校验失败，请重试。');
  writeActiveDlcContext(characterName, context);
  globalThis.__CMYJ_DLC_CONTEXT_V1__ = context;
  ACTIVE_DLC_CONTEXT = context;
  await syncPortraitIllustrationRule();
  return {
    scenarioId: extension.id,
    repaired: true,
    characterAdaptationCount: ORIGINAL_TONGCHENG_CHARACTER_ADAPTATIONS.length,
  };
}

async function installBuiltinTongchengScenario() {
  try {
    const installed = await getInstalledScenarioInfo();
    const originalAdaptationCount = ORIGINAL_TONGCHENG_CHARACTER_ADAPTATIONS.length;
    const installedAdaptationCount = Array.isArray(installed?.context?.characterAdaptations)
      ? installed.context.characterAdaptations.length
      : 0;
    if (
      installed?.id === 'cmyj.original.tongcheng' &&
      installedAdaptationCount >= originalAdaptationCount
    ) {
      showToast('原版桐城开局已经安装，无需重复安装。', 'ok');
      return { scenarioId: installed.id, alreadyInstalled: true };
    }
    if (installed?.id === 'cmyj.original.tongcheng') {
      const repaired = await repairBuiltinTongchengCharacterAdaptations();
      showToast(`✓ 已补全原版桐城开局的 ${repaired.characterAdaptationCount} 名角色人设`, 'ok');
      return repaired;
    }
    const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
    if (typeof worldbook !== 'function') throw new Error('世界书读取接口不可用。');
    const entries = (await worldbook(getWorldbookName())) || [];
    const openings = BUILTIN_TONGCHENG_OPENINGS.map(definition => {
      const entry = entries.find(item => item?.name === definition.entry);
      if (!entry?.content) throw new Error(`基础卡缺少内置资源「${definition.entry}」，请重新同步角色卡。`);
      const content = String(entry.content).replace(
        /(<initvar>\s*\n世界运转:\s*\n)/,
        `$1  _开场标识: ${definition.id}\n`,
      );
      return { id: definition.id, name: definition.name, subtitle: definition.subtitle, content };
    });
    const peopleByName = Object.fromEntries(
      [
        ['苏晚棠', '和济堂当家妇人，栖云、栖月与赵砚的养母。'],
        ['栖云', '苏晚棠养女、栖月的双胞胎姐姐，沉稳护家。'],
        ['栖月', '苏晚棠养女、栖云的双胞胎妹妹，心细寡言。'],
        ['赵砚', '苏晚棠养子，机灵沉默而重情。'],
        ['苏元庆', '苏家长辈，在桐城经营家业与人情往来。'],
        ['苏晚月', '苏晚棠之妹，嘴利手稳的边镇遗孀。'],
        ['林知夏', '林记米铺独女，活泼温善。'],
        ['翠儿', '贫家出身的年轻丫鬟，嘴碎心热。'],
        ['常彪', '桐城快班捕役，莽直仗义。'],
        ['顾明远', '落魄秀才，言辞刻薄而心思缜密。'],
        ['沈清晏', '沈家独女，嘴利心细，擅长识字记账。'],
        ['沈大柱', '沈记肉铺屠户，沈清晏之父。'],
        ['柳氏', '沈大柱之妻、沈清晏之母。'],
        ['周氏', '林记米铺女掌柜，林知夏之母。'],
        ['陈茂林', '桐城市井人物，熟悉本地门路与消息。'],
        ['方仲嘉', '桐城方氏子弟，牵涉地方士绅事务。'],
        ['杨尔铭', '年少谨慎的桐城知县。'],
        ['方孔炤', '桐城方氏仕宦，方子衿之父。'],
        ['周拥田', '桐城地方人物，与城中差役事务有关。'],
        ['赵老六', '桐城基层差役，熟悉衙门与街面。'],
        ['马会', '桐城基层差役，参与城中巡捕事务。'],
        ['方应乾', '桐城方氏人物，卷入凤阳惊变前后的地方局势。'],
      ].map(([name, summary]) => [name, { name, summary }]),
    );
    const overviewNames = {
      'tongcheng-rebirth': [
        '苏晚棠',
        '栖云',
        '栖月',
        '赵砚',
        '苏元庆',
        '苏晚月',
        '林知夏',
        '翠儿',
        '常彪',
        '顾明远',
        '沈清晏',
        '沈大柱',
        '柳氏',
        '周氏',
        '陈茂林',
      ],
      'tongcheng-yunjisi': [
        '苏晚棠',
        '栖云',
        '栖月',
        '赵砚',
        '苏元庆',
        '苏晚月',
        '林知夏',
        '翠儿',
        '常彪',
        '顾明远',
        '沈清晏',
        '沈大柱',
        '柳氏',
        '周氏',
        '陈茂林',
        '方仲嘉',
        '杨尔铭',
        '方孔炤',
      ],
      'tongcheng-fengyang': [
        '杨尔铭',
        '苏晚棠',
        '苏元庆',
        '栖云',
        '栖月',
        '赵砚',
        '林知夏',
        '翠儿',
        '常彪',
        '顾明远',
        '周拥田',
        '赵老六',
        '马会',
        '沈清晏',
        '方仲嘉',
        '方应乾',
      ],
    };
    const overviews = Object.fromEntries(
      openings.map(opening => [opening.id, (overviewNames[opening.id] || []).map(name => peopleByName[name])]),
    );
    const resource = {
      id: 'cmyj.original.tongcheng',
      kind: 'scenario',
      name: '原版·桐城皂隶篇',
      scenario: {
        id: 'cmyj.original.tongcheng',
        version: '1.0.1',
        baseCard: 'cmyj.base',
        minBaseVersion: STATUSBAR_VERSION,
        exclusiveGroup: 'player-origin',
        allowMidChatSwitch: false,
        newChatRequired: true,
      },
      openings,
      worldbookEntries: [builtinTongchengOverviewEntry(overviews)],
      initialRelationships: [],
      portraitProfiles: Object.keys(PORTRAIT_DATA).map(name => ({ name })),
      characterOverviewVersion: 1,
      characterOverviews: overviews,
      characterAdaptationVersion: 3,
      characterAdaptations: ORIGINAL_TONGCHENG_CHARACTER_ADAPTATIONS,
      ui: {},
    };
    const bundle = {
      format: WORKSHOP_PACKAGE_FORMAT,
      version: 2,
      kind: 'scenario',
      createdAt: new Date().toISOString(),
      metadata: {
        title: resource.name,
        summary: '内置原版桐城身份与三条经典开场。',
        tags: ['残明余烬', '桐城', '原版开局'],
        categories: ['剧情扩展'],
        coverUrl: '',
      },
      resources: [resource],
    };
    if (installed?.id) {
      const hostWindow = window.parent ?? window;
      const confirmed = hostWindow.confirm(
        `角色卡中仍记录着身份 DLC「${installed.name}」。\n\n是否先彻底卸载它，再安装原版桐城开局？当前聊天不会回滚，完成后必须新建聊天。`,
      );
      if (!confirmed) {
        const cancelled = new Error('已取消替换当前身份 DLC。');
        cancelled.code = 'SCENARIO_REPLACE_CANCELLED';
        throw cancelled;
      }
      await uninstallWorkshopInstall({ scenarios: [installed.id] });
      await getCanmingWorkshop()?.forgetScenarioInstall?.(installed.id, {
        cleanup: true,
        bridge: createWorkshopBridge(),
      });
    }
    return await importScenarioWorkshopPackage(bundle);
  } catch (error) {
    if (error?.code !== 'SCENARIO_REPLACE_CANCELLED')
      showToast(`✗ 原版桐城开局安装失败：${error?.message || '未知错误'}`, 'err');
    throw error;
  }
}

async function importScenarioWorkshopPackage(bundle) {
  const workshop = getCanmingWorkshop();
  const checked = typeof workshop?.validatePackage === 'function' ? workshop.validatePackage(bundle) : bundle;
  const resource = checked?.version === 2 ? checked.resources?.find(item => item.kind === 'scenario') : null;
  if (!resource?.scenario || !Array.isArray(resource.openings) || !resource.openings.length)
    throw new Error('作品包没有有效的身份 DLC。');
  if (resource.scenario.exclusiveGroup !== 'player-origin' || resource.scenario.allowMidChatSwitch)
    throw new Error('身份 DLC 必须互斥且禁止中途切换。');

  const getCurrentName = getWorkshopApi('getCurrentCharacterName');
  const getCharacter = getWorkshopApi('getCharacter');
  const replaceCharacter = getWorkshopApi('replaceCharacter');
  if (
    typeof getCurrentName !== 'function' ||
    typeof getCharacter !== 'function' ||
    typeof replaceCharacter !== 'function'
  )
    throw new Error('角色卡更新接口不可用。');
  const characterName = getCurrentName();
  if (!characterName) throw new Error('请先打开《残明余烬》基础卡。');
  let character = await getCharacter(characterName);
  character.extensions = character.extensions && typeof character.extensions === 'object' ? character.extensions : {};
  let previous = character.extensions.canming_dlc;
  if (previous?.id && previous.id !== resource.scenario.id) {
    const confirmed = (window.parent ?? window).confirm(
      `检测到尚未卸载的身份 DLC「${previous.name || previous.id}」。\n\n每张基础卡只能启用一个身份 DLC。是否先卸载旧 DLC，再安装「${resource.name}」？完成后必须新建聊天。`,
    );
    if (!confirmed) {
      const cancelled = new Error('已取消替换当前身份 DLC。');
      cancelled.code = 'SCENARIO_REPLACE_CANCELLED';
      throw cancelled;
    }
    await uninstallWorkshopInstall({ scenarios: [previous.id] });
    await workshop?.forgetScenarioInstall?.(previous.id, {
      cleanup: true,
      bridge: createWorkshopBridge(),
    });
    character = await getCharacter(characterName);
    character.extensions =
      character.extensions && typeof character.extensions === 'object' ? character.extensions : {};
    previous = character.extensions.canming_dlc;
  }

  const scenarioWorldbookNames = new Set((resource.worldbookEntries || []).map(entry => entry?.name).filter(Boolean));
  const getWorldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  const worldbookEntryBackups = previous?.id
    ? Array.isArray(previous.worldbookEntryBackups)
      ? JSON.parse(JSON.stringify(previous.worldbookEntryBackups))
      : []
    : typeof getWorldbook === 'function'
      ? ((await getWorldbook(getWorldbookName())) || [])
          .map((entry, index) => ({ entry, index }))
          .filter(item => scenarioWorldbookNames.has(item.entry?.name))
          .map(item => JSON.parse(JSON.stringify(item)))
      : [];

  const worldbookBundle = {
    format: WORKSHOP_PACKAGE_FORMAT,
    version: 2,
    kind: 'worldbook',
    metadata: checked.metadata,
    resources: [
      {
        id: `${resource.id}-worldbook`,
        kind: 'worldbook',
        name: resource.name,
        entries: resource.worldbookEntries || [],
      },
    ],
  };
  await importWorldbookWorkshopPackage(worldbookBundle);
  if (previous?.characterAdaptationBackups?.length)
    await restoreScenarioCharacterAdaptations(previous.characterAdaptationBackups);
  const characterAdaptationBackups = await applyScenarioCharacterAdaptations(
    resource.characterAdaptations || [],
    resource.characterAdaptationVersion || 2,
  );

  const originalFirstMessages =
    previous?.originalFirstMessages || JSON.parse(JSON.stringify(character.first_messages || []));
  const baseIntroduction = originalFirstMessages[0] || character.first_messages?.[0] || '';
  character.first_messages = [baseIntroduction, ...resource.openings.map(opening => opening.content)];
  const context = {
    id: resource.scenario.id,
    name: resource.name,
    version: resource.scenario.version,
    scenario: resource.scenario,
    openings: resource.openings.map(({ id, name, subtitle }) => ({ id, name, subtitle })),
    initialRelationships: resource.initialRelationships || [],
    portraitProfiles: resource.portraitProfiles || [],
    characterOverviewVersion: resource.characterOverviewVersion || 0,
    characterOverviews: resource.characterOverviews || {},
    characterAdaptations: resource.characterAdaptations || [],
    ui: resource.ui || {},
  };
  character.extensions.canming_dlc = {
    id: resource.scenario.id,
    name: resource.name,
    version: resource.scenario.version,
    exclusiveGroup: resource.scenario.exclusiveGroup,
    originalFirstMessages,
    worldbookEntries: (resource.worldbookEntries || []).map(entry => entry.name),
    worldbookEntryBackups,
    characterAdaptationBackups,
    context,
  };
  await replaceCharacter(characterName, character, { render: 'immediate' });
  writeActiveDlcContext(characterName, context);
  globalThis.__CMYJ_DLC_CONTEXT_V1__ = context;
  ACTIVE_DLC_CONTEXT = context;
  getPortraitLibrary();
  getCharacterProfiles();
  await syncPortraitIllustrationRule();
  showToast(`✓ 已安装身份 DLC「${resource.name}」；请新建聊天后选择开场`, 'ok');
  return { scenarioId: resource.scenario.id, characterName, openingCount: resource.openings.length };
}

async function snapshotWorkshopInstallState() {
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  let worldbookEntries = [];
  try {
    worldbookEntries = typeof worldbook === 'function' ? (await worldbook(getWorldbookName())) || [] : [];
  } catch {
    /* ignore */
  }
  const generator = getCharacterGenerator();
  let activeScenario = null;
  try {
    const getCurrentName = getWorkshopApi('getCurrentCharacterName');
    const getCharacter = getWorkshopApi('getCharacter');
    const characterName = typeof getCurrentName === 'function' ? getCurrentName() : '';
    const character = characterName && typeof getCharacter === 'function' ? await getCharacter(characterName) : null;
    activeScenario = character?.extensions?.canming_dlc?.id || null;
  } catch {
    /* ignore */
  }
  return {
    characters: getCharacterProfiles()
      .profiles.map(item => item.id)
      .filter(Boolean),
    worldbooks: worldbookEntries.map(item => item.name).filter(Boolean),
    worldbookSignatures: Object.fromEntries(
      worldbookEntries.filter(item => item?.name).map(item => [item.name, workshopWorldbookSignature(item)]),
    ),
    regexes: listWorkshopRegexes()
      .map(item => item.id)
      .filter(Boolean),
    scripts: listWorkshopScripts()
      .map(item => item.id)
      .filter(Boolean),
    fengyue: getWorkshopFengyueItems()
      .map(item => item.id)
      .filter(Boolean),
    generators:
      generator
        ?.listShareableGenerators?.()
        .map(item => item.id)
        .filter(Boolean) || [],
    scenarios: activeScenario ? [activeScenario] : [],
  };
}

function workshopWorldbookSignature(entry) {
  const normalize = value => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .filter(key => key !== 'uid')
          .sort()
          .map(key => [key, normalize(value[key])]),
      );
    return value;
  };
  return JSON.stringify(normalize(entry));
}

function renderStatusbarBehindWorkshop() {
  if (!isOpen || !frameDocument?.body) return;
  const workshopRoot = frameDocument.getElementById('canming-workshop-root');
  if (!workshopRoot) {
    render();
    return;
  }
  workshopRoot.remove();
  try {
    render();
  } finally {
    frameDocument.body.appendChild(workshopRoot);
  }
}

async function uninstallWorkshopInstall(delta = {}) {
  const ids = key => new Set(Array.isArray(delta[key]) ? delta[key] : []);
  const characterIds = ids('characters');
  if (characterIds.size) {
    const registry = getCharacterProfiles();
    const removed = registry.profiles.filter(item => characterIds.has(item.id));
    registry.profiles = registry.profiles.filter(item => !characterIds.has(item.id));
    saveCharacterProfiles(registry);
    const library = getPortraitLibrary();
    removed.forEach(profile => {
      delete library.entries[profile.name];
    });
    savePortraitLibrary(library);
  }

  const worldbookNames = ids('worldbooks');
  if (worldbookNames.size) {
    const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
    const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;
    if (typeof worldbook === 'function' && typeof replaceWorldbook === 'function') {
      const current = (await worldbook(getWorldbookName())) || [];
      await replaceWorldbook(
        getWorldbookName(),
        current.filter(entry => !worldbookNames.has(entry.name)),
        { render: 'immediate' },
      );
    }
  }

  const regexIds = ids('regexes');
  if (regexIds.size) {
    const getter = getWorkshopApi('getTavernRegexes');
    const replacer = getWorkshopApi('replaceTavernRegexes');
    if (typeof getter === 'function' && typeof replacer === 'function') {
      const current = getter({ type: 'character', name: 'current' }) || [];
      await replacer(
        current.filter(item => !regexIds.has(item.id)),
        { type: 'character', name: 'current' },
      );
    }
  }

  const scriptIds = ids('scripts');
  if (scriptIds.size) {
    const getter = getWorkshopApi('getScriptTrees');
    const replacer = getWorkshopApi('replaceScriptTrees');
    if (typeof getter === 'function' && typeof replacer === 'function') {
      const prune = nodes =>
        (nodes || [])
          .map(node => (node?.type === 'folder' ? { ...node, scripts: prune(node.scripts) } : node))
          .filter(node => (node?.type === 'folder' ? node.scripts.length : !scriptIds.has(node?.id)));
      await replacer(prune(JSON.parse(JSON.stringify(getter({ type: 'character' }) || []))), { type: 'character' });
    }
  }

  const fengyueIds = ids('fengyue');
  if (fengyueIds.size)
    saveStorage(
      WORKSHOP_FENGYUE_STORAGE_KEY,
      JSON.stringify(getWorkshopFengyueItems().filter(item => !fengyueIds.has(item.id))),
    );

  const generatorIds = ids('generators');
  if (generatorIds.size) generatorIds.forEach(id => getCharacterGenerator()?.removeGeneratorDefinition?.(id));

  const scenarioIds = ids('scenarios');
  if (scenarioIds.size) {
    const getCurrentName = getWorkshopApi('getCurrentCharacterName');
    const getCharacter = getWorkshopApi('getCharacter');
    const replaceCharacter = getWorkshopApi('replaceCharacter');
    const characterName = typeof getCurrentName === 'function' ? getCurrentName() : '';
    if (characterName && typeof getCharacter === 'function' && typeof replaceCharacter === 'function') {
      const character = await getCharacter(characterName);
      const installed = character?.extensions?.canming_dlc;
      if (installed?.id && scenarioIds.has(installed.id)) {
        await restoreScenarioCharacterAdaptations(installed.characterAdaptationBackups || []);
        const installedWorldbookNames = new Set((installed.worldbookEntries || []).filter(Boolean));
        const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
        const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;
        if (installedWorldbookNames.size && typeof worldbook === 'function' && typeof replaceWorldbook === 'function') {
          const current = (await worldbook(getWorldbookName())) || [];
          const restored = current.filter(entry => !installedWorldbookNames.has(entry?.name));
          for (const backup of [...(installed.worldbookEntryBackups || [])].sort(
            (left, right) => Number(left?.index || 0) - Number(right?.index || 0),
          )) {
            if (!backup?.entry?.name) continue;
            restored.splice(Math.min(Math.max(Number(backup.index) || 0, 0), restored.length), 0, backup.entry);
          }
          await replaceWorldbook(getWorldbookName(), restored, { render: 'immediate' });
        }
        character.first_messages = JSON.parse(
          JSON.stringify(installed.originalFirstMessages || character.first_messages || []),
        );
        // 酒馆助手在写回角色卡时会合并 extensions；直接 delete 只会让本次
        // 请求缺少该字段，服务端原有的 canming_dlc 反而会被保留下来。
        // 用 null 作为明确的清除值，之后安装新 DLC 时会正常覆盖它。
        character.extensions.canming_dlc = null;
        await replaceCharacter(characterName, character, { render: 'immediate' });
        const verifiedCharacter = await getCharacter(characterName);
        if (verifiedCharacter?.extensions?.canming_dlc?.id)
          throw new Error('角色卡中的身份 DLC 安装标记未能清除，请重试。');
        removeActiveDlcContext(characterName);
        try {
          delete globalThis.__CMYJ_DLC_CONTEXT_V1__;
        } catch {}
        ACTIVE_DLC_CONTEXT = null;
        getPortraitLibrary();
        getCharacterProfiles();
      }
    }
  }
  if (characterIds.size || scenarioIds.size) {
    await syncPortraitIllustrationRule();
    await syncExtensionCharacterIndex();
  }
  renderStatusbarBehindWorkshop();
  return true;
}

async function uninstallCurrentScenario() {
  try {
    const getCurrentName = getWorkshopApi('getCurrentCharacterName');
    const getCharacter = getWorkshopApi('getCharacter');
    const characterName = typeof getCurrentName === 'function' ? getCurrentName() : '';
    if (!characterName || typeof getCharacter !== 'function') throw new Error('请先打开《残明余烬》基础卡。');
    const character = await getCharacter(characterName);
    const installed = character?.extensions?.canming_dlc;
    if (!installed?.id) throw new Error('当前没有已安装的身份 DLC。');
    const name = installed.name || installed.id;
    await uninstallWorkshopInstall({ scenarios: [installed.id] });
    await getCanmingWorkshop()?.forgetScenarioInstall?.(installed.id, {
      cleanup: true,
      bridge: createWorkshopBridge(),
    });
    showToast(`✓ 已卸载身份 DLC「${name}」，基础卡开场已经恢复`, 'ok');
    return { scenarioId: installed.id, name };
  } catch (error) {
    showToast(`✗ 身份 DLC 卸载失败：${error?.message || '未知错误'}`, 'err');
    throw error;
  }
}

function createWorkshopBridge() {
  return {
    listCharacterProfiles: () => JSON.parse(JSON.stringify(getCharacterProfiles().profiles || [])),
    buildCharacterPackage: buildCharacterWorkshopPackage,
    importCharacterPackage: importCharacterPackageBundle,
    getPrimaryWorldbookName: () => getWorldbookName(),
    importWorldbookWork: importWorldbookWorkshopPackage,
    refreshCharacterManager: id => openCharacterManager(id || '', 'profile'),
    getGeneratorWork: () => getCharacterGenerator()?.getCurrentWork?.() || null,
    buildGeneratorPackage: buildGeneratorWorkshopPackage,
    listGenerators: listWorkshopGenerators,
    buildGeneratorDefinitionPackage: buildGeneratorDefinitionWorkshopPackage,
    importGenerators: importWorkshopGenerators,
    listWorldbooks: listWorkshopWorldbooks,
    listWorldbookEntries: listWorkshopWorldbookEntries,
    buildWorldbookPackage: buildWorldbookWorkshopPackage,
    buildCustomWorldbookPackage: buildCustomWorldbookWorkshopPackage,
    listRegexes: listWorkshopRegexes,
    buildRegexPackage: buildRegexWorkshopPackage,
    listScripts: listWorkshopScripts,
    buildScriptPackage: buildScriptWorkshopPackage,
    buildCustomFengyuePackage: buildCustomFengyueWorkshopPackage,
    importRegexes: importWorkshopRegexes,
    importScripts: importWorkshopScripts,
    importFengyueItems: importWorkshopFengyueItems,
    importScenarioPackage: importScenarioWorkshopPackage,
    openScenarioGenerator: () => {
      getCanmingWorkshop()?.close?.();
      return openScenarioGenerator();
    },
    reloadAfterScenarioInstall: () => window.location.reload(),
    snapshotInstallState: snapshotWorkshopInstallState,
    uninstallInstall: uninstallWorkshopInstall,
  };
}

async function openCanmingWorkshop(workshopOptions = {}) {
  try {
    const workshop = getCanmingWorkshop() ?? (await loadCanmingWorkshopScript());
    if (!workshop?.open) throw new Error('创意工坊接口未注册。');
    const opening = workshop.open({
      mountDocument: frameDocument,
      theme,
      toast: showToast,
      dialog: canmingUiDialog,
      bridge: createWorkshopBridge(),
      ...workshopOptions,
    });
    const workshopRoot = frameDocument.getElementById('canming-workshop-root');
    if (workshopRoot) workshopRoot.style.zIndex = '60';
    await opening;
    if (workshopOptions.initialType) {
      const typeSelect = workshopRoot?.querySelector('[data-t]');
      if (typeSelect) {
        if (![...typeSelect.options].some(option => option.value === workshopOptions.initialType)) {
          const option = frameDocument.createElement('option');
          option.value = workshopOptions.initialType;
          option.textContent = workshopOptions.initialType === 'generator' ? '万象生成器' : workshopOptions.initialType;
          typeSelect.appendChild(option);
        }
        typeSelect.value = workshopOptions.initialType;
        workshopRoot.querySelector('[data-a="search"]')?.click();
      }
    }
  } catch (error) {
    showToast(`✗ 打开创意工坊失败：${error?.message || '未知错误'}`, 'err');
  }
}

function getVariableEditor() {
  return globalThis.CanmingVariableEditor ?? window.parent?.CanmingVariableEditor;
}

function loadVariableEditorScript() {
  if (getVariableEditor()) return Promise.resolve(getVariableEditor());
  if (window._canmingVariableEditorLoading) return window._canmingVariableEditorLoading;

  const remoteRuntime = getRemoteScriptRuntime();
  if (typeof remoteRuntime?.boot === 'function') {
    window._canmingVariableEditorLoading = remoteRuntime.boot('variable-editor').then(() => {
      const editor = getVariableEditor();
      if (!editor) throw new Error('变量修改器远程脚本已加载，但接口未注册。');
      return editor;
    });
    return window._canmingVariableEditorLoading;
  }

  window._canmingVariableEditorLoading = new Promise((resolve, reject) => {
    if (!STATUSBAR_SCRIPT_SRC) {
      reject(new Error('无法定位状态栏脚本地址，请确认变量修改器脚本已被加载。'));
      return;
    }
    const script = document.createElement('script');
    script.src = new URL(VARIABLE_EDITOR_FILE, STATUSBAR_SCRIPT_SRC).href;
    script.onload = () => resolve(getVariableEditor());
    script.onerror = () => reject(new Error(`无法加载 ${VARIABLE_EDITOR_FILE}`));
    document.head.appendChild(script);
  });

  return window._canmingVariableEditorLoading;
}

async function openVariableEditor() {
  try {
    const editor = getVariableEditor() ?? (await loadVariableEditorScript());
    if (!editor?.open) throw new Error('变量修改器接口未注册。');
    editor.open({
      mountDocument: frameDocument,
      theme,
      onChanged: () => refreshData(true),
      showToast,
    });
  } catch (error) {
    showToast(`✗ 打开变量修改器失败：${error?.message || '未知错误'}`, 'err');
  }
}

function cloudWorkshopIcon() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 18H6.4A4.4 4.4 0 0 1 6 9.2a6.1 6.1 0 0 1 11.6 1.7A3.6 3.6 0 0 1 17.5 18Z"/><path d="M9 14h6M12 11v6"/></svg>';
}

function renderPanel() {
  return `
    <main class="cm-panel">
      ${renderCustomBackground()}
      <header class="cm-header">
        <div>
          <p class="cm-kicker">残明余烬 · <span class="cm-statusbar-version">v${STATUSBAR_VERSION}</span></p>
          <h1>${html(buildTabs().find(([id]) => id === activeTab)?.[1] || '状态簿')}</h1>
        </div>
        <div class="cm-actions">
          <button data-action="workshop" title="云端创意工坊" class="cm-icon-btn cm-workshop-cloud">${cloudWorkshopIcon()}<i data-workshop-notice-dot ${workshopUnreadCount ? '' : 'hidden'}>${workshopUnreadCount > 99 ? '99+' : workshopUnreadCount || ''}</i></button>
          <span class="cm-tools-wrap">
            <button data-action="tools" title="工具" class="cm-icon-btn">${toolIcon()}</button>
            <span class="cm-tools-dropdown">
              <button data-action="workshop" class="cm-tools-item">☁ 云端创意工坊</button>
              <button data-action="character-generator" class="cm-tools-item">${characterGeneratorIcon()} 万象生成器</button>
              <button data-action="scenario-generator" class="cm-tools-item">${scenarioGeneratorIcon()} 开局生成器</button>
              <button data-action="variable-editor" class="cm-tools-item">${editIcon()} 变量修改器</button>
              <button data-action="character-manager" class="cm-tools-item">${characterManagerIcon()} 角色与立绘管理</button>
            </span>
          </span>
          <button data-action="theme" title="主题" class="cm-icon-btn">${themeIcon()}</button>
          <button data-action="settings" title="难度设置" class="cm-icon-btn">⚙</button>
          <button data-action="close" title="关闭" class="cm-icon-btn">×</button>
        </div>
      </header>
      <div class="cm-shell">
        <nav class="cm-tabs">
          ${buildTabs()
            .map(
              ([id, label]) =>
                `<button class="${activeTab === id ? 'active' : ''}" data-tab="${id}">${html(label)}</button>`,
            )
            .join('')}
        </nav>
        <section class="cm-content">${renderTabContent()}</section>
      </div>
      ${toastMessage ? `<div class="cm-toast ${toastType}">${toastMessage}</div>` : ''}
      ${renderModal()}
    </main>`;
}

function styleText() {
  return `
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:"Noto Serif SC","Songti SC","SimSun",serif;color:var(--ink);scrollbar-width:thin;scrollbar-color:var(--line) transparent}*::-webkit-scrollbar{width:8px;height:8px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:linear-gradient(var(--line),rgba(164,61,45,.36));border:2px solid transparent;border-radius:999px;background-clip:padding-box}*::-webkit-scrollbar-thumb:hover{background:var(--accent);border:2px solid transparent;background-clip:padding-box}body{background:transparent}.cm-root{width:100%;height:100%;}
    .theme-day{--paper:#f4e7c7;--paper2:#ead6a6;--ink:#2c2118;--muted:#75624d;--line:rgba(96,65,36,.28);--accent:#a43d2d;--accent2:#6f8a67;--shadow:rgba(55,31,12,.35);--card:rgba(255,248,226,.72);--bar-track:#e1cfa8;--glow:rgba(188,83,42,.32);--bar-high:#7b9b6a;--bar-mid:#c49750;--bar-low:#bf5b46;--map-stable:#7b9b6a;--map-unrest:#c49750;--map-contested:#bf5b46;--map-fallen:#43312a;--map-chaos:#6a507a}
    .theme-night{--paper:#211913;--paper2:#352619;--ink:#f2dfba;--muted:#b99f76;--line:rgba(237,196,128,.24);--accent:#d0784b;--accent2:#89a074;--shadow:rgba(0,0,0,.65);--card:rgba(65,44,30,.82);--bar-track:#4a3828;--glow:rgba(220,94,48,.28);--bar-high:#8aad72;--bar-mid:#c49a55;--bar-low:#c25e4f;--map-stable:#6b8a58;--map-unrest:#b88944;--map-contested:#b0543e;--map-fallen:#35231d;--map-chaos:#564465}
    .theme-star{--paper:#0d1820;--paper2:#111d28;--ink:#e6dcc8;--muted:#7d8fa0;--line:rgba(180,155,110,.22);--accent:#d4a040;--accent2:#5d8d9a;--shadow:rgba(0,0,0,.7);--card:rgba(18,28,38,.8);--bar-track:#162432;--glow:rgba(210,160,60,.2);--bar-high:#5d8d9a;--bar-mid:#c49750;--bar-low:#b85a48;--map-stable:#5d8d9a;--map-unrest:#c49750;--map-contested:#b85a48;--map-fallen:#141420;--map-chaos:#524868}
    .theme-ink{--paper:#eee9dc;--paper2:#d8d0bf;--ink:#171a17;--muted:#5f6158;--line:rgba(20,25,22,.24);--accent:#a12f25;--accent2:#2f6965;--shadow:rgba(25,30,24,.30);--card:rgba(248,245,235,.62);--bar-track:#cac1ad;--glow:rgba(40,70,64,.18);--bar-high:#2f6965;--bar-mid:#a98138;--bar-low:#a12f25;--map-stable:#67866e;--map-unrest:#a98138;--map-contested:#a12f25;--map-fallen:#2a2b27;--map-chaos:#45595c}
    .theme-star .cm-panel{background-image:radial-gradient(1px 1px at 8% 12%,rgba(240,230,200,.7),transparent),radial-gradient(1px 1px at 18% 28%,rgba(240,230,200,.5),transparent),radial-gradient(1.5px 1.5px at 32% 8%,rgba(220,200,150,.6),transparent),radial-gradient(1px 1px at 45% 22%,rgba(240,230,200,.4),transparent),radial-gradient(1px 1px at 55% 18%,rgba(240,225,180,.55),transparent),radial-gradient(1px 1px at 68% 32%,rgba(240,230,200,.45),transparent),radial-gradient(1.5px 1.5px at 78% 14%,rgba(220,200,150,.5),transparent),radial-gradient(1px 1px at 85% 26%,rgba(240,230,200,.5),transparent),radial-gradient(1.5px 1.5px at 92% 8%,rgba(230,210,160,.4),transparent),radial-gradient(1px 1px at 12% 48%,rgba(240,230,200,.35),transparent),radial-gradient(1px 1px at 28% 42%,rgba(240,230,200,.4),transparent),radial-gradient(1px 1px at 48% 52%,rgba(240,230,200,.3),transparent),radial-gradient(1.5px 1.5px at 62% 45%,rgba(230,210,160,.45),transparent),radial-gradient(1px 1px at 72% 55%,rgba(240,230,200,.35),transparent),radial-gradient(1px 1px at 88% 48%,rgba(240,230,200,.4),transparent),radial-gradient(1px 1px at 22% 68%,rgba(240,230,200,.35),transparent),radial-gradient(1px 1px at 42% 72%,rgba(240,230,200,.3),transparent),radial-gradient(1px 1px at 58% 68%,rgba(240,230,200,.4),transparent),radial-gradient(1px 1px at 78% 72%,rgba(240,230,200,.35),transparent),radial-gradient(1px 1px at 92% 62%,rgba(230,210,160,.3),transparent),radial-gradient(1.5px 1.5px at 15% 82%,rgba(240,230,200,.35),transparent),radial-gradient(1px 1px at 38% 88%,rgba(240,230,200,.3),transparent),radial-gradient(1px 1px at 55% 82%,rgba(240,230,200,.35),transparent),radial-gradient(1px 1px at 72% 88%,rgba(240,230,200,.3),transparent),radial-gradient(1.5px 1.5px at 88% 82%,rgba(230,210,160,.35),transparent),linear-gradient(135deg,var(--paper),var(--paper2))}
    .theme-star .cm-card,.theme-star .cm-item,.theme-star .cm-fold,.theme-star .cm-modal,.theme-star .cm-hero,.theme-star .cm-private-head,.theme-star .cm-shop-item,.theme-star .cm-private-row,.theme-star .cm-power-row,.theme-star .cm-diff-btn,.theme-star .cm-portrait-card,.theme-star .cm-modal-mask{box-shadow:0 0 12px rgba(180,150,100,.06),0 8px 24px var(--shadow)}
    .theme-star .cm-tab-btn.active,.theme-star .cm-diff-btn.active{box-shadow:0 0 16px var(--glow)}
    .theme-star .cm-bar i.high,.theme-star .cm-bar i.mid{box-shadow:0 0 6px rgba(180,140,100,.15)}
    .theme-ink .cm-panel{background-color:var(--paper);background-image:radial-gradient(ellipse at 70% 12%,rgba(23,26,23,.22),transparent 28%),radial-gradient(ellipse at 18% 74%,rgba(47,105,101,.18),transparent 38%),radial-gradient(ellipse at 46% 46%,rgba(20,24,21,.10),transparent 46%),linear-gradient(135deg,var(--paper),var(--paper2));border-color:rgba(25,30,25,.30);border-radius:10px;box-shadow:0 24px 75px rgba(21,25,20,.30)}
    .theme-ink .cm-panel:before{background:radial-gradient(ellipse at 20% 18%,rgba(0,0,0,.12),transparent 10%),radial-gradient(ellipse at 24% 20%,rgba(0,0,0,.07),transparent 15%),radial-gradient(ellipse at 82% 12%,rgba(0,0,0,.12),transparent 13%),radial-gradient(ellipse at 58% 34%,rgba(0,0,0,.06),transparent 20%);filter:blur(.6px)}
    .theme-ink .cm-panel:after{content:"";position:absolute;left:0;right:0;bottom:0;height:38%;pointer-events:none;z-index:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 320' preserveAspectRatio='none'%3E%3Cpath d='M0 238 C120 198 170 214 245 170 C328 122 396 198 470 150 C548 100 611 150 674 116 C770 64 850 154 927 112 C1046 48 1110 114 1200 78 L1200 320 L0 320 Z' fill='%232f6965' fill-opacity='.18'/%3E%3Cpath d='M0 268 C114 244 182 260 284 218 C389 176 444 226 546 186 C665 138 746 198 846 154 C1010 82 1082 178 1200 128 L1200 320 L0 320 Z' fill='%23171a17' fill-opacity='.17'/%3E%3Cpath d='M0 292 C150 278 258 282 390 252 C520 222 644 262 782 224 C952 178 1048 244 1200 194 L1200 320 L0 320 Z' fill='%23171a17' fill-opacity='.10'/%3E%3C/svg%3E");background-repeat:no-repeat;background-size:100% 100%;opacity:.9;mix-blend-mode:multiply}
    .theme-ink .cm-header,.theme-ink .cm-tabs{background:rgba(248,245,235,.34);backdrop-filter:blur(3px)}
    .theme-ink .cm-card,.theme-ink .cm-item,.theme-ink .cm-fold,.theme-ink .cm-modal,.theme-ink .cm-hero,.theme-ink .cm-private-row,.theme-ink .cm-power-row,.theme-ink .cm-shop-item,.theme-ink .cm-diff-btn,.theme-ink .cm-portrait-card{background:rgba(250,247,235,.58);border-color:rgba(23,26,23,.20);border-radius:6px;box-shadow:0 1px 0 rgba(255,255,255,.62) inset,0 12px 30px rgba(23,26,23,.10);backdrop-filter:blur(3px)}
    .theme-ink .cm-tabs button.active{background:linear-gradient(135deg,#a12f25,#7e231c);color:#fff8e8;box-shadow:0 8px 18px rgba(161,47,37,.26)}
    .theme-ink .cm-fold summary{border-left:4px solid var(--accent);background:linear-gradient(90deg,rgba(161,47,37,.08),transparent)}
    .theme-ink .cm-kicker{color:var(--accent);text-shadow:0 1px 0 rgba(255,255,255,.45)}
    .theme-ink .cm-mountain-icon{filter:drop-shadow(0 1px 0 rgba(255,255,255,.35))}
    @keyframes cm-content-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes cm-star-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.05)}}
    .cm-money-switch{display:inline-flex;margin:0 0 14px;padding:3px;border:1px solid var(--line);border-radius:999px;background:rgba(0,0,0,.045);box-shadow:inset 0 1px 3px rgba(0,0,0,.08)}.cm-money-switch button{min-width:72px;border:0;border-radius:999px;background:transparent;color:var(--muted);padding:7px 18px;cursor:pointer;letter-spacing:.12em}.cm-money-switch button.active{background:var(--accent);color:#fff;box-shadow:0 5px 14px var(--glow)}
    .cm-market-hero{position:relative;display:flex;justify-content:space-between;gap:20px;overflow:hidden;margin-bottom:14px;padding:20px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(125deg,color-mix(in srgb,var(--card) 92%,transparent),color-mix(in srgb,var(--accent) 12%,var(--card)));box-shadow:0 14px 30px rgba(0,0,0,.08)}.cm-market-hero:after{content:"市";position:absolute;right:26%;bottom:-35px;color:var(--accent);font-size:112px;font-weight:900;line-height:1;opacity:.055;transform:rotate(-8deg);pointer-events:none}.cm-market-hero h2{position:relative;margin:2px 0 7px;color:var(--ink);font-size:24px;letter-spacing:.12em}.cm-market-hero>div>p:last-child{position:relative;margin:0;color:var(--muted);line-height:1.7}.cm-market-wallet{position:relative;display:grid;min-width:190px;align-content:center;gap:6px;padding-left:16px;border-left:1px solid var(--line)}.cm-market-wallet span{display:flex;justify-content:space-between;gap:16px;color:var(--muted);font-size:13px}.cm-market-wallet b{color:var(--ink);font-size:15px}
    .cm-market-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px;padding:10px 12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.cm-market-toolbar>div{display:flex;flex-wrap:wrap;gap:8px}.cm-market-toolbar>div span{display:inline-flex;gap:7px;color:var(--muted);font-size:12px}.cm-market-toolbar>div b{color:var(--ink)}.cm-market-toolbar label{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;white-space:nowrap}.cm-market-toolbar select,.cm-market-buy-row input,.cm-exchange-row input{border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);padding:7px 9px;font:inherit;outline:none}.cm-market-toolbar select:focus,.cm-market-buy-row input:focus,.cm-exchange-row input:focus{border-color:var(--accent);box-shadow:0 0 0 2px var(--glow)}
    .cm-market-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cm-market-item{position:relative;display:flex;min-width:0;flex-direction:column;padding:13px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(145deg,var(--card),rgba(255,255,255,.025));box-shadow:0 7px 16px rgba(0,0,0,.045);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.cm-market-item:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--accent) 55%,var(--line));box-shadow:0 12px 24px rgba(0,0,0,.08)}.cm-market-item.sold-out{filter:saturate(.35);opacity:.66}.cm-market-item-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.cm-market-item-head small{color:var(--muted);font-size:10px;letter-spacing:.16em}.cm-market-item h4{margin:3px 0 0;color:var(--ink);font-size:17px}.cm-market-price{color:var(--accent);font-weight:700;text-align:right;white-space:nowrap}.cm-market-price small{display:block;margin-top:2px;color:var(--muted);font-weight:400;letter-spacing:0}.cm-market-item>p{min-height:43px;margin:9px 0;color:var(--muted);font-size:12px;line-height:1.7}.cm-market-stock-line{display:grid;grid-template-columns:1fr;gap:5px;color:var(--muted);font-size:11px}.cm-market-stock-line i{display:block;height:3px;overflow:hidden;border-radius:999px;background:var(--bar-track)}.cm-market-stock-line i:after{content:"";display:block;width:var(--stock);height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent2),var(--accent));transition:width .25s ease}.cm-market-buy-row{display:flex;align-items:end;gap:7px;margin-top:11px}.cm-market-buy-row label{display:grid;gap:3px;color:var(--muted);font-size:10px}.cm-market-buy-row input{width:78px;padding:6px 8px}.cm-market-buy-row>span{padding-bottom:7px;color:var(--muted);font-size:12px}.cm-market-buy{margin-left:auto;border:1px solid var(--accent);border-radius:9px;background:var(--accent);color:#fff;padding:7px 14px;cursor:pointer;box-shadow:0 5px 12px var(--glow)}.cm-market-buy:hover{filter:brightness(1.08)}.cm-market-buy:disabled{cursor:not-allowed;box-shadow:none;opacity:.55}
    .cm-exchange-board{margin-top:14px;padding:16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--card) 94%,transparent),color-mix(in srgb,var(--accent2) 10%,var(--card)));box-shadow:0 10px 24px rgba(0,0,0,.06)}.cm-exchange-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.cm-exchange-head h3{margin:2px 0;color:var(--ink);letter-spacing:.14em}.cm-exchange-head>span{border:1px solid var(--line);border-radius:999px;padding:4px 9px;color:var(--accent);font-size:11px}.cm-exchange-note{margin:6px 0 13px;color:var(--muted);font-size:12px;line-height:1.65}.cm-exchange-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.cm-exchange-row{display:grid;grid-template-columns:minmax(96px,1fr) auto auto;gap:6px;align-items:end;padding:10px;border:1px dashed var(--line);border-radius:11px}.cm-exchange-row label{display:grid;gap:4px;color:var(--muted);font-size:10px}.cm-exchange-row input{width:100%;min-width:0;padding:6px 8px}.cm-exchange-row button{height:32px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--accent);padding:0 9px;cursor:pointer;font-size:11px}.cm-exchange-row button:hover{border-color:var(--accent);background:var(--accent);color:#fff}
    @media(max-width:760px){.cm-market-hero{display:block;padding:15px}.cm-market-wallet{margin-top:12px;padding:10px 0 0;border-top:1px solid var(--line);border-left:0}.cm-market-toolbar{align-items:flex-start;flex-direction:column}.cm-market-grid,.cm-exchange-grid{grid-template-columns:1fr}.cm-exchange-row{grid-template-columns:1fr 1fr}.cm-exchange-row label{grid-column:1/-1}.cm-money-switch{display:flex}.cm-money-switch button{flex:1}.cm-market-item>p{min-height:0}}
    button{font:inherit;color:inherit}
    .cm-panel{position:relative;isolation:isolate;height:100%;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:22px;background:linear-gradient(135deg,var(--paper),var(--paper2));box-shadow:0 22px 70px var(--shadow);overflow:hidden;transition:background .5s ease,box-shadow .5s ease,border-color .5s ease}.cm-custom-background{position:absolute;inset:0;z-index:0;background-position:center;background-size:cover;background-repeat:no-repeat;pointer-events:none;filter:saturate(.9) contrast(1.03)}.cm-panel:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 78% 0%,var(--glow),transparent 32%),repeating-linear-gradient(90deg,rgba(80,45,20,.035),rgba(80,45,20,.035) 1px,transparent 1px,transparent 9px)}
    .cm-header{position:relative;z-index:1;display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 22px;border-bottom:1px solid var(--line)}.cm-kicker{margin:0 0 4px;color:var(--accent);font-size:12px;letter-spacing:.28em;white-space:nowrap}.cm-statusbar-version{color:var(--muted);font-weight:700;letter-spacing:.08em}.cm-header h1,.cm-hero h2,.cm-private-head h2{margin:0;font-weight:700}.cm-actions{display:flex;align-items:center;gap:8px}.cm-actions button{border:1px solid var(--line);border-radius:999px;background:var(--card);padding:7px 12px;cursor:pointer}.cm-icon-btn{padding:7px!important;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;color:var(--muted)}.cm-icon-btn:hover{color:var(--accent);border-color:var(--accent)}.cm-tools-wrap{position:relative;display:inline-flex}.cm-tools-dropdown{display:none;position:absolute;top:100%;right:0;margin-top:6px;flex-direction:column;gap:3px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px;box-shadow:0 10px 28px var(--shadow);z-index:100;min-width:max-content}.cm-header{z-index:2!important}.cm-tools-dropdown.open{display:flex}.cm-tools-item{display:flex;align-items:center;gap:8px;width:100%;padding:9px 14px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--ink);cursor:pointer;font-size:13px;white-space:nowrap;transition:all .15s}.cm-tools-item:hover{background:rgba(0,0,0,.06);border-color:var(--line)}
    .cm-shell{position:relative;z-index:1;display:grid;grid-template-columns:120px 1fr;min-height:0;flex:1}.cm-tabs{padding:14px 10px;border-right:1px solid var(--line);overflow:auto}.cm-tabs button{width:100%;margin:3px 0;padding:10px 12px;border:0;border-radius:12px;background:transparent;text-align:left;cursor:pointer;color:var(--muted)}.cm-tabs button:hover{background:rgba(0,0,0,.05);color:var(--ink)}.cm-tabs button.active{background:var(--accent);color:#fff;box-shadow:0 8px 18px var(--glow)}.cm-content{padding:18px;overflow:auto}.cm-grid{display:grid;gap:14px}.cm-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.cm-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.cm-card,.cm-item{border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:0 10px 22px rgba(0,0,0,.06)}.cm-card{padding:14px;margin-bottom:14px}.cm-card h3{margin:0 0 12px;color:var(--accent)}.cm-card h4{margin:14px 0 8px}.cm-item{padding:12px;margin:9px 0}.cm-item.private{border-color:rgba(190,105,105,.34);background:linear-gradient(135deg,var(--card),rgba(170,83,83,.12))}.cm-item-title{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.cm-item p,.cm-item small,.cm-empty,.cm-heart,.cm-line{color:var(--muted);line-height:1.7}.cm-empty{margin:0;text-align:center}.cm-empty:before{content:'';display:block;margin:12px auto;width:40px;height:1px;background:var(--line)}.cm-power-card{margin-bottom:12px}.cm-power-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.cm-power-head h3{margin:0}.cm-heart{border-left:3px solid var(--line);padding-left:10px}.cm-meta{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px dashed var(--line)}.cm-meta span{color:var(--muted)}.cm-tag,.cm-pill{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:12px;color:var(--muted);background:rgba(0,0,0,.06)}.cm-tag.safe{color:var(--accent2)}.cm-tag.war{color:#b7522e}.cm-tag.private{color:#b46a81}.cm-pill{margin:3px 4px 3px 0}.cm-hero,.cm-private-head{border:1px solid var(--line);border-radius:20px;padding:18px;margin-bottom:14px;background:linear-gradient(135deg,var(--card),transparent);display:flex;justify-content:space-between;gap:12px}.cm-place{color:var(--muted)}.cm-seal{width:72px;height:72px;border:2px solid var(--accent);border-radius:50%;display:grid;place-items:center;color:var(--accent);transform:rotate(-12deg);opacity:.74}.cm-bar-row{margin:8px 0}.cm-bar-head{display:flex;justify-content:space-between;font-size:13px;color:var(--muted)}.cm-bar{height:8px;border-radius:999px;background:var(--bar-track);overflow:hidden}.cm-bar i{display:block;height:100%;border-radius:inherit;background:var(--accent2)}.cm-bar i.high{background:var(--bar-high)}.cm-bar i.mid{background:var(--bar-mid)}.cm-bar i.low,.cm-bar i.danger{background:var(--bar-low)}.cm-mini-bars{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 12px}.cm-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.cm-compact-list{line-height:2}.cm-subgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cm-birth{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}.cm-fold{border:1px solid var(--line);border-radius:16px;background:var(--card);margin:0 0 12px;overflow:hidden;box-shadow:0 8px 18px rgba(0,0,0,.045)}.cm-fold summary{list-style:none;cursor:pointer;padding:14px 16px;color:var(--accent);font-weight:700;letter-spacing:.08em;display:flex;align-items:center;justify-content:space-between}.cm-fold summary::-webkit-details-marker{display:none}.cm-fold summary:after{content:'›';font-size:20px;font-weight:400;line-height:1;color:var(--muted);transition:transform .18s ease}.cm-fold[open] summary{border-bottom:1px solid var(--line);background:rgba(255,255,255,.08)}.cm-fold[open] summary:after{transform:rotate(90deg)}.cm-fold-body{padding:12px}.cm-row-list{display:flex;flex-direction:column;gap:8px}.cm-row-item{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:11px 12px}.cm-row-main{min-width:0}.cm-row-main b{display:block;color:var(--ink);margin-bottom:4px}.cm-row-main span{display:block;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cm-row-tags{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px}.cm-title-actions{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}.cm-mini-action{border:1px solid rgba(180,50,35,.45);border-radius:999px;background:transparent;color:rgba(180,50,35,.7);font-size:12px;padding:3px 10px;cursor:pointer;transition:all .15s}.cm-mini-action:hover{background:#b84835;color:#fff;border-color:#b84835}.cm-mini-portrait{border-color:rgba(110,80,140,.55);color:rgba(110,80,140,.75)}.cm-mini-portrait:hover{background:#7b5ea7;color:#fff;border-color:#7b5ea7}.cm-mini-clear{border-color:rgba(180,130,40,.55);color:rgba(180,130,40,.75)}.cm-mini-clear:hover{background:#b8903a;color:#fff;border-color:#b8903a}.cm-mini-settle{border-color:rgba(111,138,103,.55);color:rgba(111,138,103,.75)}.cm-mini-settle:hover{background:#6f8a67;color:#fff;border-color:#6f8a67}.cm-settle-snapshot{margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)}.cm-settle-snapshot p{margin:3px 0;font-size:12px;color:var(--muted);line-height:1.6}.cm-info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px;margin:8px 0}.cm-private-row{width:100%;display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center;padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card);text-align:left;cursor:pointer;transition:all .15s}.cm-private-row:hover{border-color:var(--accent);box-shadow:0 8px 18px rgba(0,0,0,.06)}.cm-private-avatar{width:44px;height:44px;border-radius:50%;overflow:hidden;border:2px solid var(--line);flex-shrink:0}.cm-private-avatar img{width:100%;height:100%;object-fit:cover;display:block}.cm-private-avatar-empty{background:var(--bar-track)}.cm-private-body{display:flex;flex-direction:column;gap:3px;min-width:0}.cm-private-name{font-weight:700;color:var(--ink)}.cm-private-tags{display:flex;gap:5px;flex-wrap:wrap}.cm-private-heart{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.cm-private-chevron{font-size:20px;color:var(--muted);line-height:1;transition:transform .15s}.cm-private-row:hover .cm-private-chevron{transform:translateX(3px);color:var(--accent)}.cm-power-row{width:100%;display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center;padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card);text-align:left;cursor:pointer;transition:all .15s}.cm-power-row:hover{border-color:var(--accent);box-shadow:0 8px 18px rgba(0,0,0,.06)}.cm-power-avatar{width:44px;height:44px;border-radius:10px;display:grid;place-items:center;background:var(--accent);color:#fff;font-weight:700;font-size:20px;flex-shrink:0;letter-spacing:.04em}.cm-power-body{display:flex;flex-direction:column;gap:3px;min-width:0}.cm-power-name{font-weight:700;color:var(--ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cm-power-tags{display:flex;gap:5px;flex-wrap:wrap}.cm-power-summary{color:var(--muted);font-size:12px}.cm-power-chevron{font-size:20px;color:var(--muted);line-height:1;transition:transform .15s}.cm-power-row:hover .cm-power-chevron{transform:translateX(3px);color:var(--accent)}.cm-modal-mask{position:absolute;inset:0;z-index:5;background:rgba(20,12,7,.45);display:grid;place-items:center;padding:18px}.cm-modal{width:min(620px,96%);max-height:86%;overflow:auto;border:1px solid var(--line);border-radius:20px;background:linear-gradient(135deg,var(--paper),var(--paper2));box-shadow:0 22px 70px var(--shadow)}.cm-modal-head{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid var(--line)}.cm-modal-head h2{margin:0}.cm-modal-head button{border:1px solid var(--line);border-radius:999px;background:var(--card);padding:5px 11px;cursor:pointer}.cm-modal-body{padding:16px}.cm-modal-body h3{color:var(--accent);margin:16px 0 8px}.cm-modal-power{width:min(680px,96%)} .cm-modal-power .cm-list{grid-template-columns:1fr}.cm-map-wrap{display:flex;flex-direction:column;gap:12px}.cm-map-mode-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px}.cm-map-mode-toggles{display:flex}.cm-map-mode-btn{border:1px solid var(--line);border-radius:0;background:var(--card);color:var(--muted);padding:5px 16px;cursor:pointer;font-size:13px;letter-spacing:.06em;transition:all .15s}.cm-map-mode-btn:first-child{border-radius:8px 0 0 8px}.cm-map-mode-btn:last-child{border-radius:0 8px 8px 0}.cm-map-mode-btn.active{background:var(--accent);color:#fff;border-color:var(--accent);box-shadow:0 4px 10px var(--glow)}#echarts-map-wrapper{position:relative;width:100%;height:0;padding-top:50%;border:1px solid var(--line);border-radius:14px;background:var(--paper2);overflow:hidden;overscroll-behavior:contain;touch-action:manipulation}#echarts-map{position:absolute;top:0;left:0;width:100%;height:100%}.cm-map-overlay{position:absolute;inset:0;display:none;pointer-events:none;z-index:5}.cm-map-overlay.active{display:flex;align-items:center;justify-content:center;padding:12px;pointer-events:auto}.cm-map-overlay-card{position:relative;width:min(420px,92%);max-height:70%;overflow-y:auto;border:1px solid var(--line);border-radius:14px;background:var(--card);box-shadow:0 0 40px var(--shadow);padding:16px;pointer-events:auto}.cm-map-overlay-close{position:absolute;top:10px;right:14px;border:0;background:none;cursor:pointer;color:var(--muted);font-size:20px;line-height:1}.cm-map-legend{display:flex;flex-wrap:wrap;gap:10px}.cm-map-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}.cm-map-legend-item i{width:18px;height:14px;border-radius:6px;border:1px solid var(--line)}.cm-map-detail-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.cm-map-detail-head h3{margin:0;color:var(--accent)}.cm-map-overlay-body{position:relative}.cm-map-powers{display:flex;flex-direction:column;gap:10px;margin-top:6px}.cm-map-power{padding:10px 0;border-bottom:1px dashed var(--line)}.cm-map-power:last-child{border-bottom:0}.cm-map-power .cm-bar{height:4px;margin:3px 0 6px}.cm-map-power .cm-line{margin:3px 0;font-size:13px;color:var(--muted)}.cm-map-power .cm-heart{margin:3px 0 0;font-size:13px;line-height:1.6}.cm-error{height:100%;display:grid;place-content:center;text-align:center;color:var(--muted)}.cm-diff-options{display:flex;flex-direction:column;gap:8px}.cm-diff-btn{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);cursor:pointer;text-align:left;transition:all .15s}.cm-diff-btn:hover{border-color:var(--accent);box-shadow:0 4px 12px rgba(0,0,0,.08)}.cm-diff-btn.active{border-color:var(--accent);background:rgba(164,61,45,.08);box-shadow:0 0 0 1px var(--accent)}.cm-diff-name{font-weight:700;color:var(--ink);font-size:15px;min-width:48px}.cm-diff-desc{flex:1;color:var(--muted);font-size:12px}.cm-diff-check{color:var(--accent);font-weight:700;font-size:16px}.cm-toast{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;padding:14px 28px;border-radius:14px;font-size:14px;font-weight:700;letter-spacing:.05em;pointer-events:none;animation:cm-toast-in .3s ease;border:1px solid var(--line);box-shadow:0 10px 36px var(--shadow)}.cm-toast.ok{background:var(--card);color:var(--accent2)}.cm-toast.ok::before{content:"✓ ";color:var(--accent2)}.cm-toast.err{background:var(--card);color:var(--bar-low)}.cm-toast.err::before{content:"✗ ";color:var(--bar-low)}@keyframes cm-toast-in{from{opacity:0;transform:translate(-50%,-50%) scale(.9)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
    .cm-modal-portrait{width:min(720px,96%)}.cm-portrait-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}.cm-portrait-card{border:1px solid var(--line);border-radius:16px;background:var(--card);padding:8px 8px 6px;cursor:pointer;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:6px;box-shadow:0 8px 18px rgba(0,0,0,.04)}.cm-portrait-card:hover{border-color:var(--accent);box-shadow:0 12px 28px var(--glow);transform:translateY(-3px)}.cm-portrait-img-wrap{width:100%;aspect-ratio:3/4;overflow:hidden;border-radius:10px;background:var(--bar-track)}.cm-portrait-img-wrap img{width:100%;height:100%;object-fit:cover;display:block}.cm-portrait-label{font-weight:700;color:var(--ink);font-size:14px;letter-spacing:.05em}.cm-portrait-detail h3{color:var(--accent);margin:0 0 14px;font-size:16px}.cm-portrait-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.cm-portrait-figure{margin:0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card);box-shadow:0 8px 18px rgba(0,0,0,.04)}.cm-portrait-figure img{width:100%;display:block}.cm-portrait-figure figcaption{padding:8px 12px;font-size:13px;color:var(--muted);text-align:center;letter-spacing:.08em;border-top:1px solid var(--line)}
    .cm-portrait-overlay{position:absolute;inset:0;z-index:6;background:rgba(18,12,8,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;animation:cm-fade-in .35s ease;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;touch-action:manipulation}.cm-portrait-overlay *{user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}.cm-portrait-frame{display:flex;flex-direction:column;align-items:center;max-width:95%;max-height:92vh;animation:cm-portrait-enter .4s ease}.cm-portrait-stage{display:flex;align-items:center;gap:8px}.cm-portrait-view{display:flex;flex-direction:column;align-items:center}.cm-portrait-view img{max-width:100%;max-height:76vh;object-fit:contain;border:3px solid rgba(180,130,100,.35);border-radius:2px;box-shadow:0 0 60px rgba(0,0,0,.6);background:var(--paper2);padding:4px}.cm-portrait-caption{display:flex;flex-direction:column;align-items:center;margin-top:6px}.cm-portrait-caption .cm-portrait-name{color:#e8d8c0;font-size:18px;font-weight:700;letter-spacing:.12em;text-shadow:0 0 12px rgba(0,0,0,.5)}.cm-portrait-caption .cm-portrait-cat{font-size:13px;color:rgba(200,180,155,.65);margin-top:2px;letter-spacing:.12em}.cm-portrait-arrow{background:none;border:1px solid rgba(180,150,120,.25);color:rgba(210,190,160,.55);font-size:24px;width:38px;height:38px;border-radius:50%;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .25s;user-select:none;-webkit-user-select:none;line-height:1;outline:none;touch-action:manipulation}.cm-portrait-arrow:focus{outline:none}.cm-portrait-arrow:hover{background:rgba(180,70,45,.35);color:#e8d8c0;border-color:rgba(200,120,80,.5)}.cm-portrait-dots{display:flex;gap:10px;margin-top:10px}.cm-portrait-dot{width:6px;height:6px;border-radius:50%;background:rgba(180,150,120,.3);transition:all .25s}.cm-portrait-dot.active{background:rgba(210,170,120,.8);box-shadow:0 0 8px rgba(200,150,100,.5)}.cm-portrait-hint{position:absolute;bottom:14px;left:0;right:0;text-align:center;color:rgba(180,160,140,.4);font-size:12px;letter-spacing:2px}@keyframes cm-fade-in{from{opacity:0}to{opacity:1}}@keyframes cm-portrait-enter{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}.cm-shop-keeper{border-left:3px solid #b46a81;padding:6px 10px;margin-bottom:8px}.cm-shop-points{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border:1px solid var(--line);border-radius:999px;font-size:14px}.cm-shop-coin{font-size:18px;color:#b46a81}.cm-shop-grid{display:flex;flex-direction:column;gap:10px}.cm-shop-item{display:flex;align-items:flex-start;gap:10px;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:12px}.cm-shop-item-body{flex:1;min-width:0}.cm-shop-price{display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(180,106,129,.12);color:#b46a81;font-size:12px;font-weight:700}.cm-shop-buy.disabled{opacity:.35;pointer-events:none}.cm-shop-desc{font-size:13px;line-height:1.8;color:var(--muted)}.cm-setting-desc{font-size:13px;color:var(--muted);margin:0 0 12px;line-height:1.6}.cm-background-input{width:100%;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);padding:10px 12px;font:inherit;outline:none}.cm-background-input:focus{border-color:var(--accent);box-shadow:0 0 0 2px var(--glow)}.cm-background-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.cm-background-actions .cm-diff-btn{width:auto;justify-content:center}.cm-modal-character-studio{width:min(940px,97%);background:linear-gradient(145deg,var(--paper),var(--paper2))}.cm-studio{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:460px}.cm-studio-sidebar{padding:14px 10px;border-right:1px solid var(--line);background:rgba(0,0,0,.035)}.cm-studio-sidebar-head{display:flex;justify-content:space-between;align-items:center;padding:0 4px 10px;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.12em}.cm-studio-sidebar-head small{color:var(--muted);font-size:11px;font-weight:400;letter-spacing:0}.cm-studio-search{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);padding:8px 9px;margin:0 0 9px;font:inherit;font-size:12px;outline:none}.cm-studio-search:focus{border-color:var(--accent);box-shadow:0 0 0 2px var(--glow)}.cm-studio-character-list{display:flex;flex-direction:column;gap:4px;max-height:344px;overflow-y:auto;overscroll-behavior:contain;padding:4px;border:1px solid var(--line);border-radius:11px;background:rgba(0,0,0,.025)}.cm-studio-search-empty{margin:9px 4px;color:var(--muted);font-size:12px;text-align:center}.cm-studio-character{border:0;border-left:2px solid transparent;border-radius:9px;background:transparent;color:var(--muted);padding:9px 10px;text-align:left;cursor:pointer}.cm-studio-character b,.cm-studio-character span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cm-studio-character b{color:var(--ink);font-size:14px}.cm-studio-character span{font-size:11px;margin-top:3px}.cm-studio-character:hover,.cm-studio-character.active{background:rgba(164,61,45,.09);border-left-color:var(--accent)}.cm-studio-list-empty{color:var(--muted);font-size:12px;padding:8px}.cm-studio-main{min-width:0;display:flex;flex-direction:column}.cm-studio-tabs{display:flex;align-items:center;gap:4px;padding:10px 14px;border-bottom:1px solid var(--line)}.cm-studio-tabs>button{border:0;border-radius:8px;background:transparent;color:var(--muted);padding:7px 10px;font:inherit;font-size:13px;cursor:pointer}.cm-studio-tabs>button.active{background:var(--accent);color:#fff}.cm-studio-tabs>button:disabled{opacity:.35;cursor:not-allowed}.cm-studio-actions{margin-left:auto;display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.cm-studio-content{padding:16px;overflow:auto}.cm-studio-note,.cm-studio-field-help{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.cm-studio-note{padding:9px 11px;border-left:3px solid var(--accent2);background:rgba(0,0,0,.035)}.cm-studio-empty{padding:20px;color:var(--muted);text-align:center}.theme-ink .cm-modal-character-studio{background:linear-gradient(145deg,#f5f0e4,#ddd4c2)}@media(max-width:620px){.cm-studio{grid-template-columns:1fr!important}.cm-studio-sidebar{border-right:0!important;border-bottom:1px solid var(--line);padding:10px!important;min-width:0!important;overflow:hidden!important;max-width:100%!important}.cm-studio-character-list{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important}.cm-studio-character{min-width:120px!important;flex-shrink:0!important}.cm-studio-tabs{flex-wrap:wrap}.cm-studio-actions{margin-left:0;width:100%;justify-content:flex-start}}.cm-modal-character-manager{width:min(780px,96%);background:linear-gradient(145deg,var(--paper),var(--paper2))}.cm-character-linked{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 10px}.cm-character-linked-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid color-mix(in srgb,var(--accent) 42%,var(--line));border-radius:999px;padding:5px 8px 5px 10px;background:rgba(164,61,45,.08);color:var(--ink);font:inherit;font-size:12px;cursor:pointer}.cm-character-linked-chip:hover{border-color:var(--accent);color:var(--accent)}.cm-character-linked-chip i{font-style:normal;font-size:16px;line-height:10px;color:var(--muted)}.cm-character-linked-empty{color:var(--muted);font-size:13px;padding:5px 0}.cm-character-picker-toggle{width:100%;display:flex;justify-content:space-between;align-items:center;border:1px dashed var(--line);border-radius:10px;background:transparent;color:var(--accent);padding:9px 11px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.cm-character-picker-toggle:hover,.cm-character-picker-toggle.open{border-color:var(--accent);background:rgba(164,61,45,.06)}.cm-character-picker-toggle span{font-size:12px;font-weight:400;color:var(--muted)}.cm-character-picker{margin-top:10px;border-top:1px solid var(--line);padding-top:10px}.cm-character-picker-results{max-height:278px;overflow:auto;margin-top:8px;padding-right:4px}.cm-character-picker-empty,.cm-character-picker-more{margin:8px 2px;color:var(--muted);font-size:12px;text-align:center}.cm-character-picker-more{border-top:1px dashed var(--line);padding-top:9px}.cm-character-toolbar-actions{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.cm-character-toolbar{display:flex;align-items:end;gap:8px;padding:10px 12px;margin-bottom:16px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(90deg,rgba(0,0,0,.035),transparent)}.cm-character-worldbook{border:1px solid var(--line);border-radius:14px;padding:12px;background:rgba(255,255,255,.1)}.cm-character-worldbook-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:8px;color:var(--accent);font-weight:700;font-size:13px}.cm-character-worldbook-head small{color:var(--muted);font-weight:400}.cm-character-worldbook-row{display:flex!important;grid-template-columns:none!important;align-items:flex-start;gap:9px;padding:9px 4px;border-top:1px dashed var(--line);color:var(--ink)!important;font-weight:400!important}.cm-character-worldbook-row input{margin-top:4px}.cm-character-worldbook-row span{display:grid;gap:2px}.cm-character-worldbook-row small{color:var(--muted);font-size:12px;line-height:1.45}.cm-character-status{padding:9px 12px;border-left:3px solid var(--accent2);background:rgba(0,0,0,.035);color:var(--muted);font-size:13px}.theme-ink .cm-modal-character-manager{background:linear-gradient(145deg,#f5f0e4,#ddd4c2)}.cm-modal-portrait-manager{width:min(780px,96%);background:linear-gradient(145deg,var(--paper),var(--paper2));backdrop-filter:none}.theme-ink .cm-modal-portrait-manager{background:linear-gradient(145deg,#f5f0e4,#ddd4c2);box-shadow:0 24px 70px rgba(23,26,23,.42)}.cm-portrait-toolbar{display:flex;align-items:end;gap:8px;padding:10px 12px;margin-bottom:16px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(90deg,rgba(0,0,0,.035),transparent)}.cm-portrait-select{display:grid!important;gap:4px!important;flex:1;color:var(--muted)!important;font-size:11px!important;letter-spacing:.12em}.cm-portrait-select select{width:100%;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);padding:5px 0;font:inherit;font-size:15px;outline:none}.cm-portrait-toolbar-btn{height:34px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--muted);padding:0 10px;cursor:pointer}.cm-portrait-toolbar-btn:hover{border-color:var(--accent);color:var(--accent)}.cm-portrait-toolbar-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.cm-portrait-toolbar-btn.icon{width:34px;padding:0}.cm-portrait-toolbar-btn:disabled{opacity:.35;cursor:not-allowed}.cm-portrait-manager-list{display:none}.cm-portrait-form{display:grid;gap:12px}.cm-portrait-form label{display:grid;gap:6px;color:var(--accent);font-weight:700;font-size:13px}.cm-portrait-textarea{min-height:92px;resize:vertical;line-height:1.55}.cm-portrait-enabled{display:block!important;color:var(--muted)!important;font-weight:400!important}.cm-portrait-enabled input{margin-right:7px}.cm-portrait-category-editor{border:1px solid var(--line);border-radius:14px;padding:12px;background:rgba(255,255,255,.12)}.cm-portrait-category-head{display:grid;grid-template-columns:minmax(110px,.45fr) minmax(0,1fr) 32px;gap:8px;margin:0 0 8px;color:var(--accent);font-size:12px;letter-spacing:.08em}.cm-portrait-category-row{display:grid;grid-template-columns:minmax(110px,.45fr) minmax(0,1fr) 32px;gap:8px;align-items:center;margin:8px 0}.cm-portrait-row-remove{width:32px;height:32px;border:1px solid var(--line);border-radius:50%;background:transparent;color:var(--muted);font-size:19px;line-height:1;cursor:pointer}.cm-portrait-row-remove:hover{border-color:#b84835;background:#b84835;color:#fff}.cm-portrait-add-row{margin-top:6px;border:0;background:transparent;color:var(--accent);font:inherit;font-weight:700;cursor:pointer;padding:6px 0}.cm-portrait-add-row span{font-size:18px;vertical-align:-1px}.theme-ink .cm-portrait-category-editor{background:rgba(255,255,255,.48)}@media(max-width:620px){.cm-portrait-category-head{display:none}.cm-portrait-category-row{grid-template-columns:1fr 1fr 32px}}
    .cm-tools-dropdown [data-action="workshop"]{display:none!important}.cm-header>div:first-child{min-width:0}.cm-actions{flex-wrap:nowrap;white-space:nowrap}.cm-workshop-cloud{position:relative;color:var(--accent)!important}.cm-workshop-cloud i{position:absolute;right:-5px;top:-5px;display:grid;place-items:center;min-width:16px;height:16px;padding:0 4px;border:2px solid var(--paper);border-radius:999px;background:#d9463e;color:#fff;font:normal 9px/1 sans-serif}.cm-workshop-cloud i[hidden]{display:none!important}.cm-scenario-entry{display:inline-flex!important;align-items:center;gap:6px!important;border-color:color-mix(in srgb,var(--accent) 60%,var(--line))!important;background:color-mix(in srgb,var(--accent) 10%,var(--card))!important;color:var(--accent)!important;font-weight:700;letter-spacing:.04em}.cm-scenario-entry:hover{background:var(--accent)!important;color:#fff!important;border-color:var(--accent)!important}.cm-scenario-entry svg{width:16px;height:16px}@media(max-width:768px){.cm-header{padding:11px 12px!important;gap:8px!important}.cm-header h1{max-width:34vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:19px}.cm-kicker{font-size:9px!important;letter-spacing:.13em!important}.cm-actions{gap:5px!important}.cm-icon-btn{width:30px!important;height:30px!important;padding:6px!important}.cm-scenario-entry{width:30px;height:30px;padding:6px!important;justify-content:center}.cm-scenario-entry span{display:none}.cm-tools-dropdown{right:0!important;left:auto!important}.cm-tabs{gap:5px!important;padding:8px!important}.cm-tabs button{padding:8px 10px!important}.cm-content{padding:10px!important}}
    .cm-content{animation:cm-content-in .3s ease}
    .cm-card,.cm-item,.cm-fold,.cm-private-row,.cm-power-row,.cm-diff-btn,.cm-portrait-card{transition:transform .2s ease,box-shadow .2s ease}
    .cm-card:hover,.cm-item:hover,.cm-fold:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(0,0,0,.1)}
    .cm-private-row:hover,.cm-power-row:hover{transform:translateY(-1px)}
    .cm-diff-btn:hover{transform:translateY(-1px)}
    .theme-star .cm-panel:after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;border-radius:22px;animation:cm-star-pulse 8s ease-in-out infinite alternate}@media (max-width:768px){.cm-panel{border-radius:16px}.cm-header{padding:14px;align-items:center}.cm-tools-dropdown{right:auto;left:0}.cm-refresh-time{display:none}.cm-shell{grid-template-columns:1fr;grid-template-rows:auto 1fr}.cm-tabs{display:flex;gap:8px;overflow-x:auto;border-right:0;border-bottom:1px solid var(--line);padding:10px}.cm-tabs button{width:auto;white-space:nowrap}.cm-content{padding:12px}.cm-grid.two,.cm-grid.three{grid-template-columns:1fr}.cm-list{grid-template-columns:1fr}.cm-mini-bars,.cm-subgrid{grid-template-columns:1fr}.cm-row-item{grid-template-columns:1fr}.cm-row-tags{justify-content:flex-start}.cm-info-grid{grid-template-columns:1fr}.cm-private-row{grid-template-columns:34px 1fr auto;gap:8px;padding:8px 10px}.cm-power-row{grid-template-columns:34px 1fr auto;gap:8px;padding:8px 10px}.cm-power-avatar{width:34px;height:34px;font-size:16px}.cm-private-avatar{width:34px;height:34px}.cm-hero{display:block}.cm-seal{display:none}.cm-portrait-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}.cm-portrait-detail-grid{grid-template-columns:1fr}}.is-mobile .cm-panel{border-radius:16px}.is-mobile .cm-header{padding:14px;align-items:center}.is-mobile .cm-tools-dropdown{right:auto;left:0}.is-mobile .cm-refresh-time{display:none}.is-mobile .cm-shell{grid-template-columns:1fr;grid-template-rows:auto 1fr}.is-mobile .cm-tabs{display:flex;gap:8px;overflow-x:auto;border-right:0;border-bottom:1px solid var(--line);padding:10px}.is-mobile .cm-tabs button{width:auto;white-space:nowrap}.is-mobile .cm-content{padding:12px}.is-mobile .cm-grid.two,.is-mobile .cm-grid.three{grid-template-columns:1fr}.is-mobile .cm-list{grid-template-columns:1fr}.is-mobile .cm-mini-bars,.is-mobile .cm-subgrid{grid-template-columns:1fr}.is-mobile .cm-row-item{grid-template-columns:1fr}.is-mobile .cm-row-tags{justify-content:flex-start}.is-mobile .cm-info-grid{grid-template-columns:1fr}.is-mobile .cm-private-row{grid-template-columns:34px 1fr auto;gap:8px;padding:8px 10px}.is-mobile .cm-private-avatar{width:34px;height:34px}.is-mobile .cm-hero{display:block}.is-mobile .cm-seal{display:none}.is-mobile .cm-portrait-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}.is-mobile .cm-portrait-detail-grid{grid-template-columns:1fr}.is-mobile .cm-modal-character-studio,.is-mobile .cm-modal-character-manager,.is-mobile .cm-modal-portrait-manager{width:100%;max-height:96vh;border-radius:14px}.is-mobile .cm-studio{min-height:0}.is-mobile .cm-studio-content{padding:10px}.is-mobile .cm-studio-tabs>button{font-size:12px;padding:5px 8px}.is-mobile .cm-character-toolbar,.is-mobile .cm-portrait-toolbar{flex-wrap:wrap;gap:6px;align-items:center}.is-mobile .cm-character-toolbar .cm-portrait-select,.is-mobile .cm-portrait-toolbar .cm-portrait-select{min-width:100%;flex-basis:100%}.is-mobile .cm-character-toolbar-actions{width:100%;margin-top:4px}.is-mobile .cm-character-worldbook-row{flex-wrap:wrap;gap:6px}.is-mobile .cm-character-picker-results{max-height:200px}.is-mobile .cm-portrait-toolbar-btn{font-size:12px;padding:0 8px;height:30px}.is-mobile .cm-portrait-form label{font-size:12px}.is-mobile .cm-portrait-category-editor{padding:8px}.is-mobile .cm-background-input{padding:8px 10px;font-size:13px}.is-mobile .cm-studio-sidebar{padding:10px!important;min-width:0!important;overflow:hidden!important;max-width:100%!important}.is-mobile .cm-studio-character-list{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important;gap:4px}.is-mobile .cm-studio-character{min-width:110px!important;flex-shrink:0!important}.is-mobile .cm-studio-tabs{flex-wrap:wrap}.is-mobile .cm-studio-actions{margin-left:0;width:100%;justify-content:flex-start}@media(max-width:620px){.cm-modal-character-studio,.cm-modal-character-manager,.cm-modal-portrait-manager{width:100%;max-height:96vh;border-radius:14px}.cm-studio{min-height:0}.cm-studio-content{padding:10px}.cm-studio-tabs>button{font-size:12px;padding:5px 8px}.cm-character-toolbar,.cm-portrait-toolbar{flex-wrap:wrap;gap:6px;align-items:center}.cm-character-toolbar .cm-portrait-select,.cm-portrait-toolbar .cm-portrait-select{min-width:100%;flex-basis:100%}.cm-character-toolbar-actions{width:100%;margin-top:4px}.cm-character-worldbook-row{flex-wrap:wrap;gap:6px}.cm-character-picker-results{max-height:200px}.cm-portrait-toolbar-btn{font-size:12px;padding:0 8px;height:30px}.cm-portrait-form label{font-size:12px}.cm-portrait-category-editor{padding:8px}.cm-background-input{padding:8px 10px;font-size:13px}}
  `;
}

function writeFrameDocument() {
  frameDocument.open();
  frameDocument.write(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${styleText()}</style></head><body></body></html>`,
  );
  frameDocument.close();
}

/** 动态加载 iframe 中的 CDN 脚本 */
function loadIframeScripts() {
  const win = frame.contentWindow;
  if (!win) return;
  // 避免重复加载
  if (win._canmingScriptsLoaded) return;
  win._canmingScriptsLoaded = true;

  const doc = frameDocument;
  const script1 = doc.createElement('script');
  script1.src = 'https://testingcf.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
  doc.head.appendChild(script1);

  script1.onload = () => {
    const script2 = doc.createElement('script');
    script2.src = 'https://testingcf.jsdelivr.net/gh/GooYi-C/History@main/world_1629.js';
    script2.onload = () => {
      echartsReady = true;
      // 如果已在地图标签页，初始化
      if (isOpen && activeTab === 'map') {
        initEChartsMap();
      }
    };
    doc.head.appendChild(script2);
  };
  script1.onerror = () => {
    win._canmingScriptsLoaded = false;
  };
}

function saveFoldState() {
  savedFoldState = new Set();
  try {
    const allDetails = frameDocument.querySelectorAll('.cm-fold[data-fold-key]');
    allDetails.forEach(d => {
      if (d.open) savedFoldState.add(d.getAttribute('data-fold-key'));
    });
  } catch {
    /* ignore */
  }
}

function renderModalOnly() {
  if (!frameDocument) return;
  const previous = frameDocument.querySelector('.cm-modal-mask, .cm-portrait-overlay');
  const previousDialog = previous?.querySelector('.cm-modal');
  const scrollTop = previousDialog?.scrollTop || 0;
  const markup = renderModal();
  if (previous) {
    if (markup) previous.outerHTML = markup;
    else previous.remove();
  } else if (markup) {
    frameDocument.querySelector('.cm-panel')?.insertAdjacentHTML('beforeend', markup);
  }
  const nextDialog = frameDocument.querySelector('.cm-modal-mask .cm-modal');
  if (nextDialog) nextDialog.scrollTop = scrollTop;
}
function render() {
  if (!frameDocument) return;
  if (isOpen) {
    // 保存当前地图视口状态（body.innerHTML 会销毁 ECharts DOM）
    if (echartsInstance) {
      try {
        const opt = echartsInstance.getOption();
        if (opt && opt.series && opt.series[0]) {
          echartsGeoState = { center: opt.series[0].center, zoom: opt.series[0].zoom };
        }
      } catch {
        /* ignore */
      }
    }
    if (echartsGraphInstance) {
      try {
        echartsGraphInstance.dispose();
        echartsGraphInstance = null;
      } catch {
        /* ignore */
      }
    }
    // 保存折叠状态与标签栏滚动位置
    saveFoldState();
    const tabsEl = frameDocument.querySelector('.cm-tabs');
    if (tabsEl) {
      savedTabsScrollLeft = tabsEl.scrollLeft;
      savedTabsScrollTop = tabsEl.scrollTop;
    }

    const contentEl = frameDocument.querySelector('.cm-content');
    if (contentEl) {
      savedContentScroll[renderedTab] = { left: contentEl.scrollLeft, top: contentEl.scrollTop };
    }

    // 开局生成器与状态栏共用 iframe。后台刷新状态栏时保留生成器节点，
    // 避免 body.innerHTML 将正在编辑的生成器直接销毁。
    const scenarioGeneratorRoot = frameDocument.getElementById('canming-scenario-generator-root');
    scenarioGeneratorRoot?.remove();
    frameDocument.body.innerHTML = `<div class="cm-root theme-${theme}">${renderPanel()}</div>`;
    if (scenarioGeneratorRoot) frameDocument.body.appendChild(scenarioGeneratorRoot);

    // 移动端直接注入样式（不依赖媒体查询，确保在 iframe 内生效）
    let mobileStyle = frameDocument.getElementById('cm-mobile-style');
    if (isMobile()) {
      if (!mobileStyle) {
        mobileStyle = frameDocument.createElement('style');
        mobileStyle.id = 'cm-mobile-style';
        frameDocument.head.appendChild(mobileStyle);
      }
      mobileStyle.textContent = `.cm-panel{border-radius:16px}.cm-header{padding:14px;align-items:center}.cm-tools-dropdown{right:auto;left:0}.cm-refresh-time{display:none}.cm-shell{grid-template-columns:1fr;grid-template-rows:auto 1fr}.cm-tabs{display:flex;gap:8px;overflow-x:auto;border-right:0;border-bottom:1px solid var(--line);padding:10px}.cm-tabs button{width:auto;white-space:nowrap}.cm-content{padding:12px}.cm-grid.two,.cm-grid.three{grid-template-columns:1fr}.cm-list{grid-template-columns:1fr}.cm-mini-bars,.cm-subgrid{grid-template-columns:1fr}.cm-row-item{grid-template-columns:1fr}.cm-row-tags{justify-content:flex-start}.cm-info-grid{grid-template-columns:1fr}.cm-private-row{grid-template-columns:34px 1fr auto;gap:8px;padding:8px 10px}.cm-power-row{grid-template-columns:34px 1fr auto;gap:8px;padding:8px 10px}.cm-power-avatar{width:34px;height:34px;font-size:16px}.cm-private-avatar{width:34px;height:34px}.cm-hero{display:block}.cm-seal{display:none}.cm-portrait-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}.cm-portrait-detail-grid{grid-template-columns:1fr}.cm-map-mode-bar{flex-wrap:wrap}.cm-map-mode-toggles{margin-bottom:4px}.cm-graph-stage{grid-template-columns:1fr}.cm-graph-detail{min-height:auto;border-radius:14px;padding:12px}.cm-graph-detail-card h3{font-size:18px}#echarts-graph-wrapper{min-height:380px;border-radius:14px}.cm-graph-toolbar{border-radius:12px;padding:10px;gap:8px}.cm-graph-search{min-width:0;gap:0}.cm-graph-search span{display:none}.cm-graph-search input{padding:10px 12px;font-size:16px}.cm-graph-toolbar .cm-mini-action{flex-shrink:0;padding:9px 14px;font-size:14px}.cm-graph-legend{gap:8px}.cm-graph-legend-item{font-size:13px;gap:8px}.cm-graph-legend-item i{width:20px;height:16px}.cm-graph-relation{padding:10px 12px}.cm-graph-relation b{font-size:15px}.cm-modal-character-studio,.cm-modal-character-manager,.cm-modal-portrait-manager{width:100%;max-height:96vh;border-radius:14px}.cm-studio{min-height:0}.cm-studio-content{padding:10px}.cm-studio-tabs>button{font-size:12px;padding:5px 8px}.cm-character-toolbar,.cm-portrait-toolbar{flex-wrap:wrap;gap:6px;align-items:center}.cm-character-toolbar .cm-portrait-select,.cm-portrait-toolbar .cm-portrait-select{min-width:100%;flex-basis:100%}.cm-character-toolbar-actions{width:100%;margin-top:4px}.cm-character-worldbook-row{flex-wrap:wrap;gap:6px}.cm-character-picker-results{max-height:200px}.cm-portrait-toolbar-btn{font-size:12px;padding:0 8px;height:30px}.cm-portrait-form label{font-size:12px}.cm-portrait-category-editor{padding:8px}.cm-background-input{padding:8px 10px;font-size:13px}.cm-studio-sidebar{padding:10px!important;min-width:0!important;overflow:hidden!important;max-width:100%!important}.cm-studio-character-list{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important;gap:4px}.cm-studio-character{min-width:110px!important;flex-shrink:0!important}.cm-studio-tabs{flex-wrap:wrap}.cm-studio-actions{margin-left:0;width:100%;justify-content:flex-start}`;
      // 移动端地图加高（内联样式更高优先级）
      const mapWrap = frameDocument.getElementById('echarts-map-wrapper');
      if (mapWrap) mapWrap.style.paddingTop = '80%';
    } else if (mobileStyle) {
      mobileStyle.remove();
    }

    // 注入图谱 CSS（不混入 styleText 主串，便于维护）
    let graphStyle = frameDocument.getElementById('cm-graph-style');
    if (!graphStyle) {
      graphStyle = frameDocument.createElement('style');
      graphStyle.id = 'cm-graph-style';
      frameDocument.head.appendChild(graphStyle);
    }
    graphStyle.textContent = `
      .cm-graph-wrap{display:flex;flex-direction:column;gap:12px;animation:cm-graph-rise .36s ease both}
      .cm-graph-toolbar{display:flex;align-items:center;gap:10px;justify-content:space-between;border:1px solid var(--line);border-radius:14px;background:linear-gradient(135deg,var(--card),rgba(255,255,255,.04));padding:10px 12px;box-shadow:0 8px 22px rgba(0,0,0,.04)}
      .cm-graph-search{flex:1;display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px;letter-spacing:.12em}
      .cm-graph-search input{flex:1;min-width:0;border:1px solid var(--line);border-radius:999px;background:rgba(0,0,0,.04);color:var(--ink);padding:8px 13px;outline:none;font:inherit;letter-spacing:0}
      .cm-graph-search input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--glow);background:var(--card)}
      .cm-graph-legend{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:4px;animation:cm-graph-rise .42s ease both .04s}
      .cm-graph-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
      .cm-graph-legend-item i{width:18px;height:14px;border-radius:6px;border:1px solid var(--line)}
      .cm-graph-stage{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;align-items:stretch}
      #echarts-graph-wrapper{position:relative;width:100%;min-height:520px;border:1px solid var(--line);border-radius:18px;background:radial-gradient(circle at 50% 50%,rgba(212,160,64,.10),transparent 36%),linear-gradient(135deg,var(--paper2),var(--paper));overflow:hidden;box-shadow:inset 0 0 42px rgba(0,0,0,.08)}
      #echarts-graph-wrapper:before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 20% 30%,rgba(23,26,23,.10),transparent 28%),radial-gradient(ellipse at 76% 72%,rgba(47,105,101,.10),transparent 30%)}
      #echarts-graph{position:absolute;top:0;left:0;width:100%;height:100%}
      .cm-graph-detail{min-height:520px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(160deg,var(--card),rgba(0,0,0,.025));padding:14px;box-shadow:0 14px 32px rgba(0,0,0,.08);animation:cm-graph-slide .34s ease both}
      .cm-graph-detail-card h3{margin:0 0 6px;color:var(--accent);font-size:22px;letter-spacing:.08em}
      .cm-graph-detail-cat{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px 10px;margin-bottom:10px;color:var(--muted);font-size:12px;background:rgba(0,0,0,.04)}
      .cm-graph-detail h4{margin:14px 0 8px;color:var(--accent);font-size:14px;letter-spacing:.12em}
      .cm-graph-relations{display:flex;flex-direction:column;gap:7px}
      .cm-graph-relation{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.03);padding:8px 10px;cursor:pointer;text-align:left;transition:all .18s ease}
      .cm-graph-relation:hover{border-color:var(--accent);transform:translateX(3px);box-shadow:0 6px 16px rgba(0,0,0,.08)}
      .cm-graph-relation b{color:var(--ink)}.cm-graph-relation span{color:var(--muted);font-size:12px}
      @keyframes cm-graph-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes cm-graph-slide{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
      @media (max-width:900px){.cm-graph-stage{grid-template-columns:1fr}.cm-graph-detail{min-height:auto}#echarts-graph-wrapper{min-height:460px}.cm-graph-toolbar{gap:8px;padding:8px}.cm-graph-search{min-width:0;gap:6px}.cm-graph-search span{display:none}.cm-graph-search input{padding:7px 10px;font-size:13px}.cm-graph-toolbar .cm-mini-action{flex-shrink:0;padding:7px 12px}}
    `;

    // 恢复标签栏滚动位置
    const newTabsEl = frameDocument.querySelector('.cm-tabs');
    if (newTabsEl) {
      if (savedTabsScrollLeft > 0) newTabsEl.scrollLeft = savedTabsScrollLeft;
      if (savedTabsScrollTop > 0) newTabsEl.scrollTop = savedTabsScrollTop;
    }

    const restoredContentEl = frameDocument.querySelector('.cm-content');
    const contentScroll = savedContentScroll[activeTab];
    if (restoredContentEl && contentScroll) {
      restoredContentEl.scrollLeft = contentScroll.left || 0;
      restoredContentEl.scrollTop = contentScroll.top || 0;
    }
    renderedTab = activeTab;

    if (activeTab === 'map') {
      // 延迟初始化 ECharts：等待 CDN 脚本加载完成
      tryInitEChartsMap();
    }
    if (activeTab === 'graph') {
      tryInitGraphChart();
    }
  }
}

/** 重试初始化 ECharts 地图（最多重试 15 次，每次间隔 200ms） */
let echartsRetryCount = 0;
function tryInitEChartsMap() {
  const win = frame.contentWindow;
  if (win?.echarts && win?.WORLD_1629) {
    echartsRetryCount = 0;
    initEChartsMap();
    return;
  }
  if (echartsRetryCount < 15) {
    echartsRetryCount++;
    setTimeout(tryInitEChartsMap, 200);
  }
}

/** 重试初始化人物谱系图 */
function tryInitGraphChart() {
  const win = frame.contentWindow;
  if (win?.echarts) {
    initGraphChart();
    return;
  }
  setTimeout(tryInitGraphChart, 200);
}

function bindFrameEvents() {
  const body = frameDocument.body;

  // 清除旧处理器（防止重复绑定）
  if (body._clickHandler) body.removeEventListener('click', body._clickHandler);
  if (body._keyHandler) body.removeEventListener('keydown', body._keyHandler);
  if (body._inputHandler) body.removeEventListener('input', body._inputHandler);
  if (body._changeHandler) body.removeEventListener('change', body._changeHandler);

  const clickHandler = event => {
    const target = event.target;

    // 人物谱系：执行搜索并居中命中人物
    if (target.closest('[data-action="graph-search"]')) {
      const input = frameDocument.getElementById('cm-graph-search-input');
      graphSearch = input?.value || graphSearch;
      applyGraphSearch();
      centerGraphMatches();
      return;
    }

    // 人物谱系：从详情侧栏选择关联人物
    const graphSelect = target.closest('[data-action="graph-select"]');
    if (graphSelect) {
      graphSelected = graphSelect.getAttribute('data-node-id') || '主角';
      const detail = frameDocument.getElementById('cm-graph-detail');
      if (detail) detail.innerHTML = renderGraphDetail();
      applyGraphSearch();
      centerGraphMatches([graphSelected]);
      return;
    }

    // 标签页切换
    const tab = target.closest('[data-tab]');
    if (tab) {
      activeTab = tab.getAttribute('data-tab') || 'overview';
      saveStorage('tab', activeTab);
      render();
      return;
    }

    // 工具下拉（万象生成器 + 变量修改器）
    if (target.closest('[data-action="tools"]')) {
      event.preventDefault();
      event.stopPropagation();
      const dd = frameDocument.querySelector('.cm-tools-dropdown');
      if (dd) dd.classList.toggle('open');
      return;
    }

    // 关闭面板
    if (target.closest('[data-action="close"]')) {
      isOpen = false;
      applyFrameLayout();
      render();
      return;
    }

    // 切换主题
    if (target.closest('[data-action="theme"]')) {
      theme = theme === 'day' ? 'night' : theme === 'night' ? 'star' : theme === 'star' ? 'ink' : 'day';
      saveStorage('theme', theme);
      // 同步全局 Toast / Dialog 的主题 class
      syncCanmingUiTheme();
      render();
      return;
    }

    // 打开云端创意工坊
    if (target.closest('[data-action="workshop"]')) {
      event.preventDefault();
      event.stopPropagation();
      openCanmingWorkshop();
      return;
    }

    // 打开万象生成器
    if (target.closest('[data-action="character-generator"]')) {
      event.preventDefault();
      event.stopPropagation();
      openCharacterGenerator();
      return;
    }

    // 打开身份 DLC 开局生成器
    if (target.closest('[data-action="scenario-generator"]')) {
      event.preventDefault();
      event.stopPropagation();
      openScenarioGenerator();
      return;
    }

    // 打开变量修改器
    if (target.closest('[data-action="variable-editor"]')) {
      event.preventDefault();
      event.stopPropagation();
      openVariableEditor();
      return;
    }

    // 打开角色管理器
    if (target.closest('[data-action="character-manager"]')) {
      openCharacterManager();
      return;
    }

    if (target.closest('[data-action="character-manager-new"]')) {
      openCharacterManager();
      return;
    }
    const studioSelect = target.closest('[data-action="studio-select"]');
    if (studioSelect) {
      openCharacterManager(studioSelect.getAttribute('data-character-id') || '', modalState.section || 'profile');
      return;
    }
    const studioSection = target.closest('[data-action="studio-section"]');
    if (studioSection) {
      modalState.section = studioSection.getAttribute('data-studio-section') || 'profile';
      renderModalOnly();
      return;
    }
    if (target.closest('[data-action="character-worldbook-picker"]')) {
      modalState.worldbookPickerOpen = !modalState.worldbookPickerOpen;
      updateCharacterWorldbookSection();
      return;
    }
    const worldbookRemove = target.closest('[data-action="character-worldbook-remove"]');
    if (worldbookRemove) {
      const name = worldbookRemove.getAttribute('data-worldbook-name') || '';
      modalState.selectedWorldbookEntries = (modalState.selectedWorldbookEntries || []).filter(item => item !== name);
      updateCharacterWorldbookSection();
      return;
    }
    const characterSave = target.closest('[data-action="character-manager-save"]');
    if (characterSave) {
      saveCharacterProfile(characterSave.getAttribute('data-character-id') || '');
      return;
    }

    const characterExport = target.closest('[data-action="character-manager-export"]');
    if (characterExport) {
      exportCharacterPackage(characterExport.getAttribute('data-character-id') || '');
      return;
    }
    if (target.closest('[data-action="character-manager-import"]')) {
      frameDocument.querySelector('[data-character-import]')?.click();
      return;
    }
    const characterRemove = target.closest('[data-action="character-manager-remove"]');
    if (characterRemove) {
      removeCharacterProfile(characterRemove.getAttribute('data-character-id') || '');
      return;
    }
    const portraitEdit = target.closest('[data-action="portrait-manager-edit"]');
    if (portraitEdit) {
      const profile = findCharacterProfileByName(portraitEdit.getAttribute('data-portrait-manager-name') || '');
      openCharacterManager(profile?.id || '', 'portraits');
      return;
    }
    if (target.closest('[data-action="portrait-category-add"]')) {
      const rows = frameDocument.querySelector('[data-portrait-rows]');
      rows?.insertAdjacentHTML('beforeend', portraitCategoryRow());
      return;
    }
    const portraitCategoryRemove = target.closest('[data-action="portrait-category-remove"]');
    if (portraitCategoryRemove) {
      portraitCategoryRemove.closest('[data-portrait-row]')?.remove();
      return;
    }
    // 打开设置（难度）
    if (target.closest('[data-action="settings"]')) {
      modalState = { type: 'settings' };
      syncWorldbookSettings();
      render();
      return;
    }

    const portraitSave = target.closest('[data-action="portrait-manager-save"]');
    if (portraitSave) {
      savePortraitEntry(portraitSave.getAttribute('data-portrait-manager-original') || '');
      return;
    }
    const portraitRemove = target.closest('[data-action="portrait-manager-remove"]');
    if (portraitRemove) {
      removePortraitEntry(portraitRemove.getAttribute('data-portrait-manager-name') || '');
      return;
    }

    // 保存/清除自定义背景
    if (target.closest('[data-action="save-background"]')) {
      const rawUrl = frameDocument.querySelector('[data-background-url]')?.value || '';
      const url = normalizeBackgroundUrl(rawUrl);
      if (rawUrl.trim() && !url) {
        showToast('✗ 请输入有效的 HTTP/HTTPS 图片地址', 'err');
        return;
      }
      customBackgroundUrl = url;
      saveStorage('background_url', customBackgroundUrl);
      modalState = null;
      showToast(customBackgroundUrl ? '✓ 自定义背景已保存' : '✓ 已恢复主题默认背景', 'ok');
      return;
    }
    if (target.closest('[data-action="clear-background"]')) {
      customBackgroundUrl = '';
      saveStorage('background_url', '');
      modalState = null;
      showToast('✓ 已恢复主题默认背景', 'ok');
      return;
    }

    // 切换难度
    const diffBtn = target.closest('[data-action="set-difficulty"]');
    if (diffBtn) {
      const difficulty = diffBtn.getAttribute('data-difficulty');
      if (difficulty && difficulty !== activeDifficulty) {
        setDifficulty(difficulty);
      }
      return;
    }

    // 地图模式切换
    const mapModeBtn = target.closest('[data-action="map-mode"]');
    if (mapModeBtn) {
      const mode = mapModeBtn.getAttribute('data-mode');
      if (mode && mode !== mapMode) {
        mapMode = mode;
        saveStorage('mapMode', mode);
        echartsInstance = null; // 强制重建
        render();
      }
      return;
    }

    // 查看角色立绘
    const portraitViewBtn = target.closest('[data-action="view-portrait"]');
    if (portraitViewBtn) {
      event.preventDefault();
      event.stopPropagation();
      const pName = portraitViewBtn.getAttribute('data-portrait-name') || '';
      if (getPortraitData()[pName]) {
        modalState = { type: 'portrait', name: pName };
        render();
      }
      return;
    }

    // 删除变量
    const removeBtn = target.closest('[data-action="remove-variable"]');
    if (removeBtn) {
      event.preventDefault();
      event.stopPropagation();
      removeVariable(removeBtn.getAttribute('data-path') || '');
      return;
    }

    const moneyViewBtn = target.closest('[data-money-view]');
    if (moneyViewBtn) {
      moneyView = moneyViewBtn.getAttribute('data-money-view') === 'market' ? 'market' : 'ledger';
      saveStorage('money_view', moneyView);
      render();
      return;
    }

    const marketBuyBtn = target.closest('[data-action="market-buy"]');
    if (marketBuyBtn) {
      event.preventDefault();
      event.stopPropagation();
      const itemCard = marketBuyBtn.closest('[data-market-item]');
      const quantity = Number(itemCard?.querySelector('[data-market-quantity]')?.value || 0);
      buyMarketItem(marketBuyBtn.getAttribute('data-item-id') || '', quantity, marketPaymentCurrency);
      return;
    }

    const marketExchangeBtn = target.closest('[data-action="market-exchange"]');
    if (marketExchangeBtn) {
      event.preventDefault();
      event.stopPropagation();
      const kind = marketExchangeBtn.getAttribute('data-exchange-kind') || '';
      const amountType = kind.includes('gold') ? 'gold' : 'silver';
      const amount = Number(frameDocument.querySelector(`[data-exchange-amount="${amountType}"]`)?.value || 0);
      exchangeMarketCurrency(kind, amount);
      return;
    }

    // 手动月度结算
    const manualSettleBtn = target.closest('[data-action="manual-settle"]');
    if (manualSettleBtn) {
      event.preventDefault();
      event.stopPropagation();
      manualSettle();
      return;
    }

    // 一键清空收支明细
    const clearMoney = target.closest('[data-action="clear-money"]');
    if (clearMoney) {
      event.preventDefault();
      event.stopPropagation();
      modalState = {
        type: 'confirm',
        title: '一键清空',
        message: '确定要清空所有收支明细吗？此操作不可撤销。',
        path: '__clear_money__',
      };
      render();
      return;
    }

    // 切换风月阁开关
    const toggleShop = target.closest('[data-action="toggle-shop"]');
    if (toggleShop) {
      event.preventDefault();
      event.stopPropagation();
      shopEnabled = !shopEnabled;
      saveStorage('shop_enabled', shopEnabled ? '1' : '0');
      if (!shopEnabled && activeTab === 'fengyue') activeTab = 'overview';
      render();
      return;
    }

    // 切换正文插图开关
    const toggleIllus = target.closest('[data-action="toggle-illustrations"]');
    if (toggleIllus) {
      event.preventDefault();
      event.stopPropagation();
      toggleIllustrations();
      return;
    }

    // 风月阁购买物品
    const buyBtn = target.closest('[data-action="shop-buy"]');
    if (buyBtn) {
      event.preventDefault();
      event.stopPropagation();
      buyShopItem(buyBtn.getAttribute('data-item-id') || '');
      return;
    }

    // 打开势力详情
    const powerRow = target.closest('[data-power-name]');
    if (powerRow) {
      event.preventDefault();
      modalState = { type: 'power', name: powerRow.getAttribute('data-power-name') || '' };
      render();
      return;
    }

    // 打开私帷详情
    const privateBtn = target.closest('[data-private-name]');
    if (privateBtn) {
      modalState = { type: 'private', name: privateBtn.getAttribute('data-private-name') || '' };
      render();
      return;
    }

    const portraitGalleryBtn = target.closest('[data-portrait-gallery]');
    if (portraitGalleryBtn) {
      portraitGalleryFilter = portraitGalleryBtn.getAttribute('data-portrait-gallery') || 'all';
      render();
      return;
    }

    // 打开人物志立绘浮层（仅弹出 overlay，不在页面内渲染大图）
    const portraitBtn = target.closest('[data-portrait-name]');
    if (portraitBtn) {
      const name = portraitBtn.getAttribute('data-portrait-name') || '';
      if (getAllPortraitData()[name]) {
        modalState = { type: 'portrait', name };
        render();
      }
      return;
    }

    // 确认弹窗——取消
    const confirmCancel = target.closest('[data-action="confirm-cancel"]');
    if (confirmCancel) {
      modalState = null;
      render();
      return;
    }

    // 确认弹窗——确认
    const confirmOk = target.closest('[data-action="confirm-ok"]');
    if (confirmOk) {
      const path = modalState?.path;
      modalState = null;
      if (path === '__clear_money__') {
        clearAllMoney();
        return;
      }
      if (path) execRemoveVariable(path);
      return;
    }

    // 立绘浮层——左右切换（局部更新 DOM，避免全量渲染导致图片闪烁）
    const portraitPrev = target.closest('[data-action="portrait-prev"]');
    if (portraitPrev) {
      event.preventDefault();
      event.stopPropagation();
      if (modalState && modalState.type === 'portrait') {
        const cats = getAllPortraitData()[modalState.name];
        const n = cats ? Object.keys(cats).length : 4;
        modalState.catIdx = ((modalState.catIdx ?? 0) - 1 + n) % n;
        updatePortraitOverlay();
      }
      return;
    }
    const portraitNext = target.closest('[data-action="portrait-next"]');
    if (portraitNext) {
      event.preventDefault();
      event.stopPropagation();
      if (modalState && modalState.type === 'portrait') {
        const cats = getAllPortraitData()[modalState.name];
        const n = cats ? Object.keys(cats).length : 4;
        modalState.catIdx = ((modalState.catIdx ?? 0) + 1) % n;
        updatePortraitOverlay();
      }
      return;
    }

    // 关闭弹窗（遮罩或×）
    const closeModal = target.closest('[data-action="close-modal"]');
    if (closeModal) {
      if (event.target !== closeModal && closeModal.classList.contains('cm-modal-mask')) return;
      modalState = null;
      portraitSelected = null;
      renderModalOnly();
      return;
    }

    // 关闭地图 overlay（直接更新 DOM，不销毁地图）
    if (target.closest('#btn-close-map-overlay')) {
      mapSelected = null;
      const overlay = frameDocument.getElementById('cm-map-overlay');
      if (overlay) {
        overlay.innerHTML = '';
        overlay.classList.remove('active');
      }
    }

    // 点击非工具下拉区域时关闭下拉
    if (!target.closest('[data-action="tools"]') && !target.closest('.cm-tools-dropdown')) {
      const dd = frameDocument.querySelector('.cm-tools-dropdown.open');
      if (dd) dd.classList.remove('open');
    }
  };

  const keyHandler = event => {
    if (event.key === 'Enter' && event.target?.id === 'cm-graph-search-input') {
      event.preventDefault();
      graphSearch = event.target.value || '';
      applyGraphSearch();
      centerGraphMatches();
      return;
    }
    if (event.key === 'Escape' && modalState) {
      modalState = null;
      portraitSelected = null;
      renderModalOnly();
    }
  };

  const inputHandler = event => {
    const target = event.target;
    if (target && target.id === 'cm-graph-search-input') {
      graphSearch = target.value || '';
      applyGraphSearch();
    }
    const studioSearch = target?.closest?.('[data-studio-search]');
    if (studioSearch && modalState?.type === 'character-studio') {
      const query = studioSearch.value.trim().toLocaleLowerCase();
      let matched = 0;
      frameDocument.querySelectorAll('[data-studio-search-text]').forEach(item => {
        const visible =
          !query ||
          String(item.dataset.studioSearchText || '')
            .toLocaleLowerCase()
            .includes(query);
        item.hidden = !visible;
        if (visible) matched++;
      });
      const empty = frameDocument.querySelector('.cm-studio-search-empty');
      if (empty) empty.hidden = matched > 0;
    }
    const worldbookSearch = target?.closest?.('[data-character-worldbook-search]');
    if (worldbookSearch && modalState?.type === 'character-studio') {
      modalState.worldbookQuery = worldbookSearch.value || '';
      const result = frameDocument.querySelector('[data-character-worldbook-results]');
      if (result)
        result.innerHTML = renderCharacterWorldbookOptions(
          modalState.worldbookEntries || [],
          new Set(modalState.selectedWorldbookEntries || []),
          modalState.worldbookQuery,
        );
    }
  };

  const changeHandler = async event => {
    const marketPayment = event.target.closest?.('[data-market-payment]');
    if (marketPayment) {
      marketPaymentCurrency = ['黄金', '白银', '铜钱'].includes(marketPayment.value) ? marketPayment.value : '白银';
      saveStorage('market_payment_currency', marketPaymentCurrency);
      render();
      return;
    }
    const characterSelect = event.target.closest?.('[data-character-select]');
    if (characterSelect) {
      openCharacterManager(characterSelect.value || '');
      return;
    }
    const worldbookCheckbox = event.target.closest?.('[data-character-worldbook]');
    if (worldbookCheckbox && modalState?.type === 'character-studio') {
      const selected = new Set(modalState.selectedWorldbookEntries || []);
      if (worldbookCheckbox.checked) selected.add(worldbookCheckbox.value);
      else selected.delete(worldbookCheckbox.value);
      modalState.selectedWorldbookEntries = [...selected];
      return;
    }
    const characterImport = event.target.closest?.('[data-character-import]');
    if (characterImport?.files?.[0]) {
      await importCharacterPackage(characterImport.files[0]);
      return;
    }

    const input = event.target.closest?.('[data-background-file]');
    const file = input?.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      showToast('✗ 仅支持 PNG、JPEG、WebP 或 GIF 图片', 'err');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('✗ 图片不能超过 2MB（本地存储空间有限）', 'err');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => showToast('✗ 读取图片失败，请重试', 'err');
    reader.onload = () => {
      const url = normalizeBackgroundUrl(reader.result);
      if (!url) {
        showToast('✗ 图片格式无效', 'err');
        return;
      }
      customBackgroundUrl = url;
      saveStorage('background_url', customBackgroundUrl);
      modalState = null;
      showToast('✓ 本地背景已保存', 'ok');
    };
    reader.readAsDataURL(file);
  };

  body._clickHandler = clickHandler;
  body._keyHandler = keyHandler;
  body._inputHandler = inputHandler;
  body._changeHandler = changeHandler;
  body.addEventListener('click', clickHandler);
  body.addEventListener('keydown', keyHandler);
  body.addEventListener('input', inputHandler);
  body.addEventListener('change', changeHandler);
}

function viewport() {
  const parent = window.parent || window;
  return { width: parent.innerWidth || 1280, height: parent.innerHeight || 720 };
}

function isMobile() {
  return viewport().width <= 768;
}

function applyLampLayout() {
  if (!lamp) return;
  const parentWindow = window.parent || window;
  const size = isMobile() ? 40 : 48;
  const saved = readJsonStorage('position', null);
  const left = saved?.left ?? parentWindow.innerWidth - size - 24;
  const top = saved?.top ?? Math.round((parentWindow.innerHeight - size) / 2);
  Object.assign(lamp.style, {
    width: `${size}px`,
    height: `${size}px`,
    left: `${clamp(left, 8, parentWindow.innerWidth - size - 8)}px`,
    top: `${clamp(top, 8, parentWindow.innerHeight - size - 8)}px`,
  });
}

function applyFrameLayout() {
  if (!frame || !lamp) return;
  const parentWindow = window.parent || window;
  const { width, height } = viewport();
  frame.style.position = 'fixed';
  frame.style.border = '0';
  frame.style.background = 'transparent';
  frame.style.zIndex = '99999';
  frame.style.colorScheme = 'normal';
  if (isOpen) {
    const panelWidth = Math.round(width * (isMobile() ? 0.96 : 0.8));
    const panelHeight = Math.round(height * (isMobile() ? 0.88 : 0.8));
    frame.style.width = `${panelWidth}px`;
    frame.style.height = `${panelHeight}px`;
    frame.style.left = `${Math.max(8, Math.round((width - panelWidth) / 2))}px`;
    frame.style.top = `${Math.max(8, Math.round((height - panelHeight) / 2))}px`;
    frame.style.display = '';
    lamp.style.display = 'none';
  } else {
    frame.style.display = 'none';
    lamp.style.display = 'grid';
  }
}

function onLampDown(event) {
  if (isOpen) return;
  // 阻止默认行为防止文本选择
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const clientY = event.touches ? event.touches[0].clientY : event.clientY;
  const rect = lamp.getBoundingClientRect();
  dragState = {
    startX: clientX,
    startY: clientY,
    left: rect.left,
    top: rect.top,
    moved: false,
  };
  lampDragMoved = false;
  lamp.style.transition = 'none';
  if (event.cancelable && !event.touches) event.preventDefault();
}

function onLampMove(event) {
  if (!dragState || isOpen) return;
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const clientY = event.touches ? event.touches[0].clientY : event.clientY;
  const dx = clientX - dragState.startX;
  const dy = clientY - dragState.startY;
  if (Math.hypot(dx, dy) > 5) {
    dragState.moved = true;
    lampDragMoved = true;
  }
  const parentWindow = window.parent || window;
  const maxLeft = parentWindow.innerWidth - lamp.offsetWidth - 8;
  const maxTop = parentWindow.innerHeight - lamp.offsetHeight - 8;
  const newLeft = Math.min(maxLeft, Math.max(8, dragState.left + dx));
  const newTop = Math.min(maxTop, Math.max(8, dragState.top + dy));
  lamp.style.left = `${newLeft}px`;
  lamp.style.top = `${newTop}px`;
  if (event.cancelable) event.preventDefault();
}

function onLampUp(_event) {
  if (!dragState) return;
  lamp.style.transition = '';
  if (dragState.moved) {
    clampLampToViewport();
    saveStorage(
      'position',
      JSON.stringify({ left: Number.parseInt(lamp.style.left, 10), top: Number.parseInt(lamp.style.top, 10) }),
    );
    lampDragJustEnded = true;
    setTimeout(() => {
      lampDragJustEnded = false;
    }, 150);
  }
  dragState = null;
}

function clampLampToViewport() {
  const parentWindow = window.parent || window;
  const rect = lamp.getBoundingClientRect();
  const margin = 8;
  let newLeft = rect.left;
  let newTop = rect.top;
  if (rect.right > parentWindow.innerWidth - margin) newLeft = parentWindow.innerWidth - lamp.offsetWidth - margin;
  if (rect.left < margin) newLeft = margin;
  if (rect.bottom > parentWindow.innerHeight - margin) newTop = parentWindow.innerHeight - lamp.offsetHeight - margin;
  if (rect.top < margin) newTop = margin;
  if (newLeft !== rect.left) lamp.style.left = `${newLeft}px`;
  if (newTop !== rect.top) lamp.style.top = `${newTop}px`;
}

async function waitForMvu() {
  if (typeof waitGlobalInitialized === 'function') {
    await waitGlobalInitialized('Mvu');
  }
}

function getLatestMessageId() {
  const getter = globalThis.getLastMessageId ?? window.parent?.getLastMessageId;
  if (typeof getter !== 'function') return null;
  try {
    return getter();
  } catch {
    return null;
  }
}

function readMvuMergedStatData(mvu) {
  if (!mvu?.getMvuData) return null;
  // 直接读取 MVU latest 合并快照，不再逐层 _.merge（逐层合并会永久保留底层旧 key，导致
  // 第零层初始变量、世界书 [initvar] 初始值等内容永远无法被后续修改自然覆盖）。
  try {
    const latest = mvu.getMvuData({ type: 'message', message_id: 'latest' });
    const statData = _.get(latest, 'stat_data', null);
    if (statData && typeof statData === 'object' && Object.keys(statData).length > 0) {
      return _.cloneDeep(statData);
    }
    return null;
  } catch {
    return null;
  }
}

function readLatestStatData() {
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  let data = readMvuMergedStatData(mvu);

  // 新会话没有任何 MVU 数据时，回退到空对象（不再回退 getAllVariables()，
  // 避免世界书 [initvar] 写入的初始结构在后续游玩中被永久保留、无法覆盖）。
  if (!data || typeof data !== 'object') {
    data = {};
  }

  if (typeof data === 'object') {
    normalizeStatDataKeys(data);
    // 换档检测：数据中的会话标记与本会话不匹配 → 清空删除集
    const dataSessionId = _.get(data, '经济._结算标记');
    if (!dataSessionId || dataSessionId !== settleSessionId) {
      pendingDeletedPaths.clear();
      // 同步清理 localStorage 结算标记，防止旧档月份锁影响新档首次自动结算
      saveStorage('last_settled_ym', '');
      saveStorage('last_closed_army_ym', '');
    }
    applyPendingDeletedPaths(data);
    reconcileEconomy(data);
    ensureMarketState(data, extractYearMonth(get(data, '世界运转.当前日期', '')) || '');
    return data;
  }
  throw new Error('未找到有效的变量数据，请先生成至少一轮剧情再打开状态栏。');
}

function refreshData(force = false) {
  const latestMessageId = getLatestMessageId();
  if (!force && latestMessageId != null && latestMessageId === lastMessageId && !lastError) {
    return;
  }

  try {
    statData = readLatestStatData();
    lastError = '';
    lastMessageId = latestMessageId;
    lastRefreshAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  } catch (error) {
    lastError = error?.message || String(error);
  }
  render();
}

function checkLatestMessage() {
  const latestMessageId = getLatestMessageId();
  if (latestMessageId == null) return;
  if (latestMessageId !== lastMessageId) {
    refreshData(true);
  }
}

async function removeVariable(path) {
  modalState = { type: 'confirm', title: '确认删除', message: `确定要删除「${path}」吗？`, path };
  render();
}

async function execRemoveVariable(path) {
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  if (!mvu?.getMvuData || !mvu?.replaceMvuData) {
    showToast('MVU 尚未初始化，无法修改变量。', 'err');
    return;
  }
  try {
    pendingDeletedPaths.add(path);
    if (statData && typeof statData === 'object') deleteByPath(statData, path);
    render();

    const result = await deleteMvuPathEverywhere(mvu, path);
    statData = readLatestStatData();
    lastError = '';
    lastRefreshAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    showToast(`✓ 已删除${result.deletedCount > 1 ? `（清理${result.deletedCount}层）` : ''}`, 'ok');
  } catch (error) {
    showToast(`✗ 删除失败：${error?.message || '未知错误'}`, 'err');
  }
}

async function clearAllMoney() {
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  if (!mvu?.getMvuData || !mvu?.replaceMvuData) {
    showToast('MVU 尚未初始化，无法修改变量。', 'err');
    return;
  }
  try {
    const variables = getMergedLatestVariables(mvu);
    const data = get(variables, 'stat_data', {});
    if (data.经济?.流水) {
      data.经济.流水.月入 = {};
      data.经济.流水.月出 = {};
      data.经济.流水.本月结余 = 0;
    }
    await mvu.replaceMvuData(variables, { type: 'message', message_id: 'latest' });
    statData = data;
    lastError = '';
    lastRefreshAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    showToast('✓ 收支明细已清空', 'ok');
  } catch (error) {
    showToast(`✗ 清空失败：${error?.message || '未知错误'}`, 'err');
  }
}

async function buyMarketItem(itemId, requestedQuantity, currency) {
  const item = MARKET_ITEMS.find(candidate => candidate.id === itemId);
  if (!item) return;
  if (marketTransactionPending) {
    showToast('上一笔交易尚在入账，请稍候。', 'err');
    return;
  }
  const quantity = Math.max(0, Math.floor(number(requestedQuantity, 0)));
  if (!quantity) {
    showToast('购买数量必须为正整数。', 'err');
    return;
  }
  const paymentCurrency = ['黄金', '白银', '铜钱'].includes(currency) ? currency : '白银';
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  if (!mvu?.getMvuData || !mvu?.replaceMvuData) {
    showToast('MVU 尚未初始化，无法交易。', 'err');
    return;
  }

  marketTransactionPending = true;
  try {
    const variables = getMergedLatestVariables(mvu);
    const data = get(variables, 'stat_data', {});
    const currentYM = extractYearMonth(get(data, '世界运转.当前日期', '')) || '';
    const market = ensureMarketState(data, currentYM);
    const remaining = Math.round(number(market._剩余库存[item.id], 0));
    if (remaining < quantity) {
      showToast(`本月「${item.name}」仅余 ${remaining}${item.unit}。`, 'err');
      return;
    }

    const silverPrice = getMarketItemPriceInSilver(item, market, quantity);
    const quote = getMarketPaymentQuote(silverPrice, paymentCurrency, market);
    const privateStore = ensureObject(ensureObject(data, '主角'), '私库');
    const coins = ensureObject(privateStore, '金银铜');
    const balance = number(coins[quote.key], 0);
    if (balance + 1e-9 < quote.amount) {
      showToast(`${quote.key}不足：需 ${quote.text}。可先到钱庄兑换。`, 'err');
      return;
    }

    coins[quote.key] =
      quote.key === '铜钱' ? Math.round(balance - quote.amount) : roundMarketNumber(balance - quote.amount);
    market._剩余库存[item.id] = remaining - quantity;
    const storage = ensureObject(ensureObject(data, '经济'), '仓储');
    if (!storage[item.name] || typeof storage[item.name] !== 'object') {
      storage[item.name] = { 数量: 0, 单位: item.unit };
    }
    if (storage[item.name].单位 && storage[item.name].单位 !== item.unit) {
      throw new Error(`仓储中的「${item.name}」单位为${storage[item.name].单位}，无法按${item.unit}入库`);
    }
    storage[item.name].单位 = item.unit;
    storage[item.name].数量 = Math.max(0, number(storage[item.name].数量, 0)) + quantity;

    await mvu.replaceMvuData(variables, { type: 'message', message_id: 'latest' });
    statData = data;
    lastError = '';
    lastRefreshAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    showToast(`已购入「${item.name}」${quantity}${item.unit}，支出 ${quote.text}。`, 'ok');
  } catch (error) {
    showToast(`交易失败：${error?.message || '未知错误'}`, 'err');
  } finally {
    marketTransactionPending = false;
  }
}

async function exchangeMarketCurrency(kind, requestedAmount) {
  if (marketTransactionPending) {
    showToast('上一笔交易尚在入账，请稍候。', 'err');
    return;
  }
  const amount = roundMarketNumber(requestedAmount);
  if (!(amount > 0)) {
    showToast('兑换数量必须大于零。', 'err');
    return;
  }
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  if (!mvu?.getMvuData || !mvu?.replaceMvuData) {
    showToast('MVU 尚未初始化，无法兑换。', 'err');
    return;
  }

  marketTransactionPending = true;
  try {
    const variables = getMergedLatestVariables(mvu);
    const data = get(variables, 'stat_data', {});
    const currentYM = extractYearMonth(get(data, '世界运转.当前日期', '')) || '';
    const market = ensureMarketState(data, currentYM);
    const privateStore = ensureObject(ensureObject(data, '主角'), '私库');
    const coins = ensureObject(privateStore, '金银铜');
    coins.黄金 = roundMarketNumber(coins.黄金);
    coins.白银 = roundMarketNumber(coins.白银);
    coins.铜钱 = Math.round(number(coins.铜钱, 0));
    const goldRate = number(market.汇率.一两黄金兑白银, 6);
    const copperRate = number(market.汇率.一两白银兑铜钱, 1200);
    let detail = '';

    if (kind === 'sell-gold') {
      if (coins.黄金 + 1e-9 < amount) throw new Error(`黄金不足，需 ${amount} 两`);
      const received = roundMarketNumber(amount * goldRate * (1 - MARKET_SPREAD));
      coins.黄金 = roundMarketNumber(coins.黄金 - amount);
      coins.白银 = roundMarketNumber(coins.白银 + received);
      detail = `${amount} 两黄金兑得 ${received} 两白银`;
    } else if (kind === 'buy-gold') {
      const cost = Math.ceil(amount * goldRate * (1 + MARKET_SPREAD) * 1000) / 1000;
      if (coins.白银 + 1e-9 < cost) throw new Error(`白银不足，需 ${cost} 两`);
      coins.白银 = roundMarketNumber(coins.白银 - cost);
      coins.黄金 = roundMarketNumber(coins.黄金 + amount);
      detail = `支出 ${cost} 两白银，购得 ${amount} 两黄金`;
    } else if (kind === 'sell-silver') {
      if (coins.白银 + 1e-9 < amount) throw new Error(`白银不足，需 ${amount} 两`);
      const received = Math.floor(amount * copperRate * (1 - MARKET_SPREAD));
      coins.白银 = roundMarketNumber(coins.白银 - amount);
      coins.铜钱 += received;
      detail = `${amount} 两白银兑得 ${received} 文铜钱`;
    } else if (kind === 'buy-silver') {
      const cost = Math.ceil(amount * copperRate * (1 + MARKET_SPREAD));
      if (coins.铜钱 < cost) throw new Error(`铜钱不足，需 ${cost} 文`);
      coins.铜钱 -= cost;
      coins.白银 = roundMarketNumber(coins.白银 + amount);
      detail = `支出 ${cost} 文铜钱，购得 ${amount} 两白银`;
    } else {
      throw new Error('未知的兑换方向');
    }

    await mvu.replaceMvuData(variables, { type: 'message', message_id: 'latest' });
    statData = data;
    lastError = '';
    lastRefreshAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    showToast(`钱庄兑付完成：${detail}。`, 'ok');
  } catch (error) {
    showToast(`兑换失败：${error?.message || '未知错误'}`, 'err');
  } finally {
    marketTransactionPending = false;
  }
}

async function buyShopItem(itemId) {
  const item = getShopItems().find(s => s.id === itemId);
  if (!item) return;
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  if (!mvu?.getMvuData || !mvu?.replaceMvuData) {
    showToast('MVU 尚未初始化，无法购买。', 'err');
    return;
  }
  try {
    const variables = getMergedLatestVariables(mvu);
    const data = get(variables, 'stat_data', {});
    // 确保风月阁结构
    if (!data.风月阁) data.风月阁 = { 同房点数: 0, 器物: {}, 掌柜絮语: '' };
    if (!data.风月阁.器物) data.风月阁.器物 = {};
    const 当前点数 = number(data.风月阁.同房点数, 0);
    if (当前点数 < item.price) {
      showToast('✗ 同房点数不足，去和你的姑娘们多亲近亲近吧～', 'err');
      return;
    }
    data.风月阁.同房点数 = 当前点数 - item.price;
    const existing = data.风月阁.器物[item.name];
    if (existing) {
      existing.数量 = (existing.数量 ?? 0) + 1;
    } else {
      data.风月阁.器物[item.name] = { 简介: item.desc, 数量: 1 };
    }
    await mvu.replaceMvuData(variables, { type: 'message', message_id: 'latest' });
    statData = data;
    lastError = '';
    lastRefreshAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    showToast(`✓ 已购入「${item.name}」`, 'ok');
  } catch (error) {
    showToast(`✗ 购买失败：${error?.message || '未知错误'}`, 'err');
  }
}

// ============================================================
// 难度设置
// ============================================================

let toastMessage = '';
let toastType = '';
let toastTimer = null;

function getCanmingUiHost() {
  try {
    return window.parent && window.parent !== window ? window.parent : window;
  } catch {
    return window;
  }
}

function ensureCanmingUiStyle(doc) {
  // 始终移除旧版本样式，确保主题 CSS 更新到最新（版本号递增即可强制刷新）
  const old = doc.getElementById('canming-ui-overlay-style');
  if (old && old.getAttribute('data-version') === '2') return;
  if (old) old.remove();
  const style = doc.createElement('style');
  style.id = 'canming-ui-overlay-style';
  style.setAttribute('data-version', '2');
  style.textContent = `
    /* ===== 主题 CSS 变量 ===== */
    #canming-ui-toast-layer, #canming-ui-dialog {
      --cui-paper: #fbf7ee;
      --cui-paper2: #eee2cd;
      --cui-ink: #3d2d1e;
      --cui-muted: #8b7654;
      --cui-border: #af956e;
      --cui-border-light: #cbb69266;
      --cui-accent: #76542d;
      --cui-accent-text: #fffaf0;
      --cui-accent2: #72825b;
      --cui-danger: #8d4035;
      --cui-danger-text: #fffaf0;
      --cui-shadow: #160c05a6;
      --cui-toast-bg: linear-gradient(135deg, #f8f3e8, #eee2cd);
      --cui-toast-border: #a98e66;
      --cui-toast-shadow: #25190b42;
      --cui-input-bg: #fffaf0;
      --cui-input-border: #bda681;
      --cui-input-focus: #7d5e37;
      --cui-input-focus-glow: #8b6b3e20;
      --cui-btn-bg: #f7f0e2;
      --cui-btn-ink: #634729;
      --cui-btn-border: #b69a72;
      --cui-overlay-bg: #1b130b66;
      --cui-dot-ok: #72825b;
      --cui-dot-err: #a94c3d;
      --cui-dot-info: #63798a;
      --cui-dot-ok-glow: #72825b22;
      --cui-dot-err-glow: #a94c3d22;
      --cui-dot-info-glow: #63798a22;
    }
    /* night 主题 */
    #canming-ui-toast-layer.theme-night, #canming-ui-dialog.theme-night {
      --cui-paper: #2a1f16;
      --cui-paper2: #352619;
      --cui-ink: #f2dfba;
      --cui-muted: #b99f76;
      --cui-border: #6a5035;
      --cui-border-light: #6a503544;
      --cui-accent: #d0784b;
      --cui-accent-text: #fff;
      --cui-accent2: #89a074;
      --cui-danger: #c25e4f;
      --cui-danger-text: #fff;
      --cui-shadow: #000000a0;
      --cui-toast-bg: linear-gradient(135deg, #352619, #2a1f16);
      --cui-toast-border: #6a5035;
      --cui-toast-shadow: #00000060;
      --cui-input-bg: #1f150e;
      --cui-input-border: #5a4030;
      --cui-input-focus: #d0784b;
      --cui-input-focus-glow: #d0784b20;
      --cui-btn-bg: #352619;
      --cui-btn-ink: #d4b896;
      --cui-btn-border: #5a4030;
      --cui-overlay-bg: #0a0604a0;
      --cui-dot-ok: #89a074;
      --cui-dot-err: #c25e4f;
      --cui-dot-info: #7d8fa0;
      --cui-dot-ok-glow: #89a07422;
      --cui-dot-err-glow: #c25e4f22;
      --cui-dot-info-glow: #7d8fa022;
    }
    /* star 主题 */
    #canming-ui-toast-layer.theme-star, #canming-ui-dialog.theme-star {
      --cui-paper: #0d1820;
      --cui-paper2: #111d28;
      --cui-ink: #e6dcc8;
      --cui-muted: #7d8fa0;
      --cui-border: #4a5555;
      --cui-border-light: #4a555544;
      --cui-accent: #d4a040;
      --cui-accent-text: #0d1820;
      --cui-accent2: #5d8d9a;
      --cui-danger: #b85a48;
      --cui-danger-text: #fff;
      --cui-shadow: #000000b0;
      --cui-toast-bg: linear-gradient(135deg, #111d28, #0d1820);
      --cui-toast-border: #4a5555;
      --cui-toast-shadow: #00000060;
      --cui-input-bg: #080f16;
      --cui-input-border: #3a4548;
      --cui-input-focus: #d4a040;
      --cui-input-focus-glow: #d4a04020;
      --cui-btn-bg: #111d28;
      --cui-btn-ink: #c0b090;
      --cui-btn-border: #3a4548;
      --cui-overlay-bg: #050a10b0;
      --cui-dot-ok: #5d8d9a;
      --cui-dot-err: #b85a48;
      --cui-dot-info: #63798a;
      --cui-dot-ok-glow: #5d8d9a22;
      --cui-dot-err-glow: #b85a4822;
      --cui-dot-info-glow: #63798a22;
    }
    /* ink 主题 */
    #canming-ui-toast-layer.theme-ink, #canming-ui-dialog.theme-ink {
      --cui-paper: #f5f0e4;
      --cui-paper2: #ddd4c2;
      --cui-ink: #171a17;
      --cui-muted: #5f6158;
      --cui-border: #8a8575;
      --cui-border-light: #8a857544;
      --cui-accent: #a12f25;
      --cui-accent-text: #fff8e8;
      --cui-accent2: #2f6965;
      --cui-danger: #a12f25;
      --cui-danger-text: #fff8e8;
      --cui-shadow: #191e1880;
      --cui-toast-bg: linear-gradient(135deg, #f5f0e4, #ddd4c2);
      --cui-toast-border: #8a8575;
      --cui-toast-shadow: #191e1840;
      --cui-input-bg: #faf7ee;
      --cui-input-border: #9a9582;
      --cui-input-focus: #2f6965;
      --cui-input-focus-glow: #2f696520;
      --cui-btn-bg: #ede6d8;
      --cui-btn-ink: #2d3027;
      --cui-btn-border: #9a9582;
      --cui-overlay-bg: #15181080;
      --cui-dot-ok: #2f6965;
      --cui-dot-err: #a12f25;
      --cui-dot-info: #4a6668;
      --cui-dot-ok-glow: #2f696522;
      --cui-dot-err-glow: #a12f2522;
      --cui-dot-info-glow: #4a666822;
    }

    /* ===== 组件样式（使用 CSS 变量） ===== */
    #canming-ui-toast-layer{position:fixed;z-index:2147483646;right:18px;bottom:18px;display:grid;gap:9px;width:min(360px,calc(100vw - 28px));pointer-events:none}
    .canming-ui-toast{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid var(--cui-toast-border);border-radius:12px;background:var(--cui-toast-bg);box-shadow:0 12px 30px var(--cui-toast-shadow);color:var(--cui-ink);font:14px/1.55 "Noto Serif SC","Songti SC",serif;animation:canming-ui-rise .22s ease-out}
    .canming-ui-toast::before{content:"";width:7px;height:7px;margin-top:7px;border-radius:50%;background:var(--cui-dot-ok);box-shadow:0 0 0 3px var(--cui-dot-ok-glow);flex:none}.canming-ui-toast.err::before{background:var(--cui-dot-err);box-shadow:0 0 0 3px var(--cui-dot-err-glow)}.canming-ui-toast.info::before{background:var(--cui-dot-info);box-shadow:0 0 0 3px var(--cui-dot-info-glow)}
    #canming-ui-dialog{position:fixed;z-index:2147483647;inset:0;display:grid;place-items:center;padding:18px;background:var(--cui-overlay-bg);backdrop-filter:blur(3px);animation:canming-ui-fade .16s ease-out}
    .canming-ui-dialog-card{width:min(420px,100%);border:1px solid var(--cui-border);border-radius:16px;overflow:hidden;background:linear-gradient(145deg,var(--cui-paper),var(--cui-paper2));box-shadow:0 24px 65px var(--cui-shadow);color:var(--cui-ink);font-family:"Noto Serif SC","Songti SC",serif}
    .canming-ui-dialog-head{padding:15px 18px 10px;border-bottom:1px solid var(--cui-border-light);color:var(--cui-muted);font-weight:700;letter-spacing:.08em}.canming-ui-dialog-body{padding:18px;white-space:pre-line;font-size:14px;line-height:1.75}.canming-ui-dialog-input{box-sizing:border-box;width:100%;margin-top:12px;padding:10px 11px;border:1px solid var(--cui-input-border);border-radius:9px;background:var(--cui-input-bg);color:var(--cui-ink);font:inherit;outline:none}.canming-ui-dialog-input:focus{border-color:var(--cui-input-focus);box-shadow:0 0 0 3px var(--cui-input-focus-glow)}
    .canming-ui-dialog-actions{display:flex;justify-content:flex-end;gap:9px;padding:0 18px 18px}.canming-ui-dialog-actions button{min-width:78px;padding:8px 13px;border:1px solid var(--cui-btn-border);border-radius:9px;background:var(--cui-btn-bg);color:var(--cui-btn-ink);cursor:pointer;font:inherit}.canming-ui-dialog-actions .primary{border-color:var(--cui-accent);background:var(--cui-accent);color:var(--cui-accent-text)}.canming-ui-dialog-actions .danger{border-color:var(--cui-danger);background:var(--cui-danger);color:var(--cui-danger-text)}
    @keyframes canming-ui-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes canming-ui-fade{from{opacity:0}to{opacity:1}}
  `;
  doc.head.appendChild(style);
}

function canmingUiToast(message, type = 'ok') {
  const host = getCanmingUiHost();
  const doc = host.document;
  if (!doc?.body) return;
  ensureCanmingUiStyle(doc);
  let layer = doc.getElementById('canming-ui-toast-layer');
  if (!layer) {
    layer = doc.createElement('div');
    layer.id = 'canming-ui-toast-layer';
    doc.body.appendChild(layer);
  }
  // 同步主题 class：确保 toast 跟随当前状态栏主题
  layer.className = `theme-${theme || 'night'}`;
  const toast = doc.createElement('div');
  toast.className = `canming-ui-toast ${type || 'ok'}`;
  toast.textContent = String(message || '');
  layer.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function canmingUiDialog(message, options = {}) {
  const host = getCanmingUiHost();
  const doc = host.document;
  if (!doc?.body) return Promise.resolve(options.kind === 'prompt' ? null : false);
  ensureCanmingUiStyle(doc);
  return new Promise(resolve => {
    doc.getElementById('canming-ui-dialog')?.remove();
    const overlay = doc.createElement('div');
    overlay.id = 'canming-ui-dialog';
    // 同步主题 class：确保 dialog 跟随当前状态栏主题
    overlay.className = `theme-${theme || 'night'}`;
    const card = doc.createElement('section');
    card.className = 'canming-ui-dialog-card';
    const head = doc.createElement('div');
    head.className = 'canming-ui-dialog-head';
    head.textContent = options.title || '残明余烬';
    const body = doc.createElement('div');
    body.className = 'canming-ui-dialog-body';
    body.textContent = String(message || '');
    let input = null;
    if (options.kind === 'prompt') {
      input = doc.createElement('input');
      input.className = 'canming-ui-dialog-input';
      input.placeholder = options.placeholder || '';
      input.value = options.value || '';
      body.appendChild(input);
    }
    const actions = doc.createElement('div');
    actions.className = 'canming-ui-dialog-actions';
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.textContent = options.cancelText || '取消';
    const confirm = doc.createElement('button');
    confirm.type = 'button';
    confirm.className = options.danger ? 'danger' : 'primary';
    confirm.textContent = options.confirmText || '确认';
    const finish = value => {
      overlay.remove();
      resolve(value);
    };
    cancel.onclick = () => finish(options.kind === 'prompt' ? null : false);
    confirm.onclick = () => finish(options.kind === 'prompt' ? input.value : true);
    overlay.onclick = event => {
      if (event.target === overlay) finish(options.kind === 'prompt' ? null : false);
    };
    input?.addEventListener('keydown', event => {
      if (event.key === 'Enter') finish(input.value);
    });
    card.append(head, body, actions);
    actions.append(cancel, confirm);
    overlay.appendChild(card);
    doc.body.appendChild(overlay);
    setTimeout(() => input?.focus(), 0);
  });
}

function registerCanmingUi() {
  const api = {
    toast: canmingUiToast,
    confirm: (message, options = {}) => canmingUiDialog(message, options),
    prompt: (message, options = {}) => canmingUiDialog(message, { ...options, kind: 'prompt' }),
  };
  globalThis.CanmingUI = { ...(globalThis.CanmingUI || {}), ...api };
  try {
    const host = getCanmingUiHost();
    host.CanmingUI = { ...(host.CanmingUI || {}), ...api };
  } catch {
    /* ignore */
  }
}

function syncCanmingUiTheme() {
  try {
    const host = getCanmingUiHost();
    const doc = host.document;
    if (!doc) return;
    const layer = doc.getElementById('canming-ui-toast-layer');
    if (layer) layer.className = `theme-${theme || 'night'}`;
    const dialog = doc.getElementById('canming-ui-dialog');
    if (dialog) dialog.className = `theme-${theme || 'night'}`;
  } catch {
    /* ignore cross-origin */
  }
}

registerCanmingUi();
function showToast(message, type) {
  toastMessage = message;
  toastType = type;
  if (toastTimer) clearTimeout(toastTimer);
  const panel = frameDocument?.querySelector('.cm-panel');
  let toast = frameDocument?.querySelector('.cm-toast');
  if (!toast && panel) {
    toast = frameDocument.createElement('div');
    panel.appendChild(toast);
  }
  if (toast) {
    toast.className = `cm-toast ${type || 'ok'}`;
    toast.textContent = message;
  }
  toastTimer = setTimeout(() => {
    toastMessage = '';
    toastType = '';
    toastTimer = null;
    frameDocument?.querySelector('.cm-toast')?.remove();
  }, 2500);
}

function difficultyInfo(id) {
  const found = DIFFICULTIES.find(d => d[0] === id);
  return found || DIFFICULTIES[1]; // 默认中等
}

function portraitCategoryRow(category = '', source = '') {
  const shownSource = isPortraitUrl(source) ? source : '';
  return `<div class="cm-portrait-category-row" data-portrait-row>
    <input class="cm-background-input" data-portrait-category value="${html(category)}" placeholder="分类名称">
    <input class="cm-background-input" data-portrait-source value="${html(shownSource)}" placeholder="https://example.com/portrait.png" inputmode="url" autocomplete="off">
    <button type="button" class="cm-portrait-row-remove" data-action="portrait-category-remove" title="删除此分类">×</button>
  </div>`;
}

function getCharacterProfiles() {
  const portraitEntries = getPortraitEntries();
  const enabledEntries = Object.values(portraitEntries).filter(entry => entry?.enabled !== false && entry?.name);
  const stored = readJsonStorage(CHARACTER_PROFILE_STORAGE_KEY, null);
  if (stored?.version === 1 && Array.isArray(stored.profiles)) {
    const preserved = stored.profiles.filter(profile => {
      const generated =
        String(profile?.id || '').startsWith('portrait-') || String(profile?.id || '').startsWith('scenario-');
      return !generated;
    });
    const knownNames = new Set(preserved.map(profile => profile.name));
    const generated = enabledEntries
      .filter(entry => !knownNames.has(entry.name))
      .map((entry, index) => ({
        id:
          entry.source === 'scenario'
            ? `scenario-${entry.scenarioId || 'dlc'}-${index}-${entry.name}`
            : `portrait-${index}-${entry.name}`,
        name: entry.name,
        aliases: entry.aliases || [],
        title: entry.title || '',
        summary: entry.summary || '',
        gallery: normalizePortraitGallery(entry.gallery, entry.source),
        worldbookEntries: entry.worldbookEntries || [],
      }));
    const nextProfiles = [...preserved, ...generated];
    if (JSON.stringify(stored.profiles) !== JSON.stringify(nextProfiles)) {
      stored.profiles = nextProfiles;
      saveCharacterProfiles(stored);
    }
    return stored;
  }
  const profiles = enabledEntries.map((entry, index) => ({
    id:
      entry.source === 'scenario'
        ? `scenario-${entry.scenarioId || 'dlc'}-${index}-${entry.name}`
        : `portrait-${index}-${entry.name}`,
    name: entry.name,
    aliases: entry.aliases || [],
    title: entry.title || '',
    summary: entry.summary || '',
    gallery: normalizePortraitGallery(entry.gallery, entry.source),
    worldbookEntries: entry.worldbookEntries || [],
  }));
  const registry = { version: 1, profiles };
  saveCharacterProfiles(registry);
  return registry;
}

function saveCharacterProfiles(registry) {
  saveStorage(CHARACTER_PROFILE_STORAGE_KEY, JSON.stringify(registry));
}

function isExtensionCharacterProfile(profile) {
  if (!profile?.id) return false;
  if (!String(profile.id).startsWith('portrait-')) return true;
  const portrait = getPortraitEntries()[profile.name];
  return portrait?.source === 'custom' && !Object.hasOwn(PORTRAIT_DATA, profile.name);
}

function findCharacterProfileByName(name) {
  return getCharacterProfiles().profiles.find(profile => profile.name === name) || null;
}

function characterProfileField(name) {
  return frameDocument?.querySelector(`[data-character-field="${name}"]`);
}

async function readCharacterWorldbookEntries() {
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  if (typeof worldbook !== 'function') return [];
  try {
    return ((await worldbook(getWorldbookName())) || []).filter(
      entry => entry?.name && typeof entry.content === 'string',
    );
  } catch (error) {
    console.warn('[状态栏] 读取角色世界书失败:', error);
    return [];
  }
}

async function openCharacterManager(id = '', section = 'profile') {
  const profile = getCharacterProfiles().profiles.find(item => item.id === id);
  modalState = {
    type: 'character-studio',
    id,
    section,
    worldbookEntries: [],
    selectedWorldbookEntries: profile?.worldbookEntries || [],
    worldbookPickerOpen: false,
    worldbookQuery: '',
  };
  renderModalOnly();
  modalState.worldbookEntries = await readCharacterWorldbookEntries();
  if (modalState?.type === 'character-studio') renderModalOnly();
}

function renderCharacterWorldbookSection(entries, selectedWorldbookNames, pickerOpen, query = '') {
  const linkedNames = new Set(selectedWorldbookNames);
  const linkedEntries = selectedWorldbookNames.map(
    name => entries.find(entry => entry.name === name) || { name, content: '该条目当前未在世界书中找到' },
  );
  if (!entries.length)
    return '<div class="cm-character-worldbook"><div class="cm-character-worldbook-head"><span>关联世界书条目</span><small>勾选后会随角色包导入、导出；不再按名字猜测。</small></div><p class="cm-setting-desc">未读取到世界书条目。请确认当前角色卡已绑定世界书。</p></div>';
  return `<div class="cm-character-worldbook"><div class="cm-character-worldbook-head"><span>关联世界书条目</span><small>勾选后会随角色包导入、导出；不再按名字猜测。</small></div><div class="cm-character-linked">${linkedEntries.length ? linkedEntries.map(entry => `<button type="button" class="cm-character-linked-chip" data-action="character-worldbook-remove" data-worldbook-name="${html(entry.name)}"><span>${html(entry.name)}</span><i>×</i></button>`).join('') : '<span class="cm-character-linked-empty">尚未关联条目</span>'}</div><button type="button" class="cm-character-picker-toggle${pickerOpen ? ' open' : ''}" data-action="character-worldbook-picker">${pickerOpen ? '收起条目选择' : '选择世界书条目'}<span>${selectedWorldbookNames.length} 项已选</span></button>${pickerOpen ? `<div class="cm-character-picker"><input class="cm-background-input" data-character-worldbook-search placeholder="搜索条目名称或内容…" value="${html(query)}"><div class="cm-character-picker-results" data-character-worldbook-results>${renderCharacterWorldbookOptions(entries, linkedNames, query)}</div></div>` : ''}</div>`;
}

function updateCharacterWorldbookSection() {
  const current = frameDocument?.querySelector('.cm-character-worldbook');
  if (!current || modalState?.type !== 'character-studio') return;
  const scrollTop = frameDocument.querySelector('.cm-modal-character-studio')?.scrollTop || 0;
  current.outerHTML = renderCharacterWorldbookSection(
    modalState.worldbookEntries || [],
    modalState.selectedWorldbookEntries || [],
    Boolean(modalState.worldbookPickerOpen),
    modalState.worldbookQuery || '',
  );
  const dialog = frameDocument.querySelector('.cm-modal-character-studio');
  if (dialog) dialog.scrollTop = scrollTop;
}
function renderCharacterWorldbookOptions(entries, selectedNames, query = '') {
  const normalized = String(query).trim().toLocaleLowerCase();
  const filtered = entries.filter(
    entry => !normalized || `${entry.name}\n${entry.content || ''}`.toLocaleLowerCase().includes(normalized),
  );
  const ordered = [...filtered]
    .sort((a, b) => Number(selectedNames.has(b.name)) - Number(selectedNames.has(a.name)))
    .slice(0, 60);
  if (!ordered.length) return '<p class="cm-character-picker-empty">没有匹配的世界书条目</p>';
  const suffix =
    filtered.length > ordered.length
      ? `<p class="cm-character-picker-more">显示前 ${ordered.length} 项，请继续输入缩小范围</p>`
      : '';
  return (
    ordered
      .map(
        entry =>
          `<label class="cm-character-worldbook-row"><input type="checkbox" data-character-worldbook value="${html(entry.name)}"${selectedNames.has(entry.name) ? ' checked' : ''}><span><b>${html(entry.name)}</b><small>${html(
            String(entry.content || '')
              .replace(/\s+/g, ' ')
              .slice(0, 72),
          )}</small></span></label>`,
      )
      .join('') + suffix
  );
}
function renderStudioPortraitPane(profile) {
  if (!profile?.id) return '<div class="cm-studio-empty">先在“角色档案”页填写并保存角色名，再添加立绘。</div>';
  const entry = getPortraitEntries()[profile.name] || {
    enabled: true,
    gallery: profile.gallery || 'none',
    portraits: {},
    source: 'custom',
  };
  const rows =
    Object.entries(entry.portraits || {})
      .map(([category, source]) => portraitCategoryRow(category, source))
      .join('') || portraitCategoryRow();
  return `<div class="cm-portrait-form"><div class="cm-studio-note">当前角色：<b>${html(profile.name)}</b>。立绘会自动使用此角色的名称与别名。</div><div class="cm-portrait-category-editor"><div class="cm-portrait-category-head"><span>立绘分类</span><span>HTTP/HTTPS 图片链接</span></div><div data-portrait-rows>${rows}</div><button type="button" class="cm-portrait-add-row" data-action="portrait-category-add">${portraitAddIcon()}<span>添加分类</span></button></div><label class="cm-portrait-enabled"><input type="checkbox" data-portrait-field="enabled" ${entry.enabled !== false ? 'checked' : ''}> 允许 AI 在正文插图中为此角色输出标签</label>${entry.source === 'custom' && Object.keys(entry.portraits || {}).length ? `<div class="cm-background-actions"><button class="cm-diff-btn" data-action="portrait-manager-remove" data-portrait-manager-name="${html(profile.name)}">删除全部立绘</button></div>` : ''}</div>`;
}

function renderCharacterStudioModal() {
  const registry = getCharacterProfiles();
  const profile = registry.profiles.find(item => item.id === modalState.id) || {
    id: '',
    name: '',
    aliases: [],
    title: '',
    summary: '',
    gallery: 'none',
    worldbookEntries: [],
  };
  const section = modalState.section || 'profile';
  const list =
    registry.profiles
      .map(
        item =>
          `<button class="cm-studio-character${item.id === profile.id ? ' active' : ''}" data-action="studio-select" data-character-id="${html(item.id)}" data-studio-search-text="${html(`${item.name} ${item.aliases?.join(' ') || ''} ${item.title || ''}`)}"><b>${html(item.name)}</b><span>${html(item.title || '角色档案')}</span></button>`,
      )
      .join('') || '<p class="cm-studio-list-empty">还没有角色档案</p>';
  const selected = modalState.selectedWorldbookEntries || profile.worldbookEntries || [];
  const aiAppearanceControl =
    !profile.id || isExtensionCharacterProfile(profile)
      ? `<label class="cm-portrait-enabled"><input type="checkbox" data-character-field="allowAiAppearance" ${profile.allowAiAppearance !== false ? 'checked' : ''}> 允许 AI 主动安排此角色登场</label><p class="cm-studio-field-help">开启后，角色的姓名、称号与简介会加入常驻扩展角色索引。</p>`
      : '';
  const profilePane = `<div class="cm-portrait-form"><label>角色名<input class="cm-background-input" data-character-field="name" value="${html(profile.name)}" placeholder="例如：白瑶"></label><p class="cm-studio-field-help">用于关联此角色的立绘与正文插图标签。</p><label>别名（逗号分隔，可选）<input class="cm-background-input" data-character-field="aliases" value="${html((profile.aliases || []).join(', '))}" placeholder="例如：乐安公主"></label><label>称号（角色介绍页显示）<input class="cm-background-input" data-character-field="title" value="${html(profile.title || '')}" placeholder="例如：乐安公主"></label><label>简介（角色介绍页显示）<textarea class="cm-background-input cm-portrait-textarea" data-character-field="summary" placeholder="一句人物介绍">${html(profile.summary || '')}</textarea></label>${aiAppearanceControl}<label>人物志归属<select class="cm-background-input" data-character-field="gallery">${PORTRAIT_GALLERY_OPTIONS.map(([key, label]) => `<option value="${key}"${normalizePortraitGallery(profile.gallery) === key ? ' selected' : ''}>${label}</option>`).join('')}</select></label><p class="cm-studio-field-help">不加入人物志仍会保留角色档案、立绘及正文插图能力。</p>${renderCharacterWorldbookSection(modalState.worldbookEntries || [], selected, Boolean(modalState.worldbookPickerOpen), modalState.worldbookQuery || '')}</div>`;
  const saveAction =
    section === 'portraits'
      ? `<button class="cm-portrait-toolbar-btn primary" data-action="portrait-manager-save" data-portrait-manager-original="${html(profile.name)}" ${profile.id ? '' : 'disabled'}>保存立绘</button>`
      : `<button class="cm-portrait-toolbar-btn primary" data-action="character-manager-save" data-character-id="${html(profile.id)}">保存</button>`;
  const actions = `<button class="cm-portrait-toolbar-btn" data-action="character-manager-new">${portraitAddIcon()}<span>新建</span></button><button class="cm-portrait-toolbar-btn" data-action="character-manager-import">导入</button>${saveAction}${profile.id ? `<button class="cm-portrait-toolbar-btn" data-action="character-manager-export" data-character-id="${html(profile.id)}">导出</button><button class="cm-portrait-toolbar-btn" data-action="character-manager-remove" data-character-id="${html(profile.id)}">删除</button>` : ''}<input type="file" data-character-import accept="application/json,.json" hidden>`;
  return `<div class="cm-modal-mask" data-action="close-modal"><section class="cm-modal cm-modal-character-studio" role="dialog" aria-modal="true"><header class="cm-modal-head"><div><p class="cm-kicker">残明余烬 · 角色与立绘</p><h2>${profile.id ? html(profile.name) : '新建角色'}</h2></div><button data-action="close-modal">×</button></header><div class="cm-studio"><aside class="cm-studio-sidebar"><div class="cm-studio-sidebar-head"><span>角色列表</span><small>${registry.profiles.length} 位</small></div><input class="cm-studio-search" data-studio-search placeholder="搜索角色或别名"><div class="cm-studio-character-list">${list}</div><p class="cm-studio-search-empty" hidden>没有匹配的角色</p></aside><div class="cm-studio-main"><div class="cm-studio-tabs"><button class="${section === 'profile' ? 'active' : ''}" data-action="studio-section" data-studio-section="profile">角色档案</button><button class="${section === 'portraits' ? 'active' : ''}" data-action="studio-section" data-studio-section="portraits" ${profile.id ? '' : 'disabled'}>立绘</button><span class="cm-studio-actions">${actions}</span></div><div class="cm-studio-content">${section === 'portraits' ? renderStudioPortraitPane(profile) : profilePane}</div></div></div></section></div>`;
}
function renderCharacterManagerModal() {
  const registry = getCharacterProfiles();
  const profile = registry.profiles.find(item => item.id === modalState.id) || {
    id: '',
    name: '',
    aliases: [],
    title: '',
    summary: '',
    gallery: 'none',
    worldbookEntries: [],
  };
  const worldbookEntries = modalState.worldbookEntries || [];
  const profileOptions = [
    '<option value="">新建角色档案</option>',
    ...registry.profiles.map(
      item =>
        `<option value="${html(item.id)}"${item.id === profile.id ? ' selected' : ''}>${html(item.name)}</option>`,
    ),
  ].join('');
  const selectedWorldbookNames = modalState.selectedWorldbookEntries || profile.worldbookEntries || [];
  const worldbookList = renderCharacterWorldbookSection(
    worldbookEntries,
    selectedWorldbookNames,
    Boolean(modalState.worldbookPickerOpen),
    modalState.worldbookQuery || '',
  );
  const portrait = getPortraitEntries()[profile.name];
  return `
    <div class="cm-modal-mask" data-action="close-modal">
      <section class="cm-modal cm-modal-character-manager" role="dialog" aria-modal="true">
        <header class="cm-modal-head"><div><p class="cm-kicker">残明余烬 · 角色档案</p><h2>${profile.id ? `编辑「${html(profile.name)}」` : '新建角色档案'}</h2></div><button data-action="close-modal">×</button></header>
        <div class="cm-modal-body">
          <div class="cm-character-toolbar"><label class="cm-portrait-select"><span>角色档案</span><select data-character-select>${profileOptions}</select></label><div class="cm-character-toolbar-actions"><button class="cm-portrait-toolbar-btn" data-action="character-manager-new">${portraitAddIcon()}<span>新建</span></button><button class="cm-portrait-toolbar-btn" data-action="character-manager-import">导入</button><button class="cm-portrait-toolbar-btn primary" data-action="character-manager-save" data-character-id="${html(profile.id)}">保存</button>${profile.id ? `<button class="cm-portrait-toolbar-btn" data-action="character-manager-export" data-character-id="${html(profile.id)}">导出</button><button class="cm-portrait-toolbar-btn" data-action="character-manager-remove" data-character-id="${html(profile.id)}">删除</button>` : ''}<input type="file" data-character-import accept="application/json,.json" hidden></div></div>
          <div class="cm-portrait-form">
            <label>角色名<input class="cm-background-input" data-character-field="name" value="${html(profile.name)}" placeholder="与立绘角色同名即可自动关联"></label>
            <label>别名（逗号分隔，可选）<input class="cm-background-input" data-character-field="aliases" value="${html((profile.aliases || []).join(', '))}"></label>
            <label>称号（角色介绍页显示）<input class="cm-background-input" data-character-field="title" value="${html(profile.title || '')}" placeholder="例如：乐安公主"></label>
            <label>简介（角色介绍页显示）<textarea class="cm-background-input cm-portrait-textarea" data-character-field="summary" placeholder="一句人物介绍">${html(profile.summary || '')}</textarea></label>
            <label>人物志归属<select class="cm-background-input" data-character-field="gallery">${PORTRAIT_GALLERY_OPTIONS.map(([key, label]) => `<option value="${key}"${normalizePortraitGallery(profile.gallery) === key ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
            <p class="cm-studio-field-help">不加入人物志仍会保留角色档案、立绘及正文插图能力。</p>
            ${worldbookList}
            <div class="cm-character-status">立绘：${portrait ? `已关联 ${Object.keys(portrait.portraits || {}).length} 张` : '尚未创建，可前往立绘管理器添加'}</div>
          </div>
        </div>
      </section>
    </div>`;
}

function syncProfileToPortrait(profile, previousName = '') {
  const library = getPortraitLibrary();
  const current = library.entries[previousName] || library.entries[profile.name];
  if (!current) return;
  if (previousName && previousName !== profile.name && current.source === 'custom')
    delete library.entries[previousName];
  library.entries[profile.name] = {
    ...current,
    name: profile.name,
    aliases: profile.aliases,
    title: profile.title,
    summary: profile.summary,
    gallery: normalizePortraitGallery(profile.gallery, current.source),
  };
  savePortraitLibrary(library);
}

async function saveCharacterProfile(id) {
  try {
    const name = characterProfileField('name')?.value.trim() || '';
    if (!name) throw new Error('请填写角色名');
    const registry = getCharacterProfiles();
    const previous = registry.profiles.find(item => item.id === id);
    if (!previous && registry.profiles.some(item => item.name === name)) throw new Error('已有同名角色档案');
    if (previous && registry.profiles.some(item => item.id !== id && item.name === name))
      throw new Error('已有同名角色档案');
    const profile = {
      id: id || `character-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      aliases: (characterProfileField('aliases')?.value || '')
        .split(/[,，]/)
        .map(item => item.trim())
        .filter(Boolean)
        .filter(item => item !== name),
      title: characterProfileField('title')?.value.trim() || '',
      summary: characterProfileField('summary')?.value.trim() || '',
      allowAiAppearance: Boolean(characterProfileField('allowAiAppearance')?.checked),
      gallery: normalizePortraitGallery(characterProfileField('gallery')?.value),
      worldbookEntries:
        modalState.selectedWorldbookEntries ||
        [...frameDocument.querySelectorAll('[data-character-worldbook]:checked')].map(input => input.value),
    };
    if (previous) registry.profiles = registry.profiles.map(item => (item.id === id ? profile : item));
    else registry.profiles.push(profile);
    saveCharacterProfiles(registry);
    syncProfileToPortrait(profile, previous?.name || '');
    await syncExtensionCharacterIndex();
    modalState = {
      type: 'character-studio',
      id: profile.id,
      section: 'profile',
      worldbookEntries: modalState.worldbookEntries || [],
      selectedWorldbookEntries: profile.worldbookEntries || [],
    };
    renderModalOnly();
    showToast(`✓ 已保存「${name}」角色档案`, 'ok');
  } catch (error) {
    showToast(`✗ 保存角色档案失败：${error?.message || '未知错误'}`, 'err');
  }
}

function downloadCharacterPackage(bundle) {
  const filename = `${String(bundle.character.name || '角色').replace(/[\\/:*?"<>|]/g, '_')}.canming-character.json`;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function exportCharacterPackage(id) {
  try {
    const profile = getCharacterProfiles().profiles.find(item => item.id === id);
    if (!profile) throw new Error('请先保存角色档案');
    const portraitEntry = getPortraitEntries()[profile.name];
    const portraits = {};
    for (const [category, source] of Object.entries(portraitEntry?.portraits || {})) {
      if (isPortraitUrl(source)) portraits[category] = { type: 'url', value: source };
    }
    const worldbookEntries = (await readCharacterWorldbookEntries())
      .filter(entry => (profile.worldbookEntries || []).includes(entry.name))
      .map(entry => JSON.parse(JSON.stringify(entry)));
    downloadCharacterPackage({
      format: CHARACTER_PACKAGE_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      character: profile,
      portraits,
      worldbookEntries,
    });
    showToast(`✓ 已导出「${profile.name}」角色包`, 'ok');
  } catch (error) {
    showToast(`✗ 导出角色包失败：${error?.message || '未知错误'}`, 'err');
  }
}

async function importCharacterPackage(file) {
  try {
    const bundle = JSON.parse(await file.text());
    await importCharacterPackageBundle(bundle);
  } catch (error) {
    showToast(`✗ 导入角色包失败：${error?.message || '未知错误'}`, 'err');
  }
}

async function importCharacterPackageBundle(packageBundle) {
  const workshop = getCanmingWorkshop();
  const isWorkshopPackage = packageBundle?.format === WORKSHOP_PACKAGE_FORMAT;
  const checked =
    isWorkshopPackage && typeof workshop?.validatePackage === 'function'
      ? workshop.validatePackage(packageBundle)
      : packageBundle;
  const bundle = isWorkshopPackage
    ? checked.version === 2
      ? checked.resources?.find(item => item.kind === 'character')
      : checked.payload
    : checked;
  if (isWorkshopPackage && checked.version === 2 && !bundle) throw new Error('该作品没有角色档案资源。');
  if (isWorkshopPackage && checked.version !== 2 && checked.type !== 'character-package')
    throw new Error('该作品不是角色包。');
  if (!isWorkshopPackage && (bundle?.format !== CHARACTER_PACKAGE_FORMAT || bundle?.version !== 1))
    throw new Error('不是有效的残明余烬角色包');
  if (!bundle?.character?.name) throw new Error('角色包缺少角色档案。');

  const imported = bundle.character;
  const registry = getCharacterProfiles();
  const existing = registry.profiles.find(item => item.name === imported.name);
  let overwrite = false;
  if (existing) {
    overwrite = await canmingUiDialog(`「${imported.name}」已存在，是否覆盖角色档案、关联世界书与立绘？`, {
      title: '导入角色包',
      confirmText: '覆盖并导入',
      cancelText: '其他选项',
      danger: true,
    });
    if (
      !overwrite &&
      !(await canmingUiDialog('是否另存为一个新角色？', {
        title: '导入角色包',
        confirmText: '另存并导入',
        cancelText: '取消',
      }))
    )
      throw new Error('已取消导入。');
  }
  const usedNames = new Set(registry.profiles.map(item => item.name));
  const name = existing && !overwrite ? nextImportedName(imported.name, usedNames) : imported.name;
  const worldbookEntries = Array.isArray(bundle.worldbookEntries)
    ? bundle.worldbookEntries.map(entry => JSON.parse(JSON.stringify(entry)))
    : [];
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;
  const linkedNames = [];
  if (worldbookEntries.length) {
    if (typeof worldbook !== 'function' || typeof replaceWorldbook !== 'function')
      throw new Error('世界书接口不可用。');
    const merged = [...((await worldbook(getWorldbookName())) || [])];
    const names = new Set(merged.map(entry => entry.name));
    for (const rawEntry of worldbookEntries) {
      if (!rawEntry?.name || typeof rawEntry.content !== 'string') throw new Error('角色包包含无效世界书条目。');
      const entry = JSON.parse(JSON.stringify(rawEntry));
      const index = merged.findIndex(item => item.name === entry.name);
      if (index >= 0 && overwrite) {
        merged[index] = entry;
      } else if (index >= 0) {
        entry.name = nextImportedName(entry.name, names);
        merged.push(entry);
      } else {
        names.add(entry.name);
        merged.push(entry);
      }
      linkedNames.push(entry.name);
    }
    await replaceWorldbook(getWorldbookName(), merged, { render: 'immediate' });
  }

  const profile = {
    id: overwrite && existing ? existing.id : `character-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    aliases: Array.isArray(imported.aliases) ? imported.aliases.map(value => String(value)).filter(Boolean) : [],
    title: String(imported.title || ''),
    summary: String(imported.summary || ''),
    allowAiAppearance: imported.allowAiAppearance !== false,
    gallery: normalizePortraitGallery(imported.gallery),
    worldbookEntries: linkedNames,
  };
  registry.profiles =
    overwrite && existing
      ? registry.profiles.map(item => (item.id === existing.id ? profile : item))
      : [...registry.profiles, profile];
  saveCharacterProfiles(registry);

  const assets = {};
  for (const [category, asset] of Object.entries(bundle.portraits || {})) {
    if (asset?.type !== 'url' || !isPortraitUrl(asset.value))
      throw new Error(`立绘「${category}」仅支持 HTTP/HTTPS 链接`);
    assets[category] = asset.value;
  }
  const library = getPortraitLibrary();
  if (Object.keys(assets).length) {
    library.entries[name] = {
      ...(library.entries[name] || {}),
      name,
      aliases: profile.aliases,
      title: profile.title,
      summary: profile.summary,
      gallery: profile.gallery,
      enabled: true,
      portraits: assets,
      source: 'custom',
    };
  } else if (overwrite && library.entries[name]) {
    library.entries[name] = {
      ...library.entries[name],
      name,
      aliases: profile.aliases,
      title: profile.title,
      summary: profile.summary,
      gallery: profile.gallery,
      portraits: {},
    };
  }
  savePortraitLibrary(library);
  await syncPortraitIllustrationRule();
  await syncExtensionCharacterIndex();
  await openCharacterManager(profile.id);
  showToast(`✓ 已导入「${name}」角色包`, 'ok');
  return JSON.parse(JSON.stringify(profile));
}
async function removeCharacterProfile(id) {
  const registry = getCharacterProfiles();
  const profile = registry.profiles.find(item => item.id === id);
  if (!profile) return;
  const library = getPortraitLibrary();
  const portraitEntry = library.entries[profile.name];
  const portraitSources = Object.values(portraitEntry?.portraits || {});
  const worldbookNames = [...new Set(profile.worldbookEntries || [])];
  const message = `确定永久删除「${profile.name}」吗？\n\n将删除：\n• 角色档案\n• ${worldbookNames.length} 条已关联世界书人设\n• ${portraitSources.length} 张立绘链接\n\n此操作无法恢复。`;
  if (!(await canmingUiDialog(message, { title: '删除角色档案', confirmText: '永久删除', danger: true }))) return;
  try {
    if (worldbookNames.length) {
      const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
      const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;
      if (typeof worldbook !== 'function' || typeof replaceWorldbook !== 'function')
        throw new Error('世界书接口不可用，已取消删除以保护关联人设');
      const current = (await worldbook(getWorldbookName())) || [];
      const linked = new Set(worldbookNames);
      await replaceWorldbook(
        getWorldbookName(),
        current.filter(entry => !linked.has(entry.name)),
        { render: 'immediate' },
      );
    }

    if (portraitEntry) {
      delete library.entries[profile.name];
      savePortraitLibrary(library);
    }
    registry.profiles = registry.profiles.filter(item => item.id !== id);
    saveCharacterProfiles(registry);
    await syncPortraitIllustrationRule();
    await syncExtensionCharacterIndex();
    await openCharacterManager();
    showToast(`✓ 已删除「${profile.name}」及 ${worldbookNames.length} 条人设、${portraitSources.length} 张立绘`, 'ok');
  } catch (error) {
    showToast(`✗ 删除角色失败：${error?.message || '未知错误'}`, 'err');
  }
}
function renderSettingsModal() {
  return `
    <div class="cm-modal-mask" data-action="close-modal">
      <section class="cm-modal" role="dialog" aria-modal="true">
        <header class="cm-modal-head">
          <div>
            <p class="cm-kicker">残明余烬</p>
            <h2>设置</h2>
          </div>
          <button data-action="close-modal">&times;</button>
        </header>
        <div class="cm-modal-body">
          <h3>游戏难度</h3>
          <p class="cm-setting-desc">切换后即时生效，同时只能启用一种难度。当前：<b>${html(difficultyInfo(activeDifficulty)[1])}</b></p>
          <div class="cm-diff-options">${DIFFICULTIES.map(
            ([id, name, desc]) => `
            <button class="cm-diff-btn${id === activeDifficulty ? ' active' : ''}" data-action="set-difficulty" data-difficulty="${id}">
              <span class="cm-diff-name">${html(name)}</span>
              <span class="cm-diff-desc">${html(desc)}</span>
              ${id === activeDifficulty ? '<span class="cm-diff-check">✓</span>' : ''}
            </button>`,
          ).join('')}</div>
          <h3>主题背景</h3>
          <p class="cm-setting-desc">可填 HTTPS/HTTP 图片地址，或上传本地图片。背景只保存在当前浏览器；留空并保存可恢复主题默认背景。</p>
          <input class="cm-background-input" data-background-url value="${html(customBackgroundUrl.startsWith('data:') ? '' : customBackgroundUrl)}" placeholder="https://example.com/background.jpg" inputmode="url" autocomplete="off">
          <input class="cm-background-input" data-background-file type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          <p class="cm-setting-desc">支持 PNG、JPEG、WebP、GIF，单张最多 2MB。</p>
          <div class="cm-background-actions">
            <button class="cm-diff-btn active" data-action="save-background">保存背景</button>
            <button class="cm-diff-btn" data-action="clear-background" ${customBackgroundUrl ? '' : 'disabled'}>恢复默认</button>
          </div>
          <h3>功能开关</h3>
          <p class="cm-setting-desc">开启后即时生效，关闭后对应功能隐藏。</p>
          <div class="cm-diff-options">
            <button class="cm-diff-btn${shopEnabled ? ' active' : ''}" data-action="toggle-shop">
              <span class="cm-diff-name">🌙 风月阁</span>
              <span class="cm-diff-desc">在边栏新增「风月阁」标签，用同房点数兑换闺帷器物</span>
              <span class="cm-diff-check">${shopEnabled ? '开' : '关'}</span>
            </button>
            <button class="cm-diff-btn${illustrationsEnabled ? ' active' : ''}" data-action="toggle-illustrations">
              <span class="cm-diff-name">✨ 正文插图</span>
              <span class="cm-diff-desc">允许 AI 在正文中生成场景插图</span>
              <span class="cm-diff-check">${illustrationsEnabled ? '开' : '关'}</span>
            </button>
          </div>
        </div>
      </section>
    </div>`;
}

function renderConfirmModal() {
  return `
    <div class="cm-modal-mask" data-action="close-modal">
      <section class="cm-modal" role="dialog" aria-modal="true" style="width:min(380px,92%)">
        <header class="cm-modal-head">
          <h2>${html(modalState.title || '确认')}</h2>
          <button data-action="close-modal">×</button>
        </header>
        <div class="cm-modal-body" style="text-align:center">
          <p style="margin:0 0 18px;color:var(--muted);line-height:1.7">${html(modalState.message || '')}</p>
          <div style="display:flex;gap:12px;justify-content:center">
            <button class="cm-diff-btn" data-action="confirm-cancel" style="width:auto;padding:8px 24px">取消</button>
            <button class="cm-diff-btn active" data-action="confirm-ok" style="width:auto;padding:8px 24px">确认</button>
          </div>
        </div>
      </section>
    </div>`;
}

function renderPortraitOverlay() {
  const imgs = getAllPortraitData()[modalState.name];
  if (!imgs) return '';
  const categories = Object.entries(imgs);
  const idx = modalState.catIdx ?? 0;
  const [cat, url] = categories[idx] || categories[0];
  return `
    <div class="cm-portrait-overlay" data-action="close-modal">
      <div class="cm-portrait-frame">
        <div class="cm-portrait-stage">
          <button class="cm-portrait-arrow cm-portrait-prev" data-action="portrait-prev" aria-label="上一张">◀</button>
          <div class="cm-portrait-view">
            <img src="${html(url)}" alt="${html(modalState.name)}-${html(cat)}" />
            <div class="cm-portrait-caption">
              <span class="cm-portrait-name">${html(modalState.name)}</span>
              <span class="cm-portrait-cat">· ${html(cat)} ·</span>
            </div>
          </div>
          <button class="cm-portrait-arrow cm-portrait-next" data-action="portrait-next" aria-label="下一张">▶</button>
        </div>
        <div class="cm-portrait-dots">
          ${categories.map((_, i) => `<span class="cm-portrait-dot${i === idx ? ' active' : ''}"></span>`).join('')}
        </div>
      </div>
      <div class="cm-portrait-hint">—— 轻触任意处收起 ——</div>
    </div>`;
}

/** 局部更新立绘浮层：切换分类时不重建整个面板，避免图片闪烁 */
function updatePortraitOverlay() {
  if (!modalState || modalState.type !== 'portrait') return;
  const imgs = getAllPortraitData()[modalState.name];
  if (!imgs) return;
  const categories = Object.entries(imgs);
  const idx = modalState.catIdx ?? 0;
  const [cat, url] = categories[idx] || categories[0];

  const img = frameDocument.querySelector('.cm-portrait-view img');
  if (img) {
    img.src = url;
    img.alt = `${modalState.name}-${cat}`;
  }
  const catEl = frameDocument.querySelector('.cm-portrait-cat');
  if (catEl) catEl.textContent = `· ${cat} ·`;

  // 更新指示点
  const dots = frameDocument.querySelectorAll('.cm-portrait-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === idx);
  });
}

function getWorldbookName() {
  const charWb = getCharWorldbookNames('current');
  if (!charWb?.primary) throw new Error('当前角色卡未绑定世界书');
  return charWb.primary;
}

async function syncWorldbookSettings() {
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  if (worldbookSyncing || typeof worldbook !== 'function') return;

  worldbookSyncing = true;
  try {
    const entries = await worldbook(getWorldbookName());
    if (!entries || !entries.length) return;

    // 难度：以世界书里实际 enabled 的难度条目为准
    const enabledDifficultyEntry = entries.find(entry => {
      const name = entry.name || '';
      return (
        entry.enabled &&
        (name.includes('难度-休闲') ||
          name.includes('难度-中等') ||
          name.includes('难度-真实') ||
          name.includes('难度-绝境'))
      );
    });
    if (enabledDifficultyEntry) {
      const name = enabledDifficultyEntry.name || '';
      const difficulty = DIFFICULTIES.find(([, label]) => name.includes(`难度-${label}`));
      if (difficulty && activeDifficulty !== difficulty[0]) {
        activeDifficulty = difficulty[0];
        saveStorage('difficulty', activeDifficulty);
      }
    }

    // 正文插图：以世界书条目的 enabled 为准
    const illustrationEntry = entries.find(entry => (entry.name || '').includes('正文插图-输出规则'));
    if (illustrationEntry && illustrationsEnabled !== !!illustrationEntry.enabled) {
      illustrationsEnabled = !!illustrationEntry.enabled;
      saveStorage('illustrations_enabled', illustrationsEnabled ? '1' : '0');
    }

    if (modalState?.type === 'settings') render();
  } catch (error) {
    console.warn('[状态栏] 同步世界书设置失败:', error);
  } finally {
    worldbookSyncing = false;
  }
}

async function setDifficulty(difficulty) {
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;

  if (typeof worldbook !== 'function' || typeof replaceWorldbook !== 'function') {
    console.warn('[状态栏] 世界书 API 不可用，仅保存本地难度设置');
    activeDifficulty = difficulty;
    saveStorage('difficulty', difficulty);
    showToast('✓ 已切换难度（本地生效）', 'ok');
    return;
  }

  try {
    const entries = await worldbook(getWorldbookName());
    if (!entries || !entries.length) {
      throw new Error('未能读取世界书条目');
    }

    const diffName = DIFFICULTIES.find(d => d[0] === difficulty)[1];
    const updated = entries.map(entry => {
      const name = entry.name || '';
      if (
        name.includes('难度-休闲') ||
        name.includes('难度-中等') ||
        name.includes('难度-真实') ||
        name.includes('难度-绝境')
      ) {
        return { ...entry, enabled: name.includes(`难度-${diffName}`) };
      }
      return entry;
    });

    await replaceWorldbook(getWorldbookName(), updated, { render: 'immediate' });
    activeDifficulty = difficulty;
    saveStorage('difficulty', difficulty);
    showToast(`✓ 已切换至「${diffName}」难度`, 'ok');
  } catch (error) {
    console.error('[状态栏] 难度切换失败:', error);
    showToast(`✗ 切换失败：${error.message || '未知错误'}`, 'err');
  }
}

async function toggleIllustrations() {
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;

  if (typeof worldbook !== 'function' || typeof replaceWorldbook !== 'function') {
    illustrationsEnabled = !illustrationsEnabled;
    saveStorage('illustrations_enabled', illustrationsEnabled ? '1' : '0');
    showToast(`✓ 正文插图已${illustrationsEnabled ? '开启' : '关闭'}（本地生效）`, 'ok');
    render();
    return;
  }

  try {
    const entries = await worldbook(getWorldbookName());
    const newState = !illustrationsEnabled;
    const updated = entries.map(entry => {
      const name = entry.name || '';
      if (name.includes('正文插图-输出规则')) {
        return { ...entry, enabled: newState };
      }
      return entry;
    });

    await replaceWorldbook(getWorldbookName(), updated, { render: 'immediate' });
    illustrationsEnabled = newState;
    saveStorage('illustrations_enabled', newState ? '1' : '0');
    showToast(`✓ 正文插图已${newState ? '开启' : '关闭'}`, 'ok');
  } catch (error) {
    console.error('[状态栏] 插图切换失败:', error);
    showToast(`✗ 切换失败：${error.message || '未知错误'}`, 'err');
  }
  render();
}

function parsePortraitRows() {
  const portraits = {};
  for (const row of frameDocument.querySelectorAll('[data-portrait-row]')) {
    const category = row.querySelector('[data-portrait-category]')?.value.trim() || '';
    const source = row.querySelector('[data-portrait-source]')?.value.trim() || '';
    if (!category && !source) continue;
    if (!category) throw new Error('请为每张立绘填写分类名称');
    if (!isPortraitUrl(source)) throw new Error(`「${category}」仅支持 HTTP/HTTPS 图片链接`);
    if (portraits[category]) throw new Error(`分类「${category}」重复`);
    portraits[category] = source;
  }
  if (!Object.keys(portraits).length) throw new Error('至少需要添加一张立绘');
  return portraits;
}

function portraitField(name) {
  return frameDocument.querySelector(`[data-portrait-field="${name}"]`);
}

function buildPortraitManifest() {
  return (
    Object.values(getPortraitEntries())
      .filter(entry => entry?.enabled !== false && entry?.name && Object.keys(entry.portraits || {}).length)
      .map(entry => `- ${entry.name}：${Object.keys(entry.portraits).join('、')}`)
      .join('\n') || '- （暂无可用立绘）'
  );
}

async function syncPortraitIllustrationRule() {
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;
  if (typeof worldbook !== 'function' || typeof replaceWorldbook !== 'function') return false;
  const entries = await worldbook(getWorldbookName());
  const manifest = `<!-- CANMING_PORTRAIT_MANIFEST_START -->\n${buildPortraitManifest()}\n<!-- CANMING_PORTRAIT_MANIFEST_END -->`;
  let changed = false;
  const updated = entries.map(entry => {
    if (!(entry.name || '').includes('正文插图-输出规则')) return entry;
    const content = String(entry.content || '');
    const nextContent = content.replace(
      /<!-- CANMING_PORTRAIT_MANIFEST_START -->[\s\S]*?<!-- CANMING_PORTRAIT_MANIFEST_END -->/,
      manifest,
    );
    if (nextContent === content) return entry;
    changed = true;
    return { ...entry, content: nextContent };
  });
  if (changed) await replaceWorldbook(getWorldbookName(), updated, { render: 'immediate' });
  return changed;
}

function compactCharacterIndexText(value, maxLength) {
  return String(value || '')
    .replace(/<!--\s*CANMING_[\s\S]*?-->/gi, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[|｜]/g, '·')
    .trim()
    .slice(0, maxLength);
}

function buildExtensionCharacterIndex() {
  const lines = getCharacterProfiles()
    .profiles.filter(
      profile => isExtensionCharacterProfile(profile) && profile.allowAiAppearance !== false && profile.name,
    )
    .map(profile => {
      const name = compactCharacterIndexText(profile.name, 32);
      const aliases = (profile.aliases || [])
        .slice(0, 3)
        .map(alias => compactCharacterIndexText(alias, 24))
        .filter(Boolean);
      const title = compactCharacterIndexText(profile.title, 40);
      const summary = compactCharacterIndexText(profile.summary, 120);
      return `- ${name}${aliases.length ? `（别名：${aliases.join('、')}）` : ''}${title ? `｜${title}` : ''}${summary ? `｜${summary}` : ''}`;
    });
  return lines.join('\n') || '- （暂无允许主动登场的扩展角色）';
}

async function syncExtensionCharacterIndex() {
  const worldbook = globalThis.getWorldbook ?? window.parent?.getWorldbook;
  const replaceWorldbook = globalThis.createOrReplaceWorldbook ?? window.parent?.createOrReplaceWorldbook;
  if (typeof worldbook !== 'function' || typeof replaceWorldbook !== 'function') return false;
  const entries = await worldbook(getWorldbookName());
  const manifest = `<!-- CANMING_CUSTOM_CHARACTER_INDEX_START -->\n${buildExtensionCharacterIndex()}\n<!-- CANMING_CUSTOM_CHARACTER_INDEX_END -->`;
  let changed = false;
  const updated = entries.map(entry => {
    if (!(entry.name || '').includes('扩展角色索引')) return entry;
    const content = String(entry.content || '');
    const nextContent = content.replace(
      /<!-- CANMING_CUSTOM_CHARACTER_INDEX_START -->[\s\S]*?<!-- CANMING_CUSTOM_CHARACTER_INDEX_END -->/,
      manifest,
    );
    if (nextContent === content) return entry;
    changed = true;
    return { ...entry, content: nextContent };
  });
  if (changed) await replaceWorldbook(getWorldbookName(), updated, { render: 'immediate' });
  return changed;
}

async function savePortraitEntry(originalName) {
  try {
    const name = originalName;
    const profile = findCharacterProfileByName(name);
    if (!profile) throw new Error('请先在角色管理器创建角色档案');
    const aliases = profile.aliases || [];
    const title = profile.title || '自定义角色';
    const summary = profile.summary || '';
    const portraits = parsePortraitRows();
    const enabled = Boolean(portraitField('enabled')?.checked);
    const library = getPortraitLibrary();
    const oldEntry = library.entries[originalName];
    if (originalName && originalName !== name && oldEntry?.source === 'custom') delete library.entries[originalName];
    const linkedProfile = findCharacterProfileByName(name) || findCharacterProfileByName(originalName);
    library.entries[name] = {
      ...oldEntry,
      name,
      aliases,
      title: linkedProfile?.title || oldEntry?.title || '自定义角色',
      summary: linkedProfile?.summary || oldEntry?.summary || '',
      gallery: normalizePortraitGallery(linkedProfile?.gallery ?? oldEntry?.gallery, oldEntry?.source),
      enabled,
      portraits,
      source: oldEntry?.source || 'custom',
    };
    delete library.entries[name].persona;
    savePortraitLibrary(library);
    await syncPortraitIllustrationRule();
    modalState = {
      type: 'character-studio',
      id: findCharacterProfileByName(name)?.id || '',
      section: 'portraits',
      worldbookEntries: modalState.worldbookEntries || [],
      selectedWorldbookEntries: findCharacterProfileByName(name)?.worldbookEntries || [],
    };
    renderModalOnly();
    showToast(`✓ 已保存「${name}」的立绘，并同步正文插图清单`, 'ok');
  } catch (error) {
    showToast(`✗ 保存立绘失败：${error?.message || '未知错误'}`, 'err');
  }
}

async function removePortraitEntry(name) {
  const library = getPortraitLibrary();
  const entry = library.entries[name];
  if (!entry || entry.source !== 'custom') return showToast('✗ 内置角色不能在此删除', 'err');
  if (
    !(await canmingUiDialog(`确定删除自定义角色「${name}」及其立绘吗？`, {
      title: '删除自定义立绘',
      confirmText: '删除',
      danger: true,
    }))
  )
    return;
  delete library.entries[name];
  savePortraitLibrary(library);
  try {
    await syncPortraitIllustrationRule();
  } catch (error) {
    console.warn('[状态栏] 同步正文插图清单失败:', error);
  }
  modalState = {
    type: 'character-studio',
    id: '',
    section: 'portraits',
    worldbookEntries: [],
    selectedWorldbookEntries: [],
  };
  showToast(`✓ 已删除「${name}」`, 'ok');
}

async function bootstrap() {
  const parentDocument = window.parent?.document ?? document;
  const parentWindow = window.parent ?? window;
  exposeStatusbarActions();
  const portraitLibrary = getPortraitLibrary();
  window.CanmingPortraitLibrary = portraitLibrary;
  if (window.parent && window.parent !== window) window.parent.CanmingPortraitLibrary = portraitLibrary;
  try {
    await syncExtensionCharacterIndex();
  } catch (error) {
    console.warn('[状态栏] 同步扩展角色索引失败:', error);
  }

  // 清除旧实例
  parentDocument.getElementById(STATUSBAR_ID)?.remove();
  parentDocument.getElementById('canming-lamp')?.remove();
  parentDocument.getElementById('canming-lamp-style')?.remove();
  parentDocument.getElementById('canming-lamp-font')?.remove();

  // === 在父文档创建灯（与参考脚本的 bubble 完全一致） ===
  lamp = parentDocument.createElement('div');
  lamp.id = 'canming-lamp';
  lamp.title = '残明余烬';
  lamp.setAttribute('aria-label', '打开状态栏');
  lamp.innerHTML = '<span class="cm-seal-char">明</span>';
  Object.assign(lamp.style, {
    position: 'fixed',
    border: '1.5px solid #b54a3a',
    borderRadius: '8px',
    background: '#120e0a',
    boxShadow: '0 6px 20px rgba(0,0,0,.6)',
    cursor: 'grab',
    display: 'grid',
    placeItems: 'center',
    padding: '0',
    zIndex: '100000',
    touchAction: 'none',
    userSelect: 'none',
  });
  parentDocument.body.append(lamp);

  // 灯的内框 ::before 伪元素需要通过 style 标签注入
  const lampStyle = parentDocument.createElement('style');
  lampStyle.id = 'canming-lamp-style';
  lampStyle.textContent = `
    #canming-lamp .cm-seal-char {
      font-family: "EBAS", serif;
      font-size: 28px;
      color: #c85340;
      text-shadow: 0 0 3px rgba(195,70,50,.45);
      line-height: 1; opacity: .94;
      position: relative; z-index: 1;
    }
    #canming-lamp::before {
      content: "";
      position: absolute; inset: 3px;
      border: 0.5px solid rgba(180,70,55,.2);
      border-radius: 5px;
      pointer-events: none; z-index: 0;
    }
    #canming-lamp:active { cursor: grabbing; }
  `;
  parentDocument.head.append(lampStyle);

  // 在父文档加载 EBAS 字体
  const fontLink = parentDocument.createElement('link');
  fontLink.id = 'canming-lamp-font';
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fontsapi.zeoseven.com/37/main/result.css';
  parentDocument.head.append(fontLink);

  // === 创建 iframe（仅用于面板） ===
  frame = parentDocument.createElement('iframe');
  frame.id = STATUSBAR_ID;
  frame.title = '残明余烬·状态栏';
  frame.setAttribute('aria-label', '残明余烬状态栏');
  frame.style.display = 'none';
  parentDocument.body.append(frame);
  frameDocument = frame.contentDocument;
  writeFrameDocument();
  settleSessionId = Date.now().toString(36);
  loadIframeScripts();
  bindFrameEvents();

  // 初始灯位置
  applyLampLayout();

  // === 拖拽：完全照抄参考脚本的模式 ===
  lamp.addEventListener('pointerdown', onLampDown);
  lamp.addEventListener('touchstart', onLampDown, { passive: false });
  parentWindow.addEventListener('pointermove', onLampMove);
  parentWindow.addEventListener('touchmove', onLampMove, { passive: false });
  parentWindow.addEventListener('pointerup', onLampUp);
  parentWindow.addEventListener('touchend', onLampUp);

  // 点击灯 → 打开面板（拖拽过则跳过）
  lamp.addEventListener('click', () => {
    if (lampDragJustEnded) return;
    if (!lampDragMoved) {
      lampDragMoved = false;
      isOpen = true;
      applyFrameLayout();
      render();
      refreshData(true);
    }
    lampDragMoved = false;
  });

  try {
    await waitForMvu();
  } catch {
    /* 保持控件可见 */
  }
  refreshData(true);

  // MVU 事件驱动刷新（优先）
  const mvu = globalThis.Mvu ?? window.parent?.Mvu;
  if (mvu?.events?.VARIABLE_UPDATE_ENDED) {
    const onVarUpdate = (newVars, oldVars) => {
      normalizeStatDataKeys(_.get(newVars, 'stat_data', null));
      normalizeStatDataKeys(_.get(oldVars, 'stat_data', null));
      // 自动月度结算：检测月份变化，就地执行结算
      try {
        const oldDate = _.get(oldVars, 'stat_data.世界运转.当前日期', '');
        const newDate = _.get(newVars, 'stat_data.世界运转.当前日期', '');
        const oldYM = extractYearMonth(oldDate);
        const newYM = extractYearMonth(newDate);
        const data = _.get(newVars, 'stat_data', null);
        if (oldYM && newYM && oldYM !== newYM) {
          if (data) resetMonthlyMarketStock(data, newYM);
          if (loadStorage('last_closed_army_ym', '') !== oldYM) {
            const settleResult = doSettlementInPlace(newVars, { closeYM: oldYM, applyArmy: true });
            saveStorage('last_closed_army_ym', oldYM);
            // 自动结算 toast：面板打开时立即可见
            if (settleResult && isOpen) {
              const grainInfo = settleResult.grain?.grainConsumed ? `耗粮 ${settleResult.grain.grainConsumed} 石` : '';
              const silverInfo = settleResult.grain?.silverSpent ? `折银 ${settleResult.grain.silverSpent} 两` : '';
              const shortageInfo = settleResult.grain?.shortage ? `缺口 ${settleResult.grain.shortage} 石` : '';
              const extra = [grainInfo, silverInfo, shortageInfo].filter(Boolean).join(' · ');
              showToast(
                `✓ 已自动结算 ${oldYM}（私库 ${settleResult.totalTransfer >= 0 ? '+' : ''}${settleResult.totalTransfer} 两${extra ? '，' + extra : ''}）`,
                'ok',
              );
            }
          }
          saveStorage('last_settled_ym', newYM);
        } else if (newYM && data) {
          ensureMarketState(data, newYM);
          if (!loadStorage('last_settled_ym', '')) {
            // 初次进入/导入旧档时只记录当前月份，不触发结算，避免误清账
            saveStorage('last_settled_ym', newYM);
          }
        } else {
          reconcileEconomy(data);
        }
      } catch (e) {
        /* 静默，结算失败不影响变量更新 */
      }
      // 十二时辰自动同步：根据二十四时计算，AI 无需手动写入
      try {
        const h = _.get(newVars, 'stat_data.世界运转.二十四时.小时');
        const m = _.get(newVars, 'stat_data.世界运转.二十四时.分钟');
        const shichen = computeShichen(h, m);
        if (shichen) {
          if (!_.get(newVars, 'stat_data.世界运转.十二时辰')) {
            _.set(newVars, 'stat_data.世界运转.十二时辰', {});
          }
          _.set(newVars, 'stat_data.世界运转.十二时辰.时辰', shichen.时辰);
          _.set(newVars, 'stat_data.世界运转.十二时辰.刻', shichen.刻);
        }
      } catch (e) {
        /* 静默 */
      }
      // 生育系统推进：根据 AI 更新的世界运转天数计算日差
      try {
        const newDay = _.get(newVars, 'stat_data.世界运转.世界运转天数');
        const oldDay = _.get(oldVars, 'stat_data.世界运转.世界运转天数');
        if (typeof newDay === 'number' && typeof oldDay === 'number' && newDay > oldDay) {
          const days = Math.min(newDay - oldDay, 60); // 上限60天，防止异常值
          advanceReproductiveSystem(newVars, days, oldDay);
        }
      } catch (e) {
        /* 静默 */
      }
      if (isOpen) refreshData(true);
    };
    window._canmingMvuHandler = onVarUpdate;
    eventOn(mvu.events.VARIABLE_UPDATE_ENDED, onVarUpdate);
  }

  // 世界书发生外部修改时，同步设置面板显示
  try {
    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
      eventOn(tavern_events.WORLDINFO_UPDATED, () => syncWorldbookSettings());
      eventOn(tavern_events.WORLDINFO_SETTINGS_UPDATED, () => syncWorldbookSettings());
    }
  } catch {
    /* 旧版本酒馆没有这些事件时忽略 */
  }

  // 轮询作为降级方案
  refreshTimer = setInterval(checkLatestMessage, 10000);
  window.addEventListener('pagehide', cleanup, { once: true });

  const onResize = () => {
    const width = parentWindow.innerWidth;
    const cur = `${width}x${parentWindow.innerHeight}`;
    if (cur === lastViewport) return;
    // 移动端软键盘会只改变可视高度。此时若全量 render，会重建 iframe 的 body，
    // 从而删除挂载在其中的万象生成器/变量修改器。
    // 仅在宽度变化（如横竖屏切换）时重渲染，以更新移动端专用样式。
    const previousWidth = Number(lastViewport.split('x', 1)[0]);
    const widthChanged = Boolean(lastViewport) && Number.isFinite(previousWidth) && previousWidth !== width;
    lastViewport = cur;
    applyLampLayout();
    if (isOpen) {
      applyFrameLayout();
      if (widthChanged) render();
    }
    // ECharts resize
    if (echartsInstance) {
      try {
        echartsInstance.resize();
      } catch {
        /* ignore */
      }
    }
  };
  parentWindow.addEventListener('resize', onResize);
  // 保存引用用于 cleanup
  window._canmingOnResize = onResize;
  window._canmingParentWindow = parentWindow;
}

function cleanup() {
  getCanmingWorkshop()?.destroy?.();
  getCharacterGenerator()?.close?.();
  clearInterval(refreshTimer);
  cleanupWorkshopNoticePolling();
  if (echartsInstance) {
    echartsInstance.dispose();
    echartsInstance = null;
  }
  frame?.remove();
  lamp?.remove();
  const parentDocument = window.parent?.document ?? document;
  const parentWindow = window.parent ?? window;
  if (parentWindow.CanmingStatusbarActions?._owner === STATUSBAR_ACTIONS_OWNER)
    delete parentWindow.CanmingStatusbarActions;
  parentDocument.getElementById('canming-lamp-style')?.remove();
  parentDocument.getElementById('canming-lamp-font')?.remove();
  if (window._canmingOnResize && window._canmingParentWindow) {
    window._canmingParentWindow.removeEventListener('resize', window._canmingOnResize);
  }
}

$(() => {
  registerWorkshopNoticeSync();
  bootstrap();
  startWorkshopNoticePolling();
});
