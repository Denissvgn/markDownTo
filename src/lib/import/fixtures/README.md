# Synthetic import fixtures

`syntheticTables.ts` contains invented examples authored for these regression tests. The fixtures cover rich tables, nested task lists, Unicode, literal Markdown code, malformed diagram tables, and wiki-style macro attributes. Names, IDs, and prose are generic examples; no personal files or copied requirement documents are needed.

Macro class and attribute names are retained as format syntax to exercise compatibility. Tests import the module directly, so a missing fixture module fails collection. Every HTML importer test also requires at least one assertion.
