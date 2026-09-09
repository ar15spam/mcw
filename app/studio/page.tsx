"use client";

import { Suspense } from "react";
import StudioWorkspace from "@/components/studio/StudioWorkspace";
import { StudioBoot } from "@/components/studio/StudioBoot";

export default function StudioPage() {
  return (
    <Suspense fallback={<StudioBoot label="Loading studio…" />}>
      <StudioWorkspace />
    </Suspense>
  );
}
