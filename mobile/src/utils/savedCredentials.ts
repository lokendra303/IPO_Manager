import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { storage } from '../api/storage';

export type SavedMemberCreds = { pan: string };
export type SavedPasswordCreds = { email: string; password: string };

type Role = 'member' | 'manager' | 'admin';

const KEYS = {
  member: 'ipo.saved.member',
  manager: 'ipo.saved.manager',
  admin: 'ipo.saved.admin',
} as const;

async function canUseSecureStore(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function writeSecret(key: string, value: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await storage.setItem(key, value);
}

async function readSecret(key: string): Promise<string | null> {
  if (await canUseSecureStore()) {
    return SecureStore.getItemAsync(key);
  }
  return storage.getItem(key);
}

async function deleteSecret(key: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await storage.removeItem(key);
}

export async function loadSavedCredentials(role: 'member'): Promise<SavedMemberCreds | null>;
export async function loadSavedCredentials(role: 'manager' | 'admin'): Promise<SavedPasswordCreds | null>;
export async function loadSavedCredentials(
  role: Role
): Promise<SavedMemberCreds | SavedPasswordCreds | null> {
  try {
    const raw = await readSecret(KEYS[role]);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (role === 'member') {
      const pan = String(parsed?.pan || '').trim().toUpperCase();
      return pan ? { pan } : null;
    }
    const email = String(parsed?.email || '').trim();
    const password = String(parsed?.password || '');
    return email && password ? { email, password } : null;
  } catch {
    return null;
  }
}

export async function saveMemberCredentials(pan: string): Promise<void> {
  await writeSecret(KEYS.member, JSON.stringify({ pan: pan.trim().toUpperCase() }));
}

export async function savePasswordCredentials(
  role: 'manager' | 'admin',
  email: string,
  password: string
): Promise<void> {
  await writeSecret(
    KEYS[role],
    JSON.stringify({ email: email.trim(), password })
  );
}

export async function clearSavedCredentials(role: Role): Promise<void> {
  await deleteSecret(KEYS[role]);
}
