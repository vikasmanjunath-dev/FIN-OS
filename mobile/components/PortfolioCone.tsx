import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import { Colors, Typography } from '@/constants/theme';
import { useThemed } from '@/lib/theme';
import type { Cone } from '@/lib/portfolioSimulate';
import { inrShort } from '@/components/TrackerUI';

/** The range of simulated portfolio values over time: 5th-95th and 25th-75th percentile bands and the median line. */
export function PortfolioCone({ cone, height = 220 }: { cone: Cone; height?: number }) {
  const T = useThemed();
  const [w, setW] = useState(0);
  const pl = 8, pr = 8, pt = 12, pb = 26;
  const pts = cone.points;
  const maxM = pts[pts.length - 1].month || 1;
  const hi = Math.max(...pts.map(p => p.p95)), lo = Math.min(0, ...pts.map(p => p.p5));
  const span = hi - lo || 1;
  const x = (m: number) => pl + (m / maxM) * (w - pl - pr);
  const y = (v: number) => pt + (1 - (v - lo) / span) * (height - pt - pb);
  const band = (up: (p: typeof pts[number]) => number, dn: (p: typeof pts[number]) => number) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.month).toFixed(1)} ${y(up(p)).toFixed(1)}`).join(' ') + ' ' +
    [...pts].reverse().map(p => `L${x(p.month).toFixed(1)} ${y(dn(p)).toFixed(1)}`).join(' ') + ' Z';
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.month).toFixed(1)} ${y(p.p50).toFixed(1)}`).join(' ');
  const f = cone.final;
  const c = T(Colors.cyan);
  return (
    <View>
      <View style={{ height }} onLayout={e => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image"
        accessibilityLabel={`Range of simulated portfolio values over ${cone.assumptions.years} years. At the end, the middle outcome is ${inrShort(f.p50)}, with nine in ten outcomes between ${inrShort(f.p5)} and ${inrShort(f.p95)}.`}>
        {w > 0 && (
          <Svg width={w} height={height}>
            <Line x1={pl} x2={w - pr} y1={y(cone.assumptions.startValue)} y2={y(cone.assumptions.startValue)} stroke={T(Colors.borderHi)} strokeDasharray="3 4" />
            <Path d={band(p => p.p95, p => p.p5)} fill={c} fillOpacity={0.12} />
            <Path d={band(p => p.p75, p => p.p25)} fill={c} fillOpacity={0.22} />
            <Path d={line} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />
            <SvgText x={pl} y={height - 8} fill={T(Colors.textMuted)} fontSize={10}>Now</SvgText>
            <SvgText x={w - pr} y={height - 8} fill={T(Colors.textMuted)} fontSize={10} textAnchor="end">{`${cone.assumptions.years} years`}</SvgText>
            <SvgText x={pl} y={y(hi) + 10} fill={T(Colors.textMuted)} fontSize={10}>{inrShort(hi)}</SvgText>
          </Svg>
        )}
      </View>
      <Text style={[Typography.caption, { marginTop: 4 }]}>Line: the middle outcome. Dark band: 25th to 75th percentile. Light band: 5th to 95th. Dashed: today's value. Rupees, before inflation and tax.</Text>
    </View>
  );
}
