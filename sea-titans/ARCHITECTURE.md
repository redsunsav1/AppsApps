# «Морские титаны: Разлом»: архитектура v0.1

Это документ по разделу 11 ТЗ («первое, что жду»): структура, модули, конфиги, ECS, план этапа 1, вопросы. Кода пока нет, жду «ок».

Игра живёт в отдельной папке `sea-titans/` со своим `package.json`. Запуск: `cd sea-titans && npm i && npm run dev`. Основное приложение репозитория она не затрагивает.

---

## 1. Стек (подтверждаю из ТЗ, Godot не предлагаю)

| Слой | Выбор | Почему |
|---|---|---|
| Язык/сборка | TypeScript strict + Vite | как в ТЗ |
| Рендер | PixiJS v8 (WebGL2, fallback WebGPU выключен) | фильтры, `ParticleContainer`, свои шейдеры |
| ECS | **bitecs 0.4** | SoA-массивы (Float32Array) дают 300+ юнитов дёшево, состояние сериализуется в сейв почти бесплатно |
| Симуляция | фиксированные 20 тиков/с, **fixed-point** (целые, 1 тайл = 1024 ед.) | детерминизм: одинаковый сид и приказы дают одинаковый результат, это нужно для headless-баланса и реплеев |
| RNG | свой `xoshiro128**`, по потоку на систему (карта, бой, ИИ) | детерминизм не зависит от порядка вызовов |
| Путь | A* (одиночные) + flow field (группы ≥ 6), кэш полей по цели | раздел 6 |
| Воркеры | на этапе 1 нет. Пасфайндинг и ИИ спрятаны за async-интерфейсом, чтобы потом переехать в Worker без переписывания | |
| UI | **HTML/CSS-оверлей поверх canvas** (Preact, 4 КБ) | металлические панели с заклёпками проще и чётче сделать в CSS, чем рисовать в Pixi. Миникарта остаётся canvas |
| Звук | Howler.js + jsfxr для процедурных эффектов, глобальный lowpass через WebAudio | раздел 9 |
| Сейвы | IndexedDB через `idb-keyval`, слоты + автосейв | |
| Тесты | Vitest (логика), отдельный `npm run sim` для headless-матчей | |

Предлагаю **Preact для UI** вместо голого DOM: меню, энциклопедия и статистика иначе превратятся в ручную сборку DOM. `[РЕШИТЬ]`

---

## 2. Структура папок

```
sea-titans/
├─ GAME_SPEC.md              # ТЗ (копия)
├─ ARCHITECTURE.md
├─ package.json  vite.config.ts  tsconfig.json  vitest.config.ts
├─ index.html
├─ data/                     # ВСЕ числа игры. Код их только читает
│  ├─ schema/                # zod-схемы, валидация при старте и в тестах
│  ├─ combat.json            # типы урона/брони, матрица множителей
│  ├─ resources.json
│  ├─ factions/
│  │  ├─ white_sharks/       # faction.json, units.json, buildings.json, tech.json
│  │  ├─ black_octopi/
│  │  ├─ silicons/
│  │  ├─ deep_ones/
│  │  └─ rift_lizards/
│  ├─ maps/templates/        # 10 шаблонов генератора (параметры, не карты)
│  ├─ ai/                    # профили сложности и стили фракций
│  └─ balance/               # глобальные коэффициенты (скорость игры, вет-бонусы)
├─ assets/
│  ├─ manifest.json          # id ассета → атлас/кадры/направления/якорь/маска цвета
│  ├─ placeholder/           # генерируются скриптом
│  └─ atlases/               # финальные (из Blender)
├─ tools/
│  ├─ blender/render_sprites.py   # рендер модели в 16 направлениях + маска команды
│  ├─ pack-atlas.ts               # упаковка в атлас + обновление manifest
│  ├─ gen-placeholders.ts         # процедурные силуэты
│  └─ balance-sim.ts              # headless ИИ vs ИИ, все пары фракций → CSV
├─ src/
│  ├─ main.ts
│  ├─ core/                  # без зависимостей от Pixi/DOM (работает в Node)
│  │  ├─ fixed.ts            # fixed-point математика
│  │  ├─ rng.ts
│  │  ├─ loop.ts             # аккумулятор тиков, alpha для интерполяции
│  │  └─ events.ts           # шина событий симуляции → рендер/звук/UI
│  ├─ data/                  # загрузка + валидация конфигов, типизированный реестр
│  ├─ sim/                   # ДЕТЕРМИНИРОВАННАЯ логика, Node-совместима
│  │  ├─ world.ts            # bitecs world + тик-счётчик
│  │  ├─ components.ts
│  │  ├─ commands.ts         # приказы игрока/ИИ (единственный вход в симуляцию)
│  │  ├─ systems/            # movement, steering, pathing, economy, build, produce,
│  │  │                      # combat, projectile, vision, death, research, veterancy …
│  │  ├─ map/                # grid, terrain, passability, spatial hash
│  │  ├─ path/               # astar.ts, flowfield.ts, cache.ts
│  │  └─ factions/           # хуки уникальных механик (darkness.ts, rift.ts, …)
│  ├─ mapgen/                # генератор: шаблон + сид → MapData (чистые функции)
│  ├─ ai/                    # strategic / tactical / micro, видит только через vision
│  ├─ render/                # Pixi, только читает world
│  │  ├─ iso.ts              # проекции мир↔экран, сортировка по глубине
│  │  ├─ camera.ts
│  │  ├─ terrain.ts          # чанки тайлов 32×32 в RenderTexture, биом-переходы
│  │  ├─ entities.ts         # пул спрайтов, выбор кадра по направлению, интерполяция
│  │  ├─ fog.ts
│  │  ├─ fx/                 # caustics, godrays, particles, explosions, lights
│  │  └─ shaders/            # .frag/.vert (teamcolor, caustics, water-post, shockwave)
│  ├─ input/                 # мышь/клавиатура → commands, хоткеи из конфига
│  ├─ ui/                    # Preact: hud, minimap, menus, encyclopedia, stats
│  ├─ audio/
│  └─ save/                  # сериализация world + RNG-состояний + очереди команд
└─ tests/                    # зеркалит src/sim, src/mapgen
```

**Главное правило:** `sim/`, `mapgen/`, `ai/` не импортируют ничего из `render/`, `ui/`, `audio/`. Это проверяет ESLint-правило `no-restricted-imports`. Благодаря этому headless-баланс и тесты работают в Node.

---

## 3. Поток данных

```
input / AI ──► Command[] (очередь на тик N+1)
                    │
           ┌────────▼─────────┐  20 Гц, fixed-point
           │ sim: systems[]   │──► SimEvent[] (shot, death, built, alert …)
           └────────┬─────────┘          │
                    │ prev/curr pos      ├─► audio
                    ▼                    ├─► fx (взрывы, пузыри)
           render (60+ FPS, lerp alpha)  └─► ui (оповещения, статистика)
```

Порядок систем в тике (фиксированный):
`commands → research → economy → production → construction → ai-orders → pathing → steering → movement → vision → targeting → weapons → projectiles → damage → death → veterancy → cleanup`.

---

## 4. Формат конфигов

JSON + zod-схема. Ссылки по строковым id, при загрузке строится реестр с числовыми индексами для ECS. Время задаётся в секундах, скорость в тайлах/с, дальность в тайлах. Перевод в тики и fixed-point делает загрузчик, поэтому в конфигах читаемые числа.

`data/combat.json` (черновик матрицы «камень-ножницы-бумага», `[ПРОВЕРИТЬ]` баланс):

```json
{
  "damageTypes": ["torpedo", "kinetic", "energy", "explosive", "bio", "thermal"],
  "armorTypes":  ["light", "medium", "heavy", "structure", "organic", "titan"],
  "matrix": {
    "torpedo":   { "light": 0.75, "medium": 1.0,  "heavy": 1.25, "structure": 1.0,  "organic": 1.0,  "titan": 1.0 },
    "kinetic":   { "light": 1.25, "medium": 1.0,  "heavy": 0.6,  "structure": 0.5,  "organic": 1.1,  "titan": 0.5 },
    "energy":    { "light": 1.0,  "medium": 1.2,  "heavy": 1.0,  "structure": 0.8,  "organic": 1.3,  "titan": 0.9 },
    "explosive": { "light": 0.8,  "medium": 1.0,  "heavy": 1.0,  "structure": 1.5,  "organic": 0.9,  "titan": 0.8 },
    "bio":       { "light": 1.2,  "medium": 1.0,  "heavy": 0.7,  "structure": 0.4,  "organic": 0.5,  "titan": 0.7 },
    "thermal":   { "light": 1.0,  "medium": 1.1,  "heavy": 1.2,  "structure": 1.1,  "organic": 1.3,  "titan": 1.0 }
  },
  "armorFlatReduction": true,
  "minDamage": 1
}
```

Юнит (`data/factions/white_sharks/units.json`, один элемент):

```json
{
  "id": "ws_hunter",
  "name": "Охотник",
  "role": "универсальная подлодка",
  "tier": 1,
  "cost": { "metal": 120, "gold": 0, "corium": 0 },
  "supply": { "oxygen": 2 },
  "buildTime": 18,
  "producedBy": ["ws_shipyard"],
  "requires": [],
  "hp": 320, "armor": 3, "armorType": "medium",
  "speed": 2.2, "turnRate": 180, "radius": 0.45,
  "sight": 7, "layer": "mid",
  "weapons": [{
    "id": "ws_light_torpedo", "damageType": "torpedo", "damage": 28,
    "range": 6, "cooldown": 2.0, "projectile": "torpedo_small",
    "projectileSpeed": 6, "accuracy": 0.85, "splash": 0, "targets": ["mid", "low"]
  }],
  "abilities": [],
  "sprite": "ws_hunter",
  "sounds": "sub_light"
}
```

Здания и технологии устроены так же (`footprint`, `provides: { oxygen: 10 }`, `unlocks`, `effects: [{ "stat": "hp", "mul": 1.1, "filter": { "tag": "sub" } }]`).

Манифест ассетов (`assets/manifest.json`):

```json
{
  "ws_hunter": {
    "atlas": "placeholder/units.json",
    "directions": 16,
    "anims": { "move": { "frames": 4, "fps": 8 }, "attack": { "frames": 3, "fps": 12 }, "death": { "frames": 8, "fps": 12 } },
    "anchor": [0.5, 0.7],
    "teamMask": true
  }
}
```

Чтобы заменить плейсхолдер финальным спрайтом, достаточно поменять `atlas`, код не трогается.

---

## 5. ECS-компоненты (bitecs, SoA)

| Компонент | Поля | Комментарий |
|---|---|---|
| `Position` | x, y, z (i32 fixed), px, py (прошлый тик, для lerp) | z: высота над дном для слоёв |
| `Velocity` | vx, vy | |
| `Facing` | angle (u16, 0..65535) | направление спрайта = angle·16/65536 |
| `Owner` | player (u8) | |
| `Kind` | defIndex (u16) | индекс в реестре конфигов |
| `Health` | hp, maxHp, armor, armorType | |
| `Selectable` | radius | |
| `Mover` | speed, turnRate, layer, radius | |
| `PathFollow` | pathId, waypointIdx, flowFieldId | путь хранится в пуле вне ECS |
| `Steering` | sepWeight, formationSlot, groupId | |
| `OrderQueue` | head, len (кольцо в общем пуле) | move/attack/amove/patrol/hold/stop/retreat, Shift-очереди |
| `Weapon` (×N через `WeaponSlot`) | weaponDef, cooldownLeft, targetEid | |
| `Projectile` | weaponDef, sourceEid, targetEid, tx, ty, ttl | |
| `Vision` | sight | |
| `Building` | footprintW, footprintH, buildProgress, state | |
| `Producer` | queue[5], progress, rallyX, rallyY | |
| `Harvester` | carry, capacity, resType, targetNode, dropoff, state | |
| `ResourceNode` | resType, amount | |
| `Dropoff` | accepts (bitmask) | |
| `Supply` | provides, consumes | кислород, энергия, матки |
| `Veterancy` | xp, level | |
| `Wreck` | metal, biomass, decay | обломки: металл для людей, биомасса для Глубоководных |
| `LightSource` | radius, intensity | влияет на механику Тьмы и на рендер |
| `Stealth` | mode (dark/burrow/cloak), revealedUntil | |
| `Dead` | tick | помечается и удаляется в cleanup, рендер успевает проиграть анимацию |

Пространственный индекс: uniform grid 4×4 тайла, перестраивается раз в тик. Туман: `Uint8Array` на игрока (0 не разведано, 1 разведано, 2 видно) плюс счётчик видящих на клетку для инкрементального обновления.

---

## 6. Ключевые решения

1. **Изометрия:** логика в декартовой сетке тайлов, изометрия только в рендере (`iso.ts`). Тайл 64×32 px.
2. **Слои глубины:** у подлодок `layer: low | mid | high` (дно / толща / у поверхности). В оригинале подлодки ходили на разной глубине `[ПРОВЕРИТЬ]`. Предлагаю 3 слоя только для оружия и коллизий, без отдельной проходимости. Можно и упростить до одного.
3. **Карта 256×256** рендерится чанками 32×32, каждый запекается в `RenderTexture` один раз. Декор лежит в `ParticleContainer`.
4. **Цвет команды:** шейдер `teamcolor.frag` перекрашивает пиксели по маске (альфа-канал второго атласа).
5. **Сейв** = снимок всех SoA-массивов + пулов + RNG + тик. Из-за детерминизма можно хранить ещё и реплей (сид + команды).

---

## 7. План этапа 1 «Каркас»

Цель: `npm run dev` открывает карту-заглушку, на ней 30 юнитов-плейсхолдеров. Их можно выделять и водить, они объезжают скалы и не слипаются.

| # | Задача | Файлы |
|---|---|---|
| 1 | Проект: Vite, TS strict, ESLint с запретом импортов sim→render, Vitest | `package.json`, конфиги |
| 2 | `fixed.ts`, `rng.ts`, `loop.ts` (20 Гц + интерполяция), тесты детерминизма | `src/core/*` |
| 3 | Загрузчик конфигов + zod-схемы (юнит, комбат), 3 тестовых юнита | `src/data`, `data/` |
| 4 | bitecs world, компоненты Position/Velocity/Facing/Owner/Kind/Mover/Selectable/OrderQueue | `src/sim` |
| 5 | Тестовая карта 128×128 (шум + скалы), сетка проходимости | `src/sim/map` |
| 6 | A* (octile, 8 направлений, сглаживание пути) + flow field + кэш | `src/sim/path` + тесты |
| 7 | Steering: separation, arrival, обход соседей; формация «коробка» при групповом move | `systems/steering.ts` |
| 8 | Рендер: изо-тайлы чанками, камера (WASD/стрелки/края, зум колесом 0.5–2×), сортировка по глубине | `src/render` |
| 9 | Плейсхолдеры: процедурная генерация атласа (силуэт подлодки × 16 направлений + маска) и manifest | `tools/gen-placeholders.ts` |
| 10 | Ввод: клик, рамка, Shift, двойной клик, Ctrl+1..9, ПКМ move, Shift-очереди, S = стоп, H = держать | `src/input` |
| 11 | Базовая атмосфера уже здесь: синий тинт + туман по глубине + простые каустики (дальше этап 7) | `render/fx` |
| 12 | Отладочный оверлей: FPS, тик, сетка, пути, flow field (F3) | `render/debug.ts` |

Критерий: 300 юнитов на 256×256 держат ≥ 60 FPS в Chrome. Тест детерминизма (1000 тиков с одинаковыми командами дают одинаковый хэш мира) зелёный.

Размер: примерно 3–4 тыс. строк.

---

## 8. Вопросы к тебе

1. **UI на Preact** поверх canvas вместо Pixi-UI: ок?
2. **Слои глубины** (п. 6.2): 3 слоя, 1 слой или полноценная 3D-проходимость? Как это было в оригинале, по памяти?
3. **Ресурсы людей:** в оригинале, насколько помню, были металл, золото, корий и кислород, а у Силиконов вместо кислорода энергия `[ПРОВЕРИТЬ]`. Были ли харвестеры отдельными юнитами, а «месторождения» объектами на дне?
4. **Титаны:** по одному на игрока одновременно, или ограничение только ценой?
5. **Скорость прокрутки и хоткеи:** раскладка как в оригинале или «сетка» (Q W E R / A S D F / Z X C V) как в SC2/AoE?
6. **Blender MCP:** он доступен только на твоей машине, а в этой облачной сессии его нет. Значит, ассеты в Blender рендеришь ты по моему скрипту `tools/blender/render_sprites.py`, а я готовлю скрипт и спецификацию моделей (полигонаж, ракурс 30°/45°, освещение). Подходит?
7. **Размер тайла 64×32** и разрешение спрайтов юнитов (~96–160 px для обычных, ~400 px для титана): ок?
8. **Fixed-point** даёт абсолютный детерминизм, но код получается чуть многословнее. Альтернатива: float с «почти детерминизмом» на одной машине. Для одиночной игры без сети хватит и его, но headless-баланс между запусками может слегка расходиться. Я за fixed-point. Ок?

После «ок» (и ответов) начинаю этап 1.
