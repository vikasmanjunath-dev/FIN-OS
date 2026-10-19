import React from 'react';
import { recordCrash } from '@/lib/diagnosticsStorage';

interface Props { children: React.ReactNode; /** called once if the beat fails to draw, so the reel can play on without it */ onFail: () => void }

/**
 * Wraps an interactive beat. If it throws while drawing (a bad script, a figure that breaks) the reel carries on without it instead of taking
 * the whole screen down: it writes the same redacted crash note the app's own boundary writes (Diagnostics) and calls `onFail`.
 */
export class BeatBoundary extends React.Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    const names = String(info?.componentStack ?? '').split('\n').map(l => l.trim().match(/^at\s+([A-Z][A-Za-z0-9_$]{0,40})/)?.[1]).filter(Boolean).slice(0, 6);
    const e = error as { name?: string; message?: string; stack?: string } | null;
    recordCrash({ name: e?.name, message: e?.message, stack: `${e?.stack ?? ''}\n${names.map(n => `at ${n} (component:0:0)`).join('\n')}` }, { kind: 'render' });
    this.props.onFail();
  }
  render() { return this.state.failed ? null : this.props.children; }
}
