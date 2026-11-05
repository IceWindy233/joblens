import { AppError } from '../shared/errors';
import { normalizeMultiline } from '../shared/text';

// 本地提取 PDF / DOCX 文字。不做 OCR。仅在扩展页面中运行。

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const MIN_TEXT_CHARS = 50;
export const LARGE_TEXT_CHARS = 30_000;

export type ResumeKind = 'pdf' | 'docx';

export function detectResumeKind(file: { name: string; type: string }): ResumeKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (
    name.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  return null;
}

export interface ParsedResume {
  text: string;
  kind: ResumeKind;
  /** 文本很长时提示用户检查 */
  isLarge: boolean;
}

/** 校验提取结果：去空白后少于 MIN_TEXT_CHARS 视为扫描件/空文件。 */
export function finalizeResumeText(raw: string, kind: ResumeKind): ParsedResume {
  const text = normalizeMultiline(raw);
  if (text.replace(/\s+/g, '').length < MIN_TEXT_CHARS) throw new AppError('RESUME_EMPTY');
  return { text, kind, isLarge: text.length > LARGE_TEXT_CHARS };
}

async function extractPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // MV3 CSP 禁止远程脚本：worker 随扩展打包，通过 Vite ?url 引入
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      const lines: string[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      if (line) lines.push(line);
      pages.push(lines.join('\n'));
    }
    return pages.join('\n\n');
  } finally {
    await task.destroy();
  }
}

async function extractDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return result.value;
}

export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const kind = detectResumeKind(file);
  if (!kind) throw new AppError('RESUME_UNSUPPORTED');
  if (file.size > MAX_RESUME_BYTES) throw new AppError('RESUME_TOO_LARGE');
  const data = await file.arrayBuffer();
  let raw: string;
  try {
    raw = kind === 'pdf' ? await extractPdf(data) : await extractDocx(data);
  } catch (err) {
    if (err instanceof AppError) throw err;
    const m = err instanceof Error ? err.message : String(err);
    throw new AppError('RESUME_PARSE_FAILED', `简历文件解析失败：${m}`);
  }
  return finalizeResumeText(raw, kind);
}
