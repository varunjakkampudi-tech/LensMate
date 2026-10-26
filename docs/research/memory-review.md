# LensMate On-Phone Memory System Review

This document provides a factual, read-only architectural review of the on-phone memory system in LensMate (commit `c959e3c`), conducted for the owner's roadmap decision on next memory work (roadmap item 4 in [open-source-references.md](./open-source-references.md#L48)).

---

## 1. What Is Stored, Where, and Encrypted How (Web and Phone)

### Data Types and Structures

The memory system handles user-saved items defined by `MemoryItem` in [vault.ts:13-22](../../apps/mobile/src/memory/vault.ts#L13-L22):

- `id`: unique string identifier.
- `kind`: `"note" | "capture" | "answer" | "reminder" | "debrief" | "state"` ([vault.ts:11](../../apps/mobile/src/memory/vault.ts#L11)).
- `title`: string summary/title.
- `text`: main text body.
- `imageDataUrl`: optional data URI string (used for captures containing photo data).
- `createdAt`: Unix millisecond timestamp.
- `dueAt`: optional Unix millisecond timestamp (reminders).
- `done`: optional boolean completion flag (reminders).

In addition, `"state"` rows store application configuration, specifically automated tasks (`lensmate.automations.v1`) via `saveState` in [vault.ts:143-154](../../apps/mobile/src/memory/vault.ts#L143-L154) and [automations.ts:32](../../apps/mobile/src/ai/automations.ts#L32).

---

### Phone Storage and Encryption

- **Storage Location**:
  - SQLite database file named `lensmate-memory.db` managed through `expo-sqlite` ([native-store.ts:63](../../apps/mobile/src/memory/native-store.ts#L63), [native-store.ts:220-221](../../apps/mobile/src/memory/native-store.ts#L220-L221)).
  - Schema ([native-store.ts:67-74](../../apps/mobile/src/memory/native-store.ts#L67-L74)):
    ```sql
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      body TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS items_created_at ON items (created_at);
    ```
  - The `body` column stores the full JSON-serialized `MemoryItem` ([native-store.ts:120](../../apps/mobile/src/memory/native-store.ts#L120), [native-store.ts:182-186](../../apps/mobile/src/memory/native-store.ts#L182-L186)).
- **Key Storage**:
  - A 256-bit (64-character hex) key generated from SQLite's random source (`randomblob(32)`) in an ephemeral in-memory database ([native-store.ts:233-248](../../apps/mobile/src/memory/native-store.ts#L233-L248)).
  - Key is stored in device hardware keychain/keystore via `expo-secure-store` under the key name `lensmate.memory.key` with accessibility `WHEN_UNLOCKED_THIS_DEVICE_ONLY` ([native-store.ts:64](../../apps/mobile/src/memory/native-store.ts#L64), [native-store.ts:118-120](../../apps/mobile/src/memory/native-store.ts#L118-L120)).
- **Encryption Method**:
  - Full-database page-level encryption via SQLCipher (`PRAGMA key = "x'${keyHex}'";` in [native-store.ts:103](../../apps/mobile/src/memory/native-store.ts#L103)).
  - The store validates SQLCipher presence via `PRAGMA cipher_version` before reading or writing ([native-store.ts:104-110](../../apps/mobile/src/memory/native-store.ts#L104-L110)). If absent, it refuses to open with `MemoryStoreError("NOT_ENCRYPTED")` rather than write plaintext.

---

### Web Storage and Encryption

- **Storage Location**:
  - IndexedDB database named `lensmate-vault` version 1 ([vault.ts:24-26](../../apps/mobile/src/memory/vault.ts#L24-L26), [vault.ts:58-62](../../apps/mobile/src/memory/vault.ts#L58-L62)).
  - Two object stores: `items` (holds records keyed by item `id`) and `keys` (holds the CryptoKey under key `"main"`).
  - Web stub: `nativeMemory()` in [native-store.web.ts:8-10](../../apps/mobile/src/memory/native-store.web.ts#L8-L10) throws `MemoryStoreError("UNAVAILABLE")` if invoked on web.
- **Key Storage**:
  - Generated using Web Crypto API `crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])` ([vault.ts:102-105](../../apps/mobile/src/memory/vault.ts#L102-L105)).
  - Key is non-extractable (`extractable: false`) and persisted directly in IndexedDB's `keys` object store ([vault.ts:106](../../apps/mobile/src/memory/vault.ts#L106)).
- **Encryption Method**:
  - Each item is individually encrypted with AES-GCM (256-bit key) using a fresh 12-byte random IV via `crypto.getRandomValues(new Uint8Array(12))` ([vault.ts:132-137](../../apps/mobile/src/memory/vault.ts#L132-L137)).
  - Object stored in IndexedDB: `{ iv: Uint8Array, data: ArrayBuffer }` keyed by item `id` ([vault.ts:138](../../apps/mobile/src/memory/vault.ts#L138)).
- **Web State Storage Gap**:
  - `saveState()` is a no-op on web ([vault.ts:144-146](../../apps/mobile/src/memory/vault.ts#L144-L146)).
  - Instead, web automations are stored completely unencrypted in browser `localStorage` as plaintext JSON under key `"lensmate.automations.v1"` ([automations.ts:43](../../apps/mobile/src/ai/automations.ts#L43), [automations.ts:84-86](../../apps/mobile/src/ai/automations.ts#L84-L86)).

---

## 2. Deletion Guarantees: Delete One Item, Delete All, Delete a State Row

### Deleting One Item (`deleteItem`)

- **Phone Implementation** ([vault.ts:217-219](../../apps/mobile/src/memory/vault.ts#L217-L219), [native-store.ts:200-202](../../apps/mobile/src/memory/native-store.ts#L200-L202)):
  - Executes `DELETE FROM items WHERE id = ?`.
  - **Removal status**: The record is removed from the SQLite B-tree.
  - **Gap**: SQLite does not set `PRAGMA secure_delete = 1`, nor does it execute `VACUUM`. Unallocated pages inside the encrypted database file retain residual plaintext bytes of the deleted record until overwritten by future writes. While the database file as a whole is encrypted under SQLCipher, on-device page sanitization is absent.
- **Web Implementation** ([vault.ts:220-224](../../apps/mobile/src/memory/vault.ts#L220-L224)):
  - Executes IndexedDB `store.delete(id)`.
  - **Removal status**: The record is removed from the IndexedDB store. Lower-level disk overwrites depend on browser engine internals.

---

### Deleting All (`deleteAll`)

- **Phone Implementation** ([vault.ts:229-231](../../apps/mobile/src/memory/vault.ts#L229-L231), [native-store.ts:204-214](../../apps/mobile/src/memory/native-store.ts#L204-L214)):
  - Closes the active database connection.
  - Deletes the database file completely via `SQLite.deleteDatabaseAsync(MEMORY_DB_NAME)`.
  - Deletes the encryption key from hardware secure storage via `SecureStore.deleteItemAsync(MEMORY_KEY_NAME)`.
  - Resets the `refused` error latch ([native-store.ts:213](../../apps/mobile/src/memory/native-store.ts#L213)).
  - **Removal status**: **Strong cryptographic erasure**. Even if deleted file blocks were recovered from flash memory, the 256-bit encryption key is eliminated from hardware secure storage, rendering recovered ciphertext cryptographically unrecoverable.
- **Web Implementation** ([vault.ts:232-240](../../apps/mobile/src/memory/vault.ts#L232-L240)):
  - Clears the `items` object store (`s.clear()`).
  - Clears the `keys` object store (`s.clear()`).
  - Resets in-memory `keyPromise = undefined`.
  - **Gaps**:
    1. Does not call `indexedDB.deleteDatabase(DB)`.
    2. Does not clear `localStorage`. On web, automations in `localStorage` under `lensmate.automations.v1` survive `deleteAll()` ([automations.ts:85](../../apps/mobile/src/ai/automations.ts#L85)).
    3. Does not delete any server backup that the user previously pushed to the broker ([vault.ts:228-240](../../apps/mobile/src/memory/vault.ts#L228-L240), [memory.tsx:304-313](../../apps/mobile/app/memory.tsx#L304-L313)).

---

### Deleting a State Row

- **Phone and Web Implementation**:
  - **Gap: No `deleteState(key)` API exists.**
  - [vault.ts](../../apps/mobile/src/memory/vault.ts) exports `saveState` ([vault.ts:143](../../apps/mobile/src/memory/vault.ts#L143)) and `loadState` ([vault.ts:157](../../apps/mobile/src/memory/vault.ts#L157)), but zero deletion function for state rows.
  - State rows are given IDs formatted as `state:${key}` ([vault.ts:175](../../apps/mobile/src/memory/vault.ts#L175)).
  - While calling `deleteItem("state:" + key)` would execute the SQL delete on phone, `deleteItem` is not exposed for state rows, and `listItems()` specifically hides all rows where `item.kind === "state"` ([vault.ts:184](../../apps/mobile/src/memory/vault.ts#L184)), meaning no user UI or caller can discover or delete state rows.
  - When automations are modified or removed, `saveAutomations` overwrites the existing row with a smaller array ([automations.ts:88-95](../../apps/mobile/src/ai/automations.ts#L88-L95)), but the row itself cannot be removed.
  - On `deleteAll()`, state rows on phone are destroyed along with the database file; on web, automations in `localStorage` are untouched.
  - **Memory cache desynchronization gap**: In `automations.ts`, in-memory cache arrays `phoneList` and `storedList` ([automations.ts:36](../../apps/mobile/src/ai/automations.ts#L36), [automations.ts:75](../../apps/mobile/src/ai/automations.ts#L75)) are never notified or cleared when `deleteAll()` is called.

---

## 3. Export: What It Contains and What It Leaves Out (State Rows)

Export is handled by `exportAll()` in [vault.ts:247-261](../../apps/mobile/src/memory/vault.ts#L247-L261):

```ts
export async function exportAll(): Promise<number> {
  const items = await listItems();
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2);
  // Web: triggers browser file download 'lensmate-memory.json'
  // Phone: invokes system share sheet via Share.share(...)
}
```

### What It Contains

1. Top-level metadata: `exportedAt` ISO 8601 timestamp string ([vault.ts:249](../../apps/mobile/src/memory/vault.ts#L249)).
2. An array of all memory items returned by `listItems()`, containing:
   - `id`, `kind`, `title`, `text`, `createdAt`.
   - `dueAt` and `done` (if reminders).
   - `imageDataUrl` (if captures saved with photos—these contain full uncompressed base64 data URIs).

### What It Leaves Out

1. **State rows are explicitly excluded**:
   - In [vault.ts:183-186](../../apps/mobile/src/memory/vault.ts#L183-L186):
     ```ts
     const item = JSON.parse(body) as MemoryItem;
     if (item.kind !== "state") {
       items.push(item);
     }
     ```
   - Automated goals, automation schedules, last execution times, failure counters, and error messages stored in `state:lensmate.automations.v1` are omitted from the export.
2. **Web automations**: Stored in `localStorage` ([automations.ts:85](../../apps/mobile/src/ai/automations.ts#L85)), completely ignored by `exportAll()`.
3. **Application preferences / credentials**: Spend limits, enrolled device keys, biometric tokens, feature toggles, and legal acceptance records (which live in separate SecureStore or React Native preferences) are not part of `vault.ts` and are omitted.
4. **Server backup records**: Information regarding broker-held backups is not exported.
5. **Damaged / unparseable items**: Any corrupted row that fails `JSON.parse` or AES-GCM decryption is silently caught and skipped ([vault.ts:187-189](../../apps/mobile/src/memory/vault.ts#L187-L189), [vault.ts:209-211](../../apps/mobile/src/memory/vault.ts#L209-L211)).

---

## 4. Retention: Where `retention.ts` Is Used and Status of Persisted Temporary Items

### Where `retention.ts` Is Used

- The retention logic is defined in [packages/core/src/retention.ts](../../packages/core/src/retention.ts#L1-L37):
  - Defines `TEMPORARY_RETENTION_MS = 24 * 60 * 60 * 1000` (24 hours) ([retention.ts:7](../../packages/core/src/retention.ts#L7)).
  - `isTemporaryItemExpired(item: TemporaryItem, nowMs: number): boolean` ([retention.ts:19-24](../../packages/core/src/retention.ts#L19-L24)). Fails closed: expires items if clocks are invalid or timestamps are in the future, or if `sessionEnded` is true, or if age >= 24 hours.
  - `sweepTemporaryItems(...)` ([retention.ts:27-37](../../packages/core/src/retention.ts#L27-L37)). Pure partitioning function returning `{ keep, expired }`.
- Exported in [packages/core/src/index.ts:60](../../packages/core/src/index.ts#L60).
- Tested in [packages/core/src/retention.test.ts](../../packages/core/src/retention.test.ts#L1-L56).
- **Production Caller Status**: **NONE**.
  - `sweepTemporaryItems` and `isTemporaryItemExpired` have **zero production callers** across `apps/mobile`, `packages/core`, and `services/broker`.
  - Confirmed by project issue log `blocker.txt:452, 473` ("sweepTemporaryItems has no caller, because there is no persistent temporary store to sweep").

### Factual Status of Persisted Temporary Items

- **No persisted temporary item exists anywhere.**
- Camera video frames, live-vision feeds, voice audio buffers, and live translation text live exclusively in ephemeral React component state (such as [apps/mobile/app/capture.tsx](../../apps/mobile/app/capture.tsx) and [apps/mobile/app/translate.tsx](../../apps/mobile/app/translate.tsx)).
- When a user navigates away or the screen unmounts, the state is cleared by garbage collection.
- Nothing temporary is written to SQLite, IndexedDB, AsyncStorage, or the filesystem cache.
- Items that reach `vault.ts` are solely items the user explicitly chooses to save (or automated answer saves from [automations.ts:167](../../apps/mobile/src/ai/automations.ts#L167)). Saved items are intentionally permanent until deleted.

---

## 5. Recall / Search: How Relevance Is Computed in `search.ts` and Its Limits

Search logic is located in [apps/mobile/src/memory/search.ts:1-57](../../apps/mobile/src/memory/search.ts#L1-L57) and called by `askNotes` in [memory.tsx:85-89](../../apps/mobile/app/memory.tsx#L85-L89).

### How Relevance Is Computed

1. **Question Word Extraction** ([search.ts:30-34](../../apps/mobile/src/memory/search.ts#L30-L34)):
   - Tokenizes the question string with unicode word regex `[\p{L}\p{N}]+`.
   - Converts words to lowercase.
   - Discards words `<= 2` characters in length.
   - Discards words matching a hardcoded set of 23 English stop words (`the`, `and`, `for`, `with`, `what`, `where`, `when`, `which`, `that`, `this`, `have`, `did`, `does`, `are`, `was`, `were`, `you`, `your`, `tell`, `about`, `from`, `into`) ([search.ts:4-27](../../apps/mobile/src/memory/search.ts#L4-L27)).
2. **Stemming / Matching** ([search.ts:37-40](../../apps/mobile/src/memory/search.ts#L37-L40)):
   - Truncates the last 2 characters of any token with length `>= 5` (`word.slice(0, word.length - 2)`). Tokens of length 3 or 4 remain untouched.
   - Constructs a haystack string from each item: `const haystack = \`${item.title} ${item.text}\`.toLowerCase()`.
   - Checks whether `haystack.includes(stem)` for any extracted stem (`words.some(...)`).
3. **Filtering and Fallback** ([search.ts:51-56](../../apps/mobile/src/memory/search.ts#L51-L56)):
   - Returns `(matched.length > 0 ? matched : [...items]).slice(0, limit)`.

### Limits of Current Search

1. **No ranking by recency**: Matched items preserve whatever order they entered `relevantNotes`. They are not re-sorted or prioritized by `createdAt`.
2. **No ranking by kind**: Notes, reminders, answers, and debriefs are given identical weight. No filtering or scoring by item kind is supported in `search.ts` (though `memory.tsx:86` filters out `capture` before calling).
3. **Binary matching without relevance scoring**: An item matching 1 stem has identical rank to an item matching 5 stems. There is no frequency weighting, TF-IDF, or BM25 scoring.
4. **Crude stemming errors**:
   - _False positives_: Stripping 2 characters from any word `>= 5` letters produces false substring collisions (e.g., query `"party"` stems to `"par"`, matching `"parking"`, `"parent"`, or `"partial"`; `"water"` stems to `"wat"`).
   - _False negatives_: Does not handle irregular English verb/noun inflections (`"bought"` vs `"buy"`, `"ran"` vs `"run"`, `"mice"` vs `"mouse"`) or suffix lengths greater than 2 (`"running"` stems to `"runn"`, which fails to match `"run"`).
5. **English-only stop words**: Stop words are hardcoded to 23 English terms. Non-English queries (e.g. Hindi, Spanish) retain stop words, polluting the token set.
6. **Short keywords discarded**: Terms `<= 2` characters are discarded, making queries about `"AI"`, `"TV"`, `"ID"`, or `"EV"` impossible.
7. **Unsafe fallback leaks unrelated notes**: If `matched.length === 0` (e.g., query has only stop words or no notes match), `search.ts` returns the newest `limit` items ([search.ts:56](../../apps/mobile/src/memory/search.ts#L56)). In `memory.tsx:85-103`, this causes up to 8 completely unrelated notes to be sent over the network to the LLM.
8. **Linear memory scan**: Performs full O(N * M) JS string search over every item in memory. Does not use SQLite FTS5 full-text indexing.
9. **Arbitrary context window cutoff**: In `memory.tsx:92`, retrieved note text is sliced at 6,000 characters (`.slice(0, 6000)`), potentially truncating notes mid-sentence.

---

## 6. Backup: What Is Sent to the Server and What Is Not; Encryption on the Device

Backup functionality is implemented in [apps/mobile/src/memory/backup.ts:1-109](../../apps/mobile/src/memory/backup.ts#L1-L109) and the Fastify broker in [services/broker/src/backup.ts](../../services/broker/src/backup.ts#L1-L37).

### Encryption on the Device

- **Passphrase Derivation** ([backup.ts:22-37](../../apps/mobile/src/memory/backup.ts#L22-L37)):
  - PBKDF2 using SHA-256 with 310,000 iterations (`ROUNDS = 310_000` in [backup.ts:9](../../apps/mobile/src/memory/backup.ts#L9)).
  - Random 16-byte salt: `crypto.getRandomValues(new Uint8Array(16))` ([backup.ts:40](../../apps/mobile/src/memory/backup.ts#L40)).
  - Derives a 256-bit AES-GCM CryptoKey (`length: 256` in [backup.ts:33](../../apps/mobile/src/memory/backup.ts#L33)).
- **Sealing Payload** ([backup.ts:39-51](../../apps/mobile/src/memory/backup.ts#L39-L51)):
  - Generates a 12-byte random IV: `crypto.getRandomValues(new Uint8Array(12))` ([backup.ts:41](../../apps/mobile/src/memory/backup.ts#L41)).
  - Encrypts JSON string of items via AES-GCM.
  - Chunked base64 encoding avoids JavaScript call-stack overflow on large arrays ([backup.ts:13-19](../../apps/mobile/src/memory/backup.ts#L13-L19)).
  - Serialized envelope format: `v1.${b64(salt)}.${b64(iv)}.${b64(data)}` ([backup.ts:50](../../apps/mobile/src/memory/backup.ts#L50)).

### What Is Sent to the Server

- The opaque ciphertext string (`v1.<salt>.<iv>.<data>`) ([backup.ts:75-76](../../apps/mobile/src/memory/backup.ts#L75-L76)).
- Retention period: `retentionDays` integer (`7 | 30 | 90 | 365`) ([backup.ts:10](../../apps/mobile/src/memory/backup.ts#L10), [backup.ts:76](../../apps/mobile/src/memory/backup.ts#L76)).
- Sent via HTTP `PUT /backup` authenticated with device token header (`Authorization: Bearer <token>`).
- If `includePhotos` is true, base64 data URLs in `imageDataUrl` are included in the encrypted payload; if false, they are stripped before sealing ([backup.ts:72-74](../../apps/mobile/src/memory/backup.ts#L72-L74)).

### What Is NOT Sent to the Server

- **The passphrase**: Never transmitted; key derivation occurs strictly on device ([backup.ts:22-37](../../apps/mobile/src/memory/backup.ts#L22-L37)).
- **Plaintext item contents**: Titles, note bodies, reminders, and debriefs are never sent unencrypted.
- **State rows**: Excluded completely because `backUp()` calls `listItems()` ([backup.ts:72](../../apps/mobile/src/memory/backup.ts#L72)), which excludes `kind === "state"` ([vault.ts:184](../../apps/mobile/src/memory/vault.ts#L184)).
- **Local encryption keys**: Neither the native SQLCipher key nor the web IndexedDB CryptoKey is transmitted.

---

## 7. Risks, Ranked High/Medium/Low, with Trigger Conditions

| Rank       | Risk                                                                                       | Trigger Condition                                                                                                                                                                                                                                                                                                                                                                                                            | Consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| :--------- | :----------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High**   | **1. Permanent unrecoverable memory loss on key loss (`KEY_LOST`)**                        | The hardware secure store loses or invalidates `lensmate.memory.key` (e.g. OS keychain clearance, device restore to new phone without keychain backup, or key string corruption failing `/^[0-9a-f]{64}$/`), while the SQLite database file still exists ([native-store.ts:86-88](../../apps/mobile/src/memory/native-store.ts#L86-L88), [native-store.ts:112-116](../../apps/mobile/src/memory/native-store.ts#L112-L116)). | The store enters a permanent refused state (`refused = KEY_LOST`, [native-store.ts:145-148](../../apps/mobile/src/memory/native-store.ts#L145-L148)). All reads and writes fail immediately. The only remediation path offered to the user is `deleteAll()` ([vault.ts:32-33](../../apps/mobile/src/memory/vault.ts#L32-L33)), permanently wiping all local user data. If no external passphrase backup was taken, all notes and memories are gone forever.                                                |
| **High**   | **2. Plaintext exposure and retention of automations in Web `localStorage`**               | Running LensMate in a browser environment (`Platform.OS === "web"`), and configuring or executing automations in [automations.ts:84-86](../../apps/mobile/src/ai/automations.ts#L84-L86).                                                                                                                                                                                                                                    | `saveState` does nothing on web ([vault.ts:144-146](../../apps/mobile/src/memory/vault.ts#L144-L146)). Automations—including user goals, schedules, execution results, and error logs—are written in plaintext to browser `localStorage`. Any malicious script or browser extension with domain access can read all automation data. Furthermore, `deleteAll()` does not clear `localStorage` ([vault.ts:236-239](../../apps/mobile/src/memory/vault.ts#L236-L239)), violating user deletion expectations. |
| **High**   | **3. Unintended privacy leak of user notes to external LLM on unmatched or empty queries** | A user asks a question in "Ask my notes" ([memory.tsx:82-110](../../apps/mobile/app/memory.tsx#L82-L110)) where question words match 0 saved notes, or the question consists solely of stop words / words `<= 2` characters ([search.ts:51-56](../../apps/mobile/src/memory/search.ts#L51-L56)).                                                                                                                             | `relevantNotes` falls back to returning the first `limit` items of `items` (`[...items].slice(0, limit)`). Up to 8 newest saved notes (up to 6,000 characters) are transmitted across the internet to the cloud model endpoint ([memory.tsx:94-104](../../apps/mobile/app/memory.tsx#L94-L104)), even though none of them match the user's inquiry.                                                                                                                                                        |
| **High**   | **4. Out-of-memory app crash from uncompressed base64 image storage in SQLite**            | User saves multiple captures with photos (`saveItem` with `imageDataUrl` in [capture.tsx:486](../../apps/mobile/app/capture.tsx#L486)), and subsequently loads memory ([vault.ts:178-191](../../apps/mobile/src/memory/vault.ts#L178-L191)) or performs an export ([vault.ts:247-261](../../apps/mobile/src/memory/vault.ts#L247-L261)).                                                                                     | Multi-megabyte base64 image strings are stored directly inside the SQLite `items.body` column. `listItems()` loads all rows and deserializes every JSON body into JavaScript memory at once (`SELECT body FROM items ORDER BY created_at DESC`). On memory-constrained mobile devices, this causes Out-Of-Memory (OOM) termination.                                                                                                                                                                        |
| **Medium** | **5. Backup payload rejection (`BACKUP_400`) on large collections**                        | User attempts `backUp()` with `includePhotos: true` or a large number of notes exceeding broker request limits ([backup.ts:70-76](../../apps/mobile/src/memory/backup.ts#L70-L76), [services/broker/src/backup.test.ts:109](../../services/broker/src/backup.test.ts#L109)).                                                                                                                                                 | The broker rejects the payload with HTTP 400 (`BACKUP_400`). Backup fails entirely. The mobile app does not provide an automated fallback to back up text-only notes when photo payloads exceed server limits.                                                                                                                                                                                                                                                                                             |
| **Medium** | **6. Inability to audit, export, or selectively delete application state rows**            | Application features write state rows via `saveState` ([vault.ts:143](../../apps/mobile/src/memory/vault.ts#L143)).                                                                                                                                                                                                                                                                                                          | There is no `deleteState` function. State rows are invisible to `listItems()` ([vault.ts:184](../../apps/mobile/src/memory/vault.ts#L184)) and omitted from `exportAll()` ([vault.ts:248](../../apps/mobile/src/memory/vault.ts#L248)). Abandoned or obsolete state configurations remain permanently in the database until `deleteAll()` wipes the entire store.                                                                                                                                          |
| **Medium** | **7. Search recall degradation and false matching from naive 2-letter stem chopping**      | User searches with words `>= 5` characters whose first N-2 letters collide with unrelated words, or words with complex suffixes / irregular conjugations ([search.ts:37-40](../../apps/mobile/src/memory/search.ts#L37-L40)).                                                                                                                                                                                                | High false-positive rate (e.g. `"party"` matches `"parking"`, `"parent"`) and false negatives (e.g. `"running"` fails to match `"run"`). Irrelevant context is fed to the LLM while valid notes are excluded.                                                                                                                                                                                                                                                                                              |
| **Low**    | **8. Plaintext residual data on single-item deletion due to missing page zeroing**         | User deletes an individual sensitive memory item via `deleteItem(id)` ([vault.ts:216](../../apps/mobile/src/memory/vault.ts#L216), [native-store.ts:200](../../apps/mobile/src/memory/native-store.ts#L200)).                                                                                                                                                                                                                | The SQL `DELETE` statement does not zero out unallocated database pages (`PRAGMA secure_delete = 1` is not set). While the container remains encrypted under SQLCipher, discarded content persists in database slack space.                                                                                                                                                                                                                                                                                |
| **Low**    | **9. Dead retention code misleading compliance verification**                              | A developer or auditor reviews `packages/core/src/retention.ts` assuming automatic 24-hour expiration of temporary data is active.                                                                                                                                                                                                                                                                                           | `sweepTemporaryItems` is never invoked in production. If a future feature saves temporary data to disk without wiring the sweep, that data will be retained indefinitely without expiring.                                                                                                                                                                                                                                                                                                                 |
| **Low**    | **10. Unencrypted local copy on export**                                                   | User taps "Export all" in `memory.tsx:288-301`.                                                                                                                                                                                                                                                                                                                                                                              | On mobile, the plaintext JSON body (including photo base64 strings) is delivered to the system share sheet (`Share.share`), allowing users to unintentionally save unencrypted files to external storage or cloud drives.                                                                                                                                                                                                                                                                                  |

---

## 8. Recommended Next Steps, Small and Testable, in Order

To support the owner's decision on Roadmap Item 4 (retention, recall ranking, deletion guarantees, and Mem0 evaluation), the following incremental steps are recommended:

### Step 1: Fix Deletion Gaps and Implement State Deletion

- **Action**:
  1. Add `deleteState(key: string): Promise<void>` in [vault.ts](../../apps/mobile/src/memory/vault.ts), executing `DELETE FROM items WHERE id = ?` with `stateId(key)`.
  2. In `deleteAll()` on web ([vault.ts:236-239](../../apps/mobile/src/memory/vault.ts#L236-L239)), add `globalThis.localStorage.removeItem("lensmate.automations.v1")`.
  3. In `automations.ts`, export a reset function `resetAutomationsCache()` to clear `phoneList` and `storedList`, and call it during `deleteAll()`.
  4. In `native-store.ts` ([native-store.ts:122](../../apps/mobile/src/memory/native-store.ts#L122)), enable `PRAGMA secure_delete = ON;` in SQLite connection initialization.
- **Verification**: Unit tests in `vault.test.ts` and `native-store.test.ts` asserting that `deleteState` removes the state row, `deleteAll` clears web `localStorage`, and `PRAGMA secure_delete` is executed.

### Step 2: Prevent Privacy Leak on Unmatched Search Queries

- **Action**:
  - In [search.ts:56](../../apps/mobile/src/memory/search.ts#L56), change the fallback behavior: when `matched.length === 0`, return `[]` instead of `[...items].slice(0, limit)`.
  - In [memory.tsx:98](../../apps/mobile/app/memory.tsx#L98), if `context` is empty, inform the model `"(no matching notes found)"` without sending arbitrary notes.
- **Verification**: Unit tests in `search.test.ts` proving that unmatched queries return an empty array and never leak unrelated notes.

### Step 3: Implement Basic Scored and Recency-Ranked Search

- **Action**:
  - Replace the crude 2-character slicing in [search.ts:37-40](../../apps/mobile/src/memory/search.ts#L37-L40) with whole-word or prefix token matching.
  - Score items based on match count (number of query terms found in title and text).
  - Sort results first by match score descending, then by `createdAt` descending (recency).
- **Verification**: Unit tests in `search.test.ts` checking term frequency weighting and recency tie-breaking.

### Step 4: Resolve Retention Policy and Clarify Temporary Item Lifecycle

- **Action**:
  - Fulfill project issue `blocker.txt:473`: Record an architectural decision that temporary items (camera frames, live-stream buffers) are ephemeral in-memory only and unmounted with the session.
  - Either remove `sweepTemporaryItems` from `packages/core/src/retention.ts` if no persistent temporary store is ever planned, or create an explicit temporary SQLite/AsyncStorage store that actively calls `sweepTemporaryItems` on app start.
- **Verification**: Run `npm test` across `packages/core` ensuring no regressions.

### Step 5: Separate Image Blobs from SQLite Database Rows

- **Action**:
  - When saving captures with photos ([capture.tsx:486](../../apps/mobile/app/capture.tsx#L486)), write image bytes to an encrypted file path in the app sandbox rather than storing multi-megabyte base64 strings in `items.body`.
  - In `MemoryItem`, store a local file URI reference instead of raw base64 data.
- **Verification**: Unit test verifying `listItems()` memory footprint with large image records.

### Step 6: Owner Decision on External Memory Service (Mem0 Patterns)

- **Action**:
  - Evaluate trade-offs for Roadmap Item 4:
    - _Option A (Local-First)_: Enhance on-phone SQLite with an FTS5 full-text search virtual table and local BM25 ranking. Zero hosting cost, zero monthly spend, strict on-device privacy.
    - _Option B (Mem0 Service)_: Deploy an external Mem0 Python service behind the broker. Provides semantic retrieval and fact extraction, but introduces Python runtime hosting costs, cloud latency, and requires cloud data retention disclosures.
- **Verification**: Owner review of cost, privacy, and architectural fit based on this document.
