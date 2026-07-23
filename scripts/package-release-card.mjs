import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseDocument } from 'yaml';

const projectRoot = path.resolve(import.meta.dirname, '..');
const cardPath = path.resolve(
  projectRoot,
  '..',
  '角色卡',
  '残明余烬-1.7正式候选版',
  '残明余烬-1.7正式候选版.yaml',
);
const checkOnly = process.argv.includes('--check');
const remoteMode = process.argv.includes('--remote');
const remoteLoaderUrl = 'https://cmyj-frontend.pages.dev/cmyj-1.7/loader/index.js?v=1.7.3';
const scriptBundles = [
  ['变量结构', 'schema'],
  ['旧档兼容', 'legacy'],
  ['云端创意工坊', 'workshop'],
  ['状态栏', 'statusbar'],
  ['天下演化', 'world-engine'],
  ['万象生成器', 'generator'],
  ['开局生成器', 'scenario-generator'],
  ['变量修改器', 'variable-editor'],
];

function remoteWrapper(moduleName) {
  return [
    `import { boot } from '${remoteLoaderUrl}';`,
    '',
    `void boot('${moduleName}').catch(error => {`,
    `  console.error('[残明余烬 1.7] ${moduleName} 加载失败', error);`,
    '});',
  ].join('\n');
}

function productionBundle(moduleName) {
  const bundlePath = path.join(projectRoot, 'dist', 'cmyj-1.7', moduleName, 'index.js');
  if (!fs.existsSync(bundlePath)) throw new Error(`缺少正式构建：${bundlePath}`);
  const code = fs
    .readFileSync(bundlePath, 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/\n?\/\/# sourceMappingURL=.*?\s*$/u, '')
    .trim();
  if (!code) throw new Error(`正式构建为空：${bundlePath}`);
  if (/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/iu.test(code))
    throw new Error(`${moduleName} 的正式构建仍包含本地服务地址。`);
  return code;
}

function replaceScriptContent(source, scriptName, code, newline) {
  const sectionMarker = `      - 名称: ${scriptName}${newline}`;
  const sectionStart = source.indexOf(sectionMarker);
  if (sectionStart < 0) throw new Error(`角色卡没有注册脚本“${scriptName}”。`);
  const contentMarker = `        内容: |-${newline}`;
  const contentStart = source.indexOf(contentMarker, sectionStart);
  if (contentStart < 0) throw new Error(`脚本“${scriptName}”没有可替换的块内容。`);
  const bodyStart = contentStart + contentMarker.length;
  const exportMarker = `        导出时携带:${newline}`;
  const bodyEnd = source.indexOf(exportMarker, bodyStart);
  if (bodyEnd < 0) throw new Error(`脚本“${scriptName}”缺少“导出时携带”边界。`);
  const body = `${code
    .split('\n')
    .map(line => `          ${line}`)
    .join(newline)}${newline}`;
  return {
    source: `${source.slice(0, bodyStart)}${body}${source.slice(bodyEnd)}`,
    previousBody: source.slice(bodyStart, bodyEnd),
    expectedBody: body,
  };
}

if (!fs.existsSync(cardPath)) throw new Error(`找不到正式候选角色卡：${cardPath}`);

let yaml = fs.readFileSync(cardPath, 'utf8');
const newline = yaml.includes('\r\n') ? '\r\n' : '\n';
let changed = false;
const sizes = [];
for (const [scriptName, moduleName] of scriptBundles) {
  const code = remoteMode ? remoteWrapper(moduleName) : productionBundle(moduleName);
  const result = replaceScriptContent(yaml, scriptName, code, newline);
  if (result.previousBody !== result.expectedBody) changed = true;
  yaml = result.source;
  sizes.push(`${scriptName} ${(Buffer.byteLength(code) / 1024).toFixed(1)} KiB`);
}

if (/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/cmyj-1\.7/iu.test(yaml))
  throw new Error('正式候选角色卡仍包含本地脚本映射。');
const document = parseDocument(yaml);
if (document.errors.length)
  throw new Error(`嵌入脚本后的角色卡 YAML 无效：${document.errors.map(error => error.message).join('；')}`);

if (checkOnly) {
  if (changed) throw new Error(`正式候选角色卡脚本与当前${remoteMode ? '远程映射' : '正式构建'}不一致。`);
  console.info(`正式候选角色卡${remoteMode ? '远程映射' : '内嵌脚本'}校验通过：${sizes.join('，')}`);
} else {
  fs.writeFileSync(cardPath, yaml, 'utf8');
  console.info(
    `已将 ${scriptBundles.length} 个${remoteMode ? '正式远程映射写入' : '正式脚本嵌入'}候选卡；角色卡 YAML ${(Buffer.byteLength(yaml) / 1024).toFixed(1)} KiB。`,
  );
  console.info(sizes.join('，'));
}
