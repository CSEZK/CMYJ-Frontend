import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalReplyAnchor, worldClockKey } from '../src/cmyj-1.9/world-turn/logic.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src', 'cmyj-1.9', 'world-turn', 'index.js'), 'utf8');
const statusbar = await readFile(path.join(root, 'src', 'cmyj-1.9', 'statusbar', 'index.js'), 'utf8');

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

assert.doesNotMatch(source, /mvu\.parseMessage\(/, '推演不得在消息写入前手动解析 MVU');
assert.doesNotMatch(source, /data: parsedData/, '推演不得携带手动解析数据，以免与 MVU 实时监听重复');
assert.match(source, /const mvuCompleted = waitForWorldTurnMvu\(runtime, oldData\)/, '推演必须等待唯一一次实时 MVU 更新');
assert.match(source, /const updatedData = await mvuCompleted/, '推演完成状态必须以实时 MVU 落盘为准');
assert.match(source, /return report\.trim\(\)/, '推演楼层必须只保留 world_turn 报告');
assert.match(source, /MVU_UPDATE_SCOPE: 本条是天下推演的回顾结算/, '推演楼层必须就近声明 MVU 更新边界');
assert.match(source, /const protectedPaths = \['世界运转', '主角', '人际网络\.在场角色', '个人史记'\]/, '推演不得改动主场景状态');
assert.match(source, /推演本身不产生额外耗时/, '推演提示词必须禁止额外推进时间');
assert.match(source, /不输出普通正文、思维链、解释、前言、结语或 <UpdateVariable>/, '推演正文模型不得自行输出变量更新');
assert.match(source, /VARIABLE_UPDATE_STARTED/, '调度器必须监听 MVU 更新开始');
assert.match(source, /VARIABLE_UPDATE_ENDED/, '调度器必须监听 MVU 更新结束');
assert.match(source, /pending\.mvuCompleted && message\?\.data\?\.stat_data/, '正文必须等本轮 MVU 落盘后才计数');
assert.match(source, /status = 'waiting_time'/, '世界时间未推进时必须暂缓');
assert.match(source, /visibleStatuses = \['waiting_time', 'simulating', 'writing', 'success', 'failed'\]/, '普通倒计时不得占用顶部提示');
assert.match(source, /bannerHideTimer = setTimeout/, '候时提示必须自动退场');
assert.match(source, /generationType !== 'first_message'/, '开场消息必须排除');
assert.match(source, /handledAnchors/, '重新生成必须通过楼层锚点去重');
assert.match(statusbar, /data-action="run-world-turn-now"/, '状态栏必须提供立即推演按钮');
assert.match(statusbar, /data-action="skip-world-turn"/, '状态栏必须提供等待或失败时的跳过按钮');
assert.match(statusbar, /openSettings: section/, '横幅必须能够直接打开状态栏设置');
assert.match(statusbar, /cm-world-turn-count/, '状态栏悬浮图标必须显示推演剩余轮数');
assert.match(statusbar, /renderWorldTurnLamp\(\)/, '推演状态变化必须刷新悬浮图标');
assert.doesNotMatch(statusbar, /正常正文及其 MVU 更新完成后计数/, '设置说明不得暴露实现术语');
assert.match(statusbar, /每隔若干轮追加一次全局推演；时间未推进则暂缓。/, '设置说明必须保持简洁');
assert.doesNotMatch(statusbar, /隐秘信息不会自动成为主角已知内容/, '设置说明不得混淆玩家视角与剧情人物知情');

console.info('天下推演 1.9 调度与接线测试通过');
