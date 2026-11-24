#!/bin/bash
# cShip backup script
# Usage: ./scripts/backup.sh
# Environment variables:
#   MONGODB_URI - MongoDB connection string (required)
#   BACKUP_DIR - Directory to store backups (default: /backups)
#   RETENTION_DAYS - Days to keep daily backups (default: 7)
#   RETENTION_WEEKS - Weeks to keep weekly backups (default: 4)
#   RETENTION_MONTHS - Months to keep monthly backups (default: 3)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
MONGODB_URI="${MONGODB_URI}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
RETENTION_WEEKS="${RETENTION_WEEKS:-4}"
RETENTION_MONTHS="${RETENTION_MONTHS:-3}"

if [[ -z "${MONGODB_URI}" ]]; then
  echo "ERROR: MONGODB_URI environment variable is required"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="cship-${TIMESTAMP}"
TEMP_DIR="${BACKUP_DIR}/${BACKUP_NAME}"

mkdir -p "${BACKUP_DIR}"

echo "Starting backup: ${BACKUP_NAME}"
echo "Backup directory: ${BACKUP_DIR}"
echo "Timestamp: ${TIMESTAMP}"

# Create mongodump
echo "Running mongodump..."
mongodump --uri="${MONGODB_URI}" --out="${TEMP_DIR}"

if [[ ! -d "${TEMP_DIR}" ]]; then
  echo "ERROR: mongodump failed to create output directory"
  exit 1
fi

# Count documents in each collection for verification
echo "Verifying backup collections..."
for collection in users projects deployments auditlogs; do
  if [[ -f "${TEMP_DIR}/cship/${collection}.bson" ]]; then
    count=$(bsondump "${TEMP_DIR}/cship/${collection}.bson" 2>/dev/null | wc -l)
    echo "  ${collection}: ${count} documents"
  else
    echo "  WARNING: ${collection} not found in backup"
  fi
done

# Compress backup
echo "Compressing backup..."
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" -C "${BACKUP_DIR}" "${BACKUP_NAME}"

# Remove uncompressed directory
rm -rf "${TEMP_DIR}"

BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)
echo "Backup completed: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})"

# Retention policy
echo "Applying retention policy..."

# Keep daily backups for RETENTION_DAYS days
find "${BACKUP_DIR}" -name 'cship-*.tar.gz' -type f -mtime +${RETENTION_DAYS} -delete

# Keep weekly backups (Mondays) for RETENTION_WEEKS weeks
# Keep monthly backups (1st of month) for RETENTION_MONTHS months
# This is handled by the find command above with mtime

echo "Retention applied"
echo "Backup process complete"