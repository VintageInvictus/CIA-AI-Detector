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

/* ---------- Theme toggle ---------- */
const root = document.documentElement;
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : darkQuery.matches;
function syncThemeUI() {
  root.classList.toggle('is-dark', isDark());
  $('#themeToggle').setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
}
$('#themeToggle').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  root.dataset.theme = next; store.set('cad.theme', next); syncThemeUI();
});
darkQuery.addEventListener('change', syncThemeUI);
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
  const toks = tokens(text), W = toks.length || 1;
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
    longRatio: longW / W,
    aiRate: vs / W * 100,
    lowerI: (lowI + upI) ? lowI / (lowI + upI) : null,
    iCount: lowI + upI,
    slang: count(SLANG, text) / W * 100,
    missApos: (miss + cont) ? miss / (miss + cont) : null,
    dashes: count(DASH, text),
    commas: count(/,/g, text) / W * 100
  };
}

function compareBaseline(app, base) {
  const rows = [];
  const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
  const add = (label, b, a, flag, w, short) => rows.push({ label, b, a, flag, w, short });
  add('Long words (9+ letters)', pct(base.longRatio), pct(app.longRatio), app.longRatio >= 2 * base.longRatio && app.longRatio >= 0.1, 1, 'vocabulary level');
  add('AI-typical words per 100', r1(base.aiRate), r1(app.aiRate), app.aiRate >= 1.5 && base.aiRate < 0.5, 1, 'AI-typical words');
  add('Em / en dashes', base.dashes, app.dashes, app.dashes >= 1 && base.dashes === 0, 0.5, 'dashes');
  add("Lowercase 'i'", pct(base.lowerI), pct(app.lowerI), base.lowerI != null && base.lowerI >= 0.5 && app.iCount >= 3 && app.lowerI === 0, 0.35, 'lowercase i');
  add('Skipped apostrophes (dont, im)', pct(base.missApos), pct(app.missApos), base.missApos != null && base.missApos >= 0.5 && app.missApos === 0, 0.4, 'apostrophes');
  add('Slang per 100 words', r1(base.slang), r1(app.slang), base.slang >= 3 && app.slang === 0, 0.25, 'slang');
  add('Commas per 100 words', r1(base.commas), r1(app.commas), app.commas >= 5 && app.commas >= 3 * Math.max(base.commas, 0.5), 0.25, 'commas');
  const total = rows.reduce((t, r) => t + (r.flag ? r.w : 0), 0);
  return { rows, strength: clamp(total / 2), flagged: rows.filter(r => r.flag) };
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
  for (const t of (ctx.terms || [])) specifics += 2 * count(new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), text);
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

/* ---------- Examples ---------- */
const DISCORD_SAMPLE = 'yo anyone on rn\nngl that raid was kinda rough lol we got wiped at the gate like 3 times\ni can host training later if a HR is free\nidk who has the keycard for site b tho\nbro my wifi died mid patrol 💀\ngonna grind for sgt this week fr\nwho was the guy that kept tking at spawn\nim on in 10 mins if anyone wants to do drills\nthat new map is so confusing i got lost twice lmao\ndont forget training is at 6 est';
const EX_AI = {
  applicant: 'Example: ShadowOps_Recruit',
  answers: [
    { q: 'Why do you want to join the CIA?', a: 'I want to join the CIA because I am deeply passionate about intelligence work and the strategic thinking it requires. The CIA represents a unique opportunity to contribute to a disciplined, collaborative team while developing my leadership and communication skills. Furthermore, I believe that my dedication, attention to detail, and commitment to excellence would make me a valuable asset to the agency. I am eager to learn from experienced operatives and to help foster a positive, professional environment within the group.' },
    { q: 'Describe a time you handled a difficult situation.', a: 'In a previous group, I encountered a situation where two members were in conflict over a training decision. Rather than taking sides, I listened to both perspectives, identified the root of the disagreement, and facilitated a calm discussion. Ultimately, we reached a compromise that satisfied everyone involved. This experience taught me the importance of patience, empathy, and clear communication — qualities I would bring to every operation.' },
    { q: 'What would you do if a superior gave you an order you disagreed with?', a: 'If a superior gave me an order I disagreed with, I would first follow the chain of command and carry out the order, provided it does not violate any rules. Afterward, I would respectfully raise my concerns in private, ensuring that my feedback is constructive and solution-oriented. Maintaining discipline is paramount in a mil-sim environment, but open communication is equally essential for the team to thrive.' }
  ],
  baseline: DISCORD_SAMPLE
};
const EX_HUMAN = {
  applicant: 'Example: kaden_fan22',
  answers: [
    { q: 'Why do you want to join the CIA?', a: 'i want to join cia because ive been in the group for like 2 months as a recruit and i liked the way the patrols are run. my friend Kaden got me in and i went to the sunday trainings. i think im good at staying calm during raids and i want to try the intel side since i only did infantry before' },
    { q: 'Describe a time you handled a difficult situation.', a: 'one time in my old group (US Army roblox) a guy kept team killing at base and nobody was doing anything. i recorded it and sent it to a mod instead of arguing with him in chat, he got kicked after like a day. i was annoyed tho cause it ruined 2 trainings' },
    { q: 'What would you do if a superior gave you an order you disagreed with?', a: 'honestly i would do it if it doesnt break rules. then dm them after and say why i didnt agree. i wouldnt argue in front of everyone because thats what made my last group fall apart' }
  ],
  baseline: DISCORD_SAMPLE
};

/* ---------- State and inputs ---------- */
let state = { applicant: '', answers: [{ q: '', a: '' }], baseline: '', example: false };
$('#terms').value = store.get('cad.terms') || '';
$('#division').value = store.get('cad.division') || '';

function renderAnswers() {
  $('#answers').innerHTML = state.answers.map((x, i) => `
    <div class="answer">
      <div class="answer-top">
        <span>Question ${i + 1}</span>
        ${state.answers.length > 1 ? `<button type="button" class="btn btn-quiet" data-del="${i}" aria-label="Remove question ${i + 1}">Remove</button>` : ''}
      </div>
      <div class="field">
        <label for="q-${i}">Question text <span class="hint">(optional)</span></label>
        <input type="text" id="q-${i}" data-i="${i}" data-k="q" value="${esc(x.q)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="a-${i}">Applicant's answer</label>
        <textarea id="a-${i}" data-i="${i}" data-k="a" rows="5">${esc(x.a)}</textarea>
      </div>
    </div>`).join('');
}
function load(ex) {
  state = { applicant: ex.applicant, answers: ex.answers.map(a => ({ ...a })), baseline: ex.baseline, example: true };
  $('#applicant').value = state.applicant; $('#baseline').value = state.baseline;
  renderAnswers(); run();
}
function touched() { state.example = false; schedule(); }

$('#answers').addEventListener('input', e => {
  const i = +e.target.dataset.i, k = e.target.dataset.k;
  if (k) { state.answers[i][k] = e.target.value; touched(); }
});
$('#answers').addEventListener('click', e => {
  const btn = e.target.closest('[data-del]');
  if (btn) { state.answers.splice(+btn.dataset.del, 1); renderAnswers(); touched(); $('#addAnswer').focus(); }
});
$('#addAnswer').addEventListener('click', () => { state.answers.push({ q: '', a: '' }); renderAnswers(); $('#q-' + (state.answers.length - 1)).focus(); });
$('#applicant').addEventListener('input', e => { state.applicant = e.target.value; touched(); });
$('#baseline').addEventListener('input', e => { state.baseline = e.target.value; touched(); });
$('#terms').addEventListener('input', e => { store.set('cad.terms', e.target.value); schedule(); });
$('#division').addEventListener('input', e => { store.set('cad.division', e.target.value); schedule(); });
$('#exAI').addEventListener('click', () => load(EX_AI));
$('#exHuman').addEventListener('click', () => load(EX_HUMAN));
$('#clearAll').addEventListener('click', () => {
  state = { applicant: '', answers: [{ q: '', a: '' }], baseline: '', example: false };
  $('#applicant').value = ''; $('#baseline').value = ''; renderAnswers(); run(); $('#a-0').focus();
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

function buildApplicants(rows) {
  const [header, ...data] = rows;
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
  const err = $('#importError'); err.hidden = true;
  try {
    const buf = await file.arrayBuffer();
    const isZip = /\.zip$/i.test(file.name) || new Uint8Array(buf.slice(0, 2)).join() === '80,75';
    const text = isZip ? await csvFromZip(buf) : new TextDecoder().decode(buf);
    applicants = buildApplicants(parseCSV(text));
  } catch (e) {
    err.textContent = e.message || "Couldn't read that file. Make sure it's the .zip or .csv from Google Forms.";
    err.hidden = false; return;
  }
  const formName = file.name.replace(/(\.csv)?(\.zip)?$/i, '').replace(/\s*\((responses|.*?)\)\s*$/i, '').trim();
  if (!$('#division').value.trim()) {
    $('#division').value = formName.replace(/\s+application$/i, '');
    store.set('cad.division', $('#division').value);
  }
  $('#fileInfo').textContent = `${formName} · ${applicants.length} applicant${applicants.length === 1 ? '' : 's'}`;
  $('#dropzone').hidden = true; $('#picker').hidden = false;
  $('#appSearch').value = ''; $('#appSearch').focus();
  openList();
}

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
    : '<li class="opt-empty" role="presentation">No matching applicants</li>';
  $('#appSearch').setAttribute('aria-activedescendant', activeOption >= 0 && shown[activeOption] ? 'opt-' + shown[activeOption].id : '');
  const act = $('#appList .active'); if (act) act.scrollIntoView({ block: 'nearest' });
}
function openList() { activeOption = -1; $('#appList').hidden = false; $('#appSearch').setAttribute('aria-expanded', 'true'); renderList(); }
function closeList() { $('#appList').hidden = true; $('#appSearch').setAttribute('aria-expanded', 'false'); }
function selectApplicant(a) {
  currentApplicant = a.id;
  $('#appSearch').value = a.name; closeList();
  state = { applicant: a.alt ? `${a.name} (${a.alt})` : a.name, answers: a.answers.map(x => ({ ...x })), baseline: '', example: false };
  $('#applicant').value = state.applicant; $('#baseline').value = '';
  renderAnswers(); run();
}

$('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
const dz = $('#dropzone');
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('is-over'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('is-over'); }));
dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) importFile(f); });
$('#changeFile').addEventListener('click', () => {
  applicants = []; currentApplicant = null; closeList();
  $('#picker').hidden = true; $('#dropzone').hidden = false; $('#fileInput').click();
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
  none: ['No input', 'Paste answers']
};
const WHY = {
  base: 'Compares vocabulary, dashes and habits like lowercase i with how they write in Discord. A sudden jump in vocabulary is hard to fake.',
  vocab: 'Words chatbots overuse. Casual writers rarely pass 1 per 100 words.',
  md: "Google Forms doesn't render ** or #, so they usually come from a pasted chatbot reply.",
  phrase: 'Stock lines like “valuable asset” and “commitment to excellence”.',
  rhythm: 'People mix short and long sentences (40%+ variation). AI tends to keep them even.',
  specific: 'Names, numbers, dates and division terms. Generic answers that could fit any group are typical of AI.',
  dash: 'A common ChatGPT habit. Some phones insert them too, so check their Discord.',
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
  $('#exampleChip').hidden = !state.example;
  const terms = ($('#terms').value || '').split(',').map(s => s.trim()).filter(Boolean);
  const filled = state.answers.map((x, i) => ({ ...x, i })).filter(x => x.a.trim());
  const all = filled.map(x => x.a).join('\n\n');
  const baseProf = profile(state.baseline || '');
  const hasBase = baseProf.words >= 40;
  const warnings = [];

  if (!filled.length) {
    const [t, s] = BANDS.none;
    $('#stamp').className = 'stamp band-none'; $('#stamp').innerHTML = `${t}<small>${s}</small>`;
    $('#summary').textContent = "Add an applicant's answers to begin."; $('#needle').style.left = '0%'; $('#indexLine').textContent = '';
    ['#signals', '#baseTable', '#per', '#marked', '#followups', '#warnings'].forEach(id => { $(id).innerHTML = ''; });
    $('#baseSec').hidden = true; $('#perSec').hidden = true; lastReport = ''; announce('No answers to screen.');
    return;
  }

  const res = analyze(all, { base: hasBase ? baseProf : null, terms });
  const perRes = filled.map(x => ({ ...x, r: analyze(x.a, { terms }) }));

  if (res.W < 80) warnings.push(['Short answers.', 'Under 80 words, so treat the result as weak.']);
  if (!hasBase) warnings.push(state.baseline.trim()
    ? ['Not enough Discord messages.', `${baseProf.words} words so far; the comparison needs 40.`]
    : ['No Discord messages.', 'Add some in step 4 for the most reliable check.']);
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

  // Discord comparison table
  $('#baseSec').hidden = !hasBase;
  if (hasBase && res.cmp) {
    $('#baseTable').innerHTML = '<thead><tr><th scope="col">Habit</th><th scope="col">Discord</th><th scope="col">Form</th><th scope="col">Gap</th></tr></thead><tbody>' +
      res.cmp.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.b)}</td><td class="num">${esc(r.a)}</td><td>${r.flag ? '<span class="flag y">Different</span>' : '<span class="flag n">Similar</span>'}</td></tr>`).join('') + '</tbody>';
  }

  // Per answer: number and band word as well as bar color
  $('#perSec').hidden = perRes.length < 2;
  $('#per').innerHTML = perRes.map(x => {
    const b = bandOf(x.r.index);
    const col = b === 'high' ? 'var(--color-bad)' : b === 'mid' ? 'var(--color-warn)' : 'var(--color-ok)';
    return `<div class="per-row"><span class="q" title="${esc(x.q)}">Q${x.i + 1}${x.q ? ' · ' + esc(x.q) : ''}</span><div class="bar" aria-hidden="true"><b style="width:${Math.max(3, x.r.index)}%;background:${col}"></b></div><span class="n">${x.r.index} · ${BAND_SHORT[b]}</span></div>`;
  }).join('');

  // Marked text
  $('#marked').innerHTML = perRes.map(x => `<div class="marked-item"><span class="mq">Q${x.i + 1}${x.q ? ' · ' + esc(x.q) : ''}</span>${markText(x.a, x.r.spans)}</div>`).join('');

  // Follow-up questions
  const fu = [];
  const words = [...res.strongWords.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const mild = [...res.mildWords.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const pick = (words.length ? words : mild).slice(0, 2);
  if (pick.length) fu.push(`You wrote “${pick.join('” and “')}”. Without looking it up, what ${pick.length > 1 ? 'do those words' : 'does that word'} mean, and why did you choose ${pick.length > 1 ? 'them' : 'it'}?`);
  let best = null;
  for (const x of perRes) for (const sent of sentencesOf(x.a)) {
    const sc = findSpans(sent).reduce((tot, sp) => tot + ({ v: 1, m: 0.5, p: 1.5, d: 1 })[sp.c], 0);
    if (sc >= 2 && (!best || sc > best.sc)) best = { s: sent, sc };
  }
  if (best) fu.push(`Put this in your own words, out loud: “${best.s.length > 220 ? best.s.slice(0, 217) + '…' : best.s}”`);
  for (const x of perRes) {
    const sp = x.r.sig.find(z => z.id === 'specific');
    if (sp && sp.strength >= 0.6 && fu.length < 5) fu.push(`About ${x.q ? `“${x.q}”` : `answer ${x.i + 1}`}: give a real example. Which group or event was it, who was involved, and roughly when?`);
  }
  fu.push('Answer this in the ticket within 5 minutes: “Describe the last training or patrol you attended and one thing you would change about it.” Then paste the reply into step 4.');
  fu.push('How long did the application take you, and where did you write it?');
  $('#followups').innerHTML = fu.map(q => `<li>${esc(q)}</li>`).join('');

  // Report text for Discord
  const name = state.applicant.trim() || 'Unnamed applicant';
  const division = ($('#division').value || '').trim();
  lastReport = [
    `**AI screening: ${name}**${division ? ` · ${division}` : ''}`,
    `Result: ${t} (index ${res.index}/100, ${res.strongCount} strong signals, ${res.W} words)${hasBase ? '' : ' · no Discord sample'}`,
    ...res.sig.filter(x => x.strength >= 0.25).sort((a, b) => b.weight * b.strength - a.weight * a.strength).map(x => `- ${x.name}: ${x.detail}`),
    perRes.length > 1 ? `Per answer: ${perRes.map(x => `Q${x.i + 1} ${x.r.index}`).join(', ')}` : '',
    band !== 'low' ? `Follow-up questions:\n${fu.slice(0, 4).map((q, i) => `${i + 1}. ${q}`).join('\n')}` : '',
    '_Screening result only. Final decision depends on the follow-up._'
  ].filter(Boolean).join('\n');
}

$('#copyReport').addEventListener('click', () => {
  const fb = $('#copyFallback'), toast = $('#toast');
  if (!lastReport) { toast.textContent = 'Nothing to copy yet. Paste some answers first.'; return; }
  const fallback = () => { fb.hidden = false; fb.value = lastReport; fb.focus(); fb.select(); toast.textContent = 'Copying was blocked. The report is selected below; press Ctrl+C.'; };
  try {
    navigator.clipboard.writeText(lastReport).then(() => {
      fb.hidden = true; toast.textContent = 'Report copied. Paste it into your staff channel.';
      setTimeout(() => { toast.textContent = ''; }, 3500);
    }, fallback);
  } catch (e) { fallback(); }
});

load(EX_AI);
})();
