import { NextResponse } from "next/server";
import { z } from "zod";

import { attachSession, registerUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  locale: z.enum(["zh", "en"]).optional(),
});

function localeFromRequest(request: Request, locale?: "zh" | "en") {
  if (locale) {
    return locale;
  }
  return request.headers.get("accept-language")?.toLowerCase().includes("zh") ? "zh" : "en";
}

function errorMessage(locale: "zh" | "en", code: string) {
  if (code === "EMAIL_EXISTS") {
    return locale === "zh" ? "这个邮箱已经注册，请直接登录。" : "This email is already registered. Please log in.";
  }
  return locale === "zh" ? "注册失败，请检查邮箱和密码。" : "Registration failed. Check your email and password.";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  const locale = localeFromRequest(request, body?.locale);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: locale === "zh"
          ? "请输入有效邮箱，密码至少 8 位。"
          : "Enter a valid email and a password of at least 8 characters.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const { user, token } = await registerUser(parsed.data.email, parsed.data.password);
    return attachSession(NextResponse.json({ user }), token);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(locale, (error as Error).message) },
      { status: (error as Error).message === "EMAIL_EXISTS" ? 409 : 400 },
    );
  }
}
