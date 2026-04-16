import type { IncomingMessage, ServerResponse } from 'http'
import type { DatabasePool } from './database-pool'

/**
 * Parses the x-branch cookie value from the Cookie header string.
 */
function parseBranchCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)x-branch=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Creates a replacement for the built-in `gql` route that resolves the correct
 * Database from the pool based on the x-branch cookie.
 *
 * Inject via authProvider.extraRoutes:
 *   extraRoutes: { gql: { secure: true, handler: createBranchAwareGqlHandler(pool, 'main', resolve) } }
 *
 * @param pool          The DatabasePool instance.
 * @param defaultBranch Branch to use when x-branch cookie is absent.
 * @param resolve       The `resolve` function from `@tinacms/graphql`.
 */
export function createBranchAwareGqlHandler(
  pool: DatabasePool,
  defaultBranch: string,
  resolve: (args: {
    database: unknown
    query: string
    variables: Record<string, unknown>
    ctxUser?: unknown
  }) => Promise<unknown>
) {
  return async (
    req: IncomingMessage & { body?: { query?: string; variables?: Record<string, unknown> }; session?: { user?: unknown } },
    res: ServerResponse
  ): Promise<void> => {
    const cookie = req.headers?.cookie ?? ''
    const branch = parseBranchCookie(cookie) ?? defaultBranch

    const db = await pool.getOrCreate(branch)

    const { query = '', variables = {} } = req.body ?? {}

    const result = await resolve({
      database: db,
      query,
      variables,
      ctxUser: (req as any).session?.user,
    })

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  }
}
