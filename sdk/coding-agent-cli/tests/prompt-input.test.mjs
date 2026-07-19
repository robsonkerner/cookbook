import { expect, test } from "bun:test"
import { InputRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { createElement } from "react"

import { TuiInput } from "../src/tui/App.tsx"

test("preserves prompts longer than OpenTUI's default limit", async () => {
  const prompt = "x".repeat(1_500)
  const view = await testRender(
    createElement(TuiInput, {
      focused: true,
      placeholder: "",
      value: prompt,
      onInput: () => {},
      onSubmit: () => {},
    }),
    {},
  )

  try {
    const input = view.renderer.root.getRenderable("prompt-input")
    expect(input).toBeInstanceOf(InputRenderable)
    expect(input.value).toBe(prompt)
  } finally {
    view.renderer.destroy()
  }
})
