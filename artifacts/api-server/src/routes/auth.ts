import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";
import * as oidc from "openid-client";
import {
  clearSession,
  createSession,
  getOidcConfig,
  getSessionId,
  ISSUER_URL,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";

import { privateBrowserBoundary } from "../middlewares/browserOrigin";

const router: IRouter = Router();
const OIDC_COOKIE_TTL = 10 * 60 * 1000;

function getOrigin(req: Request): string {
  if (process.env.ATLAS_PUBLIC_ORIGIN) return new URL(process.env.ATLAS_PUBLIC_ORIGIN).origin;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\x00-\x20]/.test(value)) return "/";
  try {
    const base = "https://local-return.invalid";
    const target = new URL(value, base);
    if (target.origin !== base || value.startsWith("//")) return "/";
    return target.pathname + target.search + target.hash;
  } catch { return "/"; }
}

function safeErrorMetadata(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    status: typeof value.status === "number" || typeof value.status === "string" ? value.status : undefined,
  };
}

async function upsertUser(claims: Record<string, unknown>) {
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("The identity response had no subject.");
  const userData = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    firstName: typeof claims.first_name === "string" ? claims.first_name : null,
    lastName: typeof claims.last_name === "string" ? claims.last_name : null,
    profileImageUrl: typeof claims.profile_image_url === "string"
      ? claims.profile_image_url
      : typeof claims.picture === "string" ? claims.picture : null,
  };
  const [user] = await db.insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { ...userData, updatedAt: new Date() },
    })
    .returning();
  return user;
}

router.get("/auth/user", (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.json(GetCurrentAuthUserResponse.parse({ user: req.isAuthenticated() ? req.user : null }));
});

router.get("/login", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const target = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: "openid email profile offline_access",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login consent",
      state,
      nonce,
    });
    setOidcCookie(res, "code_verifier", codeVerifier);
    setOidcCookie(res, "nonce", nonce);
    setOidcCookie(res, "state", state);
    setOidcCookie(res, "return_to", safeReturnTo(req.query.returnTo));
    res.redirect(target.href);
  } catch (error) {
    req.log?.error(safeErrorMetadata(error), "Browser sign-in could not start");
    res.status(503).json({ error: "Sign-in is currently unavailable." });
  }
});

// OIDC providers can add callback parameters not represented in the API schema.
router.get("/callback", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;
    const codeVerifier = req.cookies?.code_verifier;
    const nonce = req.cookies?.nonce;
    const expectedState = req.cookies?.state;
    if (typeof codeVerifier !== "string" || !codeVerifier || typeof nonce !== "string" || !nonce || typeof expectedState !== "string" || !expectedState) {
      res.redirect("/api/login");
      return;
    }

    const currentUrl = new URL(`${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`);
    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedNonce: nonce,
        expectedState,
        idTokenExpected: true,
      });
    } catch {
      res.redirect("/api/login");
      return;
    }

    const claims = tokens.claims();
    if (!claims) {
      res.redirect("/api/login");
      return;
    }
    const returnTo = safeReturnTo(req.cookies?.return_to);
    for (const key of ["code_verifier", "nonce", "state", "return_to"]) {
      res.clearCookie(key, { path: "/" });
    }
    const user = await upsertUser(claims as unknown as Record<string, unknown>);
    const now = Math.floor(Date.now() / 1000);
    const session: SessionData = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      },
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
    };
    setSessionCookie(res, await createSession(session));
    res.redirect(returnTo);
  } catch (error) {
    req.log?.error(safeErrorMetadata(error), "Browser sign-in callback failed");
    res.redirect("/api/login");
  }
});

router.get("/logout", privateBrowserBoundary, async (req, res) => {
  // Local session revocation must not depend on the identity provider being available.
  try {
    await clearSession(res, getSessionId(req));
  } catch (error) {
    req.log?.error(safeErrorMetadata(error), "Local session revocation failed");
    res.status(503).json({ error: "Sign-out could not be confirmed. Retry when the session store is available." });
    return;
  }
  try {
    const config = await getOidcConfig();
    const origin = getOrigin(req);
    const returnTo = safeReturnTo(req.query.returnTo);
    const endSessionUrl = oidc.buildEndSessionUrl(config, {
      client_id: process.env.REPL_ID!,
      post_logout_redirect_uri: new URL(returnTo, `${origin}/`).href,
    });
    res.redirect(endSessionUrl.href);
  } catch (error) {
    req.log?.error(safeErrorMetadata(error), "Browser sign-out failed");
    res.redirect("/");
  }
});

export default router;
