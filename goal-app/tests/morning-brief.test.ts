// Runs the real morning-brief function, start to finish, with the database and
// Telegram stood in for.
//
// Run it with:  node --experimental-strip-types goal-app/tests/morning-brief.test.ts
//
// This imports the actual index.ts the Edge Function deploys. It does not
// re-implement any of it. What it checks is what the caller receives: the
// message that reaches Telegram and the answer the function hands back.

import assert from "node:assert/strict";

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

(globalThis as any).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const url = String(input);

  if (url.startsWith("https://api.telegram.org/")) {
    tokensSeen.push(url.split("/bot")[1].split("/")[0]);
    if (answers.telegramThrows) throw new Error("network is down");
    sent.push(JSON.parse(String(init?.body)) as Sent);
    const reply = answers.telegram ?? { status: 200, body: '{"ok":true,"result":{"message_id":1}}' };
    return new Response(reply.body, { status: reply.status });
  }

  const table = url.split("/rest/v1/")[1]?.split("?")[0] as keyof Answers;
  const answer = answers[table];
  if (answer === undefined) return new Response("[]", { status: 200 });
  if (Array.isArray(answer)) {
    return new Response(JSON.stringify(answer), { status: 200 });
  }
  return new Response(answer.body, { status: answer.status });
};

await import("../supabase/functions/morning-brief/index.ts");
assert.ok(handler, "index.ts did not hand its handler to Deno.serve");

// ------------------------------------------------------------------ helpers

const BOT_TOKEN = "123456:FAKE-TOKEN-DO-NOT-USE";

function reset(): void {
  env.clear();
  env.set("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
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
}

async function invoke(query = ""): Promise<{ status: number; body: any }> {
  const response = await handler!(new Request(`https://example.functions.supabase.co/morning-brief${query}`));
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
  assert.ok(body.steps[0].detail.includes("TELEGRAM_BOT_TOKEN"));
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

console.log(`\n${passed} checks passed\n`);
