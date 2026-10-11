import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { TERMS, TERMS_STATUS } from '@/lib/privacy';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function TermsScreen() {
  return (
    <TrackerScreen title="Terms of use" subtitle="The ground rules for using FIN·OS, in plain language.">
      <Card accent={Colors.gold}>
        <Text style={[Typography.caption, { lineHeight: 18, color: Colors.textPrimary }]}>{TERMS_STATUS}</Text>
      </Card>
      {TERMS.map(sec => (
        <React.Fragment key={sec.title}>
          <SectionLabel>{sec.title.toUpperCase()}</SectionLabel>
          <Card>
            {sec.body.map((p, i) => <Text key={i} style={[Typography.body, { lineHeight: 21, marginTop: i ? Spacing.sm : 0 }]}>{p}</Text>)}
          </Card>
        </React.Fragment>
      ))}
      <TouchableOpacity onPress={() => router.push('/privacy' as any)} accessibilityRole="button" style={{ padding: Spacing.md }}>
        <Text style={{ color: Colors.cyan, fontWeight: '800' }}>Privacy & your data →</Text>
      </TouchableOpacity>
    </TrackerScreen>
  );
}
