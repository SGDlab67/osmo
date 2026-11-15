# stablegram

**Send someone a fraction of a share, or some MON, by name. Say what it was
for. Or write it once and let anyone press the button when it is due.**

Built for Monad Blitz Oregon, 2026-11-15. Live on Monad testnet.

## Why

Sending a friend a little stock is still a walled garden.

- Cash App lets you send stock by $cashtag, but only inside Cash App, only
  in the US, and the recipient needs a Cash App Investing account.
- Between brokerages, fractional shares cannot be transferred at all. ACATS
  moves whole shares only.
- Tokenized stocks move freely on-chain, and then there is no name, no note
  and no feed. You paste an address and hope.

stablegram is the missing layer: a name instead of an address, a note
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

Every send emits the same `Sent` event with the note attached.

## How it uses Monad

**A feed with no indexer.** The feed is the heart of the app, and on Monad
it cannot be read by scanning the event log: the public RPC answers
`eth_getLogs` for 100 blocks at a time. We measured 0.31 seconds per block
on testnet (10,000 blocks, 2026-11-15), so that is about half a minute of
chain.

So `Stablegram` keeps one array, `sentBlocks`: every block that holds at
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

**Gas is MON.** A recipient who wants to send onward needs MON first. The
demo accounts are pre-funded for that reason.

## Contracts

| Contract | What it does |
| --- | --- |
| `MockShare` | Stand-in for a tokenized stock on testnet |
| `UsernameRegistry` | One name per address, case-insensitive, reverts on an unclaimed name |
| `Stablegram` | Send any token or MON by name, with a note, as yourself, as someone's agent, or by standing order |

`Stablegram` holds no balance and has no owner. It moves value in the same
transaction it receives the instruction, and it sends the token you
already hold: no wrapper, no allowlist.

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

## Deployed addresses

Monad testnet, chain ID 10143, deployed 2026-11-15 from block 80017489.

| Contract | Address |
| --- | --- |
| `Stablegram` | `0x535115B527C6c51c6Bf73B72579308b0ACe69847` |
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
| Send a quarter share with a note | `0xa03b9f040fd0f04b5173851bacdd69a1b428682ac13a52af8883567bfe7fe93e` | 0.0145 |
| Send 0.01 MON with a note | `0x7ff162c0a4d1f3ac8843377afb37b130b4b4ae1ffb6586e60c0e06b498c0ba54` | 0.0083 |
| Write a weekly order | `0x5adbc7d7362924596454e3fd13428141bfd1e1971ae032773a8545d3b8f3bf76` | 0.0201 |
| Run it | `0xf1f7f26a2b61ad00214fd72fb20f92e1fd79f0128104e73a17d483a0f368e8b9` | 0.0099 |
| Cancel it | `0x7bae3f2db41d2561b0155f33e47e2b11cce5020c86bb583f4303aeab886b1e79` | 0.0046 |

A second run in the same period reverted with `NotDue`, and a run after
the cancel reverted with `NoSuchOrder`. `sentBlocks` then held the three
blocks of the three sends, and the demo client's feed listed all three.

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

The sender picks the word on the send button: Kula, Nomad, Lixi, Volo or
Osmo. The word is the voice of the send, not a different transaction; all
five make the same call.

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

The honest limit: this moves a tokenized claim, not the registered share.
Whether the holder is a shareholder of record is the issuer's and the
transfer agent's call.

## Licence

MIT.
