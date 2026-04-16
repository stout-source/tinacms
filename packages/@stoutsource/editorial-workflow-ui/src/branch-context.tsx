import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

export interface BranchInfo {
  name: string
  protected: boolean
  indexed: boolean
  sha: string
}

export interface BranchContextValue {
  branches: BranchInfo[]
  activeBranch: string
  isLoading: boolean
  switchBranch: (branch: string) => void
  refreshBranches: () => Promise<void>
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext)
  if (!ctx) {
    throw new Error('useBranch must be used within a BranchProvider')
  }
  return ctx
}

const COOKIE_NAME = 'x-branch'
const COOKIE_MAX_AGE = 3600

function readBranchCookie(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  )
  return match ? decodeURIComponent(match[1]) : ''
}

function writeBranchCookie(branch: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(branch)};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`
}

export interface BranchProviderProps {
  children: React.ReactNode
  apiBase?: string
  defaultBranch?: string
}

export function BranchProvider({
  children,
  apiBase = '/api/tina',
  defaultBranch = 'main',
}: BranchProviderProps): React.ReactElement {
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [activeBranch, setActiveBranch] = useState<string>(
    readBranchCookie() || defaultBranch
  )
  const [isLoading, setIsLoading] = useState(false)

  const refreshBranches = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${apiBase}/branches`)
      const data = await res.json()
      setBranches(data.branches ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    refreshBranches()
  }, [refreshBranches])

  const switchBranch = useCallback((branch: string) => {
    writeBranchCookie(branch)
    setActiveBranch(branch)
    // Reload to flush any cached GQL responses
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }, [])

  return React.createElement(
    BranchContext.Provider,
    { value: { branches, activeBranch, isLoading, switchBranch, refreshBranches } },
    children
  )
}
