import { Hono } from "hono";
import Stripe from "stripe";
import { env } from "../lib/env";
import { db } from "../db";
import { userTable } from "../db/schema";
import { eq } from "drizzle-orm";

const app = new Hono();

app.post("/stripe", async (c) => {
  try {
    const stripe = new Stripe(env.STRIPE_API_KEY);
    const signature = c.req.header("stripe-signature");

    if (!signature) {
      return c.json({}, 400);
    }

    const body = await c.req.text();
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case "customer.subscription.deleted":
        console.log("Subscription deleted");

        const customerId = event.data.object.customer.toString();

        await db
          .update(userTable)
          .set({
            plan: "FREE",
            planExpiresAt: null,
            planRenewedAt: null,
            planStartedAt: null,
          })
          .where(eq(userTable.stripeCustomerId, customerId));
        break;

      case "customer.subscription.updated": {
        const status = event.data.object.status;
        const customerId = event.data.object.customer.toString();

        const product = await stripe.products.retrieve("prod_QIojarp2sj8Aka");

        const plan = product.metadata.plan as "PREMIUM" | "PRO";
        const planStartedAt = new Date(event.data.object.created * 1000);
        const planRenewedAt = new Date(
          event.data.object.current_period_start * 1000
        );
        const planExpiresAt = new Date(
          event.data.object.current_period_end * 1000
        );

        // Subscription is active give access
        if (status === "active") {
          console.log("Subscription activated");

          await db
            .update(userTable)
            .set({
              plan: plan,
              planExpiresAt,
              planRenewedAt,
              planStartedAt,
            })
            .where(eq(userTable.stripeCustomerId, customerId));
        }

        // Subscription is canceled / not paid / incomplete / past due remove access
        if (
          status === "canceled" ||
          status === "incomplete_expired" ||
          status === "unpaid" ||
          status === "past_due" ||
          status === "paused"
        ) {
          console.log("Subscription canceled");

          await db
            .update(userTable)
            .set({
              plan: "FREE",
              planExpiresAt: null,
              planRenewedAt: null,
              planStartedAt: null,
            })
            .where(eq(userTable.id, customerId));
        }

        break;
      }
      default:
        break;
    }

    return c.json({}, 200);
  } catch (err) {
    console.error(err);
    return c.json({}, 400);
  }
});

export default app;
