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
