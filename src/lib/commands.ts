export interface Command {
  id: string;
  label: string;
  group: string;
  /** Extra English words so search works in any interface language. */
  keywords: string;
  run: () => void;
}

/** Case-insensitive match on every typed word against label + keywords. Empty query keeps all. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  return commands.filter((c) => {
    const hay = `${c.label} ${c.keywords}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
