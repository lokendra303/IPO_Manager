import axios from 'axios';
import { config } from '../config.js';

const adminClient = axios.create({
  baseURL: config.apiBaseUrl,
});

adminClient.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('adminToken');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

async function retryOnce(err) {
  const config = err.config;
  if (!config || config.__retryCount) return Promise.reject(err);

  const status = err.response?.status;
  const transient = !status || status >= 500 || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED';
  if (!transient) return Promise.reject(err);

  config.__retryCount = 1;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return adminClient(config);
}

adminClient.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      if (!window.location.pathname.includes('/admin/login')) {
        window.location.href = '/admin/login';
      }
      return Promise.reject(err);
    }
    return retryOnce(err);
  }
);

export default adminClient;
