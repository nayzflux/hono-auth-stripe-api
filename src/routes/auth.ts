import { zValidator } from "@hono/zod-validator";
import { DrizzleError, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db";
import { userTable } from "../db/schema";
import { nanoid } from "../lib/nanoid";
import { getSession, lucia, setSession } from "../lib/lucia";
import { setSignedCookie } from "hono/cookie";
import { env } from "../lib/env";
import { stripe } from "../lib/stripe";

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

export default app;
