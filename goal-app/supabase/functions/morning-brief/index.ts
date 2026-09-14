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
//   BRIEF_TRIGGER_SECRET        you set this one. See callerIsAllowed below
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

/**
 * Who is allowed to set this off.
 *
 * Supabase's own door check is switched off for this function, because it only
 * understands the old style of key and this project uses the new style. Checked
 * against Supabase's own documentation and confirmed by their staff, not
 * assumed. So the door is ours to lock, and this is the lock.
 *
 * Two rules it has to obey:
 *
 *   It runs BEFORE a single row is read. A caller who cannot say who they are
 *   never causes the database to be touched at all.
 *
 *   No secret set means nobody gets in. A lock that falls open when its key is
 *   missing is not a lock.
 *
 * The comparison looks at every character even after it knows the answer, so
 * the time it takes gives nothing away about how much of the secret was right.
 */
function callerIsAllowed(request: Request, expected: string): boolean {
  const offered = request.headers.get("x-trigger-key") ?? "";
  if (expected.length === 0) return false;
  if (offered.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= expected.charCodeAt(i) ^ offered.charCodeAt(i);
  }
  return difference === 0;
}

async function handler(request: Request): Promise<Response> {
  // Nothing above this line reaches the database, Telegram, or anywhere else.
  const triggerSecret = Deno.env.get("BRIEF_TRIGGER_SECRET") ?? "";
  if (!callerIsAllowed(request, triggerSecret)) {
    return Response.json(
      {
        ok: false,
        sent: false,
        steps: [
          {
            step: "who is asking",
            ok: false,
            detail:
              triggerSecret === ""
                ? "BRIEF_TRIGGER_SECRET is not set on this function, so nobody is allowed in. " +
                  "Nothing was read and nothing was sent."
                : "The x-trigger-key header was missing or did not match. " +
                  "Nothing was read and nothing was sent.",
          },
        ],
      },
      { status: 401 },
    );
  }

  const steps: Step[] = [{ step: "who is asking", ok: true, detail: "The trigger key matched." }];
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
