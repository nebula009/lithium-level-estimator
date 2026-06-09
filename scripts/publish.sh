#!/usr/bin/env bash
set -euo pipefail

message="${1:-Update lithium calculator}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This folder is not a Git repository yet. Run: git init && git branch -M main"
  exit 1
fi

npm run check

git add index.html styles.css app.js robots.txt 404.html CNAME package.json README.md .github/workflows/deploy.yml scripts/publish.sh

if git diff --cached --quiet; then
  echo "No changes to publish."
else
  git commit -m "$message"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git push origin main
else
  echo "No GitHub remote is connected yet."
  echo "After creating the GitHub repository, run:"
  echo "  git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git"
  echo "  git push -u origin main"
  exit 1
fi
