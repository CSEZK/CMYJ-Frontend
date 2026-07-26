const RUNTIME_KEY = '__CMYJRemoteScriptsV17';

const ROLE_FILES = Object.freeze({
  schema: 'schema',
  legacy: 'legacy',
  workshop: 'workshop',
  statusbar: 'statusbar',
  generator: 'generator',
  'scenario-generator': 'scenario-generator',
  'variable-editor': 'variable-editor',
  'world-engine': 'world-engine',
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
  version: '1.7',
  promises: Object.create(null),
  loaded: Object.create(null),
};

async function importRole(role) {
  const roleFile = ROLE_FILES[role];
  if (!roleFile) throw new Error(`未知的残明余烬远程脚本：${role}`);

  const loaderDirectory = new URL('.', import.meta.url).href;
  const roleUrl = `${loaderDirectory}../${roleFile}/index.js`;
  await import(/* webpackIgnore: true */ roleUrl);
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
