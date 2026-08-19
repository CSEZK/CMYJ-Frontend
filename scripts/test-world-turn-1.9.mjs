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

assert.match(source, /mvu\.parseMessage\(message, oldData\)/, '额外推演必须显式经过 MVU 解析');
assert.match(source, /data: parsedData/, '推演楼层必须携带解析后的 MVU 数据');
assert.match(source, /VARIABLE_UPDATE_STARTED/, '调度器必须监听 MVU 更新开始');
assert.match(source, /VARIABLE_UPDATE_ENDED/, '调度器必须监听 MVU 更新结束');
assert.match(source, /pending\.mvuCompleted && message\?\.data\?\.stat_data/, '正文必须等本轮 MVU 落盘后才计数');
assert.match(source, /status = 'waiting_time'/, '世界时间未推进时必须暂缓');
assert.match(source, /generationType !== 'first_message'/, '开场消息必须排除');
assert.match(source, /handledAnchors/, '重新生成必须通过楼层锚点去重');
assert.match(statusbar, /data-action="run-world-turn-now"/, '状态栏必须提供立即推演按钮');
assert.match(statusbar, /data-action="skip-world-turn"/, '状态栏必须提供等待或失败时的跳过按钮');
assert.match(statusbar, /openSettings: section/, '横幅必须能够直接打开状态栏设置');

console.info('天下推演 1.9 调度与接线测试通过');
