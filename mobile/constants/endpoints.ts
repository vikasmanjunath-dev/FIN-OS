// FIN·OS backend endpoints for the mobile app.
// When running on a physical device, replace BASE_HOST with your Mac's LAN IP
// (e.g. 192.168.1.5) or an ngrok tunnel URL.
// Simulators/emulators can use 127.0.0.1 / 10.0.2.2 (Android).

import Constants from 'expo-constants';

const isDevice = Constants.appOwnership !== 'expo'; // running on real device vs Expo Go
const BASE_HOST = isDevice ? '192.168.1.100' : '127.0.0.1'; // change to your LAN IP

export const ENDPOINTS = {
  aryaAI:      `http://${BASE_HOST}:7475`,      // arya-ai FastAPI (chat, tools)
  ragEngine:   `http://${BASE_HOST}:7476`,      // RAG engine (knowledge search)
  voiceWS:     `ws://${BASE_HOST}:8765`,        // voiceagent WebSocket (STT/TTS)
  portfolioWS: `ws://${BASE_HOST}:8766`,        // Portfolio Analyser Arya WS
  stockEngine: `http://${BASE_HOST}:8001`,      // stock-engine FastAPI
  alertEngine: `http://${BASE_HOST}:8003`,      // alert-engine FastAPI
  docAI:       `http://${BASE_HOST}:8004`,      // document-ai FastAPI
} as const;

export const SUPABASE_URL  = 'https://your-project.supabase.co';  // same as web app
export const SUPABASE_ANON = 'your-anon-key';                     // same as web app
