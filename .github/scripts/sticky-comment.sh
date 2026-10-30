#!/usr/bin/env bash
# Creates or updates one PR comment identified by a hidden marker, so several workflows can each
# keep their own comment: sticky-comment.sh <marker> <body-file>
# Needs GH_TOKEN, GITHUB_REPOSITORY and PR_NUMBER.
set -euo pipefail
marker="<!-- $1 -->"
body="$(mktemp)"; { echo "$marker"; cat "$2"; } > "$body"
id=$(gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" --paginate --jq ".[] | select(.body | startswith(\"$marker\")) | .id" | head -n1)
if [ -n "$id" ]; then gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -F "body=@$body" > /dev/null; echo "updated comment $id"
else gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" -F "body=@$body" > /dev/null; echo "created comment"; fi
