// BlockBenchAI FORGE — deterministic benchmark presets.
//
// Every generator is a pure function of (style/kind, palette): no network,
// no randomness, no clock. The same arguments always produce the same parts,
// so benchmarks double as regression tests.
//
// Humanoid + prop sculpt data below is ported 1:1 from the verified v0.5.x
// builders (same coordinates, same paint specs); FORGE only adds the knight
// style, the crystal golem and the mech walker.

import type { MaterialName, PaintedPart } from './types';
import { fail } from './validate';

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  skin: string;
}

export interface BenchmarkDef {
  id: string;
  label: string;
  kind: string;
  minParts: number;
  blurb: string;
}

export const CHARACTER_STYLES: string[] = ['android_villager', 'robot', 'villager', 'knight'];
export const PROP_KINDS: string[] = ['energy_sword', 'sci_fi_drone', 'treasure_chest', 'crystal_golem', 'mech_walker'];

export function benchmarkDefs(): BenchmarkDef[] {
  return [
    { id: 'android_villager', label: 'Androide aldeano', kind: 'character', minParts: 75, blurb: 'Humanoide articulado con placas, servos y rostro iluminado.' },
    { id: 'robot', label: 'Robot', kind: 'character', minParts: 75, blurb: 'Variante robot completa del esqueleto articulado.' },
    { id: 'knight', label: 'Caballero', kind: 'character', minParts: 80, blurb: 'Armadura de placas con yelmo, penacho y detalles dorados.' },
    { id: 'energy_sword', label: 'Espada de energía', kind: 'prop', minParts: 30, blurb: 'Hoja con runas, guarda alada y núcleo luminoso.' },
    { id: 'sci_fi_drone', label: 'Dron sci-fi', kind: 'prop', minParts: 55, blurb: 'Quad con cámara, reactor, trenes de aterrizaje y rotores.' },
    { id: 'treasure_chest', label: 'Cofre del tesoro', kind: 'prop', minParts: 35, blurb: 'Cofre con herrajes, cerradura con gema y remaches.' },
    { id: 'crystal_golem', label: 'Gólem de cristal', kind: 'prop', minParts: 28, blurb: 'Bruto rocoso con núcleo y esquirlas de gema.' },
    { id: 'mech_walker', label: 'Mech bípedo', kind: 'prop', minParts: 30, blurb: 'Caminante acorazado con cabina, cañón y piernas dobles.' },
  ];
}

function paintFor(base: string, material: MaterialName, accent: string, marks?: any[]): any {
  return { base: base, material: material, accent: accent, noise: 0.07, marks: marks || [] };
}

function markRect(face: string, x: number, y: number, color: string, w: number, h: number): any {
  return { face: face, shape: 'rect', x: x, y: y, color: color, width: w, height: h };
}

// ---------------------------------------------------------------------------
// Humanoids (front faces -Z). Coordinates identical to the v0.5.x builder.
// ---------------------------------------------------------------------------

export function humanoidParts(style: string, palette: Palette): PaintedPart[] {
  const primary = palette.primary;
  const secondary = palette.secondary;
  const accent = palette.accent;
  const skin = palette.skin;
  const isAndroid = style === 'android_villager' || style === 'robot';
  const light = '#A8B9C1';
  const dark = '#192129';
  const gold = '#D6AA53';
  const P: PaintedPart[] = [];
  const part = function (n: string, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: string, material: MaterialName, accentColor?: string, marks?: any[]): void {
    P.push({
      name: n,
      from: [x1, y1, z1],
      to: [x2, y2, z2],
      paint: paintFor(c, material || 'metal', accentColor || accent, marks),
    });
  };
  part('Core | Torso', -4, 13, -2.6, 4, 24, 2.6, primary, 'metal');
  part('Chest | Armor', -3.8, 18, -3.15, 3.8, 23.1, -2.55, secondary, 'metal', accent, [
    markRect('north', 5, 5, accent, 6, 2),
    markRect('north', 7, 9, gold, 2, 2),
  ]);
  part('Core | Power Cell', -1.6, 16.4, -3.8, 1.6, 19.3, -3.1, accent, 'gem');
  part('Backplate', -3.7, 16, 2.6, 3.7, 23.7, 3.35, secondary, 'metal');
  part('Waist | Belt', -4.4, 12, -3.0, 4.4, 14, 3.0, secondary, 'metal');
  part('Waist | Buckle', -1.2, 12.2, -3.5, 1.2, 13.8, -3.0, gold, 'metal');
  part('Neck | Servo', -1.5, 23.6, -1.5, 1.5, 26, 1.5, secondary, 'circuit');
  part('Head | Skull', -4, 25, -4.0, 4, 33.1, 3.8, isAndroid ? secondary : skin, isAndroid ? 'metal' : 'skin', accent, [
    markRect('north', 3, 6, accent, 3, 2),
    markRect('north', 10, 6, accent, 3, 2),
    markRect('north', 7, 10, dark, 2, 1),
  ]);
  part('Head | Faceplate', -3.6, 26, -4.35, 3.6, 31.5, -4.0, isAndroid ? primary : skin, 'metal', accent, [
    markRect('north', 3, 5, accent, 3, 2),
    markRect('north', 10, 5, accent, 3, 2),
    markRect('north', 6, 11, dark, 4, 1),
  ]);
  part('Villager | Nose', -1.1, 26.8, -6.2, 1.1, 30.2, -4.3, isAndroid ? light : skin, isAndroid ? 'metal' : 'skin');
  part('Eyebrow | Left', -3.0, 30.7, -4.5, -0.8, 31.2, -4.1, secondary, 'metal');
  part('Eyebrow | Right', 0.8, 30.7, -4.5, 3.0, 31.2, -4.1, secondary, 'metal');
  part('Jaw | Lower', -3.1, 25.3, -4.5, 3.1, 26.4, -3.75, primary, 'metal');
  part('Head | Top Panel', -4.1, 33.0, -4.1, 4.1, 34.0, 3.8, secondary, 'metal');
  part('Head | Crest', -2, 34, -2.5, 2, 34.8, 1.3, accent, 'gem');
  part('Ear | Left Servo', -4.8, 28, -1.8, -4, 31, 1.6, secondary, 'circuit');
  part('Ear | Right Servo', 4, 28, -1.8, 4.8, 31, 1.6, secondary, 'circuit');
  part('Antenna | Stem', 1.8, 34, 0, 2.2, 36.5, 0.4, light, 'metal');
  part('Antenna | Tip', 1.3, 36.4, -0.5, 2.7, 37.7, 0.9, accent, 'gem');
  const sides = [-1, 1];
  for (let s = 0; s < sides.length; s++) {
    const side = sides[s];
    const prefix = side < 0 ? 'Left' : 'Right';
    const a = side < 0 ? [-6, -4.1] : [4.1, 6];
    const outer = side < 0 ? [-7.1, -4.1] : [4.1, 7.1];
    const joint = side < 0 ? -5.55 : 5.55;
    part(prefix + ' | Shoulder', outer[0], 20.4, -2.7, outer[1], 24, 2.7, primary, 'metal');
    part(prefix + ' | Shoulder Rim', outer[0] - 0.15, 23, -2.95, outer[1] + 0.15, 24.4, 2.95, light, 'metal');
    part(prefix + ' | Upper Arm', a[0], 16.3, -2, a[1], 21.2, 2, secondary, 'metal');
    part(prefix + ' | Elbow Joint', joint - 1, 15.4, -2.2, joint + 1, 17.3, 2.2, accent, 'circuit');
    part(prefix + ' | Forearm', outer[0], 11.3, -2.5, outer[1], 16.2, 2.5, primary, 'metal');
    part(prefix + ' | Wrist Ring', outer[0] - 0.2, 11, -2.7, outer[1] + 0.2, 12, 2.7, light, 'metal');
    part(prefix + ' | Hand', a[0] - 0.3, 8, -2, a[1] + 0.3, 11.5, 2, secondary, 'metal');
    for (let finger = 0; finger < 3; finger++) {
      const dx = outer[0] + 0.3 + finger * 0.8;
      part(prefix + ' | Finger ' + (finger + 1), dx, 6.5, -1.5, dx + 0.48, 8.1, 1.1, light, 'metal');
    }
    const lx = side < 0 ? -2.3 : 2.3;
    part(prefix + ' | Hip', lx - 1.75, 10.8, -2.35, lx + 1.75, 13.3, 2.35, secondary, 'metal');
    part(prefix + ' | Thigh', lx - 1.65, 6.2, -2, lx + 1.65, 11, 2, primary, 'metal');
    part(prefix + ' | Knee Servo', lx - 1.7, 5.8, -2.4, lx + 1.7, 7.3, 2.4, accent, 'circuit');
    part(prefix + ' | Shin', lx - 1.6, 1.9, -1.8, lx + 1.6, 6.2, 1.8, secondary, 'metal');
    part(prefix + ' | Shin Plate', lx - 1.5, 2.5, -2.15, lx + 1.5, 5.5, -1.8, primary, 'metal');
    part(prefix + ' | Boot', lx - 1.9, 0, -3.9, lx + 1.9, 2.5, 2.4, secondary, 'metal');
    part(prefix + ' | Boot Toe', lx - 1.85, 0, -4.5, lx + 1.85, 1.4, -3.9, light, 'metal');
  }
  if (isAndroid) {
    part('Back | Battery', -2, 15.5, 3.35, 2, 21.5, 4.55, secondary, 'circuit');
    part('Back | Battery LED', -0.8, 17.2, 4.5, 0.8, 19.9, 5.1, accent, 'gem');
    part('Torso | Service Vent Left', -3.6, 14.7, -3.35, -1.6, 16.6, -3.05, dark, 'circuit');
    part('Torso | Service Vent Right', 1.6, 14.7, -3.35, 3.6, 16.6, -3.05, dark, 'circuit');
  }
  const pupil = style === 'villager' ? '#214A55' : accent;
  part('Face | Left Lens', -2.8, 29.25, -4.55, -1.15, 30.35, -4.34, pupil, 'gem');
  part('Face | Right Lens', 1.15, 29.25, -4.55, 2.8, 30.35, -4.34, pupil, 'gem');
  part('Face | Nasal Seam', -0.95, 27.0, -6.29, 0.95, 27.3, -6.15, dark, 'metal');
  part('Face | Speaker', -1.5, 25.9, -4.65, 1.5, 26.45, -4.43, secondary, 'circuit');
  part('Face | Cheek Vent L', -3.45, 26.9, -4.53, -2.45, 28.4, -4.34, dark, 'circuit');
  part('Face | Cheek Vent R', 2.45, 26.9, -4.53, 3.45, 28.4, -4.34, dark, 'circuit');
  part('Chest | Collar Left', -3.45, 22.55, -3.37, -0.25, 23.2, -3.14, light, 'metal');
  part('Chest | Collar Right', 0.25, 22.55, -3.37, 3.45, 23.2, -3.14, light, 'metal');
  part('Chest | Left Detail', -3.4, 18.6, -3.43, -2.9, 21.5, -3.14, gold, 'metal');
  part('Chest | Right Detail', 2.9, 18.6, -3.43, 3.4, 21.5, -3.14, gold, 'metal');
  part('Waist | Front Buckle Detail', -0.5, 12.5, -3.7, 0.5, 13.5, -3.46, accent, 'gem');
  for (let s = 0; s < sides.length; s++) {
    const side = sides[s];
    const tag = side < 0 ? 'Left' : 'Right';
    const sx = side < 0 ? -5.6 : 5.6;
    const leg = side < 0 ? -2.3 : 2.3;
    part(tag + ' | Shoulder Inset', sx - 1, 21.7, -3.04, sx + 1, 23.0, -2.73, secondary, 'metal');
    part(tag + ' | Bicep Connector', sx - 0.72, 17.65, -2.38, sx + 0.72, 18.9, -1.99, accent, 'circuit');
    part(tag + ' | Elbow Bolt', sx - 0.45, 15.9, -2.51, sx + 0.45, 16.8, -2.15, gold, 'metal');
    part(tag + ' | Wrist Indicator', sx - 0.65, 11.5, -2.95, sx + 0.65, 11.92, -2.7, accent, 'gem');
    part(tag + ' | Knee Emblem', leg - 0.6, 6.05, -2.7, leg + 0.6, 6.85, -2.39, gold, 'metal');
    part(tag + ' | Boot Seam', leg - 1.65, 1.7, -4.08, leg + 1.65, 2.03, -3.9, light, 'metal');
  }
  if (style === 'knight') {
    part('Head | Helm Dome', -4.2, 32.6, -4.2, 4.2, 34.4, 4.0, primary, 'metal');
    part('Head | Visor Slit', -3.0, 29.6, -4.62, 3.0, 30.1, -4.4, dark, 'plain');
    part('Head | Plume Base', -0.7, 34.3, -1.8, 0.7, 35.2, 1.0, gold, 'metal');
    part('Head | Plume', -0.45, 35.1, -2.6, 0.45, 37.6, 1.6, accent, 'fabric');
    part('Chest | Tabard Plate', -2.2, 13.9, -3.3, 2.2, 18.2, -3.0, secondary, 'fabric', gold, [markRect('north', 6, 3, gold, 4, 6)]);
    part('Chest | Gorget', -2.6, 23.0, -2.6, 2.6, 24.2, 2.4, light, 'metal');
    for (let s = 0; s < sides.length; s++) {
      const side = sides[s];
      const tag = side < 0 ? 'Left' : 'Right';
      const px = side < 0 ? -7.3 : 5.9;
      part(tag + ' | Pauldron', px, 22.6, -3.1, px + 1.4, 25.2, 3.1, primary, 'metal');
      part(tag + ' | Pauldron Trim', px - 0.1, 22.4, -3.2, px + 1.5, 22.9, 3.2, gold, 'metal');
      part(tag + ' | Gauntlet', side < 0 ? -6.6 : 4.4, 8.2, -2.3, side < 0 ? -4.4 : 6.6, 11.4, 2.3, secondary, 'metal');
      part(tag + ' | Sabaton', side < 0 ? -4.4 : 0.6, 0, -5.0, side < 0 ? -0.6 : 4.4, 1.2, 2.6, secondary, 'metal');
    }
  }
  return P;
}

// ---------------------------------------------------------------------------
// Props (coordinates identical to the v0.5.x builders).
// ---------------------------------------------------------------------------

export function propParts(kind: string, palette: Palette): PaintedPart[] {
  const primary = palette.primary;
  const secondary = palette.secondary;
  const accent = palette.accent;
  const gold = '#DBB768';
  const steel = '#AFBCC9';
  const dark = '#151F2B';
  const wood = '#79543E';
  const P: PaintedPart[] = [];
  const push = function (name: string, a: number, b: number, c: number, d: number, e: number, f: number, base: string, mat: MaterialName, trim?: string): void {
    P.push({ name: name, from: [a, b, c], to: [d, e, f], paint: { base: base, material: mat || 'metal', accent: trim || accent, noise: 0.065 } });
  };
  if (kind === 'energy_sword') {
    push('Grip | Main', -0.85, 0, -0.7, 0.85, 6, 0.7, wood, 'wood');
    push('Grip | Core', -0.55, 1, -0.85, 0.55, 5.5, -0.7, secondary, 'metal');
    push('Hilt | Pommel', -1.35, -1, -1.0, 1.35, 0.3, 1.0, secondary, 'metal');
    push('Hilt | Gem', -0.62, -1.25, -1.18, 0.62, -0.1, -0.98, accent, 'gem');
    push('Hilt | Collar', -1, 5.4, -1, 1, 6.6, 1, steel, 'metal');
    push('Hilt | Guard', -4.8, 6, -1.1, 4.8, 7.3, 1.1, secondary, 'metal');
    push('Hilt | Guard Core', -2, 6, -1.45, 2, 7.7, -1.05, gold, 'metal');
    push('Hilt | Center Jewel', -0.85, 6.3, -1.75, 0.85, 7.6, -1.4, accent, 'gem');
    push('Blade | Body', -1.55, 7, -0.68, 1.55, 24.8, 0.68, steel, 'metal');
    push('Blade | Midrib', -0.45, 7, -1.0, 0.45, 24.7, -0.7, primary, 'metal');
    push('Blade | Tip', -0.95, 24.7, -0.45, 0.95, 27.2, 0.45, steel, 'metal');
    push('Blade | Tip Crest', -0.45, 27.1, -0.2, 0.45, 28.5, 0.2, accent, 'gem');
    push('Blade | Core Glow', -0.24, 8, -1.18, 0.24, 24.4, -0.98, accent, 'gem');
    const signs = [-1, 1];
    for (let q = 0; q < signs.length; q++) {
      const sign = signs[q];
      const label = sign < 0 ? 'Left' : 'Right';
      const x = sign < 0 ? -1.8 : 1.55;
      push(label + ' Blade | Edge', x, 8, -0.43, x + 0.25, 24.3, 0.43, primary, 'metal');
      push(label + ' Blade | Tip Facet', sign < 0 ? -1.14 : 0.95, 24.5, -0.57, sign < 0 ? -0.96 : 1.13, 26.5, 0.57, gold, 'metal');
      push(label + ' Guard | Wing', sign < 0 ? -4.8 : 2.65, 7, -0.75, sign < 0 ? -2.6 : 4.85, 8.25, 0.75, primary, 'metal');
      push(label + ' Guard | Cap', sign < 0 ? -5.25 : 4.55, 7.35, -0.9, sign < 0 ? -4.5 : 5.3, 8.9, 0.9, gold, 'metal');
      push(label + ' Guard | Highlight', sign < 0 ? -4.7 : 2.8, 7.2, -1.0, sign < 0 ? -2.8 : 4.7, 7.55, -0.79, accent, 'circuit');
      for (let bnd = 0; bnd < 4; bnd++) {
        push(label + ' Grip | Binding ' + (bnd + 1), sign < 0 ? -1.05 : 0.8, 0.6 + bnd * 1.25, -0.91, sign < 0 ? -0.8 : 1.05, 1.08 + bnd * 1.25, 0.91, gold, 'metal');
      }
      for (let rn = 0; rn < 4; rn++) {
        push(label + ' Blade | Rune ' + (rn + 1), sign < 0 ? -1.08 : 0.87, 10 + rn * 3, -0.79, sign < 0 ? -0.67 : 1.08, 10.5 + rn * 3, -0.67, accent, 'gem');
      }
    }
  } else if (kind === 'sci_fi_drone') {
    push('Chassis | Core', -3.4, 7, -3.1, 3.4, 10.7, 3.1, primary, 'metal');
    push('Chassis | Top Shell', -3, 10.65, -2.75, 3, 11.65, 2.75, secondary, 'metal');
    push('Chassis | Bottom Plate', -3.15, 6.45, -2.95, 3.15, 7.25, 2.95, secondary, 'metal');
    push('Chassis | Center Reactor', -1.45, 11.6, -1.45, 1.45, 12.25, 1.45, accent, 'gem');
    push('Camera | Front Housing', -1.5, 7.4, -4.2, 1.5, 9.8, -3.05, secondary, 'metal');
    push('Camera | Lens', -0.8, 7.9, -4.65, 0.8, 9.35, -4.15, accent, 'gem');
    push('Camera | Lens Ring', -1.07, 7.65, -4.32, 1.07, 9.65, -4.1, gold, 'metal');
    push('Power | Battery', -2.05, 7, 3.1, 2.05, 9.9, 4.25, secondary, 'circuit');
    push('Power | Battery Light', -0.65, 8, 4.2, 0.65, 9.05, 4.55, accent, 'gem');
    push('Sensor | Antenna', -0.19, 11.5, 1.5, 0.19, 13.95, 1.9, steel, 'metal');
    push('Sensor | Antenna Tip', -0.65, 13.75, 1.05, 0.65, 14.55, 2.35, accent, 'gem');
    const xs = [-1, 1];
    const zs = [-1, 1];
    for (let xi = 0; xi < 2; xi++) {
      for (let zi = 0; zi < 2; zi++) {
        const x = xs[xi];
        const z = zs[zi];
        const tag = (x < 0 ? 'L' : 'R') + (z < 0 ? 'F' : 'B');
        const ax = x * 7;
        const az = z * 7;
        push(tag + ' Arm | Beam', Math.min(x * 2.0, ax) - 0.55, 8, Math.min(z * 2.1, az) - 0.56, Math.max(x * 2.0, ax) + 0.55, 9.25, Math.max(z * 2.1, az) + 0.56, primary, 'metal');
        push(tag + ' Motor | Housing', ax - 1.6, 8.0, az - 1.6, ax + 1.6, 10.7, az + 1.6, secondary, 'metal');
        push(tag + ' Motor | Core', ax - 0.7, 10.6, az - 0.7, ax + 0.7, 11.4, az + 0.7, accent, 'gem');
        push(tag + ' Rotor | Hub', ax - 0.65, 11.4, az - 0.65, ax + 0.65, 12, az + 0.65, steel, 'metal');
        push(tag + ' Rotor | Blade X', ax - 3, 11.9, az - 0.28, ax + 3, 12.2, az + 0.28, steel, 'metal');
        push(tag + ' Rotor | Blade Z', ax - 0.28, 11.9, az - 3, ax + 0.28, 12.2, az + 3, steel, 'metal');
        push(tag + ' Rotor | Blade Tip A', ax - 3.3, 11.83, az - 0.4, ax - 2.7, 12.27, az + 0.4, accent, 'gem');
        push(tag + ' Rotor | Blade Tip B', ax + 2.7, 11.83, az - 0.4, ax + 3.3, 12.27, az + 0.4, accent, 'gem');
        push(tag + ' Landing | Strut', ax - 0.28, 4.7, az - 0.28, ax + 0.28, 8.2, az + 0.28, dark, 'metal');
        push(tag + ' Landing | Foot', ax - 1.5, 4.3, az - 1.0, ax + 1.5, 4.9, az + 1, secondary, 'metal');
      }
    }
    for (let vn = 0; vn < 4; vn++) {
      const vx = -2.3 + vn * 1.5;
      push('Chassis | Vent ' + vn, vx, 9, -3.3, vx + 0.7, 9.5, -3.1, dark, 'circuit');
      push('Chassis | Trim ' + vn, vx, 10.7, -3.0, vx + 0.7, 10.85, -2.7, gold, 'metal');
    }
  } else if (kind === 'treasure_chest') {
    push('Body | Base', -7.5, 0, -4.5, 7.5, 7, 4.5, wood, 'wood');
    push('Body | Upper Lid', -8.1, 6, -5.1, 8.1, 10.5, 5.1, wood, 'wood');
    push('Body | Lid Top', -8.1, 10.3, -5.1, 8.1, 11.2, 5.1, primary, 'metal');
    push('Lock | Housing', -2.1, 4, -5.65, 2.1, 8.4, -4.5, gold, 'metal');
    push('Lock | Keyhole', -0.52, 5, -5.8, 0.52, 6.8, -5.55, dark, 'plain');
    push('Lock | Core Gem', -0.9, 7, -5.88, 0.9, 8.2, -5.7, accent, 'gem');
    const edges = [-1, 1];
    for (let ei = 0; ei < edges.length; ei++) {
      const side = edges[ei];
      const ex = side < 0 ? -8.4 : 7.6;
      const tag = side < 0 ? 'Left' : 'Right';
      push(tag + ' Edge | Vertical', ex, 0.1, -5.3, ex + 0.8, 10.8, 5.3, gold, 'metal');
      push(tag + ' Edge | Top Corner', ex, 10.3, -5.4, ex + 0.8, 11.5, 5.4, primary, 'metal');
      push(tag + ' Hinge | Housing', ex, 7.4, 4.3, ex + 0.8, 10.4, 5.3, secondary, 'metal');
      for (let rv = 0; rv < 3; rv++) {
        push(tag + ' Rivet | Front ' + rv, ex + 0.1, 1.6 + rv * 3, -5.7, ex + 0.7, 2.2 + rv * 3, -5.3, steel, 'metal');
      }
    }
    const faces = [-1, 1];
    for (let fi = 0; fi < faces.length; fi++) {
      const sign = faces[fi];
      const fz = sign < 0 ? -5.15 : 4.35;
      const label = sign < 0 ? 'Front' : 'Back';
      for (let hz = 0; hz < 3; hz++) {
        const hy = 1.15 + hz * 3.0;
        push(label + ' Trim | Horizontal ' + hz, -8.2, hy, fz, 8.2, hy + 0.48, fz + 0.8, primary, 'metal');
      }
      for (let rx = -6; rx <= 6; rx += 3) {
        push(label + ' Rivet | X' + rx, rx - 0.3, 7.5, fz - 0.2, rx + 0.3, 8.1, fz + 0.2, gold, 'metal');
      }
    }
    for (let st = 0; st < 4; st++) {
      const sx = -6.4 + st * 4;
      push('Lid | Steel Strap ' + st, sx, 7.2, -5.3, sx + 0.8, 11.5, 5.3, secondary, 'metal');
      push('Lid | Gold Inlay ' + st, sx + 0.1, 10.8, -5.2, sx + 0.7, 11.4, 5.2, gold, 'metal');
    }
    push('Base | Foot Left', -7.2, -1, -3.7, -5.6, 0.1, 3.7, dark, 'stone');
    push('Base | Foot Right', 5.6, -1, -3.7, 7.2, 0.1, 3.7, dark, 'stone');
  } else if (kind === 'crystal_golem') {
    const rock = '#6B6259';
    const moss = '#4E6B46';
    push('Torso | Core', -4, 8, -3, 4, 18, 3, rock, 'stone');
    push('Torso | Chest Boulder', -3.4, 14, -3.6, 3.4, 18.4, -2.6, rock, 'stone');
    push('Torso | Heart Crystal', -1.4, 12.6, -3.9, 1.4, 15.4, -3.2, accent, 'gem');
    push('Torso | Moss Patch', -3.8, 9.5, -3.2, -0.5, 12.5, -2.9, moss, 'fabric');
    push('Head | Boulder', -2.6, 18.2, -2.6, 2.6, 22.4, 2.4, rock, 'stone');
    push('Head | Brow Ridge', -2.8, 20.2, -3.0, 2.8, 21.2, -2.4, secondary, 'stone');
    push('Head | Left Eye', -1.9, 19.6, -3.1, -0.7, 20.4, -2.7, accent, 'gem');
    push('Head | Right Eye', 0.7, 19.6, -3.1, 1.9, 20.4, -2.7, accent, 'gem');
    push('Head | Jaw Slab', -1.8, 18.3, -2.8, 1.8, 19.3, -1.8, rock, 'stone');
    push('Head | Crown Shard', -0.8, 22.3, -0.8, 0.8, 24.6, 0.8, accent, 'gem');
    const limbs = [-1, 1];
    for (let li = 0; li < limbs.length; li++) {
      const side = limbs[li];
      const tag = side < 0 ? 'Left' : 'Right';
      const sx = side < 0 ? -5.4 : 5.4;
      push(tag + ' | Shoulder Boulder', sx - 1.8, 14.5, -2.2, sx + 1.8, 18.5, 2.2, rock, 'stone');
      push(tag + ' | Shard Pauldron', sx - 1.2, 18.4, -1.4, sx + 1.2, 20.6, 1.4, accent, 'gem');
      push(tag + ' | Upper Arm', sx - 1.4, 10.5, -1.6, sx + 1.4, 14.8, 1.6, rock, 'stone');
      push(tag + ' | Fist', sx - 1.7, 7.6, -1.9, sx + 1.7, 10.8, 1.9, secondary, 'stone');
      push(tag + ' | Knuckle Shard', sx - 1.2, 8.6, -2.4, sx + 1.2, 9.6, -1.9, accent, 'gem');
      const hx = side < 0 ? -2.6 : 2.6;
      push(tag + ' | Hip Boulder', hx - 1.7, 5.6, -2.2, hx + 1.7, 8.4, 2.2, rock, 'stone');
      push(tag + ' | Thigh', hx - 1.5, 2.6, -1.8, hx + 1.5, 5.9, 1.8, rock, 'stone');
      push(tag + ' | Foot Slab', hx - 1.8, 0, -3.2, hx + 1.8, 2.8, 2.2, secondary, 'stone');
    }
    push('Back | Shard Cluster A', -2.4, 15.5, 2.8, -0.6, 19.5, 4.2, accent, 'gem');
    push('Back | Shard Cluster B', 0.6, 14.0, 2.8, 2.4, 18.0, 4.2, accent, 'gem');
  } else if (kind === 'mech_walker') {
    push('Chassis | Pelvis', -3, 10, -2.4, 3, 13, 2.4, secondary, 'metal');
    push('Chassis | Reactor', -1.4, 10.4, -2.9, 1.4, 12.4, -2.3, accent, 'gem');
    push('Cockpit | Tub', -2.6, 13, -2.2, 2.6, 17.5, 2.2, primary, 'metal');
    push('Cockpit | Canopy', -2.0, 15.2, -2.7, 2.0, 17.2, -2.1, accent, 'gem');
    push('Cockpit | Canopy Frame', -2.3, 14.9, -2.75, 2.3, 15.4, -2.05, secondary, 'metal');
    push('Cockpit | Roof', -2.7, 17.4, -2.3, 2.7, 18.2, 2.3, secondary, 'metal');
    push('Sensor | Mast', 2.2, 18.1, 1.2, 2.5, 20.6, 1.5, steel, 'metal');
    push('Sensor | Dish', 1.7, 20.5, 0.7, 3.0, 21.2, 2.0, primary, 'metal');
    push('Weapon | Cannon Mount', -4.4, 13.4, -1.2, -2.6, 15.2, 1.2, secondary, 'metal');
    push('Weapon | Cannon Barrel', -7.6, 13.9, -0.4, -4.3, 14.7, 0.4, dark, 'metal');
    push('Weapon | Muzzle Glow', -8.1, 14.0, -0.3, -7.5, 14.6, 0.3, accent, 'gem');
    push('Weapon | Ammo Drum', -4.2, 15.3, -1.4, -2.8, 16.7, 1.4, primary, 'metal');
    const legs = [-1, 1];
    for (let gi = 0; gi < legs.length; gi++) {
      const side = legs[gi];
      const tag = side < 0 ? 'Left' : 'Right';
      const lx = side < 0 ? -2.2 : 2.2;
      push(tag + ' | Hip Joint', lx - 1.3, 8.6, -1.8, lx + 1.3, 10.4, 1.8, accent, 'circuit');
      push(tag + ' | Upper Leg', lx - 1.2, 5.2, -1.5, lx + 1.2, 8.9, 1.5, primary, 'metal');
      push(tag + ' | Knee Piston', lx - 0.5, 4.2, -1.9, lx + 0.5, 5.6, 1.9, steel, 'metal');
      push(tag + ' | Knee Plate', lx - 1.3, 4.0, -2.1, lx + 1.3, 5.4, -1.4, secondary, 'metal');
      push(tag + ' | Lower Leg', lx - 1.0, 1.4, -1.2, lx + 1.0, 4.4, 1.2, secondary, 'metal');
      push(tag + ' | Ankle Guard', lx - 1.2, 0.9, -1.6, lx + 1.2, 1.8, 1.6, gold, 'metal');
      push(tag + ' | Foot', lx - 1.6, 0, -2.8, lx + 1.6, 1.1, 2.0, dark, 'metal');
      push(tag + ' | Toe Plate', lx - 1.5, 0, -3.6, lx + 1.5, 0.7, -2.7, primary, 'metal');
      push(tag + ' | Side Thruster', side < 0 ? lx - 1.9 : lx + 0.7, 6.0, -0.6, side < 0 ? lx - 0.7 : lx + 1.9, 8.2, 0.6, secondary, 'circuit');
    }
    for (let ex = 0; ex < 3; ex++) {
      push('Chassis | Exhaust ' + ex, -2 + ex * 1.6, 12.2, 2.3, -1.2 + ex * 1.6, 13.0, 3.1, dark, 'metal');
    }
  } else {
    fail('Unsupported prop type.');
  }
  return P;
}

export function defaultPalette(style: string): Palette {
  if (style === 'knight') return { primary: '#7A8894', secondary: '#3A4450', accent: '#D6AA53', skin: '#BA9B79' };
  if (style === 'villager') return { primary: '#6B7B5E', secondary: '#4A4438', accent: '#D6AA53', skin: '#BA9B79' };
  if (style === 'robot') return { primary: '#5E6E7A', secondary: '#2C3640', accent: '#E05A3A', skin: '#8A8F96' };
  return { primary: '#566876', secondary: '#303842', accent: '#55D8E8', skin: '#B69B79' };
}

export function propPalette(kind: string): Palette {
  if (kind === 'crystal_golem') return { primary: '#6B6259', secondary: '#3E4A52', accent: '#5FE3F0', skin: '#6B6259' };
  if (kind === 'mech_walker') return { primary: '#6E7B5A', secondary: '#333C47', accent: '#FF9A3C', skin: '#6B6259' };
  return { primary: '#627B8A', secondary: '#2C3B49', accent: '#54DFEC', skin: '#BA9B79' };
}
