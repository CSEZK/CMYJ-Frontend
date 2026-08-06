function cleanTechnologyText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[。；;]+$/, '');
}

function comparableTechnologyText(value) {
  return cleanTechnologyText(value).replace(/[\s，,。；;：:、]/g, '');
}

export function mergeTechnologyStatus(...values) {
  const parts = [];
  for (const value of values) {
    const text = cleanTechnologyText(value);
    const key = comparableTechnologyText(text);
    if (!key) continue;
    const containing = parts.findIndex(part => comparableTechnologyText(part).includes(key));
    if (containing >= 0) continue;
    const contained = parts.findIndex(part => key.includes(comparableTechnologyText(part)));
    if (contained >= 0) parts[contained] = text;
    else parts.push(text);
  }
  return parts.join('；');
}

export function normalizeTechnologyCollection(technologies) {
  if (!technologies || typeof technologies !== 'object' || Array.isArray(technologies)) return 0;
  let changed = 0;
  for (const technology of Object.values(technologies)) {
    if (!technology || typeof technology !== 'object' || Array.isArray(technology)) continue;
    const status = mergeTechnologyStatus(technology.现状, technology.描述, technology.效果);
    const hadLegacyFields = Object.hasOwn(technology, '描述') || Object.hasOwn(technology, '效果');
    if (technology.现状 !== status || hadLegacyFields) {
      technology.现状 = status;
      delete technology.描述;
      delete technology.效果;
      changed++;
    }
  }
  return changed;
}
