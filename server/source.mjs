export function imageSources(html) {
  return [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(
    (match) => match[1],
  );
}

export function annotateSourceBlocks(html) {
  let index = 0;
  return html.replace(
    /<(h2|h3|p|li|blockquote|figcaption)(\s[^>]*)?>/gi,
    (match, tagName, attributes = "") => {
      index += 1;
      return `<${tagName}${attributes} data-source-block="B${String(index).padStart(3, "0")}">`;
    },
  );
}
