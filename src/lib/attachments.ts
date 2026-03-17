export type PreparedAttachment = {
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "document" | "spreadsheet" | "pdf" | "text" | "other";
  extractedText?: string;
  note?: string;
};

const MAX_EXTRACTED_CHARS_PER_FILE = 7000;

function truncate(value: string, max = MAX_EXTRACTED_CHARS_PER_FILE): string {
  const cleaned = value.replace(/\u0000/g, "").trim();
  if (cleaned.length <= max) {
    return cleaned;
  }
  return `${cleaned.slice(0, max)}\n...[truncated]`;
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function toKind(file: File): PreparedAttachment["kind"] {
  const ext = extensionOf(file.name);
  if (file.type.startsWith("image/") || ext === "png" || ext === "jpg" || ext === "jpeg") {
    return "image";
  }
  if (ext === "pdf") {
    return "pdf";
  }
  if (ext === "doc" || ext === "docx") {
    return "document";
  }
  if (ext === "xls" || ext === "xlsx" || ext === "csv") {
    return "spreadsheet";
  }
  if (ext === "txt" || ext === "md" || ext === "json") {
    return "text";
  }
  return "other";
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  (pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = (pdfjs as any).getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => item.str ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      pages.push(`Page ${pageNumber}: ${text}`);
    }
  }

  return truncate(pages.join("\n"));
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return truncate(result.value ?? "");
}

async function extractSpreadsheetText(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const ext = extensionOf(file.name);

  if (ext === "csv") {
    return truncate(await file.text());
  }

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetTexts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    const normalized = csv.trim();
    if (normalized) {
      sheetTexts.push(`Sheet ${sheetName}:\n${normalized}`);
    }
  }

  return truncate(sheetTexts.join("\n\n"));
}

async function extractTextLike(file: File): Promise<string> {
  return truncate(await file.text());
}

async function extractImageText(file: File): Promise<string> {
  if (file.size > 8 * 1024 * 1024) {
    return "";
  }

  const tesseract = await import("tesseract.js");
  const result = await tesseract.recognize(file, "eng");
  return truncate(result.data?.text ?? "");
}

export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  const kind = toKind(file);
  const base: PreparedAttachment = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind,
  };

  try {
    if (kind === "image") {
      const extracted = await extractImageText(file);
      return {
        ...base,
        extractedText: extracted || undefined,
        note: extracted
          ? "OCR extracted text from image."
          : "Image attached. OCR did not detect readable text; add a short description for best results.",
      };
    }

    if (kind === "pdf") {
      return {
        ...base,
        extractedText: await extractPdfText(file),
      };
    }

    if (kind === "document") {
      if (extensionOf(file.name) === "doc") {
        return {
          ...base,
          note: "Legacy .doc extraction is limited in browser; convert to .docx for best results.",
        };
      }

      return {
        ...base,
        extractedText: await extractDocxText(file),
      };
    }

    if (kind === "spreadsheet") {
      return {
        ...base,
        extractedText: await extractSpreadsheetText(file),
      };
    }

    if (kind === "text") {
      return {
        ...base,
        extractedText: await extractTextLike(file),
      };
    }

    return {
      ...base,
      note: "Attached file type is not directly extractable in-browser. Ask user for a text summary if needed.",
    };
  } catch {
    return {
      ...base,
      note: "Could not parse this file. Try a smaller file or convert it to PDF/TXT/DOCX/XLSX.",
    };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function composeAttachmentBlock(attachments: PreparedAttachment[]): string {
  if (!attachments.length) {
    return "";
  }

  const lines: string[] = ["Attached files:"];

  for (const attachment of attachments) {
    lines.push(`- ${attachment.name} (${attachment.kind}, ${formatBytes(attachment.size)})`);

    if (attachment.extractedText) {
      lines.push(`  Extracted content:\n${attachment.extractedText}`);
    }

    if (attachment.note) {
      lines.push(`  Note: ${attachment.note}`);
    }
  }

  return lines.join("\n");
}
