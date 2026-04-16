import type { Octokit } from '@octokit/rest'
import type { DatabasePool } from '@stoutsource/branch-router'

export type IndexStatus = 'not-started' | 'indexing' | 'complete' | 'error'

const indexingStatus = new Map<string, IndexStatus>()

export function getIndexStatus(branch: string): IndexStatus {
  return indexingStatus.get(branch) ?? 'not-started'
}

/**
 * Fetches all content files for the given branch from the GitHub API tree,
 * loads them into the branch's Database via db.bridge.put(), then calls
 * db.indexAllContent() to build the query index.
 *
 * Status is tracked in-process and queryable via getIndexStatus().
 * Designed to be called fire-and-forget; errors are caught and stored.
 */
export async function indexBranch(
  pool: DatabasePool,
  branch: string,
  opts: { owner: string; repo: string; octokit: Octokit }
): Promise<void> {
  indexingStatus.set(branch, 'indexing')

  try {
    const db = await pool.getOrCreate(branch)

    const { data: tree } = await opts.octokit.git.getTree({
      owner: opts.owner,
      repo: opts.repo,
      tree_sha: branch,
      recursive: 'true',
    })

    const contentFiles = (tree.tree ?? []).filter(
      (f) =>
        f.type === 'blob' && /\.(md|mdx|json|yaml|yml)$/.test(f.path ?? '')
    )

    for (const file of contentFiles) {
      const { data } = await opts.octokit.repos.getContent({
        owner: opts.owner,
        repo: opts.repo,
        path: file.path!,
        ref: branch,
      })

      if ('content' in data && db.bridge) {
        const content = Buffer.from(data.content as string, 'base64').toString('utf-8')
        await db.bridge.put(file.path!, content)
      }
    }

    // indexAllContent() is a public method on Database.
    // If the upstream signature changes, only this line needs updating.
    if (typeof (db as any).indexAllContent === 'function') {
      await (db as any).indexAllContent()
    }

    indexingStatus.set(branch, 'complete')
  } catch (err) {
    indexingStatus.set(branch, 'error')
    throw err
  }
}
