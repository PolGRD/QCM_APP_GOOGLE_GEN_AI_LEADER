/*
 * Mock exam engine — Google Cloud Generative AI Leader.
 * Vanilla JS, no dependencies. Requires window.EXAM_DATA (src/questions.js).
 */
(function () {
  "use strict";

  // Questions drawn per domain (60 total, following the exam guide weights ~30/35/20/15 %).
  var EXAM_PLAN = { 1: 18, 2: 21, 3: 12, 4: 9 };
  var EXAM_MINUTES = 90;
  var PASS_HINT = 70; // Google does not publish the passing score: indicative threshold only.
  var LETTERS = ["A", "B", "C", "D"];
  var STORE_KEY = "gal-mock-session-v1";
  var HISTORY_KEY = "gal-mock-history-v1";

  var DATA = window.EXAM_DATA;
  var BY_ID = {};
  DATA.questions.forEach(function (q) { BY_ID[q.id] = q; });

  var app = document.getElementById("app");
  var statsEl = document.getElementById("stats");
  var progressEl = document.getElementById("progress");
  var state = null;
  var timerHandle = null;
  var keyHandler = null;

  /* ---------------- utilities ---------------- */

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
  function link(src) {
    return h("a", { href: src.url, target: "_blank", rel: "noopener noreferrer" }, src.title);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function rand() {
    if (window.crypto && window.crypto.getRandomValues) {
      var b = new Uint32Array(1);
      window.crypto.getRandomValues(b);
      return b[0] / 4294967296;
    }
    return Math.random();
  }
  function load(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable: keep in memory */ }
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }
  function fmtTime(sec) {
    var neg = sec < 0; sec = Math.abs(Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (neg ? "+" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function pct(n, d) { return d ? Math.round((100 * n) / d) : 0; }

  /* ---------------- exam generation ---------------- */

  function buildExam() {
    var picked = [];
    Object.keys(EXAM_PLAN).forEach(function (d) {
      var pool = DATA.questions.filter(function (q) { return String(q.domain) === d; });
      picked = picked.concat(shuffle(pool).slice(0, EXAM_PLAN[d]));
    });
    picked = shuffle(picked);

    // Spread correct positions evenly: exactly n/4 per letter (remainder spread at random).
    var n = picked.length, positions = [];
    for (var i = 0; i < n; i++) positions.push(i % 4);
    positions = shuffle(positions);

    var items = picked.map(function (q, idx) {
      var wrong = shuffle([0, 1, 2]);
      var order = [], w = 0;
      for (var p = 0; p < 4; p++) order.push(p === positions[idx] ? -1 : wrong[w++]);
      // order[p] = -1 means "correct answer", otherwise index in q.distractors
      return { id: q.id, order: order, selected: null, validated: false };
    });

    return { version: 1, items: items, current: 0, startedAt: Date.now(), elapsedMs: 0, finished: false };
  }

  function optionText(q, code) { return code === -1 ? q.answer : q.distractors[code]; }
  function correctIndex(item) { return item.order.indexOf(-1); }

  /* ---------------- timer ---------------- */

  function elapsedSec() {
    if (!state) return 0;
    return (state.elapsedMs + (state.running ? Date.now() - state.resumedAt : 0)) / 1000;
  }
  function startTimer() {
    stopTimer();
    state.running = true;
    state.resumedAt = Date.now();
    timerHandle = setInterval(function () { renderStats(); persist(); }, 1000);
  }
  function stopTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
    if (state && state.running) {
      state.elapsedMs += Date.now() - state.resumedAt;
      state.running = false;
    }
  }
  function persist() {
    if (!state) return;
    var copy = JSON.parse(JSON.stringify(state));
    copy.elapsedMs = elapsedSec() * 1000;
    copy.running = false;
    delete copy.resumedAt;
    save(STORE_KEY, copy);
  }

  /* ---------------- top bar ---------------- */

  function renderStats() {
    statsEl.textContent = "";
    if (!state || state.finished) { progressEl.style.width = "0%"; return; }
    var total = state.items.length;
    var answered = state.items.filter(function (it) { return it.validated; }).length;
    var correct = state.items.filter(function (it) { return it.validated && it.selected === correctIndex(it); }).length;
    var remaining = EXAM_MINUTES * 60 - elapsedSec();
    append(statsEl, [
      h("span", null, "Q ", h("b", null, String(state.current + 1)), "/" + total),
      h("span", { title: "Bonnes réponses / questions répondues" }, "✓ ", h("b", null, String(correct)), "/" + answered),
      h("span", { class: remaining < 0 ? "late" : "", title: "Temps restant sur 90 minutes (indicatif)" },
        "⏱ ", h("b", null, fmtTime(remaining)))
    ]);
    progressEl.style.width = pct(answered, total) + "%";
  }

  /* ---------------- screens ---------------- */

  function clearKeys() {
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }

  function renderStart() {
    clearKeys();
    stopTimer();
    renderStats();
    app.textContent = "";
    var saved = load(STORE_KEY);
    var history = load(HISTORY_KEY) || [];
    var bankCounts = {};
    DATA.questions.forEach(function (q) { bankCounts[q.domain] = (bankCounts[q.domain] || 0) + 1; });

    var resume = null;
    if (saved && !saved.finished && saved.items && saved.items.every(function (it) { return BY_ID[it.id]; })) {
      var done = saved.items.filter(function (it) { return it.validated; }).length;
      resume = h("div", { class: "card" },
        h("div", { class: "eyebrow" }, "Session en cours"),
        h("p", null, "Vous avez répondu à " + done + " question" + (done > 1 ? "s" : "") + " sur " + saved.items.length + "."),
        h("div", { class: "actions" },
          h("button", { class: "btn", type: "button", onclick: function () { state = saved; showQuestion(); } }, "Reprendre la session"),
          h("button", { class: "btn quiet", type: "button", onclick: function () { drop(STORE_KEY); startExam(); } }, "Abandonner et recommencer")
        )
      );
    }

    var rows = Object.keys(DATA.domains).map(function (d) {
      return h("tr", null,
        h("td", null, "Domain " + d + " — " + DATA.domains[d].name),
        h("td", null, EXAM_PLAN[d] + " Q · ~" + Math.round(DATA.domains[d].weight * 100) + " %"));
    });

    app.appendChild(h("div", { class: "card" },
      h("div", { class: "eyebrow" }, "Mock exam · 60 questions · difficulté élevée"),
      h("h1", { style: "font-size:30px" }, "Generative AI Leader — examen blanc"),
      h("p", { class: "lead" }, "Un entraînement en anglais, calqué sur les quatre domaines du guide d'examen Google Cloud. Les questions sont posées une par une ; la correction, l'explication et les sources n'apparaissent qu'après votre réponse."),
      h("ul", { class: "rules" },
        h("li", null, h("strong", null, "60 questions"), " tirées d'une banque de " + DATA.questions.length + ", réparties selon le poids de chaque domaine."),
        h("li", null, h("strong", null, "Bonnes réponses équiréparties :"), " exactement 15 en A, 15 en B, 15 en C et 15 en D, dans un ordre aléatoire."),
        h("li", null, h("strong", null, "90 minutes"), " indicatives, comme l'examen réel. Le chrono continue au-delà sans vous bloquer."),
        h("li", null, h("strong", null, "En fin de session :"), " note, pourcentage, score par domaine et liste des concepts à réviser avec liens.")
      ),
      h("table", { class: "domains-table" }, h("tbody", null, rows)),
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "button", onclick: function () { drop(STORE_KEY); startExam(); } }, resume ? "Nouvel examen" : "Commencer l'examen")
      ),
      h("p", { class: "note" }, "Raccourcis : touches A–D ou 1–4 pour choisir, Entrée pour valider puis passer à la suite. Les noms de produits suivent le guide d'examen (Vertex AI, Vertex AI Search…) ; les explications signalent les renommages récents.")
    ));
    if (resume) app.insertBefore(resume, app.firstChild);
    if (history.length) app.appendChild(renderHistory(history));
  }

  function startExam() {
    state = buildExam();
    persist();
    showQuestion();
  }

  function showQuestion() {
    if (state.finished) { renderResults(); return; }
    if (!timerHandle) startTimer();
    clearKeys();
    app.textContent = "";
    var item = state.items[state.current];
    var q = BY_ID[item.id];
    var total = state.items.length;
    var ok = correctIndex(item);

    var optionButtons = item.order.map(function (code, p) {
      var cls = "opt";
      var tag = null;
      if (item.validated) {
        if (p === ok) { cls += " is-correct"; tag = "Bonne réponse"; }
        else if (p === item.selected) { cls += " is-wrong"; tag = "Votre réponse"; }
      }
      return h("button", {
        class: cls, type: "button", role: "radio",
        "aria-checked": item.selected === p ? "true" : "false",
        disabled: item.validated,
        onclick: function () { select(p); }
      },
        h("span", { class: "bubble", "aria-hidden": "true" }, LETTERS[p]),
        h("span", { class: "txt" }, h("span", { class: "sr-only" }, LETTERS[p] + ". "), optionText(q, code), tag ? h("span", { class: "tag" }, tag) : null)
      );
    });

    var validateBtn = h("button", { class: "btn", type: "button", disabled: item.selected === null, onclick: validate }, "Valider ma réponse");
    var nextBtn = h("button", { class: "btn", type: "button", onclick: next }, state.current + 1 < total ? "Question suivante" : "Voir mes résultats");

    var card = h("div", { class: "card" },
      h("div", { class: "q-meta" },
        h("span", { class: "eyebrow" }, "Question " + (state.current + 1) + " / " + total),
        item.validated ? h("span", { class: "chip" }, "Domain " + q.domain + " · " + DATA.concepts[q.concept].label) : null
      ),
      h("p", { class: "q-text", id: "qtext" }, q.question),
      h("div", { class: "options", role: "radiogroup", "aria-labelledby": "qtext" }, optionButtons),
      item.validated ? renderFeedback(q, item) : null,
      h("div", { class: "actions" },
        item.validated ? nextBtn : validateBtn,
        h("span", { class: "kbd" }, item.validated ? "Entrée → suite" : "A–D pour choisir · Entrée pour valider")
      )
    );
    app.appendChild(card);
    app.appendChild(renderEndControl());
    renderStats();

    keyHandler = function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key.toUpperCase();
      var idx = LETTERS.indexOf(k);
      if (idx < 0 && k >= "1" && k <= "4") idx = Number(k) - 1;
      if (idx >= 0 && !item.validated) { e.preventDefault(); select(idx); return; }
      if (e.key === "Enter") {
        if (e.target && e.target.tagName === "BUTTON" && !e.target.classList.contains("opt")) return; // native button press
        e.preventDefault();
        if (!item.validated && item.selected !== null) validate();
        else if (item.validated) next();
      }
    };
    document.addEventListener("keydown", keyHandler);

    function select(p) {
      if (item.validated) return;
      item.selected = p;
      persist();
      var focusIdx = p;
      showQuestion();
      var btns = app.querySelectorAll(".opt");
      if (btns[focusIdx]) btns[focusIdx].focus();
    }
    function validate() {
      if (item.selected === null || item.validated) return;
      item.validated = true;
      persist();
      showQuestion();
      var fb = app.querySelector(".feedback");
      if (fb && fb.scrollIntoView) fb.scrollIntoView({ block: "nearest", behavior: "smooth" });
      var nb = app.querySelector(".actions .btn");
      if (nb) nb.focus({ preventScroll: true });
    }
    function next() {
      if (state.current + 1 < total) { state.current++; persist(); showQuestion(); window.scrollTo(0, 0); }
      else finish();
    }
  }

  function renderFeedback(q, item) {
    var ok = correctIndex(item);
    var good = item.selected === ok;
    return h("div", { class: "feedback " + (good ? "good" : "bad"), role: "status" },
      h("h3", null, good ? "Correct" : "Incorrect — la bonne réponse est " + LETTERS[ok]),
      good ? null : h("p", null, h("strong", null, LETTERS[ok] + ". "), q.answer),
      h("p", null, q.explanation),
      h("div", null,
        h("div", { class: "eyebrow" }, "Sources"),
        h("ul", { class: "sources" }, q.sources.map(function (s) { return h("li", null, link(DATA.sources[s])); }))
      )
    );
  }

  function renderEndControl() {
    var box = h("div", { class: "actions" });
    var btn = h("button", { class: "btn quiet", type: "button", onclick: function () {
      box.textContent = "";
      var unanswered = state.items.filter(function (it) { return !it.validated; }).length;
      box.appendChild(h("div", { class: "confirm" },
        h("span", null, "Terminer maintenant ? Les " + unanswered + " question(s) sans réponse validée seront comptées fausses."),
        h("div", { class: "actions" },
          h("button", { class: "btn danger", type: "button", onclick: finish }, "Terminer l'examen"),
          h("button", { class: "btn quiet", type: "button", onclick: function () { box.replaceWith(renderEndControl()); } }, "Continuer")
        )
      ));
    } }, "Terminer l'examen maintenant");
    box.appendChild(btn);
    return box;
  }

  /* ---------------- results ---------------- */

  function computeResults(s) {
    var res = { total: s.items.length, correct: 0, unanswered: 0, byDomain: {}, byConcept: {}, letters: [0, 0, 0, 0], missed: [] };
    Object.keys(DATA.domains).forEach(function (d) { res.byDomain[d] = { ok: 0, n: 0 }; });
    s.items.forEach(function (it) {
      var q = BY_ID[it.id];
      var okIdx = correctIndex(it);
      var good = it.validated && it.selected === okIdx;
      res.letters[okIdx]++;
      if (!it.validated) res.unanswered++;
      if (good) res.correct++;
      else res.missed.push(it);
      res.byDomain[q.domain].n++;
      if (good) res.byDomain[q.domain].ok++;
      var c = res.byConcept[q.concept] || (res.byConcept[q.concept] = { ok: 0, n: 0 });
      c.n++;
      if (good) c.ok++;
    });
    res.pct = pct(res.correct, res.total);
    return res;
  }

  function finish() {
    stopTimer();
    state.finished = true;
    var r = computeResults(state);
    var hist = load(HISTORY_KEY) || [];
    hist.unshift({
      date: new Date().toISOString(), correct: r.correct, total: r.total, pct: r.pct,
      minutes: Math.round(state.elapsedMs / 60000),
      byDomain: r.byDomain,
      weak: Object.keys(r.byConcept).filter(function (k) { return r.byConcept[k].ok < r.byConcept[k].n; })
    });
    save(HISTORY_KEY, hist.slice(0, 20));
    persist();
    renderResults();
    window.scrollTo(0, 0);
  }

  function ring(p) {
    var r = 52, c = 2 * Math.PI * r, off = c * (1 - p / 100);
    var color = p >= PASS_HINT ? "var(--good)" : "var(--bad)";
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 128 128");
    svg.setAttribute("class", "score-ring");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", p + " % de bonnes réponses");
    function el(tag, attrs) {
      var e = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      svg.appendChild(e);
      return e;
    }
    el("circle", { cx: 64, cy: 64, r: r, fill: "none", stroke: "var(--rule)", "stroke-width": 10 });
    el("circle", { cx: 64, cy: 64, r: r, fill: "none", stroke: color, "stroke-width": 10, "stroke-linecap": "round",
      "stroke-dasharray": c.toFixed(2), "stroke-dashoffset": off.toFixed(2), transform: "rotate(-90 64 64)" });
    var t = el("text", { x: 64, y: 72, "text-anchor": "middle", "font-size": 26, "font-weight": 600 });
    t.textContent = p + "%";
    return svg;
  }

  function barRow(label, ok, n) {
    var p = pct(ok, n);
    var color = p >= PASS_HINT ? "var(--good)" : p >= 50 ? "var(--warn)" : "var(--bad)";
    return h("div", { class: "bar-row" },
      h("span", null, label),
      h("span", { class: "val" }, ok + "/" + n + " · " + p + " %"),
      h("div", { class: "track" }, h("i", { style: "width:" + p + "%;background:" + color }))
    );
  }

  function renderResults() {
    clearKeys();
    stopTimer();
    renderStats();
    app.textContent = "";
    var r = computeResults(state);
    var pass = r.pct >= PASS_HINT;
    var minutes = Math.round(state.elapsedMs / 60000);

    app.appendChild(h("div", { class: "card" },
      h("div", { class: "eyebrow" }, "Résultat de la session"),
      h("div", { class: "score-head" },
        ring(r.pct),
        h("div", null,
          h("div", { class: "score-big" }, r.correct + " / " + r.total),
          h("p", { style: "margin:8px 0" }, h("span", { class: "verdict " + (pass ? "pass" : "fail") },
            pass ? "Au-dessus du seuil indicatif de " + PASS_HINT + " %" : "Sous le seuil indicatif de " + PASS_HINT + " %")),
          h("p", { class: "note", style: "margin:0" },
            "Durée : " + minutes + " min sur 90" + (r.unanswered ? " · " + r.unanswered + " question(s) sans réponse" : "") +
            ". Google ne publie pas le score de réussite officiel : le seuil de " + PASS_HINT + " % n'est qu'un repère.")
        )
      )
    ));

    app.appendChild(h("div", { class: "card" },
      h("h2", { style: "font-size:20px" }, "Score par domaine"),
      h("div", { class: "bars" }, Object.keys(DATA.domains).map(function (d) {
        return barRow("Domain " + d + " — " + DATA.domains[d].name, r.byDomain[d].ok, r.byDomain[d].n);
      }))
    ));

    // Concepts to review: any concept with at least one error, worst first.
    var weak = Object.keys(r.byConcept).filter(function (k) { return r.byConcept[k].ok < r.byConcept[k].n; });
    weak.sort(function (a, b) {
      var ra = r.byConcept[a].ok / r.byConcept[a].n, rb = r.byConcept[b].ok / r.byConcept[b].n;
      return ra - rb || (r.byConcept[b].n - r.byConcept[b].ok) - (r.byConcept[a].n - r.byConcept[a].ok);
    });
    var strong = Object.keys(r.byConcept).filter(function (k) { return r.byConcept[k].ok === r.byConcept[k].n; });

    app.appendChild(h("div", { class: "card" },
      h("h2", { style: "font-size:20px" }, "Concepts à réviser en priorité"),
      weak.length
        ? h("ul", { class: "concepts" }, weak.map(function (k) {
            var c = DATA.concepts[k], st = r.byConcept[k];
            var rate = st.ok / st.n;
            return h("li", { class: rate >= 0.5 ? "mid" : "" },
              h("div", { class: "c-head" }, h("span", null, c.label),
                h("span", { class: "mono" }, (st.n - st.ok) + " erreur(s) sur " + st.n + " · Domain " + c.domain)),
              h("div", { class: "links" }, c.review.map(function (s) { return link(DATA.sources[s]); }))
            );
          }))
        : h("p", null, "Aucune erreur : tous les concepts rencontrés sont maîtrisés."),
      strong.length ? h("p", { class: "note" }, "Maîtrisés dans cette session : " + strong.map(function (k) { return DATA.concepts[k].label; }).join(" · ") + ".") : null
    ));

    if (r.missed.length) {
      app.appendChild(h("div", { class: "card" },
        h("h2", { style: "font-size:20px" }, "Revoir mes erreurs (" + r.missed.length + ")"),
        r.missed.map(function (it) {
          var q = BY_ID[it.id], okIdx = correctIndex(it);
          var n = state.items.indexOf(it) + 1;
          return h("details", { class: "review" },
            h("summary", null, "Q" + n + " · " + DATA.concepts[q.concept].label),
            h("div", { class: "body" },
              h("p", null, q.question),
              h("div", { class: "ans-line mine" }, h("span", { class: "lbl" }, "Votre réponse"),
                h("span", { class: "v" }, it.validated && it.selected !== null ? LETTERS[it.selected] + ". " + optionText(q, it.order[it.selected]) : "Pas de réponse")),
              h("div", { class: "ans-line right" }, h("span", { class: "lbl" }, "Bonne réponse"),
                h("span", { class: "v" }, LETTERS[okIdx] + ". " + q.answer)),
              h("p", null, q.explanation),
              h("ul", { class: "sources" }, q.sources.map(function (s) { return h("li", null, link(DATA.sources[s])); }))
            )
          );
        })
      ));
    }

    app.appendChild(h("div", { class: "card" },
      h("h2", { style: "font-size:20px" }, "Répartition des bonnes réponses"),
      h("div", { class: "letters" }, LETTERS.map(function (L, i) { return h("span", null, L + " : " + r.letters[i]); })),
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "button", onclick: function () { drop(STORE_KEY); startExam(); window.scrollTo(0, 0); } }, "Nouvel examen"),
        h("button", { class: "btn ghost", type: "button", onclick: function () { drop(STORE_KEY); state = null; renderStart(); } }, "Accueil")
      )
    ));

    var hist = load(HISTORY_KEY) || [];
    if (hist.length > 1) app.appendChild(renderHistory(hist));
  }

  function renderHistory(hist) {
    var weakCount = {};
    hist.forEach(function (s) { (s.weak || []).forEach(function (k) { weakCount[k] = (weakCount[k] || 0) + 1; }); });
    var recurring = Object.keys(weakCount).filter(function (k) { return weakCount[k] > 1 && DATA.concepts[k]; })
      .sort(function (a, b) { return weakCount[b] - weakCount[a]; }).slice(0, 6);
    return h("div", { class: "card" },
      h("h2", { style: "font-size:20px" }, "Historique"),
      h("div", { class: "table-scroll" }, h("table", { class: "history" },
        h("thead", null, h("tr", null, h("th", null, "Date"), h("th", null, "Score"), h("th", null, "%"), h("th", null, "Durée"))),
        h("tbody", null, hist.slice(0, 10).map(function (s) {
          return h("tr", null,
            h("td", null, new Date(s.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })),
            h("td", { class: "n" }, s.correct + "/" + s.total),
            h("td", { class: "n" }, s.pct + " %"),
            h("td", { class: "n" }, s.minutes + " min"));
        }))
      )),
      recurring.length ? h("p", { class: "note" }, "Concepts manqués lors de plusieurs sessions : " +
        recurring.map(function (k) { return DATA.concepts[k].label + " (" + weakCount[k] + "×)"; }).join(" · ") + ".") : null,
      h("div", { class: "actions" }, h("button", { class: "btn quiet", type: "button", onclick: function (e) {
        drop(HISTORY_KEY); e.target.closest(".card").remove();
      } }, "Effacer l'historique"))
    );
  }

  /* ---------------- boot ---------------- */

  window.addEventListener("beforeunload", function () { if (state && !state.finished) persist(); });
  document.addEventListener("visibilitychange", function () {
    if (!state || state.finished) return;
    if (document.hidden) { stopTimer(); persist(); }
    else if (app.querySelector(".opt")) startTimer();
  });

  renderStart();
})();
