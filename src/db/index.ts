import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2/promise";

import { env } from "../lib/env";
import * as schema from "./schema";

const connection = await createConnection({
  uri: env.DATABASE_URL,
});

export const db = drizzle(connection, { schema: schema, mode: "planetscale" });
