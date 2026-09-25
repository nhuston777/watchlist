"use client";

import Image from "next/image";
import { useState } from "react";
import { posterUrl } from "@/lib/format";

type Size = "w92" | "w185" | "w342" | "w500";

/** 2:3 poster with a shimmer while loading and a titled placeholder tile when there's no image. */
export function Poster({ path, title, size = "w185", className = "" }: { path: string | null; title: string; size?: Size; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = path && !failed;
  return (
    <div className={`poster ${showImage && !loaded ? "shimmer" : ""} ${className}`}>
      {showImage ? (
        <Image
          src={posterUrl(path, size)}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 600px) 40vw, 200px"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ opacity: loaded ? 1 : 0 }}
        />
      ) : (
        <span className="poster-title">{title}</span>
      )}
    </div>
  );
}
