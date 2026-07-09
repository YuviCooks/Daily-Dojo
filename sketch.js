// Hand-sketched SVG borders and marks — tiny homegrown stand-in for Rough.js
// so the app has zero network dependencies.

function j(v, amt) { return v + (Math.random() * 2 - 1) * amt; }

// One wobbly rectangle pass as an SVG path.
function roughRectPath(w, h, wob) {
  const inset = 3;
  const pts = [
    [j(inset, wob), j(inset, wob)],
    [j(w - inset, wob), j(inset, wob)],
    [j(w - inset, wob), j(h - inset, wob)],
    [j(inset, wob), j(h - inset, wob)],
  ];
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} `;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const mx = j((a[0] + b[0]) / 2, wob * 1.6);
    const my = j((a[1] + b[1]) / 2, wob * 1.6);
    d += `Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)} `;
  }
  return d + "Z";
}

const COLORS = {
  ink: "var(--ink)",
  red: "var(--red)",
  faint: "var(--ink-faint)",
};

function drawInto(el) {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  let svg = el.querySelector(":scope > .sk-svg");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "sk-svg");
    svg.setAttribute("aria-hidden", "true");
    el.insertBefore(svg, el.firstChild);
  }
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const color = COLORS[el.dataset.sk] || COLORS.ink;
  const wob = el.dataset.skWob ? parseFloat(el.dataset.skWob) : 2.2;
  const sw = el.dataset.skW || 2;
  svg.innerHTML =
    `<path d="${roughRectPath(w, h, wob)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>` +
    `<path d="${roughRectPath(w, h, wob)}" fill="none" stroke="${color}" stroke-width="${sw * 0.5}" stroke-linecap="round" opacity="0.45"/>`;
}

const ro = new ResizeObserver((entries) => {
  for (const e of entries) drawInto(e.target);
});

// Sketch borders onto every [data-sk] element inside root.
export function sketchAll(root) {
  root.querySelectorAll("[data-sk]").forEach((el) => {
    drawInto(el);
    ro.observe(el);
  });
}

// Big red tick / cross, drawn on like a pen stroke (CSS animates the paths).
export function markSVG(correct) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "mark-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  if (correct) {
    svg.innerHTML = `<path pathLength="1" d="M ${j(14,3)} ${j(56,3)} Q ${j(34,3)} ${j(74,3)} ${j(42,3)} ${j(84,3)} Q ${j(56,4)} ${j(52,4)} ${j(88,3)} ${j(14,3)}"/>`;
  } else {
    svg.innerHTML =
      `<path pathLength="1" d="M ${j(20,3)} ${j(20,3)} Q ${j(50,4)} ${j(50,4)} ${j(82,3)} ${j(82,3)}"/>` +
      `<path pathLength="1" d="M ${j(80,3)} ${j(20,3)} Q ${j(50,4)} ${j(50,4)} ${j(18,3)} ${j(80,3)}"/>`;
  }
  return svg;
}

// Tally marks for the streak (groups of five, fifth stroke crosses through).
export function tallySVG(n) {
  const shown = Math.min(n, 25);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "tally-svg");
  const groups = Math.ceil(shown / 5);
  const gw = 34;
  svg.setAttribute("viewBox", `0 0 ${Math.max(groups * gw, 10)} 34`);
  svg.setAttribute("width", Math.max(groups * gw, 10));
  let html = "";
  for (let i = 0; i < shown; i++) {
    const g = Math.floor(i / 5), k = i % 5;
    const x0 = g * gw + 4;
    if (k < 4) {
      html += `<path d="M ${j(x0 + k * 6, 1)} ${j(6, 1.5)} Q ${j(x0 + k * 6 + 1, 1.5)} 17 ${j(x0 + k * 6, 1)} ${j(28, 1.5)}"/>`;
    } else {
      html += `<path d="M ${j(x0 - 3, 1)} ${j(24, 1.5)} Q ${x0 + 9} 15 ${j(x0 + 22, 1)} ${j(8, 1.5)}"/>`;
    }
  }
  svg.innerHTML = html;
  return svg;
}

// Rough circle for the homework-style score.
export function circlePath(cx, cy, r) {
  let d = "";
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 - 0.4;
    const rr = j(r, 2.5);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    d += (i === 0 ? "M" : "L") + ` ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d;
}
