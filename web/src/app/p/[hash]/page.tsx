import { Suspense } from "react";
import { Receipt } from "./receipt";

export default function Page({ params }: { params: Promise<{ hash: string }> }) {
  return (
    <Suspense fallback={null}>
      <Receipt params={params} />
    </Suspense>
  );
}
