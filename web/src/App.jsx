import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { downloadPdf } from './utils/markdownToPdf'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Clock,
  Code,
  Copy,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  PenLine,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { generateDocumentation } from './services/llm.service'
import './App.css'

const languageOptions = [
  { value: 'jsonata', label: 'JSONata', disabled: false },
  { value: 'drools', label: 'Drools', disabled: true },
  { value: 'dmn', label: 'DMN', disabled: true },
  { value: 'sql-rules', label: 'SQL Rules', disabled: true },
]

function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}



function PageHeader({ title, subtitle, right }) {
  return (
    <div className="page-head">
      <div className="page-head-left">
        <h2 className="page-head-title">{title}</h2>
        {subtitle && <p className="page-head-sub">{subtitle}</p>}
      </div>
      {right && <div className="page-head-right">{right}</div>}
    </div>
  )
}

function InputScreen({
  inputMode,
  onInputModeChange,
  sourceFile,
  sourceCode,
  selectedLanguage,
  onLanguageChange,
  instructions,
  onFileChange,
  onSourceCodeChange,
  onInstructionsChange,
  onGenerate,
}) {
  const canSubmit =
    inputMode === 'code' ? sourceCode.trim().length > 0 : Boolean(sourceFile)

  return (
    <>
      <PageHeader
        title="Generate Documentation"
        subtitle="Paste BRE code or upload a text file, choose the language, and add context for the output"
      />

      <form
        className="card"
        onSubmit={onGenerate}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
            e.preventDefault()
            onGenerate(e)
          }
        }}
      >
        <div className="form-section">
          <label className="field-label">Source input</label>
          <div className="input-toggle">
            <button
              type="button"
              className={`toggle-btn${inputMode === 'code' ? ' toggle-btn--active' : ''}`}
              onClick={() => onInputModeChange('code')}
            >
              <Code size={14} />
              Code
            </button>
            <button
              type="button"
              className={`toggle-btn${inputMode === 'file' ? ' toggle-btn--active' : ''}`}
              onClick={() => onInputModeChange('file')}
            >
              <FileText size={14} />
              Text File
            </button>
          </div>
        </div>

        {inputMode === 'code' ? (
          <div className="form-section">
            <label className="field-label" htmlFor="source-code">
              BRE code
            </label>
            <textarea
              id="source-code"
              className="app-textarea app-textarea--code"
              placeholder="Paste your JSONata expression, transformation logic, or rule code here…"
              value={sourceCode}
              onChange={(e) => onSourceCodeChange(e.target.value)}
            />
          </div>
        ) : (
          <div className="form-section">
            <label className="field-label" htmlFor="file-upload">
              Text file
            </label>
            <label className="upload-zone" htmlFor="file-upload">
              <input
                key={sourceFile?.name || 'empty'}
                id="file-upload"
                type="file"
                accept=".txt,text/plain"
                onChange={onFileChange}
              />
              <div className="upload-icon" aria-hidden="true">
                <UploadCloud size={20} />
              </div>
              <div>
                <p className="upload-primary">
                  {sourceFile ? sourceFile.name : 'Choose a .txt file containing the BRE code'}
                </p>
                <p className="upload-secondary">
                  {sourceFile ? `${formatBytes(sourceFile.size)} selected` : 'Click to browse'}
                </p>
              </div>
            </label>
          </div>
        )}

        <div className="form-section">
          <label className="field-label" htmlFor="instructions">
            Additional context
            <span className="field-optional">Optional</span>
          </label>
          <textarea
            id="instructions"
            className="app-textarea app-textarea--compact"
            placeholder="e.g. sample request/response payloads, business context, or specific areas to cover…"
            value={instructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
          />
        </div>

        <div className="form-footer">
          <div className="select-wrap">
            <select
              id="language"
              className="app-select"
              value={selectedLanguage}
              onChange={(e) => onLanguageChange(e.target.value)}
            >
              {languageOptions.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="select-chevron" />
          </div>
          <button className="btn btn--gradient" type="submit" disabled={!canSubmit}>
            <Sparkles size={16} />
            Generate docs
          </button>
        </div>
      </form>
    </>
  )
}

const thinkingMessages = [
  'Analyzing code structure',
  'Interpreting business logic',
  'Composing documentation',
]

function ThinkingPlaceholder() {
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % thinkingMessages.length), 2800)
    return () => clearInterval(id)
  }, [])

  const bars = [
    { w: '50%', h: 24 },
    null,
    { w: '30%', h: 14 },
    { w: '100%' },
    { w: '100%' },
    { w: '70%' },
    null,
    { w: '30%', h: 14 },
    { w: '100%' },
    { w: '85%' },
    { w: '100%' },
    { w: '60%' },
    null,
    { w: '30%', h: 14 },
    { w: '100%' },
    { w: '100%' },
    { w: '75%' },
  ]

  return (
    <div className="thinking">
      <div className="thinking-status">
        <LoaderCircle size={16} className="spin" />
        <span className="thinking-msg">{thinkingMessages[msgIdx]}</span>
      </div>
      <div className="skel">
        {bars.map((bar, i) =>
          bar === null ? (
            <div key={i} className="skel-gap" />
          ) : (
            <div
              key={i}
              className="skel-bar"
              style={{
                width: bar.w,
                height: bar.h || 10,
                animationDelay: `${i * 0.07}s`,
              }}
            />
          ),
        )}
      </div>
    </div>
  )
}

const ERROR_META = {
  429: {
    icon: Clock,
    title: 'Rate limit reached',
    description: 'You have sent too many requests in a short time. Please wait a moment before trying again.',
    color: 'warning',
  },
  503: {
    icon: ShieldAlert,
    title: 'Server is busy',
    description: 'The server is currently handling other requests. Please try again in a few seconds.',
    color: 'warning',
  },
}

function ErrorScreen({ error, onGoBack, onRetry }) {
  const status = error?.status
  const meta = ERROR_META[status] || {
    icon: AlertTriangle,
    title: 'Something went wrong',
    description: null,
    color: 'error',
  }
  const Icon = meta.icon

  return (
    <div className={`error-screen error-screen--${meta.color}`}>
      <div className={`error-screen-icon error-screen-icon--${meta.color}`} aria-hidden="true">
        <Icon size={32} />
      </div>
      <h3 className="error-screen-title">{meta.title}</h3>
      <p className="error-screen-detail">{meta.description || error?.message || 'An unexpected error occurred.'}</p>
      <div className="error-screen-actions">
        <button className="btn btn--secondary" type="button" onClick={onGoBack}>
          <ArrowLeft size={16} />
          Back to input
        </button>
        <button className="btn btn--primary" type="button" onClick={onRetry}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    </div>
  )
}

function DocumentationScreen({
  hasInput,
  markdown,
  isStreaming,
  error,
  onMarkdownChange,
  onCopyMarkdown,
  onDownloadPdf,
  onGoBack,
  onRetry,
  copyState,
}) {
  const [viewMode, setViewMode] = useState('preview')
  const containerRef = useRef(null)
  const userScrolledRef = useRef(false)

  function handleScroll() {
    const el = containerRef.current
    if (!el || !isStreaming) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledRef.current = distanceFromBottom > 60
  }

  useEffect(() => {
    const el = containerRef.current
    if (!isStreaming || userScrolledRef.current || !el) return
    el.scrollTop = el.scrollHeight
  }, [markdown, isStreaming])

  useEffect(() => {
    if (!isStreaming) userScrolledRef.current = false
  }, [isStreaming])

  if (!hasInput || (!markdown && !isStreaming && !error)) return <Navigate to="/" replace />

  const showEdit = viewMode === 'edit' && !isStreaming && !error
  const waiting = isStreaming && !markdown

  if (error) {
    return (
      <>
        <PageHeader title="Error" />
        <div className="card card--wide">
          <ErrorScreen error={error} onGoBack={onGoBack} onRetry={onRetry} />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={
          isStreaming ? (
            <span className="page-head-title-streaming">
              <LoaderCircle size={18} className="spin" />
              Generating Document
            </span>
          ) : 'Edit and Export'
        }
        subtitle={
          isStreaming
            ? 'Your documentation is being written — watch it take shape'
            : 'Refine the markdown, preview it, and download the PDF'
        }
        right={
          !isStreaming && (
            <div className="head-actions">
              <button className="btn btn--gradient" type="button" onClick={onGoBack}>
                <Plus size={16} />
                New
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => setViewMode((v) => (v === 'preview' ? 'edit' : 'preview'))}
              >
                {viewMode === 'preview' ? (
                  <>
                    <PenLine size={16} />
                    Edit
                  </>
                ) : (
                  <>
                    <Eye size={16} />
                    Preview
                  </>
                )}
              </button>
              <button className="btn btn--secondary" type="button" onClick={onCopyMarkdown}>
                <Copy size={16} />
                {copyState === 'copied' ? 'Copied' : 'Copy markdown'}
              </button>
              <button className="btn btn--primary" type="button" onClick={onDownloadPdf}>
                <Download size={16} />
                Download PDF
              </button>
            </div>
          )
        }
      />

      <div className="card card--wide">
        <div className={`doc-pane doc-pane--full${isStreaming ? ' doc-pane--streaming' : ''}`}>
          <div className="pane-bar">
            <div className="pane-title">
              {showEdit ? <PenLine size={16} /> : <Sparkles size={16} />}
              {showEdit ? 'Editor' : 'Preview'}
              {isStreaming && <span className="streaming-badge">Generating</span>}
            </div>
          </div>
          {waiting ? (
            <ThinkingPlaceholder />
          ) : showEdit ? (
            <textarea
              className="editor-textarea"
              value={markdown}
              onChange={(e) => onMarkdownChange(e.target.value)}
              aria-label="Markdown editor"
            />
          ) : (
            <article
              ref={containerRef}
              onScroll={handleScroll}
              className={`md-preview md-preview--scrollable${isStreaming ? ' md-preview--streaming' : ''}`}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              {isStreaming && (
                <span className="streaming-cursor" aria-hidden="true" />
              )}
            </article>
          )}
        </div>
      </div>
    </>
  )
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [inputMode, setInputMode] = useState('code')
  const [sourceFile, setSourceFile] = useState(null)
  const [sourceCode, setSourceCode] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('jsonata')
  const [instructions, setInstructions] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [copyState, setCopyState] = useState('idle')
  const [pipelineError, setPipelineError] = useState(null)
  const [isStreaming, setIsStreaming] = useState(false)

  const hasInput = inputMode === 'code' ? sourceCode.trim().length > 0 : Boolean(sourceFile)

  const lastPipelineArgs = useRef(null)
  const bufferRef = useRef('')
  const rafIdRef = useRef(null)

  const startRafLoop = useCallback(() => {
    function tick() {
      const buffered = bufferRef.current
      if (buffered) {
        setMarkdown(buffered)
      }
      rafIdRef.current = requestAnimationFrame(tick)
    }
    rafIdRef.current = requestAnimationFrame(tick)
  }, [])

  const stopRafLoop = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  const runPipeline = useCallback(
    async ({ mode, file, code, lang, context }) => {
      lastPipelineArgs.current = { mode, file, code, lang, context }

      const langLabel =
        languageOptions.find((o) => o.value === lang)?.label || 'JSONata'
      const fileName = mode === 'code' ? 'Direct Input' : file.name

      try {
        setPipelineError(null)
        setMarkdown('')
        bufferRef.current = ''
        setIsStreaming(true)
        navigate('/documentation')
        startRafLoop()

        let breText
        if (mode === 'code') {
          breText = code
        } else {
          breText = await readTextFile(file)
        }

        const result = await generateDocumentation({
          ocrText: breText,
          additionalContext: context,
          fileName,
          language: langLabel,
          onChunk: (partial) => { bufferRef.current = partial },
        })

        stopRafLoop()
        setMarkdown(result)
        setIsStreaming(false)
      } catch (err) {
        stopRafLoop()
        setIsStreaming(false)
        if (err.name === 'AbortError') return
        setPipelineError(err)
      }
    },
    [navigate, startRafLoop, stopRafLoop],
  )

  function handleGenerate(e) {
    e.preventDefault()
    if (!hasInput) return
    setCopyState('idle')
    runPipeline({
      mode: inputMode,
      file: sourceFile,
      code: sourceCode,
      lang: selectedLanguage,
      context: instructions,
    })
  }

  function handleRetry() {
    if (lastPipelineArgs.current) {
      setPipelineError(null)
      runPipeline(lastPipelineArgs.current)
    }
  }

  function handleGoBack() {
    setPipelineError(null)
    navigate('/')
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('idle')
    }
  }

  function handleDownloadPdf() {
    if (!markdown) return
    downloadPdf(markdown)
  }

  return (
    <div className="shell">
      <main className="shell-main">
        <Routes>
          <Route
            path="/"
            element={
              <InputScreen
                inputMode={inputMode}
                onInputModeChange={setInputMode}
                sourceFile={sourceFile}
                sourceCode={sourceCode}
                selectedLanguage={selectedLanguage}
                onLanguageChange={setSelectedLanguage}
                instructions={instructions}
                onFileChange={(e) => setSourceFile(e.target.files?.[0] || null)}
                onSourceCodeChange={setSourceCode}
                onInstructionsChange={setInstructions}
                onGenerate={handleGenerate}
              />
            }
          />
          <Route
            path="/documentation"
            element={
              <DocumentationScreen
                hasInput={hasInput}
                markdown={markdown}
                isStreaming={isStreaming}
                error={pipelineError}
                onMarkdownChange={setMarkdown}
                onCopyMarkdown={handleCopy}
                onDownloadPdf={handleDownloadPdf}
                onGoBack={handleGoBack}
                onRetry={handleRetry}
                copyState={copyState}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
