// Runs the real morning-brief function, start to finish, with the database and
// Telegram stood in for.
//
// Run it with:  node --experimental-strip-types goal-app/tests/morning-brief.test.ts
//
// This imports the actual index.ts the Edge Function deploys. It does not
// re-implement any of it. What it checks is what the caller receives: the
// message that reaches Telegram and the answer the function hands back.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------- stand-ins

const env = new Map<string, string>();
let handler: ((request: Request) => Promise<Response>) | null = null;

(globalThis as any).Deno = {
  env: { get: (name: string) => env.get(name) },
  serve: (fn: (request: Request) => Promise<Response>) => {
    handler = fn;
  },
};

interface Sent {
  chat_id: string;
  text: string;
}

interface Answers {
  app_settings?: unknown[] | { status: number; body: string };
  trading_rules?: unknown[] | { status: number; body: string };
  protocol_items?: unknown[] | { status: number; body: string };
  telegram?: { status: number; body: string };
  telegramThrows?: boolean;
}

let answers: Answers = {};
let sent: Sent[] = [];
let tokensSeen: string[] = [];

let reachedOut: string[] = [];
let dbKeysUsed: string[] = [];

(globalThis as any).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  reachedOut.push(url);

  if (url.startsWith("https://api.telegram.org/")) {
    tokensSeen.push(url.split("/bot")[1].split("/")[0]);
    if (answers.telegramThrows) throw new Error("network is down");
    sent.push(JSON.parse(String(init?.body)) as Sent);
    const reply = answers.telegram ?? { status: 200, body: '{"ok":true,"result":{"message_id":1}}' };
    return new Response(reply.body, { status: reply.status });
  }

  const offered = new Headers(init?.headers ?? {}).get("apikey");
  if (offered !== null) dbKeysUsed.push(offered);
  const table = url.split("/rest/v1/")[1]?.split("?")[0] as keyof Answers;
  const answer = answers[table];
  if (answer === undefined) return new Response("[]", { status: 200 });
  if (Array.isArray(answer)) {
    return new Response(JSON.stringify(answer), { status: 200 });
  }
  return new Response(answer.body, { status: answer.status });
};

// Which file to test. Defaults to the real two-file version. Pass a path to
// test the combined file the Supabase website gets instead, so the thing he
// actually pastes is covered by these same checks and not by a similar set.
const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(here, "../supabase/functions/morning-brief/index.ts");

console.log(`testing: ${path.relative(process.cwd(), target)}`);
await import(pathToFileURL(target).href);
assert.ok(handler, "the function did not hand its handler to Deno.serve");

// ------------------------------------------------------------------ helpers

const BOT_TOKEN = "123456:FAKE-TOKEN-DO-NOT-USE";
const TRIGGER_KEY = "fake-trigger-secret-0123456789abcdef";

function reset(): void {
  env.clear();
  env.set("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  env.set("BRIEF_TRIGGER_SECRET", TRIGGER_KEY);
  env.set("SUPABASE_URL", "https://example.supabase.co");
  env.set("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key");
  answers = {
    app_settings: [{ key: "telegram_chat_id", value: "555000111" }],
    trading_rules: [
      { id: 1, sort_order: 1, rule_text: "No trade without the checklist." },
      { id: 2, sort_order: 2, rule_text: "Two setups a day, maximum." },
    ],
    protocol_items: [
      { id: 1, sort_order: 1, category: "trading_open", item_text: "Check the calendar." },
      { id: 2, sort_order: 2, category: "trading_close", item_text: "Log the day." },
    ],
  };
  sent = [];
  tokensSeen = [];
  reachedOut = [];
  dbKeysUsed = [];
}

async function invoke(query = "", key: string | null = TRIGGER_KEY): Promise<{ status: number; body: any }> {
  const headers = new Headers();
  if (key !== null) headers.set("x-trigger-key", key);
  const response = await handler!(
    new Request(`https://example.functions.supabase.co/morning-brief${query}`, { headers }),
  );
  return { status: response.status, body: await response.json() };
}

let passed = 0;
async function check(name: string, run: () => Promise<void>): Promise<void> {
  reset();
  await run();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("\nmorning brief, run end to end\n");

// -------------------------------------------------------------------- cases

await check("a clean run sends one message with the rules and the open checklist", async () => {
  const { status, body } = await invoke();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.sent, true);
  assert.equal(sent.length, 1, "exactly one message should be sent");
  assert.equal(sent[0].chat_id, "555000111");
  assert.ok(sent[0].text.includes("1. No trade without the checklist."));
  assert.ok(sent[0].text.includes("2. Two setups a day, maximum."));
  assert.ok(sent[0].text.includes("[ ] Check the calendar."));
  assert.ok(!sent[0].text.includes("Log the day."), "the close checklist must not appear");
});

await check("the chat id comes out of the database, not out of a secret", async () => {
  answers.app_settings = [
    { key: "something_else", value: "ignore me" },
    { key: "telegram_chat_id", value: "999888777" },
  ];
  env.set("TELEGRAM_CHAT_ID", "000000000");
  await invoke();
  assert.equal(sent[0].chat_id, "999888777");
});

await check("a missing app_settings row falls back to the secret and says so", async () => {
  answers.app_settings = [];
  env.set("TELEGRAM_CHAT_ID", "444333222");
  const { status, body } = await invoke();
  assert.equal(status, 200);
  assert.equal(sent[0].chat_id, "444333222");
  const step = body.steps.find((s: any) => s.step === "chat id");
  assert.ok(step.detail.includes("TELEGRAM_CHAT_ID"));
});

await check("no chat id anywhere stops before sending and names what is missing", async () => {
  answers.app_settings = [];
  const { status, body } = await invoke();
  assert.equal(status, 500);
  assert.equal(body.sent, false);
  assert.equal(sent.length, 0);
  assert.ok(JSON.stringify(body.steps).includes("No chat id in app_settings"));
});

await check("a missing bot token is named, and nothing is attempted", async () => {
  env.delete("TELEGRAM_BOT_TOKEN");
  const { status, body } = await invoke();
  assert.equal(status, 500);
  assert.equal(sent.length, 0);
  const step = body.steps.find((s: any) => s.step === "settings");
  assert.ok(step.detail.includes("TELEGRAM_BOT_TOKEN"));
});

await check("one table refusing still sends the other half, with the reason in place", async () => {
  answers.trading_rules = { status: 404, body: '{"message":"relation trading_rules does not exist"}' };
  const { status, body } = await invoke();
  assert.equal(status, 200);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.includes("Could not read your rules:"));
  assert.ok(sent[0].text.includes("[ ] Check the calendar."), "the checklist still has to arrive");
  const step = body.steps.find((s: any) => s.step === "trading_rules");
  assert.equal(step.ok, false);
  assert.ok(step.detail.includes("does not exist"), "the database's own words must survive");
});

await check("both tables refusing still reaches his phone, saying why", async () => {
  answers.trading_rules = { status: 401, body: '{"message":"permission denied"}' };
  answers.protocol_items = { status: 401, body: '{"message":"permission denied"}' };
  const { status } = await invoke();
  assert.equal(status, 502);
  assert.equal(sent.length, 1, "silence is the one answer he must never get");
  assert.ok(sent[0].text.includes("could not be built"));
  assert.ok(sent[0].text.includes("permission denied"));
});

await check("an empty rules table reads as empty, not as a blank heading", async () => {
  answers.trading_rules = [];
  await invoke();
  assert.ok(sent[0].text.includes("Could not read your rules: the table is empty."));
});

await check("Telegram refusing is reported, never reported as sent", async () => {
  answers.telegram = { status: 400, body: '{"ok":false,"error_code":400,"description":"chat not found"}' };
  const { status, body } = await invoke();
  assert.equal(status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.sent, false);
  const step = body.steps.find((s: any) => s.step === "telegram");
  assert.ok(step.detail.includes("chat not found"));
});

await check("Telegram being unreachable is a different answer from Telegram refusing", async () => {
  answers.telegramThrows = true;
  const { body } = await invoke();
  const step = body.steps.find((s: any) => s.step === "telegram");
  assert.ok(step.detail.includes("could not reach Telegram"));
  assert.ok(!step.detail.includes("refused the message"));
});

await check("a dry run builds the message and sends nothing", async () => {
  const { status, body } = await invoke("?dry=1");
  assert.equal(status, 200);
  assert.equal(body.sent, false);
  assert.equal(sent.length, 0);
  assert.ok(body.message.includes("1. No trade without the checklist."));
});

await check("the bot token never appears in the answer it hands back", async () => {
  answers.telegram = { status: 400, body: '{"ok":false,"description":"chat not found"}' };
  const { body } = await invoke();
  assert.ok(tokensSeen.includes(BOT_TOKEN), "the token should still reach Telegram");
  assert.ok(!JSON.stringify(body).includes(BOT_TOKEN), "but never come back out in the reply");
  assert.ok(!JSON.stringify(body).includes("fake-service-role-key"));
});

await check("no AI service is contacted by any path", async () => {
  const contacted: string[] = [];
  const realFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (input: string, init?: RequestInit) => {
    contacted.push(String(input));
    return realFetch(input, init);
  };
  await invoke();
  (globalThis as any).fetch = realFetch;
  const banned = /googleapis|generativelanguage|openai|anthropic|gemini|cohere|mistral/i;
  for (const url of contacted) {
    assert.ok(!banned.test(url), `this function must not contact ${url}`);
  }
  assert.ok(contacted.length > 0, "it should have contacted something");
});

await check("no trigger key means nothing is read and nothing is sent", async () => {
  const { status, body } = await invoke("", null);
  assert.equal(status, 401);
  assert.equal(body.sent, false);
  assert.equal(sent.length, 0);
  assert.equal(reachedOut.length, 0, "the database must not be touched by a caller who has not proved who they are");
  assert.ok(body.steps[0].detail.includes("x-trigger-key"));
});

await check("a wrong trigger key is refused the same way", async () => {
  const { status, body } = await invoke("", "not-the-right-secret-at-all-xxxxxxx");
  assert.equal(status, 401);
  assert.equal(reachedOut.length, 0);
  assert.ok(body.steps[0].detail.includes("did not match"));
});

await check("a key of the right length but wrong content is still refused", async () => {
  const nearly = TRIGGER_KEY.slice(0, -1) + "X";
  assert.equal(nearly.length, TRIGGER_KEY.length, "this case is only meaningful at equal length");
  const { status } = await invoke("", nearly);
  assert.equal(status, 401);
  assert.equal(reachedOut.length, 0);
});

await check("no secret set locks everyone out rather than letting everyone in", async () => {
  env.delete("BRIEF_TRIGGER_SECRET");
  const { status, body } = await invoke();
  assert.equal(status, 401);
  assert.equal(sent.length, 0);
  assert.equal(reachedOut.length, 0);
  assert.ok(body.steps[0].detail.includes("BRIEF_TRIGGER_SECRET is not set"));
});

await check("an empty trigger key does not match an unset secret", async () => {
  env.delete("BRIEF_TRIGGER_SECRET");
  const { status } = await invoke("", "");
  assert.equal(status, 401, "empty against empty must not read as a match");
  assert.equal(reachedOut.length, 0);
});

await check("the trigger secret never appears in the answer", async () => {
  const { body } = await invoke();
  assert.ok(!JSON.stringify(body).includes(TRIGGER_KEY));
});

// ------------------------------- the key that reads the database

const SECRET_KEY = "sb_secret_AbCdEf0123456789";

await check("an older project's single service role key is used as before", async () => {
  const { status, body } = await invoke();
  assert.equal(status, 200);
  assert.deepEqual([...new Set(dbKeysUsed)], ["fake-service-role-key"]);
  const step = body.steps.find((s: any) => s.step === "settings");
  assert.ok(step.detail.includes("SUPABASE_SERVICE_ROLE_KEY"));
});

await check("a newer project's bundle of keys is searched, and the right one used", async () => {
  env.delete("SUPABASE_SERVICE_ROLE_KEY");
  env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: SECRET_KEY }));
  const { status } = await invoke();
  assert.equal(status, 200);
  assert.deepEqual([...new Set(dbKeysUsed)], [SECRET_KEY], "the secret key must be the one that reads the tables");
});

await check("the bundle is found whatever shape it arrives in", async () => {
  for (const shape of [
    JSON.stringify([SECRET_KEY]),
    JSON.stringify([{ name: "default", api_key: SECRET_KEY }]),
    JSON.stringify({ keys: { live: { value: SECRET_KEY } } }),
    SECRET_KEY,
  ]) {
    reset();
    env.delete("SUPABASE_SERVICE_ROLE_KEY");
    env.set("SUPABASE_SECRET_KEYS", shape);
    const { status } = await invoke();
    assert.equal(status, 200, `this shape was not understood: ${shape.slice(0, 40)}`);
    assert.deepEqual([...new Set(dbKeysUsed)], [SECRET_KEY]);
  }
});

await check("a publishable key is refused rather than used", async () => {
  env.delete("SUPABASE_SERVICE_ROLE_KEY");
  env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ browser: "sb_publishable_y6AjQQ" }));
  const { status, body } = await invoke();
  assert.equal(status, 500, "a publishable key reads every table as empty, which is worse than refusing");
  assert.equal(reachedOut.length, 0);
  const step = body.steps.find((s: any) => s.step === "settings");
  assert.ok(step.detail.includes("held no key"));
});

await check("no database key at all names both places it looked", async () => {
  env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const { status, body } = await invoke();
  assert.equal(status, 500);
  assert.equal(sent.length, 0);
  const step = body.steps.find((s: any) => s.step === "settings");
  assert.ok(step.detail.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(step.detail.includes("SUPABASE_SECRET_KEYS"));
});

await check("an unreadable bundle says so rather than reading tables as empty", async () => {
  env.delete("SUPABASE_SERVICE_ROLE_KEY");
  env.set("SUPABASE_SECRET_KEYS", "this is not data and not a key");
  const { status, body } = await invoke();
  assert.equal(status, 500);
  assert.equal(reachedOut.length, 0);
  const step = body.steps.find((s: any) => s.step === "settings");
  assert.ok(step.detail.includes("neither readable data nor a key"));
});

await check("the failure describes the shape and never a value", async () => {
  env.delete("SUPABASE_SERVICE_ROLE_KEY");
  env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ browser: "sb_publishable_SENSITIVE-VALUE" }));
  const { body } = await invoke();
  const text = JSON.stringify(body);
  assert.ok(text.includes("browser"), "the label is useful and safe");
  assert.ok(!text.includes("SENSITIVE-VALUE"), "the value must never come back out");
});

await check("no database key is ever repeated in the answer", async () => {
  env.delete("SUPABASE_SERVICE_ROLE_KEY");
  env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: SECRET_KEY }));
  const { body } = await invoke();
  assert.ok(!JSON.stringify(body).includes(SECRET_KEY));
});

console.log(`\n${passed} checks passed\n`);
