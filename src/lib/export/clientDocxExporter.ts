/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Root } from 'mdast';
import { toDocx } from 'mdast2docx';
import { imagePlugin, listPlugin } from 'mdast2docx/plugins';
import * as docx from 'docx';
import { parseMarkdown } from '../markdown/parser';
import type { ExportAdapter, ExportRequest } from './types';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Microsoft Word themed blockquote (callout) plugin
const blockquotePlugin = {
  block(docxLib: typeof docx, node: any, paraProps: any, blockChildrenProcessor: any) {
    if (node.type !== 'blockquote') return [];

    node.type = ''; // Prevent default blockquote processing

    // Pass custom indent, shading, and left border to children
    const children = blockChildrenProcessor(node, {
      ...paraProps,
      indent: { left: 720 },
      shading: {
        type: docxLib.ShadingType.SOLID,
        fill: "F4F7FA" // Soft light blue-gray shading
      },
      borders: {
        left: {
          style: docxLib.BorderStyle.SINGLE,
          size: 24, // 3pt border
          color: "2F5496" // MS Word accent blue
        }
      }
    });

    return children;
  }
};

// Microsoft Word themed code block plugin
const codeBlockPlugin = {
  block(docxLib: typeof docx, node: any) {
    if (node.type !== 'code') return [];

    const codeNode = node as any;
    node.type = ''; // Prevent default code processing

    const lines = (codeNode.value || '').split('\n');

    return [
      new docxLib.Paragraph({
        alignment: docxLib.AlignmentType.LEFT,
        style: 'blockCode',
        keepLines: true,
        shading: {
          type: docxLib.ShadingType.SOLID,
          fill: "F5F5F5" // Light gray shading
        },
        border: {
          top: { style: docxLib.BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 6 },
          bottom: { style: docxLib.BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 6 },
          left: { style: docxLib.BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 10 },
          right: { style: docxLib.BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 6 }
        },
        children: lines.map((line: string, index: number) => {
          return new docxLib.TextRun({
            text: line,
            font: { name: "Consolas" },
            size: 20, // 10pt code size
            color: "333333",
            break: index === 0 ? undefined : 1
          });
        })
      })
    ];
  }
};

// Custom table plugin with auto-fit column widths based on content length
const autofitTablePlugin = {
  block(docxLib: typeof docx, node: any, _paraProps: any, childrenProcessor: any) {
    if (node.type !== 'table') return [];

    const rows = node.children || [];
    if (rows.length === 0) return [];

    // Find the max number of columns in the table
    let maxCols = 0;
    rows.forEach((row: any) => {
      const cellCount = row.children?.length || 0;
      if (cellCount > maxCols) maxCols = cellCount;
    });

    if (maxCols === 0) return [];

    // Compute max character length for each column
    const colMaxLengths = new Array(maxCols).fill(0);

    function getInnerTextLength(astNode: any): number {
      if (!astNode) return 0;
      if (astNode.value) return astNode.value.length;
      if (astNode.children) {
        return astNode.children.reduce((acc: number, child: any) => acc + getInnerTextLength(child), 0);
      }
      return 0;
    }

    rows.forEach((row: any) => {
      const cells = row.children || [];
      cells.forEach((cell: any, colIdx: number) => {
        if (colIdx < maxCols) {
          const textLen = getInnerTextLength(cell);
          if (textLen > colMaxLengths[colIdx]) {
            colMaxLengths[colIdx] = textLen;
          }
        }
      });
    });

    // Determine weight for column widths (minimum weight of 8 to ensure tiny columns still display)
    const minWeight = 8;
    const weights = colMaxLengths.map(len => Math.max(len, minWeight));
    const totalWeight = weights.reduce((acc, w) => acc + w, 0);

    // Turn weights into percentage widths that sum to 100%
    const colWidthPercentages = weights.map(w => (totalWeight > 0 ? (w / totalWeight) * 100 : 100 / maxCols));

    // Preprocess tableCell child nodes, wrapping inline elements in paragraphs
    const preprocessCell = (cell: any) => {
      const blockTypes = ["paragraph", "heading", "code", "list", "blockquote", "thematicBreak", "fragment", "table"];
      const compiled: any[] = [];
      let inlineGroup: any[] = [];

      for (const child of cell.children || []) {
        if (blockTypes.includes(child.type)) {
          if (inlineGroup.length > 0) {
            compiled.push({ type: "paragraph", children: [...inlineGroup] });
            inlineGroup = [];
          }
          compiled.push(child);
        } else {
          inlineGroup.push(child);
        }
      }
      if (inlineGroup.length > 0) {
        compiled.push({ type: "paragraph", children: inlineGroup });
      }
      cell.children = compiled;
    };

    const alignments = node.align || [];
    const docxRows = rows.map((row: any, rowIdx: number) => {
      const cells = row.children || [];

      const docxCells = cells.map((cell: any, colIdx: number) => {
        preprocessCell(cell);

        // Alignment based on mdast metadata
        let cellAlign: any = docxLib.AlignmentType.LEFT;
        const alignStr = alignments[colIdx];
        if (alignStr === 'right') {
          cellAlign = docxLib.AlignmentType.RIGHT;
        } else if (alignStr === 'center') {
          cellAlign = docxLib.AlignmentType.CENTER;
        } else if (rowIdx === 0) {
          // Headers centered by default in Microsoft style
          cellAlign = docxLib.AlignmentType.CENTER;
        }

        const isHeader = rowIdx === 0;
        const cellShading = isHeader ? {
          type: docxLib.ShadingType.SOLID,
          fill: "2F5496" // Microsoft Word Executive Blue accent
        } : undefined;

        const cellTextColor = isHeader ? "FFFFFF" : "333333";
        const cellBold = isHeader;

        // Process children inside the cell
        const processedChildren = childrenProcessor(cell, {
          alignment: cellAlign,
          bold: cellBold,
          color: cellTextColor
        });

        const colWidthPercent = colWidthPercentages[colIdx];

        return new docxLib.TableCell({
          verticalAlign: docxLib.VerticalAlignTable.CENTER,
          shading: cellShading,
          width: {
            size: colWidthPercent,
            type: docxLib.WidthType.PERCENTAGE
          },
          children: processedChildren
        });
      });

      return new docxLib.TableRow({
        cantSplit: true,
        children: docxCells
      });
    });

    const tableOptions = {
      width: {
        size: 100,
        type: docxLib.WidthType.PERCENTAGE
      },
      borders: {
        top: { style: docxLib.BorderStyle.SINGLE, color: "2F5496", size: 8 },
        bottom: { style: docxLib.BorderStyle.SINGLE, color: "2F5496", size: 8 },
        insideHorizontal: { style: docxLib.BorderStyle.SINGLE, color: "D3D3D3", size: 4 },
        left: { style: docxLib.BorderStyle.NIL },
        right: { style: docxLib.BorderStyle.NIL },
        insideVertical: { style: docxLib.BorderStyle.NIL }
      },
      rows: docxRows
    };

    node._type = node.type;
    node.type = ''; // Mark node as compiled to prevent double-compilation

    return [new docxLib.Table(tableOptions)];
  }
};

export const clientDocxExporter: ExportAdapter = {
  format: 'docx',
  label: 'DOCX',
  extension: 'docx',
  mimeType: DOCX_MIME_TYPE,
  status: 'active',
  async export(request) {
    const ast = sanitizeDocxAst(parseMarkdown(request.markdown));
    const includeImages = containsImages(ast as unknown as MutableMdastNode);

    try {
      return await renderDocx(ast, request, includeImages);
    } catch (error) {
      console.warn('DOCX export with images failed. Retrying with image alt text.', error);
      return renderDocx(replaceImagesWithText(ast), request, false);
    }
  }
};

async function renderDocx(ast: Root, request: ExportRequest, includeImages: boolean): Promise<Blob> {
  const docxProps: any = {
    title: request.title,
    creator: 'MarkdownTo',
    lastModifiedBy: 'MarkdownTo',
    revision: 1,
    styles: {
      default: {
        document: {
          paragraph: {
            spacing: { before: 0, after: 120, line: 276 }, // 1.15 line spacing, 6pt after
            alignment: docx.AlignmentType.LEFT
          },
          run: {
            font: "Calibri",
            size: 22, // 11pt default font size
            color: "333333" // Slate-charcoal font color
          }
        },
        heading1: {
          run: {
            font: "Calibri Light",
            size: 32, // 16pt Heading 1
            bold: true,
            color: "2F5496" // Microsoft Accent Blue
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
            keepNext: true
          }
        },
        heading2: {
          run: {
            font: "Calibri Light",
            size: 26, // 13pt Heading 2
            bold: true,
            color: "2F5496"
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
            keepNext: true
          }
        },
        heading3: {
          run: {
            font: "Calibri",
            size: 24, // 12pt Heading 3
            bold: true,
            color: "1F4E79" // Darker Accent Blue
          },
          paragraph: {
            spacing: { before: 120, after: 120 },
            keepNext: true
          }
        },
        heading4: {
          run: {
            font: "Calibri",
            size: 22, // 11pt Heading 4
            bold: true,
            italics: true,
            color: "1F4E79"
          },
          paragraph: {
            spacing: { before: 120, after: 60 },
            keepNext: true
          }
        }
      }
    }
  };

  const defaultSectionProps = {
    plugins: [
      listPlugin(),
      autofitTablePlugin,
      blockquotePlugin,
      codeBlockPlugin,
      ...(includeImages ? [imagePlugin()] : [])
    ]
  };

  const output = await toDocx(ast, docxProps as any, defaultSectionProps as any, 'blob');
  return asDocxBlob(output);
}

function asDocxBlob(output: Awaited<ReturnType<typeof toDocx>>): Blob {
  if (output instanceof Blob) {
    return output;
  }

  if (typeof output === 'string') {
    return new Blob([base64ToUint8Array(output)], { type: DOCX_MIME_TYPE });
  }

  if (output instanceof ArrayBuffer) {
    return new Blob([output], { type: DOCX_MIME_TYPE });
  }

  if (ArrayBuffer.isView(output)) {
    return new Blob([output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)], { type: DOCX_MIME_TYPE });
  }

  return new Blob([new Uint8Array(output)], { type: DOCX_MIME_TYPE });
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

type MutableMdastNode = {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  identifier?: string;
  label?: string;
  children?: MutableMdastNode[];
  position?: {
    start?: { line?: number };
    end?: { line?: number };
  };
  [key: string]: unknown;
};

function sanitizeDocxAst(root: Root): Root {
  return transformTree(root, false);
}

function replaceImagesWithText(root: Root): Root {
  return transformTree(root, true);
}

function transformTree(root: Root, imageTextFallback: boolean): Root {
  const clone = structuredClone(root) as MutableMdastNode;
  const transformed = transformNode(clone, imageTextFallback);

  if (!transformed || transformed.type !== 'root') {
    return { type: 'root', children: [] };
  }

  return transformed as Root;
}

function transformNode(node: MutableMdastNode, imageTextFallback: boolean): MutableMdastNode | null {
  if (node.type === 'html') {
    return null;
  }

  if (imageTextFallback && (node.type === 'image' || node.type === 'imageReference')) {
    return {
      type: 'text',
      value: imageFallbackText(node)
    };
  }

  if (node.children) {
    node.children = node.children
      .map((child) => transformNode(child, imageTextFallback))
      .filter((child): child is MutableMdastNode => child !== null);
    node.children = insertTableSpacerParagraphs(node.children);
  }

  return node;
}

function insertTableSpacerParagraphs(children: MutableMdastNode[]): MutableMdastNode[] {
  return children.flatMap((child, index) => {
    const next = children[index + 1];

    if (next && shouldPreserveTableBlankLine(child, next)) {
      return [child, createEmptyParagraph()];
    }

    return [child];
  });
}

function shouldPreserveTableBlankLine(current: MutableMdastNode, next: MutableMdastNode): boolean {
  const currentEndLine = current.position?.end?.line;
  const nextStartLine = next.position?.start?.line;

  return current.type === 'table' && next.type === 'table' && Boolean(currentEndLine && nextStartLine && nextStartLine > currentEndLine + 1);
}

function createEmptyParagraph(): MutableMdastNode {
  return {
    type: 'paragraph',
    children: []
  };
}

function imageFallbackText(node: MutableMdastNode): string {
  const label = node.alt || node.label || node.identifier || 'Image';
  return node.url ? `${label} (${node.url})` : label;
}

function containsImages(node: MutableMdastNode): boolean {
  if (node.type === 'image' || node.type === 'imageReference') {
    return true;
  }

  return node.children?.some((child) => containsImages(child)) ?? false;
}
