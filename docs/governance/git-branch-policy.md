# Branch policy

LensMate has exactly two branches on the local repository and `origin`:

- `dev` is the only implementation branch. Build, fix, review, and validate work here.
- `main` is the production branch. It changes only after explicit owner approval for that promotion and a successful
  release review.

Do not create or keep feature, task, release, archive, or worker branches. Do not force-push or rewrite published
history. Keep local and remote `dev` synchronized before starting work and after an authorized push. Never push `dev` to
`main` or deploy production as an automatic follow-up.

Before promoting to `main`, validate the exact candidate, check required CI and secret scans, document unresolved risks,
and obtain the owner's explicit approval. Production deployment is a separate action and needs its own authorization.
