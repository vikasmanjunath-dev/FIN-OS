const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/finos-contrast.js');
const rgb = (r, g, b, a = 1) => ({ r, g, b, a });
const WHITE = rgb(255, 255, 255), PALE = rgb(244, 246, 251), DARK = rgb(11, 13, 18);

test('contrast ratio basics', () => {
  assert.ok(Math.abs(C.contrast(rgb(0, 0, 0), WHITE) - 21) < 0.01);
  assert.ok(Math.abs(C.contrast(WHITE, WHITE) - 1) < 1e-9);
  assert.ok(C.contrast(rgb(0x55, 0x60, 0x70), WHITE) > 6);
});

test('passing colours are left alone', () => {
  assert.strictEqual(C.adjust(rgb(0x1a, 0x1a, 0x2e), WHITE), null);
  assert.strictEqual(C.adjust(rgb(255, 255, 255), DARK), null);
});

test('white / white-alpha text on a light surface becomes the muted slate', () => {
  const fix = C.adjust(rgb(255, 255, 255, 0.58), PALE);
  assert.deepStrictEqual([fix.r, fix.g, fix.b], [0x55, 0x60, 0x70]);
  assert.ok(C.contrast(fix, PALE) >= 4.5);
});

test('neon accents keep their hue family but reach AA on light surfaces', () => {
  for (const [name, c, hueRange] of [['cyan', rgb(0, 212, 255), [0.45, 0.58]], ['mint', rgb(34, 211, 166), [0.4, 0.52]], ['amber', rgb(255, 179, 71), [0.05, 0.14]], ['violet', rgb(167, 139, 250), [0.68, 0.76]]]) {
    const fix = C.adjust(c, PALE);
    assert.ok(fix, name + ' should be adjusted');
    assert.ok(C.contrast(fix, PALE) >= 4.5, name + ' → ' + C._css(fix));
    const hsl = (() => { const r = fix.r / 255, g = fix.g / 255, b = fix.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return h / 6; })();
    assert.ok(hsl >= hueRange[0] && hsl <= hueRange[1], `${name} hue drifted: ${hsl.toFixed(2)}`);
  }
});

test('dark text on a dark surface is lightened instead', () => {
  const fix = C.adjust(rgb(11, 13, 18), DARK);
  assert.ok(C.contrast(fix, DARK) >= 4.5);
  assert.ok(C.lum(fix) > C.lum(DARK));
});

test('translucent text is composited over the background before judging', () => {
  assert.strictEqual(C.adjust(rgb(0, 0, 0, 0.9), WHITE), null);        // 90% black on white is fine
  assert.ok(C.adjust(rgb(0, 0, 0, 0.2), WHITE));                        // 20% black on white is not
});

test('parse handles rgb/rgba/space-separated and percent alpha', () => {
  assert.deepStrictEqual(C.parse('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepStrictEqual(C.parse('rgba(1, 2, 3, 0.5)'), { r: 1, g: 2, b: 3, a: 0.5 });
  assert.strictEqual(C.parse('rgb(1 2 3 / 50%)').a, 0.5);
  assert.strictEqual(C.parse('transparent'), null);
});

test('gradient backgrounds: translucent tint gradients are estimated, photos / var() / named colours are not', () => {
  const g = C.gradientColour('linear-gradient(135deg, rgba(0, 212, 255, 0.06), rgba(34, 211, 166, 0.04))');
  assert.ok(g && Math.abs(g.a - 0.05) < 1e-9 && Math.abs(g.r - 17) < 1e-9);
  assert.ok(C.gradientColour('linear-gradient(90deg, #0b0d12, #12151e)'));
  assert.strictEqual(C.gradientColour('url("hero.jpg")'), null);
  assert.strictEqual(C.gradientColour('linear-gradient(90deg, var(--a), var(--b))'), null);
  assert.strictEqual(C.gradientColour('linear-gradient(90deg, red, blue)'), null);
  assert.strictEqual(C.gradientColour('none'), null);
});
