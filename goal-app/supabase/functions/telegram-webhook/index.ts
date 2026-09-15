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

import { confirmationFor, parseThought } from "../_shared/thought.ts";
import { findDatabaseKey, insertRow, readTable, secretsMatch, type Row } from "../_shared/db.ts";

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
