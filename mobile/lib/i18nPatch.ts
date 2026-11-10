// Makes every <Text> and <TextInput placeholder> show the person's language without touching any screen.
// React Native's Text / TextInput (and react-native-web's) are forwardRef components, so their render function is wrapped once.
// Children that are only strings and numbers are joined first, so `{amount} a month` is looked up as one sentence.
import { createElement } from 'react';
import { Platform, Text, TextInput } from 'react-native';
import { getLang, translate, noteMissing, useLang } from '@/lib/i18n';

let done = false;

function tr(children: any): any {
  if (typeof children === 'string') { const out = translate(children); if (out === children) noteMissing(children); return out; }
  if (Array.isArray(children) && children.length && children.every(c => typeof c === 'string' || typeof c === 'number')) {
    const joined = children.join('');
    const out = translate(joined);
    if (out === joined) { noteMissing(joined); return children; }
    return out;
  }
  return children;
}

// React Native 0.78+ with React 19: Text / TextInput are plain components (the ref is a prop), so there is no `.render`
// to wrap and the wrapper below does nothing on a phone (it only worked on the web). The `react-native` package object
// exposes both as configurable getters that every `import { Text } from 'react-native'` reads at render time, so the
// getter is replaced with a translating wrapper: no screen has to change. (`Libraries/Text/Text`'s own `default` export is
// getter-only and cannot be reassigned; that was tried first and failed on a device.)
function patchNative(name: 'Text' | 'TextInput', translateProps: (props: any) => any) {
  try {
    const RN: any = require('react-native');
    const Orig: any = RN[name];
    const Wrapped: any = (props: any) => {
      useLang();                                          // redraw when the language changes
      if (getLang() === 'en' || props == null) return createElement(Orig, props);
      return createElement(Orig, translateProps(props));
    };
    Object.assign(Wrapped, Orig);                         // keep statics such as TextInput.State
    Wrapped.displayName = Orig.displayName ?? name;
    Object.defineProperty(RN, name, { configurable: true, enumerable: true, get: () => Wrapped });
  } catch { /* leave the component as React Native ships it: English, never a crash */ }
}

export function installLanguagePatch() {
  if (done) return;
  done = true;
  const T: any = Text;
  if (Platform.OS !== 'web' && !(T && typeof T.render === 'function')) {
    patchNative('Text', (p) => (p.children == null ? p : { ...p, children: tr(p.children) }));
    patchNative('TextInput', (p) => (typeof p.placeholder !== 'string' ? p : { ...p, placeholder: translate(p.placeholder) }));
    return;
  }
  if (T && typeof T.render === 'function') {
    const orig = T.render;
    T.render = function (props: any, ref: any) {
      useLang();                                          // so every Text redraws when the language changes, with no screen reload
      if (getLang() === 'en' || props == null || props.children == null) return orig.call(this, props, ref);
      return orig.call(this, { ...props, children: tr(props.children) }, ref);
    };
  }
  const I: any = TextInput;
  if (I && typeof I.render === 'function') {
    const orig = I.render;
    I.render = function (props: any, ref: any) {
      useLang();
      if (getLang() === 'en' || props == null || typeof props.placeholder !== 'string') return orig.call(this, props, ref);
      return orig.call(this, { ...props, placeholder: translate(props.placeholder) }, ref);
    };
  }
}
