#!/bin/bash
# cShip backup verification script
# Usage: ./scripts/verify-backup.sh <backup-file.tar.gz>

set -euo pipefail

BACKUP_FILE="${1}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  echo "Example: $0 /backups/cship-20260101-020000.tar.gz"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

echo "Extracting backup for verification..."
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# Find the extracted directory
EXTRACTED_DIR=$(find "${TEMP_DIR}" -maxdepth 1 -type d -name 'cship-*' | head -1)

if [[ -z "${EXTRACTED_DIR}" ]]; then
  echo "ERROR: Could not find extracted backup directory"
  exit 1
fi

echo "Verifying backup structure..."

# Check required collections exist
REQUIRED_COLLECTIONS=("users" "projects" "deployments" "auditlogs")
MISSING=0

for collection in "${REQUIRED_COLLECTIONS[@]}"; do
  BSON_FILE="${EXTRACTED_DIR}/cship/${collection}.bson"
  if [[ -f "${BSON_FILE}" ]]; then
    # Count documents using bsondump
    count=$(bsondump "${BSON_FILE}" 2>/dev/null | wc -l)
    echo "  ✓ ${collection}: ${count} documents"
  else
    echo "  ✗ ${collection}: MISSING"
    MISSING=1
  fi
done

# Check metadata file
METADATA_FILE="${EXTRACTED_DIR}/cship/metadata.json"
if [[ -f "${METADATA_FILE}" ]]; then
  echo "  ✓ metadata.json present"
else
  echo "  ⚠ metadata.json missing (optional)"
fi

if [[ ${MISSING} -eq 1 ]]; then
  echo "ERROR: Required collections missing from backup"
  exit 1
fi

echo "Backup verification PASSED"
echo "Backup file: ${BACKUP_FILE}"
echo "All required collections present"