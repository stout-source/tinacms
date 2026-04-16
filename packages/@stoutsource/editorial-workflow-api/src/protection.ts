import type { IncomingMessage, ServerResponse } from 'http'

type Handler = (req: IncomingMessage, res: ServerResponse, opts: unknown) => Promise<void>

function parseBranchCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)x-branch=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Middleware that rejects mutation GraphQL operations when the active branch
 * (from the x-branch cookie) is in the protectedBranches list.
 *
 * On rejection it returns:
 *   HTTP 403  { error: "PROTECTED_BRANCH", branch, message }
 *
 * The @stoutsource/editorial-workflow-ui GQL client wrapper listens for this
 * error and opens the create-branch modal.
 */
export function withBranchProtection(
  handler: Handler,
  protectedBranches: string[],
  defaultBranch: string
): Handler {
  return async (req, res, opts) => {
    const cookie = (req.headers?.cookie as string) ?? ''
    const branch = parseBranchCookie(cookie) ?? defaultBranch

    if (protectedBranches.includes(branch)) {
      const body = ((req as any).body?.query as string | undefined)?.trimStart() ?? ''
      if (body.startsWith('mutation')) {
        res.statusCode = 403
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: 'PROTECTED_BRANCH',
            branch,
            message: `Cannot write to protected branch "${branch}". Create a new branch first.`,
          })
        )
        return
      }
    }

    return handler(req, res, opts)
  }
}
