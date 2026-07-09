import { describe, expect, it } from "vitest";

import { ReadOnlySqlValidationError, assertReadOnlySql, buildQueryFeaturesSql } from "../src/index.js";

describe("assertReadOnlySql", () => {
  it("allows single SELECT statements", () => {
    expect(() => assertReadOnlySql("SELECT * FROM cities")).not.toThrow();
  });

  it("allows single WITH statements", () => {
    expect(() =>
      assertReadOnlySql("WITH filtered AS (SELECT * FROM cities) SELECT * FROM filtered"),
    ).not.toThrow();
  });

  it("rejects non-read-only statements with a typed error", () => {
    expect(() => assertReadOnlySql("DELETE FROM cities")).toThrow(ReadOnlySqlValidationError);
  });

  it("rejects stacked statements", () => {
    expect(() => assertReadOnlySql("SELECT * FROM cities; DROP TABLE cities")).toThrow(
      ReadOnlySqlValidationError,
    );
  });

  it("rejects statements with comments", () => {
    expect(() => assertReadOnlySql("SELECT * FROM cities -- sneaky")).toThrow(
      ReadOnlySqlValidationError,
    );
    expect(() => assertReadOnlySql("SELECT * FROM cities /* sneaky */")).toThrow(
      ReadOnlySqlValidationError,
    );
  });
});

describe("buildQueryFeaturesSql", () => {
  it("builds auditable SELECT SQL for query_features tool calls", () => {
    expect(buildQueryFeaturesSql({ layerId: "cities", where: "id IN ('c1')", limit: 5 })).toBe(
      'SELECT * FROM "cities" WHERE id IN (\'c1\') LIMIT 5',
    );
  });
});
