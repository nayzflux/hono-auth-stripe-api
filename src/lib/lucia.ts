import { DrizzleMySQLAdapter } from "@lucia-auth/adapter-drizzle";
import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { Lucia, TimeSpan } from "lucia";

import { db } from "../db";
import { sessionTable, userTable } from "../db/schema";
import { env } from "./env";

const adapter = new DrizzleMySQLAdapter(db, sessionTable, userTable);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      sameSite: "strict",
      secure: Bun.env.NODE_ENV === "production",
    },
  },
  sessionExpiresIn: new TimeSpan(30, "d"),
});

export const getSession = async (c: Context) => {
  // Get session ID from cookie
  const sessionId = await getSignedCookie(
    c,
    env.SESSION_SECRET,
    lucia.sessionCookieName
  );

  // If cookie is not set
  if (!sessionId) return { session: null };

  // Get session from database
  const session = await lucia.validateSession(sessionId);

  // If session does not exists
  if (!session || !session.user) return { session: null };

  return { session: session };
};

export const setSession = async (c: Context, userId: string) => {
  // Create session
  const session = await lucia.createSession(userId, {});
  const sessionCookie = lucia.createSessionCookie(session.id);

  // Set cookie
  await setSignedCookie(
    c,
    sessionCookie.name,
    sessionCookie.value,
    env.SESSION_SECRET,
    sessionCookie.attributes
  );
};
