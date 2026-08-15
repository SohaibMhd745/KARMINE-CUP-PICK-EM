"use client";

import { useEffect } from "react";

export interface ToastState {
  text: string;
  kind: "ok" | "error";
}

export default function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDismiss, toast.kind === "error" ? 6000 : 2500);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className={`toast${toast.kind === "error" ? " error" : ""}`}
      role="status"
      aria-live="polite"
    >
      {toast.text}
    </div>
  );
}
