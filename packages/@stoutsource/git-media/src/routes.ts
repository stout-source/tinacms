import busboy from 'busboy'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Octokit } from '@octokit/rest'

type RouteHandler = (req: IncomingMessage, res: ServerResponse, opts: unknown) => Promise<void>
type RouteMap = Record<string, { secure: boolean; handler: RouteHandler }>

export interface MediaRoutesOptions {
  octokit: Octokit
  owner: string
  repo: string
  defaultBranch: string
  publicFolder: string
  mediaRoot: string
  cdnBaseUrl?: string
  /**
   * When set, uploaded files are also written to the local filesystem at
   * `localWriteDir/<filePath>` (e.g. `process.cwd()`). Useful in local dev
   * mode so that files committed to GitHub are immediately accessible at
   * the static path (e.g. `/uploads/image.jpg`) without a server restart.
   * Deleted files are removed from disk as well.
   */
  localWriteDir?: string
}

function parseBranchCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)x-branch=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

function jsonEnd(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function normalizePathPart(input: string): string {
  return String(input)
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/')
}

function joinPathParts(...parts: string[]): string {
  return parts
    .map(normalizePathPart)
    .filter(Boolean)
    .join('/')
}

/**
 * Returns a route map ready to spread into authProvider.extraRoutes.
 *
 * Routes registered:
 *   POST   media/upload   multipart/form-data: file, directory
 *   GET    media/list     ?directory=&limit=&cursor=
 *   DELETE media/delete/<path>
 *
 * The GitHub PAT (inside opts.octokit) never reaches the browser.
 */
export function makeMediaRoutes(opts: MediaRoutesOptions): RouteMap {
  async function writeLocalFile(filePath: string, content: Buffer): Promise<void> {
    if (!opts.localWriteDir) return
    const dest = join(opts.localWriteDir, filePath)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, content)
  }

  async function deleteLocalFile(filePath: string): Promise<void> {
    if (!opts.localWriteDir) return
    try {
      await unlink(join(opts.localWriteDir, filePath))
    } catch {
      // File may not exist locally — ignore
    }
  }

  function resolveBranch(req: IncomingMessage): string {
    const cookie = (req.headers?.cookie as string) ?? ''
    return parseBranchCookie(cookie) ?? opts.defaultBranch
  }

  function publicUrl(filePath: string): string {
    if (opts.cdnBaseUrl) {
      return `${opts.cdnBaseUrl.replace(/\/$/, '')}/${filePath}`
    }
    return `https://raw.githubusercontent.com/${opts.owner}/${opts.repo}/HEAD/${filePath}`
  }

  /**
   * Returns the server-relative static path for the file, suitable for
   * embedding in content (e.g. the value stored in MDX/JSON).
   * Strips the publicFolder prefix so that Next.js (or any framework that
   * serves `publicFolder` at `/`) resolves it correctly:
   *   "public/uploads/img.jpg"  →  "/uploads/img.jpg"
   */
  function staticPath(filePath: string): string {
    const normalized = normalizePathPart(filePath)
    const pub = normalizePathPart(opts.publicFolder)
    const stripped = pub ? normalized.replace(new RegExp(`^${pub}/`), '') : normalized
    return `/${stripped}`
  }

  return {
    media: {
      secure: true,
      handler: async (req, res) => {
        const rawUrl = (req as any).url ?? ''
        const subPath = rawUrl.replace(/^.*\/media\/?/, '')

        if (subPath.startsWith('upload')) {
          const branch = resolveBranch(req)

          const contentType = String(req.headers['content-type'] ?? '')
          if (contentType.includes('application/json')) {
            const body = (req as any).body ?? {}
            const filename = String(body.filename ?? '')
            const directory = String(body.directory ?? '')
            const contentBase64 = String(body.contentBase64 ?? '')

            if (!filename || !contentBase64) {
              jsonEnd(res, 400, { error: 'filename and contentBase64 are required' })
              return
            }

            const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
            const filePath = joinPathParts(
              opts.publicFolder,
              opts.mediaRoot,
              directory,
              safeFilename
            )

            let sha: string | undefined
            try {
              const { data } = await opts.octokit.request('GET /repos/{owner}/{repo}/contents/{+path}', {
                owner: opts.owner,
                repo: opts.repo,
                path: filePath,
                ref: branch,
              })
              if ('sha' in data) sha = (data as any).sha
            } catch {
              // File does not yet exist — sha stays undefined
            }

            await writeLocalFile(filePath, Buffer.from(contentBase64, 'base64'))

            await opts.octokit.request('PUT /repos/{owner}/{repo}/contents/{+path}', {
              owner: opts.owner,
              repo: opts.repo,
              path: filePath,
              message: `chore: upload media via Stoutsource [${branch}]`,
              content: contentBase64,
              branch,
              sha,
            })

            jsonEnd(res, 200, { src: staticPath(filePath), previewSrc: publicUrl(filePath) })
            return
          }

          return new Promise<void>((resolve) => {
            const bb = busboy({ headers: req.headers as Record<string, string | string[]> })

            let directory = ''

            bb.on('field', (name, value) => {
              if (name === 'directory') directory = value
            })

            bb.on('file', async (_name, stream, info) => {
              const chunks: Buffer[] = []
              for await (const chunk of stream) {
                chunks.push(chunk as Buffer)
              }
              const content = Buffer.concat(chunks)

              // Sanitise filename to prevent path traversal
              const safeFilename = info.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
              const filePath = joinPathParts(
                opts.publicFolder,
                opts.mediaRoot,
                directory,
                safeFilename
              )

              // Fetch existing SHA if the file already exists (required for updates)
              let sha: string | undefined
              try {
                const { data } = await opts.octokit.request('GET /repos/{owner}/{repo}/contents/{+path}', {
                  owner: opts.owner,
                  repo: opts.repo,
                  path: filePath,
                  ref: branch,
                })
                if ('sha' in data) sha = (data as any).sha
              } catch {
                // File does not yet exist — sha stays undefined
              }

              await writeLocalFile(filePath, content)

              await opts.octokit.request('PUT /repos/{owner}/{repo}/contents/{+path}', {
                owner: opts.owner,
                repo: opts.repo,
                path: filePath,
                message: `chore: upload media via Stoutsource [${branch}]`,
                content: content.toString('base64'),
                branch,
                sha,
              })

              jsonEnd(res, 200, { src: staticPath(filePath), previewSrc: publicUrl(filePath) })
              resolve()
            })

            bb.on('error', (err) => {
              console.error('[stoutsource/git-media] busboy error:', err)
              jsonEnd(res, 500, { error: 'Upload parsing failed' })
              resolve()
            })

            req.pipe(bb)
          })
        }

        if (subPath.startsWith('list')) {
          const branch = resolveBranch(req)
          const url = new URL(rawUrl, 'http://localhost')
          const dir = url.searchParams.get('directory') ?? ''
          const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)
          const cursor = Number(url.searchParams.get('cursor') ?? 0)

          const mediaPath = joinPathParts(opts.publicFolder, opts.mediaRoot, dir)

          let items: Array<{ type: string; name: string; path: string }> = []
          try {
            const { data } = await opts.octokit.request('GET /repos/{owner}/{repo}/contents/{+path}', {
              owner: opts.owner,
              repo: opts.repo,
              path: mediaPath,
              ref: branch,
            })
            items = Array.isArray(data) ? (data as typeof items) : []
          } catch {
            // Directory absent — return empty list
          }

          const page = items.slice(cursor, cursor + limit)

          jsonEnd(res, 200, {
            files: page
              .filter((f) => f.type === 'file')
              .map((f) => ({ filename: f.name, src: staticPath(f.path), previewSrc: publicUrl(f.path) })),
            directories: page
              .filter((f) => f.type === 'dir')
              .map((f) => f.name),
            cursor: items.length > cursor + limit ? cursor + limit : null,
          })
          return
        }

        if (subPath.startsWith('delete/')) {
          const branch = resolveBranch(req)
          const rawPath = subPath.replace(/^delete\//, '')
          const requestedPath = normalizePathPart(decodeURIComponent(rawPath))
          const mediaBasePath = joinPathParts(opts.publicFolder, opts.mediaRoot)
          const filePath = requestedPath.startsWith(`${mediaBasePath}/`)
            ? requestedPath
            : joinPathParts(mediaBasePath, requestedPath)

          if (!filePath) {
            jsonEnd(res, 400, { error: 'Missing file path' })
            return
          }

          let sha: string
          try {
            const { data } = await opts.octokit.request('GET /repos/{owner}/{repo}/contents/{+path}', {
              owner: opts.owner,
              repo: opts.repo,
              path: filePath,
              ref: branch,
            })
            if (!('sha' in data)) {
              jsonEnd(res, 404, { error: 'Not found' })
              return
            }
            sha = (data as any).sha
          } catch {
            jsonEnd(res, 404, { error: 'Not found' })
            return
          }

          await opts.octokit.request('DELETE /repos/{owner}/{repo}/contents/{+path}', {
            owner: opts.owner,
            repo: opts.repo,
            path: filePath,
            message: `chore: delete media via Stoutsource [${branch}]`,
            sha,
            branch,
          })

          await deleteLocalFile(filePath)

          jsonEnd(res, 200, { ok: true })
          return
        }

        jsonEnd(res, 404, { error: 'Unknown media route' })
      },
    },
  }
}
