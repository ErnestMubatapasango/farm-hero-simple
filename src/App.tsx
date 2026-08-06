import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { RoleRoute } from "@/components/RoleRoute";
import { RequireOrg } from "@/components/RequireOrg";
import { AppLayout } from "@/components/AppLayout";
import { InstallPrompt } from "@/components/InstallPrompt";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import Profile from "./pages/Profile";
import Documents from "./pages/Documents";
import Analytics from "./pages/Analytics";
import CreditScore from "./pages/CreditScore";
import CreditScoreDetail from "./pages/CreditScoreDetail";
import Admin from "./pages/Admin";
import AdminFarmerDetail from "./pages/AdminFarmerDetail";
import AdminFarmers from "./pages/AdminFarmers";
import EditFarmer from "./pages/EditFarmer";
import AdminUsers from "./pages/AdminUsers";
import AdminRoles from "./pages/AdminRoles";
import AdminInvitations from "./pages/AdminInvitations";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import SetupOrganization from "./pages/SetupOrganization";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <InstallPrompt />
      <BrowserRouter>
        <AuthProvider>
          <CurrencyProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/setup-organization" element={<SetupOrganization />} />
              <Route element={<RequireOrg />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/admin/farmers" element={<AdminFarmers />} />
                <Route path="/admin/farmer/:userId" element={<AdminFarmerDetail />} />
                <Route path="/admin/farmer/:userId/edit" element={<EditFarmer />} />
                <Route element={<AdminRoute />}>
                  <Route path="/credit-score" element={<CreditScore />} />
                  <Route path="/credit-score/:farmerId" element={<CreditScoreDetail />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/admin/users" element={<AdminUsers />} />
                  <Route path="/admin/roles" element={<AdminRoles />} />
                </Route>
                <Route element={<RoleRoute allow={["super_admin", "developer"]} />}>
                  <Route path="/admin/invitations" element={<AdminInvitations />} />
                </Route>
              </Route>
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </CurrencyProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
