// Browser-safe entry point — no Node.js imports.
// Import from '@stoutsource/git-media/store' in client-side files (tina/config.tsx).
export { GitHubMediaStore } from './store'
export type {
  GitHubMediaStoreOptions,
  Media,
  MediaUploadOptions,
  MediaList,
  MediaListOptions,
} from './store'
