# Plan: flexible passwords and your own photo

Status: draft for execution. Written 2026-11-15. Tasks are in `tasks/accounts-todo.md`.
The earlier plan for donations is in `tasks/plan.md` (done). Its "Rules for every task" still apply here.

## Overview

Two changes to how an account is made and kept:

1. **Flexible password.** Login by username and a number from 1 to 9999 (shipped, `web/src/lib/login.ts`)
   becomes login by username and a password of the person's choosing: letters, numbers, symbols, 4 to 64
   characters. Numbers still work, so nobody who already saved a number is locked out.
2. **Your own photo.** Today a person picks a cartoon, a pixel avatar or (for two demo accounts) a team photo.
   They will be able to take or upload their own photo at sign-up, and change it later.

Both reuse what exists: the Upstash Redis store (`web/src/lib/kv.ts`), the sealed-key login (`login.ts`), the
profile string on chain (`Welcome.setProfile`) and the `Picture` component. No new contract, no new dependency.

## Decisions already made

- **The password is still checked only by the server, with the same attempt limits** (5 per username and 40 per
  network per 15 minutes). A longer password makes the last-resort attack (someone holding both the server
  secret and the stored blob) far more expensive; the limits handle everyone else.
- **Old records keep working.** The key-derivation input today is the text `<handle>:<number>`. A new password
  is used as typed after Unicode normalization (NFKC). A password of 1 to 4 digits is treated exactly like the
  old number (leading zeros dropped), so `0042` and `42` stay the same, as today.
- **Policy: 4 to 64 characters, any characters, no composition rules.** Block the username itself and a short
  list of the worst passwords. No forced complexity, no expiry. Paste is allowed.
- **Photos never go on chain.** The profile stores a short id, `up:<16 hex>`, the first 16 hex characters of the
  SHA-256 of the image. The image lives in the same Redis store, is served from `/api/photo/<id>` with a
  one-year immutable cache header, and cannot be swapped for the same id.
- **The phone shrinks the photo before upload**: center-crop to a 256 by 256 square, re-encode as WebP (JPEG as
  a fallback), under 48 KB. Re-encoding in a canvas also strips location and camera data (EXIF).
- **The server never trusts the file**: it checks size, the real file signature (magic bytes), and the image
  dimensions from the header, and serves it with headers that stop a browser treating it as anything but an image.
- **Photos are public.** The sign-up screen says so before upload.
- **No moderation service in this phase.** An owner can remove a photo by id (T-U7), and a removed photo falls back
  to the person's default avatar.

## Architecture

```
web/src/lib/login.ts           password policy, sealing (reused, generalized from "pin")
web/src/app/api/auth/*         accept `password` (and `pin`, as an alias, for the same clients)
web/src/components/password-field.tsx   replaces pin-field.tsx (show/hide, hint)
web/src/lib/photo.ts           server: validate + store + fetch photo in Redis by content hash
web/src/app/api/photo/         POST (upload) and [id] GET (serve, cached)
web/src/lib/photo-client.ts    browser: crop, shrink, re-encode
web/src/lib/people.ts          pictureUrl handles `up:<id>`
web/src/components/ui.tsx      PicturePicker gets an "Upload or take a photo" tile
```

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Someone uploads an inappropriate or private image | Reputation, harm to a real person | Public-visibility notice before upload, per-network upload limit, remove-by-id script, fallback avatar; no automated moderation in this phase |
| Photos of faces are personal data and may include minors | Privacy | Notice, no EXIF, nothing on chain, removal path; a real launch needs a retention and takedown policy |
| Redis free tier limits (storage, daily commands) | Photos or login stop working | 48 KB cap, content-hash dedupe, CDN-cached serving so Redis is read once per photo; avatars fall back if the store is down |
| Image parsing bugs | Server crash or XSS | No image library: only length, signature and header-field checks, then the bytes are stored and served unchanged with `nosniff` and a locked-down content-security-policy |
| Longer passwords tempt people to reuse a real password | Credential leak | Copy says "don't use a password you use anywhere else; this is a testnet demo"; server holds sealed keys only |
| Weak passwords still chosen (`1234`) | Easy lockouts and guessing | Short denylist, the 15 minute lock, honest copy; passkeys are the real answer later |
| `RELAYER_KEY` rotation invalidates every saved password | Locked-out users | Documented; rotate only after the event |

## Open questions (do not block starting)

- Use Vercel Blob instead of Redis for photos? Blob has no daily command limits and is built for files, but adds a
  second store to own. Recommendation: start with Redis (already provisioned), switch if limits bite.
- Should existing accounts be nudged to move from a number to a password? Recommendation: no nudge; offer it in Settings.
- A "forgot password" path needs an identity we do not have (no email or phone). Out of scope; the lock expires
  after 15 minutes and a signed-in phone can always set a new password.

## Not doing (and why)

- Email, phone or social login: we hold no personal contact data and do not want to start.
- Passkeys (WebAuthn): the better long-term login, but a larger change and a different custody story. Roadmap.
- Automatic image moderation or face detection: needs an outside service and a policy. Roadmap.
- Photos on chain or IPFS: size, permanence and the right to delete.
- Photo editing (filters, free crop): square center-crop only.
