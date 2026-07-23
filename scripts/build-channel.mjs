import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const channel = String(process.argv[2] || '').trim();
if (!/^cmyj-[a-z0-9.-]+$/i.test(channel)) throw new Error('请提供合法的 CMYJ 构建通道');

const webpackCli = path.resolve(process.cwd(), 'node_modules', 'webpack-cli', 'bin', 'cli.js');
const result = spawnSync(process.execPath, [webpackCli, '--mode', 'production'], {
  cwd: process.cwd(),
  env: { ...process.env, CMYJ_CHANNEL: channel },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
