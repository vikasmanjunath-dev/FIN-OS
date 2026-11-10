import { useWindowDimensions } from 'react-native';

/** True once the person's system text size is well above normal (about 120%+). Rows of equal-width segments that fit at 100% become
 *  cramped and clip their labels there, so they switch to a two-column grid. */
export const useBigText = () => useWindowDimensions().fontScale > 1.2;

/** Style to append to a segmented-control button while text is big: two per row, never shrunk below its label. */
export const bigSeg = { flexBasis: '48%' as const, flexGrow: 1, flexShrink: 0 };
