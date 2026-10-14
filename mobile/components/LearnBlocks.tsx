import React from 'react';
import { View, Text, StyleSheet, type TextProps } from 'react-native';
import { Colors, Spacing, Radii } from '@/constants/theme';
import { MAX_FONT_SCALE, type Block, type Lesson, type ReviewItem } from '@/lib/learn';

/** Text that never scales past 200% (the reader's accessibility cap). */
export function LText(p: TextProps) {
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...p} />;
}

const KIND_COLOR: Record<string, string> = { tip: Colors.teal, warning: Colors.gold, fact: Colors.cyan, note: Colors.borderHi };

function ReviewTag({ ids, reviews }: { ids?: string[]; reviews: ReviewItem[] }) {
  const items = (ids ?? []).map(id => reviews.find(r => r.id === id)).filter(Boolean) as ReviewItem[];
  if (!items.length) return null;
  return (
    <View style={s.review} accessible accessibilityLabel={`Needs fact-check. ${items.map(i => i.why).join(' ')}`}>
      <LText style={s.reviewHead}>CHECK BEFORE RELYING ON THIS</LText>
      {items.map(i => (
        <View key={i.id} style={{ marginTop: 4 }}>
          <LText style={s.reviewWhy}>{i.why}</LText>
          <LText style={s.reviewNow}>{`Current position: ${i.current}`}</LText>
        </View>
      ))}
    </View>
  );
}

export function BlockView({ b, reviews }: { b: Block; reviews: ReviewItem[] }) {
  const flagged = b.needsReview ? { borderLeftColor: Colors.gold } : null;
  let body: React.ReactNode = null;
  if (b.t === 'p') body = <LText style={s.p}>{b.text}</LText>;
  else if (b.t === 'h') body = <LText style={s.h} accessibilityRole="header">{b.text}</LText>;
  else if (b.t === 'ul' || b.t === 'ol') {
    body = (
      <View>
        {b.items.map((it, i) => (
          <View key={i} style={s.li}>
            <LText style={s.bullet}>{b.t === 'ol' ? `${i + 1}.` : '•'}</LText>
            <LText style={[s.p, { flex: 1 }]}>{it}</LText>
          </View>
        ))}
      </View>
    );
  } else if (b.t === 'table') {
    body = (
      <View style={s.table}>
        {b.rows.map((r, i) => (
          <View key={i} style={[s.tr, i === 0 && { backgroundColor: Colors.overlay }]}>
            {r.map((c, j) => <LText key={j} style={[s.td, i === 0 && { fontWeight: '700' }]}>{c}</LText>)}
          </View>
        ))}
      </View>
    );
  } else if (b.t === 'callout') {
    body = (
      <View style={[s.callout, { borderLeftColor: KIND_COLOR[b.kind] ?? Colors.borderHi }]}>
        {b.title ? <LText style={s.calloutTitle}>{b.title}</LText> : null}
        {b.text ? <LText style={s.p}>{b.text}</LText> : null}
      </View>
    );
  }
  return (
    <View style={[s.block, b.needsReview && s.blockFlag, flagged]}>
      {body}
      {b.needsReview ? <ReviewTag ids={b.reviewReasons} reviews={reviews} /> : null}
    </View>
  );
}

export function LessonBody({ lesson, reviews }: { lesson: Lesson; reviews: ReviewItem[] }) {
  return (
    <View>
      {lesson.sections.map((sec, i) => (
        <View key={i} style={{ marginBottom: Spacing.lg }}>
          {sec.kicker ? <LText style={s.kicker}>{sec.kicker.toUpperCase()}</LText> : null}
          {sec.heading ? <LText style={s.h2} accessibilityRole="header">{sec.heading}</LText> : null}
          {sec.blocks.map((b, j) => <BlockView key={j} b={b} reviews={reviews} />)}
        </View>
      ))}
    </View>
  );
}

/** Top-of-lesson summary of what is flagged, with the confidence of each doubt. */
export function ReviewBanner({ lesson, reviews }: { lesson: Lesson; reviews: ReviewItem[] }) {
  const items = lesson.reviewReasons.map(id => reviews.find(r => r.id === id)).filter(Boolean) as ReviewItem[];
  if (!lesson.needsReview || !items.length) return null;
  return (
    <View style={s.banner} accessibilityRole="alert">
      <LText style={s.reviewHead}>{`${items.length} PASSAGE${items.length === 1 ? '' : 'S'} UNDER FACT-CHECK`}</LText>
      <LText style={s.p}>
        This lesson comes from the FIN·OS website. Some facts, rates or examples may be out of date for FY 2025-26. Passages marked in gold
        should be confirmed against an official source (RBI, SEBI, Income Tax Department) before you act on them.
      </LText>
    </View>
  );
}

const s = StyleSheet.create({
  block: { marginBottom: Spacing.sm },
  blockFlag: { borderLeftWidth: 3, paddingLeft: Spacing.sm, borderLeftColor: Colors.gold },
  p: { color: Colors.textPrimary, fontSize: 15, lineHeight: 23 },
  h: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', marginTop: Spacing.sm },
  h2: { color: Colors.textPrimary, fontSize: 19, fontWeight: '800', marginBottom: Spacing.sm },
  kicker: { color: Colors.cyan, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  li: { flexDirection: 'row', marginBottom: 4, gap: 8 },
  bullet: { color: Colors.textMuted, fontSize: 15, lineHeight: 23, width: 20 },
  callout: { borderLeftWidth: 3, backgroundColor: Colors.overlay, borderRadius: Radii.sm, padding: Spacing.md },
  calloutTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  table: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.sm, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
  td: { flex: 1, color: Colors.textPrimary, fontSize: 14, padding: Spacing.sm },
  review: { marginTop: 6, padding: Spacing.sm, borderRadius: Radii.sm, borderWidth: 1, borderColor: Colors.gold },
  reviewHead: { color: Colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  reviewWhy: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19 },
  reviewNow: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  banner: { borderWidth: 1, borderColor: Colors.gold, borderRadius: Radii.md, padding: Spacing.md, marginBottom: Spacing.lg, gap: 4 },
});
