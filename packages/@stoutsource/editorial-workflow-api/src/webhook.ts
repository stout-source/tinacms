import crypto from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Octokit } from '@octokit/rest'
import type { DatabasePool } from '@stoutsource/branch-router'
import { indexBranch } from './indexer'

export interface WebhookHandlerOptions {
  pool: DatabasePool
  octokit: Octokit
  owner: string
  repo: string
  webhookSecret: string
}

/**
 * GitHub webhook handler. Register as:
 *   extraRoutes['webhook/github'] = { secure: false, handler: makeWebhookHandler(...) }
 *
 * Handles:
 *   create (branch) → auto-index new branch
 *   push            → re-index affected branch if in pool
 *   pull_request (merged, closed) → evict feature branch from pool
 *
 * The HMAC signature is verified with crypto.timingSafeEqual before any
 * payload processing to prevent unsigned webhook spoofing.
 */
export function makeWebhookHandler(opts: WebhookHandlerOptions) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const sigHeader = (req.headers['x-hub-signature-256'] as string) ?? ''
    const bodyStr = JSON.stringify((req as any).body ?? {})

    const expected =
      'sha256=' +
      crypto
        .createHmac('sha256', opts.webhookSecret)
        .update(bodyStr)
        .digest('hex')

    let sigMatch = false
    try {
      sigMatch = crypto.timingSafeEqual(
        Buffer.from(sigHeader),
        Buffer.from(expected)
      )
    } catch {
      // Buffers differ in length → mismatch
    }

    if (!sigMatch) {
      res.statusCode = 401
      res.end()
      return
    }

    const event = req.headers['x-github-event'] as string
    const payload = (req as any).body ?? {}

    if (event === 'create' && payload.ref_type === 'branch') {
      // New branch pushed via git — auto-index
      indexBranch(opts.pool, payload.ref, opts).catch((e) =>
        console.error('[stoutsource] webhook indexBranch error:', e)
      )
    }

    if (event === 'push') {
      const branch = (payload.ref as string | undefined)?.replace(
        'refs/heads/',
        ''
      )
      if (branch && opts.pool.has(branch)) {
        opts.pool.delete(branch)
        indexBranch(opts.pool, branch, opts).catch((e) =>
          console.error('[stoutsource] webhook re-index error:', e)
        )
      }
    }

    if (
      event === 'pull_request' &&
      payload.action === 'closed' &&
      payload.pull_request?.merged === true
    ) {
      // Evict merged feature branch to prevent unbounded pool growth
      opts.pool.delete(payload.pull_request.head.ref)
    }

    res.statusCode = 200
    res.end()
  }
}
