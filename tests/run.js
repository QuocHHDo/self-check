#!/usr/bin/env node
// Runs every unit test suite (tests/*.test.js) with Node's built-in test runner. No dependencies.
//   node tests/run.js
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith(".test.js")).sort().map(f => path.join(dir, f));
const res = spawnSync(process.execPath, ["--test", "--test-reporter=spec", ...files], { stdio: "inherit" });
process.exit(res.status ?? 1);
