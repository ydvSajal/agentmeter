import { handleWorldCallback } from "@/lib/world-callback";
import { fixtureMode } from "@/lib/config";
export async function GET(request: Request) {
  return handleWorldCallback(request, {
    gateway:
      process.env.GATEWAY_SERVER_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL,
    fixture: fixtureMode,
  });
}
