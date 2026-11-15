"use client";

import { useRequireAccount } from "@/lib/hooks";
import { RequestCards } from "@/components/request-cards";
import { BackHeader, Screen } from "@/components/shell";

export default function RequestsPage() {
  const ok = useRequireAccount();
  if (!ok) return null;
  return (
    <Screen tabs={false}>
      <BackHeader title="Requests" fallback="/" />
      <div className="px-4 pb-10 pt-2">
        <RequestCards showEmpty />
      </div>
    </Screen>
  );
}
