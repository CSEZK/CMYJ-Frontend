import assert from 'node:assert/strict';
import YAML from 'yaml';

globalThis.window = {};
window.parent = window;
globalThis.document = {};

await import('../src/cmyj-1.7-beta/scenario-generator/index.js');

const era = {
  格式: 'canming-era-preset',
  格式版本: 1,
  标识: 'cmyj.era.chongzhen-7-07',
  变量: {
    天下地图: {
      地区态势: {
        山西: {
          名义归属: '大明',
          实控势力: '明廷',
          实控阵营: '明廷',
          争夺状态: '动荡',
          主要势力: {},
          军事态势: '边镇欠饷，塞外压力渐增。',
          经济态势: '军粮与民粮都很紧张。',
          最近大事: '后金游骑活动频繁。',
        },
      },
    },
  },
};

const project = CanmingScenarioGenerator.exportProject();
assert.equal(project.version, 2, '新建工程必须使用 v2 格式');
project.title = '大同孤堡';
project.id = 'cmyj.test.datong-fort';
project.protagonist.identity = '大同镇边军小旗';
project.protagonist.occupation = '边堡小旗';
project.protagonist.location = '山西大同府北境边堡';
project.opening.body = '风卷着沙砾撞上堡门，欠饷的军士已经堵在门外。';
project.characters.栖云.included = true;
project.characters.栖云.known = true;
project.characters.栖云.scene = false;
project.characters.栖云.adaptationBrief = '成为随主角往来边镇、负责商路联络的旧识';
project.characters.栖云.category = '亲属';
project.characters.栖云.relation = '义妹';
project.characters.栖云.identity = '随养母经营边地商路的义女';
project.characters.栖云.activityArea = '通常往来于大同府城与北境商路';
project.characters.栖云.faction = '苏晚棠一家';
project.characters.栖云.relationshipOrigin = '因苏晚棠与主角共同筹措边堡粮饷而相识';
project.characters.栖云.relationshipPattern = '信任来自长期共事，不因主角身份而无条件服从';
project.characters.栖云.characterToUser = '依双方公开身份称呼';
project.characters.栖云.userToCharacter = '栖云';
project.characters.栖云.longTermSituation = '协助养母维系家业，同时照看栖月与赵砚';
project.characters.栖云.adaptationPrinciples = [
  '保留谨慎、重视家人和以行动表达关心的性格核心',
  '身份变化不得切断与栖月、苏晚棠和赵砚的固定关系',
];

project.initialization = {
  patch: {
    主角: {
      私库: {
        重要物品: {
          边堡铜印: { 简介: '调动堡中人手的旧铜印', 数量: 1 },
        },
      },
    },
    经济: {
      资产: {
        北境边堡: { 说明: '主角负责守御的边堡', 月入: 0 },
      },
      仓储: {
        粟米: { 数量: 18, 单位: '石' },
      },
    },
    时局与任务: {
      当前任务: {
        安抚欠饷军士: { 类型: '军政', 说明: '在哗变前筹到粮饷', 进度: '未开始' },
      },
    },
  },
};

const bundle = CanmingScenarioGenerator.compileProject(project, era);
const resource = bundle.resources[0];
const initvarText = resource.openings[0].content.match(/<initvar>\n([\s\S]*?)\n<\/initvar>/)?.[1];
const initvar = YAML.parse(initvarText);

assert.equal(bundle.format, 'canming-workshop-package');
assert.equal(bundle.version, 2);
assert.equal(bundle.kind, 'scenario');
assert.equal(resource.scenario.exclusiveGroup, 'player-origin');
assert.equal(resource.scenario.allowMidChatSwitch, false);
assert.equal(resource.scenario.newChatRequired, true);
assert.equal(resource.openings.length, 1);
assert.equal(resource.characterOverviews['origin-opening'].length, 1);
assert.equal(resource.characterAdaptationVersion, 3);
assert.deepEqual(resource.portraitProfiles, [{ name: '栖云' }], 'DLC 应启用已选角色的内置立绘');
const qiyunAdaptation = resource.characterAdaptations.find(item => item.character === '栖云');
assert.ok(qiyunAdaptation, '应导出栖云的长期角色适配');
assert.equal(qiyunAdaptation.identity, '随养母经营边地商路的义女');
assert.equal(qiyunAdaptation.activityArea, '通常往来于大同府城与北境商路');
assert.equal(qiyunAdaptation.relationshipOrigin, '因苏晚棠与主角共同筹措边堡粮饷而相识');
assert.equal(qiyunAdaptation.relationshipPattern, '信任来自长期共事，不因主角身份而无条件服从');
assert.deepEqual(qiyunAdaptation.adaptationPrinciples, project.characters.栖云.adaptationPrinciples);
assert.equal(
  Object.hasOwn(qiyunAdaptation, 'adaptationBrief'),
  false,
  '一句话适配设想只供生成器使用，不应写入人物适配',
);
for (const transientField of ['openingExperience', 'currentGoals', 'knownInformation', 'openingStates']) {
  assert.equal(Object.hasOwn(qiyunAdaptation, transientField), false, `长期适配不得包含 ${transientField}`);
}
assert.equal(initvar.人际网络.亲属.栖云.是否在场, false);
assert.equal(initvar.天下地图.地区态势.山西.实控阵营, '明廷');
assert.deepEqual(Object.keys(initvar), [
  '世界运转',
  '主角',
  '人际网络',
  '军事',
  '经济',
  '科技',
  '个人史记',
  '天下地图',
  '时局与任务',
  '风月阁',
]);
assert.deepEqual(initvar.主角.私库.重要物品.边堡铜印, { 简介: '调动堡中人手的旧铜印', 数量: 1 });
assert.equal(initvar.主角.私库.金银铜.白银, 3, '补丁合并不得覆盖基础私库字段');
assert.deepEqual(initvar.经济.资产.北境边堡, { 说明: '主角负责守御的边堡', 月入: 0 });
assert.deepEqual(initvar.经济.仓储.粟米, { 数量: 18, 单位: '石' });
assert.equal(initvar.经济.市场.价格指数.粮食, 100, '补丁合并不得覆盖固定市场骨架');
assert.deepEqual(initvar.时局与任务.当前任务.安抚欠饷军士, { 类型: '军政', 说明: '在哗变前筹到粮饷', 进度: '未开始' });
assert.equal((resource.openings[0].content.match(/<initvar>/g) || []).length, 1);

console.info('开局生成器 v2 长期适配、固定 initvar 骨架和初始化补丁合并测试通过。');
