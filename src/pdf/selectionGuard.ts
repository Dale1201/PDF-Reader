// Port of pdf.js TextLayerBuilder's selection guard: without it, dragging over gaps
// between spans hits the page and the browser extends the selection to the whole layer.

const layers = new Map<HTMLElement, HTMLElement>()
let globalAC: AbortController | null = null
let nativeHandling: boolean | undefined
let prevRange: Range | undefined

export function guardTextLayer(layer: HTMLElement): () => void {
  const end = document.createElement('div')
  end.className = 'endOfContent'
  layer.append(end)
  const ac = new AbortController()
  layer.addEventListener('mousedown', () => layer.classList.add('selecting'), { signal: ac.signal })
  layers.set(layer, end)
  enableGlobalListener()
  return () => {
    ac.abort()
    end.remove()
    layer.classList.remove('selecting')
    layers.delete(layer)
    if (layers.size === 0) {
      globalAC?.abort()
      globalAC = null
    }
  }
}

function reset(end: HTMLElement, layer: HTMLElement) {
  layer.append(end)
  end.style.width = ''
  end.style.height = ''
  end.style.userSelect = ''
  layer.classList.remove('selecting')
}

function enableGlobalListener() {
  if (globalAC) return
  globalAC = new AbortController()
  const { signal } = globalAC
  const resetAll = () => layers.forEach(reset)
  let pointerDown = false
  document.addEventListener('pointerdown', () => (pointerDown = true), { signal })
  document.addEventListener('pointerup', () => ((pointerDown = false), resetAll()), { signal })
  window.addEventListener('blur', () => ((pointerDown = false), resetAll()), { signal })
  document.addEventListener('keyup', () => !pointerDown && resetAll(), { signal })
  document.addEventListener('selectionchange', onSelectionChange, { signal })
}

function onSelectionChange() {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) {
    layers.forEach(reset)
    return
  }
  const active = new Set<HTMLElement>()
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i)
    for (const layer of layers.keys()) {
      if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer)
    }
  }
  for (const [layer, end] of layers) {
    if (active.has(layer)) layer.classList.add('selecting')
    else reset(end, layer)
  }

  nativeHandling ??= supportsNativeHandling()
  if (nativeHandling) return

  // Safari / old Chromium: move endOfContent next to the selection focus so the
  // pointer over empty space keeps hitting a non-selectable block inside the layer.
  const range = selection.getRangeAt(0)
  const modifyStart =
    !!prevRange &&
    (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0)
  let anchor: Node = modifyStart ? range.startContainer : range.endContainer
  if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode!
  if (!modifyStart && range.endOffset === 0) {
    do {
      while (!anchor.previousSibling) anchor = anchor.parentNode!
      anchor = anchor.previousSibling
    } while (!anchor.childNodes.length)
  }
  const parentLayer = anchor.parentElement?.closest<HTMLElement>('.textLayer')
  const end = parentLayer && layers.get(parentLayer)
  if (parentLayer && end) {
    end.style.width = parentLayer.style.width
    end.style.height = parentLayer.style.height
    end.style.userSelect = 'text'
    anchor.parentElement!.insertBefore(end, modifyStart ? anchor : anchor.nextSibling)
  }
  prevRange = range.cloneRange()
}

function supportsNativeHandling(): boolean {
  const first = layers.keys().next().value
  if (first && getComputedStyle(first).getPropertyValue('-moz-user-select') === 'none') return true
  const brands = (navigator as { userAgentData?: { brands: { brand: string; version: string }[] } })
    .userAgentData?.brands
  const version = brands
    ? brands.find((b) => b.brand === 'Chromium')?.version
    : /\bChrome\/(\d+)\b/.exec(navigator.userAgent)?.[1]
  return !!version && parseInt(version, 10) >= 148
}
