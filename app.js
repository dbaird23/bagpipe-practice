// Bagpipe note drill — flashcards with metronome, mic pitch detection,
// a guided mic-setup dialog, a scored listening round, and scale/pattern drills.
(() => {
  "use strict";

  // semis = semitones above the chanter's Low A, so pitch detection works at any
  // chanter pitch by calibrating the Low A reference frequency.
  const NOTES = [
    { name: "Low G", hint: "2nd line", y: 56, ledger: false, semis: -2 },
    { name: "Low A", hint: "2nd space", y: 50, ledger: false, semis: 0 },
    { name: "B", hint: "middle line", y: 44, ledger: false, semis: 2 },
    { name: "C", hint: "3rd space · sounds C♯", y: 38, ledger: false, semis: 4 },
    { name: "D", hint: "4th line", y: 32, ledger: false, semis: 5 },
    { name: "E", hint: "4th space", y: 26, ledger: false, semis: 7 },
    { name: "F", hint: "top line · sounds F♯", y: 20, ledger: false, semis: 9 },
    { name: "High G", hint: "above the staff", y: 14, ledger: false, semis: 10 },
    { name: "High A", hint: "ledger line above", y: 8, ledger: true, semis: 12 }
  ];

  // Pattern sequences, written as letters: G low G, A low A, B C D E F,
  // H high G, I high A.
  const LET = { G: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, H: 7, I: 8 };
  const seqOf = (str) => str.split("").filter((c) => c in LET).map((c) => LET[c]);

  const PATTERNS = [
    { id: "scale", group: "Scales", label: "Full scale", name: "Full scale, up and down", seq: "GABCDEFHI HFEDCBAG" },
    { id: "lowhand", group: "Scales", label: "Low hand", name: "Low hand only", seq: "GABCD CBAG" },
    { id: "highhand", group: "Scales", label: "High hand", name: "High hand only", seq: "DEFHI HFED" },
    { id: "cross-bc", group: "Crossing pairs", label: "B–C", name: "B to C, back and forth", seq: "BCBCBC" },
    { id: "cross-cd", group: "Crossing pairs", label: "C–D", name: "C to D, back and forth", seq: "CDCDCD" },
    { id: "cross-de", group: "Crossing pairs", label: "D–E", name: "D to E, back and forth", seq: "DEDEDE" },
    { id: "cross-ef", group: "Crossing pairs", label: "E–F", name: "E to F, back and forth", seq: "EFEFEF" },
    { id: "cross-fg", group: "Crossing pairs", label: "F–High G", name: "F to High G, back and forth", seq: "FHFHFH" },
    { id: "cross-all", group: "Crossing pairs", label: "Every pair", name: "Every crossing, in order", seq: "BCB CDC DED EFE FHF" },
    { id: "thirds", group: "Patterns", label: "Thirds", name: "Thirds, up and down", seq: "GB AC BD CE DF EH FI IF HE FD EC DB CA BG" },
    { id: "fours", group: "Patterns", label: "Scale in fours", name: "Scale in fours", seq: "GABC ABCD BCDE CDEF DEFH EFHI" },
    { id: "arps", group: "Patterns", label: "Jumps", name: "Wide jumps", seq: "ACEI ECA" },
    // Single gracenotes. A gracenote can only be played on a note below its own
    // pitch, which is what limits how far up each of these runs:
    // High G gracenote up to F, E gracenote up to D, D gracenote up to C.
    { id: "grace-g", group: "Gracenotes", label: "G gracenote", name: "High G gracenote on every note", seq: "GABCDEF FEDCBAG", grace: "H" },
    { id: "grace-d", group: "Gracenotes", label: "D gracenote", name: "D gracenote on every note", seq: "GABC CBAG", grace: "D" },
    { id: "grace-e", group: "Gracenotes", label: "E gracenote", name: "E gracenote on every note", seq: "GABCD DCBAG", grace: "E" },
    { id: "custom", group: "Your own", label: "Custom", name: "Custom pattern", seq: "" }
  ];

  // ── Embellishments ──
  // Each movement is written as the short sounds that lead into the melody
  // note, drawn as one beamed group of gracenotes, then the melody note itself.
  // Steps follow the Piper's Dojo embellishment guide.
  const NI = { LG: 0, LA: 1, B: 2, C: 3, D: 4, E: 5, F: 6, HG: 7, HA: 8 };

  // Every note is offered here. Low A and B are not gracenotes in their own
  // right, but movements need them inside a group — the birl sounds Low A
  // between its two Low G strikes, and a doubling repeats its own note.
  const GRACE_CHOICES = NOTES.map((n, i) => i);

  const plain = (x) => ({ n: x, g: [] });
  // High G gracenote to X, then D gracenote on X — or the next note up once X
  // has reached D, since the second gracenote must sit above the note.
  const doubling = (x) => ({ n: x, g: [NI.HG, x, x < NI.D ? NI.D : x + 1], move: "doubling" });
  // Low G, D gracenote on Low G, then the note
  const grip = (x) => ({ n: x, g: [NI.LG, NI.D, NI.LG], move: "grip" });
  // a grip with an E gracenote onto the note, so the note must be below E
  const taorluath = (x) => ({ n: x, g: [NI.LG, NI.D, NI.LG, NI.E], move: "taorluath" });
  // light D throw: Low G, D gracenote to C, then D
  const dThrow = () => ({ n: NI.D, g: [NI.LG, NI.D, NI.C], move: "D throw" });
  // Low A birl: Low A with two Low G strikes
  const birl = () => ({ n: NI.LA, g: [NI.LG, NI.LA, NI.LG], move: "birl" });

  PATTERNS.splice(PATTERNS.length - 1, 0,
    { id: "emb-doubling", group: "Embellishments", label: "Doublings", name: "Doublings, Low G up to F",
      steps: [NI.LG, NI.LA, NI.B, NI.C, NI.D, NI.E, NI.F].map(doubling) },
    { id: "emb-grip", group: "Embellishments", label: "Grips", name: "Grip to each note",
      steps: [NI.LA, NI.B, NI.C, NI.D, NI.E].map(grip) },
    { id: "emb-taorluath", group: "Embellishments", label: "Taorluath", name: "Taorluath to each note",
      steps: [NI.LG, NI.LA, NI.B, NI.C, NI.D].map(taorluath) },
    { id: "emb-throw", group: "Embellishments", label: "D throw", name: "Light D throw",
      steps: [plain(NI.LG), dThrow(), plain(NI.LA), dThrow(), plain(NI.B), dThrow()] },
    { id: "emb-birl", group: "Embellishments", label: "Birl", name: "Birl on Low A",
      steps: [plain(NI.B), birl(), plain(NI.B), birl(), plain(NI.C), birl()] }
  );

  // Scanned chanter fingering charts, one per note.
  const FINGERING_SRC = {
    "Low G": "fingerings/low-g.png",
    "Low A": "fingerings/low-a.png",
    "B": "fingerings/b.png",
    "C": "fingerings/c.png",
    "D": "fingerings/d.png",
    "E": "fingerings/e.png",
    "F": "fingerings/f.png",
    "High G": "fingerings/high-g.png",
    "High A": "fingerings/high-a.png"
  };

  const GAME_LENGTH = 20;
  // Beats of metronome before an on-the-beat pattern run starts, so there is
  // time to get the chanter up and the tempo in your head.
  const COUNT_IN_BEATS = 4;
  // Half the 2048-sample analysis window: a note is already part-way through
  // that window by the time the detector can name it, so onsets are back-dated
  // by this much before being timed against the beat.
  const ONSET_LAG_MS = 25;
  // How far off the beat still counts as "on it" — a share of the beat, with a
  // floor so fast tempos stay playable.
  const TIMING_TOLERANCE = 0.18;
  const TIMING_TOLERANCE_MIN_MS = 90;
  // How far ahead of its own beat the next note can sound and still be counted
  // as that note arriving early rather than a stray note.
  const EARLY_CAPTURE = 0.5;
  const HISTORY_MAX = 12;
  const HISTORY_KEY = "bagpipe-drill-history";
  const SAVED_KEY = "bagpipe-drill-saved";
  const SAVED_PREFIX = "saved:";
  const REF_KEY = "bagpipe-drill-ref-a";
  // Low A of a practice chanter, which sounds about an octave below a pipe
  // chanter (~470-480 Hz). Whatever you set is remembered from then on.
  const DEFAULT_REF_HZ = 235;
  const REF_MIN = 200;
  const REF_MAX = 1000;

  function loadRef() {
    try {
      const v = parseFloat(localStorage.getItem(REF_KEY));
      return Number.isFinite(v) && v >= REF_MIN && v <= REF_MAX ? Math.round(v) : DEFAULT_REF_HZ;
    } catch (err) { return DEFAULT_REF_HZ; }
  }

  function saveRef() {
    try { localStorage.setItem(REF_KEY, String(state.refA)); } catch (err) { /* storage unavailable */ }
  }

  const validNote = (n) => Number.isInteger(n) && n >= 0 && n < NOTES.length;

  // Steps are stored as {n, g}. Patterns saved before gracenotes existed are
  // plain note numbers, so those are accepted and lifted into the new shape.
  function normSteps(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    arr.forEach((e) => {
      if (validNote(e)) { out.push({ n: e, g: [] }); return; }
      if (!e || !validNote(e.n)) return;
      const g = Array.isArray(e.g) ? e.g.filter(validNote) : [];
      out.push({ n: e.n, g: g });
    });
    return out;
  }

  const cloneSteps = (arr) => arr.map((st) => ({ n: st.n, g: st.g.slice() }));

  function loadSaved() {
    try {
      const arr = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
      if (!Array.isArray(arr)) return [];
      // keep only well-formed entries — a corrupt store shouldn't break the app
      return arr
        .filter((s) => s && typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.seq))
        .map((s) => ({ id: s.id, name: s.name, seq: normSteps(s.seq) }));
    } catch (err) { return []; }
  }

  function saveSaved() {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved)); } catch (err) { /* storage unavailable */ }
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function loadHistory() {
    try {
      const arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(arr) ? arr.slice(0, HISTORY_MAX) : [];
    } catch (err) { return []; }
  }

  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch (err) { /* storage unavailable */ }
  }
  // Pitch analysis runs on a timer rather than requestAnimationFrame: it is
  // audio work, not drawing, and it must keep running when the window is
  // hidden or backgrounded (where rAF stops firing entirely).
  const POLL_MS = 16;

  // ACF2+ autocorrelation pitch detection.
  function detectPitch(buf, sampleRate) {
    const size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.012) return -1;

    const thres = 0.2;
    let r1 = 0, r2 = size - 1;
    for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }
    const b = buf.slice(r1, r2);
    const n = b.length;
    const c = new Float32Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) c[i] += b[j] * b[j + i];

    let d = 0;
    while (d < n - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < n; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    let T0 = maxpos;
    if (T0 <= 0) return -1;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1] || 0;
    const a = (x1 + x3 - 2 * x2) / 2;
    const bb = (x3 - x1) / 2;
    if (a) T0 = T0 - bb / (2 * a);
    const f = sampleRate / T0;
    return f > 150 && f < 1400 ? f : -1;
  }

  function shuffled(prevLast) {
    const a = NOTES.map((n, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    if (a[0] === prevLast && a.length > 1) { const t = a[0]; a[0] = a[1]; a[1] = t; }
    return a;
  }

  const state = {
    order: shuffled(-1),
    idx: 0,
    flipped: false,
    playing: false,
    bpm: 60,
    beatsPerCard: 4,
    sound: true,
    autoFlip: true,
    beat: 0,
    listening: false,
    refA: DEFAULT_REF_HZ,
    micError: "",
    heard: null,
    cents: 0,
    judged: null,
    mode: "practice",
    gameOrder: [],
    gameIdx: 0,
    score: 0,
    results: [],
    cardResult: null,
    dialogStep: 0,
    level: 0,
    calHz: 0,
    checkIdx: 0,
    view: "cards",
    cardFace: "staff",
    patternId: "scale",
    custom: [],
    pIdx: 0,
    pStates: [],
    pCross: [],
    pOffset: [],
    pPlaying: false,
    demoing: false,
    demoIdx: -1,
    countIn: 0,
    loop: true,
    runDone: false,
    streak: 0,
    lastRun: null,
    history: [],
    saved: []
  };
  state.history = loadHistory();
  state.saved = loadSaved();
  state.refA = loadRef();

  let ac = null;
  let timer = null;
  let pTimer = null;
  let swapTimer = null;
  let wrongTimer = null;
  let runTimer = null;
  let raf = null;
  let stream = null;
  let analyser = null;
  let buf = null;
  let stableName = null;
  let stableCount = 0;
  let stableSince = 0;
  let beatAt = 0;        // when the current note's beat landed
  let pendingEarly = null; // next note's pitch, heard before its beat

  // While the mic is on, render() runs many times a second. Rewriting a
  // container's innerHTML replaces its child nodes, and a button destroyed
  // between mousedown and mouseup never fires a click — so each block is only
  // rebuilt when the content it depends on has actually changed.
  // Pattern names are typed by the user and end up inside innerHTML.
  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  const htmlCache = {};
  function setHtml(node, key, sig, build) {
    if (htmlCache[key] === sig) return;
    htmlCache[key] = sig;
    node.innerHTML = build();
  }
  let judgeLock = false;
  let scored = false;
  let calBuf = [];
  let frame = 0;
  const SWIPE_MIN = 45;   // px of sideways travel before it counts as a swipe
  let touchX = 0;
  let touchY = 0;
  let swipedAt = 0;   // when the last swipe finished
  let demoOsc = null;
  let demoGain = null;
  let demoTimers = [];
  let demoSchedTimer = null;
  let demoRestartTimer = null;
  let demoStart = 0;    // audio-clock time the first pass began
  let demoNextAt = 0;   // audio-clock time the next pass should begin
  let demoBeat = 1;     // seconds a note lasts, fixed for the session
  let demoCycles = 0;
  let deleteArmed = false;
  let deleteTimer = null;
  let hintTimer = null;
  let saveHint = "";

  const el = (id) => document.getElementById(id);
  const all = (sel) => Array.from(document.querySelectorAll(sel));
  const dom = {
    heading: el("heading"),
    counter: el("counter"),
    tabCards: el("tabCards"),
    tabPatterns: el("tabPatterns"),
    cardsView: el("cardsView"),
    patternsView: el("patternsView"),
    card: el("card"),
    cardInner: el("cardInner"),
    cardFront: el("cardFront"),
    staffSvg: el("staffSvg"),
    chanterImg: el("chanterImg"),
    tabFaceStaff: el("tabFaceStaff"),
    tabFaceFinger: el("tabFaceFinger"),
    ledgerLine: el("ledgerLine"),
    noteHead: el("noteHead"),
    noteStem: el("noteStem"),
    noteName: el("noteName"),
    noteHint: el("noteHint"),
    btnPrev: el("btnPrev"),
    btnPlay: el("btnPlay"),
    btnNext: el("btnNext"),
    btnGame: el("btnGame"),
    beatsSelect: el("beatsSelect"),
    btnAutoFlip: el("btnAutoFlip"),
    beatDots: el("beatDots"),
    patternGroups: el("patternGroups"),
    patternName: el("patternName"),
    patternMeta: el("patternMeta"),
    streakVal: el("streakVal"),
    customBuilder: el("customBuilder"),
    customNotes: el("customNotes"),
    customGraces: el("customGraces"),
    graceBuildHint: el("graceBuildHint"),
    btnCustomUndo: el("btnCustomUndo"),
    btnCustomClear: el("btnCustomClear"),
    customName: el("customName"),
    btnCustomSave: el("btnCustomSave"),
    saveHint: el("saveHint"),
    savedBar: el("savedBar"),
    savedName: el("savedName"),
    savedHint: el("savedHint"),
    btnSavedEdit: el("btnSavedEdit"),
    btnSavedDelete: el("btnSavedDelete"),
    staffRows: el("staffRows"),
    statusLine: el("statusLine"),
    patternHint: el("patternHint"),
    btnPatternPlay: el("btnPatternPlay"),
    btnPatternReset: el("btnPatternReset"),
    btnHear: el("btnHear"),
    btnLoop: el("btnLoop"),
    legend: el("legend"),
    historyPanel: el("historyPanel"),
    historyRows: el("historyRows"),
    btnClearHistory: el("btnClearHistory"),
    patternTempo: el("patternTempo"),
    resultOverlay: el("resultOverlay"),
    resultTempo: el("resultTempo"),
    scoreVal: el("scoreVal"),
    resultLine: el("resultLine"),
    resultChips: el("resultChips"),
    missedLine: el("missedLine"),
    btnExitGame: el("btnExitGame"),
    btnPlayAgain: el("btnPlayAgain"),
    dialogOverlay: el("dialogOverlay"),
    dialogTitle: el("dialogTitle"),
    dialogStepLabel: el("dialogStepLabel"),
    dialogBody: el("dialogBody"),
    levelFill: el("levelFill"),
    levelLabel: el("levelLabel"),
    tunePanel: el("tunePanel"),
    calLabel: el("calLabel"),
    dialogRefA: el("dialogRefA"),
    scaleGrid: el("scaleGrid"),
    btnDialogCancel: el("btnDialogCancel"),
    btnDialogSkip: el("btnDialogSkip"),
    btnDialogNext: el("btnDialogNext"),
    // shared across both views
    bpmSliders: all(".js-bpm"),
    bpmVals: all(".js-bpm-val"),
    bpmUps: all(".js-bpm-up"),
    bpmDowns: all(".js-bpm-down"),
    soundBtns: all(".js-sound"),
    listenBtns: all(".js-listen"),
    heardLabels: all(".js-heard"),
    centsMarkers: all(".js-cents-marker"),
    centsLabels: all(".js-cents-label"),
    refInputs: all(".js-ref"),
    refUps: all(".js-ref-up"),
    refDowns: all(".js-ref-down")
  };

  function savedById(id) {
    return state.saved.find((s) => s.id === id) || null;
  }

  // The selected pattern is either a built-in, the scratch "custom" builder, or
  // one of the user's saved patterns (id "saved:<id>").
  function currentSaved() {
    if (state.patternId.indexOf(SAVED_PREFIX) !== 0) return null;
    return savedById(state.patternId.slice(SAVED_PREFIX.length));
  }

  function currentPattern() {
    const s = currentSaved();
    if (s) return { id: state.patternId, group: "Saved", label: s.name, name: s.name, seq: "", isSaved: true };
    return PATTERNS.find((x) => x.id === state.patternId) || PATTERNS[0];
  }

  // Every pattern resolves to a list of steps: a melody note plus the
  // gracenotes that lead into it (empty for a plain note).
  function steps() {
    const s = currentSaved();
    if (s) return s.seq;
    const p = currentPattern();
    if (p.id === "custom") return state.custom;
    if (p.steps) return p.steps;
    const notes = seqOf(p.seq);
    if (!p.grace) return notes.map(plain);
    const g = LET[p.grace];
    // a gracenote can only be played on a note below its own pitch
    return notes.map((n) => ({ n: n, g: g !== undefined && g > n ? [g] : [] }));
  }

  function seq() { return steps().map((st) => st.n); }

  function gracesAt(i) {
    const st = steps()[i];
    return st && st.g ? st.g : [];
  }

  function maxGraceLen() {
    return steps().reduce((m, st) => Math.max(m, st.g ? st.g.length : 0), 0);
  }

  function audio() {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return ac;
  }

  // Concert pitch of a note, relative to the chanter's calibrated Low A, so
  // playback is in tune with the instrument in your hands.
  function noteHz(i) {
    return state.refA * Math.pow(2, NOTES[i].semis / 12);
  }

  const DEMO_LOOKAHEAD = 1.2;  // seconds of audio scheduled in advance
  const DEMO_GAIN = 0.16;

  // Lay one pass of the pattern onto the running oscillator, starting at the
  // given audio-clock time. Gracenotes take their time from the front of the
  // note, so the beat lands on the first sound of a movement.
  function scheduleCycle(startAt, sq, beat) {
    sq.forEach((st, i) => {
      const graces = st.g || [];
      const gd = Math.min(0.038, beat / (graces.length + 2));
      let at = startAt + i * beat;
      graces.forEach((gi) => {
        demoOsc.frequency.setValueAtTime(noteHz(gi), at);
        at += gd;
      });
      demoOsc.frequency.setValueAtTime(noteHz(st.n), at);
    });
  }

  // Runs every frame or so: keeps the staff highlight in step with the audio
  // clock, and tops up the schedule so a loop never gaps at the seam.
  function demoTick() {
    if (!state.demoing || !demoOsc) return;
    const sq = steps();
    if (!sq.length) { stopDemo(); return; }
    const total = sq.length * demoBeat;

    const elapsed = ac.currentTime - demoStart;
    if (elapsed >= 0) {
      const idx = Math.min(sq.length - 1, Math.floor((elapsed % total) / demoBeat));
      if (idx !== state.demoIdx) { state.demoIdx = idx; render(); }
    }

    while (demoNextAt < ac.currentTime + DEMO_LOOKAHEAD) {
      // Loop off, or switched off mid-pass: ride out the pass already scheduled.
      if (demoCycles > 0 && !state.loop) { finishDemoAt(demoNextAt); return; }
      scheduleCycle(demoNextAt, sq, demoBeat);
      demoNextAt += total;
      demoCycles++;
    }
  }

  function finishDemoAt(t) {
    if (demoSchedTimer) { clearInterval(demoSchedTimer); demoSchedTimer = null; }
    try {
      demoGain.gain.setValueAtTime(DEMO_GAIN, Math.max(ac.currentTime, t - 0.05));
      demoGain.gain.exponentialRampToValueAtTime(0.0001, t);
      demoOsc.stop(t + 0.05);
    } catch (err) { /* already stopping */ }
    demoTimers.push(setTimeout(stopDemo, (t - ac.currentTime) * 1000 + 120));
  }

  // Play the selected pattern back. A chanter never stops sounding, so this is
  // one continuous reed tone whose pitch steps at each note — which is also
  // exactly how gracenotes work: brief flicks to another pitch and back. One
  // oscillator runs for the whole session so a loop has no seam to hear.
  function playDemo() {
    const sq = steps();
    if (!sq.length) return;
    stopDemo();
    stopPatternClock();
    state.pPlaying = false;

    let ctx;
    try { ctx = audio(); } catch (err) { return; }

    demoBeat = 60 / state.bpm;
    demoStart = ctx.currentTime + 0.12;
    demoNextAt = demoStart;
    demoCycles = 0;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";                 // a double reed is rich in harmonics
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3400;
    lp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    osc.connect(lp); lp.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, demoStart);
    g.gain.exponentialRampToValueAtTime(DEMO_GAIN, demoStart + 0.035);
    osc.start(demoStart);

    demoOsc = osc;
    demoGain = g;
    state.demoing = true;
    state.demoIdx = -1;

    demoTick();                                   // schedule the first pass now
    demoSchedTimer = setInterval(demoTick, 60);
    render();
  }

  function stopDemo() {
    if (demoSchedTimer) { clearInterval(demoSchedTimer); demoSchedTimer = null; }
    clearTimeout(demoRestartTimer);
    demoTimers.forEach(clearTimeout);
    demoTimers = [];
    if (demoOsc) {
      try {
        const now = ac.currentTime;
        demoGain.gain.cancelScheduledValues(now);
        demoGain.gain.setValueAtTime(Math.max(0.0001, demoGain.gain.value), now);
        demoGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
        demoOsc.stop(now + 0.06);
      } catch (err) { /* already stopped */ }
      demoOsc = null;
      demoGain = null;
    }
    if (state.demoing || state.demoIdx >= 0) {
      state.demoing = false;
      state.demoIdx = -1;
      render();
    }
  }

  function tick(accent) {
    if (!state.sound) return;
    try {
      ac = audio();
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = accent ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.12, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + 0.09);
    } catch (err) { /* audio unavailable */ }
  }

  // ── views ──

  function setView(view) {
    stopDemo();
    stopClock();
    stopPatternClock();
    state.view = view;
    state.playing = false;
    state.beat = 0;
    state.pPlaying = false;
    state.mode = "practice";
    if (view === "patterns") resetRun();
    else render();
  }

  function pickPattern(id) {
    stopDemo();
    stopPatternClock();
    state.patternId = id;
    state.pPlaying = false;
    deleteArmed = false;
    saveHint = "";
    resetRun();
  }

  // Save the scratch pattern under a name. Re-using an existing name updates
  // that pattern rather than making a duplicate.
  function saveCustom() {
    const name = dom.customName.value.trim();
    if (!name || !state.custom.length) return;
    const existing = state.saved.find((s) => s.name.toLowerCase() === name.toLowerCase());
    let id;
    if (existing) {
      existing.seq = cloneSteps(state.custom);
      existing.name = name;
      id = existing.id;
      saveHint = "Updated";
    } else {
      id = newId();
      state.saved = [{ id: id, name: name, seq: cloneSteps(state.custom) }].concat(state.saved);
      saveHint = "Saved";
    }
    saveSaved();
    const hint = saveHint;
    pickPattern(SAVED_PREFIX + id);   // clears any previous hint
    saveHint = hint;
    render();
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { saveHint = ""; render(); }, 2000);
  }

  function editSaved() {
    const s = currentSaved();
    if (!s) return;
    state.custom = cloneSteps(s.seq);
    dom.customName.value = s.name;
    pickPattern("custom");
  }

  function addCustomNote(i) {
    state.custom = state.custom.concat([{ n: i, g: [] }]);
    resetRun();
  }

  // Gracenotes attach to the note most recently placed, which is how they read
  // on the staff: they lead into it.
  function addCustomGrace(i) {
    if (!state.custom.length) return;
    const out = cloneSteps(state.custom);
    out[out.length - 1].g.push(i);
    state.custom = out;
    resetRun();
  }

  // Undo reverses the last tap, whether that was a gracenote or a note.
  function undoCustom() {
    if (!state.custom.length) return;
    const out = cloneSteps(state.custom);
    const last = out[out.length - 1];
    if (last.g.length) last.g.pop();
    else out.pop();
    state.custom = out;
    resetRun();
  }

  function deleteSaved() {
    const s = currentSaved();
    if (!s) return;
    // first click arms, second confirms — no dialog, no accidents
    if (!deleteArmed) {
      deleteArmed = true;
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => { deleteArmed = false; render(); }, 3500);
      render();
      return;
    }
    state.saved = state.saved.filter((x) => x.id !== s.id);
    saveSaved();
    deleteArmed = false;
    pickPattern("scale");
  }

  function resetRun() {
    clearTimeout(runTimer);
    const len = seq().length;
    stableName = null;
    stableCount = 0;
    pendingEarly = null;
    beatAt = 0;
    state.pIdx = 0;
    state.countIn = 0;
    state.runDone = false;
    state.pStates = new Array(len).fill("pending");
    state.pCross = new Array(len).fill(false);
    state.pOffset = new Array(len).fill(null);
    render();
  }

  function beatMs() { return 60000 / state.bpm; }

  function tolMs() {
    return Math.max(TIMING_TOLERANCE_MIN_MS, beatMs() * TIMING_TOLERANCE);
  }

  // offset in ms relative to the note's own beat: negative early, positive late
  function timingOf(offset) {
    if (offset < -tolMs()) return "early";
    if (offset > tolMs()) return "late";
    return "on";
  }

  // withCountIn: true when the user presses Play, false when the clock is
  // merely being rebuilt mid-run (a tempo change) and must not interrupt.
  function startPatternClock(withCountIn) {
    stopPatternClock();
    const step = () => {
      const s = seq();
      const states = state.pStates.slice();
      const i = state.pIdx;
      if (states[i] !== "done" && states[i] !== "dirty") states[i] = "missed";
      stableName = null;
      stableCount = 0;
      if (i + 1 >= s.length) {
        state.pStates = states;
        finishRun(states);
        return;
      }
      tick(false);
      state.pStates = states;
      state.pIdx = i + 1;
      beatAt = Date.now();
      // the next note was already sounding before its beat arrived
      if (pendingEarly !== null) {
        const offsets = state.pOffset.slice();
        offsets[i + 1] = pendingEarly - beatAt;
        state.pOffset = offsets;
        const st2 = state.pStates.slice();
        st2[i + 1] = "done";
        state.pStates = st2;
        pendingEarly = null;
      }
      render();
    };

    const total = withCountIn ? COUNT_IN_BEATS : 0;
    let n = 0;
    const onBeat = () => {
      n++;
      if (n <= total) {
        // counting in: click each beat, accenting the first
        tick(n === 1);
        state.countIn = total - n + 1;
        render();
        return;
      }
      if (n === total + 1) {
        // downbeat — note one starts here
        state.countIn = 0;
        beatAt = Date.now();
        tick(true);
        render();
        return;
      }
      step();
    };

    state.countIn = total;
    onBeat();
    pTimer = setInterval(onBeat, 60000 / state.bpm);
  }

  function stopPatternClock() {
    if (pTimer) { clearInterval(pTimer); pTimer = null; }
    state.countIn = 0;
  }

  function togglePattern() {
    if (state.pPlaying) {
      clearTimeout(runTimer);
      stopPatternClock();
      stopDemo();
      state.pPlaying = false;
      render();
    } else {
      state.pPlaying = true;
      resetRun();
      startPatternClock(true);
    }
  }

  function finishRun(states) {
    const st = states || state.pStates;
    const allHit = st.length > 0 && st.every((x) => x === "done");
    let early = 0, late = 0, on = 0;
    state.pOffset.forEach((o, i) => {
      if (o === null || st[i] === "missed") return;
      const t = timingOf(o);
      if (t === "early") early++;
      else if (t === "late") late++;
      else on++;
    });
    // a clean run also has to be in time
    const clean = allHit && early === 0 && late === 0;
    stopPatternClock();
    state.runDone = true;
    state.pPlaying = false;
    state.pStates = st;
    state.streak = clean ? state.streak + 1 : 0;
    state.lastRun = {
      clean,
      beat: true,   // kept so older free-tempo history still reads correctly
      on, early, late,
      strays: state.pCross.filter(Boolean).length,
      missed: st.filter((x) => x === "missed").length
    };

    const missed = state.lastRun.missed;
    state.history = [{
      pattern: currentPattern().name,
      bpm: state.bpm,
      beat: true,
      total: st.length,
      correct: st.length - missed,
      on: on,
      at: Date.now(),
      clean: clean
    }].concat(state.history).slice(0, HISTORY_MAX);
    saveHistory();
    render();
    clearTimeout(runTimer);
    // With loop off the finished run stays on screen so the marks can be read;
    // Restart (or Play) clears it.
    if (!state.loop) return;
    runTimer = setTimeout(() => {
      if (state.view !== "patterns" || !state.runDone) return;
      resetRun();
      state.pPlaying = true;
      startPatternClock(true);
      render();
    }, 2200);
  }

  function patternJudge(name) {
    const s = state;
    // the mic would otherwise hear the app's own playback and score it
    if (s.demoing) return;
    if (s.dialogStep || s.view !== "patterns" || s.runDone) return;
    if (!s.pPlaying) return;
    if (s.countIn > 0) return; // anything played during the count-in is ignored
    const sq = seq();
    if (!sq.length) return;
    const i = s.pIdx;
    const target = NOTES[sq[i]].name;
    const prev = i > 0 ? NOTES[sq[i - 1]].name : null;

    if (name === target) {
      const states = s.pStates.slice();
      states[i] = s.pCross[i] ? "dirty" : "done";
      // keep the first hit's timing — a sustained note shouldn't re-score
      if (s.pOffset[i] === null && beatAt) {
        const offsets = s.pOffset.slice();
        offsets[i] = stableSince - beatAt;
        s.pOffset = offsets;
      }
      s.pStates = states;
      render();
      return;
    }
    // A gracenote belongs to the note it decorates, so hearing it is correct
    // playing, not a stray. It may land in this note's window or in the tail of
    // the previous one, so both this step's and the next step's are allowed.
    const allowed = gracesAt(i).concat(gracesAt(i + 1));
    if (allowed.some((g) => NOTES[g].name === name)) return;

    // the next note, sounded just before its beat, is an early attack rather
    // than a stray — hold it and score it when that beat arrives
    if (beatAt && i + 1 < sq.length &&
        name === NOTES[sq[i + 1]].name) {
      // anything in the back half of this beat is the next note arriving early
      // rather than a stray; how early it was decides on/early below
      const untilNextBeat = beatAt + beatMs() - Date.now();
      if (untilNextBeat > 0 && untilNextBeat <= beatMs() * EARLY_CAPTURE) {
        if (pendingEarly === null) pendingEarly = stableSince;
        return;
      }
    }
    // a note that is neither the target nor the one we are leaving is a
    // crossing noise on the way into this target
    if (i > 0 && name !== prev) {
      const cross = s.pCross.slice();
      if (!cross[i]) {
        cross[i] = true;
        const states = s.pStates.slice();
        if (states[i] === "done") states[i] = "dirty";
        s.pCross = cross;
        s.pStates = states;
        render();
      }
    }
  }

  // ── flashcards ──

  async function startGame() {
    if (!state.listening) {
      await startListening();
      // mic denied — the Listen pill shows why; otherwise let the user finish
      // the mic check, then start the round.
      return;
    }
    const sq = [];
    while (sq.length < GAME_LENGTH) {
      const i = Math.floor(Math.random() * NOTES.length);
      if (sq.length && sq[sq.length - 1] === i) continue;
      sq.push(i);
    }
    scored = false;
    stopClock();
    state.mode = "game";
    state.gameOrder = sq;
    state.gameIdx = 0;
    state.score = 0;
    state.results = [];
    state.cardResult = null;
    state.flipped = false;
    state.playing = true;
    state.beat = 0;
    state.judged = null;
    render();
    startClock();
  }

  function endGame() {
    stopClock();
    state.mode = "result";
    state.playing = false;
    state.beat = 0;
    render();
  }

  function exitGame() {
    stopClock();
    state.mode = "practice";
    state.playing = false;
    state.beat = 0;
    state.cardResult = null;
    state.flipped = false;
    render();
  }

  function startClock() {
    stopClock();
    if (state.mode === "game") {
      const gameBeat = () => {
        const next = state.beat + 1;
        if (next > state.beatsPerCard) {
          state.results = state.results.concat([
            { name: NOTES[state.gameOrder[state.gameIdx]].name, hit: state.cardResult === "right" }
          ]);
          if (state.gameIdx + 1 >= state.gameOrder.length) {
            state.beat = 0;
            endGame();
            return;
          }
          tick(true);
          scored = false;
          stableName = null; stableCount = 0;
          state.beat = 1;
          state.gameIdx++;
          state.cardResult = null;
        } else {
          tick(next === 1);
          state.beat = next;
        }
        render();
      };
      timer = setInterval(gameBeat, 60000 / state.bpm);
      gameBeat();
      return;
    }
    const beat = () => {
      const next = state.beat + 1;
      // beats 1..N show the note; with auto-flip on, the beat after that
      // reveals the answer before we move on.
      const cycle = state.beatsPerCard + (state.autoFlip ? 1 : 0);
      if (next > cycle) {
        tick(true);
        swapCard(state.flipped);
        state.beat = 1;
        state.flipped = false;
      } else {
        tick(next === 1);
        state.beat = next;
        state.flipped = state.autoFlip ? next > state.beatsPerCard : state.flipped;
      }
      render();
    };
    timer = setInterval(beat, 60000 / state.bpm);
    beat();
  }

  function stopClock() { if (timer) { clearInterval(timer); timer = null; } }

  function toggle() {
    if (state.playing) {
      stopClock();
      state.playing = false;
      state.beat = 0;
      render();
    } else {
      state.playing = true;
      state.flipped = false;
      state.beat = 0;
      render();
      startClock();
    }
  }

  // When the card is showing its back, swap the note only once the card is
  // edge-on mid-flip, so the next note is never visible on the way round.
  function swapCard(wasFlipped, step) {
    const dir = step || 1;
    const go = () => {
      const i = state.idx + dir;
      if (i >= state.order.length) {
        state.idx = 0;
        state.order = shuffled(state.order[state.order.length - 1]);
      } else if (i < 0) {
        state.idx = state.order.length - 1;
      } else {
        state.idx = i;
      }
      render();
    };
    if (swapTimer) clearTimeout(swapTimer);
    if (wasFlipped) swapTimer = setTimeout(go, 210);
    else go();
  }

  function advance() {
    swapCard(state.flipped, 1);
    state.flipped = false;
    state.beat = state.playing ? 1 : 0;
    render();
  }

  function back() {
    swapCard(state.flipped, -1);
    state.flipped = false;
    render();
  }

  function flip() {
    state.flipped = !state.flipped;
    render();
  }

  // ── mic ──

  async function startListening() {
    state.micError = "";
    render();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") await ac.resume();
      const src = ac.createMediaStreamSource(stream);
      analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      stableName = null;
      stableCount = 0;
      calBuf = [];
      frame = 0;
      state.listening = true;
      state.micError = "";
      state.heard = null;
      state.judged = null;
      state.dialogStep = 1;
      state.level = 0;
      state.calHz = 0;
      state.checkIdx = 0;
      render();
      pollPitch();
    } catch (err) {
      state.micError = "Mic blocked";
      state.listening = false;
      render();
    }
  }

  function stopListening() {
    if (raf) clearTimeout(raf);
    raf = null;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    analyser = null;
    state.listening = false;
    state.heard = null;
    state.judged = null;
    state.cents = 0;
    state.dialogStep = 0;
    state.level = 0;
    render();
  }

  function pollPitch() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    const f = detectPitch(buf, ac.sampleRate);

    frame++;
    if (frame % 3 === 0) {
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const level = Math.min(1, rms * 9);
      state.level = level > state.level ? level : state.level * 0.82 + level * 0.18;
      render();
    }

    if (state.dialogStep === 2) {
      // Accept anything in the reference range so both pipe chanters (~476 Hz)
      // and octave-lower practice chanters (~235 Hz) calibrate.
      if (f > REF_MIN && f < REF_MAX) {
        calBuf.push(f);
        if (calBuf.length > 15) calBuf.shift();
        if (calBuf.length >= 6) {
          const sorted = calBuf.slice().sort((a, b) => a - b);
          state.calHz = Math.round(sorted[Math.floor(sorted.length / 2)]);
          render();
        }
      }
      raf = setTimeout(pollPitch, POLL_MS);
      return;
    }

    if (f > 0) {
      const semis = 12 * Math.log2(f / state.refA);
      let best = null, bestDiff = 99;
      NOTES.forEach((n) => {
        const d = Math.abs(semis - n.semis);
        if (d < bestDiff) { bestDiff = d; best = n; }
      });
      const cents = Math.round((semis - best.semis) * 100);
      if (Math.abs(cents) <= 50) {
        if (stableName === best.name) stableCount++;
        else {
          stableName = best.name;
          stableCount = 1;
          // Approximate onset: the pitch first matched one analysis window ago,
          // so back-date it by half that window to reduce the systematic lag.
          stableSince = Date.now() - ONSET_LAG_MS;
        }
        if (stableCount === 4) {
          if (state.dialogStep === 3) checkScale(best.name);
          else if (state.view === "patterns") patternJudge(best.name);
          else if (state.mode === "game") gameJudge(best.name);
          else if (!state.dialogStep) judge(best.name);
        }
        state.heard = best.name;
        state.cents = cents;
        render();
      } else {
        stableName = null; stableCount = 0;
      }
    } else if (state.heard) {
      stableName = null; stableCount = 0;
      state.heard = null;
      state.cents = 0;
      render();
    }
    raf = setTimeout(pollPitch, POLL_MS);
  }

  function checkScale(name) {
    const i = state.checkIdx;
    if (i >= NOTES.length) return;
    if (name === NOTES[i].name) {
      stableName = null; stableCount = 0;
      state.checkIdx = i + 1;
      state.judged = "right";
      render();
      clearTimeout(wrongTimer);
      wrongTimer = setTimeout(() => { state.judged = null; render(); }, 500);
    } else {
      state.judged = "wrong";
      render();
      clearTimeout(wrongTimer);
      wrongTimer = setTimeout(() => { state.judged = null; render(); }, 700);
    }
  }

  function gameJudge(name) {
    if (scored) return;
    const target = NOTES[state.gameOrder[state.gameIdx]];
    if (!target) return;
    if (name === target.name) {
      scored = true;
      state.score++;
      state.cardResult = "right";
    } else {
      state.cardResult = "wrong";
    }
    render();
  }

  function judge(name) {
    if (judgeLock) return;
    const target = NOTES[state.order[state.idx]];
    if (!target) return;
    if (name === target.name) {
      judgeLock = true;
      state.judged = "right";
      state.flipped = true;
      render();
      setTimeout(() => {
        judgeLock = false;
        stableName = null; stableCount = 0;
        state.judged = null;
        render();
        advance();
      }, 1000);
    } else {
      state.judged = "wrong";
      render();
      clearTimeout(wrongTimer);
      wrongTimer = setTimeout(() => { state.judged = null; render(); }, 700);
    }
  }

  // Wide range so the reference can sit at practice-chanter pitch (~235),
  // pipe-chanter pitch (~476), or concert A (440).
  function setRef(v) {
    if (!Number.isFinite(v)) { render(); return; }
    state.refA = Math.min(REF_MAX, Math.max(REF_MIN, Math.round(v)));
    saveRef();
    render();
  }

  function setBpm(v) {
    if (!Number.isFinite(v)) { render(); return; }
    state.bpm = Math.min(160, Math.max(30, Math.round(v)));
    render();
    if (state.playing) startClock();
    // Rebuilding the clock mid-run keeps the run going; if the tempo changed
    // during a count-in, count in again at the new tempo.
    if (state.pPlaying) startPatternClock(state.countIn > 0);
    // Playback runs at a fixed beat, so a tempo change restarts it. Debounced
    // so dragging the slider doesn't stutter.
    if (state.demoing) {
      clearTimeout(demoRestartTimer);
      demoRestartTimer = setTimeout(playDemo, 200);
    }
  }

  const roundBtn = "height: 44px; padding: 0 22px; border-radius: 999px; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap; cursor: pointer; border: 1px solid ";

  const DIALOG_TITLES = ["", "Is the mic hearing you?", "Tune to your chanter", "Play up the scale"];
  const DIALOG_BODIES = [
    "",
    "Play or blow into the chanter. The input meter should move when you make a sound. If it stays flat, check that the right microphone is selected and that nothing else is using it.",
    "Hold a steady Low A — the bottom hand covered, thumb down. Every other note is measured from this pitch, so it only has to be set once per chanter.",
    "Play each note in order, from Low G up to High A. Each one turns green when the app hears what it expects. If a note refuses to register, go back and re-tune the Low A."
  ];

  function tabStyle(on) {
    return on ? "background: #2a2120; color: #fff;" : "background: none; color: #a99891;";
  }

  // Hold the charts in memory so flipping between cards never shows a blank.
  Object.keys(FINGERING_SRC).forEach((k) => { new Image().src = FINGERING_SRC[k]; });

  const G_RX = 4.4, G_RY = 3.1, G_STEM_W = 1.15;
  const G_SPACING = 10;   // gap between gracenotes inside a beamed group
  const G_STEM_LEN = 25;  // shortest stem, measured from the highest head

  function graceHead(gx, gy, fill) {
    return '<ellipse cx="' + gx + '" cy="' + gy + '" rx="' + G_RX + '" ry="' + G_RY +
      '" transform="rotate(-22 ' + gx + " " + gy + ')" fill="' + fill + '"></ellipse>';
  }

  // A lone gracenote carries three flags, marking it as a thirty-second note.
  function graceSvg(gx, gy, fill) {
    const stemX = gx + G_RX * 0.7;
    const stemTop = gy - G_STEM_LEN;
    let s = graceHead(gx, gy, fill) +
      '<rect x="' + stemX + '" y="' + stemTop + '" width="' + G_STEM_W +
      '" height="' + (gy - stemTop) + '" fill="' + fill + '"></rect>';
    for (let k = 0; k < 3; k++) {
      const y0 = stemTop + k * 5.1;
      s += '<path d="M' + (stemX + G_STEM_W) + " " + y0 +
        " q 5.6 1.5 6.2 6.1 q -2.4 -3.2 -6.2 -3.0 z\" fill=\"" + fill + '"></path>';
    }
    return s;
  }

  // Two or more gracenotes in a row are beamed together with three beams —
  // written exactly like a run of thirty-second notes.
  function graceGroupSvg(xRight, graces, fill) {
    const n = graces.length;
    if (n === 1) return graceSvg(xRight, NOTES[graces[0]].y, fill);
    const xs = graces.map((_, i) => xRight - (n - 1 - i) * G_SPACING);
    const ys = graces.map((g) => NOTES[g].y);
    const beamTop = Math.min.apply(null, ys) - G_STEM_LEN;
    const x0 = xs[0] + G_RX * 0.7;
    const x1 = xs[n - 1] + G_RX * 0.7 + G_STEM_W;
    let s = "";
    for (let b = 0; b < 3; b++) {
      s += '<rect x="' + x0 + '" y="' + (beamTop + b * 4.5) + '" width="' + (x1 - x0) +
        '" height="2" fill="' + fill + '"></rect>';
    }
    for (let i = 0; i < n; i++) {
      s += graceHead(xs[i], ys[i], fill) +
        '<rect x="' + (xs[i] + G_RX * 0.7) + '" y="' + beamTop + '" width="' + G_STEM_W +
        '" height="' + (ys[i] - beamTop) + '" fill="' + fill + '"></rect>';
    }
    return s;
  }

  function renderPatterns() {
    const s = state;
    const pat = currentPattern();
    const pseq = seq();

    // pattern picker groups, with the user's saved patterns appended
    const groups = [];
    PATTERNS.forEach((p) => {
      let g = groups.find((x) => x.label === p.group);
      if (!g) { g = { label: p.group, items: [] }; groups.push(g); }
      g.items.push({ id: p.id, label: p.label });
    });
    if (s.saved.length) {
      groups.push({
        label: "Saved",
        items: s.saved.map((v) => ({ id: SAVED_PREFIX + v.id, label: v.name }))
      });
    }
    // built once; selection is applied below by restyling the existing buttons
    // so the nodes stay clickable while the mic is re-rendering the page
    const pickerSig = s.saved.map((v) => v.id + ":" + v.name).join(",");
    setHtml(dom.patternGroups, "picker", pickerSig, () => groups.map((g) =>
      '<div class="pattern-group-row"><div class="pattern-group-label">' + esc(g.label) +
      '</div><div class="pattern-group-items">' +
      g.items.map((p) =>
        '<button class="pattern-pick" data-pattern="' + esc(p.id) + '">' + esc(p.label) + "</button>"
      ).join("") + "</div></div>"
    ).join(""));
    dom.patternGroups.querySelectorAll("[data-pattern]").forEach((b) => {
      b.style.cssText = b.dataset.pattern === s.patternId
        ? "border-color: #2a2120; background: #2a2120; color: #fff;" : "";
    });

    dom.patternName.textContent = pat.name;
    dom.patternMeta.textContent = pseq.length
      ? pseq.length + (pseq.length === 1 ? " note · " : " notes · ") +
        s.bpm + " bpm"
      : "empty";
    dom.streakVal.textContent = s.streak;
    dom.streakVal.style.color = s.streak ? "#7d9163" : "#cabbb4";

    dom.customBuilder.style.display = pat.id === "custom" ? "flex" : "none";
    setHtml(dom.customNotes, "customNotes", "built", () => NOTES.map((n, i) =>
      '<button class="custom-note-btn" data-add="' + i + '">' + n.name + "</button>"
    ).join(""));
    setHtml(dom.customGraces, "customGraces", "built", () => GRACE_CHOICES.map((i) =>
      '<button class="custom-note-btn" data-grace="' + i + '">' + NOTES[i].name + "</button>"
    ).join(""));

    if (pat.id === "custom") {
      const lastStep = state.custom[state.custom.length - 1];
      dom.customGraces.querySelectorAll("[data-grace]").forEach((b) => { b.disabled = !lastStep; });
      dom.graceBuildHint.textContent = !lastStep
        ? "Add a note first — gracenotes attach to the note before them."
        : lastStep.g.length
          ? "On " + NOTES[lastStep.n].name + ": " + lastStep.g.map((g) => NOTES[g].name).join(", ") +
            (lastStep.g.length > 1 ? " — beamed together." : ".")
          : "Adds to the last note (" + NOTES[lastStep.n].name +
            "). Two or more beam together automatically.";
    }

    if (pat.id === "custom") {
      const named = dom.customName.value.trim().length > 0;
      dom.btnCustomSave.disabled = !named || !pseq.length;
      dom.btnCustomSave.textContent =
        state.saved.some((v) => v.name.toLowerCase() === dom.customName.value.trim().toLowerCase())
          ? "Update" : "Save";
      dom.saveHint.textContent = saveHint;
    }

    const savedPat = currentSaved();
    dom.savedBar.style.display = savedPat ? "flex" : "none";
    if (savedPat) {
      dom.savedName.textContent = savedPat.name;
      dom.savedHint.textContent = saveHint;
      dom.btnSavedDelete.textContent = deleteArmed ? "Tap again to delete" : "Delete";
      dom.btnSavedDelete.style.color = deleteArmed ? "#a85a4e" : "";
      dom.btnSavedDelete.style.borderColor = deleteArmed ? "#e0bdb7" : "";
    }

    // staff rows — gracenotes sit to the left of their note, so the more of
    // them a pattern carries, the more room each note needs
    const maxG = maxGraceLen();
    const hasGrace = maxG > 0;
    const perRow = maxG > 1 ? 5 : maxG === 1 ? 8 : 9;
    const gap = maxG > 1 ? 82 : 57;
    const startX = maxG > 1 ? 108 : maxG === 1 ? 80 : 58;
    const staffSig = [
      s.patternId,
      // notes and their gracenotes, so edits in the builder redraw
      steps().map((st) => st.n + ":" + st.g.join("-")).join(","),
      s.pIdx, s.runDone, s.bpm, s.demoing, s.demoIdx,
      s.pStates.join(","), s.pCross.join(","), s.pOffset.join(",")
    ].join("|");
    const buildRows = () => {
    let rowsHtml = "";
    for (let r = 0; r < pseq.length; r += perRow) {
      const chunk = pseq.slice(r, r + perRow);
      let notesSvg = "";
      let labelsHtml = "";
      chunk.forEach((ni, k) => {
        const n = NOTES[ni];
        const abs = r + k;
        const st = s.pStates[abs] || "pending";
        const isNow = s.demoing ? abs === s.demoIdx : (abs === s.pIdx && !s.runDone);
        const cx = startX + k * gap;
        // on the beat, a hit note is coloured by its timing
        const off = s.pOffset[abs];
        const timing = (st === "done" || st === "dirty") && off !== null ? timingOf(off) : null;
        const hitFill = timing === "early" ? "#6f8fa8"
          : timing === "late" ? "#c08a3e" : "#7d9163";
        const fill = st === "done" ? hitFill : st === "dirty" ? "#a85a4e"
          : st === "missed" ? "#ddd0ca" : isNow ? "#2a2120" : "#cabbb4";
        notesSvg += '<circle cx="' + cx + '" cy="' + n.y + '" r="15" fill="' +
          (isNow ? "#f5efec" : "transparent") + '"></circle>';
        if (n.ledger) {
          notesSvg += '<line x1="' + (cx - 15) + '" y1="8" x2="' + (cx + 15) +
            '" y2="8" stroke="' + fill + '" stroke-width="1.1"></line>';
        }
        notesSvg += '<ellipse cx="' + cx + '" cy="' + n.y + '" rx="8.4" ry="5.9" transform="rotate(-22 ' +
          cx + " " + n.y + ')" fill="' + fill + '"></ellipse>';
        notesSvg += '<rect x="' + (cx - 8) + '" y="' + n.y + '" width="1.8" height="42" fill="' + fill + '"></rect>';
        const gl = gracesAt(abs);
        if (gl.length) notesSvg += graceGroupSvg(cx - (gl.length > 1 ? 17 : 24), gl, fill);
        if (s.pCross[abs]) {
          // with a gracenote to the left of the note, the stray marker moves to
          // the right so the two never sit on top of each other
          notesSvg += '<circle cx="' + (cx + (hasGrace ? 14 : -19)) +
            '" cy="6" r="3.4" fill="#a85a4e"></circle>';
        }
        // show how far off the beat a note landed, in ms
        const offLabel = timing && timing !== "on"
          ? " " + (off > 0 ? "+" : "−") + Math.round(Math.abs(off))
          : "";
        labelsHtml += '<div style="position: absolute; top: 0; left: ' + ((cx / 520) * 100).toFixed(2) +
          '%; transform: translateX(-50%); font-size: 11px; letter-spacing: 0.04em; white-space: nowrap; color: ' +
          (st === "done" ? hitFill : st === "dirty" ? "#a85a4e" : isNow ? "#997373" : "#c6b7b0") +
          ';">' + n.name + offLabel + "</div>";
      });
      // beamed groups reach well above the top line, so those rows get extra
      // headroom rather than running into the row above
      const vb = maxG > 1 ? "0 -22 520 126" : "0 0 520 104";
      rowsHtml += '<div class="staff-row"><svg viewBox="' + vb + '">' +
        '<g stroke="#e0d5cf" stroke-width="1.1">' +
        [20, 32, 44, 56, 68].map((y) =>
          '<line x1="10" y1="' + y + '" x2="512" y2="' + y + '"></line>').join("") +
        '</g><text x="16" y="66" font-family="\'Noto Music\', serif" font-size="42" fill="#dbd0ca">&#119070;</text>' +
        notesSvg + '</svg><div class="staff-labels">' + labelsHtml + "</div></div>";
    }
    return rowsHtml;
    };
    setHtml(dom.staffRows, "staff", staffSig, buildRows);
    dom.staffRows.style.display = pseq.length ? "flex" : "none";

    const nowName = pseq.length && !s.runDone ? (NOTES[pseq[s.pIdx]] || NOTES[0]).name : "";
    let statusLine;
    if (!pseq.length) statusLine = "Tap notes above to build a pattern.";
    else if (s.demoing) statusLine = s.loop
      ? "Looping at " + s.bpm + " bpm, tuned to your Low A — play along. Nothing is scored while it plays."
      : "Playing it back once at " + s.bpm + " bpm, tuned to your Low A. Turn Loop on to practise along.";
    else if (s.countIn > 0) statusLine = "Count-in — " + s.countIn + ". First note is " + nowName + ".";
    else if (!s.listening) statusLine = "Turn the mic on and the notes will fill in as you play them.";
    else if (s.runDone) {
      const r = s.lastRun || {};
      if (r.clean) {
        statusLine = r.beat
          ? "Clean run. Every note on the beat, nothing stray."
          : "Clean run. Nothing stray between the notes.";
      } else {
        const bits = [];
        if (r.beat) {
          if (r.on) bits.push(r.on + " on the beat");
          if (r.late) bits.push(r.late + " late");
          if (r.early) bits.push(r.early + " early");
        }
        if (r.strays) bits.push(r.strays + " stray " + (r.strays === 1 ? "note" : "notes"));
        if (r.missed) bits.push(r.missed + " missed");
        statusLine = "Finished — " + (bits.length ? bits.join(", ") : "nothing registered") +
          ". Streak back to zero.";
      }
    }
    else if (s.countIn > 0) statusLine = "Count-in — " + s.countIn + ". First note is " + nowName + ".";
    else if (!s.pPlaying) statusLine = "Press play — one note a beat, and the note has to sound on its beat to count.";
    else if (hasGrace && (steps()[s.pIdx] || {}).move) {
      statusLine = "Play the " + steps()[s.pIdx].move + " on " + nowName + ".";
    }
    else if (hasGrace && gracesAt(s.pIdx).length === 1) {
      const gName = NOTES[gracesAt(s.pIdx)[0]].name;
      statusLine = "Play " + nowName + " with " + (/^[AEF]/.test(gName) ? "an " : "a ") +
        gName + " gracenote.";
    }
    else statusLine = "Play " + nowName + ". A red dot appears above a note if anything else sounds on the way into it.";
    dom.statusLine.textContent = statusLine;

    // Be straight about what the mic can and cannot judge here.
    dom.patternHint.style.display = hasGrace ? "" : "none";
    if (hasGrace) {
      dom.patternHint.textContent = maxG > 1
        ? "The movement is there to read and play — gracenotes are far too short for the mic " +
          "to time, so only the melody note is scored, and sounding the embellishment will " +
          "not count against you."
        : "A gracenote is far too short for the mic to time, so only the melody notes are " +
          "scored — but playing one will not count against you.";
    }

    dom.btnPatternPlay.textContent = s.pPlaying ? "Stop" : "Play";
    dom.btnPatternPlay.style.cssText = roundBtn +
      (s.pPlaying ? "#997373; background: #997373; color: #fff;" : "#2a2120; background: #2a2120; color: #fff;");

    const legend = [["#7d9163", "On the beat"], ["#6f8fa8", "Early"], ["#c08a3e", "Late"],
      ["#a85a4e", "Stray note on the way in"], ["#ded2cc", "Missed the beat"]];
    setHtml(dom.legend, "legend", "built", () => legend.map(([c, label]) =>
      '<div class="legend-item"><div class="legend-dot" style="background: ' + c + ';"></div>' +
      label + "</div>").join(""));

    dom.historyPanel.style.display = s.history.length ? "flex" : "none";
    setHtml(dom.historyRows, "history", JSON.stringify(s.history), () => s.history.map((h) => {
      const when = new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const onBeat = h.beat ? h.on + " / " + h.total + " on beat" : "free tempo";
      return '<div class="history-row">' +
        '<div class="history-dot" style="background: ' + (h.clean ? "#7d9163" : "#e0d5cf") + ';"></div>' +
        '<div class="history-name">' + esc(h.pattern) + "</div>" +
        '<div class="history-when">' + h.bpm + " bpm · " + when + "</div>" +
        '<div class="history-stat history-correct">' + h.correct + " / " + h.total + " correct</div>" +
        '<div class="history-stat history-onbeat" style="color: ' +
          (h.beat ? "#6f605a" : "#c2b4ad") + ';">' + onBeat + "</div>" +
        "</div>";
    }).join(""));

    dom.btnHear.textContent = s.demoing ? "Stop" : "Hear it";
    dom.btnHear.disabled = !pseq.length;
    dom.btnHear.style.cssText = roundBtn + (s.demoing
      ? "#997373; background: #997373; color: #fff;"
      : "#dccfc8; background: #ffffff; color: #2a2120;") +
      (pseq.length ? "" : " opacity: 0.45; cursor: default;");

    dom.btnLoop.textContent = s.loop ? "Loop on" : "Loop off";
    dom.btnLoop.style.cssText = roundBtn + (s.loop
      ? "#dccfc8; background: #f7f1ee; color: #2a2120;"
      : "#e8ded9; background: #ffffff; color: #b3a49d;");
  }

  function render() {
    const s = state;
    const isPatterns = s.view === "patterns";
    const inGame = s.mode === "game";
    const note = (inGame ? NOTES[s.gameOrder[s.gameIdx]] : NOTES[s.order[s.idx]]) || NOTES[0];
    const pseq = seq();

    dom.cardsView.style.display = isPatterns ? "none" : "flex";
    dom.patternsView.style.display = isPatterns ? "flex" : "none";
    dom.tabCards.style.cssText = tabStyle(!isPatterns);
    dom.tabPatterns.style.cssText = tabStyle(isPatterns);

    dom.heading.textContent = isPatterns ? "Scales and patterns"
      : inGame ? "Listening round" : "Bagpipe note drill";
    dom.counter.textContent = isPatterns
      ? (pseq.length ? Math.min(s.pIdx + 1, pseq.length) + " / " + pseq.length : "—")
      : inGame ? (s.gameIdx + 1) + " / " + GAME_LENGTH + " · score " + s.score
      : (s.idx + 1) + " / " + s.order.length;

    if (isPatterns) renderPatterns();

    const fingering = s.cardFace === "fingering";
    dom.tabFaceStaff.style.cssText = tabStyle(!fingering);
    dom.tabFaceFinger.style.cssText = tabStyle(fingering);
    dom.staffSvg.style.display = fingering ? "none" : "";
    dom.chanterImg.style.display = fingering ? "" : "none";
    if (fingering) {
      const src = FINGERING_SRC[note.name];
      if (src && !dom.chanterImg.src.endsWith(src)) dom.chanterImg.src = src;
      dom.chanterImg.alt = note.name + " fingering";
    }

    dom.ledgerLine.style.display = note.ledger ? "" : "none";
    dom.noteHead.setAttribute("cy", note.y);
    dom.noteHead.setAttribute("transform", "rotate(-22 118 " + note.y + ")");
    dom.noteStem.setAttribute("y", note.y);
    dom.noteName.textContent = note.name;
    dom.noteHint.textContent = note.hint;

    dom.cardInner.classList.toggle("flipped", s.flipped);
    // While a modal is up, the card must not intercept clicks meant for the
    // modal's buttons (Safari routes them to the 3D flip layer otherwise).
    dom.card.style.pointerEvents = (s.dialogStep > 0 || s.mode === "result") ? "none" : "";
    dom.cardFront.style.borderColor =
      s.cardResult === "right" ? "#8a9a7b" : s.cardResult === "wrong" ? "#c98d83" : "#dccfc8";
    dom.cardFront.style.background =
      s.cardResult === "right" ? "#edf3e6" : s.cardResult === "wrong" ? "#fbeeeb" : "#ffffff";

    dom.btnPlay.textContent = s.playing ? "Pause" : "Play";
    dom.btnPlay.style.cssText = roundBtn + (s.playing
      ? "#997373; background: #997373; color: #fff;"
      : "#2a2120; background: #2a2120; color: #fff;");

    dom.btnGame.textContent = inGame ? "End round" : "Listening round";
    dom.btnGame.style.cssText = roundBtn + (inGame
      ? "#997373; background: #ffffff; color: #997373;"
      : "#dccfc8; background: #ffffff; color: #2a2120;");

    dom.soundBtns.forEach((b) => {
      b.textContent = s.sound ? "Click on" : "Click off";
      b.style.cssText = roundBtn + (s.sound
        ? "#dccfc8; background: #f7f1ee; color: #2a2120;"
        : "#e8ded9; background: #ffffff; color: #b3a49d;");
    });

    dom.btnAutoFlip.textContent = s.autoFlip ? "Auto-flip on" : "Auto-flip off";
    dom.btnAutoFlip.style.cssText = roundBtn + (s.autoFlip
      ? "#dccfc8; background: #f7f1ee; color: #2a2120;"
      : "#e8ded9; background: #ffffff; color: #b3a49d;");

    dom.bpmVals.forEach((v) => { if (document.activeElement !== v) v.value = s.bpm; });
    dom.bpmSliders.forEach((sl) => { if (document.activeElement !== sl) sl.value = s.bpm; });
    if (document.activeElement !== dom.beatsSelect) dom.beatsSelect.value = String(s.beatsPerCard);

    const cycle = inGame ? s.beatsPerCard : s.beatsPerCard + (s.autoFlip ? 1 : 0);
    let dotsHtml = "";
    for (let i = 1; i <= cycle; i++) {
      const on = s.playing && s.beat === i;
      const answer = !inGame && s.autoFlip && i === cycle;
      dotsHtml += '<div style="width: ' + (on ? 12 : 8) + "px; height: " + (on ? 12 : 8) +
        "px; border-radius: 999px; transition: all 90ms linear; background: " +
        (on ? "#997373" : answer ? "#ded2cc" : "#e8ded9") +
        "; border: " + (answer && !on ? "1px solid #cbbab2" : "0") + ';"></div>';
    }
    dom.beatDots.innerHTML = dotsHtml;

    dom.listenBtns.forEach((b) => {
      b.textContent = s.micError ? s.micError : s.listening ? "Listening" : "Listen";
      b.style.cssText = roundBtn + (s.listening
        ? "#8a9a7b; background: #8a9a7b; color: #fff;"
        : "#dccfc8; background: #ffffff; color: #2a2120;");
    });

    dom.heardLabels.forEach((h) => {
      h.textContent = !s.listening ? "Off" : s.heard ? s.heard : "—";
      h.style.color =
        s.judged === "right" ? "#5f7a4a" :
        s.judged === "wrong" ? "#a85a4e" :
        s.heard ? "#2a2120" : "#c2b4ad";
    });

    dom.centsLabels.forEach((c) => {
      c.textContent = s.listening && s.heard ? (s.cents > 0 ? "+" : "") + s.cents + "¢" : "";
    });
    dom.centsMarkers.forEach((m) => {
      m.style.opacity = s.heard ? 1 : 0;
      m.style.left = Math.round(48 + Math.max(-48, Math.min(48, (s.cents / 50) * 45)) - 3) + "px";
      m.style.background = Math.abs(s.cents) < 15 ? "#8a9a7b" : "#997373";
    });

    dom.refInputs.forEach((r) => { if (document.activeElement !== r) r.value = s.refA; });

    // Result modal
    dom.resultOverlay.style.display = s.mode === "result" ? "flex" : "none";
    if (s.mode === "result") {
      dom.resultTempo.textContent = s.bpm + " bpm · " + s.beatsPerCard +
        (s.beatsPerCard === 1 ? " beat a card" : " beats a card");
      dom.scoreVal.textContent = s.score;
      dom.resultLine.textContent = s.score === 0
        ? (s.listening ? "Nothing registered — check the mic and your Low A setting." : "The mic was off, so nothing could be scored.")
        : s.score === GAME_LENGTH ? "Clean round."
        : s.score >= 15 ? "Solid — tidy up the misses."
        : s.score >= 8 ? "Getting there. Try a slower tempo."
        : "Slow the tempo down and drill the low hand.";
      dom.resultChips.innerHTML = s.results.map((r) =>
        '<div style="font-size: 12px; letter-spacing: 0.06em; padding: 7px 11px; border-radius: 999px; white-space: nowrap; border: 1px solid ' +
        (r.hit ? "#c3d0b6; background: #eef2e8; color: #556b41;" : "#e0bdb7; background: #fbf1ef; color: #a85a4e;") +
        '">' + r.name + "</div>"
      ).join("");
      const missed = s.results.filter((r) => !r.hit).map((r) => r.name);
      dom.missedLine.style.display = missed.length ? "" : "none";
      dom.missedLine.textContent = missed.length ? "Missed: " + missed.join(", ") : "";
    }

    // Listening dialog
    dom.dialogOverlay.style.display = s.dialogStep > 0 ? "flex" : "none";
    if (s.dialogStep > 0) {
      dom.dialogTitle.textContent = DIALOG_TITLES[s.dialogStep];
      dom.dialogStepLabel.textContent = "Step " + Math.min(3, s.dialogStep) + " of 3";
      dom.dialogBody.textContent = DIALOG_BODIES[s.dialogStep];

      dom.levelFill.style.width = Math.round(s.level * 100) + "%";
      dom.levelFill.style.background = s.level > 0.06 ? "#8a9a7b" : "#ded2cc";
      dom.levelLabel.textContent = s.level > 0.06 ? "Sound" : "Silent";

      dom.tunePanel.style.display = s.dialogStep === 2 ? "flex" : "none";
      if (s.dialogStep === 2) {
        dom.calLabel.textContent = s.calHz ? s.calHz + " Hz" : "—";
        dom.dialogRefA.textContent = s.refA + " Hz";
      }

      dom.scaleGrid.style.display = s.dialogStep === 3 ? "grid" : "none";
      if (s.dialogStep === 3) {
        dom.scaleGrid.innerHTML = NOTES.map((n, i) =>
          '<div style="font-size: 13px; letter-spacing: 0.08em; text-align: center; padding: 10px 6px; border-radius: 8px; white-space: nowrap; border: 1px solid ' +
          (i < s.checkIdx ? "#c3d0b6; background: #eef2e8; color: #556b41;"
            : i === s.checkIdx ? (s.judged === "wrong" ? "#e0bdb7; background: #fbf1ef; color: #a85a4e;" : "#997373; background: #ffffff; color: #2a2120;")
            : "#eee5e0; background: #ffffff; color: #bfb0a9;") +
          '">' + n.name + "</div>"
        ).join("");
      }

      dom.btnDialogNext.textContent =
        s.dialogStep === 1 ? "Sounds right"
        : s.dialogStep === 2 ? (s.calHz ? "Use " + s.calHz + " Hz" : "Waiting…")
        : s.checkIdx >= NOTES.length ? "Start practising" : "Done checking";
      dom.btnDialogNext.style.cssText =
        "height: 40px; padding: 0 22px; border-radius: 999px; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap; cursor: pointer; border: 1px solid " +
        (s.dialogStep === 2 && !s.calHz
          ? "#e8ded9; background: #f7f1ee; color: #b3a49d;"
          : "#2a2120; background: #2a2120; color: #fff;");
    }
  }

  function dialogNext() {
    const s = state;
    if (s.dialogStep === 1) {
      s.dialogStep = 2;
      s.calHz = 0;
      calBuf = [];
      render();
    } else if (s.dialogStep === 2) {
      if (!s.calHz) return;
      stableName = null; stableCount = 0;
      s.refA = s.calHz;
      saveRef();
      s.dialogStep = 3;
      s.checkIdx = 0;
      s.judged = null;
      render();
    } else {
      s.dialogStep = 0;
      s.judged = null;
      render();
    }
  }

  function dialogSkip() {
    const s = state;
    if (s.dialogStep === 3) {
      s.dialogStep = 0;
      s.judged = null;
    } else {
      s.dialogStep = s.dialogStep + 1;
      s.judged = null;
      s.checkIdx = 0;
      calBuf = [];
    }
    render();
  }

  // ── wiring ──

  dom.tabFaceStaff.addEventListener("click", () => { state.cardFace = "staff"; state.flipped = false; render(); });
  dom.tabFaceFinger.addEventListener("click", () => { state.cardFace = "fingering"; state.flipped = false; render(); });

  dom.tabCards.addEventListener("click", () => setView("cards"));
  dom.tabPatterns.addEventListener("click", () => setView("patterns"));

  const cardNavOk = () => state.mode === "practice" && !state.dialogStep;

  dom.card.addEventListener("click", () => {
    // A swipe may be followed by a synthesized click; swallow that one so the
    // card doesn't also flip. Time-bounded rather than a flag, because a swipe
    // often produces no click at all and a stale flag would eat the next tap.
    if (Date.now() - swipedAt < 400) return;
    if (cardNavOk()) flip();
  });

  // Swipe left or right to change card, the way you'd expect on a phone.
  dom.card.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchX = t.clientX;
    touchY = t.clientY;
  }, { passive: true });

  dom.card.addEventListener("touchend", (e) => {
    if (!cardNavOk()) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    // must be clearly sideways, so scrolling the page still works
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swipedAt = Date.now();
    if (dx < 0) advance(); else back();
  }, { passive: true });
  dom.btnPrev.addEventListener("click", back);
  dom.btnNext.addEventListener("click", advance);
  dom.btnPlay.addEventListener("click", toggle);
  dom.btnGame.addEventListener("click", () => (state.mode === "game" ? exitGame() : startGame()));
  dom.btnAutoFlip.addEventListener("click", () => { state.autoFlip = !state.autoFlip; state.beat = 0; render(); });
  dom.beatsSelect.addEventListener("change", (e) => { state.beatsPerCard = Number(e.target.value); state.beat = 0; render(); });

  dom.bpmSliders.forEach((sl) => sl.addEventListener("input", (e) => setBpm(Number(e.target.value))));
  dom.bpmUps.forEach((b) => b.addEventListener("click", () => setBpm(state.bpm + 1)));
  dom.bpmDowns.forEach((b) => b.addEventListener("click", () => setBpm(state.bpm - 1)));
  dom.bpmVals.forEach((inp) => {
    inp.addEventListener("focus", () => inp.select());
    inp.addEventListener("blur", () => setBpm(parseFloat(inp.value)));
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") inp.blur();
      else if (e.key === "Escape") { inp.value = state.bpm; inp.blur(); }
    });
  });
  dom.soundBtns.forEach((b) => b.addEventListener("click", () => { state.sound = !state.sound; render(); }));
  dom.listenBtns.forEach((b) => b.addEventListener("click", () => (state.listening ? stopListening() : startListening())));
  dom.refUps.forEach((b) => b.addEventListener("click", () => setRef(state.refA + 1)));
  dom.refDowns.forEach((b) => b.addEventListener("click", () => setRef(state.refA - 1)));
  dom.refInputs.forEach((inp) => {
    inp.addEventListener("focus", () => inp.select());
    inp.addEventListener("blur", () => setRef(parseFloat(inp.value)));
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") inp.blur();
      else if (e.key === "Escape") { inp.value = state.refA; inp.blur(); }
    });
  });

  dom.patternGroups.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pattern]");
    if (btn) pickPattern(btn.dataset.pattern);
  });
  dom.customNotes.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (btn) addCustomNote(Number(btn.dataset.add));
  });
  dom.customGraces.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-grace]");
    if (btn && !btn.disabled) addCustomGrace(Number(btn.dataset.grace));
  });
  dom.btnCustomUndo.addEventListener("click", undoCustom);
  dom.btnCustomClear.addEventListener("click", () => { state.custom = []; resetRun(); });
  dom.customName.addEventListener("input", render);
  dom.customName.addEventListener("keydown", (e) => { if (e.key === "Enter") saveCustom(); });
  dom.btnCustomSave.addEventListener("click", saveCustom);
  dom.btnSavedEdit.addEventListener("click", editSaved);
  dom.btnSavedDelete.addEventListener("click", deleteSaved);
  dom.btnPatternPlay.addEventListener("click", togglePattern);
  dom.btnPatternReset.addEventListener("click", () => { stopPatternClock(); state.pPlaying = false; resetRun(); });
  dom.btnHear.addEventListener("click", () => (state.demoing ? stopDemo() : playDemo()));
  dom.btnLoop.addEventListener("click", () => {
    state.loop = !state.loop;
    // turned back on while the last pass was already winding down — start over
    if (state.demoing && state.loop && !demoSchedTimer) playDemo();
    render();
  });
  dom.btnClearHistory.addEventListener("click", () => { state.history = []; saveHistory(); render(); });

  dom.btnExitGame.addEventListener("click", exitGame);
  dom.btnPlayAgain.addEventListener("click", startGame);
  dom.btnDialogCancel.addEventListener("click", stopListening);
  dom.btnDialogSkip.addEventListener("click", dialogSkip);
  dom.btnDialogNext.addEventListener("click", dialogNext);

  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, select, textarea")) return;
    if (state.dialogStep) return;
    if (state.view === "patterns") {
      if (e.key === " ") { e.preventDefault(); togglePattern(); }
      else if (e.key === "Enter") { e.preventDefault(); resetRun(); }
      return;
    }
    if (state.mode !== "practice") return;
    if (e.key === "ArrowRight") { e.preventDefault(); advance(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    else if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "Enter") { e.preventDefault(); flip(); }
  });

  render();
})();
