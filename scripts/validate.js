#!/usr/bin/env node
/*
 * Validates the question bank:
 *  - structure (ids, 3 distractors, known concepts and sources, domain coherence)
 *  - enough questions per domain to build a 60-question exam
 *  - neutrality heuristics: the correct answer should not stand out by length
 *    and options should avoid giveaway wording ("all of the above", ...).
 * Usage: node scripts/validate.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "src/questions.js"), "utf8"), ctx);
const { domains, concepts, sources, questions } = ctx.window.EXAM_DATA;
const { EXAM_PLAN } = loadPlan();

let errors = 0;
const warn = [];
const fail = (m) => { errors++; console.error("ERROR  " + m); };

const ids = new Set();
for (const q of questions) {
  if (ids.has(q.id)) fail(`duplicate id ${q.id}`);
  ids.add(q.id);
  if (!domains[q.domain]) fail(`${q.id}: unknown domain ${q.domain}`);
  const c = concepts[q.concept];
  if (!c) fail(`${q.id}: unknown concept ${q.concept}`);
  else if (c.domain !== q.domain) fail(`${q.id}: concept ${q.concept} belongs to domain ${c.domain}`);
  if (!Array.isArray(q.distractors) || q.distractors.length !== 3) fail(`${q.id}: needs exactly 3 distractors`);
  const opts = [q.answer, ...(q.distractors || [])];
  if (new Set(opts.map((o) => o.trim().toLowerCase())).size !== 4) fail(`${q.id}: duplicate options`);
  for (const o of opts) {
    if (/all of the above|none of the above|both .* and .* above/i.test(o)) fail(`${q.id}: giveaway option "${o}"`);
  }
  if (!q.explanation || q.explanation.length < 80) fail(`${q.id}: explanation too short`);
  if (/\b(option|answer) [A-D]\b/.test(q.explanation)) fail(`${q.id}: explanation refers to a letter`);
  if (!q.sources || !q.sources.length) fail(`${q.id}: no sources`);
  for (const s of q.sources || []) if (!sources[s]) fail(`${q.id}: unknown source ${s}`);
}
for (const [k, c] of Object.entries(concepts)) {
  for (const s of c.review) if (!sources[s]) fail(`concept ${k}: unknown review source ${s}`);
  if (!questions.some((q) => q.concept === k)) warn.push(`concept ${k} has no question`);
}
for (const [k, s] of Object.entries(sources)) {
  if (!/^https:\/\/[^\s]+$/.test(s.url)) fail(`source ${k}: invalid url ${s.url}`);
}

// Domain coverage vs exam plan
console.log("\nDomain coverage (bank → exam):");
for (const d of Object.keys(domains)) {
  const n = questions.filter((q) => String(q.domain) === d).length;
  const need = EXAM_PLAN[d];
  console.log(`  D${d} ${domains[d].name.padEnd(55)} ${String(n).padStart(3)} → ${need}`);
  if (n < need) fail(`domain ${d}: only ${n} questions, exam needs ${need}`);
}

// Length neutrality
let longest = 0, shortest = 0, ratioSum = 0;
const flagged = [];
for (const q of questions) {
  const a = q.answer.length;
  const ds = q.distractors.map((d) => d.length);
  const avgD = ds.reduce((x, y) => x + y, 0) / 3;
  ratioSum += a / avgD;
  if (a > Math.max(...ds)) longest++;
  if (a < Math.min(...ds)) shortest++;
  if (a > 1.25 * Math.max(...ds) || a < 0.75 * Math.min(...ds)) flagged.push(`${q.id} (${a} vs ${ds.join("/")})`);
}
const n = questions.length;
console.log(`\nNeutrality:`);
console.log(`  correct answer strictly longest : ${longest}/${n} (${((100 * longest) / n).toFixed(0)}%, chance level ≈ 25%)`);
console.log(`  correct answer strictly shortest: ${shortest}/${n} (${((100 * shortest) / n).toFixed(0)}%)`);
console.log(`  mean length ratio answer/distractors: ${(ratioSum / n).toFixed(2)}`);
if (flagged.length) warn.push("length outliers: " + flagged.join(", "));
if (longest / n > 0.35) fail("correct answer is too often the longest option");
if (shortest / n > 0.35) fail("correct answer is too often the shortest option");

warn.forEach((w) => console.warn("WARN   " + w));
console.log(`\n${questions.length} questions, ${Object.keys(concepts).length} concepts, ${Object.keys(sources).length} sources.`);
if (errors) { console.error(`\n${errors} error(s).`); process.exit(1); }
console.log("OK");

function loadPlan() {
  const appSrc = fs.readFileSync(path.join(root, "src/app.js"), "utf8");
  const m = appSrc.match(/EXAM_PLAN\s*=\s*(\{[^}]*\})/);
  if (!m) throw new Error("EXAM_PLAN not found in src/app.js");
  return { EXAM_PLAN: vm.runInNewContext("(" + m[1] + ")") };
}
