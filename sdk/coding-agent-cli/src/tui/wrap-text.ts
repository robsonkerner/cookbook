/**
 * Wrap plain text to a maximum column width.
 * Width values below 1 are clamped so wrapping always makes forward progress.
 */
export function wrapText(value: string, width: number) {
  const lines: string[] = []
  const maxWidth = Math.max(1, Math.floor(width))

  for (const rawLine of value.split("\n")) {
    let line = rawLine

    if (!line) {
      lines.push("")
      continue
    }

    while (line.length > maxWidth) {
      let breakAt = line.lastIndexOf(" ", maxWidth)
      if (breakAt < maxWidth * 0.5) {
        breakAt = maxWidth
      }

      const chunk = line.slice(0, breakAt).trimEnd()
      const rest = line.slice(breakAt).trimStart()

      // Guaranteed progress: if trimming removed nothing useful, hard-split.
      if (!rest || rest.length >= line.length) {
        lines.push(line.slice(0, maxWidth))
        line = line.slice(maxWidth)
        continue
      }

      lines.push(chunk.length > 0 ? chunk : line.slice(0, maxWidth))
      line = rest
    }

    lines.push(line)
  }

  return lines
}
