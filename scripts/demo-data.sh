#!/usr/bin/env bash
# Clone the demo repos at fixed commits and extract them into web/public/data.
# The committed JSON came from these exact commits, so this run reproduces it.
set -euo pipefail
cd "$(dirname "$0")/.."

# name  owner/repo  commit
DEMOS=(
  "zod  colinhacks/zod         77e72ec2"
  "htmx bigskysoftware/htmx    fa978b24"
)

mkdir -p .demo-repos
for row in "${DEMOS[@]}"; do
  read -r name slug commit <<<"$row"
  dir=".demo-repos/$name"
  if [ ! -d "$dir/.git" ]; then
    git clone --quiet --filter=blob:none "https://github.com/$slug.git" "$dir"
  fi
  git -C "$dir" fetch --quiet origin
  git -C "$dir" checkout --quiet --detach "$commit"
  npx tsx cli/src/index.ts "$dir" -o "web/public/data/$name.json" --name "$slug"
done
