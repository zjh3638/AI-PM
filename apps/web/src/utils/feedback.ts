import { App as AntdApp, message as staticMessage } from 'antd';
import { useAuthStore } from '../stores/authStore';

/**
 * 全局用户反馈层。
 *
 * 设计目的：
 * - 提供统一的 showError / showSuccess / showWarning / showInfo，
 *   在 axios 拦截器（非组件环境）里也能安全调用；
 * - extractErrorMessage 兼容后端多种错误响应格式：
 *     1. 业务错误 AppException      → { code, message, data }
 *     2. ai.py 的 HTTPException      → { detail: "..." }
 *     3. FastAPI 422 校验错误        → { detail: [{ msg, loc }, ...] }
 *     4. 网络错误 / 超时 / 5xx 兜底
 * - handleAuthExpired 统一处理 401（提示 + 清 token + 跳登录）。
 *
 * holder 模式：App.tsx 挂载时通过 useApp() 拿到带主题上下文的 message 实例
 * 注入进来；应用未挂载或实例尚未就绪时回退到 antd 静态 message。
 */

type MessageApi = ReturnType<typeof AntdApp.useApp>['message'];

let holderMessage: MessageApi | null = null;

/** 由 App 组件在挂载时注入 useApp() 返回的 message 实例。 */
export function setMessageInstance(instance: MessageApi | null) {
  holderMessage = instance;
}

function getInstance(): MessageApi {
  return holderMessage ?? staticMessage;
}

export function showError(content: string, duration = 3) {
  getInstance().error(content, duration);
}

export function showSuccess(content: string, duration = 2) {
  getInstance().success(content, duration);
}

export function showWarning(content: string, duration = 3) {
  getInstance().warning(content, duration);
}

export function showInfo(content: string, duration = 3) {
  getInstance().info(content, duration);
}

/**
 * 401 统一处理：提示 → 清 token → 跳登录页。
 * 留出短暂延时让 toast 先渲染，避免被硬跳转立刻打断。
 */
export function handleAuthExpired(reason = '登录已过期，请重新登录') {
  showError(reason);
  if (!window.location.pathname.startsWith('/login')) {
    setTimeout(() => {
      useAuthStore.getState().logout();
    }, 600);
  }
}

/**
 * 从任意错误对象中提取面向用户的中文错误信息。
 * 兼容 axios HTTP 错误、业务层 reject 的 Error、网络错误与超时。
 */
export function extractErrorMessage(error: any, fallback = '操作失败，请稍后重试'): string {
  if (!error) return fallback;

  const code = error.code;
  const rawMsg = typeof error.message === 'string' ? error.message : '';

  // 网络中断（无 response）
  if (code === 'ERR_NETWORK' || rawMsg === 'Network Error') {
    return '网络连接失败，请检查网络后重试';
  }
  // 超时
  if (code === 'ECONNABORTED' || /timeout/i.test(rawMsg)) {
    return '请求超时，请稍后重试';
  }

  const resp = error.response;
  if (resp) {
    const data = resp.data;
    if (data && typeof data === 'object') {
      // 业务错误 { code, message }
      if (typeof data.message === 'string' && data.message) {
        return data.message;
      }
      // HTTPException { detail: "..." }
      if (typeof data.detail === 'string' && data.detail) {
        return data.detail;
      }
      // 422 校验错误 { detail: [{ msg, loc }, ...] }
      if (Array.isArray(data.detail) && data.detail.length) {
        const first = data.detail[0] || {};
        const field = Array.isArray(first.loc)
          ? first.loc.filter((x: any) => typeof x === 'string').join('.')
          : '';
        const msg: string = first.msg || '';
        if (field && msg) return `${field}: ${msg}`;
        return msg || fallback;
      }
    }

    // 按状态码兜底
    const status = resp.status;
    if (status >= 500) return '服务器开小差了，请稍后重试';
    if (status === 404) return '请求的资源不存在';
    if (status === 403) return '没有权限执行此操作';
    if (status === 401) return '登录已过期，请重新登录';
    if (status === 400) return '请求参数有误';
  }

  // 纯 Error / 业务层 reject 的 Error
  if (rawMsg) return rawMsg;
  return fallback;
}
