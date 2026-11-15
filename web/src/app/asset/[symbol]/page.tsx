import { Suspense } from "react";
import { AssetScreen } from "./asset-screen";

export default function Page({ params }: { params: Promise<{ symbol: string }> }) {
  return (
    <Suspense fallback={null}>
      <AssetScreen params={params} />
    </Suspense>
  );
}
