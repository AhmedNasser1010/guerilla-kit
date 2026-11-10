export const runtime = "nodejs";

import { getProgress } from "@/lib/progress";

export async function GET() {
  return Response.json(getProgress());
}