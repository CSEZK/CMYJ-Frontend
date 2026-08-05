import YAML from 'yaml';
import { buildTimelineInjection } from './core.js';

(() => {
  'use strict';

  const RUNTIME_KEY = '__CMYJTimelineV18';
  const INJECTION_ID = 'cmyj-timeline-context-v1';
  const ARCHIVE_ENTRY_NAME = '[timeline_archive]残明历史档案';
  const hostWindow = (() => {
    try {
      return window.parent && window.parent !== window ? window.parent : window;
    } catch {
      return window;
    }
  })();

  if (hostWindow[RUNTIME_KEY]?.mounted) return;
  const runtime = { mounted: true, archive: null, worldbookName: '', lastWarning: '' };
  hostWindow[RUNTIME_KEY] = runtime;

  function api(name) {
    return globalThis[name] ?? hostWindow?.[name];
  }

  function clearInjection() {
    try {
      api('uninjectPrompts')?.([INJECTION_ID]);
    } catch {
      // 尚未注入时无需处理。
    }
  }

  function warnOnce(message, error) {
    if (runtime.lastWarning === message) return;
    runtime.lastWarning = message;
    console.warn(`[残明余烬 1.8 时间线] ${message}`, error ?? '');
  }

  function latestStatData() {
    const getMessages = api('getChatMessages');
    if (typeof getMessages !== 'function') return null;
    const messages = getMessages('0-{{lastMessageId}}', { role: 'assistant', include_swipes: false }) ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      try {
        const mvuData = api('Mvu')?.getMvuData?.({ type: 'message', message_id: Number(message.message_id) });
        if (mvuData?.stat_data) return mvuData.stat_data;
      } catch {
        // MVU 尚未就绪时读取楼层附带数据。
      }
      if (message?.data?.stat_data) return message.data.stat_data;
    }
    return null;
  }

  async function loadArchive() {
    if (runtime.archive) return runtime.archive;
    const getNames = api('getCharWorldbookNames');
    const getBook = api('getWorldbook');
    if (typeof getNames !== 'function' || typeof getBook !== 'function') throw new Error('世界书接口不可用。');

    const names = getNames('current');
    const candidates = [names?.primary, ...(names?.additional ?? [])].filter(Boolean);
    for (const worldbookName of candidates) {
      const entries = (await getBook(worldbookName)) ?? [];
      const entry = entries.find(item => item?.name === ARCHIVE_ENTRY_NAME);
      if (!entry?.content) continue;
      const parsed = YAML.parse(entry.content);
      if (!Array.isArray(parsed?.残明历史档案?.事件)) throw new Error('历史档案格式不正确。');
      runtime.archive = parsed;
      runtime.worldbookName = worldbookName;
      return parsed;
    }
    throw new Error(`未找到关闭条目「${ARCHIVE_ENTRY_NAME}」。`);
  }

  async function refreshInjection() {
    const statData = latestStatData();
    const date = String(statData?.世界运转?.当前日期 ?? '').trim();
    if (!date) {
      clearInjection();
      return;
    }

    try {
      const archive = await loadArchive();
      const content = buildTimelineInjection(archive, date, {
        location: statData?.世界运转?.当前地点 ?? '',
        previewDays: 40,
        maxChars: 460,
      });
      clearInjection();
      if (!content) return;
      const inject = api('injectPrompts');
      if (typeof inject !== 'function') throw new Error('提示词注入接口不可用。');
      inject([
        {
          id: INJECTION_ID,
          position: 'in_chat',
          depth: 0,
          role: 'system',
          content,
          should_scan: false,
        },
      ]);
      runtime.lastWarning = '';
    } catch (error) {
      clearInjection();
      warnOnce(error?.message || '时间线注入失败。', error);
    }
  }

  function invalidateArchive() {
    runtime.archive = null;
    runtime.worldbookName = '';
  }

  function registerEvents() {
    const on = api('eventOn');
    const events = globalThis.tavern_events ?? hostWindow.tavern_events;
    if (typeof on !== 'function' || !events) return;

    on(events.GENERATION_AFTER_COMMANDS, (_type, _options, dryRun) => (dryRun ? undefined : refreshInjection()));
    on(events.CHAT_CHANGED, () => {
      clearInjection();
      invalidateArchive();
      setTimeout(() => void refreshInjection(), 150);
    });
    on(events.MESSAGE_SWIPED, () => void refreshInjection());
    on(events.MESSAGE_EDITED, () => void refreshInjection());
    on(events.MESSAGE_DELETED, () => void refreshInjection());
    on(events.WORLDINFO_UPDATED, name => {
      if (!runtime.worldbookName || name === runtime.worldbookName) {
        invalidateArchive();
        void refreshInjection();
      }
    });

    const mvu = api('Mvu');
    if (mvu?.events?.VARIABLE_UPDATE_ENDED) on(mvu.events.VARIABLE_UPDATE_ENDED, () => void refreshInjection());
  }

  $(() => {
    registerEvents();
    void refreshInjection();
    console.info('[残明余烬 1.8 时间线] 已启用按日期历史态势注入。');
  });

  $(window).on('pagehide', clearInjection);
})();
