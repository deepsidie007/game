#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
npm install --no-audit --no-fund
npx --yes --package=wrangler@latest wrangler login --device
npx --yes --package=wrangler@latest wrangler deploy
