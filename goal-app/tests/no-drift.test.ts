// The database helpers exist twice: once inside morning-brief, which is
// deployed and working, and once in _shared/db.ts where the newer functions
// take them from.
//
// That duplication is deliberate. Re-pasting a working function costs him a
// deploy and gains him nothing. But a copy nobody watches drifts, and this
// project's own record is full of exactly that. So this reads both files and
// fails if the shared functions ever stop matching, character for character.
//
// When morning-brief next needs changing for its own reasons, it switches to
// importing them and this test, and the duplication, both go away.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(path.join(here, "..", p), "utf8");

const original = read("supabase/functions/morning-brief/index.ts");
const shared = read("supabase/functions/_shared/db.ts");

/** Pull one function out of a file by name, from its signature to its closing brace. */
function functionBody(source: string, name: string): string {
  const signature = new RegExp(`^(?:export )?(?:async )?function ${name}\\b`, "m");
  const start = source.search(signature);
  assert.notEqual(start, -1, `could not find ${name} to compare`);
  let depth = 0;
  let seenBrace = false;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") { depth += 1; seenBrace = true; }
    else if (source[i] === "}") {
      depth -= 1;
      if (seenBrace && depth === 0) {
        // "export " and "async " differ between the two on purpose. Everything
        // after the word "function" must be identical.
        return source.slice(start, i + 1).replace(/^(export )?(async )?/, "");
      }
    }
  }
  throw new Error(`${name} never closed`);
}

const SHARED_BY_BOTH = [
  "readTable",
  "looksLikeDatabaseKey",
  "describeShape",
  "firstDatabaseKeyIn",
  "findDatabaseKey",
];

let passed = 0;
console.log("\nthe two copies of the database code\n");

for (const name of SHARED_BY_BOTH) {
  const a = functionBody(original, name);
  const b = functionBody(shared, name);
  assert.equal(
    b,
    a,
    `${name} has drifted between morning-brief and _shared/db.ts.\n` +
      `Make them match again, or move morning-brief onto the shared one and delete this check.`,
  );
  passed += 1;
  console.log(`  ok  ${name} is identical in both`);
}

console.log(`\n${passed} checks passed\n`);
