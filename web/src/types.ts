export interface FileSnap {
  id: string
  path: string
  lines: number
  churn: number
  topAuthor: string
}

export interface MonthSnap {
  month: string
  files: FileSnap[]
  stats: { files: number; lines: number; commits: number; authors: number }
}

export interface RepoJson {
  repo: string
  months: MonthSnap[]
}
