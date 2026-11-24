#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
# Schema changes must be reviewed and applied in an explicit database maintenance window.
# A source merge must never implicitly modify a provisioned database.
echo "Dependencies installed. Database schema unchanged; apply reviewed migrations separately."
