import type { IncomingMessage, ServerResponse } from 'http'
import type { Octokit } from '@octokit/rest'
import type { DatabasePool } from '@stoutsource/branch-router'
import { indexBranch, getIndexStatus } from './indexer'

type RouteHandler = (req: IncomingMessage, res: ServerResponse, opts: unknown) => Promise<void>

type RouteMap = Record<string, { secure: boolean; handler: RouteHandler }>

export interface EditorialWorkflowRoutesOptions {
  pool: DatabasePool
  octokit: Octokit
  owner: string
  repo: string
  protectedBranches: string[]
  defaultBranch: string
}

function jsonEnd(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Returns a route map ready to spread into authProvider.extraRoutes.
 *
 * Routes registered:
 *   GET  branches
 *   POST branch/create   { branchName, fromBranch, createPR? }
 *   POST branch/index    { branchName }
 *   GET  branch/status   ?branch=<name>
 */
export function makeEditorialWorkflowRoutes(
  opts: EditorialWorkflowRoutesOptions
): RouteMap {
  return {
    branches: {
      secure: true,
      handler: async (_req, res) => {
        const { data } = await opts.octokit.repos.listBranches({
          owner: opts.owner,
          repo: opts.repo,
          per_page: 100,
        })

        jsonEnd(res, 200, {
          branches: data.map((b) => ({
            name: b.name,
            protected: opts.protectedBranches.includes(b.name),
            indexed: opts.pool.has(b.name),
            sha: b.commit.sha,
          })),
        })
      },
    },

    branch: {
      secure: true,
      handler: async (req, res) => {
        const rawUrl = (req as any).url ?? ''
        const subPath = rawUrl.replace(/^.*\/branch\/?/, '')

        if (subPath.startsWith('create')) {
          const body = (req as any).body ?? {}
          const { branchName, fromBranch, createPR } = body

          if (!/^[a-zA-Z0-9/_-]+$/.test(branchName ?? '')) {
            jsonEnd(res, 400, { error: 'Invalid branch name' })
            return
          }

          const { data: refData } = await opts.octokit.git.getRef({
            owner: opts.owner,
            repo: opts.repo,
            ref: `heads/${fromBranch}`,
          })

          await opts.octokit.git.createRef({
            owner: opts.owner,
            repo: opts.repo,
            ref: `refs/heads/${branchName}`,
            sha: refData.object.sha,
          })

          // Fire-and-forget; client polls branch/status
          indexBranch(opts.pool, branchName, opts).catch((e) =>
            console.error('[stoutsource] indexBranch error:', e)
          )

          let pr: { number: number; url: string } | null = null
          if (createPR) {
            const { data: prData } = await opts.octokit.pulls.create({
              owner: opts.owner,
              repo: opts.repo,
              title: `[Draft] ${branchName}`,
              head: branchName,
              base: fromBranch,
              draft: true,
              body: 'Created by Stoutsource Editorial Workflow',
            })
            pr = { number: prData.number, url: prData.html_url }
          }

          jsonEnd(res, 200, { branch: branchName, pr })
          return
        }

        if (subPath.startsWith('index')) {
          const { branchName } = (req as any).body ?? {}

          if (!branchName || typeof branchName !== 'string') {
            jsonEnd(res, 400, { error: 'branchName is required' })
            return
          }

          opts.pool.delete(branchName)
          indexBranch(opts.pool, branchName, opts).catch((e) =>
            console.error('[stoutsource] indexBranch error:', e)
          )

          jsonEnd(res, 202, { status: 'indexing', branch: branchName })
          return
        }

        if (subPath.startsWith('status')) {
          const url = new URL(rawUrl, 'http://localhost')
          const branch = url.searchParams.get('branch') ?? ''

          jsonEnd(res, 200, {
            branch,
            indexed: opts.pool.has(branch),
            status: getIndexStatus(branch),
          })
          return
        }

        jsonEnd(res, 404, { error: 'Unknown branch route' })
      },
    },
  }
}
