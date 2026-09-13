// morning-brief
//
// Reads the trading rules and the trading_open checklist out of the database,
// formats them, and sends one Telegram message.
//
// There is no AI call in this function and no outbound request to any AI
// service. It talks to exactly two places: your own Supabase database, and
// Telegram.
//
// Secrets it needs:
//   TELEGRAM_BOT_TOKEN          you set this one
//   SUPABASE_URL                Supabase fills this in for you
//   SUPABASE_SERVICE_ROLE_KEY   Supabase fills this in for you
//   TELEGRAM_CHAT_ID            optional, only used if app_settings has no row

import {
  buildBriefMessage,
  buildFailureMessage,
  capForTelegram,
  columnNames,
  easternDateLine,
  extractList,
  pickColumn,
  type ExtractResult,
  type Row,
} from "../_shared/brief.ts";

interface Step {
  step: string;
  ok: boolean;
  detail: string;
}

interface TableRead {
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
async function readTable(baseUrl: string, serviceKey: string, table: string): Promise<TableRead> {
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

/** Pull telegram_chat_id out of the app_settings key/value table. */
function chatIdFromSettings(rows: Row[]): { chatId: string | null; note: string } {
  if (rows.length === 0) {
    return { chatId: null, note: "app_settings held no rows." };
  }
  const keyColumn = pickColumn(rows, ["key", "setting_key", "name", "setting", "k"]);
  const valueColumn = pickColumn(rows, ["value", "setting_value", "val", "v", "content"]);
  if (!keyColumn || !valueColumn) {
    return {
      chatId: null,
      note: `app_settings does not look like a key/value table. Its columns are: ${columnNames(rows).join(", ")}.`,
    };
  }
  const match = rows.find((row) => String(row[keyColumn] ?? "").trim() === "telegram_chat_id");
  if (!match) {
    const keys = rows.map((row) => String(row[keyColumn] ?? "")).join(", ");
    return { chatId: null, note: `app_settings has no telegram_chat_id row. It holds: ${keys}.` };
  }
  const value = String(match[valueColumn] ?? "").trim();
  if (value === "") {
    return { chatId: null, note: "app_settings has a telegram_chat_id row but it is blank." };
  }
  return { chatId: value, note: `Chat id read from app_settings ("${keyColumn}"/"${valueColumn}").` };
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: capForTelegram(text),
        disable_web_page_preview: true,
      }),
    });
  } catch (cause) {
    return `could not reach Telegram at all (${String(cause)})`;
  }

  const body = await response.text();
  if (!response.ok) {
    // Telegram puts the real reason in "description". Do not swallow it.
    return `Telegram refused the message (status ${response.status}): ${body.slice(0, 400)}`;
  }
  return null;
}

async function handler(request: Request): Promise<Response> {
  const steps: Step[] = [];
  const dateLine = easternDateLine(new Date());
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const missing = [
    token ? null : "TELEGRAM_BOT_TOKEN",
    supabaseUrl ? null : "SUPABASE_URL",
    serviceKey ? null : "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    steps.push({
      step: "settings",
      ok: false,
      detail: `These are not set: ${missing.join(", ")}. Nothing was sent.`,
    });
    return Response.json({ ok: false, sent: false, dateLine, steps }, { status: 500 });
  }
  steps.push({ step: "settings", ok: true, detail: "Bot token and database keys are present." });

  // Chat id. Read from the database first, fall back to a secret.
  const settings = await readTable(supabaseUrl, serviceKey, "app_settings");
  let chatId: string | null = null;
  if (settings.error) {
    steps.push({ step: "app_settings", ok: false, detail: settings.error });
  } else {
    const found = chatIdFromSettings(settings.rows);
    chatId = found.chatId;
    steps.push({ step: "app_settings", ok: chatId !== null, detail: found.note });
  }
  if (!chatId) {
    const fallback = (Deno.env.get("TELEGRAM_CHAT_ID") ?? "").trim();
    if (fallback) {
      chatId = fallback;
      steps.push({ step: "chat id", ok: true, detail: "Used the TELEGRAM_CHAT_ID secret instead." });
    } else {
      steps.push({
        step: "chat id",
        ok: false,
        detail: "No chat id in app_settings and no TELEGRAM_CHAT_ID secret. Nothing was sent.",
      });
      return Response.json({ ok: false, sent: false, dateLine, steps }, { status: 500 });
    }
  }

  // The two tables the brief is made of.
  const rulesRead = await readTable(supabaseUrl, serviceKey, "trading_rules");
  const protocolRead = await readTable(supabaseUrl, serviceKey, "protocol_items");

  if (rulesRead.error && protocolRead.error) {
    steps.push({ step: "trading_rules", ok: false, detail: rulesRead.error });
    steps.push({ step: "protocol_items", ok: false, detail: protocolRead.error });
    const reason = `Neither table could be read.\n\n${rulesRead.error}\n\n${protocolRead.error}`;
    const sendError = dryRun ? null : await sendTelegram(token, chatId, buildFailureMessage(dateLine, reason));
    steps.push({
      step: "telegram",
      ok: sendError === null,
      detail: dryRun ? "Dry run, nothing sent." : sendError ?? "A message saying so was sent.",
    });
    return Response.json({ ok: false, sent: !dryRun && !sendError, dateLine, steps }, { status: 502 });
  }

  const rules: ExtractResult = rulesRead.error
    ? { items: [], notes: [rulesRead.error], problem: rulesRead.error }
    : extractList(rulesRead.rows, {
        textCandidates: ["rule_text", "rule", "text", "body", "content", "title", "name", "description"],
        orderCandidates: ["sort_order", "order_index", "display_order", "position", "rule_number", "number", "seq", "sort", "id", "created_at"],
        activeCandidates: ["is_active", "active", "enabled"],
      });
  steps.push({ step: "trading_rules", ok: rules.problem === null, detail: rules.notes.join(" ") });

  const checklist: ExtractResult = protocolRead.error
    ? { items: [], notes: [protocolRead.error], problem: protocolRead.error }
    : extractList(protocolRead.rows, {
        textCandidates: ["item_text", "item", "text", "body", "content", "title", "name", "label", "description"],
        orderCandidates: ["sort_order", "order_index", "display_order", "position", "item_number", "number", "seq", "sort", "id", "created_at"],
        categoryCandidates: ["category", "phase", "section", "group_name", "group", "protocol", "protocol_type", "type", "kind", "stage", "checklist", "list_name"],
        categoryMatch: /trading[_\s-]?open|^open$/i,
        activeCandidates: ["is_active", "active", "enabled"],
      });
  steps.push({ step: "protocol_items", ok: checklist.problem === null, detail: checklist.notes.join(" ") });

  const message = buildBriefMessage({ dateLine, rules, checklist });

  if (dryRun) {
    steps.push({ step: "telegram", ok: true, detail: "Dry run, nothing sent." });
    return Response.json({ ok: true, sent: false, dateLine, steps, message });
  }

  const sendError = await sendTelegram(token, chatId, message);
  steps.push({
    step: "telegram",
    ok: sendError === null,
    detail: sendError ?? `Message sent to chat ${chatId}.`,
  });

  return Response.json(
    { ok: sendError === null, sent: sendError === null, dateLine, steps, message },
    { status: sendError === null ? 200 : 502 },
  );
}

Deno.serve(handler);
