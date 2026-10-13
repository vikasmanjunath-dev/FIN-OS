import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet } from '@/components/CalcUI';
import { EMPTY_PROFILE, USED_FOR, completeness, validate, type Profile } from '@/lib/profile';
import { loadProfile, saveProfile } from '@/lib/profileStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function ProfileScreen() {
  const [p, setP] = useState<Profile>(EMPTY_PROFILE);
  const [errors, setErrors] = useState<Partial<Record<keyof Profile, string>>>({});
  const [saved, setSaved] = useState(false);

  useFocusEffect(useCallback(() => { loadProfile().then(x => { setP(x); setSaved(false); }); }, []));
  const set = (k: keyof Profile) => (v: string) => { setP(prev => ({ ...prev, [k]: v })); setSaved(false); };

  const save = async () => {
    const c = validate(p);
    setErrors(c.errors);
    if (!c.ok) return;
    await saveProfile(c.clean);
    setP(c.clean);
    setSaved(true);
  };

  return (
    <TrackerScreen title="Your profile" subtitle="Four facts that make the numbers fit you. Everything here stays on this phone.">
      <Card accent={Colors.cyan}>
        <Text style={Typography.label}>{`${completeness(p)} OF 4 FILLED IN`}</Text>
        <CalcField label="NAME" text value={p.name} onChange={set('name')} placeholder="e.g. Asha" maxLength={60} sub={USED_FOR.name} />
        <CalcField label="AGE" suffix="yrs" value={p.age} onChange={set('age')} sub={errors.age ?? USED_FOR.age} />
        <CalcField label="MONTHLY INCOME (TAKE-HOME)" prefix="₹" value={p.income} onChange={set('income')} sub={errors.income ?? USED_FOR.income} />
        <CalcField label="PEOPLE WHO DEPEND ON YOUR INCOME" value={p.dependents} onChange={set('dependents')} sub={errors.dependents ?? USED_FOR.dependents} />
        <TouchableOpacity style={s.btn} accessibilityRole="button" onPress={save}><Text style={s.btnTxt}>{saved ? 'Saved ✓' : 'Save profile'}</Text></TouchableOpacity>
        {Object.keys(errors).length > 0 && <Text style={[Typography.caption, { color: Colors.red, marginTop: Spacing.sm }]} accessibilityRole="alert">Fix the highlighted answers and save again.</Text>}
      </Card>
      <Collapsible title="What is not asked">
        <Bullet>No phone number, e-mail, address, PAN or Aadhaar. Nothing here is needed to work out your numbers.</Bullet>
        <Bullet>Leave any field blank and the screens that use it simply say "not recorded" instead of guessing.</Bullet>
        <Bullet>You can erase all of this from Settings, Privacy and your data.</Bullet>
      </Collapsible>
      <View style={{ height: Spacing.lg }} />
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  btn: { backgroundColor: Colors.cyan, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.sm },
  btnTxt: { color: '#000', fontWeight: '900', fontSize: 14 },
});
