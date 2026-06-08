import { createContext, useContext, useEffect, useState } from 'react';
import adminClient from '../api/adminClient';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    const stored = localStorage.getItem('adminUser');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(!!localStorage.getItem('adminToken'));

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      setLoading(false);
      return;
    }
    adminClient
      .get('/admin/auth/me')
      .then((res) => {
        setAdmin(res.data);
        localStorage.setItem('adminUser', JSON.stringify(res.data));
      })
      .catch(() => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        setAdmin(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const adminLogin = async (email, password) => {
    const { data } = await adminClient.post('/admin/auth/login', { email, password });
    localStorage.setItem('adminToken', data.token);
    localStorage.setItem('adminUser', JSON.stringify(data.user));
    setAdmin(data.user);
    return data;
  };

  const adminLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setAdmin(null);
  };

  const setAdminSession = (adminData) => {
    setAdmin(adminData);
    localStorage.setItem('adminUser', JSON.stringify(adminData));
  };

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        loading,
        adminLogin,
        adminLogout,
        setAdmin: setAdminSession,
        isAdminAuthenticated: !!admin,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
