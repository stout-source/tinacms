import type { GitHubProviderOptions } from 'tinacms-gitprovider-github'
import { GitHubProvider } from 'tinacms-gitprovider-github'

/**
 * The two-method interface that @tinacms/graphql's Database and
 * @tinacms/datalayer's BackendAuthProvider both reference.
 */
export interface GitProvider {
  onPut(key: string, value: string): Promise<void>
  onDelete(key: string): Promise<void>
}

/**
 * Decorator that wraps any upstream GitProvider (specifically GitHubProvider)
 * and pins it to a given branch. A new provider instance is created per branch
 * at construction time to avoid async mutation races.
 *
 * Usage in DatabasePool:
 *   new BranchAwareGitProvider(baseConfig, 'feature/my-branch')
 */
export class BranchAwareGitProvider implements GitProvider {
  private readonly provider: GitProvider

  constructor(
    private readonly baseConfig: GitHubProviderOptions,
    private readonly branch: string
  ) {
    this.provider = new GitHubProvider({ ...baseConfig, branch })
  }

  onPut(key: string, value: string): Promise<void> {
    return this.provider.onPut(key, value)
  }

  onDelete(key: string): Promise<void> {
    return this.provider.onDelete(key)
  }
}
