import { Suspense } from "react";
import { ProfileScreen } from "./profile-screen";

export default function Page({ params }: { params: Promise<{ handle: string }> }) {
  return (
    <Suspense fallback={null}>
      <ProfileScreen params={params} />
    </Suspense>
  );
}
