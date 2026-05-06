import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_PLACES_DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places";

function message(locale: "zh" | "en", zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function resolveLocale(locale: string | null) {
  return locale?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function googleLanguageCode(locale: "zh" | "en") {
  return locale === "zh" ? "zh-CN" : "en";
}

type GooglePlaceDetailsResponse = {
  id?: string;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  displayName?: {
    text?: string;
  };
  error?: {
    message?: string;
    status?: string;
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawPlaceId = url.searchParams.get("placeId")?.trim() || "";
  const placeId = rawPlaceId.replace(/^places\//, "");
  const locale = resolveLocale(url.searchParams.get("locale"));
  const sessionToken = url.searchParams.get("sessionToken")?.trim() || "";
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (!placeId || !/^[A-Za-z0-9_-]+$/.test(placeId)) {
    return NextResponse.json({ error: "Invalid placeId." }, { status: 400 });
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

  const detailsUrl = new URL(`${GOOGLE_PLACES_DETAILS_ENDPOINT}/${encodeURIComponent(placeId)}`);
  detailsUrl.searchParams.set("languageCode", googleLanguageCode(locale));
  detailsUrl.searchParams.set("regionCode", "CA");
  if (sessionToken) {
    detailsUrl.searchParams.set("sessionToken", sessionToken);
  }

  try {
    const response = await fetch(detailsUrl, {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": "id,formattedAddress,location,displayName",
      },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as GooglePlaceDetailsResponse | null;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error?.message ||
            message(
              locale,
              `Google Maps 地址详情服务返回错误 (${response.status})。`,
              `Google Maps address details service returned an error (${response.status}).`,
            ),
        },
        { status: response.status },
      );
    }

    const formattedAddress = payload?.formattedAddress || payload?.displayName?.text || "";

    return NextResponse.json({
      suggestion: {
        placeId: payload?.id || placeId,
        text: formattedAddress,
        mainText: payload?.displayName?.text || formattedAddress,
        secondaryText:
          payload?.displayName?.text && formattedAddress !== payload.displayName.text
            ? formattedAddress
            : "",
        formattedAddress,
        latitude: payload?.location?.latitude,
        longitude: payload?.location?.longitude,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : message(locale, "Google Maps 地址详情请求失败。", "Google Maps address details request failed."),
      },
      { status: 500 },
    );
  }
}
