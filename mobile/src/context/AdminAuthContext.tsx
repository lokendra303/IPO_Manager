import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import adminClient, { setAdminUnauthorizedHandler, setCachedAdminToken } from '../api/adminClient';
import { storage } from '../api/storage';
import { clearCachedAdminToken } from '../api/tokenCache';

export type AdminUser = {
  id: number;
  email: string;
};

type AdminAuthContextValue = {
  admin: AdminUser | null;
  loading: boolean;
  adminLogin: (email: string, password: string) => Promise<unknown>;
  adminLogout: () => Promise<void>;
  setAdmin: (adminData: AdminUser) => Promise<void>;
  isAdminAuthenticated: boolean;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [admin, setAdminState] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAdminUnauthorizedHandler(() => {
      clearCachedAdminToken();
      setAdminState(null);
      router.replace('/(admin-auth)/login');
    });
    return () => setAdminUnauthorizedHandler(null);
  }, [router]);

  useEffect(() => {
    (async () => {
      const token = await storage.getItem('adminToken');
      if (!token) {
        setCachedAdminToken(null);
        setLoading(false);
        return;
      }
      setCachedAdminToken(token);
      try {
        const stored = await storage.getItem('adminUser');
        if (stored) setAdminState(JSON.parse(stored));
        const { data } = await adminClient.get('/admin/auth/me');
        setAdminState(data);
        await storage.setItem('adminUser', JSON.stringify(data));
      } catch {
        clearCachedAdminToken();
        await storage.removeItem('adminToken');
        await storage.removeItem('adminUser');
        setAdminState(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const adminLogin = async (email: string, password: string) => {
    const { data } = await adminClient.post('/admin/auth/login', { email, password });
    setCachedAdminToken(data.token);
    await storage.setItem('adminToken', data.token);
    await storage.setItem('adminUser', JSON.stringify(data.user));
    setAdminState(data.user);
    return data;
  };

  const adminLogout = async () => {
    clearCachedAdminToken();
    await storage.removeItem('adminToken');
    await storage.removeItem('adminUser');
    setAdminState(null);
  };

  const setAdmin = async (adminData: AdminUser) => {
    setAdminState(adminData);
    await storage.setItem('adminUser', JSON.stringify(adminData));
  };

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        loading,
        adminLogin,
        adminLogout,
        setAdmin,
        isAdminAuthenticated: !!admin,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
};
