import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const loader = path.join(dist, 'cmyj-1.6', 'loader', 'index.js');

await access(loader);
await mkdir(dist, { recursive: true });
await writeFile(
  path.join(dist, '_headers'),
  `/cmyj-1.6/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=0, must-revalidate
  X-Content-Type-Options: nosniff
`,
  'utf8',
);

console.info('Cloudflare Pages 响应头已写入 dist/_headers。');
