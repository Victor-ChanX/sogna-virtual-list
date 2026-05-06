import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  LocationContext,
  MethodsContext,
  RenderedDataContext,
} from "./contexts";
import {
  buildVisibleItems,
  calculateScrollLocation,
  calculateScrollTopForLocation,
  calculateVisibleRange,
  DEFAULT_AT_BOTTOM_THRESHOLD,
  DEFAULT_ITEM_HEIGHT,
  heightAt,
  offsetOf,
  sumHeights,
} from "../engine/list-math";
import { createSmoothScrollController } from "../engine/smooth-scroll";
import { SognaVirtualListTestingContext } from "../testing/context";
import type {
  AutoscrollToBottom,
  ContextAwareComponent,
  DataWithScrollModifier,
  HeaderWrapperComponent,
  ItemContent,
  ItemLocation,
  ListScrollLocation,
  ScrollBehavior,
  ScrollElementComponent,
  SognaVirtualListLicenseProps,
  SognaVirtualListMethods,
  SognaVirtualListProps,
} from "../types";

type PendingScrollAction =
  | null
  | {
      type: "preserve-scroll-height";
      previousScrollHeight: number;
      previousScrollTop: number;
    }
  | {
      type: "anchor";
      index: number;
      previousTop: number;
    }
  | {
      type: "location";
      location: ItemLocation;
    }
  | {
      type: "bottom";
      behavior?: ScrollBehavior;
    };

const defaultLocation: ListScrollLocation = {
  listOffset: 0,
  visibleListHeight: 0,
  scrollHeight: 0,
  bottomOffset: 0,
  isAtBottom: false,
  lastVisibleItemIndex: 0,
  lastItemBottomOffset: 0,
};

const defaultItemContent: ItemContent<unknown, unknown> = ({ index }) => (
  <div>Item {index}</div>
);

const defaultComputeItemKey = <Data, Context>({
  index,
}: {
  data: Data;
  index: number;
  context: Context;
}) => index;

const identity = <Data,>(item: Data) => item;

const noCleanup = () => undefined;

const DefaultWrapper = forwardRef<
  HTMLDivElement,
  {
    style: React.CSSProperties;
    children: React.ReactNode;
  }
>(({ style, children }, ref) => (
  <div ref={ref} style={style}>
    {children}
  </div>
));

DefaultWrapper.displayName = "DefaultVirtualListWrapper";

const StickyHeaderWrapper = forwardRef<
  HTMLDivElement,
  {
    style: React.CSSProperties;
    children: React.ReactNode;
  }
>(({ style, children }, ref) => (
  <div
    ref={ref}
    style={{
      position: "sticky",
      top: 0,
      zIndex: 1,
      ...style,
    }}
  >
    {children}
  </div>
));

StickyHeaderWrapper.displayName = "StickyHeaderWrapper";

const StickyFooterWrapper = forwardRef<
  HTMLDivElement,
  {
    style: React.CSSProperties;
    children: React.ReactNode;
  }
>(({ style, children }, ref) => (
  <div
    ref={ref}
    style={{
      bottom: 0,
      position: "sticky",
      zIndex: 1,
      ...style,
    }}
  >
    {children}
  </div>
));

StickyFooterWrapper.displayName = "StickyFooterWrapper";

function SognaVirtualListInner<Data, Context>(
  props: SognaVirtualListProps<Data, Context>,
  ref: React.ForwardedRef<SognaVirtualListMethods<Data, Context>>,
) {
  const {
    initialData = [],
    computeItemKey = defaultComputeItemKey<Data, Context>,
    context = null as Context,
    initialLocation = null,
    shortSizeAlign = "top",
    onScroll,
    onRenderedDataChange,
    ItemContent = defaultItemContent as ItemContent<Data, Context>,
    Header = null,
    StickyHeader = null,
    Footer = null,
    StickyFooter = null,
    EmptyPlaceholder = null,
    HeaderWrapper = DefaultWrapper as HeaderWrapperComponent,
    StickyHeaderWrapper:
      StickyHeaderWrapperProp = StickyHeaderWrapper as HeaderWrapperComponent,
    FooterWrapper = DefaultWrapper as HeaderWrapperComponent,
    StickyFooterWrapper:
      StickyFooterWrapperProp = StickyFooterWrapper as HeaderWrapperComponent,
    useWindowScroll = false,
    customScrollParent = null,
    ScrollElement = "div",
    increaseViewportBy = 0,
    data: controlledData,
    itemIdentity = identity<Data>,
    enforceStickyFooterAtBottom = false,
    style,
    ...scrollerProps
  } = props;
  const testingContext = useContext(SognaVirtualListTestingContext);
  const initialControlledData = controlledData?.data;
  const [listData, setListDataState] = useState<Data[]>(() =>
    (initialControlledData ?? initialData ?? []).slice(),
  );
  const [viewportHeight, setViewportHeight] = useState(
    testingContext?.viewportHeight ?? 0,
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [version, setVersion] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [stickyFooterHeight, setStickyFooterHeight] = useState(0);
  const [scrollLocation, setScrollLocation] =
    useState<ListScrollLocation>(defaultLocation);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const stickyFooterRef = useRef<HTMLDivElement | null>(null);
  const itemObserversRef = useRef<Map<React.Key, ResizeObserver>>(new Map());
  const heightsRef = useRef<number[]>([]);
  const dataRef = useRef(listData);
  const locationRef = useRef(defaultLocation);
  const pendingScrollRef = useRef<PendingScrollAction>(null);
  const initialLocationAppliedRef = useRef(false);
  const batchDepthRef = useRef(0);
  const batchAutoscrollRef = useRef<
    AutoscrollToBottom<Data, Context> | undefined
  >(undefined);
  const warnedUnsupportedScrollerRef = useRef(false);
  const smoothScrollRef = useRef(
    createSmoothScrollController(
      () => scrollerRef.current,
      (nextTop) => setScrollTop(nextTop),
      () => {
        const location = readScrollLocation();
        setScrollLocation(location);
        locationRef.current = location;
      },
    ),
  );

  const listStartOffset = headerHeight + stickyHeaderHeight;
  const listEndOffset = footerHeight + stickyFooterHeight;
  const itemCount = listData.length;
  const totalListHeight = useMemo(
    () => sumHeights(heightsRef.current, itemCount),
    [itemCount, version],
  );
  const shortListOffset = useMemo(() => {
    if (shortSizeAlign === "top") return 0;

    const availableHeight =
      viewportHeight - listStartOffset - listEndOffset - totalListHeight;

    return Math.max(0, availableHeight);
  }, [
    listEndOffset,
    listStartOffset,
    shortSizeAlign,
    totalListHeight,
    viewportHeight,
  ]);
  const scrollHeight =
    listStartOffset + shortListOffset + totalListHeight + listEndOffset;
  const listViewportHeight = Math.max(0, viewportHeight - listEndOffset);
  const visibleRange = useMemo(
    () =>
      calculateVisibleRange({
        heights: heightsRef.current,
        itemCount,
        scrollTop: Math.max(0, scrollTop - listStartOffset - shortListOffset),
        viewportHeight: listViewportHeight,
        increaseViewportBy,
      }),
    [
      increaseViewportBy,
      itemCount,
      listViewportHeight,
      listStartOffset,
      scrollTop,
      shortListOffset,
      version,
    ],
  );
  const visibleItems = useMemo(
    () =>
      buildVisibleItems({
        data: listData,
        heights: heightsRef.current,
        range: visibleRange,
      }),
    [listData, visibleRange, version],
  );
  const renderedData = useMemo(
    () => visibleItems.map((item) => item.data),
    [visibleItems],
  );

  const setListData = useCallback(
    (nextData: Data[]) => {
      dataRef.current = nextData;
      heightsRef.current = nextData.map((_, index) => {
        return (
          heightsRef.current[index] ??
          testingContext?.itemHeight ??
          DEFAULT_ITEM_HEIGHT
        );
      });
      setListDataState(nextData);
      setVersion((current) => current + 1);
    },
    [testingContext?.itemHeight],
  );

  function readScrollLocation() {
    const element = scrollerRef.current;
    const nextScrollTop = element?.scrollTop ?? scrollTop;
    const nextViewportHeight =
      testingContext?.viewportHeight ?? element?.clientHeight ?? viewportHeight;

    return calculateScrollLocation({
      heights: heightsRef.current,
      itemCount: dataRef.current.length,
      scrollTop: Math.max(0, nextScrollTop - listStartOffset - shortListOffset),
      viewportHeight: Math.max(0, nextViewportHeight - listEndOffset),
      scrollHeight: totalListHeight,
      atBottomThreshold: DEFAULT_AT_BOTTOM_THRESHOLD,
    });
  }

  const scrollToLocation = useCallback(
    (location: ItemLocation) => {
      const element = scrollerRef.current;
      if (!element) return;

      const target = calculateScrollTopForLocation({
        heights: heightsRef.current,
        itemCount: dataRef.current.length,
        location,
        viewportHeight: listViewportHeight,
        scrollTop: Math.max(
          0,
          element.scrollTop - listStartOffset - shortListOffset,
        ),
      });

      smoothScrollRef.current.scrollTo(
        target.top + listStartOffset + shortListOffset,
        target.behavior,
      );

      if (typeof location !== "number") {
        location.done?.();
      }
    },
    [listStartOffset, listViewportHeight, shortListOffset],
  );

  const scrollToBottom = useCallback(
    (behavior?: ScrollBehavior) => {
      scrollToLocation({
        index: "LAST",
        align: "end",
        behavior,
      });
    },
    [scrollToLocation],
  );

  const resolveAutoScroll = useCallback(
    (
      appendedData: Data[],
      scrollToBottomBehavior?: AutoscrollToBottom<Data, Context>,
    ): ItemLocation | ScrollBehavior | true | null => {
      if (
        scrollToBottomBehavior === false ||
        scrollToBottomBehavior === undefined
      ) {
        return null;
      }

      const currentLocation = locationRef.current;

      if (typeof scrollToBottomBehavior === "function") {
        const result = scrollToBottomBehavior({
          scrollLocation: currentLocation,
          scrollInProgress: smoothScrollRef.current.scrolling(),
          atBottom: currentLocation.isAtBottom,
          data: appendedData,
          context,
        });

        return result || null;
      }

      if (!currentLocation.isAtBottom) {
        return null;
      }

      return scrollToBottomBehavior === true ? true : scrollToBottomBehavior;
    },
    [context],
  );

  const scheduleAutoScroll = useCallback(
    (
      appendedData: Data[],
      scrollToBottomBehavior?: AutoscrollToBottom<Data, Context>,
    ) => {
      const result = resolveAutoScroll(appendedData, scrollToBottomBehavior);

      if (result === null) return;

      if (typeof result === "number" || typeof result === "object") {
        pendingScrollRef.current = {
          type: "location",
          location: result,
        };

        return;
      }

      pendingScrollRef.current = {
        type: "bottom",
        behavior: result === true ? "auto" : result,
      };
    },
    [resolveAutoScroll],
  );

  const captureScrollHeight = useCallback(() => {
    const element = scrollerRef.current;

    pendingScrollRef.current = {
      type: "preserve-scroll-height",
      previousScrollHeight: element?.scrollHeight ?? scrollHeight,
      previousScrollTop: element?.scrollTop ?? scrollTop,
    };
  }, [scrollHeight, scrollTop]);

  const captureAnchor = useCallback((index: number) => {
    const anchor = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${index}"]`,
    );

    if (!anchor) return;

    pendingScrollRef.current = {
      type: "anchor",
      index,
      previousTop: anchor.getBoundingClientRect().top,
    };
  }, []);

  const methods = useMemo<SognaVirtualListMethods<Data, Context>>(
    () => ({
      data: {
        prepend: (data) => {
          if (data.length === 0) return;

          captureScrollHeight();
          setListData([...data, ...dataRef.current]);
        },
        append: (data, autoscrollToBottom) => {
          if (data.length === 0) return;

          scheduleAutoScroll(data, autoscrollToBottom);
          setListData([...dataRef.current, ...data]);
        },
        map: (callbackfn, autoscrollToBottomBehavior) => {
          const shouldScroll = locationRef.current.isAtBottom;

          setListData(dataRef.current.map(callbackfn));

          if (shouldScroll && autoscrollToBottomBehavior) {
            pendingScrollRef.current = {
              type: "location",
              location:
                typeof autoscrollToBottomBehavior === "object"
                  ? (autoscrollToBottomBehavior.location() ?? {
                      index: "LAST",
                      align: "end",
                    })
                  : {
                      index: "LAST",
                      align: "end",
                      behavior: autoscrollToBottomBehavior,
                    },
            };
          }
        },
        mapWithAnchor: (callbackfn, anchorItemIndex) => {
          captureAnchor(anchorItemIndex);
          setListData(dataRef.current.map(callbackfn));
        },
        findAndDelete: (predicate) => {
          const indexes = dataRef.current.reduce<number[]>(
            (current, item, index) => {
              if (predicate(item, index)) {
                current.push(index);
              }

              return current;
            },
            [],
          );

          if (indexes.length === 0) return;

          captureScrollHeight();
          const indexSet = new Set(indexes);
          setListData(
            dataRef.current.filter((_, index) => !indexSet.has(index)),
          );
        },
        findIndex: (predicate) => dataRef.current.findIndex(predicate),
        find: (predicate) => dataRef.current.find(predicate),
        replace: (data, options) => {
          if (options?.purgeItemSizes) {
            heightsRef.current = [];
          }

          if (options?.initialLocation) {
            pendingScrollRef.current = {
              type: "location",
              location: options.initialLocation,
            };
          }

          setListData(data.slice());
        },
        insert: (data, offset, autoscrollToBottom) => {
          if (data.length === 0) return;

          const normalizedOffset = Math.max(
            0,
            Math.min(offset, dataRef.current.length),
          );

          if (normalizedOffset <= locationRef.current.lastVisibleItemIndex) {
            captureScrollHeight();
          } else {
            scheduleAutoScroll(data, autoscrollToBottom);
          }

          setListData([
            ...dataRef.current.slice(0, normalizedOffset),
            ...data,
            ...dataRef.current.slice(normalizedOffset),
          ]);
        },
        deleteRange: (offset, count) => {
          if (count <= 0) return;

          captureScrollHeight();
          setListData([
            ...dataRef.current.slice(0, offset),
            ...dataRef.current.slice(offset + count),
          ]);
        },
        batch: (callback, autoscrollToBottom) => {
          batchDepthRef.current += 1;
          batchAutoscrollRef.current = autoscrollToBottom;

          try {
            callback();
          } finally {
            batchDepthRef.current -= 1;

            if (batchDepthRef.current === 0 && autoscrollToBottom) {
              scheduleAutoScroll([], batchAutoscrollRef.current);
              batchAutoscrollRef.current = undefined;
            }
          }
        },
        get: () => dataRef.current.slice(),
        getCurrentlyRendered: () => renderedData.slice(),
        removeFromStart: (count) => {
          if (count <= 0) return;

          captureScrollHeight();
          setListData(dataRef.current.slice(count));
        },
      },
      scrollToItem: scrollToLocation,
      scrollIntoView: (location) => {
        const element = scrollerRef.current;
        if (!element) return;

        const normalizedTop =
          offsetOf(
            heightsRef.current,
            typeof location === "number"
              ? location
              : location.index === "LAST"
                ? dataRef.current.length - 1
                : location.index,
          ) +
          listStartOffset +
          shortListOffset;
        const normalizedIndex =
          typeof location === "number"
            ? location
            : location.index === "LAST"
              ? dataRef.current.length - 1
              : location.index;
        const itemHeight = heightAt(heightsRef.current, normalizedIndex);
        const viewportTop = element.scrollTop;
        const viewportBottom = element.scrollTop + element.clientHeight;

        if (
          normalizedTop < viewportTop ||
          normalizedTop + itemHeight > viewportBottom
        ) {
          scrollToLocation(location);
        }
      },
      scrollerElement: () => scrollerRef.current,
      getScrollLocation: () => locationRef.current,
      cancelSmoothScroll: () => smoothScrollRef.current.cancel(),
      height: (item) => {
        const index = dataRef.current.indexOf(item);

        return index === -1 ? 0 : heightAt(heightsRef.current, index);
      },
    }),
    [
      captureAnchor,
      captureScrollHeight,
      listStartOffset,
      renderedData,
      scheduleAutoScroll,
      scrollToLocation,
      setListData,
      shortListOffset,
    ],
  );

  useImperativeHandle(ref, () => methods, [methods]);

  useEffect(() => {
    dataRef.current = listData;
  }, [listData]);

  useEffect(() => {
    if (!useWindowScroll && !customScrollParent) return;
    if (warnedUnsupportedScrollerRef.current) return;

    warnedUnsupportedScrollerRef.current = true;
    console.warn(
      "sogna-virtual-list: useWindowScroll/customScrollParent are not implemented in v0.1; using the internal scroller.",
    );
  }, [customScrollParent, useWindowScroll]);

  useEffect(() => {
    if (controlledData === undefined) return;

    applyControlledData(controlledData);
  }, [controlledData]);

  useEffect(() => {
    onRenderedDataChange?.(renderedData);
  }, [onRenderedDataChange, renderedData]);

  useEffect(() => {
    onScroll?.(scrollLocation);
  }, [onScroll, scrollLocation]);

  useLayoutEffect(() => {
    if (testingContext) {
      heightsRef.current = dataRef.current.map(() => testingContext.itemHeight);
      setViewportHeight(testingContext.viewportHeight);
      setVersion((current) => current + 1);
    }
  }, [testingContext]);

  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;

    const updateViewport = () => {
      setViewportHeight(testingContext?.viewportHeight ?? element.clientHeight);
      updateScrollState();
    };

    updateViewport();

    if (testingContext || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [testingContext]);

  useLayoutEffect(() => {
    const cleanup = [
      observeStaticElement(headerRef.current, setHeaderHeight),
      observeStaticElement(stickyHeaderRef.current, setStickyHeaderHeight),
      observeStaticElement(footerRef.current, setFooterHeight),
      observeStaticElement(stickyFooterRef.current, setStickyFooterHeight),
    ];

    return () => {
      cleanup.forEach((run) => run());
    };
  }, [Header, StickyHeader, Footer, StickyFooter]);

  useLayoutEffect(() => {
    if (initialLocationAppliedRef.current) return;
    if (initialLocation === null || listData.length === 0) return;

    initialLocationAppliedRef.current = true;
    pendingScrollRef.current = {
      type: "location",
      location: initialLocation,
    };
  }, [initialLocation, listData.length]);

  useLayoutEffect(() => {
    applyPendingScroll();
    updateScrollState();
  }, [
    footerHeight,
    headerHeight,
    listData,
    scrollHeight,
    shortListOffset,
    stickyFooterHeight,
    stickyHeaderHeight,
    totalListHeight,
    version,
    viewportHeight,
  ]);

  useEffect(() => {
    return () => {
      itemObserversRef.current.forEach((observer) => observer.disconnect());
      itemObserversRef.current.clear();
      smoothScrollRef.current.cancel();
    };
  }, []);

  function applyControlledData(next: DataWithScrollModifier<Data> | null) {
    const nextData = (next?.data ?? []).slice();
    const modifier = next?.scrollModifier;

    if (!modifier) {
      setListData(nextData);

      return;
    }

    if (modifier === "prepend") {
      applyPrependModifier(nextData);

      return;
    }

    if (modifier === "remove-from-start") {
      captureScrollHeight();
      setListData(nextData);

      return;
    }

    if (modifier === "remove-from-end") {
      setListData(nextData);

      return;
    }

    if (modifier.type === "item-location") {
      if (modifier.purgeItemSizes) {
        heightsRef.current = [];
      }

      pendingScrollRef.current = {
        type: "location",
        location: modifier.location,
      };
      setListData(nextData);

      return;
    }

    if (modifier.type === "auto-scroll-to-bottom") {
      scheduleAutoScroll(nextData, modifier.autoScroll);
      setListData(nextData);

      return;
    }

    if (modifier.type === "items-change") {
      const wasAtBottom = locationRef.current.isAtBottom;

      setListData(nextData);

      if (!wasAtBottom) return;

      pendingScrollRef.current = {
        type: "location",
        location:
          typeof modifier.behavior === "object"
            ? (modifier.behavior.location() ?? {
                index: "LAST",
                align: "end",
              })
            : {
                index: "LAST",
                align: "end",
                behavior: modifier.behavior,
              },
      };
    }
  }

  function applyPrependModifier(nextData: Data[]) {
    const currentData = dataRef.current;

    if (currentData.length === 0) {
      setListData(nextData);

      return;
    }

    const firstIdentity = itemIdentity(currentData[0] as Data);
    const firstPreservedIndex = nextData.findIndex(
      (item) => itemIdentity(item) === firstIdentity,
    );

    if (firstPreservedIndex === -1) {
      setListData(nextData);

      return;
    }

    captureScrollHeight();
    setListData(nextData);
  }

  function updateScrollState() {
    const element = scrollerRef.current;
    const nextTop = element?.scrollTop ?? 0;
    const nextLocation = readScrollLocation();

    setScrollTop(nextTop);
    setScrollLocation(nextLocation);
    locationRef.current = nextLocation;
  }

  function applyPendingScroll() {
    const action = pendingScrollRef.current;
    const element = scrollerRef.current;
    if (!action || !element) return;

    pendingScrollRef.current = null;

    if (action.type === "preserve-scroll-height") {
      const delta = element.scrollHeight - action.previousScrollHeight;
      element.scrollTop = action.previousScrollTop + delta;
      setScrollTop(element.scrollTop);

      return;
    }

    if (action.type === "anchor") {
      const anchor = listRef.current?.querySelector<HTMLElement>(
        `[data-index="${action.index}"]`,
      );

      if (!anchor) return;

      const nextTop = anchor.getBoundingClientRect().top;
      element.scrollTop += nextTop - action.previousTop;
      setScrollTop(element.scrollTop);

      return;
    }

    if (action.type === "bottom") {
      scrollToBottom(action.behavior);

      return;
    }

    scrollToLocation(action.location);
  }

  function observeStaticElement(
    element: HTMLDivElement | null,
    setHeight: (height: number) => void,
  ) {
    if (!element) {
      setHeight(0);

      return noCleanup;
    }

    const measure = () => setHeight(Math.ceil(element.offsetHeight));
    measure();

    if (typeof ResizeObserver === "undefined") return noCleanup;

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }

  const setItemNode = useCallback(
    (key: React.Key, index: number) => (node: HTMLDivElement | null) => {
      const existingObserver = itemObserversRef.current.get(key);

      if (existingObserver) {
        existingObserver.disconnect();
        itemObserversRef.current.delete(key);
      }

      if (!node) return;

      const measure = () => {
        const measuredHeight =
          testingContext?.itemHeight ?? Math.ceil(node.offsetHeight);
        const previousHeight = heightsRef.current[index];

        if (previousHeight === measuredHeight) return;

        heightsRef.current[index] = measuredHeight;
        setVersion((current) => current + 1);

        if (locationRef.current.isAtBottom) {
          pendingScrollRef.current = {
            type: "bottom",
            behavior: "auto",
          };
        }
      };

      measure();

      if (!testingContext && typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        itemObserversRef.current.set(key, observer);
      }
    },
    [testingContext],
  );

  const handleScroll = useCallback(() => {
    updateScrollState();
  }, []);

  const ScrollTag = ScrollElement as ScrollElementComponent<Context> | "div";
  const renderedContext = context;
  const Empty = EmptyPlaceholder as ContextAwareComponent<Context> | null;
  const listContentVisible = listData.length > 0;

  return (
    <MethodsContext.Provider value={methods as SognaVirtualListMethods}>
      <LocationContext.Provider value={scrollLocation}>
        <RenderedDataContext.Provider value={renderedData}>
          <ScrollTag
            {...scrollerProps}
            ref={scrollerRef}
            data-testid="sogna-virtual-list-scroller"
            onScroll={handleScroll}
            style={{
              boxSizing: "border-box",
              overflowY: "auto",
              overscrollBehavior: "contain",
              ...style,
            }}
            {...(ScrollTag === "div" ? {} : { context: renderedContext })}
          >
            {!listContentVisible && Empty ? (
              <Empty context={renderedContext} />
            ) : null}

            {Header ? (
              <HeaderWrapper
                ref={headerRef}
                style={{
                  overflowAnchor: "none",
                }}
              >
                <Header context={renderedContext} />
              </HeaderWrapper>
            ) : null}

            {StickyHeader ? (
              <StickyHeaderWrapperProp
                ref={stickyHeaderRef}
                style={{
                  overflowAnchor: "none",
                }}
              >
                <StickyHeader context={renderedContext} />
              </StickyHeaderWrapperProp>
            ) : null}

            {listContentVisible ? (
              <div
                ref={listRef}
                data-testid="sogna-virtual-list-list"
                style={{
                  boxSizing: "content-box",
                  height: totalListHeight,
                  marginTop: shortListOffset,
                  minHeight: enforceStickyFooterAtBottom
                    ? Math.max(
                        0,
                        viewportHeight - listStartOffset - listEndOffset,
                      )
                    : undefined,
                  overflowAnchor: "none",
                  position: "relative",
                  transition:
                    shortSizeAlign === "bottom-smooth"
                      ? "margin-top 0.2s ease-out"
                      : undefined,
                }}
              >
                {visibleItems.map((item) => {
                  const key = computeItemKey({
                    data: item.data,
                    index: item.index,
                    context: renderedContext,
                  });

                  return (
                    <div
                      key={key}
                      ref={setItemNode(key, item.index)}
                      data-index={item.index}
                      data-known-size={item.height}
                      style={{
                        left: 0,
                        overflowAnchor: "none",
                        position: "absolute",
                        top: item.offset,
                        width: "100%",
                      }}
                    >
                      <ItemContent
                        context={renderedContext}
                        data={item.data}
                        index={item.index}
                        nextData={item.nextData}
                        prevData={item.prevData}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}

            {Footer ? (
              <FooterWrapper
                ref={footerRef}
                style={{
                  overflowAnchor: "none",
                }}
              >
                <Footer context={renderedContext} />
              </FooterWrapper>
            ) : null}

            {StickyFooter ? (
              <StickyFooterWrapperProp
                ref={stickyFooterRef}
                style={{
                  overflowAnchor: "none",
                }}
              >
                <StickyFooter context={renderedContext} />
              </StickyFooterWrapperProp>
            ) : null}
          </ScrollTag>
        </RenderedDataContext.Provider>
      </LocationContext.Provider>
    </MethodsContext.Provider>
  );
}

export const SognaVirtualList = forwardRef(SognaVirtualListInner) as <
  Data,
  Context,
>(
  props: SognaVirtualListProps<Data, Context> & {
    ref?: React.Ref<SognaVirtualListMethods<Data, Context>>;
  },
) => React.ReactElement;

export function SognaVirtualListLicense({
  children,
}: SognaVirtualListLicenseProps) {
  return <>{children}</>;
}
