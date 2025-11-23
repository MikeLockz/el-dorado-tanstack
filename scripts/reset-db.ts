import { Client } from "pg";
import "dotenv/config";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  console.log("Dropping public schema...");
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  console.log("Public schema recreated.");
  await client.end();
}

main().catch(console.error);
