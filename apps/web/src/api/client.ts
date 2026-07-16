import axios from 'axios';
import { showError, extractErrorMessage, handleAuthExpired } from '../utils/feedback';

const http = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (response) => {
    const body = response.data;
    // HTTP 200 但业务层报错（code !== 0）：统一弹提示后 reject，
    // 让调用方仍可在 catch 里做局部处理（关 loading、回滚 UI 等）。
    if (body && typeof body === 'object' && body.code !== 0) {
      const msg = typeof body.message === 'string' && body.message
        ? body.message
        : '操作失败';
      showError(msg);
      return Promise.reject(new Error(msg));
    }
    return body;
  },
  (error) => {
    if (error.response?.status === 401) {
      // 401：提示 + 清 token + 跳登录
      handleAuthExpired(extractErrorMessage(error, '登录已过期，请重新登录'));
    } else {
      // 其余 HTTP 错误 / 网络错误 / 超时：统一提示，避免用户面对无反馈的空页面
      showError(extractErrorMessage(error));
    }
    return Promise.reject(error);
  }
);

// ── Response type ──────────────────────────────────────────────────

/** Shape of the API envelope after the response interceptor transforms it. */
interface ApiEnvelope<T = any> {
  code: number;
  message: string;
  data: T;
  total?: number;
  page?: number;
  page_size?: number;
}

// Typed wrapper around the interceptor-transformed http client
// The interceptor returns the JSON body (ApiEnvelope), so the promise resolves to it.
function get<T = any>(url: string, config?: any): Promise<ApiEnvelope<T>> {
  return http.get(url, config) as unknown as Promise<ApiEnvelope<T>>;
}

function post<T = any>(url: string, data?: any, config?: any): Promise<ApiEnvelope<T>> {
  return http.post(url, data, config) as unknown as Promise<ApiEnvelope<T>>;
}

function patch<T = any>(url: string, data?: any, config?: any): Promise<ApiEnvelope<T>> {
  return http.patch(url, data, config) as unknown as Promise<ApiEnvelope<T>>;
}

function del<T = any>(url: string, config?: any): Promise<ApiEnvelope<T>> {
  return http.delete(url, config) as unknown as Promise<ApiEnvelope<T>>;
}

const api = { get, post, patch, delete: del };
export default api;
