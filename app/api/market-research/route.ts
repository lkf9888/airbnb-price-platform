import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.string().min(5),
  propertyType: z.string().trim().optional().or(z.literal("")),
  roomType: z.string().min(1),
  bedrooms: z.coerce.number().min(0).max(20),
  bathrooms: z.coerce.number().min(0).max(20),
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

function extractReportPath(output: string) {
  const matched = output.match(/Saved JSON report:\s(.+)$/m);
  return matched ? matched[1].trim() : null;
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

  try {
    const { stdout, stderr } = await execFileAsync("node", args, {
      cwd: repoRoot(),
      timeout: 10 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });

    const combinedOutput = `${stdout}\n${stderr}`;
    const jsonPath = extractReportPath(combinedOutput);

    if (!jsonPath) {
      return NextResponse.json(
        {
          error: message(
            locale,
            "查价已执行，但没有识别到报告文件路径。",
            "Lookup finished, but the report file path could not be detected.",
          ),
          stdout,
          stderr,
        },
        { status: 500 },
      );
    }

    const report = JSON.parse(await fs.readFile(jsonPath, "utf8"));

    return NextResponse.json({
      report,
      savedJsonPath: jsonPath,
      savedHtmlPath: jsonPath.replace(/\.json$/i, ".html"),
      stdout,
      stderr,
    });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    return NextResponse.json(
      {
        error: failure.message || message(locale, "查价执行失败。", "Price lookup failed."),
        stdout: failure.stdout || "",
        stderr: failure.stderr || "",
      },
      { status: 500 },
    );
  }
}
