import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PageLoading from './components/PageLoading';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import AppLayout from './components/AppLayout';
import MemberLayout from './components/MemberLayout';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminForgotPasswordPage from './pages/AdminForgotPasswordPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminRegistrationsPage from './pages/AdminRegistrationsPage';
import AdminTenantDetailPage from './pages/AdminTenantDetailPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AdminAuditLogPage from './pages/AdminAuditLogPage';
import DashboardPage from './pages/DashboardPage';
import MembersPage from './pages/MembersPage';
import FundProvidersPage from './pages/FundProvidersPage';
import WalletPage from './pages/WalletPage';
import IposPage from './pages/IposPage';
import IpoDetailPage from './pages/IpoDetailPage';
import SummaryPage from './pages/SummaryPage';
import SettingsPage from './pages/SettingsPage';
import ProfitSharingPage from './pages/ProfitSharingPage';
import ProfitAnalysisPage from './pages/ProfitAnalysisPage';
import MemberPortalPage from './pages/MemberPortalPage';
import NotificationsPage from './pages/NotificationsPage';
import MemberGroupsPage from './pages/MemberGroupsPage';
import AuditLogPage from './pages/AuditLogPage';

function ManagerRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <PageLoading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'member') return <Navigate to="/portal" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function MemberRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <PageLoading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'member') return <Navigate to="/" replace />;
  return <MemberLayout>{children}</MemberLayout>;
}

function AdminRoute({ children }) {
  const { isAdminAuthenticated, loading } = useAdminAuth();
  if (loading) return <PageLoading />;
  if (!isAdminAuthenticated) return <Navigate to="/admin/login" replace />;
  return <AdminLayout>{children}</AdminLayout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/forgot-password" element={<AdminForgotPasswordPage />} />
      <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
      <Route path="/admin/registrations" element={<AdminRoute><AdminRegistrationsPage /></AdminRoute>} />
      <Route path="/admin/tenants/:id" element={<AdminRoute><AdminTenantDetailPage /></AdminRoute>} />
      <Route path="/admin/audit-log" element={<AdminRoute><AdminAuditLogPage /></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<Navigate to="/forgot-password" replace />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/portal" element={<MemberRoute><MemberPortalPage /></MemberRoute>} />
      <Route path="/" element={<ManagerRoute><DashboardPage /></ManagerRoute>} />
      <Route path="/notifications" element={<ManagerRoute><NotificationsPage /></ManagerRoute>} />
      <Route path="/members" element={<ManagerRoute><MembersPage /></ManagerRoute>} />
      <Route path="/member-groups" element={<ManagerRoute><MemberGroupsPage /></ManagerRoute>} />
      <Route path="/fund-providers" element={<ManagerRoute><FundProvidersPage /></ManagerRoute>} />
      <Route path="/wallet" element={<ManagerRoute><WalletPage /></ManagerRoute>} />
      <Route path="/ipos" element={<ManagerRoute><IposPage /></ManagerRoute>} />
      <Route path="/ipos/:id" element={<ManagerRoute><IpoDetailPage /></ManagerRoute>} />
      <Route path="/summary" element={<ManagerRoute><SummaryPage /></ManagerRoute>} />
      <Route path="/settings" element={<ManagerRoute><SettingsPage /></ManagerRoute>} />
      <Route path="/profit-sharing" element={<ManagerRoute><ProfitSharingPage /></ManagerRoute>} />
      <Route path="/profit-analysis" element={<ManagerRoute><ProfitAnalysisPage /></ManagerRoute>} />
      <Route path="/audit-log" element={<ManagerRoute><AuditLogPage /></ManagerRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AdminAuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AdminAuthProvider>
    </AuthProvider>
  );
}
