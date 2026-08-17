# Bagpipe Note Drill

A practice tool for the Highland bagpipe chanter. It reads sheet-music notes,
listens to what you actually play through the microphone, and tells you whether
you hit the right note — and, on the beat drills, whether you were early or late.

**Live app:** https://dbaird23.github.io/bagpipe-practice/

It is a self-contained static site (no build step, no dependencies) and an
installable PWA, so it can be added to a phone's home screen and used offline.

## What it does

### Flashcards
- Random notes from Low G to High A, click or press Enter to flip. Arrows either
  side of the card step through the deck; on a phone they give way to swiping
- Two card faces: **Notation** shows the note on the staff, **Fingering** shows
  the chanter chart for it. Either way the note name is on the back
- Metronome-paced auto-advance with adjustable tempo and beats per card
- Auto-flip reveals the answer on the beat after the note
- **Listening round** — a scored 20-card game; play each note before its time
  runs out and get a per-card breakdown at the end

### Scales and patterns
- Full scale, low hand, high hand
- Every crossing pair (B–C, C–D, D–E, E–F, F–High G) for crossing-noise practice
- Thirds, scale in fours, wide jumps
- Single gracenotes — G, D and E — drawn the usual way, as a small note with
  three flags. Each runs only as high as that gracenote can be played: G up to
  F, E up to D, D up to C
- Embellishments — doublings, grips, taorluaths, the light D throw and the
  birl. Where several gracenotes run together they are beamed with three beams,
  written as a run of thirty-second notes
- Gracenotes are too short for the mic to time, so only the melody notes are
  scored — but sounding an embellishment is never counted as a stray note
- Custom patterns you build by tapping notes, with gracenotes of your own on any
  note — one gets three flags, two or more are beamed together automatically.
  Name one to **save** it; saved patterns appear in the picker under "Saved" and
  persist between visits
- Every run is a metronome drill with a 4-beat count-in, where each note must
  sound on its own beat. Notes are marked green (on the beat), blue (early) or
  amber (late), with the offset in milliseconds
- A red dot marks a stray note sounded on the way into a note
- **Bluetooth** takes the headphone delay out of the scoring. Wireless
  headphones hold the click for a fifth of a second or so before it reaches you,
  and you play to what you hear — so without this every note reads late however
  well you played it. With it on, the click still goes out on the beat but the
  note is timed against when you *heard* it, and the highlight waits with you.
  The delay is read from the browser where it reports one and typed in where it
  does not; after a run the app says what the number should have been
- **Hear it** plays the pattern back so you know what you are aiming for —
  gracenotes and all — as one continuous reed tone pitched to your own Low A.
  With **Loop** on it repeats seamlessly so you can play along; nothing is
  scored while it plays, since the mic would otherwise hear the app itself
- Clean-run streak, optional looping, and a persisted log of recent runs showing
  notes correct and notes on beat

### Metronome
- A beat ring with a sweeping hand, one pip per beat, and the tempo in the
  middle. Start it with the button or the space bar
- Tune-type presets — plain click, marches in 2/4, 3/4, 4/4, 6/8 and 9/8,
  strathspey, reel, jig, hornpipe and slow airs. Each one sets the time
  signature, subdivision, pointing and accents together, and carries three
  tempos: **Slow**, **Working** and **Target**. Change a setting afterwards and
  the chip says it has been edited rather than going on claiming to be a march
- The tempo always says which note value it counts, and reads out the bars a
  minute beside it. Piping sources disagree about tempo numbers mostly because
  they count different units: a reel is in cut time at half notes, so a reel at
  86 covers 43 bars a minute while a strathspey at 116 covers 29
- Tap tempo, count-in, click on or off, and volume
- Advanced settings, folded away and remembered: time signature, subdivision,
  a per-beat accent editor, pointing, beat stretch, gap trainer, tempo ramp,
  drone, click sound, screen flash and haptics
- **Pointing** is how unevenly a pair of notes is played. The middle of the
  slider is round — both notes the same length — and 75 is the written dot of a
  2/4 march. Below the middle it flips into the short-then-long Scots snap a
  strathspey turns on. The range narrows as the subdivision gets denser, because
  at six to the beat an extreme setting puts two clicks close enough together to
  read as one
- **Silent bars** plays a few bars, then goes quiet for a few while the count
  carries on underneath, so you find out whether your tempo held
- **Tempo ramp** raises the tempo a step at a time and stops at a ceiling
- The **drone** is pitched from the same Low A the microphone is calibrated to.
  The bass drone is too low for a phone speaker; use headphones to hear it
- Timing runs on the audio clock, so it holds while the tab is in the
  background, and the screen is kept awake where the browser allows it

There is no piobaireachd setting. The ground of a piobaireachd is not played in
strict time, and a click would teach the wrong thing.

### Microphone
A three-step setup checks the input level, calibrates the reference pitch, and
walks the scale to confirm everything registers.

Pitch detection is relative to your chanter's **Low A**, so it works at any
chanter pitch. Set it in the calibration step, or type the frequency directly.
Range is 200–1000 Hz: a pipe chanter's Low A is usually around 470–480 Hz, and a
practice chanter — which sounds roughly an octave lower — around 235–240 Hz.

The default is **235 Hz** (practice chanter). Whatever you set is remembered in
the browser, so it only needs adjusting once per device.

> If notes read an octave off, the Low A reference is set to the wrong octave.

## Running locally

Any static file server works. The microphone needs a secure context, so use
`localhost` rather than opening the file directly:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup for all three views and the dialogs |
| `styles.css` | All styling, including the narrow-screen layout |
| `metronome.js` | The metronome's clock, click and drone — no DOM |
| `app.js` | State, drill timing, pitch detection, scoring, rendering |
| `sw.js` | Service worker — offline app shell and font cache |
| `manifest.webmanifest` | PWA metadata |
| `fingerings/` | Chanter fingering charts, one per note |
| `tools/make-icons.py` | Regenerates the icon set (requires Pillow) |
| `tools/make-fingerings.py` | Trims and flattens the fingering scans |

## Notes on accuracy

Pitch detection uses ACF2+ autocorrelation on a 2048-sample window, and a note
has to hold steady for four consecutive reads before it registers. That means an
inherent latency of roughly 100 ms, which the timing code back-dates to estimate
the true onset. Millisecond figures are good to about ±40 ms — enough to see
whether you are consistently early or late, not a substitute for a real
timing rig.

## Deploying

The `main` branch is published with GitHub Pages from the repository root.
After changing `index.html`, `styles.css`, `app.js` or `metronome.js`, bump `CACHE_VERSION` in
[`sw.js`](sw.js) so installed copies pick up the new files.
