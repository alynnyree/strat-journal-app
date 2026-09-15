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
