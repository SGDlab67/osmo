import { Suspense } from "react";
import { Markets } from "./markets";

export default function MarketsPage() {
  return (
    <Suspense fallback={null}>
      <Markets />
    </Suspense>
  );
}
