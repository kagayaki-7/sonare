#!/usr/bin/env node
/**
 * Sonare — 湖のソナーレ — Progress Dashboard TUI
 * Run: node tui.js        (one-shot)
 * Run: node tui.js --watch (live refresh every 2s)
 */

const { readFileSync } = require("fs");
const { resolve } = require("path");

const PROGRESS_FILE = resolve(__dirname, "progress.json");

// ─── ANSI helpers ───
const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const ITALIC = `${ESC}3m`;
const UNDERLINE = `${ESC}4m`;

const fg = (r, g, b) => `${ESC}38;2;${r};${g};${b}m`;
const bg = (r, g, b) => `${ESC}48;2;${r};${g};${b}m`;

// Lake palette
const TEAL = fg(57, 197, 187);
const AQUA = fg(100, 200, 220);
const MOONLIGHT = fg(210, 220, 240);
const PINK = fg(233, 145, 207);
const GOLD = fg(255, 215, 0);
const RED = fg(255, 107, 107);
const GREEN = fg(91, 255, 176);
const BLUE = fg(100, 160, 255);
const WHITE = fg(255, 255, 255);
const GRAY = fg(120, 120, 140);
const DIMGRAY = fg(70, 70, 90);
const DEEPBLUE = fg(30, 60, 120);

// Status icons & colors
const STATUS = {
  completed: { icon: "✓", color: GREEN, label: "done" },
  "in-progress": { icon: "●", color: GOLD, label: "wip " },
  pending: { icon: "○", color: GRAY, label: "todo" },
  blocked: { icon: "✕", color: RED, label: "blkd" },
};

// ─── Bar rendering ───
function bar(value, max, width, fillColor, emptyColor = DIMGRAY) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return (
    fillColor + "█".repeat(filled) + emptyColor + "░".repeat(empty) + RESET
  );
}

function scoreColor(score, target) {
  const ratio = score / target;
  if (ratio >= 1.0) return GREEN;
  if (ratio >= 0.85) return TEAL;
  if (ratio >= 0.7) return GOLD;
  return RED;
}

function impactColor(impact) {
  if (impact === "P0") return RED;
  if (impact === "P1") return GOLD;
  if (impact === "P2") return TEAL;
  return GRAY;
}

// ─── Layout helpers ───
function pad(str, len, align = "left") {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  const diff = len - visible.length;
  if (diff <= 0) return str;
  if (align === "right") return " ".repeat(diff) + str;
  if (align === "center") {
    const l = Math.floor(diff / 2);
    return " ".repeat(l) + str + " ".repeat(diff - l);
  }
  return str + " ".repeat(diff);
}

function hline(width, color = DIMGRAY) {
  return color + "─".repeat(width) + RESET;
}

function dhline(width, color = GRAY) {
  return color + "═".repeat(width) + RESET;
}

// Water-themed decorative wave
function wave(width) {
  const chars = "〜∿≈～〜∿≈～";
  let s = "";
  for (let i = 0; i < width; i++) s += chars[i % chars.length];
  return `${AQUA}${DIM}${s}${RESET}`;
}

// ─── Main render ───
function render() {
  const data = JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  const W = Math.min(process.stdout.columns || 100, 120);
  const lines = [];

  const push = (s = "") => lines.push(s);

  // Header — Lake themed
  push();
  push(
    `${TEAL}${BOLD}╔${"═".repeat(W - 2)}╗${RESET}`
  );
  push(
    `${TEAL}${BOLD}║${RESET}${pad(
      `${BOLD}${MOONLIGHT}  〜  S O N A R E  —  湖 の ソ ナ ー レ  —  Progress Dashboard  〜  ${RESET}`,
      W - 2,
      "center"
    )}${TEAL}${BOLD}║${RESET}`
  );
  push(
    `${TEAL}${BOLD}║${RESET}${pad(
      `${DIM}${AQUA}  Magical Mirai 2026  •  "Music resonating across the lake"  ${RESET}`,
      W - 2,
      "center"
    )}${TEAL}${BOLD}║${RESET}`
  );
  push(
    `${TEAL}${BOLD}╚${"═".repeat(W - 2)}╝${RESET}`
  );
  push();

  // ── Rubric scores (new 4-dimension rubric) ──
  if (data.rubric && data.rubric.dimensions) {
    push(dhline(W));
    push(
      `  ${BOLD}${MOONLIGHT}R U B R I C   D I M E N S I O N S${RESET}`
    );
    push(hline(W));

    let rubricTotal = 0;
    const dimCount = data.rubric.dimensions.length;

    for (const dim of data.rubric.dimensions) {
      const col = scoreColor(dim.score, dim.target);
      rubricTotal += dim.score;

      push(
        `  ${col}${dim.score >= dim.target ? "★" : "☆"}${RESET} ${pad(dim.name, 28)} ${col}${BOLD}${dim.score}${RESET}${GRAY}/${dim.target}${RESET}  ${bar(dim.score, 10, 20, col)}  ${DIM}${dim.principle.slice(0, W - 62)}${RESET}`
      );

      // Show gaps if score < target
      if (dim.gaps && dim.score < dim.target) {
        for (const gap of dim.gaps.slice(0, 3)) {
          push(`      ${RED}▸${RESET} ${DIM}${gap.slice(0, W - 10)}${RESET}`);
        }
        if (dim.gaps.length > 3) {
          push(`      ${DIM}  ...and ${dim.gaps.length - 3} more${RESET}`);
        }
      }
    }

    const rubricAvg = rubricTotal / dimCount;
    push();
    push(
      `  ${BOLD}${WHITE}Rubric Average${RESET}  ${scoreColor(rubricAvg, 10)}${BOLD}${rubricAvg.toFixed(1)}${RESET}${GRAY} / 10${RESET}   ${bar(rubricAvg, 10, 30, scoreColor(rubricAvg, 10))}`
    );
    push();
  }

  // ── Overall technical score ──
  let totalScore = 0;
  let totalWeight = 0;
  for (const c of data.criteria) {
    const avg =
      c.subcriteria.reduce((s, sc) => s + sc.score, 0) / c.subcriteria.length;
    totalScore += avg * c.weight;
    totalWeight += c.weight;
  }
  const overall = totalScore / totalWeight;
  const target = data.overallTarget;

  push(dhline(W));
  push(
    `  ${BOLD}${WHITE}Technical Score${RESET}  ${scoreColor(overall, target)}${BOLD}${overall.toFixed(1)}${RESET}${GRAY} / ${target}${RESET}   ${bar(overall, 10, 30, scoreColor(overall, target))}`
  );
  push();

  // ── Criteria breakdown ──
  for (const c of data.criteria) {
    const avg =
      c.subcriteria.reduce((s, sc) => s + sc.score, 0) / c.subcriteria.length;

    push(hline(W, DEEPBLUE));
    push(
      `  ${BOLD}${PINK}${c.name}${RESET}  ${DIM}(weight: ${(c.weight * 100).toFixed(0)}%)${RESET}    ${scoreColor(avg, c.target)}${BOLD}${avg.toFixed(1)}${RESET}${GRAY} / ${c.target}${RESET}   ${bar(avg, 10, 20, scoreColor(avg, c.target))}`
    );

    for (const sc of c.subcriteria) {
      const col = scoreColor(sc.score, sc.target);
      const delta = sc.score - sc.target;
      const deltaStr =
        delta >= 0
          ? `${GREEN}+${delta}${RESET}`
          : `${RED}${delta}${RESET}`;

      push(
        `    ${col}${sc.score >= sc.target ? "✓" : "○"}${RESET} ${pad(sc.name, 32)} ${col}${BOLD}${sc.score}${RESET}${GRAY}/${sc.target}${RESET} ${deltaStr}  ${bar(sc.score, 10, 14, col)}  ${DIM}${sc.notes.slice(0, W - 70)}${RESET}`
      );
    }
    push();
  }

  // ── Work plan ──
  push(dhline(W));
  push(
    `  ${BOLD}${TEAL}W O R K   P L A N${RESET}  ${DIM}(theme pivot: Stellar Verses → Sonare)${RESET}`
  );
  push(hline(W));

  const pending = data.workPlan.filter((t) => t.status !== "completed");
  const completed = data.workPlan.filter((t) => t.status === "completed").length;
  const total = data.workPlan.length;
  const pct = total > 0 ? (completed / total) * 100 : 0;

  push(
    `  ${BOLD}Progress${RESET}  ${GREEN}${completed}${GRAY}/${total}${RESET} tasks   ${bar(completed, total, 30, GREEN)}  ${BOLD}${pct.toFixed(0)}%${RESET}`
  );
  push();

  // Show pending tasks grouped by phase
  let lastPhase = null;
  const phaseLabels = {
    "prev": "Foundation (complete)",
    "A": "Theme Pivot — 湖のソナーレ",
    "B": "Tufte Readability",
    "C": "Sakurai Coherence",
    "D": "Submission Polish"
  };

  for (const t of data.workPlan) {
    if (t.phase !== lastPhase) {
      lastPhase = t.phase;
      const label = phaseLabels[t.phase] || `Phase ${t.phase}`;
      push(`  ${BOLD}${BLUE}${label}${RESET}`);
    }

    // Collapse completed tasks from previous phases
    if (t.id === "done-all" && t.status === "completed") {
      push(
        `    ${GREEN}✓${RESET} ${DIM}32 foundation tasks completed${RESET}`
      );
      continue;
    }

    const s = STATUS[t.status] || STATUS.pending;
    const ic = impactColor(t.impact);

    push(
      `    ${s.color}${s.icon}${RESET} ${ic}${BOLD}${pad(t.impact, 3)}${RESET} ${pad(t.id, 4)} ${pad(t.task, 62)} ${s.color}${s.label}${RESET}`
    );
  }

  push();

  // ── Gap heatmap ──
  push(dhline(W));
  push(
    `  ${BOLD}${GOLD}G A P   H E A T M A P${RESET}  ${DIM}(red = furthest from target)${RESET}`
  );
  push(hline(W));

  const allSubs = data.criteria.flatMap((c) =>
    c.subcriteria.map((sc) => ({ ...sc, criterion: c.name }))
  );
  allSubs.sort((a, b) => (a.score - a.target) - (b.score - b.target));

  for (const sc of allSubs) {
    const delta = sc.score - sc.target;
    const col = delta >= 0 ? GREEN : delta >= -1 ? GOLD : RED;
    const indicator = delta >= 0 ? "██" : delta >= -1 ? "▓▓" : "░░";
    push(
      `    ${col}${indicator}${RESET} ${pad(sc.name, 32)} ${col}${delta >= 0 ? "+" : ""}${delta}${RESET}  ${DIM}(${sc.criterion.split("(")[0].trim()})${RESET}`
    );
  }

  push();
  push(wave(W));
  push(
    `  ${DIM}Last updated: ${new Date().toLocaleString()}  •  Run ${TEAL}node tui.js --watch${DIM} for live refresh${RESET}`
  );
  push();

  // Output
  process.stdout.write("\x1b[2J\x1b[H"); // clear screen
  console.log(lines.join("\n"));
}

// ─── Watch mode ───
const watchMode = process.argv.includes("--watch") || process.argv.includes("-w");

render();

if (watchMode) {
  setInterval(render, 2000);
}
