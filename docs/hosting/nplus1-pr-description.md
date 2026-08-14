## Summary

- pre-replicates published customer websites to pooled Lightsail standby capacity
- tracks exact replica versions and sync health
- prefers exact replicas during failover, with emergency deployment only when needed
- supports custom-domain failover and guarded Vercel wildcard switching for platform subdomains
- repairs missing or stale standby replicas on a five-minute cron
- counts standby reservations against failover node capacity to prevent overbooking

## Safety

- primary publish remains successful if standby replication temporarily fails
- website assignment changes only after an exact replica or successful emergency deployment is available
- platform wildcard switching is blocked unless every live platform-domain site is current on the selected failover node
