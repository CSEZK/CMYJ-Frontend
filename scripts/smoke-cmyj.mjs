import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loaderPath = path.join(root, 'dist', 'cmyj-1.6', 'loader', 'index.js');
const loader = await readFile(loaderPath, 'utf8');
const workshopSource = await readFile(path.join(root, 'src', 'cmyj-1.6', 'workshop', 'index.js'), 'utf8');
const statusbarSource = await readFile(path.join(root, 'src', 'cmyj-1.6', 'statusbar', 'index.js'), 'utf8');
const betaLoader = await readFile(path.join(root, 'dist', 'cmyj-1.7-beta', 'loader', 'index.js'), 'utf8');
const betaWorkshopSource = await readFile(path.join(root, 'src', 'cmyj-1.7-beta', 'workshop', 'index.js'), 'utf8');
const betaStatusbarSource = await readFile(path.join(root, 'src', 'cmyj-1.7-beta', 'statusbar', 'index.js'), 'utf8');
const betaScenarioSource = await readFile(
  path.join(root, 'src', 'cmyj-1.7-beta', 'scenario-generator', 'index.js'),
  'utf8',
);
const originalTongchengAdaptations = JSON.parse(
  await readFile(
    path.join(root, 'src', 'cmyj-1.7-beta', 'statusbar', 'original-tongcheng-character-adaptations.json'),
    'utf8',
  ),
);
const v18Loader = await readFile(path.join(root, 'dist', 'cmyj-1.8', 'loader', 'index.js'), 'utf8');
const v18SchemaSource = await readFile(path.join(root, 'src', 'cmyj-1.8', 'schema', 'definition.js'), 'utf8');
const v18GeneratorSource = await readFile(path.join(root, 'src', 'cmyj-1.8', 'generator', 'index.js'), 'utf8');
const v18ScenarioSource = await readFile(path.join(root, 'src', 'cmyj-1.8', 'scenario-generator', 'index.js'), 'utf8');
const v18StatusbarSource = await readFile(path.join(root, 'src', 'cmyj-1.8', 'statusbar', 'index.js'), 'utf8');
const v18WorkshopSource = await readFile(path.join(root, 'src', 'cmyj-1.8', 'workshop', 'index.js'), 'utf8');
const v18WorldEngineSource = await readFile(path.join(root, 'src', 'cmyj-1.8', 'world-engine', 'index.js'), 'utf8');

assert.ok(loader.length > 300_000, '共享加载器未包含完整脚本集');
assert.match(loader, /CanmingWorkshop/);
assert.match(loader, /CanmingCharacterGenerator/);
assert.match(loader, /CanmingVariableEditor/);
assert.match(loader, /__CMYJRemoteScriptsV2/);
assert.doesNotMatch(loader, /CMYJ-Scripts/);
assert.match(workshopSource, /canming-workshop-installs/);
assert.match(workshopSource, /data-repair-install/);
assert.match(workshopSource, /repairInstalledWork/);
assert.match(statusbarSource, /worldbookSignatures/);
assert.match(statusbarSource, /STATUSBAR_VERSION = '1\.6\.1'/);

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

assert.match(v18Loader, /__CMYJRemoteScriptsV18/);
assert.match(v18StatusbarSource, /STATUSBAR_VERSION = '1\.8\.\d+'/);
assert.match(v18StatusbarSource, /version: '1\.1\.0'/);
assert.match(v18StatusbarSource, /builtinTongchengWorldbookEntries\(entries\)/);
assert.match(v18StatusbarSource, /conflictMode: 'overwrite'/);
for (const entryName of [
  '桐城及周边概览',
  '桐城本地势力',
  '安庆及周边',
  '周边军事势力',
  '区域经济',
  '[mvu_plot]桐城民变',
  '黄文鼎',
  '汪国华',
]) {
  assert.match(v18StatusbarSource, new RegExp(entryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(v18StatusbarSource, /canming-afterglow-1\.8:statusbar:/);
assert.match(v18StatusbarSource, /__CMYJWorkshopNoticeRuntimeV18/);
assert.doesNotMatch(v18StatusbarSource, /canming-afterglow-statusbar:/);
assert.match(v18GeneratorSource, /canming-1\.8:generator:api/);
assert.doesNotMatch(v18GeneratorSource, /canming-dlc-staging:generator:/);
assert.match(v18ScenarioSource, /canming-1\.8:scenario-generator:project:v1/);
assert.match(v18ScenarioSource, /canming-1\.8:generator:api/);
assert.match(v18WorldEngineSource, /__CMYJWorldEngineV18/);
assert.match(v18WorldEngineSource, /cmyj_world_engine_v18/);
assert.match(v18WorldEngineSource, /canming-world-engine-1\.8:/);
assert.doesNotMatch(v18WorldEngineSource, /canming-world-engine:/);
assert.match(v18WorkshopSource, /canming-workshop-1\.8:publish-v3/);
assert.match(v18WorkshopSource, /canming-workshop-1\.8:installs-v1/);
assert.match(v18WorkshopSource, /canming-workshop-staging:token/);
assert.match(v18WorkshopSource, /canming-workshop-staging:user/);
assert.match(v18WorkshopSource, /'worldbook','scenario','generator'/);
assert.match(v18WorkshopSource, /data-collection-scenario-file/);
assert.match(v18WorkshopSource, /collectionScenarioBundle/);
assert.match(v18WorkshopSource, /开场白与初始变量、人物关系、世界书、人物志及角色适配/);
assert.match(v18WorkshopSource, /合集安装时仍遵守一局一身份/);
assert.match(v18WorkshopSource, /showWorkshopSessionExpired/);
assert.match(v18WorkshopSource, /workshopStoredTokenExpired/);
assert.match(v18WorkshopSource, /data-a="session-expired-login"/);
assert.match(v18WorkshopSource, /新的登录凭证有效期为 <b>72 小时<\/b>/);
assert.match(v18WorkshopSource, /r\.status===401&&t&&!path\.startsWith\('\/api\/auth\/'\)/);
assert.match(v18WorkshopSource, /saveInstallSnapshot\(record\.id,snapshot\)/);
assert.match(v18WorkshopSource, /__installOptions=\{enabled:/);
assert.match(v18WorkshopSource, /applyInstalledWorkToCurrentCard/);
assert.match(v18WorkshopSource, /targetCharacterId:after\.characterId/);
assert.match(v18WorkshopSource, /data-apply-install/);
assert.match(v18StatusbarSource, /getCurrentCharacterId/);
assert.match(v18StatusbarSource, /characterId,/);
assert.match(v18StatusbarSource, /scenarioDetails: activeScenarioDetails/);
assert.match(v18WorkshopSource, /选择你的来历/);
assert.match(v18WorkshopSource, /scenario-desk/);
assert.match(v18WorkshopSource, /管理与修复/);
assert.doesNotMatch(v18WorkshopSource, /先领一纸身份/);
assert.match(v18WorkshopSource, /shellWithCompactScenarioHeader/);
assert.match(v18SchemaSource, /粮秣流水/);
assert.match(v18SchemaSource, /装备编制/);
assert.match(v18SchemaSource, /欠饷月数/);
assert.match(v18SchemaSource, /军令记录/);
assert.match(v18StatusbarSource, /function buildMilitaryCommandQuote/);
assert.match(v18StatusbarSource, /function advanceMilitaryOrders/);
assert.match(v18StatusbarSource, /function appendGrainTransaction/);
assert.match(v18StatusbarSource, /data-action="open-military-command"/);
assert.match(v18StatusbarSource, /军府签押/);

console.info('稳定版、DLC 测试版与 1.8 加载器、状态隔离及脚本模块均已接入。');
