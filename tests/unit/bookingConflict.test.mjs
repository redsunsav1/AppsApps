// Алерт «Конфликт брони»: в тексте квартира, ЖК, риелтор и стадия;
// подтверждённые сделки конфликтом не считаются.
import { formatBookingConflictAlert, CONFLICT_IGNORED_STAGES } from '../../server/bookingConflict.js';

let fails = 0;
const check = (n, c, x) => { console.log(`${c ? '✅' : '❌'} ${n}${c ? '' : ' → ' + JSON.stringify(x)}`); if (!c) fails++; };

check('COMPLETE не конфликт', CONFLICT_IGNORED_STAGES.includes('COMPLETE'));
check('CANCELLED не конфликт', CONFLICT_IGNORED_STAGES.includes('CANCELLED'));
check('DOCS_SENT — конфликт', !CONFLICT_IGNORED_STAGES.includes('DOCS_SENT'));

const text = formatBookingConflictAlert({
  unitId: '16039556',
  projectId: 'mnh',
  row: {
    id: 42, stage: 'PASSPORT_SENT', created_at: '2026-11-03T10:00:00Z',
    first_name: 'Анна', last_name: 'Петрова', company: 'Агентство <Дом>', phone: '+79990001122',
    buyer_name: 'Иван Иванов', buyer_phone: '+79995554433', amocrm_lead_id: '777',
    unit_number: '128', unit_floor: 9, unit_area: 54.3, project_name: 'Манхэттен',
  },
});
check('есть ЖК и номер квартиры', text.includes('ЖК «Манхэттен»') && text.includes('кв. №128'), text);
check('есть риелтор и телефон', text.includes('Анна Петрова') && text.includes('+79990001122'), text);
check('HTML экранирован', text.includes('Агентство &lt;Дом&gt;') && !text.includes('<Дом>'), text);
check('стадия по-русски', text.includes('паспорт отправлен застройщику'), text);
check('покупатель и лид', text.includes('Иван Иванов') && text.includes('Лид amoCRM: 777'), text);
check('дата брони', text.includes('03.11.2026'), text);
check('id из фида остался для поиска', text.includes('16039556'), text);

const fallback = formatBookingConflictAlert({ unitId: '1', projectId: 'p', row: undefined });
check('без деталей не падает', fallback.includes('Конфликт брони') && fallback.includes('вручную'), fallback);

const legacy = formatBookingConflictAlert({ unitId: '1', projectId: 'p', row: { id: 1, user_name: 'Старый Риелтор', user_phone: '+7000' } });
check('старая бронь без профиля — берёт имя из брони', legacy.includes('Старый Риелтор') && legacy.includes('+7000') && legacy.includes('кв. №?'), legacy);

if (fails) { console.error(`\n${fails} проверок не прошло`); process.exit(1); }
console.log('\nВсе проверки пройдены');
