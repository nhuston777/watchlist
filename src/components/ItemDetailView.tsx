"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { ItemView } from "@/lib/types";
import { ItemDetail } from "./ItemDetail";
import { Sheet } from "./Sheet";

export function ItemSheet({ item, seasons }: { item: ItemView; seasons?: ReactNode }) {
  const router = useRouter();
  return (
    <Sheet label={item.title}>
      <ItemDetail item={item} seasons={seasons} onClose={() => router.back()} />
    </Sheet>
  );
}

export function ItemPageView({ item, seasons }: { item: ItemView; seasons?: ReactNode }) {
  const router = useRouter();
  return <ItemDetail item={item} seasons={seasons} onClose={() => router.replace("/")} />;
}
