#!/bin/sh
# Runs every check. Nothing here touches the internet, the database or Telegram.
set -e
cd "$(dirname "$0")/../.."
R="node --experimental-strip-types"

$R goal-app/tests/brief-format.test.ts
$R goal-app/tests/thought-parsing.test.ts
$R goal-app/tests/no-drift.test.ts

# Each function is checked twice: the real files, and the combined file he
# actually pastes into Supabase. Same checks, both versions, so the two cannot
# pass separately while disagreeing with each other.
$R goal-app/tests/morning-brief.test.ts
$R goal-app/tests/morning-brief.test.ts goal-app/dist/morning-brief.single.ts
$R goal-app/tests/telegram-webhook.test.ts
$R goal-app/tests/telegram-webhook.test.ts goal-app/dist/telegram-webhook.single.ts
$R goal-app/tests/app-api.test.ts
$R goal-app/tests/app-api.test.ts goal-app/dist/app-api.single.ts

node goal-app/tools/build-single-file.mjs --check
echo "all checks passed"
