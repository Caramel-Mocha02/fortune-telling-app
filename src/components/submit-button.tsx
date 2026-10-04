"use client";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass()}>
      {pending ? (pendingText ?? "送信中…") : children}
    </button>
  );
}
