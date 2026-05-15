import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTLY_RENTAL_ENDPOINT =
  process.env.COLLECTLY_RENTAL_ENDPOINT?.trim() ||
  "https://us-central1-treasure-finder-62cd0.cloudfunctions.net/treasure-finder-be/rentalListings";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const rateLimitBuckets = new Map<string, number[]>();

const SUPPORTED_CITIES = [
  "Vancouver",
  "Burnaby",
  "Richmond",
  "Coquitlam",
  "White Rock",
  "New Westminster",
  "Langley",
  "Delta",
  "Maple Ridge",
  "Surrey",
] as const;

const requestSchema = z.object({
  address: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  propertyType: z.string().trim().optional().or(z.literal("")),
  roomType: z.string().trim().optional().or(z.literal("")),
  bedrooms: z.coerce.number().min(0).max(20),
  bathrooms: z.coerce.number().min(0).max(20).optional(),
  locale: z.enum(["zh", "en"]).optional(),
});

type Locale = "zh" | "en";

type CollectlyListing = {
  id?: string;
  title?: string;
  location?: string;
  url?: string;
  price?: number | null;
  source?: string;
  imageUrl?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  size?: number | null;
  type?: string | null;
  description?: string | null;
  furnished?: boolean | null;
  parking?: boolean | null;
  aircon?: boolean | null;
  createdAt?: { _seconds?: number; _nanoseconds?: number } | null;
};

type RentalComparable = {
  id: string;
  title: string;
  location: string;
  href: string;
  source: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  imageUrl: string | null;
  score: number;
  matchReasons: string[];
};

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function consumeRateLimit(ip: string) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitBuckets.get(ip) || []).filter((value) => value > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitBuckets.set(ip, timestamps);
    return false;
  }

  timestamps.push(now);
  rateLimitBuckets.set(ip, timestamps);
  return true;
}

function resolveLocale(request: Request, locale?: Locale) {
  if (locale === "zh" || locale === "en") {
    return locale;
  }

  const acceptLanguage = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return acceptLanguage.includes("zh") ? "zh" : "en";
}

function message(locale: Locale, zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function normalizeCity(value: string | undefined) {
  const text = String(value || "").toLowerCase();
  return SUPPORTED_CITIES.find((city) => text.includes(city.toLowerCase())) || null;
}

function cityFromInput(city: string | undefined, address: string | undefined) {
  return normalizeCity(city) || normalizeCity(address);
}

function mapPropertyType(value: string | undefined) {
  const normalized = String(value || "").toLowerCase();

  if (!normalized) {
    return "";
  }
  if (normalized.includes("公寓") || normalized.includes("apartment") || normalized.includes("condo")) {
    return "Apartment";
  }
  if (normalized.includes("联排") || normalized.includes("townhouse") || normalized.includes("townhome")) {
    return "Townhouse";
  }
  if (normalized.includes("独立屋") || normalized.includes("house")) {
    return "House";
  }
  if (normalized.includes("套房") || normalized.includes("basement") || normalized.includes("suite")) {
    return "Basement";
  }

  return value || "";
}

function isPrivateRoomRequest(roomType: string | undefined) {
  const normalized = String(roomType || "").toLowerCase();
  return normalized.includes("独立房间") ||
    normalized.includes("private") ||
    normalized.includes("shared") ||
    normalized.includes("合租") ||
    normalized.includes("分租") ||
    normalized.includes("room");
}

function looksLikeRoomShare(listing: CollectlyListing) {
  const text = `${listing.title || ""} ${listing.description || ""}`.toLowerCase();
  return /\broom\b|private room|shared|roommate|homestay|分租|合租|室友|次卧|次臥|主卧|主臥|床位|单间|單間|单房|單房|雅房|套间|套間|找女生|找男生|房间出租|房間出租/.test(text);
}

function extractPrice(listing: CollectlyListing) {
  if (typeof listing.price === "number" && listing.price >= 500 && listing.price <= 15000) {
    return Math.round(listing.price);
  }

  const text = `${listing.title || ""} ${listing.description || ""}`;
  const candidates: number[] = [];
  const patterns = [
    /\$\s*(\d{1,2}(?:[,\s]\d{3})|\d{3,5})(?:\.\d+)?/g,
    /(?:rent|rental|monthly|month|月租|租金|租)\D{0,16}(\d{3,5})/gi,
    /(\d{3,5})\s*(?:\/\s*month|per month|monthly|\/月|每月|一个月|一個月)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const price = Number(match[1].replace(/[,\s]/g, ""));
      if (Number.isFinite(price) && price >= 500 && price <= 15000) {
        candidates.push(price);
      }
    }
  }

  if (!candidates.length) {
    return null;
  }

  return Math.round(Math.min(...candidates));
}

function minimumReasonableRent(bedrooms: number, privateRoom: boolean) {
  if (privateRoom) {
    return 500;
  }

  if (bedrooms <= 0) {
    return 900;
  }
  if (bedrooms === 1) {
    return 1000;
  }
  if (bedrooms === 2) {
    return 1400;
  }
  if (bedrooms === 3) {
    return 1800;
  }

  return 2200;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) {
    return null;
  }

  const index = (values.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return values[lower];
  }

  return values[lower] + ((values[upper] - values[lower]) * (index - lower));
}

function roundToNearest(value: number | null, step = 25) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.round(value / step) * step;
}

function stats(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) {
    return null;
  }

  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
  };
}

function scoreListing(
  listing: CollectlyListing,
  input: {
    city: string;
    propertyType: string;
    roomType?: string;
    bedrooms: number;
    bathrooms?: number;
  },
) {
  let score = 0;
  const reasons: string[] = [];

  if (listing.location === input.city) {
    score += 8;
    reasons.push("same_city");
  }

  if (input.propertyType && listing.type === input.propertyType) {
    score += 5;
    reasons.push("same_property_type");
  }

  if (typeof listing.bedrooms === "number") {
    if (listing.bedrooms === input.bedrooms) {
      score += 5;
      reasons.push("same_bedrooms");
    } else if (Math.abs(listing.bedrooms - input.bedrooms) <= 1) {
      score += 2;
      reasons.push("near_bedrooms");
    }
  }

  if (typeof input.bathrooms === "number" && typeof listing.bathrooms === "number") {
    if (Math.abs(listing.bathrooms - input.bathrooms) <= 0.25) {
      score += 3;
      reasons.push("same_bathrooms");
    } else if (Math.abs(listing.bathrooms - input.bathrooms) <= 0.75) {
      score += 1;
      reasons.push("near_bathrooms");
    }
  }

  if (isPrivateRoomRequest(input.roomType) && looksLikeRoomShare(listing)) {
    score += 3;
    reasons.push("room_share_match");
  }

  return { score, reasons };
}

async function fetchCollectlyListings(params: URLSearchParams) {
  const response = await fetch(`${COLLECTLY_RENTAL_ENDPOINT}?${params.toString()}`, {
    headers: {
      accept: "application/json",
      "user-agent": "airbnb-price-platform/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Collectly returned ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload as CollectlyListing[] : [];
}

async function collectListings(city: string, bedrooms: number, propertyType: string) {
  const allListings: CollectlyListing[] = [];
  const seen = new Set<string>();
  const queryGroups = [
    { bedrooms, propertyType },
    { bedrooms, propertyType: "" },
    { bedrooms: undefined, propertyType },
    { bedrooms: undefined, propertyType: "" },
  ];

  for (const group of queryGroups) {
    for (let page = 1; page <= 3; page += 1) {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "40");
      params.append("locations", city);

      if (typeof group.bedrooms === "number" && group.bedrooms > 0) {
        params.set("bedrooms", String(group.bedrooms));
      }
      if (group.propertyType) {
        params.append("houseTypes", group.propertyType);
      }

      const listings = await fetchCollectlyListings(params);
      for (const listing of listings) {
        const key = listing.id || listing.url || `${listing.title}-${listing.location}`;
        if (!seen.has(key)) {
          seen.add(key);
          allListings.push(listing);
        }
      }

      if (listings.length < 40) {
        break;
      }
    }
  }

  return allListings;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  const locale = resolveLocale(request, body?.locale);

  if (!consumeRateLimit(clientIp(request))) {
    return NextResponse.json(
      { error: message(locale, "长租查价请求太频繁，请稍后再试。", "Too many long-term rent lookups. Please try again later.") },
      { status: 429 },
    );
  }

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: message(locale, "请求参数不正确。", "The request payload is invalid."),
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const city = cityFromInput(input.city, input.address);
  if (!city) {
    return NextResponse.json(
      {
        error: message(
          locale,
          `暂时只支持这些城市：${SUPPORTED_CITIES.join("、")}。请输入或选择包含城市名的地址。`,
          `Supported cities are currently: ${SUPPORTED_CITIES.join(", ")}. Please enter or select an address that includes the city.`,
        ),
      },
      { status: 400 },
    );
  }

  const propertyType = mapPropertyType(input.propertyType);

  try {
    const rawListings = await collectListings(city, input.bedrooms, propertyType);
    const privateRoom = isPrivateRoomRequest(input.roomType);
    const minimumRent = minimumReasonableRent(input.bedrooms, privateRoom);
    const comparableListings = rawListings
      .map((listing) => {
        const price = extractPrice(listing);
        if (price == null) {
          return null;
        }
        if (price < minimumRent) {
          return null;
        }

        if (!privateRoom && looksLikeRoomShare(listing)) {
          return null;
        }

        const { score, reasons } = scoreListing(listing, {
          city,
          propertyType,
          roomType: input.roomType,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
        });

        if (score < 8) {
          return null;
        }

        return {
          id: listing.id || listing.url || `${listing.title}-${listing.location}`,
          title: listing.title || "Rental listing",
          location: listing.location || city,
          href: listing.url || "",
          source: listing.source || "unknown",
          price,
          bedrooms: typeof listing.bedrooms === "number" ? listing.bedrooms : null,
          bathrooms: typeof listing.bathrooms === "number" ? listing.bathrooms : null,
          propertyType: listing.type || null,
          imageUrl: listing.imageUrl || null,
          score,
          matchReasons: reasons,
        } satisfies RentalComparable;
      })
      .filter((listing): listing is RentalComparable => Boolean(listing))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.price - right.price;
      });

    const priceStats = stats(comparableListings.map((listing) => listing.price));
    const suggestedRent = priceStats
      ? roundToNearest(
          comparableListings.length >= 8
            ? priceStats.p25
            : comparableListings.length >= 4
              ? (priceStats.median ? priceStats.median * 0.95 : null)
              : priceStats.median,
        )
      : null;

    const recommendation = priceStats && suggestedRent
      ? message(
          locale,
          `相同城市内找到 ${priceStats.count} 个可用长租样本。建议月租先定在 C$${suggestedRent.toLocaleString("en-CA")} 左右，低于市场中位数但不要低于异常低价。`,
          `${priceStats.count} usable long-term rental samples were found in the same city. A practical starting rent is around C$${suggestedRent.toLocaleString("en-CA")}, below the market median without chasing abnormal lows.`,
        )
      : message(
          locale,
          "没有找到足够可用的长租价格样本。建议放宽物业类型或卧室/卫生间条件后重试。",
          "Not enough usable long-term rental price samples were found. Loosen property type or bedroom/bathroom filters and try again.",
        );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: "collectly",
      input: {
        address: input.address || "",
        city,
        propertyType,
        roomType: input.roomType || "",
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms ?? null,
      },
      priceStats,
      suggestedRent,
      recommendation,
      comparableListings: comparableListings.slice(0, 12),
      rawSampleCount: rawListings.length,
      supportedCities: SUPPORTED_CITIES,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: message(
          locale,
          `长租查价失败：${(error as Error).message}`,
          `Long-term rent lookup failed: ${(error as Error).message}`,
        ),
      },
      { status: 500 },
    );
  }
}
