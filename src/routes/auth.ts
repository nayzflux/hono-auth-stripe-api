import { zValidator } from "@hono/zod-validator";
import { GitHub, generateState } from "arctic";
import { DrizzleError, and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";

import { db } from "../db";
import { accountTable, userTable } from "../db/schema";
import { env } from "../lib/env";
import { getSession, lucia, setSession } from "../lib/lucia";
import { nanoid } from "../lib/nanoid";
import { stripe } from "../lib/stripe";
import ky from "ky";

const app = new Hono();

/**
 * Sign Up
 */

// TODO: Check password complexity
const signUpJson = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(255),
});

app.post("/sign-up", zValidator("json", signUpJson), async (c) => {
  try {
    // Get validated input
    const { email, password } = c.req.valid("json");

    // Hash password using Argon2id
    const hash = await Bun.password.hash(password, "argon2id");

    // Generate ID
    const id = nanoid();
    const createdAt = new Date();

    // Create Stripe Customer
    const customer = await stripe.customers.create({
      email: email,
    });

    // Create user in database
    await db.insert(userTable).values({
      id: id,
      email: email,
      password: hash,
      createdAt: createdAt,
      stripeCustomerId: customer.id,
    });

    // Session
    await setSession(c, id);

    // Send response
    return c.json(
      {
        id: id,
        email: email,
        createdAt: createdAt,
      },
      201
    );
  } catch (err) {
    if (err instanceof DrizzleError) {
      return c.json({}, 409);
    }

    console.error(err);

    return c.json({}, 500);
  }
});

/**
 * Sign In
 */
const signInJson = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(255),
});

app.post("/sign-in", zValidator("json", signInJson), async (c) => {
  // Get validated input
  const { email, password } = c.req.valid("json");

  // Get user from database
  const user = (
    await db
      .select({
        id: userTable.id,
        email: userTable.email,
        password: userTable.password,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .where(eq(userTable.email, email))
  )[0];

  // If user does not exists
  if (!user) return c.json({}, 404);

  // If user used social auth
  if (!user.password) return c.json({}, 401);

  // Check credentials
  const match = await Bun.password.verify(password, user.password, "argon2id");
  if (!match) return c.json({}, 401);

  // Session
  await setSession(c, user.id);

  // Send response
  return c.json(
    {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    },
    200
  );
});

/**
 * Sign Out
 */
app.post("/sign-out", async (c) => {
  const { session } = await getSession(c);

  // Invalidate session if exists
  if (session) {
    await lucia.invalidateSession(session.session.id);
  }

  // Delete session cookie
  const blankCookie = lucia.createBlankSessionCookie();

  await setSignedCookie(
    c,
    blankCookie.name,
    blankCookie.value,
    env.SESSION_SECRET,
    blankCookie.attributes
  );

  return c.json({}, 200);
});

const github = new GitHub(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, {
  redirectURI: env.GITHUB_CALLBACK_URL,
});

/**
 * Github OAuth
 */
app.get("/github", async (c) => {
  const state = generateState();
  const url = await github.createAuthorizationURL(state, {
    scopes: ["read:user", "user:email"],
  });

  setCookie(c, "github_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/",
  });

  return c.redirect(url.toString());
});

app.get("/github/callback", async (c) => {
  const stateCookie = getCookie(c, "github_oauth_state");
  const { state, code } = c.req.query();

  if (stateCookie !== state || !code) return c.json({}, 400);

  try {
    const { accessToken } = await github.validateAuthorizationCode(code);

    const res1 = await ky.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const githubUser = (await res1.json()) as { id: string };

    const res2 = await ky.get("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const githubEmails = (await res2.json()) as {
      email: string;
      verified: boolean;
      primary: boolean;
      visibility: boolean;
    }[];

    const email = githubEmails.find(
      (e) => e.primary === true && e.verified === true
    );

    if (!email) return c.json({}, 400);

    // If account exists
    const account = (
      await db
        .select()
        .from(accountTable)
        .where(
          and(
            eq(accountTable.providerName, "GITHUB"),
            eq(accountTable.providerId, githubUser.id)
          )
        )
    )[0];

    if (account) {
      await setSession(c, account.userId);
      return c.json({ message: "Logged in" }, 200);
    }

    // If user exists
    const user = (
      await db
        .select({
          id: userTable.id,
        })
        .from(userTable)
        .where(eq(userTable.email, email.email))
    )[0];

    if (user) {
      // Create Account
      await db.insert(accountTable).values({
        providerId: githubUser.id,
        providerName: "GITHUB",
        userId: user.id,
      });

      // Set Session
      await setSession(c, user.id);

      return c.json({ message: "Github account linked" }, 200);
    }

    // If user and account doesnt exists
    const userId = nanoid();
    const createdAt = new Date();

    // Create Customer
    const customer = await stripe.customers.create({
      email: email.email,
    });

    // Create User
    await db.insert(userTable).values({
      id: userId,
      email: email.email,
      stripeCustomerId: customer.id,
      createdAt: createdAt,
    });

    // Create Account
    await db.insert(accountTable).values({
      providerId: githubUser.id,
      providerName: "GITHUB",
      userId: userId,
    });

    // Set Session
    await setSession(c, userId);

    return c.json({ message: "User created" }, 200);
  } catch (err) {
    console.error(err);
    return c.json({}, 500);
  }
});

export default app;
