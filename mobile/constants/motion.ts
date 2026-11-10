// Motion system. Springs are the default (physical, interruptible); fixed easings are only for opacity fades.
// Each preset follows Apple-style "duration + damping ratio" (Reanimated 3.7+/4 withSpring accepts both).
export const Spring = {
  snappy: { duration: 300, dampingRatio: 0.85 },   // buttons, toggles, small things
  smooth: { duration: 500, dampingRatio: 0.9 },    // cards, list items, most transitions
  bouncy: { duration: 550, dampingRatio: 0.7 },    // success moments, badges — use sparingly
  gentle: { duration: 700, dampingRatio: 0.9 },    // large surfaces, sheets
};

export const Motion = {
  spring: Spring,
  /** press feedback: quick in, slightly softer out, so a tap feels physical but never sluggish (< 100 ms to react) */
  press: { scale: 0.97, in: { duration: 140, dampingRatio: 0.9 }, out: { duration: 280, dampingRatio: 0.7 } },
  dur: { micro: 150, transition: 350, screen: 500 },    // ms; micro 100–200, transitions 250–450, full screen 400–600
  stagger: 30,                                           // ms between related elements (20–40)
  maxStaggerItems: 8,                                    // later items appear together, so a long list never makes anyone wait
};
