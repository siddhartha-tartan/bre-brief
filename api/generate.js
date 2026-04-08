import crypto from 'node:crypto'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const llmConfig = {
  model: 'gpt-5.2',
  reasoningEffort: 'high',
  maxOutputTokens: 16_000,

  systemPrompt: `You are an expert Business Analyst and Technical Writer who explains JSONata code used in a Business Rules Engine.

Before writing, carefully review any custom instructions, notes, or additional information provided by the user, and use them to shape the explanation.

Read the provided context, which may include a request body, transformation query, response payload, sample input/output, and supporting notes, and write clear Markdown documentation that explains what the code is doing. The audience is a credit manager or business stakeholder who wants to understand the logic, the sequence of conditions, the purpose of each assignment or override, why the logic is being applied, and how the output is derived.

Explain the code in the same order as it is written, line by line or block by block, so the explanation is easy to map back to the rule. Choose the structure that best explains the logic based on the code itself. Do not follow a fixed template. You can use sections, bullets, numbering, or tables to improve clarity.

Keep the language simple, direct, and professional. Avoid flowery language. Use technical terms only when needed for accuracy or when they already appear in the input.

When interpreting the rule, use these patterns only where they are supported by the code:
- These JSONata rules are often written as step-by-step transformations, where a value is first assigned and then reassigned by later conditions. Later lines can override earlier results.
- Source-based selection is common. A field such as compute_source may be used to choose between source-specific values, such as SCUW3 and SCUW4.
- Some rules define helper functions to standardize check results. These functions may return structured objects containing fields such as result category, reason, identifier, and rejection code.
- Null handling and fallback values are important. Rules may replace nulls with defaults such as 0, empty text, empty lists, default result objects, or special prefixed statuses when a check cannot be evaluated.
- After running checks, the code may filter, narrow, or summarize results to keep the applicable outcome or derive output fields such as a consolidated list of codes.
- Outputs may contain both final values and supporting fields such as intermediate values, source-specific values, or the original input for traceability.
- Treat organisation-specific labels as business labels whose meaning should be explained from their usage in the rule, not guessed beyond what the code shows.

If the intent of a rule is clear, explain it in simple business language, but do not invent meaning that is not supported by the code. If something is ambiguous or missing, briefly note it.

Return only the final documentation in well-formatted Markdown, without any comments, not even for your decision of what structure you used for writing.`,
}

const ALLOWED_LANGUAGES = ['jsonata', 'drools', 'dmn', 'sql-rules']
const MAX_OCR_TEXT_LENGTH = 50_000
const MAX_CONTEXT_LENGTH = 10_000
const MAX_FILENAME_LENGTH = 255

const RATE_WINDOW_MS = parseInt(process.env.RATE_WINDOW_MS, 10) || 60_000
const RATE_MAX_REQUESTS = parseInt(process.env.RATE_MAX_REQUESTS, 10) || 5
const ipHits = new Map()

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT, 10) || 3
let inFlight = 0

function buildUserPrompt({ ocrText, additionalContext, fileName, language }) {
  const parts = [
    `## Source File\n**${fileName}** (${language})`,
    `## OCR-Extracted Text\n\`\`\`\n${ocrText}\n\`\`\``,
  ]

  if (additionalContext?.trim()) {
    parts.push(
      `## Additional Context Provided by User\n${additionalContext.trim()}`,
    )
  }

  parts.push(
    '## Task\nProduce the complete business documentation in Markdown based on the source above.',
  )

  return parts.join('\n\n')
}

function sanitize(str) {
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')

  // --- Rate limiting (best-effort in serverless) ---
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()
  if (!ipHits.has(ip)) ipHits.set(ip, [])
  const timestamps = ipHits.get(ip).filter((t) => now - t < RATE_WINDOW_MS)
  timestamps.push(now)
  ipHits.set(ip, timestamps)

  if (timestamps.length > RATE_MAX_REQUESTS) {
    const retryAfter = Math.ceil((timestamps[0] + RATE_WINDOW_MS - now) / 1000)
    res.setHeader('Retry-After', retryAfter)
    return res.status(429).json({
      error: `Too many requests. Try again in ${retryAfter}s.`,
    })
  }

  // --- Concurrency guard ---
  if (inFlight >= MAX_CONCURRENT) {
    return res.status(503).json({ error: 'Server is busy. Please try again shortly.' })
  }
  inFlight++

  try {
    const { ocrText, additionalContext, fileName, language } = req.body

    // --- Validation ---
    if (!ocrText || typeof ocrText !== 'string') {
      return res.status(400).json({ error: 'ocrText is required and must be a string.' })
    }
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'fileName is required and must be a string.' })
    }
    if (!language || typeof language !== 'string') {
      return res.status(400).json({ error: 'language is required and must be a string.' })
    }
    if (!ALLOWED_LANGUAGES.includes(language.toLowerCase())) {
      return res.status(400).json({ error: `Unsupported language. Allowed: ${ALLOWED_LANGUAGES.join(', ')}` })
    }
    if (ocrText.length > MAX_OCR_TEXT_LENGTH) {
      return res.status(400).json({ error: `ocrText exceeds the ${MAX_OCR_TEXT_LENGTH} character limit.` })
    }
    if (additionalContext && typeof additionalContext === 'string' && additionalContext.length > MAX_CONTEXT_LENGTH) {
      return res.status(400).json({ error: `additionalContext exceeds the ${MAX_CONTEXT_LENGTH} character limit.` })
    }
    if (fileName.length > MAX_FILENAME_LENGTH) {
      return res.status(400).json({ error: 'fileName is too long.' })
    }

    const clean = {
      ocrText: sanitize(ocrText),
      additionalContext: additionalContext ? sanitize(additionalContext) : '',
      fileName: sanitize(fileName).slice(0, MAX_FILENAME_LENGTH),
      language,
    }

    const requestId = crypto.randomUUID()
    console.log(`[${requestId}] generate — ip=${ip} lang=${language} chars=${ocrText.length}`)

    const userMessage = buildUserPrompt(clean)

    const stream = await openai.chat.completions.create({
      model: llmConfig.model,
      reasoning_effort: llmConfig.reasoningEffort,
      max_completion_tokens: llmConfig.maxOutputTokens,
      stream: true,
      messages: [
        { role: 'system', content: llmConfig.systemPrompt },
        { role: 'user', content: userMessage },
      ],
    })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    for await (const event of stream) {
      const token = event.choices[0]?.delta?.content
      if (token) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
    console.log(`[${requestId}] complete`)
  } catch (err) {
    console.error(`error — ${err.message}`)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'LLM request failed' })
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  } finally {
    inFlight--
  }
}
