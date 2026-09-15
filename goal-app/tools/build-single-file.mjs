// Makes the one file you paste into the Supabase website, for each function.
//
// Each is GENERATED from the real files. Nobody edits one by hand, so a pasted
// copy cannot drift from the copy under test.
//
//   node goal-app/tools/build-single-file.mjs           writes them
//   node goal-app/tools/build-single-file.mjs --check   fails if any is stale
//
// The --check mode is the point. A generated file that nothing verifies is a
// generated file that goes stale without telling anyone.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// Each function, the shared files it needs (in the order they must appear), and
// a word found ONLY in its current version. That word is how he tells a fresh
// paste from a stale one: searching for a word cannot be off by one, and
// counting lines twice was.
const FUNCTIONS = [
  { name: "morning-brief", shared: ["brief.ts"], marker: "x-scheduled" },
  { name: "telegram-webhook", shared: ["db.ts", "thought.ts"], marker: "x-telegram-bot-api-secret-token" },
];

const SHARED_IMPORT = /import\s*\{[\s\S]*?\}\s*from\s*["']\.\.\/_shared\/[A-Za-z0-9_.-]+["'];\r?\n/g;

function build({ name, shared }) {
  const parts = shared.map((file) => {
    const full = path.join(root, "supabase/functions/_shared", file);
    if (!existsSync(full)) throw new Error(`${name} needs _shared/${file}, which does not exist.`);
    return readFileSync(full, "utf8").trimEnd();
  });

  const entryPath = path.join(root, `supabase/functions/${name}/index.ts`);
  const entry = readFileSync(entryPath, "utf8");

  const imports = entry.match(SHARED_IMPORT) ?? [];
  if (imports.length !== shared.length) {
    throw new Error(
      `${name}/index.ts imports ${imports.length} shared file(s) but this script expects ${shared.length}. ` +
        `Joining blindly would produce a file that does not run. Fix this script first.`,
    );
  }

  const header = [
    "// GENERATED FILE. DO NOT EDIT THIS ONE.",
    "//",
    `// This is the real files for "${name}" joined together so it can be pasted`,
    "// into the Supabase website in one go. The originals are:",
    "//",
    ...shared.map((f) => `//   goal-app/supabase/functions/_shared/${f}`),
    `//   goal-app/supabase/functions/${name}/index.ts`,
    "//",
    "// Change those, then run:  node goal-app/tools/build-single-file.mjs",
    "",
    "",
  ].join("\n");

  return header + parts.join("\n\n") + "\n\n" + entry.replace(SHARED_IMPORT, "").trimStart();
}

// Report the number an EDITOR shows, not the number of pieces the text splits
// into. A file ending in a newline splits into one more piece than it has lines,
// and quoting the wrong one sends him hunting for a line that is not there.
const editorLines = (text) => text.replace(/\n$/, "").split("\n").length;

const checking = process.argv.includes("--check");
let stale = 0;

for (const fn of FUNCTIONS) {
  const out = path.join(root, `dist/${fn.name}.single.ts`);
  const built = build(fn);
  const shown = path.relative(process.cwd(), out);

  if (!built.includes(fn.marker)) {
    console.error(`${fn.name}: the marker "${fn.marker}" is not in the built file. Fix the marker or the code.`);
    process.exit(1);
  }

  if (checking) {
    const current = existsSync(out) ? readFileSync(out, "utf8") : null;
    if (current !== built) {
      console.error(current === null ? `MISSING: ${shown}` : `OUT OF DATE: ${shown}`);
      stale += 1;
    } else {
      console.log(`up to date: ${shown}`);
    }
    continue;
  }

  writeFileSync(out, built);
  console.log(`wrote ${shown}`);
  console.log(`  the editor will show ${editorLines(built)} lines, ending: ${built.trimEnd().split("\n").pop()}`);
  console.log(`  to tell it apart from an older paste, search the code for: ${fn.marker}`);
}

if (stale > 0) {
  console.error("Run: node goal-app/tools/build-single-file.mjs");
  process.exit(1);
}
