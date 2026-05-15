import { NextResponse } from "next/server";
import { z } from "zod";

import { attachSession, loginUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  locale: z.enum(["zh", "en"]).optional(),
});

function localeFromRequest(request: Request, locale?: "zh" | "en") {
  if (locale) {
    return locale;
  }
  return request.headers.get("accept-language")?.toLowerCase().includes("zh") ? "zh" : "en";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  const locale = localeFromRequest(request, body?.locale);

  if (!parsed.success) {
    return NextResponse.json(
      { error: locale === "zh" ? "请输入有效邮箱和密码。" : "Enter a valid email and password." },
      { status: 400 },
    );
  }

  try {
    const { user, token } = await loginUser(parsed.data.email, parsed.data.password);
    return attachSession(NextResponse.json({ user }), token);
  } catch {
    return NextResponse.json(
      { error: locale === "zh" ? "邮箱或密码不正确。" : "Email or password is incorrect." },
      { status: 401 },
    );
  }
}
