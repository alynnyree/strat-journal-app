// Runs the real app-api function, start to finish, with the database stood in
// for.
//
//   node --experimental-strip-types goal-app/tests/app-api.test.ts
//   node --experimental-strip-types goal-app/tests/app-api.test.ts <path>
//
// It imports the actual index.ts that gets deployed and re-implements none of
// it. What it checks is what the CALLER receives: the answer the web page is
// handed, and what reached the database.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------- stand-ins

const env = new Map<string, string>();
let handler: ((request: Request) => Promise<Response>) | null = null;

(globalThis as any).Deno = {
  env: { get: (name: string) => env.get(name) },
  serve: (fn: (request: Request) => Promise<Response>) => { handler = fn; },
};

let saved: Record<string, unknown>[] = [];
let reachedOut: string[] = [];
let dbRefuses = false;
let thoughtRows: unknown[] = [];
let tableRows: Record<string, unknown[]> = {};
let refuseTable: string | null = null;
let totalHeader: string | null = "0-0/7";

(globalThis as any).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  reachedOut.push(url);

  const table = /\/rest\/v1\/([a-z_]+)/.exec(url)?.[1] ?? "";
  if (refuseTable === table) {
    return new Response('{"message":"permission denied for table ' + table + '"}', { status: 401 });
  }

  if (table === "thoughts") {
    if (String(init?.method ?? "GET").toUpperCase() === "POST") {
      if (dbRefuses) return new Response('{"message":"permission denied for table thoughts"}', { status: 401 });
      saved.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response("", { status: 201 });
    }
    if (dbRefuses) return new Response('{"message":"permission denied for table thoughts"}', { status: 401 });
    const headers: Record<string, string> = {};
    if (totalHeader !== null) headers["content-range"] = totalHeader;
    return new Response(JSON.stringify(thoughtRows), { status: 200, headers });
  }

  return new Response(JSON.stringify(tableRows[table] ?? []), { status: 200 });
};

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(here, "../supabase/functions/app-api/index.ts");
console.log(`testing: ${path.relative(process.cwd(), target)}`);
await import(pathToFileURL(target).href);
assert.ok(handler, "the function did not hand its handler to Deno.serve");

// ------------------------------------------------------------------ helpers

const APP_KEY = "brief-0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab";
const HIS_PAGE = "https://alynnyree.github.io";

function reset(): void {
  env.clear();
  env.set("BRIEF_TRIGGER_SECRET", APP_KEY);
  env.set("SUPABASE_URL", "https://example.supabase.co");
  env.set("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key");
  saved = []; reachedOut = []; dbRefuses = false;
  thoughtRows = []; tableRows = {}; refuseTable = null; totalHeader = "0-0/7";
}

async function call(
  body: unknown,
  options: { key?: string | null; origin?: string | null; method?: string } = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const key = options.key === undefined ? APP_KEY : options.key;
  if (key !== null) headers.set("x-app-key", key);
  const origin = options.origin === undefined ? HIS_PAGE : options.origin;
  if (origin !== null) headers.set("origin", origin);

  const response = await handler!(
    new Request("https://example.functions.supabase.co/app-api", {
      method: options.method ?? "POST",
      headers,
      // A GET or an OPTIONS is not allowed to carry a body at all, so this
      // sends one only for the methods that can have one.
      ...(/^(GET|HEAD|OPTIONS)$/.test(options.method ?? "POST")
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text === "" ? null : JSON.parse(text),
    headers: response.headers,
  };
}

let passed = 0;
async function check(name: string, run: () => Promise<void>): Promise<void> {
  reset();
  await run();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("\napp-api, run end to end\n");

// ------------------------------------------------------------ the door

await check("no password means nothing is read or saved", async () => {
  const { status, body } = await call({ action: "ping" }, { key: null });
  assert.equal(status, 401);
  assert.equal(reachedOut.length, 0, "the database must not be touched by an unproven caller");
  assert.match(body.message, /No password was sent/);
});

await check("a wrong password is refused and says so in words he can read", async () => {
  const { status, body } = await call({ action: "ping" }, { key: "brief-wrong" });
  assert.equal(status, 401);
  assert.equal(reachedOut.length, 0);
  assert.match(body.message, /not right/);
  assert.ok(!/BRIEF_TRIGGER_SECRET/.test(body.message), "his message must not name a secret");
});

await check("a password of the right length but wrong content is still refused", async () => {
  const sameLength = "x".repeat(APP_KEY.length);
  const { status } = await call({ action: "ping" }, { key: sameLength });
  assert.equal(status, 401);
  assert.equal(reachedOut.length, 0);
});

await check("NO PASSWORD SET ON THE SERVER LOCKS EVERYONE OUT, it does not let everyone in", async () => {
  env.delete("BRIEF_TRIGGER_SECRET");
  const { status, body } = await call({ action: "ping" });
  assert.equal(status, 401);
  assert.equal(reachedOut.length, 0);
  assert.ok(body.steps[0].detail.includes("BRIEF_TRIGGER_SECRET is not set"));
});

await check("the password is never echoed back in any answer", async () => {
  const good = await call({ action: "capture", text: "a thought" });
  assert.ok(!JSON.stringify(good.body).includes(APP_KEY));
  const bad = await call({ action: "ping" }, { key: "brief-wrong" });
  assert.ok(!JSON.stringify(bad.body).includes(APP_KEY));
});

// ------------------------------------------------------ letting the page in

await check("the browser's permission question is answered for his page", async () => {
  const { status, headers } = await call(null, { method: "OPTIONS" });
  assert.equal(status, 204);
  assert.equal(headers.get("access-control-allow-origin"), HIS_PAGE);
  assert.ok((headers.get("access-control-allow-headers") ?? "").includes("x-app-key"));
});

await check("a page at some other address is NOT told it may read the answer", async () => {
  const { headers } = await call(null, { method: "OPTIONS", origin: "https://not-his-site.example" });
  assert.equal(headers.get("access-control-allow-origin"), null);
});

await check("EVERY answer carries the permission header, refusals included", async () => {
  // Without it the page is handed a blank failure with no reason in it, which
  // is the silence this project keeps having to fix.
  const refused = await call({ action: "ping" }, { key: "brief-wrong" });
  assert.equal(refused.headers.get("access-control-allow-origin"), HIS_PAGE);

  reset();
  dbRefuses = true;
  const broken = await call({ action: "capture", text: "a thought" });
  assert.equal(broken.headers.get("access-control-allow-origin"), HIS_PAGE);

  reset();
  const wrongMethod = await call(null, { method: "GET" });
  assert.equal(wrongMethod.headers.get("access-control-allow-origin"), HIS_PAGE);
});

// --------------------------------------------------------------------- ping

await check("ping reports the database answered, and how many thoughts there are", async () => {
  totalHeader = "0-0/41";
  const { status, body } = await call({ action: "ping" });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.match(body.message, /41 thoughts saved so far/);
  assert.equal(body.data.total, 41);
});

await check("one thought is said in the singular", async () => {
  totalHeader = "0-0/1";
  const { body } = await call({ action: "ping" });
  assert.match(body.message, /1 thought saved/);
  assert.ok(!/1 thoughts/.test(body.message));
});

await check("AN UNKNOWN TOTAL IS NOT REPORTED AS ZERO", async () => {
  // Zero is a real answer meaning the table is empty. "I could not tell" is a
  // different answer and the two must never share one value.
  totalHeader = null;
  const { body } = await call({ action: "ping" });
  assert.equal(body.data.total, null);
  assert.ok(!/0 thoughts/.test(body.message));
  assert.match(body.message, /Connected/);
});

await check("a database that refuses says the password was fine, so he looks in the right place", async () => {
  dbRefuses = true;
  const { status, body } = await call({ action: "ping" });
  assert.equal(status, 200, "the page needs a readable answer, not a bare failure");
  assert.equal(body.ok, false);
  assert.match(body.message, /password was accepted/);
  assert.match(body.steps.find((s: any) => s.step === "the database").detail, /permission denied/);
});

// ------------------------------------------------------------------ capture

await check("a thought is saved word for word, marks and all", async () => {
  const { body } = await call({ action: "capture", text: "#biz restaurants have a POS problem" });
  assert.equal(body.ok, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].body, "#biz restaurants have a POS problem", "his text must be stored untouched");
  assert.deepEqual(saved[0].tags, ["biz"]);
  assert.equal(saved[0].is_private, false);
  assert.equal(body.message, "Saved. Tags: biz.");
});

await check("the app says where a thought came from, so the two ways in stay tellable apart", async () => {
  await call({ action: "capture", text: "spoken into the app" });
  assert.equal(saved[0].source, "webapp");
});

await check("a private thought is marked private and still stored in full", async () => {
  const { body } = await call({ action: "capture", text: "!thinking of dropping the Tuesday client" });
  assert.equal(saved[0].is_private, true);
  assert.equal(saved[0].body, "!thinking of dropping the Tuesday client");
  assert.match(body.message, /Marked private/);
});

await check("hashtags after the first ordinary word are left as text, as the bot does", async () => {
  await call({ action: "capture", text: "#biz #pos an idea about #restaurants" });
  assert.deepEqual(saved[0].tags, ["biz", "pos"], "only the ones at the front count");
});

await check("an empty box saves nothing and says so", async () => {
  const { body } = await call({ action: "capture", text: "   \n  " });
  assert.equal(body.ok, false);
  assert.equal(saved.length, 0);
  assert.match(body.message, /nothing in the box/);
});

await check("a missing text field is treated as empty rather than crashing", async () => {
  const { status, body } = await call({ action: "capture" });
  assert.equal(status, 200);
  assert.equal(body.ok, false);
  assert.equal(saved.length, 0);
});

await check("A SLASH IS JUST A SLASH HERE, so nothing he speaks is thrown away", async () => {
  // The bot treats "/find" as an instruction and saves nothing. This app has no
  // instructions, so refusing to save would be silent data loss.
  const { body } = await call({ action: "capture", text: "/find a better POS for Tuesday" });
  assert.equal(body.ok, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].body, "/find a better POS for Tuesday");
});

await check("WHEN THE DATABASE REFUSES HE IS TOLD IT WAS NOT SAVED", async () => {
  dbRefuses = true;
  const { status, body } = await call({ action: "capture", text: "a thought that will not store" });
  assert.equal(status, 200);
  assert.equal(body.ok, false);
  assert.equal(saved.length, 0);
  assert.match(body.message, /^NOT saved\./, "silence here would let him think it landed");
  assert.match(body.message, /nothing is lost/);
  assert.equal(body.steps.find((s: any) => s.step === "saving").ok, false);
});

// ----------------------------------------------------------------- thoughts

await check("thoughts come back newest first, with the date they are ordered by", async () => {
  thoughtRows = [{ id: 9, body: "newest", tags: [], is_private: false, source: "webapp", created_at: "2026-09-17T18:00:00Z" }];
  totalHeader = "0-0/9";
  const { body } = await call({ action: "thoughts" });
  assert.equal(body.ok, true);
  assert.equal(body.data.rows.length, 1);
  assert.ok("created_at" in body.data.rows[0], "a list must show the field it is sorted by");
  const asked = reachedOut.find((u) => u.includes("/thoughts?"))!;
  assert.ok(asked.includes("order=created_at.desc"), "a list with no order is not in order");
});

await check("a search asks the database for his words, not for a wildcard", async () => {
  await call({ action: "thoughts", search: "pos*" });
  const asked = reachedOut.find((u) => u.includes("body=ilike"))!;
  assert.ok(asked.includes("%2A"), "a star he typed must be searched for, not obeyed");
  assert.ok(!/ilike\.\*pos\*\*/.test(asked));
});

await check("a search with a comma in it is not read as two separate filters", async () => {
  await call({ action: "thoughts", search: "pos,tuesday" });
  const asked = reachedOut.find((u) => u.includes("body=ilike"))!;
  assert.ok(asked.includes("%2C"));
});

await check("an absurd limit is brought back to something sane", async () => {
  await call({ action: "thoughts", limit: 100000 });
  assert.ok(reachedOut.find((u) => u.includes("limit=200")), "a page must not be able to ask for everything");

  reset();
  await call({ action: "thoughts", limit: "not a number" });
  assert.ok(reachedOut.find((u) => u.includes("limit=50")));
});

await check("no thoughts yet is not reported as a failure", async () => {
  thoughtRows = [];
  totalHeader = "*/0";
  const { body } = await call({ action: "thoughts" });
  assert.equal(body.ok, true, "an empty list is an answer, not a fault");
  assert.equal(body.data.rows.length, 0);
});

// --------------------------------------------------------------------- plan

await check("plan reads all four lists and each carries its own outcome", async () => {
  tableRows = {
    goals: [{ id: 1, title: "the ultimate one", is_ultimate: true }],
    projects: [{ id: 1, name: "a project" }],
    roadmap_steps: [{ id: 1, project_id: 1, sort_order: 1, title: "step one", status: "current" }],
    tasks: [{ id: 1, title: "a task", status: "open" }],
  };
  const { body } = await call({ action: "plan" });
  assert.equal(body.ok, true);
  assert.equal(body.data.goals.rows.length, 1);
  assert.equal(body.data.roadmap.rows.length, 1);
  assert.equal(body.data.tasks.rows.length, 1);
  for (const name of ["goals", "projects", "roadmap", "tasks"]) {
    assert.equal(body.data[name].error, null);
  }
});

await check("ONE LIST REFUSING DOES NOT MAKE THE OTHER THREE LOOK EMPTY", async () => {
  tableRows = { goals: [{ id: 1, title: "still here" }], projects: [], roadmap_steps: [], tasks: [] };
  refuseTable = "tasks";
  const { body } = await call({ action: "plan" });
  assert.equal(body.ok, false);
  assert.equal(body.data.goals.rows.length, 1, "what did come back must still be shown");
  assert.equal(body.data.goals.error, null);
  assert.match(body.data.tasks.error, /refused/, "and what did not must say so rather than read as empty");
  assert.match(body.message, /1 of the 4/);
});

await check("plan only asks for tasks still open", async () => {
  const { body } = await call({ action: "plan" });
  assert.equal(body.ok, true);
  assert.ok(reachedOut.find((u) => u.includes("/tasks?") && u.includes("status=eq.open")));
});

// -------------------------------------------------------------- the unknown

await check("an action this server does not know says the app is ahead of it", async () => {
  const { status, body } = await call({ action: "evening-review" });
  assert.equal(status, 200);
  assert.equal(body.ok, false);
  assert.match(body.message, /newer than the server/);
  assert.equal(body.action, "evening-review");
});

await check("an unreadable body is answered, not crashed on", async () => {
  const { status, body } = await call("this is not data at all");
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.equal(saved.length, 0);
});

await check("the server missing its own settings blames itself, not his phone", async () => {
  env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const { body } = await call({ action: "ping" });
  assert.equal(body.ok, false);
  assert.match(body.message, /Nothing on this phone is wrong/);
  assert.match(body.steps.find((s: any) => s.step === "settings").detail, /Neither SUPABASE_SERVICE_ROLE_KEY/);
});

await check("EVERY refusal names the part that refused, never just 'it did not work'", async () => {
  const cases: Array<[string, () => Promise<any>]> = [
    ["wrong password", async () => (reset(), await call({ action: "ping" }, { key: "brief-wrong" }))],
    ["database refuses", async () => (reset(), dbRefuses = true, await call({ action: "ping" }))],
    ["no server settings", async () => (reset(), env.delete("SUPABASE_URL"), await call({ action: "ping" }))],
    ["unknown action", async () => (reset(), await call({ action: "nonsense" }))],
  ];
  for (const [name, run] of cases) {
    const { body } = await run();
    assert.equal(body.ok, false, name);
    assert.ok(body.steps.length > 0, `${name}: no steps at all`);
    const failed = body.steps.find((s: any) => !s.ok);
    assert.ok(failed, `${name}: nothing in the steps says which part refused`);
    assert.ok(failed.detail.length > 10, `${name}: the reason is too thin to act on`);
  }
});

await check("NO AI SERVICE IS EVER CONTACTED", async () => {
  await call({ action: "capture", text: "!a private thought that must never leave" });
  await call({ action: "ping" });
  await call({ action: "thoughts" });
  await call({ action: "plan" });
  for (const url of reachedOut) {
    assert.ok(
      url.includes("example.supabase.co"),
      `this function reached out to ${url}, which is not his own database`,
    );
  }
  assert.ok(reachedOut.length > 0, "the test proved nothing if nothing was called at all");
});

console.log(`\n${passed} checks passed\n`);
