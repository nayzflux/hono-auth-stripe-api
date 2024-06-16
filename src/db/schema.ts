import {
  datetime,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  varchar,
} from "drizzle-orm/mysql-core";

export const planEnum = mysqlEnum("plan", ["FREE", "PREMIUM", "PRO"]);

export const userTable = mysqlTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  email: varchar("email", { length: 320 }).unique().notNull(),
  password: varchar("password", { length: 255 }),
  plan: planEnum.default("FREE"),
  planStartedAt: datetime("plan_started_at"),
  planRenewedAt: datetime("plan_renewed_at"),
  planExpiresAt: datetime("plan_expires_at"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 })
    .unique()
    .notNull(),
  createdAt: datetime("created_at").notNull(),
});

export const sessionTable = mysqlTable("sessions", {
  id: varchar("password", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  expiresAt: datetime("expires_at").notNull(),
});

export const accountTable = mysqlTable(
  "accounts",
  {
    providerName: varchar("provider_name", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 255 }).notNull(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.providerName, t.providerId] }),
  })
);
