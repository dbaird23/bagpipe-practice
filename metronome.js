// Piper's Metronome — timing and audio engine. No DOM, no rendering: the host
// owns every pixel. The engine owns the clock, the click and the drone.
//
// Everything is scheduled against the AudioContext clock. A setInterval or a
// requestAnimationFrame is only ever a prompt to top the schedule up; nothing
// about when a sound lands is decided by wall-clock time, because both of those
// timers are throttled the moment the tab loses focus and a metronome that
// stutters when you glance at another app is worse than no metronome.
//
// Public surface:
//   PipeMetronome.create(opts) -> engine
//   PipeMetronome.DEFAULTS      the config shape, for the host to clone
//   PipeMetronome._pure         the timing maths, DOM-free and testable
(() => {
  "use strict";

  // ── constants ──

  const SCHED_INTERVAL = 25;      // ms between top-ups of the schedule
  const LOOKAHEAD = 0.15;         // s of audio committed in advance, foreground
  // Background timers are throttled to *at least* a second, and a deeply
  // backgrounded tab can be pushed far past that. A window only as wide as the
  // throttle leaves no margin at all, so this is deliberately generous: the cost
  // is that a config change takes up to two seconds to be heard while you are
  // not looking, which nobody can notice.
  const LOOKAHEAD_HIDDEN = 2.0;
  const START_PAD = 0.12;         // s of headroom before the first sound
  const MIN_GAP = 0.001;          // s; nothing may be scheduled on top of itself
  const CATCHUP = 0.02;           // s late before an event is skipped, not rushed
  const MAX_PER_TICK = 256;       // events one tick may schedule
  const MAX_CATCHUP = 4096;       // events one tick may skip while catching up
  const QUEUE_MAX = 512;          // scheduled events kept for position()

  const ACCENT_SILENT = 0;
  const ACCENT_SOFT = 1;
  const ACCENT_NORMAL = 2;
  const ACCENT_STRONG = 3;

  const SUBDIVISIONS = [1, 2, 3, 4, 6];
  // Pointing below 0.5 is the Scots snap: short then long, the figure a
  // strathspey is named for. The bounds are not taste, they are arithmetic —
  // the pair split is s*p / s*(1-p), so p reaching 0 or 1 would collapse one of
  // the two notes onto the onset beside it and break strictly-increasing onsets.
  const POINT_MIN = 0.15;
  const POINT_MAX = 0.85;
  const CLICK_CAP = 0.9;          // the click must not clip at full volume
  const DRONE_RAMP = 0.06;        // s; a drone that starts instantly clicks
  const TAP_RESET = 2.0;          // s of silence that ends a tap sequence
  const TAP_MAX = 6;              // taps averaged; older ones are stale

  const DEFAULTS = {
    bpm: 72,
    beatsPerBar: 4,
    beatUnit: 4,
    compound: false,
    subdivision: 1,
    subMutes: [],
    accents: [3, 2, 2, 2],
    pointing: 0.5,
    beatStretch: 0,
    countInBars: 1,
    gap: { on: false, playBars: 4, muteBars: 4, hideVisual: false },
    ramp: { on: false, everyBars: 4, stepBpm: 2, maxBpm: 120 },
    drone: { on: false, level: 0.10 },
    clickSound: "click",
    volume: 0.8,
    refHz: 235,
    minBpm: 30,
    maxBpm: 240
  };

  // ── pure timing maths ──
  //
  // Nothing below touches an AudioContext, a document or a timer, so the host
  // can preview a bar without starting one and the test suite can check the
  // figures in Node. The scheduler calls exactly these functions, so what the
  // tests prove is what you hear.

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  function clampNum(v, lo, hi, fallback) {
    if (!isNum(v)) return fallback;
    return Math.min(hi, Math.max(lo, v));
  }

  function clampInt(v, lo, hi, fallback) {
    const n = Math.round(Number(v));
    if (!isNum(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  }

  // Pointing is a ratio, not a duration, which is why one rule covers every
  // figure a piper points. 0.5 is even, above it is the dot and cut of a march,
  // below it is the snap of a strathspey.
  function clampOnePointing(p) {
    return clampNum(p, POINT_MIN, POINT_MAX, 0.5);
  }

  // pointing may be a single number for the whole bar or one value per beat.
  // The per-beat form is what a strathspey needs: [0.85, 0.80, 0.85, 0.80]
  // points the first and third beats harder than the second and fourth, which is
  // the shape of the tune rather than a uniform swing setting.
  function pointingFor(pointing, beatIndex) {
    if (Array.isArray(pointing) && pointing.length) {
      const n = pointing.length;
      return clampOnePointing(pointing[((beatIndex % n) + n) % n]);
    }
    return clampOnePointing(pointing);
  }

  function clampPointing(p) {
    return pointingFor(p, 0);
  }

  // Tempo is clamped only against arithmetic here, not against taste. Musical
  // limits are the host's minBpm/maxBpm and are applied in normalizeConfig.
  function safeBpm(bpm) {
    return clampNum(bpm, 1, 1000, DEFAULTS.bpm);
  }

  function beatsPerBarOf(cfg) {
    return clampInt(cfg && cfg.beatsPerBar, 1, 16, DEFAULTS.beatsPerBar);
  }

  function subdivisionOf(cfg) {
    const k = clampInt(cfg && cfg.subdivision, 1, 6, DEFAULTS.subdivision);
    return SUBDIVISIONS.indexOf(k) !== -1 ? k : 1;
  }

  // The nominal beat. In compound time the beat is the dotted value and bpm
  // still counts beats, so this is unchanged — it is the caption in the UI, not
  // the arithmetic, that has to say which note value the number means.
  function baseBeat(bpm) {
    return 60 / safeBpm(bpm);
  }

  function barDuration(beatsPerBar, bpm) {
    return clampInt(beatsPerBar, 1, 16, DEFAULTS.beatsPerBar) * baseBeat(bpm);
  }

  // Beat stretch — not "pulsing". A piper pulsing a strathspey lengthens the
  // dotted *note* inside a metrically steady bar; the beat itself does not move.
  // A metronome whose clicks move is useless as a timing reference, because the
  // learner can no longer tell "I am out of time" from "the click moved". So
  // this defaults to 0 everywhere, strathspey feel comes from per-beat pointing
  // and accents, and this parameter exists only for someone who has decided they
  // want it.
  //
  // Whatever it is set to, the bar still lasts exactly N * 60/bpm. Time borrowed
  // by one beat is repaid by the others, so a stretched bar stays in step with
  // anyone playing alongside it and the swing reads as lift rather than drift.
  function beatDurations(beatsPerBar, bpm, stretch) {
    const n = clampInt(beatsPerBar, 1, 16, DEFAULTS.beatsPerBar);
    const base = baseBeat(bpm);
    const a = clampNum(stretch, 0, 0.15, 0);
    const out = [];
    if (n === 1) return [base];
    if (n % 2 === 0) {
      // Even bars pair off: each long beat has a short partner to borrow from.
      for (let i = 0; i < n; i++) out.push(i % 2 === 0 ? base * (1 + a) : base * (1 - a));
      return out;
    }
    // An odd bar has no such pairing, and alternating long-short-long through it
    // gives a lurch no piper plays. Lift the first beat only — which is where a
    // 3/4 or 9/8 is actually leaned on — and spread the repayment evenly over
    // the rest of the bar.
    const repay = (base * a) / (n - 1);
    for (let i = 0; i < n; i++) out.push(i === 0 ? base * (1 + a) : base - repay);
    return out;
  }

  // A triplet is a pointed pair filling the first two thirds of the span, then a
  // fixed final third. One rule, two useful endpoints: at p = 0.5 it is an even
  // triplet, and at p = 0.75 it is the "Am-ster-dam" dot and cut that a 6/8
  // march is built out of.
  function tripletOnsets(start, span, p) {
    const pair = (2 * span) / 3;
    return [start, start + pair * p, start + pair];
  }

  // Where each sound inside one beat of duration d falls. Every figure here is
  // the same rule at a different level: a pair of notes filling a span s splits
  // s*p / s*(1-p). Onsets are offsets from the start of the beat, strictly
  // increasing, and all strictly less than d.
  //
  // Every rule is symmetric about p = 0.5, so p < 0.5 needs no special case: it
  // simply moves the inner onset of each pair earlier and produces the snap.
  // Only the clamp had to widen.
  function subOnsets(d, k, pointing) {
    const p = clampPointing(pointing);
    const n = clampInt(k, 1, 6, 1);
    if (n === 1) return [0];
    if (n === 2) return [0, d * p];
    if (n === 3) return tripletOnsets(0, d, p);
    if (n === 4) return [0, (d / 2) * p, d / 2, d / 2 + (d / 2) * p];
    if (n === 6) return tripletOnsets(0, d / 2, p).concat(tripletOnsets(d / 2, d / 2, p));
    // 5 is not a figure anyone points, so it divides evenly rather than failing.
    const out = [];
    for (let i = 0; i < n; i++) out.push((d * i) / n);
    return out;
  }

  // How hard one sound is struck. A subdivision sits one level under the beat it
  // decorates but never falls silent with it: "click on 1 and 3 only" is written
  // as silent beats whose subdivisions still tick, which is how a strathspey is
  // counted and why accent 0 does not reach the offbeats.
  function accentAt(accents, beat, sub, subMutes) {
    // Index 0 is the beat itself and belongs to accents, so subMutes only ever
    // speaks for 1..k-1.
    if (sub > 0 && Array.isArray(subMutes) && subMutes.indexOf(sub) !== -1) return ACCENT_SILENT;
    const list = Array.isArray(accents) ? accents : [];
    const raw = list.length ? list[((beat % list.length) + list.length) % list.length] : undefined;
    const fallback = beat === 0 ? ACCENT_STRONG : ACCENT_NORMAL;
    const level = clampInt(raw, ACCENT_SILENT, ACCENT_STRONG, fallback);
    if (sub === 0) return level;
    return Math.max(ACCENT_SOFT, level - 1);
  }

  // Everything the scheduler needs to lay out one beat.
  function beatPlan(cfg, beatIndex) {
    const n = beatsPerBarOf(cfg);
    const i = ((beatIndex % n) + n) % n;
    const duration = beatDurations(n, cfg.bpm, cfg.beatStretch)[i];
    const offsets = subOnsets(duration, subdivisionOf(cfg), pointingFor(cfg.pointing, i));
    const accents = offsets.map((unused, s) => accentAt(cfg.accents, i, s, cfg.subMutes));
    return { beat: i, duration: duration, offsets: offsets, accents: accents };
  }

  // The count-in is deliberately plain: no subdivisions, no stretch, and every
  // beat sounds whatever the accent pattern says, because its only job is to
  // hand you the tempo before the bar you are actually counting.
  function countInBeatPlan(cfg, beatIndex) {
    const n = beatsPerBarOf(cfg);
    const i = ((beatIndex % n) + n) % n;
    return {
      beat: i,
      duration: baseBeat(cfg.bpm),
      offsets: [0],
      accents: [i === 0 ? ACCENT_STRONG : ACCENT_NORMAL]
    };
  }

  // Which bars the gap trainer silences. barIndex is 0-based and counts music
  // bars only — the count-in is never part of the cycle.
  function isGapBar(barIndex, gap) {
    if (!gap || !gap.on) return false;
    const play = clampInt(gap.playBars, 0, 64, 4);
    const mute = clampInt(gap.muteBars, 0, 64, 4);
    if (mute <= 0) return false;
    if (play <= 0) return true;
    const cycle = play + mute;
    const i = ((barIndex % cycle) + cycle) % cycle;
    return i >= play;
  }

  function shouldRamp(barsCompleted, everyBars) {
    const n = clampInt(everyBars, 1, 512, 4);
    return barsCompleted > 0 && barsCompleted % n === 0;
  }

  // The ramp walks towards maxBpm and stops dead there. A negative step is
  // allowed so the same control can wind a tune back down to a tempo you can
  // actually play it at.
  function rampBpm(bpm, ramp) {
    const step = isNum(ramp && ramp.stepBpm) ? ramp.stepBpm : 0;
    const target = ramp && ramp.maxBpm;
    const next = bpm + step;
    if (!isNum(target)) return next;
    return step >= 0 ? Math.min(target, next) : Math.max(target, next);
  }

  // One bar laid out end to end, as offsets from the start of the bar. The
  // scheduler does not use this — it walks beat by beat so a config change can
  // land mid-bar — but it is built from the same primitives, and it gives the
  // host a way to preview a bar and the tests a way to check a whole one.
  function barEvents(cfg, barIndex) {
    const n = beatsPerBarOf(cfg);
    const muted = isGapBar(barIndex, cfg.gap);
    const events = [];
    let at = 0;
    for (let b = 0; b < n; b++) {
      const plan = beatPlan(cfg, b);
      for (let s = 0; s < plan.offsets.length; s++) {
        const accent = plan.accents[s];
        events.push({
          bar: barIndex,
          beat: b,
          sub: s,
          time: at + plan.offsets[s],
          accent: accent,
          silent: muted || accent === ACCENT_SILENT
        });
      }
      at += plan.duration;
    }
    return { duration: at, events: events };
  }

  // pointing round-trips as whatever shape it arrived in — a scalar stays a
  // scalar, an array stays an array of the same length — because the host echoes
  // getConfig() straight back into the preset chips and a flattened array would
  // silently turn a strathspey back into an even grid.
  function normalizePointing(raw) {
    if (Array.isArray(raw) && raw.length) {
      const out = [];
      for (let i = 0; i < raw.length; i++) out.push(clampOnePointing(raw[i]));
      return out;
    }
    return clampOnePointing(raw);
  }

  // accents is always exactly beatsPerBar long. A short array padded with normal
  // and a long one truncated: a 4-beat default left against a 2-beat preset
  // would otherwise accent bars that do not exist.
  function normalizeAccents(raw, beatsPerBar) {
    const list = Array.isArray(raw) ? raw : DEFAULTS.accents;
    const out = [];
    for (let i = 0; i < beatsPerBar; i++) {
      out.push(clampInt(list[i], ACCENT_SILENT, ACCENT_STRONG, i === 0 ? ACCENT_STRONG : ACCENT_NORMAL));
    }
    return out;
  }

  function normalizeSubMutes(raw, k) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const v = Math.round(Number(raw[i]));
      // 0 is the beat and belongs to accents; anything past k-1 has no sound to
      // silence, and either one arriving means the config was written for a
      // different subdivision.
      if (isNum(v) && v >= 1 && v < k && out.indexOf(v) === -1) out.push(v);
    }
    return out.sort((a, b) => a - b);
  }

  // The host persists config to localStorage, so anything at all may come back.
  // Everything is coerced into range here rather than defended against at every
  // use site.
  function normalizeConfig(raw) {
    const c = raw && typeof raw === "object" ? raw : {};
    const minBpm = clampInt(c.minBpm, 20, 400, DEFAULTS.minBpm);
    const maxBpm = Math.max(minBpm + 1, clampInt(c.maxBpm, 20, 400, DEFAULTS.maxBpm));
    const beatsPerBar = clampInt(c.beatsPerBar, 1, 16, DEFAULTS.beatsPerBar);
    const subdivision = subdivisionOf(c);
    const gap = c.gap && typeof c.gap === "object" ? c.gap : DEFAULTS.gap;
    const ramp = c.ramp && typeof c.ramp === "object" ? c.ramp : DEFAULTS.ramp;
    const drone = c.drone && typeof c.drone === "object" ? c.drone : DEFAULTS.drone;
    return {
      bpm: clampNum(c.bpm, minBpm, maxBpm, DEFAULTS.bpm),
      beatsPerBar: beatsPerBar,
      beatUnit: c.beatUnit === 8 || c.beatUnit === 2 || c.beatUnit === "dotted4" ? c.beatUnit : 4,
      compound: !!c.compound,
      subdivision: subdivision,
      subMutes: normalizeSubMutes(c.subMutes, subdivision),
      accents: normalizeAccents(c.accents, beatsPerBar),
      pointing: normalizePointing(c.pointing),
      beatStretch: clampNum(c.beatStretch, 0, 0.15, 0),
      countInBars: clampInt(c.countInBars, 0, 8, DEFAULTS.countInBars),
      gap: {
        on: !!gap.on,
        playBars: clampInt(gap.playBars, 1, 64, DEFAULTS.gap.playBars),
        muteBars: clampInt(gap.muteBars, 1, 64, DEFAULTS.gap.muteBars),
        hideVisual: !!gap.hideVisual
      },
      ramp: {
        on: !!ramp.on,
        everyBars: clampInt(ramp.everyBars, 1, 64, DEFAULTS.ramp.everyBars),
        stepBpm: clampNum(ramp.stepBpm, -20, 20, DEFAULTS.ramp.stepBpm),
        maxBpm: clampNum(ramp.maxBpm, minBpm, maxBpm, DEFAULTS.ramp.maxBpm)
      },
      drone: {
        on: !!drone.on,
        level: clampNum(drone.level, 0, 0.5, DEFAULTS.drone.level)
      },
      clickSound: c.clickSound === "wood" || c.clickSound === "beep" ? c.clickSound : "click",
      volume: clampNum(c.volume, 0, 1, DEFAULTS.volume),
      refHz: clampNum(c.refHz, 100, 1000, DEFAULTS.refHz),
      minBpm: minBpm,
      maxBpm: maxBpm
    };
  }

  const pure = {
    ACCENT_SILENT: ACCENT_SILENT,
    ACCENT_SOFT: ACCENT_SOFT,
    ACCENT_NORMAL: ACCENT_NORMAL,
    ACCENT_STRONG: ACCENT_STRONG,
    clampPointing: clampPointing,
    pointingFor: pointingFor,
    baseBeat: baseBeat,
    barDuration: barDuration,
    beatDurations: beatDurations,
    subOnsets: subOnsets,
    accentAt: accentAt,
    beatPlan: beatPlan,
    countInBeatPlan: countInBeatPlan,
    isGapBar: isGapBar,
    shouldRamp: shouldRamp,
    rampBpm: rampBpm,
    barEvents: barEvents,
    normalizePointing: normalizePointing,
    normalizeAccents: normalizeAccents,
    normalizeConfig: normalizeConfig
  };

  // ── engine ──

  function noop() {}
  function fnOr(f) { return typeof f === "function" ? f : noop; }

  function cloneConfig(c) {
    const out = {};
    for (const k in c) if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k];
    out.accents = c.accents.slice();
    out.subMutes = c.subMutes.slice();
    if (Array.isArray(c.pointing)) out.pointing = c.pointing.slice();
    out.gap = Object.assign({}, c.gap);
    out.ramp = Object.assign({}, c.ramp);
    out.drone = Object.assign({}, c.drone);
    return out;
  }

  // A shallow merge would wipe the untouched half of gap/ramp/drone, and the
  // host sets these one checkbox at a time.
  function mergeConfig(base, patch) {
    const out = cloneConfig(base);
    for (const k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      const v = patch[k];
      if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object") {
        out[k] = Object.assign({}, out[k], v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function create(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const getContext = typeof o.getContext === "function" ? o.getContext : null;
    const onBeat = fnOr(o.onBeat);
    const onBar = fnOr(o.onBar);
    const onTempoChange = fnOr(o.onTempoChange);
    const onStop = fnOr(o.onStop);

    let cfg = normalizeConfig(o.config);
    let ctx = null;
    let running = false;
    let timer = null;
    let lookahead = LOOKAHEAD;

    // bar counts music bars from 0; the count-in occupies the negative bars, so
    // there is no separate phase flag to keep in step with the cursor.
    let cursor = { bar: 0, beat: 0, sub: 0 };
    let plan = null;
    let beatStart = 0;
    let lastSchedAt = -1;
    let barsDone = 0;
    let queue = [];
    let live = [];
    let noiseBuf = null;
    let drone = null;
    let taps = [];
    let visHandler = null;

    function now() {
      try { return ctx ? ctx.currentTime : 0; } catch (err) { return 0; }
    }

    // ── click voices ──

    // Levels are the spec's, and the cap is what stops three voices at full
    // volume from summing past unity into a crackle.
    function clickLevel(accent) {
      const base = accent >= ACCENT_STRONG ? 1 : accent === ACCENT_NORMAL ? 0.66 : 0.4;
      return Math.min(CLICK_CAP, base * cfg.volume);
    }

    // Nodes are held only until they finish, so a long session does not grow a
    // graph. stop() reaches into this list to silence anything already committed
    // to the clock — pressing Stop and hearing two more clicks is a bug.
    function track(node, gain, endsAt) {
      const entry = { node: node, gain: gain, endsAt: endsAt };
      live.push(entry);
      try {
        node.onended = function () {
          const i = live.indexOf(entry);
          if (i !== -1) live.splice(i, 1);
          try { node.disconnect(); } catch (err) { /* already gone */ }
          try { gain.disconnect(); } catch (err) { /* already gone */ }
        };
      } catch (err) { /* onended unsupported; the list is pruned on stop */ }
      if (live.length > QUEUE_MAX) live.shift();
    }

    // Matching the reasoning behind the existing tick() in app.js: a chanter is
    // not a quiet instrument, and a triangle carries far more harmonic content
    // than a sine at the same peak, so the click cuts through the reed rather
    // than sitting underneath it.
    function toneClick(at, accent, level) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = accent >= ACCENT_STRONG ? 1320 : accent === ACCENT_NORMAL ? 880 : 660;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(level, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + 0.11);
      track(osc, g, at + 0.11);
    }

    function noiseBuffer() {
      if (noiseBuf) return noiseBuf;
      const len = Math.max(1, Math.floor(ctx.sampleRate * 0.2));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // One buffer is reused for every wood click; regenerating noise per click
      // costs a millisecond of main thread for a difference nobody can hear.
      noiseBuf = buf;
      return noiseBuf;
    }

    function woodClick(at, accent, level) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      // A rim knock reads as pitched even though it is noise, so the accent
      // moves the band as well as the level and the downbeat stays legible when
      // the volume is low.
      bp.frequency.value = accent >= ACCENT_STRONG ? 2600 : accent === ACCENT_NORMAL ? 2000 : 1500;
      bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(level, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      src.connect(bp); bp.connect(g); g.connect(ctx.destination);
      src.start(at); src.stop(at + 0.06);
      track(src, g, at + 0.06);
    }

    // For full pipes, where nothing subtle survives. A square through a lowpass
    // keeps the odd harmonics that carry outdoors without the fizz above 4 kHz
    // that a phone speaker turns into distortion.
    function beepClick(at, accent, level) {
      const osc = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = accent >= ACCENT_STRONG ? 1760 : accent === ACCENT_NORMAL ? 1175 : 880;
      lp.type = "lowpass";
      lp.frequency.value = 4000;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(level, at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      osc.connect(lp); lp.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + 0.09);
      track(osc, g, at + 0.09);
    }

    function click(at, accent) {
      if (!ctx || accent <= ACCENT_SILENT) return;
      const level = clickLevel(accent);
      if (level <= 0.0002) return;
      try {
        if (cfg.clickSound === "wood") woodClick(at, accent, level);
        else if (cfg.clickSound === "beep") beepClick(at, accent, level);
        else toneClick(at, accent, level);
      } catch (err) { /* audio unavailable; the clock carries on regardless */ }
    }

    function silenceLive(fade) {
      const t = now();
      const all = live.slice();
      live = [];
      all.forEach((e) => {
        try {
          e.gain.gain.cancelScheduledValues(t);
          e.gain.gain.setValueAtTime(Math.max(0.0001, e.gain.gain.value), t);
          e.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
          e.node.stop(t + fade + 0.01);
        } catch (err) { /* already stopped */ }
      });
    }

    // ── drone ──

    function droneHz() {
      // The drones sound an octave below the chanter's Low A, which is where a
      // real set sits against a chanter.
      return { tenor: cfg.refHz / 2, bass: cfg.refHz / 4 };
    }

    function startDrone() {
      if (!ctx || !cfg.drone.on || drone) return;
      try {
        const hz = droneHz();
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1200;
        const g = ctx.createGain();
        const oscs = [];
        // Two tenors, detuned three cents apart, so the pair beats slowly the
        // way two real tenor drones do. Identical frequencies would sound like
        // one thin oscillator.
        [-3, 3].forEach((cents) => {
          const osc = ctx.createOscillator();
          osc.type = "sawtooth";           // a drone reed is rich in harmonics
          osc.frequency.value = hz.tenor;
          osc.detune.value = cents;
          oscs.push(osc);
        });
        // The bass sits an octave under the tenors, around 59 Hz on a practice
        // chanter. A phone speaker cannot reproduce that at all — it is here for
        // anyone on headphones, which is the only way it is audible.
        const bass = ctx.createOscillator();
        bass.type = "sawtooth";
        bass.frequency.value = hz.bass;
        oscs.push(bass);
        oscs.forEach((osc) => { osc.connect(lp); osc.start(); });
        lp.connect(g); g.connect(ctx.destination);
        const t = now();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, cfg.drone.level), t + DRONE_RAMP);
        drone = { oscs: oscs, gain: g, filter: lp, refHz: cfg.refHz };
      } catch (err) { drone = null; }
    }

    function stopDrone() {
      if (!drone) return;
      const d = drone;
      drone = null;
      try {
        const t = now();
        d.gain.gain.cancelScheduledValues(t);
        d.gain.gain.setValueAtTime(Math.max(0.0001, d.gain.gain.value), t);
        d.gain.gain.exponentialRampToValueAtTime(0.0001, t + DRONE_RAMP);
        d.oscs.forEach((osc) => {
          osc.stop(t + DRONE_RAMP + 0.02);
          osc.onended = function () { try { osc.disconnect(); } catch (err) { /* gone */ } };
        });
      } catch (err) { /* already stopped */ }
    }

    // Level and pitch move under the running drone rather than restarting it,
    // because a restart is an audible seam and the host changes refHz while you
    // are tuning against the drone.
    function syncDrone() {
      if (!running) { stopDrone(); return; }
      if (!cfg.drone.on) { stopDrone(); return; }
      if (!drone) { startDrone(); return; }
      try {
        const t = now();
        drone.gain.gain.cancelScheduledValues(t);
        drone.gain.gain.setValueAtTime(Math.max(0.0001, drone.gain.gain.value), t);
        drone.gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, cfg.drone.level), t + DRONE_RAMP);
        if (drone.refHz !== cfg.refHz) {
          const hz = droneHz();
          drone.oscs.forEach((osc, i) => {
            osc.frequency.setValueAtTime(i < 2 ? hz.tenor : hz.bass, t);
          });
          drone.refHz = cfg.refHz;
        }
      } catch (err) { /* audio unavailable */ }
    }

    // ── scheduler ──

    function refreshPlan() {
      plan = cursor.bar < 0 ? countInBeatPlan(cfg, cursor.beat) : beatPlan(cfg, cursor.beat);
      // A subdivision change can leave the cursor pointing past the end of the
      // new beat. Clamping keeps nextTime() finite; retime() then walks forward
      // past anything already handed to the clock.
      if (cursor.sub >= plan.offsets.length) cursor.sub = plan.offsets.length - 1;
    }

    function nextTime() {
      if (!plan || !plan.offsets.length) return Infinity;
      return beatStart + plan.offsets[cursor.sub];
    }

    function countInLeft() {
      if (cursor.bar >= 0) return 0;
      return (-cursor.bar) * beatsPerBarOf(cfg) - cursor.beat;
    }

    function applyRamp() {
      if (!cfg.ramp.on) return;
      if (!shouldRamp(barsDone, cfg.ramp.everyBars)) return;
      const next = clampNum(rampBpm(cfg.bpm, cfg.ramp), cfg.minBpm, cfg.maxBpm, cfg.bpm);
      if (next === cfg.bpm) return;
      cfg.bpm = next;
      onTempoChange(cfg.bpm);
    }

    function advance() {
      cursor.sub++;
      if (cursor.sub < plan.offsets.length) return;
      cursor.sub = 0;
      beatStart += plan.duration;
      cursor.beat++;
      if (cursor.beat >= beatsPerBarOf(cfg)) {
        cursor.beat = 0;
        const wasMusic = cursor.bar >= 0;
        cursor.bar++;
        // The ramp counts music bars only, and counts them whether or not the
        // gap trainer silenced them, so the two features compose.
        if (wasMusic) { barsDone++; applyRamp(); }
      }
      refreshPlan();
    }

    function scheduleCurrent() {
      const at = nextTime();
      const countIn = cursor.bar < 0;
      const inGap = !countIn && isGapBar(cursor.bar, cfg.gap);
      const accent = plan.accents[cursor.sub];
      const silent = accent === ACCENT_SILENT || inGap;
      if (!silent) click(at, accent);
      queue.push({
        time: at,
        bar: cursor.bar,
        beat: cursor.beat,
        sub: cursor.sub,
        accent: accent,
        countIn: countIn ? countInLeft() : 0,
        inGap: inGap,
        silent: silent,
        beatStart: beatStart,
        beatDur: plan.duration,
        fired: false
      });
      if (queue.length > QUEUE_MAX) queue.shift();
      if (at > lastSchedAt) lastSchedAt = at;
    }

    function publicEvent(e) {
      return {
        time: e.time,
        bar: e.bar >= 0 ? e.bar + 1 : 0,
        beat: e.beat + 1,
        sub: e.sub,
        accent: e.accent,
        countIn: e.countIn,
        inGap: e.inGap,
        silent: e.silent
      };
    }

    // Callbacks fire when the clock reaches the event, not when it was
    // scheduled: haptics and a screen flash have to land on the beat, and the
    // schedule runs up to a second ahead of it.
    function drain(t) {
      for (let i = 0; i < queue.length; i++) {
        const e = queue[i];
        if (e.fired || e.time > t) continue;
        e.fired = true;
        const info = publicEvent(e);
        onBeat(info);
        if (e.sub === 0 && e.beat === 0) onBar(info);
      }
      // Keep exactly one fired event so position() still has a beat to measure
      // against between ticks.
      let last = -1;
      for (let i = 0; i < queue.length; i++) if (queue[i].fired) last = i; else break;
      if (last > 0) queue.splice(0, last);
    }

    function tick() {
      if (!running || !ctx) return;
      const t = now();

      // If the browser throttled the timer harder than the widened lookahead
      // covers, the clock has already passed events that were never scheduled.
      // Walk the cursor over them silently: a burst of late clicks is far worse
      // than a gap, and skipping this way keeps the bar count honest.
      let skipped = 0;
      while (nextTime() < t - CATCHUP && skipped++ < MAX_CATCHUP) advance();

      let placed = 0;
      while (nextTime() < t + lookahead && placed++ < MAX_PER_TICK) {
        scheduleCurrent();
        advance();
      }
      drain(t);
    }

    // ── lifecycle ──

    function bindVisibility() {
      if (typeof document === "undefined" || !document.addEventListener) return;
      applyLookahead();
      if (visHandler) return;
      visHandler = function () {
        // setInterval is throttled to roughly one call a second in a background
        // tab, so a 150 ms window runs dry between ticks and the click stutters.
        // Widen the window while hidden, narrow it on return so config changes
        // stay responsive while somebody is actually looking at the ring.
        applyLookahead();
        tick();
      };
      document.addEventListener("visibilitychange", visHandler);
    }

    function applyLookahead() {
      lookahead = (typeof document !== "undefined" && document.hidden) ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
    }

    function unbindVisibility() {
      if (!visHandler || typeof document === "undefined") { visHandler = null; return; }
      try { document.removeEventListener("visibilitychange", visHandler); } catch (err) { /* gone */ }
      visHandler = null;
    }

    function start() {
      if (running) return true;
      let c = null;
      try { c = getContext ? getContext() : null; } catch (err) { c = null; }
      if (!c) return false;
      ctx = c;
      // iOS keeps the context suspended until a gesture, and start() is always
      // reached from one.
      try { if (ctx.state === "suspended" && ctx.resume) ctx.resume(); } catch (err) { /* fine */ }

      running = true;
      queue = [];
      live = [];
      barsDone = 0;
      lastSchedAt = -1;
      cursor = { bar: -cfg.countInBars, beat: 0, sub: 0 };
      beatStart = now() + START_PAD;
      refreshPlan();
      startDrone();
      bindVisibility();

      tick();
      try { timer = setInterval(tick, SCHED_INTERVAL); } catch (err) { timer = null; }
      return true;
    }

    function stop() {
      const was = running;
      running = false;
      if (timer) { clearInterval(timer); timer = null; }
      unbindVisibility();
      stopDrone();
      silenceLive(0.03);
      queue = [];
      lastSchedAt = -1;
      if (was) onStop();
    }

    function isRunning() { return running; }

    // A config change must not restart the bar. The beat you are standing on
    // keeps its start time, and only events that have not yet been handed to the
    // audio clock are laid out again. Anything already scheduled rides out: it
    // is inside the lookahead window, so it is a fraction of a second of the old
    // tempo, and cancelling it would leave an audible hole where a click should
    // be. Because nothing is ever rescheduled at or before lastSchedAt, the
    // queue stays an exact record of what will be heard, which is what keeps the
    // ring in step with the sound.
    function retime() {
      if (!running || !ctx) return;
      const floor = Math.max(now(), lastSchedAt) + MIN_GAP;
      refreshPlan();
      let guard = 0;
      while (nextTime() <= floor && guard++ < MAX_PER_TICK) advance();
    }

    function setConfig(patch) {
      if (!patch || typeof patch !== "object") return getConfig();
      const before = cfg;
      cfg = normalizeConfig(mergeConfig(cfg, patch));
      if (running) {
        if (cursor.bar < 0 && cfg.countInBars !== before.countInBars) {
          // Only the count-in may be re-lengthed mid-flight, and only while it
          // is still running; a music bar never restarts.
          cursor.bar = Math.max(-cfg.countInBars, cursor.bar);
        }
        retime();
      }
      syncDrone();
      return getConfig();
    }

    function getConfig() { return cloneConfig(cfg); }

    function position() {
      const t = now();
      let cur = null;
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].time <= t) cur = queue[i];
        else break;
      }
      if (!cur) {
        return { bar: 0, beat: 0, sub: 0, countIn: running ? cfg.countInBars * cfg.beatsPerBar : 0, inGap: false, phase: 0, accent: 0 };
      }
      const dur = cur.beatDur > 0 ? cur.beatDur : baseBeat(cfg.bpm);
      // phase runs through the whole beat, not the gap between sounds, so the
      // ring sweeps evenly even when the subdivisions inside it are pointed.
      const phase = Math.min(1, Math.max(0, (t - cur.beatStart) / dur));
      return {
        bar: cur.bar >= 0 ? cur.bar + 1 : 0,
        beat: cur.beat + 1,
        sub: cur.sub,
        countIn: cur.countIn,
        inGap: cur.inGap,
        phase: phase,
        accent: cur.accent
      };
    }

    // Taps are read from performance.now(), not the audio clock: a tap can land
    // before start() has ever built a context, and averaging across two clocks
    // mid-sequence would corrupt the reading. This is user input, not audio
    // scheduling — nothing is placed on the timeline from it.
    function tapTempo() {
      if (typeof performance === "undefined" || !performance.now) return null;
      const t = performance.now() / 1000;
      if (taps.length && t - taps[taps.length - 1] > TAP_RESET) taps = [];
      taps.push(t);
      if (taps.length > TAP_MAX) taps.shift();
      if (taps.length < 2) return null;
      const span = taps[taps.length - 1] - taps[0];
      if (span <= 0) return null;
      const bpm = Math.round((60 * (taps.length - 1)) / span);
      const next = Math.min(cfg.maxBpm, Math.max(cfg.minBpm, bpm));
      setConfig({ bpm: next });
      return next;
    }

    return {
      setConfig: setConfig,
      getConfig: getConfig,
      start: start,
      stop: stop,
      isRunning: isRunning,
      tapTempo: tapTempo,
      position: position,
      // Test seam: the schedule is normally topped up by the interval above, but
      // a headless test needs to step a fake clock by hand.
      _tick: tick
    };
  }

  const api = { create: create, DEFAULTS: DEFAULTS, _pure: pure };

  if (typeof window !== "undefined") window.PipeMetronome = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
