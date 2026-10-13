// Makes every <Text> and <TextInput placeholder> show the person's language without touching any screen.
// React Native's Text / TextInput (and react-native-web's) are forwardRef components, so their render function is wrapped once.
// Children that are only strings and numbers are joined first, so `{amount} a month` is looked up as one sentence.
import { Text, TextInput } from 'react-native';
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

export function installLanguagePatch() {
  if (done) return;
  done = true;
  const T: any = Text;
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
