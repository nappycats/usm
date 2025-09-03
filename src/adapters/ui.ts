/**
 * UI adapter
 * WHAT: Sync <body data-state="..."> to the active state.
 * WHY : Lets you write simple CSS like [data-state="menu"] .overlay {...}
 */
import { createAdapter } from '../usm-core';

export function uiAdapter({ useDatasetOnBody = true }: { useDatasetOnBody?: boolean } = {}) {
  return createAdapter('ui', '1.0.0', ['dom'], () => ({
    onEnter({ state }) {
      if (useDatasetOnBody && typeof document !== 'undefined') {
        document.body.dataset.state = state;
      }
    }
  }));
}
