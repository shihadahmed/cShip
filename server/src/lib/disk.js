import { promises as fs } from 'node:fs';

export async function getDiskSpace(path) {
  try {
    const stats = await fs.statfs(path);
    const free = stats.bfree * stats.bsize;
    const total = stats.blocks * stats.bsize;
    const used = total - free;
    return { free, total, used, usagePercent: total > 0 ? Math.round((used / total) * 100) : 0 };
  } catch {
    return { free: 0, total: 0, used: 0, usagePercent: 0 };
  }
}