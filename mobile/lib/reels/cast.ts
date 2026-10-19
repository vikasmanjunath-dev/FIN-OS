// The people who can stand in a reel's picture in place of Mitra. The names live here, apart from the drawing in components/reels/Cast.tsx, so the
// script checker and the tests can know them without loading the drawing code. A test checks Cast.tsx draws every name listed here.
export const CAST_IDS = ['aarav', 'meera', 'imran', 'kavya', 'rohan', 'devika', 'neha', 'dev', 'arjun', 'riya', 'kabir', 'neel', 'isha', 'sana'] as const;
export type CastId = typeof CAST_IDS[number];
