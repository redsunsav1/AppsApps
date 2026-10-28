-- Тестовые данные для сквозных проверок. Накатываются после первого запуска сервера,
-- когда схема уже создана, и до второго — чтобы старое золото ушло в журнал как legacy.
INSERT INTO users (id, telegram_id, first_name, last_name, company, phone, is_registered, is_admin, approval_status, consent_pd, gold_balance, balance) VALUES
  (1, 1001, 'Админ',  NULL,      'ГК',        '+79990000001', TRUE,  TRUE,  'approved', TRUE,  0,  0),
  (2, 1002, 'Анна',   'Петрова', 'Агентство', '+79990000002', TRUE,  FALSE, 'approved', TRUE,  10, 0),
  (3, 1003, 'Борис',  'Иванов',  'ИП Иванов', '+79990000003', TRUE,  FALSE, 'approved', TRUE,  0,  0),
  (4, 1004, 'Вера',   NULL,      'Новички',   '+79990000004', TRUE,  FALSE, 'pending',  TRUE,  0,  0),
  -- Зарегистрирован до появления отдельных согласий: consent_pd остался FALSE.
  (5, 1005, 'Глеб',   'Старый',  'Давно с нами', '+79990000005', TRUE, FALSE, 'approved', FALSE, 0, 0);
SELECT setval(pg_get_serial_sequence('users', 'id'), 100);

INSERT INTO projects (id, name, floors, units_per_floor) VALUES ('p1', 'ЖК Один', 2, 2), ('p2', 'ЖК Два', 2, 2);
INSERT INTO units (id, project_id, floor, number, rooms, area, price, status) VALUES
  ('u1', 'p1', 1, '1', 1, 40, 5000000, 'SOLD'),
  ('u2', 'p2', 1, '1', 2, 60, 7000000, 'SOLD'),
  ('u3', 'p1', 2, '3', 1, 41, 5100000, 'FREE');
INSERT INTO bookings (id, user_id, unit_id, project_id, stage, amocrm_lead_id, buyer_phone, buyer_name) VALUES
  (101, 3, 'u1', 'p1', 'DOCS_SENT', '5001', '+79991112233', 'Покупатель Один'),
  (102, 3, 'u2', 'p2', 'DOCS_SENT', '5002', '+79991112244', 'Покупатель Два');
SELECT setval(pg_get_serial_sequence('bookings', 'id'), 1000);
INSERT INTO news (title, text) VALUES ('Старт продаж', 'Открыли новую секцию');
INSERT INTO mortgage_programs (name, rate) VALUES ('Семейная', 6);
-- Как на проде до магазина: квест за продажу раздавал золото по кнопке.
INSERT INTO quests (type, title, reward_xp, reward_amount, reward_currency, is_active)
VALUES ('DEAL', 'Продать 2-к квартиру', 100, 10, 'GOLD', TRUE);
