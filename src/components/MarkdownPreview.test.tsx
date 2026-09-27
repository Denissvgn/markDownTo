import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownPreview } from './MarkdownPreview';

describe('MarkdownPreview', () => {
  it('renders GFM tables, task lists, and highlighted code', () => {
    render(
      <MarkdownPreview
        markdown={`# Preview

| Feature | Status |
| --- | --- |
| Tables | Ready |

- [x] Task lists

\`\`\`ts
const enabled = true;
\`\`\`
`}
      />
    );

    expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Tables')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(
      screen.getByText(
        (_, element) => element?.tagName.toLowerCase() === 'code' && Boolean(element.textContent?.includes('enabled = true'))
      )
    ).toBeInTheDocument();
  });

  it('does not execute raw HTML', () => {
    render(<MarkdownPreview markdown={'<button>Hidden</button>\n\nVisible text'} />);

    expect(screen.queryByRole('button', { name: 'Hidden' })).not.toBeInTheDocument();
    expect(screen.getByText('Visible text')).toBeInTheDocument();
  });
});
