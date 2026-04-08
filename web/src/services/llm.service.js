/**
 * Send the BRE text (+ optional context) to the backend proxy which handles
 * the LLM call server-side. Streams tokens back via SSE.
 *
 * @param {object}  opts
 * @param {string}  opts.ocrText           Text extracted from the PDF / pasted code
 * @param {string}  [opts.additionalContext] Free-form context the user typed in the UI
 * @param {string}  opts.fileName           Original file name
 * @param {string}  opts.language           BRE language (e.g. "JSONata")
 * @param {(chunk: string) => void} [opts.onChunk]  Optional streaming callback
 * @returns {Promise<string>} The full generated markdown
 */
export async function generateDocumentation({
  ocrText,
  additionalContext,
  fileName,
  language,
  onChunk,
}) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ocrText, additionalContext, fileName, language }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `Server error ${res.status}`)
    err.status = res.status
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload === '[DONE]') continue

      try {
        const { token, error } = JSON.parse(payload)
        if (error) throw new Error(error)
        if (token) {
          full += token
          onChunk?.(full)
        }
      } catch (e) {
        if (e.message !== 'Unexpected end of JSON input') throw e
      }
    }
  }

  return full
}
