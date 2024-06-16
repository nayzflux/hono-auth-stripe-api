import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { stripe } from "../lib/stripe";
import { getSession } from "../lib/lucia";
import { env } from "../lib/env";
import { db } from "../db";
import { userTable } from "../db/schema";
import { eq } from "drizzle-orm";

const app = new Hono();

const currency = "EUR";

const plans = [
  {
    id: "PREMIUM",
    price: 10.0 * 100,
    name: "Plan PREMIUM",
    description: "Plan PREMIUM description",
  },
  {
    id: "PRO",
    price: 20.0 * 100,
    name: "Plan PRO",
    description: "Plan PRO description",
  },
];

const checkoutJson = z.object({
  plan: z.enum(["PREMIUM", "PRO"]),
});

app.post("/", zValidator("json", checkoutJson), async (c) => {
  const { plan: planId } = c.req.valid("json");

  const { session } = await getSession(c);

  if (!session) return c.json({}, 401);

  const plan = plans.find((p) => p.id === planId);

  if (!plan) return c.json({}, 400);

  const user = (
    await db
      .select({ stripeCustomerId: userTable.stripeCustomerId })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
  )[0];

  const checkout = await stripe.checkout.sessions.create({
    success_url: env.ORIGIN_URL,
    cancel_url: env.ORIGIN_URL,

    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency,
          unit_amount: plan.price,
          recurring: {
            interval: "month",
          },
          product_data: {
            name: plan.name,
            description: plan.description,
            metadata: {
              plan: plan.id,
              userId: session.user.id,
            },
          },
        },
      },
    ],

    customer: user.stripeCustomerId,

    metadata: {
      plan: plan.id,
      userId: session.user.id,
    },

    mode: "subscription",
  });

  return c.json({ url: checkout.url }, 201);
});

export default app;
