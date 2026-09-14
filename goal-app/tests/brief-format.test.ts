// Checks the message building without a database and without Telegram.
//
// Run it with:   node --experimental-strip-types goal-app/tests/brief-format.test.ts
//
// It imports the same file the Edge Function imports, and reads the result the
// same way the Edge Function reads it. A test that wraps things up itself, in a
// shape the real caller never uses, proves nothing about the real caller.

import assert from "node:assert/strict";
import {
  BRIEF_HOUR,
  BRIEF_MINUTE,
  buildBriefMessage,
  dueNow,
  easternMinutesSinceMidnight,
  buildFailureMessage,
  capForTelegram,
  easternDateLine,
  extractList,
  pickColumn,
  sortRows,
  TELEGRAM_MAX_CHARS,
} from "../supabase/functions/_shared/brief.ts";

let passed = 0;
function check(name: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const RULE_OPTIONS = {
  textCandidates: ["rule_text", "rule", "text", "body", "content", "title", "name", "description"],
  orderCandidates: ["sort_order", "order_index", "display_order", "position", "rule_number", "number", "seq", "sort", "id", "created_at"],
  activeCandidates: ["is_active", "active", "enabled"],
};

const ITEM_OPTIONS = {
  textCandidates: ["item_text", "item", "text", "body", "content", "title", "name", "label", "description"],
  orderCandidates: ["sort_order", "order_index", "display_order", "position", "item_number", "number", "seq", "sort", "id", "created_at"],
  categoryCandidates: ["category", "phase", "section", "group_name", "group", "protocol", "protocol_type", "type", "kind", "stage", "checklist", "list_name"],
  categoryMatch: /trading[_\s-]?open|^open$/i,
  activeCandidates: ["is_active", "active", "enabled"],
};

console.log("\nmorning brief message building\n");

check("the ordinary case builds the message he expects", () => {
  const rules = extractList(
    [
      { id: 2, sort_order: 2, rule_text: "Two setups a day, maximum." },
      { id: 1, sort_order: 1, rule_text: "No trade without the checklist." },
      { id: 3, sort_order: 3, rule_text: "Stop is on the chart before entry." },
    ],
    RULE_OPTIONS,
  );
  const checklist = extractList(
    [
      { id: 1, sort_order: 1, category: "trading_open", item_text: "Check the calendar." },
      { id: 2, sort_order: 2, category: "trading_open", item_text: "Mark the overnight range." },
    ],
    ITEM_OPTIONS,
  );

  assert.equal(rules.problem, null);
  assert.equal(checklist.problem, null);

  const message = buildBriefMessage({ dateLine: "Sunday, September 13, 2026", rules, checklist });
  assert.equal(
    message,
    [
      "MORNING BRIEF",
      "Sunday, September 13, 2026",
      "",
      "TRADING RULES",
      "1. No trade without the checklist.",
      "2. Two setups a day, maximum.",
      "3. Stop is on the chart before entry.",
      "",
      "OPEN CHECKLIST",
      "[ ] Check the calendar.",
      "[ ] Mark the overnight range.",
    ].join("\n"),
  );
});

check("it reads differently named columns", () => {
  const rules = extractList([{ position: 1, rule: "Only SPY and IWM." }], RULE_OPTIONS);
  assert.deepEqual(rules.items, ["Only SPY and IWM."]);
  assert.ok(rules.notes.some((note) => note.includes('wording from "rule"')));
  assert.ok(rules.notes.some((note) => note.includes('Ordering by "position"')));
});

check("a filled column wins over one that exists but is empty", () => {
  const rows = [{ rule_text: null, rule: "The filled one." }];
  assert.equal(pickColumn(rows, ["rule_text", "rule"]), "rule");
});

check("only the trading_open items are taken", () => {
  const checklist = extractList(
    [
      { sort_order: 1, category: "trading_open", item_text: "Open item." },
      { sort_order: 2, category: "trading_close", item_text: "Close item." },
      { sort_order: 3, category: "weekly_review", item_text: "Weekly item." },
    ],
    ITEM_OPTIONS,
  );
  assert.deepEqual(checklist.items, ["Open item."]);
  assert.ok(checklist.notes.some((note) => note.includes("kept 1 of 3")));
});

check("no grouping column means every item, and it says so", () => {
  const checklist = extractList(
    [
      { sort_order: 1, item_text: "First." },
      { sort_order: 2, item_text: "Second." },
    ],
    ITEM_OPTIONS,
  );
  assert.deepEqual(checklist.items, ["First.", "Second."]);
  assert.ok(checklist.notes.some((note) => note.includes("No grouping column found")));
});

check("a grouping column that matches nothing falls back rather than sending a blank list", () => {
  const checklist = extractList(
    [
      { sort_order: 1, category: "pre_market", item_text: "First." },
      { sort_order: 2, category: "pre_market", item_text: "Second." },
    ],
    ITEM_OPTIONS,
  );
  assert.deepEqual(checklist.items, ["First.", "Second."]);
  assert.ok(checklist.notes.some((note) => note.includes("none of which matched")));
});

check("rows switched off are left out", () => {
  const rules = extractList(
    [
      { sort_order: 1, rule_text: "Live rule.", is_active: true },
      { sort_order: 2, rule_text: "Retired rule.", is_active: false },
    ],
    RULE_OPTIONS,
  );
  assert.deepEqual(rules.items, ["Live rule."]);
  assert.ok(rules.notes.some((note) => note.includes("1 row(s) as switched off")));
});

check("an empty table is reported as empty, not as a blank section", () => {
  const rules = extractList([], RULE_OPTIONS);
  assert.equal(rules.problem, "the table is empty");
  const message = buildBriefMessage({
    dateLine: "Sunday, September 13, 2026",
    rules,
    checklist: extractList([{ item_text: "Something." }], ITEM_OPTIONS),
  });
  assert.ok(message.includes("Could not read your rules: the table is empty."));
});

check("a missing wording column names the columns that were actually there", () => {
  const rules = extractList([{ id: 1, created_at: "2026-01-01", note_ref: 4 }], RULE_OPTIONS);
  assert.ok(rules.problem);
  assert.ok(rules.problem!.includes("created_at"));
  assert.ok(rules.problem!.includes("note_ref"));
  const message = buildBriefMessage({
    dateLine: "Sunday, September 13, 2026",
    rules,
    checklist: extractList([{ item_text: "Something." }], ITEM_OPTIONS),
  });
  assert.ok(message.includes("Could not read your rules:"));
  assert.ok(message.includes("[ ] Something."));
});

check("equal ordering values keep the order they arrived in", () => {
  const rows = [
    { sort_order: 1, rule_text: "First in." },
    { sort_order: 1, rule_text: "Second in." },
    { sort_order: 1, rule_text: "Third in." },
  ];
  assert.deepEqual(
    sortRows(rows, "sort_order").map((row) => row.rule_text),
    ["First in.", "Second in.", "Third in."],
  );
});

check("ordering is numeric, so 10 comes after 9", () => {
  const rules = extractList(
    [
      { sort_order: 10, rule_text: "Tenth." },
      { sort_order: 9, rule_text: "Ninth." },
    ],
    RULE_OPTIONS,
  );
  assert.deepEqual(rules.items, ["Ninth.", "Tenth."]);
});

check("his wording is printed exactly as stored", () => {
  const awkward = "Risk 1% max. Never *average down* or add to a _loser_ [ever].";
  const rules = extractList([{ sort_order: 1, rule_text: awkward }], RULE_OPTIONS);
  const message = buildBriefMessage({
    dateLine: "Sunday, September 13, 2026",
    rules,
    checklist: extractList([{ item_text: "Something." }], ITEM_OPTIONS),
  });
  assert.ok(message.includes(`1. ${awkward}`));
});

check("the date is his timezone, not the server's", () => {
  // 02:00 UTC on the 14th is still the evening of the 13th in New York.
  assert.equal(easternDateLine(new Date("2026-09-14T02:00:00Z")), "Sunday, September 13, 2026");
  // And a winter date, to prove daylight saving is not hardcoded.
  assert.equal(easternDateLine(new Date("2026-01-15T04:30:00Z")), "Wednesday, January 14, 2026");
});

check("a message too long for Telegram is cut and says it was cut", () => {
  const short = "still short";
  assert.equal(capForTelegram(short), short);
  const long = capForTelegram("x".repeat(TELEGRAM_MAX_CHARS + 500));
  assert.ok(long.length <= TELEGRAM_MAX_CHARS);
  assert.ok(long.includes("Cut short"));
});

check("the failure message carries the reason, not just the fact", () => {
  const text = buildFailureMessage("Sunday, September 13, 2026", 'the database refused "trading_rules"');
  assert.ok(text.includes('the database refused "trading_rules"'));
  assert.ok(text.includes("could not be built"));
});

check("nothing written for him contains an em dash", () => {
  const rules = extractList([{ sort_order: 1, rule_text: "A rule." }], RULE_OPTIONS);
  const texts = [
    buildBriefMessage({ dateLine: "Sunday, September 13, 2026", rules, checklist: extractList([], ITEM_OPTIONS) }),
    buildFailureMessage("Sunday, September 13, 2026", "a reason"),
  ];
  for (const text of texts) assert.ok(!text.includes("—"), `em dash found in: ${text}`);
});

// ------------------------------- the two scheduled moments, all year round
//
// The schedule fires at 12:10 and 13:10 UTC every day. Exactly one of those is
// 8:10 in New York, and which one swaps when the clocks change. These check
// that, on real dates, including both changeover days.

const MORNING = `${String(BRIEF_HOUR).padStart(2, "0")}:${String(BRIEF_MINUTE).padStart(2, "0")}`;

function decideBoth(day: string): { early: boolean; late: boolean } {
  return {
    early: dueNow(new Date(`${day}T12:10:00Z`)).due,
    late: dueNow(new Date(`${day}T13:10:00Z`)).due,
  };
}

check(`he asked for ${MORNING}, so that is what is targeted`, () => {
  assert.equal(BRIEF_HOUR, 8);
  assert.equal(BRIEF_MINUTE, 10);
});

check("in summer the earlier run sends and the later one stands down", () => {
  assert.deepEqual(decideBoth("2026-07-15"), { early: true, late: false });
});

check("in winter it is the other way round, with no change by him", () => {
  assert.deepEqual(decideBoth("2027-01-15"), { early: false, late: true });
});

check("on the day the clocks go back, still exactly one", () => {
  assert.deepEqual(decideBoth("2026-11-01"), { early: false, late: true });
});

check("on the day the clocks go forward, still exactly one", () => {
  assert.deepEqual(decideBoth("2027-03-14"), { early: true, late: false });
});

check("across a whole year, never twice in a day and never none", () => {
  const day = new Date(Date.UTC(2026, 8, 14));
  let sends = 0;
  for (let i = 0; i < 365; i += 1) {
    const iso = day.toISOString().slice(0, 10);
    const { early, late } = decideBoth(iso);
    const today = (early ? 1 : 0) + (late ? 1 : 0);
    assert.equal(today, 1, `${iso} would have sent ${today} times, not once`);
    sends += today;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  assert.equal(sends, 365);
});

check("a late run still counts, a run an hour out does not", () => {
  // 20 minutes late in summer: still his morning, still sends.
  assert.equal(dueNow(new Date("2026-07-15T12:30:00Z")).due, true);
  // A full hour early is 7:10 his time. Not his morning.
  assert.equal(dueNow(new Date("2026-07-15T11:10:00Z")).due, false);
});

check("standing down says the time, so a quiet morning can be told from a broken one", () => {
  const skipped = dueNow(new Date("2026-07-15T13:10:00Z"));
  assert.equal(skipped.due, false);
  assert.ok(skipped.note.includes("09:10"));
  assert.ok(skipped.note.includes("08:10"));
  assert.ok(skipped.note.includes("Nothing sent"));
});

check("midnight reads as 00:00, never as 24:00", () => {
  // 04:00 UTC in summer is midnight in New York. Some systems call that hour 24.
  assert.equal(easternMinutesSinceMidnight(new Date("2026-07-15T04:00:00Z")), 0);
  assert.equal(easternMinutesSinceMidnight(new Date("2026-07-15T04:30:00Z")), 30);
});

console.log(`\n${passed} checks passed\n`);
