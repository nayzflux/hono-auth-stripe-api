import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./lib/env";
import auth from "./routes/auth";
import users from "./routes/users";
import webhook from "./routes/webhook";
import checkout from "./routes/checkout";

const app = new Hono();

/**
 * Middlewares
 */

// Logger
// app.use(logger());

// Cors
app.use(
  cors({
    origin: env.ORIGIN_URL,
    allowMethods: ["POST", "GET", "PATCH", "DELETE"],
  })
);

/**
 * Routes
 */

// Auth
app.route("/api/v1/auth", auth);
// Users
app.route("/api/v1/users", users);

// Webhook
app.route("/api/v1/webhook", webhook);

// Checkout
app.route("/api/v1/checkout", checkout);

export default {
  fetch: app.fetch,
  port: env.PORT,
};
