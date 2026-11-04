import * as d3 from 'd3'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Treemap from './Treemap'
import type { RepoJson } from '../../cli/src/types.ts'

const SPEEDS = [0.5, 1, 2] as const
/** One month per this many ms at 1x. */
const BASE_STEP_MS = 900
const TWEEN_MS = 400
const NEUTRAL = '#2b303b'

const fmt = d3.format(',')

function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Churn color: neutral at 0, then a log ramp to hot. The top of the ramp is
 * the 98th percentile of non-zero churn over the whole repo, so one huge
 * commit does not wash out every other month.
 */
function churnColor(data: RepoJson) {
  const all = data.months.flatMap((m) => m.files.map((f) => f.churn)).filter((c) => c > 0)
  const top = Math.max(2, d3.quantile(all.sort(d3.ascending), 0.98) ?? 2)
  const t = d3.scaleLog().domain([1, top]).range([0, 1]).clamp(true)
  return (churn: number) => (churn <= 0 ? NEUTRAL : d3.interpolateYlOrRd(0.25 + 0.75 * t(churn)))
}

export default function App() {
  const [repos, setRepos] = useState<string[]>([])
  const [file, setFile] = useState<string>(() => new URLSearchParams(location.search).get('repo') ?? '')
  const [data, setData] = useState<RepoJson | null>(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [playRequested, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/index.json`)
      .then((r) => r.json() as Promise<string[]>)
      .then((list) => {
        setRepos(list)
        setFile((f) => (f && list.includes(f) ? f : (list[0] ?? '')))
        if (list.length === 0) setError('No repo files found in public/data. Run the CLI first.')
      })
      .catch(() => setError('Could not load /data/index.json.'))
  }, [])

  useEffect(() => {
    if (!file) return
    let live = true
    fetch(`${import.meta.env.BASE_URL}data/${file}`)
      .then((r) => r.json() as Promise<RepoJson>)
      .then((d) => {
        if (!live) return
        const q = new URLSearchParams(location.search)
        // ?month=2024-06 opens at that month, so a link can point at a moment.
        const start = d.months.findIndex((m) => m.month === q.get('month'))
        setData(d)
        setIndex(Math.max(0, start))
        setError('')
        q.set('repo', file)
        history.replaceState(null, '', `?${q}`)
      })
      .catch(() => live && setError(`Could not load ${file}.`))
    return () => {
      live = false
    }
  }, [file])

  const last = (data?.months.length ?? 1) - 1
  const playing = playRequested && index < last
  const step = BASE_STEP_MS / speed
  const duration = Math.min(TWEEN_MS, step * 0.8)

  useEffect(() => {
    if (!playing) return
    const id = setTimeout(() => setIndex((i) => Math.min(i + 1, last)), step)
    return () => clearTimeout(id)
  }, [playing, index, last, step])

  const togglePlay = useCallback(() => {
    if (!playing && index >= last) setIndex(0)
    setPlaying(!playing)
  }, [playing, index, last])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, last))
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [togglePlay, last])

  const color = useMemo(() => (data ? churnColor(data) : () => NEUTRAL), [data])
  const month = data?.months[Math.min(index, last)]

  return (
    <div className="app">
      <header className="bar">
        <h1>Repo Replay</h1>
        <label className="picker">
          <span>Repo</span>
          <select
            value={file}
            onChange={(e) => {
              setPlaying(false)
              setData(null)
              setFile(e.target.value)
            }} disabled={repos.length === 0}>
            {repos.map((r) => (
              <option key={r} value={r}>
                {r.replace(/\.json$/, '')}
              </option>
            ))}
          </select>
        </label>
        {data && <span className="repo-name">{data.repo}</span>}
      </header>

      {month && (
        <section className="stats" aria-label={`Stats for ${monthLabel(month.month)}`}>
          <div className="month">{monthLabel(month.month)}</div>
          <Stat label="files" value={month.stats.files} />
          <Stat label="lines" value={month.stats.lines} />
          <Stat label="commits" value={month.stats.commits} />
          <Stat label="authors" value={month.stats.authors} />
          <Legend />
        </section>
      )}

      <main className="stage">
        {error && <p className="message">{error}</p>}
        {!error && !month && <p className="message">Loading…</p>}
        {month && <Treemap month={month} color={color} duration={duration} />}
      </main>

      {data && month && (
        <footer className="controls">
          <button className="play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            className="scrubber"
            type="range"
            min={0}
            max={last}
            value={index}
            onChange={(e) => {
              setPlaying(false)
              setIndex(Number(e.target.value))
            }}
            aria-label="Month"
            aria-valuetext={monthLabel(month.month)}
          />
          <span className="range">
            {monthLabel(data.months[0].month)} – {monthLabel(data.months[last].month)}
          </span>
          <div className="speed" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="value">{fmt(value)}</span>
      <span className="label">{label}</span>
    </div>
  )
}

function Legend() {
  const stops = d3.range(0, 1.001, 0.25).map((t) => d3.interpolateYlOrRd(0.25 + 0.75 * t))
  return (
    <div className="legend" aria-label="Color shows churn this month, from none to high, log scale">
      <span className="swatch" style={{ background: NEUTRAL }} />
      <span>no churn</span>
      <span className="ramp" style={{ background: `linear-gradient(90deg, ${stops.join(',')})` }} />
      <span>high churn (log)</span>
    </div>
  )
}
