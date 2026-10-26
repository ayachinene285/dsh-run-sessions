/**
 * dsh-run-sessions（客户端侧）
 *
 * 在侧栏「任务 / 频道」这一排页签后面加一个「本次启动」页签，列出本次 DSH
 * 启动之后还在更新的会话（= 这次启动里真正聊过的会话），点一下直接打开。
 *
 * 页签本身由 dsh-im-connect 渲染：它把官方 sidebar.workspaces 包了一层，并在
 * 包出来的 entry 上挂了 __dshNativeTabs 注册表。这里只往注册表里插一项，
 * 不接管、不替换官方任何组件；没有这个注册表时本插件什么也不做。
 *
 * @module dsh-run-sessions/client
 */

window.__ModuleLoader__.load({
  id: "dsh-run-sessions",
  factory: (require) => {
    const React = require("react");
    const module = { exports: {} };
    const exports = module.exports;

    const inject = ["slots", "sessions", "workspaces", "locale"];

    const TAB_ID = "dsh-run-sessions";
    const STATE_URL = "/api/dsh-run-sessions/state";
    const STYLE_ATTR = "data-dsh-run-sessions-style";
    const TICK_MS = 30000;

    const ZH_TEXTS = {
      tab: "本次启动",
      heading: "本次启动",
      count: function (n) { return "共 " + n + " 个会话"; },
      loading: "正在读取本次启动…",
      empty: "本次启动后还没有进行过对话。",
      untitled: "未命名会话",
      failed: "会话列表渲染失败",
      just: "刚刚",
      minutes: function (n) { return n + " 分钟前"; },
      hours: function (n) { return n + " 小时前"; },
      days: function (n) { return n + " 天前"; },
      running: "正在运行",
      open: "打开会话",
      remove: "从本次启动移除",
      removeHint: "只从这个列表里移除，不影响 DSH 里的会话",
      restore: "恢复",
      hiddenCount: function (n) { return "已移除 " + n + " 个"; },
      dragHint: "可拖动排序",
    };

    const EN_TEXTS = {
      tab: "This run",
      heading: "This run",
      count: function (n) { return n + (n === 1 ? " session" : " sessions"); },
      loading: "Reading this run…",
      empty: "No conversations in this run yet.",
      untitled: "Untitled session",
      failed: "Could not render sessions",
      just: "just now",
      minutes: function (n) { return n + " min ago"; },
      hours: function (n) { return n + " h ago"; },
      days: function (n) { return n + " d ago"; },
      running: "Running",
      open: "Open session",
      remove: "Remove from this run",
      removeHint: "Only removes it from this list, the session stays in DSH",
      restore: "Restore",
      hiddenCount: function (n) { return n + " removed"; },
      dragHint: "Drag to reorder",
    };

    /** 文案表：语言切换时整体替换，页面与页签标题都跟着变。 */
    function textsFor(zh) {
      return zh ? ZH_TEXTS : EN_TEXTS;
    }

    /** 只在拿不到 locale 服务时使用的兜底判断。 */
    function detectZh() {
      try {
        const lang = String((document.documentElement && document.documentElement.lang) || navigator.language || "");
        return lang.toLowerCase().indexOf("zh") === 0;
      } catch (_) {
        return true;
      }
    }

    function createTextStore(initial) {
      let state = initial;
      const listeners = new Set();
      return {
        getSnapshot: function () { return state; },
        subscribe: function (listener) {
          listeners.add(listener);
          return function () { listeners.delete(listener); };
        },
        set: function (next) {
          if (next === state) return;
          state = next;
          listeners.forEach(function (listener) {
            try { listener(); } catch (_) { /* 忽略单个订阅者 */ }
          });
        },
      };
    }

    const CSS = [
      ".drs-panel{position:relative;display:flex;flex-direction:column;flex:1 1 auto;min-height:0;height:100%;overflow:hidden}",
      ".drs-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:10px 12px 6px;flex:none}",
      ".drs-head-title{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#9ca3af)}",
      ".drs-head-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#9ca3af);white-space:nowrap}",
      ".drs-list{display:flex;flex-direction:column;gap:1px;padding:0 6px 12px;overflow-y:auto;min-height:0;flex:1 1 auto}",
      ".drs-row{display:flex;flex-direction:column;gap:2px;width:100%;min-width:0;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}",
      // 选中态沿用官方会话行的底色（interactive-bg-hover），再加粗标题做区分。
      ".drs-row:hover,.drs-row.is-current{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-fill-secondary,rgba(127,127,127,.14)))}",
      ".drs-row.is-current .drs-title-text{font-weight:600;color:var(--dsw-alias-label-primary,inherit)}",
      ".drs-row.is-current .drs-meta{color:var(--dsw-alias-label-secondary,#8a8f98)}",
      ".drs-row:focus-visible{outline:2px solid var(--dsw-alias-border-focus,#4d6bfe);outline-offset:-2px}",
      ".drs-title{display:flex;align-items:center;min-width:0;font-size:13px;line-height:18px}",
      ".drs-title-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".drs-meta{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#9ca3af)}",
      ".drs-meta-ws{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".drs-meta-time{flex:none;font-variant-numeric:tabular-nums}",
      ".drs-dot{flex:none;width:6px;height:6px;margin-right:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#16a34a)}",
      ".drs-empty{padding:24px 16px;text-align:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9ca3af)}",
      ".drs-row[draggable='true']{cursor:pointer}",
      ".drs-row.is-dragging{opacity:.45}",
      ".drs-row.drop-before{box-shadow:inset 0 2px 0 var(--dsw-alias-label-primary,#e5e7eb)}",
      ".drs-row.drop-after{box-shadow:inset 0 -2px 0 var(--dsw-alias-label-primary,#e5e7eb)}",
      ".drs-menu{position:absolute;z-index:30;min-width:168px;padding:4px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#1c1c1e);border:1px solid var(--dsw-alias-border-muted,rgba(127,127,127,.28));box-shadow:0 10px 28px rgba(0,0,0,.35)}",
      ".drs-menu-item{display:block;width:100%;padding:6px 10px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer}",
      ".drs-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}",
      ".drs-menu-item.is-danger{color:var(--dsw-alias-state-error-primary,#dc2626)}",
      ".drs-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px 10px;flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#9ca3af)}",
      ".drs-link{border:0;background:none;padding:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}",
    ].join("");

    function ensureStyle() {
      try {
        if (typeof document === "undefined" || document === null) return;
        if (document.querySelector("style[" + STYLE_ATTR + "]") !== null) return;
        const style = document.createElement("style");
        style.setAttribute(STYLE_ATTR, "");
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
      } catch (_) {
        // 样式注入失败不影响功能。
      }
    }

    function messageOf(error) {
      return String((error && error.message) || error);
    }

    /** 会话相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前。 */
    function formatAgo(deltaMs, texts) {
      const seconds = Math.max(0, Math.round(deltaMs / 1000));
      if (seconds < 45) return texts.just;
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return texts.minutes(minutes);
      const hours = Math.round(minutes / 60);
      if (hours < 24) return texts.hours(hours);
      return texts.days(Math.round(hours / 24));
    }

    function basename(value) {
      const text = String(value == null ? "" : value).replace(/[\\/]+$/, "");
      if (!text) return "";
      const parts = text.split(/[\\/]/);
      return parts[parts.length - 1] || text;
    }

    /** 会话 → 工作区显示名：优先用工作区标题，没有就用 cwd 的末级目录名。 */
    function workspaceIndex(state) {
      const bySession = Object.create(null);
      const items = (state && state.items) || [];
      for (let i = 0; i < items.length; i += 1) {
        const workspace = items[i];
        if (!workspace) continue;
        const title = String(workspace.title || "").trim() || basename(workspace.path);
        const ids = workspace.sessionIds || [];
        for (let j = 0; j < ids.length; j += 1) bySession[ids[j]] = title;
      }
      return { bySession: bySession };
    }

    /** 当前主区域打开的会话 id（与官方侧栏的判断方式一致）。 */
    function currentSessionId(state) {
      if (!state) return null;
      if (typeof state.current === "string" && state.current) return state.current;

      const byId = state.byId || {};
      const ids = Array.isArray(state.ids) && state.ids.length ? state.ids : Object.keys(byId);
      for (let i = 0; i < ids.length; i += 1) {
        const key = ids[i];
        const row = byId[key];
        if (!row || !row.retainedBy || (row.retainedBy.mainView || 0) <= 0) continue;
        return String(row.id || key);
      }
      return null;
    }

    /**
     * 本次启动的会话：本次启动之后更新过、且不是空白新会话。
     * 纯函数，方便单独测试。
     */
    function selectRows(list, workspaces, startedAt) {
      const rows = [];
      if (!list || !list.ids || !list.byId || typeof startedAt !== "number") return rows;

      const index = workspaceIndex(workspaces);

      for (let i = 0; i < list.ids.length; i += 1) {
        const key = list.ids[i];
        const row = list.byId[key];
        if (!row) continue;

        const id = row.id || row.sessionId || key;
        const updated = Number(row.updatedAt) || 0;
        if (!(updated >= startedAt)) continue;
        if (row.blank === true) continue;

        rows.push({
          id: String(id),
          title: typeof row.title === "string" ? row.title.trim() : "",
          updated: updated,
          running: row.running === true,
          workspace: index.bySession[id] || basename(row.cwd),
        });
      }

      rows.sort(function (a, b) {
        if (b.updated !== a.updated) return b.updated - a.updated;
        return a.id < b.id ? -1 : 1;
      });
      return rows;
    }

    // ------------------------------------------------------------ 数据源

    let startedAtPromise = null;

    function fallbackStartedAt() {
      try {
        if (typeof performance !== "undefined" && typeof performance.timeOrigin === "number") {
          return performance.timeOrigin;
        }
      } catch (_) {
        // 忽略。
      }
      return Date.now();
    }

    function loadStartedAt() {
      if (startedAtPromise !== null) return startedAtPromise;
      startedAtPromise = fetch(STATE_URL, { cache: "no-store", credentials: "same-origin" })
        .then(function (response) {
          if (!response || !response.ok) return null;
          return response.json();
        })
        .then(function (value) {
          if (value && typeof value.startedAt === "number" && isFinite(value.startedAt)) return value.startedAt;
          return fallbackStartedAt();
        })
        .catch(function () { return fallbackStartedAt(); });
      return startedAtPromise;
    }

    function useStartedAt() {
      const state = React.useState(null);
      const value = state[0];
      const setValue = state[1];

      React.useEffect(function () {
        let alive = true;
        loadStartedAt().then(function (result) {
          if (alive) setValue(result);
        });
        return function () { alive = false; };
      }, []);

      return value;
    }

    function useNow(active) {
      const state = React.useState(function () { return Date.now(); });
      const now = state[0];
      const setNow = state[1];

      React.useEffect(function () {
        if (!active) return undefined;
        const timer = setInterval(function () { setNow(Date.now()); }, TICK_MS);
        return function () { clearInterval(timer); };
      }, [active]);

      return now;
    }

    function useSnapshot(store) {
      const subscribe = React.useCallback(function (onChange) {
        if (!store || typeof store.subscribe !== "function") return function () {};
        const dispose = store.subscribe(onChange);
        return typeof dispose === "function" ? dispose : function () {};
      }, [store]);

      const getSnapshot = React.useCallback(function () {
        if (!store || typeof store.getSnapshot !== "function") return undefined;
        return store.getSnapshot();
      }, [store]);

      return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    }

    function useSessionsState(ctx, props) {
      const store = ctx.sessions && ctx.sessions.list;
      if (store && typeof store.getSnapshot === "function") return useSnapshot(store);
      if (props && typeof props.useSessions === "function") return props.useSessions(function (state) { return state; });
      return undefined;
    }

    function useWorkspacesState(ctx, props) {
      const store = ctx.workspaces && ctx.workspaces.list;
      if (store && typeof store.getSnapshot === "function") return useSnapshot(store);
      if (props && typeof props.useWorkspaces === "function") return props.useWorkspaces(function (state) { return state; });
      return undefined;
    }

    // ------------------------------------------------------------ 界面

    // ------------------------------------------------------------ 布局（隐藏 / 手动排序）

    const LAYOUT_KEY = "dsh-run-sessions.layout.v1";

    /** 每次启动一份：换一次 DSH 进程就重置（用 startedAt 认领）。 */
    function createLayoutStore() {
      let state = { startedAt: null, hidden: [], order: [] };
      const listeners = new Set();

      const emit = function () {
        listeners.forEach(function (listener) {
          try { listener(); } catch (_) { /* 忽略单个订阅者 */ }
        });
      };

      const save = function () {
        try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(state)); } catch (_) { /* 忽略 */ }
      };

      try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            state = {
              startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
              hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter(function (id) { return typeof id === "string"; }) : [],
              order: Array.isArray(parsed.order) ? parsed.order.filter(function (id) { return typeof id === "string"; }) : [],
            };
          }
        }
      } catch (_) {
        // 存储坏了就当没有。
      }

      return {
        getSnapshot: function () { return state; },
        subscribe: function (listener) {
          listeners.add(listener);
          return function () { listeners.delete(listener); };
        },
        /** 绑定到本次启动；换了进程就清空手动顺序与隐藏项。 */
        bind: function (startedAt) {
          if (state.startedAt === startedAt) return;
          state = { startedAt: startedAt, hidden: [], order: [] };
          save();
          emit();
        },
        hide: function (id) {
          if (state.hidden.indexOf(id) !== -1) return;
          state = { startedAt: state.startedAt, hidden: state.hidden.concat([id]), order: state.order };
          save();
          emit();
        },
        restoreAll: function () {
          if (state.hidden.length === 0) return;
          state = { startedAt: state.startedAt, hidden: [], order: state.order };
          save();
          emit();
        },
        move: function (ids, draggedId, targetId, after) {
          if (draggedId === targetId) return;
          const list = ids.filter(function (id) { return id !== draggedId; });
          const index = list.indexOf(targetId);
          if (index === -1) return;
          list.splice(after ? index + 1 : index, 0, draggedId);
          state = { startedAt: state.startedAt, hidden: state.hidden, order: list };
          save();
          emit();
        },
      };
    }

    /** 用户拖过的按保存的顺序排；没拖过的新会话放最上面（它们通常是最新的）。 */
    function applyOrder(rows, order) {
      if (!order || order.length === 0) return rows;

      const index = new Map();
      order.forEach(function (id, i) { index.set(id, i); });

      const pinned = [];
      const fresh = [];
      rows.forEach(function (row) {
        if (index.has(row.id)) pinned.push(row);
        else fresh.push(row);
      });
      pinned.sort(function (a, b) { return index.get(a.id) - index.get(b.id); });
      return fresh.concat(pinned);
    }

    function createPanel(ctx, propsRef, openSession, textStore, onUnmount, layoutStore) {
      function useTexts() {
        return React.useSyncExternalStore(textStore.subscribe, textStore.getSnapshot, textStore.getSnapshot);
      }

      function useLayout() {
        return React.useSyncExternalStore(layoutStore.subscribe, layoutStore.getSnapshot, layoutStore.getSnapshot);
      }

      function Row(props) {
        const row = props.row;
        const texts = props.texts;
        const classes = ["drs-row"];
        if (props.selected) classes.push("is-current");
        if (props.dragging) classes.push("is-dragging");
        if (props.drop === "before") classes.push("drop-before");
        if (props.drop === "after") classes.push("drop-after");

        return React.createElement(
          "button",
          {
            type: "button",
            className: classes.join(" "),
            draggable: true,
            "aria-current": props.selected ? "true" : undefined,
            title: row.title || texts.untitled,
            onClick: props.onOpen,
            onContextMenu: props.onContext,
            onDragStart: props.onDragStart,
            onDragOver: props.onDragOver,
            onDragLeave: props.onDragLeave,
            onDrop: props.onDrop,
            onDragEnd: props.onDragEnd,
          },
          React.createElement(
            "span",
            { className: "drs-title" },
            row.running ? React.createElement("span", { className: "drs-dot", "aria-hidden": "true" }) : null,
            React.createElement("span", { className: "drs-title-text" }, row.title || texts.untitled),
          ),
          React.createElement(
            "span",
            { className: "drs-meta" },
            row.workspace ? React.createElement("span", { className: "drs-meta-ws" }, row.workspace) : null,
            React.createElement("span", { className: "drs-meta-time" }, formatAgo(props.now - row.updated, texts)),
          ),
        );
      }

      function renderBody(props) {
        propsRef.current = props || null;

        const texts = useTexts();
        const layout = useLayout();
        const startedAt = useStartedAt();
        const sessions = useSessionsState(ctx, props);
        const workspaces = useWorkspacesState(ctx, props);
        const now = useNow(startedAt !== null);

        const panelRef = React.useRef(null);
        const menuRef = React.useRef(null);
        const lastDragAt = React.useRef(0);

        const menuState = React.useState(null);
        const menu = menuState[0];
        const setMenu = menuState[1];

        const dragState = React.useState(null);
        const drag = dragState[0];
        const setDrag = dragState[1];

        const overState = React.useState(null);
        const over = overState[0];
        const setOver = overState[1];

        React.useEffect(function () {
          if (startedAt !== null) layoutStore.bind(startedAt);
        }, [startedAt]);

        // 右键菜单：点空白处或按 Esc 关掉。
        React.useEffect(function () {
          if (menu === null) return undefined;

          const onDown = function (event) {
            if (menuRef.current && menuRef.current.contains(event.target)) return;
            setMenu(null);
          };
          const onKey = function (event) {
            if (event.key === "Escape") setMenu(null);
          };

          document.addEventListener("mousedown", onDown, true);
          document.addEventListener("keydown", onKey, true);
          return function () {
            document.removeEventListener("mousedown", onDown, true);
            document.removeEventListener("keydown", onKey, true);
          };
        }, [menu]);

        const hidden = React.useMemo(function () { return new Set(layout.hidden); }, [layout.hidden]);

        const natural = React.useMemo(function () {
          if (startedAt === null) return [];
          return selectRows(sessions, workspaces, startedAt);
        }, [sessions, workspaces, startedAt]);

        const rows = React.useMemo(function () {
          const visible = natural.filter(function (row) { return !hidden.has(row.id); });
          return applyOrder(visible, layout.order);
        }, [natural, hidden, layout.order]);

        const selectedId = React.useMemo(function () { return currentSessionId(sessions); }, [sessions]);

        const openRow = function (id) {
          // 拖完会补一个 click，别把它当成“打开”。
          if (Date.now() - lastDragAt.current < 250) return;
          setMenu(null);
          openSession(id);
        };

        const openMenu = function (row) {
          return function (event) {
            event.preventDefault();
            event.stopPropagation();
            const panel = panelRef.current;
            let x = 6;
            let y = 6;
            if (panel) {
              const rect = panel.getBoundingClientRect();
              const width = 184;
              const height = 84;
              x = event.clientX - rect.left;
              y = event.clientY - rect.top;
              x = Math.max(4, Math.min(x, Math.max(4, rect.width - width - 4)));
              y = Math.max(4, Math.min(y, Math.max(4, rect.height - height - 4)));
            }
            setMenu({ id: row.id, x: x, y: y });
          };
        };

        const onDragStart = function (row) {
          return function (event) {
            try {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", row.id);
            } catch (_) { /* 忽略 */ }
            setDrag(row.id);
          };
        };

        const onDragOver = function (row) {
          return function (event) {
            if (drag === null || drag === row.id) return;
            event.preventDefault();
            try { event.dataTransfer.dropEffect = "move"; } catch (_) { /* 忽略 */ }
            const rect = event.currentTarget.getBoundingClientRect();
            const after = event.clientY > rect.top + rect.height / 2;
            if (over === null || over.id !== row.id || over.after !== after) {
              setOver({ id: row.id, after: after });
            }
          };
        };

        const onDrop = function (row) {
          return function (event) {
            event.preventDefault();
            if (drag !== null && drag !== row.id) {
              const after = over !== null && over.id === row.id ? over.after : false;
              layoutStore.move(rows.map(function (r) { return r.id; }), drag, row.id, after);
            }
            setDrag(null);
            setOver(null);
            lastDragAt.current = Date.now();
          };
        };

        const onDragEnd = function () {
          setDrag(null);
          setOver(null);
          lastDragAt.current = Date.now();
        };

        const head = React.createElement(
          "div",
          { className: "drs-head" },
          React.createElement("span", { className: "drs-head-title" }, texts.heading),
          React.createElement("span", { className: "drs-head-meta" }, rows.length > 0 ? texts.count(rows.length) : ""),
        );

        let body;
        if (startedAt === null) {
          body = React.createElement("div", { className: "drs-empty" }, texts.loading);
        } else if (rows.length === 0) {
          body = React.createElement("div", { className: "drs-empty" }, texts.empty);
        } else {
          body = React.createElement(
            "div",
            {
              className: "drs-list",
              onScrollCapture: function () { setMenu(null); },
            },
            rows.map(function (row) {
              return React.createElement(Row, {
                key: row.id,
                row: row,
                now: now,
                texts: texts,
                selected: selectedId !== null && String(selectedId) === row.id,
                dragging: drag === row.id,
                drop: over !== null && over.id === row.id ? (over.after ? "after" : "before") : null,
                onOpen: function () { openRow(row.id); },
                onContext: openMenu(row),
                onDragStart: onDragStart(row),
                onDragOver: onDragOver(row),
                onDragLeave: function () { if (over !== null && over.id === row.id) setOver(null); },
                onDrop: onDrop(row),
                onDragEnd: onDragEnd,
              });
            }),
          );
        }

        const footer = layout.hidden.length > 0
          ? React.createElement(
            "div",
            { className: "drs-foot" },
            React.createElement("span", null, texts.hiddenCount(layout.hidden.length)),
            React.createElement(
              "button",
              { type: "button", className: "drs-link", onClick: function () { layoutStore.restoreAll(); } },
              texts.restore,
            ),
          )
          : null;

        const menuNode = menu === null
          ? null
          : React.createElement(
            "div",
            {
              className: "drs-menu",
              ref: menuRef,
              role: "menu",
              style: { left: menu.x + "px", top: menu.y + "px" },
            },
            React.createElement(
              "button",
              {
                type: "button",
                role: "menuitem",
                className: "drs-menu-item",
                onClick: function () { setMenu(null); openSession(menu.id); },
              },
              texts.open,
            ),
            React.createElement(
              "button",
              {
                type: "button",
                role: "menuitem",
                title: texts.removeHint,
                className: "drs-menu-item is-danger",
                onClick: function () { layoutStore.hide(menu.id); setMenu(null); },
              },
              texts.remove,
            ),
          );

        return React.createElement(
          "div",
          { className: "drs-panel", ref: panelRef, role: "tabpanel", "aria-label": texts.tab },
          head,
          body,
          footer,
          menuNode,
        );
      }

      // 渲染兜底：面板崩了也只丢这一个页签，不让整个侧栏白屏。
      let BoundaryClass;
      let boundaryResolved = false;

      function boundary() {
        if (boundaryResolved) return BoundaryClass;
        boundaryResolved = true;
        if (typeof React.Component !== "function") {
          BoundaryClass = null;
          return null;
        }
        BoundaryClass = class Boundary extends React.Component {
          constructor(props) {
            super(props);
            this.state = { failed: false };
          }
          static getDerivedStateFromError() {
            return { failed: true };
          }
          componentDidCatch(error) {
            console.warn("run-sessions: 页签渲染失败，已降级", error);
          }
          render() {
            if (this.state.failed) {
              return React.createElement("div", { className: "drs-empty" }, textStore.getSnapshot().failed);
            }
            return this.props.children;
          }
        };
        return BoundaryClass;
      }

      return function RunSessionsPanel(props) {
        React.useEffect(function () {
          return function () { onUnmount(); };
        }, []);

        const content = renderBody(props || {});
        const Boundary = boundary();
        return Boundary === null ? content : React.createElement(Boundary, null, content);
      };
    }

    // ------------------------------------------------------------ 页签挂载

    /** 在 sidebar.workspaces 的 entry 上找 dsh-im-connect 挂出来的原生页签注册表。 */
    function findTabRegistry(ctx) {
      try {
        const read = ctx.slots.entriesOfSlot || ctx.slots.entries;
        if (typeof read !== "function") return null;
        const entries = read.call(ctx.slots, "sidebar.workspaces") || [];
        for (let i = 0; i < entries.length; i += 1) {
          const entry = entries[i];
          if (!entry) continue;
          const registry = entry.__dshNativeTabs || (entry.component && entry.component.__dshNativeTabs);
          if (registry && typeof registry.insert === "function") return registry;
        }
      } catch (error) {
        console.warn("run-sessions: 读取侧栏槽位失败", messageOf(error));
      }
      return null;
    }

    function hasTab(registry) {
      try {
        if (typeof registry.getTabs !== "function") return false;
        const tabs = registry.getTabs() || [];
        for (let i = 0; i < tabs.length; i += 1) {
          if (tabs[i] && tabs[i].id === TAB_ID) return true;
        }
      } catch (_) {
        // 忽略。
      }
      return false;
    }

    /**
     * 「频道」页签的 order(20) 比本页签(30) 小，im-connect 用 find() 选页签时频道会先命中，
     * 于是频道会话即使刚点自本页签也会被判给频道。这里在“刚从本页签点开”的那一小段时间里
     * 让频道页签不认领这个 id；其余时候原样透传，不影响频道自己的逻辑。
     */
    function neutraliseChannelTab(registry, isSticky) {
      if (typeof isSticky !== "function") return;
      try {
        if (!registry || typeof registry.getTabs !== "function") return;
        const tabs = registry.getTabs() || [];
        for (let i = 0; i < tabs.length; i += 1) {
          const tab = tabs[i];
          if (!tab || tab.id !== "channels") continue;
          if (typeof tab.matchSession !== "function" || tab.__drsPatched === true) continue;
          const original = tab.matchSession;
          tab.matchSession = function (id) {
            try {
              if (isSticky(id)) return false;
            } catch (_) {
              // 判断失败就走原逻辑。
            }
            return original.call(this, id);
          };
          tab.__drsPatched = true;
        }
      } catch (_) {
        // 拿不到频道页签就算了：最坏是频道会话仍切到频道页。
      }
    }

    function mountTab(ctx, render, textStore, options) {
      let current = null;
      let stopped = false;
      let timer = null;

      const insert = (force) => {
        if (stopped) return true;
        const registry = findTabRegistry(ctx);
        if (!registry) return false;

        neutraliseChannelTab(registry, options && options.isSticky);

        const label = textStore.getSnapshot().tab;
        const sameRegistry = current !== null && current.registry === registry;

        // 注册表没换、标题没变、页签还在：什么都不用做。
        if (!force && sameRegistry && current.label === label && hasTab(registry)) return true;

        try {
          const tab = { id: TAB_ID, label: label, order: 30, render: render };
          if (options && typeof options.matchSession === "function") tab.matchSession = options.matchSession;
          const remove = registry.insert(tab);
          current = { registry: registry, remove: typeof remove === "function" ? remove : null, label: label };
          return true;
        } catch (error) {
          console.warn("run-sessions: 插入页签失败", messageOf(error));
          return false;
        }
      };

      // 首次尝试 + 短重试：im-connect 可能比本插件晚激活。
      insert(false);
      [200, 600, 1200, 2500, 4000, 7000, 12000, 20000].forEach(function (delay) {
        setTimeout(function () { insert(false); }, delay);
      });

      // 常驻巡检：注册表被重建（比如 im-connect 重新包侧栏）时把页签补回去。
      timer = setInterval(function () { insert(false); }, 15000);

      let unsubscribe = null;
      try {
        if (typeof ctx.slots.subscribe === "function") {
          unsubscribe = ctx.slots.subscribe("sidebar.workspaces", function () { insert(false); });
        }
      } catch (_) {
        // 没有订阅能力时靠上面的定时巡检。
      }

      const stop = function () {
        stopped = true;
        if (timer !== null) clearInterval(timer);
        if (typeof unsubscribe === "function") {
          try { unsubscribe(); } catch (_) { /* 忽略 */ }
        }
        if (current && current.remove) {
          try { current.remove(); } catch (_) { /* 忽略 */ }
        }
        current = null;
      };

      return {
        stop: stop,
        refresh: function () { insert(true); },
      };
    }

    // ------------------------------------------------------------ 入口

    function apply(ctx) {
      try {
        ensureStyle();

        const propsRef = { current: null };
        const textStore = createTextStore(textsFor(detectZh()));
        const layoutStore = createLayoutStore();

        // 语言以 DSH 自己的 locale 服务为准：它的 active 就是界面当前语言。
        const locale = (() => {
          try {
            if (typeof ctx.get === "function") {
              const service = ctx.get("locale");
              if (service) return service;
            }
          } catch (_) {
            // 没注册就退回下面的属性读取。
          }
          try {
            return ctx.locale || null;
          } catch (_) {
            return null;
          }
        })();

        const readActive = function (snapshot) {
          const value = snapshot && typeof snapshot.active === "string" ? snapshot.active : "";
          return value.toLowerCase();
        };

        const applyLocale = function (snapshot) {
          const active = readActive(snapshot);
          if (!active) return;
          const zh = active.indexOf("zh") === 0;
          textStore.set(textsFor(zh));
          console.debug("[run-sessions] locale=" + active + " zh=" + zh);
        };

        if (locale) {
          try {
            if (typeof locale.getSnapshot === "function") applyLocale(locale.getSnapshot());
            else if (typeof locale.getLocale === "function") applyLocale(locale.getLocale());
          } catch (_) {
            // 读不到就用兜底。
          }
        }

        const openSession = (id) => {
          const props = propsRef.current;
          if (props) {
            try {
              if (typeof props.openSession === "function") return props.openSession(id);
              if (typeof props.open === "function") return props.open(id);
            } catch (error) {
              console.warn("run-sessions: 打开会话失败", messageOf(error));
            }
          }
          try {
            const ui = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : null;
            if (ui && typeof ui.openSession === "function") return ui.openSession(id);
          } catch (error) {
            console.warn("run-sessions: 打开会话失败", messageOf(error));
          }
          return undefined;
        };

        // 从本页签点开的会话 id：im-connect 每次切换会话都会重算该停在哪一页，
        // 页签带了这个 matchSession 之后就不会把侧栏拽回「任务」。
        let stickySession = null;
        let stickyAt = 0;

        const openFromList = function (id) {
          stickySession = String(id);
          stickyAt = Date.now();
          openSession(id);
        };

        const Panel = createPanel(ctx, propsRef, openFromList, textStore, function clearSticky() {
          stickySession = null;
          stickyAt = 0;
        }, layoutStore);
        const render = function (props) { return React.createElement(Panel, props || {}); };
        const isStickySession = function (id) {
          if (stickySession === null) return false;
          // 正常情况 id 就是同一个；个别会话（子代理地址、频道会话等）会被宿主换成另一个 id，
          // 打开后的几秒内也认，避免刚点开就被拽回「任务」或「频道」。
          if (String(id) === stickySession) return true;
          return Date.now() - stickyAt < 5000;
        };

        const mounted = mountTab(ctx, render, textStore, {
          matchSession: isStickySession,
          isSticky: isStickySession,
        });

        // 用户在设置里换语言时，页签标题和面板文案一起跟着换。
        let unsubscribeLocale = null;
        if (locale && typeof locale.subscribe === "function") {
          try {
            unsubscribeLocale = locale.subscribe(function (snapshot) {
              applyLocale(snapshot);
              try { mounted.refresh(); } catch (_) { /* 忽略 */ }
            });
          } catch (_) {
            // 订阅失败只是语言不能实时切换。
          }
        }

        // 首次插入时如果语言还没就绪，等一拍再按最新文案补一次标题。
        setTimeout(function () { try { mounted.refresh(); } catch (_) { /* 忽略 */ } }, 800);

        return function () {
          if (typeof unsubscribeLocale === "function") {
            try { unsubscribeLocale(); } catch (_) { /* 忽略 */ }
          }
          mounted.stop();
        };
      } catch (error) {
        // 客户端插件初始化抛错会让整个页面启动失败，这里必须兜住。
        console.warn("run-sessions: 初始化失败，已跳过", messageOf(error));
        return function () {};
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.__test = {
      selectRows: selectRows,
      formatAgo: formatAgo,
      basename: basename,
      workspaceIndex: workspaceIndex,
      currentSessionId: currentSessionId,
      applyOrder: applyOrder,
      createLayoutStore: createLayoutStore,
      textsFor: textsFor,
    };

    return module.exports;
  },
});
