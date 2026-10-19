import { defineComponent, Types } from 'bitecs';

// Позиции в fixed-point (1 тайл = 1024). px/py — значения прошлого тика для интерполяции.
export const Position = defineComponent({ x: Types.i32, y: Types.i32, px: Types.i32, py: Types.i32 });
export const Velocity = defineComponent({ x: Types.i32, y: Types.i32 });
/** u16-угол; prev — для интерполяции. */
export const Facing = defineComponent({ angle: Types.ui16, prev: Types.ui16 });
export const Owner = defineComponent({ player: Types.ui8 });
/** def — индекс в Registry.units; sid — порядковый id внутри мира (eid в bitecs глобальны). */
export const Unit = defineComponent({ def: Types.ui16, sid: Types.ui32 });
export const Health = defineComponent({ hp: Types.i32, maxHp: Types.i32, armor: Types.i32 });
/** speed/radius в единицах симуляции; hold — удержание; cls — класс размера для пути. Здания: speed 0, hold 1. */
export const Mover = defineComponent({ speed: Types.i32, radius: Types.i32, layer: Types.ui8, hold: Types.ui8, cls: Types.ui8 });
/** cd — тиков до выстрела; target — eid цели или -1; engaged — в бою на этом тике. */
export const Weapon = defineComponent({ cd: Types.i32, target: Types.i32, engaged: Types.ui8 });
/** state: 0 — ручное/ожидание, 1 — к месторождению, 2 — добыча, 3 — к базе. */
export const Harvester = defineComponent({ state: Types.ui8, node: Types.i32, carry: Types.i32, timer: Types.i32 });
export const Building = defineComponent();
export const ResourceNode = defineComponent({ amount: Types.i32, max: Types.i32, sid: Types.ui32 });
export const Selectable = defineComponent();
