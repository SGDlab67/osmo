# Osmo phone app

The Next.js app in this folder is the Osmo phone app. The top-level [README](../README.md) explains what it does and
how it uses Monad.

```bash
npm ci
npm run dev                 # http://localhost:3000, against Monad testnet (addresses from ../deployments)
npm run contracts           # regenerate src/lib/contracts.ts after a deploy (needs `forge build` in the repo root)
npm run seed                # sample people and payments (needs RELAYER_KEY in .env.local)
npm run seed:charities      # list the nonprofits in Charities (needs CURATOR_KEY for the command)
```

`RELAYER_KEY` (the app server's wallet, an operator of `Welcome`) goes in `.env.local` locally and in the Vercel
project's environment variables. It is never committed.

Move an existing testnet account to a phone by opening the app with `#import=<private key>`; the fragment never
reaches the server. Testnet only.
