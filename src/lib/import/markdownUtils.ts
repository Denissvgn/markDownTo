export function normalizeMarkdown(markdown: string): string {
  const normalized = markdown
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return normalized ? `${normalized}\n` : '';
}

export function escapeMarkdownText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/&/g, '\\&')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>');
}

export function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim();
}

export function markdownInlineCode(value: string): string {
  const longestBacktickRun = value.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0;
  const fence = '`'.repeat(longestBacktickRun + 1);
  const padding = value.startsWith('`') || value.endsWith('`') ? ' ' : '';

  return `${fence}${padding}${value}${padding}${fence}`;
}

export function markdownFence(value: string, language = ''): string {
  const longestFenceRun = value.match(/```+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0;
  const fence = '`'.repeat(Math.max(3, longestFenceRun + 1));

  return `${fence}${language}\n${value.replace(/\n$/, '')}\n${fence}`;
}

export function markdownLinkDestination(value: string): string {
  return value.trim().replace(/\s/g, '%20').replace(/([\\()<>&])/g, '\\$1');
}

export function markdownTitle(value: string | null): string {
  if (!value) return '';
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/&/g, '\\&');
  return ` "${escaped}"`;
}
