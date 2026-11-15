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
    return Response.json({ error: e instanceof Error ? e.message.split("\n")[0] : "Welcome failed" }, { status: 500 });
  }
}
