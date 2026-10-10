export function runBackup(opts: { file: string; outDir: string; keep?: number; now?: Date }): Promise<{
  target: string;
  bytes: number;
  tables: number;
  kept: number;
  removed: string[];
}>;
export function parseArgs(args: string[]): { outDir: string; keep: number };
