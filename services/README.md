# Services

Three small processes that sit next to the contract. Each runs on its own, with
its own key, so a bug in one cannot touch another.

| Role | What it does | Key |
| --- | --- | --- |
| `keeper` | Presses Run on standing orders that have fallen due | `osmo-keeper-key` |
| `relayer` | Pays the gas for claim links, so a newcomer needs no MON | `osmo-relayer-key` |
| `notifier` | Pushes "you got paid" to the recipient | none |

```bash
cd services && npm ci --ignore-scripts
node run.js keeper      # or relayer, or notifier
npm test                # needs `forge build` and `anvil`
```

Keys live in the macOS Keychain and are read at start, never from a file, the
command line or the environment. Create one without printing it:

```bash
security add-generic-password -a "$USER" -s osmo-keeper-key -w   # prompts, hidden
```

The RPC defaults to the public Monad testnet endpoint. To use a private one
(its URL carries an access token), store it the same way as
`quicknode-monad-testnet-url` and the services pick it up. The URL is
registered as a secret and scrubbed from every log line.

## Why these are safe to run

None of the three has any authority over anyone's funds. `runOrder` and
`claimLink` are open to anyone and pay only what the order's or link's creator
wrote, so the most a hot key can lose is gas. Everything below bounds that.

| Risk | Control |
| --- | --- |
| A reverted Monad transaction still pays its gas limit | Every send is simulated first; a doomed send costs nothing |
| Gas limit is billed, so a loose limit wastes money | Limit is the estimate plus 20 percent, refused above 250,000 |
| The RPC quotes an absurd fee | Refused above 1,000 gwei |
| Strangers drain the relayer | Daily budget (0.5 MON, kept across restarts), per-IP and global rate limits, one claim per link at a time |
| A hostile token burns gas or reverts on claim | The relayer sponsors only native links and an allowlist of tokens |
| A forged or redirected claim | The signature is checked off chain before any gas is spent, and the contract binds the recipient to it |
| Malformed requests | Shape checks first, 1 KB body cap, 5 s timeouts, loopback bind, CORS only for listed origins |
| Two sends racing on one nonce | One transaction at a time per process |
| Stale reads | The provider cache is off; due time uses the latest block's timestamp, the contract's own clock |
| Secrets in logs | Keys and the RPC URL are registered and scrubbed; only error names are logged |
| Wrong chain or missing contract | Checked at start; the process refuses to run |
| Duplicate or missed pushes | Cursor moves after a chunk is handled, recent payments are remembered, history is not replayed on first start |

## Known ceilings

- The keeper reads every order each tick. Fine for tens of orders; follow
  `OrderCreated` into a queue sorted by due time beyond that.
- The rate limiter keys on the socket address, so behind a proxy all callers
  share one bucket. Trust `X-Forwarded-For` only once the proxy is ours.
- ntfy topics have no access control, so anyone who computes a recipient's
  topic can publish a fake push. Every push links to the explorer, which is
  the source of truth. For real use, self-host ntfy with access tokens.
- Events are polled, not streamed. A stream needs an inbound HTTPS endpoint
  and so an attack surface a laptop should not have; the same handlers can sit
  behind a signed webhook later.
