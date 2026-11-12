// Предварительная сделка в amoCRM при брони: тексты и выключатели.
import {
  isLeadOnBookingEnabled, isCloseReleasedEnabled, AMO_STATUS_CLOSED_LOST,
  preliminaryLeadNote, releasedLeadNote,
} from '../../server/amoBookingLead.js';

let fails = 0;
const check = (n, c, x) => { console.log(`${c ? '✅' : '❌'} ${n}${c ? '' : ' → ' + JSON.stringify(x)}`); if (!c) fails++; };

check('лид при брони включён по умолчанию', isLeadOnBookingEnabled({}) === true);
check('лид при брони выключается', isLeadOnBookingEnabled({ AMOCRM_LEAD_ON_BOOKING: 'false' }) === false);
check('закрытие снятых броней по умолчанию', isCloseReleasedEnabled({}) === true);
check('закрытие выключается', isCloseReleasedEnabled({ AMOCRM_CLOSE_RELEASED_LEADS: 'false' }) === false);
check('статус «не реализовано» = 143', AMO_STATUS_CLOSED_LOST === 143);

const note = preliminaryLeadNote({
  unit: { number: '162', floor: 6, rooms: 1, area: 40.2, price: 5200000, project_id: 'mnh' },
  projectName: 'Манхэттен',
  agent: { name: 'Аделя', company: 'ИП Абдуллаева', phone: '+79270000000' },
  expiresAt: '2026-11-14T09:00:00Z',
});
check('квартира и проект', note.includes('№162') && note.includes('этаж 6') && note.includes('Манхэттен'), note);
check('цена', /5\s200\s000 ₽/u.test(note), note);
check('риелтор', note.includes('Аделя, ИП Абдуллаева') && note.includes('+79270000000'), note);
check('срок брони по Москве', note.includes('14.11.2026') && note.includes('12:00') && note.includes('МСК'), note);
check('просьба не продавать', note.includes('не продавать'), note);
check('нет полей покупателя', !/Покупатель:|Телефон покупателя/.test(note), note);

const sparse = preliminaryLeadNote({ unit: {}, agent: {} });
check('без данных не падает', sparse.includes('№?') && sparse.includes('Риелтор: —'), sparse);

check('истёкшая бронь', releasedLeadNote({ reason: 'expired_72h' }).includes('истёк срок брони'));
check('снял риелтор', releasedLeadNote({ reason: 'cancelled_by_agent' }).includes('риелтор снял бронь'));
check('снял админ', releasedLeadNote({ reason: 'cancelled_by_admin' }).includes('администратор'));
check('неизвестная причина', releasedLeadNote({ reason: 'x' }).includes('бронь отменена'));

if (fails) { console.error(`\n${fails} проверок не прошло`); process.exit(1); }
console.log('\nВсе проверки пройдены');
