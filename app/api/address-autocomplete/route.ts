import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function message(locale: "zh" | "en", zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function resolveLocale(locale: string | null) {
  return locale?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function googleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = url.searchParams.get("input")?.trim() || "";
  const locale = resolveLocale(url.searchParams.get("locale"));
  const sessionToken = url.searchParams.get("sessionToken")?.trim() || "";

  if (input.length < 3) {
    return NextResponse.json({ suggestions: [] });
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
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input,
        sessionToken,
        includeQueryPredictions: false,
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          suggestions?: Array<{
            placePrediction?: {
              placeId?: string;
              text?: { text?: string };
              structuredFormat?: {
                mainText?: { text?: string };
                secondaryText?: { text?: string };
              };
            };
          }>;
          error?: { message?: string };
        }
      | null;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error?.message ||
            message(locale, "Google 地址建议请求失败。", "Google address suggestion request failed."),
        },
        { status: response.status },
      );
    }

    const suggestions = (payload?.suggestions || [])
      .map((item) => item.placePrediction)
      .filter((item): item is NonNullable<typeof item> => Boolean(item?.placeId && item.text?.text))
      .map((item) => ({
        placeId: item.placeId!,
        text: item.text?.text || "",
        mainText: item.structuredFormat?.mainText?.text || item.text?.text || "",
        secondaryText: item.structuredFormat?.secondaryText?.text || "",
      }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : message(locale, "Google 地址建议请求失败。", "Google address suggestion request failed."),
      },
      { status: 500 },
    );
  }
}
