import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reportsDir() {
  return path.resolve(process.cwd(), "server", "output", "reports");
}

function resolveContentType(name: string) {
  if (name.toLowerCase().endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (name.toLowerCase().endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (name.toLowerCase().endsWith(".png")) {
    return "image/png";
  }
  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  if (!/^[A-Za-z0-9._-]+\.(html|json|png)$/i.test(decoded)) {
    return NextResponse.json({ error: "Invalid report name." }, { status: 400 });
  }

  const baseDir = reportsDir();
  const target = path.join(baseDir, decoded);
  const relative = path.relative(baseDir, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "Invalid report path." }, { status: 400 });
  }

  try {
    const data = await fs.readFile(target);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "content-type": resolveContentType(decoded),
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
}
