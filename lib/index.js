/**
 * dsh-run-sessions（宿主侧）
 *
 * 只提供一个只读接口，用来告诉页面「这次 DSH 是什么时候启动的」：
 *   GET /api/dsh-run-sessions/state -> { startedAt, now, pid }
 *
 * 页面用它把「本次启动之后还在更新的会话」筛出来，其余什么都不接管。
 *
 * @module dsh-run-sessions
 */

const ROUTE = "/api/dsh-run-sessions/state";

/** 模块被宿主 import 的时刻就是这个进程的启动时刻（插件随 profile 一起启动）。 */
const STARTED_AT = Date.now();

export const name = "dsh-run-sessions";

/** 只需要本机 Web 服务，不要别的服务。 */
export const inject = ["webServer"];

export function apply(ctx) {
  try {
    const unregister = ctx.webServer.register({
      kind: "exact",
      path: ROUTE,
      handler: (request, response) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { allow: "GET, HEAD", "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "method not allowed" }));
          return;
        }
        const body = JSON.stringify({ startedAt: STARTED_AT, now: Date.now(), pid: process.pid });
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        if (request.method === "HEAD") response.end();
        else response.end(body);
      },
    });
    ctx.logger?.debug?.("run-sessions: 本次启动时间 " + new Date(STARTED_AT).toISOString());
    return typeof unregister === "function" ? unregister : () => {};
  } catch (error) {
    // 宿主侧抛错会让整个 web 启动失败，所以这里一律吞掉：最坏只是页签显示"正在读取"。
    ctx.logger?.warn?.("run-sessions: 注册接口失败，已跳过：" + String(error && error.message ? error.message : error));
    return () => {};
  }
}
