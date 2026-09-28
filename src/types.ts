export interface BookMeta {
  id: string
  title: string
  author?: string
  pages: number
  addedAt: number
  lastReadAt: number
  coverDataUrl?: string
  sizeBytes: number
}

export interface BookState {
  bookId: string
  page: number
  pageFraction: number
  zoomMode: 'fit-width' | 'fit-page' | 'custom'
  zoom: number
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface NormRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Highlight {
  id: string
  bookId: string
  page: number
  color: HighlightColor
  text: string
  rects: NormRect[]
  createdAt: number
  note?: string
}

export interface Bookmark {
  id: string
  bookId: string
  page: number
  label: string
  createdAt: number
  note?: string
}

export interface Settings {
  theme: 'light' | 'dark' | 'sepia'
  pageFilter: 'normal' | 'dark' | 'sepia'
}
