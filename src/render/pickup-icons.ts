import * as THREE from 'three';
import type { Pickup, WeaponId } from '../shared/contracts';

/** Icon per drop: the three protection/economy drops and one per main weapon, so a weapon drop names its gun. */
export type PickupIcon = 'shield' | 'power' | 'credit' | `weapon-${WeaponId}`;
export const PICKUP_ICONS: readonly PickupIcon[] = ['shield', 'power', 'credit', 'weapon-pulse', 'weapon-fan', 'weapon-seeker', 'weapon-rail'];
export const pickupIcon = (pickup: Pick<Pickup, 'kind' | 'weapon'>): PickupIcon =>
  // A part shows the credit icon until it has its own (docs/33, workstream B).
  pickup.kind === 'weapon' ? `weapon-${pickup.weapon ?? 'pulse'}` : pickup.kind === 'part' ? 'credit' : pickup.kind;

/** World size of an icon sprite (the frame fills about 80% of it; the rest is its glow). */
export const PICKUP_ICON_SIZE = 1.15;
const SIZE = 256, C = SIZE / 2;

/**
 * Drop icons painted once on canvases (render-only). Antialiased 2D paths with mipmaps replace the old thin
 * flat-shape geometry, which shimmered and stair-stepped at phone resolution. Each category keeps a distinct
 * frame shape (hexagon shield, diamond power, square-diamond credit, rounded rectangle weapon) so it reads
 * without relying on colour; weapon drops show their firing pattern: twin bolts, a five-way fan, homing arcs, one slug
 * piercing a column of targets.
 */
export function createPickupIconTextures(maxAnisotropy = 4): Map<PickupIcon, THREE.CanvasTexture> {
  const textures = new Map<PickupIcon, THREE.CanvasTexture>();
  for (const icon of PICKUP_ICONS) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
    const g = canvas.getContext('2d');
    if (g) paint(g, icon);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = maxAnisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
    textures.set(icon, texture);
  }
  return textures;
}

const TINT: Record<PickupIcon, string> = {
  shield: '#8ff0dc', power: '#ffe2a6', credit: '#ffd06a', 'weapon-pulse': '#d4bcff', 'weapon-fan': '#d4bcff', 'weapon-seeker': '#d4bcff', 'weapon-rail': '#d4bcff',
};

function polygon(g: CanvasRenderingContext2D, sides: number, radius: number, rotation: number): void {
  g.beginPath();
  for (let i = 0; i < sides; i++) { const a = rotation + i / sides * Math.PI * 2; g.lineTo(C + Math.cos(a) * radius, C + Math.sin(a) * radius); }
  g.closePath();
}
function roundedRect(g: CanvasRenderingContext2D, w: number, h: number, r: number): void {
  g.beginPath(); g.roundRect(C - w / 2, C - h / 2, w, h, r);
}

function paint(g: CanvasRenderingContext2D, icon: PickupIcon): void {
  const tint = TINT[icon];
  g.lineJoin = 'round'; g.lineCap = 'round';
  // Frame: soft outer glow, a dark translucent body and a bright border.
  const frame = () => {
    if (icon === 'shield') polygon(g, 6, 98, Math.PI / 6);
    else if (icon === 'power') polygon(g, 4, 108, -Math.PI / 2);
    else if (icon === 'credit') polygon(g, 4, 100, -Math.PI / 2);
    else roundedRect(g, 196, 150, 30);
  };
  g.save(); g.shadowColor = tint; g.shadowBlur = 26; frame(); g.fillStyle = 'rgba(14, 24, 30, 0.88)'; g.fill(); g.restore();
  frame(); g.lineWidth = 11; g.strokeStyle = tint; g.stroke();
  frame(); g.save(); g.clip(); g.lineWidth = 22; g.strokeStyle = 'rgba(255,255,255,0.08)'; g.stroke(); g.restore();
  // Glyph, with a faint glow of its own.
  g.save(); g.shadowColor = tint; g.shadowBlur = 12; g.fillStyle = tint; g.strokeStyle = tint;
  if (icon === 'shield') {
    g.beginPath(); g.moveTo(C - 44, C - 46); g.lineTo(C, C - 58); g.lineTo(C + 44, C - 46); g.lineTo(C + 44, C - 2);
    g.quadraticCurveTo(C + 44, C + 30, C, C + 56); g.quadraticCurveTo(C - 44, C + 30, C - 44, C - 2); g.closePath(); g.fill();
    g.shadowBlur = 0; g.fillStyle = 'rgba(14, 24, 30, 0.9)';
    g.beginPath(); g.moveTo(C - 24, C - 30); g.lineTo(C, C - 36); g.lineTo(C + 24, C - 30); g.lineTo(C + 24, C - 2);
    g.quadraticCurveTo(C + 24, C + 16, C, C + 32); g.quadraticCurveTo(C - 24, C + 16, C - 24, C - 2); g.closePath(); g.fill();
  } else if (icon === 'power') {
    g.lineWidth = 20;
    for (const dy of [14, -22]) { g.beginPath(); g.moveTo(C - 40, C + dy + 22); g.lineTo(C, C + dy - 18); g.lineTo(C + 40, C + dy + 22); g.stroke(); }
  } else if (icon === 'credit') {
    polygon(g, 4, 46, -Math.PI / 2); g.fill();
    g.shadowBlur = 0; g.fillStyle = 'rgba(14, 24, 30, 0.9)'; polygon(g, 4, 20, -Math.PI / 2); g.fill();
  } else if (icon === 'weapon-pulse') {
    // Twin straight bolts.
    g.lineWidth = 18;
    for (const x of [-26, 26]) { g.beginPath(); g.moveTo(C + x, C + 42); g.lineTo(C + x, C - 42); g.stroke(); }
    for (const x of [-26, 26]) { g.beginPath(); g.arc(C + x, C - 46, 12, 0, Math.PI * 2); g.fill(); }
  } else if (icon === 'weapon-fan') {
    // Five rays fanning out from the muzzle.
    g.lineWidth = 12;
    for (const a of [-34, -17, 0, 17, 34]) {
      const r = THREE.MathUtils.degToRad(a);
      g.beginPath(); g.moveTo(C, C + 44); g.lineTo(C + Math.sin(r) * 92, C + 44 - Math.cos(r) * 92); g.stroke();
    }
    g.beginPath(); g.arc(C, C + 44, 12, 0, Math.PI * 2); g.fill();
  } else if (icon === 'weapon-rail') {
    // One heavy slug piercing a column of three targets.
    g.lineWidth = 10;
    for (const y of [-30, 0, 30]) { g.beginPath(); g.arc(C, C + y, 17, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 14; g.beginPath(); g.moveTo(C, C + 60); g.lineTo(C, C - 60); g.stroke();
    g.beginPath(); g.moveTo(C - 15, C - 46); g.lineTo(C, C - 72); g.lineTo(C + 15, C - 46); g.closePath(); g.fill();
  } else {
    // Two homing arcs curling onto a target ring.
    g.lineWidth = 12;
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(C + side * 56, C + 46); g.bezierCurveTo(C + side * 70, C - 6, C + side * 30, C - 36, C + side * 10, C - 30); g.stroke(); }
    g.lineWidth = 10; g.beginPath(); g.arc(C, C - 30, 20, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(C, C - 30, 6, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
