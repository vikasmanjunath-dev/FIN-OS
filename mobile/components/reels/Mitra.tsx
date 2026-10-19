import React from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, Stop, Text as SvgText } from 'react-native-svg';
import type { Mood } from '@/lib/reels/types';

const BODY = '#6D4BD8', BODY_DARK = '#4F34B0', BELLY = '#E8DFFF', INK = '#1B1140', BEAK = '#FFB020', GOLD = '#F0A500';

/** Mitra, the money owl: vector art, no image file. How it looks is a pure function of `mood` and the clock `t` (ms), so it bobs, blinks and
 *  glances about without any animation library, and the same scene always draws the same picture. */
export function Mitra({ mood, t, size = 150 }: { mood: Mood; t: number; size?: number }) {
  const bob = Math.sin(t / 520) * 2.2;
  const phase = t % 3400;
  const blink = mood === 'cheer' ? 0 : phase > 3180 ? Math.sin(((phase - 3180) / 220) * Math.PI) : 0;      // a quick blink every 3.4 s
  const glance = Math.sin(t / 1300);
  const look = mood === 'think' ? { x: 3.2, y: -3 } : mood === 'worry' ? { x: -2 + glance * 2, y: 2 } : mood === 'surprised' ? { x: 0, y: 0 } : { x: glance * 2, y: 0 };
  const eyeR = mood === 'surprised' ? 17 : 15;
  const pupil = mood === 'surprised' ? 4.6 : 6.4;
  const wave = mood === 'cheer' ? Math.sin(t / 130) * 7 : 0;

  const eye = (cx: number) => (
    <G key={cx}>
      <Ellipse cx={cx} cy={62} rx={eyeR} ry={Math.max(1.2, eyeR * (1 - blink * 0.92))} fill="#fff" stroke={INK} strokeWidth={2} />
      {blink < 0.6 ? (
        <>
          <Circle cx={cx + look.x} cy={62 + look.y} r={pupil * (1 - blink * 0.5)} fill={INK} />
          <Circle cx={cx + look.x + 2} cy={60 + look.y} r={1.9} fill="#fff" />
        </>
      ) : null}
    </G>
  );
  const happyEye = (cx: number) => <Path key={cx} d={`M${cx - 13} 66 Q${cx} 46 ${cx + 13} 66`} stroke="#fff" strokeWidth={4.5} strokeLinecap="round" fill="none" />;

  const brows = {
    happy: ['M30 42 Q43 35 56 42', 'M64 42 Q77 35 90 42'],
    think: ['M30 38 Q43 29 56 36', 'M64 44 Q77 42 90 46'],
    worry: ['M30 44 L56 34', 'M64 34 L90 44'],
    surprised: ['M29 36 Q43 24 57 36', 'M63 36 Q77 24 91 36'],
    cheer: [],
  }[mood];

  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 120 150">
      <Defs>
        <LinearGradient id="mb" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#8467F2" /><Stop offset="1" stopColor={BODY_DARK} /></LinearGradient>
      </Defs>
      <Ellipse cx={60} cy={143} rx={30} ry={5} fill="#000" opacity={0.28} />
      <G y={bob}>
        <Path d="M44 128 q-3 12 -10 12 h20 q0 -6 -4 -12z" fill={BEAK} /><Path d="M76 128 q3 12 10 12 h-20 q0 -6 4 -12z" fill={BEAK} />
        {/* wings sit behind the body; raised and flapping when cheering */}
        <G transform={`rotate(${mood === 'cheer' ? -38 + wave : 0} 30 80)`}><Ellipse cx={18} cy={92} rx={11} ry={28} fill={BODY_DARK} /></G>
        <G transform={`rotate(${mood === 'cheer' ? 38 - wave : 0} 90 80)`}><Ellipse cx={102} cy={92} rx={11} ry={28} fill={BODY_DARK} /></G>
        <Path d="M24 46 L32 14 L52 38z" fill={BODY} /><Path d="M96 46 L88 14 L68 38z" fill={BODY} />
        <Ellipse cx={60} cy={86} rx={42} ry={52} fill="url(#mb)" />
        <Ellipse cx={60} cy={102} rx={28} ry={34} fill={BELLY} />
        <Path d="M44 92 q4 6 8 0 M56 92 q4 6 8 0 M68 92 q4 6 8 0 M50 104 q4 6 8 0 M62 104 q4 6 8 0" stroke="#C9B8F5" strokeWidth={2} fill="none" strokeLinecap="round" />
        <Circle cx={60} cy={116} r={11} fill={GOLD} /><SvgText x={60} y={121} fontSize={14} fontWeight="bold" fill="#3A2A00" textAnchor="middle">₹</SvgText>
        {mood === 'cheer' ? <>{happyEye(43)}{happyEye(77)}</> : <>{eye(43)}{eye(77)}</>}
        {brows.map((d, i) => <Path key={i} d={d} stroke={INK} strokeWidth={3.2} strokeLinecap="round" fill="none" />)}
        <Polygon points="53,74 67,74 60,87" fill={BEAK} />
        {mood === 'surprised' ? <Ellipse cx={60} cy={80} rx={3.4} ry={4.2} fill="#7A3E00" /> : null}
        {mood === 'worry' ? <Path d={`M96 ${44 + ((t / 90) % 14)} q-5 8 0 11 q5 -3 0 -11z`} fill="#7FD8FF" opacity={0.9} /> : null}
        {mood === 'think' ? <SvgText x={98} y={30 + Math.sin(t / 300) * 2} fontSize={26} fontWeight="bold" fill="#B28CFF" textAnchor="middle">?</SvgText> : null}
        {mood === 'cheer' ? [[16, 20, 0], [104, 18, 400], [110, 66, 800]].map(([x, y, d], i) => {
          const s = 0.6 + 0.4 * Math.abs(Math.sin((t + d) / 260));
          return <Path key={i} d={`M${x} ${y - 7 * s} L${x + 2 * s} ${y - 2 * s} L${x + 7 * s} ${y} L${x + 2 * s} ${y + 2 * s} L${x} ${y + 7 * s} L${x - 2 * s} ${y + 2 * s} L${x - 7 * s} ${y} L${x - 2 * s} ${y - 2 * s}z`} fill="#FFD84D" />;
        }) : null}
      </G>
    </Svg>
  );
}
