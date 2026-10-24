# 0002 — Backup recovery after revocation and re-enrolment

Status: PROPOSED. Requires owner authorization before any change to who can read a backup. Current behaviour is
recorded in section 1 and is the one that stays until the owner decides otherwise.

## 1. Current behaviour (verified by tests)

- A backup belongs to one device credential. The broker stores one ciphertext per device (`broker_memory_backup`).
- A revoked device gets 401 on read, write and delete (`services/broker/src/backup.test.ts`).
- A newly enrolled device cannot see the backup of the device it replaces (same file). This is deliberate: a new
  device does not inherit another device's data.
- After revocation the old row stays on the server until its retention ends. The owner has no way to purge it from
  the app, and the admin CLI does not delete it. This is a privacy gap for a lost phone.

## 2. Problem

After a lost phone is revoked and the owner re-enrols a new phone, the user has no way to recover their backup. The
user also cannot be sure that the revoked phone's backup is deleted.

## 3. Options

A. Keep per-device backups (current). Simple, no broadening. The user loses the backup on re-enrolment.

B. Purge the device's backup when the owner revokes the device. Privacy-positive. Needs the admin role to be granted
   DELETE on `broker_memory_backup` (a migration change) and the revoke path to call it. It also needs an owner
   decision because it destroys data the user may still want.

C. Recovery identity: derive a backup identifier from the backup passphrase on the phone (a hash, not the passphrase)
   and key backups to it, so a new device with the passphrase can restore. This broadens access: anyone with the
   passphrase and the identifier can fetch the ciphertext. It also means the server keeps data tied to a
   user-held secret. Not recommended without a threat-model review and owner authorization.

D. User-initiated migration: before revocation the user (still on the old phone) copies the backup to the new phone
   by a visible step. Not possible for a lost phone.

## 4. Recommendation

Option B (purge on revocation) now, and option A for recovery. Option C only with an explicit owner authorization and a
threat-model update. Record the user-visible wording in STRINGS before any change.

## 5. Owner authorization needed

- Approve option B. This changes the admin role grants (a migration) and deletes user data on revocation.
- Decide whether recovery is wanted at all. If yes, choose C and authorize its threat-model review.
- Approve the wording shown to users about backups after re-enrolment.
