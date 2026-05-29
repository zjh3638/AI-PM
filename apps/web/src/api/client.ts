import axios from 'axios';

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
    if (body.code !== 0) return Promise.reject(new Error(body.message));
    return body;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Typed wrapper around the interceptor-transformed http client
function get<T = any>(url: string, config?: any): Promise<T> {
  return http.get(url, config) as any;
}

function post<T = any>(url: string, data?: any, config?: any): Promise<T> {
  return http.post(url, data, config) as any;
}

function patch<T = any>(url: string, data?: any, config?: any): Promise<T> {
  return http.patch(url, data, config) as any;
}

function del<T = any>(url: string, config?: any): Promise<T> {
  return http.delete(url, config) as any;
}

const api = { get, post, patch, delete: del };
export default api;
