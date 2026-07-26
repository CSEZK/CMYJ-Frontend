const uniqueStrings = values => [
  ...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean)),
];

function personaNames(entry) {
  const content = String(entry?.content || '');
  const names = [];
  for (const match of content.matchAll(/<角色设定:([^>\r\n]+?)_SFW>/gi)) names.push(match[1].trim());
  const entryName = String(entry?.name || '').trim();
  const nameMatch = entryName.match(/^(.+?)_SFW(?:（导入(?:\d+)?）)?$/i);
  if (nameMatch) names.push(nameMatch[1].trim());
  return uniqueStrings(names);
}

export function buildScenarioCharacterCatalog({
  officialCharacters = [],
  profiles = [],
  worldbookEntries = [],
  projectCharacters = {},
} = {}) {
  const catalog = [];
  const byName = new Map();

  const upsert = (raw, source, fallbackSummary) => {
    const name = String(raw?.name || '').trim();
    if (!name) return null;
    const summary = String(raw?.summary || raw?.title || fallbackSummary || '').trim();
    const worldbookNames = uniqueStrings(raw?.worldbookEntries || raw?.personaEntries);
    const aliases = uniqueStrings(raw?.aliases);
    const current = byName.get(name);
    if (current) {
      current.worldbookEntries = uniqueStrings([...current.worldbookEntries, ...worldbookNames]);
      current.aliases = uniqueStrings([...current.aliases, ...aliases]);
      if (!current.summary && summary) current.summary = summary;
      return current;
    }
    const character = {
      name,
      summary: summary || '当前角色卡中的扩展人物',
      lock: raw?.lock || (source === 'official' ? 'free' : 'custom'),
      source: raw?.source || source,
      aliases,
      worldbookEntries: worldbookNames,
    };
    catalog.push(character);
    byName.set(name, character);
    return character;
  };

  for (const character of officialCharacters) upsert(character, 'official', '');
  for (const profile of Array.isArray(profiles) ? profiles : [])
    upsert(profile, 'profile', '角色与立绘管理器中的扩展人物');

  for (const entry of Array.isArray(worldbookEntries) ? worldbookEntries : []) {
    for (const name of personaNames(entry)) {
      const character = upsert({ name, worldbookEntries: [entry.name] }, 'worldbook', '当前角色卡世界书中的完整人设');
      if (character)
        character.worldbookEntries = uniqueStrings([...character.worldbookEntries, String(entry.name || '').trim()]);
    }
  }

  for (const [name, state] of Object.entries(
    projectCharacters && typeof projectCharacters === 'object' ? projectCharacters : {},
  ))
    upsert(
      {
        name,
        summary: state?.identity || state?.summary,
        personaEntries: state?.personaEntries,
      },
      'project',
      '工程中保留的扩展人物',
    );

  return catalog;
}
