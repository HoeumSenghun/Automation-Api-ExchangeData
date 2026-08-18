function yyMmDd(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Unique enough for serverless: date + 10ms tick, not a file sequence. */
export function nextRefId(override?: string): string {
  const custom = override?.trim();
  if (custom) {
    return custom;
  }
  const seq = String(Math.floor(Date.now() / 10) % 10000).padStart(4, "0");
  return `EXCH${yyMmDd()}${seq}`;
}
