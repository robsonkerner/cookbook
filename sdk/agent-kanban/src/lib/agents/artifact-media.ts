import type { ArtifactPreview } from "./types"

const SAFE_INLINE_MEDIA_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
])

export function normalizeContentType(contentType?: string | null): string {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? ""
}

/**
 * HTML, XHTML, JavaScript, and XML documents execute script when opened as a
 * top-level same-origin navigation. SVG is handled separately.
 */
export function isActiveDocumentContentType(
  contentType?: string | null
): boolean {
  const type = normalizeContentType(contentType)

  if (!type) {
    return false
  }

  return (
    type === "text/html" ||
    type === "application/xhtml+xml" ||
    type === "text/xml" ||
    type === "application/xml" ||
    type === "text/javascript" ||
    type === "application/javascript" ||
    type === "application/x-javascript" ||
    type === "text/ecmascript" ||
    type === "application/ecmascript"
  )
}

export function isSafeInlineMediaType(contentType?: string | null): boolean {
  return SAFE_INLINE_MEDIA_TYPES.has(normalizeContentType(contentType))
}

export function getArtifactPreviewKind(
  artifactPath: string,
  contentType?: string
): ArtifactPreview["previewKind"] {
  // Path-based image/video sniffing must not win over an explicit executable
  // document type. `shot.png` listed as text/html is still HTML.
  if (isActiveDocumentContentType(contentType)) {
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

  if (/\.(avif|gif|jpe?g|png|svg|webp)$/i.test(artifactPath)) {
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
  if (normalized.endsWith(".avif")) {
    return "image/avif"
  }
  if (normalized.endsWith(".svg")) {
    return "image/svg+xml"
  }
  return "application/octet-stream"
}

export function resolveServedArtifactContentType(
  artifactPath: string,
  upstreamContentType?: string | null
): { contentType: string; asAttachment: boolean } {
  const pathType = contentTypeForArtifactPath(artifactPath)
  const upstreamType = normalizeContentType(upstreamContentType)

  if (isActiveDocumentContentType(upstreamType)) {
    if (isSafeInlineMediaType(pathType)) {
      return { contentType: pathType, asAttachment: false }
    }

    return {
      contentType: "application/octet-stream",
      asAttachment: true,
    }
  }

  if (isSafeInlineMediaType(pathType)) {
    return { contentType: pathType, asAttachment: false }
  }

  if (isSafeInlineMediaType(upstreamType)) {
    return { contentType: upstreamType, asAttachment: false }
  }

  return {
    contentType: pathType,
    asAttachment: pathType === "application/octet-stream",
  }
}

export function artifactMediaResponseHeaders(
  artifactPath: string,
  contentType: string
): Record<string, string> {
  const served = resolveServedArtifactContentType(artifactPath, contentType)
  const headers: Record<string, string> = {
    "Cache-Control": "private, max-age=300",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Type": served.contentType,
    "X-Content-Type-Options": "nosniff",
  }

  if (served.asAttachment) {
    const filename = (
      artifactPath.split("/").filter(Boolean).at(-1) ?? "artifact"
    ).replace(/["\\\r\n]/g, "_")
    headers["Content-Disposition"] = `attachment; filename="${filename}"`
  }

  return headers
}
