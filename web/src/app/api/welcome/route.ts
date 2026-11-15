import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { welcomeAbi } from "@/lib/abi";
import { config } from "@/lib/config";
import { publicClient, walletFor } from "@/lib/chain";

/**
 * Sign-up, server side: the app's relayer calls Welcome.welcome(address), which gives the new phone wallet its
 * starter kit and a little MON for gas, in one transaction. The relayer key never reaches the browser.
 */
export async function POST(req: Request) {
  const key = process.env.RELAYER_KEY as `0x${string}` | undefined;
  if (!key) return Response.json({ error: "The server has no RELAYER_KEY set." }, { status: 500 });
  const { address, profile = "" } = (await req.json().catch(() => ({}))) as { address?: string; profile?: string };
  if (!address || !isAddress(address)) return Response.json({ error: "Send a wallet address." }, { status: 400 });

  if (config.welcome === "0x0000000000000000000000000000000000000000")
    return Response.json({ error: "Osmo isn't deployed on this network yet. Run script/Deploy.s.sol, then npm run contracts." }, { status: 503 });

  const already = await publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "welcomed", args: [address] });
  if (already) return Response.json({ ok: true, already: true });

  try {
    const started = Date.now();
    const receipt = await walletFor(privateKeyToAccount(key)).writeContractSync({
      address: config.welcome,
      abi: welcomeAbi,
      functionName: "welcome",
      args: [address, String(profile).slice(0, 120)],
    });
    return Response.json({ ok: receipt.status === "success", hash: receipt.transactionHash, ms: Date.now() - started });
  } catch (e) {
    return Response.json({ error: friendly(e) }, { status: 500 });
  }
}

/** Turn the usual failures into a sentence someone at a demo table can act on. */
function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/insufficient funds|gas required exceeds|InsufficientBalance/i.test(m)) return "The app's sign-up wallet is out of MON. Top it up from the Monad faucet and try again.";
  if (/NotOperator/.test(m)) return "The server's wallet isn't allowed to sign people up. Deploy with RELAYER set to it.";
  if (/fetch failed|ECONN|timeout|429/i.test(m)) return "Couldn't reach Monad just now. Try again in a few seconds.";
  return m.split("\n")[0].slice(0, 160);
}
