#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Schema changes require an explicit reviewed deployment after a database backup.
printf '%s\n' 'Dependencies installed. Review docs/atlas-phase6-6h-release-readiness.md before applying database schema changes.'
