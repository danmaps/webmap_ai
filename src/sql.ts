import type { QueryFeaturesArgs } from "./types.js";

const READ_ONLY_SQL_ERROR_CODE = "READ_ONLY_SQL_VALIDATION_ERROR";
const READ_ONLY_SQL_ERROR_MESSAGE =
  "Only a single read-only SELECT or WITH statement without comments is allowed.";

export class ReadOnlySqlValidationError extends Error {
  public readonly code = READ_ONLY_SQL_ERROR_CODE;

  public constructor(
    public readonly sql: string,
    message: string = READ_ONLY_SQL_ERROR_MESSAGE,
  ) {
    super(message);
    this.name = "ReadOnlySqlValidationError";
  }
}

export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim();

  if (!trimmed) {
    throw new ReadOnlySqlValidationError(sql);
  }

  let quote: "'" | '"' | null = null;
  let sawTerminator = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed.charAt(index);
    const nextChar = trimmed.charAt(index + 1);

    if (quote) {
      if (char === quote) {
        if (nextChar === quote) {
          index += 1;
          continue;
        }
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (startsSqlComment(char, nextChar)) {
      throw new ReadOnlySqlValidationError(sql);
    }

    if (char === ";") {
      if (sawTerminator || trimmed.slice(index + 1).trim()) {
        throw new ReadOnlySqlValidationError(sql);
      }
      sawTerminator = true;
    }
  }

  const withoutTerminator = sawTerminator ? trimmed.slice(0, -1).trimEnd() : trimmed;

  if (!/^(select|with)\b/i.test(withoutTerminator)) {
    throw new ReadOnlySqlValidationError(sql);
  }
}

export function buildQueryFeaturesSql(args: QueryFeaturesArgs): string {
  const baseSql = [
    `SELECT * FROM ${quoteIdentifier(args.layerId)}`,
    args.where?.trim() ? `WHERE ${args.where.trim()}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  assertReadOnlySql(baseSql);

  const sql = `${baseSql} LIMIT ${args.limit ?? 50}`;
  assertReadOnlySql(sql);
  return sql;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function startsSqlComment(char: string, nextChar?: string): boolean {
  return (char === "-" && nextChar === "-") || (char === "/" && nextChar === "*");
}
