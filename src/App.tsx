import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { DataEntry } from './pages/DataEntry';
import { MetalBalance } from './pages/MetalBalance';
import { Analysis } from './pages/Analysis';
import { DailyReport } from './pages/DailyReport';
import { MonthlyReport } from './pages/MonthlyReport';
import { ComingSoon } from './pages/ComingSoon';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<DataEntry />} />
                    <Route path="/balance" element={<MetalBalance />} />
                    <Route path="/daily-report" element={<DailyReport />} />
                    <Route path="/monthly-report" element={<MonthlyReport />} />
                    <Route path="/yearly-report" element={<ComingSoon title="年报表" />} />
                    <Route path="/analysis" element={<Navigate to="/analysis/overview" replace />} />
                    <Route path="/analysis/overview" element={<Analysis />} />
                    <Route path="/analysis/efficiency" element={<Analysis />} />
                    <Route path="/analysis/quality" element={<Analysis />} />
                    <Route path="/analysis/shift" element={<Analysis />} />
                    <Route path="/system" element={<ComingSoon title="系统设计" />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
