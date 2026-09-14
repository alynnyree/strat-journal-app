// Makes the one file you paste into the Supabase website.
//
// It is GENERATED from the two real files. Nobody edits it by hand, so the two
// cannot drift apart and quietly disagree with each other.
//
//   node goal-app/tools/build-single-file.mjs           writes the file
//   node goal-app/tools/build-single-file.mjs --check   fails if it is out of date
//
// The --check mode is the point. A generated file that nothing verifies is a
// generated file that goes stale without telling anyone.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const SHARED = path.join(root, "supabase/functions/_shared/brief.ts");
const ENTRY = path.join(root, "supabase/functions/morning-brief/index.ts");
const OUT = path.join(root, "dist/morning-brief.single.ts");

const IMPORT_OF_SHARED = /import\s*\{[\s\S]*?\}\s*from\s*["']\.\.\/_shared\/brief\.ts["'];\r?\n/;

function build() {
  const shared = readFileSync(SHARED, "utf8");
  const entry = readFileSync(ENTRY, "utf8");

  if (!IMPORT_OF_SHARED.test(entry)) {
    throw new Error(
      "index.ts no longer imports ../_shared/brief.ts the way this script expects. " +
        "Combining blindly would produce a file that does not run. Fix this script first.",
    );
  }

  const header = [
    "// GENERATED FILE. DO NOT EDIT THIS ONE.",
    "//",
    "// This is the two real files joined together so it can be pasted into the",
    "// Supabase website in one go. The originals are:",
    "//",
    "//   goal-app/supabase/functions/_shared/brief.ts",
    "//   goal-app/supabase/functions/morning-brief/index.ts",
    "//",
    "// Change those, then run:  node goal-app/tools/build-single-file.mjs",
    "",
    "",
  ].join("\n");

  return header + shared.trimEnd() + "\n\n" + entry.replace(IMPORT_OF_SHARED, "").trimStart();
}

const built = build();

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
  if (current !== built) {
    console.error(
      current === null
        ? `MISSING: ${path.relative(process.cwd(), OUT)} has not been generated.`
        : `OUT OF DATE: ${path.relative(process.cwd(), OUT)} does not match the two source files.`,
    );
    console.error("Run: node goal-app/tools/build-single-file.mjs");
    process.exit(1);
  }
  console.log(`up to date: ${path.relative(process.cwd(), OUT)}`);
} else {
  writeFileSync(OUT, built);
  const lines = built.split("\n").length;
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${lines} lines, ${built.length} characters)`);
}
