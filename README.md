# Osmo

*Named for osmosis: value that slips through the walls between people,
apps and borders.*

**Send someone a fraction of a share, or some MON, by name. Say what it was
for. Or send it as a link to someone who has no wallet yet.**

Built for Monad Blitz Oregon, 2026-11-15. Live on Monad testnet.

## Why

Sending a friend a little stock is still a walled garden.

- Cash App lets you send stock by $cashtag, but only inside Cash App, only
  in the US, and the recipient needs a Cash App Investing account.
- Between brokerages, fractional shares cannot be transferred at all. ACATS
  moves whole shares only.
- Tokenized stocks move freely on-chain, and then there is no name, no note
  and no feed. You paste an address and hope.

Osmo is the missing layer: a name instead of an address, a note
instead of a bare transfer, and an agent that can act for you only inside
limits the contract enforces.

## How it works

1. **Claim a name.** One username per address, first come first served,
   case-insensitive.
2. **Send.** `sendToken(share, "alice", 0.25e18, "quarter share, happy
   birthday")`. A quarter of a share with a note.
3. **Or send MON.** `sendNative("alice", "dinner")`.
4. **Or tell your agent.** Authorize one agent, cap it per send and per day
   per token. It can never exceed the caps or reach an unclaimed name, and
   one transaction revokes it.
5. **Or write it once.** `createOrder(share, "alice", 0.25e18, firstAt,
   7 days, "weekly quarter share")` is a standing order. Anyone may trigger
   it when it falls due, and whoever does chooses nothing.
6. **Or send a link.** `createLink(share, 0.25e18, key, "welcome")` puts
   the value behind a link that carries a fresh private key. Whoever opens
   the link claims it to any wallet, even one made a second ago, and until
   then the sender can take it back.

Every send emits the same `Sent` event with the note attached.

## How it uses Monad

**A feed with no indexer.** The feed is the heart of the app, and on Monad
it cannot be read by scanning the event log: the public RPC answers
`eth_getLogs` for 100 blocks at a time. We measured 0.31 seconds per block
on testnet (10,000 blocks, 2026-11-15), so that is about half a minute of
chain.

So `Osmo` keeps one array, `sentBlocks`: every block that holds at
least one send. The client reads the last 25 entries and asks for exactly
those blocks. The app ships with no indexer, no backend and no API key.

```solidity
modifier inFeed() {
    _;
    uint256 n = sentBlocks.length;
    if (n == 0 || sentBlocks[n - 1] != block.number) sentBlocks.push(uint64(block.number));
}
```

The cost, stated up front: every send touches one shared array, which is a
slot Monad's parallel execution has to retry around. That is fine for a
demo and wrong at volume. The real version drops the array and builds the
feed from a Stream on `Sent`.

**Sends that feel like a message.** At a third of a second per block, a
send confirms about as fast as a text delivers. Each one below cost between
0.005 and 0.02 MON.

**Gas is MON, and a claim link removes the first wall.** Anyone may submit
a claim, so a newcomer with an empty wallet can be paid for by the sender
or a relayer. Sending onward still needs MON, so the demo accounts are
pre-funded.

## Contracts

| Contract | What it does |
| --- | --- |
| `MockShare` | Stand-in for a tokenized stock on testnet |
| `UsernameRegistry` | One name per address, case-insensitive, reverts on an unclaimed name |
| `Osmo` | Send any token or MON by name, with a note, as yourself, as someone's agent, by standing order, or as a claim link |

`Osmo` has no owner and sends the token you already hold: no
wrapper, no allowlist. The only value it ever holds is unclaimed links,
each owed to its link holder or back to its sender. Every other send moves
value in the same transaction it receives the instruction.

## Agent safety limits

The limits are in the contract, not in the prompt.

| Limit | Enforced by |
| --- | --- |
| One agent per user, named by the user | `agentOf`, set only by the user |
| A cap per single send, per token | `OverPerSendLimit` |
| A cap per day, per token | `OverDailyLimit`, reset by UTC day |
| Both caps default to zero | A fresh agent can send nothing until the user sets a limit |
| Can only send to a claimed username | `mustResolve` reverts otherwise |
| Cannot send the native balance | Nothing can pull MON from a user's account |
| Revocable at once, for every token | `authorizeAgent(address(0))` |

## Standing orders

| Rule | Enforced by |
| --- | --- |
| Only you write or cancel your order | `createOrder`, `cancelOrder` (`NotYourOrder`) |
| It can only reach a claimed name | The name is resolved when the order is written |
| It pays once per period at most | `runOrder` reverts with `NotDue` until the next slot |
| A period nobody triggered is skipped, never paid twice later | `nextAt` jumps to the next future slot |
| You can stop it without touching the order | Lower the token allowance and `runOrder` reverts |

Orders are for tokens only. The interval is a fixed number of seconds.

## Claim links

| Rule | Enforced by |
| --- | --- |
| The link's secret is a fresh key, and only its address goes on chain | `createLink` stores `key`; the private half lives in the URL fragment, which browsers never send to a server |
| A claim names its recipient, so one seen in flight cannot be redirected | The key signs `claimDigest(id, to)`; any other `to` reverts with `BadClaimSignature` |
| Anyone may submit the claim, so the recipient needs no gas | `claimLink` checks the signature, not the caller |
| One claim per link | The link is zeroed before paying; a second claim reverts with `NoSuchLink` |
| The sender can take back an unclaimed link at any time | `reclaimLink`, sender only (`NotYourLink`) |

Whoever holds the link can claim it, so it should be shared like cash:
only with the person it is for.

## Deployed addresses

Monad testnet, chain ID 10143. The registry and the share were deployed
on 2026-11-15 from block 80017489, and `Osmo` in block 80023566.

| Contract | Address |
| --- | --- |
| `Osmo` | `0xC2f251c89Fac09830dadAb1Fc67Da885F01Bb45e` |
| `UsernameRegistry` | `0xC90654Fe34e37dd30F54f980407F1973F7959EE3` |
| `MockShare` | `0xc8045312f9739E980A6f8208Ea25aF2FDA2558EA` |

Addresses and ABIs are also in `deployments/monad-testnet.json`.

## Rehearsed on Monad testnet

Run on 2026-11-15 from the deployer account, which claimed the name
`deployer` and sent to itself. Cost is the account's MON balance before
and after, at about 103 gwei.

| What | Transaction | Cost in MON |
| --- | --- | --- |
| Claim a name | `0x0802473f080aee7fcc4fcb4375396843bf880dc6084dfb3853b10297120a511b` | 0.0087 |
| Send a quarter share with a note | `0x4aaed55e7c77bd9f2bf0386b134edcbf3a2f27351f6d4887d53a22f6e163a9ad` | 0.0148 |
| Send 0.01 MON with a note, to itself | `0x2ca04d9b9423c3d1b0b1469c3f8864008f4d89808af111142f1ef4b3bfdf24a6` | 0.0083 |
| Write a weekly order | `0x73cf9155d9354fa3080243ad2b4da4696f3579b1305f42e24393c50a7f835d38` | 0.0214 |
| Run it | `0xbbffb56be2fce5c075d6025455bd55bbd3af76f900f3bf6921939773b19c97bc` | 0.0101 |
| Cancel it | `0x1d99ef937efd2a957ef300d80a31a1613d54a37de87feaf172a20ea6357b4f3e` | 0.0051 |
| Put a quarter share behind a link | `0x4b454c8662885e6be80f10eb13be9a54487a623e57a85529ae72a0e34fd4f520` | 0.0269 |
| Claim it to `bob`, gas paid by the deployer | `0xc3734e30044bcf03da842f075f7c9da7084451e9a9871b5d849ebc4b263a5e3b` | 0.0147 |
| Put 0.01 MON behind a link | `0x2edf00957976b5581f25080446904be7c9579ae563d351f4631373e6bfd8a266` | 0.0123 plus the 0.01 |
| Take it back | `0x9cd702166a1332214bd585948fec3b01f76f400fb65b917f90a5dd5dcaa3a06e` | 0.0054 |

A second run in the same period reverted with `NotDue`, and a run after
the cancel reverted with `NoSuchOrder`. Submitting the link's signature
for `bob` with a different recipient reverted with `BadClaimSignature`.
Bob's share balance rose by exactly 0.25, and the contract held nothing
afterwards. `sentBlocks` holds the four blocks of the four sends.

## Run it

```bash
git clone --recurse-submodules <this repo>
forge build
forge test
```

Deploy:

```bash
# one time: import the deployer into Foundry's encrypted keystore
cast wallet import monad-deployer --interactive

forge script script/Deploy.s.sol:Deploy \
  --rpc-url monad_testnet \
  --account monad-deployer \
  --broadcast
```

Never pass a private key on the command line.

## The demo client

`demo/index.html` is one file: ethers from a CDN, no build step, no
framework.

```bash
cd demo && python3 -m http.server 8000
```

It carries two throwaway testnet accounts instead of a wallet connector,
because mobile wallet deep linking is what breaks live demos. Pick "as
alice" or "as bob" and send. Those keys live in `demo/demo-keys.js`, which
is gitignored and holds nothing of value:

```js
window.DEMO_KEYS = { alice: "0x...", bob: "0x..." };
```

## What is real and what is mocked

| Piece | In this repo | The real version |
| --- | --- | --- |
| Tokenized stock | `MockShare` on testnet | A real tokenized share |
| Usernames | On-chain, first come first served | The same, plus recovery and a dispute process |
| Agent caps and standing orders | Enforced on-chain, not mocked | The same |
| The agent itself | Not built: nothing parses a text or triggers a due order yet, a person presses Run | An off-chain agent that reads messages and runs due orders |
| Feed | Read from `sentBlocks` and the event log | A Stream on `Sent` into a store |
| Claim link gas | The claimant's own account pays in the demo | A relayer submits the claim, so a newcomer needs no MON |

The honest limit: this moves a tokenized claim, not the registered share.
Whether the holder is a shareholder of record is the issuer's and the
transfer agent's call.

## The phone app (`web/`)

Written at the Blitz on 2026-11-15, from an empty `create-next-app`: a phone-first web app (Next.js 16, React 19,
Tailwind 4, viem) that talks straight to the contracts above. The product and its look come from our UBC Hackathon
project, with the organizer's OK. The code was written again here today. The only files carried over are images:
the asset logos (the companies' own marks), the profile pictures (Google's Noto emoji, Apache 2.0, and pixel-art
faces drawn by our own generator script) and our logo.

**Screens**

| Screen | What it does on Monad |
| --- | --- |
| Welcome | Navy splash, then "Make it yours": a pixel NFT or cartoon character, a name, @username (checked on-chain as you type), an optional country flag and an "I understand" box. "Create my account" makes a wallet on the phone, the server calls `Welcome.welcome(address, profile)` (starter kit, MON for gas, profile, one transaction), and the phone claims the name in `UsernameRegistry`. Each step shows its time in milliseconds |
| Tab bar | Home, Friends, the logo button for Pay/Request, Portfolio, and Me (your picture, with a red dot when a request waits) |
| Home | Search and your code, a time-of-day greeting, your people, Portfolio and Stablecoins cards (with Add money), "Requests waiting", the Monad Blitz Oregon builders with Add buttons, and a Friends / Everyone feed read from Taihl's `sentBlocks` index. Feed cards: who paid whom and for what, the asset sent, Pay again or Say thanks, emoji reactions, double-tap to like |
| Friends | Search, suggested people, your friends (anyone you've paid or been paid by, plus people you added) and the Blitz builders |
| Pay | Pick a person (Recent, Friends, More people, Blitz builders not yet joined), type an amount and a note on the keypad with emoji shortcuts, then **Request** or **Pay**. Pay opens the pay-with list (stablecoins first, then your portfolio, grayed out when it isn't enough) and "Buy something to send". One Confirm screen with Public or Private. `Osmo.sendToken` (or `sendNative` for MON) moves exactly that asset with `eth_sendRawTransactionSync`; the success screen says "Settled on Monad in N ms" with the fee |
| Requests | `Welcome.request` puts a money request on-chain; the payer sees it on Home and Me and pays or declines; paying closes it |
| Buy | Pick an asset by market, an amount and a method (Apple Pay, card, Venmo, PayPal, Cash App, bank, wallet). Demo only: no real money moves, the server mints the test asset through `Welcome.grant`, capped at $100 |
| Portfolio | Total with today's move, a chart of what you hold at real prices over 1D / 1W / 1M (drag to scrub), Add money / Buy / Send, "What you hold" mix, holdings by group, markets you don't hold, and a hide-amounts eye |
| Markets | All 24 assets with live prices, "Moving today", 7-day lines, filters, search and sorting; each has an asset page with a chart |
| Payment page | `/p/<tx hash>`: who paid whom, what, when, the fee and the block, read from the transaction itself |
| Profiles | Picture, name, flag, Pay or request, Add friend, their portfolio (total and each holding as a share), "Between you" and their payments |
| Me | Notifications, settings, your code, Live on Monad (the room screen), your profile, requests and your activity |

Friends, reactions and the hide-amounts switch are kept on the phone. Payments, profiles, the member list and requests are on Monad.

**People in the demo**

- Eight sample people (Ana, Wes, Sabina, Maya, Jordan, Dev, Priya, Zoe) are real accounts on Monad, made by
  `web/scripts/seed-demo.mjs` with their own wallets, usernames and a few payments between them. Their keys are
  derived from a public string on purpose; they only hold test tokens.
- The builders at Monad Blitz Oregon are listed by name, with their permission. Their usernames are **not**
  claimed for them: each one turns into a real account the moment that person signs up on their own phone.

**Contracts added for the app**

| Contract | What it does |
| --- | --- |
| `DemoAsset` | One test token per asset: USDC, USDT, PYUSD, DAI, EURC, NVDA, TSLA, AAPL, GOOGL, AMZN, META, MSFT, NFLX, COIN, CRCL, PAXG, XAUT, KAG, USDY, BUIDL, BTC, ETH, SOL. Deployed once and cloned (EIP-1167) for each asset so listing 23 is cheap. Mintable only by `Welcome`; `Osmo` can move it without an approval, so paying is one transaction |
| `Welcome` | Lists the demo assets; once per wallet gives a starter kit ($25 USDC, $15 NVIDIA, $10 Tesla, $10 Bitcoin at today's prices) and MON for gas; keeps the member list, each member's profile and money requests on-chain so the app can list them without scanning logs; `grant` lets the server fill simulated Buys |

Deploy next to the existing contracts with `script/DeployApp.s.sol`:
`OSMO=0xC2f251c89Fac09830dadAb1Fc67Da885F01Bb45e RELAYER=<server wallet> forge script script/DeployApp.s.sol:DeployApp --rpc-url monad_testnet --account <deployer> --broadcast`.
Addresses: **to be filled in after the Monad deploy.**

"Private" puts a marker in front of the note so the app shows the payment only to the two people. The chain is public
either way, and the app says so.

**Why Monad**

- Sub-second blocks plus `eth_sendRawTransactionSync`: the phone gets the receipt in the same request, so a payment
  feels like a tap. The receipt screen shows the real number.
- Fees are low enough that the app pays each newcomer's gas and starter kit, so nobody in the room sees a wallet,
  a faucet or a seed phrase.
- Every person signs their own payments from their own wallet, so a room of phones paying at once is many
  independent senders, the load Monad's parallel execution is built for.

**Run it**

```bash
cd web
cp .env.example .env.local   # set NEXT_PUBLIC_WELCOME and RELAYER_KEY (server only, never committed)
npm install
node --env-file=.env.local scripts/seed-demo.mjs   # once per deploy: the eight sample people and their payments
npm run dev
```

Prices come from CoinGecko through `/api/prices`, cached for a minute; dollar coins are pinned to $1. The phone
wallet is kept in the browser's local storage: fine for a testnet demo, never for real money.

## Licence

MIT.
