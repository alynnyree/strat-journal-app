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

import { parseThought } from "../_shared/thought.ts";
import { findDatabaseKey, insertRow, likePattern, readQuery, secretsMatch, type Row } from "../_shared/db.ts";

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
