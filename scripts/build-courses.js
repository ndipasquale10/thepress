#!/usr/bin/env node
/*
 * build-courses.js — validate the built-in course database in data/courses.json
 * and render it as the COURSE_DB literal.
 *
 * The app is an offline-first PWA that reads COURSE_DB synchronously, so the
 * data is inlined into index.html rather than fetched at runtime. scripts/build.js
 * does the inlining, using validate() and buildBlock() from here.
 *
 * Usage (kept for habit; both run the full build):
 *   node scripts/build-courses.js          # rebuild index.html
 *   node scripts/build-courses.js --check  # verify index.html is in sync (CI)
 */
"use strict";

const START = "/*__COURSE_DB_START__*/";
const END = "/*__COURSE_DB_END__*/";

function fail(msg) { console.error("build-courses: " + msg); process.exit(1); }

function isPerm18(a) {
  if (!Array.isArray(a) || a.length !== 18) return false;
  const s = [...a].sort((x, y) => x - y);
  for (let i = 0; i < 18; i++) if (s[i] !== i + 1) return false;
  return true;
}

function validate(courses) {
  if (!Array.isArray(courses) || !courses.length) fail("data/courses.json is empty or not an array");
  const seen = new Set();
  courses.forEach((c, i) => {
    const at = `course #${i} (${c && c.name ? c.name : "?"})`;
    if (!c || typeof c.name !== "string" || !c.name) fail(`${at}: missing name`);
    if (typeof c.city !== "string") fail(`${at}: missing city`);
    if (typeof c.state !== "string" || !c.state) fail(`${at}: missing state`);
    const key = c.name.toLowerCase();
    if (seen.has(key)) fail(`${at}: duplicate name`);
    seen.add(key);
    if (!Array.isArray(c.pars) || c.pars.length !== 18) fail(`${at}: pars must have 18 entries`);
    if (c.pars.some(p => !Number.isInteger(p) || p < 3 || p > 6)) fail(`${at}: pars out of range`);
    if (!isPerm18(c.hdcps)) fail(`${at}: hdcps must be a permutation of 1..18`);
    if (!Array.isArray(c.tees) || !c.tees.length) fail(`${at}: needs at least one tee`);
    c.tees.forEach(t => {
      if (!t || typeof t.name !== "string" || !t.name) fail(`${at}: tee missing name`);
      if (typeof t.rating !== "number" || t.rating < 55 || t.rating > 85) fail(`${at}: tee ${t.name} rating out of range`);
      if (typeof t.slope !== "number" || t.slope < 55 || t.slope > 155) fail(`${at}: tee ${t.name} slope out of range`);
      if (typeof t.yds !== "number" || t.yds < 1000 || t.yds > 8500) fail(`${at}: tee ${t.name} yds out of range`);
    });
  });
}

function literal(courses) {
  const body = courses.map(c => {
    const tees = c.tees.map(t =>
      `{name:${JSON.stringify(t.name)},rating:${t.rating},slope:${t.slope},yds:${t.yds}}`
    ).join(",");
    return `{name:${JSON.stringify(c.name)},city:${JSON.stringify(c.city)},` +
      `state:${JSON.stringify(c.state)},tees:[${tees}],` +
      `pars:[${c.pars.join(",")}],hdcps:[${c.hdcps.join(",")}]}`;
  }).join(",");
  return `[${body}]`;
}

function buildBlock(courses) {
  return `${START}const COURSE_DB=${literal(courses)};${END}`;
}

if (require.main === module) require("./build").main();
module.exports = { validate, buildBlock };
