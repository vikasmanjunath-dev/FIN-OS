import React from 'react';
import { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { ease, settle, wrap } from '@/lib/reels/engine';
import { money } from '@/lib/reels/figures';
import type { L, Prop, Tone } from '@/lib/reels/types';
import type { Lang } from '@/lib/i18nCore';

export const TONES: Record<Tone, string> = { cyan: '#00D4FF', teal: '#22D3A6', gold: '#F0A500', purple: '#B28CFF', red: '#FF6B6B' };
const WHITE = '#F5F7FA', MUTED = '#9AA4B8';
/** The picture area to the right of Mitra is 200 wide and 270 tall, with (0,0) at its top-left. */
export const AREA = { w: 200, h: 270 };

const Lines = ({ text, x, y, max, size = 12, color = MUTED, weight = 'normal', anchor = 'middle' as const }: { text: string; x: number; y: number; max: number; size?: number; color?: string; weight?: 'normal' | 'bold'; anchor?: 'middle' | 'start' }) => (
  <>{wrap(text, max).slice(0, 4).map((ln, i) => <SvgText key={i} x={x} y={y + i * (size + 3)} fontSize={size} fill={color} fontWeight={weight} textAnchor={anchor}>{ln}</SvgText>)}</>
);

const inrFull = (n: number) => { const s = String(Math.round(n)); const l = s.slice(-3), r = s.slice(0, -3); return '₹' + (r ? r.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + l : l); };

/** What sits beside Mitra for a scene. `p` is how far through the scene we are (0..1); every shape is a function of it. */
export function Scenery({ prop, p, lang, t }: { prop: Prop; p: number; lang: Lang; t: number }) {
  const tx = (l: L) => l[lang];
  switch (prop.kind) {
    case 'counter': {
      const v = prop.from + (prop.to - prop.from) * settle(p, 0.75);
      const col = TONES[prop.tone ?? 'cyan'];
      const plain = prop.format === 'plain';
      // From a lakh up the amount is shown the way the captions say it ("₹6.44 crore"), and the type size follows the final text so nothing runs off the picture.
      const fmt = (n: number) => (plain ? `${Math.round(n)}` : n >= 100_000 ? money(Math.round(n))[lang] : inrFull(n));
      const txt = fmt(v), size = plain ? 78 : Math.min(44, Math.floor(184 / (fmt(Math.max(prop.from, prop.to)).length * 0.62)));
      return (
        <G>
          <SvgText x={100} y={130} fontSize={size} fontWeight="bold" fill={col} textAnchor="middle">{txt}</SvgText>
          {plain && prop.unit ? <SvgText x={100} y={160} fontSize={18} fill={WHITE} textAnchor="middle" fontWeight="bold">{tx(prop.unit)}</SvgText> : null}
          {prop.label ? <Lines text={tx(prop.label)} x={100} y={plain ? 188 : 164} max={22} color={MUTED} /> : null}
        </G>
      );
    }
    case 'bars': {
      const n = prop.items.length, bw = n > 2 ? 44 : 62, gap = (AREA.w - n * bw) / (n + 1), max = Math.max(...prop.items.map(i => i.value));
      const base = 205, grow = settle(p, 0.65);
      return (
        <G>
          <Path d={`M0 ${base} H${AREA.w}`} stroke="#33405F" strokeWidth={2} />
          {prop.items.map((it, i) => {
            const h = (it.value / max) * 140 * grow, x = gap + i * (bw + gap);
            return (
              <G key={i}>
                <Rect x={x} y={base - h} width={bw} height={h} rx={8} fill={TONES[it.tone]} />
                {p > 0.45 ? <SvgText x={x + bw / 2} y={base - h - 8} fontSize={15} fontWeight="bold" fill={WHITE} textAnchor="middle">{tx(it.text)}</SvgText> : null}
                <Lines text={tx(it.label)} x={x + bw / 2} y={base + 18} max={11} size={11} color={MUTED} />
              </G>
            );
          })}
        </G>
      );
    }
    case 'line': {
      const pts = prop.points, n = pts.length, col = TONES[prop.tone ?? 'teal'], lo = Math.min(...pts), hi = Math.max(...pts);
      const X = (i: number) => 10 + (i / (n - 1)) * 180, Y = (v: number) => 190 - ((v - lo) / (hi - lo || 1)) * 140;
      const upto = settle(p, 0.8) * (n - 1), whole = Math.floor(upto), frac = upto - whole;
      const drawn: [number, number][] = pts.slice(0, whole + 1).map((v, i) => [X(i), Y(v)]);
      if (whole < n - 1) drawn.push([X(whole) + (X(whole + 1) - X(whole)) * frac, Y(pts[whole]) + (Y(pts[whole + 1]) - Y(pts[whole])) * frac]);
      const line = drawn.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      const last = drawn[drawn.length - 1];
      return (
        <G>
          <Path d="M10 190 H190 M10 190 V40" stroke="#33405F" strokeWidth={2} />
          <Path d={`M10 190 L${line.replace(/ /g, ' L')} L${last[0]} 190 Z`} fill={col} opacity={0.18} />
          <Polyline points={line} fill="none" stroke={col} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={last[0]} cy={last[1]} r={6} fill={col} />
          {prop.label ? <Lines text={tx(prop.label)} x={100} y={218} max={26} size={11} color={MUTED} /> : null}
        </G>
      );
    }
    case 'donut': {
      const total = prop.parts.reduce((s, x) => s + x.value, 0), R = 58, C = 2 * Math.PI * R, sweep = settle(p, 0.7);
      let acc = 0;
      return (
        <G>
          <Circle cx={100} cy={105} r={R} stroke="#222B45" strokeWidth={26} fill="none" />
          {prop.parts.map((part, i) => {
            const len = (part.value / total) * C * sweep, off = (acc / total) * C; acc += part.value;
            return <Circle key={i} cx={100} cy={105} r={R} stroke={TONES[part.tone]} strokeWidth={26} fill="none" strokeDasharray={`${len} ${C}`} strokeDashoffset={-off} transform="rotate(-90 100 105)" />;
          })}
          {prop.centre ? <Lines text={tx(prop.centre)} x={100} y={102} max={9} size={14} color={WHITE} weight="bold" /> : null}
          {prop.parts.map((part, i) => (
            <G key={i}>
              <Circle cx={22} cy={198 + i * 24} r={6} fill={TONES[part.tone]} />
              <SvgText x={36} y={203 + i * 24} fontSize={14} fill={WHITE}>{`${tx(part.label)}: ${Math.round((part.value / total) * 100)}%`}</SvgText>
            </G>
          ))}
        </G>
      );
    }
    case 'coins': {
      const shown = Math.min(prop.count, 8), cols = Math.min(shown, 4);
      return (
        <G>
          {Array.from({ length: shown }, (_, i) => {
            const appear = ease((p * (shown + 2) - i) / 1.2), col = i % cols, row = Math.floor(i / cols);
            const x = 100 - (cols - 1) * 22 + col * 44, y = 175 - row * 34 - (1 - appear) * 90;
            return (
              <G key={i} opacity={appear}>
                <Circle cx={x} cy={y} r={19} fill="#F0A500" stroke="#B87800" strokeWidth={3} />
                <SvgText x={x} y={y + 6} fontSize={18} fontWeight="bold" fill="#3A2A00" textAnchor="middle">₹</SvgText>
              </G>
            );
          })}
          {prop.label ? <Lines text={tx(prop.label)} x={100} y={236} max={24} size={12} /> : null}
        </G>
      );
    }
    case 'shield': {
      const pulse = 1 + Math.sin(t / 260) * 0.015, a = settle(p, 0.5);
      return (
        <G opacity={a} transform={`translate(100 120) scale(${pulse * (0.85 + 0.15 * a)}) translate(-100 -120)`}>
          <Path d="M100 30 L170 56 V126 Q170 190 100 224 Q30 190 30 126 V56 Z" fill="#14234A" stroke="#22D3A6" strokeWidth={5} strokeLinejoin="round" />
          <Lines text={tx(prop.text)} x={100} y={prop.sub ? 112 : 128} max={11} size={22} color={WHITE} weight="bold" />
          {prop.sub ? <Lines text={tx(prop.sub)} x={100} y={158} max={14} size={13} color="#9FE9D2" /> : null}
        </G>
      );
    }
    case 'steps': {
      return (
        <G>
          {prop.items.map((it, i) => {
            const n = prop.items.length, gap = Math.min(74, 230 / n), a = ease((p * (n + 0.6) - i) / 0.9), y = 40 + gap / 2 + i * gap;
            return (
              <G key={i} opacity={a}>
                <Rect x={6} y={y - 24 + (1 - a) * 14} width={188} height={Math.min(56, gap - 8)} rx={14} fill="#16203F" stroke="#2C3A66" strokeWidth={2} />
                <Circle cx={30} cy={y + 4 + (1 - a) * 14} r={11} fill="#22D3A6" />
                <Path d={`M24 ${y + 4 + (1 - a) * 14} l5 5 l9 -10`} stroke="#07241C" strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <Lines text={tx(it)} x={50} y={y - 2 + (1 - a) * 14} max={19} size={13} color={WHITE} weight="bold" anchor="start" />
              </G>
            );
          })}
        </G>
      );
    }
  }
}
