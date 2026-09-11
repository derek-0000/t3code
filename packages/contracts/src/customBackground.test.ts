import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  CUSTOM_BACKGROUND_FILTERS,
  CustomBackgroundFilter,
  CustomBackgroundRecord,
  defaultCustomBackgroundFilter,
  isGenerativeCustomBackgroundFilter,
} from "./customBackground.ts";

const decodeFilter = Schema.decodeUnknownSync(CustomBackgroundFilter);
const decodeRecord = Schema.decodeUnknownSync(CustomBackgroundRecord);
const encodeRecord = Schema.encodeSync(CustomBackgroundRecord);

describe("CustomBackgroundFilter", () => {
  it.each(CUSTOM_BACKGROUND_FILTERS.map((filter) => filter.kind))(
    "accepts the defaults of %s",
    (kind) => {
      expect(decodeFilter(defaultCustomBackgroundFilter(kind))).toEqual(
        defaultCustomBackgroundFilter(kind),
      );
    },
  );

  it("rejects values outside the playground range", () => {
    expect(() =>
      decodeFilter({ ...defaultCustomBackgroundFilter("image-dithering"), size: 21 }),
    ).toThrow();
    expect(() =>
      decodeFilter({ ...defaultCustomBackgroundFilter("image-dithering"), colorSteps: 2.5 }),
    ).toThrow();
    expect(() =>
      decodeFilter({ ...defaultCustomBackgroundFilter("fluted-glass"), shape: "circle" }),
    ).toThrow();
    expect(() =>
      decodeFilter({ ...defaultCustomBackgroundFilter("grain-gradient"), colors: [] }),
    ).toThrow();
    expect(() =>
      decodeFilter({ ...defaultCustomBackgroundFilter("image-dithering"), colorBack: "red" }),
    ).toThrow();
  });

  it("rejects unknown and retired filters outside saved records", () => {
    expect(() => decodeFilter({ kind: "mesh-gradient" })).toThrow();
    expect(() => decodeFilter({ kind: "water" })).toThrow();
  });

  it("separates generative filters from image filters", () => {
    expect(isGenerativeCustomBackgroundFilter("static-mesh-gradient")).toBe(true);
    expect(isGenerativeCustomBackgroundFilter("grain-gradient")).toBe(true);
    expect(isGenerativeCustomBackgroundFilter("image-dithering")).toBe(false);
    expect(isGenerativeCustomBackgroundFilter("none")).toBe(false);
  });
});

describe("CustomBackgroundRecord", () => {
  it("accepts a generative record without an image", () => {
    const record = decodeRecord({
      id: "bg-1",
      name: "Mesh",
      source: { kind: "none" },
      filter: defaultCustomBackgroundFilter("static-mesh-gradient"),
      fade: 50,
      createdAt: "2026-09-08T00:00:00.000Z",
    });
    expect(record.source.kind).toBe("none");
  });

  it("rejects blank names and fades outside 0-100", () => {
    const base = {
      id: "bg-1",
      name: "Sunset",
      source: { kind: "none" },
      filter: { kind: "none" },
      fade: 50,
      createdAt: "2026-09-08T00:00:00.000Z",
    };
    expect(() => decodeRecord({ ...base, name: "   " })).toThrow();
    expect(() => decodeRecord({ ...base, fade: 101 })).toThrow();
    expect(() => decodeRecord({ ...base, fade: 12.5 })).toThrow();
  });

  it("loads a record whose filter was retired as no filter", () => {
    const record = decodeRecord({
      id: "bg-1",
      name: "Sunset",
      source: { kind: "image", imageId: "a".repeat(64) },
      filter: { kind: "water", size: 1 },
      fade: 50,
      createdAt: "2026-09-08T00:00:00.000Z",
    });
    expect(record.filter).toEqual({ kind: "none" });
    expect(record.source).toEqual({ kind: "image", imageId: "a".repeat(64) });
    expect(encodeRecord(record).filter).toEqual({ kind: "none" });
  });
});
