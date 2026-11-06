import { AuthGate } from "@/components/auth-gate";
import { SessionDetail } from "@/components/session-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate>
      <SessionDetail id={id} />
    </AuthGate>
  );
}
