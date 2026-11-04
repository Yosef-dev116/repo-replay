import { useEffect, useState } from 'react'

/**
 * Debug only: open the page with ?fps to see frames per second.
 * Counts requestAnimationFrame callbacks each second and logs "[fps] N".
 */
export default function FpsMeter() {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let frames = 0
    let start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      frames++
      if (now - start >= 1000) {
        const value = Math.round((frames * 1000) / (now - start))
        setFps(value)
        console.log(`[fps] ${value}`)
        frames = 0
        start = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div className="fps">{fps} fps</div>
}
