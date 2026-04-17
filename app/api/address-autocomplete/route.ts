import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";
const USER_AGENT = "airbnb-price-platform/1.0 (https://github.com/lkf9888/airbnb-price-platform)";

function message(locale: "zh" | "en", zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function resolveLocale(locale: string | null) {
  return locale?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

type PhotonFeature = {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    osm_id?: number | string;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    neighbourhood?: string;
    suburb?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    type?: string;
  };
};

function buildMainText(props: PhotonFeature["properties"]) {
  const parts: string[] = [];

  if (props?.housenumber && props.street) {
    parts.push(`${props.housenumber} ${props.street}`);
  } else if (props?.street) {
    parts.push(props.street);
  } else if (props?.name) {
    parts.push(props.name);
  }

  return parts.join(", ");
}

function buildSecondaryText(props: PhotonFeature["properties"]) {
  const locality =
    props?.city ||
    props?.suburb ||
    props?.neighbourhood ||
    props?.district ||
    props?.county ||
    "";
  const parts = [locality, props?.state, props?.country].filter(Boolean);
  return parts.join(", ");
}

function buildFullText(mainText: string, secondaryText: string, props: PhotonFeature["properties"]) {
  const combined = [mainText, secondaryText].filter(Boolean).join(", ");
  if (combined) {
    return combined;
  }
  return props?.name || "";
}

function buildPlaceId(props: PhotonFeature["properties"]) {
  const type = (props?.osm_type || "N").toString().toUpperCase().slice(0, 1);
  const id = props?.osm_id ?? "";
  return `${type}${id}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = url.searchParams.get("input")?.trim() || "";
  const locale = resolveLocale(url.searchParams.get("locale"));

  if (input.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  const photonUrl = new URL(PHOTON_ENDPOINT);
  photonUrl.searchParams.set("q", input);
  photonUrl.searchParams.set("limit", "8");
  photonUrl.searchParams.set("lang", locale === "zh" ? "en" : "en");

  try {
    const response = await fetch(photonUrl, {
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: message(
            locale,
            `地址建议服务返回错误 (${response.status})。`,
            `Address suggestion service returned an error (${response.status}).`,
          ),
        },
        { status: response.status },
      );
    }

    const payload = (await response.json().catch(() => null)) as
      | { features?: PhotonFeature[] }
      | null;

    const suggestions = (payload?.features || [])
      .filter((feature) => {
        const coords = feature.geometry?.coordinates;
        return Array.isArray(coords) && coords.length === 2 && feature.properties;
      })
      .map((feature) => {
        const props = feature.properties;
        const [longitude, latitude] = feature.geometry!.coordinates as [number, number];
        const mainText = buildMainText(props) || props?.name || "";
        const secondaryText = buildSecondaryText(props);
        const text = buildFullText(mainText, secondaryText, props);

        return {
          placeId: buildPlaceId(props),
          text,
          mainText,
          secondaryText,
          latitude,
          longitude,
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
            : message(locale, "地址建议请求失败。", "Address suggestion request failed."),
      },
      { status: 500 },
    );
  }
}
