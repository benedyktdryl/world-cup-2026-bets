import type { Client, Row } from "@libsql/client";

function asRow<T>(row: Row): T {
  return row as unknown as T;
}

export async function sqlGet<T>(
  db: Client,
  sql: string,
  args: unknown[] = [],
): Promise<T | null> {
  const result = await db.execute({ sql, args });
  if (result.rows.length === 0) {
    return null;
  }

  return asRow<T>(result.rows[0]);
}

export async function sqlAll<T>(
  db: Client,
  sql: string,
  args: unknown[] = [],
): Promise<T[]> {
  const result = await db.execute({ sql, args });
  return result.rows.map((row) => asRow<T>(row));
}

export async function sqlRun(
  db: Client,
  sql: string,
  args: unknown[] = [],
): Promise<void> {
  await db.execute({ sql, args });
}

export async function sqlExec(db: Client, sql: string): Promise<void> {
  await db.executeMultiple(sql);
}

export async function sqlTransaction(
  db: Client,
  fn: (tx: Client) => Promise<void>,
): Promise<void> {
  const tx = await db.transaction("write");

  try {
    await fn(tx);
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
