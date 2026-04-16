import type { GitHubProviderOptions } from 'tinacms-gitprovider-github'
import { BranchAwareGitProvider } from '@stoutsource/git-provider-branching'

/**
 * Minimal Database interface matching @tinacms/graphql's Database class.
 * Using a structural type so this package does not hard-depend on @tinacms/graphql
 * at runtime — only via the peer dep used by the consuming app.
 */
export interface Database {
  bridge?: {
    put(filepath: string, data: string): Promise<void>
  }
  indexAllContent?(): Promise<void>
}

export type CreateDatabaseFn = (args: {
  databaseAdapter: unknown
  gitProvider: { onPut: (k: string, v: string) => Promise<void>; onDelete: (k: string) => Promise<void> }
  namespace?: string
  tinaDirectory?: string
  indexStatusCallback?: (status: unknown) => void
}) => Database

export interface DatabasePoolConfig {
  /**
   * Factory function. Pass `createDatabase` imported from `@tinacms/graphql`.
   */
  createDatabase: CreateDatabaseFn
  /**
   * Options forwarded to every createDatabase call (minus namespace and gitProvider,
   * which DatabasePool controls per-branch).
   */
  databaseAdapter: unknown
  gitProviderConfig: GitHubProviderOptions
  tinaDirectory?: string
  indexStatusCallback?: (status: unknown) => void
}

/**
 * Maintains a pool of Database instances keyed by branch name.
 *
 * - Lazily constructs a Database on first getOrCreate() call for a branch.
 * - Pre-warm the default branch at startup: pool.getOrCreate('main').
 * - Thread-safe for Node.js single-threaded concurrency (each branch gets
 *   its own BranchAwareGitProvider + namespaced LevelDB sublevel).
 */
export class DatabasePool {
  private readonly pool = new Map<string, Database>()
  private readonly config: DatabasePoolConfig

  constructor(config: DatabasePoolConfig) {
    this.config = config
  }

  async getOrCreate(branch: string): Promise<Database> {
    if (!this.pool.has(branch)) {
      // Sanitise branch name to a valid LevelDB namespace key
      const namespace = branch.replace(/[^a-zA-Z0-9\-_]/g, '_')

      const gitProvider = new BranchAwareGitProvider(
        this.config.gitProviderConfig,
        branch
      )

      const db = this.config.createDatabase({
        databaseAdapter: this.config.databaseAdapter,
        gitProvider,
        namespace,
        tinaDirectory: this.config.tinaDirectory,
        indexStatusCallback: this.config.indexStatusCallback,
      })

      this.pool.set(branch, db)
    }

    return this.pool.get(branch)!
  }

  has(branch: string): boolean {
    return this.pool.has(branch)
  }

  delete(branch: string): void {
    this.pool.delete(branch)
  }
}
