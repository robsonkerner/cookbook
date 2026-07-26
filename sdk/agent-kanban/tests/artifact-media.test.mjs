import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  artifactMediaResponseHeaders,
  getArtifactPreviewKind,
  isSvgArtifact,
} from "../src/lib/agents/artifact-media.ts"

describe("artifact media safety", () => {
  test("does not classify SVG artifacts as image previews", () => {
    assert.equal(getArtifactPreviewKind("evil.svg"), "file")
    assert.equal(
      getArtifactPreviewKind("diagram.PNG", "image/svg+xml"),
      "file"
    )
    assert.equal(isSvgArtifact("nested/path/plot.SVG"), true)
    assert.equal(getArtifactPreviewKind("shot.png"), "image")
    assert.equal(getArtifactPreviewKind("demo.mp4"), "video")
  })

  test("forces SVG media responses to download as octet-stream", () => {
    const headers = artifactMediaResponseHeaders(
      "artifacts/evil.svg",
      "image/svg+xml"
    )

    assert.equal(headers["Content-Type"], "application/octet-stream")
    assert.equal(
      headers["Content-Disposition"],
      'attachment; filename="evil.svg"'
    )
    assert.equal(headers["X-Content-Type-Options"], "nosniff")
  })

  test("keeps normal image media inline", () => {
    const headers = artifactMediaResponseHeaders("shot.png", "image/png")
    assert.equal(headers["Content-Type"], "image/png")
    assert.equal(headers["Content-Disposition"], undefined)
  })
})
