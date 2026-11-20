/* FIN-OS landing — 3D layer. Custom WebGL (no library): the active wealth curve becomes an extruded glowing slab with
   3D SIP columns that tilts with the cursor. Loaded lazily by landing-fx.js; any failure leaves the 2D canvas in charge. */
(function () {
  'use strict';
  var FB = window.FinosBG; if (!FB || FB.gl) return;
  var cv = document.createElement('canvas'); cv.id = 'gl'; cv.setAttribute('aria-hidden', 'true');
  var gl = null; try { gl = cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false }); } catch (e) { gl = null; }
  if (!gl) return;
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
  var vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p;attribute vec4 c;varying vec4 v;void main(){gl_Position=vec4(p,0.,1.);v=c;}');
  var fs = sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec4 v;void main(){gl_FragColor=v;}');
  if (!vs || !fs) return;
  var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
  var bgc = document.getElementById('bg'); (bgc && bgc.parentNode ? bgc.parentNode : document.body).insertBefore(cv, bgc ? bgc.nextSibling : document.body.firstChild);
  gl.useProgram(pr);
  var aP = gl.getAttribLocation(pr, 'p'), aC = gl.getAttribLocation(pr, 'c'), buf = gl.createBuffer();
  var W = 0, H = 0, yaw = 0, pit = -.1, px = 0, py = 0, F = 1500, cache = {};
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rgbOf = function (s) { return cache[s] || (cache[s] = s.split(',').map(function (n) { return (+n) / 255; })); };

  function P(x, y, z) {                                   // yaw about the vertical axis, pitch about the horizontal, then perspective
    var dx = x - px, dy = y - py, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
    var x1 = dx * cy + z * sy, z1 = -dx * sy + z * cy, y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp, s = F / (F - z2);
    return [px + x1 * s, py + y2 * s];
  }
  var tri = { a: new Float32Array(96000), n: 0 }, lin = { a: new Float32Array(8000), n: 0 };      // preallocated: no per-frame garbage
  function vtx(b, p, c) { var n = b.n, a = b.a; if (n + 6 > a.length) return; a[n] = p[0] / W * 2 - 1; a[n + 1] = 1 - p[1] / H * 2; a[n + 2] = c[0]; a[n + 3] = c[1]; a[n + 4] = c[2]; a[n + 5] = c[3]; b.n = n + 6; }
  function quad(p0, p1, p2, p3, c0, c1, c2, c3) { vtx(tri, p0, c0); vtx(tri, p1, c1); vtx(tri, p2, c2); vtx(tri, p0, c0); vtx(tri, p2, c2); vtx(tri, p3, c3); }
  function line(a, b, c) { vtx(lin, a, c); vtx(lin, b, c); }

  function frame(S) {
    var show = S.amb < .985 && !S.reduce; cv.style.display = show ? '' : 'none'; FB.gl.ok = show; if (!show) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (S.W !== W || S.H !== H) { W = S.W; H = S.H; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var G = S.G; px = W / 2; py = (G.y0 + G.y1) / 2;
    yaw += (S.ptr.px * .045 - yaw) * .06; pit += ((-.10 + S.ptr.py * .025 - S.amb * .06) - pit) * .06;
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    var kh = S.kh, mode = S.mode; if (kh < 2) return;
    var rgb = rgbOf(S.C[mode]), ink = rgbOf(S.C.ink), a = S.al, yb = G.y1, D = Math.min(W, H) * .11 + 30, i;
    var col = function (c, al) { return [c[0], c[1], c[2], al * a]; }, zero = col(rgb, 0);
    tri.n = 0; lin.n = 0;
    if (mode !== 3) {
      var step = 3, n = Math.max(2, Math.ceil(kh / step)), pts = [];
      for (i = 0; i <= n; i++) { var k = Math.min(i * step, kh); pts.push([S.X(k), S.Y(S.V(mode, k))]); }
      for (i = 0; i < n; i++) {
        var x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i + 1][0], y1 = pts[i + 1][1];
        var A0 = P(x0, y0, 0), A1 = P(x1, y1, 0), B0 = P(x0, y0, -D), B1 = P(x1, y1, -D), F0 = P(x0, yb, 0), F1 = P(x1, yb, 0), K0 = P(x0, yb, -D), K1 = P(x1, yb, -D);
        var t = col(rgb, .36), fr = col(rgb, .42), bk = col(rgb, .16);
        quad(A0, A1, B1, B0, t, t, t, t);                 // top face
        quad(A0, A1, F1, F0, fr, fr, zero, zero);          // front face
        quad(B0, B1, K1, K0, bk, bk, zero, zero);          // back face
        if (i % 4 === 0) line(F0, K0, col(rgb, .22));      // floor depth lines
      }
      var L = pts[n], cap = col(rgb, .26);
      quad(P(L[0], L[1], 0), P(L[0], L[1], -D), P(L[0], yb, -D), P(L[0], yb, 0), cap, cap, zero, zero);   // end cap
      line(P(pts[0][0], yb, -D), P(L[0], yb, -D), col(rgb, .2));
      var pp = pts.map(function (p) { return P(p[0], p[1], 0); });       // the glowing front edge
      [[11, .22], [2.8, 1]].forEach(function (w) {
        var c = col(rgb, w[1]);
        for (i = 0; i < pp.length - 1; i++) {
          var a0 = pp[Math.max(0, i - 1)], a1 = pp[i + 1], b0 = pp[i], b1 = pp[Math.min(pp.length - 1, i + 2)];
          var dx0 = a1[0] - a0[0], dy0 = a1[1] - a0[1], l0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1, dx1 = b1[0] - pp[i][0], dy1 = b1[1] - pp[i][1], l1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
          var n0 = [-dy0 / l0 * w[0] / 2, dx0 / l0 * w[0] / 2], n1 = [-dy1 / l1 * w[0] / 2, dx1 / l1 * w[0] / 2], s0 = pp[i], s1 = pp[i + 1];
          quad([s0[0] + n0[0], s0[1] + n0[1]], [s1[0] + n1[0], s1[1] + n1[1]], [s1[0] - n1[0], s1[1] - n1[1]], [s0[0] - n0[0], s0[1] - n0[1]], c, c, c, c);
        }
      });
    }
    var bw = (G.xR - G.xL) / 80, bd = 14;                // SIP columns, in 3D
    for (i = 0; i < 80; i++) {
      var mo = i * 3, lit = mo <= kh && (mode === 1 || (mode === 2 && mo >= 144)), hh = (5 + ((i * 37) % 11)) * (lit && mo + 3 > kh ? 1.5 : 1) * 1.6;
      var cx0 = G.xL + i * bw + 1, cx1 = cx0 + Math.max(1.4, bw - 2.2), yt = yb + 6, yo = yt + hh;
      var fc = lit ? col(rgb, .55) : col(ink, .08), tc = lit ? col(rgb, .8) : col(ink, .14);
      quad(P(cx0, yt, 0), P(cx1, yt, 0), P(cx1, yo, 0), P(cx0, yo, 0), fc, fc, fc, fc);
      quad(P(cx0, yt, 0), P(cx1, yt, 0), P(cx1, yt, -bd), P(cx0, yt, -bd), tc, tc, tc, tc);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, S.C.light ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aC);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(aC, 4, gl.FLOAT, false, 24, 8);
    if (tri.n) { gl.bufferData(gl.ARRAY_BUFFER, tri.a.subarray(0, tri.n), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, tri.n / 6); }
    if (lin.n) { gl.bufferData(gl.ARRAY_BUFFER, lin.a.subarray(0, lin.n), gl.DYNAMIC_DRAW); gl.drawArrays(gl.LINES, 0, lin.n / 6); }
  }
  cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); FB.gl.ok = false; cv.style.display = 'none'; });
  FB.gl = { ok: true, frame: frame, proj: function (x, y) { return P(x, y, 0); } };
})();
