# QG database rollout

Run:

```bash
npm run migrate:qg
```

The migration is additive and can be run more than once.

`QG_START_DATE` controls which completed Cardio vehicles can be automatically added to QG. Use `YYYY-MM-DD`. If it is not configured, the initial rollout date `2026-09-18` is used so older Cardio history is not imported accidentally.
