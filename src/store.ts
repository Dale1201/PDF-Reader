import { create } from 'zustand'
import type { BookMeta, Settings } from './types'

export type SidebarKind = 'toc' | 'thumbs' | 'annotations'
export type OverlayKind = 'palette' | 'help' | 'goto' | 'search'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

interface AppState {
  screen: 'library' | 'reader'
  books: BookMeta[]
  currentBookId: string | null
  sidebar: SidebarKind | null
  overlay: OverlayKind | null
  theme: Settings['theme']
  pageFilter: Settings['pageFilter']
  toasts: Toast[]
  noteEditRequest: string | null
  requestNoteEdit: (annotationId: string | null) => void
  setBooks: (books: BookMeta[]) => void
  openBook: (id: string) => void
  closeBook: () => void
  toggleSidebar: (kind: SidebarKind) => void
  setOverlay: (kind: OverlayKind | null) => void
  setTheme: (theme: Settings['theme']) => void
  setPageFilter: (f: Settings['pageFilter']) => void
  cycleTheme: () => void
  toast: (message: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
}

const THEME_ORDER: Settings['theme'][] = ['light', 'dark', 'sepia']
let toastId = 0

export const useStore = create<AppState>((set) => ({
  screen: 'library',
  books: [],
  currentBookId: null,
  sidebar: null,
  overlay: null,
  theme: 'dark',
  pageFilter: 'dark',
  toasts: [],
  noteEditRequest: null,
  requestNoteEdit: (noteEditRequest) => set({ noteEditRequest }),
  setBooks: (books) => set({ books }),
  openBook: (id) => set({ screen: 'reader', currentBookId: id, sidebar: null, overlay: null }),
  closeBook: () => set({ screen: 'library', currentBookId: null, sidebar: null, overlay: null }),
  toggleSidebar: (kind) => set((s) => ({ sidebar: s.sidebar === kind ? null : kind })),
  setOverlay: (kind) => set({ overlay: kind }),
  setTheme: (theme) => set({ theme }),
  setPageFilter: (pageFilter) => set({ pageFilter }),
  cycleTheme: () =>
    set((s) => ({ theme: THEME_ORDER[(THEME_ORDER.indexOf(s.theme) + 1) % THEME_ORDER.length] })),
  toast: (message, kind = 'info') =>
    set((s) => ({ toasts: [...s.toasts, { id: ++toastId, message, kind }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function resolveScroll(
  page: number,
  fraction: number,
  offsets: number[],
  heights: number[],
): number {
  const i = Math.min(Math.max(page, 1), offsets.length) - 1
  return Math.round(offsets[i] + fraction * heights[i])
}

export function resolvePosition(
  scrollTop: number,
  offsets: number[],
  heights: number[],
): { page: number; fraction: number } {
  if (offsets.length === 0) return { page: 1, fraction: 0 }
  let i = offsets.length - 1
  while (i > 0 && offsets[i] > scrollTop) i--
  const fraction = Math.min(1, Math.max(0, (scrollTop - offsets[i]) / heights[i]))
  return { page: i + 1, fraction }
}
