const HTML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeBasicEntities(value: string) {
  return value.replace(/&(lt|gt|amp|quot|#39|nbsp);/gi, (match) => HTML_ENTITIES[match.toLowerCase()] || match);
}

function firstBoundaryIndex(value: string) {
  const boundaries = [
    /\n\s*On .{1,220}? wrote:\s*/i,
    /\sOn (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?[^\n]{1,220}? wrote:\s*/i,
    /\n\s*From:\s.+(?:\n|$)/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}\s*/i,
    /\n\s*_{5,}\s*/,
    /\n\s*>+\s*/,
    /\n\s*Sent from my (?:iPhone|iPad|Android)[^\n]*/i,
    /\sSent from my (?:iPhone|iPad|Android)(?:\s|$)/i,
    /\n\s*Get Outlook for (?:iOS|Android)[^\n]*/i,
    /\sGet Outlook for (?:iOS|Android)(?:\s|$)/i,
  ];

  let index = -1;
  for (const boundary of boundaries) {
    const match = boundary.exec(value);
    if (match && (index === -1 || match.index < index)) index = match.index;
  }
  return index;
}

export function extractLatestEmailReply(input: string) {
  let value = decodeBasicEntities(String(input || ""))
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .trim();

  if (!value) return "";

  const boundary = firstBoundaryIndex(value);
  if (boundary >= 0) value = value.slice(0, boundary).trim();

  value = value
    .replace(/\n\s*--\s*\n[\s\S]*$/m, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return value;
}
