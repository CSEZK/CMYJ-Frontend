import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loaderPath = path.join(root, 'dist', 'cmyj-1.6', 'loader', 'index.js');
const loader = await readFile(loaderPath, 'utf8');
const loaderSource = await readFile(path.join(root, 'src', 'cmyj-1.6', 'loader', 'index.js'), 'utf8');
const workshopSource = await readFile(path.join(root, 'src', 'cmyj-1.6', 'workshop', 'index.js'), 'utf8');
const statusbarSource = await readFile(path.join(root, 'src', 'cmyj-1.6', 'statusbar', 'index.js'), 'utf8');
const schemaSource = await readFile(path.join(root, 'src', 'cmyj-1.6', 'schema', 'index.js'), 'utf8');

assert.ok(loader.length > 300_000, '共享加载器未包含完整脚本集');
assert.match(loader, /CanmingWorkshop/);
assert.match(loader, /CanmingCharacterGenerator/);
assert.match(loader, /CanmingVariableEditor/);
assert.match(loader, /__CMYJRemoteScriptsV2/);
assert.doesNotMatch(loader, /CMYJ-Scripts/);
assert.match(loaderSource, /schema: \(\) => import\('\.\.\/schema\/index\.js'\)/);
assert.doesNotMatch(loaderSource, /^import '\.\.\/statusbar\/index\.js';/m);
assert.match(loaderSource, /await loadRole\(\)/);
assert.match(workshopSource, /canming-workshop-installs/);
assert.match(workshopSource, /data-repair-install/);
assert.match(workshopSource, /repairInstalledWork/);
assert.match(statusbarSource, /worldbookSignatures/);
assert.match(statusbarSource, /STATUSBAR_VERSION = '1\.6\.2'/);
assert.match(statusbarSource, /STATUSBAR_RUNTIME_KEY = '__CMYJStatusbarRuntimeV1'/);
assert.match(statusbarSource, /data\.经济\._自动结算月份 === closeYM/);
assert.match(statusbarSource, /data\.经济\._自动结算月份 = closeYM/);
assert.match(statusbarSource, /trackEventSubscription\(eventOn\(mvu\.events\.VARIABLE_UPDATE_ENDED/);
assert.match(schemaSource, /_自动结算月份: z\.string\(\)\.prefault\(''\)/);

console.info('共享加载器、安装快照修复和六个脚本模块均已接入。');
