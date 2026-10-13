"use client";

import { cn } from "@/lib/utils";

/**
 * "Sign in with Google" per Google's branding guidelines (pill, standard four-colour G on a
 * white disc, outline in light, filled black in dark), scaled to 44px tall. The hexes are
 * Google's brand colours, used only in this button (Card 164 exception), never Atrium tokens.
 * Not the GIS ID-token button: Atrium needs the authorization-code flow for Calendar access.
 */
export function GoogleSignInButton({ onClick, disabled, label = "Sign in with Google", className }: { onClick: () => void; disabled?: boolean; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 items-center gap-2.5 rounded-full border pl-[3px] pr-4 text-[14px] font-medium leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-60",
        "border-[#747775] bg-[#FFFFFF] text-[#1F1F1F] dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3]",
        className,
      )}
      style={{ fontFamily: '"Google Sans", Roboto, Arial, sans-serif' }}
    >
      <span aria-hidden className="inline-flex size-[38px] items-center justify-center rounded-full bg-[#FFFFFF]">
        <svg viewBox="0 0 48 48" className="size-5">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
      </span>
      {label}
    </button>
  );
}
