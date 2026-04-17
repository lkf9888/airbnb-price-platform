import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;
const rateLimitBuckets = new Map<string, number[]>();

const STALE_RUNNING_MS = 12 * 60 * 1000;

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

const requestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.string().min(5),
  propertyType: z.string().trim().optional().or(z.literal("")),
  roomType: z.string().min(1),
  bedrooms: z.coerce.number().min(0).max(20),
  bathrooms: z.coerce.number().min(0).max(20),
  locale: z.enum(["zh", "en"]).optional(),
  centerLat: z.number().min(-90).max(90).optional(),
  centerLng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().min(0.1).max(50).optional(),
});

function resolveLocale(request: Request, locale?: "zh" | "en") {
  if (locale === "zh" || locale === "en") {
    return locale;
  }

  const acceptLanguage = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return acceptLanguage.includes("zh") ? "zh" : "en";
}

function message(locale: "zh" | "en", zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function repoRoot() {
  return process.cwd();
}

function scriptPath() {
  return path.join(repoRoot(), "server", "automation", "scripts", "airbnb-market-research.js");
}

function storageStatePath() {
  return path.join(repoRoot(), "server", "automation", "state", "auth", "airbnb-chrome-storage-state.json");
}

function jobsDir() {
  return path.resolve(repoRoot(), "server", "output", "jobs");
}

function jobFilePath(jobId: string) {
  return path.join(jobsDir(), `${jobId}.json`);
}

async function writeJobState(jobId: string, state: Record<string, unknown>) {
  await fs.mkdir(jobsDir(), { recursive: true });
  await fs.writeFile(jobFilePath(jobId), JSON.stringify(state), "utf8");
}

async function readJobState(jobId: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(jobFilePath(jobId), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractReportPath(output: string) {
  const matched = output.match(/Saved JSON report:\s(.+)$/m);
  return matched ? matched[1].trim() : null;
}

function extractDiagnosticUrls(output: string) {
  const names = new Set<string>();

  for (const match of output.matchAll(/Saved diagnostic (?:screenshot|HTML):\s+(\S+)$/gm)) {
    names.add(match[1].trim());
  }

  return Array.from(names).map((name) => `/api/reports/${encodeURIComponent(name)}`);
}

async function ensureAirbnbStorageState() {
  const targetPath = storageStatePath();

  try {
    await fs.access(targetPath);
    return;
  } catch {
    // fall through
  }

  const inlineJson = process.env.AIRBNB_STORAGE_STATE_JSON?.trim();
  const base64Json = process.env.AIRBNB_STORAGE_STATE_BASE64?.trim();
  const rawJson = inlineJson || (base64Json ? Buffer.from(base64Json, "base64").toString("utf8") : "");

  if (!rawJson) {
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, rawJson, "utf8");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  const locale = resolveLocale(request, body?.locale);

  if (!consumeRateLimit(clientIp(request))) {
    return NextResponse.json(
      {
        error: message(
          locale,
          "查价请求太频繁，请稍后再试。",
          "Too many lookup requests. Please try again later.",
        ),
      },
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
  await ensureAirbnbStorageState();

  const args = [
    scriptPath(),
    "--headless",
    "--start-date",
    input.startDate,
    "--end-date",
    input.endDate,
    "--address",
    input.address,
    "--room-type",
    input.roomType,
    "--bedrooms",
    String(input.bedrooms),
    "--bathrooms",
    String(input.bathrooms),
  ];

  if (input.propertyType && input.propertyType.trim()) {
    args.push("--property-type", input.propertyType.trim());
  }

  if (typeof input.centerLat === "number" && typeof input.centerLng === "number") {
    args.push("--center-lat", String(input.centerLat));
    args.push("--center-lng", String(input.centerLng));
    if (typeof input.radiusKm === "number") {
      args.push("--radius-km", String(input.radiusKm));
    }
  }

  const jobId = randomUUID();
  const startedAt = new Date().toISOString();

  await writeJobState(jobId, {
    jobId,
    status: "running",
    startedAt,
    input,
  });

  let stdoutBuf = "";
  let stderrBuf = "";

  const child = spawn("node", args, {
    cwd: repoRoot(),
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  child.on("error", (err) => {
    void writeJobState(jobId, {
      jobId,
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      error: err.message,
      stdout: stdoutBuf,
      stderr: stderrBuf,
    }).catch(() => {});
  });

  child.on("exit", async (code) => {
    const finishedAt = new Date().toISOString();
    const combined = `${stdoutBuf}\n${stderrBuf}`;

    if (code === 0) {
      const jsonPath = extractReportPath(combined);
      if (!jsonPath) {
        await writeJobState(jobId, {
          jobId,
          status: "failed",
          startedAt,
          finishedAt,
          error: message(
            locale,
            "查价已执行，但没有识别到报告文件路径。",
            "Lookup finished, but the report file path could not be detected.",
          ),
          stdout: stdoutBuf,
          stderr: stderrBuf,
          diagnosticUrls: extractDiagnosticUrls(combined),
        }).catch(() => {});
        return;
      }

      try {
        const report = JSON.parse(await fs.readFile(jsonPath, "utf8"));
        const jsonFileName = path.basename(jsonPath);
        const htmlFileName = jsonFileName.replace(/\.json$/i, ".html");

        await writeJobState(jobId, {
          jobId,
          status: "done",
          startedAt,
          finishedAt,
          report,
          savedJsonPath: jsonPath,
          savedHtmlPath: jsonPath.replace(/\.json$/i, ".html"),
          reportJsonUrl: `/api/reports/${encodeURIComponent(jsonFileName)}`,
          reportHtmlUrl: `/api/reports/${encodeURIComponent(htmlFileName)}`,
          stdout: stdoutBuf,
          stderr: stderrBuf,
        });
      } catch (err) {
        await writeJobState(jobId, {
          jobId,
          status: "failed",
          startedAt,
          finishedAt,
          error: (err as Error).message,
          stdout: stdoutBuf,
          stderr: stderrBuf,
          diagnosticUrls: extractDiagnosticUrls(combined),
        }).catch(() => {});
      }
    } else {
      await writeJobState(jobId, {
        jobId,
        status: "failed",
        startedAt,
        finishedAt,
        error: message(
          locale,
          `查价执行失败 (退出码 ${code})。`,
          `Price lookup failed (exit code ${code}).`,
        ),
        stdout: stdoutBuf,
        stderr: stderrBuf,
        diagnosticUrls: extractDiagnosticUrls(combined),
      }).catch(() => {});
    }
  });

  return NextResponse.json({ jobId, status: "running", startedAt }, { status: 202 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() || "";

  if (!/^[A-Za-z0-9-]+$/.test(jobId) || jobId.length < 8) {
    return NextResponse.json({ error: "Invalid jobId." }, { status: 400 });
  }

  const state = await readJobState(jobId);
  if (!state) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (state.status === "running" && typeof state.startedAt === "string") {
    const startedAtMs = Date.parse(state.startedAt);
    if (Number.isFinite(startedAtMs) && Date.now() - startedAtMs > STALE_RUNNING_MS) {
      const stale = {
        ...state,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: "Job appears stale. The worker may have crashed or been restarted.",
      };
      await writeJobState(jobId, stale).catch(() => {});
      return NextResponse.json(stale);
    }
  }

  return NextResponse.json(state);
}
