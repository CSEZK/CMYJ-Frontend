import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const channels = ['cmyj-1.6', 'cmyj-1.7-beta'];
const trees = channels.flatMap(channel => [path.join(root, 'src', channel), path.join(root, 'dist', channel)]);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

for (const tree of trees) {
  for (const file of await collect(tree)) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout);
      process.exit(result.status || 1);
    }
  }
}

console.info('残明余烬稳定版与 DLC 测试版源码、构建产物均通过语法检查。');
