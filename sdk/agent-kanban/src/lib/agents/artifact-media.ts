import type { ArtifactPreview } from "./types"

export function isSvgArtifact(
  artifactPath: string,
  contentType?: string
): boolean {
  const normalizedType = contentType?.toLowerCase() ?? ""
  if (
    normalizedType.includes("image/svg") ||
    normalizedType.includes("svg+xml")
  ) {
    return true
  }

  return /\.svg(?:$|[?#])/i.test(artifactPath)
}

export function getArtifactPreviewKind(
  artifactPath: string,
  contentType?: string
): ArtifactPreview["previewKind"] {
  // SVG can execute script when opened as a top-level document. Never treat it
  // as an inline image preview that links to the same-origin media route.
  if (isSvgArtifact(artifactPath, contentType)) {
    return "file"
  }

  if (
    contentType?.startsWith("video/") ||
    /\.(mov|mp4|m4v|webm)$/i.test(artifactPath)
  ) {
    return "video"
  }

  if (contentType?.startsWith("image/")) {
    return "image"
  }

  if (/\.(avif|gif|jpe?g|png|webp)$/i.test(artifactPath)) {
    return "image"
  }

  return "file"
}

export function contentTypeForArtifactPath(artifactPath: string) {
  const normalized = artifactPath.toLowerCase()
  if (normalized.endsWith(".mp4") || normalized.endsWith(".m4v")) {
    return "video/mp4"
  }
  if (normalized.endsWith(".mov")) {
    return "video/quicktime"
  }
  if (normalized.endsWith(".webm")) {
    return "video/webm"
  }
  if (normalized.endsWith(".png")) {
    return "image/png"
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg"
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp"
  }
  if (normalized.endsWith(".gif")) {
    return "image/gif"
  }
  if (normalized.endsWith(".svg")) {
    return "image/svg+xml"
  }
  return "application/octet-stream"
}

export function artifactMediaResponseHeaders(
  artifactPath: string,
  contentType: string
): HeadersInit {
  const headers: Record<string, string> = {
    "Cache-Control": "private, max-age=300",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  }

  if (isSvgArtifact(artifactPath, contentType)) {
    const filename =
      artifactPath.split("/").filter(Boolean).at(-1) ?? "artifact.svg"
    headers["Content-Type"] = "application/octet-stream"
    headers["Content-Disposition"] =
      `attachment; filename="${filename.replace(/["\r\n]/g, "_")}"`
  }

  return headers
}
