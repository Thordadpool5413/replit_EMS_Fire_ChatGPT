import { useEffect, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";

export function AgencyWorkspaceAccess() {
  const { user, isLoading, login, logout } = useAuth();
  const [role, setRole] = useState<"viewer" | "editor" | "denied" | "unavailable" | "loading">("loading");
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setRole("loading");
    void fetch("/api/agencies/access", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (response.status === 403) return "denied" as const;
        if (!response.ok) return "unavailable" as const;
        const data = await response.json();
        return data.role === "viewer" || data.role === "editor" ? data.role as "viewer" | "editor" : "unavailable" as const;
      })
      .then(value => { if (!controller.signal.aborted) setRole(value); })
      .catch(() => { if (!controller.signal.aborted) setRole("unavailable"); });
    return () => controller.abort();
  }, [user]);
  return <section className="border-b border-slate-200 dark:border-slate-700 px-2 py-2 mb-1 text-xs text-slate-700 dark:text-slate-300" aria-label="Saved agency access">
    <p className="font-semibold">Saved agency workspace</p>
    {isLoading ? <p>Checking sign-in…</p> : !user ? <>
      <p>Public provider search stays available. Sign in to sync saved work.</p>
      <button type="button" className="workspace-text-button mt-1" onClick={login}>Sign in with Replit</button>
    </> : <>
      <p role="status">{role === "editor" ? "Editor · read and save" : role === "viewer" ? "Viewer · read only" : role === "denied" ? "Administrator authorization required" : role === "loading" ? "Checking access…" : "Access could not be verified"}</p>
      {role === "denied" && <p className="break-all">Your Replit account ID: {user.id}</p>}
      <button type="button" className="workspace-text-button mt-1" onClick={logout}>Sign out</button>
    </>}
    <p className="mt-1">Offline recovery records remain on this device; use a trusted device.</p>
  </section>;
}
