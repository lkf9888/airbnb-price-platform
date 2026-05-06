"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Locale = "zh" | "en";
type LocalePreference = "auto" | Locale;
type PricingMode = "monthly" | "daily";

type PriceStats = {
  count?: number;
  avg: number;
  median: number;
  min: number;
  max: number;
  p10?: number | null;
  p20?: number | null;
  p25?: number | null;
  p35?: number | null;
};

type MarketSection = {
  comparableCount: number;
  matchLabel: string;
  sampleListings?: ComparableListing[];
  priceStats?: PriceStats | null;
};

type Report = {
  pricingMode?: PricingMode;
  pricingModeLabel?: string;
  input: {
    pricingMode?: PricingMode;
    startDate: string;
    endDate: string;
    address: string;
    propertyType?: { display: string } | null;
    roomType: { display: string };
    bedrooms: number;
    bathrooms: number;
    monthlyStayLength?: number;
  };
  recommendations: string[];
  rows: Array<{
    date: string;
    daily?: MarketSection | null;
    monthly?: MarketSection | null;
  }>;
  dailyPricingPlan: Array<{
    date: string;
    pricingMode?: "daily";
    marketMin?: number | null;
    marketP10?: number | null;
    marketP20?: number | null;
    marketP25?: number | null;
    marketMedian: number | null;
    marketAvg?: number | null;
    suggestedListPrice: number | null;
    suggestedMinimumPrice: number | null;
    comparableCount: number;
    competitionLevel?: string;
    confidence: string;
    note: string;
  }>;
  monthlyPricingPlan?: Array<{
    date: string;
    checkoutDate: string;
    pricingMode?: "monthly";
    marketMin: number | null;
    marketP10: number | null;
    marketP25: number | null;
    marketMedian: number | null;
    suggestedDailyPrice: number | null;
    suggestedMonthlyPrice: number | null;
    suggestedMinimumMonthlyPrice: number | null;
    comparableCount: number;
    confidence: string;
    note: string;
  }>;
};

type ComparableListing = {
  href: string;
  price: number | null;
  priceBasis: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  roomType: string | null;
  propertyType: string | null;
  textSnippet?: string | null;
};

type SuggestedListing = ComparableListing & {
  occurrences: number;
  score: number;
  seenInDaily: boolean;
  seenInMonthly: boolean;
  addressMatched: boolean;
};

type ApiResponse = {
  report: Report;
  savedJsonPath: string;
  savedHtmlPath: string;
  savedPdfPath?: string;
  reportJsonUrl?: string;
  reportHtmlUrl?: string;
  reportPdfUrl?: string;
  stdout: string;
  stderr: string;
};

type AddressSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
};

const STORAGE_KEY = "airbnb-price-platform-locale";

const copy = {
  zh: {
    browserKicker: "Airbnb Pricing Platform",
    title: "Airbnb 月租和短租定价建议",
    subtitle: "选择月租或短租模式，按附近仍可预订的同类房源生成建议价格。",
    languageLabel: "语言",
    auto: "自动",
    chinese: "中文",
    english: "English",
    dailyMedian: "短租市场中位数",
    monthlyMedian: "月租市场中位数",
    dailyMedianHint: "当前短租查价区间内的每晚市场中位数",
    monthlyMedianHint: "所选起租日区间内的30晚等效市场中位数",
    formTitle: "开始一次新查价",
    formDesc: "输入目标房源条件后，平台会调用本地 Airbnb 查价引擎，并把结果直接可视化。",
    pricingMode: "定价模式",
    monthlyMode: "月租定价",
    dailyMode: "短租每日定价",
    monthlyModeHint: "按起租日区间逐日查询可住满30晚的附近月租房，并输出平均日价和30晚月租。",
    dailyModeHint: "逐日查询附近一晚可订房源，并输出每天建议挂牌价。",
    startDate: "开始日期",
    endDate: "结束日期",
    monthlyStartDate: "最早起租日",
    monthlyEndDate: "最晚起租日",
    minStayNights: "月租晚数",
    address: "房源地址",
    addressPlaceholder: "例如 8160 mcmyn way, richmond, bc",
    addressHint: "输入时会出现地址建议（OpenStreetMap），选中后自动回填并定位。",
    addressVerified: "已选中地址（将把 Airbnb 搜索限定在该点 2 km 范围内）",
    addressSuggesting: "正在获取地址建议...",
    addressSelectPrompt: "请选择一条建议地址，能提高查价准确度。",
    addressAutocompleteUnavailable: "地址建议暂时不可用，可直接输入完整地址后继续。",
    poweredByGoogle: "Powered by OpenStreetMap / Photon",
    progressTitle: "执行进度",
    progressRunning: "系统正在抓取房价与生成报告，请稍候。",
    progressIdle: "提交后会在这里显示执行状态，帮助客户确认系统仍在运行。",
    progressReady: "待开始",
    progressActive: "进行中",
    progressDone: "已完成",
    similarListings: "建议的 5 个附近类似房源",
    similarListingsDesc: "基于本次查价抓到的可比样本重新筛选，优先保留与输入地址城市/区域更相关的 Airbnb 房源。",
    similarListingsNone: "没有找到位于你输入地址附近的可比房源。可尝试选中更精确的地址建议，或放宽物业/房型条件后再查一次。",
    similarOpen: "打开 Airbnb",
    similarSeenIn: "出现于",
    similarDaily: "日租样本",
    similarMonthly: "月租样本",
    similarMatches: "匹配次数",
    similarBedrooms: "卧室",
    similarBathrooms: "卫生间",
    similarAddressMatch: "地址相关性",
    similarAddressMatched: "与输入地址更相关",
    similarAddressApprox: "仅结构相近，不保证最近",
    propertyType: "物业类型",
    anyPropertyType: "不限",
    apartment: "公寓",
    townhouse: "联排",
    house: "独立屋",
    suite: "套房",
    roomType: "房型",
    entireHome: "整套房源",
    privateRoom: "独立房间",
    sharedRoom: "合住房间",
    hotelRoom: "酒店房间",
    bedrooms: "卧室数量",
    bathrooms: "卫生间数量",
    submit: "开始查价",
    monthlySubmit: "查询月租建议价",
    dailySubmit: "查询短租每日价",
    loading: "正在执行查价，通常需要 2 到 4 分钟...",
    monthlyLoading: "正在查询月租市场价格...",
    dailyLoading: "正在查询短租每日价格...",
    errorPrefix: "查价失败",
    dailyTrend: "短租每日价格趋势图",
    monthlyTrend: "月租30晚价格趋势图",
    daysCount: "天",
    chartSubtitle: "展示每个日期的市场中位数价格",
    noChartData: "暂无可用图表数据",
    dailyHigh: "日租最高价",
    dailyLow: "日租最低价",
    dailyAvg: "日租平均价",
    monthlyAvg: "月租平均价",
    dailyHighHint: "查价区间内的最高日租中位数",
    dailyLowHint: "查价区间内的最低日租中位数",
    dailyAvgHint: "查价区间内的平均日租中位数",
    monthlyAvgHint: "查价区间内的平均月租中位数",
    recommendations: "系统建议",
    dailyPlan: "短租每日建议价",
    monthlyPlan: "月租建议价格",
    pdfReport: "PDF 报告",
    exportPdf: "导出 PDF",
    pdfUnavailable: "PDF 未生成",
    openHtml: "查看 HTML",
    openJson: "查看 JSON",
    htmlReport: "HTML 报告",
    jsonData: "JSON 数据",
    date: "日期",
    checkoutDate: "退房日",
    marketMin: "市场最低",
    marketP25: "P25低位价",
    marketMedian: "市场中位数",
    suggestedListPrice: "建议挂牌价",
    suggestedMinimumPrice: "建议底价",
    suggestedDailyPrice: "建议日价",
    suggestedMonthlyPrice: "建议30晚月租",
    suggestedMinimumMonthlyPrice: "建议月租底价",
    samples: "样本数",
    competition: "竞争强度",
    confidence: "置信度",
    note: "策略说明",
    dailyDetails: "查价明细",
    dailyRentMedian: "日租中位数",
    monthlyRentMedian: "月租中位数",
    matchingStrategy: "匹配策略",
    runLogs: "运行日志",
    noLogs: "暂无日志",
    emptyState: "提交一次查价后，这里会显示图表、统计值、建议挂牌价和报告输出路径。",
    generated: "未生成",
    noPropertyLimit: "不限物业类型",
  },
  en: {
    browserKicker: "Airbnb Pricing Platform",
    title: "Airbnb Monthly and Short-Stay Pricing",
    subtitle: "Choose monthly or short-stay pricing and generate recommendations from nearby bookable comparable Airbnb listings.",
    languageLabel: "Language",
    auto: "Auto",
    chinese: "中文",
    english: "English",
    dailyMedian: "Short-stay market median",
    monthlyMedian: "Monthly market median",
    dailyMedianHint: "Nightly market median for the selected short-stay window",
    monthlyMedianHint: "30-night equivalent market median across the selected start-date window",
    formTitle: "Start a new lookup",
    formDesc: "Enter the target listing conditions and the platform will run the local Airbnb price lookup engine and visualize the result.",
    pricingMode: "Pricing mode",
    monthlyMode: "Monthly pricing",
    dailyMode: "Short-stay daily pricing",
    monthlyModeHint: "Test each start date for nearby listings bookable for 30 nights, then return average daily and 30-night monthly prices.",
    dailyModeHint: "Check one-night availability day by day and return the best listing price for each date.",
    startDate: "Start date",
    endDate: "End date",
    monthlyStartDate: "Earliest start date",
    monthlyEndDate: "Latest start date",
    minStayNights: "Monthly nights",
    address: "Address",
    addressPlaceholder: "For example: 8160 mcmyn way, richmond, bc",
    addressHint: "Address suggestions (OpenStreetMap) appear while typing. Selecting one fills in the address and pins its location.",
    addressVerified: "Address pinned — Airbnb search will be restricted to a 2 km radius around it",
    addressSuggesting: "Loading address suggestions...",
    addressSelectPrompt: "Select a suggested address to improve lookup accuracy.",
    addressAutocompleteUnavailable: "Address suggestions are temporarily unavailable. You can still type the full address manually.",
    poweredByGoogle: "Powered by OpenStreetMap / Photon",
    progressTitle: "Progress",
    progressRunning: "The system is fetching prices and generating the report. Please wait.",
    progressIdle: "Execution status will appear here after submission so customers know the system is still running.",
    progressReady: "Ready",
    progressActive: "Running",
    progressDone: "Done",
    similarListings: "5 Suggested Nearby Comparable Listings",
    similarListingsDesc: "Rescored from this lookup's comparable samples, with priority given to listings whose card text is more related to the input city or area.",
    similarListingsNone: "No comparable Airbnb listings near your input address were found. Try selecting a more precise address suggestion, or loosen the property/room-type filters and run the lookup again.",
    similarOpen: "Open on Airbnb",
    similarSeenIn: "Seen in",
    similarDaily: "Daily samples",
    similarMonthly: "Monthly samples",
    similarMatches: "Matches",
    similarBedrooms: "Bedrooms",
    similarBathrooms: "Bathrooms",
    similarAddressMatch: "Address relevance",
    similarAddressMatched: "More related to your input area",
    similarAddressApprox: "Structurally similar only, not guaranteed nearest",
    propertyType: "Property type",
    anyPropertyType: "Any",
    apartment: "Apartment",
    townhouse: "Townhouse",
    house: "House",
    suite: "Suite",
    roomType: "Room type",
    entireHome: "Entire home",
    privateRoom: "Private room",
    sharedRoom: "Shared room",
    hotelRoom: "Hotel room",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    submit: "Start lookup",
    monthlySubmit: "Lookup monthly price",
    dailySubmit: "Lookup daily prices",
    loading: "Running price lookup. This usually takes 2 to 4 minutes...",
    monthlyLoading: "Looking up monthly market prices...",
    dailyLoading: "Looking up short-stay daily prices...",
    errorPrefix: "Lookup failed",
    dailyTrend: "Short-stay daily price trend",
    monthlyTrend: "30-night monthly price trend",
    daysCount: "days",
    chartSubtitle: "Shows the market median price for each date",
    noChartData: "No chart data available yet",
    dailyHigh: "Highest daily rate",
    dailyLow: "Lowest daily rate",
    dailyAvg: "Average daily rate",
    monthlyAvg: "Average monthly rate",
    dailyHighHint: "Highest daily median in the lookup window",
    dailyLowHint: "Lowest daily median in the lookup window",
    dailyAvgHint: "Average daily median in the lookup window",
    monthlyAvgHint: "Average monthly median in the lookup window",
    recommendations: "Recommendations",
    dailyPlan: "Short-stay daily recommendations",
    monthlyPlan: "Monthly price recommendations",
    pdfReport: "PDF report",
    exportPdf: "Export PDF",
    pdfUnavailable: "PDF unavailable",
    openHtml: "Open HTML",
    openJson: "Open JSON",
    htmlReport: "HTML report",
    jsonData: "JSON data",
    date: "Date",
    checkoutDate: "Checkout",
    marketMin: "Market low",
    marketP25: "P25 low price",
    marketMedian: "Market median",
    suggestedListPrice: "Suggested list price",
    suggestedMinimumPrice: "Suggested floor price",
    suggestedDailyPrice: "Suggested daily price",
    suggestedMonthlyPrice: "Suggested 30-night price",
    suggestedMinimumMonthlyPrice: "Monthly floor price",
    samples: "Samples",
    competition: "Competition",
    confidence: "Confidence",
    note: "Notes",
    dailyDetails: "Daily details",
    dailyRentMedian: "Daily median",
    monthlyRentMedian: "Monthly median",
    matchingStrategy: "Matching strategy",
    runLogs: "Run logs",
    noLogs: "No logs",
    emptyState: "Submit a lookup to see charts, summary stats, suggested prices, and report paths here.",
    generated: "Not generated",
    noPropertyLimit: "Any property type",
  },
} as const;

function translatePropertyType(value: string | null | undefined, locale: Locale) {
  if (!value || locale === "zh") {
    return value || "";
  }

  const mapping: Record<string, string> = {
    公寓: "Apartment",
    联排: "Townhouse",
    独立屋: "House",
    套房: "Suite",
  };

  return mapping[value] || value;
}

function translateRoomType(value: string | null | undefined, locale: Locale) {
  if (!value || locale === "zh") {
    return value || "";
  }

  const mapping: Record<string, string> = {
    整套房源: "Entire home",
    独立房间: "Private room",
    合住房间: "Shared room",
    酒店房间: "Hotel room",
  };

  return mapping[value] || value;
}

function translateConfidence(value: string, locale: Locale) {
  if (locale === "zh") {
    return value;
  }

  const mapping: Record<string, string> = {
    高: "High",
    中: "Medium",
    低: "Low",
  };

  return mapping[value] || value;
}

function translateCompetitionLevel(value: string | null | undefined, locale: Locale) {
  if (!value || locale === "zh") {
    return value || "";
  }

  const mapping: Record<string, string> = {
    强: "High",
    正常: "Normal",
    弱: "Low",
    未知: "Unknown",
  };

  return mapping[value] || value;
}

function translateMatchLabel(value: string, locale: Locale) {
  if (locale === "zh") {
    return value;
  }

  const mapping: Record<string, string> = {
    "物业类型 + 房型 + 卧室 + 卫生间精确匹配": "Property type + room type + bedrooms + bathrooms exact match",
    "物业类型 + 房型 + 卧室匹配": "Property type + room type + bedrooms match",
    "物业类型 + 房型匹配": "Property type + room type match",
    "物业类型 + 卧室/卫生间接近": "Property type + near bedrooms/bathrooms match",
    "房型 + 卧室 + 卫生间精确匹配": "Room type + bedrooms + bathrooms exact match",
    "房型 + 卧室匹配，卫生间允许轻微浮动": "Room type + bedrooms match, bathrooms slightly flexible",
    "房型 + 卧室匹配": "Room type + bedrooms match",
    "仅房型匹配": "Room type only match",
    "仅卧室/卫生间接近": "Near bedrooms/bathrooms match only",
    "使用当前页全部可用价格": "Using all available prices on the current page",
    "没有抓到可用价格": "No usable prices found",
  };

  return mapping[value] || value;
}

function translatePlanNote(value: string, locale: Locale) {
  if (locale === "zh") {
    return value;
  }

  const mapping: Record<string, string> = {
    "高需求日期，建议积极挂牌": "High-demand date. A more aggressive list price is reasonable.",
    "建议贴近市场中位数挂牌": "Stay close to the market median for the initial list price.",
    "偏弱日期，建议保守定价": "Softer date. A conservative price is recommended.",
    "略弱于均值，建议平价吸单": "Slightly weaker than average. A competitive price should help conversion.",
    "需求偏强，可小幅上调": "Demand is slightly elevated. A modest price increase is reasonable.",
    "没有足够的日租样本": "Not enough daily rate samples for this date.",
    "建议略低于低位市场价，保持同区域高性价比": "Price slightly below the low market band to stay highly competitive nearby.",
    "竞争强，建议靠近 P20 低位价格来提高转化": "Competition is high. Stay near the P20 low-price band to improve conversion.",
    "供应较少，可以略高于低位价但仍低于市场中位数": "Supply is thinner. You can price above the low band while staying below the median.",
    "没有足够的月租样本": "Not enough monthly samples for this start date.",
    "月租样本偏少，建议价需要人工复核后再发布": "Monthly samples are thin. Review the recommendation manually before publishing.",
  };

  const discountMatch = value.match(/^建议比市场中位数低约 (\d+)%/);
  if (discountMatch && locale === "en") {
    return `Suggested price is about ${discountMatch[1]}% below the market median, targeting the high-value low-price band.`;
  }

  return mapping[value] || value;
}

function translateRecommendation(value: string, locale: Locale) {
  if (locale === "zh") {
    return value;
  }

  const patterns: Array<[RegExp, (...args: string[]) => string]> = [
    [
      /^日租基准价可以先围绕 (C\$\d+) 设置，属于当前可比房源的中位数水平。$/,
      (price) => `A good starting daily price is around ${price}, which is close to the median of the current comparable listings.`,
    ],
    [
      /^短租每日建议价会优先低于附近同类房源的中位数，整体基准大约是 (C\$\d+) \/ 晚。$/,
      (price) => `Short-stay recommendations prioritize prices below the nearby comparable median. The overall market baseline is about ${price} per night.`,
    ],
    [
      /^月租建议价可以先围绕 (C\$\d+) \/ 30 晚，折合每天 (C\$\d+)。这个价格目标是落在附近同类月租房的低价高性价比区间。$/,
      (monthly, daily) => `A practical monthly recommendation is around ${monthly} per 30 nights, or ${daily} per day, targeting the high-value low-price band.`,
    ],
    [
      /^附近同类月租房市场中位数约 (C\$\d+) \/ 30 晚，建议价应低于中位数但不要盲目低于异常低价。$/,
      (price) => `Nearby comparable monthly listings have a market median of about ${price} per 30 nights. Stay below the median without chasing abnormal outliers.`,
    ],
    [
      /^周五到周六的日租中位数比工作日高约 (\d+%)，周末可以考虑加价 5% 到 12%。$/,
      (premium) => `Friday to Saturday median daily prices are about ${premium} higher than weekdays, so a 5% to 12% weekend premium may be reasonable.`,
    ],
    [
      /^周五到周六的日租中位数比工作日高约 (\d+%)，周末可以保留小幅溢价，但仍保持同区域高性价比。$/,
      (premium) => `Friday to Saturday median daily prices are about ${premium} higher than weekdays, so a small weekend premium is reasonable while staying competitive.`,
    ],
    [
      /^高价日期集中在 (.+)，这些日期更适合采用偏进攻的挂牌价。$/,
      (dates) => `Higher-priced dates are concentrated around ${dates}. These dates are better suited to a more aggressive listing price.`,
    ],
    [
      /^高价日期集中在 (.+)，这些日期不用压到全市场最低。$/,
      (dates) => `Higher-priced dates are concentrated around ${dates}. These dates do not need to be priced at the absolute market low.`,
    ],
    [
      /^低价日期集中在 (.+)，这些日期更适合做折扣或最短入住限制放宽。$/,
      (dates) => `Lower-priced dates are concentrated around ${dates}. These dates are better candidates for discounts or looser minimum-stay rules.`,
    ],
    [
      /^低价日期集中在 (.+)，这些日期建议更贴近低位市场价来提高入住率。$/,
      (dates) => `Lower-priced dates are concentrated around ${dates}. Price closer to the low market band to improve occupancy.`,
    ],
    [
      /^月租的市场中位数大约在 (C\$\d+) \/ (\d+) 晚，可以把月租打包价先定在这个区间附近，再按装修和位置微调。$/,
      (price, nights) => `The market median for monthly stays is about ${price} per ${nights} nights. That is a practical starting point before adjusting for furnishing quality and location.`,
    ],
    [
      /^月租强势起租日主要出现在 (.+)，如果你支持长住，这些起租日值得优先开放。$/,
      (dates) => `Stronger monthly check-in dates mainly appear around ${dates}. If you support longer stays, these start dates are worth prioritizing.`,
    ],
    [
      /^月租竞争价格较高的起租日主要是 (.+)，这些日期可以优先开放。$/,
      (dates) => `Monthly start dates with stronger market pricing are ${dates}. These start dates are worth prioritizing.`,
    ],
    [
      /^当前每个日期抓到的可比样本偏少，建议在报告基础上再人工补看 1 到 2 页搜索结果，避免被个别异常价格带偏。$/,
      () => "The comparable sample count per date is still a bit thin. It is worth checking one or two more Airbnb result pages manually so outliers do not skew pricing decisions.",
    ],
    [
      /^当前月租可比样本偏少，建议把搜索半径放大或补看 Airbnb 第二页，避免被个别异常房源带偏。$/,
      () => "Monthly comparable samples are thin. Expand the radius or check the second Airbnb results page so outliers do not skew the recommendation.",
    ],
    [
      /^当前短租可比样本偏少，建议放宽物业类型或扩大搜索半径后再复查一次。$/,
      () => "Short-stay comparable samples are thin. Loosen the property type or expand the search radius and run it again.",
    ],
  ];

  for (const [pattern, formatter] of patterns) {
    const matched = value.match(pattern);
    if (matched) {
      return formatter(...matched.slice(1));
    }
  }

  return value;
}

function detectSystemLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "zh";
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function createSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toRequestLocale(locale: Locale) {
  return locale === "zh" ? "zh" : "en";
}

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function calcSummary(values: Array<number | null | undefined>) {
  const normalized = values.filter((value): value is number => typeof value === "number").sort(
    (left, right) => left - right,
  );

  if (!normalized.length) {
    return null;
  }

  const sum = normalized.reduce((total, value) => total + value, 0);
  const middle = Math.floor(normalized.length / 2);
  const median =
    normalized.length % 2 === 0
      ? (normalized[middle - 1] + normalized[middle]) / 2
      : normalized[middle];

  return {
    min: normalized[0],
    max: normalized[normalized.length - 1],
    avg: sum / normalized.length,
    median,
  };
}

function addressTokens(address: string) {
  const stopwords = new Set([
    "road",
    "street",
    "drive",
    "lane",
    "unit",
    "avenue",
    "boulevard",
    "place",
    "court",
    "way",
    "british",
    "columbia",
    "canada",
    "usa",
    "apt",
    "suite",
    "floor",
  ]);

  return Array.from(
    new Set(
      String(address || "")
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fff]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !/^\d+$/.test(token))
        .filter((token) => !stopwords.has(token)),
    ),
  );
}

function listingStructureScore(listing: ComparableListing, input: Report["input"]) {
  let score = 0;

  if (listing.roomType && listing.roomType === input.roomType.display) {
    score += 5;
  }

  if (listing.propertyType && input.propertyType?.display && listing.propertyType === input.propertyType.display) {
    score += 4;
  }

  if (typeof listing.bedrooms === "number") {
    if (listing.bedrooms === input.bedrooms) {
      score += 4;
    } else if (Math.abs(listing.bedrooms - input.bedrooms) <= 1) {
      score += 2;
    }
  }

  if (typeof listing.bathrooms === "number") {
    if (Math.abs(listing.bathrooms - input.bathrooms) <= 0.25) {
      score += 3;
    } else if (Math.abs(listing.bathrooms - input.bathrooms) <= 0.5) {
      score += 1;
    }
  }

  return score;
}

function buildSuggestedListings(rows: Report["rows"], input: Report["input"]) {
  const tokens = addressTokens(input.address);
  const merged = new Map<
    string,
    SuggestedListing
  >();

  for (const row of rows) {
    for (const listing of row.daily?.sampleListings || []) {
      if (!listing.href) {
        continue;
      }

      const searchText = String(listing.textSnippet || "").toLowerCase();
      const tokenMatched = tokens.length > 0 && tokens.some((token) => searchText.includes(token));
      const rowPenalty = /使用当前页全部可用价格|仅卧室\/卫生间接近/.test(row.daily?.matchLabel || "") ? -2 : 0;
      const scoreDelta = 3 + listingStructureScore(listing, input) + (tokenMatched ? 6 : 0) + rowPenalty;

      const existing = merged.get(listing.href);
      if (existing) {
        existing.occurrences += 1;
        existing.score += scoreDelta;
        existing.seenInDaily = true;
        existing.addressMatched = existing.addressMatched || tokenMatched;
        if (existing.price == null && listing.price != null) {
          existing.price = listing.price;
          existing.priceBasis = listing.priceBasis;
        }
      } else {
        merged.set(listing.href, {
          ...listing,
          occurrences: 1,
          score: scoreDelta,
          seenInDaily: true,
          seenInMonthly: false,
          addressMatched: tokenMatched,
        });
      }
    }

    for (const listing of row.monthly?.sampleListings || []) {
      if (!listing.href) {
        continue;
      }

      const searchText = String(listing.textSnippet || "").toLowerCase();
      const tokenMatched = tokens.length > 0 && tokens.some((token) => searchText.includes(token));
      const rowPenalty = /使用当前页全部可用价格|仅卧室\/卫生间接近/.test(row.monthly?.matchLabel || "") ? -2 : 0;
      const scoreDelta = 1 + listingStructureScore(listing, input) + (tokenMatched ? 6 : 0) + rowPenalty;

      const existing = merged.get(listing.href);
      if (existing) {
        existing.occurrences += 1;
        existing.score += scoreDelta;
        existing.seenInMonthly = true;
        existing.addressMatched = existing.addressMatched || tokenMatched;
        if (existing.price == null && listing.price != null) {
          existing.price = listing.price;
          existing.priceBasis = listing.priceBasis;
        }
      } else {
        merged.set(listing.href, {
          ...listing,
          occurrences: 1,
          score: scoreDelta,
          seenInDaily: false,
          seenInMonthly: true,
          addressMatched: tokenMatched,
        });
      }
    }
  }

  const entries = Array.from(merged.values());
  const addressMatched = entries.filter((entry) => entry.addressMatched);

  if (tokens.length === 0 || addressMatched.length === 0) {
    return [];
  }

  return addressMatched
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.occurrences !== left.occurrences) {
        return right.occurrences - left.occurrences;
      }

      const leftPrice = typeof left.price === "number" ? left.price : Number.MAX_SAFE_INTEGER;
      const rightPrice = typeof right.price === "number" ? right.price : Number.MAX_SAFE_INTEGER;
      return leftPrice - rightPrice;
    })
    .slice(0, 5);
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--accent-deep)]">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-tight text-[var(--ink)]">{value}</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--muted)]">{hint}</p>
    </div>
  );
}

function TrendChart({
  title,
  subtitle,
  daysLabel,
  emptyLabel,
  color,
  rows,
  type,
}: {
  title: string;
  subtitle: string;
  daysLabel: string;
  emptyLabel: string;
  color: string;
  rows: Report["rows"];
  type: "daily" | "monthly";
}) {
  const series = rows
    .map((row) => ({
      date: row.date,
      value: type === "daily" ? row.daily?.priceStats?.median ?? null : row.monthly?.priceStats?.median ?? null,
    }))
    .filter((item): item is { date: string; value: number } => typeof item.value === "number");

  if (!series.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-4 py-8 text-center text-sm text-[var(--muted)]">
        {emptyLabel}
      </div>
    );
  }

  const width = 760;
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 34, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(...series.map((item) => item.value));
  const maxValue = Math.max(...series.map((item) => item.value));
  const range = Math.max(1, maxValue - minValue);
  const xStep = series.length === 1 ? 0 : chartWidth / (series.length - 1);
  const xForIndex = (index: number) => padding.left + (index * xStep);
  const yForValue = (value: number) =>
    padding.top + chartHeight - (((value - minValue) / range) * chartHeight);
  const line = series.map((item, index) => `${xForIndex(index)},${yForValue(item.value)}`).join(" ");

  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
          <p className="text-[11px] text-[var(--muted)]">{subtitle}</p>
        </div>
        <div className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-[11px] text-[var(--accent-deep)]">
          {series.length} {daysLabel}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#eaded9" />
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#eaded9" />
        <polyline fill="none" stroke={color} strokeWidth="3" points={line} />
        {series.map((item, index) => (
          <g key={item.date}>
            <circle cx={xForIndex(index)} cy={yForValue(item.value)} r="4" fill={color} />
            <text x={xForIndex(index)} y={height - 18} textAnchor="middle" fontSize="11" fill="#6a6a6a">
              {item.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function MarketDashboard() {
  const [mounted, setMounted] = useState(false);
  const [localePreference, setLocalePreference] = useState<LocalePreference>("auto");
  const [form, setForm] = useState({
    pricingMode: "monthly" as PricingMode,
    startDate: "",
    endDate: "",
    address: "",
    propertyType: "",
    roomType: "整套房源",
    bedrooms: "2",
    bathrooms: "2",
    monthlyStayLength: "30",
  });
  const [loading, setLoading] = useState(false);
  const [hasLookupStarted, setHasLookupStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticUrls, setDiagnosticUrls] = useState<string[]>([]);
  const [progress, setProgress] = useState<{
    totalDays: number;
    completedDays: number;
    currentDate: string | null;
  } | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [systemLocale, setSystemLocale] = useState<Locale>("zh");
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressFocused, setAddressFocused] = useState(false);
  const [addressVerified, setAddressVerified] = useState(false);
  const [addressLocation, setAddressLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressAutocompleteStatus, setAddressAutocompleteStatus] = useState<"unknown" | "ready" | "disabled">("unknown");
  const [addressSessionToken, setAddressSessionToken] = useState(() => createSessionToken());
  const pollIntervalRef = useRef<number | null>(null);

  function clearPolling() {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const nextSystemLocale = detectSystemLocale();
    setSystemLocale(nextSystemLocale);
    setMounted(true);

    const savedPreference = window.localStorage.getItem(STORAGE_KEY) as LocalePreference | null;
    if (savedPreference === "zh" || savedPreference === "en" || savedPreference === "auto") {
      setLocalePreference(savedPreference);
    }
  }, []);

  const locale: Locale = localePreference === "auto" ? systemLocale : localePreference;
  const t = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = t.title;
  }, [locale, t.title]);

  const summary = useMemo(() => {
    if (!result) {
      return null;
    }

    return {
      daily: calcSummary(result.report.rows.map((row) => row.daily?.priceStats?.median)),
      monthly: calcSummary(result.report.rows.map((row) => row.monthly?.priceStats?.median)),
    };
  }, [result]);

  const planSummary = useMemo(() => {
    if (!result) {
      return null;
    }

    return {
      dailySuggested: calcSummary(result.report.dailyPricingPlan.map((row) => row.suggestedListPrice)),
      monthlySuggested: calcSummary((result.report.monthlyPricingPlan || []).map((row) => row.suggestedMonthlyPrice)),
      monthlySuggestedDaily: calcSummary((result.report.monthlyPricingPlan || []).map((row) => row.suggestedDailyPrice)),
    };
  }, [result]);

  const suggestedListings = useMemo(() => {
    if (!result) {
      return [];
    }

    return buildSuggestedListings(result.report.rows, result.report.input);
  }, [result]);

  const activeMode: PricingMode =
    result?.report.pricingMode || result?.report.input.pricingMode || form.pricingMode;

  useEffect(() => {
    if (!addressFocused || form.address.trim().length < 3) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setAddressLoading(true);
        const response = await fetch(
          `/api/address-autocomplete?input=${encodeURIComponent(form.address.trim())}&locale=${locale}&sessionToken=${encodeURIComponent(addressSessionToken)}`,
          {
            signal: controller.signal,
          },
        );

        const payload = (await response.json().catch(() => null)) as
          | { suggestions?: AddressSuggestion[]; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Address autocomplete failed.");
        }

        setAddressAutocompleteStatus("ready");
        setAddressSuggestions(payload?.suggestions || []);
      } catch (autocompleteError) {
        if ((autocompleteError as Error).name === "AbortError") {
          return;
        }

        setAddressSuggestions([]);
        setAddressAutocompleteStatus("disabled");
      } finally {
        setAddressLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [addressFocused, addressSessionToken, form.address, locale]);

  function selectAddressSuggestion(suggestion: AddressSuggestion) {
    setAddressFocused(false);
    setAddressSuggestions([]);

    const resolvedAddress = suggestion.formattedAddress || suggestion.text;

    setAddressAutocompleteStatus("ready");
    setAddressVerified(Boolean(resolvedAddress));

    if (
      typeof suggestion.latitude === "number" &&
      typeof suggestion.longitude === "number"
    ) {
      setAddressLocation({
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      });
    } else {
      setAddressLocation(null);
    }

    setForm((current) => ({ ...current, address: resolvedAddress }));
    setAddressSessionToken(createSessionToken());
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const bedroomsNumber = Number(form.bedrooms);
    const bathroomsNumber = Number(form.bathrooms);
    const monthlyStayLengthNumber = Number(form.monthlyStayLength);

    if (!form.startDate || !form.endDate) {
      setError(
        form.pricingMode === "monthly"
          ? locale === "zh"
            ? "请选择最早起租日和最晚起租日。"
            : "Please select both earliest and latest start dates."
          : locale === "zh"
            ? "请选择开始日期和结束日期。"
            : "Please select both start and end dates.",
      );
      setHasLookupStarted(false);
      return;
    }

    const startMs = Date.parse(form.startDate);
    const endMs = Date.parse(form.endDate);
    const spanDays = Math.round((endMs - startMs) / (24 * 3600 * 1000));

    if (!Number.isFinite(spanDays) || spanDays < 0) {
      setError(
        form.pricingMode === "monthly"
          ? locale === "zh"
            ? "最晚起租日必须晚于或等于最早起租日。"
            : "Latest start date must be on or after earliest start date."
          : locale === "zh"
            ? "结束日期必须晚于或等于开始日期。"
            : "End date must be on or after start date.",
      );
      setHasLookupStarted(false);
      return;
    }

    if (form.pricingMode === "monthly") {
      if (!Number.isFinite(monthlyStayLengthNumber) || monthlyStayLengthNumber < 28) {
        setError(locale === "zh" ? "月租晚数必须至少为 28。" : "Monthly nights must be at least 28.");
        setHasLookupStarted(false);
        return;
      }
    }

    if (form.address.trim().length < 5) {
      setError(locale === "zh" ? "请输入完整地址（至少 5 个字符）。" : "Please enter a complete address (at least 5 characters).");
      setHasLookupStarted(false);
      return;
    }

    if (!Number.isFinite(bedroomsNumber) || bedroomsNumber < 0) {
      setError(locale === "zh" ? "卧室数量必须是 0 或以上的数字。" : "Bedrooms must be a number of 0 or more.");
      setHasLookupStarted(false);
      return;
    }

    if (!Number.isFinite(bathroomsNumber) || bathroomsNumber < 0) {
      setError(locale === "zh" ? "卫生间数量必须是 0 或以上的数字。" : "Bathrooms must be a number of 0 or more.");
      setHasLookupStarted(false);
      return;
    }

    setHasLookupStarted(true);
    setLoading(true);
    setError(null);
    setDiagnosticUrls([]);
    setProgress(null);
    setResult(null);
    clearPolling();

    try {
      const response = await fetch("/api/market-research", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept-language": locale,
        },
        body: JSON.stringify({
          ...form,
          bedrooms: bedroomsNumber,
          bathrooms: bathroomsNumber,
          monthlyStayLength: monthlyStayLengthNumber,
          locale: toRequestLocale(locale),
          ...(addressLocation
            ? {
                centerLat: addressLocation.latitude,
                centerLng: addressLocation.longitude,
                radiusKm: 2,
              }
            : {}),
        }),
      });

      const payload = await safeJson(response);

      if (!response.ok || !payload.jobId) {
        throw new Error(
          payload.error || `${response.status} ${response.statusText || ""}`.trim() || t.errorPrefix,
        );
      }

      pollJob(String(payload.jobId));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.errorPrefix);
      setLoading(false);
    }
  }

  async function safeJson(response: Response): Promise<Record<string, unknown> & { error?: string }> {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      const snippet = text.slice(0, 240).replace(/\s+/g, " ").trim();
      return {
        error:
          locale === "zh"
            ? `服务器返回了非 JSON 响应 (${response.status})：${snippet || "空"}`
            : `Non-JSON response from server (${response.status}): ${snippet || "empty"}`,
      };
    }
  }

  function pollJob(jobId: string) {
    clearPolling();
    const tick = async () => {
      try {
        const res = await fetch(`/api/market-research?jobId=${encodeURIComponent(jobId)}`, {
          headers: { "accept-language": locale },
        });
        const payload = await safeJson(res);

        if (!res.ok) {
          clearPolling();
          setError(
            payload.error || `${res.status} ${res.statusText || ""}`.trim() || t.errorPrefix,
          );
          setLoading(false);
          return;
        }

        const status = payload.status;
        if (status === "done") {
          clearPolling();
          setProgress(null);
          setResult(payload as unknown as ApiResponse);
          setLoading(false);
          return;
        }
        if (status === "failed") {
          clearPolling();
          setProgress(null);
          if (Array.isArray(payload.diagnosticUrls)) {
            setDiagnosticUrls(payload.diagnosticUrls as string[]);
          }
          setError((payload.error as string) || t.errorPrefix);
          setLoading(false);
          return;
        }

        if (
          payload.progress &&
          typeof payload.progress === "object" &&
          payload.progress !== null
        ) {
          const p = payload.progress as {
            totalDays?: number;
            completedDays?: number;
            currentDate?: string | null;
          };
          if (typeof p.totalDays === "number" && typeof p.completedDays === "number") {
            setProgress({
              totalDays: p.totalDays,
              completedDays: p.completedDays,
              currentDate: p.currentDate ?? null,
            });
          }
        }
      } catch {
        // transient network blip — keep polling
      }
    };

    void tick();
    pollIntervalRef.current = window.setInterval(tick, 4000);
  }

  function updateLocalePreference(value: LocalePreference) {
    setLocalePreference(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--page)] px-2 py-2 sm:px-3 lg:px-4">
      <div className="mx-auto max-w-7xl space-y-3">
        <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white/96 px-4 py-3 shadow-sm sm:px-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] xl:items-end">
            <div className="max-w-3xl">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--accent-deep)]">
                {t.browserKicker}
              </p>
              <h1 className="mt-1 text-xl font-semibold leading-tight tracking-tight text-[var(--ink)] sm:text-2xl">
                {t.title}
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">{t.subtitle}</p>
            </div>
            <div className="space-y-2 xl:min-w-[340px]">
              <div className="rounded-lg border border-[var(--line)] bg-[#fffdfc] px-3 py-2 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--accent-deep)]">{t.languageLabel}</span>
                  <span className="text-[11px] text-[var(--muted)]">
                    {mounted && localePreference === "auto" ? `${t.auto}: ${systemLocale === "zh" ? t.chinese : t.english}` : null}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {([
                    ["auto", t.auto],
                    ["zh", t.chinese],
                    ["en", t.english],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateLocalePreference(value)}
                      className={`rounded-md px-2.5 py-1 text-xs transition ${
                        localePreference === value
                          ? "bg-[var(--accent)] text-white shadow-sm"
                          : "bg-[#fff6f4] text-[#5e4b4b] hover:bg-[#ffe8e6]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {activeMode === "monthly" ? (
                  <>
                    <SummaryCard
                      label={t.suggestedDailyPrice}
                      value={planSummary?.monthlySuggestedDaily ? formatMoney(planSummary.monthlySuggestedDaily.median) : t.generated}
                      hint={t.monthlyModeHint}
                    />
                    <SummaryCard
                      label={t.suggestedMonthlyPrice}
                      value={planSummary?.monthlySuggested ? formatMoney(planSummary.monthlySuggested.median) : t.generated}
                      hint={t.monthlyMedianHint}
                    />
                  </>
                ) : (
                  <>
                    <SummaryCard
                      label={t.suggestedListPrice}
                      value={planSummary?.dailySuggested ? formatMoney(planSummary.dailySuggested.avg) : t.generated}
                      hint={t.dailyModeHint}
                    />
                    <SummaryCard
                      label={t.dailyMedian}
                      value={summary?.daily ? formatMoney(summary.daily.median) : t.generated}
                      hint={t.dailyMedianHint}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 shadow-sm sm:px-5">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-base font-semibold text-[var(--ink)]">{t.formTitle}</h2>
            <p className="text-xs text-[var(--muted)]">
              {t.formDesc}
            </p>
          </div>

          <form onSubmit={onSubmit} className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2 xl:col-span-4">
              <span className="text-xs font-medium text-[var(--muted)]">{t.pricingMode}</span>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {([
                  ["monthly", t.monthlyMode, t.monthlyModeHint],
                  ["daily", t.dailyMode, t.dailyModeHint],
                ] as const).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={form.pricingMode === value}
                    onClick={() => {
                      setForm((current) => ({ ...current, pricingMode: value }));
                      setError(null);
                      setProgress(null);
                      setResult(null);
                    }}
                    className={`min-h-[58px] rounded-lg border px-3 py-2 text-left transition ${
                      form.pricingMode === value
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                        : "border-[var(--line)] bg-[#fffdfc] hover:bg-[#fff6f4]"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-[var(--ink)]">{label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-[var(--muted)]">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">
                {form.pricingMode === "monthly" ? t.monthlyStartDate : t.startDate}
              </span>
              <input
                type="date"
                className="w-full rounded-lg border border-[var(--line)] bg-[#fffdfc] px-3 py-2 text-sm"
                value={form.startDate}
                onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">
                {form.pricingMode === "monthly" ? t.monthlyEndDate : t.endDate}
              </span>
              <input
                type="date"
                className="w-full rounded-lg border border-[var(--line)] bg-[#fffdfc] px-3 py-2 text-sm"
                value={form.endDate}
                onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>
            {form.pricingMode === "monthly" ? (
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--muted)]">{t.minStayNights}</span>
                <input
                  type="number"
                  min="28"
                  step="1"
                  className="w-full rounded-lg border border-[var(--line)] bg-[#fffdfc] px-3 py-2 text-sm"
                  value={form.monthlyStayLength}
                  onChange={(event) => setForm((current) => ({ ...current, monthlyStayLength: event.target.value }))}
                />
              </label>
            ) : null}
            <label className={`space-y-1 ${form.pricingMode === "monthly" ? "md:col-span-1 xl:col-span-2" : "md:col-span-2"}`}>
              <span className="text-xs font-medium text-[var(--muted)]">{t.address}</span>
              <div className="relative">
                <input
                  className="w-full rounded-lg border border-[var(--line)] bg-[#fffdfc] px-3 py-2 text-sm"
                  placeholder={t.addressPlaceholder}
                  value={form.address}
                  onFocus={() => setAddressFocused(true)}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setAddressFocused(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    const nextAddress = event.target.value;
                    setAddressVerified(false);
                    setAddressLocation(null);
                    setForm((current) => ({ ...current, address: nextAddress }));
                    if (!nextAddress.trim()) {
                      setAddressSuggestions([]);
                    }
                  }}
                />
                {addressFocused && (addressSuggestions.length > 0 || addressLoading) ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-lg">
                    {addressLoading ? (
                      <div className="px-3 py-2 text-sm text-[var(--muted)]">{t.addressSuggesting}</div>
                    ) : null}
                    {addressSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.placeId}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectAddressSuggestion(suggestion);
                        }}
                        className="flex w-full items-start justify-between gap-3 border-t border-[#f6ece8] px-3 py-2 text-left first:border-t-0 hover:bg-[#fff6f4]"
                      >
                        <div>
                          <div className="text-sm font-medium text-[var(--ink)]">{suggestion.mainText || suggestion.text}</div>
                          {suggestion.secondaryText ? (
                            <div className="mt-1 text-xs text-[var(--muted)]">{suggestion.secondaryText}</div>
                          ) : null}
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-[#f6ece8] bg-[#fffaf9] px-3 py-1.5 text-[11px] text-[var(--muted)]">
                      {t.poweredByGoogle}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex min-h-4 items-center gap-2 text-[11px] text-[var(--muted)]">
                {addressVerified ? (
                  <span className="text-[var(--accent-deep)]">{t.addressVerified}</span>
                ) : addressLoading ? (
                  <span>{t.addressSuggesting}</span>
                ) : addressAutocompleteStatus === "disabled" ? (
                  <span>{t.addressAutocompleteUnavailable}</span>
                ) : (
                  <span>{t.addressHint}</span>
                )}
              </div>
              {!addressVerified && addressAutocompleteStatus === "ready" && addressSuggestions.length > 0 ? (
                <div className="text-[11px] text-[var(--accent-deep)]">{t.addressSelectPrompt}</div>
              ) : null}
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{t.propertyType}</span>
              <select
                className="w-full rounded-lg border border-[var(--line)] bg-[#fffdfc] px-3 py-2 text-sm"
                value={form.propertyType}
                onChange={(event) => setForm((current) => ({ ...current, propertyType: event.target.value }))}
              >
                <option value="">{t.anyPropertyType}</option>
                <option value="公寓">{t.apartment}</option>
                <option value="联排">{t.townhouse}</option>
                <option value="独立屋">{t.house}</option>
                <option value="套房">{t.suite}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{t.roomType}</span>
              <select
                className="w-full rounded-lg border border-[var(--line)] bg-[#fffdfc] px-3 py-2 text-sm"
                value={form.roomType}
                onChange={(event) => setForm((current) => ({ ...current, roomType: event.target.value }))}
              >
                <option value="整套房源">{t.entireHome}</option>
                <option value="独立房间">{t.privateRoom}</option>
                <option value="合住房间">{t.sharedRoom}</option>
                <option value="酒店房间">{t.hotelRoom}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{t.bedrooms}</span>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full rounded-lg border border-[var(--line)] bg-[#fffdfc] px-3 py-2 text-sm"
                value={form.bedrooms}
                onChange={(event) => setForm((current) => ({ ...current, bedrooms: event.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--muted)]">{t.bathrooms}</span>
              <input
                type="number"
                min="0"
                step="0.5"
                className="w-full rounded-lg border border-[var(--line)] bg-[#fffdfc] px-3 py-2 text-sm"
                value={form.bathrooms}
                onChange={(event) => setForm((current) => ({ ...current, bathrooms: event.target.value }))}
              />
            </label>
            <div className="md:col-span-2 xl:col-span-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <button
                  disabled={loading}
                  className="rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--accent-deep))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
                >
                  {loading
                    ? form.pricingMode === "monthly"
                      ? t.monthlyLoading
                      : t.dailyLoading
                    : form.pricingMode === "monthly"
                      ? t.monthlySubmit
                      : t.dailySubmit}
                </button>
                {hasLookupStarted ? (
                  <div className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[#fffaf9] px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-medium text-[var(--muted)]">{t.progressTitle}</span>
                      <span className={`text-xs ${loading ? "text-[var(--accent-deep)]" : "text-[var(--muted)]"}`}>
                        {loading ? t.progressActive : t.progressDone}
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-[#f6d7dd]">
                      {loading ? (
                        progress && progress.totalDays > 0 ? (
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-deep))] transition-all"
                            style={{
                              width: `${Math.min(100, Math.round((progress.completedDays / progress.totalDays) * 100))}%`,
                            }}
                          />
                        ) : (
                          <div
                            className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-[linear-gradient(90deg,#ff8da0,var(--accent),var(--accent-deep),#ff8da0)] shadow-[0_0_18px_rgba(255,56,92,0.24)]"
                            style={{
                              backgroundSize: "200% 100%",
                              animation: "progress-indeterminate 1.35s ease-in-out infinite",
                            }}
                          />
                        )
                      ) : (
                        <div className="h-full w-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-deep))]" />
                      )}
                    </div>
                    <div className="mt-1.5 text-[11px] text-[var(--muted)]">
                      {loading
                        ? progress && progress.totalDays > 0
                          ? locale === "zh"
                            ? form.pricingMode === "monthly"
                              ? `正在处理 ${progress.completedDays} / ${progress.totalDays} 个起租日${progress.currentDate ? ` · 当前 ${progress.currentDate}` : ""}`
                              : `正在处理 ${progress.completedDays} / ${progress.totalDays} 天${progress.currentDate ? ` · 当前 ${progress.currentDate}` : ""}`
                            : form.pricingMode === "monthly"
                              ? `Processing ${progress.completedDays} / ${progress.totalDays} start dates${progress.currentDate ? ` · current ${progress.currentDate}` : ""}`
                              : `Processing ${progress.completedDays} / ${progress.totalDays} days${progress.currentDate ? ` · current ${progress.currentDate}` : ""}`
                          : t.progressRunning
                        : t.progressDone}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </form>

          {error ? (
            <div className="mt-2 rounded-lg border border-rose-200 bg-[var(--accent-soft)] px-3 py-2 text-sm text-rose-700">
              <div>{t.errorPrefix}: {error}</div>
              {diagnosticUrls.length ? (
                <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                  <span className="text-rose-900/80">
                    {locale === "zh" ? "诊断文件:" : "Diagnostics:"}
                  </span>
                  {diagnosticUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-rose-900"
                    >
                      {url.split("/").pop()}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {result ? (
          <>
            <section className="grid gap-3">
              {activeMode === "monthly" ? (
                <TrendChart title={t.monthlyTrend} subtitle={t.chartSubtitle} daysLabel={t.daysCount} emptyLabel={t.noChartData} color="#b32572" rows={result.report.rows} type="monthly" />
              ) : (
                <TrendChart title={t.dailyTrend} subtitle={t.chartSubtitle} daysLabel={t.daysCount} emptyLabel={t.noChartData} color="#ff385c" rows={result.report.rows} type="daily" />
              )}
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {activeMode === "monthly" ? (
                <>
                  <SummaryCard label={t.marketMin} value={summary?.monthly ? formatMoney(summary.monthly.min) : "N/A"} hint={t.monthlyMedianHint} />
                  <SummaryCard label={t.monthlyMedian} value={summary?.monthly ? formatMoney(summary.monthly.median) : "N/A"} hint={t.monthlyMedianHint} />
                  <SummaryCard label={t.suggestedDailyPrice} value={planSummary?.monthlySuggestedDaily ? formatMoney(planSummary.monthlySuggestedDaily.median) : "N/A"} hint={t.monthlyModeHint} />
                  <SummaryCard label={t.suggestedMonthlyPrice} value={planSummary?.monthlySuggested ? formatMoney(planSummary.monthlySuggested.median) : "N/A"} hint={t.monthlyAvgHint} />
                </>
              ) : (
                <>
                  <SummaryCard label={t.dailyHigh} value={summary?.daily ? formatMoney(summary.daily.max) : "N/A"} hint={t.dailyHighHint} />
                  <SummaryCard label={t.dailyLow} value={summary?.daily ? formatMoney(summary.daily.min) : "N/A"} hint={t.dailyLowHint} />
                  <SummaryCard label={t.dailyAvg} value={summary?.daily ? formatMoney(summary.daily.avg) : "N/A"} hint={t.dailyAvgHint} />
                  <SummaryCard label={t.suggestedListPrice} value={planSummary?.dailySuggested ? formatMoney(planSummary.dailySuggested.avg) : "N/A"} hint={t.dailyModeHint} />
                </>
              )}
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 shadow-sm sm:px-5">
              <h2 className="text-base font-semibold text-[var(--ink)]">{t.recommendations}</h2>
              <div className="mt-2 grid gap-2">
                {result.report.recommendations.map((item, index) => (
                  <div key={`${index}-${item}`} className="rounded-lg border border-[#ffd7dc] bg-[#fff7f7] px-3 py-2 text-sm leading-5 text-[#4f3f3f]">
                    {translateRecommendation(item, locale)}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 shadow-sm sm:px-5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-base font-semibold text-[var(--ink)]">{t.similarListings}</h2>
                <p className="text-xs text-[var(--muted)]">{t.similarListingsDesc}</p>
              </div>

              {suggestedListings.length ? (
                <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                  {suggestedListings.map((listing) => (
                    <article
                      key={listing.href}
                      className="rounded-lg border border-[var(--line)] bg-[#fffaf9] p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--ink)]">
                            {translatePropertyType(listing.propertyType, locale) || translateRoomType(listing.roomType, locale) || "Airbnb"}
                          </div>
                          <div className="mt-1 text-xs text-[var(--muted)] break-all">{listing.href}</div>
                        </div>
                        <div className="shrink-0 rounded-md bg-[var(--accent-soft)] px-2.5 py-1 text-sm font-semibold text-[var(--accent-deep)]">
                          {formatMoney(listing.price)}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-[var(--muted)]">
                        {listing.bedrooms != null ? (
                          <span className="rounded-md border border-[var(--line)] bg-white px-2 py-0.5">
                            {listing.bedrooms} {t.similarBedrooms}
                          </span>
                        ) : null}
                        {listing.bathrooms != null ? (
                          <span className="rounded-md border border-[var(--line)] bg-white px-2 py-0.5">
                            {listing.bathrooms} {t.similarBathrooms}
                          </span>
                        ) : null}
                        {listing.roomType ? (
                          <span className="rounded-md border border-[var(--line)] bg-white px-2 py-0.5">
                            {translateRoomType(listing.roomType, locale)}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 text-xs text-[var(--muted)]">
                        {t.similarSeenIn}:{" "}
                        {[
                          listing.seenInDaily ? t.similarDaily : null,
                          listing.seenInMonthly ? t.similarMonthly : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {t.similarMatches}: {listing.occurrences}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {t.similarAddressMatch}: {listing.addressMatched ? t.similarAddressMatched : t.similarAddressApprox}
                      </div>

                      <div className="mt-3">
                        <a
                          href={listing.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--accent-deep))] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
                        >
                          {t.similarOpen}
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-[var(--line)] bg-white/70 px-3 py-4 text-sm text-[var(--muted)]">
                  {t.similarListingsNone}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 shadow-sm sm:px-5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--ink)]">
                    {activeMode === "monthly" ? t.monthlyPlan : t.dailyPlan}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {result.report.input.address} · {translatePropertyType(result.report.input.propertyType?.display || t.noPropertyLimit, locale)} · {translateRoomType(result.report.input.roomType.display, locale)}
                  </p>
                </div>
                <div className="flex flex-col gap-2 text-xs text-[var(--muted)] lg:items-end">
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {result.reportPdfUrl ? (
                      <a
                        href={result.reportPdfUrl}
                        download
                        className="inline-flex rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--accent-deep))] px-3 py-1.5 font-semibold text-white shadow-sm transition hover:brightness-105"
                      >
                        {t.exportPdf}
                      </a>
                    ) : (
                      <span className="inline-flex rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-[var(--muted)]">
                        {t.pdfUnavailable}
                      </span>
                    )}
                    {result.reportHtmlUrl ? (
                      <a
                        href={result.reportHtmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 font-semibold text-[var(--accent-deep)] transition hover:border-[var(--accent)]"
                      >
                        {t.openHtml}
                      </a>
                    ) : null}
                    {result.reportJsonUrl ? (
                      <a
                        href={result.reportJsonUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 font-semibold text-[var(--accent-deep)] transition hover:border-[var(--accent)]"
                      >
                        {t.openJson}
                      </a>
                    ) : null}
                  </div>
                  <div className="max-w-xl truncate text-right leading-5">
                    {t.pdfReport}: {result.reportPdfUrl || result.savedPdfPath || t.pdfUnavailable}
                  </div>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                  <thead>
                    {activeMode === "monthly" ? (
                      <tr className="text-left text-[var(--muted)]">
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.date}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.checkoutDate}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.marketMin}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.marketP25}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.marketMedian}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.suggestedDailyPrice}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.suggestedMonthlyPrice}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.samples}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.confidence}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.note}</th>
                      </tr>
                    ) : (
                      <tr className="text-left text-[var(--muted)]">
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.date}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.marketMin}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.marketP25}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.marketMedian}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.suggestedListPrice}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.suggestedMinimumPrice}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.samples}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.competition}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.confidence}</th>
                        <th className="border-b border-[var(--line)] px-2.5 py-2">{t.note}</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {activeMode === "monthly"
                      ? (result.report.monthlyPricingPlan || []).map((row) => (
                          <tr key={`${row.date}-${row.checkoutDate}`}>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2 font-medium text-[var(--ink)]">{row.date}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{row.checkoutDate}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{formatMoney(row.marketMin)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{formatMoney(row.marketP25)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{formatMoney(row.marketMedian)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2 font-semibold text-[var(--accent-deep)]">{formatMoney(row.suggestedDailyPrice)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2 font-semibold text-[var(--accent-deep)]">{formatMoney(row.suggestedMonthlyPrice)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{row.comparableCount}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{translateConfidence(row.confidence, locale)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{translatePlanNote(row.note, locale)}</td>
                          </tr>
                        ))
                      : result.report.dailyPricingPlan.map((row) => (
                          <tr key={row.date}>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2 font-medium text-[var(--ink)]">{row.date}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{formatMoney(row.marketMin)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{formatMoney(row.marketP25)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{formatMoney(row.marketMedian)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2 font-semibold text-[var(--accent-deep)]">{formatMoney(row.suggestedListPrice)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{formatMoney(row.suggestedMinimumPrice)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{row.comparableCount}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{translateCompetitionLevel(row.competitionLevel, locale)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{translateConfidence(row.confidence, locale)}</td>
                            <td className="border-b border-[#f2e7e3] px-2.5 py-2">{translatePlanNote(row.note, locale)}</td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 shadow-sm sm:px-5">
              <h2 className="text-base font-semibold text-[var(--ink)]">{t.dailyDetails}</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-left text-[var(--muted)]">
                      <th className="border-b border-[var(--line)] px-2.5 py-2">{t.date}</th>
                      <th className="border-b border-[var(--line)] px-2.5 py-2">{t.dailyRentMedian}</th>
                      <th className="border-b border-[var(--line)] px-2.5 py-2">{t.monthlyRentMedian}</th>
                      <th className="border-b border-[var(--line)] px-2.5 py-2">{t.matchingStrategy}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.report.rows.map((row) => (
                      <tr key={row.date}>
                        <td className="border-b border-[#f2e7e3] px-2.5 py-2 font-medium text-[var(--ink)]">{row.date}</td>
                        <td className="border-b border-[#f2e7e3] px-2.5 py-2">{formatMoney(row.daily?.priceStats?.median)}</td>
                        <td className="border-b border-[#f2e7e3] px-2.5 py-2">{formatMoney(row.monthly?.priceStats?.median)}</td>
                        <td className="border-b border-[#f2e7e3] px-2.5 py-2">
                          <div>{translateMatchLabel(row.daily?.matchLabel || "N/A", locale)}</div>
                          <div className="mt-1 text-xs text-[#aa8f8f]">{translateMatchLabel(row.monthly?.matchLabel || "N/A", locale)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 shadow-sm sm:px-5">
              <h2 className="text-base font-semibold text-[var(--ink)]">{t.runLogs}</h2>
              <pre className="mt-3 max-h-64 overflow-x-auto overflow-y-auto rounded-lg bg-[#2d1f22] p-3 text-xs leading-5 text-[#fff4f4]">
                {result.stdout || result.stderr || t.noLogs}
              </pre>
            </section>
          </>
        ) : (
          <section className="rounded-xl border border-dashed border-[var(--line)] bg-white/78 px-4 py-8 text-center text-sm text-[var(--muted)] shadow-sm">
            {t.emptyState}
          </section>
        )}
      </div>
    </main>
  );
}
