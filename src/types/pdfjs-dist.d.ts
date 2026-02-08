declare module 'pdfjs-dist/legacy/build/pdf' {
  export interface PDFTextItem {
    str?: string
  }

  export interface PDFTextContent {
    items: PDFTextItem[]
  }

  export interface PDFPage {
    getTextContent(): Promise<PDFTextContent>
  }

  export interface PDFDocument {
    numPages: number
    getPage(pageNumber: number): Promise<PDFPage>
  }

  export function getDocument(options: { data: ArrayBuffer }): { promise: Promise<PDFDocument> }
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export interface PDFTextItem {
    str?: string
  }

  export interface PDFTextContent {
    items: PDFTextItem[]
  }

  export interface PDFPage {
    getTextContent(): Promise<PDFTextContent>
  }

  export interface PDFDocument {
    numPages: number
    getPage(pageNumber: number): Promise<PDFPage>
  }

  export function getDocument(options: { data: ArrayBuffer }): { promise: Promise<PDFDocument> }
}
