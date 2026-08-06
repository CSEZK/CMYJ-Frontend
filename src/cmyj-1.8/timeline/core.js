const REIGNS = Object.freeze({
  崇祯: { code: 'CZ', offset: 1627 },
  弘光: { code: 'HG', offset: 1644 },
  隆武: { code: 'LW', offset: 1644 },
  绍武: { code: 'SW', offset: 1645 },
  永历: { code: 'YL', offset: 1646 },
  顺治: { code: 'SZ', offset: 1643 },
  监国鲁: { code: 'LJ', offset: 1645 },
  鲁监国: { code: 'LJ', offset: 1645 },
});
const REIGNS_BY_CODE = Object.fromEntries(Object.entries(REIGNS).map(([name, data]) => [data.code, { name, ...data }]));

function chineseNumber(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return NaN;
  if (/^\d+$/.test(raw)) return Number(raw);

  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const normalized = raw.replace(/^初/, '');
  if (normalized.startsWith('廿')) return 20 + (digits[normalized[1]] ?? 0);
  if (normalized.startsWith('卅')) return 30 + (digits[normalized[1]] ?? 0);
  if (normalized === '十') return 10;
  if (normalized.includes('十')) {
    const [tens, units] = normalized.split('十');
    return (tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0);
  }
  if ([...normalized].every(char => char in digits)) {
    return Number([...normalized].map(char => digits[char]).join(''));
  }
  return NaN;
}

function monthNumber(text) {
  const raw = String(text ?? '').replace(/^闰/, '');
  if (raw === '正') return 1;
  if (raw === '冬') return 11;
  if (raw === '腊') return 12;
  return chineseNumber(raw);
}

function toOrdinal({ gregorianYear, month, day }) {
  return (gregorianYear * 13 + month) * 31 + day;
}

export function parseTimelineDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // 仅兼容已经导入酒馆的旧版档案；新版档案与变量统一使用中文帝王纪年。
  const legacyCommonEra = raw.match(/^CE(\d{4})-(\d{1,2})-(\d{1,2})$/i);
  if (legacyCommonEra) {
    const [, gregorianYear, month, day] = legacyCommonEra;
    const parsed = {
      reign: '旧版公元兼容',
      year: Number(gregorianYear),
      gregorianYear: Number(gregorianYear),
      month: Number(month),
      day: Number(day),
      raw,
    };
    return { ...parsed, ordinal: toOrdinal(parsed) };
  }

  const legacyCompact = raw.match(/^(CZ|HG|LW|SW|YL|SZ|LJ)(\d{1,2})-(\d{1,2})-(\d{1,2})$/i);
  if (legacyCompact) {
    const [, code, year, month, day] = legacyCompact;
    const reign = REIGNS_BY_CODE[code.toUpperCase()];
    const parsed = {
      reign: reign.name,
      year: Number(year),
      gregorianYear: reign.offset + Number(year),
      month: Number(month),
      day: Number(day),
      raw,
    };
    return { ...parsed, ordinal: toOrdinal(parsed) };
  }

  const reignMatch = raw.match(/(崇祯|弘光|隆武|绍武|永历|顺治|监国鲁|鲁监国)([元一二两三四五六七八九十百〇零\d]+)年/);
  if (!reignMatch) return null;
  const reign = REIGNS[reignMatch[1]];
  const month = raw.match(/(闰?(?:正|冬|腊|[一二两三四五六七八九十〇零\d]+))月/);
  const day = month
    ? raw.slice((month.index ?? 0) + month[0].length).match(/(?:初)?([一二两三四五六七八九十廿卅〇零\d]+)/)
    : null;
  const parsed = {
    reign: reignMatch[1],
    year: chineseNumber(reignMatch[2] === '元' ? '一' : reignMatch[2]),
    month: monthNumber(month?.[1] ?? '正'),
    day: chineseNumber(day?.[1] ?? '一'),
    raw,
  };
  if (![parsed.year, parsed.month, parsed.day].every(Number.isFinite)) return null;
  parsed.gregorianYear = reign.offset + parsed.year;
  return { ...parsed, ordinal: toOrdinal(parsed) };
}

function eventDate(event, key, fallback) {
  return parseTimelineDate(event?.[key])?.ordinal ?? fallback;
}

function locationScore(event, location) {
  const current = String(location ?? '').replace(/\s+/g, '');
  if (!current) return 0;
  return (event?.地区 ?? []).some(region => {
    const name = String(region).replace(/\s+/g, '');
    return name && (current.includes(name) || name.includes(current));
  })
    ? 120
    : 0;
}

function rank(items, now, location) {
  return items.sort((left, right) => {
    const leftScore = Number(left.event?.重要度 ?? 1) * 100 + locationScore(left.event, location);
    const rightScore = Number(right.event?.重要度 ?? 1) * 100 + locationScore(right.event, location);
    return rightScore - leftScore || Math.abs(left.from - now) - Math.abs(right.from - now);
  });
}

export function selectTimelineEvents(archive, currentDate, options = {}) {
  const now = typeof currentDate === 'string' ? parseTimelineDate(currentDate) : currentDate;
  if (!now?.ordinal) return { current: [], aftermath: [], upcoming: [] };

  const root = archive?.残明历史档案 ?? archive;
  const events = Array.isArray(root?.事件) ? root.事件 : [];
  const previewDays = Number(options.previewDays ?? 40);
  const buckets = { current: [], aftermath: [], upcoming: [] };

  for (const event of events) {
    const from = eventDate(event, '起始', NaN);
    if (!Number.isFinite(from)) continue;
    const until = eventDate(event, '结束', from);
    const aftermathUntil = eventDate(event, '余波至', until);
    const item = { event, from, until, aftermathUntil };
    if (from <= now.ordinal && now.ordinal <= until) buckets.current.push(item);
    else if (until < now.ordinal && now.ordinal <= aftermathUntil) buckets.aftermath.push(item);
    else if (now.ordinal < from && from - now.ordinal <= previewDays) buckets.upcoming.push(item);
  }

  const location = options.location ?? '';
  return {
    current: rank(buckets.current, now.ordinal, location).slice(0, 3),
    aftermath: rank(buckets.aftermath, now.ordinal, location).slice(0, 2),
    upcoming: rank(buckets.upcoming, now.ordinal, location).slice(0, 1),
  };
}

function eventLine(item, upcoming = false) {
  const event = item.event;
  const fact = String(event?.事件 ?? '')
    .trim()
    .replace(/[。；;]+$/, '');
  const impact = String(event?.影响 ?? '')
    .trim()
    .replace(/[。；;]+$/, '');
  if (upcoming) return `- 若前提未变，可能出现：${fact}。可能影响：${impact}。`;
  return `- ${fact}${impact ? `；${impact}` : ''}。`;
}

export function buildTimelineInjection(archive, dateText, options = {}) {
  const selected = selectTimelineEvents(archive, dateText, options);
  const sections = [
    ['当前态势', selected.current],
    ['近期余波', selected.aftermath],
    ['临近节点', selected.upcoming],
  ].filter(([, items]) => items.length > 0);
  if (sections.length === 0) return '';

  const header = [
    `【历史态势参考｜${dateText}】`,
    '仅作未受干预时的默认走向；已确立剧情与变量优先，不得强拉回史实。模型知情不等于NPC知情，未来节点不得被人物无来源预知；远方事件须经驿递、文书或传闻延迟传入。',
  ];
  const limit = Number(options.maxChars ?? 460);
  let content = header.join('\n');

  for (const [title, items] of sections) {
    const lines = items.map(item => eventLine(item, title === '临近节点'));
    let sectionAdded = false;
    for (const line of lines) {
      const prefix = sectionAdded ? '\n' : `\n${title}：\n`;
      if ((content + prefix + line).length > limit) continue;
      content += prefix + line;
      sectionAdded = true;
    }
  }
  return content;
}
