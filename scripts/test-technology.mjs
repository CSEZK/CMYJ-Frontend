import assert from 'node:assert/strict';
import { mergeTechnologyStatus, normalizeTechnologyCollection } from '../src/cmyj-1.8/shared/technology.js';

assert.equal(mergeTechnologyStatus('已完成三轮小样。', '已完成三轮小样'), '已完成三轮小样');
assert.equal(
  mergeTechnologyStatus('负责人已备齐原料，下一步试制。', '试验观察：燃速较均匀。'),
  '负责人已备齐原料，下一步试制；试验观察：燃速较均匀',
);

const technologies = {
  颗粒火药: { 进度: '试验中', 描述: '已完成三轮小样。', 效果: '已完成三轮小样' },
  新式水车: { 进度: '小规模试点', 现状: '已在西乡安装一架。', 效果: '可稳定提水。' },
};
assert.equal(normalizeTechnologyCollection(technologies), 2);
assert.deepEqual(technologies.颗粒火药, { 进度: '试验中', 现状: '已完成三轮小样' });
assert.deepEqual(technologies.新式水车, {
  进度: '小规模试点',
  现状: '已在西乡安装一架；可稳定提水',
});
assert.equal(normalizeTechnologyCollection(technologies), 0, '迁移必须可重复执行且不继续改写');

console.info('科技现状合并与旧档迁移测试通过。');
