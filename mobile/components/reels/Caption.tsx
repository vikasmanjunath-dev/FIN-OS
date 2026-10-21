import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { captionMotion, wordAt } from '@/lib/reels/voice';

/**
 * The caption of a scene. It slides up and fades in as its scene begins and fades out as it ends. While a voice is speaking (`progress` is a number,
 * 0 to 1) the word being said is lit, the words already said stay white and the ones still to come are dimmer, so the eye and the ear stay together.
 * With no voice (`progress` null) it is plain white text, exactly as before. A screen reader gets the whole caption as one piece.
 */
export function Caption({ text, progress, elapsedMs, sceneMs, style, reduceMotion }: {
  text: string; progress: number | null; elapsedMs: number; sceneMs: number; style: TextStyle | TextStyle[]; reduceMotion?: boolean;
}) {
  const words = text.split(' ');
  const motion = reduceMotion ? { opacity: 1, translateY: 0 } : captionMotion(elapsedMs, sceneMs);
  const at = progress === null ? -1 : wordAt(words, progress);
  return (
    <Text
      style={[style, { opacity: motion.opacity, transform: [{ translateY: motion.translateY }] }]}
      accessibilityLiveRegion="polite" accessibilityLabel={text} maxFontSizeMultiplier={1.35}>
      {progress === null ? text : words.map((w, i) => (
        <Text key={i} style={i === at ? s.now : i < at ? s.said : s.next}>{w}{i < words.length - 1 ? ' ' : ''}</Text>
      ))}
    </Text>
  );
}

const s = StyleSheet.create({
  now: { color: '#FFD84D' },
  said: { color: '#FFFFFF' },
  next: { color: 'rgba(255,255,255,0.62)' },
});
