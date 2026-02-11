import { NextRequest, NextResponse } from "next/server";
import { CLOB_API_URL } from "@/constants/api";

export async function GET(request: NextRequest) {
  const tokenId = request.nextUrl.searchParams.get("tokenId");

  if (!tokenId) {
    return NextResponse.json(
      { error: "tokenId parameter is required" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `${CLOB_API_URL}/midpoint?token_id=${tokenId}`,
      {
        headers: { "Content-Type": "application/json" },
        next: { revalidate: 10 },
      }
    );

    if (!response.ok) {
      throw new Error(`CLOB API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching midpoint:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch midpoint" },
      { status: 500 }
    );
  }
}
