// Сделка в amoCRM застройщика с момента брони.
//
// До ноября 2026 сделка создавалась только после загрузки паспорта. Между бронью
// и паспортом (до 72 часов) квартира была «занята» только у нас, а отдел продаж
// застройщика видел её свободной и мог продать — так 12.11.2026 ушла кв. 162
// в «Манхэттене» с активной бронью №85. Теперь сделка создаётся сразу при брони,
// а паспорт прикладывается к ней же (syncToAmoCRM не создаёт второй лид, если у
// брони уже есть amocrm_lead_id).
//
// Персональные данные покупателя на этапе брони в CRM не уходят: согласие на их
// передачу застройщику покупатель даёт позже, вместе с паспортом. В предварительной
// сделке — только квартира и риелтор.

// Выключатель: AMOCRM_LEAD_ON_BOOKING=false возвращает старое поведение (лид после паспорта).
export function isLeadOnBookingEnabled(env = process.env) {
  return env.AMOCRM_LEAD_ON_BOOKING !== 'false';
}

// Когда бронь снята или истекла, сделку закрываем как «не реализовано», иначе отдел
// продаж будет считать квартиру занятой. AMOCRM_CLOSE_RELEASED_LEADS=false — только примечание.
export function isCloseReleasedEnabled(env = process.env) {
  return env.AMOCRM_CLOSE_RELEASED_LEADS !== 'false';
}

// Системный статус amoCRM «Закрыто и не реализовано» — одинаковый во всех воронках.
export const AMO_STATUS_CLOSED_LOST = 143;

const formatDateTime = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }) + ' МСК';
};

export function preliminaryLeadNote({ unit = {}, projectName, agent = {}, expiresAt }) {
  const unitParts = [`№${unit.number || '?'}`];
  if (unit.floor) unitParts.push(`этаж ${unit.floor}`);
  if (unit.rooms) unitParts.push(`${unit.rooms}-к`);
  if (unit.area) unitParts.push(`${unit.area} м²`);
  const price = Number(unit.price) > 0 ? `\n💰 Цена: ${Number(unit.price).toLocaleString('ru-RU')} ₽` : '';
  const agentLine = [agent.name, agent.company].filter(Boolean).join(', ') || '—';
  const until = formatDateTime(expiresAt);
  return [
    '🔒 Предварительная бронь в PartnerBuild',
    '',
    `🏠 Квартира: ${unitParts.join(', ')}${price}`,
    `📁 Проект: ${projectName || unit.project_id || '—'}`,
    '',
    `🤝 Риелтор: ${agentLine}`,
    `📞 Телефон риелтора: ${agent.phone || '—'}`,
    '',
    until ? `⏳ Квартира закреплена за риелтором до ${until}.` : '⏳ Квартира закреплена за риелтором.',
    'Паспорт и данные покупателя придут в эту же сделку после его согласия на обработку персональных данных.',
    'Если бронь снимут или она истечёт, сделка закроется автоматически.',
    '',
    'Просим не продавать квартиру другому покупателю, пока бронь действует.',
  ].join('\n');
}

const RELEASE_REASONS = {
  expired: 'истёк срок брони, паспорт покупателя не загружен',
  cancelled_by_agent: 'риелтор снял бронь',
  cancelled_by_admin: 'администратор PartnerBuild снял бронь',
};

export function releasedLeadNote({ reason }) {
  const key = String(reason || '').startsWith('expired') ? 'expired' : reason;
  return [
    '🔓 Бронь в PartnerBuild снята — квартира свободна',
    '',
    `Причина: ${RELEASE_REASONS[key] || 'бронь отменена'}.`,
  ].join('\n');
}
