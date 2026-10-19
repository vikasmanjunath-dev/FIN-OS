// The review gate. A reel in a draft wave stays out of the app until a native Hindi reader and a compliance reader have both signed it off here.
// To release a reel, add its id with the two reviewers' names and the date. Nothing else changes: the reel, its ladder entry and its tool link
// join the library the next time the app is built. `EXPO_PUBLIC_REELS_DRAFTS=1` includes every draft for testing and review sessions.
export interface SignOff { hindi: string; compliance: string; on: string }

/** Reviewed draft reels, by id. Empty until real reviewers sign reels off. */
export const REVIEWED: Record<string, SignOff> = {};

/** True in a review or test build, where every draft is included. */
export const INCLUDE_DRAFTS = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_REELS_DRAFTS === '1');

/** A draft reel is live when it has been signed off, or the build includes drafts. */
export const isLive = (id: string): boolean => INCLUDE_DRAFTS || Boolean(REVIEWED[id]);
