# Changelog

## 0.2.0

Foundation hardening release: the internal state management was rebuilt around
a framework-agnostic engine so that chat-critical scroll behaviors are correct
and fast. The public API is unchanged apart from additions.

### Fixed

- At-bottom detection no longer degrades after the list grows (stale-closure
  scroll handler rebuilt; all handlers now read live engine state).
- Prepending history no longer jumps the viewport: anchoring is computed by
  item identity from post-measurement geometry instead of stale DOM
  `scrollHeight`.
- An item measurement can no longer cancel a pending prepend anchor and yank
  the user to the bottom (pending scroll intents are now three independent
  channels with `scroll-to > anchor > follow-bottom` priority).
- Measured heights stay attached to their items across prepend/insert/delete:
  the size cache is keyed by `itemIdentity`, not array index.
- A parent re-render recreating the controlled `data` wrapper around the same
  array no longer re-applies the scroll modifier (the instruction is the data
  array identity plus the modifier semantics).
- An autoscroll callback returning item location `0` is respected.
- `location.done()` fires when a smooth scroll actually completes (or never,
  if interrupted), not immediately.
- `scrollIntoView` resolves `"LAST"`/negative indices correctly and accounts
  for sticky header/footer overlap.
- `batch()` coalesces nested updates into one notification.
- Negative item locations follow `Array.prototype.at` semantics (`-1` is the
  last item).
- Height changes above the viewport (window resize reflow, late measurements)
  are compensated so content does not shift under the reader.
- Fractional heights are measured via `getBoundingClientRect`/`borderBoxSize`
  (no more `Math.ceil` sub-pixel drift).
- `useLayoutEffect` SSR warning removed; the server snapshot renders an empty
  scroller safely.
- `initialLocation` is applied exactly once under React `StrictMode`.

### Performance

- O(log n) scroll math via a Fenwick offset tree (was O(n) on every scroll
  event and every measurement).
- One shared `ResizeObserver` for all rows with stable per-key ref callbacks
  (observers were previously detached and re-attached for every visible row on
  every render — every token during streaming).
- Scroll events are rAF-coalesced; snapshots keep referential identity when
  nothing changed, so context consumers stop re-rendering every frame.
- Smooth scrolling is time-based (consistent duration at any refresh rate),
  chases live targets (streaming growth during the animation), and is
  interruptible by user input; `prefers-reduced-motion` is respected.

### Added

- `onStartReached` / `onEndReached` edge-triggered callbacks with re-arm
  semantics safe for infinite history loading, plus `atTopThreshold` /
  `atBottomThreshold` props.
- `ListScrollLocation.isAtTop` and `ListScrollLocation.firstVisibleItemIndex`.
- `SognaVirtualListTestingContextValue.getItemHeight` for per-item
  deterministic heights in tests, and an exported `installTestHarness` with a
  controllable `ResizeObserver` mock.
- A bilingual documentation site with live demos, in its own repository
  (`sogna-virtual-list-site`).

### Removed

- ~1,700 lines of unused vendored engine code (`urx`, `AATree`,
  `binaryArraySearch`) that was never wired up.

## 0.1.0

- Initial public npm release of `sogna-virtual-list`.
- Added `SognaVirtualList` with dynamic-height virtualization.
- Added `messageFlow`, defaulting to top-down message layout with an opt-in
  bottom-up mode for classic chat windows.
- Added controlled `data` support with `scrollModifier`.
- Added imperative data methods including `append`, `prepend`, `insert`,
  `deleteRange`, `findAndDelete`, `map`, `mapWithAnchor`, `replace`, `batch`,
  and `removeFromStart`.
- Added scroll methods and hooks:
  `useSognaVirtualListMethods`, `useSognaVirtualListLocation`, and
  `useCurrentlyRenderedData`.
- Added `SognaVirtualListTestingContext` for deterministic React tests.
- Added MIT attribution notices for copied/adapted `react-virtuoso` engine
  primitives.
