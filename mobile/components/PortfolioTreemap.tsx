import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { layoutTwoLevel, tileFill, type TreeGroup, type PlacedLeaf } from '@/lib/portfolioTreemap';
import { Colors, Typography } from '@/constants/theme';

/**
 * Two-level treemap built from plain views: size = value, colour = `colorValue` (percent), grouped by label.
 * Every tile is a button (`describe` gives its spoken label); a tile with no colour figure is grey. White text on every fill (4.5:1 or better).
 */
export function PortfolioTreemap({ groups, height = 340, fullAt = 30, describe, onOpen }: {
  groups: TreeGroup[]; height?: number; fullAt?: number;
  describe: (leaf: PlacedLeaf, group: string) => string;
  onOpen?: (leaf: PlacedLeaf) => void;
}) {
  const [w, setW] = useState(0);
  const placed = useMemo(() => (w > 0 ? layoutTwoLevel(groups, w, height) : []), [groups, w, height]);
  return (
    <View style={{ height }} onLayout={e => setW(Math.floor(e.nativeEvent.layout.width))}>
      {placed.map(g => (
        <View key={g.id} style={{ position: 'absolute', left: g.x, top: g.y, width: g.w, height: g.h, borderWidth: 1, borderColor: Colors.borderHi, borderRadius: 4, backgroundColor: Colors.surfaceAlt }}>
          {g.headerH > 0 ? <Text numberOfLines={1} style={{ height: g.headerH, paddingHorizontal: 4, fontSize: 10, fontWeight: '700', color: Colors.textMuted }}>{g.label}</Text> : null}
        </View>
      ))}
      {placed.flatMap(g => g.leaves.map(l => {
        const roomy = l.w > 46 && l.h > 30;
        const tiny = l.w < 22 || l.h < 14;
        return (
          <TouchableOpacity key={g.id + '|' + l.id} accessibilityRole="button" accessibilityLabel={describe(l, g.label)} disabled={!onOpen} onPress={() => onOpen?.(l)}
            style={{ position: 'absolute', left: l.x + 1, top: l.y + 1, width: Math.max(0, l.w - 2), height: Math.max(0, l.h - 2), backgroundColor: tileFill(l.colorValue, fullAt), borderRadius: 3, padding: 2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
            {tiny ? null : <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: roomy ? 11 : 9, fontWeight: '800' }}>{l.label}</Text>}
            {roomy ? <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 10 }}>{l.colorValue === null ? 'no price' : `${l.colorValue >= 0 ? '+' : '−'}${Math.abs(l.colorValue).toFixed(1)}%`}</Text> : null}
          </TouchableOpacity>
        );
      }))}
    </View>
  );
}

/** Legend for the colour scale: grey, loss, flat, gain. */
export function TreemapLegend({ fullAt, unit }: { fullAt: number; unit: string }) {
  const stops: (number | null)[] = [-fullAt, -fullAt / 2, 0, fullAt / 2, fullAt];
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }} accessible accessibilityLabel={`Colour scale: red for ${fullAt} percent or more down, grey-blue for no change, green for ${fullAt} percent or more up. Grey means no figure.`}>
        {stops.map(s => <View key={String(s)} style={{ flex: 1, height: 10, backgroundColor: tileFill(s, fullAt) }} />)}
        <View style={{ width: 10 }} /><View style={{ width: 24, height: 10, backgroundColor: tileFill(null) }} />
      </View>
      <Text style={Typography.caption}>{`Red: ${fullAt}% or worse. Grey-blue: no change. Green: ${fullAt}% or better (${unit}). Grey: no figure.`}</Text>
    </View>
  );
}
