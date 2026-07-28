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
  if (/(?:^|\D)(?:401|403)(?:\D|$)|unauthorized|forbidden/i.test(message)) return false;
  return (
    /\bbad request\b|(?:^|\D)(?:400|415|422)(?:\D|$)/i.test(message) ||
    /(?:response[_ -]?format|json[_ -]?schema|structured output)[\s\S]{0,120}(?:unsupported|not supported|invalid|unavailable)/i.test(
      message,
    ) ||
    /invalid_request_error[\s\S]{0,160}(?:response[_ -]?format|json[_ -]?schema|structured output)/i.test(message)
  );
}

export function deepSeekJsonSchemaPrompt(schema) {
  const definition = schema?.value ?? schema?.schema ?? schema;
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
