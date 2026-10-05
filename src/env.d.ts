/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import("@/lib/auth-types").SessionUser | null;
    session: import("@/lib/auth-types").SessionInfo | null;
    ctx: import("@/lib/auth-types").WorkspaceContext | null;
    nonce: string;
  }
}
