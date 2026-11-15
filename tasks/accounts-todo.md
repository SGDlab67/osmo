# Tasks: flexible passwords and your own photo

Read `tasks/accounts-plan.md` first, and "Rules for every task" in `tasks/plan.md` (branch, one commit per task,
no secrets, no em dashes, no real people's data in fixtures). Tick a box only when its Verification passes.
Tags: `[agent]` can be done by a coding agent; `[owner]` needs a person with Vercel or Redis access.

Branch: `accounts`, cut from `main`. Gate before each commit (from the repo root):

```
(cd web && npm test && npx tsc --noEmit && npm run lint && npm run build)
```

Note for whoever merges: Vercel blocks deploys of commits whose author is not on the owner's team. After a merge,
the owner pushes an empty commit (`git commit --allow-empty -m "Redeploy" && git push`) or presses Redeploy.

---

## A. Flexible password

### P1 [agent] Generalize the login core to passwords
- [ ] Done

In `web/src/lib/login.ts`:
- Add `parsePassword(v: unknown): string | null`: must be a string; normalize with `.normalize("NFKC")`; length 4 to 64 after normalization (count code points, not bytes); reject control characters; return the string.
- Add `canonicalSecret(v: unknown): string | null`: if the input is a number or a string of 1 to 4 digits in 1..9999, return `String(Number(v))` (this is exactly what old records were sealed with, so `0042` becomes `42`); otherwise return `parsePassword(v)`. Keep `parsePin` exported for the tests of old behavior.
- `seal`, `open`, `savePin`, `attemptLogin` take the canonical secret string instead of a number. Rename the public pieces to `savePassword` / `attemptLogin` and keep the argument key `pin` accepted as an alias, so deployed clients keep working.
- `savePassword`: refuse a password equal to the username (case-insensitive) and the denylist: `1234`, `0000`, `1111`, `4321`, `123456`, `password`, `qwerty`, `osmo`, `letmein`, and the username reversed. The denylist is one array in the file.
- Do not change `kek` input format for digit secrets: old sealed records must still open.

Tests (extend `web/test/login.test.mjs`; keep every existing test passing):
- a record sealed the old way (number 4321) opens with `"4321"`, `4321` and `" 4321 "`;
- `0042` and `42` open the same record;
- a 20-character passphrase with spaces and a non-ASCII character round-trips; a different normalization form of the same text opens the same record (NFKC);
- 3 characters, 65 characters, a control character, the username itself and each denylist entry are refused;
- lockout, parallel-guess and network-sweep tests still pass unchanged.

Acceptance: old numbers still log in; new passwords of 4 to 64 characters seal, open and lock out the same way.
Verification: `cd web && npm test`.
Files: `web/src/lib/login.ts`, `web/test/login.test.mjs`. Scope: M. Depends on: none.

### P2 [agent] Routes accept `password`
- [ ] Done

In `web/src/app/api/auth/login/route.ts` and `web/src/app/api/auth/pin/route.ts` read `password` and fall back to
`pin` from the body. Do not rename the routes (the live app calls them). Update the error text from "number" to
"password" where it appears in `login.ts`. The `GET /api/auth/pin` response keeps `{ ready, set }`.

Acceptance: a request with `{ handle, password }` and one with `{ handle, pin }` both work; error copy says "password".
Verification: gate; manual with `curl` against `next dev` using `@ana`'s public demo key as in README ("Login by username and number").
Files: the two route files, `web/src/lib/login.ts`. Scope: S. Depends on: P1.

### P3 [agent] Password field and copy
- [ ] Done

Replace `web/src/components/pin-field.tsx` with `password-field.tsx`: a text-capable password input (not
digits only; no `inputMode="numeric"`), a show/hide eye button, `autoComplete` as a prop (`new-password` when
choosing, `current-password` when logging in), no `maxLength` below 64, paste allowed, a one-line hint
("4 or more characters. A longer phrase is safer. Don't reuse a password from anywhere else."). Export `passwordOk(v)`
that mirrors the server rule (NFKC, 4 to 64 code points).

Update the three call sites and their copy:
- `web/src/app/welcome/page.tsx`: label "Choose a password", remove "number from 1 to 9999" text.
- `web/src/app/login/page.tsx`: "Username and password", remove the digits filter.
- `web/src/app/me/settings/page.tsx`: card title "Login password", button "Set" or "Change", sheet text.
Update `store.tsx` `signIn` / `setPin` to send `{ password }` and rename `setPin` to `setPassword`.
Also update the README section "Login by username and number" to "Login by username and password".

Acceptance: a user can sign up with `purple horse battery` and log in with it; an old numeric login still works; the 4-character minimum is enforced client side with the same rule as the server.
Verification: gate; manual two-browser check (sign up in one, log in from the other).
Files: `web/src/components/password-field.tsx` (new, `pin-field.tsx` removed), `welcome/page.tsx`, `login/page.tsx`, `me/settings/page.tsx`, `store.tsx`, `README.md`. Scope: M. Depends on: P2.

### Checkpoint A
- [ ] Gate passes; old numeric login still works on the live site after deploy
- [ ] Review with the repo owners before Section B

---

## B. Your own photo

### U1 [agent] Photo validation and storage (server library)
- [ ] Done

Add `web/src/lib/photo.ts` (no image library):
- `const MAX_BYTES = 48 * 1024`.
- `inspect(bytes: Uint8Array): { type: "image/webp" | "image/jpeg" | "image/png"; width: number; height: number } | null`: check the real signature (WebP `RIFF....WEBP`, JPEG `FF D8 FF`, PNG 8-byte signature) and read the dimensions from the header (WebP VP8/VP8L/VP8X, JPEG SOF0 to SOF3/SOF5 to SOF15 scan with bounds checks, PNG IHDR). Reject if either side is below 64 or above 512, or if the header cannot be read. Never read past the buffer.
- `idOf(bytes): string`: first 16 hex characters of SHA-256 (`node:crypto`).
- `putPhoto(kv, bytes)`: validate, then `SET photo:<id>` with a JSON `{ type, b64 }`; returns the id. Same bytes give the same id.
- `getPhoto(kv, id)`: id must match `^[0-9a-f]{16}$`; returns `{ type, bytes }` or null; returns null if `photo:block:<id>` exists (the remove list used by U7).
- Add `get`/`set` support for these keys by reusing the existing `Kv` interface; no changes to `kv.ts` except what the interface needs.

Tests `web/test/photo.test.mjs` (add to the `npm test` script): tiny valid WebP, JPEG and PNG fixtures built in the test (a few dozen bytes each); each is accepted with the right dimensions; a text file renamed `.jpg`, a truncated header, a 600 by 600 image, a 32 by 32 image, a polyglot (valid JPEG header then a `<script>`) are handled safely (the polyglot is stored as an image and served as `image/jpeg` only, covered by U2); identical bytes give identical ids; a blocked id returns null.

Acceptance: only real, in-range images are stored; ids are stable.
Verification: `cd web && npm test`.
Files: `web/src/lib/photo.ts`, `web/test/photo.test.mjs`, `web/package.json` (test script). Scope: M. Depends on: none.

### U2 [agent] Photo routes
- [ ] Done

- `web/src/app/api/photo/route.ts` `POST`: body is the raw image bytes (`content-length` over 49152 is refused before reading, 413); `kv` and the guard from `guard.ts` (`allow("photo", 60)`); a per-network limit using `kv.hit("photo:ip:<ip>", 3600)` of 10 uploads an hour (429 with a readable message). Returns `{ id }`. If Redis is not configured, 503 with "Photos aren't switched on for this server yet."
- `web/src/app/api/photo/[id]/route.ts` `GET`: returns the bytes with `content-type` from the sniffed type (never from the request), `cache-control: public, max-age=31536000, immutable`, `x-content-type-options: nosniff`, `content-security-policy: default-src 'none'; sandbox`, `cross-origin-resource-policy: cross-origin`. 404 for an unknown, malformed or blocked id.
- Use the dynamic-route `params` pattern from `web/src/app/u/[handle]/page.tsx` and the Next route docs in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.

Acceptance: upload a small WebP and fetch it back byte for byte from a second `curl`; a fake image is 400; an 80 KB body is 413; the 11th upload from one network in an hour is 429.
Verification: gate; manual with `curl --data-binary @file`.
Files: the two route files. Scope: M. Depends on: U1.

### U3 [agent] In-browser crop and shrink
- [ ] Done

Add `web/src/lib/photo-client.ts`: `prepare(file: File): Promise<Blob>`:
- decode with `createImageBitmap(file, { imageOrientation: "from-image" })` (fixes phone rotation);
- center-crop to a square, draw to a 256 by 256 canvas, `canvas.toBlob(..., "image/webp", q)` starting at 0.85 and stepping down by 0.1 until the blob is 48 KB or less; fall back to `image/jpeg` when WebP is unsupported;
- throw readable errors: "That file isn't a photo we can read." and "That photo is too detailed to shrink. Try another." Support `HEIC` only if the browser decodes it, otherwise the first message.
Re-encoding in a canvas strips EXIF; add a comment saying that is the reason.
Export `upload(blob): Promise<string>` that POSTs to `/api/photo` and returns the id as `up:<id>`.

Acceptance: a 4 MB phone photo comes out at 256 by 256 and 48 KB or less; a rotated photo is upright.
Verification: gate; manual on a phone photo and a desktop PNG.
Files: `web/src/lib/photo-client.ts`. Scope: S. Depends on: U2.

### U4 [agent] Render uploaded photos
- [ ] Done

In `web/src/lib/people.ts`: `pictureUrl(id)` returns `/api/photo/<hex>` for `up:<16 hex>` (validate with `^up:[0-9a-f]{16}$`; anything else falls through to the existing branches). In `web/src/components/ui.tsx` make `Picture` fall back to the person's default avatar when the image fails to load (`onError`), so a blocked or missing photo never shows a broken square. Keep `imageRendering` pixelated only for `px` and `person:` ids. Check `encodeProfile`: name (40) + `up:` id (19) + country (2) + separators stays under `Welcome.MAX_PROFILE_BYTES` = 120.

Acceptance: a profile with `up:<id>` renders the uploaded photo everywhere `Picture` is used; a blocked id shows the default avatar.
Verification: gate; manual.
Files: `web/src/lib/people.ts`, `web/src/components/ui.tsx`. Scope: S. Depends on: U2.

### U5 [agent] Upload at sign-up
- [ ] Done

In `web/src/components/ui.tsx` `PicturePicker` add a first tile "Your photo" with a camera icon. It opens a hidden `<input type="file" accept="image/*" capture="user">` (phones offer camera or library). On pick: `prepare`, `upload`, then `onPick(id)`. Show a small spinner and a readable error. Above the tile show once: "Your photo is public: everyone using Osmo can see it. Don't upload anything private." In `web/src/app/welcome/page.tsx` the chosen picture already flows into `join` through `shownPicture`; make sure the upload finishes before "Create my account" enables, and that a failed upload falls back to the default avatar rather than blocking sign-up.

Acceptance: sign up with a camera photo; the profile string on chain is `Name|up:<id>|US`; the photo shows on Home, the feed and the profile screen.
Verification: gate; manual, then read the profile on chain with `cast call <Welcome> "profileOf(address)(string)" <address> --rpc-url monad_testnet`.
Files: `web/src/components/ui.tsx`, `web/src/app/welcome/page.tsx`. Scope: M. Depends on: U3, U4.

### U6 [agent] Change your photo later
- [ ] Done

The Settings "Edit profile" sheet already uses `PicturePicker` and `saveProfile` (which calls `Welcome.setProfile`).
Confirm the new tile works there and that saving updates the feed for everyone after the next state refresh. No new
code is expected beyond fixes found while testing; note the result in the commit message.

Acceptance: change from an avatar to an uploaded photo and back; both save on chain.
Verification: gate; manual.
Files: possibly `web/src/app/me/settings/page.tsx`. Scope: XS. Depends on: U5.

### U7 [agent for the script, owner to run] Remove a photo
- [ ] Done

Add `web/scripts/remove-photo.mjs`: `node scripts/remove-photo.mjs <id>` reads `KV_REST_API_URL` and `KV_REST_API_TOKEN` from the environment (the owner supplies them for the one command, for example from the Keychain), deletes `photo:<id>`, and sets `photo:block:<id>` to `1` so the same bytes cannot be uploaded again under that id. It prints only the id and the result. The script must refuse anything that is not 16 hex characters. Document in the README how an owner finds an id (it is in the profile string of the account) and runs the script.

Acceptance: after the script runs, `/api/photo/<id>` is 404 and the person shows their default avatar.
Verification: run against a test id on `next dev` with the in-memory store, or against Redis with a throwaway photo.
Files: `web/scripts/remove-photo.mjs`, `README.md`. Scope: S. Depends on: U1.

### Checkpoint B
- [ ] Gate passes; end to end on the live site: sign up with a photo, log in from a second device with the password, photo shows
- [ ] Review with the repo owners

---

## Wrap

### W1 [agent] README and demo notes
- [ ] Done

Update `README.md`: "Login by username and password" (policy, limits, the honest custody note), "Photos" (what is
stored where, the public notice, the removal script, the limits). Add a short note to the demo script about
signing up with a photo and logging in on a second phone. No claims about compliance or content safety.

Verification: follow the README on a clean checkout. Files: `README.md`. Scope: S. Depends on: P3, U5, U7.

## Owner checklist (people, not agents)

- [ ] Confirm the Upstash Redis plan can hold the photos (48 KB each; 1,000 photos is about 48 MB).
- [ ] Decide who handles a takedown request and how fast. Run `remove-photo.mjs` when needed.
- [ ] After any merge from Charles, push an empty owner-authored commit so Vercel deploys (see top of this file).
- [ ] Before the repo goes public: confirm the README's statement about organizer permission, and run the supply-chain check on `pdf-lib`.
