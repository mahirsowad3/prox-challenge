import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body?.message;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "A valid message is required." },
        { status: 400 }
      );
    }

    const result = await runAgent(message);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Chat route error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Internal server error.";

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
