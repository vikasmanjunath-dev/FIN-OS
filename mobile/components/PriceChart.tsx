import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import { Colors, Typography } from '@/constants/theme';
import { useThemed } from '@/lib/theme';
import { chartStats, fmtPrice, type Chart } from '@/lib/marketData';

/** Closing-price line for a range, with the high / low of the period and the first and last date. Colour follows the period's change. */
export function PriceChart({ chart, height = 190 }: { chart: Chart; height?: number }) {
  const T = useThemed();
  const [w, setW] = useState(0);
  const st = chartStats(chart);
  const pl = 8, pr = 8, pt = 14, pb = 34;
  if (!st) return null;
  const n = chart.closes.length;
  const lo = Math.min(...chart.closes), hi = Math.max(...chart.closes);
  const span = hi - lo || 1;
  const x = (i: number) => pl + (n <= 1 ? 0 : (i / (n - 1)) * (w - pl - pr));
  const y = (v: number) => pt + (1 - (v - lo) / span) * (height - pt - pb);
  const line = chart.closes.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)} ${(height - pb).toFixed(1)} L${x(0).toFixed(1)} ${(height - pb).toFixed(1)} Z`;
  const up = st.changePct >= 0;
  const col = T(up ? Colors.teal : Colors.red);
  const fmtD = (d: string) => (d ? d.slice(5).replace('-', '/') : '');
  return (
    <View>
      <View style={{ height }} onLayout={e => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image"
        accessibilityLabel={`Closing price chart, ${n} days, from ${fmtPrice(st.first)} to ${fmtPrice(st.last)}, ${up ? 'up' : 'down'} ${Math.abs(st.changePct).toFixed(1)} percent`}>
        {w > 0 && (
          <Svg width={w} height={height}>
            <Line x1={pl} x2={w - pr} y1={y(hi)} y2={y(hi)} stroke={T(Colors.borderMed)} strokeDasharray="3 4" strokeWidth={1} />
            <Line x1={pl} x2={w - pr} y1={y(lo)} y2={y(lo)} stroke={T(Colors.borderMed)} strokeDasharray="3 4" strokeWidth={1} />
            <Path d={area} fill={col} fillOpacity={0.12} />
            <Path d={line} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" />
            <SvgText x={pl} y={y(hi) - 3} fill={T(Colors.textMuted)} fontSize={10}>{fmtPrice(hi)}</SvgText>
            <SvgText x={pl} y={y(lo) - 4} fill={T(Colors.textMuted)} fontSize={10}>{fmtPrice(lo)}</SvgText>
            <SvgText x={pl} y={height - 6} fill={T(Colors.textMuted)} fontSize={10}>{fmtD(st.startDate)}</SvgText>
            <SvgText x={w - pr} y={height - 6} fill={T(Colors.textMuted)} fontSize={10} textAnchor="end">{fmtD(st.endDate)}</SvgText>
          </Svg>
        )}
      </View>
      <Text style={[Typography.caption, { marginTop: 4 }]}>Daily closing prices. Dashed lines are the highest and lowest close in the period.</Text>
    </View>
  );
}

/** A tiny line without axes, for a list row. */
export function Sparkline({ values, width = 64, height = 22, up }: { values: number[]; width?: number; height?: number; up?: boolean }) {
  const T = useThemed();
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)} ${(2 + (1 - (v - lo) / span) * (height - 4)).toFixed(1)}`).join(' ');
  const isUp = up ?? values[values.length - 1] >= values[0];
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no">
      <Path d={d} fill="none" stroke={T(isUp ? Colors.teal : Colors.red)} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}
