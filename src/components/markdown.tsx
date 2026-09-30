import { Fragment, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * 轻量 Markdown 渲染器：支持标题、列表、引用、表格、代码块与行内格式。
 * 面向 AI 回复场景，流式输出中未闭合的语法会按普通文本优雅降级。
 */

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE_PATTERN).map((piece, i) => {
    const key = `${keyPrefix}-${i}`
    if (piece.startsWith("**") && piece.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {piece.slice(2, -2)}
        </strong>
      )
    }
    if (piece.startsWith("`") && piece.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {piece.slice(1, -1)}
        </code>
      )
    }
    if (piece.startsWith("*") && piece.endsWith("*") && piece.length > 2) {
      return <em key={key}>{piece.slice(1, -1)}</em>
    }
    return <Fragment key={key}>{piece}</Fragment>
  })
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group/code relative my-4">
      <div className="absolute inset-x-0 top-0 flex h-10 items-center justify-between rounded-t-lg border border-b-0 bg-muted/70 px-4">
        <span className="font-mono text-xs text-muted-foreground">
          {lang || "text"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="mt-10 overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

const TABLE_SEPARATOR = /^\|?[\s:|-]+\|?$/

function renderTable(lines: string[], key: string): ReactNode {
  // 过滤掉 |---|---| 形式的分隔行
  const rows = lines
    .map(parseTableRow)
    .filter((cells) => cells.some((cell) => !/^:?-+:?$/.test(cell)))
  const [head, ...body] = rows
  return (
    <div key={key} className="my-4 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr>
            {head.map((cell, i) => (
              <th key={i} className="border-b px-3 py-2 text-left font-medium">
                {renderInline(cell, `${key}-th-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border-b px-3 py-2 last:border-b-0">
                  {renderInline(cell, `${key}-td-${r}-${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.split("\n")
  const blocks: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 围栏代码块（未闭合时一直读到结尾，流式输出友好）
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim()
      const buf: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i])
        i += 1
      }
      i += 1 // 跳过闭合围栏（若存在）
      blocks.push(<CodeBlock key={`code-${blocks.length}`} code={buf.join("\n")} lang={lang} />)
      continue
    }

    // 标题
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const size =
        level === 1
          ? "mt-6 mb-4 text-xl font-semibold"
          : level === 2
            ? "mt-5 mb-3 text-lg font-semibold"
            : "mt-4 mb-2 text-base font-semibold"
      blocks.push(
        <p key={`h-${blocks.length}`} className={cn(size, "first:mt-0")}>
          {renderInline(heading[2], `h-${blocks.length}`)}
        </p>,
      )
      i += 1
      continue
    }

    // 表格：当前行是表格行，且下一行是分隔行
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const tableLines = [line, lines[i + 1]]
      i += 2
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        tableLines.push(lines[i])
        i += 1
      }
      blocks.push(renderTable(tableLines, `table-${blocks.length}`))
      continue
    }

    // 引用
    if (line.startsWith("> ")) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2))
        i += 1
      }
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="my-3 space-y-1 border-l-2 border-primary/40 pl-4 text-muted-foreground"
        >
          {buf.map((text, r) => (
            <p key={r}>{renderInline(text, `q-${blocks.length}-${r}`)}</p>
          ))}
        </blockquote>,
      )
      continue
    }

    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""))
        i += 1
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-3 list-disc space-y-1 pl-6">
          {items.map((item, r) => (
            <li key={r}>{renderInline(item, `ul-${blocks.length}-${r}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""))
        i += 1
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="my-3 list-decimal space-y-1 pl-6">
          {items.map((item, r) => (
            <li key={r}>{renderInline(item, `ol-${blocks.length}-${r}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // 空行
    if (line.trim() === "") {
      i += 1
      continue
    }

    // 普通段落：连续的普通行合并
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith("> ")
    ) {
      buf.push(lines[i])
      i += 1
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="my-3 leading-7 first:mt-0 last:mb-0">
        {buf.map((text, r) => (
          <Fragment key={r}>
            {r > 0 && <br />}
            {renderInline(text, `p-${blocks.length}-${r}`)}
          </Fragment>
        ))}
      </p>,
    )
  }

  return <div className={cn("text-[15px]", className)}>{blocks}</div>
}
