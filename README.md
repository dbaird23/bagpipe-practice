# Bagpipe Note Drill

A practice tool for the Highland bagpipe chanter. It reads sheet-music notes,
listens to what you actually play through the microphone, and tells you whether
you hit the right note — and, on the beat drills, whether you were early or late.

**Live app:** https://dbaird23.github.io/bagpipe-practice/

It is a self-contained static site (no build step, no dependencies) and an
installable PWA, so it can be added to a phone's home screen and used offline.

## What it does

### Flashcards
- Random notes from Low G to High A on the staff, click or press Enter to flip
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
  F, E up to D, D up to C. Gracenotes themselves are too short for the mic to
  time, so only the melody notes are scored, but sounding one is never counted
  as a stray note
- Custom patterns you build by tapping notes, which you can **name and save**;
  saved patterns appear in the picker under "Saved" and persist between visits
- **Free tempo** — notes fill in as you play them, at your own pace
- **On the beat** — a metronome drill with a 4-beat count-in, where each note
  must sound on its own beat. Notes are marked green (on the beat), blue (early)
  or amber (late), with the offset in milliseconds
- A red dot marks a stray note sounded on the way into a note
- Clean-run streak, optional looping, and a persisted log of recent runs showing
  notes correct and notes on beat

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
| `index.html` | Markup for both views and the dialogs |
| `styles.css` | All styling, including the narrow-screen layout |
| `app.js` | State, metronome, pitch detection, scoring, rendering |
| `sw.js` | Service worker — offline app shell and font cache |
| `manifest.webmanifest` | PWA metadata |
| `tools/make-icons.py` | Regenerates the icon set (requires Pillow) |

## Notes on accuracy

Pitch detection uses ACF2+ autocorrelation on a 2048-sample window, and a note
has to hold steady for four consecutive reads before it registers. That means an
inherent latency of roughly 100 ms, which the timing code back-dates to estimate
the true onset. Millisecond figures are good to about ±40 ms — enough to see
whether you are consistently early or late, not a substitute for a real
timing rig.

## Deploying

The `main` branch is published with GitHub Pages from the repository root.
After changing `index.html`, `styles.css` or `app.js`, bump `CACHE_VERSION` in
[`sw.js`](sw.js) so installed copies pick up the new files.
