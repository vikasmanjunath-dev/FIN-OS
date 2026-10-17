import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, type TextProps } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radii } from '@/constants/theme';
import { MAX_FONT_SCALE, STATUS_LABEL, type Block, type HubEntry, type Lesson, type ManifestEntry, type NotShown, type PhoneTarget, type ReviewItem } from '@/lib/learn';

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

export function BlockView({ b, reviews, source, showSource }: { b: Block; reviews: ReviewItem[]; source?: string; showSource?: boolean }) {
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
  } else if (b.t === 'kv') {
    body = (
      <View style={s.table}>
        {b.rows.map((r, i) => (
          <View key={i} style={s.tr}>
            <LText style={[s.td, { color: Colors.textMuted, flex: 0.9 }]}>{r[0]}</LText>
            <LText style={[s.td, { flex: 1.1 }]}>{r[1]}</LText>
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
      {b.label ? <LText style={s.label}>{b.label.toUpperCase()}</LText> : null}
      {body}
      {b.illustration ? <LText style={s.illus}>{`Illustration on the website: ${b.illustration}`}</LText> : null}
      {showSource && b.line ? <LText style={s.src}>{`Quoted from ${b.file ?? source ?? 'the website page'}, line ${b.line}`}</LText> : null}
      {b.needsReview ? <ReviewTag ids={b.reviewReasons} reviews={reviews} /> : null}
    </View>
  );
}

export function LessonBody({ lesson, reviews, showSource }: { lesson: Lesson; reviews: ReviewItem[]; showSource?: boolean }) {
  return (
    <View>
      {lesson.sections.map((sec, i) => (
        <View key={i} style={{ marginBottom: Spacing.lg }}>
          {sec.kicker ? <LText style={s.kicker}>{sec.kicker.toUpperCase()}</LText> : null}
          {sec.heading ? <LText style={s.h2} accessibilityRole="header">{sec.heading}</LText> : null}
          {sec.blocks.map((b, j) => <BlockView key={j} b={b} reviews={reviews} source={lesson.source} showSource={showSource} />)}
        </View>
      ))}
      {lesson.sources?.length ? (
        <View style={s.sources} accessibilityLabel="Lesson sources">
          <LText style={s.sourcesTitle} accessibilityRole="header">Sources</LText>
          {lesson.sources.map((source, i) => (
            <LText
              key={source.url + i}
              style={s.sourceLink}
              accessibilityRole="link"
              accessibilityHint="Opens this reference in your browser"
              onPress={() => { void Linking.openURL(source.url).catch(() => {}); }}
            >
              {source.label} ↗
            </LText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** App-written notes about a lesson (never part of the quoted text): language, how to read the figures, what was left out. */
export function LessonNotes({ lesson }: { lesson: Lesson }) {
  const notes = lesson.notes ?? [];
  const shown = lesson.notShown ?? [];
  return (
    <View style={{ gap: Spacing.sm, marginBottom: Spacing.md }}>
      <View style={s.note} accessibilityLabel="About this lesson">
        <LText style={s.noteHead}>FROM THE WEBSITE</LText>
        <LText style={s.noteTxt}>{`Quoted from the FIN·OS website page (${(lesson.files ?? [lesson.source]).join(', ')}) without rewriting. Captions in small capitals are written by this app.`}</LText>
        {notes.map((n, i) => <LText key={i} style={s.noteTxt}>{n}</LText>)}
        {lesson.figures ? <LText style={s.noteTxt}>Figures here are statements from the website page. The page does not say where they come from or what date they are for, so treat them as illustrations, not current data.</LText> : null}
      </View>
      {shown.length ? (
        <View style={s.note} accessibilityLabel="Not shown on the phone">
          <LText style={s.noteHead}>NOT SHOWN ON THE PHONE</LText>
          {shown.map((n, i) => <NotShownRow key={i} n={n} />)}
        </View>
      ) : null}
    </View>
  );
}

function NotShownRow({ n }: { n: NotShown }) {
  return (
    <View style={{ marginTop: 6 }}>
      <LText style={s.noteTxt}>{n.what}</LText>
      <LText style={s.noteTxt}>{n.why}</LText>
      <LText style={s.src}>{`${n.file}, line ${n.line}`}</LText>
    </View>
  );
}

const openTarget = (t: PhoneTarget) => {
  if (t.type === 'lesson') router.push(`/learn/${t.id}` as any);
  else if (t.type === 'route') router.push(t.route as any);
};
const MATCH_LABEL: Record<string, string> = { same: 'On the phone', close: 'Something similar on the phone', note: 'Explained on the phone', none: 'Not on the phone' };

function TargetBtn({ t }: { t: PhoneTarget }) {
  const label = t.type === 'lesson' ? (t.match === 'same' ? 'Open the lesson' : 'Read what it is') : t.type === 'route' ? `Open ${t.label}` : '';
  return (
    <View style={{ marginTop: 6 }}>
      <LText style={s.match}>{MATCH_LABEL[t.match]}</LText>
      {t.note ? <LText style={s.noteTxt}>{t.note}</LText> : null}
      {t.type !== 'none' ? (
        <TouchableOpacity style={s.btn} onPress={() => openTarget(t)} accessibilityRole="button" accessibilityLabel={label}>
          <LText style={s.btnTxt}>{`${label} →`}</LText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function EntryCard({ e }: { e: HubEntry }) {
  return (
    <View style={s.entry}>
      <LText style={s.entryTitle}>{e.title}</LText>
      {e.text ? <LText style={s.p}>{e.text}</LText> : null}
      {e.extra ? <LText style={s.noteTxt}>{e.extra}</LText> : null}
      <TargetBtn t={e.target} />
    </View>
  );
}

/** Honest page for an interactive, menu or redirect page of the website. */
export function StubView({ entry }: { entry: ManifestEntry }) {
  const st = entry.stub;
  if (!st) return null;
  const redirect = st.redirectTo ? { type: 'lesson', id: st.redirectTo, match: 'same', note: '' } as PhoneTarget : null;
  return (
    <View style={{ gap: Spacing.md }}>
      <View style={s.banner} accessibilityRole="summary">
        <LText style={s.reviewHead}>{STATUS_LABEL[st.status].toUpperCase()}</LText>
        <LText style={s.p}>{st.why}</LText>
      </View>
      {st.about.length ? (
        <View style={s.note} accessibilityLabel="What the website page says">
          <LText style={s.noteHead}>WHAT THE WEBSITE PAGE SAYS</LText>
          {st.about.map((a, i) => <LText key={i} style={s.noteTxt}>{`“${a.text}”`}</LText>)}
          <LText style={s.src}>{`${entry.source}, line ${st.about[0].line}`}</LText>
        </View>
      ) : null}
      {redirect ? <TargetBtn t={redirect} /> : null}
      {st.entries?.length ? <View><LText style={s.noteHead}>WHAT THE PAGE OFFERS, AND WHAT THE PHONE HAS</LText>{st.entries.map((e, i) => <EntryCard key={i} e={e} />)}</View> : null}
      {st.notCarried?.length ? (
        <View style={s.note} accessibilityLabel="Left out on purpose">
          <LText style={s.noteHead}>LEFT OUT ON PURPOSE</LText>
          {st.notCarried.map((n, i) => <NotShownRow key={i} n={n} />)}
        </View>
      ) : null}
      {entry.tool && !st.redirectTo ? (
        <TouchableOpacity style={s.btn} onPress={() => router.push(entry.tool as any)} accessibilityRole="button" accessibilityLabel={`Open ${st.toolLabel ?? 'the closest tool'}`}>
          <LText style={s.btnTxt}>{`Open ${st.toolLabel ?? 'the closest tool'} →`}</LText>
        </TouchableOpacity>
      ) : null}
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
  label: { color: Colors.cyan, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  illus: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4, fontStyle: 'italic' },
  src: { color: Colors.textDim, fontSize: 11, marginTop: 3 },
  note: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.md, padding: Spacing.md, gap: 4 },
  noteHead: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 2 },
  noteTxt: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  match: { color: Colors.teal, fontSize: 12, fontWeight: '700' },
  entry: { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1, borderRadius: Radii.md, padding: Spacing.md, marginTop: Spacing.sm, gap: 2 },
  entryTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  btn: { marginTop: 6, borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, padding: Spacing.md, alignItems: 'center' },
  btnTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 14 },
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
  sources: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing.md, paddingTop: Spacing.md, gap: Spacing.sm },
  sourcesTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  sourceLink: { color: Colors.cyan, fontSize: 14, lineHeight: 21, textDecorationLine: 'underline' },
});
