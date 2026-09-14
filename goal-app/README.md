# Goal Execution App

Private. One database talking to one chat app. No AI anywhere in it.

**The step by step plan for the whole project is `docs/build-steps.html`.** Open
that file in a browser. It says which of the six steps we are on, what each one
does, and the test you run yourself to confirm it worked. This README only
covers the step 1 files.

## Where things are

```
goal-app/
  supabase/functions/_shared/brief.ts        the wording and the layout of the message
  supabase/functions/morning-brief/index.ts  the piece that runs: reads, formats, sends
  sql/check-schema.sql                       a read-only query that prints your column names
  tests/brief-format.test.ts                 checks the message, no internet needed
  tests/morning-brief.test.ts                runs the whole thing with fake answers standing in
  dist/morning-brief.single.ts               GENERATED. The one file you paste into Supabase
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

## Secrets

`TELEGRAM_BOT_TOKEN` is the only secret you set by hand. Supabase fills in
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on its own.

Nothing secret is ever written into a file here, and nothing secret comes back
out in the function's answer. There is a check for that too.
