import { Pool } from "pg";

let pool: Pool | null = null;

function buildLocalConnectUrl(hostAndPort: string) {
  const trimmed = hostAndPort.trim();
  if (!trimmed) {
    return "";
  }

  // Firebase SQL Connect can expose a local Postgres endpoint like 127.0.0.1:9399.
  return `postgres://postgres:postgres@${trimmed}/postgres?sslmode=disable`;
}

function resolveConnectionString() {
  const localSqlConnect = buildLocalConnectUrl(
    process.env.FIREBASE_DATA_CONNECT_SQL_CONNECT || ""
  );

  return (
    localSqlConnect ||
    process.env.FIREBASE_DATA_CONNECT_POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

function shouldUseSsl(connectionString: string) {
  if (!connectionString) {
    return false;
  }

  try {
    const url = new URL(connectionString);
    const host = url.hostname;
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode === "disable") {
      return false;
    }

    return host !== "127.0.0.1" && host !== "localhost";
  } catch {
    return true;
  }
}

export function getPostgresPool() {
  if (pool) {
    return pool;
  }

  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error(
      "Missing Postgres connection string. Set FIREBASE_DATA_CONNECT_POSTGRES_URL, DATABASE_URL, or POSTGRES_URL."
    );
  }

  const useSsl = shouldUseSsl(connectionString);

  pool = new Pool({
    connectionString,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  return pool;
}
