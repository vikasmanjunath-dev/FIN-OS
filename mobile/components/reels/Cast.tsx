import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { Mood } from '@/lib/reels/types';

/** The fourteen people the story series follow. Vector art like Mitra: no image files, and every picture is a pure function of the mood and the clock `t` (ms),
 *  so they bob, blink and gesture without an animation library, and a reduced-motion screen can freeze them by passing a fixed `t`. */
export type CastId = 'aarav' | 'meera' | 'imran' | 'kavya' | 'rohan' | 'devika' | 'neha' | 'dev' | 'arjun' | 'riya' | 'kabir' | 'neel' | 'isha' | 'sana';
export const CAST_IDS: CastId[] = ['aarav', 'meera', 'imran', 'kavya', 'rohan', 'devika', 'neha', 'dev', 'arjun', 'riya', 'kabir', 'neel', 'isha', 'sana'];

interface Look { skin: string; hair: string; shirt: string; shirtDark: string; style: 'short' | 'long' | 'cap' | 'bun' | 'curly' | 'bob'; glasses?: boolean; beard?: boolean }
const LOOKS: Record<CastId, Look> = {
  aarav: { skin: '#E0A375', hair: '#1F1A17', shirt: '#3B82F6', shirtDark: '#2563EB', style: 'short' },
  meera: { skin: '#C98A5E', hair: '#1A1210', shirt: '#14B8A6', shirtDark: '#0F8F82', style: 'long' },
  imran: { skin: '#D39A6B', hair: '#2A2420', shirt: '#22A06B', shirtDark: '#177A50', style: 'cap', beard: true },
  kavya: { skin: '#E6B58A', hair: '#2B1B14', shirt: '#F59E0B', shirtDark: '#C97F00', style: 'bun', glasses: true },
  rohan: { skin: '#B9784C', hair: '#150F0C', shirt: '#6B7280', shirtDark: '#4B5563', style: 'curly' },
  devika: { skin: '#D69B70', hair: '#3A3340', shirt: '#8B5CF6', shirtDark: '#6D3FD8', style: 'bob' },
  neha: { skin: '#D9A07A', hair: '#241914', shirt: '#EC4899', shirtDark: '#BE2E78', style: 'long', glasses: true },
  dev: { skin: '#C48559', hair: '#1D1613', shirt: '#EF4444', shirtDark: '#C02F2F', style: 'short', beard: true },
  arjun: { skin: '#B97E54', hair: '#2A2420', shirt: '#0EA5E9', shirtDark: '#0A82B8', style: 'cap' },
  riya: { skin: '#E3B089', hair: '#2B1B14', shirt: '#84CC16', shirtDark: '#5E9410', style: 'bun' },
  kabir: { skin: '#C99062', hair: '#17110E', shirt: '#F97316', shirtDark: '#C25A0C', style: 'curly', glasses: true },
  neel: { skin: '#C98E62', hair: '#1B1511', shirt: '#6366F1', shirtDark: '#4648C9', style: 'short' },
  isha: { skin: '#DDA67C', hair: '#241A15', shirt: '#F43F5E', shirtDark: '#C72846', style: 'bob' },
  sana: { skin: '#C48A5E', hair: '#1A1311', shirt: '#10B981', shirtDark: '#0C8C62', style: 'bun' },
};
const INK = '#1B1140';

export function Cast({ who, mood = 'happy', t, size = 120 }: { who: CastId; mood?: Mood; t: number; size?: number }) {
  const L = LOOKS[who];
  const bob = Math.sin(t / 560) * 1.8;
  const phase = (t + CAST_IDS.indexOf(who) * 700) % 3600;
  const blink = mood === 'cheer' ? 0 : phase > 3380 ? Math.sin(((phase - 3380) / 220) * Math.PI) : 0;
  const look = mood === 'think' ? { x: 2.4, y: -2 } : mood === 'worry' ? { x: -1.5, y: 1.6 } : { x: Math.sin(t / 1400) * 1.4, y: 0 };
  const wave = Math.sin(t / 140) * 14;
  const swing = Math.sin(t / 700) * 3;

  const eye = (cx: number) => (
    <G key={cx}>
      <Ellipse cx={cx} cy={52} rx={5.2} ry={Math.max(0.8, 5.4 * (1 - blink))} fill="#fff" stroke={INK} strokeWidth={1.2} />
      {blink < 0.6 ? <Circle cx={cx + look.x * 0.5} cy={52 + look.y * 0.5} r={mood === 'surprised' ? 2 : 2.8} fill={INK} /> : null}
    </G>
  );
  const brows: Record<Mood, string[]> = {
    happy: ['M42 43 q6 -3 12 0', 'M66 43 q6 -3 12 0'],
    think: ['M42 42 q6 -2 12 -2', 'M66 40 q6 -4 12 -1'],
    worry: ['M42 41 q6 3 12 3', 'M66 44 q6 0 12 -3'],
    surprised: ['M42 38 q6 -4 12 0', 'M66 38 q6 -4 12 0'],
    cheer: ['M42 41 q6 -4 12 0', 'M66 41 q6 -4 12 0'],
  };
  const mouth: Record<Mood, React.ReactNode> = {
    happy: <Path d="M52 66 q8 7 16 0" stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />,
    think: <Path d="M54 68 q6 -2 12 1" stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />,
    worry: <Path d="M52 69 q4 -4 8 0 q4 -4 8 0" stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />,
    surprised: <Ellipse cx={60} cy={68} rx={3.4} ry={4.4} fill="#7A2E1B" />,
    cheer: <Path d="M50 64 q10 14 20 0z" fill="#7A2E1B" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />,
  };

  const hairBack = L.style === 'long' ? <Path d="M32 52 q-2 -34 28 -34 q30 0 28 34 l4 38 q-12 6 -20 -4 l-24 0 q-8 10 -20 4z" fill={L.hair} /> : L.style === 'bob' ? <Path d="M33 50 q0 -32 27 -32 q27 0 27 32 l2 22 q-8 4 -14 -4 l-30 0 q-6 8 -14 4z" fill={L.hair} /> : null;
  const hairFront: Record<Look['style'], React.ReactNode> = {
    short: <Path d="M34 46 q-2 -28 26 -28 q28 0 26 28 q-8 -16 -26 -14 q-18 -2 -26 14z" fill={L.hair} />,
    long: <Path d="M34 46 q0 -28 26 -28 q26 0 26 28 q-10 -14 -26 -12 q-16 -2 -26 12z" fill={L.hair} />,
    cap: <G><Path d="M34 44 q-2 -26 26 -26 q28 0 26 26z" fill="#F5F5F4" /><Path d="M34 44 h52 q6 0 10 4 h-62z" fill="#D6D3D1" /></G>,
    bun: <G><Circle cx={60} cy={14} r={9} fill={L.hair} /><Path d="M34 46 q-2 -28 26 -28 q28 0 26 28 q-8 -14 -26 -12 q-18 -2 -26 12z" fill={L.hair} /></G>,
    curly: <G>{[[38, 28], [48, 21], [60, 18], [72, 21], [82, 28], [34, 40], [86, 40]].map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={8} fill={L.hair} />)}</G>,
    bob: <Path d="M33 48 q0 -30 27 -30 q27 0 27 30 q-8 -14 -27 -12 q-19 -2 -27 12z" fill={L.hair} />,
  };

  // arms: down and swinging, one raised and waving when cheering, one bent to the chin when thinking
  const armL = <Path d={`M36 92 q-10 ${16 + swing} -8 ${34 - swing}`} stroke={L.shirtDark} strokeWidth={11} strokeLinecap="round" fill="none" />;
  const armR = mood === 'cheer'
    ? <G transform={`rotate(${wave} 84 94)`}><Path d="M84 94 q12 -16 8 -38" stroke={L.shirtDark} strokeWidth={11} strokeLinecap="round" fill="none" /><Circle cx={92} cy={54} r={6} fill={L.skin} /></G>
    : mood === 'think'
      ? <G><Path d="M84 94 q14 -4 -2 -26" stroke={L.shirtDark} strokeWidth={11} strokeLinecap="round" fill="none" /><Circle cx={80} cy={68} r={6} fill={L.skin} /></G>
      : <Path d={`M84 92 q10 ${16 - swing} 8 ${34 + swing}`} stroke={L.shirtDark} strokeWidth={11} strokeLinecap="round" fill="none" />;

  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 120 150">
      <Ellipse cx={60} cy={145} rx={30} ry={4.5} fill="#000" opacity={0.28} />
      <G y={bob}>
        {hairBack}
        {armL}
        <Path d="M30 140 q-2 -44 14 -52 h32 q16 8 14 52z" fill={L.shirt} />
        <Rect x={52} y={74} width={16} height={16} rx={6} fill={L.skin} />
        {armR}
        <Circle cx={60} cy={50} r={27} fill={L.skin} />
        {L.beard ? <Path d="M36 56 q0 28 24 28 q24 0 24 -28 q-8 14 -24 14 q-16 0 -24 -14z" fill={L.hair} opacity={0.92} /> : null}
        {hairFront[L.style]}
        {eye(48)}{eye(72)}
        {L.glasses ? <G stroke={INK} strokeWidth={1.8} fill="none"><Circle cx={48} cy={52} r={8.5} /><Circle cx={72} cy={52} r={8.5} /><Path d="M56.5 52 h7" /></G> : null}
        {brows[mood].map((d, i) => <Path key={i} d={d} stroke={L.hair === '#3A3340' ? '#3A3340' : INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />)}
        {mouth[mood]}
        {mood === 'worry' ? <Path d={`M90 ${34 + ((t / 90) % 12)} q-4 7 0 10 q4 -3 0 -10z`} fill="#7FD8FF" opacity={0.9} /> : null}
      </G>
    </Svg>
  );
}
