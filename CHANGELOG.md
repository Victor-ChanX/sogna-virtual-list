# Changelog

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
