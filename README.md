# Daily Dojo 道

A personal language-learning PWA that alternates daily between **Japanese** and
**Spanish**, with SM-2 spaced repetition and a hand-drawn notebook look.
Single user, no login, no build step, no dependencies — plain HTML/CSS/JS.

## How it works

- **Rotation** — even days are Japanese (日本語), odd days are Spanish
  (Español), deterministically from the calendar date, so missed days never
  desync the rotation. A "switch language today" link overrides one day.
- **SM-2** — each item tracks ease factor, interval, repetitions, and next
  review date. Reviews are scheduled onto that language's own rotation days.
- **Escalating exercises** — new vocab: recognition (multiple choice →
  English). Once an item's interval reaches 5 days: production (type the
  Japanese/Spanish). Grammar & phrases: cloze (fill the blank in a full
  sentence). Wrong answers are re-typed in a corrections round.
- **Lenient checking** — Japanese accepts romaji, kana, or kanji (long-vowel
  and spacing slips forgiven). Spanish forgives accents, case, and articles.
- **Daily session** — due reviews → new items (always introduced inside an
  example sentence) → short quiz that escalates today's new items. A couple
  of minutes, one-handed.
- **Weekly adaptive pass** — every 7 days it reads your accuracy history and
  adjusts new-items-per-day (2–8) per language, widens the review cap when a
  backlog builds, and injects "leech" cards into quizzes for extra reps.
- **Content** — BJJ, cooking, and Sydney-life themed, plus interleaved strands
  from shows and music: anime vocabulary on the Japanese side, Brooklyn 99 /
  The Office and Kevin Kaarl song-vocabulary on the Spanish side (original
  sentences referencing the shows/songs — lyrics themselves are copyrighted,
  so the deck teaches the words the songs are built from). ~70 items per
  language in [js/content.js](js/content.js). Add items there (bump
  `CONTENT_VERSION`); they merge into the database without touching existing
  progress. An optional `ord` field controls where an item sits in the
  new-item queue.
- **Storage** — everything lives in IndexedDB on-device. Export/import a JSON
  backup from the Progress page so Safari storage eviction can never cost you
  your streak.

## Run it locally

```sh
python3 -m http.server 8642   # then open http://localhost:8642
```

(or any static file server pointed at this folder).

## Install on your iPhone

Safari only installs PWAs from **HTTPS** (localhost is exempt, but your phone
can't see your Mac's localhost). Host this folder on any static host with
HTTPS — GitHub Pages, Cloudflare Pages, and Netlify are all free:

1. Push/upload this folder (it's 100% static — no build step).
2. Open the URL in Safari on your iPhone.
3. Tap **Share → Add to Home Screen**.
4. Open it from the home screen once while online — the service worker
   precaches everything and it works fully offline from then on.

## Files

| file | what it is |
|---|---|
| `index.html` | app shell, PWA meta tags |
| `manifest.webmanifest` | web app manifest (standalone display, icons) |
| `sw.js` | service worker — precaches the shell, cache-first |
| `js/app.js` | screens, session flow, adaptive pass, export/import |
| `js/srs.js` | SM-2 + alternating-day scheduler |
| `js/lang.js` | romaji→kana conversion, lenient answer checking |
| `js/content.js` | the personalized deck (edit me to add content) |
| `js/db.js` | IndexedDB wrapper |
| `js/sketch.js` | hand-drawn SVG borders, ticks/crosses, tallies |
