(() => {
  'use strict';

  const API_NAME = 'CanmingCharacterGenerator';
  const ROOT_ID = 'canming-character-generator-root';
  const STYLE_ID = 'canming-character-generator-style';
  const STORAGE_KEY_API = 'canming-dlc-staging:generator:api';
  const STORAGE_KEY_UI = 'canming-dlc-staging:generator:ui';
  const STORAGE_KEY_CUSTOM = 'canming-dlc-staging:generator:custom-modules';
  const STORAGE_KEY_ORDER = 'canming-dlc-staging:generator:order';

  const DEFAULT_MODULES = [
    {
      id: 'character', name: '角色', tag: '角色', icon: '人', isDefault: true,
      sys: `写作铁律：
1. 经历决定性格——只写事实、场景、身体/感官细节，不写"TA变成了怎样的人"这类心理分析。让读到经历的人自己理解角色，而不是被告知性格标签。
2. 锚定稀缺——每个性格锚定只出现一次，用了就不再重复。一个好锚词胜过十句解释。
3. 信息分散不集中——同一特征的不同侧面分散到不同段落和场景里，不要集中在一处说完。强迫 AI 综合理解，而不是抄一段标签。
4. 带倾向叙述——每句话都带着角色本人的语气和立场，不用中性旁白的口吻。

经历写法：
- 写"发生了什么"，不写"变成了什么样"
- 有具体的时间锚点（哪一年、几岁）、地点、人物、身体感受
- 每段经历末尾嵌入1-2句角色当时说的话（语例），用引号括起来
- 用角色自己的语气来讲这段经历

对话与行为事实：
- 对话要有辨识度——口语/文绉、话多/话少、直球/绕弯，反映阶层和性格
- 行为要有张力——在人前和人后不一样，嘴上说的和心里想的不一样
- 给出角色底线：什么事 TA 死也不会做？被逼到墙角 TA 会怎么反应？

必须覆盖的维度：
- 深层欲望：TA 最想要什么？不是表面的那种，是埋在行为下面真正驱动 TA 的那个东西
- 核心恐惧：TA 最怕什么？这个恐惧让 TA 避开哪些事、做出哪些看似不合理的选择？
- 真实缺点：不是"太善良""太努力"这种，是虚荣、算计、自私、怯懦、逃避——真的会让人不舒服的那种
- 矛盾：每个有意思的角色都有不可爱的时候。TA 什么时候最让人想翻白眼？
- 互动钩子：别人怎么进入 TA 的势力范围？TA 会给主角制造什么麻烦，或者提供什么机会？

残明余烬世界观：
明末乱世，饥荒兵祸，地方势力割据，人情债大如天，钱粮永远不够，礼法压着私欲。角色的每个选择都应该能感受到这个时代压在 TA 身上的重量。`,
      namePrompt: '',
      fields: [],
      userPromptTemplate: `为残明余烬世界观生成一个角色。

基本设定：
- 姓名：{name}
- 性别：{gender}
- 年龄：{age}
- 身份/阶层：{identity}
- 与主角关系：{relation}
- 所在地点：{location}
- 所属势力：{faction}
- 角色功能：{role}
- 文风倾向：{tone}
- 外貌提示：{appearance}
- NSFW边界/偏好：{kinkBoundary}
- 体貌提示：{physique}
- 关键词偏好：{keywordHint}
- 补充说明：{extra}

sfw_content 请严格按照以下格式编写，直接作为世界书正文：

<角色设定:{nameTag}_SFW>
使用说明: 本文件为角色内化参考，供AI理解角色使用。所有设定条目应转化为角色的行为、语言、思维方式与情绪节奏，不得在正文叙述或对话中直接点出、复述或暗示设定本身。设定是理解的底层，不是写作的输出。

[基础]
全名：{name}
别称：如有，AI 根据角色经历补充
基调：用一个外语锚词（6字以内）定调角色的内核矛盾或生命驱力——不是性格概括，是TA这辈子被什么东西推着走。

核心身份
  性别：{gender}
  年龄：{age}
  身份/阶层：{identity}
  所在地：{location}  |  所属势力：{faction}
  与主角关系：{relation}
  标签：3-5个短词，快速标记角色在故事生态位里的位置。例：亡国遗孤 / 两头受气的中间人 / 表面忠仆暗里赌徒

背景
  出身：用带角色倾向的语气写，不要纯客观。重点写塑造了TA信念的家庭环境——缺了什么、多了什么、被什么压着长大。2-3句即可。
  当下处境：TA此刻的生存状态——靠什么吃饭、住在什么样的地方、和谁一起、有什么甩不掉的麻烦。2-3句。

[外貌]
用角色第一人称的语气自述外貌——不是客观描写，是TA照镜子时会怎么想、怎么说。
- 信息里夹带对自己的评价：满意什么、嫌弃什么、嘴上说不在乎其实偷偷在补的
- 穿衣打扮透露信息：什么场合换什么行头、哪件是舍不得扔的旧东西、哪处是刻意给人看的
- 同时完成三件事：写出外貌 + 传递性格 + 积累语料
- 禁止客观旁白式的"她身高xxx""她长得很美""五官精致"

[锚点]
用2-4个小众外语词（法语/德语/拉丁语/希腊语等）作为角色锚点标题。每个锚词配一段50-80字的行为事实描述——只写TA做什么、怎么做，不写TA"是怎样的性格"。锚词之间不要写明关联，让AI读到后自己建立联系。

[经历]
写2-3段关键人生经历。每段：
- 有具体时间（哪一年/几岁）、地点、身体感受或感官细节
- 只记载事实和场景，绝对不做心理分析（不写"因此TA变得xxx"）
- 末尾嵌入1-2句角色当时会说的话，用引号括起来
- 用角色自己的语气来叙述这段经历（不用中性旁白）

[话语]
- 概括角色说话的特点：语速、用词习惯、句式长短、口头禅
- 给2-3句典型对话示例（不同场景、不同情绪下的说话方式）

[驱动]
- 深层欲望：TA最想要的是什么？（一行，不要展开分析）
- 核心恐惧：TA最怕什么？（一行）
- 真实缺点：不是"太善良"，是虚荣、算计、怂、逃避——真的会让人不舒服的那种（一行）
- 矛盾：TA在什么情况下会表现得和平时判若两人？（一行）

[钩子]
- 底线：什么事TA死也不会做？
- 互动入口：别人怎么和TA发生关联？TA会给主角制造什么麻烦或机会？

</角色设定:{nameTag}_SFW>

nsfw_content 请从 SFW 本体自然生长出来，不要割裂。格式如下：

<角色设定:{nameTag}_NSFW>

[体貌]
用角色自己的感知来写——不是客观体检，是TA在亲密中对自己的身体知道什么、在意什么。
- 只写SFW外貌里没写到的、NSFW场景下才会暴露的细节
- 皮肤的触感差异（常年见光 vs 常年藏着的部位）、紧张或动情时身体哪里先有反应、自己知道但不想让人看出来的事
- 不重复基础外貌，3-5句即可。禁止三围数字和体检报告式罗列

[亲密锚点]
1-2个外语锚词，刻画TA在亲密关系中的行为模式——不是描写身体，是写TA的态度、节奏、权力姿态。

[欲望地图]
TA在亲密情境中追求什么感觉？被支配/支配/被需要/被摧毁/被崇拜？这和TA的深层欲望（见SFW）有什么关联？

[羞耻与边界]
TA不想被碰触的点——不是身体部位，是心理上的。什么事会让TA在亲密中突然冷下来或翻脸？

[亲密语例]
2-3句在亲密情境中TA会说的话（可以和SFW中的话语方式对照，看同一个人在不同场景下怎么说话）。

</角色设定:{nameTag}_NSFW>`,
    },
    {
      id: 'item', name: '物品', tag: '物品', icon: '物', isDefault: true,
      sys: '你是《残明余烬1.3》的多功能世界书生成助手。当前模块：物品。生成一件适合明末乱世剧情使用的物品。强调外观质感、来历、用途、限制、可引发的剧情变数。必须输出 JSON，不要输出解释。内容要能直接写入世界书，风格克制、具体、有互动钩子。',
      namePrompt: '为这件物品构思一个精准且引人入胜的名称。',
      fields: [
        { name: '外观形态', pmt: '描写物品的大小、主要材质、颜色、气味，以及它在静止或被激活时的视觉表现。' },
        { name: '功能与机制', pmt: '详细说明该物品的作用、它的深层运行原理或者是其蕴含的超自然效果。' },
        { name: '来历传闻', pmt: '简述这件物品的最初锻造者、前任主人，或者围绕它发生过的坊间传说。' },
        { name: '负面限制', pmt: '严谨描述使用该物品必须付出的代价、前置条件，或者是引发反噬的致命安全缺陷。' },
      ],
    },
    {
      id: 'faction', name: '势力', tag: '势力', icon: '营', isDefault: true,
      sys: '你是《残明余烬》的多功能世界书生成助手。当前模块：势力。生成一个明末乱世中的组织或势力——流寇营寨、江湖帮会、商会、宗族、教门均可。强调组织结构、首领特质、核心诉求、与其他势力的恩怨纠葛。必须输出 JSON，不要输出解释。内容要能直接写入世界书，风格克制、具体、有互动钩子。',
      namePrompt: '为该势力起一个响亮且符合时代气息的名称（如：安庆十三舵、黑风岭绺子）。',
      fields: [
        { name: '势力概况', pmt: '概述该势力的类型（官/寇/商/教/民）、规模、活动范围、存在时间，以及外人对它的普遍印象。' },
        { name: '首领与核心', pmt: '描写势力的首领或核心决策层——他们的行事风格、掌控手段、内部是否有派系裂痕。' },
        { name: '诉求与手段', pmt: '该势力存在的根本目的（求财、传教、复仇、自保），以及他们为实现目的惯用的手段。' },
        { name: '剧情钩子', pmt: '该势力与主角可能产生交集的方式——招揽、冲突、交易、渗透，以及他们能给主角提供什么或威胁什么。' },
      ],
    },
    {
      id: 'event', name: '事件', tag: '事件', icon: '事', isDefault: true,
      sys: '你是《残明余烬1.3》的多功能世界书生成助手。当前模块：事件。推演并立刻生成一场能改变现状的突发事件，拒绝平淡安稳，制造极具张力的戏剧冲突！必须输出 JSON，不要输出解释。内容要能直接写入世界书，风格克制、具体、有互动钩子。',
      namePrompt: '为这场随机突发事件起一个极具戏剧张力的名字（如：血月之反叛）。',
      fields: [
        { name: '事件肇始', pmt: '描写事件最初被触发爆发时的细微征兆或第一接触画面（例如：突兀的巨响、通讯的中断、地面的猛颤）。' },
        { name: '核心冲突', pmt: '详细勾勒事件爆发的后果、危险波及程度，以及它正在采取何种手段直接威胁主角团。' },
        { name: '牵涉因素', pmt: '交代这场事件背后是否有暗推手、无辜卷入的第三方，或者是某种巧合产生的碰撞。' },
        { name: '破局关键', pmt: '给出1至2个摆在角色面前的艰难选择，或者暗示现场遗留着的一丝可能的解决途径。' },
      ],
    },
  ];

  const DEFAULT_FORM = {
    name: '',
    gender: '',
    age: '',
    identity: '',
    relation: '',
    location: '',
    faction: '',
    role: '',
    tone: '',
    appearance: '',
    kinkBoundary: '',
    physique: '',
    keywordHint: '',
    extra: '',
    genNsfw: true,
  };

  const DEFAULT_GENERIC_FORM = {
    topic: '',
    style: '',
    keywords: '',
    extra: '',
  };

  let mountDocument = document;
  let options = {};
  let root = null;
  let isOpen = false;
  let dirty = false;

  let state = {
    module: 'character',
    form: { ...DEFAULT_FORM },
    genericForm: { ...DEFAULT_GENERIC_FORM },
    result: null,
    genericResult: null,
    activeTab: 'sfw',
    feedback: '',
    loading: false,
    error: '',
    targetWorldbook: '',
    activeView: 'generator',
  };

  let apiSettings = {
    apiType: 'openai', apiUrl: '', apiKey: '', model: '',
    temperature: 0.8, maxTokens: 12000, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0,
  };

  let globalCfg = {
    limitBreakPrompt: '你是一个强大的创作助手，拥有极强的发散想象能力。',
    charExtractTag: '', userExtractTag: '', excludeRegexes: [],
    historyMax: 4, wbTri: 'selective', wbPos: 'after_character_definition', wbOrd: 100,
  };

  let customModuleDefs = {};
  let moduleOrder = [];
  let modules = [];

  // 世界书参考
  const STORAGE_KEY_WB = 'canming-dlc-staging:generator:worldbook-selection';
  let curCharName = '';
  let allWbNames = [];
  let activeRoleWorldbook = null;
  let wbCacheMap = {};
  let savedWbSelections = {};
  let wbViewing = null; // 当前下拉框选中的世界书名

  // ============================================
  // 工具函数
  // ============================================
  function api(name) { return globalThis[name] ?? window.parent?.[name]; }

  function html(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[ch]));
  }

  function ensureArray(value) {
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(/[，,\n]/).map(v => v.trim()).filter(Boolean);
    return [];
  }

  function uniq(list) { return [...new Set(list.map(v => String(v).trim()).filter(Boolean))]; }
  function splitKeywords(value) { return uniq(String(value || '').split(/[，,\n]/).map(v => v.trim()).filter(Boolean)); }
  function joinKeywords(list) { return ensureArray(list).join('，'); }
  function lineValue(label, value) { return value ? `${label}: ${value}\n` : ''; }

  function adultAge(raw) {
    const age = Number.parseInt(raw, 10);
    if (!Number.isFinite(age) || age < 18) return 18;
    return Math.min(age, 99);
  }

  function currentModule() { return modules.find(m => m.id === state.module) || modules[0]; }
  function entryName(base, suffix) { const name = String(base || '').trim() || '未命名角色'; return `${name}_${suffix}`; }
  function uuid() { return 'xxxx-xxxx-xxxx'.replace(/[x]/g, () => (Math.random() * 16 | 0).toString(16)); }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = mountDocument.createElement('a');
    a.href = url;
    a.download = filename;
    mountDocument.body.appendChild(a);
    a.click();
    mountDocument.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ============================================
  // 存储
  // ============================================
  function saveStorage(key, data) {
    try { (mountDocument.defaultView || window).localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
  }
  function loadStorage(key, defaultVal) {
    try {
      const raw = (mountDocument.defaultView || window).localStorage.getItem(key);
      if (!raw) return defaultVal;
      const parsed = JSON.parse(raw);
      if (Array.isArray(defaultVal)) return Array.isArray(parsed) ? parsed : defaultVal;
      return { ...defaultVal, ...parsed };
    } catch { return defaultVal; }
  }

  function loadAllSettings() {
    apiSettings = loadStorage(STORAGE_KEY_API, apiSettings);
    globalCfg = loadStorage(STORAGE_KEY_UI, globalCfg);
    customModuleDefs = loadStorage(STORAGE_KEY_CUSTOM, {});
    moduleOrder = loadStorage(STORAGE_KEY_ORDER, []);
    compileModules();
  }

  function saveAllSettings() {
    saveStorage(STORAGE_KEY_API, apiSettings);
    saveStorage(STORAGE_KEY_UI, globalCfg);
  }

  function saveCustomModules() {
    saveStorage(STORAGE_KEY_CUSTOM, customModuleDefs);
    saveStorage(STORAGE_KEY_ORDER, moduleOrder);
    compileModules();
  }

  // ============================================
  // SVG 图标
  // ============================================
  function svgIcon(name) {
    const icons = {
      person: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.4 8.4 0 0 1 13 0"/></svg>',
      cube: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
      flag: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
      bolt: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      books: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
      wrench: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
      sliders: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    };
    return icons[name] || '';
  }

  function moduleIcon(id) {
    const map = { character: 'person', item: 'cube', faction: 'flag', event: 'bolt' };
    return svgIcon(map[id] || '') || '';
  }

  function compileModules() {
    modules = DEFAULT_MODULES.map(d => {
      const over = customModuleDefs[d.id];
      if (!over) return { ...d };
      return { ...d, ...over, id: d.id, isDefault: true };
    });
    const customs = [];
    Object.values(customModuleDefs).forEach(c => {
      if (!c.id.startsWith('def_') && !DEFAULT_MODULES.find(d => d.id === c.id)) {
        customs.push(c);
      }
    });
    modules = [...modules, ...customs];
    if (moduleOrder.length > 0) {
      modules.sort((a, b) => {
        const ia = moduleOrder.indexOf(a.id), ib = moduleOrder.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
    }
    if (!modules.find(m => m.id === state.module)) state.module = modules[0]?.id || 'character';
  }

  // ============================================
  // 世界书参考
  // ============================================
  function loadWbSelections() {
    savedWbSelections = loadStorage(STORAGE_KEY_WB, {});
    if (!savedWbSelections[curCharName]) savedWbSelections[curCharName] = {};
  }

  function saveWbSelections() {
    saveStorage(STORAGE_KEY_WB, savedWbSelections);
  }

  async function ensureWbFetched(wbName) {
    if (!wbName || wbCacheMap[wbName]) return;
    const getWorldbook = api('getWorldbook');
    if (typeof getWorldbook === 'function') {
      const arr = await getWorldbook(wbName);
      wbCacheMap[wbName] = arr || [];
    } else {
      wbCacheMap[wbName] = [];
    }
  }

  async function loadWorldbookContext() {
    try {
      const getCharName = api('getCurrentCharacterName') || api('getCharData');
      if (typeof getCharName === 'function') {
        const name = await getCharName('current');
        curCharName = (name?.name || name || '').toString();
      }
    } catch { curCharName = '全局通用'; }
    if (!curCharName) curCharName = '全局通用';

    loadWbSelections();

    try {
      const getNames = api('getWorldbookNames');
      if (typeof getNames === 'function') allWbNames = await getNames() || [];
      const getCharWb = api('getCharWorldbookNames');
      if (typeof getCharWb === 'function') {
        const binds = await getCharWb('current');
        activeRoleWorldbook = binds?.primary || (binds?.additional && binds.additional[0]) || null;
        if (activeRoleWorldbook) {
          if (!savedWbSelections[curCharName][activeRoleWorldbook]) {
            savedWbSelections[curCharName][activeRoleWorldbook] = { enabled: true, entries: [] };
          }
          await ensureWbFetched(activeRoleWorldbook);
        }
      }
    } catch { /* ignore */ }
  }

  function getSelectedWbContent() {
    const charData = savedWbSelections[curCharName] || {};
    const parts = [];
    for (const wb of Object.keys(charData)) {
      if (charData[wb].enabled && charData[wb].entries?.length > 0) {
        const entries = (wbCacheMap[wb] || []).filter(e => charData[wb].entries.includes(e.name));
        if (entries.length > 0) {
          const text = entries.map(e => `[${wb} / ${e.name}]\n${e.content}`).join('\n\n');
          parts.push(text);
        }
      }
    }
    return parts.join('\n\n');
  }

  function renderWorldbookPanel() {
    var charData = savedWbSelections[curCharName] || {};

    // 收集所有可用的世界书（有选中条目的 + 当前角色绑定的）
    var available = [];
    var seen = {};
    if (activeRoleWorldbook) { available.push(activeRoleWorldbook); seen[activeRoleWorldbook] = true; }
    Object.keys(charData).forEach(function(k) {
      var c = charData[k];
      if (c && c.entries && c.entries.length > 0 && !seen[k]) { available.push(k); seen[k] = true; }
    });
    if (allWbNames && allWbNames.length) {
      allWbNames.forEach(function(n) { if (!seen[n]) { available.push(n); seen[n] = true; } });
    }

    if (available.length === 0) return '<div class="ccg-note">暂无世界书 — 请先为角色绑定世界书</div>';

    // 确定当前查看的世界书
    if (!wbViewing || available.indexOf(wbViewing) === -1) wbViewing = available[0];

    // 下拉框选项
    var selectHtml = '<select id="ccg-wb-select" style="width:100%;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);padding:6px 8px;font:inherit;margin-bottom:10px;">';
    for (var i = 0; i < available.length; i++) {
      var wbn = available[i];
      var sel = wbn === wbViewing ? ' selected' : '';
      // 标记哪些世界书有已选条目
      var cnt = (charData[wbn] && charData[wbn].entries) ? charData[wbn].entries.length : 0;
      var label = wbn + (cnt > 0 ? ' (' + cnt + ')' : '');
      selectHtml += '<option value="' + html(wbn) + '"' + sel + '>' + html(label) + '</option>';
    }
    selectHtml += '</select>';

    // 当前世界书的条目列表
    var entries = wbCacheMap[wbViewing] || [];
    if (entries.length === 0) {
      // 尝试加载
      ensureWbFetched(wbViewing);
    }
    entries.sort(function(a, b) { return (a.position && a.position.order || 100) - (b.position && b.position.order || 100); });

    var cnf = charData[wbViewing] || {};
    var selectedSet = {};
    if (cnf.entries) for (var j = 0; j < cnf.entries.length; j++) selectedSet[cnf.entries[j]] = true;

    var entryHtml = '';
    if (entries.length === 0) {
      entryHtml = '<div style="font-size:12px;opacity:.5;padding:6px;text-align:center;">该世界书无条目或尚未加载</div>';
    } else {
      var selAllBtn = '<button class="ccg-wb-sel-all" data-wb="' + html(wbViewing) + '" style="border:none;background:none;color:var(--accent);cursor:pointer;font-size:11px;padding:2px 4px;">全选</button>';
      var cancelAll = '<button class="ccg-wb-unsel-all" data-wb="' + html(wbViewing) + '" style="border:none;background:none;color:var(--accent);cursor:pointer;font-size:11px;padding:2px 4px;">取消全选</button>';
      var itemParts = [];
      for (var k = 0; k < entries.length; k++) {
        var e = entries[k];
        var checked = selectedSet[e.name] ? ' checked' : '';
        itemParts.push('<label class="ccg-wb-entry-row" data-wb-entry-name="' + html(e.name) + '" style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:13px;cursor:pointer;">' +
          '<input type="checkbox" class="ccg-wb-entry" data-wb="' + html(wbViewing) + '" data-en="' + html(e.name) + '"' + checked + '>' +
          '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + html(e.name) + '</span></label>');
      }
      entryHtml = '<div style="display:flex;gap:8px;margin-bottom:6px;">' + selAllBtn + cancelAll + '</div>' +
        '<input class="ccg-wb-search" data-wb-search type="search" placeholder="搜索当前世界书条目" aria-label="搜索当前世界书条目" style="width:100%;box-sizing:border-box;margin:0 0 6px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);padding:6px 8px;font:inherit;">' +
        '<div style="max-height:180px;overflow-y:auto;">' + itemParts.join('') + '<div class="ccg-wb-search-empty" style="display:none;font-size:12px;opacity:.55;padding:8px;text-align:center;">没有匹配的条目</div></div>';
    }

    // 全部世界书的已选条目汇总
    var totalCount = 0;
    var summaryParts = [];
    Object.keys(charData).forEach(function(wbn) {
      var c = charData[wbn];
      if (c && c.entries && c.entries.length > 0) {
        totalCount += c.entries.length;
        for (var m = 0; m < c.entries.length; m++) {
          var en = c.entries[m];
          summaryParts.push('<div style="display:flex;align-items:center;gap:4px;font-size:12px;padding:2px 0;">' +
            '<span style="opacity:.5;">[' + html(wbn) + ']</span> ' + html(en) +
            '<button class="ccg-wb-rm" data-wb="' + html(wbn) + '" data-en="' + html(en) + '" style="border:none;background:none;color:#b7522e;cursor:pointer;font-size:14px;padding:0 2px;" title="移除">×</button></div>');
        }
      }
    });

    var summaryHtml = '';
    if (totalCount > 0) {
      summaryHtml = '<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<span style="font-size:12px;font-weight:700;color:var(--ink);">已选 ' + totalCount + ' 个条目</span>' +
        '<button class="ccg-wb-clear" style="border:none;background:none;color:var(--accent);cursor:pointer;font-size:11px;">清空全部</button></div>' +
        '<div style="max-height:120px;overflow-y:auto;">' + summaryParts.join('') + '</div></div>';
    }

    return selectHtml + entryHtml + summaryHtml;
  }

  function filterWorldbookEntries(input) {
    const panel = input.closest('.ccg-overlay-body') || input.closest('#ccg-wb-panel');
    if (!panel) return;
    const query = input.value.trim().toLocaleLowerCase();
    let matchedCount = 0;
    panel.querySelectorAll('.ccg-wb-entry-row').forEach(row => {
      const name = row.getAttribute('data-wb-entry-name') || '';
      const matched = name.toLocaleLowerCase().includes(query);
      row.style.display = matched ? 'flex' : 'none';
      if (matched) matchedCount++;
    });
    const empty = panel.querySelector('.ccg-wb-search-empty');
    if (empty) empty.style.display = matchedCount > 0 ? 'none' : 'block';
  }
  function renderWorldbookCard() {
    return `<section class="ccg-card"><details open><summary style="cursor:pointer;font-weight:700;color:var(--accent);font-size:14px;letter-spacing:.06em;margin-bottom:8px;">${svgIcon('books')} 参考世界书</summary><div id="ccg-wb-panel">${renderWorldbookPanel()}</div></details></section>`;
  }

  function openWorldbookOverlay() {
    const ov = mountDocument.createElement('div');
    ov.className = `ccg-overlay theme-${options.theme || 'night'}`;
    ov.id = 'ccg-wb-overlay';
    ov.innerHTML = `<div class="ccg-overlay-box" style="width:min(560px,94vw);"><div class="ccg-overlay-head"><h3 style="margin:0;">${svgIcon('books')} 参考世界书</h3><button style="border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--muted);cursor:pointer;font-size:22px;width:34px;height:34px;display:grid;place-items:center;" onclick="this.closest('.ccg-overlay').remove()">×</button></div><div class="ccg-overlay-body">${renderWorldbookPanel()}</div></div>`;
    mountDocument.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.remove(); });
    ov.addEventListener('input', (e) => { if (e.target.matches?.('[data-wb-search]')) filterWorldbookEntries(e.target); });

    // 绑定内部世界书选择事件（复用已有逻辑）
    ov.querySelectorAll('.ccg-wb-entry').forEach(cb => {
      cb.addEventListener('change', function() {
        const charData = savedWbSelections[curCharName] || {};
        const wb = this.getAttribute('data-wb');
        const en = this.getAttribute('data-en');
        if (!charData[wb]) charData[wb] = { entries: [] };
        if (!charData[wb].entries) charData[wb].entries = [];
        if (this.checked) { if (charData[wb].entries.indexOf(en) === -1) charData[wb].entries.push(en); }
        else { charData[wb].entries = charData[wb].entries.filter(function(x) { return x !== en; }); }
        saveWbSelections();
        updateWbCount();
      });
    });
    ov.querySelectorAll('.ccg-wb-sel-all').forEach(b => { b.addEventListener('click', function() {
      const wb = this.getAttribute('data-wb');
      const charData = savedWbSelections[curCharName] || {};
      const arr = wbCacheMap[wb] || [];
      if (!charData[wb]) charData[wb] = { entries: [] };
      charData[wb].entries = arr.map(function(x) { return x.name; });
      saveWbSelections();
      ov.querySelector('.ccg-overlay-body').innerHTML = renderWorldbookPanel();
      bindWbOverlayEvents(ov); updateWbCount();
    }); });
    ov.querySelectorAll('.ccg-wb-unsel-all').forEach(b => { b.addEventListener('click', function() {
      const wb = this.getAttribute('data-wb');
      const charData = savedWbSelections[curCharName] || {};
      if (charData[wb]) charData[wb].entries = [];
      saveWbSelections();
      ov.querySelector('.ccg-overlay-body').innerHTML = renderWorldbookPanel();
      bindWbOverlayEvents(ov); updateWbCount();
    }); });
    ov.querySelectorAll('.ccg-wb-rm').forEach(b => { b.addEventListener('click', function() {
      const wb = this.getAttribute('data-wb');
      const en = this.getAttribute('data-en');
      const charData = savedWbSelections[curCharName] || {};
      if (charData[wb] && charData[wb].entries) {
        charData[wb].entries = charData[wb].entries.filter(function(x) { return x !== en; });
      }
      saveWbSelections();
      ov.querySelector('.ccg-overlay-body').innerHTML = renderWorldbookPanel();
      bindWbOverlayEvents(ov); updateWbCount();
    }); });
    if (ov.querySelector('.ccg-wb-clear')) {
      ov.querySelector('.ccg-wb-clear').addEventListener('click', function() {
        const charData = savedWbSelections[curCharName] || {};
        Object.keys(charData).forEach(function(wb) { if (charData[wb]) charData[wb].entries = []; });
        saveWbSelections();
        ov.querySelector('.ccg-overlay-body').innerHTML = renderWorldbookPanel();
        bindWbOverlayEvents(ov); updateWbCount();
      });
    }
  }

  function bindWbOverlayEvents(ov) {
    ov.querySelectorAll('.ccg-wb-entry').forEach(cb => {
      cb.addEventListener('change', function() {
        const charData = savedWbSelections[curCharName] || {};
        const wb = this.getAttribute('data-wb');
        const en = this.getAttribute('data-en');
        if (!charData[wb]) charData[wb] = { entries: [] };
        if (!charData[wb].entries) charData[wb].entries = [];
        if (this.checked) { if (charData[wb].entries.indexOf(en) === -1) charData[wb].entries.push(en); }
        else { charData[wb].entries = charData[wb].entries.filter(function(x) { return x !== en; }); }
        saveWbSelections();
        updateWbCount();
      });
    });
  }

  function updateWbCount() {
    const el = root?.querySelector('#ccg-wb-count');
    if (!el) return;
    const charData = savedWbSelections[curCharName] || {};
    let total = 0;
    Object.values(charData).forEach(function(c) { total += (c.entries || []).length; });
    el.textContent = total > 0 ? `${total} 本已选` : '';
  }

  // ============================================
  // CSS
  // ============================================
  function cssText() {
    return `
      #${ROOT_ID}{--paper:#211913;--paper2:#352619;--ink:#f2dfba;--muted:#b99f76;--line:rgba(237,196,128,.24);--accent:#d0784b;--accent2:#89a074;--shadow:rgba(0,0,0,.65);--card:rgba(65,44,30,.9);--glow:rgba(220,94,48,.28);position:absolute;inset:0;z-index:50;font-family:"Noto Serif SC","Songti SC","SimSun",serif;color:var(--ink);letter-spacing:0}
      #${ROOT_ID}.theme-day,.ccg-overlay.theme-day{--paper:#f4e7c7;--paper2:#ead6a6;--ink:#2c2118;--muted:#75624d;--line:rgba(96,65,36,.28);--accent:#a43d2d;--accent2:#6f8a67;--shadow:rgba(55,31,12,.35);--card:rgba(255,248,226,.88);--glow:rgba(188,83,42,.32)}
      #${ROOT_ID}.theme-night,.ccg-overlay.theme-night{--paper:#211913;--paper2:#352619;--ink:#f2dfba;--muted:#b99f76;--line:rgba(237,196,128,.24);--accent:#d0784b;--accent2:#89a074;--shadow:rgba(0,0,0,.65);--card:rgba(65,44,30,.9);--glow:rgba(220,94,48,.28)}
      #${ROOT_ID}.theme-star,.ccg-overlay.theme-star{--paper:#0d1820;--paper2:#111d28;--ink:#e6dcc8;--muted:#7d8fa0;--line:rgba(180,155,110,.22);--accent:#d4a040;--accent2:#5d8d9a;--shadow:rgba(0,0,0,.7);--card:rgba(18,28,38,.88);--glow:rgba(210,160,60,.2)}
      #${ROOT_ID}.theme-ink,.ccg-overlay.theme-ink{--paper:#eee9dc;--paper2:#d8d0bf;--ink:#171a17;--muted:#5f6158;--line:rgba(20,25,22,.24);--accent:#a12f25;--accent2:#2f6965;--shadow:rgba(25,30,24,.30);--card:rgba(248,245,235,.86);--glow:rgba(40,70,64,.18)}
      .ccg-mask{position:absolute;inset:0;background:rgba(18,12,8,.62);backdrop-filter:blur(4px);display:grid;place-items:center;padding:18px;animation:ccg-fade .16s ease}
      .ccg-modal{width:min(1060px,96vw);max-height:min(760px,94vh);display:grid;grid-template-rows:auto minmax(0,1fr) auto;border:1px solid var(--line);border-radius:18px;background:linear-gradient(135deg,var(--paper),var(--paper2));box-shadow:0 24px 80px var(--shadow);overflow:hidden}
      .ccg-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:16px 18px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.06)}
      .ccg-head-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}.ccg-head-gear{width:34px;height:34px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--muted);cursor:pointer;font-size:16px;line-height:1;display:inline-flex;align-items:center;justify-content:center;transition:.15s;flex-shrink:0}.ccg-head-gear:hover{color:var(--accent);border-color:var(--accent)}.ccg-head-gear.active{background:var(--accent2);border-color:var(--accent2);color:#fff;box-shadow:0 6px 14px rgba(137,160,116,.28)}
      .ccg-kicker{margin:0 0 3px;color:var(--accent);font-size:12px;letter-spacing:.22em}.ccg-head h2{margin:0;font-size:22px}.ccg-close{width:34px;height:34px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--muted);cursor:pointer;font-size:22px;line-height:1;flex-shrink:0}.ccg-close:hover{color:var(--accent);border-color:var(--accent)}
      .ccg-body{min-height:0;overflow:hidden;display:flex}
      .ccg-sidebar{width:52px;flex-shrink:0;border-right:1px solid var(--line);background:rgba(0,0,0,.06);display:flex;flex-direction:column;overflow-y:auto;padding:6px 6px;gap:2px}
      .ccg-sidebar-item{display:flex;align-items:center;justify-content:center;padding:10px 6px;border-radius:10px;cursor:pointer;color:var(--muted);font-size:0;transition:.15s;border:1px solid transparent;position:relative;user-select:none}
      .ccg-sidebar-item b{font-size:18px;line-height:1}
      .ccg-sidebar-item:hover{background:rgba(255,255,255,.04);color:var(--ink)}
      .ccg-sidebar-item.active{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 6px 14px var(--glow);font-weight:700}
      .ccg-sidebar-item:hover::after{content:attr(data-label);position:absolute;left:100%;top:50%;transform:translateY(-50%);margin-left:6px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:13px;white-space:nowrap;color:var(--ink);z-index:20;pointer-events:none;box-shadow:0 6px 16px var(--shadow)}
      .ccg-sidebar-spacer{flex:1}.ccg-sidebar-gear{display:none}
      .ccg-content{flex:1;min-width:0;overflow-y:auto;overflow-x:hidden;padding:16px;display:flex;flex-direction:column;gap:14px}
      .ccg-grid{display:flex;flex-direction:column;gap:14px}
      .ccg-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 12px}
      .ccg-form-card .ccg-field{margin-bottom:0}
      .ccg-form-card .ccg-field label{font-size:11px;gap:3px}
      .ccg-form-card .ccg-field input,.ccg-form-card .ccg-field select,.ccg-form-card .ccg-field textarea{padding:6px 9px;font-size:13px}
      .ccg-form-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
      .ccg-form-top h3{margin:0;font-size:14px}
      .ccg-form-extra{margin-top:6px;border-top:1px dashed var(--line);padding-top:4px}
      .ccg-form-extra summary{cursor:pointer;font-size:13px;color:var(--muted);padding:8px 4px;letter-spacing:.06em;display:flex;align-items:center;gap:4px}
      .ccg-form-extra summary::-webkit-details-marker{display:none}
      .ccg-form-extra-grid{margin-top:6px}
      .ccg-form-extra .ccg-field textarea{min-height:60px}
      .ccg-wb-line{display:flex;align-items:center;gap:10px;padding:8px 12px;margin-top:8px;border:1px solid var(--line);border-radius:10px;font-size:13px;color:var(--muted);background:rgba(0,0,0,.03)}
      .ccg-wb-line b{color:var(--accent2);margin-left:auto}
      .ccg-card{border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:0 10px 24px rgba(0,0,0,.06);padding:14px}
      .ccg-card h3{margin:0 0 12px;color:var(--accent);font-size:16px;letter-spacing:.08em}.ccg-card p{margin:6px 0;color:var(--muted);line-height:1.7}
      .ccg-field{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.ccg-field label{font-size:12px;color:var(--muted);letter-spacing:.12em}.ccg-field input,.ccg-field textarea,.ccg-field select{width:100%;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.08);color:var(--ink);padding:9px 11px;outline:none;font:inherit;letter-spacing:0;box-sizing:border-box}.ccg-field textarea{min-height:82px;resize:vertical;line-height:1.65}.ccg-field input:focus,.ccg-field textarea:focus,.ccg-field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--glow);background:var(--card)}
      .ccg-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ccg-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}.ccg-btn{border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);padding:9px 14px;cursor:pointer;font:inherit}.ccg-btn:hover{border-color:var(--accent);color:var(--accent)}.ccg-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.ccg-btn.danger{color:#b7522e}.ccg-btn:disabled{opacity:.45;cursor:not-allowed}.ccg-footer{border-top:1px solid var(--line);padding:12px 16px;background:rgba(255,255,255,.05);display:flex;justify-content:space-between;gap:12px;align-items:center;flex-shrink:0}.ccg-status{color:var(--muted);font-size:13px}.ccg-error{color:#b7522e;font-weight:700}
      .ccg-tabs{display:flex;gap:8px;margin-bottom:12px;border-bottom:1px solid var(--line);padding-bottom:10px}.ccg-tab{border:0;border-radius:999px;background:transparent;color:var(--muted);padding:8px 12px;cursor:pointer}.ccg-tab.active{background:var(--accent);color:#fff;box-shadow:0 8px 18px var(--glow)}.ccg-editor textarea{min-height:360px;font-family:"Noto Serif SC","Songti SC","SimSun",serif;line-height:1.72}.ccg-keywords{display:grid;gap:10px}.ccg-mini-action{border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--muted);font-size:11px;padding:3px 10px;cursor:pointer;transition:all .15s}.ccg-mini-action:hover{background:var(--accent);color:#fff;border-color:var(--accent)}.ccg-note{border-left:3px solid var(--accent);padding:8px 10px;background:rgba(0,0,0,.035);color:var(--muted);line-height:1.7;border-radius:0 10px 10px 0}.ccg-empty{min-height:420px;display:grid;place-content:center;text-align:center;color:var(--muted);line-height:1.8}.ccg-loading{display:inline-flex;align-items:center;gap:8px}.ccg-loading:before{content:"";width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:ccg-spin .7s linear infinite}
      .ccg-block{border:1px solid var(--line);border-radius:14px;margin-bottom:16px;background:var(--card);overflow:hidden}
      .ccg-block-head{padding:12px 16px;background:rgba(0,0,0,.04);border-bottom:1px solid var(--line);font-weight:700;font-size:14px;letter-spacing:.06em;color:var(--accent)}
      .ccg-block-body{padding:16px}
      .ccg-settings h4{margin:0 0 8px;color:var(--ink);font-size:14px}
      .ccg-settings hr{border:none;border-top:1px solid var(--line);margin:16px 0}
      .ccg-regex-item{display:flex;gap:8px;align-items:center;background:rgba(0,0,0,.04);padding:6px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px}
      .ccg-regex-item code{flex:1;word-break:break-all;color:var(--ink);opacity:.8;font-size:13px}
      .ccg-regex-item button{border:none;background:none;color:#b7522e;cursor:pointer;font-weight:700;font-size:16px;padding:2px 6px}
      .ccg-ws-item{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--card);margin-bottom:8px;transition:.15s}
      .ccg-ws-item:hover{border-color:var(--accent)}
      .ccg-ws-item .ccg-ws-drag{cursor:grab;opacity:.4;font-size:18px;user-select:none;padding:0 4px}
      .ccg-ws-item .ccg-ws-icon{font-size:22px;flex-shrink:0}
      .ccg-ws-item .ccg-ws-info{flex:1;min-width:0}
      .ccg-ws-item .ccg-ws-name{font-weight:700;color:var(--ink)}
      .ccg-ws-item .ccg-ws-tag{font-size:12px;color:var(--muted);margin-left:8px}
      .ccg-ws-item .ccg-ws-badge{font-size:11px;background:rgba(16,185,129,.12);color:#10b981;padding:2px 8px;border-radius:4px;font-weight:700;margin-left:8px}
      .ccg-ws-item .ccg-ws-actions{display:flex;gap:6px;flex-shrink:0}
      .ccg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:9999999;display:grid;place-items:center;padding:18px;font-family:"Noto Serif SC","Songti SC","SimSun",serif;color:var(--ink)}
      .ccg-overlay-box{width:min(700px,94vw);max-height:88vh;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:16px;background:linear-gradient(135deg,var(--paper),var(--paper2));box-shadow:0 24px 80px var(--shadow);overflow:hidden;animation:ccg-fade .16s ease}
      .ccg-overlay-head{padding:14px 18px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
      .ccg-overlay-body{padding:16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px}
      .ccg-field-row{background:rgba(0,0,0,.04);padding:12px;border-radius:10px;border:1px solid var(--line);margin-bottom:8px;display:flex;gap:10px;align-items:flex-start}
      .ccg-field-row .ccg-ws-drag{cursor:grab;opacity:.4;font-size:16px;margin-top:10px;user-select:none}
      .ccg-field-row .ccg-field{flex:1;margin-bottom:0}
      @keyframes ccg-spin{to{transform:rotate(360deg)}}@keyframes ccg-fade{from{opacity:0}to{opacity:1}}
      @keyframes ccg-spin{to{transform:rotate(360deg)}}@keyframes ccg-fade{from{opacity:0}to{opacity:1}}
      @media (max-width:820px){.ccg-mask{padding:8px}.ccg-modal{width:100%;max-height:96vh;border-radius:14px}.ccg-head{padding:13px 14px;gap:10px}.ccg-head h2{font-size:17px}.ccg-head-gear{width:30px;height:30px;font-size:14px}.ccg-head-actions{gap:5px}.ccg-sidebar{width:auto;flex-direction:row;overflow-x:auto;border-right:none;border-bottom:1px solid var(--line);padding:6px 4px;gap:2px;flex-shrink:0}.ccg-sidebar-item{font-size:13px;padding:7px 10px;border-radius:8px;white-space:nowrap;flex-shrink:0}.ccg-sidebar-item b{font-size:15px;margin-right:4px;display:inline}.ccg-sidebar-item::after{display:none}.ccg-body{flex-direction:column}.ccg-content{padding:12px}.ccg-grid{flex-direction:column}.ccg-form-grid{grid-template-columns:1fr 1fr}.ccg-row{grid-template-columns:1fr 1fr}.ccg-footer{align-items:flex-start;flex-direction:column}.ccg-editor textarea{min-height:340px}.ccg-tabs{overflow-x:auto}.ccg-tab{white-space:nowrap}.ccg-ws-item{flex-wrap:wrap}.ccg-ws-actions{width:100%;justify-content:flex-end;margin-top:4px}}
      @media (max-width:420px){.ccg-head-gear{width:28px;height:28px;font-size:13px}.ccg-head-actions{gap:4px}.ccg-close{width:28px;height:28px;font-size:18px}.ccg-head h2{font-size:15px}.ccg-form-grid{grid-template-columns:1fr}.ccg-row{grid-template-columns:1fr}.ccg-ws-actions{flex-wrap:wrap}}
    `;
  }

  function ensureStyle() {
    let style = mountDocument.getElementById(STYLE_ID);
    if (!style) { style = mountDocument.createElement('style'); style.id = STYLE_ID; mountDocument.head.appendChild(style); }
    style.textContent = cssText();
  }

  // ============================================
  // 表单渲染
  // ============================================
  function formField(key, label, type = 'text', attrs = '') {
    const value = state.form[key] ?? '';
    if (type === 'textarea') return `<div class="ccg-field"><label>${html(label)}</label><textarea data-form="${html(key)}" ${attrs}>${html(value)}</textarea></div>`;
    if (type === 'select') {
      const values = ['女', '男', '其他'];
      return `<div class="ccg-field"><label>${html(label)}</label><select data-form="${html(key)}">${values.map(v => `<option value="${html(v)}"${value === v ? ' selected' : ''}>${html(v)}</option>`).join('')}</select></div>`;
    }
    return `<div class="ccg-field"><label>${html(label)}</label><input data-form="${html(key)}" type="${html(type)}" value="${html(value)}" ${attrs}></div>`;
  }

  function genericField(key, label, type = 'text', attrs = '') {
    const value = state.genericForm[key] ?? '';
    if (type === 'textarea') return `<div class="ccg-field"><label>${html(label)}</label><textarea data-generic="${html(key)}" ${attrs}>${html(value)}</textarea></div>`;
    return `<div class="ccg-field"><label>${html(label)}</label><input data-generic="${html(key)}" type="${html(type)}" value="${html(value)}" ${attrs}></div>`;
  }

  function renderGenericFormPanel() {
    const mod = currentModule();
    const customFields = (mod.fields || []).map(f => {
      const isLong = (f.pmt || '').length > 30;
      return genericField(f.name, f.name, isLong ? 'textarea' : 'text', `placeholder="${html(f.pmt || '')}"`);
    }).join('');
    return `<section class="ccg-card ccg-form-card">
      <div class="ccg-form-top"><h3>${html(mod.name)}</h3></div>
      <div class="ccg-form-grid">
        ${genericField('topic', `${mod.tag}名称`, 'text', 'placeholder="留空由 AI 命名"')}
      </div>
      <details class="ccg-form-extra" open>
        <summary>▸ 更多选项</summary>
        <div class="ccg-form-grid ccg-form-extra-grid">
          ${genericField('style', '风格倾向', 'text', 'placeholder="文风、基调、气质方向"')}
          ${genericField('keywords', '关键词偏好', 'textarea', 'placeholder="用于绿灯触发，可用逗号分隔。"')}
          ${customFields}
          ${genericField('extra', '补充说明', 'textarea', 'placeholder="其他需要 AI 知道的信息。"')}
        </div>
        <div class="ccg-wb-line"><span>${svgIcon('books')} 参考世界书</span><button class="ccg-mini-action" data-action="worldbook">选择</button><b id="ccg-wb-count"></b></div>
      </details>
    </section>`;
  }

  function renderFormPanel() {
    if (state.module !== 'character') return renderGenericFormPanel();
    return `<section class="ccg-card ccg-form-card">
      <div class="ccg-form-top"><h3>生成条件</h3><span data-action="toggle-genNsfw" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--muted);user-select:none;"><input type="checkbox" data-form-check="genNsfw"${state.form.genNsfw !== false ? ' checked' : ''} style="pointer-events:none;accent-color:var(--accent);width:14px;height:14px;"> 生成 NSFW 档案</span></div>
      <div class="ccg-form-grid">
        ${formField('name', '姓名', 'text', 'placeholder="留空由 AI 命名"')}
        ${formField('gender', '性别', 'select')}
        ${formField('age', '年龄', 'number', 'min="16" max="99" placeholder="留空由 AI 推断"')}
        ${formField('identity', '身份 / 阶层', 'text', 'placeholder="落第秀才、逃兵、行商、佃户……"')}
        ${formField('faction', '所属势力', 'text', 'placeholder="和济堂、桐城县衙、流寇营寨……"')}
        ${formField('relation', '与主角关系', 'text', 'placeholder="故交、同僚、宿敌、旧识……"')}
      </div>
      <details class="ccg-form-extra">
        <summary>▸ 更多选项</summary>
        <div class="ccg-form-grid ccg-form-extra-grid">
          ${formField('location', '所在地点', 'text', 'placeholder="桐城西街、安庆码头、北直隶某处……"')}
          ${formField('role', '角色功能', 'text', 'placeholder="盟友、敌手、情人、线索人物……"')}
          ${formField('tone', '文风与气质', 'text', 'placeholder="乱世写实、克制有余韵；市井泼辣、话里带刺……"')}
          ${formField('appearance', '外貌提示', 'textarea', 'placeholder="体型、站姿、穿衣风格、常被旁人注意到的细节。"')}
          ${formField('kinkBoundary', 'NSFW边界/偏好', 'textarea', 'placeholder="亲密动态、禁忌、底线；留空则按角色自然生成。"')}
          ${formField('physique', '体貌提示', 'textarea', 'placeholder="亲密距离下的身体感、皮肤触感、身体语言。"')}
          ${formField('keywordHint', '关键词偏好', 'textarea', 'placeholder="别名、称谓、地点词；AI 会补全。"')}
          ${formField('extra', '补充说明', 'textarea', 'placeholder="经历、秘密、和残明世界的关系等。"')}
        </div>
        <div class="ccg-wb-line"><span>${svgIcon('books')} 参考世界书</span><button class="ccg-mini-action" data-action="worldbook">选择</button><b id="ccg-wb-count"></b></div>
      </details>
    </section>`;
  }

  function renderResultPanel() {
    if (state.module !== 'character') return renderGenericResultPanel();
    if (!state.result) {
      return `<section class="ccg-card ccg-empty"><div>${state.loading ? '<span class="ccg-loading">正在生成角色设定</span>' : '填写左侧条件后生成角色。'}<br>生成后会在这里查看、修改、二次优化，再确认写入世界书。</div></section>`;
    }
    const r = state.result, tab = state.activeTab;
    return `<section class="ccg-card">
      <div class="ccg-tabs">
        <button class="ccg-tab${tab === 'sfw' ? ' active' : ''}" data-ccg-tab="sfw">SFW 人设</button>
        <button class="ccg-tab${tab === 'nsfw' ? ' active' : ''}" data-ccg-tab="nsfw">NSFW 人设</button>
        <button class="ccg-tab${tab === 'keys' ? ' active' : ''}" data-ccg-tab="keys">关键词与写入</button>
        <button class="ccg-tab${tab === 'revise' ? ' active' : ''}" data-ccg-tab="revise">再次优化</button>
      </div>
      ${tab === 'sfw' ? renderSfwEditor(r) : ''}
      ${tab === 'nsfw' ? renderNsfwEditor(r) : ''}
      ${tab === 'keys' ? renderKeywordEditor(r) : ''}
      ${tab === 'revise' ? renderRevisePanel() : ''}
    </section>`;
  }

  function renderGenericResultPanel() {
    const mod = currentModule();
    if (!state.genericResult) {
      return `<section class="ccg-card ccg-empty"><div>${state.loading ? `<span class="ccg-loading">正在生成${html(mod.tag)}</span>` : `填写左侧条件后生成${html(mod.tag)}。`}<br>生成后可编辑正文和关键词，再写入世界书。</div></section>`;
    }
    return `<section class="ccg-card ccg-editor">
      <h3>${html(mod.tag)}结果</h3>
      ${genericResultInput('title', '世界书条目名')}
      <div class="ccg-field"><label>绿灯关键词</label><textarea data-generic-keywords>${html(joinKeywords(state.genericResult.keywords || []))}</textarea></div>
      ${genericResultTextarea('content', '条目内容')}
      <p class="ccg-note">目标世界书：${html(state.targetWorldbook || '尚未读取')}。写入条目名会带上「${html(mod.tag)} | 」前缀，避免和角色条目混在一起。</p>
    </section>`;
  }

  function renderSfwEditor(r) {
    return `<div class="ccg-editor"><div class="ccg-row">${resultInput('sfwTitle', '世界书条目名')}${resultInput('name', '角色名')}</div>${resultTextarea('sfwContent', 'SFW 条目内容')}</div>`;
  }
  function renderNsfwEditor(r) {
    return `<div class="ccg-editor">${resultInput('nsfwTitle', '世界书条目名')}<p class="ccg-note">NSFW 条目默认启用，但写入为绿灯组合：角色关键词命中，并且次关键词命中 NSFW 时才触发。</p>${resultTextarea('nsfwContent', 'NSFW 条目内容')}</div>`;
  }
  function renderKeywordEditor(r) {
    return `<div class="ccg-keywords"><div class="ccg-row">${resultInput('sfwTitle', 'SFW 条目名')}${resultInput('nsfwTitle', 'NSFW 条目名')}</div>${keywordField('sfwKeywords', 'SFW 主关键词', r.sfwKeywords)}${keywordField('nsfwKeywords', 'NSFW 主关键词', r.nsfwKeywords)}${keywordField('nsfwSecondaryKeywords', 'NSFW 次关键词', r.nsfwSecondaryKeywords)}<p class="ccg-note">目标世界书：${html(state.targetWorldbook || '尚未读取')}。确认写入会创建或覆盖同名的 SFW / NSFW 两个条目。</p></div>`;
  }
  function renderRevisePanel() {
    return `<div><div class="ccg-field"><label>哪里不满意</label><textarea data-feedback placeholder="例如：经历太散、关系更暧昧、NSFW 太直白、需要更像乱世里的活人……">${html(state.feedback)}</textarea></div><div class="ccg-actions"><button class="ccg-btn primary" data-action="revise"${state.loading ? ' disabled' : ''}>让 AI 再优化</button></div></div>`;
  }

  function resultInput(key, label) { return `<div class="ccg-field"><label>${html(label)}</label><input data-result="${html(key)}" value="${html(state.result?.[key] ?? '')}"></div>`; }
  function resultTextarea(key, label) { return `<div class="ccg-field"><label>${html(label)}</label><textarea data-result="${html(key)}">${html(state.result?.[key] ?? '')}</textarea></div>`; }
  function keywordField(key, label, list) { return `<div class="ccg-field"><label>${html(label)}</label><textarea data-keywords="${html(key)}">${html(joinKeywords(list))}</textarea></div>`; }
  function genericResultInput(key, label) { return `<div class="ccg-field"><label>${html(label)}</label><input data-generic-result="${html(key)}" value="${html(state.genericResult?.[key] ?? '')}"></div>`; }
  function genericResultTextarea(key, label) { return `<div class="ccg-field"><label>${html(label)}</label><textarea data-generic-result="${html(key)}">${html(state.genericResult?.[key] ?? '')}</textarea></div>`; }

  // ============================================
  // 设置面板
  // ============================================
  function renderSettingsPanel() {
    const api = apiSettings, cfg = globalCfg;
    return `<div class="ccg-settings">
      <h2 style="margin-top:0;">设置与配置</h2>
      <div class="ccg-block"><div class="ccg-block-head">大模型 API 设定</div><div class="ccg-block-body">
        <div class="ccg-row"><div class="ccg-field"><label>接口协议</label><select data-cfg="apiType"><option value="openai"${api.apiType === 'openai' ? ' selected' : ''}>OpenAI 兼容协议</option><option value="claude"${api.apiType === 'claude' ? ' selected' : ''}>Claude 协议</option></select></div><div class="ccg-field"><label>模型名称</label><div style="display:flex;gap:6px;"><input data-cfg="model" value="${html(api.model || '')}" placeholder="gemini-2.5-flash-lite" style="flex:1;"><button class="ccg-btn" data-action="fetch-models" title="从 API 地址拉取可用模型列表" style="flex-shrink:0;padding:8px 10px;white-space:nowrap;">拉取</button></div><select data-cfg="modelSelect" style="display:none;margin-top:4px;"></select></div></div>
        <div class="ccg-field"><label>API 地址</label><input data-cfg="apiUrl" value="${html(api.apiUrl || '')}" placeholder="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"></div>
        <div class="ccg-field"><label>API 密钥</label><input data-cfg="apiKey" type="password" value="${html(api.apiKey || '')}" placeholder="sk-..."></div>
        <div class="ccg-row"><div class="ccg-field"><label>温度</label><input data-cfg="temperature" type="number" step="0.1" min="0" max="2" value="${api.temperature}"></div><div class="ccg-field"><label>最大 Token</label><input data-cfg="maxTokens" type="number" min="1" max="200000" value="${api.maxTokens}"></div></div>
        <div class="ccg-row"><div class="ccg-field"><label>Top P</label><input data-cfg="topP" type="number" step="0.05" min="0" max="1" value="${api.topP}"></div><div class="ccg-field"><label>频率惩罚</label><input data-cfg="frequencyPenalty" type="number" step="0.1" min="-2" max="2" value="${api.frequencyPenalty}"></div></div>
        <div class="ccg-field"><label>存在惩罚</label><input data-cfg="presencePenalty" type="number" step="0.1" min="-2" max="2" value="${api.presencePenalty}"></div>
      </div></div>
      <div class="ccg-block"><div class="ccg-block-head">交互与全局偏好</div><div class="ccg-block-body">
        <div class="ccg-field"><label>全局提示词（附加到每个生成请求的系统指令前）</label><textarea data-cfg="limitBreakPrompt" rows="2">${html(cfg.limitBreakPrompt || '')}</textarea></div>
        <div class="ccg-field"><label>默认历史抓取楼层数</label><input data-cfg="historyMax" type="number" min="0" max="99" value="${cfg.historyMax || 4}"></div>
      </div></div>
      <div class="ccg-block"><div class="ccg-block-head">剧情提取规则 <span style="font-weight:normal;opacity:.7;font-size:12px;">（默认去除 &lt;think&gt; 内容）</span></div><div class="ccg-block-body">
        <p style="margin-top:0;font-size:13px;opacity:.8;">如果预设包含大量推演思维链，请填入特定容器标签名去壳（不填尖括号）。留空则提取全文。</p>
        <div class="ccg-row"><div class="ccg-field"><label>AI 正文提取标签</label><input data-cfg="charExtractTag" placeholder="例如: content (留空即提取全文)" value="${html(cfg.charExtractTag || '')}"></div><div class="ccg-field"><label>用户输入提取标签</label><input data-cfg="userExtractTag" placeholder="例如: 本轮用户输入 (留空即提取全文)" value="${html(cfg.userExtractTag || '')}"></div></div>
      </div></div>
      <div class="ccg-block"><div class="ccg-block-head">文本排异规则（正则表达式过滤）</div><div class="ccg-block-body">
        <p style="margin-top:0;font-size:13px;opacity:.8;">历史消息与世界书内容提取时，剔除匹配下方正则的内容。</p>
        <div id="ccg-regex-list" style="margin-bottom:12px;display:flex;flex-direction:column;gap:6px;"></div>
        <div style="display:flex;gap:8px;"><textarea id="ccg-regex-input" style="flex:1;margin:0;min-height:40px;max-height:120px;resize:vertical;font-family:monospace;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.08);color:var(--ink);padding:9px 11px;outline:none;font:inherit;" placeholder="例如: <状态数据>[\\s\\S]*?<\\/状态数据>"></textarea><button class="ccg-btn" id="ccg-regex-add" style="flex-shrink:0;align-self:flex-start;">➕ 追加</button></div>
      </div></div>
      <div class="ccg-block"><div class="ccg-block-head">世界书默认注入配置</div><div class="ccg-block-body">
        <div class="ccg-row"><div class="ccg-field"><label>触发方式</label><select data-cfg="wbTri"><option value="selective"${cfg.wbTri === 'selective' ? ' selected' : ''}>🟢 绿灯（关键词触发）</option><option value="constant"${cfg.wbTri === 'constant' ? ' selected' : ''}>🔵 蓝灯（常驻）</option></select></div><div class="ccg-field"><label>注入位置</label><select data-cfg="wbPos"><option value="after_character_definition"${cfg.wbPos === 'after_character_definition' ? ' selected' : ''}>角色定义之后</option><option value="before_character_definition"${cfg.wbPos === 'before_character_definition' ? ' selected' : ''}>角色定义之前</option></select></div></div>
        <div class="ccg-field"><label>默认排序号</label><input data-cfg="wbOrd" type="number" min="1" max="999" value="${cfg.wbOrd || 100}"></div>
      </div></div>
      <div class="ccg-actions" style="margin-bottom:20px;"><button class="ccg-btn" data-action="settings-cancel">取消</button><button class="ccg-btn primary" data-action="settings-save">保存设置</button></div>
    </div>`;
  }

  function renderRegexList() {
    const list = root?.querySelector('#ccg-regex-list'); if (!list) return;
    const rules = globalCfg.excludeRegexes || [];
    if (rules.length === 0) { list.innerHTML = '<div style="font-size:12px;opacity:.5;">（尚未配置任何排异规则）</div>'; return; }
    list.innerHTML = rules.map((rx, i) => `<div class="ccg-regex-item"><code>${html(rx)}</code><button data-action="del-regex" data-regex-idx="${i}">✖</button></div>`).join('');
  }

  // ============================================
  // 工坊面板
  // ============================================
  function renderWorkshopPanel() {
    const listHtml = modules.map(g => {
      const isLocked = g.isDefault && !customModuleDefs[g.id];
      const isModified = g.isDefault && !!customModuleDefs[g.id];
      const toolBtns = isLocked
        ? `<button class="ccg-btn" data-action="ws-unlock" data-gid="${html(g.id)}" style="padding:6px 12px;font-size:13px;">编辑</button>`
        : `<button class="ccg-btn" data-action="ws-edit" data-gid="${html(g.id)}" style="padding:6px 12px;font-size:13px;">编辑</button>` +
          (g.isDefault ? `<button class="ccg-btn danger" data-action="ws-reset" data-gid="${html(g.id)}" style="padding:6px 12px;font-size:13px;">恢复默认</button>` : `<button class="ccg-btn danger" data-action="ws-delete" data-gid="${html(g.id)}" style="padding:6px 12px;font-size:13px;">删除</button>`);
      return `<div class="ccg-ws-item" draggable="true" data-gid="${html(g.id)}">
        <span class="ccg-ws-drag">≡</span>
        <span class="ccg-ws-icon">${html(g.icon)}</span>
        <div class="ccg-ws-info"><span class="ccg-ws-name">${html(g.name)}</span><span class="ccg-ws-tag">(${html(g.tag)})</span>${isModified ? '<span class="ccg-ws-badge">已修改</span>' : ''}</div>
        <div class="ccg-ws-actions">
          <button class="ccg-btn" data-action="ws-export" data-gid="${html(g.id)}" style="padding:6px 12px;font-size:13px;">导出</button>
          ${toolBtns}
        </div>
      </div>`;
    }).join('');

    return `<div>
      <h2 style="margin-top:0;">生成器工坊</h2>
      <p style="opacity:.8;font-size:14px;margin-bottom:20px;">在此创建、编辑和管理自定义生成器。拖拽 ≡ 图标可重排序。</p>
      <div style="display:flex;gap:12px;margin-bottom:20px;">
        <button class="ccg-btn primary" data-action="ws-new" style="flex:1;font-size:15px;">新建生成器</button>
        <button class="ccg-btn" data-action="ws-cloud-import" style="flex:1;">从云端导入</button>
      </div>
      <hr style="border:none;border-top:1px dashed var(--line);margin-bottom:20px;">
      <div id="ccg-ws-list">${listHtml}</div>
      <div style="height:60px;"></div>
    </div>`;
  }

  function openBuilderEditor(genObj) {
    const isNew = !genObj;
    const isCharacter = genObj?.id === 'character';
    const cGen = isNew
      ? { id: uuid(), name: '', tag: '', icon: '', sys: '', namePrompt: '为该对象生成一个合适的名字，可附带别称（用括号包裹）。', isDefault: false, fields: [] }
      : JSON.parse(JSON.stringify(genObj));

    const ov = mountDocument.createElement('div');
    ov.className = `ccg-overlay theme-${options.theme || 'night'}`;
    ov.id = 'ccg-builder-overlay';

    const fieldsSection = isCharacter
      ? `<div class="ccg-field"><label>User Prompt 模板</label>
          <textarea id="be-userprompt" rows="18" style="resize:vertical;min-height:240px;font-family:monospace;font-size:13px;line-height:1.5;" placeholder="支持占位符：{name} {gender} {age} {identity} {relation} {location} {faction} {role} {tone} {keywordHint} {kinkBoundary} {extra} {nameTag}">${html(cGen.userPromptTemplate || '')}</textarea>
          <p class="ccg-note" style="margin-top:6px;">占位符会在生成时替换为表单中的实际值。{nameTag} 用于 XML 标签名。</p>
        </div>`
      : `<div class="ccg-field"><label>【固定首项】"名字"字段生成规则</label><textarea id="be-namepmt" rows="2">${html(cGen.namePrompt || '')}</textarea></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">
          <b style="color:var(--ink);">生成字段</b>
          <span style="font-size:12px;opacity:.6;">（拖拽 ≡ 调整顺序）</span>
        </div>
        <div id="be-fields-list"></div>
        <button class="ccg-btn" id="be-add-field" style="width:100%;border-style:dashed;">+ 新增字段</button>`;

    ov.innerHTML = `<div class="ccg-overlay-box">
      <div class="ccg-overlay-head"><div><b>${isNew ? '新建生成器' : '编辑生成器'}</b></div><button class="ccg-close" id="ccg-be-close">×</button></div>
      <div class="ccg-overlay-body" id="ccg-be-body">
        <div class="ccg-row"><div class="ccg-field"><label>生成器名称</label><input id="be-name" value="${html(cGen.name)}" placeholder="例如：功法生成器"></div><div class="ccg-field"><label>提取标签</label><input id="be-tag" value="${html(cGen.tag)}" placeholder="例如：功法"></div></div>
        <div class="ccg-field"><label>图标</label><input id="be-icon" value="${html(cGen.icon)}" placeholder="单个字符"></div>
        <div class="ccg-field"><label>System Prompt</label><textarea id="be-sys" rows="5" style="resize:vertical;min-height:120px;" placeholder="填写发给该生成器的基础规则与系统设定...">${html(cGen.sys)}</textarea></div>
        <hr style="border:none;border-top:1px dashed var(--line);">
        ${fieldsSection}
        <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line);">
          <button class="ccg-btn" id="be-cancel">取消</button>
          <button class="ccg-btn primary" id="be-save" style="padding:10px 40px;">保存</button>
        </div>
      </div>
    </div>`;
    mountDocument.body.appendChild(ov);

    function syncDOM() {
      if (isCharacter) return;
      cGen.fields = Array.from(ov.querySelectorAll('.ccg-field-row')).map(row => ({
        name: row.querySelector('._bf_name')?.value?.trim() || '',
        pmt: row.querySelector('._bf_pmt')?.value?.trim() || '',
      }));
    }

    function renderFields() {
      if (isCharacter) return;
      const wrap = ov.querySelector('#be-fields-list');
      wrap.innerHTML = cGen.fields.map((f, i) => `<div class="ccg-field-row" draggable="true" data-bidx="${i}">
        <span class="ccg-ws-drag">≡</span>
        <div class="ccg-field"><input class="_bf_name" placeholder="字段名称" value="${html(f.name)}" style="font-weight:700;"></div>
        <div class="ccg-field"><textarea class="_bf_pmt" rows="2" placeholder="撰写该节点的格式逻辑限制...">${html(f.pmt)}</textarea></div>
        <button class="ccg-btn danger _del_bf" style="flex-shrink:0;padding:6px 10px;border:none;">×</button>
      </div>`).join('');

      wrap.querySelectorAll('._del_bf').forEach(btn => {
        btn.onclick = () => { syncDOM(); const i = parseInt(btn.closest('.ccg-field-row').getAttribute('data-bidx')); cGen.fields.splice(i, 1); renderFields(); };
      });

      let dragIdx = null;
      wrap.querySelectorAll('.ccg-field-row').forEach(row => {
        row.ondragstart = (e) => { syncDOM(); dragIdx = parseInt(row.getAttribute('data-bidx')); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragIdx); setTimeout(() => row.style.opacity = '0.5', 0); };
        row.ondragover = (e) => e.preventDefault();
        row.ondragenter = (e) => { e.preventDefault(); row.style.border = '2px dashed var(--accent)'; };
        row.ondragleave = () => { row.style.border = '1px solid var(--line)'; };
        row.ondrop = (e) => { e.preventDefault(); row.style.border = '1px solid var(--line)'; const tIdx = parseInt(row.getAttribute('data-bidx')); if (dragIdx !== null && dragIdx !== tIdx) { const item = cGen.fields.splice(dragIdx, 1)[0]; cGen.fields.splice(tIdx, 0, item); renderFields(); } };
        row.ondragend = () => { row.style.opacity = '1'; };
      });
    }
    renderFields();

    if (!isCharacter) {
      ov.querySelector('#be-add-field').onclick = () => { syncDOM(); cGen.fields.push({ name: '', pmt: '' }); renderFields(); };
    }
    ov.querySelector('#be-cancel').onclick = () => ov.remove();
    ov.querySelector('#ccg-be-close').onclick = () => ov.remove();
    ov.querySelector('#be-save').onclick = () => {
      syncDOM();
      cGen.name = ov.querySelector('#be-name').value.trim();
      cGen.tag = ov.querySelector('#be-tag').value.trim();
      cGen.icon = ov.querySelector('#be-icon').value.trim();
      cGen.sys = ov.querySelector('#be-sys').value.trim();
      if (isCharacter) cGen.userPromptTemplate = ov.querySelector('#be-userprompt')?.value?.trim() || '';
      if (!isCharacter) cGen.namePrompt = ov.querySelector('#be-namepmt')?.value?.trim() || '';
      if (!cGen.name || !cGen.tag || !cGen.icon || !cGen.sys) { notify('生成器名称、标签、图标或 System Prompt 为空，请填写完整！', 'err'); return; }
      if (!isCharacter) {
        if (!isNew && !cGen.namePrompt) { notify('"名字"字段生成规则不可为空。', 'err'); return; }
        if (cGen.fields.length === 0 && !isCharacter) { notify('至少必须添加一条字段定义', 'err'); return; }
        for (let i = 0; i < cGen.fields.length; i++) { if (!cGen.fields[i].name || !cGen.fields[i].pmt) { notify(`第 ${i + 1} 个字段信息空缺！`, 'err'); return; } }
        if (cGen.fields.some(f => f.name.includes('名字') || f.name.includes('关键'))) { notify('禁止使用"名字"或"关键词"作为字段名。', 'err'); return; }
      }

      if (cGen.isDefault) {
        const base = DEFAULT_MODULES.find(d => d.id === cGen.id);
        if (base) {
          const over = {};
          if (cGen.name !== base.name) over.name = cGen.name;
          if (cGen.tag !== base.tag) over.tag = cGen.tag;
          if (cGen.icon !== base.icon) over.icon = cGen.icon;
          if (cGen.sys !== base.sys) over.sys = cGen.sys;
          if (isCharacter && cGen.userPromptTemplate !== base.userPromptTemplate) over.userPromptTemplate = cGen.userPromptTemplate;
          if (!isCharacter && cGen.namePrompt !== base.namePrompt) over.namePrompt = cGen.namePrompt;
          if (!isCharacter && JSON.stringify(cGen.fields) !== JSON.stringify(base.fields)) over.fields = cGen.fields;
          if (Object.keys(over).length > 0) customModuleDefs[cGen.id] = over;
          else delete customModuleDefs[cGen.id];
        }
      } else {
        customModuleDefs[cGen.id] = { id: cGen.id, name: cGen.name, tag: cGen.tag, icon: cGen.icon, sys: cGen.sys, namePrompt: cGen.namePrompt || '', isDefault: false, fields: cGen.fields };
        if (!moduleOrder.includes(cGen.id)) moduleOrder.push(cGen.id);
      }
      saveCustomModules();
      ov.remove();
      updateContent();
      notify('配置已保存', 'ok');
    };

    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.remove(); });
  }

  async function openCloudGeneratorLibrary() {
    if (typeof options.openWorkshop !== 'function') {
      notify('云端创意工坊接口不可用，请从状态栏重新打开万象生成器。', 'err');
      return;
    }
    await options.openWorkshop({ initialView: 'catalog', initialType: 'generator' });
  }

  // ============================================
  // 局部 DOM 更新（修复闪屏）
  // ============================================
  function buildSkeleton() {
    root.innerHTML = `<div class="ccg-mask" data-action="mask-close">
      <section class="ccg-modal" role="dialog" aria-modal="true" aria-label="残明余烬万象生成器" data-modal>
        <header class="ccg-head"><div><p class="ccg-kicker">残明余烬 · 多功能生成器</p><h2 id="ccg-title"></h2></div><div class="ccg-head-actions"><button class="ccg-head-gear" data-action="worldbook" title="参考世界书">${svgIcon('books')}</button><button class="ccg-head-gear" data-nav="workshop" title="生成器工坊">${svgIcon('wrench')}</button><button class="ccg-head-gear" data-nav="settings" title="设置与配置">${svgIcon('sliders')}</button><button class="ccg-close" data-action="close" aria-label="关闭">×</button></div></header>
        <div class="ccg-body"><nav class="ccg-sidebar" id="ccg-sidebar"></nav><div class="ccg-content" id="ccg-content"></div></div>
        <footer class="ccg-footer" id="ccg-footer"></footer>
      </section>
    </div>`;
    root._ccgBuilt = true;
    bindRootEvents();
  }

  function updateSidebar() {
    const sb = root?.querySelector('#ccg-sidebar'); if (!sb) return;
    const inGenerator = state.activeView === 'generator';
    sb.innerHTML = `
      ${modules.map(m => `<div class="ccg-sidebar-item${state.module === m.id && inGenerator ? ' active' : ''}" data-nav="module" data-module="${html(m.id)}" data-label="${html(m.name)}" title="${html(m.name)}"><b>${html(m.icon)}</b> ${html(m.name)}</div>`).join('')}`;

    // 同步 header 工坊/设置按钮激活状态
    const wsBtn = root?.querySelector('.ccg-head-gear[data-nav="workshop"]');
    const stBtn = root?.querySelector('.ccg-head-gear[data-nav="settings"]');
    if (wsBtn) wsBtn.classList.toggle('active', state.activeView === 'workshop');
    if (stBtn) stBtn.classList.toggle('active', state.activeView === 'settings');
  }

  function updateContent() {
    const ct = root?.querySelector('#ccg-content'); if (!ct) return;
    const inGenerator = state.activeView === 'generator';
    const isWs = state.activeView === 'workshop';
    const isSettings = state.activeView === 'settings';

    if (isSettings) { ct.innerHTML = renderSettingsPanel(); renderRegexList(); }
    else if (isWs) { ct.innerHTML = renderWorkshopPanel(); bindWorkshopEvents(); }
    else { ct.innerHTML = `<div class="ccg-grid">${renderFormPanel()}${renderResultPanel()}</div>`; updateWbCount(); }
  }

  function updateTitle() {
    const title = root?.querySelector('#ccg-title'); if (!title) return;
    if (state.activeView === 'settings') title.textContent = '设置与配置';
    else if (state.activeView === 'workshop') title.textContent = '生成器工坊';
    else title.textContent = currentModule().name;
  }

  function updateFooter() {
    const ft = root?.querySelector('#ccg-footer'); if (!ft) return;
    if (state.activeView !== 'generator') { ft.style.display = 'none'; return; }
    ft.style.display = '';
    ft.innerHTML = `<div class="ccg-status ${state.error ? 'ccg-error' : ''}">${html(state.error || (state.loading ? '请稍候，正在与 AI 交换设定。' : '生成后先查看结果，确认后再写入世界书。'))}</div>
      <div class="ccg-actions">
        <button class="ccg-btn" data-action="reset"${state.loading ? ' disabled' : ''}>清空</button>
        <button class="ccg-btn primary" data-action="generate"${state.loading ? ' disabled' : ''}>生成</button>
        <button class="ccg-btn primary" data-action="write"${!(state.module === 'character' ? state.result : state.genericResult) || state.loading ? ' disabled' : ''}>确认写入</button>
      </div>`;
  }

  function updateAll() {
    updateSidebar();
    updateTitle();
    updateContent();
    updateFooter();
  }

  function render() {
    if (!isOpen) return;
    ensureStyle();
    root = mountDocument.getElementById(ROOT_ID);
    if (!root) { root = mountDocument.createElement('div'); root.id = ROOT_ID; mountDocument.body.appendChild(root); }
    root.className = `theme-${options.theme || 'night'}`;
    if (!root._ccgBuilt) buildSkeleton();
    updateAll();
  }

  function bindRootEvents() {
    if (!root || root._ccgBound) return;
    root._ccgBound = true;
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('change', function(e) {
      var sel = e.target.closest && e.target.closest('#ccg-wb-select');
      if (sel) {
        wbViewing = sel.value;
        updateContent();
      }
    });
  }

  // ============================================
  // 工坊事件
  // ============================================
  function bindWorkshopEvents() {
    const ct = root?.querySelector('#ccg-content'); if (!ct) return;

    ct.querySelector('[data-action="ws-new"]')?.addEventListener('click', () => openBuilderEditor(null));
    ct.querySelector('[data-action="ws-cloud-import"]')?.addEventListener('click', () => openCloudGeneratorLibrary());

    ct.querySelectorAll('[data-action="ws-edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = btn.getAttribute('data-gid');
        openBuilderEditor(modules.find(g => g.id === gid));
      });
    });
    ct.querySelectorAll('[data-action="ws-unlock"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmInMount('确定要编辑此默认生成器吗？\n（如果后续需要，可以随时点击「恢复默认」撤销）')) return;
        openBuilderEditor(modules.find(g => g.id === btn.getAttribute('data-gid')));
      });
    });
    ct.querySelectorAll('[data-action="ws-export"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = btn.getAttribute('data-gid');
        const gen = modules.find(g => g.id === gid);
        if (!gen) { notify('未找到该生成器。', 'err'); return; }
        const clone = JSON.parse(JSON.stringify(gen));
        delete clone.id; delete clone.isDefault;
        const jsonStr = JSON.stringify(clone, null, 2);
        const filename = (gen.name || gen.tag || 'generator').replace(/[\\/:*?"<>|]/g, '_') + '.json';
        downloadFile(jsonStr, filename, 'application/json');
        notify(`已导出：${filename}`, 'ok');
      });
    });
    ct.querySelectorAll('[data-action="ws-delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmInMount('确定要删除此自定义生成器吗？此操作不可逆。')) return;
        const gid = btn.getAttribute('data-gid');
        delete customModuleDefs[gid];
        moduleOrder = moduleOrder.filter(id => id !== gid);
        saveCustomModules();
        updateContent();
        notify('已删除', 'info');
      });
    });
    ct.querySelectorAll('[data-action="ws-reset"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmInMount('确定要移除所有修改，恢复系统默认配置吗？')) return;
        const gid = btn.getAttribute('data-gid');
        delete customModuleDefs[gid];
        saveCustomModules();
        updateContent();
        notify('已恢复默认', 'info');
      });
    });

    // 拖拽排序
    let dragGid = null;
    ct.querySelectorAll('.ccg-ws-item').forEach(row => {
      row.addEventListener('dragstart', (e) => { dragGid = row.getAttribute('data-gid'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragGid); setTimeout(() => row.style.opacity = '0.5', 0); });
      row.addEventListener('dragover', (e) => e.preventDefault());
      row.addEventListener('dragenter', (e) => { e.preventDefault(); row.style.border = '2px dashed var(--accent)'; });
      row.addEventListener('dragleave', () => { row.style.border = ''; });
      row.addEventListener('drop', (e) => {
        e.preventDefault(); row.style.border = '';
        const tGid = row.getAttribute('data-gid');
        if (dragGid && dragGid !== tGid) {
          const curOrder = modules.map(g => g.id);
          const from = curOrder.indexOf(dragGid), to = curOrder.indexOf(tGid);
          if (from > -1 && to > -1) { const item = curOrder.splice(from, 1)[0]; curOrder.splice(to, 0, item); moduleOrder = curOrder; saveCustomModules(); updateContent(); }
        }
      });
      row.addEventListener('dragend', () => { row.style.opacity = '1'; });
    });
  }

  // ============================================
  // 事件处理
  // ============================================
  function onInput(event) {
    const target = event.target;
    if (target.matches?.('[data-wb-search]')) { filterWorldbookEntries(target); return; }
    const formCheckKey = target.closest?.('[data-form-check]')?.getAttribute('data-form-check');
    if (formCheckKey) { state.form[formCheckKey] = target.checked; dirty = true; return; }
    const formKey = target.closest?.('[data-form]')?.getAttribute('data-form');
    if (formKey) { state.form[formKey] = target.value; if (formKey === 'age') state.form.age = String(adultAge(target.value)); dirty = true; return; }
    const genericKey = target.closest?.('[data-generic]')?.getAttribute('data-generic');
    if (genericKey) { state.genericForm[genericKey] = target.value; dirty = true; return; }
    const resultKey = target.closest?.('[data-result]')?.getAttribute('data-result');
    if (resultKey && state.result) { state.result[resultKey] = target.value; dirty = true; return; }
    const keywordKey = target.closest?.('[data-keywords]')?.getAttribute('data-keywords');
    if (keywordKey && state.result) { state.result[keywordKey] = splitKeywords(target.value); dirty = true; return; }
    const genericResultKey = target.closest?.('[data-generic-result]')?.getAttribute('data-generic-result');
    if (genericResultKey && state.genericResult) { state.genericResult[genericResultKey] = target.value; dirty = true; return; }
    if (target.matches?.('[data-generic-keywords]') && state.genericResult) { state.genericResult.keywords = splitKeywords(target.value); dirty = true; return; }
    if (target.matches?.('[data-feedback]')) state.feedback = target.value;
  }

  function onClick(event) {
    const target = event.target;
    const navEl = target.closest?.('[data-nav]');
    const tabEl = target.closest?.('[data-ccg-tab]');
    const actionEl = target.closest?.('[data-action]');
    const regexDel = target.closest?.('[data-action="del-regex"]');

    // 侧边栏导航
    if (navEl) {
      event.preventDefault();
      const nav = navEl.getAttribute('data-nav');
      if (nav === 'module') { state.module = navEl.getAttribute('data-module') || 'character'; state.activeView = 'generator'; state.error = ''; render(); return; }
      if (nav === 'settings') { state.activeView = state.activeView === 'settings' ? 'generator' : 'settings'; render(); return; }
      if (nav === 'workshop') { state.activeView = state.activeView === 'workshop' ? 'generator' : 'workshop'; render(); return; }
      return;
    }

    // tab 切换
    if (tabEl) { event.preventDefault(); state.activeTab = tabEl.getAttribute('data-ccg-tab') || 'sfw'; updateContent(); return; }

    // 删除正则
    if (regexDel) {
      event.preventDefault();
      const idx = parseInt(regexDel.getAttribute('data-regex-idx'), 10);
      if (!isNaN(idx) && globalCfg.excludeRegexes) { globalCfg.excludeRegexes.splice(idx, 1); renderRegexList(); }
      return;
    }

    // 正则新增
    if (target.id === 'ccg-regex-add') {
      event.preventDefault();
      const input = root?.querySelector('#ccg-regex-input'); const val = (input?.value || '').trim();
      if (!val) return;
      try { new RegExp(val, 'g'); } catch (e) { notify('正则表达式语法错误，请检查转义字符。', 'err'); return; }
      if (!globalCfg.excludeRegexes) globalCfg.excludeRegexes = [];
      globalCfg.excludeRegexes.push(val);
      if (input) input.value = '';
      renderRegexList();
      return;
    }

    // 世界书交互
    const wbEntryCb = target.closest?.('.ccg-wb-entry');
    const wbSelAll = target.closest?.('.ccg-wb-sel-all');
    const wbUnselAll = target.closest?.('.ccg-wb-unsel-all');
    const wbClear = target.closest?.('.ccg-wb-clear');
    const wbRm = target.closest?.('.ccg-wb-rm');
    const charData = savedWbSelections[curCharName] || {};
    if (wbEntryCb) {
      event.preventDefault();
      var wb = wbEntryCb.getAttribute('data-wb');
      var en = wbEntryCb.getAttribute('data-en');
      if (!charData[wb]) charData[wb] = { entries: [] };
      if (!charData[wb].entries) charData[wb].entries = [];
      if (wbEntryCb.checked) { if (charData[wb].entries.indexOf(en) === -1) charData[wb].entries.push(en); }
      else { charData[wb].entries = charData[wb].entries.filter(function(x) { return x !== en; }); }
      saveWbSelections();
      updateContent();
      return;
    }
    if (wbSelAll) {
      event.preventDefault();
      var wb = wbSelAll.getAttribute('data-wb');
      var arr = wbCacheMap[wb] || [];
      if (!charData[wb]) charData[wb] = { entries: [] };
      charData[wb].entries = arr.map(function(x) { return x.name; });
      saveWbSelections();
      updateContent();
      return;
    }
    if (wbUnselAll) {
      event.preventDefault();
      var wb = wbUnselAll.getAttribute('data-wb');
      if (charData[wb]) charData[wb].entries = [];
      saveWbSelections();
      updateContent();
      return;
    }
    if (wbRm) {
      event.preventDefault();
      var wb = wbRm.getAttribute('data-wb');
      var en = wbRm.getAttribute('data-en');
      if (charData[wb] && charData[wb].entries) {
        charData[wb].entries = charData[wb].entries.filter(function(x) { return x !== en; });
      }
      saveWbSelections();
      updateContent();
      return;
    }
    if (wbClear) {
      event.preventDefault();
      Object.keys(charData).forEach(function(wb) { if (charData[wb]) charData[wb].entries = []; });
      saveWbSelections();
      updateContent();
      return;
    }

    // 更多选项折叠
    if (target.closest('.ccg-form-extra summary')) {
      event.preventDefault();
      const details = target.closest('.ccg-form-extra');
      if (details) { details.open = !details.open; }
      return;
    }

    // 世界书弹窗
    if (target.closest('[data-action="worldbook"]')) {
      event.preventDefault();
      event.stopPropagation();
      openWorldbookOverlay();
      return;
    }

    if (!actionEl) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionEl.getAttribute('data-action');

    // 设置面板
    if (action === 'settings-save') { collectSettingsFromDOM(); state.activeView = 'generator'; notify('✓ 设置已保存', 'ok'); render(); return; }
    if (action === 'settings-cancel') { loadAllSettings(); state.activeView = 'generator'; render(); return; }
    if (action === 'fetch-models') { fetchModelsAndPopulate(); return; }

    // 关闭
    if (action === 'mask-close' && target.closest('[data-modal]')) return;
    if (action === 'mask-close' || action === 'close') { if (state.activeView !== 'generator') state.activeView = 'generator'; close(); return; }

    // 切换 NSFW 生成
    if (action === 'toggle-genNsfw') {
      var cb = root?.querySelector('[data-form-check="genNsfw"]');
      if (cb) { cb.checked = !cb.checked; state.form.genNsfw = cb.checked; dirty = true; }
      return;
    }
    // 生成器
    if (action === 'reset') reset();
    if (action === 'generate') state.module === 'character' ? generateCharacter() : generateGeneric();
    if (action === 'revise') reviseCharacter();
    if (action === 'write') state.module === 'character' ? writeEntries() : writeGenericEntry();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); if (state.activeView !== 'generator') state.activeView = 'generator'; close(); }
  }

  // ============================================
  // 模型拉取
  // ============================================
  async function fetchModelList(url, key) {
    url = url || apiSettings.apiUrl;
    key = key || apiSettings.apiKey;
    if (!url) throw new Error('请先填写 API 地址。');
    const getModelList = api('getModelList');
    if (typeof getModelList === 'function') return await getModelList({ apiurl: url, key });
    const base = url.replace(/\/chat\/completions\/?$/, '').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    const resp = await fetch(base + '/v1/models', { method: 'GET', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    const data = await resp.json();
    return (data.data || []).map(m => m.id || m.name).filter(Boolean).sort();
  }

  async function fetchModelsAndPopulate() {
    const fetchBtn = root?.querySelector('[data-action="fetch-models"]');
    const oldText = fetchBtn ? fetchBtn.textContent : '';
    if (fetchBtn) { fetchBtn.textContent = '⏳'; fetchBtn.disabled = true; }
    try {
      // 从 DOM 读取当前输入值（可能尚未保存）
      const domUrl = root?.querySelector('[data-cfg="apiUrl"]')?.value?.trim() || apiSettings.apiUrl;
      const domKey = root?.querySelector('[data-cfg="apiKey"]')?.value?.trim() || apiSettings.apiKey;
      const models = await fetchModelList(domUrl, domKey);
      if (models && models.length > 0) {
        const sel = root?.querySelector('[data-cfg="modelSelect"]');
        if (sel) {
          sel.innerHTML = models.map(m => `<option value="${html(m)}">${html(m)}</option>`).join('');
          sel.style.display = 'block';
          const input = root?.querySelector('[data-cfg="model"]');
          if (input) { sel.onchange = () => { input.value = sel.value; }; if (input.value && models.includes(input.value)) sel.value = input.value; else if (models.length > 0) { sel.value = models[0]; input.value = models[0]; } }
        }
        notify(`✓ 已加载 ${models.length} 个模型`, 'ok');
      } else { notify('✗ API 未返回模型列表', 'err'); }
    } catch (e) { notify(`✗ 获取失败：${e.message}`, 'err'); }
    if (fetchBtn) { fetchBtn.textContent = oldText; fetchBtn.disabled = false; }
  }

  function buildCustomApiConfig() {
    if (!apiSettings.apiUrl && !apiSettings.apiKey) return null;
    return { apiurl: apiSettings.apiUrl, key: apiSettings.apiKey, model: apiSettings.model, source: apiSettings.apiType, temperature: apiSettings.temperature, max_tokens: apiSettings.maxTokens, top_p: apiSettings.topP, frequency_penalty: apiSettings.frequencyPenalty, presence_penalty: apiSettings.presencePenalty };
  }

  // ============================================
  // 设置收集
  // ============================================
  function collectSettingsFromDOM() {
    if (!root) return;
    const get = (name) => { const el = root.querySelector(`[data-cfg="${name}"]`); return el ? el.value : null; };
    apiSettings.apiType = get('apiType') || 'openai'; apiSettings.apiUrl = get('apiUrl') || ''; apiSettings.apiKey = get('apiKey') || ''; apiSettings.model = get('model') || '';
    apiSettings.temperature = parseFloat(get('temperature')) || 0.8; apiSettings.maxTokens = parseInt(get('maxTokens'), 10) || 12000;
    apiSettings.topP = parseFloat(get('topP')) || 0.9; apiSettings.frequencyPenalty = parseFloat(get('frequencyPenalty')) || 0; apiSettings.presencePenalty = parseFloat(get('presencePenalty')) || 0;
    globalCfg.limitBreakPrompt = get('limitBreakPrompt') || ''; globalCfg.charExtractTag = get('charExtractTag') || ''; globalCfg.userExtractTag = get('userExtractTag') || '';
    globalCfg.historyMax = parseInt(get('historyMax'), 10) || 4; globalCfg.wbTri = get('wbTri') || 'selective'; globalCfg.wbPos = get('wbPos') || 'after_character_definition'; globalCfg.wbOrd = parseInt(get('wbOrd'), 10) || 100;
    saveAllSettings();
  }

  // ============================================
  // 结果规范化
  // ============================================
  function normalizeResult(raw, form = state.form) {
    const name = String(raw?.name || form.name || '未命名角色').trim();
    const alias = uniq(ensureArray(raw?.alias));
    const baseKeywords = uniq([name, ...alias, ...ensureArray(raw?.sfw_keywords)]);
    const nsfwKeywords = uniq([name, ...alias, ...ensureArray(raw?.nsfw_keywords)]);
    const sfwTitle = raw?.sfw_title || entryName(name, 'SFW');
    const nsfwTitle = raw?.nsfw_title || entryName(name, 'NSFW');
    const sfwContent = String(raw?.sfw_content || '').trim() || buildFallbackSfw(form, name);
    const nsfwContent = String(raw?.nsfw_content || '').trim() || buildFallbackNsfw(form, name);
    return { name, alias, sfwTitle, nsfwTitle, sfwKeywords: baseKeywords.length ? baseKeywords : [name], nsfwKeywords: nsfwKeywords.length ? nsfwKeywords : [name], nsfwSecondaryKeywords: uniq(ensureArray(raw?.nsfw_secondary_keywords).length ? ensureArray(raw?.nsfw_secondary_keywords) : ['NSFW']), sfwContent, nsfwContent };
  }

  function buildFallbackSfw(form, name) {
    return `<角色设定:${name}_SFW>\n使用说明: 本文件为角色内化参考，供AI理解角色使用。所有设定条目应转化为角色的行为、语言、思维方式与情绪节奏，不得在正文叙述或对话中直接点出、复述或暗示设定本身。设定是理解的底层，不是写作的输出。\n${lineValue('姓名', name)}${lineValue('性别', form.gender)}${lineValue('年龄', adultAge(form.age))}${lineValue('身份', form.identity)}${lineValue('与主角关系', form.relation)}${lineValue('所在地点', form.location)}${lineValue('所属势力', form.faction)}${lineValue('角色功能', form.role)}\n请围绕她/他的经历、欲望、底线、说话方式和可互动钩子补完人设。\n</角色设定:${name}_SFW>`;
  }

  function buildFallbackNsfw(form, name) {
    return `<角色设定:${name}_NSFW>\n${lineValue('成人确认', `${name} 为 ${adultAge(form.age)} 岁成年角色`)}${lineValue('亲密边界', form.kinkBoundary)}\n请基于 SFW 人设自然延展亲密动态、欲望表达、羞耻点、主动/被动模式与 OOC 底线。\n</角色设定:${name}_NSFW>`;
  }

  function normalizeGenericResult(raw) {
    const mod = currentModule();
    const title = String(raw?.title || state.genericForm.topic || `未命名${mod.tag}`).trim();
    const keywords = uniq([title, ...ensureArray(raw?.keywords), ...splitKeywords(state.genericForm.keywords)]);
    const content = String(raw?.content || '').trim() || `<${mod.tag}>\n名称: ${title}\n说明: ${state.genericForm.extra || '请补完这个设定。'}\n</${mod.tag}>`;
    return { title, keywords: keywords.length ? keywords : [title], content };
  }

  // ============================================
  // 生命周期
  // ============================================
  async function reset() {
    if (dirty && !await confirmInMount('清空当前生成器内容？')) return;
    state = { module: state.module, form: { ...DEFAULT_FORM }, genericForm: { ...DEFAULT_GENERIC_FORM }, result: null, genericResult: null, activeTab: 'sfw', feedback: '', loading: false, error: '', targetWorldbook: state.targetWorldbook, activeView: 'generator' };
    dirty = false;
    render();
  }

  async function close() {
    if (!isOpen) return;
    if (dirty && !await confirmInMount('关闭后未写入的编辑会保留在内存中，但刷新页面可能丢失。确定关闭？')) return;
    isOpen = false;
    root?.remove();
    root = null;
  }

  async function toggle(opts = {}) { if (isOpen) await close(); else open(opts); }

  async function open(opts = {}) {
    options = opts || {};
    mountDocument = options.mountDocument || document;
    isOpen = true;
    state.activeView = 'generator';
    state.error = '';
    loadAllSettings();
    await refreshWorldbookName();
    await loadWorldbookContext();
    render();
    setTimeout(() => mountDocument.querySelector(`#${ROOT_ID} [data-form="name"], #${ROOT_ID} [data-generic="topic"]`)?.focus(), 0);
  }

  async function refreshWorldbookName() {
    try {
      const getNames = api('getCharWorldbookNames');
      if (typeof getNames !== 'function') return;
      const names = await getNames('current');
      state.targetWorldbook = names?.primary || names?.additional?.[0] || '';
    } catch { /* ignore */ }
  }

  async function confirmInMount(message) {
    const ui = globalThis.CanmingUI ?? window.parent?.CanmingUI;
    if (typeof ui?.confirm === 'function') return await ui.confirm(message, { title: '写入世界书', confirmText: '覆盖并写入', danger: true });
    return (mountDocument.defaultView || window).confirm(message);
  }

  let notifyTimer = null;
  function notify(message, type = 'ok') {
    // 不能调用 showToast，因为状态栏的 render() 会用 innerHTML 摧毁生成器 DOM
    console.log(`[万象生成器] ${message}`);
    const ui = globalThis.CanmingUI ?? window.parent?.CanmingUI;
    if (typeof ui?.toast === 'function') ui.toast(message, type);
    // 在生成器底部状态栏显示消息
    const statusEl = root?.querySelector('.ccg-status');
    if (statusEl) {
      if (notifyTimer) clearTimeout(notifyTimer);
      statusEl.textContent = message;
      statusEl.className = `ccg-status ${type === 'err' ? 'ccg-error' : ''}`;
      notifyTimer = setTimeout(() => {
        const el = root?.querySelector('.ccg-status');
        if (el) { el.textContent = ''; el.className = 'ccg-status'; }
        notifyTimer = null;
      }, 3000);
    }
  }

  // ============================================
  // AI 调用
  // ============================================
  function buildSystemPrompt() {
    const mod = currentModule();
    const parts = [];
    if (globalCfg.limitBreakPrompt) parts.push(globalCfg.limitBreakPrompt);

    // 注入选中的世界书内容作为参考
    const wbContent = getSelectedWbContent();
    if (wbContent) parts.push(`以下是当前角色绑定的世界书参考内容，生成角色时请与这些设定保持协调：\n\n${wbContent}`);

    if (mod.sys) parts.push(mod.sys);
    parts.push('必须输出合法的 JSON。sfw_content 和 nsfw_content 字段内的双引号必须转义为 \\"，换行必须转义为 \\n。不要在 JSON 字符串内使用未转义的 XML 标签——把标签内容作为纯文本放在 JSON 字符串中。');
    return parts.join('\n\n');
  }

  function buildSystemPromptForRetry() {
    return '你上次的回复不是合法的 JSON。请严格只输出一个 JSON 对象，所有字符串值中的双引号用 \\" 转义，换行用 \\n 转义。不要输出任何 JSON 之外的内容。不要用 markdown 代码块包裹。';
  }

  function buildUserPrompt(mode) {
    const mod = currentModule();
    const f = state.form;
    const nameHint = f.name || '请你命名';
    // 用模块的 userPromptTemplate，替换占位符
    const template = mod.userPromptTemplate || '';
    const base = template
      .replace(/\{name\}/g, nameHint)
      .replace(/\{gender\}/g, f.gender)
      .replace(/\{age\}/g, String(adultAge(f.age)))
      .replace(/\{identity\}/g, f.identity || '未指定')
      .replace(/\{relation\}/g, f.relation || '未指定')
      .replace(/\{location\}/g, f.location || '未指定')
      .replace(/\{faction\}/g, f.faction || '未指定')
      .replace(/\{role\}/g, f.role || '未指定')
      .replace(/\{tone\}/g, f.tone || '乱世写实、克制有余韵')
      .replace(/\{keywordHint\}/g, f.keywordHint || '无')
      .replace(/\{appearance\}/g, f.appearance || '无')
      .replace(/\{kinkBoundary\}/g, f.kinkBoundary || '按角色自然生成')
      .replace(/\{physique\}/g, f.physique || '无')
      .replace(/\{extra\}/g, f.extra || '无')
      .replace(/\{nameTag\}/g, nameHint);

    // 如果不生成 NSFW，裁掉模板中的 NSFW 指令部分，并明确告知 AI
    var finalBase = base;
    if (f.genNsfw === false) {
      var nsfwIdx = finalBase.indexOf('nsfw_content');
      if (nsfwIdx > 0) {
        // 找到 nsfw_content 之前最后一个换行，从这里截断
        var cutIdx = finalBase.lastIndexOf('\n', nsfwIdx);
        if (cutIdx < 0) cutIdx = nsfwIdx;
        finalBase = finalBase.substring(0, cutIdx).trim();
      }
      finalBase += '\n\n注意：本次不生成 NSFW 内容。nsfw_content、nsfw_keywords、nsfw_secondary_keywords 三个字段全部返回空值（空字符串或空数组）。nsfw_title 返回空字符串。';
    }

    if (mode !== 'revise') return finalBase;
    // 再次优化模式：使用独立的修订提示词，把当前结果和反馈明确传给 AI
    const r = state.result || {};
    return `请根据用户反馈，优化以下已生成的角色设定。保持相同的 JSON 结构，只修改需要改的部分。

用户反馈：
${state.feedback || '请增强具体经历与可扮演性。'}

当前角色名：${r.name || nameHint}
当前 SFW 条目名：${r.sfwTitle || ''}
当前 NSFW 条目名：${r.nsfwTitle || ''}

当前 sfw_keywords：${(r.sfwKeywords || []).join(', ')}
当前 nsfw_keywords：${(r.nsfwKeywords || []).join(', ')}
当前 nsfw_secondary_keywords：${(r.nsfwSecondaryKeywords || []).join(', ')}

===== 当前 SFW 内容 =====
${r.sfwContent || '（无）'}

===== 当前 NSFW 内容 =====
${r.nsfwContent || '（无）'}

===== 结束 =====

请返回修改后的完整 JSON（name, alias, sfw_title, nsfw_title, sfw_keywords, nsfw_keywords, nsfw_secondary_keywords, sfw_content, nsfw_content）。不要省略任何字段，即使该字段没有改动也要包含。`;
  }

  function resultSchema() {
    return {
      name: 'canming_character_worldbook_entry',
      schema: { type: 'object', additionalProperties: false, required: ['name','alias','sfw_title','nsfw_title','sfw_keywords','nsfw_keywords','nsfw_secondary_keywords','sfw_content','nsfw_content'], properties: { name:{type:'string'}, alias:{type:'array',items:{type:'string'}}, sfw_title:{type:'string'}, nsfw_title:{type:'string'}, sfw_keywords:{type:'array',items:{type:'string'}}, nsfw_keywords:{type:'array',items:{type:'string'}}, nsfw_secondary_keywords:{type:'array',items:{type:'string'}}, sfw_content:{type:'string'}, nsfw_content:{type:'string'} } },
    };
  }

  function genericSystemPrompt() {
    const mod = currentModule();
    const parts = [];
    if (globalCfg.limitBreakPrompt) parts.push(globalCfg.limitBreakPrompt);

    const wbContent = getSelectedWbContent();
    if (wbContent) parts.push(`以下是当前角色绑定的世界书参考内容，生成时请与这些设定保持协调：\n\n${wbContent}`);

    if (mod.sys) parts.push(mod.sys);
    return parts.join('\n\n');
  }

  function genericUserPrompt() {
    const mod = currentModule();
    const f = state.genericForm;
    // 拼入自定义字段的值
    let fieldsValues = '';
    if (mod.fields && mod.fields.length > 0) {
      fieldsValues = '\n' + mod.fields.map(field => {
        const val = (f[field.name] || '').trim();
        return val ? `${field.name}：${val}` : null;
      }).filter(Boolean).join('\n');
    }
    let fieldsGuide = '';
    if (mod.fields && mod.fields.length > 0) {
      fieldsGuide = '\n\n请在 content 中按以下结构组织内容：\n' + mod.fields.map(field => `<${field.name}>: ${field.pmt}`).join('\n');
    }
    return `请生成一个${mod.tag}世界书条目。\n名称/主题：${f.topic || '请你命名'}\n风格倾向：${f.style || '无特殊要求'}${fieldsValues ? '\n' + fieldsValues : ''}\n关键词偏好：${f.keywords || '无'}\n补充说明：${f.extra || '无'}\n\n返回 JSON 字段：title, keywords, content。content 请用 <${mod.tag}>...</${mod.tag}> 包裹，内部结构清晰，可直接作为世界书正文。${fieldsGuide}`;
  }

  function genericSchema() {
    return { name: 'canming_generic_worldbook_entry', schema: { type: 'object', additionalProperties: false, required: ['title','keywords','content'], properties: { title:{type:'string'}, keywords:{type:'array',items:{type:'string'}}, content:{type:'string'} } } };
  }

  async function callGenericAi() {
    const generateRaw = api('generateRaw'), generate = api('generate');
    if (typeof generateRaw !== 'function' && typeof generate !== 'function') throw new Error('未找到 generateRaw/generate 接口。');
    const customApi = buildCustomApiConfig();
    const config = { should_silence: true, ordered_prompts: [{ role: 'system', content: genericSystemPrompt() }, { role: 'user', content: genericUserPrompt() }], json_schema: genericSchema() };
    if (customApi) config.custom_api = customApi;

    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = typeof generateRaw === 'function' ? await generateRaw(config) : await generate({ should_silence: true, user_input: `${genericSystemPrompt()}\n\n${genericUserPrompt()}`, json_schema: genericSchema() });
        return parseAiResult(raw);
      } catch (e) {
        lastError = e;
        if (attempt === 0) {
          config.ordered_prompts = [{ role: 'system', content: buildSystemPromptForRetry() }, { role: 'user', content: genericUserPrompt() + '\n\n（上次输出不是合法 JSON，请严格只输出 JSON 对象。）' }];
        }
      }
    }
    throw lastError || new Error('生成失败');
  }

  async function callAi(mode = 'generate') {
    const generateRaw = api('generateRaw'), generate = api('generate');
    if (typeof generateRaw !== 'function' && typeof generate !== 'function') throw new Error('未找到 generateRaw/generate 接口。');
    const customApi = buildCustomApiConfig();
    const config = { should_silence: true, ordered_prompts: [{ role: 'system', content: buildSystemPrompt() }, { role: 'user', content: buildUserPrompt(mode) }], json_schema: resultSchema() };
    if (customApi) config.custom_api = customApi;

    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = typeof generateRaw === 'function' ? await generateRaw(config) : await generate({ should_silence: true, user_input: `${buildSystemPrompt()}\n\n${buildUserPrompt(mode)}`, json_schema: resultSchema() });
        return parseAiResult(raw);
      } catch (e) {
        lastError = e;
        if (attempt === 0) {
          config.ordered_prompts = [
            { role: 'system', content: buildSystemPromptForRetry() },
            { role: 'user', content: buildUserPrompt(mode) + '\n\n（上次输出不是合法 JSON——必须严格输出 JSON，所有字符串内的双引号和换行都要转义。）' },
          ];
        }
      }
    }
    throw lastError || new Error('生成失败');
  }

  function parseAiResult(raw) {
    // 已经是对象，直接返回
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;

    const text = String(raw || '').trim();
    if (!text) throw new Error('AI 没有返回内容。');

    // 尝试1：提取 markdown 代码块中的 JSON
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const body = (fenced || text).trim();

    // 尝试2：直接解析
    try { return JSON.parse(body); } catch { /* continue */ }

    // 尝试3：找到最外层 {} 并解析
    const start = body.indexOf('{'), end = body.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(body.slice(start, end + 1)); } catch { /* continue */ }
    }

    // 尝试4：用正则提取各个 JSON 字段（容错解析）
    const extractStr = (key) => {
      // 匹配 "key": "value" 或 "key":"value"，值可能包含转义引号
      const regex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i');
      const match = body.match(regex);
      if (match) return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      // 也尝试匹配跨行的值（非贪婪到下一个已知字段或结尾）
      const altRegex = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"(?:\\s*[,\\}])`, 'i');
      const altMatch = body.match(altRegex);
      return altMatch ? altMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\') : '';
    };
    const extractArr = (key) => {
      const regex = new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`, 'i');
      const match = body.match(regex);
      if (!match) return [];
      return match[1].split(',').map(s => s.replace(/^["\\s]+|["\\s]+$/g, '').trim()).filter(Boolean);
    };

    const name = extractStr('name') || extractStr('sfw_title')?.replace(/_SFW$/, '') || '未命名角色';
    const alias = extractArr('alias');
    const sfwTitle = extractStr('sfw_title') || `${name}_SFW`;
    const nsfwTitle = extractStr('nsfw_title') || `${name}_NSFW`;
    const sfwKeywords = extractArr('sfw_keywords');
    const nsfwKeywords = extractArr('nsfw_keywords');
    const nsfwSecondaryKeywords = extractArr('nsfw_secondary_keywords');

    // 对于 content 字段，尝试提取，失败则从全文提取
    let sfwContent = extractStr('sfw_content');
    let nsfwContent = extractStr('nsfw_content');

    // 如果 content 为空但全文包含角色设定标签，从标签中提取
    if (!sfwContent) {
      const sfwTagMatch = body.match(/<角色设定[^>]*_SFW>([\s\S]*?)<\/角色设定[^>]*_SFW>/i);
      if (sfwTagMatch) sfwContent = sfwTagMatch[0];
    }
    if (!nsfwContent) {
      const nsfwTagMatch = body.match(/<角色设定[^>]*_NSFW>([\s\S]*?)<\/角色设定[^>]*_NSFW>/i);
      if (nsfwTagMatch) nsfwContent = nsfwTagMatch[0];
    }

    if (!sfwContent && !nsfwContent && !name) {
      throw new Error('AI 返回内容不是可解析的 JSON。');
    }

    console.log('[万象生成器] 使用容错解析提取了角色数据');
    return { name, alias, sfw_title: sfwTitle, nsfw_title: nsfwTitle, sfw_keywords: sfwKeywords, nsfw_keywords: nsfwKeywords, nsfw_secondary_keywords: nsfwSecondaryKeywords, sfw_content: sfwContent, nsfw_content: nsfwContent };
  }

  // ============================================
  // 生成动作
  // ============================================
  async function generateCharacter() {
    state.error = '';
    if (!String(state.form.name || '').trim() && !await confirmInMount('没有填写姓名，要让 AI 直接命名吗？')) return;
    state.form.age = String(adultAge(state.form.age));
    state.loading = true; updateContent(); updateFooter();
    try {
      const raw = await callAi('generate');
      state.result = normalizeResult(raw, state.form);
      state.activeTab = 'sfw'; dirty = true;
      notify('✓ 角色已生成，可先查看再写入', 'ok');
    } catch (error) {
      console.error('[万象生成器] 生成失败:', error);
      state.error = `生成失败：${error?.message || '未知错误'}`;
      notify(`✗ ${state.error}`, 'err');
    } finally { state.loading = false; updateContent(); updateFooter(); }
  }

  async function generateGeneric() {
    state.error = ''; state.loading = true; updateContent(); updateFooter();
    try {
      const raw = await callGenericAi();
      state.genericResult = normalizeGenericResult(raw);
      dirty = true;
      notify(`✓ ${currentModule().tag}已生成，可先查看再写入`, 'ok');
    } catch (error) {
      console.error('[多功能生成器] 通用生成失败:', error);
      state.error = `生成失败：${error?.message || '未知错误'}`;
      notify(`✗ ${state.error}`, 'err');
    } finally { state.loading = false; updateContent(); updateFooter(); }
  }

  async function reviseCharacter() {
    if (!state.result) return;
    state.error = ''; state.loading = true; updateContent(); updateFooter();
    try {
      const raw = await callAi('revise');
      state.result = normalizeResult(raw, state.form);
      state.activeTab = 'sfw'; dirty = true;
      notify('✓ 已按反馈优化结果', 'ok');
    } catch (error) {
      console.error('[万象生成器] 优化失败:', error);
      state.error = `优化失败：${error?.message || '未知错误'}`;
      notify(`✗ ${state.error}`, 'err');
    } finally { state.loading = false; updateContent(); updateFooter(); }
  }

  // ============================================
  // 世界书写入
  // ============================================
  function buildWorldbookEntry(title, content, keys, secondaryKeys, order) {
    return {
      name: title, enabled: true, content,
      strategy: { type: globalCfg.wbTri || 'selective', keys: ensureArray(keys), keys_secondary: { logic: secondaryKeys?.length ? 'and_any' : 'and_any', keys: ensureArray(secondaryKeys) }, scan_depth: 'same_as_global' },
      position: { type: globalCfg.wbPos || 'after_character_definition', role: 'system', depth: 0, order: order ?? (globalCfg.wbOrd || 100) },
      recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
      probability: 100, effect: { sticky: null, cooldown: null, delay: null },
    };
  }


  function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function getCurrentWork() {
    const mod = currentModule();
    if (state.module === 'character') {
      if (!state.result) return null;
      const r = state.result;
      return {
        module: 'character', moduleName: mod.name, type: 'character-package', title: r.name, result: cloneJson(r),
        entries: [
          buildWorldbookEntry(r.sfwTitle, r.sfwContent, r.sfwKeywords, [], 56),
          buildWorldbookEntry(r.nsfwTitle, r.nsfwContent, r.nsfwKeywords, r.nsfwSecondaryKeywords?.length ? r.nsfwSecondaryKeywords : ['NSFW'], 57),
        ],
      };
    }
    if (!state.genericResult) return null;
    const title = `${mod.tag} | ${state.genericResult.title}`;
    return {
      module: mod.isDefault && ['item', 'faction', 'event'].includes(mod.id) ? mod.id : 'custom',
      moduleName: mod.name, type: 'worldbook-entry', title: state.genericResult.title, result: cloneJson(state.genericResult),
      entries: [buildWorldbookEntry(title, state.genericResult.content, state.genericResult.keywords, [], 100)],
    };
  }

  function listShareableGenerators() {
    return cloneJson(modules.map(generator => ({ id: generator.id, name: generator.name, tag: generator.tag, icon: generator.icon, isDefault: Boolean(generator.isDefault), modified: Boolean(customModuleDefs[generator.id]) })));
  }

  function exportGeneratorDefinition(id) {
    const generator = modules.find(item => item.id === id);
    if (!generator) throw new Error('未找到该生成器。');
    const definition = cloneJson(generator);
    delete definition.id;
    delete definition.isDefault;
    return definition;
  }

  function importGeneratorDefinition(raw) {
    const definition = cloneJson(raw);
    if (!definition || !definition.tag || !Array.isArray(definition.fields)) throw new Error('生成器定义不完整。');
    definition.id = uuid();
    definition.isDefault = false;
    definition.name = String(definition.name || definition.tag).trim();
    customModuleDefs[definition.id] = definition;
    moduleOrder.push(definition.id);
    saveCustomModules();
    if (isOpen) render();
    return cloneJson(definition);
  }

  function removeGeneratorDefinition(id) {
    const definition = customModuleDefs[id];
    if (!definition || definition.isDefault || DEFAULT_MODULES.some(item => item.id === id)) return false;
    delete customModuleDefs[id];
    moduleOrder = moduleOrder.filter(item => item !== id);
    if (state.module === id) state.module = 'character';
    saveCustomModules();
    if (isOpen) render();
    return true;
  }

  function exportCurrentWork(metadata = {}) {
    const work = getCurrentWork();
    if (!work) throw new Error('请先生成作品，再发布到创意工坊。');
    const meta = {
      title: String(metadata.title || work.title || '').trim(),
      summary: String(metadata.summary || '').trim(),
      tags: ensureArray(metadata.tags).map(value => String(value).trim()).filter(Boolean),
    };
    if (work.type === 'character-package') {
      const r = work.result;
      return {
        format: 'canming-workshop-package', version: 1, type: work.type, module: 'character', createdAt: new Date().toISOString(), metadata: meta,
        payload: {
          character: { id: `generated-${Date.now()}`, name: r.name, aliases: cloneJson(r.alias), title: '', summary: meta.summary, worldbookEntries: work.entries.map(entry => entry.name) },
          portraits: {}, worldbookEntries: cloneJson(work.entries),
        },
      };
    }
    return {
      format: 'canming-workshop-package', version: 1, type: work.type, module: work.module, createdAt: new Date().toISOString(), metadata: meta,
      payload: { moduleName: work.moduleName, entries: cloneJson(work.entries) },
    };
  }

  function importWork(bundle) {
    if (bundle?.format !== 'canming-workshop-package' || bundle?.version !== 1) throw new Error('作品包格式无效。');
    if (bundle.type === 'character-package') {
      const character = bundle.payload?.character;
      const entries = bundle.payload?.worldbookEntries;
      if (!character?.name || !Array.isArray(entries)) throw new Error('角色作品内容不完整。');
      state.module = 'character';
      state.result = normalizeResult({
        name: character.name, alias: character.aliases,
        sfw_title: entries[0]?.name, sfw_content: entries[0]?.content, sfw_keywords: entries[0]?.strategy?.keys,
        nsfw_title: entries[1]?.name, nsfw_content: entries[1]?.content, nsfw_keywords: entries[1]?.strategy?.keys,
        nsfw_secondary_keywords: entries[1]?.strategy?.keys_secondary?.keys,
      });
      state.genericResult = null;
    } else if (bundle.type === 'worldbook-entry') {
      const entry = bundle.payload?.entries?.[0];
      if (!entry?.name || typeof entry.content !== 'string') throw new Error('世界书作品内容不完整。');
      const requestedModule = bundle.module === 'custom' ? modules.find(item => !item.isDefault)?.id : bundle.module;
      state.module = modules.some(item => item.id === requestedModule) ? requestedModule : 'item';
      state.genericResult = normalizeGenericResult({ title: bundle.metadata?.title || entry.name, keywords: entry.strategy?.keys, content: entry.content });
      state.result = null;
    } else {
      throw new Error('不支持的作品类型。');
    }
    dirty = true;
    if (isOpen) render();
    return getCurrentWork();
  }

  async function writeEntries() {
    if (!state.result) return;
    state.error = ''; state.loading = true; updateContent(); updateFooter();
    try {
      await refreshWorldbookName();
      const wbName = state.targetWorldbook;
      if (!wbName) throw new Error('当前角色没有绑定主世界书。');
      const getWorldbook = api('getWorldbook'), createWorldbookEntries = api('createWorldbookEntries'), deleteWorldbookEntries = api('deleteWorldbookEntries');
      if (typeof createWorldbookEntries !== 'function') throw new Error('未找到 createWorldbookEntries 接口。');
      const r = state.result;
      const titles = [r.sfwTitle, r.nsfwTitle].filter(Boolean);
      let existing = [];
      if (typeof getWorldbook === 'function') { const entries = await getWorldbook(wbName); existing = (entries || []).filter(e => titles.includes(e.name)); }
      if (existing.length && !await confirmInMount(`世界书中已存在同名条目：${existing.map(e => e.name).join('、')}。要覆盖吗？`)) { state.loading = false; updateContent(); updateFooter(); return; }
      if (existing.length) { if (typeof deleteWorldbookEntries !== 'function') throw new Error('需要覆盖同名条目，但未找到 deleteWorldbookEntries 接口。'); await deleteWorldbookEntries(wbName, e => titles.includes(e.name), { render: 'debounced' }); }
      await createWorldbookEntries(wbName, [buildWorldbookEntry(r.sfwTitle, r.sfwContent, r.sfwKeywords, [], 56), buildWorldbookEntry(r.nsfwTitle, r.nsfwContent, r.nsfwKeywords, r.nsfwSecondaryKeywords?.length ? r.nsfwSecondaryKeywords : ['NSFW'], 57)], { render: 'immediate' });
      dirty = false;
      notify(`✓ 已写入世界书：${wbName}`, 'ok');
    } catch (error) { console.error('[万象生成器] 写入失败:', error); state.error = `写入失败：${error?.message || '未知错误'}`; notify(`✗ ${state.error}`, 'err'); }
    finally { state.loading = false; updateContent(); updateFooter(); }
  }

  async function writeGenericEntry() {
    if (!state.genericResult) return;
    state.error = ''; state.loading = true; updateContent(); updateFooter();
    try {
      await refreshWorldbookName();
      const wbName = state.targetWorldbook;
      if (!wbName) throw new Error('当前角色没有绑定主世界书。');
      const getWorldbook = api('getWorldbook'), createWorldbookEntries = api('createWorldbookEntries'), deleteWorldbookEntries = api('deleteWorldbookEntries');
      if (typeof createWorldbookEntries !== 'function') throw new Error('未找到 createWorldbookEntries 接口。');
      const mod = currentModule();
      const title = `${mod.tag} | ${state.genericResult.title}`;
      let existing = [];
      if (typeof getWorldbook === 'function') { const entries = await getWorldbook(wbName); existing = (entries || []).filter(e => e.name === title); }
      if (existing.length && !await confirmInMount(`世界书中已存在同名条目：${title}。要覆盖吗？`)) { state.loading = false; updateContent(); updateFooter(); return; }
      if (existing.length) { if (typeof deleteWorldbookEntries !== 'function') throw new Error('需要覆盖同名条目，但未找到 deleteWorldbookEntries 接口。'); await deleteWorldbookEntries(wbName, e => e.name === title, { render: 'debounced' }); }
      await createWorldbookEntries(wbName, [buildWorldbookEntry(title, state.genericResult.content, state.genericResult.keywords, [], 100)], { render: 'immediate' });
      dirty = false;
      notify(`✓ 已写入世界书：${wbName}`, 'ok');
    } catch (error) { console.error('[多功能生成器] 写入失败:', error); state.error = `写入失败：${error?.message || '未知错误'}`; notify(`✗ ${state.error}`, 'err'); }
    finally { state.loading = false; updateContent(); updateFooter(); }
  }

  // ============================================
  // 导出
  // ============================================
  const exposed = { open, close, toggle, getCurrentWork, exportCurrentWork, importWork, listShareableGenerators, exportGeneratorDefinition, importGeneratorDefinition, removeGeneratorDefinition };
  globalThis[API_NAME] = exposed;
  try { if (window.parent && window.parent !== window) window.parent[API_NAME] = exposed; } catch { /* ignore */ }
})();
