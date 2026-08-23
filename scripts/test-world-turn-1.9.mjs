import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isWorldTurnMessage,
  normalReplyAnchor,
  reconcileWorldTurnHistory,
  worldClockKey,
} from '../src/cmyj-1.9/world-turn/logic.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src', 'cmyj-1.9', 'world-turn', 'index.js'), 'utf8');
const statusbar = await readFile(path.join(root, 'src', 'cmyj-1.9', 'statusbar', 'index.js'), 'utf8');
const schema = await readFile(path.join(root, 'src', 'cmyj-1.9', 'schema', 'definition.js'), 'utf8');

assert.equal(worldClockKey({ 世界运转: { 世界运转天数: 17, 二十四时: { 小时: 9, 分钟: 30 } } }), '17:9:30');
assert.equal(
  worldClockKey({ 世界运转: { 当前日期: '崇祯七年七月初五', 二十四时: { 小时: 9, 分钟: 30 } } }),
  '崇祯七年七月初五:9:30',
);
assert.equal(worldClockKey({ 世界运转: { 当前日期: '崇祯七年七月初五' } }), '崇祯七年七月初五');

const opening = [{ message_id: 0, role: 'assistant', message: '开场' }];
assert.equal(normalReplyAnchor(opening, 0), '', '开场白不得计数');
const normal = [
  ...opening,
  { message_id: 1, role: 'user', message: '行动' },
  { message_id: 2, role: 'assistant', message: '正文', data: { stat_data: {} } },
];
assert.equal(normalReplyAnchor(normal, 2), '2:1', '正文应以正文楼层和前置用户楼层组成锚点');
assert.equal(
  normalReplyAnchor([...normal, { message_id: 3, role: 'assistant', message: '续写' }], 3),
  '',
  '没有新玩家输入的连续助手消息不得计数',
);
assert.equal(
  normalReplyAnchor(
    [
      ...normal,
      { message_id: 3, role: 'user', message: '继续' },
      { message_id: 4, role: 'assistant', message: '<world_turn></world_turn>', extra: { canming_world_turn: true } },
    ],
    4,
  ),
  '',
  '天下推演消息不得计入调度器',
);

const completedCycle = [
  ...normal,
  { message_id: 3, role: 'user', message: '行动二' },
  { message_id: 4, role: 'assistant', message: '正文二', data: { stat_data: {} } },
  { message_id: 5, role: 'user', message: '行动三' },
  { message_id: 6, role: 'assistant', message: '正文三', data: { stat_data: {} } },
  {
    message_id: 7,
    role: 'assistant',
    message: '<world_turn></world_turn>',
    data: { stat_data: { 世界运转: { 世界运转天数: 1, 二十四时: { 小时: 12, 分钟: 0 } } } },
    extra: { canming_world_turn: true },
  },
  { message_id: 8, role: 'user', message: '行动四' },
  { message_id: 9, role: 'assistant', message: '正文四', data: { stat_data: {} } },
];
const afterOneReply = reconcileWorldTurnHistory(completedCycle, ['2:1', '4:3', '6:5', '9:8'], 3);
assert.equal(afterOneReply.progress, 1, '最后一次推演后的普通正文应重新核算为一轮');
assert.equal(afterOneReply.lastWorldTurnClock, '1:12:0', '重算时应恢复最后一份现存推演的时间基线');
const afterDeletingLatestPair = reconcileWorldTurnHistory(completedCycle.slice(0, -2), ['2:1', '4:3', '6:5', '9:8'], 3);
assert.equal(afterDeletingLatestPair.progress, 0, '删除最新一组用户与正文楼层后计数必须回退');
assert.doesNotMatch(afterDeletingLatestPair.handledAnchors.join(','), /9:8/, '被删除楼层的防重锚点必须清除');
const afterDeletingWorldTurn = reconcileWorldTurnHistory(completedCycle.slice(0, 7), ['2:1', '4:3', '6:5'], 3);
assert.equal(afterDeletingWorldTurn.progress, 3, '删除最新推演楼层后应恢复此前已经完成的正文轮数');
assert.equal(afterDeletingWorldTurn.hasWorldTurn, false, '删除唯一推演后不得保留不存在的推演分界');
const reportWithoutExtra = completedCycle.map(message =>
  message.message_id === 7 ? { ...message, extra: {}, message: '<world_turn>仍是推演报告</world_turn>' } : message,
);
assert.equal(isWorldTurnMessage(completedCycle.at(-3)), true, '重推按钮必须能识别标记过的推演楼层');
assert.equal(
  reconcileWorldTurnHistory(reportWithoutExtra, ['2:1', '4:3', '6:5', '9:8'], 3).progress,
  1,
  '酒馆接口遗漏自定义 extra 时仍须通过 world_turn 标签识别推演分界',
);

assert.doesNotMatch(source, /mvu\.parseMessage\(/, '推演不得在消息写入前手动解析 MVU');
assert.doesNotMatch(source, /data: parsedData/, '推演不得携带手动解析数据，以免与 MVU 实时监听重复');
assert.match(
  source,
  /const mvuCompleted = waitForWorldTurnMvu\(runtime, oldData\)/,
  '推演必须等待唯一一次实时 MVU 更新',
);
assert.match(source, /const updatedData = await mvuCompleted/, '推演完成状态必须以实时 MVU 落盘为准');
assert.match(source, /return report\.trim\(\)/, '推演楼层必须只保留 world_turn 报告');
assert.match(source, /MVU_UPDATE_SCOPE: 本条是天下推演的回顾结算/, '推演楼层必须就近声明 MVU 更新边界');
assert.match(
  source,
  /const protectedPaths = \['世界运转', '主角', '人际网络\.在场角色', '个人史记'\]/,
  '推演不得改动主场景状态',
);
assert.match(source, /推演本身不产生额外耗时/, '推演提示词必须禁止额外推进时间');
assert.match(source, /禁止写场景、环境铺陈、人物对白、心理独白和动作过程/, '天下推演不得与平行世界重复生成叙事切片');
assert.match(source, /事件尺度必须匹配实际流逝时间/, '推演事件尺度必须受世界时间约束');
assert.match(source, /“棋局推进”通常列出 6—10 项/, '推演必须优先输出高密度的宏观变化');
assert.match(source, /【天下总势】/, '推演必须提供宏观总势');
assert.match(source, /【棋局推进】/, '推演必须提供结构化棋局推进');
assert.match(source, /【连锁反应】/, '推演必须支持跨地区与跨领域的因果传导');
assert.match(source, /【世局线】/, '推演必须维护长线演化状态');
assert.match(source, /【历史偏移】/, '推演必须在必要时说明历史轨迹偏移');
assert.match(source, /buildWorldTurnPrompt\(runtime, statData, period\)/, '每轮推演必须注入动态时间边界');
assert.doesNotMatch(source, /【未决事项】|【确定影响】/, '推演报告不得继续使用旧式待办栏目');
assert.match(source, /不输出普通正文、思维链、解释、前言、结语或 <UpdateVariable>/, '推演正文模型不得自行输出变量更新');
assert.match(source, /VARIABLE_UPDATE_STARTED/, '调度器必须监听 MVU 更新开始');
assert.match(source, /VARIABLE_UPDATE_ENDED/, '调度器必须监听 MVU 更新结束');
assert.match(source, /pending\.mvuCompleted && message\?\.data\?\.stat_data/, '正文必须等本轮 MVU 落盘后才计数');
assert.match(source, /status = 'waiting_time'/, '世界时间未推进时必须暂缓');
assert.match(
  source,
  /visibleStatuses = \['waiting_time', 'simulating', 'writing', 'success', 'failed'\]/,
  '普通倒计时不得占用顶部提示',
);
assert.match(source, /bannerHideTimer = setTimeout/, '候时提示必须自动退场');
assert.match(source, /globalThis\.generateRaw/, '天下推演不得携带正文预设');
assert.match(source, /class="wt-close"/, '天下推演横幅必须提供关闭按钮');
assert.match(source, /dismissedBannerKey/, '关闭横幅后同一状态不得立刻重新出现');
assert.match(source, /style\.textContent = `#\$\{BANNER_ID\}/, '热更新后必须刷新横幅样式');
assert.match(source, /generationType !== 'first_message'/, '开场消息必须排除');
assert.match(source, /handledAnchors/, '重新生成必须通过楼层锚点去重');
assert.match(source, /tavern_events\.MESSAGE_DELETED/, '删除楼层后必须触发计数重算');
assert.match(source, /reconcileWorldTurnHistory/, '删除楼层后必须依据现存聊天重建计数');
assert.match(
  source,
  /latest\?\.message_id !== requestedId \|\| !isWorldTurnMessage\(latest\)/,
  '只有聊天末尾的最新推演可以重推',
);
assert.match(source, /await deleteMessages\(\[Number\(messageId\)\]\)/, '重推前必须先删除旧推演并回滚楼层变量');
assert.match(source, /reconcileAfterMessageDeletion\(runtime\)/, '删除旧推演后必须立即重建计数与时间基线');
assert.match(source, /canming_world_turn_period: period/, '推演楼层必须保存时间边界以便原样重推');
assert.match(source, /旧卷已回滚；重推失败/, '重推失败时必须告知玩家旧卷已被回滚');
assert.match(source, /periodOverride: runtime\.retryPeriodOverride/, '失败后重试必须继续沿用原卷时段');
assert.match(
  source,
  /regenerateLatest: messageId => regenerateLatestWorldTurn/,
  '推演脚本必须向卷宗正则暴露受控重推接口',
);
assert.match(source, /载入聊天时核算楼层失败/, '载入聊天时必须修复旧版本遗留的错误计数');
assert.match(statusbar, /data-action="run-world-turn-now"/, '状态栏必须提供立即推演按钮');
assert.match(statusbar, /data-action="skip-world-turn"/, '状态栏必须提供等待或失败时的跳过按钮');
assert.match(statusbar, /data-action="world-turn" class="cm-tools-item"/, '天下推演必须作为小扳手下的独立工具入口');
assert.match(statusbar, /modalState\.type === 'world-turn'/, '天下推演必须使用独立面板');
assert.match(statusbar, /openWorldTurn: \(\) => openWorldTurnPanel\(\)/, '横幅必须能够直达天下推演面板');
assert.match(statusbar, /cm-world-turn-count/, '状态栏悬浮图标必须显示推演剩余轮数');
assert.match(statusbar, /renderWorldTurnLamp\(\)/, '推演状态变化必须刷新悬浮图标');
assert.doesNotMatch(statusbar, /正常正文及其 MVU 更新完成后计数/, '设置说明不得暴露实现术语');
assert.doesNotMatch(statusbar, /id="cm-world-turn-settings"/, '天下推演不得继续塞在通用设置面板');
assert.doesNotMatch(statusbar, /隐秘信息不会自动成为主角已知内容/, '设置说明不得混淆玩家视角与剧情人物知情');
assert.match(schema, /世局线: z/, '变量结构必须包含跨轮世局线');

console.info('天下推演 1.9 调度与接线测试通过');
