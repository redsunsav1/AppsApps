// Предварительная сделка в amoCRM при брони: тексты и выключатели.
import {
  isLeadOnBookingEnabled, isCloseReleasedEnabled, AMO_STATUS_CLOSED_LOST,
  preliminaryLeadNote, releasedLeadNote,
  formatCompany, agentFromUser, formatAgentLine, formatClientLine, buildLeadName, buildLeadContacts,
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

// --- Агент и клиент одной строкой
check('ИП из профиля не дублируется', formatCompany('ИП Абдуллаева', 'ip') === 'ИП Абдуллаева');
check('тип добавляется к голому названию', formatCompany('Абдуллаева', 'ip') === 'ИП Абдуллаева' && formatCompany('Этажи', 'agency') === 'АН Этажи');
const ag = agentFromUser({ first_name: 'Аделя', last_name: 'Туршатова', company: 'Абдуллаева', company_type: 'ip', phone: '+79270000000' });
check('строка агента: ФИО · ИП · телефон', formatAgentLine(ag) === 'Аделя Туршатова · ИП Абдуллаева · +79270000000', formatAgentLine(ag));
check('агент из старой брони без профиля', formatAgentLine(agentFromUser({}, { user_name: 'Борис', user_company: 'ООО Дом', user_phone: '+7111' })) === 'Борис · ООО Дом · +7111');
check('строка клиента: ФИО · телефон', formatClientLine({ name: 'Поддубный Александр', phone: '+79780000000' }) === 'Поддубный Александр · +79780000000');
const nm = buildLeadName({ unit: { number: '162', rooms: 1, area: 40.2, floor: 6 }, projectName: 'Манхэттен', agent: ag, buyer: { name: 'Поддубный Александр' } });
check('название сделки с агентом и клиентом', nm.includes('кв.162') && nm.includes('Манхэттен') && nm.includes('агент Аделя Туршатова, ИП Абдуллаева') && nm.includes('клиент Поддубный Александр'), nm);
check('без клиента в названии только агент', !buildLeadName({ unit: { number: '1' }, agent: ag }).includes('клиент'));
const cs = buildLeadContacts({ agent: ag, buyer: { name: 'Поддубный Александр', phone: '+79780000000' } });
check('клиент — первый контакт с телефоном', cs[0].first_name === 'Поддубный Александр' && cs[0].custom_fields_values[0].values[0].value === '+79780000000', cs);
check('агент — второй контакт', cs.length === 2 && cs[1].first_name.startsWith('Агент: Аделя Туршатова') && cs[1].custom_fields_values[0].values[0].value === '+79270000000', cs[1]);
check('без клиента — только агент', buildLeadContacts({ agent: ag }).length === 1);

if (fails) { console.error(`\n${fails} проверок не прошло`); process.exit(1); }
console.log('\nВсе проверки пройдены');
