#!/usr/bin/env bash
# Staging release script for @alva-ai/toolkit
#
# Publishes a beta build to npm under the `next` dist-tag (NOT `latest`),
# so default installs are unaffected. Internal consumers opt in with:
#
#   npm install @alva-ai/toolkit@next
#
# Usage:
#   ./scripts/release-stg.sh                 # continue current beta series: 0.6.1-beta.3 -> 0.6.1-beta.4
#   ./scripts/release-stg.sh prepatch        # start new beta off next patch: 0.6.0 -> 0.6.1-beta.0
#   ./scripts/release-stg.sh preminor        # start new beta off next minor: 0.6.0 -> 0.7.0-beta.0
#   ./scripts/release-stg.sh premajor        # start new beta off next major: 0.6.0 -> 1.0.0-beta.0
#
# Behavior (differs from scripts/release.sh):
#   - Does NOT commit to main or push code. Main's package.json is untouched.
#   - Creates a git tag (e.g. v0.6.1-beta.3) on the current commit and pushes it.
#   - Restores package.json/package-lock.json after publish.
#   - Allows any branch (so feature branches can publish a beta for early testing).
#
# Prerequisites:
#   - npm login (run `npm login` once)
#   - Push access to the GitHub repo
#   - Clean working tree

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[release-stg]${NC} $*"; }
warn()  { echo -e "${YELLOW}[release-stg]${NC} $*"; }
error() { echo -e "${RED}[release-stg]${NC} $*" >&2; exit 1; }

PKG_NAME="@alva-ai/toolkit"
DIST_TAG="next"

# --- Arg check ----------------------------------------------------------------

BUMP="${1:-prerelease}"
case "$BUMP" in
  prerelease|prepatch|preminor|premajor) ;;
  *) echo "Usage: $0 [prerelease|prepatch|preminor|premajor]"; exit 1 ;;
esac

# --- Pre-flight checks --------------------------------------------------------

info "Running pre-flight checks..."

if [[ -n "$(git status --porcelain)" ]]; then
  error "Working tree is not clean. Commit or stash changes first."
fi

if ! npm whoami &>/dev/null; then
  error "Not logged in to npm. Run: npm login"
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
info "Branch: $BRANCH"

CURRENT_VERSION=$(node -p "require('./package.json').version")
info "Current package.json version: $CURRENT_VERSION"

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

# --- Restore on exit ----------------------------------------------------------
# Ensure package.json/package-lock.json are restored even if publish fails.

cleanup() {
  if [[ -n "$(git diff --name-only -- package.json package-lock.json 2>/dev/null)" ]]; then
    info "Restoring package.json / package-lock.json..."
    git checkout -- package.json package-lock.json
  fi
}
trap cleanup EXIT

# --- Compute target version ---------------------------------------------------

if [[ "$BUMP" == "prerelease" ]]; then
  info "Fetching dist-tags from npm..."
  LATEST_BETA=$(npm view "${PKG_NAME}@${DIST_TAG}" version 2>/dev/null || true)
  LATEST_STABLE=$(npm view "${PKG_NAME}@latest" version 2>/dev/null || true)
  if [[ -z "$LATEST_BETA" ]]; then
    error "No existing ${DIST_TAG} version found on npm. Start a series with 'prepatch', 'preminor', or 'premajor'."
  fi
  info "Last published ${DIST_TAG}:   ${LATEST_BETA}"
  info "Last published latest: ${LATEST_STABLE:-<none>}"

  # Detect stale next: if a prd release has caught up to or passed the beta base,
  # incrementing the beta number would publish a version older than latest stable.
  if [[ -n "$LATEST_STABLE" ]]; then
    LATEST_BETA_BASE="${LATEST_BETA%%-*}"
    HIGHEST=$(printf "%s\n%s\n" "$LATEST_BETA_BASE" "$LATEST_STABLE" | sort -V | tail -1)
    if [[ "$LATEST_BETA_BASE" == "$LATEST_STABLE" || "$HIGHEST" != "$LATEST_BETA_BASE" ]]; then
      error "Stale ${DIST_TAG}: beta base ${LATEST_BETA_BASE} is not ahead of latest ${LATEST_STABLE}. Start a new series with 'prepatch', 'preminor', or 'premajor'."
    fi
  fi

  # Seed package.json to the latest beta, then bump prerelease number.
  npm version "$LATEST_BETA" --allow-same-version --no-git-tag-version >/dev/null
  NEW_VERSION=$(npm version prerelease --preid=beta --no-git-tag-version)
else
  # prepatch / preminor / premajor: start a fresh beta off the current stable.
  NEW_VERSION=$(npm version "$BUMP" --preid=beta --no-git-tag-version)
fi

# npm version output starts with "v"
NEW_VERSION="${NEW_VERSION#v}"
TAG="v${NEW_VERSION}"

info "New beta version: ${NEW_VERSION}"

# Sanity: make sure this version isn't already published.
if npm view "${PKG_NAME}@${NEW_VERSION}" version &>/dev/null; then
  error "Version ${NEW_VERSION} is already published to npm. Aborting."
fi

# --- Rebuild with new version baked in ----------------------------------------

info "Rebuilding with new version..."
npm run build

# --- Tag ----------------------------------------------------------------------

if git rev-parse "$TAG" &>/dev/null; then
  error "Git tag ${TAG} already exists locally. Delete it or pick a different version."
fi

# --- Publish ------------------------------------------------------------------
# Publish before tagging: easier to recover from a failed publish (no stray tag).

info "Publishing to npm with --tag ${DIST_TAG}..."
npm publish --tag "$DIST_TAG" --access public

# --- Tag ----------------------------------------------------------------------

info "Creating git tag ${TAG}..."
git tag -a "$TAG" -m "$TAG (staging)"

info "Pushing tag ${TAG} to origin..."
git push origin "$TAG"

info "Done! Published ${NEW_VERSION} to npm (dist-tag: ${DIST_TAG})."
info "  npm:     https://www.npmjs.com/package/${PKG_NAME}/v/${NEW_VERSION}"
info "  install: npm install ${PKG_NAME}@${DIST_TAG}"
info "  tag:     https://github.com/alva-ai/toolkit-ts/releases/tag/${TAG}"
