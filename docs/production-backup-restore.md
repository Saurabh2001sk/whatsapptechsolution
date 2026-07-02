# Production Backup and Restore Plan

## Backup

Run daily from the server or cron provider:

```bash
cd apps/api
npm run db:backup