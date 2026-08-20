import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  artifactMediaResponseHeaders,
  getArtifactPreviewKind,
  isActiveDocumentContentType,
  resolveServedArtifactContentType,
} from "../src/lib/agents/artifact-media.ts"

describe("artifact media HTML content-type confusion", () => {
  test("does not classify HTML-typed files as image or video previews even when the path looks like media", () => {
    assert.equal(getArtifactPreviewKind("shot.png", "text/html"), "file")
    assert.equal(
      getArtifactPreviewKind("clip.mp4", "text/html; charset=utf-8"),
      "file"
    )
    assert.equal(
      getArtifactPreviewKind("notes.txt", "application/xhtml+xml"),
      "file"
    )
    assert.equal(getArtifactPreviewKind("script.js", "application/javascript"), "file")
    assert.equal(getArtifactPreviewKind("shot.png"), "image")
    assert.equal(getArtifactPreviewKind("demo.mp4"), "video")
    assert.equal(getArtifactPreviewKind("shot.png", "image/png"), "image")
  })

  test("never serves upstream HTML/JS/XML as a navigable document type", () => {
    const pngDisguisedAsHtml = resolveServedArtifactContentType(
      "artifacts/shot.png",
      "text/html; charset=utf-8"
    )
    assert.equal(pngDisguisedAsHtml.contentType, "image/png")
    assert.equal(pngDisguisedAsHtml.asAttachment, false)

    const htmlArtifact = resolveServedArtifactContentType(
      "payload.html",
      "text/html"
    )
    assert.equal(htmlArtifact.contentType, "application/octet-stream")
    assert.equal(htmlArtifact.asAttachment, true)

    const jsArtifact = resolveServedArtifactContentType(
      "hook.js",
      "application/javascript"
    )
    assert.equal(jsArtifact.contentType, "application/octet-stream")
    assert.equal(jsArtifact.asAttachment, true)
  })

  test("media responses ignore executable upstream types and disable sniffing", () => {
    const headers = artifactMediaResponseHeaders(
      "artifacts/shot.png",
      "text/html; charset=utf-8"
    )

    assert.equal(headers["Content-Type"], "image/png")
    assert.equal(headers["X-Content-Type-Options"], "nosniff")
    assert.equal(
      headers["Content-Security-Policy"],
      "default-src 'none'; sandbox"
    )
    assert.equal(headers["Content-Disposition"], undefined)

    const htmlHeaders = artifactMediaResponseHeaders(
      "payload.html",
      "text/html"
    )
    assert.equal(htmlHeaders["Content-Type"], "application/octet-stream")
    assert.equal(
      htmlHeaders["Content-Disposition"],
      'attachment; filename="payload.html"'
    )
  })

  test("recognizes active document MIME types with parameters", () => {
    assert.equal(isActiveDocumentContentType("text/html; charset=utf-8"), true)
    assert.equal(isActiveDocumentContentType("TEXT/HTML"), true)
    assert.equal(isActiveDocumentContentType("image/png"), false)
    assert.equal(isActiveDocumentContentType("video/mp4"), false)
  })
})
