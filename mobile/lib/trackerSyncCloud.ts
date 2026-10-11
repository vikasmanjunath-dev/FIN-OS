// The Supabase side of tracker sync: one `tracker_snapshot` row per user ({ user_id, data jsonb, updated_at }).
// Kept free of React Native imports so Node tests can drive it with the real supabase-js against a mock server.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cloud } from './trackerSyncEngine.ts';

export const TABLE = 'tracker_snapshot';

export function makeSupabaseCloud(client: SupabaseClient): Cloud {
  return {
    async fetch(userId) {
      const { data, error } = await client.from(TABLE).select('data,updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data ? { data: (data.data ?? {}) as Record<string, unknown>, updatedAt: data.updated_at as string } : null;
    },

    async store(userId, data, expected) {
      const now = new Date().toISOString();
      if (expected === null) {
        const { error } = await client.from(TABLE).insert({ user_id: userId, data, updated_at: now });
        if (error) {
          if ((error as any).code === '23505' || /duplicate/i.test(error.message)) return 'conflict';
          throw error;
        }
        return 'ok';
      }
      // compare-and-set on updated_at: zero rows back means another device wrote since we read
      const { data: rows, error } = await client.from(TABLE).update({ data, updated_at: now })
        .eq('user_id', userId).eq('updated_at', expected).select('user_id');
      if (error) throw error;
      return rows && rows.length ? 'ok' : 'conflict';
    },
  };
}
