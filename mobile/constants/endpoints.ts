// FIN·OS backend endpoints for the mobile app.
//
// Host resolution (first match wins):
//   1. Host saved in Settings (AsyncStorage `finos_host_ip`) — IP, hostname or full http(s) URL
//   2. The machine running `expo start` (Expo hostUri) — works on a physical phone over LAN
//   3. Browser hostname on web
//   4. 127.0.0.1 (iOS simulator) / 10.0.2.2 (Android emulator)

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HOST_KEY = 'finos_host_ip';

function detectHost(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.hostname || '127.0.0.1';
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  const fromExpo = hostUri?.split(':')[0];
  if (fromExpo) return fromExpo;
  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

const PORTS = {
  aryaAI: 7475,      // arya-ai FastAPI (market data, tools, chat)
  ragEngine: 7476,   // RAG engine
  voiceWS: 8765,     // voiceagent WebSocket (STT/TTS)
  portfolioWS: 8766, // Portfolio Analyser Arya WS
  stockEngine: 8003, // stock-engine FastAPI (docker-compose / Dockerfile)
  alertEngine: 8001, // alert-engine FastAPI
  docAI: 8004,       // document-ai FastAPI
} as const;

type EndpointKey = keyof typeof PORTS;
const isWS = (k: EndpointKey) => k === 'voiceWS' || k === 'portfolioWS';

function build(host: string): Record<EndpointKey, string> {
  const base = host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return Object.fromEntries(
    (Object.keys(PORTS) as EndpointKey[]).map(k => [k, `${isWS(k) ? 'ws' : 'http'}://${base}:${PORTS[k]}`]),
  ) as Record<EndpointKey, string>;
}

// Mutable on purpose: Settings can override the host at runtime (see applyHost).
export const ENDPOINTS: Record<EndpointKey, string> = build(detectHost());

export function applyHost(host: string | null | undefined) {
  Object.assign(ENDPOINTS, build(host?.trim() || detectHost()));
}

/** Load a saved host override. Call once at app start, before any fetch. */
export async function loadSavedHost() {
  try {
    applyHost(await AsyncStorage.getItem(HOST_KEY));
  } catch {
    /* keep detected host */
  }
}
