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
assert.match(betaStatusbarSource, /STATUSBAR_VERSION = '1\.7\.0-beta\.9'/);
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

console.info('稳定版与 DLC 测试版加载器、环境隔离及脚本模块均已接入。');
