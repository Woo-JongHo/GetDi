const formatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function uncachedInputTokens(usage) {
  return Math.max(
    0,
    (usage?.input_tokens || 0) - (usage?.cached_input_tokens || 0),
  );
}

function formatDate(value) {
  if (!value) return "날짜 미상";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

export { formatDate, uncachedInputTokens };
