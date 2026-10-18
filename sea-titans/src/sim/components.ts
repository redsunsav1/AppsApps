import { defineComponent, Types } from 'bitecs';

// Позиции в fixed-point (1 тайл = 1024). px/py — значения прошлого тика для интерполяции.
export const Position = defineComponent({ x: Types.i32, y: Types.i32, px: Types.i32, py: Types.i32 });
export const Velocity = defineComponent({ x: Types.i32, y: Types.i32 });
/** u16-угол; prev — для интерполяции поворота. */
export const Facing = defineComponent({ angle: Types.ui16, prev: Types.ui16 });
export const Owner = defineComponent({ player: Types.ui8 });
/** def — индекс в Registry.units; sid — порядковый id внутри мира (eid в bitecs глобальны). */
export const Unit = defineComponent({ def: Types.ui16, sid: Types.ui32 });
export const Health = defineComponent({ hp: Types.i32, maxHp: Types.i32 });
/** speed/turnRate/radius в единицах симуляции; cur — текущая скорость; hold — удержание; cls — класс размера для пути. */
export const Mover = defineComponent({
  speed: Types.i32, turnRate: Types.i32, radius: Types.i32, layer: Types.ui8, cur: Types.i32, hold: Types.ui8, cls: Types.ui8,
});
export const Selectable = defineComponent();
