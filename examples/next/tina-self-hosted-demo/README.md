# Tina Self-Hosted Demo

This is a self-hosted TinaCMS demo application with branch-aware content preview capabilities.

## Features

- **Self-hosted CMS**: Full Tina CMS running locally without TinaCloud
- **Branch Switcher UI**: Editorial workflow UI for switching between branches
- **Protected Branches**: Default branch protection prevents direct saves to main/default branch
- **Branch Preview**: Preview content on feature branches before merging

## Getting Started

### Setup

```bash
pnpm install
pnpm dev
```

The app runs at `http://localhost:3000` with the Tina admin at `/admin`.

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# GitHub integration
GITHUB_OWNER=your-org
GITHUB_REPO=your-repo
GITHUB_BRANCH=main
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...
GITHUB_WEBHOOK_SECRET=whsec_... (optional)

# Protected branches
PROTECTED_BRANCHES=main,production

# Authentication (for self-hosted auth.js setup)
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000

# Media CDN (optional)
NEXT_PUBLIC_MEDIA_CDN_URL=https://cdn.example.com
MEDIA_CDN_URL=https://cdn.example.com

# Preview host for branch preview links (optional)
NEXT_PUBLIC_PREVIEW_HOST=localhost:3000
```

## Branch Preview Flow

The preview system allows you to see how content will look on feature branches before merging to main.

### API Endpoint: `/api/preview`

Accepts a `branch` query parameter and optional `slug` parameter:

```
GET /api/preview?branch=feature/new-homepage&slug=/pages/home
```

**Parameters:**
- `branch` (required): Branch name to preview from (sanitized to alphanumeric + `._-/`)
- `slug` (optional): Specific page slug to preview. Defaults to `/` (homepage)

**Behavior:**
1. Validates the branch parameter
2. Sets the `x-branch` cookie to enable branch-specific content fetching
3. Redirects to the `/preview` page with branch context

**Example:**
```
/api/preview?branch=feature/redesign → Sets cookie, redirects to /preview?branch=feature/redesign
```

### Preview Page: `/preview`

Dynamic server-rendered page that displays content from the specified branch.

**Query Parameters:**
- `branch`: The branch being previewed (set by `/api/preview`)
- `slug`: Optional page slug (defaults to home)

**Features:**
- Displays a yellow banner showing which branch is being previewed
- Renders content fetched from Tina datalayer using the `x-branch` cookie
- Falls back to error state if content is not found
- Revalidates every 60 seconds (ISR)

**Integration with Branch Switcher UI:**

The `BranchSwitcher` component in the form footer automatically uses this preview flow:

```tsx
// tina/config.tsx
import { BranchSwitcher } from '@stoutsource/editorial-workflow-ui'

export default defineConfig({
  ui: {
    actionsButton: BranchSwitcher,
    previewUrl: ({ branch }) => {
      const host = process.env.NEXT_PUBLIC_PREVIEW_HOST
      return {
        url: host
          ? `${host}/api/preview?branch=${encodeURIComponent(branch)}`
          : `/api/preview?branch=${encodeURIComponent(branch)}`
      }
    }
  },
  // ... rest of config
})
```

When users click the preview button in the branch switcher, they're redirected to:
```
/api/preview?branch=<selected-branch> → /preview?branch=<selected-branch>
```

## Architecture

### Editorial Workflow Status

Protected branches prevent direct saves. Instead, the workflow:

1. User edits content on a protected branch
2. Save action triggers branch creation (if needed)
3. Changes are saved to the new feature branch
4. PR is created for review
5. User can preview the changes using the preview button

### Content Layers

- **Local Preview** (`/api/preview?branch=...`): See changes without leaving the app
- **Pre-merge Review** (`/preview`): Review exact rendered output before PR merge
- **Post-merge** (main branch): Automated deploy via webhook (if configured)

## Protected Branch Configuration

Set protected branches via environment:

```env
PROTECTED_BRANCHES=main,production,staging
```

Users cannot directly save to these branches. Instead, saves trigger the editorial workflow.

## Customization

### Custom Preview Page

Modify `/pages/preview.tsx` to customize the preview layout or add branch-specific features.

### Custom Action Button

Replace `BranchSwitcher` in `tina/config.tsx` with your own component:

```tsx
import { MyCustomActionsButton } from '@/components/custom-actions'

export default defineConfig({
  ui: {
    actionsButton: MyCustomActionsButton,
    // ...
  }
})
```

The component receives the form context and can dispatch actions using Tina's CMS API.

## Preview URL Customization

Modify the `ui.previewUrl` callback in `tina/config.tsx` to customize preview URL generation:

```tsx
previewUrl: ({ branch }) => {
  // Custom logic for generating preview URLs
  return {
    url: `https://preview.example.com/${branch}`
  }
}
```

## Troubleshooting

### Preview shows 404 or wrong content

1. Check that the branch exists in your repository
2. Verify the branch cookie is set: `document.cookie` should contain `x-branch=...`
3. Check browser developer tools > Network for `/api/preview` redirect

### Changes don't appear on preview

1. Preview page uses ISR (revalidates every 60s) - wait for revalidation or clear cache
2. Verify the x-branch cookie is set to the correct branch
3. Check that content is committed to the branch (unpublished local changes won't show)

### Preview host env var not working

Ensure `NEXT_PUBLIC_PREVIEW_HOST` is set and the application is restarted after env changes.
