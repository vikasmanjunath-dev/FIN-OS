import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { QuickChip } from '@/lib/quicklog';
import { UndoNotice } from '@/hooks/useQuickLog';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { inr } from '@/components/TrackerUI';

export const CAT_ICON: Record<string, string> = {
  'Food & Dining': '🍽️', Groceries: '🛒', Transport: '🚕', Shopping: '🛍️', 'Bills & Utilities': '💡', Housing: '🏠',
  'EMI & Loans': '🏦', Subscriptions: '📺', Health: '🩺', Entertainment: '🎬', Education: '🎓', Travel: '✈️', Other: '📦',
  'Savings & Investments': '📈', Income: '💰',
};

const KIND_COLOR = { expense: Colors.gold, income: Colors.teal, saving: Colors.purple } as const;

/** One-tap chips for the entries you repeat, plus the Undo bar shown right after logging one. */
export function QuickLogChips({ chips, onLog, onEdit, undo, onUndo, hint }: {
  chips: QuickChip[];
  onLog: (c: QuickChip) => void;
  /** long-press: let the user change the amount before logging */
  onEdit?: (c: QuickChip) => void;
  undo: UndoNotice | null;
  onUndo: () => void;
  hint?: string;
}) {
  return (
    <View>
      {chips.length > 0 && (
        <View style={s.wrap}>
          {chips.map(c => {
            const color = KIND_COLOR[c.kind];
            const name = c.label || c.category;
            return (
              <TouchableOpacity
                key={c.key}
                style={[s.chip, { borderColor: color + '55', backgroundColor: color + '12' }]}
                onPress={() => onLog(c)}
                onLongPress={onEdit ? () => onEdit(c) : undefined}
                delayLongPress={450}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${c.isLast ? 'Repeat last: ' : ''}log ${inr(c.amount)} ${name} for today`}
              >
                <Text style={s.icon}>{c.isLast ? '↻' : CAT_ICON[c.category] ?? '📦'}</Text>
                <View style={{ flexShrink: 1 }}>
                  <Text style={[s.name, { color: Colors.textPrimary }]} numberOfLines={1}>{name}</Text>
                  <Text style={[s.amt, { color }]}>{c.kind === 'income' ? '+' : ''}{inr(c.amount)}{c.isLast ? ' · repeat last' : ''}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {hint && chips.length > 0 && <Text style={[Typography.caption, { marginTop: 6 }]}>{hint}</Text>}
      {undo && (
        <View style={s.undo} accessibilityLiveRegion="polite">
          <Text style={s.undoTxt} numberOfLines={1}>✓ {undo.text}</Text>
          <TouchableOpacity onPress={onUndo} hitSlop={10} accessibilityRole="button" accessibilityLabel="Undo"><Text style={s.undoBtn}>UNDO</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radii.lg, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  icon: { fontSize: 18 },
  name: { fontSize: 12, fontWeight: '700' },
  amt: { fontSize: 11, fontWeight: '800', marginTop: 1 },
  undo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm, backgroundColor: 'rgba(34,211,166,0.1)', borderWidth: 1, borderColor: 'rgba(34,211,166,0.35)', borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  undoTxt: { color: Colors.teal, fontSize: 12, fontWeight: '700', flex: 1, marginRight: Spacing.md },
  undoBtn: { color: Colors.textPrimary, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
});
