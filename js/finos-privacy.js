/**
 * FIN-OS privacy registry + consent records.   (v1.0)
 *
 * The privacy notice (html/privacy.html) is generated from FLOWS below, so it can only say what the code does. A test
 * (tests/privacy.test.js) scans the source for every host the app references and fails if one is not covered here, so a
 * new network dependency cannot ship without the notice being updated.
 *
 *   FinosPrivacy.FLOWS                       → the audited data-flow registry (below)
 *   FinosPrivacy.flowFor(host)               → the flow covering a host, or null
 *   FinosPrivacy.hostsOf(text)               → hosts referenced as URLs in a piece of source text
 *   FinosPrivacy.ENTITY                      → who the notice is from. Left null on purpose until the business details exist
 *   FinosPrivacy.PURPOSES                    → purposes that need the user's consent before anything is sent
 *   FinosPrivacy.consent.get(id) / set(id, granted) / all() / withdrawAll()   → consent records on this device
 *
 * Each flow: { id, kind, hosts[], title, purpose, sent, personal, optional, control }
 *   kind     'device' (nothing leaves the device) · 'asset' (page loads a file; the host sees the visitor's IP) · 'account' ·
 *            'market' · 'proxy' · 'local' (a service on the user's own machine) · 'link' (only if the user clicks it)
 *   personal  true when the user's own financial or identity data is part of what is sent
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosPrivacy = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  /** Who is responsible for this notice. Do not invent these: they are filled in when the business details are decided. */
  const ENTITY = { name: null, address: null, grievanceOfficer: null, grievanceEmail: null };

  const FLOWS = [
    { id: 'device', kind: 'device', hosts: [], title: 'Your FIN-OS data',
      purpose: 'Everything you enter or import (income, expenses, goals, holdings, scores, notes) is kept in this browser\'s storage so the tools can work.',
      sent: 'Nothing. It stays on this device until you export or delete it.', personal: true, optional: false,
      control: 'Export, encrypt with a passcode, back up or delete it from Settings → Data & Privacy.' },

    { id: 'account', kind: 'account', hosts: ['supabase.co'], title: 'Sign-in and account sync (Supabase)',
      purpose: 'Lets you sign in and keep a profile, transactions, holdings and goals on a server so they follow you across devices.',
      sent: 'Your email and password (to sign in), and the profile, transaction, holding, goal and context records you choose to sync.', personal: true, optional: true,
      control: 'Use FIN-OS without signing in and nothing is sent. You can delete your account from Settings.' },

    { id: 'ai', kind: 'local', hosts: ['localhost', '127.0.0.1', '[::1]'], title: 'AI features on your own computer',
      purpose: 'Arya and the explainers talk to a language model and helper services that run on your own machine (for example Ollama on port 11434).',
      sent: 'Your questions and the financial context Arya needs, sent to a service on the same computer. It does not leave your machine.', personal: true, optional: true,
      control: 'Only works if you run those services yourself. Nothing is sent anywhere if you do not.' },

    { id: 'assets', kind: 'asset', hosts: ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'cdn.tailwindcss.com', 'code.jquery.com'], title: 'Fonts, charts and code libraries',
      purpose: 'Pages load fonts (Google Fonts) and open-source libraries (charts, sign-in client) from public content networks.',
      sent: 'No financial data. Like any website, these providers see your IP address, browser type and the page that asked for the file.', personal: false, optional: false,
      control: 'A browser content blocker or private network will stop them; some pages then look plain.' },

    { id: 'images', kind: 'asset', hosts: ['images.unsplash.com', 'transparenttextures.com'], title: 'Decorative images',
      purpose: 'A few pages load a photo or a background texture.', sent: 'No financial data; the provider sees your IP address and browser type.', personal: false, optional: false,
      control: 'Blocking them only affects the look of those pages.' },

    { id: 'market', kind: 'market', hosts: ['finance.yahoo.com'], title: 'Market prices (Yahoo Finance)',
      purpose: 'The Trading Brain page fetches prices and charts for the stock symbol you look up.',
      sent: 'The symbol and chart range you request, plus your IP address and browser type.', personal: false, optional: true,
      control: 'Only when you open that page and look up a symbol.' },

    { id: 'proxy', kind: 'proxy', hosts: ['allorigins.win'], title: 'Public relay for market data (allorigins.win)',
      purpose: 'The Trading Brain page gets prices from the Arya backend on your computer. Only if that is not running, and only if you switched it on, the request goes through a free public relay.',
      sent: 'The Yahoo Finance request (a symbol and range) passes through the relay operator\'s server, so they can see it along with your IP address.', personal: false, optional: true,
      control: 'Off by default. Switch it on under "Use a public relay for market data" in Privacy & your data. No account data goes through it.' },

    { id: 'broker', kind: 'link', hosts: ['developers.kite.trade', 'kite.zerodha.com', 'kite.trade'], title: 'Zerodha Kite',
      purpose: 'The Kite page explains how to connect your own broker API app.', sent: 'Nothing, unless you click through to Zerodha.', personal: false, optional: true,
      control: 'You choose whether to follow the link.' },

    { id: 'aa', kind: 'link', hosts: ['onemoney.in', 'finvu.in', 'perfios.com', 'anumati.io', 'mfcentral.com', 'epfindia.gov.in'], title: 'Account Aggregator and statement providers',
      purpose: 'FIN-OS names these providers and links to them where you could fetch consented bank, mutual-fund or EPF data. FIN-OS does not connect to them today. You can bring your own transactions in by importing a statement file, which is read on your device and never uploaded.',
      sent: 'Nothing is sent by FIN-OS.', personal: false, optional: true, control: 'You choose whether to follow a link. Statement import runs entirely on your device.' },

    { id: 'appdownload', kind: 'link', hosts: ['github.com'], title: 'Android app download (GitHub)',
      purpose: 'The download page links to the Android app file, which is hosted on GitHub Releases.',
      sent: 'Nothing is sent by FIN-OS. If you tap Download, GitHub sees your IP address and the file you ask for.', personal: false, optional: true,
      control: 'You choose whether to tap the link.' },

    { id: 'share', kind: 'link', hosts: ['wa.me', 'twitter.com', 'x.com'], title: 'Sharing',
      purpose: 'Share buttons open WhatsApp or X with text you can edit first.', sent: 'Only the text you choose to share, and only when you press Share.', personal: false, optional: true,
      control: 'You see and can edit the message before anything is sent.' },

    { id: 'references', kind: 'link', hosts: ['groww.in', 'kuvera.in', 'coin.zerodha.com', 'moneycontrol.com', 'livemint.com', 'economictimes.indiatimes.com', 'reuters.com', 'bloomberg.com', 'wsj.com', 'ft.com', 'cryptonews.com', 'streamlit.app', 'incometax.gov.in', 'incometaxindia.gov.in', 'indiapost.gov.in', 'sebi.gov.in', 'rbi.org.in', 'nseindia.com', 'bis.org', 'finos.app'],
      title: 'Links to other sites', purpose: 'Reading lists, news sources, regulators and partner tools that open in a new tab when you click them.',
      sent: 'Nothing is sent by FIN-OS. Once you click, that site\'s own privacy rules apply.', personal: false, optional: true, control: 'You choose whether to follow a link.' },

    { id: 'standards', kind: 'device', hosts: ['w3.org', 'schema.org', 'xmlns.com'], title: 'Web standard identifiers',
      purpose: 'Strings like the SVG namespace that look like web addresses but are never fetched.', sent: 'Nothing.', personal: false, optional: false, control: 'Not applicable.' },
  ];

  /** Purposes that need an explicit yes before anything is sent. Off until the user turns them on, and withdrawable at any time. */
  const PURPOSES = [
    { id: 'relay', title: 'Use a public relay for market data when the Arya backend is not running',
      detail: 'The Trading Brain page normally gets prices from the Arya backend on your computer. If you switch this on and that backend is not running, the request goes through a free public relay (allorigins.win), which can see the symbol you look up and your IP address.' },
    { id: 'feedback', title: 'Share product feedback with the FIN-OS team',
      detail: 'When you choose to send feedback, your message and the page it was about leave this device. Never any amounts or personal financial data.' },
    { id: 'usage', title: 'Share anonymous usage counts',
      detail: 'Counts of which tools are used (never what you typed or any amounts) so the team can improve what matters.' },
  ];

  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/i;
  const norm = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

  /** The flow covering a host: an exact match, a subdomain of a listed host, or a local address. */
  function flowFor(host) {
    const h = norm(host);
    if (!h) return null;
    if (LOCAL.test(h)) return FLOWS.find((f) => f.id === 'ai');
    return FLOWS.find((f) => f.hosts.some((x) => h === x || h.endsWith('.' + x))) || null;
  }

  /** Hosts referenced as http(s) URLs in a piece of source text (template placeholders and file paths are skipped). */
  function hostsOf(text) {
    const out = new Set();
    String(text || '').replace(/https?:\/\/([A-Za-z0-9.\-\[\]:]+)/g, (m, hp) => {
      let host = hp.replace(/:\d+$/, '');
      if (!host || /\$\{/.test(host) || /^[.\-]/.test(host) || host.indexOf('.') === -1 && !LOCAL.test(host)) return m;
      out.add(host.replace(/\.$/, ''));
      return m;
    });
    return [...out];
  }

  /* ── consent records ─────────────────────────────────────────────────────────────────────────────────────
     DPDP: consent must be free, specific, informed, and as easy to withdraw as to give. Default is "no". Each record keeps
     when it changed and which wording version it applied to, so a changed purpose never inherits an old yes. */
  const KEY = 'finos_consents';
  const VERSION = 1;
  const store = {
    read() { try { const v = JSON.parse(root.localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } },
    write(v) { try { root.localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const known = (id) => PURPOSES.some((p) => p.id === id);

  const consent = {
    /** true only for a recorded yes for a known purpose at the current wording version. */
    get(id) { if (!known(id)) return false; const r = store.read()[id]; return !!(r && r.granted === true && r.v === VERSION); },
    set(id, granted) {
      if (!known(id)) return false;
      const all = store.read();
      all[id] = { granted: granted === true, at: new Date().toISOString(), v: VERSION };
      return store.write(all);
    },
    all() { return PURPOSES.map((p) => { const r = store.read()[p.id]; return { id: p.id, title: p.title, detail: p.detail, granted: consent.get(p.id), at: r ? r.at : null }; }); },
    withdrawAll() { PURPOSES.forEach((p) => consent.set(p.id, false)); return true; },
  };

  return { ENTITY, FLOWS, PURPOSES, flowFor, hostsOf, consent, VERSION };
});
