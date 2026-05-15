import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

export const SESSION_COOKIE = "app_session";
export const QUERY_PRICE_CENTS = 100;
export const QUERY_PRICE_CURRENCY = "CAD";

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  queryCount: number;
  totalCents: number;
};

type StoredSession = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type StoredIpTrial = {
  ipHash: string;
  usedAt: string;
};

type AuthStore = {
  users: StoredUser[];
  sessions: StoredSession[];
  ipTrials: StoredIpTrial[];
};

export type PublicUser = {
  id: string;
  email: string;
  queryCount: number;
  totalCents: number;
};

type Locale = "zh" | "en";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STORE_VERSION: AuthStore = {
  users: [],
  sessions: [],
  ipTrials: [],
};

function authSecret() {
  return process.env.AUTH_SECRET?.trim() || "airbnb-price-platform-local-auth-secret";
}

function authStorePath() {
  return path.join(process.cwd(), "server", "output", "auth-store.json");
}

async function readStore(): Promise<AuthStore> {
  try {
    const raw = await fs.readFile(authStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AuthStore>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      ipTrials: Array.isArray(parsed.ipTrials) ? parsed.ipTrials : [],
    };
  } catch {
    return {
      users: [],
      sessions: [],
      ipTrials: [],
    };
  }
}

async function writeStore(store: AuthStore) {
  await fs.mkdir(path.dirname(authStorePath()), { recursive: true });
  await fs.writeFile(authStorePath(), JSON.stringify(store, null, 2), "utf8");
}

function publicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    queryCount: user.queryCount || 0,
    totalCents: user.totalCents || 0,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password: string, user: StoredUser) {
  const candidate = Buffer.from(hashPassword(password, user.passwordSalt), "hex");
  const stored = Buffer.from(user.passwordHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashIp(ip: string) {
  return createHmac("sha256", authSecret()).update(ip || "unknown").digest("hex");
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function sessionCookieValue(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(request: Request) {
  const token = sessionCookieValue(request);
  if (!token) {
    return null;
  }

  const store = await readStore();
  const now = Date.now();
  const tokenHash = hashToken(token);
  const session = store.sessions.find((item) => item.tokenHash === tokenHash);
  if (!session || Date.parse(session.expiresAt) <= now) {
    return null;
  }

  const user = store.users.find((item) => item.id === session.userId);
  return user ? publicUser(user) : null;
}

export async function getAuthStatus(request: Request) {
  const user = await getCurrentUser(request);
  const store = await readStore();
  const ipHash = hashIp(clientIp(request));

  return {
    user,
    trialUsed: store.ipTrials.some((item) => item.ipHash === ipHash),
    pricing: {
      amountCents: QUERY_PRICE_CENTS,
      currency: QUERY_PRICE_CURRENCY,
      label: "C$1 / query",
    },
  };
}

export async function registerUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const store = await readStore();

  if (store.users.some((user) => user.email === normalizedEmail)) {
    throw new Error("EMAIL_EXISTS");
  }

  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: randomBytes(16).toString("hex"),
    email: normalizedEmail,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    queryCount: 0,
    totalCents: 0,
  };

  store.users.push(user);
  const token = createSessionForUser(store, user.id);
  await writeStore(store);

  return { user: publicUser(user), token };
}

export async function loginUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const store = await readStore();
  const user = store.users.find((item) => item.email === normalizedEmail);

  if (!user || !verifyPassword(password, user)) {
    throw new Error("INVALID_LOGIN");
  }

  const token = createSessionForUser(store, user.id);
  await writeStore(store);
  return { user: publicUser(user), token };
}

export async function logoutUser(request: Request) {
  const token = sessionCookieValue(request);
  if (!token) {
    return;
  }

  const tokenHash = hashToken(token);
  const store = await readStore();
  store.sessions = store.sessions.filter((session) => session.tokenHash !== tokenHash);
  await writeStore(store);
}

function createSessionForUser(store: AuthStore, userId: string) {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  store.sessions = store.sessions.filter((session) => Date.parse(session.expiresAt) > now);
  store.sessions.push({
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  });
  return token;
}

export function attachSession(response: NextResponse, token: string) {
  setSessionCookie(response, token);
  return response;
}

export async function enforceQueryAccess(request: Request, locale: Locale) {
  const user = await getCurrentUser(request);
  if (user) {
    return { ok: true as const, user };
  }

  const ipHash = hashIp(clientIp(request));
  const store = await readStore();
  const used = store.ipTrials.some((trial) => trial.ipHash === ipHash);

  if (used) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          authRequired: true,
          error: locale === "zh"
            ? "免费试用已用完。请注册或登录后继续查询，收费标准为 C$1 / 次查询。"
            : "Your free trial has been used. Register or log in to continue. Pricing is C$1 per query.",
          pricing: {
            amountCents: QUERY_PRICE_CENTS,
            currency: QUERY_PRICE_CURRENCY,
            label: "C$1 / query",
          },
        },
        { status: 401 },
      ),
    };
  }

  store.ipTrials.push({
    ipHash,
    usedAt: new Date().toISOString(),
  });
  await writeStore(store);

  return { ok: true as const, user: null };
}

export async function recordBillableQuery(userId: string | undefined, queryType: string) {
  if (!userId) {
    return null;
  }

  const store = await readStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user) {
    return null;
  }

  user.queryCount = (user.queryCount || 0) + 1;
  user.totalCents = (user.totalCents || 0) + QUERY_PRICE_CENTS;
  await writeStore(store);

  return {
    user: publicUser(user),
    queryType,
    amountCents: QUERY_PRICE_CENTS,
    currency: QUERY_PRICE_CURRENCY,
  };
}
