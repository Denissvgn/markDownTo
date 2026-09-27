// Invented examples for conversion regressions. No external documents or
// personal/product requirement text are used. Macro attributes model syntax.
export const BASIC_TABLE = '<table><tbody><tr><th>Example key</th><th>Value</th></tr><tr><td>SAMPLE-01</td><td>Draft</td></tr></tbody></table>';

export const COLOR_TABLE = `<table class="wrapped confluenceTable"><colgroup><col><col></colgroup><tbody>
<tr><th>Цвет</th><th>Значение</th></tr>
<tr><td><strong>Синий</strong></td><td>Example <code>blue</code><span>&nbsp;</span>color.</td></tr>
</tbody></table>`;

export const REVIEW_TABLE = `<table><tbody>
<tr><th>Reviewer</th><th>State</th></tr>
<tr><td><ul class="inline-task-list"><li class="checked">Reviewer A</li><li>Reviewer B</li></ul></td><td><p>Checked | Recorded</p></td></tr>
</tbody></table>`;

export const REVIEW_DOCUMENT = `<h1>🧩 Synthetic worksheet</h1><p>Draft example</p>${BASIC_TABLE}${REVIEW_TABLE}<h2>Color examples</h2>${COLOR_TABLE}`;
export const LITERAL_TABLE_EXAMPLE = ['```html', BASIC_TABLE, '```'].join('\n');
export const MARKDOWN_DOCUMENT = ['# 🧩 Synthetic notes', LITERAL_TABLE_EXAMPLE, BASIC_TABLE, '## Color examples', COLOR_TABLE, '- End of example'].join('\n\n');

export const DIAGRAM_MACRO = `<table class="wysiwyg-macro" data-macro-name="mermaiddiagram" data-macro-id="synthetic-diagram"><tbody><tr><td class="wysiwyg-macro-body"><pre>sequenceDiagram
actor Reader
participant Panel
Reader-&gt;&gt;Panel: Open example</pre></td></tr></tbody></table>`;

export const CODE_MACRO = `<table class="wysiwyg-macro" data-macro-name="code" data-macro-parameters="language=python|title=example.py"><tbody><tr><td class="wysiwyg-macro-body"><pre>def example():
    return "sample"</pre></td></tr></tbody></table>`;

export const MALFORMED_DIAGRAM = ['|', 'sequenceDiagram', '    Reader->>Panel: Open example', '', ' |', '| --- |'].join('\n');
export const MACRO_DOCUMENT = `<h1>Synthetic macro review</h1><p>Draft sample</p>${DIAGRAM_MACRO}${CODE_MACRO}${REVIEW_TABLE}`;
