/* CIA AI Detector: all analysis runs locally in the browser. Nothing is sent anywhere. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const r1 = x => Math.round(x * 10) / 10;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

/* ---------- Spinning seal coins: two faces plus stacked gold discs for the edge ---------- */
document.querySelectorAll('[data-coin]').forEach(el => {
  const depth = +el.dataset.depth || 5, layers = +el.dataset.layers || 10;
  const edges = Array.from({ length: layers }, (_, k) => `<span class="coin-edge" style="transform: translateZ(${(-depth / 2 + (depth * k) / (layers - 1)).toFixed(2)}px)"></span>`).join('');
  el.innerHTML = `<div class="coin-body">${edges}<span class="coin-face" style="transform: translateZ(${depth / 2 + 0.3}px)"></span><span class="coin-face" style="transform: rotateY(180deg) translateZ(${depth / 2 + 0.3}px)"></span></div>`;
});

/* ---------- Theme toggle: Night (default) and Parchment ---------- */
const root = document.documentElement;
const isDark = () => root.dataset.theme !== 'light';
function syncThemeUI() {
  $('#themeLabel').textContent = isDark() ? 'Parchment mode' : 'Night mode';
  $('#themeToggle').setAttribute('aria-label', isDark() ? 'Switch to Parchment mode' : 'Switch to Night mode');
}
$('#themeToggle').addEventListener('click', () => {
  if (isDark()) { root.dataset.theme = 'light'; store.set('cad.theme', 'light'); }
  else { delete root.dataset.theme; store.set('cad.theme', 'dark'); }
  syncThemeUI();
});
syncThemeUI();

/* ---------- Word lists ---------- */
const STRONG = new Set(('delve delves delving tapestry testament multifaceted meticulous meticulously foster fosters fostering leverage leveraging seamless seamlessly pivotal paramount unwavering steadfast embark embarking intricate nuanced holistic invaluable esteemed commendable adept synergy resonate resonates underscore underscores showcase showcasing realm bolster elevate streamline cultivate cultivating endeavor endeavors endeavour furthermore moreover thrive thriving navigate navigating ever-evolving solution-oriented detail-oriented wholeheartedly profound exemplary unparalleled instrumental fast-paced well-rounded indispensable').split(' '));
const MILD = new Set(('ensure ensuring essential crucial vital dedication commitment passionate additionally ultimately facilitate facilitated facilitating comprehensive proactive diligent enhance enhancing utilize utilizing strategic collaborative constructive integrity empathy perspectives demonstrate demonstrated effectively foundation significant significantly valuable eager').split(' '));
const PHRASES = [
  /commitment to (excellence|growth|the team|the group)/gi, /valuable (asset|addition)/gi, /unique (opportunity|perspective)/gi,
  /\bI am (eager|excited|confident|committed|enthusiastic)\b/gi, /\bI believe (that )?(my|I)\b/gi, /\baligns? (with|perfectly)\b/gi,
  /attention to detail/gi, /\bnot only\b[^.]{0,80}?\bbut also\b/gi, /\b(in conclusion|in summary|to summarize|overall,)/gi,
  /this experience taught me/gi, /the importance of/gi, /\b(positive|professional|welcoming|supportive) (environment|atmosphere|community)\b/gi,
  /\bcontribute (to|meaningfully)\b/gi, /\bdeeply (passionate|committed|value|care)\b/gi, /\bit is (important|worth noting|essential|crucial) (to|that)\b/gi,
  /\bplays? a (crucial|vital|key|pivotal) role\b/gi, /\bI would be honou?red\b/gi, /thank you for (considering|your consideration|taking the time)/gi,
  /\blook(ing)? forward to\b/gi, /\b(both|all) perspectives\b/gi, /\broot (cause|of the)\b/gi, /\bqualities (that )?I (would|can|will) bring\b/gi,
  /\bequally (important|essential|vital|crucial)\b/gi, /\bprovided (that|it|they)\b/gi, /\bstrong sense of\b/gi, /\bgo(ing)? above and beyond\b/gi,
  /\bmake a (meaningful|positive|lasting) (impact|difference)\b/gi, /\bwhether it'?s\b/gi, /\b(leadership|communication|teamwork|problem-solving) skills\b/gi,
  /\brather than (taking sides|simply)\b/gi, /\b(calm|respectful|open|honest) (discussion|dialogue|communication)\b/gi,
  /\bskills (and|that) (would|will) (allow|enable|help) me\b/gi, /\bgrow (both )?(as a|personally)\b/gi, /\bhelp(ing)? (to )?(build|create|maintain) a\b/gi
];
const SLANG = /(?<![\w'’])(u|ur|idk|tbh|lol|lmao|gonna|wanna|kinda|sorta|cuz|bc|rn|ngl|imo|fr|bro|tho|btw|pls|plz|yea|yeah|nah|smth|abt|ok|lowkey)(?![\w'’])/g;
const MISSING_APOS = /\b(dont|cant|wont|im|ive|didnt|doesnt|isnt|wasnt|arent|thats|whats|youre|theyre|wouldnt|couldnt|shouldnt|havent|hasnt)\b/gi;
const CONTRACTION = /\b[A-Za-z]+['’](t|m|s|re|ve|ll|d)\b/gi;
const LOWER_I = /(?<![\w'’])i(?![\w])/g;
const UPPER_I = /(?<![\w'’])I(?![\w])/g;
const ANECDOTE = /\b(one time|last (week|month|night|time|raid|training)|yesterday|when i was|i remember|back when|a few (days|weeks|months) ago|once,? i|that time)\b/gi;
const NUMWORD = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten|twice)\b/gi;
const GENERIC_CAPS = new Set(['I', "I'm", "I've", "I'd", "I'll", 'I’m', 'I’ve', 'I’d', 'I’ll', 'CIA', 'Roblox', 'Discord']);
const DASH = /—|\s–\s/g;

const count = (re, s) => (s.match(re) || []).length;
const tokens = s => [...s.matchAll(/[A-Za-z][A-Za-z'’-]*/g)];
const sentencesOf = s => s.split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(x => (x.match(/[A-Za-z]+/g) || []).length >= 2);

/* ---------- Spans for highlighting ---------- */
function findSpans(text) {
  const spans = [];
  for (const m of tokens(text)) {
    const w = m[0].toLowerCase().replace(/’/g, "'").replace(/[-']+$/, '');
    if (STRONG.has(w)) spans.push({ s: m.index, e: m.index + m[0].length, c: 'v', w });
    else if (MILD.has(w)) spans.push({ s: m.index, e: m.index + m[0].length, c: 'm', w });
  }
  for (const re of PHRASES) for (const m of text.matchAll(re)) spans.push({ s: m.index, e: m.index + m[0].length, c: 'p', w: m[0] });
  for (const m of text.matchAll(DASH)) spans.push({ s: m.index, e: m.index + m[0].length, c: 'd', w: m[0] });
  for (const m of text.matchAll(/\*\*[^*\n]+\*\*|^\s{0,3}#{1,4}\s.*$/gm)) spans.push({ s: m.index, e: m.index + m[0].length, c: 'd', w: m[0] });
  // Longer spans first, then keep only non-overlapping ones.
  spans.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  const out = []; let end = -1;
  for (const sp of spans) if (sp.s >= end) { out.push(sp); end = sp.e; }
  return out;
}

/* ---------- Writing profile (used for the Discord comparison) ---------- */
function profile(text) {
  const toks = tokens(text), W = toks.length || 1, sents = sentencesOf(text);
  let vs = 0, longW = 0;
  for (const m of toks) {
    const w = m[0].toLowerCase().replace(/’/g, "'");
    if (STRONG.has(w)) vs += 1; else if (MILD.has(w)) vs += 0.5;
    if (w.replace(/[^a-z]/g, '').length >= 9) longW++;
  }
  const lowI = count(LOWER_I, text), upI = count(UPPER_I, text);
  const miss = count(MISSING_APOS, text), cont = count(CONTRACTION, text);
  return {
    words: toks.length,
    avgSent: sents.length ? toks.length / sents.length : null,
    longRatio: longW / W,
    aiRate: vs / W * 100,
    capStart: sents.length ? sents.filter(x => /^[^A-Za-z]*[A-Z]/.test(x)).length / sents.length : null,
    lowerI: (lowI + upI) ? lowI / (lowI + upI) : null,
    iCount: lowI + upI,
    missApos: (miss + cont) ? miss / (miss + cont) : null,
    slang: count(SLANG, text) / W * 100,
    commas: count(/,/g, text) / W * 100,
    dashes: count(DASH, text),
    dashRate: count(DASH, text) / W * 100
  };
}

// Compares how someone writes in Discord with how they wrote the application.
// Only gaps that extra effort on a form can't easily explain count toward the signal (w > 0); the rest are shown for context.
function compareBaseline(app, base) {
  const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
  const num = x => x == null ? '–' : String(r1(x));
  const rows = [];
  const add = (label, short, b, a, fmt, flag, w) => rows.push({ label, short, b, a, fmt, flag: !!flag, w });
  add('Words per sentence', 'sentence length', base.avgSent, app.avgSent, num, false, 0);
  add('Long words (9+ letters)', 'vocabulary level', base.longRatio, app.longRatio, pct, app.longRatio >= 2 * base.longRatio && app.longRatio >= 0.1, 1);
  add('AI-typical words per 100', 'AI-typical words', base.aiRate, app.aiRate, num, app.aiRate >= 1.5 && base.aiRate < 0.5, 1);
  add('Sentences starting with a capital', 'capitals', base.capStart, app.capStart, pct, false, 0);
  add("Lowercase 'i'", 'lowercase i', base.lowerI, app.lowerI, pct, base.lowerI != null && base.lowerI >= 0.5 && app.iCount >= 3 && app.lowerI === 0, 0.35);
  add('Skipped apostrophes (dont, im)', 'apostrophes', base.missApos, app.missApos, pct, base.missApos != null && base.missApos >= 0.5 && app.missApos === 0, 0.4);
  add('Slang per 100 words', 'slang', base.slang, app.slang, num, base.slang >= 3 && app.slang === 0, 0.25);
  add('Commas per 100 words', 'commas', base.commas, app.commas, num, app.commas >= 5 && app.commas >= 3 * Math.max(base.commas, 0.5), 0.25);
  add('Dashes per 100 words (— or –)', 'dashes', base.dashRate, app.dashRate, num, app.dashes >= 1 && base.dashes === 0, 0.5);
  const total = rows.reduce((t, r) => t + (r.flag ? r.w : 0), 0);
  return { rows, strength: clamp(total / 2), flagged: rows.filter(r => r.flag) };
}
function diffLabel(b, a) {
  if (b == null || a == null) return '–';
  if (b === 0 && a === 0) return 'Same';
  if (b === 0) return 'Only in application';
  if (a === 0) return 'Only in Discord';
  if (a / b >= 3) return `${r1(a / b)}× more`;
  if (b / a >= 3) return `${r1(b / a)}× less`;
  const d = Math.round((a - b) / b * 100);
  return d === 0 ? 'Same' : `${d > 0 ? '+' : ''}${d}%`;
}

/* ---------- Main analysis ---------- */
function analyze(text, ctx = {}) {
  const toks = tokens(text), W = toks.length;
  const sig = [];
  const per100 = n => W ? n / W * 100 : 0;
  const spans = findSpans(text);

  // 1. Vocabulary
  const strongWords = new Map(), mildWords = new Map(); let vs = 0;
  for (const sp of spans) {
    if (sp.c === 'v') { vs += 1; strongWords.set(sp.w, (strongWords.get(sp.w) || 0) + 1); }
    if (sp.c === 'm') { vs += 0.5; mildWords.set(sp.w, (mildWords.get(sp.w) || 0) + 1); }
  }
  const vd = per100(vs);
  const topWords = [...strongWords.keys(), ...mildWords.keys()].slice(0, 5);
  sig.push({ id: 'vocab', name: 'AI-typical vocabulary', weight: 3, strength: clamp((vd - 0.75) / 3),
    detail: vs ? `${r1(vd)} per 100 words: ${topWords.join(', ')}.` : 'None found.' });

  // 2. Stock phrases
  const ph = spans.filter(s => s.c === 'p'); const pd = per100(ph.length);
  sig.push({ id: 'phrase', name: 'Stock application phrases', weight: 2.5, strength: clamp((pd - 0.4) / 2),
    detail: ph.length ? `${ph.length} found: “${ph.slice(0, 3).map(p => p.w).join('”, “')}”${ph.length > 3 ? '…' : ''}` : 'None found.' });

  // 3. Pasted formatting
  const bold = count(/\*\*[^*\n]+\*\*/g, text), heads = count(/^\s{0,3}#{1,4}\s+\S/gm, text);
  const bullets = count(/^\s*([-*•]|\d+[.)])\s+\S/gm, text);
  const mdS = (bold || heads) ? 1 : bullets >= 2 ? 0.5 : 0;
  sig.push({ id: 'md', name: 'Pasted formatting', weight: 3, strength: mdS,
    detail: mdS ? [bold && `${bold} **bold** marker${bold > 1 ? 's' : ''}`, heads && `${heads} # heading${heads > 1 ? 's' : ''}`, bullets >= 2 && `${bullets} list lines`].filter(Boolean).join(', ') + '.' : 'None found.' });

  // 4. Dashes
  const dashes = count(DASH, text);
  let dS = dashes === 0 ? 0 : dashes === 1 ? 0.45 : dashes === 2 ? 0.75 : 1;
  let dNote = '';
  if (dashes && ctx.base) {
    if (ctx.base.dashes > 0) { dS *= 0.3; dNote = ' They also use dashes in Discord.'; }
    else { dS = clamp(dS + 0.25); dNote = ' Never used in their Discord.'; }
  }
  sig.push({ id: 'dash', name: 'Em dashes', weight: 1.5, strength: dS, detail: dashes ? `${dashes} found.${dNote}` : 'None found.' });

  // 5. Sentence rhythm
  const lens = sentencesOf(text).map(s => (s.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length).filter(n => n >= 3);
  let uS = 0, uDetail = 'Needs 5+ sentences.';
  if (lens.length >= 5) {
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    const cv = sd / mean;
    uS = cv <= 0.28 ? 1 : cv >= 0.5 ? 0 : (0.5 - cv) / 0.22;
    if (mean < 10) uS *= 0.5;
    uDetail = `Sentences average ${Math.round(mean)} words, ${Math.round(cv * 100)}% variation.`;
  }
  sig.push({ id: 'rhythm', name: 'Even sentence rhythm', weight: 1.5, strength: clamp(uS), detail: uDetail });

  // 6. No casual traces
  const casual = count(LOWER_I, text) + count(SLANG, text) + count(MISSING_APOS, text) + count(/[!?]{2,}/g, text)
    + sentencesOf(text).filter(s => /^[^A-Za-z]*[a-z]/.test(s)).length + count(/\p{Extended_Pictographic}/gu, text);
  const cS = casual ? 0 : W >= 150 ? 0.7 : W >= 60 ? 0.5 : 0;
  sig.push({ id: 'polish', name: 'No casual traces', weight: 0.75, strength: cS,
    detail: casual ? `${casual} casual trace${casual > 1 ? 's' : ''} found.` : W >= 60 ? 'Flawless capitalization and punctuation.' : 'Too short to judge.' });

  // 7. Lists of three
  const trip = count(/\b[\w'’-]+(?: [\w'’-]+){0,2}, [\w'’-]+(?: [\w'’-]+){0,2},? and [\w'’-]+/gi, text);
  const td = per100(trip);
  sig.push({ id: 'triplet', name: 'Lists of three', weight: 1, strength: clamp((td - 0.4) / 1.2),
    detail: trip ? `${trip} found.` : 'None found.' });

  // 8. Concrete detail
  let specifics = count(NUMWORD, text) + count(ANECDOTE, text);
  for (const s of sentencesOf(text)) {
    const ws = s.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    specifics += ws.slice(1).filter(w => /^[A-Z]/.test(w) && !GENERIC_CAPS.has(w)).length;
  }
  const sd100 = per100(specifics);
  const spS = W < 60 ? 0 : sd100 < 0.75 ? 1 : sd100 < 1.5 ? 0.6 : sd100 < 2.5 ? 0.25 : 0;
  sig.push({ id: 'specific', name: 'Little concrete detail', weight: 1.5, strength: spS,
    detail: W < 60 ? 'Too short to judge.' : `${specifics} specific detail${specifics === 1 ? '' : 's'} found.` });

  // 9. Discord comparison
  let cmp = null;
  if (ctx.base) {
    cmp = compareBaseline(profile(text), ctx.base);
    sig.push({ id: 'base', name: 'Different from their Discord writing', weight: 3, strength: cmp.strength,
      detail: cmp.flagged.length ? `Changed from Discord: ${cmp.flagged.map(r => r.short).join(', ')}.` : 'Consistent with their messages.' });
  }

  const points = sig.reduce((t, s) => t + s.weight * s.strength, 0);
  const index = Math.min(100, Math.round(points / 8 * 100));
  const strongCount = sig.filter(s => s.strength >= 0.5).length;
  const band = index < 22 ? 'low' : (index < 50 || strongCount < 3) ? 'mid' : 'high';
  return { W, sig, index, band, strongCount, spans, cmp, strongWords, mildWords };
}

/* ---------- State and inputs ---------- */
// Answers come only from the loaded application, so they are shown read-only.
let state = { applicant: '', answers: [], baseline: '' };

function renderAnswers() {
  $('#answers').innerHTML = state.answers.length
    ? state.answers.map((x, i) => {
        const words = (x.a.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
        return `<li><span class="al-q">Q${i + 1} · ${esc(x.q || 'Question ' + (i + 1))}</span><span class="al-n">${words} words</span></li>`;
      }).join('')
    : '<li class="al-empty">Pick an applicant above to load their answers.</li>';
}

$('#baseline').addEventListener('input', e => { state.baseline = e.target.value; schedule(); });
$('#clearAll').addEventListener('click', () => {
  state = { applicant: '', answers: [], baseline: '' };
  currentApplicant = null;
  $('#baseline').value = ''; $('#appSearch').value = '';
  renderAnswers(); run();
  if (!$('#picker').hidden) $('#appSearch').focus();
});

/* ---------- Importing a Google Forms export (.zip or .csv) ---------- */
// The file is read in memory only. It is never uploaded or saved.
let applicants = [], currentApplicant = null, activeOption = -1, shown = [];

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

// Minimal zip reader: finds the first .csv inside and inflates it with the browser's built-in decompressor.
async function csvFromZip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let end = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("That file isn't a valid .zip.");
  let p = v.getUint32(end + 16, true);
  for (let k = v.getUint16(end + 10, true); k > 0; k--) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.csv$/i.test(name)) continue;
    const start = offset + 30 + v.getUint16(offset + 26, true) + v.getUint16(offset + 28, true);
    const data = u8.subarray(start, start + size);
    if (method === 0) return dec.decode(data);
    if (method === 8) return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    throw new Error("This .zip uses a compression type the site can't read. Unzip it and drop the .csv instead.");
  }
  throw new Error('No .csv file was found inside that .zip.');
}

// Google Forms timestamps vary by locale: 2026/10/13 11:15:27 PM AST, 10/13/2026 23:15:27, 13/10/2026 23:15:27 ...
function parseStamp(s) {
  const m = (s || '').match(/(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]\.?M\.?)?/i);
  if (!m) return NaN;
  let [, a, b, c, h, mi, sec, ap] = m; a = +a; b = +b; c = +c; h = +h;
  let y, mo, d;
  if (a > 31) { y = a; mo = b; d = c; } else { y = c; if (a > 12) { d = a; mo = b; } else { mo = a; d = b; } }
  if (y < 100) y += 2000;
  if (ap) { const pm = /^p/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return Date.UTC(y, mo - 1, d, h, +mi, +(sec || 0));
}

function buildApplicants(rows, allowEmpty) {
  const [header, ...data] = rows;
  if (header && !data.length && allowEmpty) return [];
  if (!header || !data.length) throw new Error('That file has no responses in it.');
  const cols = header.map((h, i) => {
    const lens = data.map(r => (r[i] || '').trim().length).filter(Boolean).sort((x, y) => x - y);
    return { i, h: h.trim(), med: lens.length ? lens[lens.length >> 1] : 0, max: lens.length ? lens[lens.length - 1] : 0 };
  });
  const short = c => c.med < 40;
  const find = re => cols.find(c => re.test(c.h) && short(c));
  const stamp = cols.find(c => /^time\s*stamp$/i.test(c.h));
  const roblox = find(/roblox/i), discord = find(/discord/i), email = find(/e-?mail/i), named = find(/\b(user\s*name|name)\b/i);
  const ids = new Set([stamp, roblox, discord, email, named].filter(Boolean).map(c => c.i));
  const answerCols = cols.filter(c => !ids.has(c.i) && (c.med >= 40 || c.max >= 120) && !/acknowledg|i agree|consent/i.test(c.h));
  if (!answerCols.length) throw new Error("Couldn't find any written answers in that file.");
  const primary = roblox || named || discord || email;
  return data.map((r, n) => {
    const get = c => c ? (r[c.i] || '').trim() : '';
    const t = parseStamp(get(stamp));
    const name = get(primary) || `Applicant ${n + 1}`;
    const alt = [discord, roblox, email].filter(c => c && c !== primary).map(get).find(Boolean) || '';
    return {
      id: n, name, alt, t, order: n,
      date: isNaN(t) ? get(stamp) : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
      answers: answerCols.map(c => ({ q: c.h, a: get(c) })).filter(x => x.a)
    };
  });
}

async function importFile(file) {
  showImportError('');
  try {
    const buf = await file.arrayBuffer();
    const isZip = /\.zip$/i.test(file.name) || new Uint8Array(buf.slice(0, 2)).join() === '80,75';
    const text = isZip ? await csvFromZip(buf) : new TextDecoder().decode(buf);
    applicants = buildApplicants(parseCSV(text));
  } catch (e) {
    showImportError(e.message || "Couldn't read that file. Make sure it's the .zip or .csv from Google Forms.");
    return;
  }
  stopLive();
  source = { kind: 'file', name: formTitle(file.name) };
  showLoaded(true);
}

let source = null; // { kind: 'file' | 'sheet', name }
function formTitle(name) { return name.replace(/(\.csv)?(\.zip)?$/i, '').replace(/\s*\((responses|.*?)\)\s*$/i, '').trim(); }
function showImportError(msg) { const err = $('#importError'); err.textContent = msg; err.hidden = !msg; }
function showLoaded(first, newCount = 0) {
  const n = applicants.length;
  const parts = [source.name, `${n} applicant${n === 1 ? '' : 's'}`];
  if (source.kind === 'sheet') parts.push(`updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  if (newCount) parts.push(`${newCount} new`);
  $('#fileInfo').textContent = parts.join(' · ');
  $('#liveDot').hidden = source.kind !== 'sheet';
  $('#changeFile').textContent = source.kind === 'sheet' ? 'Change sheet' : 'Change file';
  $('#signOut').hidden = source.kind !== 'sheet';
  $('#sourceChoice').hidden = true; $('#picker').hidden = false;
  if (first) { $('#appSearch').value = ''; $('#appSearch').focus(); openList(); }
  else if (!$('#appList').hidden) renderList();
}
function showSourceChoice() {
  applicants = []; currentApplicant = null; source = null; closeList();
  $('#picker').hidden = true; $('#sourceChoice').hidden = false;
  updateGoogleButton();
}

/* ---------- Live loading from Google Sheets ---------- */
// Sign-in uses the drive.file permission: the site can only open sheets the person picks in Google's picker.
// Google decides access, so people only see sheets shared with them (their directorate's group).
const GOOGLE = {
  clientId: '601598001948-sqlooush5733lhos18il81tj1m19vft9.apps.googleusercontent.com',
  apiKey: 'AIzaSyCop86sJbuGYZ6CFSmGWNp_TWkE7rTPrgk',
  appId: '601598001948',
  scope: 'openid email https://www.googleapis.com/auth/drive.file'
};
const REFRESH_MS = 60000;
let gToken = null, gTokenExp = 0, pickerLoaded = null, liveSheet = null, refreshTimer = null, lastRefresh = 0;

const savedSheet = () => { try { return JSON.parse(store.get('cad.sheet') || 'null'); } catch (e) { return null; } };
function updateGoogleButton() {
  const sheet = savedSheet();
  $('#gSignInLabel').textContent = sheet ? `Sign in to load ${sheet.name}` : 'Sign in with Google';
}

function getToken() {
  return new Promise((resolve, reject) => {
    if (gToken && Date.now() < gTokenExp - 60000) return resolve(gToken);
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      return reject(new Error("Google sign-in didn't load. Check your connection or turn off ad blockers for this site, then try again."));
    }
    google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE.clientId,
      scope: GOOGLE.scope,
      callback: r => {
        if (r.error) return reject(new Error(r.error === 'access_denied' ? 'Sign-in was cancelled.' : `Google sign-in failed (${r.error}).`));
        gToken = r.access_token; gTokenExp = Date.now() + (+r.expires_in || 3600) * 1000;
        resolve(gToken);
      },
      error_callback: e => reject(new Error(
        e.type === 'popup_failed_to_open' ? 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'
        : e.type === 'popup_closed' ? 'The sign-in window was closed before finishing.' : 'Google sign-in failed.'))
    }).requestAccessToken({ prompt: '' });
  });
}

function loadPickerApi() {
  return pickerLoaded || (pickerLoaded = new Promise((resolve, reject) => {
    if (!window.gapi) return reject(new Error("Google's file picker didn't load. Check your connection or turn off ad blockers for this site."));
    gapi.load('picker', { callback: resolve, onerror: () => reject(new Error("Google's file picker didn't load.")) });
  }).catch(e => { pickerLoaded = null; throw e; }));
}
async function chooseSheet() {
  await loadPickerApi();
  return new Promise(resolve => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setIncludeFolders(false).setMode(google.picker.DocsViewMode.LIST);
    new google.picker.PickerBuilder()
      .setAppId(GOOGLE.appId).setOAuthToken(gToken).setDeveloperKey(GOOGLE.apiKey)
      .addView(view).setTitle("Choose your directorate's responses sheet")
      .setCallback(d => {
        if (d.action === google.picker.Action.PICKED) resolve({ id: d.docs[0].id, name: formTitle(d.docs[0].name) });
        else if (d.action === google.picker.Action.CANCEL) resolve(null);
      })
      .build().setVisible(true);
  });
}

async function sheetRows(sheet) {
  const api = async path => {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheet.id)}${path}`, { headers: { Authorization: 'Bearer ' + gToken } });
    if (r.ok) return r.json();
    const e = new Error(r.status === 401 ? 'Your Google session expired. Sign in again.'
      : (r.status === 403 || r.status === 404) ? `Your Google account can't open “${sheet.name}”. If it belongs to your directorate, ask for it to be shared with your group, then pick it again with Change sheet.`
      : `Google Sheets returned an error (${r.status}). Try again in a moment.`);
    e.status = r.status; throw e;
  };
  const meta = await api('?fields=sheets.properties.title');
  const titles = meta.sheets.map(t => t.properties.title);
  const tab = titles.find(t => /^form responses/i.test(t)) || titles[0];
  const data = await api(`/values/${encodeURIComponent(`'${tab.replace(/'/g, "''")}'`)}?valueRenderOption=FORMATTED_VALUE`);
  return data.values || [];
}

async function loadSheet(sheet, first) {
  const rows = await sheetRows(sheet);
  const prevCount = applicants.length;
  applicants = buildApplicants(rows, true);
  liveSheet = sheet; lastRefresh = Date.now();
  source = { kind: 'sheet', name: sheet.name };
  showLoaded(first, first ? 0 : Math.max(0, applicants.length - prevCount));
  clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshLive, REFRESH_MS);
}
async function refreshLive() {
  if (!liveSheet || document.hidden) return;
  if (!gToken || Date.now() > gTokenExp - 30000) {
    stopLive();
    showImportError('Live updates paused because your Google session expired. Click Reconnect to resume.');
    $('#changeFile').textContent = 'Reconnect';
    return;
  }
  try { await loadSheet(liveSheet, false); showImportError(''); }
  catch (e) { if (e.status === 401) { gToken = null; refreshLive(); } else showImportError(e.message); }
}
function stopLive() { clearInterval(refreshTimer); refreshTimer = null; liveSheet = null; }

async function connectGoogle(forcePick) {
  showImportError('');
  const btn = $('#gSignIn'); btn.disabled = true;
  try {
    await getToken();
    // Only roster members may use the site, so check the account here too, not just at the terminal.
    const who = await rosterLookup(await googleEmail());
    if (!who) {
      const email = await googleEmail().catch(() => 'This account');
      gToken = null; gTokenExp = 0; stopLive(); showSourceChoice();
      showImportError(`Access denied: ${email} is not on the High Command roster.`);
      return;
    }
    operator.set(who); showOperator();
    let sheet = forcePick ? null : savedSheet();
    if (!sheet) {
      sheet = await chooseSheet();
      if (!sheet) { if (!source) updateGoogleButton(); return; }
      store.set('cad.sheet', JSON.stringify(sheet));
    }
    stopLive();
    await loadSheet(sheet, true);
  } catch (e) {
    showImportError(e.message);
  } finally { btn.disabled = false; }
}

$('#gSignIn').addEventListener('click', () => connectGoogle(false));
document.addEventListener('visibilitychange', () => { if (!document.hidden && liveSheet && Date.now() - lastRefresh > 30000) refreshLive(); });
updateGoogleButton();

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// Higher is a closer match: prefix, then substring, then letters in order, then small typos.
function matchScore(q, s) {
  const t = norm(s);
  if (!t) return 0;
  if (t.startsWith(q)) return 100;
  const at = t.indexOf(q);
  if (at >= 0) return 85 - at * 0.1;
  let j = 0;
  for (const ch of t) if (ch === q[j] && ++j === q.length) break;
  if (j === q.length && q.length >= 3) return 60;
  if (q.length >= 3) {
    let best = Infinity;
    for (let len = q.length - 1; len <= q.length + 1; len++)
      for (let k = 0; k + len <= t.length; k++) best = Math.min(best, lev(q, t.slice(k, k + len)));
    if (best <= (q.length <= 4 ? 1 : 2)) return 40 - best * 10;
  }
  return 0;
}

function sortedApplicants() {
  const mode = $('#appSort').value;
  const byTime = (a, b) => (isNaN(a.t) || isNaN(b.t)) ? a.order - b.order : a.t - b.t;
  const list = [...applicants];
  if (mode === 'az') list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  else if (mode === 'old') list.sort(byTime);
  else list.sort((a, b) => byTime(b, a));
  return list;
}
function renderList() {
  const q = norm($('#appSearch').value);
  let list = sortedApplicants();
  if (q) list = list.map(a => ({ a, s: Math.max(matchScore(q, a.name), matchScore(q, a.alt)) }))
    .filter(x => x.s > 0).sort((x, y) => y.s - x.s).map(x => x.a);
  shown = list;
  if (activeOption >= shown.length) activeOption = shown.length - 1;
  $('#appList').innerHTML = shown.length
    ? shown.map((a, k) => `<li role="option" id="opt-${a.id}" data-id="${a.id}" aria-selected="${currentApplicant === a.id}" class="${k === activeOption ? 'active' : ''}"><span class="opt-name">${esc(a.name)}</span><span class="opt-meta">${esc([a.alt, a.date].filter(Boolean).join(' · '))}</span></li>`).join('')
    : `<li class="opt-empty" role="presentation">${applicants.length ? 'No matching applicants' : 'No applications yet'}</li>`;
  $('#appSearch').setAttribute('aria-activedescendant', activeOption >= 0 && shown[activeOption] ? 'opt-' + shown[activeOption].id : '');
  const act = $('#appList .active'); if (act) act.scrollIntoView({ block: 'nearest' });
}
function openList() { activeOption = -1; $('#appList').hidden = false; $('#appSearch').setAttribute('aria-expanded', 'true'); renderList(); }
function closeList() { $('#appList').hidden = true; $('#appSearch').setAttribute('aria-expanded', 'false'); }
function selectApplicant(a) {
  currentApplicant = a.id;
  $('#appSearch').value = a.name; closeList();
  state = { applicant: a.alt ? `${a.name} (${a.alt})` : a.name, submitted: a.date, answers: a.answers.map(x => ({ ...x })), baseline: '' };
  $('#baseline').value = '';
  renderAnswers(); run();
}

$('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
const dz = $('#dropzone');
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('is-over'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('is-over'); }));
dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) importFile(f); });
$('#changeFile').addEventListener('click', () => {
  if (source && source.kind === 'sheet') {
    const reconnect = $('#changeFile').textContent === 'Reconnect';
    $('#changeFile').textContent = 'Change sheet';
    connectGoogle(!reconnect);
  } else { showSourceChoice(); $('#fileInput').click(); }
});
$('#signOut').addEventListener('click', () => {
  stopLive(); gToken = null; gTokenExp = 0; showImportError(''); showSourceChoice();
});
$('#appSort').addEventListener('change', () => { if (!$('#appList').hidden) renderList(); });
$('#appSearch').addEventListener('focus', openList);
$('#appSearch').addEventListener('click', () => { if ($('#appList').hidden) openList(); });
$('#appSearch').addEventListener('input', () => { activeOption = 0; $('#appList').hidden = false; $('#appSearch').setAttribute('aria-expanded', 'true'); renderList(); });
$('#appSearch').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if ($('#appList').hidden) openList();
    if (!shown.length) return;
    activeOption = e.key === 'ArrowDown' ? Math.min(shown.length - 1, activeOption + 1) : Math.max(0, activeOption - 1);
    renderList();
  } else if (e.key === 'Enter') {
    if (!$('#appList').hidden && shown[activeOption]) { e.preventDefault(); selectApplicant(shown[activeOption]); }
  } else if (e.key === 'Escape') closeList();
});
$('#appSearch').addEventListener('blur', () => setTimeout(closeList, 120));
$('#appList').addEventListener('mousedown', e => {
  const li = e.target.closest('[data-id]'); if (!li) return;
  e.preventDefault(); selectApplicant(applicants.find(a => a.id === +li.dataset.id));
});

let timer;
function schedule() { clearTimeout(timer); timer = setTimeout(run, 300); }

/* ---------- Render results ---------- */
const BANDS = {
  low: ['Low indicators', 'Process normally'],
  mid: ['Read closely', 'Compare with Discord'],
  high: ['Verify in person', 'Run follow-up'],
  none: ['No applicant', 'Pick one to begin']
};
const WHY = {
  base: 'Compares vocabulary, dashes and habits like lowercase i with how they write in Discord. A sudden jump in vocabulary is hard to fake.',
  vocab: 'Words chatbots overuse. Casual writers rarely pass 1 per 100 words.',
  md: "Google Forms doesn't render ** or #, so they usually come from a pasted chatbot reply.",
  phrase: 'Stock lines like “valuable asset” and “commitment to excellence”.',
  rhythm: 'People mix short and long sentences (40%+ variation). AI tends to keep them even.',
  specific: 'Names, numbers, dates and places. Generic answers that could fit any group are typical of AI.',
  dash: 'A common ChatGPT habit. Some phones insert them too, so check their Discord messages.',
  triplet: 'Repeated “X, Y, and Z” lists of qualities.',
  polish: 'No lowercase i, slang or skipped apostrophes. Weak alone, since people tidy up for applications.'
};
const SHORT = { base: 'unlike their Discord', vocab: 'AI-typical words', md: 'pasted formatting', phrase: 'stock phrases', rhythm: 'even sentence rhythm', specific: 'little concrete detail', dash: 'em dashes', triplet: 'lists of three', polish: 'no casual traces' };
const openHelp = new Set();
$('#signals').addEventListener('click', e => {
  const btn = e.target.closest('[data-help]');
  if (!btn) return;
  const id = btn.dataset.help, open = !openHelp.has(id);
  open ? openHelp.add(id) : openHelp.delete(id);
  btn.setAttribute('aria-expanded', open);
  $('#why-' + id).hidden = !open;
});
const bandOf = i => i >= 50 ? 'high' : i >= 22 ? 'mid' : 'low';
const BAND_SHORT = { low: 'Low', mid: 'Read closely', high: 'Verify' };
let lastReport = '', lastAnnounced = '';

function markText(text, spans) {
  const title = { v: 'AI-typical word', m: 'Common in AI writing', p: 'Stock phrase', d: 'Em dash or pasted formatting' };
  let out = '', pos = 0;
  for (const sp of spans) { out += esc(text.slice(pos, sp.s)) + `<mark class="${sp.c}" title="${title[sp.c]}">${esc(text.slice(sp.s, sp.e))}</mark>`; pos = sp.e; }
  return out + esc(text.slice(pos));
}
function announce(msg) { if (msg !== lastAnnounced) { lastAnnounced = msg; $('#srStatus').textContent = msg; } }

function run() {
  $('#dossierName').textContent = state.applicant || 'None selected';
  const filled = state.answers.map((x, i) => ({ ...x, i })).filter(x => x.a.trim());
  const all = filled.map(x => x.a).join('\n\n');
  const baseProf = profile(state.baseline || '');
  const hasBase = baseProf.words >= 40;
  const warnings = [];

  if (!filled.length) {
    const [t, s] = BANDS.none;
    $('#stamp').className = 'stamp band-none'; $('#stamp').innerHTML = `${t}<small>${s}</small>`;
    $('#summary').textContent = 'Pick an applicant to begin.'; $('#needle').style.left = '0%'; $('#indexLine').textContent = '';
    ['#signals', '#baseTable', '#baseSummary', '#marked', '#followups', '#warnings'].forEach(id => { $(id).innerHTML = ''; });
    $('#baseSec').hidden = true; lastReport = ''; announce('No answers to screen.');
    return;
  }

  const res = analyze(all, { base: hasBase ? baseProf : null });
  const perRes = filled.map(x => ({ ...x, r: analyze(x.a) }));

  if (res.W < 80) warnings.push(['Short answers.', 'Under 80 words, so treat the result as weak.']);
  if (!hasBase) warnings.push(state.baseline.trim()
    ? ['Not enough Discord messages.', `${baseProf.words} words so far; the comparison needs 40.`]
    : ['No Discord messages.', 'Paste some of theirs to compare how they normally write.']);
  let band = res.band;
  if (res.W < 40 && band === 'high') band = 'mid';

  const [t, s] = BANDS[band];
  $('#stamp').className = 'stamp band-' + band; $('#stamp').innerHTML = `${t}<small>${s}</small>`;
  $('#needle').style.left = res.index + '%';
  $('#indexLine').textContent = `Index ${res.index}/100 · ${res.strongCount} strong signal${res.strongCount === 1 ? '' : 's'} · ${res.W} words`;
  const top = res.sig.filter(x => x.strength >= 0.5).sort((a, b) => b.weight * b.strength - a.weight * a.strength).map(x => SHORT[x.id]);
  $('#summary').textContent = band === 'low'
    ? 'Few AI patterns.'
    : band === 'mid'
      ? (top.length ? `Some patterns: ${top.slice(0, 3).join(', ')}.` : 'Mild patterns across several signals.')
      : `Several patterns: ${top.slice(0, 4).join(', ')}.`;
  announce(`Result: ${t}. Index ${res.index} of 100.`);
  $('#warnings').innerHTML = warnings.map(([h, w]) => `<div class="warn-line"><b>${esc(h)}</b> ${esc(w)}</div>`).join('');

  // Signals
  const sorted = [...res.sig].sort((a, b) => b.weight * b.strength - a.weight * a.strength);
  $('#signals').innerHTML = sorted.map(x => {
    const on = Math.round(x.strength * 5), open = openHelp.has(x.id);
    return `<div class="sig ${x.strength < 0.1 ? 'off' : ''}">
      <div class="sig-name">${esc(x.name)}<button type="button" class="sig-help" data-help="${x.id}" aria-expanded="${open}" aria-controls="why-${x.id}" aria-label="What does ${esc(x.name)} mean?">?</button></div>
      <p class="sig-why" id="why-${x.id}"${open ? '' : ' hidden'}>${esc(WHY[x.id])}</p>
      <div class="pips ${x.weight >= 2.5 && x.strength >= 0.6 ? 'hot' : ''}" role="img" aria-label="Strength ${on} of 5">${[0, 1, 2, 3, 4].map(k => `<span class="${k < on ? 'on' : ''}"></span>`).join('')}<em aria-hidden="true">${on}/5</em></div>
      <div class="sig-detail">${esc(x.detail)}</div></div>`;
  }).join('');

  // Discord vs. application
  $('#baseSec').hidden = !hasBase;
  if (hasBase && res.cmp) {
    const n = res.cmp.flagged.length;
    $('#baseSummary').textContent = n ? `${n} big gap${n === 1 ? '' : 's'}: ${res.cmp.flagged.map(r => r.short).join(', ')}.` : 'No big gaps. They write the form much like they talk.';
    $('#baseTable').innerHTML = '<thead><tr><th scope="col">Aspect</th><th scope="col">Discord</th><th scope="col">Application</th><th scope="col">Difference</th></tr></thead><tbody>' +
      res.cmp.rows.map(r => `<tr class="${r.flag ? 'gap' : ''}"><td>${esc(r.label)}</td><td class="num">${esc(r.fmt(r.b))}</td><td class="num">${esc(r.fmt(r.a))}</td><td class="num">${esc(diffLabel(r.b, r.a))}${r.flag ? ' <span class="flag y">Big gap</span>' : ''}</td></tr>`).join('') + '</tbody>';
  }

  // Marked text
  $('#marked').innerHTML = perRes.map(x => `<div class="marked-item"><span class="mq">Q${x.i + 1}${x.q ? ' · ' + esc(x.q) : ''}</span>${markText(x.a, x.r.spans)}</div>`).join('');

  // Follow-up questions, grouped by application question. They test whether an answer is the applicant's own:
  // can they recall it, back it with real specifics, and say it in their normal voice.
  const CLAIM = /\b(in (?:a|my|our) (?:previous|past|old|former|last) (?:group|server|division|role|job|team)|one time|when i was|back when|i (?:once|have|had|previously) (?:led|managed|handled|worked|served|hosted|ran|organi[sz]ed|moderated))\b/i;
  const TRIPLE = /\b[\w'’-]+(?: [\w'’-]+){0,2}, [\w'’-]+(?: [\w'’-]+){0,2},? and [\w'’-]+/i;
  const clip = str => str.length > 200 ? str.slice(0, 197) + '…' : str;
  const groups = perRes.filter(x => x.r.index >= 22).map(x => {
    const qs = ['Tell me in your own words what you wrote for this question.'];
    const sents = sentencesOf(x.a);
    const claim = sents.find(sent => CLAIM.test(sent));
    const spec = x.r.sig.find(z => z.id === 'specific');
    if (claim) qs.push(`You wrote: “${clip(claim)}” Which group or situation was that, who else was involved, and roughly when?`);
    else if (spec && spec.strength >= 0.6) qs.push('This answer could fit almost anyone. What part of it is true only for you? Give one real example from your time in the group.');
    let best = null;
    for (const sent of sents) {
      const sc = findSpans(sent).reduce((tot, sp) => tot + ({ v: 1, m: 0.5, p: 1.5, d: 1 })[sp.c], 0);
      if (sc >= 2 && sent !== claim && (!best || sc > best.sc)) best = { s: sent, sc };
    }
    if (best) qs.push(`Say this part again the way you'd normally say it: “${clip(best.s)}”`);
    const tri = x.a.match(TRIPLE);
    if (tri) qs.push(`You listed “${tri[0]}”. Which of those actually describes you best, and when have you shown it here?`);
    return { x, qs: qs.slice(0, 3) };
  });
  const label = x => `Q${x.i + 1}${x.q ? ' · ' + esc(x.q) : ''}`;
  $('#followups').innerHTML =
    (groups.length ? groups.map(g => `<div class="fu-group"><p class="fu-q">${label(g.x)}</p><ol>${g.qs.map(q => `<li>${esc(q)}</li>`).join('')}</ol></div>`).join('')
      : '<p class="hint">No single answer stands out.</p>');

  // Report for Discord. It always fits one message (2,000 characters without Nitro):
  // if the full version is too long, it is trimmed step by step, least important detail first.
  const name = state.applicant.trim() || 'Unnamed applicant';
  const clipQuotes = (q, n) => q.replace(/“([^”]*)”/g, (m, inner) => inner.length > n ? `“${inner.slice(0, n - 1)}…”` : m);
  const RECALL = 'Tell me in your own words what you wrote.';
  const buildReport = lvl => {
    const quote = lvl >= 2 ? 80 : lvl >= 1 ? 110 : 160, perQ = lvl >= 2 ? 1 : 2, maxQ = lvl >= 5 ? 1 : lvl >= 4 ? 2 : lvl >= 3 ? 3 : 6;
    const out = [
      `## AI screening: ${name}`,
      source ? `Form: ${source.name}${state.submitted ? ` · submitted ${state.submitted}` : ''}` : '',
      `**Result: ${t}** · ${res.index}/100 · ${res.strongCount} strong signal${res.strongCount === 1 ? '' : 's'} · ${res.W} words · ${hasBase ? 'compared with Discord' : 'no Discord messages'}`,
      $('#summary').textContent,
      '', '**Signals**'
    ];
    if (lvl >= 3) out.push(sorted.filter(x => x.strength > 0).map(x => `${x.name} ${Math.round(x.strength * 5)}/5`).join(' · ') || 'None found.');
    else out.push(...sorted.filter(x => lvl >= 1 ? x.strength > 0 : true).map(x => `- ${x.name} (${Math.round(x.strength * 5)}/5): ${x.detail}`));
    if (hasBase && res.cmp) {
      out.push('', '**Discord vs. application**', $('#baseSummary').textContent);
      if (lvl < 2) out.push(...res.cmp.flagged.map(r => `- ${r.label}: ${r.fmt(r.b)} → ${r.fmt(r.a)} (${diffLabel(r.b, r.a)})`));
    }
    out.push('', '**Follow-up questions**');
    if (!groups.length) out.push('No single answer stands out.');
    else {
      out.push(`For each question below, first ask: “${RECALL}”`);
      const top = [...groups].sort((x, y) => y.x.r.index - x.x.r.index).slice(0, maxQ).sort((x, y) => x.x.i - y.x.i);
      top.forEach(g => {
        out.push(`**Q${g.x.i + 1}** · ${g.x.q || 'Question ' + (g.x.i + 1)} (${g.x.r.index}/100)`);
        g.qs.slice(1, 1 + perQ).forEach(q => out.push(`- ${clipQuotes(q, quote)}`));
      });
      if (groups.length > top.length) out.push(`+${groups.length - top.length} more flagged question${groups.length - top.length === 1 ? '' : 's'} on the site.`);
    }
    return out.filter(Boolean).join('\n').replace(/\n(\*\*(Signals|Discord vs|Follow-up))/g, '\n\n$1');
  };
  const LIMIT = 2000;
  let report = buildReport(0);
  for (let lvl = 1; report.length > LIMIT && lvl <= 5; lvl++) report = buildReport(lvl);
  if (report.length > LIMIT) report = report.slice(0, LIMIT - 1) + '…';
  lastReport = report;
}

$('#copyReport').addEventListener('click', () => {
  const fb = $('#copyFallback'), toast = $('#toast');
  if (!lastReport) { toast.textContent = 'Nothing to copy yet. Pick an applicant first.'; return; }
  const fallback = () => { fb.hidden = false; fb.value = lastReport; fb.focus(); fb.select(); toast.textContent = 'Copying was blocked. The report is selected below; press Ctrl+C.'; };
  try {
    navigator.clipboard.writeText(lastReport).then(() => {
      fb.hidden = true; toast.textContent = 'Report copied. It fits in one Discord message.';
      setTimeout(() => { toast.textContent = ''; }, 3500);
    }, fallback);
  } catch (e) { fallback(); }
});

/* ---------- High Command roster ---------- */
// Who may pass the terminal, and how they are greeted. Keys are SHA-256 hashes of 'cad-roster-v1:' + lowercase email,
// so the public code never contains anyone's email address. To add someone, hash their email the same way and add a line.
// clearance is optional and defaults to High Command.
const ROSTER = {
  '035fb2e464301bd183b4d44f3022266bf155e35c7b1b5018aed73098c6f2f052': { rank: 'Chief of Intelligence Staff', name: 'VintInvictus', clearance: 'Executive Leadership' }
};
async function rosterLookup(email) {
  const data = new TextEncoder().encode('cad-roster-v1:' + email.trim().toLowerCase());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
  return ROSTER[hash] || null;
}
async function googleEmail() {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + gToken } });
  if (!r.ok) throw new Error("Couldn't read your Google email address. Sign in again and allow access to your email.");
  const info = await r.json();
  if (!info.email || info.email_verified === false) throw new Error('Your Google account has no verified email address.');
  return info.email;
}

/* ---------- Terminal entry gate (once per browser session) ---------- */
// Sign-in comes first: the email decides whether you get in and how you are greeted.
// Access to applications is still Google's: people only load sheets shared with their group.
const gate = $('#gate');
const sess = {
  get() { try { return sessionStorage.getItem('cad.session') === '1'; } catch (e) { return false; } },
  set(on) { try { on ? sessionStorage.setItem('cad.session', '1') : (sessionStorage.removeItem('cad.session'), sessionStorage.removeItem('cad.operator')); } catch (e) {} }
};
const operator = {
  get() { try { return JSON.parse(sessionStorage.getItem('cad.operator') || 'null'); } catch (e) { return null; } },
  set(who) { try { sessionStorage.setItem('cad.operator', JSON.stringify(who)); } catch (e) {} }
};
const BOOT_MS = 7000;
let bootCancel = null;

function setPageInert(on) { document.querySelectorAll('body > :not(#gate)').forEach(el => { el.inert = on; }); }
function showOperator() {
  const who = operator.get();
  $('#operatorRank').textContent = who ? who.rank : '';
  $('#operatorName').textContent = who ? who.name : '';
  $('#operatorChip').hidden = !who;
  $('#lockTerminal').hidden = false;
}
function gateError(msg) { $('#gateError').textContent = msg; $('#gateError').hidden = !msg; }
function gateStatus(msg) { $('#gateStatus').textContent = msg; $('#gateStatus').hidden = !msg; }
function gateBusy(on) {
  $('#gateCoin').classList.toggle('is-fast', on);
  $('#gateGoogle').disabled = on;
  $('#gateGoogleLabel').textContent = on ? 'Authenticating…' : 'Sign in with Google credentials';
}
function openGate() {
  if (bootCancel) bootCancel();
  document.documentElement.classList.remove('session');
  document.documentElement.classList.add('gate-open');
  gate.hidden = false; gate.classList.remove('is-leaving');
  $('#sessionId').textContent = `SEC-${String(Math.floor(Math.random() * 90000) + 10000)}-HC`;
  $('#bootLog').hidden = true; $('#bootLog').innerHTML = '';
  $('#bootProgress').hidden = true; $('#bootProgress i').style.transition = 'none'; $('#bootProgress i').style.width = '0';
  $('#skipHint').hidden = true; $('#gateActions').hidden = false;
  gateError(''); gateStatus(''); gateBusy(false);
  setPageInert(true);
  $('#gateGoogle').focus();
}
function closeGate() {
  sess.set(true);
  gate.classList.add('is-leaving');
  setTimeout(() => {
    gate.hidden = true; gate.classList.remove('is-leaving');
    document.documentElement.classList.remove('gate-open');
    document.documentElement.classList.add('session');
    setPageInert(false); showOperator();
    if (!$('#picker').hidden) $('#appSearch').focus();
  }, 450);
}

function runBoot(who, info) {
  $('#gateActions').hidden = true; gateError(''); gateStatus('');
  const log = $('#bootLog'); log.hidden = false; log.innerHTML = '';
  const title = `${who.rank} ${who.name}`;
  const lines = [
    '> AUTHENTICATING GOOGLE CREDENTIALS ........ OK',
    `> IDENTITY CONFIRMED: ${title.toUpperCase()}`,
    `> CLEARANCE LEVEL: ${(who.clearance || 'High Command').toUpperCase()}`,
    `> SECURE LINK: ${info.name.toUpperCase()} ........ OK`,
    `> DECRYPTING ${info.count} APPLICANT DOSSIER${info.count === 1 ? '' : 'S'} ........ OK`,
    '> CALIBRATING 9 DETECTION SIGNALS ........ OK',
    `> WELCOME, ${title}. ACCESS GRANTED.`
  ];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const per = BOOT_MS / lines.length, timers = [];
  let typer = null, done = false;
  const bar = $('#bootProgress i');
  $('#bootProgress').hidden = false; $('#skipHint').hidden = false;
  bar.style.transition = 'none'; bar.style.width = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${BOOT_MS}ms linear`; bar.style.width = '100%'; }));
  const onKey = e => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); finish(); } };
  const onClick = () => finish();
  const cleanup = () => { timers.forEach(clearTimeout); clearInterval(typer); document.removeEventListener('keydown', onKey); gate.removeEventListener('click', onClick); bootCancel = null; };
  const finish = () => { if (done) return; done = true; cleanup(); closeGate(); };
  bootCancel = () => { done = true; cleanup(); };
  lines.forEach((text, k) => timers.push(setTimeout(() => {
    const line = document.createElement('p');
    if (k === lines.length - 1) line.className = 't-ok';
    log.appendChild(line);
    if (reduce) { line.textContent = text; return; }
    let n = 0; const step = Math.max(1, Math.ceil(text.length / 18));
    clearInterval(typer);
    typer = setInterval(() => { n += step; line.textContent = text.slice(0, n); if (n >= text.length) clearInterval(typer); }, 22);
  }, k * per)));
  timers.push(setTimeout(finish, BOOT_MS + 600));
  timers.push(setTimeout(() => { document.addEventListener('keydown', onKey); gate.addEventListener('click', onClick); }, 300));
}

function denyAccess(msg) {
  gToken = null; gTokenExp = 0;
  gateBusy(false); gateStatus('');
  gateError(msg);
}

$('#gateGoogle').addEventListener('click', async () => {
  gateError(''); gateBusy(true);
  gateStatus('> AWAITING GOOGLE AUTHORIZATION');
  let who, info;
  try {
    gToken = null; gTokenExp = 0;
    await getToken();
    gateStatus('> VERIFYING IDENTITY');
    const email = await googleEmail();
    who = await rosterLookup(email);
    if (!who) return denyAccess(`> ACCESS DENIED: ${email} is not on the High Command roster.`);
    operator.set(who);
    gateStatus('> ESTABLISHING SECURE LINK');
    let sheet = savedSheet();
    if (!sheet) {
      sheet = await chooseSheet();
      if (!sheet) throw new Error("> No sheet picked. Pick your directorate's responses sheet to continue.");
      store.set('cad.sheet', JSON.stringify(sheet));
    }
    stopLive();
    try { await loadSheet(sheet, true); }
    catch (e) { if (e.status === 403 || e.status === 404) store.set('cad.sheet', 'null'); throw e; }
    closeList(); $('#appSearch').blur();
    info = { name: sheet.name, count: applicants.length };
  } catch (e) {
    gateBusy(false); gateStatus('');
    gateError(e.message.startsWith('>') ? e.message : '> ERROR: ' + e.message);
    updateGoogleButton();
    return;
  }
  runBoot(who, info);
});
$('#lockTerminal').addEventListener('click', () => {
  stopLive(); gToken = null; gTokenExp = 0; showImportError(''); showSourceChoice();
  state = { applicant: '', answers: [], baseline: '' };
  $('#baseline').value = ''; $('#appSearch').value = '';
  renderAnswers(); run();
  sess.set(false); openGate();
});

if (sess.get() && operator.get()) { gate.hidden = true; showOperator(); }
else { sess.set(false); openGate(); }

renderAnswers();
run();
})();
