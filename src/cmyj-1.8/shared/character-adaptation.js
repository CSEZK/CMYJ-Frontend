export const CHARACTER_ADAPTATION_START = '<!-- CANMING_CHARACTER_ADAPTATION_START -->';
export const CHARACTER_ADAPTATION_END = '<!-- CANMING_CHARACTER_ADAPTATION_END -->';
export const CHARACTER_ADAPTATION_PATTERN =
  /(<!-- CANMING_CHARACTER_ADAPTATION_START -->)([\s\S]*?)(<!-- CANMING_CHARACTER_ADAPTATION_END -->)/;

const uniqueStrings = values => [
  ...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean)),
];

export function characterAdaptationEntryCandidates(adaptation) {
  const linked = uniqueStrings(adaptation?.personaEntries);
  const sfwLinked = linked.filter(name => /_SFW(?:（导入(?:\d+)?）)?$/i.test(name));
  return uniqueStrings([
    ...sfwLinked,
    `${String(adaptation?.character || '').trim()}_SFW`,
    String(adaptation?.character || '').trim(),
    ...linked,
  ]);
}

export function findCharacterAdaptationEntryIndex(entries, adaptation) {
  const list = Array.isArray(entries) ? entries : [];
  for (const candidate of characterAdaptationEntryCandidates(adaptation)) {
    const index = list.findIndex(entry => entry?.name === candidate);
    if (index >= 0) return index;
  }
  const character = String(adaptation?.character || '').trim();
  if (!character) return -1;
  const personaTag = `<角色设定:${character}_SFW>`;
  return list.findIndex(entry => String(entry?.content || '').includes(personaTag));
}

export function injectCharacterAdaptation(content, body) {
  const source = String(content || '');
  const match = source.match(CHARACTER_ADAPTATION_PATTERN);
  if (match)
    return {
      content: source.replace(CHARACTER_ADAPTATION_PATTERN, (_match, start, _previous, end) => `${start}${body}${end}`),
      backup: { mode: 'replaced', previousBlock: match[2] },
    };

  const separator = source && !source.endsWith('\n\n') ? (source.endsWith('\n') ? '\n' : '\n\n') : '';
  return {
    content: `${source}${separator}${CHARACTER_ADAPTATION_START}${body}${CHARACTER_ADAPTATION_END}`,
    backup: { mode: 'created', previousBlock: '', separator },
  };
}

export function restoreCharacterAdaptation(content, backup = {}) {
  const source = String(content || '');
  const match = source.match(CHARACTER_ADAPTATION_PATTERN);
  if (!match) return null;
  if (backup.mode !== 'created')
    return source.replace(
      CHARACTER_ADAPTATION_PATTERN,
      (_match, start, _current, end) => `${start}${String(backup.previousBlock || '')}${end}`,
    );

  const markerStart = match.index;
  let before = source.slice(0, markerStart);
  const after = source.slice(markerStart + match[0].length);
  const separator = String(backup.separator || '');
  if (separator && before.endsWith(separator)) before = before.slice(0, -separator.length);
  return `${before}${after}`;
}
