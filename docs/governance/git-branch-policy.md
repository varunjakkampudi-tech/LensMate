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

## Production ruleset controls (verified 2026-10-24, read-only)

- Ruleset `Protect Production Main` (id 25755233) is active and targets `main` only (`~DEFAULT_BRANCH`). `dev` has no rules.
- Restrict updates: enabled (`update` rule). Only the bypass actor below and the collaborators with write access can update `main`.
- Bypass actors: one, the owner account `varunjakkampudi-tech` (user id 197045755), bypass mode `always`. No team, app or other collaborator has bypass.
- Required status checks: `quality` and `secret-scan`, both with integration 15368 (GitHub Actions).
- Deletion and force-push (non-fast-forward) are blocked. Linear history and code quality rules are on.
- Dependabot alerts and security updates, secret scanning and push protection are enabled.
- Direct pushes to `dev` remain permitted.

Known consequence of the `always` bypass: the owner can update `main` and bypass the required checks. Accepted by the owner for this single-owner repository. It is not a reason to skip the promotion steps below.

## Production promotion (manual, owner approval required)

Every promotion of `dev` to `main` is a manual step, even with the owner's bypass:

1. Confirm CI is green on the exact `dev` commit to be promoted (`quality` and `secret-scan`).
2. Run the release gates that apply (typecheck, lint, format, knip, tests with coverage, schema and secret scans, and the blocker records).
3. Write the production-readiness report and list any open risks.
4. Obtain explicit owner approval for that promotion. Approval for one promotion does not carry over to the next.
5. Promote only the approved commits. Do not force-push, and check CI on `main` afterwards.
6. Deployment is a separate authorization and does not follow from promotion.

Before adding any collaborator: confirm the ruleset still restricts updates, and that no new bypass actor, team or app was added.

## Security, testing and review

The branch policy does not relax any requirement. Secret scanning, tests, coverage thresholds, schema drift checks, the independent review for sensitive code (BLOCKER-008) and the release gates all still apply on `dev` and before any promotion.
