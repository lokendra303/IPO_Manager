import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import client, { setClientUnauthorizedHandler } from '../api/client';
import { storage } from '../api/storage';

export type User = {
  id: number;
  email?: string;
  role: string;
  tenantId?: number;
  tenantName?: string;
  displayName?: string;
  pan?: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<unknown>;
  memberLogin: (pan: string) => Promise<unknown>;
  register: (email: string, password: string, tenantName: string) => Promise<unknown>;
  logout: () => Promise<void>;
  setSessionUser: (userData: User) => Promise<void>;
  refreshUser: () => Promise<User>;
  isAuthenticated: boolean;
  isMember: boolean;
  isManager: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setClientUnauthorizedHandler(() => {
      setUser(null);
      router.replace('/(auth)/login');
    });
    return () => setClientUnauthorizedHandler(null);
  }, [router]);

  useEffect(() => {
    (async () => {
      const token = await storage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const stored = await storage.getItem('user');
        if (stored) setUser(JSON.parse(stored));
        const { data } = await client.get('/auth/me');
        setUser(data);
        await storage.setItem('user', JSON.stringify(data));
      } catch {
        await storage.removeItem('token');
        await storage.removeItem('user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await client.post('/auth/login', { email, password });
    await storage.setItem('token', data.token);
    await storage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const memberLogin = async (pan: string) => {
    const { data } = await client.post('/auth/member-login', { pan });
    await storage.setItem('token', data.token);
    await storage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const register = async (email: string, password: string, tenantName: string) => {
    const { data } = await client.post('/auth/register', { email, password, tenantName });
    if (!data.pending) {
      await storage.setItem('token', data.token);
      await storage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
    }
    return data;
  };

  const logout = async () => {
    await storage.removeItem('token');
    await storage.removeItem('user');
    setUser(null);
  };

  const setSessionUser = async (userData: User) => {
    setUser(userData);
    await storage.setItem('user', JSON.stringify(userData));
  };

  const refreshUser = async () => {
    const { data } = await client.get('/auth/me');
    await setSessionUser(data);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        memberLogin,
        register,
        logout,
        setSessionUser,
        refreshUser,
        isAuthenticated: !!user,
        isMember: user?.role === 'member',
        isManager: !!user && user.role !== 'member',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
