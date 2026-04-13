import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  placeId: z.string().min(1),
  sessionToken: z.string().trim().optional(),
  locale: z.enum(["zh", "en"]).optional(),
});

function message(locale: "zh" | "en", zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function googleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  const locale = body?.locale === "en" ? "en" : "zh";

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: message(locale, "地址参数不正确。", "The address request payload is invalid."),
      },
      { status: 400 },
    );
  }

  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        code: "MISSING_API_KEY",
        error: message(
          locale,
          "Google Maps 地址建议尚未启用。",
          "Google Maps address suggestions are not enabled yet.",
        ),
      },
      { status: 503 },
    );
  }

  try {
    const detailsUrl = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(parsed.data.placeId)}`);

    if (parsed.data.sessionToken) {
      detailsUrl.searchParams.set("sessionToken", parsed.data.sessionToken);
    }

    const response = await fetch(detailsUrl, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,formattedAddress,location",
      },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          id?: string;
          formattedAddress?: string;
          location?: {
            latitude?: number;
            longitude?: number;
          };
          error?: { message?: string };
        }
      | null;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error?.message ||
            message(locale, "Google 地址详情请求失败。", "Google address details request failed."),
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      placeId: payload?.id || parsed.data.placeId,
      formattedAddress: payload?.formattedAddress || "",
      location: payload?.location || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : message(locale, "Google 地址详情请求失败。", "Google address details request failed."),
      },
      { status: 500 },
    );
  }
}
