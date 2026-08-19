import { normalizeTechnologyCollection } from '../shared/technology.js';

const MIGRATION_VERSION = 8;
const MIGRATION_MARKER = '_残明余烬旧档迁移版本';

const INTERPERSONAL_CATEGORIES = ['上司', '故友与同僚', '下属与幕僚', '三教九流', '仇敌', '亲属', '私帷'];
const PRIVATE_RELATIONS = new Set(['妻', '妾', '通房', '红颜', '女眷']);
const HISTORY_TYPES = new Set(['军政', '经济', '人事', '外交', '战役', '建设', '技术', '家族']);
const MAP_CAMPS = new Set(['主角方', '明廷', '后金', '流寇', '地方中立', '未知']);
const MAP_CAMP_ALIASES = { 主角: '主角方', 明军: '明廷', 中立: '地方中立' };
const FACTION_STATUSES = new Set(['未接触', '观望', '友好', '结盟', '敌对', '交战', '附庸', '宗主', '已投降', '已覆灭']);
const LOCAL_REGIONS = new Set([
  '漠北',
  '朝鲜',
  '日本',
  '东番',
  '安南',
  '暹罗',
  '澜沧·真腊',
  '吕宋',
  '爪哇',
  '乌思藏',
  '西域',
  '青海',
  '莫卧儿',
  '不丹',
  '尼婆罗',
  '澳洲',
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const REIGN_YEAR_OFFSETS = Object.freeze({
  崇祯: 1627,
  弘光: 1644,
  隆武: 1644,
  绍武: 1645,
  永历: 1646,
  顺治: 1643,
  监国鲁: 1645,
  鲁监国: 1645,
});

function parseChineseYearNumber(value) {
  const raw = String(value ?? '').trim();
  if (raw === '元') return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (raw === '十') return 10;
  if (raw.includes('十')) {
    const [tens, units] = raw.split('十');
    return (tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0);
  }
  if ([...raw].every(char => char in digits)) return Number([...raw].map(char => digits[char]).join(''));
  return NaN;
}

function gregorianYearFromDate(value) {
  const match = String(value ?? '').match(/(崇祯|弘光|隆武|绍武|永历|顺治|监国鲁|鲁监国)([元一二两三四五六七八九十〇零\d]+)年/);
  if (!match) return null;
  const year = parseChineseYearNumber(match[2]);
  return Number.isFinite(year) ? REIGN_YEAR_OFFSETS[match[1]] + year : null;
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

function findInterpersonalPerson(data, name) {
  const network = _.get(data, '人际网络', {});
  for (const category of INTERPERSONAL_CATEGORIES) {
    const person = network?.[category]?.[name];
    if (person && typeof person === 'object') return { category, person };
  }
  return null;
}

function normalizeMapCamp(raw) {
  const camp = MAP_CAMP_ALIASES[raw] || raw;
  return MAP_CAMPS.has(camp) ? camp : '未知';
}

function inferLegacyMapCamp(raw, data, regionName) {
  const s = String(raw || '').trim();
  if (!s || /未知|不明/.test(s)) return '未知';

  const ownArmyNames = Object.keys(_.get(data, '军事.各营', {}))
    .map(name => String(name).trim())
    .filter(name => name.length >= 2);
  if (ownArmyNames.some(name => s.includes(name)) || /主角|我军|我部|麾下/.test(s)) return '主角方';

  if (LOCAL_REGIONS.has(regionName) && !/^(主角|我军|我部|明廷|明军|后金|流寇)/.test(s)) {
    return '地方中立';
  }

  const matched = [];
  if (/后金|建奴|女真|八旗|满洲/.test(s)) matched.push('后金');
  if (/流寇|贼营|闯军|献军|革左/.test(s)) matched.push('流寇');
  if (/明廷|明军|官军|朝廷|卫所|标营/.test(s)) matched.push('明廷');
  if (matched.length === 1) return matched[0];
  if (matched.length > 1) {
    if (/后金[^，。；]*大部|大部[^，。；]*后金/.test(s)) return '后金';
    if (/明廷[^，。；]*大部|大部[^，。；]*明廷/.test(s)) return '明廷';
  }
  return '未知';
}

function migrateSituationKey(data, stats) {
  if (!data.局势与任务 || typeof data.局势与任务 !== 'object') return false;
  data.时局与任务 = _.merge({}, data.局势与任务, data.时局与任务 || {});
  delete data.局势与任务;
  stats.situation++;
  return true;
}

function migrateInterpersonal(data, stats) {
  const network = data.人际网络;
  if (!network || typeof network !== 'object') return false;
  let changed = false;

  for (const category of INTERPERSONAL_CATEGORIES) {
    const people = network[category];
    if (!people || typeof people !== 'object') continue;
    for (const person of Object.values(people)) {
      if (!person || typeof person !== 'object') continue;
      if (category === '下属与幕僚' && !person.身份 && person.职责) {
        person.身份 = person.职责;
        delete person.职责;
        stats.duty++;
        changed = true;
      }
      if (category === '私帷') {
        if (!person.关系 && PRIVATE_RELATIONS.has(person.身份)) {
          person.关系 = person.身份;
          person.身份 = '';
          stats.privateRelation++;
          changed = true;
        }
        if (!person.关系) {
          person.关系 = '红颜';
          stats.privateRelation++;
          changed = true;
        }
        if (person.忠心 == null) {
          person.忠心 = 50;
          stats.privateLoyalty++;
          changed = true;
        }
      }
      if (typeof person.身份 !== 'string') {
        person.身份 = '';
        changed = true;
      }
    }
  }
  return changed;
}

function normalizeFactionStatus(value) {
  const status = String(value || '').trim();
  if (FACTION_STATUSES.has(status)) return status;
  if (/覆灭|消亡|瓦解/.test(status)) return '已覆灭';
  if (/投降|归降/.test(status)) return '已投降';
  if (/交战|战争|开战/.test(status)) return '交战';
  if (/敌对|对立|明合暗斗/.test(status)) return '敌对';
  if (/结盟|盟友/.test(status)) return '结盟';
  if (/友好|倚重|合作|联姻/.test(status)) return '友好';
  if (/附庸/.test(status)) return '附庸';
  if (/宗主/.test(status)) return '宗主';
  if (/已合并|归并|兼并|吞并/.test(status)) return '已覆灭';
  if (/未接触/.test(status)) return '未接触';
  return '观望';
}

function normalizeMatterStatus(value, currentState) {
  const status = String(value || '').trim();
  if (['待处理', '推进中', '等待中', '暂缓'].includes(status)) return status;
  const context = `${status} ${String(currentState || '')}`;
  if (/暂缓|搁置|暂停/.test(context)) return '暂缓';
  if (/等待|待.*(?:回信|答复|消息|时机|结果|抵达)|静候/.test(context)) return '等待中';
  if (/(?:尚未|还未|未曾)开始|未开始|待办|待处理/.test(context)) return '待处理';
  return context.trim() ? '推进中' : '待处理';
}

function normalizeMatter(task) {
  const source = task && typeof task === 'object' ? task : {};
  const currentState = source.现状 || source.进展 || source.进度 || '';
  return {
    状态: normalizeMatterStatus(source.状态, currentState),
    概要: source.概要 || source.目标 || source.说明 || '',
    现状: currentState,
    提醒: source.提醒 || '',
  };
}

function migrateLedgerToMatters(data) {
  const ledger = data.经济?.流水;
  if (!ledger || typeof ledger !== 'object') return false;
  const income = ledger.月入 && typeof ledger.月入 === 'object' ? ledger.月入 : {};
  const expense = ledger.月出 && typeof ledger.月出 === 'object' ? ledger.月出 : {};
  if (!Object.keys(income).length && !Object.keys(expense).length) return false;
  if (!data.时局与任务 || typeof data.时局与任务 !== 'object') data.时局与任务 = {};
  const matters =
    data.时局与任务.未决事项 && typeof data.时局与任务.未决事项 === 'object'
      ? data.时局与任务.未决事项
      : {};
  data.时局与任务.未决事项 = matters;
  const uniqueName = base => {
    if (!Object.hasOwn(matters, base)) return base;
    if (!Object.hasOwn(matters, `${base}（旧流水）`)) return `${base}（旧流水）`;
    let index = 2;
    while (Object.hasOwn(matters, `${base}（旧流水${index}）`)) index++;
    return `${base}（旧流水${index}）`;
  };
  const appendEntries = (entries, direction) => {
    for (const [entryName, entryValue] of Object.entries(entries)) {
      const entry = entryValue && typeof entryValue === 'object' ? entryValue : {};
      const name = uniqueName(`${direction === 'income' ? '待收' : '待付'}：${entryName}`);
      const amount = Number(entry.银两) || 0;
      const description = String(entry.说明 || '').trim();
      matters[name] = {
        状态: '等待中',
        概要: `${entryName}尚有${amount}两白银${direction === 'income' ? '应收' : '应付'}，尚未实际交割。${description ? `事由：${description}` : ''}`,
        现状: '由1.8旧档流水迁移，当前仍待结清。',
        提醒:
          direction === 'income'
            ? '实际到账后更新主角私库，并移除此事项。'
            : '实际支付后更新主角私库，并移除此事项。',
      };
    }
  };
  appendEntries(income, 'income');
  appendEntries(expense, 'expense');
  return true;
}

function migrateLeanVariables(data, stats) {
  let changed = false;
  changed = migrateLedgerToMatters(data) || changed;
  const network = data.人际网络;
  if (network && typeof network === 'object') {
    const present = new Set(Array.isArray(network.在场角色) ? network.在场角色 : []);
    for (const category of INTERPERSONAL_CATEGORIES) {
      for (const [name, person] of Object.entries(network[category] || {})) {
        if (!person || typeof person !== 'object') continue;
        if (person.是否在场 === true) present.add(name);
        if (Object.hasOwn(person, '是否在场')) {
          delete person.是否在场;
          changed = true;
        }
        if (Object.hasOwn(person, '角色心声')) {
          delete person.角色心声;
          changed = true;
        }
      }
    }
    const presentNames = [...present].map(name => String(name).trim()).filter(Boolean);
    if (JSON.stringify(network.在场角色) !== JSON.stringify(presentNames)) {
      network.在场角色 = presentNames;
      changed = true;
    }
  }

  if (data.风月阁 && typeof data.风月阁 === 'object' && Object.hasOwn(data.风月阁, '掌柜絮语')) {
    delete data.风月阁.掌柜絮语;
    changed = true;
  }

  const powers = _.get(data, '时局与任务.势力关系');
  if (powers && typeof powers === 'object') {
    for (const power of Object.values(powers)) {
      if (!power || typeof power !== 'object') continue;
      if (!power.关系摘要 && typeof power.描述 === 'string') power.关系摘要 = power.描述;
      if (Object.hasOwn(power, '描述')) delete power.描述;
      const normalizedStatus = normalizeFactionStatus(power.状态);
      if (power.状态 !== normalizedStatus) power.状态 = normalizedStatus;

      const economy = power.经济;
      if (economy && typeof economy === 'object') {
        const oldGrain = economy.粮草?.状态;
        const grain = economy.粮草状态 || oldGrain || '未知';
        economy.粮草状态 = grain === '紧缺' ? '短缺' : grain;
        for (const key of ['主要收入', '主要支出', '粮草', '描述']) delete economy[key];
      }
      if (power.军事 && typeof power.军事 === 'object') delete power.军事.描述;
      changed = true;
    }
  }

  const situation = data.时局与任务;
  if (situation && typeof situation === 'object') {
    const oldTasks = situation.当前任务 && typeof situation.当前任务 === 'object' ? situation.当前任务 : {};
    const currentMatters = situation.未决事项 && typeof situation.未决事项 === 'object' ? situation.未决事项 : {};
    const sourceMatters = { ...oldTasks, ...currentMatters };
    if (Object.keys(sourceMatters).length || Object.hasOwn(situation, '当前任务')) {
      const normalizedMatters = Object.fromEntries(
        Object.entries(sourceMatters).map(([name, task]) => [name, normalizeMatter(task)]),
      );
      if (JSON.stringify(currentMatters) !== JSON.stringify(normalizedMatters)) {
        situation.未决事项 = normalizedMatters;
        changed = true;
      }
      if (Object.hasOwn(situation, '当前任务')) {
        delete situation.当前任务;
        changed = true;
      }
    }
  }

  if (changed) stats.leanVariables++;
  return changed;
}

function migrateGeneralLoyalty(data, stats) {
  const generals = _.get(data, '军事.将领');
  if (!generals || typeof generals !== 'object') return false;
  let changed = false;

  for (const [name, general] of Object.entries(generals)) {
    if (!general || typeof general !== 'object' || general.忠诚 == null) continue;
    const record = findInterpersonalPerson(data, name);
    const loyalty = clamp(Number(general.忠诚) || 0, 0, 100);
    if (!record) {
      if (!data.人际网络 || typeof data.人际网络 !== 'object') data.人际网络 = {};
      if (!data.人际网络.下属与幕僚 || typeof data.人际网络.下属与幕僚 !== 'object') {
        data.人际网络.下属与幕僚 = {};
      }
      data.人际网络.下属与幕僚[name] = {
        身份: '主角麾下将领',
        好感度: 0,
        忠心: loyalty,
      };
    } else if (record.person.忠心 == null && (record.category === '下属与幕僚' || record.category === '私帷')) {
      record.person.忠心 = loyalty;
    }
    delete general.忠诚;
    stats.generalLoyalty++;
    changed = true;
  }
  return changed;
}

function migrateHistoryTypes(data, stats) {
  const history = _.get(data, '个人史记.大事记');
  if (!history || typeof history !== 'object') return false;
  let changed = false;
  for (const event of Object.values(history)) {
    if (!event || typeof event !== 'object' || HISTORY_TYPES.has(event.类型)) continue;
    // 1.4 的“恶行”“其他”没有一一对应的新分类，统一归入最宽泛的“军政”。
    event.类型 = '军政';
    stats.historyType++;
    changed = true;
  }
  return changed;
}

function migrateMapOwnership(data, stats) {
  const regions = _.get(data, '天下地图.地区态势');
  if (!regions || typeof regions !== 'object') return false;
  let changed = false;
  for (const [regionName, region] of Object.entries(regions)) {
    if (!region || typeof region !== 'object') continue;
    const current = region.实控阵营;
    const normalized = normalizeMapCamp(current);
    let target = normalized;
    if (!current || normalized === '未知') {
      target = inferLegacyMapCamp(region.实控势力, data, regionName);
    }
    if (target !== '未知' && current !== target) {
      region.实控阵营 = target;
      stats.mapOwnership++;
      changed = true;
    }
  }
  return changed;
}

function migrateReproductiveData(data, stats) {
  const women = _.get(data, '人际网络.私帷');
  if (!women || typeof women !== 'object') return false;
  let changed = false;
  for (const woman of Object.values(women)) {
    const fertility = woman?.生育;
    if (!fertility || fertility._预产天数 || fertility.状态 !== '已孕' || !fertility.预产期) continue;
    const parsed = Number(String(fertility.预产期).match(/第(\d+)日/)?.[1] || 0);
    if (parsed <= 0) continue;
    fertility._预产天数 = parsed;
    stats.reproductive++;
    changed = true;
  }
  return changed;
}

function inferEquipmentLayout(camp) {
  const text = `${camp?.兵种 || ''} ${camp?.装备 || ''}`;
  if (/[骑马骆驼]/.test(text)) {
    return { 主战兵器: '马刀', 远射兵器: '骑弓', 防具: '轻甲', 火器: '无', 坐骑: '战马', 齐备率: 55, 完好率: 70 };
  }
  if (/[火器鸟铳铳炮车营]/.test(text)) {
    return { 主战兵器: '腰刀', 远射兵器: '鸟铳', 防具: '棉甲', 火器: '鸟铳', 坐骑: '无', 齐备率: 50, 完好率: 65 };
  }
  if (/[水师船舟]/.test(text)) {
    return { 主战兵器: '腰刀', 远射兵器: '弓弩', 防具: '棉甲', 火器: '火铳', 坐骑: '战船', 齐备率: 55, 完好率: 65 };
  }
  return { 主战兵器: '长枪', 远射兵器: '弓箭', 防具: '棉甲', 火器: '无', 坐骑: '无', 齐备率: 45, 完好率: 70 };
}

function migrateMilitaryOperations(data, stats) {
  let changed = false;
  if (!data.军事 || typeof data.军事 !== 'object') data.军事 = {};
  if (!data.军事.军令 || typeof data.军事.军令 !== 'object') {
    data.军事.军令 = {};
    changed = true;
  }
  if (!Array.isArray(data.军事.军令记录)) {
    data.军事.军令记录 = [];
    changed = true;
  }
  for (const camp of Object.values(data.军事.各营 || {})) {
    if (!camp || typeof camp !== 'object') continue;
    const defaults = { 状态: '待命', 疲劳: 0, 伤兵: 0, 欠饷月数: 0, 缺粮天数: 0 };
    for (const [key, value] of Object.entries(defaults)) {
      if (camp[key] != null) continue;
      camp[key] = value;
      changed = true;
    }
    if (!camp.装备编制 || typeof camp.装备编制 !== 'object') {
      camp.装备编制 = inferEquipmentLayout(camp);
      changed = true;
    }
    if (!camp.军务记录 || typeof camp.军务记录 !== 'object') {
      camp.军务记录 = { 上次犒赏: '', 犒赏月份: '', 本月犒赏次数: 0 };
      changed = true;
    }
  }
  if (!data.经济 || typeof data.经济 !== 'object') data.经济 = {};
  for (const obsoleteKey of ['流水', '粮秣流水']) {
    if (Object.hasOwn(data.经济, obsoleteKey)) {
      delete data.经济[obsoleteKey];
      changed = true;
    }
  }
  for (const person of Object.values(data.人际网络?.私帷 || {})) {
    if (!person?.生育 || typeof person.生育 !== 'object') continue;
    if (person.生育.是否处女 == null) {
      person.生育.是否处女 = true;
      changed = true;
    }
    if (person.生育.同房次数 == null) {
      person.生育.同房次数 = 0;
      changed = true;
    }
  }
  if (changed) stats.militaryOperations++;
  return changed;
}

function migrateGregorianYear(data, stats) {
  const world = data.世界运转;
  if (!world || typeof world !== 'object') return false;
  const year = gregorianYearFromDate(world.当前日期);
  if (!year || world.公元年份 === year) return false;
  world.公元年份 = year;
  stats.gregorianYear++;
  return true;
}

function migrateTechnologyStatus(data, stats) {
  const changed = normalizeTechnologyCollection(data.科技);
  if (!changed) return false;
  stats.technologyStatus += changed;
  return true;
}

function migrateStatData(data, stats) {
  if (!data || typeof data !== 'object') return false;
  let changed = false;
  changed = migrateSituationKey(data, stats) || changed;
  changed = migrateInterpersonal(data, stats) || changed;
  changed = migrateLeanVariables(data, stats) || changed;
  changed = migrateGeneralLoyalty(data, stats) || changed;
  changed = migrateHistoryTypes(data, stats) || changed;
  changed = migrateMapOwnership(data, stats) || changed;
  changed = migrateReproductiveData(data, stats) || changed;
  changed = migrateMilitaryOperations(data, stats) || changed;
  changed = migrateGregorianYear(data, stats) || changed;
  changed = migrateTechnologyStatus(data, stats) || changed;
  return changed;
}

async function runLegacyMigrations() {
  if (typeof waitGlobalInitialized === 'function') await waitGlobalInitialized('Mvu');

  const chatVariables = getVariables({ type: 'chat' }) || {};
  if (Number(chatVariables[MIGRATION_MARKER]) >= MIGRATION_VERSION) return;

  const lastId = getLatestMessageId();
  const maxId = Number.isFinite(lastId) ? lastId : null;
  if (maxId == null || maxId < 0) return;

  const stats = {
    messages: 0,
    situation: 0,
    duty: 0,
    privateRelation: 0,
    privateLoyalty: 0,
    generalLoyalty: 0,
    historyType: 0,
    mapOwnership: 0,
    reproductive: 0,
    militaryOperations: 0,
    gregorianYear: 0,
    technologyStatus: 0,
    leanVariables: 0,
    failedMessages: 0,
  };

  for (let messageId = 0; messageId <= maxId; messageId++) {
    try {
      const variables = getVariables({ type: 'message', message_id: messageId });
      const data = _.get(variables, 'stat_data');
      if (!migrateStatData(data, stats)) continue;
      replaceVariables(variables, { type: 'message', message_id: messageId });
      stats.messages++;
    } catch (error) {
      stats.failedMessages++;
      console.warn(`[旧档兼容] 迁移第 ${messageId} 楼失败`, error);
    }
  }

  if (stats.failedMessages === 0) {
    insertOrAssignVariables({ [MIGRATION_MARKER]: MIGRATION_VERSION }, { type: 'chat' });
    if (stats.messages > 0) console.info('[旧档兼容] 迁移完成', stats);
  } else console.warn(`[旧档兼容] 有 ${stats.failedMessages} 个楼层迁移失败，将在下次加载时重试`, stats);
}

$(() => {
  runLegacyMigrations().catch(error => console.error('[旧档兼容] 迁移失败', error));
});
