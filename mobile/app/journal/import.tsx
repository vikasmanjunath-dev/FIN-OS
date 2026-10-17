import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform, Share } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { TrackerScreen, Card, SectionLabel, Stat } from '@/components/TrackerUI';
import { Notice, NOT_ADVICE, useJournal, s } from '@/components/JournalUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { netOf, pnlText, todayISO } from '@/lib/tradeJournal';
import { parseJournalFile, toCsv, type ImportResult } from '@/lib/tradeJournalImport';
import { importTrades, listBatches, newBatchId, previewImport, undoImport, type BatchInfo, type Fresh } from '@/lib/tradeJournalStorage';

const FORMATS: Record<string, string> = { 'journal-csv': 'This journal\'s own CSV', 'table-csv': 'A table of trades (CSV)', 'fills-csv': 'A broker trade book (buys and sells, paired into trades)', 'web-json': 'A TradeBook backup from the website', none: '' };

export default function ImportScreen() {
  const { data, reload } = useJournal();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [notice, setNotice] = useState<(Fresh & { batch: string }) | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [msg, setMsg] = useState('');
  const refresh = useCallback(async () => { setBatches(await listBatches()); reload(); }, [reload]);
  useFocusEffect(useCallback(() => { listBatches().then(setBatches); }, []));

  const read = (src = text) => {
    setNotice(null); setError(''); setFresh(null);
    if (!src.trim()) { setRes(null); return setError('Choose a file or paste the text first.'); }
    const r = parseJournalFile(src, { batch: newBatchId(), today: todayISO(new Date()) });
    setRes(r);
    if (!r.ok) setError(r.warnings[0] ?? 'That does not look like a list of trades.');
    else previewImport(r).then(setFresh).catch(() => setFresh(null));
  };
  const pick = async () => {
    setError('');
    try {
      const out = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/json', '*/*'], copyToCacheDirectory: true });
      if (out.canceled || !out.assets?.length) return;
      const a = out.assets[0];
      let body: string;
      if (Platform.OS === 'web') body = await (a as any).file.text();
      else { const FS = require('expo-file-system'); body = await FS.readAsStringAsync(a.uri); try { await FS.deleteAsync(a.uri, { idempotent: true }); } catch { /* swept later */ } }
      setFileName(a.name ?? 'file'); setText(body); read(body);
    } catch (e: any) { setError(`Could not open that file${e?.message ? `: ${e.message}` : ''}. You can paste the text instead.`); }
  };
  const commit = async () => {
    if (!res?.ok) return;
    setBusy(true);
    try { const r = await importTrades(res); setNotice(r); setRes(null); setText(''); setFileName(null); await refresh(); } finally { setBusy(false); }
  };
  const undo = async (b: string) => { setBusy(true); try { await undoImport(b); setNotice(null); await refresh(); } finally { setBusy(false); } };

  const exportCsv = async () => {
    setMsg('');
    try {
      const csv = toCsv(data?.trades ?? [], data?.tags ?? []);
      const name = `finos-journal-${todayISO(new Date())}.csv`;
      if (Platform.OS === 'web') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = name; a.click(); }
      else await Share.share({ message: csv, title: name });
      setMsg('Export made. It leaves FIN·OS to wherever you send it, and it holds your trades and notes.');
    } catch { setMsg('Could not make the export.'); }
  };

  return (
    <TrackerScreen title="Import and export" subtitle="Bring trades in from a file, or take your journal out as a CSV. Files are read on this phone and nothing is uploaded.">
      <Notice>{NOT_ADVICE}</Notice>
      {notice && (
        <Card accent={Colors.teal}>
          <Text style={[Typography.body, { fontWeight: '800', color: Colors.teal }]}>{notice.added ? `Added ${notice.added} trade${notice.added === 1 ? '' : 's'}` : 'Nothing new to add'}</Text>
          <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>{notice.duplicates ? `${notice.duplicates} were already in your journal and were left out. ` : ''}{notice.added ? 'They are now in your journal and analytics.' : 'This file is already imported.'}</Text>
          {notice.added > 0 && <TouchableOpacity onPress={() => undo(notice.batch)} disabled={busy} style={{ marginTop: Spacing.md }} accessibilityRole="button"><Text style={s.link}>Undo this import</Text></TouchableOpacity>}
        </Card>
      )}
      <SectionLabel>1 · CHOOSE A FILE</SectionLabel>
      <Card>
        <TouchableOpacity style={s.primary} onPress={pick} accessibilityRole="button" accessibilityLabel="Choose a file"><Text style={s.primaryTxt}>{fileName ? `Chosen: ${fileName}. Choose another` : 'Choose a CSV or JSON file'}</Text></TouchableOpacity>
        <Text style={[Typography.label, { marginTop: Spacing.md, marginBottom: 6 }]}>OR PASTE THE TEXT</Text>
        <TextInput style={[s.input, { minHeight: 100, maxHeight: 200, textAlignVertical: 'top', fontSize: 12 }]} value={text} onChangeText={t => { setText(t); setRes(null); }} multiline autoCapitalize="none" autoCorrect={false}
          placeholder={'symbol,trade_date,trade_type,quantity,price\nRELIANCE,2026-10-05,buy,10,2400'} placeholderTextColor={Colors.textDim} accessibilityLabel="Trade file text" />
        <TouchableOpacity style={[s.secondary, !text.trim() && { opacity: 0.5 }]} disabled={!text.trim()} onPress={() => read()} accessibilityRole="button"><Text style={s.secondaryTxt}>Read the file</Text></TouchableOpacity>
        {error ? <Text style={{ color: Colors.red, fontSize: 12, marginTop: Spacing.md, lineHeight: 17 }} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 16 }]}>Works with a broker trade book (for example Zerodha Console, Reports, Tradebook), a table with date, instrument and profit, this journal's own export, or a TradeBook backup (.json) from the website.</Text>
      </Card>
      {res?.ok && (
        <>
          <SectionLabel>2 · CHECK THE PREVIEW</SectionLabel>
          <Card accent={Colors.cyan}>
            <Text style={Typography.caption}>{FORMATS[res.format]}</Text>
            <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
              <Stat label="Trades" value={String(res.totals.count)} />
              <Stat label="With a profit" value={String(res.totals.rated)} />
              <Stat label="Net profit" value={res.totals.rated ? pnlText(res.totals.net, { sign: true }) : '—'} color={res.totals.net >= 0 ? Colors.teal : Colors.red} />
            </View>
            {res.dateRange && <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>{res.dateRange.from} to {res.dateRange.to}</Text>}
            {res.tags.length > 0 && <Text style={[Typography.caption, { marginTop: 4 }]}>Tags in the file: {res.tags.map(t => t.name).join(', ')}</Text>}
            {res.warnings.map((w, i) => <Text key={i} style={[Typography.caption, { marginTop: 6, lineHeight: 17, color: Colors.orange }]}>• {w}</Text>)}
          </Card>
          <Card>
            <Text style={Typography.label}>FIRST {Math.min(8, res.trades.length)} TRADES</Text>
            {res.trades.slice(0, 8).map((t, i) => { const n = netOf(t); return (
              <View key={i} style={s.row}><View style={{ flex: 1 }}><Text style={Typography.body}>{t.symbol} <Text style={{ color: Colors.textMuted }}>{t.direction ?? ''}</Text></Text><Text style={Typography.caption}>{t.date}</Text></View>
                <Text style={[Typography.body, { fontWeight: '800' }]}>{n === null ? 'Not recorded' : pnlText(n, { sign: true })}</Text></View>); })}
          </Card>
          {res.skipped.length > 0 && <Card><Text style={Typography.label}>{res.skipped.length} ROW{res.skipped.length === 1 ? '' : 'S'} SKIPPED (NEVER GUESSED)</Text>{res.skipped.slice(0, 6).map((k, i) => <Text key={i} style={[Typography.caption, { marginTop: 4 }]}>Line {k.line}: {k.reason}</Text>)}{res.skipped.length > 6 && <Text style={[Typography.caption, { marginTop: 4 }]}>and {res.skipped.length - 6} more</Text>}</Card>}
          {fresh && fresh.duplicates > 0 && <Text style={[Typography.caption, { color: Colors.orange, marginBottom: Spacing.sm }]}>{fresh.duplicates} of these {fresh.duplicates === 1 ? 'is' : 'are'} already in your journal and will be left out.</Text>}
          {(() => { const n = fresh ? fresh.added : res.totals.count; const none = fresh !== null && fresh.added === 0; return (
            <TouchableOpacity style={[s.primary, (busy || none) && { opacity: 0.5 }]} disabled={busy || none} onPress={commit} accessibilityRole="button"><Text style={s.primaryTxt}>{busy ? 'Saving…' : none ? 'Already imported, nothing new' : `Add ${n} ${fresh ? 'new ' : ''}trade${n === 1 ? '' : 's'}`}</Text></TouchableOpacity>); })()}
          <Text style={[Typography.caption, { textAlign: 'center', marginVertical: Spacing.sm }]}>The same file never adds the same trade twice, and any import can be undone below.</Text>
        </>
      )}
      {batches.length > 0 && (<><SectionLabel>PAST IMPORTS</SectionLabel><Card>{batches.map(b => (
        <View key={b.batch} style={s.row}><View style={{ flex: 1 }}><Text style={Typography.body}>{b.count} trade{b.count === 1 ? '' : 's'}</Text><Text style={Typography.caption}>{b.from} to {b.to}</Text></View>
          <TouchableOpacity onPress={() => undo(b.batch)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Undo import of ${b.count} trades`}><Text style={[s.link, { color: Colors.red }]}>Undo</Text></TouchableOpacity></View>))}</Card></>)}
      <SectionLabel>EXPORT</SectionLabel>
      <Card>
        <Text style={[Typography.caption, { lineHeight: 17 }]}>One CSV with every trade, all seven charges, your feelings, tags and notes. Blank means not recorded. It can be read back by this screen.</Text>
        <TouchableOpacity style={[s.secondary, !(data?.trades.length) && { opacity: 0.5 }]} disabled={!data?.trades.length} onPress={exportCsv} accessibilityRole="button" accessibilityLabel="Export the journal as CSV"><Text style={s.secondaryTxt}>Export CSV</Text></TouchableOpacity>
        {msg ? <Text style={[Typography.caption, { marginTop: Spacing.sm }]} accessibilityLiveRegion="polite">{msg}</Text> : null}
      </Card>
    </TrackerScreen>
  );
}
