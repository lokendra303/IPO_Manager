import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { config } from '../config';
import { storage } from './storage';
import {
  clearCachedAuthToken,
  resolveAuthToken,
  setCachedAuthToken,
} from './tokenCache';

type AuthHandler = () => void;
let onUnauthorized: AuthHandler | null = null;

export function setClientUnauthorizedHandler(handler: AuthHandler | null) {
  onUnauthorized = handler;
}

export { setCachedAuthToken, clearCachedAuthToken };

const client = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 25000,
});

client.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
  const token = await resolveAuthToken();
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
  await new Promise((resolve) => setTimeout(resolve, 300));
  return client(cfg);
}

client.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    if (err.response?.status === 401) {
      clearCachedAuthToken();
      await storage.removeItem('token');
      await storage.removeItem('user');
      onUnauthorized?.();
      return Promise.reject(err);
    }
    return retryOnce(err);
  }
);

export default client;
