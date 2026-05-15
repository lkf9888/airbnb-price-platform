import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceQueryAccess, recordBillableQuery } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_RUNNING_MS = 35 * 60 * 1000;
const DEFAULT_RADIUS_KM = 5;

const requestSchema = z.object({
  listingUrl: z.string().url(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stayNights: z.coerce.number().int().min(28).max(180).default(30),
  locale: z.enum(["zh", "en"]).optional(),
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
  return path.resolve(repoRoot(), "server", "output", "listing-check-jobs");
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
  const matched = output.match(/Saved listing check JSON report:\s(.+)$/m);
  return matched ? matched[1].trim() : null;
}

function defaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function extractCheckInDate(listingUrl: string) {
  try {
    const value = new URL(listingUrl).searchParams.get("check_in");
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  } catch {
    return null;
  }
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
  if (!/^https?:\/\/(?:www\.)?airbnb\.[a-z.]+\/rooms\/\d+/i.test(input.listingUrl)) {
    return NextResponse.json(
      { error: message(locale, "请输入有效的 Airbnb 房源链接。", "Please enter a valid Airbnb listing URL.") },
      { status: 400 },
    );
  }

  const access = await enforceQueryAccess(request, locale);
  if (!access.ok) {
    return access.response;
  }
  const billing = await recordBillableQuery(access.user?.id, "listing-competitiveness");

  await ensureAirbnbStorageState();

  const jobId = randomUUID();
  const startedAt = new Date().toISOString();
  const resolvedInput = {
    ...input,
    startDate: input.startDate || extractCheckInDate(input.listingUrl) || defaultStartDate(),
    radiusKm: DEFAULT_RADIUS_KM,
  };

  await writeJobState(jobId, {
    jobId,
    status: "running",
    startedAt,
    input: resolvedInput,
    billing,
  });

  let stdoutBuf = "";
  let stderrBuf = "";

  const child = spawn("node", [
    scriptPath(),
    "--headless",
    "--listing-check-url",
    resolvedInput.listingUrl,
    "--start-date",
    resolvedInput.startDate,
    "--monthly-nights",
    String(resolvedInput.stayNights),
    "--radius-km",
    String(DEFAULT_RADIUS_KM),
    "--max-results",
    "24",
  ], {
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
      input,
      resolvedInput,
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
          input,
          resolvedInput,
          error: message(locale, "核对已执行，但没有识别到报告文件路径。", "The check finished, but no report file path was detected."),
          stdout: stdoutBuf,
          stderr: stderrBuf,
        }).catch(() => {});
        return;
      }

      try {
        const report = JSON.parse(await fs.readFile(jsonPath, "utf8"));
        await writeJobState(jobId, {
          jobId,
          status: "done",
          startedAt,
          finishedAt,
          input,
          resolvedInput,
          report,
          savedJsonPath: jsonPath,
          reportJsonUrl: `/api/reports/${encodeURIComponent(path.basename(jsonPath))}`,
          stdout: stdoutBuf,
          stderr: stderrBuf,
        });
      } catch (err) {
        await writeJobState(jobId, {
          jobId,
          status: "failed",
          startedAt,
          finishedAt,
          input,
          resolvedInput,
          error: (err as Error).message,
          stdout: stdoutBuf,
          stderr: stderrBuf,
        }).catch(() => {});
      }
    } else {
      await writeJobState(jobId, {
        jobId,
        status: "failed",
        startedAt,
        finishedAt,
        input,
        resolvedInput,
        error: message(locale, `低价核对失败 (退出码 ${code})。`, `Listing check failed (exit code ${code}).`),
        stdout: stdoutBuf,
        stderr: stderrBuf,
      }).catch(() => {});
    }
  });

  return NextResponse.json({ jobId, status: "running", startedAt, billing }, { status: 202 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim();

  if (!jobId || !/^[A-Za-z0-9-]+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  const state = await readJobState(jobId);
  if (!state) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (state.status === "running") {
    const now = Date.now();
    const startedAtMs = typeof state.startedAt === "string" ? Date.parse(state.startedAt) : NaN;

    if (Number.isFinite(startedAtMs) && now - startedAtMs > STALE_RUNNING_MS) {
      const failedState = {
        ...state,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: "Listing check timed out.",
      };
      await writeJobState(jobId, failedState).catch(() => {});
      return NextResponse.json(failedState);
    }
  }

  return NextResponse.json(state);
}
