import { NextResponse } from "next/server";
import { isSignedIn } from "@/lib/auth";
import { findExisting } from "@/lib/items";
import { isMediaKind } from "@/lib/labels";
import { getRatings } from "@/lib/omdb";
import { getDetails } from "@/lib/tmdb";

/** Preview data for one TMDB title: details, ratings, and the existing item if it's already on a list. */
export async function GET(_req: Request, ctx: RouteContext<"/api/title/[type]/[id]">) {
  if (!(await isSignedIn())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { type, id } = await ctx.params;
  const mediaType = type.toUpperCase();
  const tmdbId = Number(id);
  if (!isMediaKind(mediaType) || !Number.isInteger(tmdbId)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const existing = await findExisting(mediaType, tmdbId);
  try {
    const details = await getDetails(mediaType, tmdbId);
    const ratings = await getRatings(details.imdbId);
    return NextResponse.json({ details, ratings, existing });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't load this title.", existing }, { status: 502 });
  }
}
