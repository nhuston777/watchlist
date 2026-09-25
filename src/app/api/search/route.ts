import { NextResponse, type NextRequest } from "next/server";
import { isSignedIn } from "@/lib/auth";
import { runSearch } from "@/lib/search";

export async function GET(request: NextRequest) {
  if (!(await isSignedIn())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [], chooser: null, selected: null });
  try {
    return NextResponse.json(await runSearch(q));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Search failed. Try again." }, { status: 502 });
  }
}
