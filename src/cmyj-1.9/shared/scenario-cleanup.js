function normalizeWorldbookValue(value) {
  if (Array.isArray(value)) return value.map(normalizeWorldbookValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .filter(key => key !== 'uid')
        .sort()
        .map(key => [key, normalizeWorldbookValue(value[key])]),
    );
  return value;
}

export function scenarioWorldbookSignature(entry) {
  return JSON.stringify(normalizeWorldbookValue(entry));
}

export function planScenarioWorldbookCleanup(currentEntries, installed = {}) {
  const current = Array.isArray(currentEntries) ? currentEntries : [];
  const installedNames = new Set((installed.worldbookEntries || []).filter(Boolean));
  const signatures = installed.worldbookEntrySignatures || {};
  const removableNames = new Set();

  for (const entry of current) {
    const name = entry?.name;
    if (!name || !installedNames.has(name)) continue;
    const expected = signatures[name];
    if (!expected || scenarioWorldbookSignature(entry) === expected) removableNames.add(name);
  }

  const entries = current.filter(entry => !removableNames.has(entry?.name));
  for (const backup of [...(installed.worldbookEntryBackups || [])].sort(
    (left, right) => Number(left?.index || 0) - Number(right?.index || 0),
  )) {
    const name = backup?.entry?.name;
    if (!name || !removableNames.has(name) || entries.some(entry => entry?.name === name)) continue;
    entries.splice(Math.min(Math.max(Number(backup.index) || 0, 0), entries.length), 0, backup.entry);
  }

  return {
    entries,
    removedNames: [...removableNames],
    skippedNames: [...installedNames].filter(name => !removableNames.has(name)),
  };
}

export function hasScenarioOpeningMessages(messages, installed = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const openingIds = (installed.context?.openings || []).map(opening => String(opening?.id || '').trim()).filter(Boolean);
  if (!openingIds.length) {
    const originalCount = Array.isArray(installed.originalFirstMessages) ? installed.originalFirstMessages.length : 0;
    return originalCount > 0 && list.length > originalCount;
  }
  return list.some(message => {
    const text = String(message || '');
    return openingIds.some(id => {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`_开场标识\\s*:\\s*['\"]?${escaped}(?:['\"\\s]|$)`).test(text);
    });
  });
}
