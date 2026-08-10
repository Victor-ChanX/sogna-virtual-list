import React from "react";

import { ApiTable, CodeBlock, Section } from "./components";
import { PrependDemo, ScrollApiDemo, StreamingChatDemo } from "./demos";
import { T, useLang, useT } from "./i18n";

const GITHUB_URL = "https://github.com/Victor-ChanX/sogna-virtual-list";

const CODE_BASIC = `import { SognaVirtualList } from "sogna-virtual-list";

type Message = { id: string; author: "user" | "assistant"; text: string };

export function ChatList({ messages }: { messages: Message[] }) {
  return (
    <SognaVirtualList<Message, null>
      data={{ data: messages }}
      context={null}
      computeItemKey={({ data }) => data.id}
      itemIdentity={(m) => m.id}
      ItemContent={({ data }) => <div>{data.text}</div>}
      style={{ height: 480, width: "100%" }}
    />
  );
}`;

const CODE_BOTTOM_UP = `<SognaVirtualList<Message, null>
  data={{ data: messages }}
  messageFlow="bottom-up"   // short lists sit at the bottom,
  ...                       // initial view opens on the latest item
/>`;

const CODE_STREAMING = `const data: DataWithScrollModifier<Message> = {
  data: messages, // same message id, growing content
  scrollModifier: { type: "items-change", behavior: "auto" },
};

<SognaVirtualList<Message, null> data={data} ... />`;

const CODE_PREPEND = `// onStartReached fires once at the top and re-arms only after
// leaving the zone — prepend compensation cannot retrigger it.
<SognaVirtualList<Message, null>
  data={{
    data: [...olderMessages, ...messages],
    scrollModifier: "prepend", // viewport stays anchored
  }}
  onStartReached={() => loadOlderMessages()}
  ...
/>`;

const CODE_IMPERATIVE = `const ref = useRef<SognaVirtualListMethods<Message, null>>(null);

ref.current?.data.append([newMessage], "smooth"); // follow if at bottom
ref.current?.data.prepend(olderMessages);          // anchored
ref.current?.data.removeFromStart(100);            // trim, anchored
ref.current?.scrollToItem({
  index: "LAST", align: "end", behavior: "smooth",
  done: () => console.log("arrived"), // fires on real completion
});`;

const CODE_CUSTOM_EASING = `ref.current?.scrollToItem({
  index: "LAST",
  align: "end",
  behavior: (currentTop, targetTop) => ({
    animationFrameCount: 30,          // duration (time-based internally)
    easing: (x) => 1 - (1 - x) ** 3,  // your own curve
  }),
});`;

const CODE_TESTING = `import {
  SognaVirtualList,
  SognaVirtualListTestingContext,
  installTestHarness,
} from "sogna-virtual-list";

const harness = installTestHarness(); // ResizeObserver mock for jsdom

render(
  <SognaVirtualListTestingContext.Provider
    value={{ viewportHeight: 400, itemHeight: 40 }}
  >
    <SognaVirtualList data={{ data: messages }} ... />
  </SognaVirtualListTestingContext.Provider>,
);

harness.resize(rowElement, 120); // simulate streaming growth
harness.restore();`;

function Header() {
  const { lang, setLang } = useLang();

  return (
    <header className="site-header">
      <a href="#top" className="brand">
        sogna<span>-virtual-list</span>
      </a>
      <div className="spacer" />
      <a className="header-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
      <div className="lang-toggle">
        <button
          type="button"
          className={lang === "en" ? "active" : ""}
          onClick={() => setLang("en")}
        >
          EN
        </button>
        <button
          type="button"
          className={lang === "zh" ? "active" : ""}
          onClick={() => setLang("zh")}
        >
          中文
        </button>
      </div>
    </header>
  );
}

function Sidebar() {
  const t = useT();

  const items: [string, string][] = [
    ["#demos", t("Live demos", "在线演示")],
    ["#install", t("Install", "安装")],
    ["#quickstart", t("Quick start", "快速开始")],
    ["#streaming", t("Streaming", "流式更新")],
    ["#history", t("Loading history", "加载历史")],
    ["#imperative", t("Imperative API", "命令式 API")],
    ["#modifiers", t("Scroll modifiers", "滚动修饰符")],
    ["#props", t("Props", "属性")],
    ["#testing", t("Testing", "测试")],
  ];

  return (
    <nav className="sidebar">
      <div className="group">
        <T en="Documentation" zh="文档" />
      </div>
      {items.map(([href, label]) => (
        <a key={href} href={href}>
          {label}
        </a>
      ))}
    </nav>
  );
}

function Hero() {
  return (
    <div className="hero" id="top">
      <h1>
        <T
          en={
            <>
              The <span className="accent">chat-native</span> React virtual list
            </>
          }
          zh={
            <>
              为<span className="accent">聊天场景</span>而生的 React 虚拟列表
            </>
          }
        />
      </h1>
      <p className="tagline">
        <T
          en="Streaming replies, history loading, trims — the viewport never jumps. A lightweight, MIT-licensed virtual list tuned for chat, feeds, and dynamic-height message UIs."
          zh="流式回复、历史加载、消息裁剪——视口永远不跳。轻量、MIT 协议，为聊天、信息流与动态高度消息 UI 深度调优。"
        />
      </p>
      <div className="badges">
        <span className="badge">MIT</span>
        <span className="badge">React 18 / 19</span>
        <span className="badge">
          <T en="10 kB gzip" zh="10 kB gzip" />
        </span>
        <span className="badge">
          <T en="Zero dependencies" zh="零依赖" />
        </span>
      </div>
      <CodeBlock code="npm install sogna-virtual-list" />
      <div className="cards">
        <div className="card">
          <h3>
            <T en="Streaming that follows" zh="流式跟随" />
          </h3>
          <p>
            <T
              en="Token-by-token growth keeps the view pinned to the bottom — and never disturbs a reader who scrolled up."
              zh="逐 token 增长时视图钉在底部；用户上滑阅读时绝不打扰。"
            />
          </p>
        </div>
        <div className="card">
          <h3>
            <T en="Prepend without jumps" zh="历史加载不跳屏" />
          </h3>
          <p>
            <T
              en="History pages load above the viewport with identity-based anchoring computed from real measured heights."
              zh="历史页在视口上方加载，基于消息身份和真实测量高度做锚定补偿。"
            />
          </p>
        </div>
        <div className="card">
          <h3>
            <T en="Fast at any length" zh="任意长度都快" />
          </h3>
          <p>
            <T
              en="O(log n) scroll math, one shared ResizeObserver, rAF-coalesced events — built for 100k-message logs."
              zh="O(log n) 滚动计算、单一共享 ResizeObserver、rAF 合并事件——为十万级消息日志设计。"
            />
          </p>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <>
      <Header />
      <div className="layout">
        <Sidebar />
        <main className="content">
          <Hero />

          <Section
            id="demos"
            titleEn="Live demos"
            titleZh="在线演示"
            subEn="Everything below is the real library running in your browser."
            subZh="以下全部是真实库代码在你的浏览器里运行。"
          >
            <h3>
              <T en="Streaming chat" zh="流式聊天" />
            </h3>
            <p>
              <T
                en="Stream a reply and scroll up mid-stream — your reading position is preserved. Reach the top to auto-load history."
                zh="点击流式回复，然后在输出过程中向上滚动——阅读位置会被保留。滚到顶部会自动加载历史。"
              />
            </p>
            <StreamingChatDemo />

            <h3>
              <T en="Prepend anchoring" zh="历史插入锚定" />
            </h3>
            <p>
              <T
                en="Scroll to the middle, then prepend a page — the item you were reading does not move a pixel."
                zh="滚动到列表中间，然后向上插入一页——你正在读的那条消息一个像素都不会动。"
              />
            </p>
            <PrependDemo />

            <h3>
              <T en="Scroll API" zh="滚动 API" />
            </h3>
            <p>
              <T
                en="Smooth scrolls are time-based, chase live targets, and can be interrupted by the user at any moment."
                zh="平滑滚动基于时间、追踪实时目标，且随时可被用户输入打断。"
              />
            </p>
            <ScrollApiDemo />
          </Section>

          <Section
            id="install"
            titleEn="Install"
            titleZh="安装"
            subEn="React and React DOM are peer dependencies. React 18 or 19, and a browser with ResizeObserver."
            subZh="React 与 React DOM 为 peer 依赖。需要 React 18 或 19，以及支持 ResizeObserver 的浏览器。"
          >
            <CodeBlock code={"npm install sogna-virtual-list"} />
          </Section>

          <Section
            id="quickstart"
            titleEn="Quick start"
            titleZh="快速开始"
            subEn="The default flow is top-down. Use messageFlow=&quot;bottom-up&quot; for a classic chat window."
            subZh="默认从上往下排列。经典聊天窗口使用 messageFlow=&quot;bottom-up&quot;。"
          >
            <CodeBlock code={CODE_BASIC} />
            <p>
              <T
                en={
                  <>
                    Keep <code>id</code> stable across updates —{" "}
                    <code>itemIdentity</code> keys the measured-height cache, so
                    sizes stay attached to the right message through
                    prepends, inserts, and streaming edits.
                  </>
                }
                zh={
                  <>
                    更新过程中保持 <code>id</code> 稳定——
                    <code>itemIdentity</code> 是高度缓存的键，
                    prepend、插入、流式编辑时尺寸都会跟着正确的消息走。
                  </>
                }
              />
            </p>
            <CodeBlock code={CODE_BOTTOM_UP} />
          </Section>

          <Section
            id="streaming"
            titleEn="Streaming updates"
            titleZh="流式更新"
            subEn="Keep the same message id and grow its content. If the user is at the bottom, the list follows; if they scrolled up, their position is preserved."
            subZh="保持同一条消息的 id，持续增长其内容。用户在底部则跟随增长；上滑阅读则保持原位。"
          >
            <CodeBlock code={CODE_STREAMING} />
            <p>
              <T
                en="The typing animation itself is entirely yours — render whatever you want in ItemContent. The list only observes height changes (fractional-pixel precision via ResizeObserver) and repairs the scroll position."
                zh="打字动画完全由你自定义——ItemContent 里想怎么渲染都行。列表只观察高度变化（ResizeObserver 分数像素精度）并修复滚动位置。"
              />
            </p>
          </Section>

          <Section
            id="history"
            titleEn="Loading history"
            titleZh="加载历史"
            subEn="Prepend pages above the viewport; anchoring keeps the view still. onStartReached is the safe trigger."
            subZh="在视口上方插入历史页，锚定让视图保持不动。onStartReached 是安全的触发器。"
          >
            <CodeBlock code={CODE_PREPEND} />
          </Section>

          <Section
            id="imperative"
            titleEn="Imperative API"
            titleZh="命令式 API"
            subEn="Drive the list through a forwarded ref, or useSognaVirtualListMethods from inside the tree."
            subZh="通过 ref 控制列表，或在组件树内部使用 useSognaVirtualListMethods。"
          >
            <CodeBlock code={CODE_IMPERATIVE} />
            <h3>
              <T en="Data methods" zh="数据方法" />
            </h3>
            <ApiTable
              rows={[
                { name: "append(data, autoscroll?)", en: "Append items; optionally follow the bottom.", zh: "追加消息；可选跟随到底部。" },
                { name: "prepend(data)", en: "Insert above; viewport stays anchored.", zh: "向上插入；视口保持锚定。" },
                { name: "insert(data, offset, autoscroll?)", en: "Insert at an offset; anchors when above the viewport.", zh: "在指定位置插入；在视口上方时自动锚定。" },
                { name: "map(fn, autoscroll?)", en: "Transform items (streaming edits).", zh: "变换消息（流式编辑）。" },
                { name: "mapWithAnchor(fn, index)", en: "Transform while anchoring a specific item.", zh: "变换的同时锚定指定消息。" },
                { name: "deleteRange / findAndDelete", en: "Delete with anchor repair.", zh: "删除并做锚定修复。" },
                { name: "removeFromStart(count)", en: "Trim old items; view stays still.", zh: "裁剪旧消息；视图不动。" },
                { name: "replace(data, options?)", en: "Replace everything; optional initialLocation / purgeItemSizes.", zh: "整体替换；可选 initialLocation / purgeItemSizes。" },
                { name: "batch(fn, autoscroll?)", en: "Coalesce several edits into one update.", zh: "把多次编辑合并为一次更新。" },
                { name: "get() / getCurrentlyRendered()", en: "Read all / currently rendered data.", zh: "读取全部 / 当前渲染的数据。" },
              ]}
            />
            <h3>
              <T en="Scroll methods" zh="滚动方法" />
            </h3>
            <ApiTable
              rows={[
                { name: "scrollToItem(location)", en: "Scroll to an index, \"LAST\", or a negative index (Array.at semantics). done() fires on real completion.", zh: "滚动到索引、\"LAST\" 或负索引（Array.at 语义）。done() 在真正完成时触发。" },
                { name: "scrollIntoView(location)", en: "Scroll only if the item is outside the visible area (sticky chrome accounted for).", zh: "仅当条目在可视区外才滚动（已考虑 sticky 头尾遮挡）。" },
                { name: "getScrollLocation()", en: "Current location: isAtTop/isAtBottom, first/lastVisibleItemIndex…", zh: "当前位置：isAtTop/isAtBottom、first/lastVisibleItemIndex…" },
                { name: "cancelSmoothScroll()", en: "Cancel an in-flight smooth scroll.", zh: "取消进行中的平滑滚动。" },
              ]}
            />
            <h3>
              <T en="Custom scroll animation" zh="自定义滚动动画" />
            </h3>
            <p>
              <T
                en="behavior accepts a function returning your own duration and easing curve. Mid-flight list growth is chased; wheel/touch input interrupts; prefers-reduced-motion is respected."
                zh="behavior 可以传函数，返回你自己的时长与缓动曲线。动画途中列表增长会自动追踪；滚轮/触摸会打断动画；遵循 prefers-reduced-motion。"
              />
            </p>
            <CodeBlock code={CODE_CUSTOM_EASING} />
          </Section>

          <Section
            id="modifiers"
            titleEn="Scroll modifiers"
            titleZh="滚动修饰符"
            subEn="scrollModifier tells the controlled data prop how to repair the scroll position after a change. The instruction is the data array identity — recreating the wrapper object is free."
            subZh="scrollModifier 告诉受控 data 属性在数据变化后如何修复滚动位置。指令的判定依据是数据数组的引用——重建包裹对象不会重放指令。"
          >
            <ApiTable
              rows={[
                { name: '"prepend"', en: "Older items inserted above; viewport anchored.", zh: "历史插入到上方；视口锚定。" },
                { name: '"remove-from-start"', en: "Trim from the beginning; viewport anchored.", zh: "从头部裁剪；视口锚定。" },
                { name: '{ type: "items-change", behavior }', en: "Streaming: follow the bottom only if the user is there.", zh: "流式：仅当用户在底部时跟随。" },
                { name: '{ type: "item-location", location }', en: "Replace data and jump to a location.", zh: "替换数据并跳转到指定位置。" },
                { name: '{ type: "auto-scroll-to-bottom", autoScroll }', en: "Append: scroll down per your callback / behavior.", zh: "追加：按回调 / 行为决定是否下滚。" },
              ]}
            />
          </Section>

          <Section
            id="props"
            titleEn="Key props"
            titleZh="关键属性"
          >
            <ApiTable
              rows={[
                { name: "data / initialData", en: "Controlled data with scrollModifier, or uncontrolled seed.", zh: "带 scrollModifier 的受控数据，或非受控初始数据。" },
                { name: "messageFlow", en: '"top-down" (default) or "bottom-up" for classic chat.', zh: '"top-down"（默认）或经典聊天的 "bottom-up"。' },
                { name: "computeItemKey / itemIdentity", en: "Stable React key / identity for the height cache.", zh: "稳定的 React key / 高度缓存身份。" },
                { name: "ItemContent", en: "Row renderer — bring your own typing animation.", zh: "行渲染器——打字动画完全自定义。" },
                { name: "Header / Footer / Sticky* / EmptyPlaceholder", en: "Slot components.", zh: "插槽组件。" },
                { name: "onScroll", en: "Receives ListScrollLocation on every change.", zh: "位置变化时收到 ListScrollLocation。" },
                { name: "onStartReached / onEndReached", en: "Edge-triggered top/bottom callbacks, prepend-safe.", zh: "边沿触发的顶部/底部回调，对 prepend 安全。" },
                { name: "atTopThreshold / atBottomThreshold", en: "Edge zone size in pixels (default 4).", zh: "边缘判定阈值，单位像素（默认 4）。" },
                { name: "increaseViewportBy", en: "Extra pixels rendered beyond the viewport.", zh: "视口外额外渲染的像素。" },
              ]}
            />
          </Section>

          <Section
            id="testing"
            titleEn="Testing"
            titleZh="测试"
            subEn="Deterministic geometry for jsdom: a testing context for sizes plus a controllable ResizeObserver harness."
            subZh="为 jsdom 提供确定性几何：尺寸测试上下文 + 可控的 ResizeObserver 测试工具。"
          >
            <CodeBlock code={CODE_TESTING} />
          </Section>

          <footer className="site-footer">
            <T
              en={
                <>
                  MIT License · Some engine primitives adapted from{" "}
                  <a href="https://github.com/petyosi/react-virtuoso">react-virtuoso</a>{" "}
                  (MIT) · <a href={GITHUB_URL}>GitHub</a>
                </>
              }
              zh={
                <>
                  MIT 协议 · 部分引擎原语改编自{" "}
                  <a href="https://github.com/petyosi/react-virtuoso">react-virtuoso</a>
                  （MIT）· <a href={GITHUB_URL}>GitHub</a>
                </>
              }
            />
          </footer>
        </main>
      </div>
    </>
  );
}
