#!/usr/bin/env bash
# Release script for @alva-ai/toolkit
#
# Usage:
#   ./scripts/release.sh patch    # 0.1.1 -> 0.1.2
#   ./scripts/release.sh minor    # 0.1.1 -> 0.2.0
#   ./scripts/release.sh major    # 0.1.1 -> 1.0.0
#
# What it does:
#   1. Verifies clean working tree and an approved release source:
#      - main at origin/main, or
#      - hotfix/* / release/* forked from the current npm latest git tag
#   2. Runs full quality gate (lint, format, typecheck, test, build)
#   3. Bumps version, commits, and creates a git tag
#   4. Pushes commit + tag to origin
#   5. Publishes to npm with public access
#
# Prerequisites:
#   - npm login (run `npm login` once to authenticate)
#   - Push access to the GitHub repo
#   - On an approved release source with no uncommitted changes

set -euo pipefail

PKG_NAME="@alva-ai/toolkit"

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

BRANCH=$(git rev-parse --abbrev-ref HEAD)
case "$BRANCH" in
  main|hotfix/*|release/*) ;;
  *)
    error "Production releases must run from main, hotfix/*, or release/* (currently on $BRANCH)"
    ;;
esac

# Clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  error "Working tree is not clean. Commit or stash changes first."
fi

# Up-to-date refs and tags are part of the release-source proof.
git fetch origin --tags --quiet

# npm auth check
if ! npm whoami &>/dev/null; then
  error "Not logged in to npm. Run: npm login"
fi

if [[ "$BRANCH" == "main" ]]; then
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)
  if [[ "$LOCAL" != "$REMOTE" ]]; then
    error "Local main is not up to date with origin/main. Run: git pull origin main"
  fi
else
  if [[ "$BUMP" != "patch" ]]; then
    error "Hotfix/release branch production releases may only use patch bumps. Merge to main for minor/major releases."
  fi

  LATEST_VERSION=$(npm view "${PKG_NAME}@latest" version 2>/dev/null || true)
  if [[ -z "$LATEST_VERSION" ]]; then
    error "Could not resolve ${PKG_NAME}@latest from npm."
  fi

  LATEST_TAG="v${LATEST_VERSION#v}"
  if ! git rev-parse -q --verify "refs/tags/${LATEST_TAG}" >/dev/null; then
    error "Git tag ${LATEST_TAG} for ${PKG_NAME}@latest was not found after fetching tags."
  fi

  LATEST_TAG_COMMIT=$(git rev-list -n 1 "$LATEST_TAG")
  MAIN_MERGE_BASE=$(git merge-base HEAD origin/main)
  if [[ "$MAIN_MERGE_BASE" != "$LATEST_TAG_COMMIT" ]]; then
    error "${BRANCH} contains origin/main. Use main for normal releases, or create the hotfix from: git checkout -b ${BRANCH} ${LATEST_TAG}"
  fi

  if ! git merge-base --is-ancestor "$LATEST_TAG" HEAD; then
    error "${BRANCH} must contain current npm latest tag ${LATEST_TAG}."
  fi

  info "Hotfix release source verified against ${PKG_NAME}@latest (${LATEST_TAG})."
  warn "After publishing, merge this hotfix/release branch back to main."
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
git push origin "$BRANCH"
git push origin "$NEW_VERSION"

# --- Publish ------------------------------------------------------------------

info "Publishing to npm..."
npm publish --access public

info "Done! Published ${NEW_VERSION} to npm."
info "  npm: https://www.npmjs.com/package/@alva-ai/toolkit"
info "  tag: https://github.com/alva-ai/toolkit-ts/releases/tag/${NEW_VERSION}"
