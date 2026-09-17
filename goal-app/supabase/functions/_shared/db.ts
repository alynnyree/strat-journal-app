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
