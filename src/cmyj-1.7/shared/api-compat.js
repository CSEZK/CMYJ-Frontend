export function isOfficialDeepSeekApi(customApi) {
  const apiUrl = String(customApi?.apiurl || '').trim();
  if (!apiUrl) return false;
  try {
    return new URL(apiUrl).hostname.toLowerCase() === 'api.deepseek.com';
  } catch {
    return /^https?:\/\/api\.deepseek\.com(?:[/:?#]|$)/i.test(apiUrl);
  }
}

export function shouldFallbackFromJsonSchema(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /\bbad request\b|(?:^|\D)400(?:\D|$)/i.test(message);
}

export function deepSeekJsonSchemaPrompt(schema) {
  const definition = schema?.value ?? schema;
  if (!definition || typeof definition !== 'object') return '';
  return [
    '',
    '',
    '【DeepSeek JSON 兼容模式】',
    '请只输出一个合法 JSON 对象，不要输出 Markdown、代码围栏、解释或对象以外的文字。',
    '输出必须满足以下 JSON Schema；所有 required 字段都必须存在：',
    JSON.stringify(definition, null, 2),
  ].join('\n');
}
