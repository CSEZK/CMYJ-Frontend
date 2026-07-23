import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const channels = ['cmyj-1.6', 'cmyj-1.7-beta'];

await Promise.all(channels.map(channel => access(path.join(dist, channel, 'loader', 'index.js'))));
await mkdir(dist, { recursive: true });
await writeFile(
  path.join(dist, '_headers'),
  channels
    .map(
      channel => `/${channel}/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=0, must-revalidate
  X-Content-Type-Options: nosniff
`,
    )
    .join('\n'),
  'utf8',
);

console.info('Cloudflare Pages 响应头已写入 dist/_headers。');
