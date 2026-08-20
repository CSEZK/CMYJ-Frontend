export function worldClockKey(statData = {}) {
  const world = statData?.世界运转 || {};
  const day = Number(world.世界运转天数);
  const hour = Number(world.二十四时?.小时);
  const minute = Number(world.二十四时?.分钟);
  if (Number.isFinite(day) && Number.isFinite(hour) && Number.isFinite(minute)) return `${day}:${hour}:${minute}`;
  const date = String(world.当前日期 || '').trim();
  if (date && Number.isFinite(hour) && Number.isFinite(minute)) return `${date}:${hour}:${minute}`;
  return date;
}

export function normalReplyAnchor(messages, messageId) {
  const index = messages.findIndex(message => message.message_id === messageId);
  if (index < 0 || messages[index]?.role !== 'assistant' || messages[index]?.extra?.canming_world_turn) return '';
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previous = messages[cursor];
    if (previous.role === 'assistant') return '';
    if (previous.role === 'user') return `${messageId}:${previous.message_id}`;
  }
  return '';
}

export function normalReplyAnchors(messages, startIndex = 0) {
  const anchors = [];
  for (let index = Math.max(0, startIndex); index < messages.length; index += 1) {
    const message = messages[index];
    if (!Number.isInteger(message?.message_id)) continue;
    const anchor = normalReplyAnchor(messages, message.message_id);
    if (anchor) anchors.push(anchor);
  }
  return anchors;
}

export function reconcileWorldTurnHistory(messages, handledAnchors = [], interval = 8) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const allAnchors = normalReplyAnchors(safeMessages);
  let lastWorldTurnIndex = -1;
  for (let index = safeMessages.length - 1; index >= 0; index -= 1) {
    if (safeMessages[index]?.role === 'assistant' && safeMessages[index]?.extra?.canming_world_turn) {
      lastWorldTurnIndex = index;
      break;
    }
  }

  // 有推演分界时，以最后一份仍存在的推演为准；没有分界时只保留过去确实计过的楼层，
  // 避免给启用功能前的旧聊天突然补算几十轮。
  const countedAnchors =
    lastWorldTurnIndex >= 0
      ? normalReplyAnchors(safeMessages, lastWorldTurnIndex + 1)
      : allAnchors.filter(anchor => handledAnchors.includes(anchor));
  const safeInterval = Math.max(1, Math.round(Number(interval) || 1));
  const lastWorldTurn = lastWorldTurnIndex >= 0 ? safeMessages[lastWorldTurnIndex] : null;

  return {
    progress: Math.min(safeInterval, countedAnchors.length),
    handledAnchors: allAnchors.slice(-64),
    lastWorldTurnClock: lastWorldTurn ? worldClockKey(lastWorldTurn.data?.stat_data || {}) : '',
    hasWorldTurn: Boolean(lastWorldTurn),
  };
}
