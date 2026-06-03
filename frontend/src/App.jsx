import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PageLoading from './components/PageLoading';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';
import MemberLayout from './components/MemberLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MembersPage from './pages/MembersPage';
import FundProvidersPage from './pages/FundProvidersPage';
import WalletPage from './pages/WalletPage';
import IposPage from './pages/IposPage';
import IpoDetailPage from './pages/IpoDetailPage';
import SummaryPage from './pages/SummaryPage';
import SettingsPage from './pages/SettingsPage';
import ProfitSharingPage from './pages/ProfitSharingPage';
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
      <Route path="/audit-log" element={<ManagerRoute><AuditLogPage /></ManagerRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
