import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { ToolRow } from '@/components/ToolRow';
import { useLang } from '@/lib/i18n';
import { finishedToday, EPISODE_SIZE } from '@/lib/reels/episode';
import { todaysEpisode } from '@/lib/reels/coldstart';
import { homeCard } from '@/lib/reels/homecard';
import { isGrowthMilestone } from '@/lib/reels/milestones';
import { isGrowthReceipt } from '@/lib/reels/moves';
import type { useReelsJourney } from '@/hooks/useReelsJourney';

/** Both the plain row (before the reels state has loaded) and the card sit in a box of this height, so the Home list does not jump when it loads. */
export const REELS_CARD_MIN_HEIGHT = 160;

/** Home's "Today's reel": one calm card saying where the person stands with today's reels and leading to the next step. It reads the state the reels
 *  hook already loaded from the phone (no network). Until that has loaded it is the plain row it used to be. */
export function ReelsHomeCard({ j, open }: { j: ReturnType<typeof useReelsJourney>; open: (path: string) => void }) {
  const lang = useLang();
  const card = useMemo(() => {
    if (!j.loaded) return null;
    const now = new Date();
    const anchor = todaysEpisode(j.ranked, j.watched, now, { start: j.profile.start, strain: j.signals.strain }).picks[0] ?? j.todays ?? null;
    const r = j.receipts[0], m = j.milestones[0];
    return homeCard({
      anchor: anchor ? { title: anchor.reel.title, reason: anchor.reason } : null,
      finished: finishedToday(j.watched, now),
      size: EPISODE_SIZE,
      streak: j.streak,
      resting: j.resting,
      everDone: j.streak > 0 || j.best > 0 || Object.keys(j.watched).length > 0,
      pledges: j.profile.pledges?.length ?? 0,
      celebrate: r ? { title: r.title, growth: isGrowthReceipt(r.receipt) } : m ? { title: m.title, growth: isGrowthMilestone(m.id) } : null,
      strain: j.signals.strain,
    }, now);
  }, [j.loaded, j.ranked, j.todays, j.watched, j.streak, j.resting, j.best, j.profile.pledges, j.profile.start, j.receipts, j.milestones, j.signals.strain]);

  if (!card) {
    return (
      <View style={s.box}>
        <ToolRow label="Today's reel" sub="30-second animated lessons with Mitra the owl" accent={Colors.purple} icon="🎬" onPress={() => open('/learn/reels')} />
      </View>
    );
  }
  const done = card.ctaState === 'done';
  return (
    <View style={s.box}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => open('/learn/reels')} accessibilityRole="button" accessibilityLabel={card.a11y[lang]} style={s.main}>
        <View style={s.info}>
        <View style={s.icon}><Text style={s.iconTxt}>🎬</Text></View>
        <View style={s.body}>
          <Text style={s.heading}>{card.heading[lang]}{card.season ? `  ${card.season.badge} ${card.season.label[lang]}` : ''}</Text>
          {card.title ? <Text style={s.title}>{card.title[lang]}</Text> : null}
          <Text style={s.reason}>{card.reason[lang]}</Text>
          <View style={s.metaRow}>
            {card.progress ? <Text style={s.meta}>{card.progress[lang]}</Text> : null}
            {card.streak ? <Text style={[s.meta, s.streak]}>{`🔥 ${card.streak[lang]}`}</Text> : null}
          </View>
        </View>
        </View>
        <View style={[s.cta, done && s.ctaDone]}><Text style={[s.ctaTxt, done && s.ctaTxtDone]}>{done ? '✓ ' : ''}{card.cta[lang]}</Text></View>
      </TouchableOpacity>
      {card.celebrate ? (
        <TouchableOpacity activeOpacity={0.8} onPress={() => open('/learn/reels')} accessibilityRole="button" accessibilityLabel={card.celebrate[lang]} style={s.line}>
          <Text style={[s.lineTxt, { color: Colors.gold }]}>{card.celebrate[lang]}</Text>
        </TouchableOpacity>
      ) : null}
      {card.moves ? (
        <TouchableOpacity activeOpacity={0.8} onPress={() => open('/learn/moves')} accessibilityRole="button" accessibilityLabel={card.moves[lang]} style={s.line}>
          <Text style={s.lineTxt}>{card.moves[lang]}  ›</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { minHeight: REELS_CARD_MIN_HEIGHT, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  // the words may take as many lines as large text needs; the button drops under them when the row is too narrow for both
  main: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.md, rowGap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md },
  info: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0 },
  icon: { width: 40, height: 40, borderRadius: Radii.md, backgroundColor: Colors.purple + '22', alignItems: 'center', justifyContent: 'center' },
  iconTxt: { fontSize: 20 },
  body: { flex: 1, minWidth: 0 },
  heading: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted },
  title: { ...Typography.body, fontWeight: '700', marginTop: 2 },
  reason: { ...Typography.caption, marginTop: 2, lineHeight: 17 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.md, marginTop: 4 },
  meta: { ...Typography.caption, fontWeight: '700', color: Colors.textPrimary },
  streak: { color: Colors.gold },
  cta: { minHeight: 44, minWidth: 64, paddingHorizontal: 14, borderRadius: Radii.full, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  ctaDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.teal },
  ctaTxt: { color: Colors.bg, fontWeight: '800', fontSize: 13 },
  ctaTxtDone: { color: Colors.teal },
  line: { minHeight: 44, paddingVertical: 8, justifyContent: 'center', paddingHorizontal: Spacing.md, paddingLeft: Spacing.md + 40 + Spacing.md },
  lineTxt: { ...Typography.caption, color: Colors.textMuted, fontWeight: '600' },
});
