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
const betaLoader = await readFile(path.join(root, 'dist', 'cmyj-1.7-beta', 'loader', 'index.js'), 'utf8');
const betaWorkshopSource = await readFile(path.join(root, 'src', 'cmyj-1.7-beta', 'workshop', 'index.js'), 'utf8');
const betaStatusbarSource = await readFile(path.join(root, 'src', 'cmyj-1.7-beta', 'statusbar', 'index.js'), 'utf8');
const betaScenarioSource = await readFile(
  path.join(root, 'src', 'cmyj-1.7-beta', 'scenario-generator', 'index.js'),
  'utf8',
);
const releaseLoader = await readFile(path.join(root, 'dist', 'cmyj-1.7', 'loader', 'index.js'), 'utf8');
const releaseWorkshopSource = await readFile(path.join(root, 'src', 'cmyj-1.7', 'workshop', 'index.js'), 'utf8');
const releaseStatusbarSource = await readFile(path.join(root, 'src', 'cmyj-1.7', 'statusbar', 'index.js'), 'utf8');
const releaseMapOverviewSource = await readFile(path.join(root, 'assets', 'maps', 'world_1634_overview.js'), 'utf8');
const releaseScenarioSource = await readFile(
  path.join(root, 'src', 'cmyj-1.7', 'scenario-generator', 'index.js'),
  'utf8',
);
const releaseGeneratorSource = await readFile(path.join(root, 'src', 'cmyj-1.7', 'generator', 'index.js'), 'utf8');
const releaseWorldEngineSource = await readFile(path.join(root, 'src', 'cmyj-1.7', 'world-engine', 'index.js'), 'utf8');
const releaseWorldEngineStyle = await readFile(
  path.join(root, 'src', 'cmyj-1.7', 'world-engine', 'styles-integrated.raw'),
  'utf8',
);
const releaseSchemaSource = await readFile(path.join(root, 'src', 'cmyj-1.7', 'schema', 'definition.js'), 'utf8');
const originalTongchengAdaptations = JSON.parse(
  await readFile(
    path.join(root, 'src', 'cmyj-1.7-beta', 'statusbar', 'original-tongcheng-character-adaptations.json'),
    'utf8',
  ),
);

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
assert.match(workshopSource, /k==='scenario'\?'身份 DLC'/);
assert.match(workshopSource, /身份 DLC 需要《残明余烬》1\.7/);

assert.ok(betaLoader.length > 300_000, 'DLC 测试版共享加载器未包含完整脚本集');
assert.match(betaLoader, /__CMYJRemoteScriptsV17Beta/);
assert.match(betaLoader, /CanmingWorkshop/);
assert.match(betaWorkshopSource, /https:\/\/cm-yj-workshop-staging\.canming-cloud\.workers\.dev/);
assert.doesNotMatch(betaWorkshopSource, /const API='https:\/\/cm-yj-workshop\.canming-cloud\.workers\.dev'/);
assert.match(betaStatusbarSource, /https:\/\/cm-yj-workshop-staging\.canming-cloud\.workers\.dev/);
assert.doesNotMatch(
  betaStatusbarSource,
  /const WORKSHOP_API = 'https:\/\/cm-yj-workshop\.canming-cloud\.workers\.dev'/,
);
assert.match(betaWorkshopSource, /scenario:\['身份 DLC'/);
assert.match(betaWorkshopSource, /canming-workshop-staging:installs-v1/);
assert.match(betaWorkshopSource, /importScenarioPackage/);
assert.match(betaWorkshopSource, /resource\.kind==='scenario'\)await o\.bridge\.importScenarioPackage/);
assert.match(betaWorkshopSource, /IDENTITY INSTALLED/);
assert.match(betaWorkshopSource, /data-scenario-file/);
assert.match(betaWorkshopSource, /scenarioPackageSummary/);
assert.match(betaWorkshopSource, /forgetScenarioInstall/);
assert.match(betaWorkshopSource, /view==='scenarios'/);
assert.match(betaWorkshopSource, /游玩必备/);
assert.match(betaStatusbarSource, /STATUSBAR_VERSION = '1\.7\.0-beta\.13'/);
assert.match(betaWorkshopSource, /DLC 人物志最多包含 60 人/);
assert.match(betaWorkshopSource, /自定义立绘资料为空/);
assert.match(betaScenarioSource, /portraitProfiles: \[\]/);
assert.match(betaStatusbarSource, /const enabled = true/);
assert.match(betaLoader, /CanmingScenarioGenerator/);
assert.match(betaStatusbarSource, /openScenarioGenerator/);
assert.match(betaStatusbarSource, /CanmingStatusbarActions/);
assert.match(betaStatusbarSource, /installOriginalScenario/);
assert.match(betaStatusbarSource, /uninstallCurrentScenario/);
assert.match(betaStatusbarSource, /getInstalledScenarioInfo/);
assert.match(betaStatusbarSource, /worldbookEntryBackups/);
assert.match(betaStatusbarSource, /BUILTIN_TONGCHENG_OPENINGS/);
assert.match(betaStatusbarSource, /class="cm-tools-item">\$\{scenarioGeneratorIcon\(\)\} 开局生成器/);
assert.match(betaStatusbarSource, /scenarioGeneratorRoot\?\.remove\(\)/);
assert.match(betaScenarioSource, /sg-roster-workspace/);
assert.match(betaScenarioSource, /data-character-config/);
assert.match(betaScenarioSource, /setCharacterIncluded/);
assert.match(betaScenarioSource, /sg-choice-box/);
assert.match(betaScenarioSource, /opening\.targetWords/);
assert.match(betaScenarioSource, /selectedReferenceContext/);
assert.match(betaScenarioSource, /data-reference-worldbook-select/);
assert.match(betaScenarioSource, /data-action="open-api-settings"/);
assert.match(betaScenarioSource, /canming-dlc-staging:generator:api/);
assert.match(betaScenarioSource, /\[hidden\]\{display:none!important\}/);
assert.match(betaScenarioSource, /data-scene-summary/);
assert.match(betaScenarioSource, /--radius-shell:20px/);
assert.match(betaScenarioSource, /previousCatalogScroll/);
assert.match(betaScenarioSource, /function protagonistIdentityContent\(\)/);
assert.match(betaScenarioSource, /identityPreviewItem\('公开身份', 'identity'\)/);
assert.match(betaScenarioSource, /写入世界书/);
assert.match(betaScenarioSource, /IDENTITY_ENTRY_NAME = '\[scenario\]<user>身份'/);
assert.match(betaScenarioSource, /function generateProtagonistProfile\(\)/);
assert.match(betaScenarioSource, /data-action="ai-protagonist"/);
assert.match(betaScenarioSource, /protagonist\.identityBoundaries/);
assert.match(betaScenarioSource, /entry\(IDENTITY_ENTRY_NAME, identityContent/);
assert.match(betaStatusbarSource, /staleInstalledWorldbookNames/);
assert.match(betaWorkshopSource, /data-a="scenario-create"/);
assert.match(betaWorkshopSource, /initialBundle/);
assert.match(betaStatusbarSource, /importScenarioWorkshopPackage/);
assert.match(betaStatusbarSource, /writeActiveDlcContext/);
assert.match(betaStatusbarSource, /reloadAfterScenarioInstall/);
assert.match(betaStatusbarSource, /DLC_RELATIONSHIP_GRAPH/);
assert.match(betaStatusbarSource, /CHARACTER_ADAPTATION_PATTERN/);
assert.match(betaStatusbarSource, /applyScenarioCharacterAdaptations/);
assert.match(betaStatusbarSource, /restoreScenarioCharacterAdaptations/);
assert.match(betaStatusbarSource, /resource\.characterAdaptations/);
assert.match(betaStatusbarSource, /resource\.characterOverviews/);
assert.match(betaStatusbarSource, /characterOverviewVersion/);
assert.match(await readFile(path.join(root, 'src', 'cmyj-1.7-beta', 'schema', 'definition.js'), 'utf8'), /_开场标识/);
assert.match(betaStatusbarSource, /身份与关系:/);
assert.match(betaStatusbarSource, /与<user>的过往/);
assert.match(betaStatusbarSource, /角色称呼<user>/);
assert.match(betaStatusbarSource, /与其他人物/);
assert.match(betaStatusbarSource, /演绎要点/);
assert.match(betaStatusbarSource, /getAllPortraitData/);
assert.match(betaStatusbarSource, /SCENARIO_REPLACE_CANCELLED/);
assert.doesNotMatch(betaStatusbarSource, /target: '苏晚棠', label: '母子'/);
assert.equal(originalTongchengAdaptations.length, 19);
for (const adaptation of originalTongchengAdaptations) {
  assert.ok(adaptation.longTermSituation, `${adaptation.character} 缺少原版长期处境`);
  assert.ok(adaptation.adaptationPrinciples?.length >= 3, `${adaptation.character} 缺少关键经历演绎要点`);
  assert.doesNotMatch(JSON.stringify(adaptation), /(?<!<)\buser\b(?!>)/);
}
const experienceAnchors = {
  苏晚棠: '桂花糕',
  苏晚月: '雪夜',
  栖云: '拉住妹妹',
  栖月: '木梳',
  赵砚: '扫院子',
  林知夏: '绝食三日',
  周氏: '像畜生',
  沈大柱: '桌角放糖',
  柳氏: '旧诗集',
  沈清晏: '第一个安字',
  常彪: '铁尺',
  顾明远: '大明律',
  翠儿: '第三碗',
  安娜: '澎湖风浪',
  白瑶: '摁进水缸',
  洪天妹: '田契漏洞',
  陆挽星: '屠庄夜里',
  温素弦: '你要的是人不是尸',
  方子衿: '西洋螺丝刀',
};
for (const [name, anchor] of Object.entries(experienceAnchors)) {
  const adaptation = originalTongchengAdaptations.find(item => item.character === name);
  assert.match(JSON.stringify(adaptation), new RegExp(anchor), `${name} 缺少正式版关键经历「${anchor}」`);
}

assert.ok(releaseLoader.length > 300_000, '1.7 正式版共享加载器未包含完整脚本集');
assert.match(releaseLoader, /__CMYJRemoteScriptsV17/);
assert.doesNotMatch(releaseLoader, /__CMYJRemoteScriptsV17Beta/);
assert.match(releaseStatusbarSource, /STATUSBAR_VERSION = '1\.7\.6'/);
assert.match(releaseStatusbarSource, /CMYJ-Frontend@main\/assets\/maps\/world_1634\.js/);
assert.match(releaseStatusbarSource, /CMYJ-Frontend@main\/assets\/maps\/world_1634_overview\.js/);
assert.match(releaseStatusbarSource, /east_asia_1634_provinces/);
assert.doesNotMatch(releaseStatusbarSource, /GooYi-C\/History@main\/world_1629\.js/);
const releaseMapOverview = JSON.parse(
  releaseMapOverviewSource.replace(/^var WORLD_1634_OVERVIEW=/, '').replace(/;\s*$/, ''),
);
const releaseMapNames = new Set(releaseMapOverview.features.map(feature => feature.properties.name));
assert.ok(releaseMapNames.has('莫卧儿'), '正式版地图缺少莫卧儿');
assert.ok(releaseMapNames.has('澳洲'), '正式版地图缺少澳洲');
for (const feature of releaseMapOverview.features) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  assert.ok(
    polygons.every(polygon => polygon.length === 1),
    `${feature.properties.name} 仍有概览伪内环`,
  );
}
assert.match(releaseWorkshopSource, /const API='https:\/\/cm-yj-workshop\.canming-cloud\.workers\.dev'/);
assert.match(releaseWorkshopSource, /TK='canming-workshop:token'/);
assert.match(releaseWorkshopSource, /UK='canming-workshop:user'/);
assert.match(releaseWorkshopSource, /INSTALLS_KEY='canming-workshop:installs-v1'/);
assert.match(releaseStatusbarSource, /WORKSHOP_TOKEN_KEY = 'canming-workshop:token'/);
assert.match(releaseStatusbarSource, /ACTIVE_DLC_STORAGE_PREFIX = 'canming-dlc:active-scenario-v1:'/);
assert.match(releaseStatusbarSource, /const FORMAL_WORLDBOOK_NAME = '残明余烬1\.7'/);
assert.match(releaseStatusbarSource, /async function bindFormalWorldbook\(\)/);
assert.match(releaseStatusbarSource, /rebindCharWorldbooks/);
assert.match(releaseStatusbarSource, /data\.是否处女 === false \? '非处女' : '处女'/);
assert.match(releaseStatusbarSource, /data\.同房次数/);
assert.match(releaseSchemaSource, /是否处女: z\.boolean\(\)\.prefault\(true\)/);
assert.match(releaseSchemaSource, /同房次数: z\.coerce/);
assert.match(releaseSchemaSource, /Math\.max\(0, Math\.trunc\(v\)\)/);
assert.match(releaseScenarioSource, /是否处女: true/);
assert.match(releaseScenarioSource, /同房次数: 0/);
assert.match(
  releaseStatusbarSource,
  /rebindWorldbooks\('current', \{ primary: FORMAL_WORLDBOOK_NAME, additional: \[\] \}\)/,
);
assert.doesNotMatch(releaseStatusbarSource, /additional\.push\(binding\.primary\)/);
assert.match(releaseStatusbarSource, /await bindFormalWorldbook\(\)/);
assert.match(releaseStatusbarSource, /自动校正单主世界书失败/);
assert.match(releaseGeneratorSource, /STORAGE_KEY_API = 'canming-gen-api-cfg'/);
assert.match(releaseScenarioSource, /API_SETTINGS_KEY = 'canming-gen-api-cfg'/);
assert.match(releaseScenarioSource, /minBaseVersion: '1\.7\.0'/);
assert.match(releaseWorldEngineSource, /VERSION = '1\.1\.0'/);
assert.match(releaseWorldEngineSource, /settingsVersion: 3/);
assert.match(releaseWorldEngineSource, /temperature: 1/);
assert.match(releaseWorldEngineSource, /maxTokens: 10000/);
assert.match(releaseWorldEngineSource, /cmyj_world_engine_increment_v2/);
assert.match(releaseWorldEngineSource, /buildTransitionFromOperations/);
assert.match(releaseWorldEngineSource, /renderParallelWorld/);
assert.match(releaseWorldEngineSource, /queuedProcess/);
assert.doesNotMatch(releaseWorldEngineSource, /setChatMessages/);
assert.match(releaseWorldEngineStyle, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
assert.doesNotMatch(
  releaseWorldEngineStyle,
  /\.cwe-command-main > \.cwe-tabs\s*\{[^}]*grid-template-columns: repeat\(3,/s,
);
for (const source of [
  releaseLoader,
  releaseWorkshopSource,
  releaseStatusbarSource,
  releaseScenarioSource,
  releaseGeneratorSource,
  releaseWorldEngineSource,
]) {
  assert.doesNotMatch(source, /cm-yj-workshop-staging|canming-workshop-staging|canming-dlc-staging|1\.7-beta/);
  assert.doesNotMatch(source, /测试环境本地/);
}

console.info('1.6 兼容版、1.7 测试版与 1.7 正式版的加载器、环境隔离及脚本模块均已接入。');
