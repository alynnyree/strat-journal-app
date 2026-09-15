// Checks how a message he sends the bot is read. No database, no Telegram.
//
//   node --experimental-strip-types goal-app/tests/thought-parsing.test.ts

import assert from "node:assert/strict";
import { confirmationFor, parseThought } from "../supabase/functions/_shared/thought.ts";

let passed = 0;
function check(name: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("\nreading a message he sends the bot\n");

check("a plain thought is saved as a thought, untagged and not private", () => {
  const t = parseThought("restaurants might have a double entry problem with their POS");
  assert.equal(t.kind, "thought");
  assert.deepEqual(t.tags, []);
  assert.equal(t.isPrivate, false);
  assert.equal(t.body, "restaurants might have a double entry problem with their POS");
});

check("a hashtag at the front becomes a tag", () => {
  const t = parseThought("#biz restaurants might have a POS problem");
  assert.deepEqual(t.tags, ["biz"]);
  assert.equal(t.kind, "thought");
});

check("several hashtags at the front all become tags, in his order", () => {
  assert.deepEqual(parseThought("#biz #ideas #later something").tags, ["biz", "ideas", "later"]);
});

check("a hashtag in the MIDDLE is not a tag, which is what his brief says", () => {
  const t = parseThought("talked to john about #pricing today");
  assert.deepEqual(t.tags, [], "his brief says leading hashtags. This is the line to move if he wants otherwise");
  assert.equal(t.body, "talked to john about #pricing today", "and the word stays in his text either way");
});

check("a leading ! marks it private", () => {
  const t = parseThought("!thinking about dropping the Tuesday client");
  assert.equal(t.isPrivate, true);
  assert.equal(t.kind, "thought");
});

check("! and hashtags together both work", () => {
  const t = parseThought("!#money thinking about rates");
  assert.equal(t.isPrivate, true);
  assert.deepEqual(t.tags, ["money"]);
});

check("a ! in the middle means nothing", () => {
  assert.equal(parseThought("this is urgent! call him").isPrivate, false);
});

check("his words are saved EXACTLY as typed, marks and all", () => {
  for (const raw of [
    "!#biz something private and tagged",
    "#a #b plain",
    "  spaced out  ",
    "Don't look at P&L",
  ]) {
    assert.equal(parseThought(raw).body, raw, `body was altered for: ${raw}`);
  }
});

check("tags are lowercased and never repeated", () => {
  assert.deepEqual(parseThought("#Biz #BIZ #biz thing").tags, ["biz"]);
});

check("underscores and hyphens are allowed in a tag", () => {
  assert.deepEqual(parseThought("#double-entry #pos_system note").tags, ["double-entry", "pos_system"]);
});

check("a hash with a space after it is not a tag", () => {
  assert.deepEqual(parseThought("# biz something").tags, []);
});

check("a message that is only hashtags still saves", () => {
  const t = parseThought("#biz");
  assert.equal(t.kind, "thought");
  assert.deepEqual(t.tags, ["biz"]);
  assert.equal(t.body, "#biz");
});

check("a slash makes it a command, and commands are never saved as thoughts", () => {
  const t = parseThought("/start");
  assert.equal(t.kind, "command");
  assert.equal(t.command, "start");
});

check("a command aimed at the bot by name is still that command", () => {
  assert.equal(parseThought("/find@my_goal_bot restaurants").command, "find");
});

check("command names are lowercased", () => {
  assert.equal(parseThought("/START").command, "start");
});

check("nothing, or only spaces, is empty rather than a thought", () => {
  assert.equal(parseThought("").kind, "empty");
  assert.equal(parseThought("   \n  ").kind, "empty");
});

check("the reply says back what was understood", () => {
  assert.equal(confirmationFor(parseThought("plain")), "Saved.");
  assert.equal(confirmationFor(parseThought("!plain")), "Saved, private.");
  assert.equal(confirmationFor(parseThought("#biz plain")), "Saved. Tags: biz");
  assert.equal(confirmationFor(parseThought("!#biz #x plain")), "Saved, private. Tags: biz, x");
});

check("nothing written for him contains an em dash", () => {
  for (const raw of ["plain", "!plain", "#biz plain"]) {
    assert.ok(!confirmationFor(parseThought(raw)).includes("—"));
  }
});

console.log(`\n${passed} checks passed\n`);
