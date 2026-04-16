import React, { useCallback, useState } from 'react'
import { useBranch } from './branch-context'

export interface CreateBranchModalProps {
  fromBranch: string
  onClose: () => void
  onCreated: (branchName: string) => void
  apiBase?: string
}

type IndexStatus = 'idle' | 'creating' | 'indexing' | 'done' | 'error'

export function CreateBranchModal({
  fromBranch,
  onClose,
  onCreated,
  apiBase = '/api/tina',
}: CreateBranchModalProps): React.ReactElement {
  const [branchName, setBranchName] = useState('')
  const [createPR, setCreatePR] = useState(true)
  const [status, setStatus] = useState<IndexStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const { switchBranch } = useBranch()

  const handleCreate = useCallback(async () => {
    setError(null)
    setStatus('creating')

    try {
      const res = await fetch(`${apiBase}/branch/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchName, fromBranch, createPR }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create branch')
      }

      setStatus('indexing')

      // Poll until status is complete or error
      await new Promise<void>((resolve, reject) => {
        const poll = async () => {
          const statusRes = await fetch(
            `${apiBase}/branch/status?branch=${encodeURIComponent(branchName)}`
          )
          const statusData = await statusRes.json()
          if (statusData.status === 'complete') {
            resolve()
          } else if (statusData.status === 'error') {
            reject(new Error('Indexing failed'))
          } else {
            setTimeout(poll, 1500)
          }
        }
        poll()
      })

      setStatus('done')
      onCreated(branchName)
      switchBranch(branchName)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [apiBase, branchName, createPR, fromBranch, onCreated, switchBranch])

  const busyLabel =
    status === 'creating'
      ? 'Creating branch…'
      : status === 'indexing'
        ? 'Indexing content…'
        : 'Create branch'

  const busy = status === 'creating' || status === 'indexing'

  return React.createElement(
    'div',
    {
      style: {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        zIndex: 9999,
      },
    },
    React.createElement(
      'div',
      {
        style: {
          background: '#fff',
          padding: '1.5rem',
          borderRadius: '8px',
          minWidth: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        },
      },
      React.createElement('h2', { style: { margin: 0 } }, 'Create new branch'),
      error &&
        React.createElement(
          'p',
          { style: { color: 'red', margin: 0 } },
          error
        ),
      React.createElement('input', {
        type: 'text',
        placeholder: 'Branch name',
        value: branchName,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          setBranchName(e.target.value),
        disabled: busy,
        style: { padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc' },
      }),
      React.createElement(
        'label',
        { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' } },
        React.createElement('input', {
          type: 'checkbox',
          checked: createPR,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            setCreatePR(e.target.checked),
          disabled: busy,
        }),
        'Create draft pull request'
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' } },
        React.createElement(
          'button',
          { onClick: onClose, disabled: busy },
          'Cancel'
        ),
        React.createElement(
          'button',
          {
            onClick: handleCreate,
            disabled: busy || !branchName.trim(),
          },
          busyLabel
        )
      )
    )
  )
}
