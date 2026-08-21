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
  // how long a finished run stays on screen before looping round again
  const LOOP_PAUSE_MS = 2200;
  // Half the 2048-sample analysis window: a note is already part-way through
  // that window by the time the detector can name it, so onsets are back-dated
  // by this much before being timed against the beat.
  const ONSET_LAG_MS = 25;
  // How far off the beat still counts as "on it" — a share of the beat, with a
  // floor so fast tempos stay playable.
  const TIMING_TOLERANCE = 0.18;
  const TIMING_TOLERANCE_MIN_MS = 90;
  // Bluetooth headphones hold the click for a fifth of a second or so before it
  // reaches your ears, and you play to what you hear — so every note reads late
  // by that much however well you played it. The delay is a property of the
  // headphones, not of the app, and cannot be measured from inside the browser
  // on every platform, so it is a number you set once and forget.
  const LAG_KEY = "bagpipe-drill-output-lag";
  const LAG_DEFAULT_MS = 170;   // typical for Bluetooth earbuds; AirPods sit near this
  const LAG_MAX_MS = 400;
  const LAG_STEP_MS = 10;
  // Below this, whatever the browser reports is wired-output latency rather than
  // a Bluetooth link, and compensating for it would be noise.
  const LAG_AUTO_MIN_MS = 60;
  // Average error worth offering to correct, once the delay is being taken out.
  const LAG_NUDGE_MIN_MS = 20;
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

  const METRO_KEY = "bagpipe.metronome.v1";
  const METRO_SPEEDS = ["Slow", "Working", "Target"];
  const ACCENT_CLASS = ["is-silent", "is-soft", "is-normal", "is-strong"];
  const ACCENT_WORD = ["Silent", "Soft", "Normal", "Strong"];

  // Tune-type presets, post piping review. Each one sets the whole metronome at
  // once and carries three tempos, because a beginner should start at Slow and
  // work up rather than open the app at competition speed.
  //
  // Two figures here are load-bearing and have already been got wrong once:
  // the reel counts *half notes* — it is in cut time, two beats to the bar, so
  // it runs about half again as many bars a minute as a strathspey — and
  // pointing 0.75 is the written dot, not an interpretation laid on top of it.
  // Beat stretch is 0 everywhere, including the strathspey: strathspey lift
  // comes from pointing and accents over an even click, so the click stays a
  // timing reference you can be wrong against.
  const METRO_PRESETS = [
    { id: "plain", label: "Plain click", beginner: true,
      beatsPerBar: 4, beatUnit: 4, compound: false, subdivision: 1,
      pointing: 0.5, accents: [3, 2, 2, 2], tempos: [60, 80, 100] },
    { id: "march24", label: "2/4 March", beginner: true,
      beatsPerBar: 2, beatUnit: 4, compound: false, subdivision: 2,
      pointing: 0.75, accents: [3, 2], tempos: [56, 64, 72] },
    { id: "retreat34", label: "3/4 Retreat",
      beatsPerBar: 3, beatUnit: 4, compound: false, subdivision: 2,
      pointing: 0.75, accents: [3, 2, 2], tempos: [72, 80, 88] },
    { id: "march44", label: "4/4 March", beginner: true,
      beatsPerBar: 4, beatUnit: 4, compound: false, subdivision: 2,
      pointing: 0.75, accents: [3, 2, 2, 2], tempos: [72, 80, 88] },
    { id: "march68", label: "6/8 March", beginner: true,
      beatsPerBar: 2, beatUnit: "dotted4", compound: true, subdivision: 3,
      pointing: 0.75, accents: [3, 2], tempos: [64, 70, 76] },
    { id: "retreat98", label: "9/8 Retreat",
      beatsPerBar: 3, beatUnit: "dotted4", compound: true, subdivision: 3,
      pointing: 0.75, accents: [3, 2, 2], tempos: [64, 70, 76] },
    { id: "strathspey", label: "Strathspey", beginner: true,
      beatsPerBar: 4, beatUnit: 4, compound: false, subdivision: 2,
      pointing: [0.85, 0.80, 0.85, 0.80], accents: [3, 1, 2, 1], tempos: [96, 108, 116] },
    { id: "strathspey3", label: "Strathspey, triplet feel",
      beatsPerBar: 4, beatUnit: 4, compound: false, subdivision: 3, subMutes: [1],
      pointing: 0.5, accents: [3, 1, 2, 1], tempos: [96, 108, 116] },
    { id: "reel", label: "Reel", beginner: true,
      beatsPerBar: 2, beatUnit: 2, compound: false, subdivision: 2,
      pointing: 0.5, accents: [3, 2], tempos: [70, 78, 86] },
    { id: "reelpointed", label: "Reel, pointed",
      beatsPerBar: 2, beatUnit: 2, compound: false, subdivision: 4,
      pointing: 0.62, accents: [3, 2], tempos: [70, 78, 86] },
    { id: "jig", label: "Jig", beginner: true,
      beatsPerBar: 2, beatUnit: "dotted4", compound: true, subdivision: 3,
      pointing: 0.5, accents: [3, 2], tempos: [92, 104, 116] },
    { id: "hornpipe", label: "Hornpipe",
      beatsPerBar: 2, beatUnit: 4, compound: false, subdivision: 2,
      pointing: 0.75, accents: [3, 2], tempos: [64, 72, 80] },
    { id: "air44", label: "Slow air (4/4)",
      beatsPerBar: 4, beatUnit: 4, compound: false, subdivision: 1,
      pointing: 0.5, accents: [3, 2, 2, 2], tempos: [50, 60, 70],
      caveat: "A slow air is not played strictly in time. Use this to learn the shape, then turn the click off." },
    { id: "air34", label: "Slow air (3/4)",
      beatsPerBar: 3, beatUnit: 4, compound: false, subdivision: 1,
      pointing: 0.5, accents: [3, 2, 2], tempos: [50, 60, 70],
      caveat: "A slow air is not played strictly in time. Use this to learn the shape, then turn the click off." }
  ];

  const metroPresetById = (id) => METRO_PRESETS.find((p) => p.id === id) || null;

  function metroDefaults() {
    return {
      config: null,          // filled from the engine, which validates it
      volume: 0.8,           // what the slider shows; the engine is fed 0 with the click off
      clickOn: true,
      advancedOpen: false,
      presetId: "plain",
      speedLevel: 1,         // index into a preset's three tempos, -1 once the tempo is moved by hand
      modified: false,
      flash: false,
      haptics: false
    };
  }

  function loadMetro() {
    const base = metroDefaults();
    try {
      const raw = JSON.parse(localStorage.getItem(METRO_KEY) || "null");
      if (!raw || typeof raw !== "object") return base;
      const vol = Number(raw.volume);
      return {
        // Anything at all may come back from storage; the engine normalizes the
        // config on the way in, so only the host's own fields are checked here.
        config: raw.config && typeof raw.config === "object" ? raw.config : null,
        volume: Number.isFinite(vol) && vol >= 0 && vol <= 1 ? vol : base.volume,
        clickOn: raw.clickOn === undefined ? base.clickOn : !!raw.clickOn,
        advancedOpen: !!raw.advancedOpen,
        presetId: metroPresetById(raw.presetId) ? raw.presetId : base.presetId,
        speedLevel: [0, 1, 2].indexOf(raw.speedLevel) !== -1 ? raw.speedLevel : -1,
        modified: !!raw.modified,
        flash: !!raw.flash,
        haptics: !!raw.haptics
      };
    } catch (err) { return base; }
  }

  function saveMetro() {
    try { localStorage.setItem(METRO_KEY, JSON.stringify(state.metro)); } catch (err) { /* storage unavailable */ }
  }

  // { on, ms, auto } — auto means "use whatever the browser reports, if it
  // reports anything useful", which is how Chrome and Android get the right
  // figure without anybody typing one. Touching the number turns auto off.
  function loadLag() {
    const base = { on: false, ms: LAG_DEFAULT_MS, auto: true };
    try {
      const raw = JSON.parse(localStorage.getItem(LAG_KEY) || "null");
      if (!raw || typeof raw !== "object") return base;
      const ms = Number(raw.ms);
      return {
        on: !!raw.on,
        ms: Number.isFinite(ms) ? Math.min(LAG_MAX_MS, Math.max(0, Math.round(ms))) : base.ms,
        auto: raw.auto === undefined ? base.auto : !!raw.auto
      };
    } catch (err) { return base; }
  }

  function saveLag() {
    try { localStorage.setItem(LAG_KEY, JSON.stringify(state.lag)); } catch (err) { /* storage unavailable */ }
  }

  // The staff and the run colours are drawn into SVG, where a CSS custom
  // property in a fill attribute is not resolved — so the two palettes are
  // written out here as well as in styles.css.
  const THEMES = {
    light: {
      ink: "#2a2120", good: "#7d9163", bad: "#a85a4e", early: "#6f8fa8",
      late: "#c08a3e", dim: "#cabbb4", missed: "#ddd0ca", halo: "#f5efec",
      staff: "#e0d5cf", clef: "#dbd0ca", acc: "#997373", labelPend: "#c6b7b0"
    },
    dark: {
      ink: "#f0e7e2", good: "#9db184", bad: "#cd8375", early: "#8fb0c8",
      late: "#d8a760", dim: "#5f4f48", missed: "#4a3d38", halo: "#332a27",
      staff: "#40342e", clef: "#40342e", acc: "#c49a9a", labelPend: "#6a5952"
    }
  };
  const T = () => THEMES[state.theme] || THEMES.light;

  const THEME_KEY = "bpd-theme";

  function loadTheme() {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return v === "dark" || v === "light" ? v : "light";
    } catch (err) { return "light"; }
  }

  function saveTheme() {
    try { localStorage.setItem(THEME_KEY, state.theme); } catch (err) { /* storage unavailable */ }
  }

  // The browser chrome around the page follows the app, so a dark app does not
  // sit under a cream status bar.
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    const meta = document.getElementById("themeColor");
    if (meta) meta.setAttribute("content", state.theme === "dark" ? "#1b1512" : "#f3ece8");
  }

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
    // Fixed rather than adjustable: the phone layout has no room for two more
    // controls on the card, and these are the values the drill wants anyway —
    // four beats to look at a card, and the answer on the beat after.
    beatsPerCard: 4,
    autoFlip: true,
    // No longer a control either. The click is part of the drill, so it is
    // always on.
    sound: true,
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
    theme: "light",
    pickerOpen: false,
    buildGraces: false,
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
    saved: [],
    lag: null,
    metro: null
  };
  state.theme = loadTheme();
  applyTheme();
  state.history = loadHistory();
  state.saved = loadSaved();
  state.refA = loadRef();
  state.lag = loadLag();
  state.metro = loadMetro();

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
  let beatAt = 0;        // when the current note's beat reached your ears
  let pendingEarly = null; // next note's pitch, heard before its beat
  let pBeatTimers = [];  // beats sounded but not yet heard, over Bluetooth

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
    counterLabel: el("counterLabel"),
    tabCards: el("tabCards"),
    tabPatterns: el("tabPatterns"),
    tabSettings: el("tabSettings"),
    cardsView: el("cardsView"),
    patternsView: el("patternsView"),
    settingsView: el("settingsView"),
    flashLayer: el("flashLayer"),
    screens: el("screens"),
    btnThemeLight: el("btnThemeLight"),
    btnThemeDark: el("btnThemeDark"),
    btnCalibrate: el("btnCalibrate"),
    micStateLabel: el("micStateLabel"),
    cardStatus: el("cardStatus"),
    cardTapHint: el("cardTapHint"),
    pickerOverlay: el("pickerOverlay"),
    btnOpenPicker: el("btnOpenPicker"),
    btnClosePicker: el("btnClosePicker"),
    staffPanel: el("staffPanel"),
    tabBuildNotes: el("tabBuildNotes"),
    tabBuildGraces: el("tabBuildGraces"),
    gapSettings: el("gapSettings"),
    rampSettings: el("rampSettings"),
    droneSettings: el("droneSettings"),
    metroSigLabel: el("metroSigLabel"),
    metroExtras: el("metroExtras"),
    btnGoSettings: el("btnGoSettings"),
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
    beatDots: el("beatDots"),
    patternGroups: el("patternGroups"),
    patternName: el("patternName"),
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
    btnHear: el("btnHear"),
    btnLoop: el("btnLoop"),
    btnLag: el("btnLag"),
    lagBar: el("lagBar"),
    lagInput: el("lagInput"),
    lagHint: el("lagHint"),
    btnLagUp: el("btnLagUp"),
    btnLagDown: el("btnLagDown"),
    legend: el("legend"),
    historyPanel: el("historyPanel"),
    historyRows: el("historyRows"),
    btnClearHistory: el("btnClearHistory"),
    btnFreeMetro: el("btnFreeMetro"),
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
    // metronome
    tabMetronome: el("tabMetronome"),
    metronomeView: el("metronomeView"),
    metroStage: el("metroStage"),
    metroRingWrap: el("metroRingWrap"),
    metroPips: el("metroPips"),
    metroTicks: el("metroTicks"),
    metroHand: el("metroHand"),
    metroBpm: el("metroBpm"),
    metroBeatUnit: el("metroBeatUnit"),
    metroPos: el("metroPos"),
    btnMetroTap: el("btnMetroTap"),
    btnMetroBpmDown: el("btnMetroBpmDown"),
    btnMetroBpmUp: el("btnMetroBpmUp"),
    metroBpmRange: el("metroBpmRange"),
    metroBpmInput: el("metroBpmInput"),
    metroPresets: el("metroPresets"),
    metroPresetsMore: el("metroPresetsMore"),
    btnMetroCountIn: el("btnMetroCountIn"),
    btnMetroClick: el("btnMetroClick"),
    metroVolume: el("metroVolume"),
    metroVolumeVal: el("metroVolumeVal"),
    metroTimeSig: el("metroTimeSig"),
    metroSubdivision: el("metroSubdivision"),
    metroAccents: el("metroAccents"),
    metroPointing: el("metroPointing"),
    metroPointingVal: el("metroPointingVal"),
    metroPulse: el("metroPulse"),
    metroPulseVal: el("metroPulseVal"),
    btnMetroGap: el("btnMetroGap"),
    metroGapPlay: el("metroGapPlay"),
    metroGapMute: el("metroGapMute"),
    btnMetroGapHide: el("btnMetroGapHide"),
    btnMetroRamp: el("btnMetroRamp"),
    metroRampBars: el("metroRampBars"),
    metroRampStep: el("metroRampStep"),
    metroRampMax: el("metroRampMax"),
    btnMetroDrone: el("btnMetroDrone"),
    metroDroneLevel: el("metroDroneLevel"),
    metroDroneVal: el("metroDroneVal"),
    metroSound: el("metroSound"),
    btnMetroFlash: el("btnMetroFlash"),
    btnMetroHaptics: el("btnMetroHaptics"),
    metroHapticsGroup: el("metroHapticsGroup"),
    // shared across both views
    bpmSliders: all(".js-bpm"),
    bpmVals: all(".js-bpm-val"),
    bpmUps: all(".js-bpm-up"),
    bpmDowns: all(".js-bpm-down"),
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

    // The highlight follows the ear, not the audio clock, so over headphones it
    // does not run ahead of the note you are hearing.
    const elapsed = ac.currentTime - demoStart - lagMs() / 1000;
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

  // The click has to be heard over a chanter, which is not a quiet instrument.
  // A triangle carries far more harmonic content than a sine at the same peak,
  // so it cuts through rather than sitting under the reed.
  const CLICK_PEAK = 0.78;
  const CLICK_PEAK_OFFBEAT = 0.52;

  function tick(accent) {
    if (!state.sound) return;
    try {
      ac = audio();
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "triangle";
      o.frequency.value = accent ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(accent ? CLICK_PEAK : CLICK_PEAK_OFFBEAT, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + 0.11);
    } catch (err) { /* audio unavailable */ }
  }

  // ── the click on its own ──
  //
  // Spot practice: the pulse with nothing attached to it. No count-in, no run,
  // no highlight travelling along the staff — you decide what to work at and the
  // page only keeps time. It borrows the metronome engine rather than the
  // interval the runs use, because this is left going for minutes at a stretch
  // and the engine lays its clicks on the audio clock, which a backgrounded tab
  // cannot stutter.
  let freeMetro = null;

  function freeMetroEngine() {
    if (freeMetro || !window.PipeMetronome) return freeMetro;
    freeMetro = window.PipeMetronome.create({
      getContext: () => audio(),
      onStop: () => render(),
      // Even clicks, one a beat, from the first one: this page has no bar to
      // count, so accenting a downbeat here would be inventing one. The bar,
      // the subdivisions and the rest of it are what the metronome tab is for.
      config: {
        bpm: state.bpm,
        beatsPerBar: 4,
        accents: [2, 2, 2, 2],
        subdivision: 1,
        countInBars: 0,
        volume: state.metro.volume
      }
    });
    return freeMetro;
  }

  function freeMetroOn() {
    return !!freeMetro && freeMetro.isRunning();
  }

  function startFreeMetro() {
    const m = freeMetroEngine();
    if (!m || m.isRunning()) return;
    // Two clocks clicking at once is nobody's idea of practice, so a judged run
    // gives way to the plain beat.
    clearTimeout(runTimer);
    stopPatternClock();
    state.pPlaying = false;
    // The click follows the tempo on this page, and the volume set on the
    // metronome tab — it is the same click, so it answers to the same slider.
    m.setConfig({ bpm: state.bpm, volume: state.metro.volume });
    // start() builds the AudioContext, which iOS only hands over inside a
    // gesture; this is only ever reached from the button.
    m.start();
    render();
  }

  function stopFreeMetro() {
    if (freeMetroOn()) freeMetro.stop();   // onStop renders
  }

  function toggleFreeMetro() {
    if (freeMetroOn()) stopFreeMetro(); else startFreeMetro();
  }

  // ── views ──

  function setView(view) {
    stopDemo();
    stopClock();
    stopPatternClock();
    stopFreeMetro();
    // The metronome keeps its own clock and audio, so leaving it has to stop it
    // as well — except on the way to Settings, which is where its own controls
    // now live and where you would expect to adjust it as it runs.
    if (view !== "metronome" && view !== "settings") stopMetronome();
    state.view = view;
    state.playing = false;
    state.beat = 0;
    state.pPlaying = false;
    state.mode = "practice";
    state.pickerOpen = false;
    // Each screen is its own page, so arriving at one starts at the top of it.
    if (dom.screens) dom.screens.scrollTop = 0;
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

  // What the browser says the whole output path costs. Chrome and Firefox
  // report the real figure and it moves when you pair a set of headphones;
  // Safari does not implement it at all, which is why there is a number to type.
  function measuredLagMs() {
    try {
      const l = ac && typeof ac.outputLatency === "number" ? ac.outputLatency : NaN;
      if (!Number.isFinite(l) || l <= 0) return 0;
      return Math.min(LAG_MAX_MS, Math.round(l * 1000));
    } catch (err) { return 0; }
  }

  // How long after the app plays a click you actually hear it.
  function lagMs() {
    if (!state.lag.on) return 0;
    if (state.lag.auto) {
      const m = measuredLagMs();
      if (m >= LAG_AUTO_MIN_MS) return m;
    }
    return state.lag.ms;
  }

  function setLagMs(v) {
    if (!Number.isFinite(v)) { render(); return; }
    state.lag.ms = Math.min(LAG_MAX_MS, Math.max(0, Math.round(v)));
    state.lag.auto = false;   // a hand-set figure is not overridden by the browser
    saveLag();
    render();
  }

  function toggleLag() {
    state.lag.on = !state.lag.on;
    // Turning it on for the first time seeds the number from the browser where
    // there is one to read, so most people never have to touch it.
    if (state.lag.on && state.lag.auto) {
      const m = measuredLagMs();
      if (m >= LAG_AUTO_MIN_MS) state.lag.ms = m;
    }
    saveLag();
    render();
  }

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
  //
  // Two clocks, a headphone delay apart. The click goes out on the interval,
  // because that is when the sound has to be handed to the audio hardware; but
  // you play to what you *hear*, so everything that depends on the beat having
  // landed — the note being judged, the highlight, the count-in numbers — runs
  // lagMs() later. With the delay off the two are the same instant and this is
  // the plain clock it has always been.
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
    // The clock may be rebuilt part-way through a run, so the audio side counts
    // notes from wherever the run has got to rather than from the beginning.
    const startIdx = state.pIdx;
    let n = 0;

    // The beat, as heard.
    const landed = (k) => {
      if (k <= total) {
        state.countIn = total - k + 1;
        render();
        return;
      }
      if (k === total + 1) {
        // downbeat — note one starts here
        state.countIn = 0;
        beatAt = Date.now();
        render();
        return;
      }
      step();
    };

    // The beat, as played out.
    const onBeat = () => {
      n++;
      const k = n;
      // Count-in beats click with the first accented, then the run's first note,
      // then a plain click on each note after it. The beat that ends the run has
      // no note left to mark, so it is silent.
      const note = k <= total ? -1 : startIdx + (k - total - 1);
      if (note < seq().length) tick(k <= total ? k === 1 : k === total + 1);

      const lag = lagMs();
      if (lag <= 0) { landed(k); return; }
      const t = setTimeout(() => {
        pBeatTimers = pBeatTimers.filter((x) => x !== t);
        landed(k);
      }, lag);
      pBeatTimers.push(t);
    };

    state.countIn = total;
    onBeat();
    // The first beat is not heard for a delay yet, so show the count-in now
    // rather than leaving the play prompt up until it lands.
    render();
    pTimer = setInterval(onBeat, 60000 / state.bpm);
  }

  function stopPatternClock() {
    if (pTimer) { clearInterval(pTimer); pTimer = null; }
    // beats already sounded but not yet heard: stopping has to silence what they
    // would have done, or a run keeps scoring for a fifth of a second after Stop
    pBeatTimers.forEach(clearTimeout);
    pBeatTimers = [];
    state.countIn = 0;
  }

  function togglePattern() {
    if (state.pPlaying) {
      clearTimeout(runTimer);
      stopPatternClock();
      stopDemo();
      state.pPlaying = false;
      render();
    } else if (!state.listening) {
      // Nothing here can be scored without a microphone, so this is where it
      // gets asked for. The mic check runs first; the run starts after it.
      stopDemo();
      startListening();
    } else {
      stopFreeMetro();
      stopDemo();
      state.pPlaying = true;
      resetRun();
      startPatternClock(true);
    }
  }

  // Score a completed pass and log it. Kept separate from stopping, so a loop
  // can record the pass and carry straight on without breaking the pulse.
  function scoreRun(st) {
    const allHit = st.length > 0 && st.every((x) => x === "done");
    let early = 0, late = 0, on = 0, sum = 0, timed = 0;
    state.pOffset.forEach((o, i) => {
      if (o === null || st[i] === "missed") return;
      const t = timingOf(o);
      if (t === "early") early++;
      else if (t === "late") late++;
      else on++;
      sum += o;
      timed++;
    });
    // The average is what a mis-set headphone delay looks like: a whole run
    // sitting the same distance off the beat rather than scattered around it.
    const meanMs = timed ? Math.round(sum / timed) : null;
    // a clean run also has to be in time
    const clean = allHit && early === 0 && late === 0;
    state.streak = clean ? state.streak + 1 : 0;
    state.lastRun = {
      clean,
      beat: true,   // kept so older free-tempo history still reads correctly
      on, early, late,
      meanMs: meanMs,
      // what the run was scored against, so the advice below stays right even
      // if the delay is changed or switched off before the next run
      lagMs: lagMs(),
      strays: state.pCross.filter(Boolean).length,
      missed: st.filter((x) => x === "missed").length
    };

    state.history = [{
      pattern: currentPattern().name,
      bpm: state.bpm,
      beat: true,
      total: st.length,
      correct: st.length - state.lastRun.missed,
      on: on,
      at: Date.now(),
      clean: clean
    }].concat(state.history).slice(0, HISTORY_MAX);
    saveHistory();
  }

  function finishRun(states) {
    const st = states || state.pStates;
    scoreRun(st);
    stopPatternClock();
    state.runDone = true;
    state.pPlaying = false;
    state.pStates = st;
    render();

    clearTimeout(runTimer);
    // With loop off the finished run stays on screen so the marks can be read.
    // With it on, hold the marks for a moment and then count in again — the
    // break is what lets you reset your hands before the next run.
    if (!state.loop) return;
    runTimer = setTimeout(() => {
      if (state.view !== "patterns" || !state.runDone) return;
      resetRun();
      state.pPlaying = true;
      startPatternClock(true);
      render();
    }, LOOP_PAUSE_MS);
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
    syncMetroRef();
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
    // The plain beat retimes without breaking: the engine keeps the beat you
    // are standing on and lays the rest out again at the new tempo.
    if (freeMetroOn()) freeMetro.setConfig({ bpm: state.bpm });
    // Playback runs at a fixed beat, so a tempo change restarts it. Debounced
    // so dragging the slider doesn't stutter.
    if (state.demoing) {
      clearTimeout(demoRestartTimer);
      demoRestartTimer = setTimeout(playDemo, 200);
    }
  }

  // Everything visual now lives in styles.css so both palettes stay in one
  // place; JavaScript only ever says which state a control is in.
  function setOn(node, on, cls) {
    if (node) node.classList.toggle(cls || "is-on", !!on);
  }

  function show(node, on) {
    if (node) node.hidden = !on;
  }

  function chipGroup(box, value) {
    if (!box) return;
    box.querySelectorAll("[data-val]").forEach((b) => {
      const on = b.dataset.val === String(value);
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  const DIALOG_TITLES = ["", "Is the mic hearing you?", "Tune to your chanter", "Play up the scale"];
  const DIALOG_BODIES = [
    "",
    "Play or blow into the chanter. The input meter should move when you make a sound. If it stays flat, check that the right microphone is selected and that nothing else is using it.",
    "Hold a steady Low A — the bottom hand covered, thumb down. Every other note is measured from this pitch, so it only has to be set once per chanter.",
    "Play each note in order, from Low G up to High A. Each one turns green when the app hears what it expects. If a note refuses to register, go back and re-tune the Low A."
  ];

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
    const lengthOf = (p) => {
      if (p.steps) return p.steps.length;
      if (p.id === "custom") return null;
      return seqOf(p.seq).length;
    };
    const metaOf = (n) => (n === null ? "note by note" : n + (n === 1 ? " note" : " notes"));
    PATTERNS.forEach((p) => {
      let g = groups.find((x) => x.label === p.group);
      if (!g) { g = { label: p.group, items: [] }; groups.push(g); }
      g.items.push({ id: p.id, label: p.name || p.label, meta: metaOf(lengthOf(p)) });
    });
    if (s.saved.length) {
      groups.push({
        label: "Saved",
        items: s.saved.map((v) => ({
          id: SAVED_PREFIX + v.id, label: v.name, meta: metaOf(v.seq.length)
        }))
      });
    }
    // built once; selection is applied below by restyling the existing buttons
    // so the nodes stay clickable while the mic is re-rendering the page
    const pickerSig = s.saved.map((v) => v.id + ":" + v.name).join(",");
    setHtml(dom.patternGroups, "picker", pickerSig, () => groups.map((g) =>
      '<div class="pattern-group-row"><div class="pattern-group-label">' + esc(g.label) +
      '</div><div class="pattern-group-items">' +
      g.items.map((p) =>
        '<button class="pattern-pick" type="button" data-pattern="' + esc(p.id) + '">' +
        '<span class="pattern-pick-text"><span class="pattern-pick-label">' + esc(p.label) +
        '</span><span class="pattern-pick-meta">' + esc(p.meta) + "</span></span></button>"
      ).join("") + "</div></div>"
    ).join(""));
    dom.patternGroups.querySelectorAll("[data-pattern]").forEach((b) => {
      setOn(b, b.dataset.pattern === s.patternId);
    });
    show(dom.pickerOverlay, s.pickerOpen);

    dom.patternName.textContent = pat.name;
    dom.streakVal.textContent = s.streak;
    setOn(dom.streakVal, s.streak, "is-good");

    show(dom.customBuilder, pat.id === "custom");
    setOn(dom.tabBuildNotes, !s.buildGraces);
    setOn(dom.tabBuildGraces, s.buildGraces);
    show(dom.customNotes, !s.buildGraces);
    show(dom.customGraces, s.buildGraces);
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
    show(dom.savedBar, !!savedPat);
    if (savedPat) {
      dom.savedName.textContent = savedPat.name;
      dom.savedHint.textContent = saveHint;
      dom.btnSavedDelete.textContent = deleteArmed ? "Tap again" : "Delete";
      setOn(dom.btnSavedDelete, deleteArmed, "is-armed");
    }

    // staff rows — gracenotes sit to the left of their note, so the more of
    // them a pattern carries, the more room each note needs
    const maxG = maxGraceLen();
    const hasGrace = maxG > 0;
    // A phone-width staff can hold far fewer notes than the old wide one, so
    // patterns wrap onto more, shorter rows.
    const perRow = maxG > 1 ? 3 : maxG === 1 ? 4 : 5;
    const gap = maxG > 1 ? 130 : maxG === 1 ? 104 : 92;
    const startX = maxG > 1 ? 132 : maxG === 1 ? 104 : 72;
    // The staff is only as wide as the notes on it, so a phone-width row is
    // never mostly empty paper.
    const staffW = startX + (perRow - 1) * gap + 40;
    const staffSig = [
      s.patternId, s.theme,
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
        const t = T();
        const hitFill = timing === "early" ? t.early
          : timing === "late" ? t.late : t.good;
        const fill = st === "done" ? hitFill : st === "dirty" ? t.bad
          : st === "missed" ? t.missed : isNow ? t.ink : t.dim;
        notesSvg += '<circle cx="' + cx + '" cy="' + n.y + '" r="15" fill="' +
          (isNow ? t.halo : "transparent") + '"></circle>';
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
            '" cy="6" r="3.4" fill="' + t.bad + '"></circle>';
        }
        // The notes are there to be read off the staff, so nothing names them.
        // The only thing written underneath is how far off the beat a note
        // landed, in ms, and only once there is a figure to write.
        if (timing && timing !== "on") {
          const offLabel = (off > 0 ? "+" : "−") + Math.round(Math.abs(off));
          labelsHtml += '<div class="staff-label" style="left: ' + ((cx / staffW) * 100).toFixed(2) +
            '%; color: ' + (st === "dirty" ? t.bad : hitFill) + ';">' + offLabel + "</div>";
        }
      });
      // beamed groups reach well above the top line, so those rows get extra
      // headroom rather than running into the row above
      const vb = maxG > 1 ? "0 -22 " + staffW + " 126" : "0 0 " + staffW + " 104";
      rowsHtml += '<div class="staff-row"><svg viewBox="' + vb + '">' +
        '<g stroke="' + T().staff + '" stroke-width="1.1">' +
        [20, 32, 44, 56, 68].map((y) =>
          '<line x1="10" y1="' + y + '" x2="' + (staffW - 8) + '" y2="' + y + '"></line>').join("") +
        '</g><text x="16" y="66" font-family="\'Noto Music\', serif" font-size="42" fill="' +
        T().clef + '">&#119070;</text>' +
        notesSvg + '</svg><div class="staff-labels">' + labelsHtml + "</div></div>";
    }
    return rowsHtml;
    };
    setHtml(dom.staffRows, "staff", staffSig, buildRows);
    show(dom.staffPanel, pseq.length > 0);

    const nowName = pseq.length && !s.runDone ? (NOTES[pseq[s.pIdx]] || NOTES[0]).name : "";
    let statusLine;
    if (s.micError) statusLine = "The microphone is blocked — allow it in your browser settings, then try again.";
    else if (!pseq.length) statusLine = "Tap notes above to build a pattern.";
    else if (s.demoing) statusLine = s.loop
      ? "Looping at " + s.bpm + " bpm, tuned to your Low A — play along. Nothing is scored while it plays."
      : "Playing it back once at " + s.bpm + " bpm, tuned to your Low A. Turn Loop on to practise along.";
    else if (s.countIn > 0) statusLine = "Count-in — " + s.countIn + ". First note is " + nowName + ".";
    else if (!s.listening) statusLine = "Tap Test mode to be scored — it turns the mic on first. Listen plays the pattern back.";
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
    else if (!s.pPlaying) statusLine = "Tap Test mode — one note a beat, and the note has to sound on its beat to count.";
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
    show(dom.patternHint, hasGrace);
    if (hasGrace) {
      dom.patternHint.textContent = maxG > 1
        ? "The movement is there to read and play — gracenotes are far too short for the mic " +
          "to time, so only the melody note is scored, and sounding the embellishment will " +
          "not count against you."
        : "A gracenote is far too short for the mic to time, so only the melody notes are " +
          "scored — but playing one will not count against you.";
    }

    dom.btnPatternPlay.textContent = s.pPlaying ? "Stop" : "Test mode";
    setOn(dom.btnPatternPlay, s.pPlaying);

    const legend = [["good", "On the beat"], ["early", "Early"], ["late", "Late"],
      ["bad", "Stray note on the way in"], ["missed", "Missed the beat"]];
    setHtml(dom.legend, "legend", s.theme, () => legend.map(([c, label]) =>
      '<div class="legend-item"><div class="legend-dot" style="background: var(--' + c + ');"></div>' +
      label + "</div>").join(""));

    show(dom.historyPanel, s.history.length > 0);
    setHtml(dom.historyRows, "history", JSON.stringify(s.history) + s.theme, () => s.history.map((h) => {
      const when = new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const onBeat = h.beat ? h.on + " / " + h.total + " on beat" : "free tempo";
      return '<div class="history-row">' +
        '<div class="history-dot" style="background: var(--' + (h.clean ? "good" : "bd2") + ');"></div>' +
        '<div class="history-name">' + esc(h.pattern) + "</div>" +
        '<div class="history-when">' + h.bpm + " bpm · " + when + "</div>" +
        '<div class="history-stat history-correct">' + h.correct + " / " + h.total +
        " correct · " + onBeat + "</div>" +
        "</div>";
    }).join(""));

    dom.btnHear.textContent = s.demoing ? "Stop" : "Listen";
    dom.btnHear.disabled = !pseq.length;
    setOn(dom.btnHear, s.demoing);

    dom.btnLoop.textContent = s.loop ? "Loop on" : "Loop off";
    setOn(dom.btnLoop, s.loop, "is-quiet");
    setOn(dom.btnLoop, !s.loop, "is-off");

    const freeOn = freeMetroOn();
    dom.btnFreeMetro.textContent = freeOn ? "Stop metronome" : "Just metronome";
    setOn(dom.btnFreeMetro, freeOn);

    dom.btnLag.textContent = s.lag.on ? "Bluetooth on" : "Bluetooth off";
    setOn(dom.btnLag, s.lag.on, "is-quiet");
    setOn(dom.btnLag, !s.lag.on, "is-off");
    show(dom.lagBar, s.lag.on);
    if (s.lag.on) {
      if (document.activeElement !== dom.lagInput) dom.lagInput.value = lagMs();
      dom.lagHint.textContent = lagHint();
    }
  }

  // What the number means, and — once a run has been scored against it — what
  // the playing says it should have been. A whole run sitting the same distance
  // off the beat is the delay being wrong, not the piping.
  function lagHint() {
    const r = state.lastRun;
    const mean = r && typeof r.meanMs === "number" ? r.meanMs : null;
    if (mean !== null && Math.abs(mean) >= LAG_NUDGE_MIN_MS) {
      const suggest = Math.min(LAG_MAX_MS, Math.max(0, (r.lagMs || 0) + mean));
      // Once the advice has been taken there is nothing left to say.
      if (suggest !== lagMs()) {
        return "That run averaged " + Math.abs(mean) + " ms " + (mean > 0 ? "late" : "early") +
          " — if it felt right under your fingers, set the delay to " + suggest + ".";
      }
    }
    if (state.lag.auto && measuredLagMs() >= LAG_AUTO_MIN_MS) {
      return "Measured from your headphones. Notes are timed against when the click reaches you, not when it is played.";
    }
    return "Notes are timed against when the click reaches you, not when it is played. " +
      "If a whole run still reads late, raise this; if it reads early, lower it.";
  }

  // ── metronome ──
  //
  // A third view with its own clock, its own audio and its own state.
  // metronome.js owns the timing and the sound; everything from here to the
  // next section is state, wiring and the ring. It shares exactly two things
  // with the rest of the app: audio(), and state.refA for the drone's pitch.

  const PM = window.PipeMetronome || null;

  let metro = null;
  let metroRaf = null;
  let metroPipEls = [];
  let metroActivePip = -1;   // which pip currently carries .is-active
  let metroPosText = "";     // last string written to #metroPos
  let metroHandAngle = 0;    // degrees round the bar, 0 at the downbeat
  let metroHandTurns = 0;    // whole turns added so the hand never rotates back
  let metroRingHidden = false;
  let metroFlashTimer = null;
  let metroWakeLock = null;
  let metroLastSub = 0;      // subdivision to come back to after "just the beat"

  const HAS_VIBRATE = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  // What the dial says when it is stopped. It matches the markup's own wording,
  // because the dial is the start button and that is what the line is telling
  // you to do.
  const METRO_IDLE = "Tap the dial to start";

  // How far pointing may be pushed at each subdivision. The limit is
  // arithmetic, not taste: inside a beat of duration d, the k=3 rule leaves
  // d(1-p)/3 between its second and third onsets and k=6 leaves half of that,
  // so at p = 0.85 and a fast tempo the pair collapses to about ten
  // milliseconds and reads as a flam rather than a rhythm. k=2 and k=4 split
  // wider spans and stay legible across the whole range.
  const POINT_RANGE = { 1: [15, 85], 2: [15, 85], 3: [25, 75], 4: [15, 85], 6: [35, 65] };

  const metroPointRange = (k) => POINT_RANGE[k] || POINT_RANGE[1];

  // A preset may point each beat of the bar differently, which is what a
  // strathspey needs. One slider cannot show four values, so it shows the
  // average and moving it replaces the array with a single figure.
  function pointScalar(p) {
    if (Array.isArray(p) && p.length) return p.reduce((a, b) => a + b, 0) / p.length;
    return Number.isFinite(p) ? p : 0.5;
  }

  function metroConfig() { return state.metro.config || (PM ? PM.DEFAULTS : {}); }

  function metroSig(c) {
    if (c.compound) return (c.beatsPerBar * 3) + "/8";
    if (c.beatUnit === 2) return c.beatsPerBar + "/2";
    return c.beatsPerBar + "/4";
  }

  // Which note value the tempo number counts. This is on screen at all times
  // because published piping tempos disagree with each other mostly by
  // counting different units — a reel at 86 is minims, and reading it as
  // crotchets plays the tune at half speed.
  function metroUnit(c) {
    if (c.compound) {
      return { caption: "counting dotted quarters", glyph: "♩.",
        help: "The tempo counts dotted quarter notes, which is the beat of 6/8 and 9/8 — two clicks in a 6/8 bar, not six." };
    }
    if (c.beatUnit === 2) {
      return { caption: "counting half notes", glyph: "𝅗𝅥",
        help: "The tempo counts half notes (minims). A reel is in cut time, two beats to the bar, so it covers far more bars a minute than the number suggests." };
    }
    return { caption: "counting quarter notes", glyph: "♩",
      help: "The tempo counts quarter notes (crotchets)." };
  }

  function barsPerMin(c) {
    const bars = c.bpm / Math.max(1, c.beatsPerBar);
    return Math.abs(bars - Math.round(bars)) < 0.05 ? String(Math.round(bars)) : bars.toFixed(1);
  }

  // Three things the spec asks for that the markup has no home for: the
  // Slow / Working / Target tempo picker, the bars-a-minute readout beside the
  // tempo, and two lines of plain English. They are built here rather than in
  // index.html because this file does not own that file; they use only classes
  // that already exist.
  // The speed chips are the one part of the metronome card built here rather
  // than written out in the markup, because their labels live in METRO_SPEEDS
  // next to the preset table they belong to. Everything else this used to
  // create — the rate readout, the tune-type caveat, the cut-time option and
  // the piobaireachd note — is now in index.html, so where it sits on the card
  // is a decision somebody made rather than a side effect of insertion order.
  function buildMetroExtras() {
    dom.metroSpeedChips = el("metroSpeedChips");
    dom.metroRate = el("metroRate");
    dom.metroRateHelp = el("metroRateHelp");
    dom.metroCaveat = el("metroCaveat");
    if (!dom.metroSpeedChips) return;
    dom.metroSpeedChips.innerHTML = METRO_SPEEDS.map((label, i) =>
      '<button class="chip chip-grow" type="button" data-speed="' + i + '" aria-pressed="false">' +
      label + "</button>").join("");
  }

  // Everything goes to the engine and comes back normalized, so the controls
  // always show what is actually being played rather than what was asked for.
  function setMetro(patch, keepPreset) {
    if (!metro) return;
    metro.setConfig(patch);
    state.metro.config = metro.getConfig();
    // A chip claims "this is a 2/4 march". Once one of the settings behind that
    // claim is changed by hand it says so rather than going on pretending.
    // Tempo is deliberately not one of them: the three speed buttons and the
    // slider are how a preset is meant to be used.
    if (!keepPreset) state.metro.modified = true;
    saveMetro();
    render();
  }

  function presetConfig(p, level) {
    const cfg = {
      bpm: p.tempos[Math.min(2, Math.max(0, level))],
      beatsPerBar: p.beatsPerBar,
      beatUnit: p.beatUnit,
      compound: !!p.compound,
      subdivision: p.subdivision,
      subMutes: (p.subMutes || []).slice(),
      accents: p.accents.slice(),
      pointing: Array.isArray(p.pointing) ? p.pointing.slice() : p.pointing
    };
    // Strathspey lift comes from pointing and accents over an even click grid,
    // so no preset moves the beats themselves.
    cfg.beatStretch = 0;
    return cfg;
  }

  function applyMetroPreset(id) {
    const p = metroPresetById(id);
    if (!p || !metro) return;
    state.metro.presetId = p.id;
    state.metro.speedLevel = 1;      // a preset always lands on Working
    state.metro.modified = false;
    setMetro(presetConfig(p, 1), true);
  }

  function setMetroSpeed(level) {
    const p = metroPresetById(state.metro.presetId);
    if (!p || !metro) return;
    state.metro.speedLevel = level;
    setMetro({ bpm: p.tempos[level] }, true);
  }

  function setMetroBpm(v) {
    if (!metro || !Number.isFinite(v)) { render(); return; }
    const c = metroConfig();
    const bpm = Math.min(c.maxBpm, Math.max(c.minBpm, Math.round(v)));
    const p = metroPresetById(state.metro.presetId);
    // The speed buttons stay lit only while the tempo is still one of theirs.
    state.metro.speedLevel = p ? p.tempos.indexOf(bpm) : -1;
    setMetro({ bpm: bpm }, true);
  }

  // The click is switched off by feeding the engine a volume of zero rather
  // than by muting it there, so the drone carries on underneath — which is the
  // mode a slow air wants.
  function pushMetroVolume() {
    if (!metro) return;
    metro.setConfig({ volume: state.metro.clickOn ? state.metro.volume : 0 });
    state.metro.config = metro.getConfig();
  }

  // strong → normal → soft → silent → strong, from the ring or from Settings.
  function cycleAccent(i) {
    if (!metro) return;
    const accents = metroConfig().accents.slice();
    if (!(i >= 0 && i < accents.length)) return;
    accents[i] = (accents[i] + 3) % 4;
    setMetro({ accents: accents });
  }

  function setMetroSubdivision(k) {
    const range = metroPointRange(k);
    const p = pointScalar(metroConfig().pointing);
    const clamped = Math.min(range[1] / 100, Math.max(range[0] / 100, p));
    // Moving into a denser subdivision can leave the pointing where the onsets
    // would land on top of each other, so it comes back into range with it.
    setMetro({ subdivision: k, pointing: clamped });
  }

  function metroTimeSigChange(v) {
    const parts = String(v).split("/");
    const n = Math.max(1, Math.round(Number(parts[0])) || 4);
    const d = Number(parts[1]);
    if (d === 8) setMetro({ beatsPerBar: Math.max(1, Math.round(n / 3)), compound: true, beatUnit: "dotted4" });
    else if (d === 2) setMetro({ beatsPerBar: n, compound: false, beatUnit: 2 });
    else setMetro({ beatsPerBar: n, compound: false, beatUnit: 4 });
  }

  function syncMetroRef() {
    // The drone is pitched from the chanter's Low A, so it follows the mic
    // calibration rather than keeping a reference of its own.
    if (metro) metro.setConfig({ refHz: state.refA });
  }

  // ── metronome: the ring ──
  //
  // render() rebuilds HTML and is called many times a second while the mic is
  // on, so it must never be what moves the hand. This loop runs only while the
  // metronome is running, reads the engine's position once a frame, and touches
  // nothing but one transform, one class and one string.

  function metroFrame() {
    if (!metro || !metro.isRunning()) { metroRaf = null; return; }
    metroRaf = requestAnimationFrame(metroFrame);

    const c = metroConfig();
    const pos = metro.position();
    const beat = pos.beat > 0 ? pos.beat : 1;
    const raw = (((beat - 1) + pos.phase) / Math.max(1, c.beatsPerBar)) * 360;
    // Angles accumulate instead of wrapping to zero at the downbeat, so the
    // hand only ever turns forwards however the ring is styled: a smaller angle
    // handed to a transitioned transform would sweep back round the dial.
    if (raw < metroHandAngle - 180) metroHandTurns += 360;
    metroHandAngle = raw;
    dom.metroHand.setAttribute("transform",
      "rotate(" + (raw + metroHandTurns).toFixed(2) + " 130 130)");

    const idx = beat - 1;
    if (idx !== metroActivePip) {
      metroPipEls.forEach((pip, i) => pip.classList.toggle("is-active", i === idx));
      metroActivePip = idx;
    }

    // In the fraction of a second between start() and the first scheduled
    // sound there is no event to report yet, so the bar reads 0; the bar that
    // is about to begin is bar 1.
    const bar = Math.max(1, pos.bar);
    const text = pos.countIn > 0 ? "Count-in — " + pos.countIn
      : pos.inGap ? "Bar " + bar + " · silent"
      : "Bar " + bar + " · beat " + beat;
    if (text !== metroPosText) {
      dom.metroPos.textContent = text;
      metroPosText = text;
    }

    const hide = !!(pos.inGap && c.gap.hideVisual);
    if (hide !== metroRingHidden) {
      // Hidden rather than removed, so the card does not resize every gap.
      dom.metroRingWrap.style.visibility = hide ? "hidden" : "";
      metroRingHidden = hide;
    }
  }

  function metroOnBar(info) {
    // Through a gap the point is to keep time unaided, so neither the flash nor
    // the buzz gives the downbeat away.
    if (info.inGap) return;
    if (state.metro.flash && dom.flashLayer) {
      dom.flashLayer.classList.add("is-on");
      clearTimeout(metroFlashTimer);
      metroFlashTimer = setTimeout(() => dom.flashLayer.classList.remove("is-on"), 110);
    }
    if (state.metro.haptics && HAS_VIBRATE) {
      try { navigator.vibrate(35); } catch (err) { /* refused while the page is backgrounded */ }
    }
  }

  function metroOnTempo(bpm) {
    // The ramp moved the tempo, so no speed button describes it any more. The
    // new figure is not saved: the ramp is a drill, not a setting to come back
    // to at its ceiling tomorrow.
    if (!metro) return;
    state.metro.config = metro.getConfig();
    state.metro.speedLevel = -1;
    if (state.view === "metronome") render();
  }

  function metroOnStop() {
    if (metroRaf) { cancelAnimationFrame(metroRaf); metroRaf = null; }
    clearTimeout(metroFlashTimer);
    releaseMetroWake();
    if (dom.flashLayer) dom.flashLayer.classList.remove("is-on");
    if (dom.metroRingWrap) {
      dom.metroRingWrap.style.visibility = "";
      dom.metroRingWrap.classList.remove("is-running");
    }
    metroRingHidden = false;
    render();
  }

  // Screen Wake Lock, where it exists: a metronome on a music stand is being
  // watched, not touched, and the screen dimming mid-tune is the one thing that
  // makes the ring useless.
  function acquireMetroWake() {
    if (!navigator.wakeLock || metroWakeLock) return;
    try {
      navigator.wakeLock.request("screen").then((lock) => {
        if (!metro || !metro.isRunning()) { try { lock.release(); } catch (err) { /* gone */ } return; }
        metroWakeLock = lock;
      }).catch(() => { metroWakeLock = null; });
    } catch (err) { metroWakeLock = null; }
  }

  function releaseMetroWake() {
    if (!metroWakeLock) return;
    const lock = metroWakeLock;
    metroWakeLock = null;
    try { lock.release(); } catch (err) { /* already released */ }
  }

  function startMetronome() {
    if (!metro || metro.isRunning()) return;
    // start() builds the AudioContext, which iOS only hands over inside a
    // gesture — every caller here is a tap or a key press.
    if (!metro.start()) { render(); return; }
    metroHandAngle = 0;
    metroHandTurns = 0;
    metroActivePip = -1;
    metroPosText = "";
    acquireMetroWake();
    if (!metroRaf) metroRaf = requestAnimationFrame(metroFrame);
    render();
  }

  function stopMetronome() {
    if (!metro || !metro.isRunning()) return;
    metro.stop();   // onStop tidies up the loop, the wake lock and the ring
  }

  function toggleMetronome() {
    if (!metro) return;
    if (metro.isRunning()) stopMetronome(); else startMetronome();
  }

  // ── metronome: render ──

  function buildPips(n, accents) {
    let out = "";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;         // 0 is beat one, at twelve o'clock
      const x = 130 + 112 * Math.sin(a);
      const y = 130 - 112 * Math.cos(a);
      const lx = 130 + 134 * Math.sin(a);
      const ly = 130 - 134 * Math.cos(a);
      const r = [7, 5.5, 8, 11][accents[i]];
      out += '<circle class="metro-pip ' + ACCENT_CLASS[accents[i]] + '" data-beat="' + i +
        '" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + r + '"></circle>' +
        '<text class="metro-pip-label" x="' + lx.toFixed(2) + '" y="' + ly.toFixed(2) + '">' +
        (i + 1) + "</text>";
    }
    return out;
  }

  function buildPresetChips(list) {
    return list.map((p) =>
      '<button class="chip metro-preset" type="button" data-preset="' + esc(p.id) + '">' +
      esc(p.label) + "</button>").join("");
  }

  // Where each subdivision falls inside a beat, as a fraction of the beat.
  // Taken from the engine's own maths so a pointed subdivision sits where it
  // will actually sound rather than at an even division of the dial.
  function subFractions(k, pointing) {
    if (PM && PM._pure && PM._pure.subOnsets) return PM._pure.subOnsets(1, k, pointing);
    const out = [];
    for (let i = 0; i < k; i++) out.push(i / k);
    return out;
  }

  function buildTicks(c) {
    const k = c.subdivision;
    if (k <= 1) return "";
    const n = c.beatsPerBar;
    let out = "";
    for (let i = 0; i < n; i++) {
      const p = Array.isArray(c.pointing) ? c.pointing[i % c.pointing.length] : c.pointing;
      subFractions(k, p).forEach((frac, s) => {
        // Index 0 is the beat itself, which already has a pip.
        if (s === 0 || c.subMutes.indexOf(s) !== -1) return;
        const a = ((i + frac) / n) * Math.PI * 2;
        out += '<line class="metro-tick" x1="' + (130 + 99 * Math.sin(a)).toFixed(2) +
          '" y1="' + (130 - 99 * Math.cos(a)).toFixed(2) +
          '" x2="' + (130 + 107 * Math.sin(a)).toFixed(2) +
          '" y2="' + (130 - 107 * Math.cos(a)).toFixed(2) + '"></line>';
      });
    }
    return out;
  }

  function buildAccents(accents) {
    return accents.map((a, i) =>
      '<button class="metro-accent ' + ACCENT_CLASS[a] + '" type="button" data-beat="' + i +
      '" aria-label="Beat ' + (i + 1) + ", " + ACCENT_WORD[a].toLowerCase() + '">' +
      '<span class="metro-accent-num">' + (i + 1) + "</span>" +
      '<span class="metro-accent-word">' + ACCENT_WORD[a] + "</span></button>").join("");
  }

  // The small toggles carry their own label in the markup — "Count-in",
  // "Play a drone" — so the state is shown by the fill and by aria-pressed
  // rather than by rewriting the words underneath the user.
  function toggleBtn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function setNum(input, value) {
    if (input && document.activeElement !== input) input.value = value;
  }

  function renderMetro() {
    const m = state.metro;
    const c = metroConfig();
    const running = !!metro && metro.isRunning();
    const n = c.beatsPerBar;
    const unit = metroUnit(c);

    const sigOf = metroSig(c);
    const pipSig = n + ":" + c.accents.join(",");
    setHtml(dom.metroPips, "metroPips", pipSig, () => buildPips(n, c.accents));
    if (htmlCache.metroPipsBuilt !== pipSig) {
      htmlCache.metroPipsBuilt = pipSig;
      metroPipEls = Array.from(dom.metroPips.querySelectorAll(".metro-pip"));
      metroActivePip = -1;
    }
    if (dom.metroTicks) {
      const tickSig = [n, c.subdivision, JSON.stringify(c.pointing), c.subMutes.join(",")].join("|");
      setHtml(dom.metroTicks, "metroTicks", tickSig, () => buildTicks(c));
    }

    dom.metroBpm.textContent = Math.round(c.bpm);
    dom.metroBeatUnit.textContent = unit.caption;
    if (!running) {
      dom.metroHand.setAttribute("transform", "rotate(0 130 130)");
      dom.metroPos.textContent = METRO_IDLE;
      metroPosText = METRO_IDLE;
      metroPipEls.forEach((pip) => pip.classList.remove("is-active"));
      metroActivePip = -1;
    }

    if (dom.btnMetroRing) dom.btnMetroRing.setAttribute("aria-pressed", running ? "true" : "false");
    setOn(dom.metroRingWrap, running, "is-running");
    if (dom.metroSigLabel) {
      dom.metroSigLabel.textContent = sigOf + " · " + n + (n === 1 ? " beat a bar" : " beats a bar");
    }

    setNum(dom.metroBpmRange, c.bpm);
    setNum(dom.metroBpmInput, Math.round(c.bpm));

    // Bars a minute is the cheapest guard against the unit confusion that put
    // the reel at half speed in an earlier draft of the preset table: it makes
    // two tempos counted in different note values directly comparable.
    if (dom.metroRate) {
      dom.metroRate.innerHTML = '<span style="font-family: \'Noto Music\', serif;">' +
        unit.glyph + "</span> = " + Math.round(c.bpm) + " · " + barsPerMin(c) + " bars a minute";
    }
    if (dom.metroRateHelp) dom.metroRateHelp.textContent = unit.help;

    setHtml(dom.metroPresets, "metroPresets", "built",
      () => buildPresetChips(METRO_PRESETS.filter((p) => p.beginner)));
    setHtml(dom.metroPresetsMore, "metroPresetsMore", "built",
      () => buildPresetChips(METRO_PRESETS.filter((p) => !p.beginner)));
    all(".metro-preset").forEach((b) => {
      const on = b.dataset.preset === m.presetId;
      b.classList.toggle("is-selected", on);
      b.classList.toggle("is-modified", on && m.modified);
    });

    if (dom.metroSpeedChips) {
      dom.metroSpeedChips.querySelectorAll("[data-speed]").forEach((b) => {
        const on = Number(b.dataset.speed) === m.speedLevel;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    const preset = metroPresetById(m.presetId);
    if (dom.metroCaveat) {
      // The caveat is about the kind of tune, not about the settings, so it
      // stays up after a control has been moved.
      const caveat = preset && preset.caveat ? preset.caveat : "";
      dom.metroCaveat.textContent = caveat;
      show(dom.metroCaveat, !!caveat);
    }

    toggleBtn(dom.btnMetroCountIn, c.countInBars > 0);
    toggleBtn(dom.btnMetroClick, m.clickOn);
    toggleBtn(dom.btnMetroPlainBeat, c.subdivision === 1);
    setNum(dom.metroVolume, Math.round(m.volume * 100));
    dom.metroVolumeVal.textContent = Math.round(m.volume * 100);

    chipGroup(dom.metroTimeSig, sigOf);
    chipGroup(dom.metroSubdivision, c.subdivision);

    const accentSig = n + ":" + c.accents.join(",");
    setHtml(dom.metroAccents, "metroAccents", accentSig, () => buildAccents(c.accents));

    // The slider's range narrows with the subdivision so it cannot ask for two
    // onsets ten milliseconds apart; see POINT_RANGE above.
    const range = metroPointRange(c.subdivision);
    dom.metroPointing.min = String(range[0]);
    dom.metroPointing.max = String(range[1]);
    dom.metroPointing.disabled = c.subdivision === 1;
    const point = Math.round(pointScalar(c.pointing) * 100);
    setNum(dom.metroPointing, point);
    dom.metroPointingVal.textContent = c.subdivision === 1 ? "—" : point;

    setNum(dom.metroPulse, Math.round(c.beatStretch * 100));
    dom.metroPulseVal.textContent = Math.round(c.beatStretch * 100);

    toggleBtn(dom.btnMetroGap, c.gap.on);
    show(dom.gapSettings, c.gap.on);
    setNum(dom.metroGapPlay, c.gap.playBars);
    setNum(dom.metroGapMute, c.gap.muteBars);
    toggleBtn(dom.btnMetroGapHide, c.gap.hideVisual);

    toggleBtn(dom.btnMetroRamp, c.ramp.on);
    show(dom.rampSettings, c.ramp.on);
    setNum(dom.metroRampBars, c.ramp.everyBars);
    setNum(dom.metroRampStep, c.ramp.stepBpm);
    setNum(dom.metroRampMax, Math.round(c.ramp.maxBpm));

    toggleBtn(dom.btnMetroDrone, c.drone.on);
    show(dom.droneSettings, c.drone.on);
    setNum(dom.metroDroneLevel, Math.round(c.drone.level * 100));
    dom.metroDroneVal.textContent = Math.round(c.drone.level * 100);

    chipGroup(dom.metroSound, c.clickSound);
    toggleBtn(dom.btnMetroFlash, m.flash);
    toggleBtn(dom.btnMetroHaptics, m.haptics);

    // The metronome page keeps only the tempo and the tune type; everything
    // else that is switched on is summarised there and edited in Settings.
    if (dom.metroExtras) {
      const extras = [];
      if (c.subdivision > 1) extras.push(c.subdivision + " clicks a beat");
      const point = Math.round(pointScalar(c.pointing) * 100);
      if (c.subdivision > 1 && point !== 50) {
        extras.push((point > 50 ? "pointed " : "snap ") + point);
      }
      if (c.beatStretch > 0) extras.push("beat stretch " + Math.round(c.beatStretch * 100));
      if (c.countInBars > 0) extras.push("count-in");
      if (!m.clickOn) extras.push("click off");
      if (c.clickSound !== "click") extras.push(c.clickSound + " click");
      if (c.gap.on) extras.push("silent bars " + c.gap.playBars + "+" + c.gap.muteBars);
      if (c.ramp.on) {
        extras.push("ramp +" + c.ramp.stepBpm + " every " + c.ramp.everyBars +
          " bars to " + Math.round(c.ramp.maxBpm));
      }
      if (c.drone.on) extras.push("drone");
      if (m.flash) extras.push("flash");
      if (m.haptics) extras.push("buzz");
      dom.metroExtras.textContent = extras.length
        ? extras.join(" · ")
        : "Nothing — a plain click, one a beat.";
    }
  }

  function render() {
    const s = state;
    const isPatterns = s.view === "patterns";
    const isMetro = s.view === "metronome";
    const inGame = s.mode === "game";
    const note = (inGame ? NOTES[s.gameOrder[s.gameIdx]] : NOTES[s.order[s.idx]]) || NOTES[0];
    const pseq = seq();

    const isSettings = s.view === "settings";
    const isCards = !isPatterns && !isMetro && !isSettings;

    show(dom.cardsView, isCards);
    show(dom.patternsView, isPatterns);
    show(dom.metronomeView, isMetro);
    show(dom.settingsView, isSettings);
    setOn(dom.tabCards, isCards);
    setOn(dom.tabPatterns, isPatterns);
    setOn(dom.tabMetronome, isMetro);
    setOn(dom.tabSettings, isSettings);

    dom.heading.textContent = inGame ? "Listening round" : "Flashcards";
    dom.counter.textContent = inGame
      ? s.score + " / " + GAME_LENGTH
      : (s.idx + 1) + " / " + s.order.length;
    setOn(dom.counter, true);
    if (dom.counterLabel) dom.counterLabel.textContent = inGame ? "score" : "this session";

    setOn(dom.btnThemeLight, s.theme !== "dark");
    setOn(dom.btnThemeDark, s.theme === "dark");
    if (dom.micStateLabel) {
      dom.micStateLabel.textContent = s.micError
        ? "Blocked — allow it in your browser settings"
        : s.listening ? "On" + (s.heard ? " — hearing " + s.heard : "") : "Off";
    }

    if (isPatterns) renderPatterns();
    // Settings holds the metronome's own controls, so it renders them too.
    if ((isMetro || isSettings) && metro) renderMetro();

    const fingering = s.cardFace === "fingering";
    setOn(dom.tabFaceStaff, !fingering);
    setOn(dom.tabFaceFinger, fingering);
    dom.staffSvg.style.display = fingering ? "none" : "";
    dom.chanterImg.style.display = fingering ? "" : "none";
    if (fingering) {
      const src = FINGERING_SRC[note.name];
      if (src && !dom.chanterImg.src.endsWith(src)) dom.chanterImg.src = src;
      dom.chanterImg.alt = note.name + " fingering";
    }

    dom.ledgerLine.style.display = note.ledger ? "" : "none";
    dom.noteHead.setAttribute("cy", note.y);
    dom.noteHead.setAttribute("transform", "rotate(-22 170 " + note.y + ")");
    dom.noteStem.setAttribute("y", note.y);
    dom.noteName.textContent = note.name;
    dom.noteHint.textContent = note.hint;

    dom.cardInner.classList.toggle("flipped", s.flipped);
    // While a modal is up, the card must not intercept clicks meant for the
    // modal's buttons (Safari routes them to the 3D flip layer otherwise).
    dom.card.style.pointerEvents = (s.dialogStep > 0 || s.mode === "result") ? "none" : "";
    setOn(dom.cardFront, s.cardResult === "right", "is-right");
    setOn(dom.cardFront, s.cardResult === "wrong", "is-wrong");
    if (dom.cardTapHint) dom.cardTapHint.textContent = s.flipped ? "" : "tap to reveal";

    // The card carries the same running commentary the drill page does, so the
    // instruction is never off the bottom of a phone screen.
    if (dom.cardStatus) {
      dom.cardStatus.textContent = s.micError
        ? "The microphone is blocked — allow it in your browser settings, then try again."
        : s.cardResult === "right" ? "Yes — " + note.name + "."
        : s.cardResult === "wrong" ? "Not that one — keep trying."
        : s.flipped ? "It's " + note.name + " · " + note.hint + "."
        : s.listening
          ? (fingering ? "Play the note this fingering makes." : "Play the note you see.")
          : (fingering ? "Which note is this fingering?" : "What note is this?");
    }

    dom.btnPlay.textContent = s.playing ? "Pause" : "Play";
    setOn(dom.btnPlay, s.playing);

    dom.btnGame.textContent = inGame ? "End round" : "Listening round";
    setOn(dom.btnGame, inGame);

    dom.bpmVals.forEach((v) => { if (document.activeElement !== v) v.value = s.bpm; });
    dom.bpmSliders.forEach((sl) => { if (document.activeElement !== sl) sl.value = s.bpm; });

    const cycle = inGame ? s.beatsPerCard : s.beatsPerCard + (s.autoFlip ? 1 : 0);
    let dotsHtml = "";
    for (let i = 1; i <= cycle; i++) {
      const on = s.playing && s.beat === i;
      const answer = !inGame && s.autoFlip && i === cycle;
      dotsHtml += '<div class="beat-dot' + (answer ? " is-answer" : "") +
        (on ? " is-on" : "") + '"></div>';
    }
    dom.beatDots.innerHTML = dotsHtml;

    dom.listenBtns.forEach((b) => {
      if (b.classList.contains("switch")) {
        b.classList.toggle("is-on", s.listening);
        b.setAttribute("aria-pressed", s.listening ? "true" : "false");
        return;
      }
      b.textContent = s.micError ? s.micError : s.listening ? "Mic on" : "Mic off";
      b.classList.toggle("is-on", s.listening);
    });

    dom.heardLabels.forEach((h) => {
      h.textContent = !s.listening ? "Off" : s.heard ? s.heard : "—";
      h.classList.toggle("is-right", s.judged === "right");
      h.classList.toggle("is-wrong", s.judged === "wrong");
      h.classList.toggle("is-heard", !s.judged && !!s.heard);
    });

    dom.centsLabels.forEach((c) => {
      c.textContent = s.listening && s.heard ? (s.cents > 0 ? "+" : "") + s.cents + "¢" : "";
    });
    dom.centsMarkers.forEach((m) => {
      m.style.opacity = s.heard ? 1 : 0;
      m.style.left = (50 + Math.max(-46, Math.min(46, (s.cents / 50) * 46))) + "%";
      m.classList.toggle("is-close", Math.abs(s.cents) < 15);
    });

    dom.refInputs.forEach((r) => { if (document.activeElement !== r) r.value = s.refA; });

    // Result modal
    show(dom.resultOverlay, s.mode === "result");
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
        '<div class="result-chip' + (r.hit ? " is-hit" : "") + '">' + r.name + "</div>"
      ).join("");
      const missed = s.results.filter((r) => !r.hit).map((r) => r.name);
      show(dom.missedLine, missed.length > 0);
      dom.missedLine.textContent = missed.length ? "Missed: " + missed.join(", ") : "";
    }

    // Listening dialog
    show(dom.dialogOverlay, s.dialogStep > 0);
    if (s.dialogStep > 0) {
      dom.dialogTitle.textContent = DIALOG_TITLES[s.dialogStep];
      dom.dialogStepLabel.textContent = "Step " + Math.min(3, s.dialogStep) + " of 3";
      dom.dialogBody.textContent = DIALOG_BODIES[s.dialogStep];

      dom.levelFill.style.width = Math.round(s.level * 100) + "%";
      setOn(dom.levelFill, s.level > 0.06, "is-loud");
      dom.levelLabel.textContent = s.level > 0.06 ? "Sound" : "Silent";

      show(dom.tunePanel, s.dialogStep === 2);
      if (s.dialogStep === 2) {
        dom.calLabel.textContent = s.calHz ? s.calHz + " Hz" : "—";
        dom.dialogRefA.textContent = s.refA + " Hz";
      }

      show(dom.scaleGrid, s.dialogStep === 3);
      if (s.dialogStep === 3) {
        dom.scaleGrid.innerHTML = NOTES.map((n, i) =>
          '<div class="scale-cell' +
          (i < s.checkIdx ? " is-done"
            : i === s.checkIdx ? (s.judged === "wrong" ? " is-wrong" : " is-now") : "") +
          '">' + n.name + "</div>"
        ).join("");
      }

      dom.btnDialogNext.textContent =
        s.dialogStep === 1 ? "Sounds right"
        : s.dialogStep === 2 ? (s.calHz ? "Use " + s.calHz + " Hz" : "Waiting…")
        : s.checkIdx >= NOTES.length ? "Start practising" : "Done checking";
      dom.btnDialogNext.disabled = s.dialogStep === 2 && !s.calHz;
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
      syncMetroRef();
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
  dom.tabSettings.addEventListener("click", () => setView("settings"));

  function setTheme(name) {
    state.theme = name === "dark" ? "dark" : "light";
    applyTheme();
    saveTheme();
    render();
  }
  dom.btnThemeLight.addEventListener("click", () => setTheme("light"));
  dom.btnThemeDark.addEventListener("click", () => setTheme("dark"));

  // Calibration is the mic dialog, which opening the mic already starts; with
  // the mic already on it goes back to the top of it.
  dom.btnCalibrate.addEventListener("click", () => {
    if (!state.listening) { startListening(); return; }
    state.dialogStep = 1;
    state.calHz = 0;
    state.checkIdx = 0;
    render();
  });

  dom.btnOpenPicker.addEventListener("click", () => { state.pickerOpen = true; render(); });
  dom.btnClosePicker.addEventListener("click", () => { state.pickerOpen = false; render(); });

  dom.tabBuildNotes.addEventListener("click", () => { state.buildGraces = false; render(); });
  dom.tabBuildGraces.addEventListener("click", () => { state.buildGraces = true; render(); });

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
    if (!btn) return;
    state.pickerOpen = false;
    pickPattern(btn.dataset.pattern);
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
  dom.btnHear.addEventListener("click", () => (state.demoing ? stopDemo() : playDemo()));
  dom.btnLoop.addEventListener("click", () => {
    state.loop = !state.loop;
    // turned back on while the last pass was already winding down — start over
    if (state.demoing && state.loop && !demoSchedTimer) playDemo();
    render();
  });
  dom.btnClearHistory.addEventListener("click", () => { state.history = []; saveHistory(); render(); });
  dom.btnFreeMetro.addEventListener("click", toggleFreeMetro);

  dom.btnLag.addEventListener("click", toggleLag);
  dom.btnLagUp.addEventListener("click", () => setLagMs(lagMs() + LAG_STEP_MS));
  dom.btnLagDown.addEventListener("click", () => setLagMs(lagMs() - LAG_STEP_MS));
  dom.lagInput.addEventListener("focus", () => dom.lagInput.select());
  dom.lagInput.addEventListener("blur", () => setLagMs(parseFloat(dom.lagInput.value)));
  dom.lagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") dom.lagInput.blur();
    else if (e.key === "Escape") { dom.lagInput.value = lagMs(); dom.lagInput.blur(); }
  });

  dom.btnExitGame.addEventListener("click", exitGame);
  dom.btnPlayAgain.addEventListener("click", startGame);
  dom.btnDialogCancel.addEventListener("click", stopListening);
  dom.btnDialogSkip.addEventListener("click", dialogSkip);
  dom.btnDialogNext.addEventListener("click", dialogNext);

  // ── metronome wiring ──

  // Added by the markup revision that turns the ring into a start button and
  // adds a plain-beat shortcut. Both are wired if they are there and skipped
  // quietly if they are not, since this file does not own index.html.
  dom.btnMetroRing = el("btnMetroRing");
  dom.btnMetroPlainBeat = el("btnMetroPlainBeat");

  if (!PM) {
    // metronome.js failed to load. A hidden tab is better than a dead view, and
    // the scales page's plain beat runs on the same engine, so it goes too.
    dom.tabMetronome.hidden = true;
    dom.metronomeView.hidden = true;
    dom.btnFreeMetro.hidden = true;
  } else {
    buildMetroExtras();

    metro = PM.create({
      getContext: () => audio(),
      onBar: metroOnBar,
      onTempoChange: metroOnTempo,
      onStop: metroOnStop,
      config: Object.assign({}, state.metro.config || {}, { refHz: state.refA })
    });

    // The engine validates whatever came out of storage, so its own copy is the
    // one worth keeping. With nothing stored, land on a preset rather than on
    // the engine's bare defaults.
    if (state.metro.config) state.metro.config = metro.getConfig();
    else applyMetroPreset(state.metro.presetId);
    pushMetroVolume();

    // iOS Safari has no vibrate at all, so the control is removed rather than
    // left there doing nothing.
    if (!HAS_VIBRATE) {
      dom.metroHapticsGroup.hidden = true;
      state.metro.haptics = false;
    }
    saveMetro();

    dom.tabMetronome.addEventListener("click", () => setView("metronome"));
    if (dom.btnMetroPlay) dom.btnMetroPlay.addEventListener("click", toggleMetronome);
    if (dom.btnMetroRing) dom.btnMetroRing.addEventListener("click", toggleMetronome);
    if (dom.btnGoSettings) dom.btnGoSettings.addEventListener("click", () => setView("settings"));

    // The beat pips are the accent editor as well: the design puts the accents
    // where you are already looking rather than in a separate row.
    dom.metroPips.addEventListener("click", (e) => {
      const pip = e.target.closest("[data-beat]");
      if (pip) cycleAccent(Number(pip.dataset.beat));
    });

    dom.btnMetroTap.addEventListener("click", () => {
      const bpm = metro.tapTempo();     // the engine has already applied it
      if (bpm === null) return;
      const p = metroPresetById(state.metro.presetId);
      state.metro.speedLevel = p ? p.tempos.indexOf(bpm) : -1;
      state.metro.config = metro.getConfig();
      saveMetro();
      render();
    });

    dom.btnMetroBpmDown.addEventListener("click", () => setMetroBpm(metroConfig().bpm - 1));
    dom.btnMetroBpmUp.addEventListener("click", () => setMetroBpm(metroConfig().bpm + 1));
    dom.metroBpmRange.addEventListener("input", (e) => setMetroBpm(Number(e.target.value)));
    dom.metroBpmInput.addEventListener("focus", () => dom.metroBpmInput.select());
    dom.metroBpmInput.addEventListener("blur", () => setMetroBpm(parseFloat(dom.metroBpmInput.value)));
    dom.metroBpmInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") dom.metroBpmInput.blur();
      else if (e.key === "Escape") { dom.metroBpmInput.value = Math.round(metroConfig().bpm); dom.metroBpmInput.blur(); }
    });

    [dom.metroPresets, dom.metroPresetsMore].forEach((box) => {
      box.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-preset]");
        if (btn) applyMetroPreset(btn.dataset.preset);
      });
    });
    if (dom.metroSpeedChips) {
      dom.metroSpeedChips.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-speed]");
        if (btn) setMetroSpeed(Number(btn.dataset.speed));
      });
    }

    // The count-in, the click, the volume and everything in the drawer below
    // the accent editor are not part of what a tune-type chip claims, so they
    // pass keepPreset and leave the chip alone. Only the settings a preset
    // actually writes — signature, subdivision, accents, pointing, stretch —
    // mark it edited.
    dom.btnMetroCountIn.addEventListener("click",
      () => setMetro({ countInBars: metroConfig().countInBars > 0 ? 0 : 1 }, true));
    dom.btnMetroClick.addEventListener("click", () => {
      state.metro.clickOn = !state.metro.clickOn;
      pushMetroVolume();
      saveMetro();
      render();
    });
    dom.metroVolume.addEventListener("input", (e) => {
      state.metro.volume = Math.min(1, Math.max(0, Number(e.target.value) / 100));
      pushMetroVolume();
      saveMetro();
      render();
    });

    dom.metroTimeSig.addEventListener("click", (e) => {
      const b = e.target.closest("[data-val]");
      if (b) metroTimeSigChange(b.dataset.val);
    });
    dom.metroSubdivision.addEventListener("click", (e) => {
      const b = e.target.closest("[data-val]");
      if (b) setMetroSubdivision(Number(b.dataset.val));
    });
    if (dom.btnMetroPlainBeat) {
      dom.btnMetroPlainBeat.addEventListener("click", () => {
        const k = metroConfig().subdivision;
        if (k !== 1) { metroLastSub = k; setMetroSubdivision(1); return; }
        const p = metroPresetById(state.metro.presetId);
        setMetroSubdivision(metroLastSub || (p ? p.subdivision : 2));
      });
    }

    dom.metroAccents.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-beat]");
      if (btn) cycleAccent(Number(btn.dataset.beat));
    });

    dom.metroPointing.addEventListener("input",
      (e) => setMetro({ pointing: Number(e.target.value) / 100 }));
    dom.metroPulse.addEventListener("input",
      (e) => setMetro({ beatStretch: Number(e.target.value) / 100 }));

    dom.btnMetroGap.addEventListener("click",
      () => setMetro({ gap: { on: !metroConfig().gap.on } }, true));
    dom.metroGapPlay.addEventListener("change",
      (e) => setMetro({ gap: { playBars: Number(e.target.value) } }, true));
    dom.metroGapMute.addEventListener("change",
      (e) => setMetro({ gap: { muteBars: Number(e.target.value) } }, true));
    dom.btnMetroGapHide.addEventListener("click",
      () => setMetro({ gap: { hideVisual: !metroConfig().gap.hideVisual } }, true));

    dom.btnMetroRamp.addEventListener("click",
      () => setMetro({ ramp: { on: !metroConfig().ramp.on } }, true));
    dom.metroRampBars.addEventListener("change",
      (e) => setMetro({ ramp: { everyBars: Number(e.target.value) } }, true));
    dom.metroRampStep.addEventListener("change",
      (e) => setMetro({ ramp: { stepBpm: Number(e.target.value) } }, true));
    dom.metroRampMax.addEventListener("change",
      (e) => setMetro({ ramp: { maxBpm: Number(e.target.value) } }, true));

    dom.btnMetroDrone.addEventListener("click",
      () => setMetro({ drone: { on: !metroConfig().drone.on }, refHz: state.refA }, true));
    dom.metroDroneLevel.addEventListener("input",
      (e) => setMetro({ drone: { level: Number(e.target.value) / 100 } }, true));
    dom.metroSound.addEventListener("click", (e) => {
      const b = e.target.closest("[data-val]");
      if (b) setMetro({ clickSound: b.dataset.val }, true);
    });

    dom.btnMetroFlash.addEventListener("click", () => {
      state.metro.flash = !state.metro.flash;
      if (!state.metro.flash) dom.flashLayer.classList.remove("is-on");
      saveMetro();
      render();
    });
    dom.btnMetroHaptics.addEventListener("click", () => {
      state.metro.haptics = !state.metro.haptics;
      saveMetro();
      render();
    });

    document.addEventListener("visibilitychange", () => {
      // The browser drops a screen wake lock whenever the page is hidden, so a
      // metronome still running when you come back has to ask for another one.
      if (!document.hidden && metro.isRunning()) acquireMetroWake();
    });
  }

  window.addEventListener("keydown", (e) => {
    // A key event dispatched at the document rather than an element has no
    // matches(), and an exception here would take the whole handler down with
    // it — including the metronome's space bar.
    const t = e.target;
    if (t && typeof t.matches === "function" && t.matches("input, select, textarea")) return;
    if (state.dialogStep) return;
    if (state.view === "settings") return;
    if (state.pickerOpen) return;
    if (state.view === "metronome") {
      if (e.key === " ") { e.preventDefault(); toggleMetronome(); }
      return;
    }
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
