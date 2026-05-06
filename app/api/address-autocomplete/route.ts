import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_PLACES_AUTOCOMPLETE_ENDPOINT = "https://places.googleapis.com/v1/places:autocomplete";

function message(locale: "zh" | "en", zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function resolveLocale(locale: string | null) {
  return locale?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function googleLanguageCode(locale: "zh" | "en") {
  return locale === "zh" ? "zh-CN" : "en";
}

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: {
        text?: string;
      };
      structuredFormat?: {
        mainText?: {
          text?: string;
        };
        secondaryText?: {
          text?: string;
        };
      };
    };
  }>;
  error?: {
    message?: string;
    status?: string;
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = url.searchParams.get("input")?.trim() || "";
  const locale = resolveLocale(url.searchParams.get("locale"));
  const sessionToken = url.searchParams.get("sessionToken")?.trim() || "";
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (input.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        error: message(
          locale,
          "Google Maps API key 未配置，请设置 GOOGLE_MAPS_API_KEY。",
          "Google Maps API key is not configured. Set GOOGLE_MAPS_API_KEY.",
        ),
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input,
        languageCode: googleLanguageCode(locale),
        regionCode: "CA",
        includeQueryPredictions: false,
        ...(sessionToken ? { sessionToken } : {}),
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as GoogleAutocompleteResponse | null;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error?.message ||
            message(
              locale,
              `Google Maps 地址建议服务返回错误 (${response.status})。`,
              `Google Maps address suggestion service returned an error (${response.status}).`,
            ),
        },
        { status: response.status },
      );
    }

    const suggestions = (payload?.suggestions || [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId))
      .map((prediction) => {
        const mainText = prediction.structuredFormat?.mainText?.text || prediction.text?.text || "";
        const secondaryText = prediction.structuredFormat?.secondaryText?.text || "";
        const text = prediction.text?.text || [mainText, secondaryText].filter(Boolean).join(", ");

        return {
          placeId: prediction.placeId,
          text,
          mainText,
          secondaryText,
          formattedAddress: text,
        };
      })
      .filter((suggestion) => Boolean(suggestion.text))
      .slice(0, 8);

    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : message(locale, "Google Maps 地址建议请求失败。", "Google Maps address suggestion request failed."),
      },
      { status: 500 },
    );
  }
}
