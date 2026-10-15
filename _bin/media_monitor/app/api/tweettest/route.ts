import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = body.username;
    const limit = body.limit || 10;

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // Path to the python script
    const scriptPath = path.join(process.cwd(), "scripts", "lobstr_twitter_agent.py");
    
    // Command format: py "scripts/lobstr_twitter_agent.py" "<username>" <limit>
    const command = `py "${scriptPath}" "${username}" ${limit}`;

    console.log("Executing Agent:", command);
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes("Loading .env environment variables")) {
      console.warn("Agent Stderr:", stderr);
    }

    try {
      // Find the JSON part in stdout (in case python prints other things)
      // We expect the script to print a valid JSON string as the last output
      const jsonStart = stdout.indexOf("{");
      const jsonOutput = stdout.slice(jsonStart);
      const data = JSON.parse(jsonOutput.trim());
      return NextResponse.json(data);
    } catch (parseError) {
      console.error("Failed to parse agent JSON:", stdout);
      return NextResponse.json({ error: "Failed to parse Python script output. Ensure LOBSTR_API_KEY is set." }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Agent Execution Error:", error);
    return NextResponse.json({ error: "Failed to execute Lobstr agent: " + error.message }, { status: 500 });
  }
}
