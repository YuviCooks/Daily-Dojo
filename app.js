// Daily Dojo — app shell, session flow, progress, adaptive pacing.

import { dbGet, dbAll, dbPut, dbBulkPut, requestPersistence } from "./db.js";
import { ITEMS, CONTENT_VERSION } from "./content.js";
import {
  dayNum, dateLabel, langForDay, newItemState, applySM2, gradeOf,
  exerciseFor, isLeech, isMature,
} from "./srs.js";
import { checkAnswer } from "./lang.js";
import { sketchAll, markSVG, tallySVG, circlePath } from "./sketch.js";

const app = document.getElementById("app");

const LANG_NAME = { ja: "Japanese", es: "Spanish" };
const LANG_NATIVE = { ja: "日本語", es: "Español" };
const PRAISE = {
  ja: ["よくできました！", "すごい！", "頑張ったね！"],
  es: ["¡Muy bien!", "¡Excelente!", "¡Buen trabajo!"],
};
const DEFAULT_ADAPT = () => ({
  key: "adapt", lastRun: dayNum(), newPerDay: { ja: 4, es: 4 },
  reviewCap: { ja: 20, es: 20 }, leeches: [], note: "", noteDay: 0,
});

let items = [];        // all item records (content + SRS state)
let sessions = [];     // completed session records
let adapt = null;

// ---------------------------------------------------------------- utilities

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function show(node) {
  app.innerHTML = "";
  node.classList.add("fade-in");
  app.appendChild(node);
  sketchAll(app);
  window.scrollTo(0, 0);
}

function itemById(id) { return items.find((i) => i.id === id); }

async function saveItem(item) { await dbPut("items", item); }

function todayNum() { return dayNum(new Date()); }

async function todayLang() {
  const o = await dbGet("meta", "langOverride");
  const t = todayNum();
  if (o && o.day === t) return o.lang;
  return langForDay(t);
}

function sessionFor(day, lang) { return sessions.find((s) => s.day === day && s.lang === lang); }
function doneToday() { const t = todayNum(); return sessions.some((s) => s.day === t); }

function streaks() {
  const days = new Set(sessions.map((s) => s.day));
  const t = todayNum();
  let cur = 0;
  let d = days.has(t) ? t : t - 1;
  while (days.has(d)) { cur++; d--; }
  let best = 0;
  const sorted = [...days].sort((a, b) => a - b);
  let run = 0, prev = null;
  for (const n of sorted) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  return { cur, best };
}

function dueItems(lang, day) {
  return items
    .filter((i) => i.lang === lang && i.reps > 0 && i.due <= day)
    .sort((a, b) => a.due - b.due);
}
// New items come in content order; an explicit `ord` interleaves themed
// strands (shows, music) between the numbered items.
function ordOf(i) { return i.ord ?? parseInt(i.id.slice(2), 10); }
function newQueue(lang) {
  return items
    .filter((i) => i.lang === lang && i.reps === 0 && !(i.hist || []).length)
    .sort((a, b) => ordOf(a) - ordOf(b));
}

// ---------------------------------------------------------------- boot

async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  requestPersistence();

  // seed / merge content into the DB, preserving SRS state
  const existing = await dbAll("items");
  const byId = new Map(existing.map((i) => [i.id, i]));
  const toPut = [];
  for (const c of ITEMS) {
    const old = byId.get(c.id);
    if (!old) toPut.push({ ...c, ...newItemState() });
    else toPut.push({ ...old, ...c, ef: old.ef, reps: old.reps, interval: old.interval, due: old.due, lapses: old.lapses, hist: old.hist });
  }
  if (toPut.length) await dbBulkPut("items", toPut);

  items = await dbAll("items");
  sessions = await dbAll("sessions");
  adapt = (await dbGet("meta", "adapt")) || DEFAULT_ADAPT();
  await runWeeklyAdapt();
  renderHome();
}

// ---------------------------------------------------------------- weekly adaptive pass (phase 4)

async function runWeeklyAdapt() {
  const t = todayNum();
  if (!adapt.lastRun) adapt.lastRun = t;
  if (t - adapt.lastRun < 7) { await dbPut("meta", adapt); return; }

  const windowSessions = sessions.filter((s) => s.day > adapt.lastRun - 1);
  const noteBits = [];
  for (const lang of ["ja", "es"]) {
    const answers = windowSessions
      .filter((s) => s.lang === lang)
      .flatMap((s) => s.answers || [])
      .filter((a) => a.phase === "review" || a.phase === "new");
    if (answers.length >= 10) {
      const acc = answers.filter((a) => a.correct).length / answers.length;
      const cur = adapt.newPerDay[lang];
      if (acc < 0.7) {
        adapt.newPerDay[lang] = Math.max(2, cur - 1);
        noteBits.push(`${LANG_NAME[lang]}: ${Math.round(acc * 100)}% — easing off to ${adapt.newPerDay[lang]} new/day so reviews can catch up.`);
      } else if (acc > 0.9) {
        adapt.newPerDay[lang] = Math.min(8, cur + 1);
        noteBits.push(`${LANG_NAME[lang]}: ${Math.round(acc * 100)}% — nice! Bumping to ${adapt.newPerDay[lang]} new/day.`);
      } else {
        noteBits.push(`${LANG_NAME[lang]}: ${Math.round(acc * 100)}% — steady pace, keeping ${cur} new/day.`);
      }
    }
    // widen the review cap if a backlog is building
    const backlog = dueItems(lang, t).length;
    adapt.reviewCap[lang] = backlog > 25 ? 30 : 20;
  }
  const leeches = items.filter((i) => isLeech(i)).map((i) => i.id);
  adapt.leeches = leeches;
  if (leeches.length) noteBits.push(`${leeches.length} stubborn card${leeches.length > 1 ? "s" : ""} will sneak into your quizzes for extra reps.`);

  adapt.lastRun = t;
  if (noteBits.length) { adapt.note = noteBits.join(" "); adapt.noteDay = t; }
  await dbPut("meta", adapt);
}

// ---------------------------------------------------------------- home

async function renderHome() {
  const t = todayNum();
  const lang = await todayLang();
  const other = lang === "ja" ? "es" : "ja";
  const { cur, best } = streaks();
  const done = sessionFor(t, lang) || sessions.find((s) => s.day === t);
  const due = dueItems(lang, t).length;
  const fresh = Math.min(newQueue(lang).length, adapt.newPerDay[lang]);

  const lastDay = sessions.length ? Math.max(...sessions.map((s) => s.day)) : null;
  let nudge;
  if (done) nudge = "Homework's done. See you tomorrow!";
  else if (lastDay === t - 1) nudge = `Don't break the chain — ${cur} day${cur === 1 ? "" : "s"} and counting!`;
  else if (lastDay === null) nudge = "First page of a new notebook. Let's go!";
  else if (lastDay < t - 1) nudge = "The notebook missed you. Start a fresh streak today.";
  else nudge = "A couple of minutes is all it takes.";

  const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  const hideInstall = await dbGet("meta", "installHintDismissed");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const showNote = adapt.note && t - adapt.noteDay < 3;

  const v = el(`<div>
    <div class="top-row">
      <h1>Daily Dojo</h1>
      <span class="pencil-note">${esc(dateLabel(t))}</span>
    </div>

    <div class="card" data-sk="ink">
      <div class="pencil-note">today is a ${esc(LANG_NAME[lang])} day</div>
      <div class="tl tl-big" lang="${lang}" style="margin:6px 0 2px">${esc(LANG_NATIVE[lang])}</div>
      ${done
        ? `<div class="mark-wrap"></div><div class="marker" style="font-size:22px;color:var(--red)">Done for today!</div>
           <div class="pencil-note" style="margin-top:4px">score: ${done.correct}/${done.total} · tomorrow: ${esc(LANG_NAME[langForDay(t + 1)])}</div>`
        : `<div class="pencil-note" style="margin:4px 0 2px">${due} review${due === 1 ? "" : "s"} due · ${fresh} new to learn</div>
           <button class="btn" data-sk="ink" id="start">Start today's session</button>`}
      <div class="pencil-note" style="margin-top:6px">${esc(nudge)}</div>
    </div>

    <div class="card" data-sk="faint">
      <div class="stat-row"><span class="stat-big">${cur}</span><span>day streak</span><span class="spacer"></span><span class="pencil-note">best: ${best}</span></div>
      <div id="tally"></div>
    </div>

    ${showNote ? `<div class="card" data-sk="red">
      <h2 style="color:var(--red)">weekly check-in ✎</h2>
      <div style="font-size:17px;margin-top:6px">${esc(adapt.note)}</div>
    </div>` : ""}

    ${!standalone && isIOS && !hideInstall ? `<div class="card" data-sk="faint">
      <div style="font-size:16.5px">Add me to your home screen: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>. I work offline once installed.</div>
      <button class="linklike" id="dismiss-install">got it, hide this</button>
    </div>` : ""}

    ${done ? `<button class="btn small" data-sk="faint" id="extra">✎ extra practice round</button>` : ""}

    <div class="footer-links">
      <button class="linklike" id="to-progress">progress</button>
      <button class="linklike" id="switch-lang">switch to ${esc(LANG_NAME[other])} today</button>
    </div>
  </div>`);

  if (done) {
    const mw = v.querySelector(".mark-wrap");
    mw.appendChild(markSVG(true));
  }
  v.querySelector("#tally").appendChild(tallySVG(cur));
  const startBtn = v.querySelector("#start");
  if (startBtn) startBtn.onclick = () => startSession(lang, false);
  const extraBtn = v.querySelector("#extra");
  if (extraBtn) extraBtn.onclick = () => startSession(lang, true);
  v.querySelector("#to-progress").onclick = renderProgress;
  v.querySelector("#switch-lang").onclick = async () => {
    await dbPut("meta", { key: "langOverride", day: t, lang: other });
    renderHome();
  };
  const di = v.querySelector("#dismiss-install");
  if (di) di.onclick = async () => { await dbPut("meta", { key: "installHintDismissed", value: 1 }); renderHome(); };

  show(v);
}

// ---------------------------------------------------------------- session building

function pickQuiz(lang, day, newOnes, alreadyIds) {
  const picks = [];
  // escalate today's new items straight away: production / cloze in the quiz
  for (const it of newOnes.slice(0, 2)) {
    picks.push({ item: it, ex: it.type === "vocab" ? "production" : "cloze", phase: "quiz" });
  }
  // stubborn leeches get extra reps
  const leechPool = (adapt.leeches || [])
    .map(itemById)
    .filter((i) => i && i.lang === lang && !alreadyIds.has(i.id));
  for (const it of leechPool.slice(0, 2)) {
    picks.push({ item: it, ex: exerciseFor(it), phase: "quiz" });
    alreadyIds.add(it.id);
  }
  // top up with learned items not otherwise seen today
  const pool = items.filter((i) => i.lang === lang && i.reps > 0 && i.due > day && !alreadyIds.has(i.id));
  pool.sort(() => Math.random() - 0.5);
  for (const it of pool) {
    if (picks.length >= 4) break;
    picks.push({ item: it, ex: exerciseFor(it), phase: "quiz" });
  }
  return picks;
}

function buildSession(lang, day, extraOnly) {
  const steps = [];
  const seen = new Set();

  if (!extraOnly) {
    const due = dueItems(lang, day).slice(0, adapt.reviewCap[lang]);
    for (const it of due) {
      steps.push({ kind: "q", item: it, ex: exerciseFor(it), phase: "review", graded: true });
      seen.add(it.id);
    }
    const fresh = newQueue(lang).slice(0, adapt.newPerDay[lang]);
    for (const it of fresh) {
      steps.push({ kind: "lesson", item: it });
      steps.push({
        kind: "q", item: it,
        ex: it.type === "vocab" ? "recognition" : "cloze",
        phase: "new", graded: true, autoHint: it.type !== "vocab",
      });
      seen.add(it.id);
    }
    for (const p of pickQuiz(lang, day, fresh, seen)) {
      steps.push({ kind: "q", ...p, graded: "bonus" });
    }
  } else {
    const pool = items.filter((i) => i.lang === lang && i.reps > 0);
    pool.sort(() => Math.random() - 0.5);
    for (const it of pool.slice(0, 6)) {
      steps.push({ kind: "q", item: it, ex: exerciseFor(it), phase: "quiz", graded: "bonus" });
    }
  }
  return steps;
}

let sess = null;
let advanceHandler = null;

// Enter advances past the feedback card; always disarm before re-arming or
// rendering a new step so stale listeners can't double-advance.
function armAdvance(fn) {
  disarmAdvance();
  advanceHandler = (e) => { if (e.key === "Enter") { e.preventDefault(); fn(); } };
  document.addEventListener("keydown", advanceHandler);
}
function disarmAdvance() {
  if (advanceHandler) { document.removeEventListener("keydown", advanceHandler); advanceHandler = null; }
}

function startSession(lang, extraOnly) {
  const day = todayNum();
  const steps = buildSession(lang, day, extraOnly);
  if (!steps.length) {
    alert("Nothing to practise yet — come back tomorrow!");
    return;
  }
  sess = {
    lang, day, steps, i: 0, wrong: [], extraOnly,
    answers: [], newLearned: 0, startedAt: Date.now(),
  };
  renderStep();
}

function phaseLabel(step) {
  if (step.fix) return "corrections";
  return { review: "review", new: "new", quiz: "quiz" }[step.phase] || "practice";
}

function progressText() {
  const total = sess.steps.length + sess.wrong.length;
  const n = Math.min(sess.i + 1, total);
  return `${n} / ${total}`;
}

function renderStep() {
  const queue = sess.steps;
  if (sess.i >= queue.length) {
    if (sess.wrong.length) {
      // corrections round: re-type what you missed (ungraded)
      for (const w of sess.wrong) queue.push({ ...w, graded: false, fix: true, autoHint: true });
      sess.wrong = [];
    } else {
      return finishSession();
    }
  }
  disarmAdvance();
  const step = queue[sess.i];
  if (step.kind === "lesson") renderLesson(step);
  else renderQuestion(step);
}

// ---------------------------------------------------------------- lesson intro

function renderLesson(step) {
  const it = step.item;
  const ja = it.lang === "ja";
  const v = el(`<div>
    <div class="session-meta"><span class="phase-tag">✎ new</span><span>${progressText()}</span></div>
    <div class="card" data-sk="ink">
      <div class="pencil-note">new ${esc(it.type)}</div>
      <div class="tl tl-big" lang="${it.lang}" style="margin:8px 0 2px">${esc(it.target)}</div>
      ${ja && it.kana !== it.target ? `<div class="tl" lang="ja" style="font-size:20px;color:var(--ink-soft)">${esc(it.kana)}</div>` : ""}
      ${ja ? `<div class="romaji">${esc(it.romaji)}</div>` : ""}
      <div class="meaning" style="margin-top:10px">= ${esc(it.en)}</div>
      ${it.note ? `<div class="pencil-note" style="margin-top:6px">☞ ${esc(it.note)}</div>` : ""}
    </div>
    <div class="card" data-sk="faint">
      <div class="pencil-note">in the wild:</div>
      <div class="tl tl-sentence" lang="${it.lang}" style="margin:6px 0 2px">${esc(it.s.t)}</div>
      ${ja && it.s.r ? `<div class="romaji">${esc(it.s.r)}</div>` : ""}
      <div style="font-size:16.5px;color:var(--ink-soft);margin-top:6px">${esc(it.s.en)}</div>
    </div>
    <button class="btn" data-sk="ink" id="next">Got it →</button>
  </div>`);
  v.querySelector("#next").onclick = () => { sess.i++; renderStep(); };
  show(v);
}

// ---------------------------------------------------------------- questions

function clozeSentence(it) {
  const t = it.s.t;
  const idx = t.toLowerCase().indexOf(it.target.toLowerCase());
  if (idx < 0) return { pre: "", post: t };
  return { pre: t.slice(0, idx), post: t.slice(idx + it.target.length) };
}

function renderQuestion(step) {
  const it = step.item;
  const ja = it.lang === "ja";
  const started = Date.now();
  let hintUsed = !!step.autoHint;

  let body = "";
  if (step.ex === "recognition") {
    const distract = items
      .filter((x) => x.lang === it.lang && x.id !== it.id && x.type === "vocab")
      .sort(() => Math.random() - 0.5).slice(0, 3).map((x) => x.en);
    const opts = [...distract, it.en].sort(() => Math.random() - 0.5);
    step._opts = opts;
    body = `
      <div class="card" data-sk="ink">
        <div class="pencil-note">what does this mean?</div>
        <div class="tl tl-big" lang="${it.lang}" style="margin:8px 0 2px">${esc(it.target)}</div>
        ${ja ? `<div class="romaji">${esc(it.romaji)}</div>` : ""}
        <div class="tl" lang="${it.lang}" style="font-size:17px;color:var(--ink-soft);margin-top:8px">${esc(it.s.t)}</div>
      </div>
      <div id="opts">${opts.map((o, k) => `<button class="opt" data-sk="faint" data-k="${k}">${esc(o)}</button>`).join("")}</div>`;
  } else if (step.ex === "production") {
    body = `
      <div class="card" data-sk="ink">
        <div class="pencil-note">how do you say…</div>
        <div class="meaning" style="margin:8px 0 2px;font-size:23px">“${esc(it.en)}”</div>
        <div style="font-size:16px;color:var(--ink-soft);margin-top:6px">as in: ${esc(it.s.en)}</div>
        <input class="answer-line" id="ans" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          placeholder="${ja ? "type romaji or kana" : "type it in Spanish"}" enterkeyhint="done">
      </div>
      <button class="btn" data-sk="ink" id="check">Mark it ✓</button>
      <button class="linklike" id="idk">I don't know</button>`;
  } else { // cloze
    const { pre, post } = clozeSentence(it);
    body = `
      <div class="card" data-sk="ink">
        <div class="pencil-note">fill in the blank</div>
        <div class="tl tl-sentence" lang="${it.lang}" style="margin:8px 0 2px">${esc(pre)}<span style="letter-spacing:2px;color:var(--red)">＿＿＿</span>${esc(post)}</div>
        <div style="font-size:16px;color:var(--ink-soft);margin-top:6px">${esc(it.s.en)}</div>
        <div class="hint-reveal" id="hint" ${hintUsed ? "" : "hidden"}>hint: ${esc(it.en)}</div>
        <input class="answer-line" id="ans" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          placeholder="${ja ? "type romaji or kana" : "the missing words"}" enterkeyhint="done">
      </div>
      ${hintUsed ? "" : `<button class="linklike" id="show-hint">show a hint</button>`}
      <button class="btn" data-sk="ink" id="check">Mark it ✓</button>
      <button class="linklike" id="idk">I don't know</button>`;
  }

  const v = el(`<div>
    <div class="session-meta"><span class="phase-tag">✎ ${esc(phaseLabel(step))}</span><span>${progressText()}</span></div>
    ${body}
    <div id="result"></div>
  </div>`);

  const settle = (correct, typed) => {
    const elapsed = Date.now() - started;
    answerSettled(step, correct, hintUsed, elapsed, v, typed);
  };

  if (step.ex === "recognition") {
    v.querySelectorAll(".opt").forEach((b) => {
      b.onclick = () => {
        v.querySelectorAll(".opt").forEach((x) => (x.disabled = true));
        const chosen = step._opts[+b.dataset.k];
        const correct = chosen === it.en;
        if (!correct) b.style.color = "var(--red)";
        settle(correct, chosen);
      };
    });
  } else {
    const input = v.querySelector("#ans");
    const doCheck = () => {
      const val = input.value.trim();
      if (!val) { input.focus(); return; }
      input.disabled = true;
      settle(checkAnswer(val, it), val);
    };
    v.querySelector("#check").onclick = doCheck;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doCheck(); } });
    v.querySelector("#idk").onclick = () => { input.disabled = true; settle(false, ""); };
    const sh = v.querySelector("#show-hint");
    if (sh) sh.onclick = () => { hintUsed = true; v.querySelector("#hint").hidden = false; sh.remove(); };
    setTimeout(() => input.focus(), 60);
  }

  show(v);
}

async function answerSettled(step, correct, hintUsed, elapsed, v, typed) {
  const it = step.item;
  const ja = it.lang === "ja";

  // grade & schedule
  let q = null;
  if (step.graded === true) {
    q = gradeOf(correct, hintUsed, elapsed);
    if (step.phase === "new" && it.reps === 0) sess.newLearned++;
    applySM2(it, q, sess.day);
    await saveItem(it);
  } else if (step.graded === "bonus" && !correct) {
    q = 2;
    applySM2(it, 2, sess.day); // early failure resets; early success leaves schedule alone
    await saveItem(it);
  }
  if (step.graded) {
    sess.answers.push({ id: it.id, ex: step.ex, phase: step.phase, correct, q });
    if (!correct) sess.wrong.push({ kind: "q", item: it, ex: step.ex === "recognition" ? "recognition" : step.ex, phase: step.phase });
  }

  // teacher's marking
  const res = v.querySelector("#result");
  const praise = correct ? "" : "";
  const answerLine = step.ex === "recognition"
    ? (correct ? "" : `<div class="correction">${esc(it.en)}</div>`)
    : correct
      ? ""
      : `<div class="correction" lang="${it.lang}">${esc(it.target)}${ja ? ` （${esc(it.kana)} · ${esc(it.romaji)}）` : ""}</div>`;
  const context = step.ex !== "recognition" || !correct
    ? `<div style="margin-top:8px"><span class="tl" lang="${it.lang}" style="font-size:17px">${esc(it.s.t)}</span>
       ${ja && it.s.r ? `<div class="romaji">${esc(it.s.r)}</div>` : ""}
       <div style="font-size:15px;color:var(--ink-soft)">${esc(it.s.en)}</div></div>`
    : "";
  const note = correct
    ? (elapsed < 9000 && !hintUsed ? "quick!" : "correct")
    : "we'll come back to this one";

  const card = el(`<div class="card" data-sk="${correct ? "faint" : "red"}">
    <div class="mark-wrap"><span class="mark-note">${esc(note)}</span></div>
    ${answerLine}${context}
    <button class="btn small" data-sk="ink" id="cont">${sess.i + 1 >= sess.steps.length && !sess.wrong.length ? "Finish ✎" : "Next →"}</button>
  </div>`);
  const advance = () => { sess.i++; renderStep(); };
  card.querySelector(".mark-wrap").prepend(markSVG(correct));
  card.querySelector("#cont").onclick = advance;
  res.appendChild(card);
  sketchAll(res);
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  armAdvance(advance); // Enter advances too; disarmed on the next renderStep
  setTimeout(() => card.querySelector("#cont").focus(), 100);
}

// ---------------------------------------------------------------- finish

async function finishSession() {
  const graded = sess.answers;
  const total = graded.length;
  const correct = graded.filter((a) => a.correct).length;

  if (!sess.extraOnly || !sessionFor(sess.day, sess.lang)) {
    const rec = {
      id: `${sess.day}-${sess.lang}${sess.extraOnly ? "-x" + Date.now() : ""}`,
      day: sess.day, date: new Date().toISOString().slice(0, 10),
      lang: sess.lang, total, correct, newLearned: sess.newLearned,
      answers: graded, durationMs: Date.now() - sess.startedAt,
    };
    await dbPut("sessions", rec);
    sessions = await dbAll("sessions");
  }

  const { cur } = streaks();
  const pct = total ? correct / total : 1;
  const praisePool = PRAISE[sess.lang];
  const word = pct === 1 ? praisePool[1] : pct >= 0.7 ? praisePool[0] : "practice makes progress";
  const tomorrow = LANG_NAME[langForDay(sess.day + 1)];

  const v = el(`<div>
    <h1 class="center" style="margin-top:12px">marked ✓</h1>
    <div class="score-circle">
      <svg class="ring" viewBox="0 0 130 130"><path d="${circlePath(65, 65, 56)}"/></svg>
      <div class="score-num">${correct}/${total}</div>
    </div>
    <div class="grade-word" lang="${sess.lang}">${esc(word)}</div>
    <div class="card" data-sk="faint">
      <ul class="plain">
        <li>✓ ${sess.answers.filter((a) => a.phase === "review").length} reviews</li>
        <li>✎ ${sess.newLearned} new ${sess.newLearned === 1 ? "item" : "items"} learned</li>
        <li>◯ streak: ${cur} day${cur === 1 ? "" : "s"}</li>
        <li>→ tomorrow is a ${esc(tomorrow)} day</li>
      </ul>
    </div>
    <button class="btn" data-sk="ink" id="home">Back to the front page</button>
  </div>`);
  v.querySelector("#home").onclick = renderHome;
  show(v);
  sess = null;
}

// ---------------------------------------------------------------- progress (phase 3)

async function renderProgress() {
  const t = todayNum();
  const { cur, best } = streaks();

  const langStats = (lang) => {
    const pool = items.filter((i) => i.lang === lang);
    return {
      learned: pool.filter((i) => i.reps > 0).length,
      mature: pool.filter((i) => isMature(i)).length,
      waiting: pool.filter((i) => i.reps === 0).length,
      due: dueItems(lang, t).length,
    };
  };
  const ja = langStats("ja"), es = langStats("es");

  // 7-day forecast (each day is one language, thanks to the rotation)
  let bars = "";
  const counts = [];
  for (let d = 0; d < 7; d++) {
    const day = t + d;
    const lang = langForDay(day);
    const n = items.filter((i) => i.lang === lang && i.reps > 0 && i.due <= day &&
      (d === 0 || i.due > t + d - 1 || i.due <= t)).length;
    counts.push({ day, lang, n: d === 0 ? dueItems(lang, t).length : items.filter((i) => i.lang === lang && i.reps > 0 && i.due === day).length });
  }
  const max = Math.max(1, ...counts.map((c) => c.n));
  counts.forEach((c, k) => {
    const bh = Math.round((c.n / max) * 62);
    const x = 14 + k * 64, y0 = 88, w = 40;
    const wob = 1.6;
    bars += `<path d="M ${x} ${y0} L ${x + (Math.random()*2-1)*wob} ${y0 - bh} L ${x + w} ${y0 - bh + (Math.random()*2-1)*wob} L ${x + w + (Math.random()*2-1)*wob} ${y0} Z" ${c.n ? "" : 'opacity="0.25"'}/>`;
    bars += `<text class="count" x="${x + w / 2}" y="${y0 - bh - 6}" text-anchor="middle">${c.n || ""}</text>`;
    bars += `<text x="${x + w / 2}" y="${y0 + 16}" text-anchor="middle">${k === 0 ? "today" : dateLabel(c.day).split(" ")[0]}·${c.lang === "ja" ? "日" : "ES"}</text>`;
  });

  const v = el(`<div>
    <div class="top-row"><h1>Progress</h1><button class="linklike" id="back">← back</button></div>

    <div class="card" data-sk="ink">
      <div class="stat-row"><span class="stat-big">${cur}</span><span>day streak</span><span class="spacer"></span><span class="pencil-note">best: ${best}</span></div>
      <div id="tally"></div>
    </div>

    <div class="card" data-sk="faint">
      <h2>日本語 <span class="pencil-note">Japanese</span></h2>
      <div class="stat-row"><span>${ja.learned} learned</span>·<span>${ja.mature} solid</span>·<span>${ja.waiting} waiting</span>·<span style="color:var(--red)">${ja.due} due</span></div>
      <h2 style="margin-top:12px">Español <span class="pencil-note">Spanish</span></h2>
      <div class="stat-row"><span>${es.learned} learned</span>·<span>${es.mature} solid</span>·<span>${es.waiting} waiting</span>·<span style="color:var(--red)">${es.due} due</span></div>
    </div>

    <div class="card" data-sk="faint">
      <h2>next 7 days</h2>
      <svg class="bars-svg" viewBox="0 0 470 110">${bars}</svg>
    </div>

    ${adapt.note ? `<div class="card" data-sk="red">
      <h2 style="color:var(--red)">last weekly check-in ✎</h2>
      <div style="font-size:16.5px;margin-top:6px">${esc(adapt.note)}</div>
    </div>` : ""}

    <div class="card" data-sk="faint">
      <h2>backup</h2>
      <div class="pencil-note" style="margin:6px 0">Safari can evict offline storage — export a backup now and then.</div>
      <div class="row">
        <button class="btn small" data-sk="ink" id="export">Export JSON</button>
        <button class="btn small" data-sk="faint" id="import">Import</button>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" hidden>
    </div>
  </div>`);

  v.querySelector("#tally").appendChild(tallySVG(cur));
  v.querySelector("#back").onclick = renderHome;

  v.querySelector("#export").onclick = async () => {
    const payload = {
      app: "daily-dojo", version: 1, contentVersion: CONTENT_VERSION,
      exportedAt: new Date().toISOString(),
      items: await dbAll("items"), sessions: await dbAll("sessions"), meta: await dbAll("meta"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `daily-dojo-backup-${payload.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  };

  const fileInput = v.querySelector("#import-file");
  v.querySelector("#import").onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== "daily-dojo" || !Array.isArray(data.items)) throw new Error("not a Daily Dojo backup");
      if (!confirm(`Restore backup from ${data.exportedAt?.slice(0, 10) || "unknown date"}? This overwrites current progress.`)) return;
      await dbBulkPut("items", data.items);
      if (Array.isArray(data.sessions)) await dbBulkPut("sessions", data.sessions);
      if (Array.isArray(data.meta)) await dbBulkPut("meta", data.meta);
      items = await dbAll("items");
      sessions = await dbAll("sessions");
      adapt = (await dbGet("meta", "adapt")) || adapt;
      alert("Backup restored ✓");
      renderProgress();
    } catch (e) {
      alert("Couldn't read that file: " + e.message);
    }
  };

  show(v);
}

boot();
