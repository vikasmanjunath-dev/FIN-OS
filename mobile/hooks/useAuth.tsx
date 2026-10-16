import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, friendlyAuthError, googleStatus } from '@/lib/supabase';
import { GOOGLE_REDIRECT_PATH, signInWithGoogle as runGoogle } from '@/lib/googleAuth';
import { syncHoldings } from '@/lib/holdingsStore';
import { syncTrackersNow } from '@/lib/trackerSyncStore';

interface AuthCtx {
  /** Cloud sync credentials present in .env */
  configured: boolean;
  /** false until the persisted session has been read */
  ready: boolean;
  session: Session | null;
  signIn(email: string, password: string): Promise<void>;
  /** Returns 'confirm' when the project requires email confirmation before first sign-in. */
  signUp(name: string, email: string, password: string): Promise<'signed-in' | 'confirm'>;
  signOut(): Promise<void>;
  /** Google through Supabase OAuth. */
  signInWithGoogle(): Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
  googleAvailable: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setReady(true);
      // Never await supabase calls inside this callback (auth-js can deadlock) — defer instead.
      if (next && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) setTimeout(() => { syncHoldings(); syncTrackersNow({ force: true }); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Cloud sync is not configured.');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    if (!supabase) throw new Error('Cloud sync is not configured.');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password, options: { data: { full_name: name.trim() } },
      });
      if (error) throw error;
      // Keep the name the dashboard greets with, unless the user already set one.
      if (name.trim() && !(await AsyncStorage.getItem('finos_user_name'))) {
        await AsyncStorage.setItem('finos_user_name', name.trim());
      }
      return data.session ? 'signed-in' : 'confirm';
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    // Local holdings stay on the device; they're only replaced if a *different* account signs in later.
    // scope 'local': sign out THIS phone only. The default ('global') would also end the person's sessions on the website and other phones.
    await supabase?.auth.signOut({ scope: 'local' });
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> => {
    if (!supabase || !googleStatus.available) return { ok: false, error: 'Google sign-in is not set up for this app yet.' };
    try {
      const WebBrowser = require('expo-web-browser');
      const Linking = require('expo-linking');
      WebBrowser.maybeCompleteAuthSession?.();
      const r = await runGoogle({
        redirectTo: Linking.createURL(GOOGLE_REDIRECT_PATH),
        client: supabase as any,
        openAuthSession: (url, to) => WebBrowser.openAuthSessionAsync(url, to),
      });
      return r.ok ? { ok: true } : { ok: false, cancelled: r.cancelled, error: r.error };
    } catch (e) { return { ok: false, error: friendlyAuthError(e) }; }
  }, []);

  return (
    <Ctx.Provider value={{ configured: isSupabaseConfigured, ready, session, signIn, signUp, signOut, signInWithGoogle, googleAvailable: googleStatus.available }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
}
