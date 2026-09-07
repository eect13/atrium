"use client";

import { useEffect } from "react";
import { registerAtriumSW } from "@/lib/sw-client";

export function SwRegister() {
  useEffect(() => registerAtriumSW(), []);
  return null;
}
