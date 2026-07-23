const MIGRATION_VERSION = 1;
const MIGRATION_MARKER = '_残明余烬旧档迁移版本';

const INTERPERSONAL_CATEGORIES = ['上司', '故友与同僚', '下属与幕僚', '三教九流', '仇敌', '亲属', '私帷'];
const PRIVATE_RELATIONS = new Set(['妻', '妾', '通房', '红颜', '女眷']);
const HISTORY_TYPES = new Set(['军政', '经济', '人事', '外交', '战役', '建设', '技术', '家族']);
const MAP_CAMPS = new Set(['主角方', '明廷', '后金', '流寇', '地方中立', '未知']);
const MAP_CAMP_ALIASES = { 主角: '主角方', 明军: '明廷', 中立: '地方中立' };
const LOCAL_REGIONS = new Set([
  '漠北', '朝鲜', '日本', '东番', '安南', '暹罗', '澜沧·真腊', '吕宋',
  '爪哇', '乌思藏', '西域', '青海', '莫卧儿', '不丹', '尼婆罗', '澳洲',
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function migrateGeneralLoyalty(data, stats) {
  const generals = _.get(data, '军事.将领');
  if (!generals || typeof generals !== 'object') return false;
  let changed = false;

  for (const [name, general] of Object.entries(generals)) {
    if (!general || typeof general !== 'object' || general.忠诚 == null) continue;
    let record = findInterpersonalPerson(data, name);
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
        角色心声: '',
        是否在场: false,
      };
      record = findInterpersonalPerson(data, name);
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

function migrateStatData(data, stats) {
  if (!data || typeof data !== 'object') return false;
  let changed = false;
  changed = migrateSituationKey(data, stats) || changed;
  changed = migrateInterpersonal(data, stats) || changed;
  changed = migrateGeneralLoyalty(data, stats) || changed;
  changed = migrateHistoryTypes(data, stats) || changed;
  changed = migrateMapOwnership(data, stats) || changed;
  changed = migrateReproductiveData(data, stats) || changed;
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
  };

  for (let messageId = 0; messageId <= maxId; messageId++) {
    try {
      const variables = getVariables({ type: 'message', message_id: messageId });
      const data = _.get(variables, 'stat_data');
      if (!migrateStatData(data, stats)) continue;
      replaceVariables(variables, { type: 'message', message_id: messageId });
      stats.messages++;
    } catch (error) {
      console.warn(`[旧档兼容] 迁移第 ${messageId} 楼失败`, error);
    }
  }

  insertOrAssignVariables({ [MIGRATION_MARKER]: MIGRATION_VERSION }, { type: 'chat' });
  if (stats.messages > 0) console.info('[旧档兼容] 迁移完成', stats);
}

$(() => {
  runLegacyMigrations().catch(error => console.error('[旧档兼容] 迁移失败', error));
});
