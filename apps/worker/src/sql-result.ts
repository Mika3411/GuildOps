type CountableResult = {
  affectedRows?: number | null;
  rowCount?: number | null;
  rows?: unknown[];
};

export function resultCount(result: CountableResult): number {
  if (typeof result.rowCount === "number") return result.rowCount;
  if (result.rows?.length) return result.rows.length;
  if (typeof result.affectedRows === "number") return result.affectedRows;
  return 0;
}
