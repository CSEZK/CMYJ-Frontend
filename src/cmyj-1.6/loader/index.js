import '../schema/index.js';
import '../legacy/index.js';
import '../workshop/index.js';
import '../generator/index.js';
import '../variable-editor/index.js';
import '../statusbar/index.js';

const RUNTIME_KEY = '__CMYJRemoteScriptsV2';

const ROLE_FILES = Object.freeze({
  schema: 'schema',
  legacy: 'legacy',
  workshop: 'workshop',
  statusbar: 'statusbar',
  generator: 'generator',
  'variable-editor': 'variable-editor',
});

const ROLE_DEPENDENCIES = Object.freeze({
  legacy: ['schema'],
  statusbar: ['schema', 'legacy', 'workshop', 'generator', 'variable-editor'],
});

function getHostWindow() {
  try {
    return window.parent && window.parent !== window ? window.parent : window;
  } catch {
    return globalThis;
  }
}

const host = getHostWindow();
const state = host[RUNTIME_KEY] ?? {
  version: 2,
  promises: Object.create(null),
  loaded: Object.create(null),
};

async function importRole(role) {
  const dependencies = ROLE_DEPENDENCIES[role] ?? [];
  for (const dependency of dependencies) await boot(dependency);

  if (!ROLE_FILES[role]) throw new Error(`未知的残明余烬远程脚本：${role}`);

  // 模板会把六个模块静态打包到共享入口；实际注册在模块求值时已完成。
  state.loaded[role] = true;
  return true;
}

export function boot(role) {
  if (state.loaded[role]) return Promise.resolve(true);
  if (state.promises[role]) return state.promises[role];

  const promise = importRole(role).catch(error => {
    delete state.promises[role];
    console.error(`[残明余烬远程脚本] ${role} 加载失败`, error);
    throw error;
  });
  state.promises[role] = promise;
  return promise;
}

const runtime = Object.assign(state, {
  boot,
  roles: ROLE_FILES,
  baseUrl: new URL('.', import.meta.url).href,
});

host[RUNTIME_KEY] = runtime;
host.__CMYJRemoteScripts = runtime;
globalThis.__CMYJRemoteScripts = runtime;
