import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { config } from '../config';
import { storage } from './storage';

type AuthHandler = () => void;
let onUnauthorized: AuthHandler | null = null;

export function setAdminUnauthorizedHandler(handler: AuthHandler | null) {
  onUnauthorized = handler;
}

const adminClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 30000,
});

adminClient.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
  const token = await storage.getItem('adminToken');
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

async function retryOnce(err: AxiosError) {
  const cfg = err.config as InternalAxiosRequestConfig & { __retryCount?: number };
  if (!cfg || cfg.__retryCount) return Promise.reject(err);

  const status = err.response?.status;
  const transient =
    !status || status >= 500 || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED';
  if (!transient) return Promise.reject(err);

  cfg.__retryCount = 1;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return adminClient(cfg);
}

adminClient.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    if (err.response?.status === 401) {
      await storage.removeItem('adminToken');
      await storage.removeItem('adminUser');
      onUnauthorized?.();
      return Promise.reject(err);
    }
    return retryOnce(err);
  }
);

export default adminClient;
