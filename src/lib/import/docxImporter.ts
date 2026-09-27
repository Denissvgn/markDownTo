import mammoth from 'mammoth';
import { convertHtmlToMarkdown } from './htmlImporter';

export interface DocxToMarkdownResult {
  markdown: string;
  warnings: string[];
}

const EMBEDDED_IMAGE_SRC_PREFIX = 'markdown-to-docx-embedded-image:';

export async function convertDocxToMarkdown(arrayBuffer: ArrayBuffer): Promise<DocxToMarkdownResult> {
  const imageWarnings: string[] = [];
  let imageCount = 0;
  const input: Parameters<typeof mammoth.convertToHtml>[0] & { buffer: ArrayBuffer } = {
    arrayBuffer,
    buffer: arrayBuffer
  };

  const result = await mammoth.convertToHtml(
    input,
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        imageCount += 1;
        imageWarnings.push(
          `Embedded DOCX image ${imageCount}${image.contentType ? ` (${image.contentType})` : ''} was replaced with placeholder text.`
        );

        return { src: `${EMBEDDED_IMAGE_SRC_PREFIX}${imageCount}` };
      })
    }
  );

  const htmlResult = convertHtmlToMarkdown(result.value, {
    embeddedImageSrcPrefix: EMBEDDED_IMAGE_SRC_PREFIX,
    warnForImagePlaceholders: false
  });
  const mammothWarnings = result.messages.map((message) => message.message);

  return {
    markdown: htmlResult.markdown,
    warnings: [...mammothWarnings, ...imageWarnings, ...htmlResult.warnings]
  };
}
