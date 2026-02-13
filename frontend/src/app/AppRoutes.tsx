import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import ProtectedRoute from '@/components/ProtectedRoute';

const Home = lazy(() => import('../pages/Home'));
const About = lazy(() => import('../pages/About'));
const NotFound = lazy(() => import('../pages/NotFound'));
const Projects = lazy(() => import('../pages/projects/Projects'));
const ProjectDetails = lazy(() => import('../pages/projects/ProjectDetails'));
const Environments = lazy(() => import('../pages/environments/Environments'));
const EnvironmentDetails = lazy(() => import('../pages/environments/EnvironmentDetails'));
const Services = lazy(() => import('../pages/services/Services'));
const ServiceDetails = lazy(() => import('../pages/services/ServiceDetails'));
const Tables = lazy(() => import('../pages/dashboard/Tables'));
const Billing = lazy(() => import('../pages/dashboard/Billing'));
const Profile = lazy(() => import('../pages/dashboard/Profile'));
const SignIn = lazy(() => import('../pages/auth/SignIn'));
const SignUp = lazy(() => import('../pages/auth/SignUp'));
const OAuthCallback = lazy(() => import('../pages/auth/OAuthCallback'));
const LogoutSuccess = lazy(() => import('../pages/auth/LogoutSuccess'));
const RTLPage = lazy(() => import('../pages/rtl/RTLPage'));
const Admin = lazy(() => import('../pages/admin/Admin'));

export default function AppRoutes() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route element={<Layout />}>
          {/* Public routes - no authentication required */}
          <Route path="/auth/signin" element={<SignIn />} />
          <Route path="/auth/signup" element={<SignUp />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/auth/logout-success" element={<LogoutSuccess />} />
          
          {/* Protected routes - require authentication */}
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/about" element={<ProtectedRoute><About /></ProtectedRoute>} />
          <Route path="/tables" element={<ProtectedRoute><Tables /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/rtl" element={<ProtectedRoute><RTLPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/projects/:projectId" element={<ProtectedRoute><ProjectDetails /></ProtectedRoute>} />
          <Route path="/environments" element={<ProtectedRoute><Environments /></ProtectedRoute>} />
          <Route path="/environments/:environmentId" element={<ProtectedRoute><EnvironmentDetails /></ProtectedRoute>} />
          <Route path="/services" element={<ProtectedRoute><Services /></ProtectedRoute>} />
          <Route path="/services/:serviceId" element={<ProtectedRoute><ServiceDetails /></ProtectedRoute>} />
          <Route path="*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
