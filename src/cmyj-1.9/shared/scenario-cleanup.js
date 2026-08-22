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

function cloneWorldbookValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function matchesLegacyInstalledSignature(entry, expectedSignature) {
  if (!expectedSignature) return true;
  if (scenarioWorldbookSignature(entry) === expectedSignature) return true;

  // 酒馆保存世界书时会补齐默认字段，所以安装前针对资源对象生成的完整签名
  // 无法与落盘后的条目完全一致。旧安装记录只能退回到名称 + 内容校验；至少
  // 能区分 DLC 自己写入的条目和用户后来改写过的同名条目。
  try {
    const expected = JSON.parse(expectedSignature);
    return expected?.name === entry?.name && String(expected?.content || '') === String(entry?.content || '');
  } catch {
    return false;
  }
}

export function createScenarioWorldbookRestorePlan(entries, affectedNames) {
  const current = Array.isArray(entries) ? entries : [];
  const names = [...new Set((affectedNames || []).map(name => String(name || '').trim()).filter(Boolean))];
  const affected = new Set(names);
  return {
    version: 1,
    names,
    snapshots: current
      .map((entry, index) => ({ entry, index }))
      .filter(item => affected.has(item.entry?.name))
      .map(cloneWorldbookValue),
  };
}

export function applyScenarioWorldbookRestorePlan(currentEntries, plan) {
  const current = Array.isArray(currentEntries) ? currentEntries : [];
  const names = new Set((plan?.names || []).filter(Boolean));
  if (!names.size) return cloneWorldbookValue(current);

  const restored = current.filter(entry => !names.has(entry?.name)).map(cloneWorldbookValue);
  const snapshots = [...(plan?.snapshots || [])]
    .filter(item => item?.entry?.name && names.has(item.entry.name))
    .sort((left, right) => Number(left?.index || 0) - Number(right?.index || 0));
  for (const snapshot of snapshots) {
    const index = Math.min(Math.max(Number(snapshot.index) || 0, 0), restored.length);
    restored.splice(index, 0, cloneWorldbookValue(snapshot.entry));
  }
  return restored;
}

export function verifyScenarioWorldbookRestorePlan(entries, plan) {
  const current = Array.isArray(entries) ? entries : [];
  const names = [...new Set((plan?.names || []).filter(Boolean))];
  const snapshots = plan?.snapshots || [];
  const issues = [];

  for (const name of names) {
    const expected = snapshots.filter(item => item?.entry?.name === name);
    const actual = current.map((entry, index) => ({ entry, index })).filter(item => item.entry?.name === name);
    if (actual.length !== expected.length) {
      issues.push(`${name}（应有 ${expected.length} 条，实际 ${actual.length} 条）`);
      continue;
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (scenarioWorldbookSignature(actual[index].entry) !== scenarioWorldbookSignature(expected[index].entry)) {
        issues.push(`${name}（内容或设置未恢复）`);
        break;
      }
      if (actual[index].index !== Number(expected[index].index)) {
        issues.push(`${name}（顺序未恢复）`);
        break;
      }
    }
  }

  return { ok: issues.length === 0, issues };
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
    if (matchesLegacyInstalledSignature(entry, expected)) removableNames.add(name);
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
  const openingIds = (installed.context?.openings || [])
    .map(opening => String(opening?.id || '').trim())
    .filter(Boolean);
  if (!openingIds.length) {
    const originalCount = Array.isArray(installed.originalFirstMessages) ? installed.originalFirstMessages.length : 0;
    return originalCount > 0 && list.length > originalCount;
  }
  return list.some(message => {
    const text = String(message || '');
    return openingIds.some(id => {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`_开场标识\\s*:\\s*['"]?${escaped}(?:['"\\s]|$)`).test(text);
    });
  });
}
