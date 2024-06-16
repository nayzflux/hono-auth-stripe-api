import { zValidator } from "@hono/zod-validator";
import { DrizzleError, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db";
import { userTable } from "../db/schema";
import { getSession } from "../lib/lucia";

const app = new Hono();

/**
 * Get Current User
 */
app.get("/@me", async (c) => {
  // Session
  const { session } = await getSession(c);
  if (!session) return c.json({}, 401);

  const user = (
    await db
      .select({
        id: userTable.id,
        email: userTable.email,
        plan: userTable.plan,
        planStartedAt: userTable.planStartedAt,
        planRenewedAt: userTable.planRenewedAt,
        planExpiresAt: userTable.planExpiresAt,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
  )[0];

  return c.json(user, 200);
});

/**
 * Update User
 */
const updateUserJson = z.object({
  email: z.string().email().max(320),
});

app.patch("/:userId", zValidator("json", updateUserJson), async (c) => {
  try {
    const { email } = c.req.valid("json");
    const { userId } = c.req.param();

    // Session
    const { session } = await getSession(c);
    if (!session) return c.json({}, 401);

    if (session.user.id !== userId) return c.json({}, 403);

    // Updata user in database
    await db
      .update(userTable)
      .set({
        email,
      })
      .where(eq(userTable.id, userId));

    return c.json({}, 200);
  } catch (err) {
    if (err instanceof DrizzleError) {
      return c.json({}, 404);
    }

    console.error(err);

    return c.json({}, 500);
  }
});

/**
 * Delete User
 */
app.delete("/:userId", async (c) => {
  try {
    const { userId } = c.req.param();

    // Session
    const { session } = await getSession(c);
    if (!session) return c.json({}, 401);

    if (session.user.id !== userId) return c.json({}, 403);

    // Delete user from database
    await db.delete(userTable).where(eq(userTable.id, userId));

    return c.json({}, 200);
  } catch (err) {
    if (err instanceof DrizzleError) {
      return c.json({}, 404);
    }

    console.error(err);

    return c.json({}, 500);
  }
});

export default app;
