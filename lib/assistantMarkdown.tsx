import type { ReactNode } from "react";

function inlineMarkdown(text: string, prefix: string): ReactNode[] {
  const tokens =
    /(\*\*.+?\*\*|__.+?__|~~.+?~~|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]+\))/g;

  return text.split(tokens).filter(Boolean).map((part, index) => {
    const key = `${prefix}-${index}`;

    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return (
        <strong key={key}>
          {inlineMarkdown(part.slice(2, -2), key)}
        </strong>
      );
    }

    if (part.startsWith("~~") && part.endsWith("~~")) {
      return <del key={key}>{part.slice(2, -2)}</del>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }

    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return (
        <em key={key}>
          {inlineMarkdown(part.slice(1, -1), key)}
        </em>
      );
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

    if (link) {
      const [, label, destination] = link;
      const safeDestination =
        /^https?:\/\//i.test(destination) ||
        /^mailto:/i.test(destination) ||
        destination.startsWith("/") ||
        destination.startsWith("#");

      if (safeDestination) {
        const external = /^https?:\/\//i.test(destination);

        return (
          <a
            key={key}
            href={destination}
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {label}
          </a>
        );
      }
    }

    return part;
  });
}

function getListItem(line: string) {
  const unordered = line.match(/^(\s*)[-*+]\s+(.+)$/);
  if (unordered) {
    return {
      kind: "unordered" as const,
      indent: unordered[1].length,
      text: unordered[2],
    };
  }

  const ordered = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
  if (ordered) {
    return {
      kind: "ordered" as const,
      indent: ordered[1].length,
      text: ordered[2],
    };
  }

  return null;
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  const cells = tableCells(line);

  return (
    cells.length > 1 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function isTableStart(lines: string[], index: number): boolean {
  return Boolean(
    lines[index]?.includes("|") &&
    index + 1 < lines.length &&
    isTableDivider(lines[index + 1]),
  );
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() ?? "";

  return (
    /^#{1,3}\s/.test(line) ||
    /^```/.test(line) ||
    /^>/.test(line) ||
    Boolean(getListItem(line)) ||
    isTableStart(lines, index)
  );
}

export default function AssistantMarkdown({
  content,
}: {
  content: string;
}) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```([\w.+-]*)\s*$/);

    if (fence) {
      const code: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) index += 1;

      blocks.push(
        <pre key={`code-${index}`} className="ai-copilot__markdown-code">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);

    if (heading) {
      const Heading = `h${heading[1].length}` as "h1" | "h2" | "h3";

      blocks.push(
        <Heading key={`heading-${index}`}>
          {inlineMarkdown(heading[2], `heading-${index}`)}
        </Heading>,
      );
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = tableCells(line);
      index += 2;

      const rows: string[][] = [];

      while (
        index < lines.length &&
        lines[index].trim() &&
        lines[index].includes("|")
      ) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }

      blocks.push(
        <div className="ai-copilot__table-wrap" key={`table-${index}`}>
          <table>
            <thead>
              <tr>
                {headers.map((cell, cellIndex) => (
                  <th key={cellIndex}>
                    {inlineMarkdown(cell, `th-${index}-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex}>
                      {inlineMarkdown(
                        row[cellIndex] ?? "",
                        `td-${index}-${rowIndex}-${cellIndex}`,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, "").trim());
        index += 1;
      }

      blocks.push(
        <blockquote key={`quote-${index}`}>
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={quoteIndex}>
              {inlineMarkdown(quoteLine, `quote-${index}-${quoteIndex}`)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    const listItem = getListItem(line);

    if (listItem) {
      const items: string[] = [];
      const listKind = listItem.kind;
      const listIndent = listItem.indent;

      while (index < lines.length) {
        const item = getListItem(lines[index]);

        if (
          !item ||
          item.kind !== listKind ||
          item.indent !== listIndent
        ) {
          break;
        }

        items.push(item.text);
        index += 1;
      }

      const List = listKind === "ordered" ? "ol" : "ul";

      blocks.push(
        <List key={`list-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>
              {inlineMarkdown(item, `list-${index}-${itemIndex}`)}
            </li>
          ))}
        </List>,
      );
      continue;
    }

    const paragraph: string[] = [];

    while (index < lines.length && lines[index].trim()) {
      if (paragraph.length > 0 && startsBlock(lines, index)) break;

      paragraph.push(lines[index].trim());
      index += 1;
    }

    if (paragraph.length > 0) {
      blocks.push(
        <p key={`paragraph-${index}`}>
          {inlineMarkdown(paragraph.join(" "), `paragraph-${index}`)}
        </p>,
      );
    } else {
      index += 1;
    }
  }

  return <div className="ai-copilot__markdown">{blocks}</div>;
}
