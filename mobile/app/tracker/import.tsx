import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { parseStatement, fromAA, topCategories } from '@/lib/statementImport';
import { importStatementRows, undoImportBatch, listImportBatches, previewImport, type ImportBatchInfo } from '@/lib/txnStorage';
import { loadTrackerData, persistDerived } from '@/lib/trackerStorage';
import { TrackerScreen, Card, SectionLabel, Stat, inr } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

interface Parsed {
  ok: boolean; format: string; rows: any[]; skipped: { line: number; reason: string }[]; warnings: string[];
  dateRange: { from: string; to: string } | null; totals: { count: number; credits: number; debits: number };
  reconciled: 'yes' | 'no' | 'unknown';
}

const looksLikeJson = (t: string) => /^\s*[\[{]/.test(t);
const day = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function ImportStatementScreen() {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [notice, setNotice] = useState<{ added: number; duplicates: number; batch: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ added: number; duplicates: number } | null>(null);
  const [batches, setBatches] = useState<ImportBatchInfo[]>([]);

  const refreshBatches = useCallback(async () => setBatches(await listImportBatches()), []);
  useFocusEffect(useCallback(() => { refreshBatches(); }, [refreshBatches]));

  const afterChange = async () => { await persistDerived(await loadTrackerData()); await refreshBatches(); };

  const pickFile = async () => {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/json', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const body = await (await fetch(a.uri)).text();
      setFileName(a.name ?? 'statement');
      setText(body);
      setParsed(null); setNotice(null);
      read(body);
    } catch (e: any) {
      setError(`Could not open that file${e?.message ? `: ${e.message}` : ''}. You can paste the statement text instead.`);
    }
  };

  const read = (source = text) => {
    setNotice(null);
    setError(null);
    if (!source.trim()) { setParsed(null); return setError('Choose a file or paste the statement text first.'); }
    const r = (looksLikeJson(source) ? fromAA(source) : parseStatement(source)) as Parsed;
    setParsed(r);
    setFresh(null);
    if (!r.ok) setError(r.warnings[0] ?? 'That does not look like a bank statement.');
    else previewImport(r.rows).then(setFresh).catch(() => setFresh(null));
  };

  const commit = async () => {
    if (!parsed?.ok) return;
    setBusy(true);
    try {
      const res = await importStatementRows(parsed.rows);
      setNotice(res);
      setParsed(null); setText(''); setFileName(null);
      await afterChange();
    } finally { setBusy(false); }
  };

  const undo = async (batch: string) => {
    setBusy(true);
    try { await undoImportBatch(batch); setNotice(null); await afterChange(); } finally { setBusy(false); }
  };

  const preview = parsed?.ok ? parsed : null;
  const cats = preview ? topCategories(preview.rows, 5) : [];
  const reconColor = preview?.reconciled === 'yes' ? Colors.teal : preview?.reconciled === 'no' ? Colors.orange : Colors.textMuted;

  return (
    <TrackerScreen title="Import a bank statement" subtitle="Bring in your bank's CSV (or Account Aggregator JSON). It is read on this phone — nothing is uploaded — and you see a preview before anything is saved.">
      {notice && (
        <Card accent={Colors.teal}>
          <Text style={[Typography.body, { fontWeight: '800', color: Colors.teal }]}>
            {notice.added ? `Added ${notice.added} transaction${notice.added === 1 ? '' : 's'}` : 'Nothing new to add'}
          </Text>
          <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
            {notice.duplicates ? `${notice.duplicates} were already in your list, so they were left out. ` : ''}
            {notice.added ? 'They now count in your budget, spending and health score.' : 'This statement is already imported.'}
          </Text>
          {notice.added > 0 && (
            <TouchableOpacity onPress={() => undo(notice.batch)} disabled={busy} style={{ marginTop: Spacing.md }} accessibilityRole="button">
              <Text style={s.link}>Undo this import</Text>
            </TouchableOpacity>
          )}
        </Card>
      )}

      <SectionLabel>1 · CHOOSE YOUR STATEMENT</SectionLabel>
      <Card>
        <TouchableOpacity style={s.primary} onPress={pickFile} accessibilityRole="button" accessibilityLabel="Choose a statement file">
          <Text style={s.primaryTxt}>{fileName ? `Chosen: ${fileName} — choose another` : 'Choose a CSV file'}</Text>
        </TouchableOpacity>
        <Text style={[Typography.label, { marginTop: Spacing.md, marginBottom: 6 }]}>OR PASTE THE TEXT</Text>
        <TextInput
          style={s.paste}
          value={text}
          onChangeText={t => { setText(t); setParsed(null); }}
          multiline
          placeholder={'Date,Narration,Debit,Credit,Balance\n01/04/2026,UPI/Swiggy,420.00,,18420.50'}
          placeholderTextColor={Colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Statement text"
        />
        <TouchableOpacity style={[s.secondary, !text.trim() && { opacity: 0.5 }]} onPress={() => read()} disabled={!text.trim()} accessibilityRole="button">
          <Text style={s.secondaryTxt}>Read statement</Text>
        </TouchableOpacity>
        {error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
        <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 16 }]}>
          Download the statement as CSV from your bank's website or app (net banking → statement → CSV/Excel). Only date, description, amount and balance are read — never account numbers or names.
        </Text>
      </Card>

      {preview && (
        <>
          <SectionLabel>2 · CHECK THE PREVIEW</SectionLabel>
          <Card accent={reconColor}>
            <View style={{ flexDirection: 'row' }}>
              <Stat label="Transactions" value={String(preview.totals.count)} />
              <Stat label="Money in" value={inr(preview.totals.credits)} color={Colors.teal} />
              <Stat label="Money out" value={inr(preview.totals.debits)} color={Colors.gold} />
            </View>
            {preview.dateRange && (
              <Text style={[Typography.caption, { marginTop: Spacing.md }]}>{day(preview.dateRange.from)} → {day(preview.dateRange.to)}</Text>
            )}
            <Text style={[Typography.caption, { marginTop: 6, color: reconColor, lineHeight: 17 }]}>
              {preview.reconciled === 'yes' ? '✓ The running balance adds up row by row — nothing looks missing.'
                : preview.reconciled === 'no' ? '⚠ The balance column does not add up. A row may be missing or misread — check before importing.'
                : 'Balance check not possible (the file has no balance column or too few rows).'}
            </Text>
            {preview.warnings.filter(w => !/balance column does not add up/i.test(w)).map((w, i) => (
              <Text key={i} style={[Typography.caption, { marginTop: 6, lineHeight: 17, color: Colors.orange }]}>• {w}</Text>
            ))}
          </Card>

          {cats.length > 0 && (
            <Card>
              <Text style={Typography.label}>WHERE THE MONEY WENT</Text>
              {cats.map(c => (
                <View key={c.category} style={s.row}>
                  <Text style={Typography.body}>{c.category}</Text>
                  <Text style={[Typography.body, { fontWeight: '700' }]}>{inr(c.amount)}</Text>
                </View>
              ))}
            </Card>
          )}

          <Card>
            <Text style={Typography.label}>FIRST {Math.min(8, preview.rows.length)} ROWS</Text>
            {preview.rows.slice(0, 8).map((r, i) => (
              <View key={i} style={s.row}>
                <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                  <Text style={Typography.body}>{r.desc}</Text>
                  <Text style={Typography.caption}>{day(r.date)}</Text>
                </View>
                <Text style={[Typography.body, { fontWeight: '800', color: r.type === 'credit' ? Colors.teal : Colors.textPrimary }]}>
                  {r.type === 'credit' ? '+' : '−'}{inr(r.amount)}
                </Text>
              </View>
            ))}
          </Card>

          {preview.skipped.length > 0 && (
            <Card>
              <Text style={Typography.label}>{preview.skipped.length} ROW{preview.skipped.length === 1 ? '' : 'S'} SKIPPED (NEVER GUESSED)</Text>
              {preview.skipped.slice(0, 6).map((k, i) => (
                <Text key={i} style={[Typography.caption, { marginTop: 4 }]}>Line {k.line}: {k.reason}</Text>
              ))}
              {preview.skipped.length > 6 && <Text style={[Typography.caption, { marginTop: 4 }]}>…and {preview.skipped.length - 6} more</Text>}
            </Card>
          )}

          {fresh && fresh.duplicates > 0 && (
            <Text style={[Typography.caption, { color: Colors.orange, lineHeight: 17, marginBottom: Spacing.sm }]}>
              {fresh.duplicates} of these {fresh.duplicates === 1 ? 'is' : 'are'} already in your list and will be left out.
            </Text>
          )}
          {(() => {
            const n = fresh ? fresh.added : preview.totals.count;
            const none = fresh !== null && fresh.added === 0;
            return (
              <TouchableOpacity style={[s.primary, (busy || none) && { opacity: 0.5 }]} onPress={commit} disabled={busy || none} accessibilityRole="button">
                <Text style={s.primaryTxt}>{busy ? 'Saving…' : none ? 'Already imported — nothing new' : `Add ${n} ${fresh ? 'new ' : ''}transaction${n === 1 ? '' : 's'}`}</Text>
              </TouchableOpacity>
            );
          })()}
          <Text style={[Typography.caption, { textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.lg }]}>
            Importing the same file twice never adds the same transaction again, and you can undo any import below.
          </Text>
        </>
      )}

      {batches.length > 0 && (
        <>
          <SectionLabel>PAST IMPORTS</SectionLabel>
          <Card>
            {batches.map(b => (
              <View key={b.batch} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={Typography.body}>{b.count} transaction{b.count === 1 ? '' : 's'}</Text>
                  <Text style={Typography.caption}>{b.from && b.to ? `${day(b.from)} → ${day(b.to)}` : ''}</Text>
                </View>
                <TouchableOpacity onPress={() => undo(b.batch)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Undo import of ${b.count} transactions`}>
                  <Text style={[s.link, { color: Colors.red }]}>Undo</Text>
                </TouchableOpacity>
              </View>
            ))}
          </Card>
        </>
      )}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  primary: { minHeight: 44, justifyContent: 'center', backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center' },
  primaryTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  secondary: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: Colors.cyan + '66', borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.sm },
  secondaryTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
  paste: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 12, minHeight: 110, maxHeight: 220, textAlignVertical: 'top',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  error: { color: Colors.red, fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
  link: { color: Colors.cyan, fontWeight: '800', fontSize: 13 },
});
