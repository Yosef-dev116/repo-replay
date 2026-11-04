import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import type { FileSnap, MonthSnap } from '../../cli/src/types.ts'

interface Props {
  month: MonthSnap
  color: (churn: number) => string
  duration: number
}

// Folder nodes that stratify creates from paths have no data at run time.
type Node = d3.HierarchyRectangularNode<FileSnap>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RectTransition = d3.Transition<SVGRectElement, Node, any, any>

/** Folders bigger than this share of the total get a label strip. */
const LABEL_SHARE = 0.04
const LABEL_H = 16

const stratify = d3.stratify<FileSnap>().path((d) => '/' + d.path)

function layout(files: FileSnap[], width: number, height: number): Node {
  const root = stratify(files.filter((f) => f.lines > 0)).sum((d) => d?.lines ?? 0)
  const total = root.value || 1
  // Sort siblings by path, not by value. Then a file keeps its place in the
  // order when its size changes, and treemapBinary keeps it in roughly the
  // same spot. Measured on zod (81 months): p90 tile move 92px per month,
  // against 108px for squarify sorted by value and 161px for squarify sorted
  // by path.
  root.sort((a, b) => d3.ascending(a.id, b.id))
  return d3
    .treemap<FileSnap>()
    .tile(d3.treemapBinary)
    .size([width, height])
    .paddingInner(1)
    .paddingOuter(2)
    .paddingTop((n) => (n.depth > 0 && (n.value ?? 0) / total > LABEL_SHARE ? LABEL_H : 2))
    .round(false)(root)
}

const mid = (b: Node) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]

export default function Treemap({ month, color, duration }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const [size, setSize] = useState({ width: 0, height: 0 })

  // Track the SVG size. A resize re-runs the layout with no tween.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.round(width), height: Math.round(height) })
    })
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    const { width, height } = size
    if (!svg || width === 0 || height === 0) return
    const resized = width !== sizeRef.current.width || height !== sizeRef.current.height
    sizeRef.current = { width, height }
    const t = d3.transition().duration(resized ? 0 : duration).ease(d3.easeCubicInOut)

    const root = layout(month.files, width, height)
    const folders = root.descendants().filter((n) => n.children && n.depth > 0)
    const leaves = root.leaves()
    const total = root.value || 1

    const sel = d3.select(svg)
    const place = (s: RectTransition) =>
      s
        .attr('x', (d) => d.x0)
        .attr('y', (d) => d.y0)
        .attr('width', (d) => Math.max(0, d.x1 - d.x0))
        .attr('height', (d) => Math.max(0, d.y1 - d.y0))
    const collapse = (s: RectTransition) =>
      s
        .attr('x', function () {
          return +this.getAttribute('x')! + +this.getAttribute('width')! / 2
        })
        .attr('y', function () {
          return +this.getAttribute('y')! + +this.getAttribute('height')! / 2
        })
        .attr('width', 0)
        .attr('height', 0)
        .remove()

    // Folder backgrounds, keyed by folder path.
    sel
      .select<SVGGElement>('g.folders')
      .selectAll<SVGRectElement, Node>('rect')
      .data(folders, (d) => d.id!)
      .join(
        (enter) =>
          enter
            .append('rect')
            .attr('x', (d) => mid(d)[0])
            .attr('y', (d) => mid(d)[1])
            .attr('width', 0)
            .attr('height', 0),
        (update) => update,
        (exit) => exit.transition(t).call(collapse),
      )
      .attr('class', (d) => `folder depth-${Math.min(d.depth, 3)}`)
      .transition(t)
      .call(place)

    // File tiles, keyed by the stable file id from the CLI.
    sel
      .select<SVGGElement>('g.files')
      .selectAll<SVGRectElement, Node>('rect')
      .data(leaves, (d) => d.data.id)
      .join(
        (enter) =>
          enter
            .append('rect')
            .attr('x', (d) => mid(d)[0])
            .attr('y', (d) => mid(d)[1])
            .attr('width', 0)
            .attr('height', 0)
            .attr('fill', (d) => color(d.data.churn)),
        (update) => update,
        (exit) => exit.transition(t).call(collapse),
      )
      .transition(t)
      .call(place)
      .attr('fill', (d) => color(d.data.churn))

    // Labels for large folders only.
    const labelled = folders.filter((n) => (n.value ?? 0) / total > LABEL_SHARE && n.x1 - n.x0 > 60)
    sel
      .select<SVGGElement>('g.labels')
      .selectAll<SVGTextElement, Node>('text')
      .data(labelled, (d) => d.id!)
      .join(
        (enter) =>
          enter
            .append('text')
            .attr('x', (d) => d.x0 + 4)
            .attr('y', (d) => d.y0 + LABEL_H - 4)
            .style('opacity', 0),
        (update) => update,
        (exit) => exit.transition(t).style('opacity', 0).remove(),
      )
      .text((d) => {
        const name = d.id!.slice(1) + '/'
        const room = Math.floor((d.x1 - d.x0 - 8) / 6.5)
        return name.length > room ? '…' + name.slice(name.length - room + 1) : name
      })
      .transition(t)
      .attr('x', (d) => d.x0 + 4)
      .attr('y', (d) => d.y0 + LABEL_H - 4)
      .style('opacity', 1)
  }, [month, color, duration, size])

  // Tooltip: one listener on the files layer.
  useEffect(() => {
    const svg = svgRef.current
    const tip = tipRef.current
    if (!svg || !tip) return
    const files = svg.querySelector('g.files')!
    const onMove = (e: Event) => {
      const ev = e as MouseEvent
      const target = ev.target as SVGRectElement & { __data__?: Node }
      const d = target.__data__?.data as FileSnap | undefined
      if (!d) return
      tip.hidden = false
      tip.innerHTML = ''
      const path = document.createElement('div')
      path.className = 'tip-path'
      path.textContent = d.path
      const rows: [string, string][] = [
        ['lines', d.lines.toLocaleString()],
        ['churn this month', d.churn.toLocaleString()],
        ['top author', d.topAuthor || '—'],
      ]
      tip.append(path)
      for (const [k, v] of rows) {
        const row = document.createElement('div')
        row.className = 'tip-row'
        const kk = document.createElement('span')
        kk.textContent = k
        const vv = document.createElement('span')
        vv.textContent = v
        row.append(kk, vv)
        tip.append(row)
      }
      const box = svg.getBoundingClientRect()
      const x = ev.clientX - box.left
      const y = ev.clientY - box.top
      const flipX = x > box.width - 280
      const flipY = y > box.height - 110
      tip.style.transform = `translate(${flipX ? x - tip.offsetWidth - 12 : x + 12}px, ${flipY ? y - tip.offsetHeight - 12 : y + 12}px)`
    }
    const onLeave = () => {
      tip.hidden = true
    }
    files.addEventListener('mousemove', onMove)
    files.addEventListener('mouseleave', onLeave)
    return () => {
      files.removeEventListener('mousemove', onMove)
      files.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div className="treemap">
      <svg ref={svgRef} role="img" aria-label="Treemap of files, sized by lines and colored by churn">
        <g className="folders" />
        <g className="files" />
        <g className="labels" />
      </svg>
      <div ref={tipRef} className="tip" hidden />
    </div>
  )
}
