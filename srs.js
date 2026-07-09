// SM-2 spaced repetition + the strict alternating-day scheduler.
//
// Dates are local-midnight day numbers so timezone changes don't shift cards.
// Language rotation is parity-based: even day number = Japanese, odd = Spanish.
// Deterministic, so missed days never desync the rotation.
//
// SM-2 state on each item:
//   ef       ease factor (starts 2.5, floor 1.3)
//   reps     consecutive successful reviews
//   interval calendar days until next review
//   due      day number of next review (surfaced on that language's next day)
//   lapses   total failures ever (leech detection)
//   hist     last 20 grades: [dayNum, quality]

export function dayNum(d = new Date()) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function dayNumToDate(n) {
  const d = new Date(n * 86400000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function dateLabel(n) {
  return dayNumToDate(n).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function langForDay(n) {
  return n % 2 === 0 ? "ja" : "es";
}

export function nextDayForLang(lang, fromDay) {
  // first day >= fromDay whose rotation slot is `lang`
  return langForDay(fromDay) === lang ? fromDay : fromDay + 1;
}

export function newItemState() {
  return { ef: 2.5, reps: 0, interval: 0, due: 0, lapses: 0, hist: [] };
}

// Apply an SM-2 grade (0..5) to an item, mutating its SRS fields.
// Returns the item. `today` is a day number.
export function applySM2(item, q, today) {
  item.ef = Math.max(1.3, item.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  if (q < 3) {
    item.reps = 0;
    item.interval = 1;
    item.lapses = (item.lapses || 0) + 1;
  } else {
    item.reps += 1;
    if (item.reps === 1) item.interval = 1;
    else if (item.reps === 2) item.interval = 6;
    else item.interval = Math.round(item.interval * item.ef);
  }
  // land on the next day this language actually runs
  item.due = nextDayForLang(item.lang, today + item.interval);
  item.hist = (item.hist || []).slice(-19);
  item.hist.push([today, q]);
  return item;
}

// Map an answer outcome to an SM-2 quality grade.
//   correct + no hint + fast  -> 5
//   correct                   -> 4
//   correct but hint used     -> 3
//   wrong                     -> 2
export function gradeOf(correct, hintUsed, elapsedMs) {
  if (!correct) return 2;
  if (hintUsed) return 3;
  return elapsedMs < 9000 ? 5 : 4;
}

// Which exercise an item gets, escalating with maturity.
//   grammar & phrases  -> cloze (in a full sentence), always
//   vocab              -> recognition while young, production once interval >= 5 days
export function exerciseFor(item) {
  if (item.type === "grammar" || item.type === "phrase") return "cloze";
  if (item.reps === 0) return "recognition";
  return item.interval >= 5 ? "production" : "recognition";
}

export function isLeech(item) {
  return (item.lapses || 0) >= 3 && item.interval < 21;
}

export function isMature(item) {
  return item.reps > 0 && item.interval >= 21;
}
