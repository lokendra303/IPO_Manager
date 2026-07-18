import { storage } from './storage';

let memoryToken: string | null | undefined;
let memoryAdminToken: string | null | undefined;

export function getCachedAuthToken(): string | null | undefined {
  return memoryToken;
}

export function setCachedAuthToken(token: string | null) {
  memoryToken = token;
}

export async function resolveAuthToken(): Promise<string | null> {
  if (memoryToken !== undefined) return memoryToken;
  memoryToken = await storage.getItem('token');
  return memoryToken;
}

export function getCachedAdminToken(): string | null | undefined {
  return memoryAdminToken;
}

export function setCachedAdminToken(token: string | null) {
  memoryAdminToken = token;
}

export async function resolveAdminToken(): Promise<string | null> {
  if (memoryAdminToken !== undefined) return memoryAdminToken;
  memoryAdminToken = await storage.getItem('adminToken');
  return memoryAdminToken;
}

export function clearCachedAuthToken() {
  memoryToken = null;
}

export function clearCachedAdminToken() {
  memoryAdminToken = null;
}
