import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import { marked } from 'marked'

pdfMake.addVirtualFileSystem(pdfFonts)

const C = {
  primary: '#101828',
  secondary: '#344054',
  muted: '#667085',
  border: '#d0d5dd',
  borderSoft: '#e4e7ec',
  codeBg: '#f4f5f7',
  quoteBg: '#f9fafb',
}

const HEADING_STYLES = {
  h1: { fontSize: 20, bold: true, color: C.primary, margin: [0, 0, 0, 6], lineHeight: 1.25 },
  h2: { fontSize: 16, bold: true, color: C.primary, margin: [0, 24, 0, 6], lineHeight: 1.3 },
  h3: { fontSize: 13.5, bold: true, color: C.primary, margin: [0, 18, 0, 5], lineHeight: 1.35 },
  h4: { fontSize: 11, bold: true, color: C.muted, margin: [0, 14, 0, 4] },
  h5: { fontSize: 10.5, bold: true, color: C.muted, margin: [0, 10, 0, 3] },
  h6: { fontSize: 10, bold: true, color: C.muted, margin: [0, 8, 0, 3] },
}

function parseInline(tokens) {
  if (!tokens || tokens.length === 0) return []
  const out = []
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        out.push({ text: t.text })
        break
      case 'strong':
        for (const child of parseInline(t.tokens)) {
          out.push({ ...child, bold: true, color: C.primary })
        }
        break
      case 'em':
        for (const child of parseInline(t.tokens)) {
          out.push({ ...child, italics: true })
        }
        break
      case 'codespan':
        out.push({
          text: t.text,
          fontSize: 9,
          color: C.primary,
          background: C.codeBg,
        })
        break
      case 'link':
        for (const child of parseInline(t.tokens)) {
          out.push({ ...child, link: t.href, decoration: 'underline', color: C.primary })
        }
        break
      case 'br':
        out.push({ text: '\n' })
        break
      case 'escape':
        out.push({ text: t.text })
        break
      default:
        if (t.tokens) out.push(...parseInline(t.tokens))
        else if (t.text) out.push({ text: t.text })
        break
    }
  }
  return out
}

function dividerLine(width, color) {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: color }],
    margin: [0, 2, 0, 4],
  }
}

function codeBlock(text) {
  return {
    table: {
      widths: ['*'],
      body: [[{
        text: text,
        fontSize: 9,
        color: C.secondary,
        lineHeight: 1.55,
        preserveLeadingSpaces: true,
      }]],
    },
    layout: {
      fillColor: () => C.codeBg,
      hLineWidth: () => 0.5,
      vLineWidth: (i) => i === 0 ? 2 : 0.5,
      hLineColor: () => C.borderSoft,
      vLineColor: (i) => i === 0 ? C.primary : C.borderSoft,
      paddingLeft: () => 14,
      paddingRight: () => 14,
      paddingTop: () => 10,
      paddingBottom: () => 10,
    },
    margin: [0, 10, 0, 10],
  }
}

function blockquote(tokens) {
  const inner = convertTokens(tokens)
  return {
    table: {
      widths: [2, '*'],
      body: [[
        { text: '', fillColor: C.border },
        { stack: inner, fontSize: 10, color: C.muted, italics: true },
      ]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: (i, node, col) => col === 1 ? C.quoteBg : null,
      paddingLeft: (i) => i === 0 ? 0 : 12,
      paddingRight: () => 12,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
    margin: [0, 8, 0, 8],
  }
}

function buildListItems(items) {
  return items.map(item => {
    const parts = []
    const nestedLists = []

    for (const child of item.tokens || []) {
      if (child.type === 'text' && child.tokens) {
        parts.push(...parseInline(child.tokens))
      } else if (child.type === 'paragraph' && child.tokens) {
        parts.push(...parseInline(child.tokens))
      } else if (child.type === 'list') {
        const key = child.ordered ? 'ol' : 'ul'
        nestedLists.push({ [key]: buildListItems(child.items), margin: [0, 3, 0, 3] })
      } else if (child.type === 'space') {
        continue
      } else if (child.type === 'code') {
        nestedLists.push(codeBlock(child.text))
      }
    }

    if (nestedLists.length > 0) {
      const stack = []
      if (parts.length > 0) stack.push({ text: parts, color: C.secondary })
      stack.push(...nestedLists)
      return { stack }
    }

    if (parts.length > 0) return { text: parts, color: C.secondary }
    return { text: item.text || '', color: C.secondary }
  })
}

function buildTable(token) {
  const headerRow = token.header.map(cell => ({
    text: parseInline(cell.tokens),
    bold: true,
    fontSize: 9,
    color: C.muted,
    fillColor: C.codeBg,
  }))

  const bodyRows = token.rows.map((row, rowIdx) =>
    row.map(cell => ({
      text: parseInline(cell.tokens),
      fontSize: 10,
      color: C.secondary,
      fillColor: rowIdx % 2 === 1 ? '#fafbfc' : null,
    }))
  )

  return {
    table: {
      headerRows: 1,
      widths: Array(token.header.length).fill('*'),
      body: [headerRow, ...bodyRows],
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
      vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length) ? 0.5 : 0,
      hLineColor: (i) => i === 1 ? C.border : C.borderSoft,
      vLineColor: () => C.borderSoft,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 7,
      paddingBottom: () => 7,
    },
    margin: [0, 10, 0, 10],
  }
}

function convertTokens(tokens) {
  const content = []

  for (const token of tokens) {
    switch (token.type) {

      case 'heading': {
        const key = `h${Math.min(token.depth, 6)}`
        content.push({
          text: parseInline(token.tokens),
          ...HEADING_STYLES[key],
          pageBreakBefore: (currentNode, followingNodesOnPage) => {
            if (token.depth <= 2 && followingNodesOnPage.length <= 1) return true
            return false
          },
        })
        if (token.depth === 1) content.push(dividerLine(500, C.primary))
        else if (token.depth === 2) content.push(dividerLine(500, C.borderSoft))
        break
      }

      case 'paragraph':
        content.push({
          text: parseInline(token.tokens),
          fontSize: 10.5,
          color: C.secondary,
          lineHeight: 1.6,
          margin: [0, 3, 0, 3],
        })
        break

      case 'code':
        content.push(codeBlock(token.text))
        break

      case 'list': {
        const key = token.ordered ? 'ol' : 'ul'
        content.push({
          [key]: buildListItems(token.items),
          fontSize: 10.5,
          color: C.secondary,
          lineHeight: 1.5,
          margin: [0, 6, 0, 6],
          ...(key === 'ul' ? { markerColor: C.muted } : {}),
        })
        break
      }

      case 'table':
        content.push(buildTable(token))
        break

      case 'blockquote':
        content.push(blockquote(token.tokens))
        break

      case 'hr':
        content.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 500, y2: 0, lineWidth: 0.5, lineColor: C.borderSoft }],
          margin: [0, 18, 0, 18],
        })
        break

      case 'space':
        break

      default:
        if (token.text) {
          content.push({ text: token.text, fontSize: 10.5, color: C.secondary, margin: [0, 2, 0, 2] })
        }
        break
    }
  }

  return content
}

export function downloadPdf(markdown, filename) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1] || 'Documentation'
  const safeName = filename || `${title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-')}.pdf`

  const tokens = marked.lexer(markdown)
  const content = convertTokens(tokens)

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [48, 52, 48, 52],
    content,
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10.5,
      color: C.secondary,
      lineHeight: 1.5,
    },
    info: {
      title,
      creator: 'BRE Brief',
    },
  }

  pdfMake.createPdf(docDefinition).download(safeName)
}
