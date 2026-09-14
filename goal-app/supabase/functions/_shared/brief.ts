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
