#!/usr/bin/env node
// scripts/attribution-lint.mjs — no AI attribution, no citations a reader cannot follow.
// Zero dependencies: this repository has no package manifest, and the check must not add one.
//
// This repository is public, and every customer's CI runs what it holds. Its files, its commit
// messages and its pull requests are read by the people deciding whether to trust it, so all of it
// must read as the work of the people who stand behind it. Two rules, enforced everywhere:
//
//   A1  NO AI ATTRIBUTION — no `Co-Authored-By:` an AI tool, no AI session links, no "generated with"
//       footers, no robot emoji, and no prose crediting an AI tool with the work.
//   C1  NOTHING A READER CANNOT FOLLOW — no pointers into cupel's private repositories, no internal
//       decision-record numbers or documentation paths, and no agent configuration. In a public
//       repository all of these are dead ends, and a dead end reads as something withheld.
//
// NO ESCAPE HATCH. A rule that holds "always" cannot carry a one-comment bypass. Exactly two files are
// exempt, by path, because they must spell out what they ban: this script and its test.
//
// Usage:
//   node scripts/attribution-lint.mjs                        tracked + untracked-unignored files
//   node scripts/attribution-lint.mjs --commits <base-ref>   messages of <base-ref>..HEAD
//   node scripts/attribution-lint.mjs --stdin                text on stdin (PR title and body)
//
// Exit codes: 0 clean · 1 violations · 2 usage/IO error.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_BYTES = 2 * 1024 * 1024;

const EXEMPT = new Set(["scripts/attribution-lint.mjs", "scripts/attribution-lint.test.mjs"]);

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz"]);

/** AI tools a trailer or footer might credit. */
const AI_TOOLS =
  "claude|anthropic|openai|chatgpt|gpt-?\\d|copilot|gemini|cursor|codex|devin|windsurf";

/** cupel's repositories that a reader of this one cannot open. */
const PRIVATE_REPOS = "app|cupel|shard-build|website|cupel-test-app";

const RULES = [
  {
    id: "A1",
    re: new RegExp(`co-authored-by:[^\\n]*(?:${AI_TOOLS})`, "gi"),
    message: "an AI tool credited as a co-author",
  },
  { id: "A1", re: /noreply@anthropic\.com/gi, message: "an AI tool's attribution address" },
  { id: "A1", re: /\bclaude-session:/gi, message: "an AI session trailer" },
  {
    id: "A1",
    re: /\bclaude\.(?:ai|com)\/(?:code|claude-code)\b/gi,
    message: "a link to an AI coding session or tool",
  },
  {
    id: "A1",
    re: new RegExp(`\\bgenerated (?:with|by|using) \\[?(?:${AI_TOOLS}|an? ai\\b|ai\\b)`, "gi"),
    message: "a generated-with-AI footer",
  },
  { id: "A1", re: /\u{1F916}/gu, message: "the robot emoji used by AI attribution footers" },
  {
    id: "A1",
    // PROSE PROVENANCE, not only formal markers: a verb of making, then with/by/using, then a tool,
    // inside one sentence. NOT when the tool is followed by a command-line flag ("run by claude -p"
    // names a command, not a credit) — a check with no escape hatch cannot afford that false positive.
    re: new RegExp(
      `\\b(?:drafted|written|wrote|generated|refined|created|made|built|authored|produced|designed|assisted)\\b[^.\\n]{0,40}\\b(?:with|by|using)\\b[^.\\n]{0,25}\\b(?:${AI_TOOLS})\\b(?!\\s+-)`,
      "gi",
    ),
    message: "prose crediting an AI tool with the work",
  },
  {
    id: "C1",
    re: new RegExp(`\\bcupel-sh\\/(?:${PRIVATE_REPOS})\\b`, "gi"),
    message: "a pointer into a private repository",
  },
  {
    id: "C1",
    re: /\bpackages\/(?:api|app|data|contract)\//g,
    message: "a path inside a private repository",
  },
  { id: "C1", re: /\bADR-\d{2,4}\b/g, message: "an internal decision-record number" },
  {
    id: "C1",
    re: /\bdocs\/(?:decisions|architecture|security)\//g,
    message: "an internal documentation path",
  },
  { id: "C1", re: /(?:^|[\s"'(`])\.claude\//g, message: "agent configuration path" },
  { id: "C1", re: /\bCLAUDE\.md\b/g, message: "agent instructions file" },
];

function findViolations(text, label) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        findings.push(
          `${label}:${i + 1}:${m.index + 1}  ${rule.id}  ${rule.message}: "${m[0].trim()}"`,
        );
        if (m[0].length === 0) rule.re.lastIndex += 1;
      }
    }
  });
  return findings;
}

function readTextFile(abs) {
  let st;
  try {
    st = statSync(abs);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size > MAX_BYTES) return null;
  const buf = readFileSync(abs);
  for (let i = 0; i < Math.min(buf.length, 8192); i++) if (buf[i] === 0) return null;
  return buf.toString("utf8");
}

function lintFiles() {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
  const findings = [];
  for (const rel of files) {
    if (EXEMPT.has(rel) || BINARY_EXT.has(extname(rel).toLowerCase())) continue;
    const text = readTextFile(resolve(ROOT, rel));
    if (text !== null) findings.push(...findViolations(text, rel));
  }
  return { findings, checked: `${files.length} files` };
}

function lintCommits(base) {
  let raw;
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${base}^{commit}`], {
      cwd: ROOT,
      stdio: "ignore",
    });
    raw = execFileSync("git", ["log", `${base}..HEAD`, "--format=%H%x00%B%x1e"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    console.error(
      `attribution-lint: cannot resolve ${base} — commit messages need the base branch's history ` +
        "(a shallow clone cannot show them)",
    );
    return null;
  }
  const commits = raw
    .split("\x1e")
    .map((c) => c.replace(/^\n/, ""))
    .filter(Boolean);
  const findings = [];
  for (const commit of commits) {
    const [sha, message = ""] = commit.split("\0");
    findings.push(...findViolations(message, `commit ${sha.slice(0, 7)}`));
  }
  return { findings, checked: `${commits.length} commit(s) in ${base}..HEAD` };
}

function main(argv) {
  const [flag, value] = argv;
  let result;
  if (flag === undefined) {
    result = lintFiles();
  } else if (flag === "--commits" && value) {
    result = lintCommits(value);
  } else if (flag === "--stdin") {
    result = { findings: findViolations(readFileSync(0, "utf8"), "text"), checked: "stdin" };
  } else {
    console.error("usage: attribution-lint.mjs [--commits <base-ref> | --stdin]");
    return 2;
  }
  if (result === null) return 2;

  if (result.findings.length > 0) {
    for (const f of result.findings) console.log(f);
    console.log(
      `\nattribution-lint: ${result.findings.length} violation(s) in ${result.checked}. ` +
        "Remove the attribution or the citation — there is no allow marker.",
    );
    return 1;
  }
  console.log(`attribution-lint: OK (${result.checked})`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
