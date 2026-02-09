import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { apiClient, AnalysisStats, TrendData, ShiftStats } from '../api/client';
import { subDays, format } from 'date-fns';
import { LayoutDashboard, BarChart3, TrendingUp, Activity } from 'lucide-react';

const VIEW_IDS = ['overview', 'efficiency', 'quality', 'shift'] as const;
type ViewId = (typeof VIEW_IDS)[number];

export const Analysis: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const viewMatch = location.pathname.match(/^\/analysis\/(.+)$/);
  const activeView: ViewId = VIEW_IDS.includes((viewMatch?.[1] ?? '') as ViewId) ? (viewMatch![1] as ViewId) : 'overview';
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [shiftStats, setShiftStats] = useState<ShiftStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('30'); // '7', '30', '90'

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const end = new Date();
        const start = subDays(end, Number(dateRange));
        
        const startDate = format(start, 'yyyy-MM-dd');
        const endDate = format(end, 'yyyy-MM-dd');

        const [statsData, trendsData, shiftData] = await Promise.all([
          apiClient.getAnalysisStats(startDate, endDate),
          apiClient.getAnalysisTrends(startDate, endDate),
          apiClient.getAnalysisShifts(startDate, endDate)
        ]);

        setStats(statsData);
        setTrends(trendsData);
        setShiftStats(shiftData);
      } catch (err: any) {
        setError(err.message || '加载分析数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dateRange]);

  if (loading) return <div className="p-8 text-center text-slate-500">加载中...</div>;
  if (error) return <div className="p-8 text-center text-red-500">错误: {error}</div>;

  const menuItems: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: '综合概览', icon: LayoutDashboard },
    { id: 'efficiency', label: '生产效率', icon: Activity },
    { id: 'quality', label: '质量指标', icon: TrendingUp },
    { id: 'shift', label: '班次对比', icon: BarChart3 },
  ];

  return (
    <div className="flex h-full min-h-[calc(100vh-8rem)] bg-slate-50 -m-6 p-6">
      {/* Main Content Area */}
      <div className="flex-1 pr-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {menuItems.find(i => i.id === activeView)?.label}
          </h1>
          <div className="flex space-x-2 bg-white p-1 rounded-lg shadow-sm border border-slate-200">
            {['7', '30', '90', '180'].map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                近{range}天
              </button>
            ))}
          </div>
        </div>

        {/* Views */}
        {activeView === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard title="总处理量 (吨)" value={stats?.totalProcessed.toFixed(2)} />
              <KPICard title="平均铅回收率 (%)" value={stats?.avgPbRecovery.toFixed(2) + '%'} />
              <KPICard title="平均银回收率 (%)" value={stats?.avgAgRecovery.toFixed(2) + '%'} />
              <KPICard title="平均产率 (%)" value={stats?.avgYield.toFixed(2) + '%'} />
            </div>

            {/* Recovery Chart */}
            <ChartCard title="回收率趋势">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis domain={[80, 100]} tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend />
                <Line type="monotone" dataKey="pbRecovery" name="铅回收率" stroke="#2563eb" strokeWidth={3} dot={false} activeDot={{r: 6}} />
                <Line type="monotone" dataKey="agRecovery" name="银回收率" stroke="#16a34a" strokeWidth={3} dot={false} activeDot={{r: 6}} />
              </LineChart>
            </ChartCard>

            {/* Grade Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">原矿品位趋势</h3>
              <p className="text-sm text-slate-500 mb-6">红色：原矿铅 (%)，蓝色：原矿银 (g/t)</p>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="rawPb" name="原矿铅 (%)" stroke="#dc2626" strokeWidth={3} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="rawAg" name="原矿银 (g/t)" stroke="#2563eb" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeView === 'efficiency' && (
          <div className="space-y-6">
             <ChartCard title="每日处理量趋势 (吨)">
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend />
                <Bar dataKey="processedWeight" name="处理量 (吨)" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ChartCard>
          </div>
        )}

        {activeView === 'quality' && (
          <div className="space-y-6">
            <ChartCard title="精矿品位趋势">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="concPb" name="精矿铅 (%)" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="concAg" name="精矿银 (g/t)" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartCard>
            
            <ChartCard title="尾矿品位趋势">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="tailPb" name="尾矿铅 (%)" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="tailAg" name="尾矿银 (g/t)" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartCard>
          </div>
        )}

        {activeView === 'shift' && (
          <div className="space-y-6">
            <ChartCard title="各班次平均回收率对比">
              <BarChart data={shiftStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="shiftType" />
                <YAxis domain={[80, 100]} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Legend />
                <Bar dataKey="pbRecovery" name="铅回收率" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="agRecovery" name="银回收率" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="各班次平均处理量对比">
              <BarChart data={shiftStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="shiftType" />
                <YAxis />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Legend />
                <Bar dataKey="avgProcessed" name="平均处理量 (吨)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          </div>
        )}
      </div>

      {/* Right Sidebar Menu */}
      <div className="w-64 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">分析维度</h2>
          <p className="text-sm text-slate-500 mt-1">选择查看不同维度的数据报表</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(`/analysis/${item.id}`)}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  activeView === item.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`mr-3 h-5 w-5 ${activeView === item.id ? 'text-blue-600' : 'text-slate-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

const KPICard = ({ title, value }: { title: string; value: string | undefined }) => (
  <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-slate-200 hover:shadow-md transition-shadow">
    <div className="px-5 py-6">
      <dt className="text-sm font-medium text-slate-500 truncate">{title}</dt>
      <dd className="mt-2 text-3xl font-bold text-slate-900 tracking-tight">{value || '-'}</dd>
    </div>
  </div>
);

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
    <h3 className="text-lg font-semibold text-slate-900 mb-6">{title}</h3>
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as any}
      </ResponsiveContainer>
    </div>
  </div>
);
