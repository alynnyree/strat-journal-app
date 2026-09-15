# Goal Execution App

Private. One database talking to one chat app. No AI anywhere in it.

**The step by step plan for the whole project is `docs/build-steps.html`.** Open
that file in a browser. It says which of the six steps we are on, what each one
does, and the test you run yourself to confirm it worked. This README only
covers the step 1 files.

## Where things are

```
goal-app/
  supabase/functions/_shared/brief.ts        the wording and layout of the morning message
  supabase/functions/_shared/thought.ts      reading a message he sends the bot
  supabase/functions/_shared/db.ts           talking to the database, proving who is calling
  supabase/functions/morning-brief/index.ts  sends the brief: reads, formats, sends
  supabase/functions/telegram-webhook/index.ts  catches what he sends the bot and saves it
  sql/check-schema.sql                       a read-only query that prints your column names
  tests/brief-format.test.ts                 checks the message, no internet needed
  tests/morning-brief.test.ts                runs the whole thing with fake answers standing in
  dist/morning-brief.single.ts               GENERATED. Paste this into Supabase
  dist/telegram-webhook.single.ts            GENERATED. Paste this into Supabase
  tools/build-single-file.mjs                makes that file from the two above it
  tools/check-all.sh                         runs every check in one go
  .env.example                               a template. Copy to .env. Never commit .env
```

Never edit `dist/morning-brief.single.ts` by hand. Edit the two real files and
run `node goal-app/tools/build-single-file.mjs` again. `--check` on that same
command fails if the combined file has gone stale, and `tools/check-all.sh`
runs it, so a stale paste cannot slip through unnoticed.

A "function" here means one small program that Supabase runs for you when
something asks it to. It is not running all the time and there is no server of
yours to keep alive.

## What the morning brief does

1. Looks up your Telegram chat id in the `app_settings` table.
2. Reads every row of `trading_rules`.
3. Reads every row of `protocol_items` and keeps the ones marked `trading_open`.
4. Puts them into one message.
5. Sends that one message to Telegram.

Your rules and checklist items are printed exactly as they are stored. They are
never reworded, reordered or tidied up.

## What it does NOT do

It does not contact Gemini, OpenAI, Anthropic or any other AI service. There is
a check in `tests/morning-brief.test.ts` that fails if any code path ever tries.

## Running the checks

You need nothing installed beyond Node, which your Mac may already have. From
the folder above this one:

```
sh goal-app/tools/check-all.sh
```

That runs 29 checks twice over: once against the two real files, and once
against the combined file you actually paste into Supabase. Same checks, both
versions, so the two cannot pass separately while disagreeing with each other.

Both print a list of ticks and a count at the end. Neither touches the internet,
your database, or Telegram.

## If the brief does not arrive

The function answers with a list of steps and says which one refused and what it
said. Ask for the answer as a "dry run" to see the message without sending it:

```
.../morning-brief?dry=1
```

A dry run builds the message and sends nothing.

## Two locks, because two different callers

`morning-brief` is set off by the schedule, which can send whatever header we
tell it to. So it carries `x-trigger-key` and is checked against
`BRIEF_TRIGGER_SECRET`.

`telegram-webhook` is called by TELEGRAM, which will not send our header. So it
uses Telegram's own mechanism instead: a secret handed over when the webhook is
registered, which Telegram returns on every request in the header
`X-Telegram-Bot-Api-Secret-Token`. Checked against Telegram's own documentation
(1-256 characters, only A-Z a-z 0-9 _ and -), not assumed.

Both compare with `secretsMatch`, which reads every character even after it
knows the answer and treats an unset secret as matching nothing.

Three more rules the webhook obeys, each with a check that fails if it stops:

- **A stranger's message is never saved and never replied to.** Anyone who
  finds the bot can message it. The chat is compared against the one in
  `app_settings`, and anything else is dropped silently, because a reply tells
  a stranger the bot is listening.
- **The answer is ALWAYS 200 once Telegram has proved itself**, even when
  something failed inside. Telegram repeats anything that is not 2xx and
  eventually switches the webhook off. What went wrong is reported to him in
  the reply message instead, where he will see it.
- **A failed save says "NOT saved"** with the database's own words. Silence
  there would let him believe a thought had landed when it had not.

## The duplicated database code

`readTable` and the key finding live in BOTH `morning-brief/index.ts` and
`_shared/db.ts`. That is deliberate: morning-brief is deployed and working, and
re-pasting it would cost him a deploy for no benefit.

`tests/no-drift.test.ts` reads both files and fails if those functions stop
matching character for character. When morning-brief next changes for its own
reasons, it switches to importing them and both the copy and that test go away.

## Calling it, and why the door is locked the way it is

Supabase has its own check on the front of an Edge Function ("verify JWT").
**It is switched OFF for this function, deliberately.** That check only
understands the old style of Supabase key. This project uses the new style
(`sb_publishable_...`), which is not a JWT, so the check refuses it. Confirmed
against Supabase's own documentation and a Supabase collaborator's answer, not
guessed: with the new keys, `--no-verify-jwt` is required and the function has
to authorise the caller itself.

So the lock is ours: `callerIsAllowed` in `index.ts`. The caller sends an
`x-trigger-key` header and it has to match the `BRIEF_TRIGGER_SECRET` secret.

This is tighter than what it replaces, not looser. A publishable key is meant
to be public and would sit in any client app. `BRIEF_TRIGGER_SECRET` is known
only to this function and to whatever is allowed to set it off.

Three rules the lock obeys, each with a check that fails if it stops obeying:

- It runs **before** anything is read. A caller who cannot prove who they are
  never causes one row to be looked at. The test counts outbound calls and
  fails if the number is anything but zero.
- **No secret set means nobody gets in.** A lock that falls open when its key
  is missing is not a lock.
- The comparison reads every character even once it knows the answer, so how
  long it takes says nothing about how much of the secret was right.

To call it:

```
curl -s -X POST "https://YOUR-PROJECT.supabase.co/functions/v1/morning-brief?dry=1" \
  -H "x-trigger-key: YOUR-BRIEF-TRIGGER-SECRET"
```

No Supabase key is needed or wanted in that request.

## Secrets

`TELEGRAM_BOT_TOKEN` and `BRIEF_TRIGGER_SECRET` are the two secrets you set by
hand. **Secret names are case sensitive.** `Brief_Trigger_Secret` is a different
name from `BRIEF_TRIGGER_SECRET` and will not be found.

The key that reads the database is found by `findDatabaseKey`, because projects
differ. Older ones are given `SUPABASE_SERVICE_ROLE_KEY`, a single key. Newer
ones are given `SUPABASE_SECRET_KEYS`, a bundle. Rather than guess the bundle's
shape it is searched, and when nothing is found the failure names the shape and
never a value.

A **publishable key is deliberately refused** even when one is sitting there.
Row Level Security is on with no policies, so a publishable key is not turned
away, it is simply handed nothing. Every table would read as empty and the
brief would report "the table is empty" about six rules that are plainly there.
A wrong answer wearing the clothes of a real one is worse than a refusal. Supabase fills in
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on its own.

Nothing secret is ever written into a file here, and nothing secret comes back
out in the function's answer. There is a check for that too.
