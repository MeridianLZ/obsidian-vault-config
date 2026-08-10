#!/usr/bin/env bash
# Regenerates test-fixture/ (own git repo — powers temporal-angle smoke tests).
# Usage: ./make-fixture.sh [-f|--force]
set -euo pipefail
Usage() { echo "Usage: $0 [-f|--force]  # rebuild test-fixture vault"; exit 2; }
FORCE=0
while [ $# -gt 0 ]; do case "$1" in -f|--force) FORCE=1;; -h|--help) Usage;; *) Usage;; esac; shift; done
cd "$(dirname "$0")"
[ -d test-fixture ] && { [ "$FORCE" = 1 ] && rm -rf test-fixture || { echo "test-fixture exists (use --force)"; exit 0; }; }
mkdir -p test-fixture/{00-system/{schema,audit,bases,templates},01-inbox,10-notes,20-tasks,30-daily,40-sources/_assets,50-entities,90-archive}
cp ../bases/kanban-board.base test-fixture/00-system/bases/
cp ../00-vault-initial-state.md test-fixture/00-system/schema/
# unpack the canonical fixture corpus (fixture-payload.b64 lives next to this script)
base64 -d < fixture-payload.b64 | tar -xzf - -C test-fixture
cd test-fixture
git init -q
git add -A
git commit -qm "curator(create): initial fixture corpus [01J0000000000000000000WIRE]

proposer: test-harness
gate: schema=pass retrieval=pass graph=pass authority=pass compliance=pass"
echo "test-fixture ready: $(find . -name '*.md' | wc -l | tr -d ' ') markdown files"
