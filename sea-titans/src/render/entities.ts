import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { angleDiff } from '../core/fixed';
import type { Registry } from '../data/registry';
import { LAYERS } from '../data/registry';
import { Facing, Mover, Owner, Position, Unit } from '../sim/components';
import { unitQuery, type SimWorld } from '../sim/world';
import { hexToNum, type HeightField, type Iso } from './iso';
import type { SpriteSet } from './sprites';

interface View {
  body: Container;
  base: Sprite;
  mask: Sprite | null;
  shadow: Sprite;
  ring: Graphics;
  set: SpriteSet;
  seen: number;
}

/** Мир → спрайты. Только читает симуляцию, интерполирует между тиками. */
export class EntityRenderer {
  private readonly views = new Map<number, View>();
  private frame = 0;
  /** Экранная (в px мира) точка «тела» юнита за последний кадр — для выделения мышью. */
  readonly bodyPos = new Map<number, { x: number; y: number; r: number }>();

  constructor(
    private readonly reg: Registry,
    private readonly sprites: Map<string, SpriteSet>,
    private readonly iso: Iso,
    private readonly heights: HeightField,
    private readonly shadowLayer: Container,
    private readonly unitLayer: Container,
    private readonly shadowTex: Texture,
  ) {}

  sync(w: SimWorld, alpha: number, selected: Set<number>): void {
    this.frame++;
    const ents = unitQuery(w.ecs);
    const layerPx = this.reg.render.layerHeightPixels;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]!;
      const v = this.views.get(e) ?? this.create(e);
      v.seen = this.frame;
      const x = (Position.px[e]! + (Position.x[e]! - Position.px[e]!) * alpha) / 1024;
      const y = (Position.py[e]! + (Position.y[e]! - Position.py[e]!) * alpha) / 1024;
      const a = (Facing.prev[e]! + angleDiff(Facing.prev[e]!, Facing.angle[e]!) * alpha) & 0xffff;
      const ground = this.heights.sample(x, y);
      const sx = this.iso.x(x, y);
      const gy = this.iso.y(x, y, Math.max(0, ground));
      const hover = layerPx[LAYERS[Mover.layer[e]!]!] ?? 20;
      // лёгкое покачивание в толще воды
      const bob = Math.sin(this.frame * 0.03 + Unit.sid[e]! * 1.7) * 1.5;
      const dir = Math.round((a / 65536) * v.set.directions) % v.set.directions;

      v.shadow.position.set(sx, gy);
      v.ring.position.set(sx, gy);
      v.ring.visible = selected.has(e);
      v.body.position.set(sx, gy - hover + bob);
      v.body.zIndex = gy;
      v.base.texture = v.set.base[dir]!;
      if (v.mask) v.mask.texture = v.set.mask![dir]!;
      this.bodyPos.set(e, { x: sx, y: gy - hover, r: v.set.length * this.iso.hw * 0.5 });
    }
    for (const [e, v] of this.views) {
      if (v.seen === this.frame) continue;
      v.body.destroy({ children: true });
      v.shadow.destroy();
      v.ring.destroy();
      this.views.delete(e);
      this.bodyPos.delete(e);
    }
  }

  private create(e: number): View {
    const def = this.reg.units[Unit.def[e]!]!;
    const set = this.sprites.get(def.raw.sprite)!;
    const team = hexToNum(this.reg.render.teamColors[Owner.player[e]!] ?? '#ffffff');
    const body = new Container();
    const base = new Sprite(set.base[0]);
    base.anchor.set(set.anchor[0], set.anchor[1]);
    body.addChild(base);
    let mask: Sprite | null = null;
    if (set.mask) {
      mask = new Sprite(set.mask[0]);
      mask.anchor.set(set.anchor[0], set.anchor[1]);
      mask.tint = team;
      mask.alpha = 0.9;
      body.addChild(mask);
    }
    const shadow = new Sprite(this.shadowTex);
    shadow.anchor.set(0.5);
    const len = set.length * this.iso.hw * 1.3;
    shadow.width = len * 1.6;
    shadow.height = len * 0.8;
    shadow.alpha = 0.45;
    const ring = new Graphics()
      .ellipse(0, 0, len * 0.75, len * 0.375)
      .stroke({ width: 2, color: 0x6dff9e, alpha: 0.9 });
    ring.visible = false;
    this.shadowLayer.addChild(shadow, ring);
    this.unitLayer.addChild(body);
    const v: View = { body, base, mask, shadow, ring, set, seen: 0 };
    this.views.set(e, v);
    return v;
  }
}
