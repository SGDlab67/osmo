import { getQuotes } from "@/lib/prices-server";

export async function GET() {
  return Response.json(await getQuotes());
}
