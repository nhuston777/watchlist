"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/** Bottom sheet on phones, centered panel on wider screens. Closing goes back in history. */
export function Sheet({ children, label }: { children: ReactNode; label: string }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.back();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [router]);

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && router.back()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={panel}>
        <div className="sheet-bar">
          <span className="sheet-handle" aria-hidden="true" />
          <button type="button" className="sheet-close" onClick={() => router.back()} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
