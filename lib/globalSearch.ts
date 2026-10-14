export type GlobalSearchRecord = {
  key: string;
  title: string;
  category: string;
  detail: string;
  searchableText: string;
  href: string;
};

export function filterGlobalSearchRecords(
  records: GlobalSearchRecord[],
  query: string,
  limit = 12,
): GlobalSearchRecord[] {
  const terms = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0 || limit < 1) {
    return [];
  }

  return records
    .filter((record) => {
      const haystack = [
        record.title,
        record.category,
        record.detail,
        record.searchableText,
      ]
        .join(" ")
        .toLocaleLowerCase();

      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit);
}
