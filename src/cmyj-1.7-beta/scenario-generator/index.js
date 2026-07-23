import YAML from 'yaml';
import { Schema } from '../schema/definition.js';

(() => {
  'use strict';

  const API_NAME = 'CanmingScenarioGenerator';
  const ROOT_ID = 'canming-scenario-generator-root';
  const STYLE_ID = 'canming-scenario-generator-style';
  const PROJECT_KEY = 'canming-dlc-staging:scenario-generator:project:v1';
  const API_SETTINGS_KEY = 'canming-dlc-staging:generator:api';
  const ERA_ENTRY_NAME = '[scenario_generator]崇祯七年七月模板';
  const ERA_ID = 'cmyj.era.chongzhen-7-07';
  const MAX_BYTES = 1_400_000;
  const MAX_REFERENCE_CHARS = 24_000;
  const MAX_PERSONA_CHARS = 120_000;
  const MAX_OPENING_SOURCE_CHARS = 42_000;
  const CHARACTER_ADAPTATION_PATTERN =
    /<!-- CANMING_CHARACTER_ADAPTATION_START -->[\s\S]*?<!-- CANMING_CHARACTER_ADAPTATION_END -->/g;
  const DEFAULT_API_SETTINGS = {
    apiType: 'openai',
    apiUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.8,
    maxTokens: 12000,
    topP: 0.9,
    frequencyPenalty: 0,
    presencePenalty: 0,
  };

  const CHARACTERS = [
    ['安娜', '通晓汉文账目的荷商之女'],
    ['白瑶', '以乱世为棋盘的白莲教首'],
    ['翠儿', '嘴碎心热的贫家丫鬟'],
    ['洪天妹', '将神谕拆成实务的异想少女'],
    ['林知夏', '活泼温善的商户独女'],
    ['柳氏', '被市井生活掩住的旧家闺秀'],
    ['陆挽星', '携剑独行的北地女武师'],
    ['栖月', '以细微行动表达心意的妹妹'],
    ['栖云', '把自己活成家中屏障的姐姐'],
    ['沈清晏', '眼高嘴利的市井才女'],
    ['苏晚棠', '怯于决断却从不放手的当家妇人'],
    ['苏晚月', '嘴毒手稳的边镇遗孀'],
    ['温素弦', '在流寇营中爬上来的女头目'],
    ['周氏', '把世故当作护身符的女掌柜'],
    ['常彪', '莽直仗义的基层捕役'],
    ['顾明远', '嘴毒心细的落魄秀才'],
    ['沈大柱', '憨直勤恳的市井屠户'],
    ['赵砚', '机灵沉默又重情的养子'],
    ['方子衿', '沉迷算理格致的方家少女', 'family'],
    ['杨尔铭', '崇祯年间桐城知县', 'history'],
    ['方孔炤', '桐城方氏仕宦', 'history'],
    ['方以智', '复社名士与格致学者', 'history'],
    ['柳如是', '秦淮才女', 'history'],
    ['陈圆圆', '苏州梨园女乐', 'history'],
    ['周皇后', '崇祯皇后', 'history'],
    ['朱徽媞', '明光宗之女', 'history'],
    ['张嫣', '明熹宗遗孀', 'history'],
  ].map(([name, summary, lock = 'free']) => ({ name, summary, lock }));

  const FIXED_RELATIONS = [
    ['栖云', '栖月', '双胞胎姐妹'],
    ['苏晚棠', '栖云', '养母女'],
    ['苏晚棠', '栖月', '养母女'],
    ['苏晚棠', '赵砚', '养母子'],
    ['苏晚棠', '苏晚月', '姐妹'],
    ['周氏', '林知夏', '母女'],
    ['沈大柱', '柳氏', '夫妻'],
    ['沈大柱', '沈清晏', '父女'],
    ['柳氏', '沈清晏', '母女'],
    ['方孔炤', '方子衿', '父女'],
    ['方以智', '方子衿', '兄妹'],
  ];

  const CATEGORIES = ['上司', '故友与同僚', '下属与幕僚', '三教九流', '仇敌', '亲属', '私帷'];
  const PRIVATE_RELATIONS = ['妻', '妾', '通房', '红颜', '女眷'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const api = name => globalThis[name] ?? window.parent?.[name];
  const esc = value =>
    String(value ?? '').replace(
      /[&<>"']/g,
      char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
  const slug = value =>
    String(value || 'my-origin')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || 'my-origin';
  const normalizeUserToken = value => {
    const sentinel = '\u0000CMYJ_USER_TOKEN\u0000';
    return String(value ?? '')
      .replace(/<\s*user\s*>/gi, sentinel)
      .replace(/\{\{\s*user\s*\}\}/gi, sentinel)
      .replace(/\buser\b/gi, sentinel)
      .replaceAll(sentinel, '<user>');
  };
  const normalizeGeneratedValue = value => {
    if (typeof value === 'string') return normalizeUserToken(value);
    if (Array.isArray(value)) return value.map(normalizeGeneratedValue);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeGeneratedValue(item)]));
    return value;
  };

  function characterState(character) {
    return {
      included: false,
      known: false,
      scene: false,
      relation: character.lock === 'history' ? '尚未相识' : '尚未相识',
      category: '故友与同僚',
      privateRelation: '红颜',
      affection: 0,
      loyalty: 50,
      adaptationBrief: '',
      identity: character.lock === 'history' ? character.summary : '',
      activityArea: '',
      faction: '',
      relationshipOrigin: '',
      relationshipPattern: '',
      characterToUser: '',
      userToCharacter: '',
      longTermSituation: '',
      adaptationPrinciples: [],
    };
  }

  function newProject() {
    return {
      format: 'canming-scenario-project',
      version: 2,
      eraId: ERA_ID,
      step: 1,
      title: '我的残明开局',
      id: `cmyj.custom.${Date.now().toString(36)}`,
      packageVersion: '0.1.0',
      summary: '',
      tags: ['残明余烬', '身份DLC'],
      protagonist: {
        origin: '原生人物',
        identity: '',
        occupation: '',
        location: '',
        faction: '',
        predicament: '',
        goal: '',
        tone: '乱世写实、克制有余韵',
      },
      date: { day: '初五日', hour: 9, minute: 0, shichen: '巳时', ke: '初刻', weather: '晴' },
      stats: {
        life: 60,
        martial: 15,
        command: 10,
        wisdom: 55,
        politics: 25,
        reputation: 0,
        gold: 0,
        silver: 3,
        copper: 200,
      },
      opening: { id: 'origin-opening', name: '第一幕', hook: '', body: '', targetWords: 1200, referenceEntries: [] },
      initialization: { patch: {}, summary: '', stale: true, generatedAt: '' },
      characters: Object.fromEntries(CHARACTERS.map(character => [character.name, characterState(character)])),
    };
  }

  let mountDocument = document;
  let options = {};
  let root = null;
  let project = newProject();
  let eraPreset = null;
  let eraError = '';
  let busy = false;
  let message = '';
  let messageType = 'info';
  let rosterQuery = '';
  let rosterFilter = 'all';
  const expandedCharacters = new Set();
  let referenceWorldbookNames = [];
  const referenceWorldbookCache = {};
  let referenceWorldbookViewing = '';
  let referenceWorldbookError = '';
  let boundWorldbookNames = [];
  let aiTask = '';

  function storage() {
    return mountDocument.defaultView?.localStorage ?? localStorage;
  }
  function saveProject() {
    try {
      storage().setItem(PROJECT_KEY, JSON.stringify(project));
    } catch {
      /* ignore */
    }
  }
  function normalizeProject(raw) {
    const base = newProject();
    const next = {
      ...base,
      ...(raw || {}),
      version: 2,
      protagonist: { ...base.protagonist, ...(raw?.protagonist || {}) },
      date: { ...base.date, ...(raw?.date || {}) },
      stats: { ...base.stats, ...(raw?.stats || {}) },
      opening: { ...base.opening, ...(raw?.opening || {}) },
      initialization: { ...base.initialization, ...(raw?.initialization || {}) },
    };
    next.characters = Object.fromEntries(
      CHARACTERS.map(character => {
        const previous = raw?.characters?.[character.name] || {};
        const migrated = { ...characterState(character), ...previous };
        migrated.adaptationBrief = String(previous.adaptationBrief || '');
        migrated.activityArea = String(previous.activityArea || previous.location || migrated.activityArea || '');
        migrated.adaptationPrinciples = Array.isArray(previous.adaptationPrinciples)
          ? previous.adaptationPrinciples.filter(Boolean).map(String)
          : [];
        for (const transient of [
          'location',
          'openingExperience',
          'goals',
          'knownInformation',
          'appearanceConditions',
          'interactionRules',
        ])
          delete migrated[transient];
        return [character.name, migrated];
      }),
    );
    next.step = Math.min(4, Math.max(1, Number(next.step) || 1));
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(String(next.id || ''))) next.id = base.id;
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(String(next.opening.id || ''))) next.opening.id = base.opening.id;
    next.opening.targetWords = Math.min(5000, Math.max(300, Number(next.opening.targetWords) || 1200));
    next.opening.referenceEntries = Array.isArray(next.opening.referenceEntries)
      ? next.opening.referenceEntries
          .filter(item => item?.worldbook && item?.name)
          .map(item => ({ worldbook: String(item.worldbook), name: String(item.name) }))
      : [];
    next.initialization.patch =
      next.initialization.patch && typeof next.initialization.patch === 'object' ? next.initialization.patch : {};
    if (
      raw?.initialization &&
      !Object.hasOwn(raw.initialization, 'stale') &&
      Object.keys(next.initialization.patch).length
    )
      next.initialization.stale = false;
    return next;
  }
  function loadProject() {
    try {
      project = normalizeProject(JSON.parse(storage().getItem(PROJECT_KEY) || 'null'));
    } catch {
      project = newProject();
    }
  }

  function notify(text, type = 'info') {
    message = text;
    messageType = type;
    const status = root?.querySelector('.sg-status');
    if (status) {
      status.textContent = message;
      status.title = message;
      status.className = `sg-status ${messageType}`;
    }
    if (type === 'error') console.error('[残明余烬开局生成器]', message);
  }

  function markInitializationStale() {
    if (!project.initialization) project.initialization = { patch: {}, summary: '', stale: true, generatedAt: '' };
    project.initialization.stale = true;
  }

  function hourToShichen(hour) {
    return ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'][
      Math.floor(((Number(hour) + 1) % 24) / 2)
    ];
  }

  async function loadEraPreset() {
    eraPreset = null;
    eraError = '';
    try {
      if (options.eraPreset) eraPreset = clone(options.eraPreset);
      else {
        const getNames = api('getCharWorldbookNames');
        const getWorldbook = api('getWorldbook');
        if (typeof getNames !== 'function' || typeof getWorldbook !== 'function')
          throw new Error('当前酒馆没有提供世界书读取接口。');
        const names = await getNames('current');
        const worldbookName = names?.primary || names?.additional?.[0];
        if (!worldbookName) throw new Error('当前角色没有绑定主世界书。');
        const entries = (await getWorldbook(worldbookName)) || [];
        const entry = entries.find(item => item?.name === ERA_ENTRY_NAME);
        if (!entry?.content) throw new Error(`基础卡缺少时代模板「${ERA_ENTRY_NAME}」。`);
        eraPreset = YAML.parse(entry.content);
      }
      if (
        eraPreset?.格式 !== 'canming-era-preset' ||
        eraPreset?.标识 !== ERA_ID ||
        !eraPreset?.变量?.天下地图?.地区态势
      )
        throw new Error('时代模板格式不正确或内容不完整。');
    } catch (error) {
      eraError = error?.message || '无法读取时代模板。';
    }
  }

  async function ensureReferenceWorldbook(name) {
    if (!name || referenceWorldbookCache[name]) return;
    const getWorldbook = api('getWorldbook');
    if (typeof getWorldbook !== 'function') throw new Error('当前酒馆没有提供世界书读取接口。');
    referenceWorldbookCache[name] = (await getWorldbook(name)) || [];
  }

  async function loadBoundWorldbooks() {
    const getNames = api('getCharWorldbookNames');
    if (typeof getNames !== 'function') throw new Error('当前酒馆没有提供角色世界书读取接口。');
    const names = await getNames('current');
    boundWorldbookNames = [...new Set([names?.primary, ...(names?.additional || [])].filter(Boolean))];
    if (!boundWorldbookNames.length) throw new Error('当前角色没有绑定世界书。');
    for (const name of boundWorldbookNames) await ensureReferenceWorldbook(name);
    return boundWorldbookNames;
  }

  function stripDynamicAdaptation(content) {
    return String(content || '')
      .replace(CHARACTER_ADAPTATION_PATTERN, '')
      .trim();
  }

  async function characterPersonaContext(characters) {
    if (!characters.length) return '';
    if (!boundWorldbookNames.length) await loadBoundWorldbooks();
    const parts = [];
    const missing = [];
    for (const character of characters) {
      const candidates = [`${character.name}_SFW`, character.name];
      let found = null;
      let source = '';
      for (const worldbookName of boundWorldbookNames) {
        found = (referenceWorldbookCache[worldbookName] || []).find(item => candidates.includes(item?.name));
        if (found?.content) {
          source = worldbookName;
          break;
        }
      }
      if (!found?.content) {
        missing.push(character.name);
        continue;
      }
      parts.push(`[${source} / ${found.name}]\n${stripDynamicAdaptation(found.content)}`);
    }
    if (missing.length) throw new Error(`基础卡缺少人物人设条目：${missing.join('、')}。请先更新或补全角色卡世界书。`);
    const content = parts.join('\n\n');
    if (content.length > MAX_PERSONA_CHARS)
      throw new Error(
        `现场人物人设共 ${content.length} 字符，超过 ${MAX_PERSONA_CHARS} 字符上限。请减少开场现场人物。`,
      );
    return content;
  }

  async function loadReferenceWorldbooks() {
    referenceWorldbookError = '';
    try {
      const getNames = api('getWorldbookNames'),
        getBoundNames = api('getCharWorldbookNames');
      const allNames = typeof getNames === 'function' ? (await getNames()) || [] : [];
      const bound = typeof getBoundNames === 'function' ? await getBoundNames('current') : null;
      const preferred = [bound?.primary, ...(bound?.additional || [])].filter(Boolean);
      referenceWorldbookNames = [...new Set([...preferred, ...allNames])];
      if (!referenceWorldbookViewing || !referenceWorldbookNames.includes(referenceWorldbookViewing))
        referenceWorldbookViewing = preferred[0] || referenceWorldbookNames[0] || '';
      if (referenceWorldbookViewing) await ensureReferenceWorldbook(referenceWorldbookViewing);
    } catch (error) {
      referenceWorldbookError = error?.message || '无法读取世界书列表。';
    }
  }

  async function selectedReferenceContext(maxChars = MAX_REFERENCE_CHARS) {
    if (maxChars <= 0) return '';
    const selections = project.opening.referenceEntries || [];
    const grouped = selections.reduce((result, item) => ((result[item.worldbook] ||= []).push(item), result), {});
    const parts = [];
    for (const [worldbook, items] of Object.entries(grouped)) {
      await ensureReferenceWorldbook(worldbook);
      const selectedNames = new Set(items.map(item => item.name));
      for (const item of referenceWorldbookCache[worldbook] || [])
        if (selectedNames.has(item.name) && item.content) parts.push(`[${worldbook} / ${item.name}]\n${item.content}`);
    }
    const content = parts.join('\n\n');
    const limit = Math.min(MAX_REFERENCE_CHARS, maxChars);
    return content.length > limit
      ? `${content.slice(0, limit)}\n\n[参考内容已按 ${limit} 字符的本次上下文预算截断]`
      : content;
  }

  function networkRecord(name, state) {
    const base = {
      身份: state.identity || `${project.protagonist.location}人物`,
      角色心声: '',
      是否在场: Boolean(state.scene),
    };
    if (state.category === '仇敌') return { ...base, 仇恨度: clamp(-state.affection, 0, 100) };
    if (state.category === '下属与幕僚')
      return { ...base, 好感度: clamp(state.affection, -100, 100), 忠心: clamp(state.loyalty, 0, 100) };
    if (state.category === '私帷')
      return {
        ...base,
        关系: PRIVATE_RELATIONS.includes(state.privateRelation) ? state.privateRelation : '红颜',
        好感度: clamp(state.affection, -100, 100),
        忠心: clamp(state.loyalty, 0, 100),
        生育: {
          周期: 1,
          时期: '安全期',
          状态: '未孕',
          末次同房: { 日期: '', 周期日: 0, 判定概率: 0 },
          预产期: '',
          _预产天数: 0,
          _产后天数: 0,
        },
      };
    return { ...base, 好感度: clamp(state.affection, -100, 100) };
  }

  function mergeDeep(base, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const target = base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) ? base[key] : {};
        base[key] = mergeDeep(target, value);
      } else base[key] = value;
    }
    return base;
  }

  function sanitizeInitializationPatch(raw) {
    const patch = raw && typeof raw === 'object' ? clone(raw) : {};
    const allowed = new Set(['主角', '人际网络', '军事', '经济', '科技', '个人史记', '时局与任务']);
    for (const key of Object.keys(patch)) if (!allowed.has(key)) delete patch[key];
    if (patch.主角) patch.主角 = { 私库: { 重要物品: patch.主角?.私库?.重要物品 || {} } };
    return patch;
  }

  function createInitvar() {
    if (!eraPreset) throw new Error('尚未载入崇祯七年七月时代模板。');
    const network = Object.fromEntries(CATEGORIES.map(category => [category, {}]));
    for (const [name, state] of Object.entries(project.characters))
      if (state.included && (state.known || state.scene)) network[state.category][name] = networkRecord(name, state);
    const p = project.protagonist;
    const title = project.opening.name || '第一幕';
    const base = {
      世界运转: {
        _开场标识: project.opening.id,
        当前日期: `崇祯七年七月${project.date.day}`,
        十二时辰: { 时辰: hourToShichen(project.date.hour), 刻: project.date.ke },
        二十四时: { 小时: Number(project.date.hour), 分钟: Number(project.date.minute) },
        当前地点: p.location,
        天气: project.date.weather,
        场景: 'SFW',
        世界运转天数: 1,
      },
      主角: {
        官职: p.occupation || p.identity,
        声望: Number(project.stats.reputation),
        声望阶段: '默默无闻',
        五维: {
          生命: Number(project.stats.life),
          武力: Number(project.stats.martial),
          统率: Number(project.stats.command),
          智谋: Number(project.stats.wisdom),
          政治: Number(project.stats.politics),
        },
        私库: {
          金银铜: {
            黄金: Number(project.stats.gold),
            白银: Number(project.stats.silver),
            铜钱: Number(project.stats.copper),
          },
          重要物品: {},
        },
      },
      人际网络: network,
      军事: { 各营: {}, 将领: {}, 战斗记录: {} },
      经济: {
        资产: {},
        流水: { 本月结余: 0, 月入: {}, 月出: {} },
        仓储: {},
        市场: {
          价格指数: { 粮食: 100, 军需: 100, 常用物资: 100 },
          汇率: { 一两黄金兑白银: 6, 一两白银兑铜钱: 1200 },
          市况: '平稳',
          _库存月份: '',
          _剩余库存: {},
        },
      },
      科技: {},
      个人史记: {
        大事记: {
          [title]: {
            日期: `崇祯七年七月${project.date.day}`,
            地点: p.location,
            类型: '人事',
            事迹: p.predicament || project.opening.hook || `${p.identity}的故事由此开始`,
            影响: p.goal || '前路尚未可知',
          },
        },
      },
      天下地图: clone(eraPreset.变量.天下地图),
      时局与任务: { 势力关系: {}, 当前任务: {} },
      风月阁: { 同房点数: 0, 器物: {}, 掌柜絮语: '' },
    };
    const candidate = mergeDeep(base, sanitizeInitializationPatch(project.initialization?.patch));
    candidate.天下地图 = clone(eraPreset.变量.天下地图);
    candidate.世界运转._开场标识 = project.opening.id;
    candidate.世界运转.当前日期 = `崇祯七年七月${project.date.day}`;
    candidate.世界运转.当前地点 = p.location;
    candidate.世界运转.天气 = project.date.weather;
    const validated = Schema.parse(candidate);
    if (JSON.stringify(validated.天下地图) !== JSON.stringify(eraPreset.变量.天下地图))
      throw new Error('初始变量校验失败：天下地图被意外修改。');
    return validated;
  }

  function entry(name, content, order = 100, position = 'before_character_definition') {
    return {
      name,
      enabled: true,
      content: String(content).trim(),
      strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] } },
      position: { type: position, role: 'system', depth: 0, order },
      recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
      probability: 100,
      effect: { sticky: null, cooldown: null, delay: null },
    };
  }

  function selectedCharacters() {
    return CHARACTERS.filter(character => project.characters[character.name]?.included);
  }
  function characterAdaptations() {
    return selectedCharacters()
      .filter(character => character.lock !== 'history')
      .map(character => {
        const state = project.characters[character.name];
        return {
          character: character.name,
          overviewSummary: character.summary,
          identity: normalizeUserToken(state.identity || character.summary),
          activityArea: normalizeUserToken(state.activityArea || '随剧情中的家庭、职务或生计合理迁移'),
          faction: normalizeUserToken(state.faction || ''),
          userRelation: normalizeUserToken(state.relation || (state.known ? '相识之人' : '尚未相识')),
          relationshipOrigin: normalizeUserToken(
            state.relationshipOrigin ||
            (state.known
              ? '双方因具体经历而相识，细节应与正文保持一致。'
              : '双方起初没有既定交情，关系必须经由具体事件建立。'),
          ),
          relationshipPattern: normalizeUserToken(
            state.relationshipPattern || '关系随长期互动自然发展，不因主角光环突变。',
          ),
          characterToUser: normalizeUserToken(
            state.characterToUser || '依据双方身份、礼法与关系阶段自然称呼',
          ),
          userToCharacter: normalizeUserToken(
            state.userToCharacter || `依据身份或姓名称呼${character.name}`,
          ),
          longTermSituation: normalizeUserToken(
            state.longTermSituation || '在新的身份与环境中延续原人物的性格、能力边界和人物关系。',
          ),
          adaptationPrinciples: (state.adaptationPrinciples?.length
            ? state.adaptationPrinciples
            : ['身份与地域变化不得覆盖原始人设的性格核心、能力边界和人物关系。']
          ).map(normalizeUserToken),
          nonFixedRelationships: [],
        };
      });
  }

  function overviewEntry(overviews) {
    const data = JSON.stringify({ [project.opening.id]: overviews }, null, 2);
    return `@@preprocessing\n<%_\nvar characterOverviews = ${data};\nvar openingId = getvar('stat_data.世界运转._开场标识', { defaults: '' });\nvar people = characterOverviews[openingId] || [];\nif (people.length > 0) {\n_%>\n<人物概览>\n<%_ for (var i = 0; i < people.length; i++) { _%>\n- <%- people[i].name %>：<%- people[i].summary %>\n<%_ } _%>\n</人物概览>\n<%_ } _%>`;
  }

  function validateProject() {
    const errors = [];
    if (!project.title.trim()) errors.push('请填写 DLC 名称');
    if (!project.protagonist.identity.trim()) errors.push('请填写主角身份');
    if (!project.protagonist.location.trim()) errors.push('请填写开局地点');
    if (!project.opening.body.trim()) errors.push('请生成或填写开场白正文');
    if (project.initialization?.stale) errors.push('开场或配置已变化，请在第三步重新补全初始变量');
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(project.opening.id))
      errors.push('开场标识只能使用 2～64 位字母、数字、点、横线或下划线');
    if (!eraPreset) errors.push(eraError || '时代模板尚未载入');
    for (const character of selectedCharacters()) {
      const state = project.characters[character.name];
      if (state.scene && !state.included) errors.push(`${character.name}未纳入 DLC，不能设为开场现场人物`);
      if (state.known && !CATEGORIES.includes(state.category)) errors.push(`${character.name}的人际分类无效`);
    }
    return errors;
  }

  function stripInitializationBlocks(content) {
    return String(content || '')
      .replace(/<initvar(?:\s[^>]*)?>[\s\S]*?<\/initvar\s*>/gi, '\n')
      .replace(
        /<(?:initial[_\s-]*variables?|initialization|变量初始化|初始化变量)(?:\s[^>]*)?>[\s\S]*?<\/(?:initial[_\s-]*variables?|initialization|变量初始化|初始化变量)\s*>/gi,
        '\n',
      )
      .replace(/```(?:initvar|initial[_-]*variables?)\s*[\s\S]*?```/gi, '\n')
      .replace(
        /<\/?(?:initvar|initial[_\s-]*variables?|initialization|变量初始化|初始化变量)(?:\s[^>]*)?>/gi,
        '',
      )
      .trim();
  }

  function openingWithInitvar(content, yaml) {
    const opening = normalizeUserToken(stripInitializationBlocks(content));
    const result = `${opening}\n\n<initvar>\n${yaml}\n</initvar>`;
    if ((result.match(/<initvar>/g) || []).length !== 1 || (result.match(/<\/initvar>/g) || []).length !== 1)
      throw new Error('初始变量标签生成失败：最终内容必须且只能包含一组 <initvar>。');
    if (/<\/?(?:initial[_\s-]*variables?|initialization|变量初始化|初始化变量)(?:\s[^>]*)?>/i.test(result))
      throw new Error('初始变量标签生成失败：检测到非标准初始化标签。');
    return result;
  }

  function compilePackage() {
    const errors = validateProject();
    if (errors.length) throw new Error(errors.join('；'));
    const initial = normalizeGeneratedValue(createInitvar());
    const yaml = YAML.stringify(initial, { lineWidth: 0, indent: 2 }).trimEnd();
    Schema.parse(YAML.parse(yaml));
    const openingContent = openingWithInitvar(project.opening.body, yaml);
    const people = selectedCharacters().map(character => ({
      name: character.name,
      summary: normalizeUserToken(
        project.characters[character.name].identity
          ? `${project.characters[character.name].identity}；${character.summary}`
          : character.summary,
      ),
    }));
    const id = project.id.trim() || `cmyj.custom.${slug(project.title)}`;
    const identityContent = normalizeUserToken(
      `<主角身份背景>\n时代起点：崇祯七年七月\n来历：${project.protagonist.origin}\n开局身份：${project.protagonist.identity}\n开局职业：${project.protagonist.occupation || '无固定职业'}\n开局所属区域：${project.protagonist.location}\n开局所属势力：${project.protagonist.faction || '无固定势力'}\n说明：以上记录的是身份出发点，不代表剧情推进后的当前地点、职务、势力或目标；后续状态以变量与正文为准。\n</主角身份背景>`,
    );
    const worldbookEntries = [
      entry('[scenario]主角身份', identityContent, 1),
      entry('人物概览', overviewEntry(people), 0, 'after_character_definition'),
    ];
    const adaptations = characterAdaptations();
    const known = selectedCharacters()
      .filter(character => project.characters[character.name].known)
      .map(character => ({
        character: character.name,
        relation: normalizeUserToken(project.characters[character.name].relation),
      }));
    const selectedNames = new Set(selectedCharacters().map(character => character.name));
    const graphLinks = [
      ...known.map(item => ({ source: '主角', target: item.character, label: item.relation || '相识' })),
      ...FIXED_RELATIONS.filter(([a, b]) => selectedNames.has(a) && selectedNames.has(b)).map(
        ([source, target, label]) => ({ source, target, label }),
      ),
    ];
    const resource = {
      id,
      kind: 'scenario',
      name: project.title,
      scenario: {
        id,
        version: project.packageVersion || '0.1.0',
        baseCard: 'cmyj.base',
        minBaseVersion: '1.7.0-beta.8',
        exclusiveGroup: 'player-origin',
        allowMidChatSwitch: false,
        newChatRequired: true,
      },
      openings: [
        {
          id: project.opening.id,
          name: project.opening.name,
          subtitle: normalizeUserToken(`崇祯七年七月${project.date.day} · ${project.protagonist.identity}`),
          content: openingContent,
        },
      ],
      worldbookEntries,
      initialRelationships: known,
      portraitProfiles: selectedCharacters().map(character => ({ name: character.name })),
      characterOverviewVersion: people.length ? 1 : 0,
      characterOverviews: people.length ? { [project.opening.id]: people } : {},
      characterAdaptationVersion: 3,
      characterAdaptations: adaptations,
      ui: {
        relationshipGraph: {
          categories: [{ name: '人物关系', color: '#9f302d', symbol: 'roundRect' }],
          nodes: [
            {
              id: '主角',
              name: '主角',
              category: 0,
              symbolSize: 64,
              symbol: 'circle',
              desc: normalizeUserToken(project.protagonist.identity),
            },
            ...selectedCharacters().map(character => ({
              id: character.name,
              name: character.name,
              category: 0,
              symbolSize: 42,
              desc: normalizeUserToken(project.characters[character.name].relation || character.summary),
            })),
          ],
          links: graphLinks,
        },
      },
    };
    const bundle = {
      format: 'canming-workshop-package',
      version: 2,
      kind: 'scenario',
      createdAt: new Date().toISOString(),
      metadata: {
        title: project.title,
        summary: normalizeUserToken(
          project.summary || `${project.protagonist.location}的${project.protagonist.identity}开局。`,
        ),
        tags: project.tags,
        categories: ['剧情扩展'],
        coverUrl: '',
      },
      resources: [resource],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(bundle)).length;
    if (bytes > MAX_BYTES) throw new Error(`DLC 包体积 ${(bytes / 1024).toFixed(1)} KB，超过 1.4 MB 上限。`);
    return bundle;
  }

  function aiSettings() {
    try {
      return { ...DEFAULT_API_SETTINGS, ...JSON.parse(storage().getItem(API_SETTINGS_KEY) || '{}') };
    } catch {
      return { ...DEFAULT_API_SETTINGS };
    }
  }
  function saveAiSettings(settings) {
    storage().setItem(API_SETTINGS_KEY, JSON.stringify({ ...DEFAULT_API_SETTINGS, ...settings }));
  }
  function apiSettingsLabel() {
    const settings = aiSettings();
    return settings.model || (settings.apiUrl || settings.apiKey ? '自定义 API' : '酒馆当前 API');
  }
  function parseAi(raw) {
    if (raw && typeof raw === 'object') return raw;
    const text = String(raw || '').trim();
    if (!text) throw new Error('AI 没有返回内容。');
    const fenced = (text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text).trim();
    try {
      return JSON.parse(fenced);
    } catch {
      const start = fenced.indexOf('{');
      const end = fenced.lastIndexOf('}');
      if (start >= 0 && end > start) return JSON.parse(fenced.slice(start, end + 1));
      throw new Error('AI 返回的内容不是合法 JSON。');
    }
  }
  function customAiConfig() {
    const settings = aiSettings();
    return settings.apiUrl || settings.apiKey
      ? {
          apiurl: settings.apiUrl || '',
          key: settings.apiKey || '',
          model: settings.model || '',
          source: settings.apiType || 'openai',
          temperature: Number(settings.temperature ?? 0.8),
          max_tokens: Number(settings.maxTokens ?? 12000),
          top_p: Number(settings.topP ?? 0.9),
          frequency_penalty: Number(settings.frequencyPenalty ?? 0),
          presence_penalty: Number(settings.presencePenalty ?? 0),
        }
      : null;
  }

  async function requestAi(system, user, schema) {
    const generateRaw = api('generateRaw'),
      generate = api('generate');
    if (typeof generateRaw !== 'function' && typeof generate !== 'function')
      throw new Error('未找到酒馆 AI 生成接口。');
    const custom = customAiConfig();
    const config = {
      should_silence: true,
      ordered_prompts: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      json_schema: schema,
      ...(custom ? { custom_api: custom } : {}),
    };
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const retrySuffix = attempt
          ? '\n\n上次输出无法解析。请严格只输出符合 JSON Schema 的 JSON 对象，所有换行和双引号必须正确转义。'
          : '';
        config.ordered_prompts = [
          { role: 'system', content: system },
          { role: 'user', content: `${user}${retrySuffix}` },
        ];
        const raw =
          typeof generateRaw === 'function'
            ? await generateRaw(config)
            : await generate({
                should_silence: true,
                user_input: `${system}\n\n${user}${retrySuffix}`,
                json_schema: schema,
              });
        return normalizeGeneratedValue(parseAi(raw));
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('AI 生成失败。');
  }

  function parseAiText(raw) {
    if (raw && typeof raw === 'object') {
      const nested = raw.opening_body ?? raw.content ?? raw.text;
      if (typeof nested === 'string') return nested.trim();
      throw new Error('AI 返回了工具调用或无法识别的对象。');
    }
    let text = String(raw || '').trim();
    if (!text) throw new Error('AI 没有返回正文。');
    const fenced = text.match(/^```(?:text|markdown|md)?\s*([\s\S]*?)```$/i)?.[1];
    if (fenced) text = fenced.trim();
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        const parsed = JSON.parse(text);
        text = String(parsed.opening_body ?? parsed.content ?? parsed.text ?? '').trim() || text;
      } catch {
        /* 普通正文可能恰好以花括号起止，保留原文 */
      }
    }
    return text.replace(/^(?:开场白正文|正文|opening_body)\s*[：:]\s*/i, '').trim();
  }

  async function requestOpeningText(system, user, targetWords) {
    const generateRaw = api('generateRaw'),
      generate = api('generate');
    if (typeof generateRaw !== 'function' && typeof generate !== 'function')
      throw new Error('未找到酒馆 AI 生成接口。');
    const requiredTokens = Math.min(14_000, Math.max(2_048, Math.ceil(Number(targetWords) * 1.8 + 800)));
    const custom = customAiConfig();
    if (custom) custom.max_tokens = Math.max(Number(custom.max_tokens) || 0, requiredTokens);
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const retrySuffix = attempt
          ? `\n\n这是第 ${attempt + 1} 次尝试。上次没有得到完整正文；请直接从第一段叙事开始，只输出正文，不要解释、标题、JSON 或代码块。`
          : '';
        const prompt = `${user}${retrySuffix}`;
        const raw =
          typeof generateRaw === 'function'
            ? await generateRaw({
                should_silence: true,
                max_tokens: requiredTokens,
                ordered_prompts: [
                  { role: 'system', content: system },
                  { role: 'user', content: prompt },
                ],
                ...(custom ? { custom_api: custom } : {}),
              })
            : await generate({
                should_silence: true,
                user_input: `${system}\n\n${prompt}`,
                ...(custom ? { custom_api: custom } : {}),
              });
        const text = parseAiText(raw);
        const minimumLength = Math.min(300, Math.max(80, Math.round(Number(targetWords) * 0.18)));
        if (text.length < minimumLength) throw new Error(`AI 只返回了 ${text.length} 字符，未形成完整开场。`);
        return normalizeUserToken(text);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('AI 没有生成开场正文。');
  }

  function fixedRelationsFor(characters) {
    const names = new Set(characters.map(character => character.name));
    return (
      FIXED_RELATIONS.filter(([a, b]) => names.has(a) || names.has(b))
        .map(([a, b, relation]) => `${a}—${b}：${relation}`)
        .join('；') || '无额外固定关系'
    );
  }

  async function generateCharacterAdaptations(characters) {
    const targets = characters.filter(character => character.lock !== 'history');
    if (!targets.length) throw new Error('所选人物均为历史人物，身份无需适配。');
    const completedNames = [];
    for (const character of targets) {
      const personaContext = await characterPersonaContext([character]);
      const state = project.characters[character.name];
      const current = {
        adaptation_brief: state.adaptationBrief,
        identity: state.identity,
        activity_area: state.activityArea,
        faction: state.faction,
        relationship_origin: state.relationshipOrigin,
        relationship_pattern: state.relationshipPattern,
        character_to_user: state.characterToUser,
        user_to_character: state.userToCharacter,
        long_term_situation: state.longTermSituation,
        adaptation_principles: state.adaptationPrinciples,
      };
      const system =
        `你负责为《残明余烬》的原创人物“${character.name}”制作长期人物定位。` +
        '必须保留原始人设的性格核心、能力边界和人物关系。用户提供的“一句话适配设想”是创作方向，需结合<user>身份与原始人设展开成长期有效的身份、经历与相处方式。不得输出当前目标、当前情报、开场所在地、即时态度、是否在场或其他只在某一时刻成立的状态。只处理这一名人物，不要输出人物姓名，也不要使用 characters 数组或 character 外层。涉及玩家时一律写作<user>，不得写user或{{user}}。每个字符串都要有具体内容；确实没有固定势力时写“无固定势力”，不得用空字符串代替。adaptation_principles 至少给出两条可执行原则。输出符合 Schema 的单个 JSON 对象。';
      const user = `目标人物：${character.name}\n<user>长期身份：${project.protagonist.identity}；职业：${project.protagonist.occupation || '未定'}；主要活动地：${project.protagonist.location}；势力：${project.protagonist.faction || '无固定势力'}\n不可改写的人物关系：${fixedRelationsFor([character])}\nadaptation_brief 是用户的一句话设想，只用于指导补全，不需要原样复述。其他非空字段是硬约束，不得改写；请把所有空白字段补成具体、长期有效的内容：\n${JSON.stringify(current, null, 2)}\n\n<${character.name}原始人设>\n${personaContext}\n</${character.name}原始人设>`;
      const schema = {
        name: 'canming_single_character_adaptation_v3',
        value: {
          type: 'object',
          additionalProperties: false,
          required: [
            'identity',
            'activity_area',
            'faction',
            'relationship_origin',
            'relationship_pattern',
            'character_to_user',
            'user_to_character',
            'long_term_situation',
            'adaptation_principles',
          ],
          properties: {
            identity: { type: 'string', minLength: 1 },
            activity_area: { type: 'string', minLength: 1 },
            faction: { type: 'string', minLength: 1 },
            relationship_origin: { type: 'string', minLength: 1 },
            relationship_pattern: { type: 'string', minLength: 1 },
            character_to_user: { type: 'string', minLength: 1 },
            user_to_character: { type: 'string', minLength: 1 },
            long_term_situation: { type: 'string', minLength: 1 },
            adaptation_principles: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
          },
        },
      };
      const outputFields = [
        ['identity', 'identity', '长期身份定位'],
        ['activityArea', 'activity_area', '通常活动区域'],
        ['faction', 'faction', '长期所属势力'],
        ['relationshipOrigin', 'relationship_origin', '与主角的关系来源'],
        ['relationshipPattern', 'relationship_pattern', '长期相处模式'],
        ['characterToUser', 'character_to_user', '角色称呼 <user>'],
        ['userToCharacter', 'user_to_character', '<user> 称呼角色'],
        ['longTermSituation', 'long_term_situation', '长期生活处境'],
      ];
      const unwrapResult = result => {
        if (result?.character && typeof result.character === 'object') return result.character;
        if (Array.isArray(result?.characters) && result.characters[0]) return result.characters[0];
        return result || {};
      };
      const inspectResult = row => {
        const missing = outputFields
          .filter(
            ([stateKey, outputKey]) => !String(state[stateKey] || '').trim() && !String(row?.[outputKey] || '').trim(),
          )
          .map(([, , label]) => label);
        if (
          !state.adaptationPrinciples.length &&
          (row?.adaptation_principles || []).filter(item => String(item).trim()).length < 2
        )
          missing.push('人设适配原则');
        return missing;
      };
      let itemResult;
      let missing = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        const correction = attempt
          ? `\n\n上次输出仍缺少：${missing.join('、')}。请重新返回一个不带姓名、不带外层包装的完整 JSON 对象。`
          : '';
        itemResult = unwrapResult(await requestAi(system, `${user}${correction}`, schema));
        missing = inspectResult(itemResult);
        if (!missing.length) break;
      }
      if (missing.length) throw new Error(`${character.name}仍未补全：${missing.join('、')}`);
      const fill = (key, value) => {
        if (!String(state[key] || '').trim()) state[key] = String(value || '').trim();
      };
      for (const [stateKey, outputKey] of outputFields) fill(stateKey, itemResult[outputKey]);
      if (!state.adaptationPrinciples.length)
        state.adaptationPrinciples = (itemResult.adaptation_principles || [])
          .map(item => String(item).trim())
          .filter(Boolean);
      completedNames.push(character.name);
      markInitializationStale();
      saveProject();
    }
    return completedNames;
  }

  async function generateOpening() {
    project.opening.targetWords = Math.min(5000, Math.max(300, Number(project.opening.targetWords) || 1200));
    const selected = selectedCharacters();
    const scene = selected.filter(character => project.characters[character.name].scene);
    const known = selected.filter(character => project.characters[character.name].known);
    const personaContext = await characterPersonaContext(scene);
    if (personaContext.length > MAX_OPENING_SOURCE_CHARS)
      throw new Error(
        `现场人物完整人设共 ${personaContext.length} 字符，已超过稳定生成预算。请减少开场现场人物；未在场人物仍会保留在人物概览中。`,
      );
    const referenceBudget = Math.max(0, MAX_OPENING_SOURCE_CHARS - personaContext.length);
    const referenceContext = await selectedReferenceContext(referenceBudget);
    const sceneAdaptations = characterAdaptations().filter(item =>
      scene.some(character => character.name === item.character),
    );
    const system =
      '你是《残明余烬》的开局创作助手。时代严格固定在崇祯七年七月。现场角色的原始人设是硬约束，长期人物定位只能改变其身份与关系背景，不能改变人格核心。只有“开场现场人物”可以实际出场；其他人物不得为了展示名单被塞入第一幕。开场只是故事引子，不必让所有现场人物轮流说话。涉及玩家时一律写作<user>，不得写user或{{user}}。直接输出可供酒馆使用的中文正文，不要输出标题、说明、JSON、Markdown代码块、<initvar>或任何其他初始化标签。';
    const user = `DLC：${project.title}\n开场名称：${project.opening.name}\n<user>：${project.protagonist.origin}，${project.protagonist.identity}，职业${project.protagonist.occupation || '未定'}\n地点：${project.protagonist.location}\n故事气质：${project.protagonist.tone}\n一句话开局设想：${project.opening.hook || '请根据身份设计一个具体而紧迫的引子'}\n开场白目标字数：约${project.opening.targetWords}字，允许上下浮动15%\n纳入DLC的人物：${selected.map(character => character.name).join('、') || '无'}\n开场前已经相识：${known.map(character => `${character.name}（${project.characters[character.name].relation || '相识'}）`).join('、') || '无'}\n允许在开场现场出现：${scene.map(character => character.name).join('、') || '无现有角色，开场只写<user>及必要的一次性路人'}\n不可改写的人物关系：${fixedRelationsFor(selected)}\n现场人物长期定位：${JSON.stringify(sceneAdaptations, null, 2)}${personaContext ? `\n\n<现场人物原始人设>\n${personaContext}\n</现场人物原始人设>` : ''}${referenceContext ? `\n\n<参考世界书>\n${referenceContext}\n</参考世界书>` : ''}\n\n现在直接写开场正文。`;
    project.opening.body = await requestOpeningText(system, user, project.opening.targetWords);
    project.summary = String(
      project.opening.hook || project.summary || project.opening.body.replace(/\s+/g, ' ').slice(0, 120),
    ).trim();
    markInitializationStale();
    saveProject();
  }

  function recordItem(properties, required = Object.keys(properties)) {
    return { type: 'object', additionalProperties: false, required, properties };
  }
  function factsSchema() {
    const string = { type: 'string' },
      number = { type: 'number' };
    const array = items => ({ type: 'array', items });
    return {
      name: 'canming_initial_facts_v1',
      value: {
        type: 'object',
        additionalProperties: false,
        required: [
          'important_items',
          'forces',
          'commanders',
          'assets',
          'storage',
          'technologies',
          'relationships',
          'factions',
          'tasks',
          'events',
        ],
        properties: {
          important_items: array(recordItem({ name: string, description: string, quantity: number })),
          forces: array(
            recordItem({
              name: string,
              troop_type: string,
              people: number,
              morale: number,
              training: number,
              logistics: number,
              equipment: { type: 'string', enum: ['残破', '简陋', '普通', '精良', '精锐'] },
              level: { type: 'string', enum: ['乌合', '新募', '可用', '良好', '精锐', '名军'] },
              commander: string,
              station: string,
            }),
          ),
          commanders: array(
            recordItem({
              name: string,
              command: number,
              martial: number,
              wisdom: number,
              politics: number,
              prestige: number,
            }),
          ),
          assets: array(recordItem({ name: string, description: string, monthly_income: number })),
          storage: array(recordItem({ name: string, quantity: number, unit: string })),
          technologies: array(
            recordItem({
              name: string,
              progress: { type: 'string', enum: ['未开始', '试验中', '小规模试点', '已推广'] },
              effect: string,
              description: string,
            }),
          ),
          relationships: array(
            recordItem({
              name: string,
              category: { type: 'string', enum: CATEGORIES },
              identity: string,
              favor: number,
              loyalty: number,
              hatred: number,
              inner_voice: string,
              present: { type: 'boolean' },
              private_relation: { type: 'string', enum: PRIVATE_RELATIONS },
            }),
          ),
          factions: array(
            recordItem({
              name: string,
              favor: number,
              status: string,
              description: string,
              financial_state: { type: 'string', enum: ['未知', '崩溃', '拮据', '平稳', '富足', '雄厚'] },
              main_income: string,
              main_expense: string,
              grain_quantity: number,
              grain_unit: string,
              grain_state: { type: 'string', enum: ['未知', '断绝', '紧缺', '尚可', '充足'] },
              total_troops: number,
              main_troop_type: string,
              military_description: string,
            }),
          ),
          tasks: array(recordItem({ name: string, type: string, description: string, progress: string })),
          events: array(
            recordItem({
              name: string,
              date: string,
              location: string,
              type: { type: 'string', enum: ['军政', '经济', '人事', '外交', '战役', '建设', '技术', '家族'] },
              event: string,
              impact: string,
            }),
          ),
        },
      },
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }
  function materializeInitialFacts(facts) {
    const patch = {
      主角: { 私库: { 重要物品: {} } },
      人际网络: {},
      军事: { 各营: {}, 将领: {} },
      经济: { 资产: {}, 仓储: {} },
      科技: {},
      个人史记: { 大事记: {} },
      时局与任务: { 势力关系: {}, 当前任务: {} },
    };
    const unique = (items, kind) => {
      const names = new Set();
      for (const item of items || []) {
        item.name = String(item.name || '').trim();
        if (!item.name || names.has(item.name)) throw new Error(`${kind}存在空名称或重复名称。`);
        names.add(item.name);
      }
      return items || [];
    };
    for (const item of unique(facts.important_items, '重要物品'))
      patch.主角.私库.重要物品[item.name] = { 简介: item.description, 数量: Math.max(1, Math.round(item.quantity)) };
    for (const item of unique(facts.forces, '军队'))
      patch.军事.各营[item.name] = {
        兵种: item.troop_type,
        人数: Math.max(0, Math.round(item.people)),
        士气: clamp(item.morale, 0, 100),
        训练: clamp(item.training, 0, 100),
        后勤: clamp(item.logistics, 0, 100),
        装备: item.equipment,
        等级: item.level,
        将领: item.commander,
        驻地: item.station,
      };
    for (const item of unique(facts.commanders, '将领'))
      patch.军事.将领[item.name] = {
        统率: clamp(item.command, 0, 100),
        武力: clamp(item.martial, 0, 100),
        智谋: clamp(item.wisdom, 0, 100),
        政治: clamp(item.politics, 0, 100),
        威望: clamp(item.prestige, 0, 100),
      };
    for (const item of unique(facts.assets, '资产'))
      patch.经济.资产[item.name] = { 说明: item.description, 月入: Number(item.monthly_income) || 0 };
    for (const item of unique(facts.storage, '仓储'))
      patch.经济.仓储[item.name] = { 数量: Number(item.quantity) || 0, 单位: item.unit };
    for (const item of unique(facts.technologies, '科技'))
      patch.科技[item.name] = { 进度: item.progress, 效果: item.effect, 描述: item.description };
    for (const item of unique(facts.relationships, '人际关系')) {
      const configured = project.characters[item.name];
      if (configured?.included) item.category = configured.category;
      const favor = configured?.included ? Number(configured.affection) || 0 : item.favor;
      const loyalty = configured?.included ? Number(configured.loyalty) || 50 : item.loyalty;
      const base = {
        身份: normalizeUserToken(item.identity),
        角色心声: normalizeUserToken(item.inner_voice),
        是否在场: configured?.included ? Boolean(configured.scene) : Boolean(item.present),
      };
      patch.人际网络[item.category] ||= {};
      if (item.category === '仇敌') {
        patch.人际网络[item.category][item.name] = {
          ...base,
          仇恨度: clamp(configured?.included ? -configured.affection : item.hatred, 0, 100),
        };
      } else if (item.category === '下属与幕僚') {
        patch.人际网络[item.category][item.name] = {
          ...base,
          好感度: clamp(favor, -100, 100),
          忠心: clamp(loyalty, 0, 100),
        };
      } else if (item.category === '私帷') {
        patch.人际网络[item.category][item.name] = {
          ...base,
          关系: configured?.included ? configured.privateRelation : item.private_relation,
          好感度: clamp(favor, -100, 100),
          忠心: clamp(loyalty, 0, 100),
          生育: {},
        };
      } else {
        patch.人际网络[item.category][item.name] = { ...base, 好感度: clamp(favor, -100, 100) };
      }
    }
    for (const item of unique(facts.factions, '势力'))
      patch.时局与任务.势力关系[item.name] = {
        好感度: clamp(item.favor, -100, 100),
        状态: item.status,
        描述: item.description,
        经济: {
          财政状况: item.financial_state,
          主要收入: item.main_income,
          主要支出: item.main_expense,
          粮草: { 数量: Number(item.grain_quantity) || 0, 单位: item.grain_unit, 状态: item.grain_state },
          描述: item.description,
        },
        军事: {
          总兵力: Math.max(0, Math.round(item.total_troops)),
          主力兵种: item.main_troop_type,
          描述: item.military_description,
          下属将领: {},
          军队: {},
        },
      };
    for (const item of unique(facts.tasks, '任务'))
      patch.时局与任务.当前任务[item.name] = { 类型: item.type, 说明: item.description, 进度: item.progress };
    for (const item of unique(facts.events, '大事记'))
      patch.个人史记.大事记[item.name] = {
        日期: item.date,
        地点: item.location,
        类型: item.type,
        事迹: item.event,
        影响: item.impact,
      };
    return patch;
  }

  async function generateInitialVariables() {
    if (!project.opening.body.trim()) throw new Error('请先生成或填写开场白。');
    const system =
      '你负责从《残明余烬》的最终开场白中提取初始化事实。只能提取正文和玩家配置明确支持的事实，不得为了填满变量而编造军队、产业、科技、势力或物品。不得输出天下地图、日期、地点、主角五维或金银铜；这些由固定模板生成。涉及玩家时一律写作<user>。只输出合法JSON，不得输出<initvar>、其他初始化标签、Markdown或说明。最终的<initvar>标签由程序统一生成。';
    const characterSnapshot = selectedCharacters().map(character => ({
      name: character.name,
      known_before_opening: project.characters[character.name].known,
      present_in_opening: project.characters[character.name].scene,
      category: project.characters[character.name].category,
      identity: project.characters[character.name].identity || character.summary,
      relation: project.characters[character.name].relation,
      initial_favor: Number(project.characters[character.name].affection) || 0,
      initial_loyalty: Number(project.characters[character.name].loyalty) || 50,
    }));
    const user = `<user>：${project.protagonist.identity}；职业：${project.protagonist.occupation || '未定'}；势力：${project.protagonist.faction || '无'}\n开局地点：${project.protagonist.location}\n人物快照：${JSON.stringify(characterSnapshot, null, 2)}\n\n<最终开场白>\n${normalizeUserToken(stripInitializationBlocks(project.opening.body))}\n</最终开场白>\n\n空数组表示该类事实不存在。开场中实际相遇的现场人物应写入 relationships；未出场且开场前不相识的人物不得写入。人物快照中的初始好感度与忠心是硬约束，不得改写。`;
    const facts = await requestAi(system, user, factsSchema());
    project.initialization.patch = materializeInitialFacts(facts);
    project.initialization.summary = `人物 ${(facts.relationships || []).length} · 物品 ${(facts.important_items || []).length} · 军队 ${(facts.forces || []).length} · 资产 ${(facts.assets || []).length} · 任务 ${(facts.tasks || []).length}`;
    project.initialization.stale = false;
    project.initialization.generatedAt = new Date().toISOString();
    createInitvar();
    saveProject();
  }

  function download(content, filename, type = 'application/json') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = mountDocument.createElement('a');
    link.href = url;
    link.download = filename;
    mountDocument.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function ensureStyle() {
    if (mountDocument.getElementById(STYLE_ID)) return;
    const style = mountDocument.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `#${ROOT_ID}{--paper:#eee5d2;--paper2:#dfd1b7;--card:#f8f0df;--ink:#29231c;--muted:#756958;--line:#b9a98d;--red:#8e2926;position:absolute;inset:0;z-index:68;color:var(--ink);font:14px/1.65 "Noto Serif SC","Songti SC",serif;background:radial-gradient(circle at 82% 9%,rgba(142,41,38,.13),transparent 31%),linear-gradient(145deg,var(--paper),var(--paper2));overflow:hidden}#${ROOT_ID}.theme-night,#${ROOT_ID}.theme-star{--paper:#171b20;--paper2:#20262c;--card:#252b31;--ink:#eee4d1;--muted:#b7aa95;--line:#4b4a45;--red:#bd5950}#${ROOT_ID}*{box-sizing:border-box}#${ROOT_ID} button,#${ROOT_ID} input,#${ROOT_ID} textarea,#${ROOT_ID} select{font:inherit}#${ROOT_ID} .sg-shell{height:100%;display:grid;grid-template-rows:72px 1fr 68px}#${ROOT_ID} .sg-head{display:flex;align-items:center;justify-content:space-between;padding:0 24px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--paper) 86%,transparent);backdrop-filter:blur(16px)}#${ROOT_ID} .sg-brand{display:flex;align-items:center;gap:12px}#${ROOT_ID} .sg-seal{display:grid;width:40px;height:40px;place-items:center;border:2px solid var(--red);color:var(--red);font-size:20px;font-weight:900;transform:rotate(-5deg)}#${ROOT_ID} .sg-brand b{font-size:18px;letter-spacing:.1em}#${ROOT_ID} .sg-brand small{display:block;color:var(--muted);font-size:10px;letter-spacing:.14em}#${ROOT_ID} .sg-close,#${ROOT_ID} .sg-btn{border:1px solid var(--line);border-radius:10px;color:inherit;background:var(--card);cursor:pointer;transition:.18s}#${ROOT_ID} .sg-close{width:36px;height:36px;font-size:22px}#${ROOT_ID} .sg-btn{padding:9px 14px}#${ROOT_ID} .sg-btn:hover{transform:translateY(-1px);border-color:var(--red)}#${ROOT_ID} .sg-btn.primary{color:#fff;background:var(--red);border-color:var(--red)}#${ROOT_ID} .sg-main{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:0}#${ROOT_ID} .sg-steps{padding:26px 16px;border-right:1px solid var(--line)}#${ROOT_ID} .sg-step{display:grid;grid-template-columns:32px 1fr;gap:10px;align-items:center;width:100%;padding:11px;border:0;border-radius:12px;color:var(--muted);text-align:left;background:transparent;cursor:pointer}#${ROOT_ID} .sg-step i{display:grid;width:28px;height:28px;place-items:center;border:1px solid var(--line);border-radius:50%;font-style:normal}#${ROOT_ID} .sg-step.on{color:var(--ink);background:color-mix(in srgb,var(--red) 10%,var(--card))}#${ROOT_ID} .sg-step.on i{color:#fff;background:var(--red);border-color:var(--red)}#${ROOT_ID} .sg-content{overflow:auto;padding:30px clamp(18px,4vw,52px)}#${ROOT_ID} .sg-page{width:min(960px,100%);margin:auto}#${ROOT_ID} .sg-kicker{margin:0;color:var(--red);font-size:10px;letter-spacing:.28em}#${ROOT_ID} h1{margin:5px 0 8px;font-size:clamp(28px,4vw,44px);line-height:1.2}#${ROOT_ID} .sg-lead{max-width:720px;margin:0 0 24px;color:var(--muted)}#${ROOT_ID} .sg-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}#${ROOT_ID} .sg-field{display:grid;gap:6px}#${ROOT_ID} .sg-field.full{grid-column:1/-1}#${ROOT_ID} label>span{color:var(--muted);font-size:11px}#${ROOT_ID} input,#${ROOT_ID} textarea,#${ROOT_ID} select{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:var(--ink);background:var(--card);outline:none}#${ROOT_ID} textarea{min-height:102px;resize:vertical}#${ROOT_ID} input:focus,#${ROOT_ID} textarea:focus,#${ROOT_ID} select:focus{border-color:var(--red);box-shadow:0 0 0 3px color-mix(in srgb,var(--red) 12%,transparent)}#${ROOT_ID} .sg-era{margin:18px 0;padding:13px 15px;border-left:4px solid var(--red);border-radius:8px;background:color-mix(in srgb,var(--red) 8%,var(--card))}#${ROOT_ID} .sg-era.bad{border-color:#c46a45}#${ROOT_ID} .sg-roster{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}#${ROOT_ID} .sg-char{position:relative;padding:13px;border:1px solid var(--line);border-radius:14px;background:var(--card);cursor:pointer}#${ROOT_ID} .sg-char.on{border-color:var(--red);box-shadow:inset 0 0 0 1px var(--red)}#${ROOT_ID} .sg-char b{display:block}#${ROOT_ID} .sg-char small{display:block;margin-top:3px;color:var(--muted)}#${ROOT_ID} .sg-char em{position:absolute;right:9px;top:8px;color:var(--red);font-size:9px;font-style:normal}#${ROOT_ID} .sg-char-flags{display:flex;gap:5px;margin-top:9px}#${ROOT_ID} .sg-flag{padding:2px 6px;border-radius:999px;background:var(--paper2);color:var(--muted);font-size:9px}#${ROOT_ID} .sg-flag.on{color:#fff;background:var(--red)}#${ROOT_ID} .sg-detail{margin:16px 0;padding:18px;border:1px solid var(--line);border-radius:16px;background:color-mix(in srgb,var(--card) 88%,transparent)}#${ROOT_ID} .sg-detail h3{margin:0 0 12px}#${ROOT_ID} .sg-checks{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}#${ROOT_ID} .sg-check{display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:var(--paper2);cursor:pointer}#${ROOT_ID} .sg-check input{width:auto}#${ROOT_ID} .sg-scene{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 22px}#${ROOT_ID} .sg-scene button{padding:8px 11px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:var(--card);cursor:pointer}#${ROOT_ID} .sg-scene button.on{color:#fff;background:var(--red);border-color:var(--red)}#${ROOT_ID} .sg-preview{display:grid;gap:12px}#${ROOT_ID} .sg-card{padding:17px;border:1px solid var(--line);border-radius:15px;background:var(--card)}#${ROOT_ID} .sg-card h3{margin:0 0 7px}#${ROOT_ID} .sg-card p{margin:0;color:var(--muted)}#${ROOT_ID} .sg-errors{padding:12px 14px;border:1px solid #b95d4b;border-radius:10px;background:color-mix(in srgb,#b95d4b 10%,var(--card));color:#b95d4b}#${ROOT_ID} .sg-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 22px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--paper) 90%,transparent)}#${ROOT_ID} .sg-status{overflow:hidden;color:var(--muted);text-overflow:ellipsis;white-space:nowrap}#${ROOT_ID} .sg-status.error{color:#c05b49}#${ROOT_ID} .sg-status.warning{color:#c48a3f}#${ROOT_ID} .sg-status.success{color:#568e63}#${ROOT_ID} .sg-actions{display:flex;gap:8px}@media(max-width:800px){#${ROOT_ID} .sg-main{grid-template-columns:1fr}#${ROOT_ID} .sg-steps{display:flex;overflow:auto;padding:8px;border-right:0;border-bottom:1px solid var(--line)}#${ROOT_ID} .sg-step{min-width:116px;padding:7px}#${ROOT_ID} .sg-content{padding:22px 14px}#${ROOT_ID} .sg-roster{grid-template-columns:repeat(2,minmax(0,1fr))}#${ROOT_ID} .sg-grid{grid-template-columns:1fr}#${ROOT_ID} .sg-field.full{grid-column:auto}#${ROOT_ID} .sg-status{display:none}#${ROOT_ID} .sg-footer{justify-content:flex-end;padding:8px 12px}#${ROOT_ID} .sg-actions{flex-wrap:wrap;justify-content:flex-end}}`;
    style.textContent += `#${ROOT_ID}{--paper:#f4e7c7;--paper2:#ead6a6;--ink:#2c2118;--muted:#75624d;--line:rgba(96,65,36,.28);--accent:#a43d2d;--accent2:#6f8a67;--shadow:rgba(55,31,12,.35);--card:rgba(255,248,226,.72);--glow:rgba(188,83,42,.32);--red:var(--accent);--radius-shell:20px;--radius-card:14px;--radius-control:10px;background:radial-gradient(circle at 82% 9%,var(--glow),transparent 31%),linear-gradient(145deg,var(--paper),var(--paper2));border-radius:var(--radius-shell)}#${ROOT_ID}.theme-night{--paper:#211913;--paper2:#352619;--ink:#f2dfba;--muted:#b99f76;--line:rgba(237,196,128,.24);--accent:#d0784b;--accent2:#89a074;--shadow:rgba(0,0,0,.65);--card:rgba(65,44,30,.82);--glow:rgba(220,94,48,.28)}#${ROOT_ID}.theme-star{--paper:#0d1820;--paper2:#111d28;--ink:#e6dcc8;--muted:#7d8fa0;--line:rgba(180,155,110,.22);--accent:#d4a040;--accent2:#5d8d9a;--shadow:rgba(0,0,0,.7);--card:rgba(18,28,38,.8);--glow:rgba(210,160,60,.2)}#${ROOT_ID}.theme-ink{--paper:#eee9dc;--paper2:#d8d0bf;--ink:#171a17;--muted:#5f6158;--line:rgba(20,25,22,.24);--accent:#a12f25;--accent2:#2f6965;--shadow:rgba(25,30,24,.30);--card:rgba(248,245,235,.62);--glow:rgba(40,70,64,.18);background:radial-gradient(ellipse at 70% 12%,rgba(23,26,23,.18),transparent 28%),radial-gradient(ellipse at 18% 74%,rgba(47,105,101,.16),transparent 38%),linear-gradient(135deg,var(--paper),var(--paper2))}#${ROOT_ID} .sg-shell{position:relative;border-radius:var(--radius-shell);overflow:hidden}#${ROOT_ID} .sg-shell:before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,rgba(80,45,20,.025),rgba(80,45,20,.025) 1px,transparent 1px,transparent 9px);opacity:.55}#${ROOT_ID} .sg-head,#${ROOT_ID} .sg-main,#${ROOT_ID} .sg-footer{position:relative;z-index:1}#${ROOT_ID} .sg-head{background:color-mix(in srgb,var(--paper) 76%,transparent);box-shadow:0 1px 0 rgba(255,255,255,.08) inset}#${ROOT_ID} .sg-steps{background:color-mix(in srgb,var(--card) 36%,transparent)}#${ROOT_ID} .sg-step,#${ROOT_ID} .sg-btn,#${ROOT_ID} .sg-close,#${ROOT_ID} input,#${ROOT_ID} textarea,#${ROOT_ID} select{border-radius:var(--radius-control)}#${ROOT_ID} .sg-char,#${ROOT_ID} .sg-detail,#${ROOT_ID} .sg-card{border-radius:var(--radius-card);box-shadow:0 1px 0 rgba(255,255,255,.08) inset,0 10px 26px color-mix(in srgb,var(--shadow) 28%,transparent);backdrop-filter:blur(3px)}#${ROOT_ID}.theme-ink .sg-char,#${ROOT_ID}.theme-ink .sg-detail,#${ROOT_ID}.theme-ink .sg-card{border-radius:var(--radius-card);background:rgba(250,247,235,.58)}#${ROOT_ID} .sg-content{scrollbar-color:var(--line) transparent}#${ROOT_ID} .sg-kicker{color:var(--accent)}#${ROOT_ID} .sg-seal{border-color:var(--accent);border-radius:6px;color:var(--accent)}#${ROOT_ID} .sg-step.on{background:color-mix(in srgb,var(--accent) 11%,var(--card))}#${ROOT_ID} .sg-step.on i,#${ROOT_ID} .sg-btn.primary,#${ROOT_ID} .sg-flag.on,#${ROOT_ID} .sg-scene button.on{background:var(--accent);border-color:var(--accent)}#${ROOT_ID} .sg-char.on{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent),0 10px 26px color-mix(in srgb,var(--shadow) 28%,transparent)}#${ROOT_ID} .sg-btn:hover{border-color:var(--accent)}#${ROOT_ID} .sg-field input:focus,#${ROOT_ID} .sg-field textarea:focus,#${ROOT_ID} .sg-field select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 2px var(--glow)}#${ROOT_ID} .sg-page{animation:sg-page-in .22s ease-out}@keyframes sg-page-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}`;
    style.textContent += `#${ROOT_ID} .sg-page-wide{width:min(1180px,100%)}#${ROOT_ID} .sg-selected-bar{position:sticky;top:-30px;z-index:5;margin:0 0 16px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--radius-card);background:color-mix(in srgb,var(--paper) 86%,transparent);box-shadow:0 9px 28px color-mix(in srgb,var(--shadow) 22%,transparent);backdrop-filter:blur(16px)}#${ROOT_ID} .sg-selected-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}#${ROOT_ID} .sg-selected-head b{font-size:13px}#${ROOT_ID} .sg-selected-head span{color:var(--muted);font-size:11px}#${ROOT_ID} .sg-selected-chips{display:flex;gap:7px;overflow:auto;padding:1px 0 3px;scrollbar-width:thin}#${ROOT_ID} .sg-selected-chip{flex:0 0 auto;padding:5px 9px;border:1px solid var(--line);border-radius:999px;color:var(--ink);background:var(--card);cursor:pointer}#${ROOT_ID} .sg-selected-chip:hover{border-color:var(--accent);color:var(--accent)}#${ROOT_ID} .sg-selected-empty{color:var(--muted);font-size:12px}#${ROOT_ID} .sg-roster-workspace{display:grid;grid-template-columns:minmax(250px,310px) minmax(0,1fr);gap:16px;align-items:start}#${ROOT_ID} .sg-roster-panel,#${ROOT_ID} .sg-config-panel{border:1px solid var(--line);border-radius:var(--radius-card);background:color-mix(in srgb,var(--card) 88%,transparent);box-shadow:0 10px 30px color-mix(in srgb,var(--shadow) 22%,transparent);overflow:hidden}#${ROOT_ID} .sg-panel-head{padding:15px;border-bottom:1px solid var(--line)}#${ROOT_ID} .sg-panel-title{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px}#${ROOT_ID} .sg-panel-title h2{margin:0;font-size:17px}#${ROOT_ID} .sg-panel-title span{color:var(--muted);font-size:11px}#${ROOT_ID} .sg-search{position:relative}#${ROOT_ID} .sg-search input{padding-left:34px;background:color-mix(in srgb,var(--paper) 56%,var(--card))}#${ROOT_ID} .sg-search:before{content:'⌕';position:absolute;left:12px;top:6px;z-index:1;color:var(--muted);font-size:20px}#${ROOT_ID} .sg-filter-row{display:flex;gap:6px;margin-top:9px;overflow:auto}#${ROOT_ID} .sg-filter{flex:0 0 auto;padding:5px 9px;border:1px solid transparent;border-radius:999px;color:var(--muted);background:transparent;cursor:pointer}#${ROOT_ID} .sg-filter.on{border-color:var(--line);color:var(--ink);background:var(--paper2)}#${ROOT_ID} .sg-catalog{max-height:480px;overflow:auto;padding:7px;scrollbar-width:thin}#${ROOT_ID} .sg-catalog-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:9px;align-items:center;width:100%;padding:9px;border:0;border-radius:11px;color:var(--ink);text-align:left;background:transparent;cursor:pointer}#${ROOT_ID} .sg-catalog-row:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}#${ROOT_ID} .sg-catalog-row.on{background:color-mix(in srgb,var(--accent) 10%,var(--card))}#${ROOT_ID} .sg-pick-box{display:grid;width:20px;height:20px;place-items:center;border:1px solid var(--line);border-radius:6px;color:transparent;background:var(--card);font:700 12px/1 sans-serif}#${ROOT_ID} .sg-catalog-row.on .sg-pick-box{border-color:var(--accent);color:#fff;background:var(--accent)}#${ROOT_ID} .sg-catalog-copy{min-width:0}#${ROOT_ID} .sg-catalog-copy b,#${ROOT_ID} .sg-catalog-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#${ROOT_ID} .sg-catalog-copy small{color:var(--muted);font-size:10px}#${ROOT_ID} .sg-kind{padding:2px 6px;border-radius:999px;color:var(--muted);background:var(--paper2);font-size:9px}#${ROOT_ID} .sg-catalog-empty{padding:24px 12px;color:var(--muted);text-align:center}#${ROOT_ID} .sg-config-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 15px;border-bottom:1px solid var(--line)}#${ROOT_ID} .sg-config-toolbar p{margin:0;color:var(--muted);font-size:11px}#${ROOT_ID} .sg-bulk{position:relative}#${ROOT_ID} .sg-bulk summary{padding:6px 10px;border:1px solid var(--line);border-radius:999px;list-style:none;cursor:pointer}#${ROOT_ID} .sg-bulk summary::-webkit-details-marker{display:none}#${ROOT_ID} .sg-bulk-menu{position:absolute;right:0;top:calc(100% + 7px);z-index:8;display:grid;min-width:190px;padding:6px;border:1px solid var(--line);border-radius:12px;background:var(--paper);box-shadow:0 14px 32px var(--shadow)}#${ROOT_ID} .sg-bulk-menu button{padding:8px 10px;border:0;border-radius:8px;color:var(--ink);text-align:left;background:transparent;cursor:pointer}#${ROOT_ID} .sg-bulk-menu button:hover{background:color-mix(in srgb,var(--accent) 9%,transparent)}#${ROOT_ID} .sg-config-list{display:grid;gap:10px;padding:12px}#${ROOT_ID} .sg-config-card{border:1px solid var(--line);border-radius:var(--radius-card);background:color-mix(in srgb,var(--paper) 32%,var(--card));overflow:hidden;transition:border-color .18s,box-shadow .18s}#${ROOT_ID} .sg-config-card.expanded{border-color:color-mix(in srgb,var(--accent) 70%,var(--line));box-shadow:0 10px 24px color-mix(in srgb,var(--shadow) 20%,transparent)}#${ROOT_ID} .sg-config-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;padding:13px}#${ROOT_ID} .sg-config-main{display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;align-items:start;padding:0;border:0;color:inherit;text-align:left;background:transparent;cursor:pointer}#${ROOT_ID} .sg-config-chevron{display:grid;width:26px;height:26px;place-items:center;border-radius:8px;color:var(--muted);background:var(--paper2);transition:transform .18s}#${ROOT_ID} .sg-config-card.expanded .sg-config-chevron{transform:rotate(90deg)}#${ROOT_ID} .sg-config-name{display:flex;align-items:center;gap:7px}#${ROOT_ID} .sg-config-name b{font-size:15px}#${ROOT_ID} .sg-config-summary{display:block;margin-top:3px;color:var(--muted);font-size:11px;white-space:normal}#${ROOT_ID} .sg-config-actions{display:flex;align-items:center;gap:6px}#${ROOT_ID} .sg-mini-btn{padding:5px 8px;border:1px solid var(--line);border-radius:8px;color:var(--muted);background:transparent;cursor:pointer}#${ROOT_ID} .sg-mini-btn:hover{border-color:var(--accent);color:var(--accent)}#${ROOT_ID} .sg-quick-area{padding:0 13px 13px 50px}#${ROOT_ID} .sg-quick-label{display:flex;align-items:baseline;gap:8px;margin-bottom:7px}#${ROOT_ID} .sg-quick-label b{font-size:11px}#${ROOT_ID} .sg-quick-label span{color:var(--muted);font-size:10px}#${ROOT_ID} .sg-quick-switches{display:grid;grid-template-columns:repeat(2,minmax(0,1fr)) minmax(112px,.55fr);gap:8px;padding:0}#${ROOT_ID} .sg-choice{position:relative;display:grid;grid-template-columns:22px minmax(0,1fr);gap:9px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:11px;color:var(--ink);background:color-mix(in srgb,var(--paper) 54%,var(--card));cursor:pointer;transition:border-color .16s,background .16s,transform .16s}#${ROOT_ID} .sg-choice:hover{border-color:var(--accent);transform:translateY(-1px)}#${ROOT_ID} .sg-choice input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}#${ROOT_ID} .sg-choice-box{display:grid;width:21px;height:21px;place-items:center;border:1px solid var(--line);border-radius:6px;color:transparent;background:var(--card);font:700 12px/1 sans-serif}#${ROOT_ID} .sg-choice-copy b,#${ROOT_ID} .sg-choice-copy small{display:block}#${ROOT_ID} .sg-choice-copy b{font-size:12px}#${ROOT_ID} .sg-choice-copy small{margin-top:1px;color:var(--muted);font-size:9px}#${ROOT_ID} .sg-affection-quick{display:grid;grid-template-columns:1fr auto;gap:3px 8px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:11px;background:color-mix(in srgb,var(--paper) 54%,var(--card))}#${ROOT_ID} .sg-affection-quick span{font-size:12px;font-weight:700}#${ROOT_ID} .sg-affection-quick input{grid-row:1/3;grid-column:2;width:64px;padding:6px;text-align:center}#${ROOT_ID} .sg-affection-quick small{color:var(--muted);font-size:9px}#${ROOT_ID} .sg-choice:has(input:checked){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 11%,var(--card));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 24%,transparent)}#${ROOT_ID} .sg-choice:has(input:checked) .sg-choice-box{border-color:var(--accent);color:#fff;background:var(--accent)}#${ROOT_ID} .sg-config-body{padding:15px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--card) 58%,transparent)}#${ROOT_ID} .sg-config-note{margin:12px 0 0;color:var(--muted);font-size:11px}#${ROOT_ID} .sg-config-empty{padding:48px 24px;color:var(--muted);text-align:center}#${ROOT_ID} .sg-fixed-relations{margin-top:16px;border-radius:var(--radius-card)}@media(max-width:900px){#${ROOT_ID} .sg-roster-workspace{grid-template-columns:1fr}#${ROOT_ID} .sg-config-panel{grid-row:1}#${ROOT_ID} .sg-catalog{max-height:340px}#${ROOT_ID} .sg-selected-bar{top:-22px}}@media(max-width:560px){#${ROOT_ID} .sg-config-head{grid-template-columns:1fr}#${ROOT_ID} .sg-config-actions{padding-left:37px}#${ROOT_ID} .sg-quick-area{padding-left:13px}#${ROOT_ID} .sg-quick-switches{grid-template-columns:1fr}#${ROOT_ID} .sg-selected-head{align-items:flex-start;flex-direction:column}}`;
    style.textContent += `#${ROOT_ID} .sg-opening-tools{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:12px;margin:0 0 16px}#${ROOT_ID} .sg-opening-tool{padding:15px;border:1px solid var(--line);border-radius:var(--radius-card);background:color-mix(in srgb,var(--card) 86%,transparent);box-shadow:0 8px 24px color-mix(in srgb,var(--shadow) 18%,transparent)}#${ROOT_ID} .sg-tool-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}#${ROOT_ID} .sg-tool-head b{display:block;font-size:14px}#${ROOT_ID} .sg-tool-head small{display:block;margin-top:2px;color:var(--muted);font-size:10px}#${ROOT_ID} .sg-length-row{display:grid;grid-template-columns:minmax(110px,.7fr) minmax(0,1.3fr);gap:9px;align-items:center}#${ROOT_ID} .sg-length-presets{display:flex;gap:5px;flex-wrap:wrap}#${ROOT_ID} .sg-length-preset{padding:6px 8px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:var(--paper2);cursor:pointer}#${ROOT_ID} .sg-length-preset.on{border-color:var(--accent);color:#fff;background:var(--accent)}#${ROOT_ID} .sg-reference-summary{display:flex;gap:6px;flex-wrap:wrap;min-height:28px;align-items:center}#${ROOT_ID} .sg-reference-chip{display:flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid var(--line);border-radius:999px;color:var(--ink);background:var(--paper2);font-size:10px}#${ROOT_ID} .sg-reference-chip button{padding:0;border:0;color:var(--accent);background:transparent;cursor:pointer;font-size:14px}#${ROOT_ID} .sg-reference-empty{color:var(--muted);font-size:11px}#${ROOT_ID} .sg-reference-overlay{position:absolute;inset:0;z-index:40;display:grid;place-items:center;padding:18px;background:rgba(12,12,10,.54);backdrop-filter:blur(7px)}#${ROOT_ID} .sg-reference-modal{display:grid;grid-template-rows:auto minmax(0,1fr);width:min(680px,96%);max-height:88%;border:1px solid var(--line);border-radius:18px;color:var(--ink);background:var(--paper);box-shadow:0 24px 70px rgba(0,0,0,.42);overflow:hidden}#${ROOT_ID} .sg-reference-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}#${ROOT_ID} .sg-reference-head h2{margin:0;font-size:20px}#${ROOT_ID} .sg-reference-body{overflow:auto;padding:16px 18px}#${ROOT_ID} .sg-reference-toolbar{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:12px}#${ROOT_ID} .sg-reference-list{display:grid;gap:6px;max-height:380px;overflow:auto;padding-right:4px;scrollbar-width:thin}#${ROOT_ID} .sg-reference-entry{display:grid;grid-template-columns:22px minmax(0,1fr);gap:9px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);cursor:pointer}#${ROOT_ID} .sg-reference-entry:hover{border-color:var(--accent)}#${ROOT_ID} .sg-reference-entry input{width:18px;height:18px;accent-color:var(--accent)}#${ROOT_ID} .sg-reference-entry b,#${ROOT_ID} .sg-reference-entry small{display:block}#${ROOT_ID} .sg-reference-entry small{overflow:hidden;color:var(--muted);font-size:9px;text-overflow:ellipsis;white-space:nowrap}#${ROOT_ID} .sg-reference-footer{display:flex;justify-content:space-between;gap:10px;margin-top:12px;color:var(--muted);font-size:10px}#${ROOT_ID} .sg-initvar-note{border-radius:var(--radius-card)}@media(max-width:720px){#${ROOT_ID} .sg-opening-tools{grid-template-columns:1fr}#${ROOT_ID} .sg-reference-toolbar,#${ROOT_ID} .sg-length-row{grid-template-columns:1fr}}`;
    style.textContent += `#${ROOT_ID} .sg-toolbar-actions{display:flex;align-items:center;gap:7px}#${ROOT_ID} .sg-mini-btn.accent{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}#${ROOT_ID} .sg-mini-btn:disabled,#${ROOT_ID} .sg-btn:disabled{cursor:wait;opacity:.58;transform:none}#${ROOT_ID} .sg-long-term{display:grid;gap:12px;margin-top:14px;padding-top:14px;border-top:1px dashed var(--line)}#${ROOT_ID} .sg-long-term-head b,#${ROOT_ID} .sg-long-term-head small{display:block}#${ROOT_ID} .sg-long-term-head small{margin-top:2px;color:var(--muted);font-size:10px}#${ROOT_ID} .sg-adaptation-seed{padding:12px;border:1px solid color-mix(in srgb,var(--accent) 42%,var(--line));border-radius:var(--radius-card);background:color-mix(in srgb,var(--accent) 7%,var(--card))}#${ROOT_ID} .sg-adaptation-seed .sg-field>span{color:var(--accent);font-weight:700}#${ROOT_ID} .sg-persona-strip{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0;padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));border-radius:var(--radius-card);background:color-mix(in srgb,var(--accent) 7%,var(--card))}#${ROOT_ID} .sg-persona-strip small{color:var(--muted)}#${ROOT_ID} .sg-generation-flow{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:stretch;margin:16px 0}#${ROOT_ID} .sg-flow-card{padding:13px;border:1px solid var(--line);border-radius:var(--radius-card);background:var(--card)}#${ROOT_ID} .sg-flow-card b,#${ROOT_ID} .sg-flow-card small{display:block}#${ROOT_ID} .sg-flow-card small{margin-top:3px;color:var(--muted)}#${ROOT_ID} .sg-flow-arrow{display:grid;place-items:center;color:var(--accent);font-size:20px}@media(max-width:650px){#${ROOT_ID} .sg-generation-flow{grid-template-columns:1fr}#${ROOT_ID} .sg-flow-arrow{transform:rotate(90deg)}#${ROOT_ID} .sg-config-toolbar{align-items:flex-start;flex-direction:column}#${ROOT_ID} .sg-toolbar-actions{width:100%;flex-wrap:wrap}}`;
    style.textContent += `#${ROOT_ID} [hidden]{display:none!important}#${ROOT_ID} .sg-head-actions{display:flex;align-items:center;gap:8px}#${ROOT_ID} .sg-api-trigger{display:flex;align-items:center;gap:8px;max-width:230px;padding:7px 10px;border:1px solid var(--line);border-radius:var(--radius-control);color:var(--ink);background:var(--card);cursor:pointer}#${ROOT_ID} .sg-api-trigger:hover{border-color:var(--accent)}#${ROOT_ID} .sg-api-trigger span{color:var(--accent);font-weight:800}#${ROOT_ID} .sg-api-trigger small{overflow:hidden;color:var(--muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}#${ROOT_ID} .sg-api-modal{grid-template-rows:auto minmax(0,1fr);width:min(720px,96%)}#${ROOT_ID} .sg-api-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}#${ROOT_ID} .sg-api-model-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}#${ROOT_ID} [data-api-models]{margin-top:7px}#${ROOT_ID} .sg-api-note{margin-top:14px;padding:10px 12px;border-left:3px solid var(--accent);border-radius:8px;color:var(--muted);background:color-mix(in srgb,var(--accent) 7%,var(--card));font-size:11px}#${ROOT_ID} .sg-api-actions{justify-content:flex-end;margin-top:14px}@media(max-width:640px){#${ROOT_ID} .sg-api-trigger small{display:none}#${ROOT_ID} .sg-api-grid{grid-template-columns:1fr}#${ROOT_ID} .sg-api-grid .sg-field.full{grid-column:auto}}`;
    mountDocument.head.appendChild(style);
  }

  function bindInput(path, value) {
    const parts = path.split('.');
    let cursor = project;
    for (let index = 0; index < parts.length - 1; index++) cursor = cursor[parts[index]];
    const key = parts.at(-1);
    cursor[key] = [
      'hour',
      'minute',
      'life',
      'martial',
      'command',
      'wisdom',
      'politics',
      'reputation',
      'gold',
      'silver',
      'copper',
      'affection',
      'loyalty',
      'targetWords',
    ].includes(key)
      ? Number(value)
      : value;
    saveProject();
  }

  function field(label, path, value, placeholder = '', type = 'text') {
    return `<label class="sg-field"><span>${esc(label)}</span><input type="${type}" data-bind="${esc(path)}" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`;
  }
  function textarea(label, path, value, placeholder = '') {
    return `<label class="sg-field full"><span>${esc(label)}</span><textarea data-bind="${esc(path)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  }
  function listTextarea(label, path, values, placeholder = '') {
    return `<label class="sg-field full"><span>${esc(label)}</span><textarea data-list-bind="${esc(path)}" placeholder="${esc(placeholder)}">${esc((values || []).join('\n'))}</textarea></label>`;
  }
  function stepOne() {
    const p = project.protagonist;
    return `<section class="sg-page"><p class="sg-kicker">STEP ONE · YOUR PLACE IN HISTORY</p><h1>先回答：你是谁？</h1><p class="sg-lead">这里只确定长期身份与起点。具体冲突、目标和故事引子统一放在第三步，避免重复填写。</p><div class="sg-era ${eraError ? 'bad' : ''}"><b>时代锚点：崇祯七年七月</b><br><span>${eraError ? esc(eraError) : `已载入官方天下地图快照 · ${Object.keys(eraPreset?.变量?.天下地图?.地区态势 || {}).length} 个地区`}</span></div><div class="sg-grid">${field('DLC 名称', 'title', project.title, '例如：大同孤堡')}${field('来历', 'protagonist.origin', p.origin, '原生人物 / 魂穿者')}${field('身份', 'protagonist.identity', p.identity, '例如：大同镇军户')}${field('职业或官职', 'protagonist.occupation', p.occupation, '例如：边堡小旗')}${field('开局地点', 'protagonist.location', p.location, '例如：山西大同府某边堡')}${field('所属势力', 'protagonist.faction', p.faction, '没有可留空')}${field('故事气质', 'protagonist.tone', p.tone)}</div><details class="sg-detail"><summary>日期和基础数值（可选）</summary><div class="sg-grid" style="margin-top:12px">${field('七月日期', 'date.day', project.date.day, '初五日')}${field('天气', 'date.weather', project.date.weather)}${field('小时', 'date.hour', project.date.hour, '', 'number')}${field('分钟', 'date.minute', project.date.minute, '', 'number')}${field('生命', 'stats.life', project.stats.life, '', 'number')}${field('武力', 'stats.martial', project.stats.martial, '', 'number')}${field('统率', 'stats.command', project.stats.command, '', 'number')}${field('智谋', 'stats.wisdom', project.stats.wisdom, '', 'number')}${field('政治', 'stats.politics', project.stats.politics, '', 'number')}${field('初始白银', 'stats.silver', project.stats.silver, '', 'number')}</div></details></section>`;
  }

  function characterKind(character) {
    return character.lock === 'history' ? 'history' : character.lock === 'family' ? 'family' : 'free';
  }
  function characterKindLabel(character) {
    return character.lock === 'history' ? '历史' : character.lock === 'family' ? '家族' : '原创';
  }
  function characterCatalogRow(character) {
    const state = project.characters[character.name];
    return `<button type="button" class="sg-catalog-row ${state.included ? 'on' : ''}" data-action="toggle-character" data-character-catalog data-character-name="${esc(character.name)}" data-character-kind="${characterKind(character)}" data-character-search="${esc(`${character.name} ${character.summary}`.toLowerCase())}" aria-pressed="${state.included}"><span class="sg-pick-box">✓</span><span class="sg-catalog-copy"><b>${esc(character.name)}</b><small>${esc(character.summary)}</small></span><span class="sg-kind">${characterKindLabel(character)}</span></button>`;
  }
  function selectedChip(character) {
    return `<button type="button" class="sg-selected-chip" data-action="jump-character" data-character-name="${esc(character.name)}">${esc(character.name)}</button>`;
  }
  function characterEditor(character) {
    const state = project.characters[character.name];
    const locked = character.lock === 'history';
    const expanded = expandedCharacters.has(character.name);
    const identity = state.identity || character.summary;
    const location = locked
      ? '历史身份与活动轨迹锁定'
      : state.activityArea || project.protagonist.location || '尚未设置活动范围';
    const relationFields = `<div class="sg-grid">${field('与 <user> 的关系', `characters.${character.name}.relation`, state.relation, '例如：故友 / 上司 / 尚未相识')}<label class="sg-field"><span>人际分类（仅已相识时使用）</span><select data-bind="characters.${esc(character.name)}.category">${CATEGORIES.map(category => `<option ${category === state.category ? 'selected' : ''}>${category}</option>`).join('')}</select></label><label class="sg-field"><span>私帷关系（仅分类为私帷时使用）</span><select data-bind="characters.${esc(character.name)}.privateRelation">${PRIVATE_RELATIONS.map(relation => `<option ${relation === state.privateRelation ? 'selected' : ''}>${relation}</option>`).join('')}</select></label></div>`;
    const editableFields = locked
      ? `<div class="sg-era"><b>历史人物身份锁定</b><br>可以调整其与 &lt;user&gt; 的关系，但不会改写历史身份、活动轨迹或原始人设。</div>`
      : `<div class="sg-long-term"><div class="sg-long-term-head"><span><b>长期人物定位</b><small>整段剧情持续有效，不填写当前目标、即时态度或开场位置。</small></span></div><div class="sg-adaptation-seed">${field('一句话人物设想（交给 AI 展开）', `characters.${character.name}.adaptationBrief`, state.adaptationBrief, '例如：让她成为随<user>往来边镇、负责经营商路的旧识')}</div><div class="sg-grid">${field('身份', `characters.${character.name}.identity`, state.identity, character.summary)}${field('通常活动区域', `characters.${character.name}.activityArea`, state.activityArea, '例如：往来南京城与长江商路')}${field('所属势力', `characters.${character.name}.faction`, state.faction, '例如：苏晚棠一家；没有则由 AI 填“无固定势力”')}${field('角色称呼 <user>', `characters.${character.name}.characterToUser`, state.characterToUser, '按身份和关系阶段称呼')}${field('<user> 称呼角色', `characters.${character.name}.userToCharacter`, state.userToCharacter, character.name)}${textarea('与 <user> 的过往', `characters.${character.name}.relationshipOrigin`, state.relationshipOrigin, '双方因何认识或为何尚未相识')}${textarea('相处方式', `characters.${character.name}.relationshipPattern`, state.relationshipPattern, '信任、戒备和利益关系如何长期发展')}${textarea('长期生活处境', `characters.${character.name}.longTermSituation`, state.longTermSituation, '描述长期生活背景，不写某一刻正在做什么')}${listTextarea('演绎要点（每行一条）', `characters.${character.name}.adaptationPrinciples`, state.adaptationPrinciples, '保留原人设中不可丢失的经历、行为和关系')}</div></div>`;
    return `<article class="sg-config-card ${expanded ? 'expanded' : ''}" data-character-config="${esc(character.name)}"><div class="sg-config-head"><button type="button" class="sg-config-main" data-action="toggle-character-editor" data-character-name="${esc(character.name)}" aria-expanded="${expanded}"><span class="sg-config-chevron">›</span><span><span class="sg-config-name"><b>${esc(character.name)}</b><span class="sg-kind">${characterKindLabel(character)}</span></span><span class="sg-config-summary">${esc(identity)} · ${esc(location)} · ${esc(state.relation || '尚未相识')}</span></span></button><div class="sg-config-actions">${locked ? '' : `<button type="button" class="sg-mini-btn accent" data-action="ai-character" data-character-name="${esc(character.name)}">AI 补全</button>`}<button type="button" class="sg-mini-btn" data-action="remove-character" data-character-name="${esc(character.name)}">移出</button></div></div><div class="sg-quick-area"><div class="sg-quick-label"><b>开局快照</b><span>只写入初始变量，不会固化进长期人设</span></div><div class="sg-quick-switches"><label class="sg-choice"><input type="checkbox" data-character-toggle="known" data-character-name="${esc(character.name)}" ${state.known ? 'checked' : ''}><i class="sg-choice-box">✓</i><span class="sg-choice-copy"><b>开场前已经相识</b><small>写入初始人际关系</small></span></label><label class="sg-choice"><input type="checkbox" data-character-toggle="scene" data-character-name="${esc(character.name)}" ${state.scene ? 'checked' : ''}><i class="sg-choice-box">✓</i><span class="sg-choice-copy"><b>出现在第一幕</b><small>自动读取完整人设参与开场</small></span></label><label class="sg-affection-quick"><span>初始好感度</span><input type="number" min="-100" max="100" step="1" data-bind="characters.${esc(character.name)}.affection" value="${esc(state.affection)}"><small>-100 ～ 100</small></label></div></div><div class="sg-config-body" ${expanded ? '' : 'hidden'}>${relationFields}${editableFields}<p class="sg-config-note">纳入 DLC 只表示 AI 知道此人存在；只有“出现在第一幕”的人物会被自动读取完整人设并允许实际登场。</p></div></article>`;
  }

  function updateStepTwoCount() {
    const count = selectedCharacters().length;
    const label = root?.querySelector('[data-selected-count]');
    if (label) label.textContent = `已选人物 · ${count} 人`;
  }
  function refreshCharacterCard(name) {
    const character = CHARACTERS.find(item => item.name === name);
    const card = root?.querySelector(`[data-character-config="${CSS.escape(name)}"]`);
    if (!character || !card) return;
    card.outerHTML = characterEditor(character);
  }
  function updateCatalogSelection(name, included) {
    const row = [...(root?.querySelectorAll('[data-character-catalog]') || [])].find(
      item => item.dataset.characterName === name,
    );
    row?.classList.toggle('on', included);
    row?.setAttribute('aria-pressed', String(included));
  }
  function addSelectedCharacter(character) {
    const chips = root?.querySelector('[data-selected-chips]');
    if (chips) {
      chips.querySelector('.sg-selected-empty')?.remove();
      chips.insertAdjacentHTML('beforeend', selectedChip(character));
    }
    const container = root?.querySelector('[data-config-container]');
    if (!container) return;
    container.querySelector('.sg-config-empty')?.remove();
    let list = container.querySelector('.sg-config-list');
    if (!list) {
      container.innerHTML = '<div class="sg-config-list"></div>';
      list = container.querySelector('.sg-config-list');
    }
    list.insertAdjacentHTML('beforeend', characterEditor(character));
    updateStepTwoCount();
  }
  function removeSelectedCharacter(name) {
    root?.querySelector(`[data-character-config="${CSS.escape(name)}"]`)?.remove();
    const chip = [...(root?.querySelectorAll('[data-selected-chips] [data-character-name]') || [])].find(
      item => item.dataset.characterName === name,
    );
    chip?.remove();
    const selected = selectedCharacters(),
      chips = root?.querySelector('[data-selected-chips]'),
      container = root?.querySelector('[data-config-container]');
    if (!selected.length) {
      if (chips) chips.innerHTML = '<span class="sg-selected-empty">还没有选择人物；开局也可以只包含 &lt;user&gt;。</span>';
      if (container)
        container.innerHTML =
          '<div class="sg-config-empty"><b>尚未纳入人物</b><br>从左侧名册选择后，配置会出现在这里。</div>';
    }
    updateStepTwoCount();
  }
  function setCharacterIncluded(name, included) {
    const character = CHARACTERS.find(item => item.name === name),
      state = project.characters[name];
    if (!character || !state || state.included === included) return;
    state.included = included;
    if (included) {
      expandedCharacters.add(name);
      addSelectedCharacter(character);
    } else {
      state.known = false;
      state.scene = false;
      expandedCharacters.delete(name);
      removeSelectedCharacter(name);
    }
    updateCatalogSelection(name, included);
    markInitializationStale();
    saveProject();
  }
  function applyRosterFilters() {
    if (!root || project.step !== 2) return;
    let visible = 0;
    for (const item of root.querySelectorAll('[data-character-catalog]')) {
      const matchesKind = rosterFilter === 'all' || item.dataset.characterKind === rosterFilter;
      const matchesQuery = !rosterQuery || item.dataset.characterSearch.includes(rosterQuery);
      item.hidden = !(matchesKind && matchesQuery);
      if (!item.hidden) visible += 1;
    }
    const empty = root.querySelector('[data-catalog-empty]');
    if (empty) empty.hidden = visible > 0;
    for (const button of root.querySelectorAll('[data-roster-filter]'))
      button.classList.toggle('on', button.dataset.rosterFilter === rosterFilter);
  }
  function stepTwo() {
    const selected = selectedCharacters();
    return `<section class="sg-page sg-page-wide"><p class="sg-kicker">STEP TWO · WHO EXISTS AROUND YOU</p><h1>安排这条世界线的人物</h1><p class="sg-lead">选择人物后，只需决定开场前是否相识、是否出现在第一幕。长期定位可以手填，也可以让 AI 依据原始人设补全。</p><div class="sg-selected-bar"><div class="sg-selected-head"><b data-selected-count>已选人物 · ${selected.length} 人</b><span>点击姓名可直接定位配置</span></div><div class="sg-selected-chips" data-selected-chips>${selected.length ? selected.map(selectedChip).join('') : '<span class="sg-selected-empty">还没有选择人物；开局也可以只包含 &lt;user&gt;。</span>'}</div></div><div class="sg-roster-workspace"><aside class="sg-roster-panel"><div class="sg-panel-head"><div class="sg-panel-title"><h2>人物名册</h2><span>${CHARACTERS.length} 人</span></div><label class="sg-search"><input type="search" data-roster-search value="${esc(rosterQuery)}" placeholder="搜索姓名或简介"></label><div class="sg-filter-row">${[
      ['all', '全部'],
      ['free', '原创'],
      ['family', '家族'],
      ['history', '历史'],
    ]
      .map(
        ([value, label]) =>
          `<button type="button" class="sg-filter ${rosterFilter === value ? 'on' : ''}" data-action="roster-filter" data-roster-filter="${value}">${label}</button>`,
      )
      .join(
        '',
      )}</div></div><div class="sg-catalog">${CHARACTERS.map(characterCatalogRow).join('')}<div class="sg-catalog-empty" data-catalog-empty hidden>没有符合条件的人物</div></div></aside><section class="sg-config-panel"><div class="sg-config-toolbar"><p>“开局快照”和“长期定位”已分开，剧情不会被永远锁在开场。</p><div class="sg-toolbar-actions"><button type="button" class="sg-mini-btn accent" data-action="ai-characters">AI 补全已选人物</button><details class="sg-bulk"><summary>批量设置</summary><div class="sg-bulk-menu"><button type="button" data-action="bulk-location">活动区域参考主角地点</button><button type="button" data-action="bulk-known">全部设为已相识</button><button type="button" data-action="bulk-clear-scene">清空开场现场</button></div></details></div></div><div data-config-container>${selected.length ? `<div class="sg-config-list">${selected.map(characterEditor).join('')}</div>` : '<div class="sg-config-empty"><b>尚未纳入人物</b><br>从左侧名册选择后，配置会出现在这里。</div>'}</div></section></div><div class="sg-era sg-fixed-relations"><b>人物之间已有的亲属关系</b><br>${FIXED_RELATIONS.map(([a, b, relation]) => `${a}—${b}（${relation}）`).join(' · ')}</div></section>`;
  }

  function referenceIsSelected(worldbook, name) {
    return (project.opening.referenceEntries || []).some(item => item.worldbook === worldbook && item.name === name);
  }
  function referenceSummaryHtml() {
    const selected = project.opening.referenceEntries || [];
    return selected.length
      ? selected
          .map(
            item =>
              `<span class="sg-reference-chip"><span title="${esc(item.worldbook)}">${esc(item.name)}</span><button type="button" data-action="remove-reference-entry" data-reference-worldbook="${esc(item.worldbook)}" data-reference-name="${esc(item.name)}" aria-label="移除 ${esc(item.name)}">×</button></span>`,
          )
          .join('')
      : '<span class="sg-reference-empty">尚未选择；AI 将只依据当前开局配置生成。</span>';
  }
  function updateReferenceSummary() {
    const summary = root?.querySelector('[data-reference-summary]');
    if (summary) summary.innerHTML = referenceSummaryHtml();
    const count = root?.querySelector('[data-reference-count]');
    if (count) count.textContent = `已选 ${(project.opening.referenceEntries || []).length} 条`;
  }
  function referenceOverlayBody() {
    if (referenceWorldbookError) return `<div class="sg-errors">${esc(referenceWorldbookError)}</div>`;
    if (!referenceWorldbookNames.length) return '<div class="sg-config-empty">没有可读取的世界书。</div>';
    const entries = [...(referenceWorldbookCache[referenceWorldbookViewing] || [])]
      .filter(item => item?.name)
      .sort((a, b) => (a.position?.order || 100) - (b.position?.order || 100));
    return `<div class="sg-reference-toolbar"><label class="sg-field"><span>世界书</span><select data-reference-worldbook-select>${referenceWorldbookNames.map(name => `<option value="${esc(name)}" ${name === referenceWorldbookViewing ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label><label class="sg-field"><span>搜索条目</span><input type="search" data-reference-search placeholder="输入条目名称"></label></div><div class="sg-reference-list">${
      entries.length
        ? entries
            .map(
              item =>
                `<label class="sg-reference-entry" data-reference-entry-row data-reference-search-text="${esc(item.name.toLowerCase())}"><input type="checkbox" data-reference-entry data-reference-worldbook="${esc(referenceWorldbookViewing)}" data-reference-name="${esc(item.name)}" ${referenceIsSelected(referenceWorldbookViewing, item.name) ? 'checked' : ''}><span><b>${esc(item.name)}</b><small>${esc(
                  String(item.content || '')
                    .replace(/\s+/g, ' ')
                    .slice(0, 100) || '空条目',
                )}</small></span></label>`,
            )
            .join('')
        : '<div class="sg-config-empty">这个世界书没有条目。</div>'
    }<div class="sg-config-empty" data-reference-search-empty hidden>没有匹配的条目。</div></div><div class="sg-reference-footer"><span>只会把勾选条目交给 AI 参考，不会复制进 DLC。</span><span data-reference-modal-count>已选 ${(project.opening.referenceEntries || []).length} 条</span></div>`;
  }
  function renderReferenceOverlayBody() {
    const body = root?.querySelector('[data-reference-overlay-body]');
    if (body) body.innerHTML = referenceOverlayBody();
  }
  async function openReferenceSelector() {
    root?.querySelector('[data-reference-overlay]')?.remove();
    root?.insertAdjacentHTML(
      'beforeend',
      `<div class="sg-reference-overlay" data-reference-overlay><section class="sg-reference-modal" role="dialog" aria-modal="true" aria-label="选择参考世界书条目"><header class="sg-reference-head"><div><p class="sg-kicker">REFERENCE MATERIAL</p><h2>选择参考世界书</h2></div><button type="button" class="sg-close" data-action="close-reference-selector" aria-label="关闭">×</button></header><div class="sg-reference-body" data-reference-overlay-body><div class="sg-config-empty">正在读取世界书……</div></div></section></div>`,
    );
    if (!referenceWorldbookNames.length) await loadReferenceWorldbooks();
    renderReferenceOverlayBody();
  }
  async function viewReferenceWorldbook(name) {
    referenceWorldbookViewing = name;
    const body = root?.querySelector('[data-reference-overlay-body]');
    if (body) body.innerHTML = '<div class="sg-config-empty">正在读取条目……</div>';
    try {
      await ensureReferenceWorldbook(name);
      referenceWorldbookError = '';
    } catch (error) {
      referenceWorldbookError = error?.message || '读取世界书失败。';
    }
    renderReferenceOverlayBody();
  }
  function setReferenceEntry(worldbook, name, selected) {
    const entries = (project.opening.referenceEntries ||= []);
    const exists = referenceIsSelected(worldbook, name);
    if (selected && !exists) entries.push({ worldbook, name });
    if (!selected && exists)
      project.opening.referenceEntries = entries.filter(item => item.worldbook !== worldbook || item.name !== name);
    saveProject();
    updateReferenceSummary();
    const count = root?.querySelector('[data-reference-modal-count]');
    if (count) count.textContent = `已选 ${project.opening.referenceEntries.length} 条`;
  }
  function filterReferenceEntries(query) {
    let visible = 0;
    for (const row of root?.querySelectorAll('[data-reference-entry-row]') || []) {
      row.hidden = !row.dataset.referenceSearchText.includes(query.trim().toLowerCase());
      if (!row.hidden) visible += 1;
    }
    const empty = root?.querySelector('[data-reference-search-empty]');
    if (empty) empty.hidden = visible > 0;
  }

  function openApiSettings() {
    root?.querySelector('[data-api-overlay]')?.remove();
    const settings = aiSettings();
    root?.insertAdjacentHTML(
      'beforeend',
      `<div class="sg-reference-overlay" data-api-overlay><section class="sg-reference-modal sg-api-modal" role="dialog" aria-modal="true" aria-label="API 配置"><header class="sg-reference-head"><div><p class="sg-kicker">SHARED MODEL API</p><h2>生成 API 配置</h2><small>与万象生成器共用同一份配置，任一处保存都会同步生效。</small></div><button type="button" class="sg-close" data-action="close-api-settings" aria-label="关闭">×</button></header><div class="sg-reference-body"><div class="sg-api-grid"><label class="sg-field"><span>接口协议</span><select data-api-setting="apiType"><option value="openai" ${settings.apiType === 'openai' ? 'selected' : ''}>OpenAI 兼容协议</option><option value="claude" ${settings.apiType === 'claude' ? 'selected' : ''}>Claude 协议</option></select></label><label class="sg-field"><span>模型名称</span><div class="sg-api-model-row"><input data-api-setting="model" value="${esc(settings.model)}" placeholder="例如：gemini-2.5-flash"><button type="button" class="sg-btn" data-action="fetch-api-models">拉取</button></div><select data-api-models hidden aria-label="可用模型"></select></label><label class="sg-field full"><span>API 地址</span><input data-api-setting="apiUrl" value="${esc(settings.apiUrl)}" placeholder="https://example.com/v1/chat/completions"></label><label class="sg-field full"><span>API 密钥</span><input type="password" data-api-setting="apiKey" value="${esc(settings.apiKey)}" placeholder="sk-..."></label><label class="sg-field"><span>温度</span><input type="number" min="0" max="2" step="0.1" data-api-setting="temperature" value="${esc(settings.temperature)}"></label><label class="sg-field"><span>最大 Token</span><input type="number" min="1" max="200000" data-api-setting="maxTokens" value="${esc(settings.maxTokens)}"></label><label class="sg-field"><span>Top P</span><input type="number" min="0" max="1" step="0.05" data-api-setting="topP" value="${esc(settings.topP)}"></label><label class="sg-field"><span>频率惩罚</span><input type="number" min="-2" max="2" step="0.1" data-api-setting="frequencyPenalty" value="${esc(settings.frequencyPenalty)}"></label><label class="sg-field"><span>存在惩罚</span><input type="number" min="-2" max="2" step="0.1" data-api-setting="presencePenalty" value="${esc(settings.presencePenalty)}"></label></div><div class="sg-api-note" data-api-settings-status>密钥只保存在当前酒馆页面的本地存储中。</div><div class="sg-actions sg-api-actions"><button type="button" class="sg-btn" data-action="close-api-settings">取消</button><button type="button" class="sg-btn primary" data-action="save-api-settings">保存并同步</button></div></div></section></div>`,
    );
  }

  function readApiSettingsForm() {
    const value = name => root?.querySelector(`[data-api-setting="${name}"]`)?.value ?? '';
    return {
      apiType: value('apiType') || 'openai',
      apiUrl: value('apiUrl').trim(),
      apiKey: value('apiKey').trim(),
      model: value('model').trim(),
      temperature: Number(value('temperature') || 0.8),
      maxTokens: Math.max(1, Number(value('maxTokens') || 12000)),
      topP: Number(value('topP') || 0.9),
      frequencyPenalty: Number(value('frequencyPenalty') || 0),
      presencePenalty: Number(value('presencePenalty') || 0),
    };
  }

  async function fetchApiModels(button) {
    const settings = readApiSettingsForm();
    const status = root?.querySelector('[data-api-settings-status]');
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = '读取中…';
    try {
      if (!settings.apiUrl) throw new Error('请先填写 API 地址。');
      const getModelList = api('getModelList');
      let models;
      if (typeof getModelList === 'function')
        models = await getModelList({ apiurl: settings.apiUrl, key: settings.apiKey });
      else {
        const base = settings.apiUrl
          .replace(/\/chat\/completions\/?$/i, '')
          .replace(/\/v1\/?$/i, '')
          .replace(/\/+$/, '');
        const response = await fetch(`${base}/v1/models`, {
          headers: settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {},
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        models = (data.data || []).map(item => item.id || item.name).filter(Boolean);
      }
      models = [...new Set((models || []).map(String).filter(Boolean))].sort();
      if (!models.length) throw new Error('接口没有返回可用模型。');
      const select = root?.querySelector('[data-api-models]');
      select.innerHTML = models.map(model => `<option value="${esc(model)}">${esc(model)}</option>`).join('');
      select.hidden = false;
      const modelInput = root?.querySelector('[data-api-setting="model"]');
      if (modelInput.value && models.includes(modelInput.value)) select.value = modelInput.value;
      else {
        select.value = models[0];
        modelInput.value = models[0];
      }
      if (status) status.textContent = `已读取 ${models.length} 个模型；选择后记得保存。`;
    } catch (error) {
      if (status) status.textContent = `模型列表读取失败：${error?.message || error}`;
    } finally {
      button.disabled = false;
      button.textContent = previous;
    }
  }

  function stepThree() {
    const included = selectedCharacters();
    const scene = included.filter(character => project.characters[character.name].scene);
    const lengths = [600, 1000, 1500, 2000];
    const initStatus = project.initialization?.stale
      ? '尚未根据当前开场补全'
      : project.initialization?.summary || '已通过固定 Schema 校验';
    return `<section class="sg-page"><p class="sg-kicker">STEP THREE · THE FIRST SPARK</p><h1>故事从哪里开始？</h1><p class="sg-lead">第一幕只是引子，不负责让所有人物轮流亮相。下面只有红色人物能在开场现场出现。</p><div class="sg-scene">${included.length ? included.map(character => `<button type="button" class="${project.characters[character.name].scene ? 'on' : ''}" data-scene-character="${esc(character.name)}" aria-pressed="${project.characters[character.name].scene}">${esc(character.name)}</button>`).join('') : '<span class="sg-lead">尚未纳入角色；也可以只写 &lt;user&gt; 和一次性路人的开场。</span>'}</div><div class="sg-persona-strip"><span><b>自动参考人物人设</b><br><small data-persona-summary>${scene.length ? `${scene.map(character => character.name).join('、')} · 将读取对应 SFW/人物条目` : '没有现场人物；不会额外读取角色人设'}</small></span><span class="sg-kind">硬约束</span></div><div class="sg-opening-tools"><section class="sg-opening-tool"><div class="sg-tool-head"><span><b>开场白字数</b><small>AI 会以目标字数为中心，上下浮动约 10%</small></span></div><div class="sg-length-row"><input type="number" min="300" max="5000" step="100" data-bind="opening.targetWords" value="${esc(project.opening.targetWords)}"><div class="sg-length-presets">${lengths.map(length => `<button type="button" class="sg-length-preset ${Number(project.opening.targetWords) === length ? 'on' : ''}" data-action="opening-length" data-opening-length="${length}">${length}字</button>`).join('')}</div></div></section><section class="sg-opening-tool"><div class="sg-tool-head"><span><b>额外参考世界书</b><small>用于地方事实、历史背景、氛围或文风；人物人设无需手选</small></span><button type="button" class="sg-btn" data-action="open-reference-selector">选择条目</button></div><div class="sg-reference-summary" data-reference-summary>${referenceSummaryHtml()}</div><div style="margin-top:8px;color:var(--muted);font-size:10px" data-reference-count>已选 ${(project.opening.referenceEntries || []).length} 条</div></section></div><div class="sg-grid">${field('开场名称', 'opening.name', project.opening.name, '第一幕')}${textarea('一句话开局设想', 'opening.hook', project.opening.hook, '例如：欠饷军士正在堡门外哗变，主角必须在天黑前筹到一批粮食。')}${textarea('开场白正文', 'opening.body', project.opening.body, '可以手写，也可以点击下方按钮让 AI 生成。')}</div><div class="sg-generation-flow"><div class="sg-flow-card"><b>一、生成第一幕</b><small>读取现场人物完整人设与长期定位</small></div><span class="sg-flow-arrow">→</span><div class="sg-flow-card"><b>二、补全初始变量</b><small>从最终正文提取事实，只写入固定 Schema 字段</small></div></div><div class="sg-actions" style="margin-top:16px"><button class="sg-btn primary" data-action="generate" ${busy ? 'disabled' : ''}>${busy && aiTask === 'opening' ? '正在生成开场…' : busy && aiTask === 'initialization' ? '正在校验初始变量…' : 'AI 生成开场并补全变量'}</button><button class="sg-btn" data-action="generate-initvar" ${busy || !project.opening.body.trim() ? 'disabled' : ''}>仅重新补全初始变量</button></div><div class="sg-era"><b>现场人物：</b><span data-scene-summary>${scene.map(character => character.name).join('、') || '无现有角色'}</span><br><span>其他已选人物仍会进入人物概览，但不会自动出现在第一幕。</span></div><div class="sg-era sg-initvar-note"><b>初始变量：</b><span data-initvar-status>${esc(initStatus)}</span><br><small>官方天下地图、日期地点、主角属性与字段结构由代码锁定；AI 只能补充正文明确支持的人物、物品、军队、资产、科技、势力、任务和大事记。</small></div></section>`;
  }

  function stepFour() {
    const errors = validateProject();
    const selected = selectedCharacters();
    const known = selected.filter(character => project.characters[character.name].known);
    const scene = selected.filter(character => project.characters[character.name].scene);
    let bytes = 0;
    try {
      bytes = new TextEncoder().encode(JSON.stringify(compilePackage())).length;
    } catch {
      /* shown below */
    }
    return `<section class="sg-page"><p class="sg-kicker">STEP FOUR · SEAL THE DOCUMENT</p><h1>核对身份文牒</h1><p class="sg-lead">这里展示最终会写入角色卡的内容。安装后只能新建聊天使用，不支持中途切换。</p>${errors.length ? `<div class="sg-errors"><b>还不能生成：</b><br>${errors.map(error => `• ${esc(error)}`).join('<br>')}</div>` : ''}<div class="sg-preview"><article class="sg-card"><h3>${esc(project.title)}</h3><p>崇祯七年七月 · ${esc(project.protagonist.location)} · ${esc(project.protagonist.identity)}</p></article><article class="sg-card"><h3>人物分配</h3><p>人物概览 ${selected.length} 人 · 已相识 ${known.length} 人 · 开场现场 ${scene.length} 人</p></article><article class="sg-card"><h3>第一幕</h3><p>${esc(project.opening.name)} · ${esc(project.opening.body.slice(0, 180) || '尚未填写正文')}${project.opening.body.length > 180 ? '……' : ''}</p></article><article class="sg-card"><h3>初始变量</h3><p>${project.initialization?.stale ? '需要回到第三步重新补全' : `固定 Schema 校验通过 · ${esc(project.initialization?.summary || '没有额外事实')}`}</p></article><article class="sg-card"><h3>时代与包体</h3><p>官方七月地图 ${Object.keys(eraPreset?.变量?.天下地图?.地区态势 || {}).length} 地区 · 预计 ${(bytes / 1024).toFixed(1)} KB / 1367 KB</p></article></div><input type="file" hidden accept="application/json,.json" data-project-file><div class="sg-actions" style="margin-top:18px"><button class="sg-btn" data-action="import-project">载入工程</button><button class="sg-btn" data-action="download-project">保存工程</button><button class="sg-btn" data-action="download-package" ${errors.length ? 'disabled' : ''}>下载 DLC</button><button class="sg-btn primary" data-action="install" ${errors.length ? 'disabled' : ''}>直接安装试玩</button><button class="sg-btn primary" data-action="publish" ${errors.length ? 'disabled' : ''}>带到创意工坊</button></div></section>`;
  }

  function render({ preserveScroll = false } = {}) {
    if (!root) return;
    const previousScroll = preserveScroll ? root.querySelector('.sg-content')?.scrollTop || 0 : 0;
    const previousCatalogScroll = preserveScroll ? root.querySelector('.sg-catalog')?.scrollTop || 0 : 0;
    const pages = [stepOne, stepTwo, stepThree, stepFour];
    root.innerHTML = `<div class="sg-shell"><header class="sg-head"><div class="sg-brand"><span class="sg-seal">启</span><span><b>开局生成器</b><small>崇祯七年七月 · 身份 DLC</small></span></div><div class="sg-head-actions"><button type="button" class="sg-api-trigger" data-action="open-api-settings" title="与万象生成器共用 API 配置"><span>⚙ API</span><small>${esc(apiSettingsLabel())}</small></button><button class="sg-close" data-action="close" aria-label="关闭">×</button></div></header><main class="sg-main"><nav class="sg-steps">${['我是谁', '我认识谁', '故事引子', '生成 DLC'].map((label, index) => `<button class="sg-step ${project.step === index + 1 ? 'on' : ''}" data-step="${index + 1}"><i>${index + 1}</i><span>${label}</span></button>`).join('')}</nav><div class="sg-content">${pages[project.step - 1]()}</div></main><footer class="sg-footer"><div class="sg-status ${messageType}">${esc(message || (eraError ? eraError : '草稿自动保存在测试环境本地。'))}</div><div class="sg-actions"><button class="sg-btn" data-action="reset">新建</button>${project.step > 1 ? '<button class="sg-btn" data-action="previous">上一步</button>' : ''}${project.step < 4 ? '<button class="sg-btn primary" data-action="next">下一步</button>' : ''}</div></footer></div>`;
    applyRosterFilters();
    if (preserveScroll) {
      root.querySelector('.sg-content').scrollTop = previousScroll;
      const catalog = root.querySelector('.sg-catalog');
      if (catalog) catalog.scrollTop = previousCatalogScroll;
    }
  }

  async function onClick(event) {
    const step = event.target.closest?.('[data-step]');
    if (step) {
      project.step = Number(step.dataset.step);
      saveProject();
      render();
      return;
    }
    if (event.target.matches?.('[data-reference-overlay]')) {
      event.target.remove();
      return;
    }
    if (event.target.matches?.('[data-api-overlay]')) {
      event.target.remove();
      return;
    }
    const scene = event.target.closest?.('[data-scene-character]');
    if (scene) {
      const state = project.characters[scene.dataset.sceneCharacter];
      state.scene = !state.scene;
      saveProject();
      markInitializationStale();
      saveProject();
      scene.classList.toggle('on', state.scene);
      scene.setAttribute('aria-pressed', String(state.scene));
      const active = selectedCharacters().filter(character => project.characters[character.name].scene);
      const summary = root.querySelector('[data-scene-summary]');
      if (summary) summary.textContent = active.map(character => character.name).join('、') || '无现有角色';
      const personas = root.querySelector('[data-persona-summary]');
      if (personas)
        personas.textContent = active.length
          ? `${active.map(character => character.name).join('、')} · 将读取对应 SFW/人物条目`
          : '没有现场人物；不会额外读取角色人设';
      const initStatus = root.querySelector('[data-initvar-status]');
      if (initStatus) initStatus.textContent = '配置已变化，需要重新补全';
      return;
    }
    const actionElement = event.target.closest?.('[data-action]');
    const action = actionElement?.dataset.action;
    if (!action) return;
    if (action === 'close') return close();
    if (action === 'open-api-settings') {
      openApiSettings();
      return;
    }
    if (action === 'close-api-settings') {
      root.querySelector('[data-api-overlay]')?.remove();
      return;
    }
    if (action === 'fetch-api-models') {
      await fetchApiModels(actionElement);
      return;
    }
    if (action === 'save-api-settings') {
      saveAiSettings(readApiSettingsForm());
      root.querySelector('[data-api-overlay]')?.remove();
      const label = root.querySelector('.sg-api-trigger small');
      if (label) label.textContent = apiSettingsLabel();
      notify('API 配置已保存，并与万象生成器同步。', 'success');
      return;
    }
    if (action === 'close-reference-selector') {
      root.querySelector('[data-reference-overlay]')?.remove();
      return;
    }
    if (action === 'open-reference-selector') {
      await openReferenceSelector();
      return;
    }
    if (action === 'opening-length') {
      project.opening.targetWords = Number(actionElement.dataset.openingLength);
      saveProject();
      const input = root.querySelector('[data-bind="opening.targetWords"]');
      if (input) input.value = project.opening.targetWords;
      for (const button of root.querySelectorAll('[data-opening-length]'))
        button.classList.toggle('on', Number(button.dataset.openingLength) === project.opening.targetWords);
      return;
    }
    if (action === 'remove-reference-entry') {
      setReferenceEntry(actionElement.dataset.referenceWorldbook, actionElement.dataset.referenceName, false);
      const checkbox = [...(root.querySelectorAll('[data-reference-entry]') || [])].find(
        item =>
          item.dataset.referenceWorldbook === actionElement.dataset.referenceWorldbook &&
          item.dataset.referenceName === actionElement.dataset.referenceName,
      );
      if (checkbox) checkbox.checked = false;
      return;
    }
    if (action === 'previous') {
      project.step = Math.max(1, project.step - 1);
      saveProject();
      return render();
    }
    if (action === 'next') {
      project.step = Math.min(4, project.step + 1);
      saveProject();
      return render();
    }
    if (action === 'reset') {
      if (!(mountDocument.defaultView || window).confirm('新建工程会清空当前本地草稿，确定继续吗？')) return;
      project = newProject();
      saveProject();
      message = '';
      return render();
    }
    if (action === 'roster-filter') {
      rosterFilter = actionElement.dataset.rosterFilter;
      applyRosterFilters();
      return;
    }
    if (action === 'toggle-character') {
      const name = actionElement.dataset.characterName,
        state = project.characters[name];
      setCharacterIncluded(name, !state.included);
      return;
    }
    if (action === 'toggle-character-editor') {
      const name = actionElement.dataset.characterName,
        card = actionElement.closest('[data-character-config]'),
        body = card?.querySelector('.sg-config-body');
      const expanded = !expandedCharacters.has(name);
      if (expanded) expandedCharacters.add(name);
      else expandedCharacters.delete(name);
      card?.classList.toggle('expanded', expanded);
      actionElement.setAttribute('aria-expanded', String(expanded));
      if (body) body.hidden = !expanded;
      return;
    }
    if (action === 'jump-character') {
      const name = actionElement.dataset.characterName,
        content = root.querySelector('.sg-content'),
        card = root.querySelector(`[data-character-config="${CSS.escape(name)}"]`);
      if (card && !card.classList.contains('expanded'))
        card.querySelector('[data-action="toggle-character-editor"]')?.click();
      if (content && card)
        content.scrollTo({
          top: content.scrollTop + card.getBoundingClientRect().top - content.getBoundingClientRect().top - 18,
          behavior: 'smooth',
        });
      return;
    }
    if (action === 'remove-character') {
      setCharacterIncluded(actionElement.dataset.characterName, false);
      return;
    }
    if (action === 'ai-character' || action === 'ai-characters') {
      const targets = (
        action === 'ai-character'
          ? CHARACTERS.filter(character => character.name === actionElement.dataset.characterName)
          : selectedCharacters()
      ).filter(character => character.lock !== 'history');
      aiTask = 'adaptation';
      busy = true;
      actionElement.disabled = true;
      const previousText = actionElement.textContent;
      actionElement.textContent = 'AI 正在读取人设…';
      try {
        if (!targets.length) throw new Error('已选人物中没有需要长期适配的原创角色。');
        const names = [];
        for (let index = 0; index < targets.length; index++) {
          actionElement.textContent =
            targets.length > 1
              ? `AI 正在补全 ${index + 1}/${targets.length} · ${targets[index].name}…`
              : 'AI 正在读取人设…';
          const completed = await generateCharacterAdaptations([targets[index]]);
          names.push(...completed);
          for (const name of completed) refreshCharacterCard(name);
        }
        notify(`已依据原始人设补全 ${names.join('、')} 的长期定位。`, 'success');
      } catch (error) {
        notify(`人物适配失败：${error?.message || error}`, 'error');
      } finally {
        aiTask = '';
        busy = false;
        if (actionElement.isConnected) {
          actionElement.disabled = false;
          actionElement.textContent = previousText;
        }
      }
      return;
    }
    if (action === 'bulk-location') {
      for (const character of selectedCharacters())
        if (character.lock !== 'history') {
          const state = project.characters[character.name];
          state.activityArea = `通常活动于${project.protagonist.location || '主角所在地区'}及周边，可随长期职务、家庭或生计合理迁移`;
          const input = root.querySelector(`[data-bind="characters.${CSS.escape(character.name)}.activityArea"]`);
          if (input) input.value = state.activityArea;
        }
      markInitializationStale();
      saveProject();
      notify('已让原创人物的活动区域参考主角地点。', 'success');
      return;
    }
    if (action === 'bulk-known') {
      for (const character of selectedCharacters()) {
        project.characters[character.name].known = true;
        const input = root.querySelector(
          `[data-character-toggle="known"][data-character-name="${CSS.escape(character.name)}"]`,
        );
        if (input) input.checked = true;
      }
      markInitializationStale();
      saveProject();
      notify('已将已选人物设为开场前与 <user> 相识。', 'success');
      return;
    }
    if (action === 'bulk-clear-scene') {
      for (const character of selectedCharacters()) {
        project.characters[character.name].scene = false;
        const input = root.querySelector(
          `[data-character-toggle="scene"][data-character-name="${CSS.escape(character.name)}"]`,
        );
        if (input) input.checked = false;
      }
      markInitializationStale();
      saveProject();
      notify('已清空开场现场人物。', 'success');
      return;
    }
    if (action === 'generate') {
      busy = true;
      aiTask = 'opening';
      actionElement.disabled = true;
      actionElement.textContent = '正在生成开场…';
      try {
        await generateOpening();
        const nameInput = root.querySelector('[data-bind="opening.name"]'),
          bodyInput = root.querySelector('[data-bind="opening.body"]');
        if (nameInput) nameInput.value = project.opening.name;
        if (bodyInput) bodyInput.value = project.opening.body;
        message = '开场白已经生成并保存，正在补全初始变量……';
        messageType = 'success';
        const status = root.querySelector('.sg-status');
        if (status) {
          status.textContent = message;
          status.title = message;
          status.className = `sg-status ${messageType}`;
        }
        try {
          aiTask = 'initialization';
          actionElement.textContent = '开场已保存，正在补全变量…';
          await generateInitialVariables();
          const initStatus = root.querySelector('[data-initvar-status]');
          if (initStatus) initStatus.textContent = project.initialization.summary;
          message = '开场已按人物人设生成，初始变量也已通过固定 Schema 校验。';
          messageType = 'success';
        } catch (initializationError) {
          const initStatus = root.querySelector('[data-initvar-status]');
          if (initStatus) initStatus.textContent = '开场已保存；初始变量需要单独重试';
          message = `开场白已生成并保存；仅初始变量补全失败：${initializationError?.message || initializationError}`;
          messageType = 'warning';
        }
      } catch (error) {
        message = `开场白生成失败：${error?.message || error}`;
        messageType = 'error';
      } finally {
        busy = false;
        aiTask = '';
        actionElement.disabled = false;
        actionElement.textContent = 'AI 生成开场并补全变量';
        const status = root.querySelector('.sg-status');
        if (status) {
          status.textContent = message;
          status.title = message;
          status.className = `sg-status ${messageType}`;
        }
      }
      return;
    }
    if (action === 'generate-initvar') {
      busy = true;
      aiTask = 'initialization';
      actionElement.disabled = true;
      const previousText = actionElement.textContent;
      actionElement.textContent = '正在补全并校验…';
      try {
        await generateInitialVariables();
        const initStatus = root.querySelector('[data-initvar-status]');
        if (initStatus) initStatus.textContent = project.initialization.summary;
        notify('初始变量已依据当前开场重新补全并通过 Schema 校验。', 'success');
      } catch (error) {
        notify(`初始变量生成失败：${error?.message || error}`, 'error');
      } finally {
        busy = false;
        aiTask = '';
        actionElement.disabled = false;
        actionElement.textContent = previousText;
      }
      return;
    }
    if (action === 'download-project') {
      download(JSON.stringify(project, null, 2), `${slug(project.title)}.cmyj-scenario-project.json`);
      return notify('开局工程已保存。', 'success');
    }
    if (action === 'import-project') {
      root.querySelector('[data-project-file]')?.click();
      return;
    }
    let bundle;
    try {
      bundle = compilePackage();
    } catch (error) {
      return notify(error.message, 'error');
    }
    if (action === 'download-package') {
      download(JSON.stringify(bundle, null, 2), `${slug(project.title)}.workshop.json`);
      return notify('身份 DLC 已导出。', 'success');
    }
    if (action === 'install') {
      if (typeof options.installScenarioPackage !== 'function') return notify('当前环境没有连接 DLC 安装器。', 'error');
      try {
        await options.installScenarioPackage(bundle);
        notify('身份 DLC 已安装，请新建聊天并选择开场。', 'success');
      } catch (error) {
        notify(`安装失败：${error?.message || error}`, 'error');
      }
      return;
    }
    if (action === 'publish') {
      if (typeof options.openWorkshop !== 'function') return notify('当前环境没有连接创意工坊。', 'error');
      close();
      return options.openWorkshop({ initialView: 'publish', initialType: 'scenario', initialBundle: bundle });
    }
  }

  function onInput(event) {
    const target = event.target;
    if (target.matches?.('[data-api-models]')) {
      const input = root?.querySelector('[data-api-setting="model"]');
      if (input) input.value = target.value;
      return;
    }
    if (target.matches?.('[data-reference-worldbook-select]')) {
      if (event.type === 'change') void viewReferenceWorldbook(target.value);
      return;
    }
    if (target.matches?.('[data-reference-entry]')) {
      if (event.type === 'change')
        setReferenceEntry(target.dataset.referenceWorldbook, target.dataset.referenceName, target.checked);
      return;
    }
    if (target.matches?.('[data-reference-search]')) {
      filterReferenceEntries(target.value);
      return;
    }
    if (target.matches?.('[data-bind]')) {
      bindInput(target.dataset.bind, target.value);
      if (/^(protagonist|date|stats|characters|opening\.(hook|body|id|name))/.test(target.dataset.bind)) {
        markInitializationStale();
        saveProject();
        const initStatus = root?.querySelector('[data-initvar-status]');
        if (initStatus) initStatus.textContent = '内容已修改，需要重新补全';
      }
      if (target.dataset.bind === 'opening.targetWords')
        for (const button of root.querySelectorAll('[data-opening-length]'))
          button.classList.toggle('on', Number(button.dataset.openingLength) === Number(target.value));
      return;
    }
    if (target.matches?.('[data-list-bind]')) {
      const parts = target.dataset.listBind.split('.');
      let cursor = project;
      for (let index = 0; index < parts.length - 1; index++) cursor = cursor[parts[index]];
      cursor[parts.at(-1)] = target.value
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean);
      markInitializationStale();
      saveProject();
      return;
    }
    if (target.matches?.('[data-roster-search]')) {
      rosterQuery = target.value.trim().toLowerCase();
      applyRosterFilters();
      return;
    }
    if (target.matches?.('[data-character-toggle]')) {
      if (event.type !== 'change') return;
      const state = project.characters[target.dataset.characterName];
      state[target.dataset.characterToggle] = target.checked;
      markInitializationStale();
      saveProject();
    }
    if (target.matches?.('[data-project-file]') && target.files?.[0]) {
      target.files[0]
        .text()
        .then(text => {
          const parsed = JSON.parse(text);
          if (parsed?.format !== 'canming-scenario-project' || ![1, 2].includes(parsed?.version))
            throw new Error('不是有效的开局工程文件。');
          project = normalizeProject(parsed);
          saveProject();
          notify('开局工程已载入。', 'success');
        })
        .catch(error => notify(`载入失败：${error?.message || error}`, 'error'));
    }
  }

  async function open(openOptions = {}) {
    options = openOptions;
    mountDocument = options.mountDocument || document;
    close();
    ensureStyle();
    loadProject();
    root = mountDocument.createElement('div');
    root.id = ROOT_ID;
    root.className = `theme-${options.theme || 'night'}`;
    root.addEventListener('click', event => void onClick(event));
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    mountDocument.body.appendChild(root);
    root.innerHTML = `<div class="sg-shell"><div class="sg-config-empty">正在载入崇祯七年七月时代模板……</div></div>`;
    await loadEraPreset();
    if (root?.isConnected) render();
  }
  function close() {
    mountDocument.getElementById(ROOT_ID)?.remove();
    root = null;
  }
  function exportProject() {
    return clone(project);
  }
  function exportPackage() {
    return compilePackage();
  }

  const exposed = {
    apiVersion: 1,
    open,
    close,
    exportProject,
    exportPackage,
    compileProject: (raw, preset) => {
      const previousProject = project,
        previousPreset = eraPreset;
      project = normalizeProject(raw);
      if (preset) eraPreset = clone(preset);
      try {
        return compilePackage();
      } finally {
        project = previousProject;
        eraPreset = previousPreset;
      }
    },
  };
  globalThis[API_NAME] = exposed;
  try {
    if (window.parent && window.parent !== window) window.parent[API_NAME] = exposed;
  } catch {
    /* ignore */
  }
})();
