import * as db from './db'
import { extractTitle, loadDocument, renderCoverDataUrl } from './pdf/pdfService'
import type { BookMeta } from './types'

export interface ImportResult {
  added: BookMeta[]
  errors: string[]
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export async function importFiles(files: File[]): Promise<ImportResult> {
  const added: BookMeta[] = []
  const errors: string[] = []
  for (const file of files.filter((f) => !isPdfFile(f))) {
    errors.push(`Not a PDF: ${file.name}`)
  }
  for (const file of files.filter(isPdfFile)) {
    try {
      const bytes = await file.arrayBuffer()
      const doc = await loadDocument(bytes)
      const title = (await extractTitle(doc.proxy)) ?? file.name.replace(/\.pdf$/i, '')
      const meta: BookMeta = {
        id: crypto.randomUUID(),
        title,
        pages: doc.numPages,
        addedAt: Date.now(),
        lastReadAt: Date.now(),
        coverDataUrl: await renderCoverDataUrl(doc),
        sizeBytes: bytes.byteLength,
      }
      doc.destroy()
      await db.saveBook(meta, bytes)
      added.push(meta)
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : 'could not open'}`)
    }
  }
  return { added, errors }
}

export function pickPdfFiles(onPicked: (files: File[]) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/pdf'
  input.multiple = true
  input.onchange = () => onPicked(Array.from(input.files ?? []))
  input.click()
}
