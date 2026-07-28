import React from "react";

import guideMd from "../../../docs/designer-guide.md?raw";

function renderInline(text, keyPrefix) {
  return text
    .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;

      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }

      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }

      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = parseTableRow(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function isHeading(line) {
  return /^#{1,3}\s+/.test(line);
}

function isBlockStart(lines, index) {
  const line = lines[index];

  return (
    line.startsWith("```") ||
    isHeading(line) ||
    /^>\s?/.test(line) ||
    /^-\s+/.test(line) ||
    (line.includes("|") &&
      index + 1 < lines.length &&
      isTableSeparator(lines[index + 1]))
  );
}

function renderGuide(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const start = index;
      const language = line.slice(3).trim();
      const codeLines = [];
      index += 1;

      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index >= lines.length) {
        blocks.push(
          <p className="guide-raw" key={`raw-fence-${start}`}>
            {lines.slice(start).join("\n")}
          </p>,
        );
        break;
      }

      blocks.push(
        <pre key={`code-${start}`}>
          <code className={language ? `language-${language}` : undefined}>
            {codeLines.join("\n")}
          </code>
        </pre>,
      );
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const Heading = `h${level}`;
      blocks.push(
        <Heading key={`heading-${index}`}>
          {renderInline(headingMatch[2], `heading-${index}`)}
        </Heading>,
      );
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      const start = index;

      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push(
        <blockquote key={`quote-${start}`}>
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={`quote-${start}-${quoteIndex}`}>
              {renderInline(quoteLine, `quote-${start}-${quoteIndex}`)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items = [];
      const start = index;

      while (index < lines.length && /^-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^-\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`list-${start}`}>
          {items.map((item, itemIndex) => (
            <li key={`list-${start}-${itemIndex}`}>
              {renderInline(item, `list-${start}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      isTableSeparator(lines[index + 1])
    ) {
      const start = index;
      const headers = parseTableRow(line);
      const rows = [];
      index += 2;

      while (index < lines.length && lines[index].trim().includes("|")) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }

      blocks.push(
        <div className="guide-table-scroll" key={`table-${start}`}>
          <table>
            <thead>
              <tr>
                {headers.map((header, cellIndex) => (
                  <th key={`table-${start}-head-${cellIndex}`} scope="col">
                    {renderInline(
                      header,
                      `table-${start}-head-${cellIndex}`,
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`table-${start}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`table-${start}-${rowIndex}-${cellIndex}`}>
                      {renderInline(
                        cell,
                        `table-${start}-${rowIndex}-${cellIndex}`,
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

    const paragraphLines = [line];
    const start = index;
    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines, index)
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push(
      <p className="guide-paragraph" key={`paragraph-${start}`}>
        {renderInline(paragraphLines.join(" "), `paragraph-${start}`)}
      </p>,
    );
  }

  return blocks;
}

export function GuidePage() {
  return (
    <main className="guide-page">
      <article className="guide-document">{renderGuide(guideMd)}</article>
    </main>
  );
}
