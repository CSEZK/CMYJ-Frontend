import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { shouldFallbackFromJsonSchema } from '../src/cmyj-1.7/shared/api-compat.js';

const fullSource = await readFile(new URL('../src/cmyj-1.7/world-engine/index.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/cmyj-1.7/world-engine/styles-integrated.raw', import.meta.url), 'utf8');
let source = fullSource;
source = source.slice(source.indexOf('(() =>'));
const end = source.lastIndexOf('})();');
source =
  source.slice(0, end) +
  'globalThis.__cweTest = { normalizeIncrementalResult, buildTransitionFromOperations, callWorldModel };\n' +
  source.slice(end);

const sandbox = {
  window: null,
  document: {},
  globalThis: null,
  console,
  structuredClone,
  crypto,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  $: () => {},
  compassSeal: '',
  ledgerStyles: '',
  faithfulStyles: '',
  integratedStyles: '',
  deepSeekJsonSchemaPrompt: () => '',
  isOfficialDeepSeekApi: () => false,
  shouldFallbackFromJsonSchema: () => false,
};
sandbox.window = sandbox;
sandbox.window.parent = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);

const { normalizeIncrementalResult, buildTransitionFromOperations, callWorldModel } = sandbox.__cweTest;
for (const key of ['type', 'operationType', 'operation_type', 'op', 'operation', 'action']) {
  const normalized = normalizeIncrementalResult(
    {
      schema_version: 2,
      base_revision: 0,
      operations: [{ [key]: 'summary.replace', value: '天下态势未变。' }],
      parallel_scenes: [],
    },
    0,
  );
  assert.equal(normalized.operations[0].type, 'summary.replace', `未兼容操作类型字段 ${key}`);
}

assert.throws(
  () =>
    normalizeIncrementalResult(
      {
        schema_version: 2,
        base_revision: 0,
        operations: [{ id: 'EV-1', value: {} }],
        parallel_scenes: [],
      },
      0,
    ),
  /operations 结构无效/,
);

const mixed = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 0,
    operations: [
      { op: 'summary.replace', value: '天下态势未变。' },
      { id: 'EV-1', value: {} },
    ],
    parallel_scenes: [],
  },
  0,
);
const transition = buildTransitionFromOperations(
  { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  mixed,
  {},
);
assert.equal(transition.operation_stats.accepted, 1);
assert.equal(transition.operation_stats.rejected, 1);
assert.match(transition.operation_stats.warnings[0], /缺少 type/);

const compatibleShapes = normalizeIncrementalResult(
  {
    schema_version: 2,
    base_revision: 0,
    operations: [
      { type: 'summary.replace', summary: '江北军情渐趋紧张。' },
      {
        type: 'fact.add',
        id: 'F-flat',
        content: '驿卒已经抵达桐城。',
        status: 'occurred',
        place: '桐城',
        visibility: '仅县衙知晓',
        confidence: 82,
        source: '本轮正文中驿卒当面交付文书',
      },
      {
        type: 'fact.add',
        id: 'F-nested',
        fact: {
          content: '县衙已经封存文书。',
          location: '桐城县衙',
          publicity: '内部知情',
          evidence: '本轮正文明确写出封存动作',
        },
      },
    ],
    parallel_scenes: [],
  },
  0,
);
assert.equal(compatibleShapes.operations[0].value, '江北军情渐趋紧张。');
assert.equal(compatibleShapes.operations[1].value.location, '桐城');
assert.equal(compatibleShapes.operations[1].value.publicity, '仅县衙知晓');
assert.equal(compatibleShapes.operations[1].value.confidence, 0.82);
assert.equal(compatibleShapes.operations[2].value.status, 'occurred');
assert.equal(compatibleShapes.operations[2].value.confidence, 0.8);
const compatibleTransition = buildTransitionFromOperations(
  { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  compatibleShapes,
  {},
);
assert.equal(compatibleTransition.operation_stats.accepted, 3);
assert.equal(compatibleTransition.operation_stats.rejected, 0);

let generationCalls = 0;
sandbox.generateRaw = async () => {
  generationCalls += 1;
  return generationCalls === 1
    ? {
        schema_version: 2,
        base_revision: 0,
        operations: [{ type: 'event.upsert', id: 'EV-1', value: {} }],
        parallel_scenes: [],
      }
    : {
        schema_version: 2,
        base_revision: 0,
        operations: [{ type: 'summary.replace', value: '天下态势未变。' }],
        parallel_scenes: [],
      };
};
const retried = await callWorldModel(
  {
    baseRevision: 0,
    canonicalState: { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  },
  'cwe-test',
);
assert.equal(generationCalls, 2);
assert.equal(retried.operations[0].type, 'summary.replace');

generationCalls = 0;
sandbox.generateRaw = async () => {
  generationCalls += 1;
  return {
    schema_version: 2,
    base_revision: 0,
    operations: [{ type: 'fact.add', id: 'F-incomplete', value: {} }],
    parallel_scenes: [
      {
        location: '安庆',
        time: '当夜',
        actors: ['驿卒'],
        action: '送信',
        body: '驿卒趁夜色将密信送入城中。',
      },
    ],
  };
};
const sceneFallback = await callWorldModel(
  {
    baseRevision: 0,
    canonicalState: { activeEvents: [], actors: [], intelPackets: [], hooks: [], facts: [] },
  },
  'cwe-scene-test',
);
assert.equal(generationCalls, 1);
assert.equal(sceneFallback.parallel_scenes.length, 1);

assert.match(fullSource, /data-action="dismiss-notice"/);
assert.match(fullSource, /action === 'dismiss-notice'/);
assert.match(styles, /\.cwe-notice-stack \.cwe-notice\s*\{[^}]*position: relative/s);
assert.match(styles, /\.cwe-notice-stack\s*\{[^}]*position: static/s);
assert.match(styles, /@media \(max-width: 820px\)\s*\{[\s\S]*?\.cwe-notice-stack\s*\{[^}]*gap: 8px/s);
assert.match(styles, /\.cwe-notice-close\s*\{[^}]*width: 34px/s);
for (const message of [
  '400 Bad Request',
  'HTTP 415 Unsupported Media Type: response_format',
  '422 Unprocessable Entity',
  'response_format json_schema is not supported',
  'invalid_request_error: structured output unavailable',
]) {
  assert.equal(shouldFallbackFromJsonSchema(new Error(message)), true, `未降级处理：${message}`);
}
assert.equal(shouldFallbackFromJsonSchema(new Error('401 Unauthorized')), false);
assert.equal(shouldFallbackFromJsonSchema(new Error('403 Forbidden')), false);

console.info('天下演化测试通过：操作形状兼容、旁线降级、混合操作、通知堆叠与关闭入口。');
