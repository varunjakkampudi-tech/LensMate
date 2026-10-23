# Git branch policy (two permanent branches)

- Decision date: 2026-10-24
- Decided by: owner (Varun, Viswatra), in the chat instruction "Viswatra — Final Git Branch Workflow"
- Scope: LensMate now. The same policy applies to OraOne, CareerScope and FixHub24 when each migration is separately authorized. Their repositories are not changed by this decision.
- Status: ACTIVE for future development. Supersedes the direct-to-main exception in OWNER-APPROVAL-001 (see `blocker.txt`). The historical approval text is not edited.

## Permanent branches

Each product has exactly two permanent branches:

- `main`: production. Contains only owner-approved, tested, production-ready code.
- `dev`: development. All new development, fixes, enhancements, testing and autonomous agent work happen directly here.

No other permanent or temporary branches are created for routine work. No feature, fix, chore, release or task branches. No pull requests for routine development.

## Rules

1. Work directly on `dev`.
2. Commit and push validated development work directly to `dev`.
3. Never automatically merge or push development changes to `main`.
4. Promote `dev` to `main` only after owner approval and all required release gates pass.
5. Never force-push, rewrite published history, or bypass branch protection.
6. Keep each product's codebase and credentials separate.

## Development task checklist

1. Confirm the current branch is `dev`.
2. Synchronize with remote `dev` without discarding commits.
3. Implement the requirement.
4. Run the applicable tests, lint, format, type, security and build checks.
5. Obtain independent review where required (`blocker.txt`, BLOCKER-008).
6. Commit the verified change directly to `dev` and push to `origin/dev`.
7. Check CI for the push and fix any failure. CI runs on pushes to `main` and `dev`, and on pull requests.
8. Update `PROGRESS.md` and `blocker.txt`.

## Production promotion

1. Run the release, security and regression checks that apply.
2. Write a production-readiness report.
3. Obtain explicit owner approval for that promotion.
4. Promote only the approved, verified changes to `main`.
5. Confirm CI passes on `main`.
6. Deployment is not part of promotion and needs its own authorization.

## Security, testing and review

The branch policy does not relax any requirement. Secret scanning, tests, coverage thresholds, schema drift checks, the independent review for sensitive code (BLOCKER-008) and the release gates all still apply on `dev` and before any promotion.
