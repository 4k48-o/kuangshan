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
import { YearlyReport } from './pages/YearlyReport';
import { WeighingUpload } from './pages/WeighingUpload';
import { WeighingHistory } from './pages/WeighingHistory';
import { WeighingMonthlyReport } from './pages/WeighingMonthlyReport';
import { Customers } from './pages/Customers';
import { SalesAssayUpload } from './pages/SalesAssayUpload';
import { SalesAssayHistory } from './pages/SalesAssayHistory';
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
                    <Route path="/yearly-report" element={<YearlyReport />} />
                    <Route path="/weighing/upload" element={<WeighingUpload />} />
                    <Route path="/weighing/history" element={<WeighingHistory />} />
                    <Route path="/weighing/monthly-report" element={<WeighingMonthlyReport />} />
                    <Route path="/customers" element={<Customers />} />
                    <Route path="/sales-assay/upload" element={<SalesAssayUpload />} />
                    <Route path="/sales-assay/history" element={<SalesAssayHistory />} />
                    <Route path="/analysis" element={<Navigate to="/analysis/overview" replace />} />
                    <Route path="/analysis/overview" element={<Analysis />} />
                    <Route path="/analysis/efficiency" element={<Analysis />} />
                    <Route path="/analysis/quality" element={<Analysis />} />
                    <Route path="/analysis/shift" element={<Analysis />} />
                    <Route path="/analysis/metal-balance" element={<Analysis />} />
                    <Route path="/analysis/sales-data" element={<Analysis />} />
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
