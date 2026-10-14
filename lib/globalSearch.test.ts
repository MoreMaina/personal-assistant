import { describe, expect, it } from "vitest";

import {
  filterGlobalSearchRecords,
  type GlobalSearchRecord,
} from "./globalSearch";

const records: GlobalSearchRecord[] = [
  {
    key: "project-1",
    title: "Research proposal",
    category: "Project",
    detail: "Active · Next action: review sources",
    searchableText: "research proposal active review sources",
    href: "/projects?projectId=1",
  },
  {
    key: "book-2",
    title: "The Art of Learning",
    category: "Book",
    detail: "Josh Waitzkin · Reading",
    searchableText: "the art of learning josh waitzkin reading",
    href: "/reading?findBookId=2",
  },
  {
    key: "lecture-3",
    title: "Drug metabolism",
    category: "Study lecture",
    detail: "Pharmacology · Unit 4",
    searchableText: "drug metabolism pharmacology unit 4",
    href: "/study/manage?findLectureId=3",
  },
];

describe("global search filtering", () => {
  it("matches case-insensitively", () => {
    expect(filterGlobalSearchRecords(records, "RESEARCH")[0].key)
      .toBe("project-1");
  });

  it("requires every query term to match", () => {
    expect(filterGlobalSearchRecords(records, "drug unit 4")[0].key)
      .toBe("lecture-3");
    expect(filterGlobalSearchRecords(records, "drug learning"))
      .toEqual([]);
  });

  it("returns no results for an empty query", () => {
    expect(filterGlobalSearchRecords(records, "   ")).toEqual([]);
  });

  it("respects the result limit", () => {
    expect(filterGlobalSearchRecords(records, "a", 1)).toHaveLength(1);
  });
});
