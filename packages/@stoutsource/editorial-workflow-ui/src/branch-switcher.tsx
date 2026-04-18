import React, { useState } from 'react'
import { BranchProvider, useBranch } from './branch-context'
import { CreateBranchModal } from './create-branch-modal'

export interface BranchSwitcherProps {
  apiBase?: string
  defaultBranch?: string
}

/**
 * Drop-in component for ui.actionsButton in tina/config.ts:
 *
 *   import { BranchSwitcher } from '@stoutsource/editorial-workflow-ui'
 *   export default defineConfig({ ui: { actionsButton: BranchSwitcher } })
 *
 * Renders a branch dropdown with a built-in "+ New branch" entry that opens
 * the branch creation modal.
 */
export function BranchSwitcher({
  apiBase = '/api/tina',
  defaultBranch = 'main',
}: BranchSwitcherProps): React.ReactElement {
  return React.createElement(
    BranchProvider,
    { apiBase, defaultBranch },
    React.createElement(BranchSwitcherInner, { apiBase, defaultBranch })
  )
}

function BranchSwitcherInner({
  apiBase,
  defaultBranch,
}: BranchSwitcherProps): React.ReactElement {
  const { branches, activeBranch, isLoading, switchBranch } = useBranch()
  const [showModal, setShowModal] = useState(false)

  return React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
    React.createElement(
      'select',
      {
        value: activeBranch,
        disabled: isLoading,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const val = e.target.value
          if (val === '__new__') {
            setShowModal(true)
          } else {
            switchBranch(val)
          }
        },
        style: {
          padding: '0.25rem 0.5rem',
          borderRadius: '4px',
          border: '1px solid #ccc',
          fontSize: '0.875rem',
        },
      },
      ...branches.map((b) =>
        React.createElement(
          'option',
          { key: b.name, value: b.name },
          `${b.name}${b.protected ? ' 🔒' : ''}${!b.indexed ? ' ○' : ''}`
        )
      ),
      React.createElement('option', { value: '__new__' }, '+ New branch…')
    ),
    showModal &&
      React.createElement(CreateBranchModal, {
        fromBranch: activeBranch,
        apiBase,
        onClose: () => setShowModal(false),
        onCreated: () => setShowModal(false),
      })
  )
}
