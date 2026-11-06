import { StepUp } from "@/components/step-up";
export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <StepUp id={sessionId} />;
}
