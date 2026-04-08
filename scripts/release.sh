#!/usr/bin/env bash
# Release script for @alva-ai/toolkit
#
# Usage:
#   ./scripts/release.sh patch    # 0.1.1 -> 0.1.2
#   ./scripts/release.sh minor    # 0.1.1 -> 0.2.0
#   ./scripts/release.sh major    # 0.1.1 -> 1.0.0
#
# What it does:
#   1. Verifies clean working tree and up-to-date main branch
#   2. Runs full quality gate (lint, format, typecheck, test, build)
#   3. Bumps version via npm version (creates git tag)
#   4. Pushes commit + tag to origin
#   5. Publishes to npm with public access
#
# Prerequisites:
#   - npm login (run `npm login` once to authenticate)
#   - Push access to the GitHub repo
#   - On the main branch with no uncommitted changes

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[release]${NC} $*"; }
warn()  { echo -e "${YELLOW}[release]${NC} $*"; }
error() { echo -e "${RED}[release]${NC} $*" >&2; exit 1; }

# --- Arg check ----------------------------------------------------------------

BUMP="${1:-}"
if [[ ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 <patch|minor|major>"
  exit 1
fi

# --- Pre-flight checks --------------------------------------------------------

info "Running pre-flight checks..."

# Must be on main
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  error "Must be on main branch (currently on $BRANCH)"
fi

# Clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  error "Working tree is not clean. Commit or stash changes first."
fi

# Up to date with remote
git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [[ "$LOCAL" != "$REMOTE" ]]; then
  error "Local main is not up to date with origin/main. Run: git pull origin main"
fi

# npm auth check
if ! npm whoami &>/dev/null; then
  error "Not logged in to npm. Run: npm login"
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
info "Current version: $CURRENT_VERSION"

# --- Quality gate -------------------------------------------------------------

info "Running quality gate..."

info "  Lint..."
npm run lint

info "  Format check..."
npm run format:check

info "  Type check..."
npm run typecheck

info "  Tests..."
npm test

info "  Build..."
npm run build

info "Quality gate passed."

# --- Version bump + tag -------------------------------------------------------

info "Bumping $BUMP version..."
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version)
info "New version: $NEW_VERSION"

# Rebuild so the new version is baked into dist/ via tsup define
info "Rebuilding with new version..."
npm run build

# Commit and tag
git add package.json package-lock.json
git commit -m "$NEW_VERSION"
git tag "$NEW_VERSION"

# --- Push ---------------------------------------------------------------------

info "Pushing to origin..."
git push origin main
git push origin "$NEW_VERSION"

# --- Publish ------------------------------------------------------------------

info "Publishing to npm..."
npm publish --access public

info "Done! Published ${NEW_VERSION} to npm."
info "  npm: https://www.npmjs.com/package/@alva-ai/toolkit"
info "  tag: https://github.com/alva-ai/toolkit-ts/releases/tag/${NEW_VERSION}"
