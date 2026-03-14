import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const client = postgres(connectionString, {
  max: 20,
  idle_timeout: 120,
  connect_timeout: 30,
  max_lifetime: 60 * 60,
});

export const db = drizzle(client, { schema });
export { schema };
