// Алерт «Конфликт брони»: застройщик продал квартиру, а у нас на неё бронь в работе.
//
// Раньше в алерте был только внутренний id квартиры из фида (например 16039556)
// и код проекта. По нему админ не мог понять, чья это бронь и какая квартира:
// в админке брони ищутся через профиль риелтора, а не по квартире.
// Теперь в алерте всё, что нужно, чтобы разобраться без базы.

// Подтверждённая сделка — это не конфликт: квартира и должна стать проданной у застройщика.
export const CONFLICT_IGNORED_STAGES = ['CANCELLED', 'COMPLETE'];

const STAGE_LABELS = {
  INIT: 'создана, паспорт ещё не отправлен',
  PASSPORT_SENT: 'паспорт отправлен застройщику',
  DOCS_SENT: 'документы отправлены, сделка не подтверждена',
};

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const formatDate = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' });
};

// row — строка из bookings + users + units + projects (см. запрос в server.js).
// Если брони по какой-то причине не нашлось, отдаём хотя бы то, что знаем.
export function formatBookingConflictAlert({ unitId, projectId, row }) {
  if (!row) {
    return `⚠️ <b>Конфликт брони</b>\n\nКвартира ${esc(unitId)} (${esc(projectId)}) продана по данным застройщика, но у нас на неё активная бронь.\nДетали брони найти не удалось — проверьте вручную.`;
  }

  const project = row.project_name ? `ЖК «${esc(row.project_name)}»` : esc(projectId);
  const unitParts = [`кв. №${esc(row.unit_number || '?')}`];
  if (row.unit_floor) unitParts.push(`${esc(row.unit_floor)} эт.`);
  if (row.unit_area) unitParts.push(`${esc(row.unit_area)} м²`);

  const realtorName = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.user_name || 'без имени';
  const realtorParts = [esc(realtorName)];
  if (row.company || row.user_company) realtorParts.push(esc(row.company || row.user_company));
  const realtorPhone = row.phone || row.user_phone;
  if (realtorPhone) realtorParts.push(esc(realtorPhone));

  const lines = [
    '⚠️ <b>Конфликт брони</b>',
    '',
    `${project}, ${unitParts.join(', ')} — застройщик отметил квартиру проданной, а у нас по ней идёт бронь.`,
    '',
    `Риелтор: ${realtorParts.join(' · ')}`,
  ];
  if (row.buyer_name || row.buyer_phone) {
    lines.push(`Покупатель: ${[row.buyer_name, row.buyer_phone].filter(Boolean).map(esc).join(' · ')}`);
  }
  const stage = row.stage || 'INIT';
  lines.push(`Стадия брони: ${esc(STAGE_LABELS[stage] || stage)}`);
  const created = formatDate(row.created_at);
  if (created) lines.push(`Бронь от ${created}`);
  if (row.amocrm_lead_id) lines.push(`Лид amoCRM: ${esc(row.amocrm_lead_id)}`);
  lines.push(`Бронь №${esc(row.id)} · id квартиры в фиде ${esc(unitId)}`);
  lines.push('');
  lines.push('Свяжитесь с риелтором: если квартиру продали его клиенту — подтвердите сделку, если нет — снимите бронь.');
  return lines.join('\n');
}
