import { NextResponse } from "next/server";

import { clearSessionCookie, logoutUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await logoutUser(request);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
