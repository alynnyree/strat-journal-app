// GENERATED FILE. DO NOT EDIT THIS ONE.
//
// This is the real files for "telegram-webhook" joined together so it can be pasted
// into the Supabase website in one go. The originals are:
//
//   goal-app/supabase/functions/_shared/db.ts
//   goal-app/supabase/functions/_shared/thought.ts
//   goal-app/supabase/functions/telegram-webhook/index.ts
//
// Change those, then run:  node goal-app/tools/build-single-file.mjs

// Talking to the database, and proving who is calling.
//
// These pieces are shared by every function in this project. They are COPIED
// from morning-brief rather than imported, because morning-brief is deployed and
// working and re-pasting it would cost him a deploy for no benefit to him.
//
// A copy that nobody watches drifts. So tests/no-drift.test.ts reads both files
// and fails if these functions ever stop matching, character for character.
// When morning-brief next needs changing for its own reasons, it switches to
// importing these and the copy goes away.
//
// No AI is involved here or anywhere else in this project.

export type Row = Record<string, unknown>;

export interface TableRead {
  rows: Row[];
  error: string | null;
}

/**
 * Read every row of a table through PostgREST, the web address Supabase puts
 * in front of the database.
 *
 * A refusal comes back as readable words, never as a bare empty list. "Could
 * not reach it", "it answered with nothing" and "it refused me" are three
 * different faults and have to stay three different answers.
 */
export async function readTable(baseUrl: string, serviceKey: string, table: string): Promise<TableRead> {
  const url = `${baseUrl.replace(/\/+$/, "")}/rest/v1/${table}?select=*`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    });
  } catch (cause) {
    return { rows: [], error: `could not reach the database at all (${String(cause)})` };
  }

  const body = await response.text();
  if (!response.ok) {
    return {
      rows: [],
      error: `the database refused to hand over "${table}" (status ${response.status}): ${body.slice(0, 400)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { rows: [], error: `"${table}" answered with something that was not readable data` };
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], error: `"${table}" answered with a single value where a list was expected` };
  }
  return { rows: parsed as Row[], error: null };
}

/**
 * Does this look like a key that can actually read the tables?
 *
 * A publishable key is deliberately NOT accepted. Row Level Security is on with
 * no policies, so a publishable key is not refused, it is simply handed nothing
 * back. Every table would read as empty and the brief would confidently report
 * "the table is empty" about six rules that are sitting right there. A wrong
 * answer that looks like a real one is worse than a refusal.
 */
export function looksLikeDatabaseKey(value: string): boolean {
  return value.startsWith("sb_secret_") || value.startsWith("eyJ");
}

/** Describe what arrived without ever repeating a value. */
export function describeShape(value: unknown): string {
  if (Array.isArray(value)) return `a list of ${value.length} item(s)`;
  if (value !== null && typeof value === "object") {
    return `a group labelled: ${Object.keys(value as Record<string, unknown>).join(", ")}`;
  }
  return typeof value;
}

export function firstDatabaseKeyIn(value: unknown): string | null {
  const found: string[] = [];
  const walk = (node: unknown, depth: number): void => {
    if (depth > 6) return;
    if (typeof node === "string") {
      if (looksLikeDatabaseKey(node)) found.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const item of Object.values(node as Record<string, unknown>)) walk(item, depth + 1);
    }
  };
  walk(value, 0);
  return found.find((key) => key.startsWith("sb_secret_")) ?? found.find((key) => key.startsWith("eyJ")) ?? null;
}

/**
 * Find the key that lets this function read the database.
 *
 * Older Supabase projects hand a function SUPABASE_SERVICE_ROLE_KEY, one key on
 * its own. Newer ones, this project among them, hand it SUPABASE_SECRET_KEYS,
 * which is a bundle rather than a single key.
 *
 * Rather than guess the exact shape of that bundle, this looks through whatever
 * is in there and takes the first thing that can actually read tables. When it
 * finds nothing it reports the SHAPE of what it was given and never a value, so
 * the next round starts from evidence instead of from another guess.
 */
export function findDatabaseKey(): { key: string | null; note: string } {
  const direct = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (direct !== "") return { key: direct, note: "Reading the database with SUPABASE_SERVICE_ROLE_KEY." };

  const bundle = (Deno.env.get("SUPABASE_SECRET_KEYS") ?? "").trim();
  if (bundle === "") {
    return {
      key: null,
      note: "Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_SECRET_KEYS is set on this function.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bundle);
  } catch {
    if (looksLikeDatabaseKey(bundle)) {
      return { key: bundle, note: "Reading the database with SUPABASE_SECRET_KEYS, which held one key." };
    }
    return {
      key: null,
      note: "SUPABASE_SECRET_KEYS is set but is neither readable data nor a key on its own.",
    };
  }

  const found = firstDatabaseKeyIn(parsed);
  if (found !== null) {
    return { key: found, note: "Reading the database with a key found inside SUPABASE_SECRET_KEYS." };
  }
  return {
    key: null,
    note:
      `SUPABASE_SECRET_KEYS was readable but held no key that can read tables. ` +
      `What arrived was ${describeShape(parsed)}.`,
  };
}

/**
 * Add one row to a table.
 *
 * Answers in words on refusal, never a bare false. "Could not reach it" and
 * "it refused me" are different faults and stay different answers.
 */
export async function insertRow(
  baseUrl: string,
  serviceKey: string,
  table: string,
  row: Row,
): Promise<{ ok: boolean; error: string | null }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/rest/v1/${table}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch (cause) {
    return { ok: false, error: `could not reach the database at all (${String(cause)})` };
  }
  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      error: `the database refused to store this in "${table}" (status ${response.status}): ${body.slice(0, 400)}`,
    };
  }
  return { ok: true, error: null };
}

/**
 * Do these two secrets match?
 *
 * Reads every character even after it knows the answer, so how long it takes
 * says nothing about how much was right. An unset secret matches nothing, so a
 * missing password locks the door rather than opening it.
 */
export function secretsMatch(expected: string, offered: string): boolean {
  if (expected.length === 0) return false;
  if (offered.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= expected.charCodeAt(i) ^ offered.charCodeAt(i);
  }
  return difference === 0;
}

// Reading a message he sends the bot.
//
// Nothing here touches the network or the database, so all of it can be run and
// checked on a laptop. No AI is involved, here or anywhere else in this project.

/** What kind of message arrived. */
export type MessageKind = "thought" | "command" | "empty";

export interface ParsedThought {
  kind: MessageKind;
  /**
   * What gets saved: EXACTLY what he typed, unchanged.
   *
   * The leading "!" and hashtags stay in. They are read for their meaning and
   * then left alone, because "saves it raw" means raw. Stripping them cannot be
   * undone later; keeping them can.
   */
  body: string;
  /** Tags read from hashtags at the START of the message, in the order written. */
  tags: string[];
  /** True when the message begins with "!". */
  isPrivate: boolean;
  /** For a command, its name without the slash, lowercased. Otherwise null. */
  command: string | null;
}

const TAG_CHARACTERS = /^#([A-Za-z0-9_-]+)$/;

/**
 * Read one message.
 *
 * The rules, as he set them out:
 *   a leading "!" marks it private
 *   hashtags at the front become tags
 *   everything else is saved as plain text
 *
 * A message starting with "/" is a command, not a thought. Those are saved
 * nowhere, so that "/start" and typos do not end up in his thinking as though
 * he had written them.
 */
export function parseThought(raw: string): ParsedThought {
  const text = raw.trim();

  if (text === "") {
    return { kind: "empty", body: raw, tags: [], isPrivate: false, command: null };
  }

  if (text.startsWith("/")) {
    // "/find@my_bot something" is how Telegram writes a command in a group.
    const firstWord = text.slice(1).split(/\s+/)[0] ?? "";
    return {
      kind: "command",
      body: raw,
      tags: [],
      isPrivate: false,
      command: firstWord.split("@")[0].toLowerCase(),
    };
  }

  const isPrivate = text.startsWith("!");
  // The "!" is read here and then ignored, so that "!#biz ..." still tags.
  const afterMark = isPrivate ? text.slice(1).trimStart() : text;

  const tags: string[] = [];
  for (const word of afterMark.split(/\s+/)) {
    const match = TAG_CHARACTERS.exec(word);
    if (!match) break; // Only hashtags at the FRONT count. Stop at the first word that is not one.
    const tag = match[1].toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
  }

  return { kind: "thought", body: raw, tags, isPrivate, command: null };
}

/**
 * What the bot says back.
 *
 * Short on purpose. It confirms what was understood, so a mistyped hashtag or a
 * "!" he did not mean shows up immediately rather than weeks later.
 */
export function confirmationFor(parsed: ParsedThought): string {
  const parts = [parsed.isPrivate ? "Saved, private." : "Saved."];
  if (parsed.tags.length > 0) parts.push(`Tags: ${parsed.tags.join(", ")}`);
  return parts.join(" ");
}

// telegram-webhook
//
// Telegram calls this every time he sends the bot a message. It saves what he
// wrote to the thoughts table, word for word, and replies with a short
// confirmation.
//
// There is no AI call in this function and no outbound request to any AI
// service. It talks to exactly two places: his own Supabase database, and
// Telegram.
//
// Secrets it needs:
//   TELEGRAM_BOT_TOKEN        already set, shared with morning-brief
//   TELEGRAM_WEBHOOK_SECRET   he sets this one. See "who is calling" below
//   SUPABASE_URL              Supabase fills this in
//   SUPABASE_SECRET_KEYS      Supabase fills this in. Newer projects
//   SUPABASE_SERVICE_ROLE_KEY Supabase fills this in. Older projects
//   TELEGRAM_CHAT_ID          optional, only used if app_settings has no row


interface Step {
  step: string;
  ok: boolean;
  detail: string;
}

/** Pull telegram_chat_id out of app_settings, which this project creates as key/value. */
function chatIdFrom(rows: Row[]): string | null {
  const match = rows.find((row) => String(row.key ?? "").trim() === "telegram_chat_id");
  const value = String(match?.value ?? "").trim();
  return value === "" ? null : value;
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!response.ok) {
      const body = await response.text();
      return `Telegram refused the reply (status ${response.status}): ${body.slice(0, 300)}`;
    }
    return null;
  } catch (cause) {
    return `could not reach Telegram at all (${String(cause)})`;
  }
}

/**
 * Answer Telegram.
 *
 * ALWAYS 200 once the caller has proved who it is, even when something went
 * wrong inside. Telegram repeats any request that does not answer 2xx and gives
 * up after a while, so an internal fault answered with an error turns one bad
 * moment into a hammering and eventually a webhook Telegram has switched off.
 * What went wrong is reported to him in the reply message instead, where he
 * will actually see it.
 */
function ok(steps: Step[], extra: Record<string, unknown> = {}): Response {
  return Response.json({ ok: true, steps, ...extra });
}

async function handler(request: Request): Promise<Response> {
  // ---------------------------------------------------------- who is calling
  //
  // Telegram cannot send our own header, so the lock used by morning-brief is
  // no use here. Telegram has its own way: a secret given to it when the
  // webhook is registered, which it sends back on every request in this header.
  // Confirmed in Telegram's own documentation, not assumed.
  //
  // Nothing above this line reaches the database or Telegram.
  const expected = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
  const offered = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secretsMatch(expected, offered)) {
    return Response.json(
      {
        ok: false,
        steps: [{
          step: "who is calling",
          ok: false,
          detail: expected === ""
            ? "TELEGRAM_WEBHOOK_SECRET is not set on this function, so nobody is allowed in. Nothing was read or saved."
            : "The secret Telegram sends did not match. Nothing was read or saved.",
        }],
      },
      { status: 401 },
    );
  }

  const steps: Step[] = [{ step: "who is calling", ok: true, detail: "Telegram's secret matched." }];

  // ------------------------------------------------------------- the message
  let update: Record<string, unknown>;
  try {
    update = await request.json() as Record<string, unknown>;
  } catch {
    steps.push({ step: "the message", ok: false, detail: "The body was not readable data. Nothing saved." });
    return ok(steps);
  }

  const message = (update.message ?? update.edited_message) as Record<string, unknown> | undefined;
  if (!message) {
    // Telegram sends other kinds of update. Not a fault, just not for us.
    steps.push({ step: "the message", ok: true, detail: "Not a message. Nothing to save." });
    return ok(steps);
  }

  const chat = message.chat as Record<string, unknown> | undefined;
  const fromChat = chat?.id === undefined ? "" : String(chat.id);
  const text = typeof message.text === "string" ? message.text : null;

  // --------------------------------------------------------------- his keys
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const database = findDatabaseKey();
  if (token === "" || supabaseUrl === "" || database.key === null) {
    steps.push({
      step: "settings",
      ok: false,
      detail: `${token === "" ? "TELEGRAM_BOT_TOKEN is not set. " : ""}${database.key === null ? database.note : ""}`.trim(),
    });
    return ok(steps);
  }
  const serviceKey = database.key;

  // ------------------------------------------------------ is this him asking
  //
  // Anyone who finds the bot can message it. Without this, a stranger's words
  // would land in his own thinking, indistinguishable from his. So the chat is
  // checked against the one in his settings, and anything else is dropped in
  // silence: no save, and no reply either, because a reply tells a stranger the
  // bot is listening.
  const settings = await readTable(supabaseUrl, serviceKey, "app_settings");
  let hisChat: string | null = settings.error ? null : chatIdFrom(settings.rows);
  if (hisChat === null) {
    const fallback = (Deno.env.get("TELEGRAM_CHAT_ID") ?? "").trim();
    if (fallback !== "") hisChat = fallback;
  }

  if (hisChat === null) {
    steps.push({
      step: "whose chat",
      ok: false,
      detail: settings.error ?? "No telegram_chat_id in app_settings. Refusing everything rather than saving from anyone.",
    });
    return ok(steps);
  }
  if (fromChat !== hisChat) {
    steps.push({ step: "whose chat", ok: true, detail: "A message from somebody else. Dropped, and not replied to." });
    return ok(steps);
  }
  steps.push({ step: "whose chat", ok: true, detail: "His own chat." });

  // -------------------------------------------------------------- read it
  if (text === null) {
    steps.push({ step: "the message", ok: true, detail: "No text in it. Nothing saved." });
    await sendTelegram(token, hisChat, "I can only save text for now, so that one was not kept.");
    return ok(steps);
  }

  const parsed = parseThought(text);

  if (parsed.kind === "empty") {
    steps.push({ step: "the message", ok: true, detail: "Empty. Nothing saved." });
    return ok(steps);
  }

  if (parsed.kind === "command") {
    // Commands arrive from step 4 onwards. Until then they are answered, never
    // saved, so that "/start" does not end up in his thinking as a thought.
    steps.push({ step: "the message", ok: true, detail: `Command "${parsed.command}". Not saved.` });
    const reply = parsed.command === "start"
      ? "Ready. Send me any thought and I will save it. Put # in front of a word to tag it, or ! at the front to mark it private."
      : `I do not know "/${parsed.command}" yet. Send a thought without a slash and I will save it.`;
    await sendTelegram(token, hisChat, reply);
    return ok(steps);
  }

  // ------------------------------------------------------------------ save
  const stored = await insertRow(supabaseUrl, serviceKey, "thoughts", {
    body: parsed.body,
    tags: parsed.tags,
    is_private: parsed.isPrivate,
    source: "telegram",
  });

  if (!stored.ok) {
    steps.push({ step: "saving", ok: false, detail: stored.error ?? "unknown" });
    // He must never be left thinking it saved when it did not.
    await sendTelegram(token, hisChat, `NOT saved. ${stored.error}`);
    return ok(steps);
  }

  steps.push({
    step: "saving",
    ok: true,
    detail: `Saved. ${parsed.tags.length} tag(s), private: ${parsed.isPrivate}.`,
  });

  const replyError = await sendTelegram(token, hisChat, confirmationFor(parsed));
  steps.push({
    step: "telegram",
    ok: replyError === null,
    detail: replyError ?? "Confirmation sent.",
  });

  return ok(steps);
}

Deno.serve(handler);
