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

function collectApiErrorDetails(error) {
  const values = [
    error?.message,
    error?.statusText,
    error?.response?.statusText,
    error?.response?.data?.error?.message,
    error?.response?.data?.message,
    error?.data?.error?.message,
    error?.data?.message,
    error?.cause?.message,
    typeof error === 'string' ? error : '',
  ];
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].join(' · ');
}

function apiErrorStatus(error, details) {
  const direct = [
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.response?.statusCode,
    error?.cause?.status,
  ]
    .map(Number)
    .find(status => Number.isInteger(status) && status >= 400 && status <= 599);
  if (direct) return direct;
  const numeric = details.match(/(?:^|\D)(4\d\d|5\d\d)(?:\D|$)/)?.[1];
  if (numeric) return Number(numeric);
  if (/\bpayment required\b|insufficient (?:balance|credit|quota)/i.test(details)) return 402;
  if (/\bunauthorized\b|invalid api key|authentication failed/i.test(details)) return 401;
  if (/\bforbidden\b|permission denied/i.test(details)) return 403;
  if (/\btoo many requests\b|rate.?limit/i.test(details)) return 429;
  if (/\bbad request\b/i.test(details)) return 400;
  return 0;
}

function originalErrorSuffix(details) {
  if (!details || /^(?:bad request|payment required|unauthorized|forbidden|too many requests)$/i.test(details)) return '';
  return ` 原始错误：${details.slice(0, 240)}`;
}

export function normalizeApiRequestError(error, options = {}) {
  const provider = String(options.provider || 'AI 接口').trim();
  const details = collectApiErrorDetails(error);
  const status = apiErrorStatus(error, details);
  const suffix = originalErrorSuffix(details);

  if (status === 401) return new Error(`${provider} 认证失败（HTTP 401）：API Key 无效、已撤销或填写错误。${suffix}`);
  if (status === 402)
    return new Error(`${provider} 余额不足或未开通计费（HTTP 402）：请充值、启用计费或更换有额度的 API Key。${suffix}`);
  if (status === 403) return new Error(`${provider} 拒绝访问（HTTP 403）：当前 API Key 没有该模型或接口权限。${suffix}`);
  if (status === 404)
    return new Error(`${provider} 接口或模型不存在（HTTP 404）：请检查 API 地址与模型名称。${suffix}`);
  if (status === 408) return new Error(`${provider} 请求超时（HTTP 408）：请稍后重试或检查网络连接。${suffix}`);
  if (status === 413)
    return new Error(`${provider} 拒绝了过大的请求（HTTP 413）：请减少参考世界书、提示词或生成内容。${suffix}`);
  if (status === 429)
    return new Error(`${provider} 请求过于频繁或额度触顶（HTTP 429）：请等待限流恢复或检查账户配额。${suffix}`);
  if ([500, 502, 503, 504].includes(status))
    return new Error(`${provider} 服务暂时不可用（HTTP ${status}）：这是上游服务故障，请稍后重试。${suffix}`);

  if (/model[\s\S]{0,80}(?:not found|does not exist|invalid|unavailable)|unknown model/i.test(details)) {
    return new Error(`${provider} 不接受当前模型名称：请重新拉取模型列表并选择可用模型。${suffix}`);
  }
  if (/context length|maximum context|too many tokens|token limit|prompt is too long/i.test(details)) {
    return new Error(`${provider} 上下文超限：请减少参考世界书或提示词长度。${suffix}`);
  }
  if (/response[_ -]?format|json[_ -]?schema|structured output/i.test(details)) {
    return new Error(`${provider} 不支持当前结构化输出格式：请更换兼容模型或接口协议。${suffix}`);
  }
  if (status === 400) {
    return new Error(
      `${provider} 拒绝了请求（HTTP 400）：请检查模型名称、接口协议、参数范围和提示词长度。${suffix}`,
    );
  }
  if (/failed to fetch|network error|networkerror|econnreset|econnrefused|socket hang up/i.test(details)) {
    return new Error(`${provider} 网络连接失败：请检查 API 地址、代理和网络连接。${suffix}`);
  }
  if (!details || /^(?:error:\s*)?<none>$/i.test(details)) {
    return new Error(`${provider} 请求失败，但酒馆助手没有返回具体错误信息；请查看酒馆控制台或服务端日志。`);
  }
  return error instanceof Error ? error : new Error(details);
}

export function shouldRetryApiRequest(error) {
  const details = collectApiErrorDetails(error);
  const status = apiErrorStatus(error, details);
  if (status >= 400 && status < 500) return false;
  if (/model[\s\S]{0,80}(?:not found|does not exist|invalid|unavailable)|unknown model/i.test(details)) return false;
  if (/context length|maximum context|too many tokens|token limit|prompt is too long/i.test(details)) return false;
  if (/response[_ -]?format|json[_ -]?schema|structured output/i.test(details)) return false;
  return true;
}

export function jsonSchemaCompatibilityPrompt(schema, label = 'JSON 兼容模式') {
  const definition = schema?.value ?? schema?.schema ?? schema;
  if (!definition || typeof definition !== 'object') return '';
  return [
    '',
    '',
    `【${label}】`,
    '请只输出一个合法 JSON 对象，不要输出 Markdown、代码围栏、解释或对象以外的文字。',
    '输出必须满足以下 JSON Schema；所有 required 字段都必须存在：',
    JSON.stringify(definition, null, 2),
  ].join('\n');
}

export function deepSeekJsonSchemaPrompt(schema) {
  return jsonSchemaCompatibilityPrompt(schema, 'DeepSeek JSON 兼容模式');
}
