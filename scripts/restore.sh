#!/bin/bash
# cShip restore script
# Usage: ./scripts/restore.sh <backup-file.tar.gz>
# Environment variables:
#   MONGODB_URI - MongoDB connection string (required)

set -euo pipefail

BACKUP_FILE="${1}"
MONGODB_URI="${MONGODB_URI}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  echo "Example: $0 /backups/cship-20260101-020000.tar.gz"
  exit 1
fi

if [[ -z "${MONGODB_URI}" ]]; then
  echo "ERROR: MONGODB_URI environment variable is required"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

# Safety check - require confirmation
echo "WARNING: This will DROP the existing database and restore from backup."
echo "Backup file: ${BACKUP_FILE}"
echo "Target database: ${MONGODB_URI}"
read -p "Are you sure you want to continue? (type 'yes' to confirm): " CONFIRM

if [[ "${CONFIRM}" != "yes" ]]; then
  echo "Restore cancelled"
  exit 1
fi

TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

echo "Extracting backup..."
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# Find the extracted directory
EXTRACTED_DIR=$(find "${TEMP_DIR}" -maxdepth 1 -type d -name 'cship-*' | head -1)

if [[ -z "${EXTRACTED_DIR}" ]]; then
  echo "ERROR: Could not find extracted backup directory"
  exit 1
fi

echo "Restoring database (this will drop existing data)..."
mongorestore --uri="${MONGODB_URI}" --drop "${EXTRACTED_DIR}"

echo "Restore completed successfully"

# Verify restore
echo "Verifying restore..."
for collection in users projects deployments auditlogs; do
  count=$(mongosh "${MONGODB_URI}" --quiet --eval "db.${collection}.countDocuments({})")
  echo "  ${collection}: ${count} documents"
done

echo "Restore process complete"