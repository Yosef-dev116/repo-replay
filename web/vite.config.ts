import react from '@vitejs/plugin-react'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const DATA_DIR = resolve(__dirname, 'public/data')

/** List the repo JSON files in public/data. */
function listRepos(): string[] {
  try {
    return readdirSync(DATA_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').sort()
  } catch {
    return []
  }
}

/**
 * A static site cannot list a folder, so serve /data/index.json from the
 * file system in dev, and write it into the bundle at build time.
 */
function dataIndex(): Plugin {
  return {
    name: 'repo-replay-data-index',
    configureServer(server) {
      server.middlewares.use('/data/index.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(listRepos()))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data/index.json', source: JSON.stringify(listRepos()) })
    },
  }
}

export default defineConfig({
  plugins: [react(), dataIndex()],
})
