// GENERATED FILE. DO NOT EDIT THIS ONE.
//
// This is the real files for "app-api" joined together so it can be pasted
// into the Supabase website in one go. The originals are:
//
//   goal-app/supabase/functions/_shared/db.ts
//   goal-app/supabase/functions/_shared/thought.ts
//   goal-app/supabase/functions/app-api/index.ts
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

/**
 * Read rows with a query of your own, rather than the whole table.
 *
 * `readTable` above is frozen: it has to stay character for character identical
 * to the copy inside morning-brief, which is deployed and working, and
 * tests/no-drift.test.ts fails if it ever stops matching. So the general
 * version lives here beside it rather than replacing it. When morning-brief is
 * next changed for its own reasons, that copy goes and this becomes the only
 * one.
 *
 * `query` is everything after the question mark, for example
 * "select=*&order=created_at.desc&limit=50".
 *
 * A refusal comes back as readable words, never as a bare empty list. "Could
 * not reach it", "it answered with nothing" and "it refused me" are three
 * different faults and have to stay three different answers.
 */
export async function readQuery(
  baseUrl: string,
  serviceKey: string,
  table: string,
  query: string,
  wantTotal = false,
): Promise<TableRead & { total: number | null }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/rest/v1/${table}?${query}`;
  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
  };
  // Asking for the total is opt-in. It makes the database count the whole table
  // as well as hand back the page, so it is not free and is not always wanted.
  if (wantTotal) headers.Prefer = "count=exact";

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (cause) {
    return { rows: [], total: null, error: `could not reach the database at all (${String(cause)})` };
  }

  const body = await response.text();
  if (!response.ok) {
    return {
      rows: [],
      total: null,
      error: `the database refused to hand over "${table}" (status ${response.status}): ${body.slice(0, 400)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { rows: [], total: null, error: `"${table}" answered with something that was not readable data` };
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], total: null, error: `"${table}" answered with a single value where a list was expected` };
  }

  return { rows: parsed as Row[], total: totalFromRange(response.headers.get("content-range")), error: null };
}

/**
 * Pull the total out of the "0-24/317" the database sends back when asked to
 * count. An unknown total is null, never 0, because 0 is a real answer meaning
 * the table is empty and the two must never share one value.
 */
export function totalFromRange(range: string | null): number | null {
  if (range === null) return null;
  const after = range.split("/")[1] ?? "";
  if (!/^\d+$/.test(after)) return null;
  return Number(after);
}

/**
 * Turn what he typed into something safe to search for.
 *
 * The database reads "*" as "anything at all" and "," as the end of this
 * filter, so both would quietly change what he asked for. Everything that
 * carries a meaning is encoded, which leaves the search looking for exactly the
 * characters he typed. The stars on the outside are ours, and mean "anywhere in
 * the text".
 */
export function likePattern(term: string): string {
  const encoded = encodeURIComponent(term.trim())
    .replace(/\*/g, "%2A")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/'/g, "%27")
    .replace(/!/g, "%21");
  return `*${encoded}*`;
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

// app-api
//
// The one address the Home Screen app talks to. Everything the app ever needs
// from the database comes through here, so this gets pasted into Supabase ONCE
// and steps C, D and E after it are changes to the web page alone, which
// publish themselves.
//
// There is no AI call in this function and no outbound request to any AI
// service. It talks to exactly one place: his own Supabase database.
//
// Secrets it needs, all of which already exist:
//   BRIEF_TRIGGER_SECRET      the password the app holds. Deliberately the same
//                             one the 8:10 schedule uses, so there is no new
//                             secret to create, store or confuse with another
//   SUPABASE_URL              Supabase fills this in
//   SUPABASE_SECRET_KEYS      Supabase fills this in. Newer projects
//   SUPABASE_SERVICE_ROLE_KEY Supabase fills this in. Older projects
//
// Deploy with "Verify JWT" switched OFF. This project's keys are the new
// sb_secret_ format, which is not a JWT, so that check can never pass. The lock
// on this door is the password check below, which is ours.


/** One part of the work, whether it went well, and what it said. For me, not for him. */
interface Step {
  step: string;
  ok: boolean;
  detail: string;
}

/**
 * Which web pages are allowed to call this.
 *
 * A browser refuses to hand a page an answer from another address unless that
 * address says the page is welcome. Naming his page exactly, rather than
 * allowing everyone, means a page he did not build cannot quietly use his
 * password even if it somehow got hold of it.
 */
const ALWAYS_ALLOWED = ["https://alynnyree.github.io"];

function allowedOrigins(): string[] {
  const extra = (Deno.env.get("APP_ORIGIN") ?? "").trim();
  return extra === "" ? ALWAYS_ALLOWED : [...ALWAYS_ALLOWED, extra];
}

/**
 * The headers that tell the browser this page may read the answer.
 *
 * They go on EVERY answer, including refusals. An answer without them reaches
 * the page as a blank failure with no reason in it, which is the exact silence
 * this project keeps having to fix. A refusal he can read beats a refusal he
 * cannot.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type, x-app-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin !== null && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

interface AnswerBody {
  ok: boolean;
  action: string;
  /** Plain words, written to be shown to him. Never a raw message from the database. */
  message: string;
  /** The working, for me. The app keeps this behind a "Details" tap. */
  steps: Step[];
  data?: unknown;
}

function answer(status: number, body: AnswerBody, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Read a whole number out of what the page sent, falling back rather than failing. */
function whole(value: unknown, fallback: number, most: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), most);
}

// ----------------------------------------------------------------- the work

/** Prove the password works and the database answers. Reads nothing of substance. */
async function doPing(url: string, key: string, steps: Step[]): Promise<AnswerBody> {
  const read = await readQuery(url, key, "thoughts", "select=id&order=id.desc&limit=1", true);
  if (read.error !== null) {
    steps.push({ step: "the database", ok: false, detail: read.error });
    return {
      ok: false,
      action: "ping",
      message: "Your password was accepted, but the database did not answer. Nothing is wrong on this phone.",
      steps,
    };
  }
  steps.push({ step: "the database", ok: true, detail: `answered, total reported as ${read.total}` });
  const total = read.total;
  return {
    ok: true,
    action: "ping",
    message: total === null
      ? "Connected. The database answered."
      : `Connected. ${total} thought${total === 1 ? "" : "s"} saved so far.`,
    steps,
    data: { total },
  };
}

/**
 * Save one thought.
 *
 * Saved EXACTLY as typed, marks and all, the same as the bot does. A leading
 * "!" means private and hashtags at the front become tags, both read and then
 * left in the text, because stripping them cannot be undone later and keeping
 * them can.
 *
 * is_private is load bearing. No AI runs anywhere in this project today, and
 * when it is ever switched on the check for this flag goes in BEFORE the
 * outbound request, never after.
 */
async function doCapture(url: string, key: string, raw: unknown, steps: Step[]): Promise<AnswerBody> {
  const text = typeof raw === "string" ? raw : "";
  const parsed = parseThought(text);

  if (parsed.kind === "empty") {
    steps.push({ step: "reading it", ok: true, detail: "empty after trimming" });
    return { ok: false, action: "capture", message: "There was nothing in the box, so nothing was saved.", steps };
  }

  // The bot treats a leading "/" as an instruction and saves nothing. This app
  // has no instructions, so a slash here is just a slash. Saving it as written
  // is the only answer that cannot lose something he meant to keep.
  const tags = parsed.kind === "command" ? [] : parsed.tags;
  const isPrivate = parsed.kind === "command" ? false : parsed.isPrivate;

  steps.push({
    step: "reading it",
    ok: true,
    detail: `${text.trim().length} characters, ${tags.length} tag(s), private: ${isPrivate}`,
  });

  const stored = await insertRow(url, key, "thoughts", {
    body: parsed.body,
    tags,
    is_private: isPrivate,
    source: "webapp",
  });

  if (!stored.ok) {
    steps.push({ step: "saving", ok: false, detail: stored.error ?? "unknown" });
    // He must never be left thinking it saved when it did not.
    return {
      ok: false,
      action: "capture",
      message: "NOT saved. The database refused it. Your words are still in the box, so nothing is lost.",
      steps,
    };
  }

  steps.push({ step: "saving", ok: true, detail: "stored in thoughts" });

  const said = ["Saved."];
  if (isPrivate) said.push("Marked private.");
  if (tags.length > 0) said.push(`Tags: ${tags.join(", ")}.`);
  return { ok: true, action: "capture", message: said.join(" "), steps, data: { tags, isPrivate } };
}

/**
 * Hand back his thoughts, newest first.
 *
 * Newest by when it was SAVED, and every row carries that same date, because a
 * list ordered by one thing while showing another reads as broken. An explicit
 * order, always: a list with no order is not "in order", it is in whatever
 * order the rows happened to sit in.
 */
async function doThoughts(url: string, key: string, body: Record<string, unknown>, steps: Step[]): Promise<AnswerBody> {
  const limit = whole(body.limit, 50, 200);
  const search = typeof body.search === "string" ? body.search.trim() : "";

  let query = `select=id,body,tags,is_private,source,created_at&order=created_at.desc,id.desc&limit=${limit}`;
  if (search !== "") query += `&body=ilike.${likePattern(search)}`;

  const read = await readQuery(url, key, "thoughts", query, true);
  if (read.error !== null) {
    steps.push({ step: "the database", ok: false, detail: read.error });
    return { ok: false, action: "thoughts", message: "The database did not answer, so there is nothing to show yet.", steps };
  }

  steps.push({ step: "the database", ok: true, detail: `${read.rows.length} row(s) back, total ${read.total}` });
  return {
    ok: true,
    action: "thoughts",
    message: search === ""
      ? `${read.rows.length} shown${read.total === null ? "" : ` of ${read.total}`}.`
      : `${read.rows.length} match${read.rows.length === 1 ? "" : "es"} for "${search}".`,
    steps,
    data: { rows: read.rows, total: read.total, search, limit },
  };
}

/**
 * Everything the Goals and Today screens need, in one round trip.
 *
 * Each table is read separately and each carries its own outcome. One table
 * refusing must not read as all four being empty: "it answered with nothing"
 * and "it refused me" are different faults with different fixes, and a screen
 * that folds them together sends him looking for the wrong thing.
 */
async function doPlan(url: string, key: string, steps: Step[]): Promise<AnswerBody> {
  const wanted: Array<{ name: string; table: string; query: string }> = [
    { name: "goals", table: "goals", query: "select=*&order=is_ultimate.desc,sort_order.asc,id.asc" },
    { name: "projects", table: "projects", query: "select=*&order=sort_order.asc,id.asc" },
    { name: "roadmap", table: "roadmap_steps", query: "select=*&order=project_id.asc,sort_order.asc" },
    { name: "tasks", table: "tasks", query: "select=*&status=eq.open&order=due_on.asc.nullslast,id.asc&limit=200" },
  ];

  const data: Record<string, { rows: Row[]; error: string | null }> = {};
  let refused = 0;

  for (const item of wanted) {
    const read = await readQuery(url, key, item.table, item.query);
    data[item.name] = { rows: read.rows, error: read.error };
    if (read.error !== null) refused += 1;
    steps.push({
      step: item.name,
      ok: read.error === null,
      detail: read.error ?? `${read.rows.length} row(s)`,
    });
  }

  const counts = wanted.map((i) => `${i.name} ${data[i.name].rows.length}`).join(", ");
  return {
    ok: refused === 0,
    action: "plan",
    message: refused === 0
      ? `Read: ${counts}.`
      : `${refused} of the 4 lists could not be read. What did come back is shown; what did not is named rather than left blank.`,
    steps,
    data,
  };
}

// --------------------------------------------------------------- the door

async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);

  // The browser asks permission before it sends the real request. Answering
  // this is not optional: without it the real request never leaves the phone.
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (request.method !== "POST") {
    return answer(405, {
      ok: false,
      action: "unknown",
      message: "That is not how this is called.",
      steps: [{ step: "the request", ok: false, detail: `method ${request.method}, only POST is handled` }],
    }, cors);
  }

  // ---------------------------------------------------------- who is calling
  //
  // Nothing above this line reaches the database.
  const expected = Deno.env.get("BRIEF_TRIGGER_SECRET") ?? "";
  const offered = request.headers.get("x-app-key") ?? "";
  if (!secretsMatch(expected, offered)) {
    return answer(401, {
      ok: false,
      action: "unknown",
      message: offered === ""
        ? "No password was sent. Open Settings and save yours."
        : "That password was not right. Open Settings and check it, character for character.",
      steps: [{
        step: "who is calling",
        ok: false,
        detail: expected === ""
          ? "BRIEF_TRIGGER_SECRET is not set on this function, so nobody is allowed in. Nothing was read or saved."
          : `the x-app-key header was ${offered === "" ? "missing" : "wrong"}. Nothing was read or saved.`,
      }],
    }, cors);
  }

  const steps: Step[] = [{ step: "who is calling", ok: true, detail: "the password matched" }];

  // ------------------------------------------------------------ what to do
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    steps.push({ step: "the request", ok: false, detail: "the body was not readable data" });
    return answer(400, { ok: false, action: "unknown", message: "The app sent something unreadable.", steps }, cors);
  }

  const action = typeof body.action === "string" ? body.action : "";

  // --------------------------------------------------------------- his keys
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const database = findDatabaseKey();
  if (supabaseUrl === "" || database.key === null) {
    steps.push({
      step: "settings",
      ok: false,
      detail: `${supabaseUrl === "" ? "SUPABASE_URL is not set. " : ""}${database.key === null ? database.note : ""}`.trim(),
    });
    return answer(200, {
      ok: false,
      action,
      message: "This part is not set up correctly on the server side. Nothing on this phone is wrong.",
      steps,
    }, cors);
  }
  steps.push({ step: "settings", ok: true, detail: database.note });

  let result: AnswerBody;
  switch (action) {
    case "ping":
      result = await doPing(supabaseUrl, database.key, steps);
      break;
    case "capture":
      result = await doCapture(supabaseUrl, database.key, body.text, steps);
      break;
    case "thoughts":
      result = await doThoughts(supabaseUrl, database.key, body, steps);
      break;
    case "plan":
      result = await doPlan(supabaseUrl, database.key, steps);
      break;
    default:
      steps.push({ step: "the request", ok: false, detail: `no such action: "${action}"` });
      result = {
        ok: false,
        action: action === "" ? "unknown" : action,
        message: "This app asked for something this server does not do. The app is newer than the server.",
        steps,
      };
  }

  // Always 200 once the password matched. What went wrong is in the answer, in
  // words, where the app can show it. A page handed a bare failure code has
  // nothing to show him but "something went wrong", which is the same dead end
  // as a counter that will not move.
  return answer(200, result, cors);
}

Deno.serve(handler);
