import { NextResponse } from "next/server";

import { getAuthStatus } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json(await getAuthStatus(request));
}
