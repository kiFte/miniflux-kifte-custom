#!/usr/bin/env bash
# inject.sh — Apply per-user CSS/JS customization to a Miniflux account.
#
# Miniflux has NO global CUSTOM_CSS / CUSTOM_JS env var. Customization is
# per-user, stored in `users.stylesheet` / `users.custom_js` DB columns,
# applied via the API: PUT /v1/users/<id> with JSON body
# {"stylesheet": "..."} or {"custom_js": "..."}.
#
# Usage:
#   MF_URL=http://localhost:8080 \
#   MF_USER=you@example.com \
#   MF_PASS=your_password \
#   MF_USER_ID=1 \
#   ./inject.sh <command> [file]
#
# Commands:
#   css <file>                   Inject stylesheet (file path, or "-" for stdin)
#   js  <file>                   Inject custom_js   (file path, or "-" for stdin)
#   reset-css                    Clear stylesheet
#   reset-js                     Clear custom_js
#   entry-direction <asc|desc>   Set server-side entry sort direction
#                                (entry_sorting_direction). One-off; use once
#                                with "desc" so /unread pagination also defaults
#                                to newest-first, matching the client-side toggle.
#
# Examples:
#   ./inject.sh css combined/latte+grouping.css
#   ./inject.sh js js/group_list.js
#   ./inject.sh entry-direction desc
#   cat my.css | ./inject.sh css -
#   ./inject.sh reset-js
#
# Exit codes: 0 success, 1 usage/IO error, 2 missing env, 3 API non-2xx.
set -uo pipefail

usage() { sed -n '2,/^# Exit codes:/p' "$0"; exit 1; }

[ $# -ge 1 ] || usage
cmd="$1"

: "${MF_URL:?required (e.g. http://localhost:8080)}"
: "${MF_USER:?required}"
: "${MF_PASS:?required}"
: "${MF_USER_ID:?required (numeric user id, e.g. 1)}"

AUTH="$MF_USER:$MF_PASS"
ENDPOINT="$MF_URL/v1/users/$MF_USER_ID"
TMP=/tmp/inject_resp.txt

# build_body <field> -- reads value text from stdin, prints JSON body
build_body() {
  local field="$1"
  python3 -c "
import json, sys
print(json.dumps({'$field': sys.stdin.read()}))
"
}

# put_body <body>
put_body() {
  local body="$1" code
  code=$(curl -sS -o "$TMP" -w '%{http_code}' \
    -u "$AUTH" -X PUT \
    -H 'Content-Type: application/json' \
    --data "$body" "$ENDPOINT")
  echo "PUT $ENDPOINT -> HTTP $code"
  if [ "$code" != "200" ] && [ "$code" != "201" ]; then
    echo "RESPONSE:" >&2; cat "$TMP" >&2; exit 3
  fi
}

case "$cmd" in
  css|js)
    [ $# -ge 2 ] || { echo "$cmd: missing file argument"; usage; }
    field=$([ "$cmd" = css ] && echo stylesheet || echo custom_js)
    if [ "$2" = "-" ]; then
      body=$(build_body "$field")
    else
      [ -r "$2" ] || { echo "$cmd: cannot read $2"; exit 1; }
      body=$(python3 -c "import json; print(json.dumps({'$field': open('$2', encoding='utf-8').read()}))")
    fi
    put_body "$body"
    ;;
  reset-css) put_body '{"stylesheet": ""}' ;;
  reset-js)  put_body '{"custom_js": ""}'  ;;
  entry-direction)
    [ $# -ge 2 ] || { echo "entry-direction: missing asc|desc argument"; usage; }
    case "$2" in
      asc|desc) ;;
      *) echo "entry-direction: invalid value '$2' (expected asc or desc)"; exit 1 ;;
    esac
    body=$(python3 -c "import json; print(json.dumps({'entry_sorting_direction': '$2'}))")
    put_body "$body"
    ;;
  *) echo "unknown command: $cmd"; usage ;;
esac
