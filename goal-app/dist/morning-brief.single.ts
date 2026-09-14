// GENERATED FILE. DO NOT EDIT THIS ONE.
//
// This is the two real files joined together so it can be pasted into the
// Supabase website in one go. The originals are:
//
//   goal-app/supabase/functions/_shared/brief.ts
//   goal-app/supabase/functions/morning-brief/index.ts
//
// Change those, then run:  node goal-app/tools/build-single-file.mjs

// Pure text handling for the morning brief.
//
// Nothing in this file touches the network or the database. That is deliberate:
// it means the whole of the message building can be run and checked on a laptop
// without a Supabase account and without sending anything to Telegram.
//
// No AI calls happen here or anywhere else in this project.

export type Row = Record<string, unknown>;

export const TELEGRAM_MAX_CHARS = 4096;

/**
 * Find the first column name in `candidates` that actually exists on these rows.
 * Prefers a column that carries real text over one that exists but is empty
 * everywhere, so a table with both `title` (filled) and `body` (all null) picks
 * the one with something in it.
 *
 * Returns null when none of the candidates are present. The caller is expected
 * to report that rather than carry on with a guess.
 */
export function pickColumn(rows: Row[], candidates: string[]): string | null {
  if (rows.length === 0) return null;
  const present = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) present.add(key);

  for (const name of candidates) {
    if (!present.has(name)) continue;
    const carriesText = rows.some((row) => {
      const value = row[name];
      return typeof value === "string" ? value.trim() !== "" : value != null;
    });
    if (carriesText) return name;
  }
  for (const name of candidates) if (present.has(name)) return name;
  return null;
}

export function columnNames(rows: Row[]): string[] {
  const present = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) present.add(key);
  return [...present].sort();
}

function compareForSort(a: unknown, b: unknown): number {
  const aNum = typeof a === "number" ? a : Number(a);
  const bNum = typeof b === "number" ? b : Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    if (aNum === bNum) return 0;
    return aNum < bNum ? -1 : 1;
  }
  const aStr = a == null ? "" : String(a);
  const bStr = b == null ? "" : String(b);
  if (aStr === bStr) return 0;
  return aStr < bStr ? -1 : 1;
}

/**
 * Sort rows by the first usable ordering column, leaving them in the order the
 * database returned them when there is no such column.
 *
 * Equal values compare as 0 so the sort stays stable and the original order
 * survives. Answering "these two are the same" with anything else is how a list
 * silently reshuffles itself.
 */
export function sortRows(rows: Row[], orderColumn: string | null): Row[] {
  if (!orderColumn) return [...rows];
  return [...rows].sort((a, b) => compareForSort(a[orderColumn], b[orderColumn]));
}

export interface ExtractOptions {
  /** Column names that might hold the wording, best guess first. */
  textCandidates: string[];
  /** Column names that might hold the display order, best guess first. */
  orderCandidates: string[];
  /** Column names that might hold a grouping value such as trading_open. */
  categoryCandidates?: string[];
  /** Which grouping value we want. Ignored when no category column exists. */
  categoryMatch?: RegExp;
  /** Column names that might mark a row as switched off. */
  activeCandidates?: string[];
}

export interface ExtractResult {
  /** The wording of each row, in display order, exactly as stored. */
  items: string[];
  /** What was found and what was skipped. For diagnosis, not for his screen. */
  notes: string[];
  /** Set when the wording could not be located at all. */
  problem: string | null;
}

/**
 * Turn database rows into an ordered list of lines.
 *
 * Every decision it makes is written into `notes`, including the ones that
 * worked. A report that shows only the failures cannot tell you whether the
 * right column was read on a clean run.
 */
export function extractList(rows: Row[], options: ExtractOptions): ExtractResult {
  const notes: string[] = [];

  if (rows.length === 0) {
    return {
      items: [],
      notes: ["The table was reachable and held no rows at all."],
      problem: "the table is empty",
    };
  }

  notes.push(`${rows.length} row(s) came back. Columns: ${columnNames(rows).join(", ")}.`);

  let working = rows;

  const categoryColumn = options.categoryCandidates
    ? pickColumn(rows, options.categoryCandidates)
    : null;
  if (options.categoryCandidates) {
    if (!categoryColumn) {
      notes.push(
        `No grouping column found (looked for ${options.categoryCandidates.join(", ")}), ` +
          `so all ${rows.length} row(s) are being used.`,
      );
    } else if (options.categoryMatch) {
      const kept = working.filter((row) => options.categoryMatch!.test(String(row[categoryColumn] ?? "")));
      if (kept.length === 0) {
        const seen = [...new Set(working.map((row) => String(row[categoryColumn] ?? "")))];
        notes.push(
          `Grouping column "${categoryColumn}" holds ${seen.join(", ")}, none of which matched ` +
            `${options.categoryMatch}. Falling back to all ${working.length} row(s).`,
        );
      } else {
        notes.push(
          `Grouping column "${categoryColumn}" kept ${kept.length} of ${working.length} row(s).`,
        );
        working = kept;
      }
    }
  }

  if (options.activeCandidates) {
    const activeColumn = pickColumn(rows, options.activeCandidates);
    if (activeColumn) {
      const kept = working.filter((row) => row[activeColumn] !== false);
      if (kept.length !== working.length) {
        notes.push(
          `Column "${activeColumn}" marked ${working.length - kept.length} row(s) as switched off.`,
        );
      }
      working = kept;
    }
  }

  const textColumn = pickColumn(working, options.textCandidates);
  if (!textColumn) {
    return {
      items: [],
      notes: [
        ...notes,
        `None of the expected wording columns were present. Looked for: ${options.textCandidates.join(", ")}.`,
      ],
      problem:
        `the wording column could not be found. The table has: ${columnNames(rows).join(", ")}`,
    };
  }
  notes.push(`Reading the wording from "${textColumn}".`);

  const orderColumn = pickColumn(working, options.orderCandidates);
  notes.push(
    orderColumn
      ? `Ordering by "${orderColumn}".`
      : `No ordering column found (looked for ${options.orderCandidates.join(", ")}), ` +
        `so the database's own order is kept.`,
  );

  const items = sortRows(working, orderColumn)
    .map((row) => (row[textColumn] == null ? "" : String(row[textColumn]).trim()))
    .filter((text) => text !== "");

  if (items.length !== working.length) {
    notes.push(`${working.length - items.length} row(s) had nothing written in "${textColumn}".`);
  }

  return {
    items,
    notes,
    problem: items.length === 0 ? `every row had an empty "${textColumn}"` : null,
  };
}

/** The date, in his own timezone, written out the long way. */
export function easternDateLine(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
}

/** When he wants it: 8:10 in the morning, his time, every day. */
export const BRIEF_HOUR = 8;
export const BRIEF_MINUTE = 10;

/**
 * How late a run may be and still count. The two scheduled moments are an hour
 * apart, so anything under an hour cannot let both of them through on one day.
 */
export const BRIEF_WINDOW_MINUTES = 50;

/**
 * What time is it where he is, counted in minutes since midnight.
 *
 * Midnight is reported as hour 24 by some systems rather than 0. That is a real
 * trap, not a hypothetical one, and it is handled here rather than left to
 * whichever system happens to run this.
 */
export function easternMinutesSinceMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const hour = value("hour") % 24;
  return hour * 60 + value("minute");
}

/**
 * Is this the moment to send?
 *
 * The schedule fires twice a day, at 12:10 and 13:10 UTC. One of those is 8:10
 * in New York and the other is not, and WHICH one swaps over when the clocks
 * change. So rather than ask him to edit a schedule twice a year and remember
 * to, both moments fire and this decides. Nothing to maintain, and it survives
 * any future change to when the clocks move.
 *
 * A skip is not a failure. It says so, in words, so a quiet morning can be told
 * apart from a broken one.
 */
export function dueNow(now: Date): { due: boolean; note: string } {
  const target = BRIEF_HOUR * 60 + BRIEF_MINUTE;
  const current = easternMinutesSinceMidnight(now);
  const clock = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  if (current >= target && current < target + BRIEF_WINDOW_MINUTES) {
    return { due: true, note: `It is ${clock(current)} in New York, which is the morning slot.` };
  }
  return {
    due: false,
    note: `It is ${clock(current)} in New York, not ${clock(target)}. This run was not the one. Nothing sent.`,
  };
}

export interface BriefParts {
  dateLine: string;
  rules: ExtractResult;
  checklist: ExtractResult;
}

/**
 * Build the message.
 *
 * Rules and checklist items are printed exactly as they are stored. They are
 * never reworded, reordered beyond their own ordering column, renumbered from
 * anything but their position, or "improved".
 *
 * A section that could not be read says which part refused and why, in place,
 * rather than quietly printing nothing. An empty section and an unreadable one
 * are different facts and must not share one answer.
 */
export function buildBriefMessage(parts: BriefParts): string {
  const lines: string[] = ["MORNING BRIEF", parts.dateLine, ""];

  lines.push("TRADING RULES");
  if (parts.rules.problem) {
    lines.push(`Could not read your rules: ${parts.rules.problem}.`);
  } else {
    parts.rules.items.forEach((text, index) => lines.push(`${index + 1}. ${text}`));
  }
  lines.push("");

  lines.push("OPEN CHECKLIST");
  if (parts.checklist.problem) {
    lines.push(`Could not read your checklist: ${parts.checklist.problem}.`);
  } else {
    for (const text of parts.checklist.items) lines.push(`[ ] ${text}`);
  }

  return lines.join("\n");
}

/** What gets sent when the brief could not be built at all. */
export function buildFailureMessage(dateLine: string, reason: string): string {
  return [
    "MORNING BRIEF",
    dateLine,
    "",
    "The brief could not be built this morning.",
    "",
    reason,
    "",
    "Nothing is wrong with your data as far as this can tell. Send this message",
    "to Claude and it will say which part refused.",
  ].join("\n");
}

/** Telegram rejects anything past 4096 characters, so say when it was cut. */
export function capForTelegram(text: string): string {
  if (text.length <= TELEGRAM_MAX_CHARS) return text;
  const notice = "\n\n[Cut short: too long for one Telegram message.]";
  return text.slice(0, TELEGRAM_MAX_CHARS - notice.length) + notice;
}

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
//   SUPABASE_SECRET_KEYS        Supabase fills this in for you. Newer projects
//   SUPABASE_SERVICE_ROLE_KEY   Supabase fills this in for you. Older projects
//   TELEGRAM_CHAT_ID            optional, only used if app_settings has no row


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
 * Does this look like a key that can actually read the tables?
 *
 * A publishable key is deliberately NOT accepted. Row Level Security is on with
 * no policies, so a publishable key is not refused, it is simply handed nothing
 * back. Every table would read as empty and the brief would confidently report
 * "the table is empty" about six rules that are sitting right there. A wrong
 * answer that looks like a real one is worse than a refusal.
 */
function looksLikeDatabaseKey(value: string): boolean {
  return value.startsWith("sb_secret_") || value.startsWith("eyJ");
}

/** Describe what arrived without ever repeating a value. */
function describeShape(value: unknown): string {
  if (Array.isArray(value)) return `a list of ${value.length} item(s)`;
  if (value !== null && typeof value === "object") {
    return `a group labelled: ${Object.keys(value as Record<string, unknown>).join(", ")}`;
  }
  return typeof value;
}

function firstDatabaseKeyIn(value: unknown): string | null {
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
function findDatabaseKey(): { key: string | null; note: string } {
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
  const now = new Date();
  const dateLine = easternDateLine(now);
  const params = new URL(request.url).searchParams;
  const dryRun = params.get("dry") === "1";

  // The schedule fires twice so that one of them is always 8:10 his time,
  // whatever the clocks are doing. This is where the other one bows out.
  // A call made by hand has no "scheduled" mark and always goes through.
  if (params.get("scheduled") === "1") {
    const due = dueNow(now);
    steps.push({ step: "is it time", ok: true, detail: due.note });
    if (!due.due) {
      return Response.json({ ok: true, sent: false, dateLine, steps });
    }
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const database = findDatabaseKey();
  const serviceKey = database.key ?? "";

  const missing = [
    token ? null : "TELEGRAM_BOT_TOKEN",
    supabaseUrl ? null : "SUPABASE_URL",
  ].filter((name): name is string => name !== null);

  if (missing.length > 0 || database.key === null) {
    const reasons: string[] = [];
    if (missing.length > 0) reasons.push(`These are not set: ${missing.join(", ")}.`);
    if (database.key === null) reasons.push(database.note);
    reasons.push("Nothing was sent.");
    steps.push({ step: "settings", ok: false, detail: reasons.join(" ") });
    return Response.json({ ok: false, sent: false, dateLine, steps }, { status: 500 });
  }
  steps.push({ step: "settings", ok: true, detail: `Bot token is present. ${database.note}` });

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
