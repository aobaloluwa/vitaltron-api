import "dotenv/config";
import { defineConfig } from "prisma/config";

const dbUrl = process.env["DATABASE_URL"] || "";
let directUrl = process.env["DIRECT_URL"];

if (!directUrl && dbUrl) {
  // If using Supabase pooler on port 6543 without explicit DIRECT_URL,
  // map to port 5432 for direct DDL migrations (pgBouncer on 6543 blocks advisory locks)
  directUrl = dbUrl.replace(":6543", ":5432").replace("?pgbouncer=true", "");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: directUrl || dbUrl,
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
