const RUNTIME_KEY = '__CMYJRemoteScriptsV2';

const ROLE_FILES = Object.freeze({
  schema: 'schema',
  legacy: 'legacy',
  workshop: 'workshop',
  statusbar: 'statusbar',
  generator: 'generator',
  'variable-editor': 'variable-editor',
});

// 包装脚本分别运行在不同 iframe 中。模块必须按角色延迟求值，否则每个包装脚本导入
// loader 时都会先执行全部模块，重复注册状态栏与 MVU 监听器。
const ROLE_LOADERS = Object.freeze({
  schema: () => import('../schema/index.js'),
  legacy: () => import('../legacy/index.js'),
  workshop: () => import('../workshop/index.js'),
  statusbar: () => import('../statusbar/index.js'),
  generator: () => import('../generator/index.js'),
  'variable-editor': () => import('../variable-editor/index.js'),
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

  const loadRole = ROLE_LOADERS[role];
  if (!loadRole) throw new Error(`未知的残明余烬远程脚本：${role}`);

  await loadRole();
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
