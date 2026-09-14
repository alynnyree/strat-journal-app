#!/bin/sh
# Runs every check. Nothing here touches the internet, the database or Telegram.
set -e
cd "$(dirname "$0")/../.."
node --experimental-strip-types goal-app/tests/brief-format.test.ts
node --experimental-strip-types goal-app/tests/morning-brief.test.ts
node --experimental-strip-types goal-app/tests/morning-brief.test.ts goal-app/dist/morning-brief.single.ts
node goal-app/tools/build-single-file.mjs --check
echo "all checks passed"
