// Runs the real telegram-webhook function, start to finish, with the database
// and Telegram stood in for.
//
//   node --experimental-strip-types goal-app/tests/telegram-webhook.test.ts
//   node --experimental-strip-types goal-app/tests/telegram-webhook.test.ts <path>
//
// It imports the actual index.ts that gets deployed. It does not re-implement
// any of it. What it checks is what the caller receives: what reaches Telegram,
// what reaches the database, and the answer handed back.

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

interface Sent { chat_id: string; text: string }

let sent: Sent[] = [];
let saved: Record<string, unknown>[] = [];
let reachedOut: string[] = [];
let dbRefuses = false;
let settingsRows: unknown[] = [];

(globalThis as any).fetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  reachedOut.push(url);

  if (url.startsWith("https://api.telegram.org/")) {
    sent.push(JSON.parse(String(init?.body)) as Sent);
    return new Response('{"ok":true}', { status: 200 });
  }
  if (url.includes("/rest/v1/app_settings")) {
    return new Response(JSON.stringify(settingsRows), { status: 200 });
  }
  if (url.includes("/rest/v1/thoughts")) {
    if (dbRefuses) return new Response('{"message":"permission denied for table thoughts"}', { status: 401 });
    saved.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response("", { status: 201 });
  }
  return new Response("[]", { status: 200 });
};

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(here, "../supabase/functions/telegram-webhook/index.ts");
console.log(`testing: ${path.relative(process.cwd(), target)}`);
await import(pathToFileURL(target).href);
assert.ok(handler, "the function did not hand its handler to Deno.serve");

// ------------------------------------------------------------------ helpers

const BOT_TOKEN = "123456:FAKE-TOKEN-DO-NOT-USE";
const HOOK_SECRET = "fake-webhook-secret-0123456789abcdef";
const HIS_CHAT = "6913699052";

function reset(): void {
  env.clear();
  env.set("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  env.set("TELEGRAM_WEBHOOK_SECRET", HOOK_SECRET);
  env.set("SUPABASE_URL", "https://example.supabase.co");
  env.set("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key");
  settingsRows = [{ key: "telegram_chat_id", value: HIS_CHAT }];
  sent = []; saved = []; reachedOut = []; dbRefuses = false;
}

async function send(
  body: unknown,
  secret: string | null = HOOK_SECRET,
): Promise<{ status: number; body: any }> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret !== null) headers.set("x-telegram-bot-api-secret-token", secret);
  const response = await handler!(
    new Request("https://example.functions.supabase.co/telegram-webhook", {
      method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

const messageFrom = (chatId: string, text?: string) => ({
  update_id: 1,
  message: { message_id: 7, chat: { id: Number(chatId) }, ...(text === undefined ? {} : { text }) },
});

let passed = 0;
async function check(name: string, run: () => Promise<void>): Promise<void> {
  reset();
  await run();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("\ntelegram webhook, run end to end\n");

// -------------------------------------------------------------------- cases

await check("his thought is saved word for word and confirmed", async () => {
  const { status, body } = await send(messageFrom(HIS_CHAT, "#biz restaurants have a POS problem"));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].body, "#biz restaurants have a POS problem", "his text must be stored untouched");
  assert.deepEqual(saved[0].tags, ["biz"]);
  assert.equal(saved[0].is_private, false);
  assert.equal(saved[0].source, "telegram");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, "Saved. Tags: biz");
  assert.equal(sent[0].chat_id, HIS_CHAT);
});

await check("a private thought is marked private and still stored in full", async () => {
  await send(messageFrom(HIS_CHAT, "!thinking about dropping the Tuesday client"));
  assert.equal(saved[0].is_private, true);
  assert.equal(saved[0].body, "!thinking about dropping the Tuesday client");
  assert.equal(sent[0].text, "Saved, private.");
});

await check("A STRANGER'S MESSAGE IS NEVER SAVED, AND NEVER REPLIED TO", async () => {
  const { status } = await send(messageFrom("999999999", "hello from a stranger"));
  assert.equal(status, 200);
  assert.equal(saved.length, 0, "a stranger's words must never enter his thinking");
  assert.equal(sent.length, 0, "and replying would tell them the bot is listening");
});

await check("no secret means nothing is read, saved or sent", async () => {
  const { status, body } = await send(messageFrom(HIS_CHAT, "hello"), null);
  assert.equal(status, 401);
  assert.equal(reachedOut.length, 0, "the database must not be touched by an unproven caller");
  assert.equal(saved.length, 0);
  assert.equal(sent.length, 0);
  assert.ok(body.steps[0].detail.includes("did not match"));
});

await check("a wrong secret is refused the same way", async () => {
  const { status } = await send(messageFrom(HIS_CHAT, "hello"), "not-the-right-secret-at-all-xxxx");
  assert.equal(status, 401);
  assert.equal(reachedOut.length, 0);
});

await check("no secret configured locks everyone out rather than letting everyone in", async () => {
  env.delete("TELEGRAM_WEBHOOK_SECRET");
  const { status, body } = await send(messageFrom(HIS_CHAT, "hello"));
  assert.equal(status, 401);
  assert.equal(reachedOut.length, 0);
  assert.ok(body.steps[0].detail.includes("TELEGRAM_WEBHOOK_SECRET is not set"));
});

await check("once Telegram has proved itself, the answer is ALWAYS 200", async () => {
  // Telegram repeats anything that is not 2xx and eventually switches the
  // webhook off. So an internal fault must never come back as an error.
  dbRefuses = true;
  const refused = await send(messageFrom(HIS_CHAT, "a thought"));
  assert.equal(refused.status, 200);

  reset();
  const notAMessage = await send({ update_id: 2, poll: { id: "x" } });
  assert.equal(notAMessage.status, 200);

  reset();
  const rubbish = await send("this is not data at all");
  assert.equal(rubbish.status, 200);
});

await check("when the database refuses, he is told it was NOT saved", async () => {
  dbRefuses = true;
  const { body } = await send(messageFrom(HIS_CHAT, "a thought that will not store"));
  assert.equal(saved.length, 0);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.startsWith("NOT saved."), "silence here would let him think it landed");
  assert.ok(sent[0].text.includes("permission denied"), "the database's own words must survive");
  assert.equal(body.steps.find((s: any) => s.step === "saving").ok, false);
});

await check("a command is answered but never saved", async () => {
  await send(messageFrom(HIS_CHAT, "/start"));
  assert.equal(saved.length, 0, "/start must not become a thought");
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.includes("Ready"));

  reset();
  await send(messageFrom(HIS_CHAT, "/find restaurants"));
  assert.equal(saved.length, 0);
  assert.ok(sent[0].text.includes("do not know"), "and an unknown command says so plainly");
});

await check("a photo or sticker says so rather than saving nothing in silence", async () => {
  await send(messageFrom(HIS_CHAT));
  assert.equal(saved.length, 0);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.includes("only save text"));
});

await check("with no chat id on file, nothing is saved from anybody", async () => {
  settingsRows = [];
  const { body } = await send(messageFrom(HIS_CHAT, "a thought"));
  assert.equal(saved.length, 0, "without knowing whose chat is his, anyone's would qualify");
  assert.equal(sent.length, 0);
  assert.equal(body.steps.find((s: any) => s.step === "whose chat").ok, false);
});

await check("an edited message is handled, not crashed on", async () => {
  await send({ update_id: 3, edited_message: { message_id: 7, chat: { id: Number(HIS_CHAT) }, text: "#fix reworded" } });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].tags, ["fix"]);
});

await check("no secret ever appears in the answer it hands back", async () => {
  const { body } = await send(messageFrom(HIS_CHAT, "a thought"));
  const text = JSON.stringify(body);
  assert.ok(!text.includes(HOOK_SECRET));
  assert.ok(!text.includes(BOT_TOKEN));
  assert.ok(!text.includes("fake-service-role-key"));
});

await check("no AI service is contacted by any path", async () => {
  await send(messageFrom(HIS_CHAT, "#biz a thought"));
  const banned = /googleapis|generativelanguage|openai|anthropic|gemini|cohere|mistral/i;
  for (const url of reachedOut) assert.ok(!banned.test(url), `must not contact ${url}`);
  assert.ok(reachedOut.length > 0);
});

console.log(`\n${passed} checks passed\n`);
