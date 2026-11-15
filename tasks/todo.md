# Tasks: Give (donations to registered nonprofits)

Read `tasks/plan.md` first, including "Rules for every task". Tick a box only
when its Verification block passes. Task tags: `[agent]` can be done by a coding
agent with no secrets; `[owner]` needs the deployer wallet or the curator key,
run by a person on their own machine.

Branch: `charities`, cut from `main`. One commit per task.

**Status 2026-11-15 (Charlie, built with Hermes).** Phases 1 and 2, T10 and T12 are done and live on Monad testnet
(`Charities` 0xD74718C8470FA90516042A9FF45Be7A9F133D6c0, 20 listed). T9 (monthly) and T11 (gift links) are not started.
Changes from this plan, decided by Charlie:
- **Real organizations instead of fictional ones (overrides rule 4 and T3).** 20 US nonprofits with real names, logos,
  EINs and addresses from IRS records (ProPublica). Stand With Crypto is featured for the demo; it is a 501(c)(4), so the
  app and receipts say gifts to it are not deductible. Coin Center is listed as CC Foundation, its 501(c)(3). Every Give
  screen says Osmo isn't affiliated and that testnet gifts go to stand-in wallets; receipts say "Testnet demo. Not a tax
  document." The data lives in `web/src/data/charities.json` (hash = keccak256 of `JSON.stringify(record)`), logos in
  `web/public/charities/`.
- `Charities.addMany` added so the seed lists every charity in one transaction.
- Charity wallets are funded directly by the curator to claim their usernames, not welcomed (no starter kit, no gas
  grant from the float, and they don't show up as people).
- Receipts also flag Form 8283 at $500 and note that stablecoins are property, and the summary exports a CSV.

---

## Phase 1: Foundation

### T1 [agent] Charities contract and tests
- [x] Done

Add `src/Charities.sol` and `test/Charities.t.sol`.

Spec:
- `address public owner` set in the constructor; `setOwner(address)` onlyOwner (single step is fine, mark with a `ponytail:` comment that a two-step transfer is the upgrade).
- `address[] public list;` append-only. `mapping(address => bytes32) public metaHashOf;` `mapping(address => bool) public isVerified;`
- `add(address charity, bytes32 metaHash)` onlyOwner. Reverts `ZeroAddress`, `ZeroHash`, `AlreadyListed` (already in `list`). Pushes to `list`, sets both mappings, emits `CharityAdded(address indexed charity, bytes32 metaHash)`.
- `revoke(address charity)` onlyOwner. Reverts `NotListed` if never added. Sets `isVerified[charity] = false`, keeps it in `list` and keeps `metaHashOf` so history stays readable. Emits `CharityRevoked(address indexed charity)`.
- `count()` returns `list.length`.
- Custom errors, `NotOwner`, no `receive`, no payable functions, no token logic. Charities never touches money.
- Style: match `src/Welcome.sol` (NatSpec on the contract and each public function, four-space indent, `forge fmt`).

Tests (Foundry, same file layout as `test/Welcome.t.sol`):
- add stores both mappings and list order; emits event (`vm.expectEmit`).
- only owner can add, revoke, setOwner (`vm.expectRevert(Charities.NotOwner.selector)`).
- zero address, zero hash, duplicate add all revert with the named error.
- revoke flips `isVerified` to false, keeps `metaHashOf`, keeps list length; revoke of an unlisted address reverts `NotListed`.
- fuzz: for any `address a` that was never added, `isVerified(a)` is false (`testFuzz_neverAddedIsNeverVerified`).

Acceptance: the six behaviors above are covered; no function can move funds.
Verification: `forge fmt --check && forge test --match-contract Charities -vv`, then full `forge test`.
Files: `src/Charities.sol`, `test/Charities.t.sol`. Scope: S. Depends on: none.

### T2 [agent] Deploy script and app bindings
- [x] Done

Add `script/DeployCharities.s.sol` that deploys only `Charities` and records it
in `deployments/<network>.json` under `contracts.Charities` as
`{ "address": ..., "deployBlock": ... }` without touching any other key
(use `vm.writeJson(value, path, ".contracts.Charities")` on the existing file;
if the file has no `contracts` object yet, fail with a clear message). Follow the
guard in `script/Deploy.s.sol`: write only when the context is `ScriptBroadcast`
or `ScriptResume`, otherwise log "dry run: deployments file left as it is".
Do not use `msg.sender` for ownership logic inside the script (see the comment
in `Deploy.s.sol`); the contract's `owner` is the broadcaster by construction.

Then wire the app: in `web/scripts/sync-contracts.mjs` add
`["Charities", "charitiesAbi"]` to the contract list and `charities: addr("Charities")`
to the generated config; in `web/src/lib/abi.ts` re-export `charitiesAbi`; in
`web/src/lib/config.ts` expose `config.charities` (env override
`NEXT_PUBLIC_CHARITIES`, same pattern as the others). Zero address when not deployed.

Acceptance: `npm run contracts` regenerates `contracts.ts` with a `charitiesAbi`;
a dry run does not change `deployments/monad-testnet.json`.
Verification:
```
forge script script/DeployCharities.s.sol:DeployCharities --rpc-url monad_testnet   # dry run, no --broadcast
git diff --stat deployments/        # must be empty
(cd web && npm run contracts && npm run contracts -- --check && npx tsc --noEmit)
```
Files: `script/DeployCharities.s.sol`, `web/scripts/sync-contracts.mjs`, `web/src/lib/abi.ts`, `web/src/lib/config.ts`, `web/src/lib/contracts.ts` (generated). Scope: M. Depends on: T1.

### T3 [agent] Demo charity data
- [x] Done (changed: real organizations, see note at the top)

Create three fictional charities as static files in `web/public/charities/`:

| handle | legal name | category |
| --- | --- | --- |
| `harborpantry` | Harbor Pantry Network (demo) | food |
| `riverbendclinic` | Riverbend Free Clinic (demo) | health |
| `openshelf` | Open Shelf Literacy Project (demo) | education |

Each `<handle>.json` has exactly these keys: `handle`, `legalName`, `ein`
(fake and invalid on purpose: `00-0000001`, `00-0000002`, `00-0000003`),
`address` (a made-up street address in Portland, OR, ending "(demo)"),
`country` ("US"), `mission` (one sentence), `category`, `demo: true`.
Add a square logo `<handle>.svg` (simple geometric shape, original, no real
organization's mark). Write the JSON with two-space indent and a trailing
newline; the file bytes are what gets hashed, so never reformat after T4 runs.

Acceptance: three JSON files parse; EINs match `^00-000000\d$`; no real
organization names; no em dashes.
Verification: `for f in web/public/charities/*.json; do node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' "$f" || exit 1; done`
Files: `web/public/charities/*`. Scope: S. Depends on: none.

### T4 [agent locally, owner on testnet] Seed the charities
- [x] Done (local anvil)  - [x] Done (testnet, owner)

Add `web/scripts/seed-charities.mjs` and `"seed:charities": "node --env-file-if-exists=.env.local scripts/seed-charities.mjs"` to `web/package.json`. Model it on `web/scripts/seed-demo.mjs` (same viem setup, same `NETWORK` and `NEXT_PUBLIC_*` overrides, same derived-from-a-public-string wallets, same `RELAYER_KEY` operator to `Welcome.welcome` the new wallets).

For each file from T3:
1. derive the charity wallet from the public string `osmo-charity:<handle>`;
2. `Welcome.welcome(wallet, profile)` with `profile` = `"<legalName>|px1|US"` style as the existing seed does; skip if already welcomed;
3. wallet signs `UsernameRegistry.claim(handle)`; skip if `nameOf(wallet)` is set;
4. compute `metaHash = keccak256(bytes of the file)`; if `Charities.isVerified(wallet)` already, skip; else the curator calls `Charities.add(wallet, metaHash)`.

The curator key comes from the environment variable `CURATOR_KEY`, never a file. On local anvil use anvil's public account 0 key. On testnet the owner runs:
`CURATOR_KEY=$(security find-generic-password -w -s <keychain item>) npm run seed:charities`
The script must be idempotent: a second run changes nothing and prints "already seeded".

Acceptance: after a run, `Charities.count() == 3`, each handle resolves in the registry to its wallet, `metaHashOf(wallet)` equals the keccak256 of the served file.
Verification (local): start `anvil`, run `forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast` with an anvil account, then `DeployCharities`, then `NETWORK=local npm run seed:charities` twice (second run no-op), then `cast call <Charities> "count()(uint256)" --rpc-url http://127.0.0.1:8545` returns 3.
Owner step: deploy `Charities` on Monad testnet with the same wallet that owns `Welcome`, then run the seed with that wallet as curator.
Files: `web/scripts/seed-charities.mjs`, `web/package.json`. Scope: M. Depends on: T1, T2, T3.

### Checkpoint 1
- [ ] Whole-repo gate from `tasks/plan.md` passes
- [ ] On a local anvil chain, three charities are verified on chain
- [ ] Review with the people who own the repo before Phase 2

---

## Phase 2: Give (core demo)

### T5 [agent] Read verified charities into the app state
- [x] Done

Extend the existing shared state, do not add a new polling path (phones must not
read the chain directly, see `web/src/lib/state-server.ts` and `state.ts`).
- `state.ts`: add `Charity { handle, wallet, name, ein, address, mission, category, verified, detailsOk }` and `charities: Charity[]` to `WireState`.
- `state-server.ts`: when `config.charities` is not the zero address, read `count`, each `list(i)`, `isVerified`, `metaHashOf` (batched with the existing Multicall3 path), fetch `/charities/<handle>.json` from the same origin (or read it from `web/public` on the server), compute keccak256 of the raw text, set `detailsOk = (hash == metaHashOf)`. Resolve each wallet's handle with `registry.nameOf`. Cache like the other pieces: charities change rarely, refresh at most once a minute and when `count` changes.
- If `Charities` is not deployed, return `charities: []` and nothing else changes.

Acceptance: `/api/state` includes the three charities with `detailsOk: true`; editing a JSON file makes `detailsOk` false after the next refresh; with `Charities` at the zero address the response is unchanged apart from `charities: []`.
Verification: `(cd web && npx tsc --noEmit && npm run lint && npm run build)`; start the app against local anvil and `curl localhost:3000/api/state | jq '.charities | length'` prints 3.
Files: `web/src/lib/state.ts`, `web/src/lib/state-server.ts`. Scope: M. Depends on: T4 (local).

### T6 [agent] Give screen
- [x] Done

Add `web/src/app/give/page.tsx` and a "Give" entry point from the home screen
(read `web/src/components/shell.tsx` and `web/src/app/page.tsx` for the existing
navigation pattern; keep the change to one link or card).

Behavior:
- Lists charities from the store (`useStore`) where `verified && detailsOk`, each with logo, name, category, mission, and a "Verified nonprofit (demo)" badge. A charity with `verified && !detailsOk` shows "Details changed since verification" and no donate button. Revoked charities do not appear.
- Tap a charity: amount in USD, pick an asset the user holds (reuse the asset picker used on `web/src/app/pay/page.tsx`), optional note, then call `store.pay` with `to` = the charity handle. Do not duplicate the payment code; extend `pay` only if it cannot express a donation.
- The note is prefixed `Donation: ` so the feed reads naturally; max 140 bytes total (the contract limit).
- Success screen links to the receipt `/p/<hash>`.
- Visible footer: "Demo charities. Not real organizations. Not tax advice."

Acceptance: from a fresh wallet, donate $5 of a held asset to `harborpantry`; the payment confirms; the receipt link opens.
Verification: gate for `web/`; manual: run the app on local anvil and complete one donation in the browser.
Files: `web/src/app/give/page.tsx`, small edits in `web/src/components/shell.tsx` or `web/src/app/page.tsx`, possibly `web/src/lib/store.tsx`. Scope: M. Depends on: T5.

### T7 [agent] Historical fair market value lookup
- [x] Done

Add `web/src/lib/fmv.ts` and `web/src/app/api/fmv/route.ts`:
`GET /api/fmv?symbol=NVDA&t=<unix seconds>` returns
`{ usdPerUnit: number, source: string, asOf: number } | { error }`.
- Dollar coins (`DOLLAR_COINS` in `assets.ts`) return 1.00, source "pegged".
- Others: reuse `META[symbol].cg` (the CoinGecko id the app already uses) and CoinGecko `market_chart/range` for a window of one hour either side of `t`; pick the point nearest `t`; `asOf` is that point's timestamp. Verify the endpoint shape against CoinGecko's current docs before coding; if it is unavailable for an asset, return `{ error: "unavailable" }` (HTTP 200), never a guess.
- Cache in memory keyed by `symbol:hourBucket`; reuse the stale-price fallback and rate-limit handling approach in `prices-server.ts`. Apply `allow("fmv", 120)` from `guard.ts`.
- Validate input: `symbol` must be a key of `META`, `t` an integer within the last 400 days.

Acceptance: a known asset and a timestamp from yesterday return a plausible price with `asOf` within an hour of `t`; an unknown symbol is a 400; stablecoin returns 1.
Verification: gate for `web/`; `curl 'localhost:3000/api/fmv?symbol=USDC&t=<recent>'` returns 1; add a small node test or a `ponytail:`-free self-check script only if the logic has branches worth guarding (nearest-point selection).
Files: `web/src/lib/fmv.ts`, `web/src/app/api/fmv/route.ts`. Scope: M. Depends on: none.

### T8 [agent] Donation receipt on the payment page
- [x] Done

Extend `web/src/app/p/[hash]/receipt.tsx` (read it first). When the payment's
recipient is a charity from `state.charities` with `verified && detailsOk`, show a
"Donation receipt" section below the existing details:
- Charity legal name, EIN, address (from the charity JSON).
- Date and time in UTC, tx hash with the existing MonadScan link, block.
- Asset, amount, and `USD fair market value` from `/api/fmv` at the block timestamp, with "source" and "as of" shown; if unavailable show "FMV unavailable" and keep the rest.
- Fixed line: "No goods or services were provided in exchange for this gift."
- Receipt id: first 10 hex chars of keccak256(txHash, logIndex).
- Flags: at $250 or more "The charity should provide a written acknowledgment"; above $5,000 "Non-cash gifts above $5,000 may need a qualified appraisal".
- Banner at the top of the section: "DEMO. Not a tax document."
- Donor block, shown only on the donor's own device: a small form (name, address) saved in `localStorage` key `osmo.donor` (wrap every access in try/catch), rendered on the receipt when present. Label it "Donor (entered on this device, never uploaded)".
- A "Print or save as PDF" button calling `window.print()`, plus a `@media print` rule in `globals.css` that hides navigation and shows only the receipt section.

Acceptance: the donation from T6 shows every field above; a non-charity payment shows no donation section; printing shows only the receipt.
Verification: gate for `web/`; manual check in the browser including print preview.
Files: `web/src/app/p/[hash]/receipt.tsx`, `web/src/app/globals.css`. Scope: M. Depends on: T5, T7.

### Checkpoint 2
- [ ] Whole-repo gate passes
- [ ] End to end on testnet or local: new wallet, donate, open the receipt, print it
- [ ] Review with the people who own the repo before Phase 3

---

## Phase 3: Recurring and records

### T9 [agent] Monthly gift
- [ ] Done

On the Give screen add a "Make it monthly" toggle. When on, instead of a single
`pay`, call `Osmo.createOrder(token, handle, value, firstAt, every, memo)` with
`firstAt` = now (unix seconds), `every` = 30 days in seconds, memo = the donation
note; then call `Osmo.runOrder(id)` once from the app so the first gift lands
without waiting for the keeper. Later periods are paid by `services/keeper.js`
(see its README to run it) or by anyone calling `runOrder`.
- Add `orders` (the most recent 60, same shape as the rest of `WireState`) to the shared state, read in `state-server.ts` like `requests`.
- Under the charity list show "My monthly gifts": the user's active orders (match `from` to the user's wallet), charity, amount, next due date, and a Cancel button calling `Osmo.cancelOrder(id)`.
- Explain in one line on the screen: "Cancel any time. Skipped months are not paid later."
- Note: the demo tokens give Osmo an unlimited allowance (see `src/DemoAsset.sol`), so no approval step is needed for them; for any other token the order would need an approval, which the demo does not offer.

Acceptance: creating a monthly gift pays once at once and appears in "My monthly gifts"; cancelling removes it; with the keeper running against a local chain and the clock advanced past 30 days, the second payment lands exactly once.
Verification: gate for `web/` and `services/`; manual local flow with `anvil` and `cast rpc evm_increaseTime 2592000` then `evm_mine`.
Files: `web/src/app/give/page.tsx`, `web/src/lib/state.ts`, `web/src/lib/state-server.ts`, `web/src/lib/store.tsx`. Scope: M. Depends on: T6.

### T10 [agent] Year-end summary
- [x] Done

Add `web/src/app/give/summary/page.tsx`: for a chosen calendar year (default
current), list every donation the user's wallet made to verified charities
(from the shared feed, recipient is a charity wallet), grouped by charity with
subtotals and a grand total in USD FMV (use `/api/fmv` per donation, batched and
cached; show "FMV unavailable" for gaps and exclude them from totals, saying so).
Same donor block, DEMO banner and print stylesheet as T8. Link it from the Give
screen.
Note on scope: the feed window is the most recent items (`sentBlocks` read). If
older gifts are out of the window, say "Shows gifts in the recent feed window"
rather than implying completeness.

Acceptance: after three donations to two charities the page shows two groups with correct subtotals and a total; print preview is clean.
Verification: gate for `web/`; manual.
Files: `web/src/app/give/summary/page.tsx`. Scope: M. Depends on: T8.

### Checkpoint 3
- [ ] Whole-repo gate passes
- [ ] Demo script rehearsed twice with two accounts

---

## Phase 4: Stretch (only after Checkpoint 3)

### T11 [agent] Gift a donation (claim link that lets the recipient choose the charity)
- [ ] Done

The contracts already support this: `createLink` / `claimLink` accept any `to`,
including a charity wallet. The app has no link screens yet, so this task builds
them. Split into three commits:
1. Create: on the Give screen, "Gift a donation": generate a fresh key in the browser (`generatePrivateKey`), call `Osmo.createLink(token, value, keyAddress, memo)`, show a URL `.../c#<privateKey>` (the key stays in the URL fragment, never sent to a server) and the link id (read `linkCount()-1` after the receipt, or parse `LinkCreated`).
2. Claim page `web/src/app/c/page.tsx`: reads the fragment, shows the gift and the verified charities; the recipient picks one; the page signs `Osmo.claimDigest(id, charityWallet)` with the link key (EIP-191 over the digest, see `services/relayer.js` and `services/test/services.test.js` for the exact signing call) and posts `{ id, to, sig }` to `/api/claim`.
3. `web/src/app/api/claim/route.ts`: re-verify the signature on the server (recover and compare to `links(id).key`), simulate `claimLink`, then send with `RELAYER_KEY` (same pattern and error handling as `api/welcome/route.ts`), capped by `allow("claim", 60)`. Only tokens that `Welcome.isAsset` and native MON are sponsored.
Reuse of `services/relayer.js` is not possible from the web package; copy the checks, not the code.

Acceptance: sender creates a $5 gift link; a second browser profile opens it, picks `openshelf`, and the charity wallet receives the asset; opening the link again shows "already claimed"; the sender can reclaim an unclaimed link.
Verification: gate for `web/` and `forge test`; manual two-profile flow.
Files: `web/src/app/c/page.tsx`, `web/src/app/api/claim/route.ts`, `web/src/app/give/page.tsx`. Scope: L (three commits). Depends on: T6.

---

## Wrap

### T12 [agent] README and demo script
- [x] Done (README section; no separate demo script yet)

Add a "Give" section to `README.md`: what it is, the receipt fields, the trust
model ("the curator checked; the hash proves the details did not change"), the
honest limits (fictional charities, DEMO receipts, not tax advice, real
charities need a custodian), how to run the seeds, and how the contracts and
screens fit together (copy the diagram from `tasks/plan.md`). Add
`tasks/give-demo.md` with a 90-second two-account demo script. Do not claim any
legal or tax compliance.

Acceptance: a new reader can run the local flow from the README alone.
Verification: follow the README on a clean checkout; `forge fmt --check` unaffected.
Files: `README.md`, `tasks/give-demo.md`. Scope: S. Depends on: T8 (T9 to T11 optional).

---

## Owner checklist (people, not agents)

- [ ] Deploy `Charities` to Monad testnet with the wallet that owns `Welcome`; commit the updated `deployments/monad-testnet.json`.
- [ ] Run `seed:charities` with the curator key from the Keychain.
- [ ] Redeploy the web app so it picks up `config.charities`.
- [ ] Decide whether the repo goes public, and confirm any claim in the README about organizer permission is true first.
