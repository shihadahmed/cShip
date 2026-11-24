# Backup and Restore Procedures

## Overview

cShip uses MongoDB Atlas for data persistence. This document covers automated backups, manual backup/restore procedures, and disaster recovery.

## Automated Backups (Recommended)

### MongoDB Atlas Native Backups

1. **Enable Atlas Cloud Backups** in your cluster settings:
   - Continuous backups (point-in-time recovery)
   - Scheduled snapshots (daily/weekly/monthly)
   - Cross-region replication for disaster recovery

2. **Configure retention**:
   - Daily snapshots: 7 days
   - Weekly snapshots: 4 weeks
   - Monthly snapshots: 3 months

3. **Set up alerts** for backup failures.

### Self-Hosted Backup Script

Use the provided script at `scripts/backup.sh` for additional redundancy:

```bash
# Environment variables required
export MONGODB_URI="mongodb+srv://user:pass@cluster.net/cship"
export BACKUP_DIR="/backups"
export RETENTION_DAYS=7
export RETENTION_WEEKS=4
export RETENTION_MONTHS=3

# Run manually
./scripts/backup.sh

# Or schedule via cron (daily at 2 AM)
# 0 2 * * * /home/user/cship/scripts/backup.sh
```

## Manual Backup

```bash
# Set required environment variables
export MONGODB_URI="mongodb+srv://user:pass@cluster.net/cship"
export BACKUP_DIR="/backups"

# Run backup
./scripts/backup.sh

# Output: /backups/cship-20260101-020000.tar.gz
```

## Verify Backup

```bash
./scripts/verify-backup.sh /backups/cship-20260101-020000.tar.gz
```

Expected output:
```
Verifying backup structure...
  ✓ users: 1 documents
  ✓ projects: 5 documents
  ✓ deployments: 12 documents
  ✓ auditlogs: 45 documents
  ✓ metadata.json present
Backup verification PASSED
```

## Restore Procedure

### ⚠️ WARNING: This drops the existing database

```bash
# Set required environment variable
export MONGODB_URI="mongodb+srv://user:pass@cluster.net/cship"

# Run restore (requires confirmation)
./scripts/restore.sh /backups/cship-20260101-020000.tar.gz
```

### Point-in-Time Recovery (Atlas)

If using Atlas continuous backups:

1. Go to Atlas → Clusters → Backup
2. Select "Restore" → "Point in time"
3. Choose timestamp
4. Restore to new cluster or download
5. Update `MONGODB_URI` to point to restored cluster

## Disaster Recovery Plan

### RTO/RPO Targets

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single document corruption | < 5 min | < 1 min |
| Collection corruption | < 15 min | < 1 hour |
| Full cluster loss | < 1 hour | < 1 hour (Atlas) |
| Region outage | < 30 min | < 1 hour (cross-region) |

### Recovery Steps

1. **Assess impact** — determine scope of data loss
2. **Choose recovery method**:
   - Point-in-time (Atlas preferred)
   - Latest snapshot + oplog replay
   - Manual backup restore (last resort)
3. **Execute restore** to new cluster
4. **Verify data integrity** — run verification script
5. **Update DNS/cPanel** — point to new cluster
6. **Monitor** — watch for replication lag, errors

## Backup Storage

### Local (Development/Staging)

```bash
BACKUP_DIR="/backups"
# Mount separate volume for backups
```

### Production (Recommended)

- **Atlas managed backups** — primary
- **S3/GCS/Azure Blob** — secondary copy of script backups
- **Different region** — for geographic redundancy

```bash
# Upload to S3 after backup
aws s3 cp /backups/cship-*.tar.gz s3://my-backup-bucket/cship/
```

## Testing Restore

### Monthly Restore Test (Staging)

```bash
#!/bin/bash
# scripts/test-restore.sh
set -euo pipefail

BACKUP_FILE=$(ls -t /backups/cship-*.tar.gz | head -1)
STAGING_URI="mongodb+srv://staging-user:pass@staging-cluster.net/cship_test"

echo "Testing restore from ${BACKUP_FILE} to staging..."

# Create temp database
TEMP_DB="cship_restore_test_$(date +%s)"
export MONGODB_URI="${STAGING_URI}/${TEMP_DB}"

./scripts/restore.sh "${BACKUP_FILE}"

# Verify
./scripts/verify-backup.sh "${BACKUP_FILE}"

# Cleanup
mongosh "${STAGING_URI}/${TEMP_DB}" --eval "db.dropDatabase()"

echo "Restore test PASSED"
```

Schedule monthly via cron:
```
0 3 1 * * /home/user/cship/scripts/test-restore.sh
```

## Monitoring

### Backup Health Checks

Add to monitoring:
- Backup completion status (cron job exit code)
- Backup file size (alert if < expected)
- Backup age (alert if > 24 hours old)
- Restore test success rate

### Atlas Alerts

Configure in Atlas:
- Backup failed
- Backup behind schedule
- Snapshot storage threshold
- Point-in-time recovery window

## Security

- Backup files contain sensitive data (encrypted tokens, env vars)
- Encrypt at rest: `gpg --encrypt` or S3 SSE-KMS
- Restrict access: IAM policies, file permissions (600)
- Rotate encryption keys periodically
- Audit backup access logs

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `mongodump` fails | Network/credentials | Check `MONGODB_URI`, Atlas IP whitelist |
| Backup too large | Unbounded growth | Check retention, audit log size |
| Restore hangs | Large dataset | Increase timeout, use Atlas restore |
| Verification fails | Corrupt backup | Try earlier backup, check disk space |
| Permission denied | File permissions | `chmod +x scripts/*.sh` |