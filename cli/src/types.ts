/** The JSON format the CLI writes and the viewer reads. No Node imports, so the web app can use it. */
export interface FileSnap {
  id: string;
  path: string;
  lines: number; // running added - deleted, never below 0
  churn: number; // added + deleted since the previous snapshot
  topAuthor: string; // author with the most churn on this file, all time
}

export interface MonthSnap {
  month: string; // YYYY-MM
  files: FileSnap[];
  // commits and authors count the period since the previous snapshot.
  // files and lines describe the tree at the end of the month.
  stats: { files: number; lines: number; commits: number; authors: number };
}

export interface RepoJson {
  repo: string;
  months: MonthSnap[];
}
