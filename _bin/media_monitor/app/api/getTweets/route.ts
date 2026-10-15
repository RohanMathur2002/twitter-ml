import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import util from "util";

const execAsync = util.promisify(exec);

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Username query parameter is required." },
      { status: 400 }
    );
  }

  // Basic validation to prevent command injection
  const sanitizedUsername = username.replace(/[^a-zA-Z0-9_]/g, "");

  // Resolve the python script absolute path (it's inside media_monitor/scripts now)
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts",
    "x_eval_tweets.py"
  );

  // Command to run the playwright python scraper
  const command = `py "${scriptPath}" ${sanitizedUsername}`;

  try {
    console.log(`[getTweets API] Executing Python scraper for user: ${sanitizedUsername}`);
    console.log(`[getTweets API] Command: ${command}`);
    const startTime = Date.now();

    // Execute command with a 60-second timeout
    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000, 
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer for safety
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[getTweets API] Scraper completed in ${elapsed}s`);
    if (stderr) console.log(`[getTweets API] Python stderr logs: ${stderr}`);

    try {
      const parsedData = JSON.parse(stdout);
      return NextResponse.json(parsedData, { status: 200 });
    } catch (parseError) {
      console.error("Failed to parse JSON:", stdout);
      return NextResponse.json(
        { error: "Failed to parse JSON output from the scraper." },
        { status: 500 }
      );
    }
  } catch (error: any) {
    // If the process was killed via timeout
    if (error.killed) {
      console.error(`[getTweets API] Execution timed out (>60s) for user: ${sanitizedUsername}`);
      return NextResponse.json(
        { error: "Script execution timed out (>60s)." },
        { status: 504 }
      );
    }

    console.error("Scraper execution error:", error.stderr || error.message);
    return NextResponse.json(
      { error: "Failed to execute the scraping script.", details: error.message },
      { status: 500 }
    );
  }
}
