/**
 * GitHubMediaStore — drop-in MediaStore replacement for self-hosted TinaCMS.
 *
 * Registered in tina/config.ts via:
 *   media: { loadCustomStore: async () => { const { GitHubMediaStore } = await import('@stoutsource/git-media'); return GitHubMediaStore } }
 *
 * All network traffic goes through the three extraRoutes added by makeMediaRoutes().
 * The GitHub PAT never leaves the server.
 */

export interface Media {
  id: string
  type: 'file' | 'dir'
  filename: string
  directory: string
  src: string
  thumbnails?: Record<string, string>
}

export interface MediaUploadOptions {
  file: File
  directory: string
}

export interface MediaList {
  items: Media[]
  nextOffset?: number
}

export interface MediaListOptions {
  directory?: string
  limit?: number
  offset?: number
}

export interface GitHubMediaStoreOptions {
  uploadEndpoint: string
  listEndpoint: string
  deleteEndpoint: string
  publicFolder: string
  mediaRoot: string
  cdnBaseUrl?: string
}

export class GitHubMediaStore {
  accept = '*'

  private readonly opts: GitHubMediaStoreOptions

  constructor(opts: GitHubMediaStoreOptions) {
    this.opts = opts
  }

  private normalizePathPart(input: string): string {
    return String(input)
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .join('/')
  }

  private async fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }

    return btoa(binary)
  }

  // Tina image field calls cms.media.store.parse(media) and expects a string value.
  parse = (media: Media | Media[]): string | string[] => {
    if (Array.isArray(media)) {
      return media.map((item) => item.src ?? '')
    }
    return media?.src ?? ''
  }

  async persist(files: MediaUploadOptions[]): Promise<Media[]> {
    const results: Media[] = []

    for (const { file, directory } of files) {
      const contentBase64 = await this.fileToBase64(file)
      const normalizedDirectory = this.normalizePathPart(directory ?? '')

      const res = await fetch(this.opts.uploadEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          directory: normalizedDirectory,
          contentBase64,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? 'Upload failed')
      }

      const { src, previewSrc } = data as { src: string; previewSrc?: string }
      const thumbnail = previewSrc ?? src
      results.push({
        id: file.name,
        type: 'file',
        filename: file.name,
        directory: normalizedDirectory,
        src,
        thumbnails: { '75x75': thumbnail, '400x400': thumbnail, '1000x1000': thumbnail },
      })
    }

    return results
  }

  async list(options?: MediaListOptions): Promise<MediaList> {
    const normalizedDirectory = this.normalizePathPart(options?.directory ?? '')

    const params = new URLSearchParams({
      directory: normalizedDirectory,
      limit: String(options?.limit ?? 20),
      ...(options?.offset != null ? { cursor: String(options.offset) } : {}),
    })

    const res = await fetch(`${this.opts.listEndpoint}?${params}`)
    const data = await res.json() as {
      files: Array<{ filename: string; src: string; previewSrc?: string }>
      directories: string[]
      cursor: number | null
    }

    const fileItems: Media[] = (data.files ?? []).map((f) => {
      const thumbnail = f.previewSrc ?? f.src
      return {
        id: f.filename,
        type: 'file' as const,
        filename: f.filename,
        directory: normalizedDirectory,
        src: f.src,
        thumbnails: { '75x75': thumbnail, '400x400': thumbnail, '1000x1000': thumbnail },
      }
    })

    const dirItems: Media[] = (data.directories ?? []).map((name) => ({
      id: name,
      type: 'dir' as const,
      filename: name,
      directory: normalizedDirectory,
      src: '',
    }))

    return {
      items: [...dirItems, ...fileItems],
      nextOffset: data.cursor ?? undefined,
    }
  }

  async delete(media: Media): Promise<void> {
    const normalizedDirectory = this.normalizePathPart(media.directory ?? '')
    const normalizedFilename = this.normalizePathPart(media.filename ?? '')
    const relativePath = normalizedDirectory
      ? `${normalizedDirectory}/${normalizedFilename}`
      : normalizedFilename
    const filePath = this.normalizePathPart(
      `${this.opts.publicFolder}/${this.opts.mediaRoot}/${relativePath}`
    )

    const res = await fetch(`${this.opts.deleteEndpoint}/${encodeURIComponent(filePath)}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      let message = 'Delete failed'
      try {
        const data = (await res.json()) as { error?: string }
        message = data.error ?? message
      } catch {
        // Fall back to generic message when the server does not return JSON.
      }
      throw new Error(message)
    }
  }
}
