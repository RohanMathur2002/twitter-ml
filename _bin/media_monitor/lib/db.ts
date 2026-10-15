import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var mediaMonitorPgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

const poolConfig: any = {
  max: 10,
  idleTimeoutMillis: 30_000,
};

if (connectionString) {
  poolConfig.connectionString = connectionString;
} else {
  poolConfig.host = process.env.POSTGRES_HOST || "localhost";
  poolConfig.port = Number(process.env.POSTGRES_PORT || 5432);
  poolConfig.database = process.env.POSTGRES_DB || "media_monitor";
  poolConfig.user = process.env.POSTGRES_USER || "postgres";
  poolConfig.password = process.env.POSTGRES_PASSWORD;
}

export const db = globalThis.mediaMonitorPgPool ?? new Pool(poolConfig);

if (process.env.NODE_ENV !== "production") {
  globalThis.mediaMonitorPgPool = db;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  return db.query<T>(text, params);
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
