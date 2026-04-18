# Branch Switcher

This plugin adds an item to the global menu that allows you to switch between branches of your repository via a dropdown menu.

## Usage with TinaCloud

To use with TinaCloud, all you need to do is set the `branch-switcher` feature flag in your `cmsCallback`:

```tsx
export default defineConfig({
  cmsCallback: (cms) => {
    cms.flags.set('branch-switcher', true)
    return cms
  },
})
```

Once this flag is set, the branch switcher should automatically appear in the Global Menu.

## Custom Editorial Workflow UI

If you want to recreate the editorial workflow UX while keeping a merge-friendly
upstream path, use additive extension points instead of forking `FormBuilder`:

- `ui.actionsButton` can mount custom branch controls in the form footer.
- `ui.previewUrl` enables branch-aware preview links in branch switcher flows.

For custom save and branch-creation UX, Tina now exports reusable workflow
primitives from `tinacms`:

```tsx
import {
  useEditorialWorkflow,
  EDITORIAL_WORKFLOW_STATUS,
  EDITORIAL_WORKFLOW_ERROR,
} from 'tinacms';
```

This allows external packages to reuse Tina's workflow states and execution
logic without copying internal constants.
