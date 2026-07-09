// Language helpers: romaji -> hiragana conversion and lenient answer checking.

// ---- kana ----

const DIGRAPHS = {
  kya:"きゃ",kyu:"きゅ",kyo:"きょ",gya:"ぎゃ",gyu:"ぎゅ",gyo:"ぎょ",
  sha:"しゃ",shu:"しゅ",sho:"しょ",sya:"しゃ",syu:"しゅ",syo:"しょ",
  ja:"じゃ",ju:"じゅ",jo:"じょ",jya:"じゃ",jyu:"じゅ",jyo:"じょ",
  cha:"ちゃ",chu:"ちゅ",cho:"ちょ",tya:"ちゃ",tyu:"ちゅ",tyo:"ちょ",
  nya:"にゃ",nyu:"にゅ",nyo:"にょ",hya:"ひゃ",hyu:"ひゅ",hyo:"ひょ",
  bya:"びゃ",byu:"びゅ",byo:"びょ",pya:"ぴゃ",pyu:"ぴゅ",pyo:"ぴょ",
  mya:"みゃ",myu:"みゅ",myo:"みょ",rya:"りゃ",ryu:"りゅ",ryo:"りょ",
  shi:"し",chi:"ち",tsu:"つ",dzu:"づ",
};
const BASIC = {
  a:"あ",i:"い",u:"う",e:"え",o:"お",
  ka:"か",ki:"き",ku:"く",ke:"け",ko:"こ",
  ga:"が",gi:"ぎ",gu:"ぐ",ge:"げ",go:"ご",
  sa:"さ",si:"し",su:"す",se:"せ",so:"そ",
  za:"ざ",zi:"じ",zu:"ず",ze:"ぜ",zo:"ぞ",
  ta:"た",ti:"ち",tu:"つ",te:"て",to:"と",
  da:"だ",di:"ぢ",du:"づ",de:"で",do:"ど",
  na:"な",ni:"に",nu:"ぬ",ne:"ね",no:"の",
  ha:"は",hi:"ひ",hu:"ふ",fu:"ふ",he:"へ",ho:"ほ",
  ba:"ば",bi:"び",bu:"ぶ",be:"べ",bo:"ぼ",
  pa:"ぱ",pi:"ぴ",pu:"ぷ",pe:"ぺ",po:"ぽ",
  ma:"ま",mi:"み",mu:"む",me:"め",mo:"も",
  ya:"や",yu:"ゆ",yo:"よ",
  ra:"ら",ri:"り",ru:"る",re:"れ",ro:"ろ",
  wa:"わ",wo:"を",ji:"じ",
};
const VOWELS = "aiueo";

export function toHiragana(romaji) {
  let s = romaji
    .toLowerCase()
    .replace(/ā/g, "aa").replace(/ī/g, "ii").replace(/ū/g, "uu")
    .replace(/ē/g, "ee").replace(/ō/g, "ou")
    .replace(/[\s'’-]/g, (c) => (c === "-" ? "ー" : ""));
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // sokuon: doubled consonant (incl. tch)
    if (i + 1 < s.length && c === s[i + 1] && !VOWELS.includes(c) && c !== "n" && /[a-z]/.test(c)) {
      out += "っ"; i++; continue;
    }
    if (c === "t" && s.slice(i, i + 3) === "tch") { out += "っ"; i++; continue; }
    // n handling
    if (c === "n") {
      const nxt = s[i + 1];
      if (nxt === "n") { out += "ん"; i += 2; continue; }
      if (nxt === undefined || (!VOWELS.includes(nxt) && nxt !== "y")) { out += "ん"; i++; continue; }
    }
    let matched = false;
    for (const len of [3, 2, 1]) {
      const chunk = s.slice(i, i + len);
      const kana = DIGRAPHS[chunk] || BASIC[chunk];
      if (kana) { out += kana; i += len; matched = true; break; }
    }
    if (!matched) { out += c; i++; } // pass through kana/kanji/ー typed directly
  }
  return out;
}

export function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const JA_PUNCT = /[\s、。！？・「」『』～〜,.!?'’"-]/g;

function normJA(s) {
  // づ/ぢ sound identical to ず/じ — fold them so typed romaji matches
  return kataToHira(s.trim()).replace(JA_PUNCT, "").replace(/づ/g, "ず").replace(/ぢ/g, "じ");
}

// Fold long vowels so "shoyu"/"shouyu" and コーヒー/こおひい all agree.
const HIRA_VOWEL = (() => {
  const map = {};
  const rows = { a:"あかがさざただなはばぱまやらわゃ", i:"いきぎしじちぢにひびぴみりぃ", u:"うくぐすずつづぬふぶぷむゆるゅっ", e:"えけげせぜてでねへべぺめれぇ", o:"おこごそぞとどのほぼぽもよろをょ" };
  for (const [v, chars] of Object.entries(rows)) for (const c of chars) map[c] = v;
  return map;
})();

export function collapseLong(hira) {
  let out = "";
  let prevVowel = "";
  for (const c of hira) {
    if (c === "ー") continue;
    const isPureVowel = "あいうえお".includes(c);
    const v = HIRA_VOWEL[c] || "";
    if (isPureVowel && (v === prevVowel || (v === "u" && prevVowel === "o") || (v === "i" && prevVowel === "e"))) {
      continue; // long-vowel extension, drop it
    }
    out += c;
    if (v) prevVowel = v;
  }
  return out;
}

// Accepts kana, kanji (exact target), or romaji.
export function checkJA(input, item) {
  if (!input) return false;
  const kana = kataToHira(item.kana || "");
  const hasJa = /[぀-ヿ一-鿿]/.test(input);
  const typed = hasJa ? normJA(input) : normJA(toHiragana(input));
  if (!typed) return false;
  if (item.target && input.trim().replace(JA_PUNCT, "") === item.target.replace(JA_PUNCT, "")) return true;
  const target = normJA(kana);
  return typed === target || collapseLong(typed) === collapseLong(target);
}

// ---- Spanish ----

function normES(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿¡?!.,;:'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ARTICLES = /^(el|la|los|las|un|una|unos|unas) /;

export function checkES(input, item) {
  if (!input) return false;
  const a = normES(input);
  const b = normES(item.target);
  if (!a) return false;
  return a === b || a === b.replace(ARTICLES, "") || a.replace(ARTICLES, "") === b.replace(ARTICLES, "");
}

export function checkAnswer(input, item) {
  return item.lang === "ja" ? checkJA(input, item) : checkES(input, item);
}
