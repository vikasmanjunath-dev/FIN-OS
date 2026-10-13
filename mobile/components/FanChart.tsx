import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import { Colors, Typography } from '@/constants/theme';
import { inrShort } from '@/components/TrackerUI';
import { useThemed } from '@/lib/theme';

export interface Band { age: number; p10: number; p25: number; p50: number; p75: number; p90: number }

/** Corpus by age: median line with 25–75% and 10–90% bands, and a marker at the retirement age. */
export function FanChart({ bands, retireAge, height = 210 }: { bands: Band[]; retireAge: number; height?: number }) {
  const T = useThemed();
  const [w, setW] = useState(0);
  const pl = 46, pr = 8, pt = 10, pb = 22;
  const n = bands.length;
  const maxV = Math.max(...bands.map(b => b.p90), 1);
  const x = (i: number) => pl + (n <= 1 ? 0 : (i / (n - 1)) * (w - pl - pr));
  const y = (v: number) => pt + (1 - v / maxV) * (height - pt - pb);
  const line = (k: keyof Band) => bands.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b[k] as number).toFixed(1)}`).join(' ');
  const area = (hi: keyof Band, lo: keyof Band) =>
    bands.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b[hi] as number).toFixed(1)}`).join(' ') + ' ' +
    bands.slice().reverse().map((b, i) => `L${x(n - 1 - i).toFixed(1)} ${y(b[lo] as number).toFixed(1)}`).join(' ') + ' Z';
  const ri = bands.findIndex(b => b.age >= retireAge);
  const ageTicks = bands.filter((_, i) => i % Math.ceil(n / 6) === 0 || i === n - 1);

  return (
    <View>
      <View style={{ height }} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 && n > 1 && (
          <Svg width={w} height={height}>
            {[0, 0.5, 1].map(t => (
              <SvgText key={t} x={pl - 6} y={y(maxV * t) + 3} fill={T(Colors.textMuted)} fontSize={9} textAnchor="end">{inrShort(maxV * t)}</SvgText>
            ))}
            <Path d={area('p90', 'p10')} fill={T("rgba(79,124,255,0.14)")} />
            <Path d={area('p75', 'p25')} fill={T("rgba(79,124,255,0.28)")} />
            <Path d={line('p50')} fill="none" stroke={T(Colors.teal)} strokeWidth={2.4} />
            {ri > 0 && <Line x1={x(ri)} x2={x(ri)} y1={pt} y2={height - pb} stroke={T(Colors.gold)} strokeDasharray="4 3" strokeWidth={1.2} />}
            {ageTicks.map(b => (
              <SvgText key={b.age} x={x(bands.indexOf(b))} y={height - 6} fill={T(Colors.textMuted)} fontSize={9} textAnchor="middle">{b.age}</SvgText>
            ))}
          </Svg>
        )}
      </View>
      <Text style={[Typography.caption, { marginTop: 4 }]}>Median (green), 25–75% and 10–90% bands. Dashed line = retirement.</Text>
    </View>
  );
}
