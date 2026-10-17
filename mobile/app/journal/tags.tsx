import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform, Alert } from 'react-native';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { Chips, Notice, useJournal, s } from '@/components/JournalUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { TAG_COLORS, TAG_TYPES } from '@/lib/tradeJournal';
import { addTag, deleteTag } from '@/lib/tradeJournalStorage';

export default function TagsScreen() {
  const { data, reload } = useJournal();
  const [name, setName] = useState('');
  const [type, setType] = useState('custom');
  const [color, setColor] = useState<string>(TAG_COLORS[0]);
  const [msg, setMsg] = useState('');
  const save = async () => {
    const r = await addTag({ name, type, color });
    if (!r.ok) return setMsg(r.error);
    setName(''); setMsg('Tag added.'); reload();
  };
  const remove = (id: string, label: string) => {
    const go = async () => { await deleteTag(id); reload(); };
    if (Platform.OS === 'web') { if (window.confirm(`Delete the tag ${label}? It is also taken off your trades.`)) go(); return; }
    Alert.alert('Delete tag', `Delete ${label}? It is also taken off your trades.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };
  return (
    <TrackerScreen title="Tags" subtitle="Your own labels for trades (for example Gap up, Expiry day, News). Tags are counted on the Analytics screen.">
      <Card>
        <Text style={s.label}>NEW TAG</Text>
        <TextInput style={s.input} value={name} onChangeText={t => { setName(t); setMsg(''); }} placeholder="Tag name" placeholderTextColor={Colors.textDim} maxLength={30} accessibilityLabel="Tag name" />
        <View style={{ height: Spacing.md }} />
        <Chips label="Type" options={TAG_TYPES} value={type} onChange={(v: string) => setType(v || 'custom')} allowClear={false} />
        <Chips label="Colour" options={TAG_COLORS.map(c => ({ id: c, label: c }))} value={color} onChange={(v: string) => setColor(v || TAG_COLORS[0])} allowClear={false} />
        <TouchableOpacity style={s.primary} onPress={save} accessibilityRole="button" accessibilityLabel="Add tag"><Text style={s.primaryTxt}>Add tag</Text></TouchableOpacity>
        {msg ? <Text style={[Typography.caption, { marginTop: Spacing.sm }]} accessibilityLiveRegion="polite">{msg}</Text> : null}
      </Card>
      <SectionLabel>YOUR TAGS</SectionLabel>
      {!data ? <Card><Text style={Typography.body}>Reading…</Text></Card> : data.tags.length === 0 ? <Notice>No tags yet.</Notice> : (
        <Card>
          {data.tags.map(t => {
            const used = data.trades.filter(x => x.tags?.includes(t.id)).length;
            return (
              <View key={t.id} style={s.row}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.color, marginRight: 8 }} />
                  <View><Text style={Typography.body}>{t.name}</Text><Text style={Typography.caption}>{TAG_TYPES.find(x => x.id === t.type)?.label} · on {used} {used === 1 ? 'trade' : 'trades'}</Text></View>
                </View>
                <TouchableOpacity onPress={() => remove(t.id, t.name)} accessibilityRole="button" accessibilityLabel={`Delete tag ${t.name}`}><Text style={[s.link, { color: Colors.red }]}>Delete</Text></TouchableOpacity>
              </View>
            );
          })}
        </Card>
      )}
    </TrackerScreen>
  );
}
