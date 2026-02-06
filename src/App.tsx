import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DataEntry } from './pages/DataEntry';
import { MetalBalance } from './pages/MetalBalance';
import { History } from './pages/History';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<DataEntry />} />
          <Route path="/balance" element={<MetalBalance />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
