// Сверка сделки с amoCRM перед начислением золота. Золото — это приз за продажу,
// которую привело приложение, поэтому кнопка админа сама по себе ничего не доказывает.
// Проверяем две вещи:
//   1. лид, созданный приложением при брони, в amoCRM закрыт как «Успешно реализовано»;
//   2. покупатель не был известен отделу продаж до брони — иначе риелтор мог оформить
//      на себя клиента, который пришёл в офис сам.
// Если amoCRM недоступна, это не «сделка подтверждена», а «проверить не удалось».

// 142 — системный статус amoCRM «Успешно реализовано», одинаковый во всех воронках.
export const AMO_WON_STATUS_ID = 142;
const AMO_TIMEOUT_MS = 15000;

// Телефон сравниваем по последним 10 цифрам: в CRM он записан как угодно —
// +7, 8, со скобками, пробелами.
export function phoneKey(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

async function amoGet(path, { subdomain, token, fetchImpl }) {
  const res = await fetchImpl(`https://${subdomain}.amocrm.ru/api/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(AMO_TIMEOUT_MS),
  });
  // amoCRM на пустой выдаче отвечает 204 без тела
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`amoCRM ${path.split('?')[0]}: HTTP ${res.status}`);
  return res.json();
}

/**
 * @returns {Promise<{ ok: boolean, checked: boolean, problems: string[], leadStatusId: number|null }>}
 *   checked = false — проверка не состоялась (нет настроек или amoCRM не ответила).
 */
export async function verifyDealInAmo({
  leadId, buyerPhone, bookingCreatedAt,
  subdomain = process.env.AMOCRM_SUBDOMAIN,
  token = process.env.AMOCRM_TOKEN,
  statusNames = {},
  fetchImpl = fetch,
}) {
  const problems = [];
  if (!subdomain || !token) {
    return { ok: false, checked: false, problems: ['amoCRM не настроена — сверить сделку не с чем'], leadStatusId: null };
  }
  if (!leadId) {
    return { ok: false, checked: true, problems: ['У брони нет лида в amoCRM: бронь не прошла через воронку приложения'], leadStatusId: null };
  }
  const opts = { subdomain, token, fetchImpl };

  let lead;
  try {
    lead = await amoGet(`/leads/${encodeURIComponent(leadId)}`, opts);
  } catch (e) {
    return { ok: false, checked: false, problems: [`Не удалось получить лид из amoCRM: ${e.message}`], leadStatusId: null };
  }
  if (!lead) {
    return { ok: false, checked: true, problems: [`Лид #${leadId} не найден в amoCRM (удалён?)`], leadStatusId: null };
  }
  const statusId = Number(lead.status_id) || null;
  if (statusId !== AMO_WON_STATUS_ID) {
    const name = statusNames[statusId] ? `«${statusNames[statusId]}»` : `#${statusId}`;
    problems.push(`Лид #${leadId} в amoCRM не закрыт как «Успешно реализовано» (сейчас этап ${name})`);
  }

  const key = phoneKey(buyerPhone);
  if (!key) {
    problems.push('В брони нет телефона покупателя — нельзя проверить, что клиент новый');
  } else {
    let found;
    try {
      found = await amoGet(`/contacts?query=${encodeURIComponent(key)}&limit=50`, opts);
    } catch (e) {
      return { ok: false, checked: false, problems: [...problems, `Не удалось проверить покупателя в amoCRM: ${e.message}`], leadStatusId: statusId };
    }
    const bookedAt = Math.floor(new Date(bookingCreatedAt).getTime() / 1000);
    const earlier = (found?._embedded?.contacts || []).filter((c) => {
      // Поиск amoCRM нечёткий: убеждаемся, что телефон контакта действительно совпадает
      const phones = (c.custom_fields_values || [])
        .filter((f) => f.field_code === 'PHONE')
        .flatMap((f) => (f.values || []).map((v) => phoneKey(v.value)));
      return phones.includes(key) && Number(c.created_at) < bookedAt;
    });
    if (earlier.length) {
      const first = earlier.reduce((a, b) => (Number(a.created_at) <= Number(b.created_at) ? a : b));
      const date = new Date(Number(first.created_at) * 1000).toLocaleDateString('ru-RU');
      problems.push(`Покупатель уже был в базе отдела продаж до брони: контакт «${first.name || 'без имени'}» #${first.id} от ${date}`);
    }
  }

  return { ok: problems.length === 0, checked: true, problems, leadStatusId: statusId };
}
