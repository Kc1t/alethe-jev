const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

export function formatShortcut(shortcut: string, mac: boolean = isMac): string {
  if (!mac) return shortcut
  return shortcut
    .replace(/Ctrl\+/gi, '⌘')
    .replace(/Shift\+/gi, '⇧')
    .replace(/Alt\+/gi, '⌥')
}
