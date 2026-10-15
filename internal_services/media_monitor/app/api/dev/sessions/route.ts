import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getFilePath() {
  const envPath = process.env.NITTER_SESSIONS_FILE_PATH;
  if (envPath && envPath.trim() !== "") {
    return envPath.trim();
  }
  return path.join(process.cwd(), "sessions.jsonl");
}

export async function GET() {
  try {
    const filePath = getFilePath();
    let sessions: any[] = [];
    let nextId = 1;

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { ok: false, error: `Sessions file not found at: ${filePath}` },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        sessions.push(parsed);
        const numId = parseInt(parsed.id, 10);
        if (!isNaN(numId) && numId >= nextId) {
          nextId = numId + 1;
        }
      } catch (e) {
        // skip invalid lines
      }
    }

    return NextResponse.json({
      ok: true,
      filePath,
      total: sessions.length,
      nextId: String(nextId),
      sessions,
    });
  } catch (error) {
    console.error("Failed to read sessions:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read sessions file" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, auth_token, ct0 } = body;

    if (!username || !auth_token || !ct0) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: username, auth_token, ct0" },
        { status: 400 }
      );
    }

    const filePath = getFilePath();
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { ok: false, error: `Sessions file not found at: ${filePath}` },
        { status: 404 }
      );
    }

    let nextId = 1;
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split(/\r?\n/).filter((line) => line.trim() !== "");
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const cleanUser = String(username).trim().replace(/^@/, "").toLowerCase();
        if (parsed.username && parsed.username.toLowerCase() === cleanUser) {
          return NextResponse.json(
            { ok: false, error: `An entry with username @${parsed.username} is already present in the sessions file.` },
            { status: 400 }
          );
        }
        if (parsed.auth_token && parsed.auth_token === String(auth_token).trim()) {
          return NextResponse.json(
            { ok: false, error: `An entry (@${parsed.username || "unknown"}) with this auth_token is already present.` },
            { status: 400 }
          );
        }
        if (parsed.ct0 && parsed.ct0 === String(ct0).trim()) {
          return NextResponse.json(
            { ok: false, error: `An entry (@${parsed.username || "unknown"}) with this ct0 is already present.` },
            { status: 400 }
          );
        }
        const numId = parseInt(parsed.id, 10);
        if (!isNaN(numId) && numId >= nextId) {
          nextId = numId + 1;
        }
      } catch (e) {
        // ignore parsing error on individual line
      }
    }

    const sessionObj = {
      kind: "cookie",
      username: String(username).trim().replace(/^@/, ""),
      id: String(nextId),
      auth_token: String(auth_token).trim(),
      ct0: String(ct0).trim(),
    };

    const jsonlLine = JSON.stringify(sessionObj);
    let toAppend = jsonlLine + "\n";
    if (fileContent.length > 0 && !fileContent.endsWith("\n") && !fileContent.endsWith("\r\n")) {
      toAppend = "\n" + toAppend;
    }

    fs.appendFileSync(filePath, toAppend, "utf-8");

    return NextResponse.json({
      ok: true,
      filePath,
      session: sessionObj,
      nextId: String(nextId + 1),
    });
  } catch (error) {
    console.error("Failed to append session:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to append session to file" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, auth_token, ct0 } = body;

    if (!id || !auth_token || !ct0) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: id, auth_token, ct0" },
        { status: 400 }
      );
    }

    const filePath = getFilePath();
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { ok: false, error: `Sessions file not found at: ${filePath}` },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split(/\r?\n/);
    let updated = false;
    let updatedSession = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (String(parsed.id) !== String(id)) {
          if (parsed.auth_token && parsed.auth_token === String(auth_token).trim()) {
            return NextResponse.json(
              { ok: false, error: `Another entry (@${parsed.username || "unknown"}) already uses this auth_token.` },
              { status: 400 }
            );
          }
          if (parsed.ct0 && parsed.ct0 === String(ct0).trim()) {
            return NextResponse.json(
              { ok: false, error: `Another entry (@${parsed.username || "unknown"}) already uses this ct0.` },
              { status: 400 }
            );
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const newLines = lines.map((line) => {
      if (!line.trim()) return "";
      try {
        const parsed = JSON.parse(line);
        if (String(parsed.id) === String(id)) {
          updated = true;
          parsed.auth_token = String(auth_token).trim();
          parsed.ct0 = String(ct0).trim();
          updatedSession = parsed;
          return JSON.stringify(parsed);
        }
        return line;
      } catch (e) {
        return line;
      }
    }).filter((line) => line !== "");

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: `Session with ID #${id} not found in file.` },
        { status: 404 }
      );
    }

    fs.writeFileSync(filePath, newLines.join("\n") + "\n", "utf-8");

    return NextResponse.json({
      ok: true,
      filePath,
      session: updatedSession,
    });
  } catch (error) {
    console.error("Failed to update session:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update session in file" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const filePath = getFilePath();
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { ok: false, error: `Sessions file not found at: ${filePath}` },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split(/\r?\n/).filter((line) => line.trim() !== "");
    
    let counter = 1;
    const renumberedSessions: any[] = [];
    const newLines = lines.map((line) => {
      try {
        const parsed = JSON.parse(line);
        parsed.id = String(counter++);
        renumberedSessions.push(parsed);
        return JSON.stringify(parsed);
      } catch (e) {
        return line;
      }
    });

    // Write to a temporary file first for atomic transaction to prevent file corruption
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, newLines.join("\n") + (newLines.length > 0 ? "\n" : ""), "utf-8");
    fs.renameSync(tmpPath, filePath);

    return NextResponse.json({
      ok: true,
      filePath,
      total: renumberedSessions.length,
      nextId: String(counter),
      sessions: renumberedSessions,
    });
  } catch (error) {
    console.error("Failed to reindex sessions:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to reindex session IDs" },
      { status: 500 }
    );
  }
}
