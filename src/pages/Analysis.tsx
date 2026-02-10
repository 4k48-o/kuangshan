import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { apiClient, AnalysisStats, TrendData, ShiftStats } from '../api/client';
import type {
  MetalBalanceSummaryItem,
  MetalBalanceTrendItem,
  MetalBalanceShiftStats,
  MetalBalanceDistributionItem,
  MetalBalanceStability,
  MetalBalancePeriodCompare,
} from '../api/client';
import { subDays, format } from 'date-fns';
import { LayoutDashboard, BarChart3, TrendingUp, Activity, Scale, Download, Package } from 'lucide-react';

const VIEW_IDS = ['overview', 'efficiency', 'quality', 'shift', 'metal-balance', 'sales-data'] as const;
type ViewId = (typeof VIEW_IDS)[number];

export const Analysis: React.FC = () => {
  const location = useLocation();
  const viewMatch = location.pathname.match(/^\/analysis\/(.+)$/);
  const activeView: ViewId = VIEW_IDS.includes((viewMatch?.[1] ?? '') as ViewId) ? (viewMatch![1] as ViewId) : 'overview';
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [shiftStats, setShiftStats] = useState<ShiftStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('30'); // '7', '30', '90'

  const [mbSummary, setMbSummary] = useState<MetalBalanceSummaryItem[]>([]);
  const [mbTrends, setMbTrends] = useState<MetalBalanceTrendItem[]>([]);
  const [mbShifts, setMbShifts] = useState<MetalBalanceShiftStats[]>([]);
  const [mbDistribution, setMbDistribution] = useState<MetalBalanceDistributionItem[]>([]);
  const [mbStability, setMbStability] = useState<MetalBalanceStability | null>(null);
  const [mbPeriodCompare, setMbPeriodCompare] = useState<MetalBalancePeriodCompare | null>(null);
  const [mbLoading, setMbLoading] = useState(false);
  const [mbError, setMbError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [salesByTime, setSalesByTime] = useState<Array<{ period: string; reportCount: number; vehicleCount: number; dryWeightSum: number; pbMetalSum: number; znMetalSum: number; cuMetalSum: number; agKgSum: number }>>([]);
  const [salesByCustomer, setSalesByCustomer] = useState<Array<{ customerId: string | null; customerName: string; customerCode: string; reportCount: number; vehicleCount: number; dryWeightSum: number; pbMetalSum: number; znMetalSum: number; cuMetalSum: number; agKgSum: number }>>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

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

  useEffect(() => {
    if (activeView !== 'sales-data') return;
    setSalesError(null);
    setSalesLoading(true);
    const end = new Date();
    const start = subDays(end, Number(dateRange));
    const startDate = format(start, 'yyyy-MM-dd');
    const endDate = format(end, 'yyyy-MM-dd');
    apiClient.getSalesAssayAnalysis({ startDate, endDate })
      .then((data) => {
        setSalesByTime(data.byTime);
        setSalesByCustomer(data.byCustomer);
      })
      .catch((err: any) => setSalesError(err?.message || '加载销售分析失败'))
      .finally(() => setSalesLoading(false));
  }, [activeView, dateRange]);

  useEffect(() => {
    if (activeView !== 'metal-balance') return;
    const fetchMb = async () => {
      setMbError(null);
      setMbLoading(true);
      const end = new Date();
      const start = subDays(end, Number(dateRange));
      const startDate = format(start, 'yyyy-MM-dd');
      const endDate = format(end, 'yyyy-MM-dd');
      try {
        const [summary, trendsData, shiftsData, distData, stabilityData, periodData] = await Promise.all([
          apiClient.getMetalBalanceSummary(startDate, endDate, 'day'),
          apiClient.getMetalBalanceTrends(startDate, endDate),
          apiClient.getMetalBalanceShifts(startDate, endDate),
          apiClient.getMetalBalanceDistribution(startDate, endDate, Number(dateRange) > 60 ? 'month' : 'day'),
          apiClient.getMetalBalanceStability(startDate, endDate),
          apiClient.getMetalBalancePeriodCompare(endDate, 'month', 'month_over_month'),
        ]);
        setMbSummary(summary);
        setMbTrends(trendsData);
        setMbShifts(shiftsData);
        setMbDistribution(distData);
        setMbStability(stabilityData);
        setMbPeriodCompare(periodData);
      } catch (err: any) {
        setMbError(err.message || '加载金属平衡分析失败');
      } finally {
        setMbLoading(false);
      }
    };
    fetchMb();
  }, [activeView, dateRange]);

  if (activeView !== 'metal-balance' && activeView !== 'sales-data' && loading) return <div className="p-8 text-center text-slate-500">加载中...</div>;
  if (activeView !== 'metal-balance' && activeView !== 'sales-data' && error) return <div className="p-8 text-center text-red-500">错误: {error}</div>;
  if (activeView === 'metal-balance' && mbLoading) return <div className="p-8 text-center text-slate-500">加载金属平衡数据中...</div>;
  if (activeView === 'metal-balance' && mbError) return <div className="p-8 text-center text-red-500">错误: {mbError}</div>;
  if (activeView === 'sales-data' && salesLoading) return <div className="p-8 text-center text-slate-500">加载销售分析中...</div>;
  if (activeView === 'sales-data' && salesError) return <div className="p-8 text-center text-red-500">错误: {salesError}</div>;

  const menuItems: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: '综合概览', icon: LayoutDashboard },
    { id: 'efficiency', label: '生产效率', icon: Activity },
    { id: 'quality', label: '质量指标', icon: TrendingUp },
    { id: 'shift', label: '班次对比', icon: BarChart3 },
    { id: 'metal-balance', label: '金属平衡分析', icon: Scale },
    { id: 'sales-data', label: '销售数据分析', icon: Package },
  ];

  return (
    <div className="flex h-full min-h-[calc(100vh-8rem)] bg-slate-50 -m-6 p-6">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {menuItems.find(i => i.id === activeView)?.label}
          </h1>
          <div className="flex space-x-2 bg-white p-1 rounded-lg shadow-sm border border-slate-200">
            {['7', '30', '90', '180', '365'].map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {range === '365' ? '近一年' : `近${range}天`}
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

        {activeView === 'metal-balance' && (
          <div className="space-y-6">
            {/* 金属平衡 KPI + 同比环比 */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard title="总处理量 (吨)" value={mbSummary.length ? mbSummary.reduce((s, i) => s + i.dryWeightRaw, 0).toFixed(2) : '-'} />
              <KPICard title="平均铅回收率 (%)" value={mbSummary.length ? (mbSummary.reduce((s, i) => s + i.pbRecovery * i.count, 0) / mbSummary.reduce((s, i) => s + i.count, 0)).toFixed(2) + '%' : '-'} />
              <KPICard title="平均银回收率 (%)" value={mbSummary.length ? (mbSummary.reduce((s, i) => s + i.agRecovery * i.count, 0) / mbSummary.reduce((s, i) => s + i.count, 0)).toFixed(2) + '%' : '-'} />
              <KPICard title="平均产率 (%)" value={mbSummary.length ? (mbSummary.reduce((s, i) => s + i.concentrateYield * i.count, 0) / mbSummary.reduce((s, i) => s + i.count, 0)).toFixed(2) + '%' : '-'} />
            </div>
            {mbPeriodCompare && (
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-3">同比/环比</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-slate-500">处理量较上期</span><p className="font-medium">{mbPeriodCompare.changes.totalProcessedDelta >= 0 ? '+' : ''}{mbPeriodCompare.changes.totalProcessedDelta} 吨 ({mbPeriodCompare.changes.totalProcessedPct}%)</p></div>
                  <div><span className="text-slate-500">铅回收率较上期</span><p className="font-medium">{mbPeriodCompare.changes.avgPbRecoveryDelta >= 0 ? '+' : ''}{mbPeriodCompare.changes.avgPbRecoveryDelta}%</p></div>
                  <div><span className="text-slate-500">银回收率较上期</span><p className="font-medium">{mbPeriodCompare.changes.avgAgRecoveryDelta >= 0 ? '+' : ''}{mbPeriodCompare.changes.avgAgRecoveryDelta}%</p></div>
                  <div><span className="text-slate-500">产率较上期</span><p className="font-medium">{mbPeriodCompare.changes.avgYieldDelta >= 0 ? '+' : ''}{mbPeriodCompare.changes.avgYieldDelta}%</p></div>
                </div>
              </div>
            )}

            <ChartCard title="金属平衡 - 回收率趋势">
              <LineChart data={mbTrends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis domain={[70, 100]} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                <Line type="monotone" dataKey="pbRecovery" name="铅回收率" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="agRecovery" name="银回收率" stroke="#16a34a" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="znRecovery" name="锌回收率" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ChartCard>

            <ChartCard title="金属平衡 - 每日处理量 (吨)">
              <BarChart data={mbTrends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="processedWeight" name="处理量 (吨)" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ChartCard>

            <ChartCard title="班次对比 - 回收率与产率">
              <BarChart data={mbShifts}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="shiftType" />
                <YAxis yAxisId="left" domain={[70, 100]} />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="pbRecovery" name="铅回收率 (%)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="agRecovery" name="银回收率 (%)" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="yield" name="产率 (%)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            {mbDistribution.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">金属分布 (精矿/尾矿分布率)</h3>
                <p className="text-sm text-slate-500 mb-4">近期周期内原矿金属量进入精矿与尾矿的占比</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead><tr className="border-b border-slate-200"><th className="text-left py-2 text-slate-600">周期</th><th className="text-right py-2 text-slate-600">铅-精矿%</th><th className="text-right py-2 text-slate-600">银-精矿%</th><th className="text-right py-2 text-slate-600">锌-精矿%</th></tr></thead>
                    <tbody>
                      {mbDistribution.slice(-14).reverse().map((d) => (
                        <tr key={d.period} className="border-b border-slate-100"><td className="py-2">{d.period}</td><td className="text-right">{d.pb.distConcPct}%</td><td className="text-right">{d.ag.distConcPct}%</td><td className="text-right">{d.zn.distConcPct}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {mbStability && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">回收率稳定性与达标率</h3>
                <p className="text-sm text-slate-500 mb-4">铅≥92%、银≥90% 为达标（可配置）</p>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-4">
                  <div className="p-3 bg-slate-50 rounded-lg"><div className="text-xs text-slate-500">铅回收率标准差</div><div className="font-semibold">{mbStability.stdDevPb}</div></div>
                  <div className="p-3 bg-slate-50 rounded-lg"><div className="text-xs text-slate-500">银回收率标准差</div><div className="font-semibold">{mbStability.stdDevAg}</div></div>
                  <div className="p-3 bg-slate-50 rounded-lg"><div className="text-xs text-slate-500">锌回收率标准差</div><div className="font-semibold">{mbStability.stdDevZn}</div></div>
                  <div className="p-3 bg-green-50 rounded-lg"><div className="text-xs text-slate-600">铅达标率</div><div className="font-semibold text-green-700">{mbStability.passRatePb}%</div></div>
                  <div className="p-3 bg-green-50 rounded-lg"><div className="text-xs text-slate-600">银达标率</div><div className="font-semibold text-green-700">{mbStability.passRateAg}%</div></div>
                  <div className="p-3 bg-green-50 rounded-lg"><div className="text-xs text-slate-600">锌达标率</div><div className="font-semibold text-green-700">{mbStability.passRateZn}%</div></div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  setExporting(true);
                  try {
                    const end = new Date();
                    const start = subDays(end, Number(dateRange));
                    await apiClient.downloadMetalBalanceExport(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'), 'day');
                  } catch (e: any) {
                    setMbError(e.message || '导出失败');
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={exporting || mbSummary.length === 0}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <Download className="w-4 h-4 mr-2" />
                {exporting ? '导出中...' : '导出金属平衡汇总表 (CSV)'}
              </button>
            </div>
          </div>
        )}

        {activeView === 'sales-data' && (
          <div className="space-y-6">
            <p className="text-slate-600">按<strong>时间</strong>、<strong>客户</strong>维度汇总出厂化验单数据（干重、铅/锌/铜/银金属量）。</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard title="总单数" value={String(salesByTime.reduce((s, i) => s + i.reportCount, 0))} />
              <KPICard title="总车数" value={String(salesByTime.reduce((s, i) => s + i.vehicleCount, 0))} />
              <KPICard title="干重合计 (吨)" value={salesByTime.length ? salesByTime.reduce((s, i) => s + i.dryWeightSum, 0).toFixed(2) : '—'} />
              <KPICard title="银合计 (Kg)" value={salesByTime.length ? salesByTime.reduce((s, i) => s + i.agKgSum, 0).toFixed(2) : '—'} />
            </div>
            <ChartCard title="按客户维度 - 干重 (吨)">
              <BarChart data={salesByCustomer} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="customerName" width={76} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="dryWeightSum" name="干重 (吨)" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={22} />
              </BarChart>
            </ChartCard>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">按客户汇总表</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-slate-600 font-medium">客户</th>
                      <th className="text-right py-2 text-slate-600 font-medium">单数</th>
                      <th className="text-right py-2 text-slate-600 font-medium">车数</th>
                      <th className="text-right py-2 text-slate-600 font-medium">干重(t)</th>
                      <th className="text-right py-2 text-slate-600 font-medium">铅(T)</th>
                      <th className="text-right py-2 text-slate-600 font-medium">锌(T)</th>
                      <th className="text-right py-2 text-slate-600 font-medium">铜(T)</th>
                      <th className="text-right py-2 text-slate-600 font-medium">银(Kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesByCustomer.length === 0 ? (
                      <tr><td colSpan={8} className="py-6 text-center text-slate-500">暂无数据</td></tr>
                    ) : (
                      salesByCustomer.map((r) => (
                        <tr key={r.customerId ?? r.customerName} className="border-b border-slate-100">
                          <td className="py-2 font-medium text-slate-800">{r.customerName}{r.customerCode ? ` (${r.customerCode})` : ''}</td>
                          <td className="py-2 text-right text-slate-600">{r.reportCount}</td>
                          <td className="py-2 text-right text-slate-600">{r.vehicleCount}</td>
                          <td className="py-2 text-right text-slate-600">{Number(r.dryWeightSum).toFixed(2)}</td>
                          <td className="py-2 text-right text-slate-600">{Number(r.pbMetalSum).toFixed(2)}</td>
                          <td className="py-2 text-right text-slate-600">{Number(r.znMetalSum).toFixed(2)}</td>
                          <td className="py-2 text-right text-slate-600">{Number(r.cuMetalSum).toFixed(2)}</td>
                          <td className="py-2 text-right text-slate-600">{Number(r.agKgSum).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <ChartCard title="按时间维度 - 干重 (吨)">
              <BarChart data={salesByTime}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="dryWeightSum" name="干重 (吨)" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ChartCard>
            <ChartCard title="按时间维度 - 铅/锌/银金属量 (T 或 Kg)">
              <LineChart data={salesByTime}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                <Line type="monotone" dataKey="pbMetalSum" name="铅 (T)" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="znMetalSum" name="锌 (T)" stroke="#16a34a" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="agKgSum" name="银 (Kg)" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ChartCard>
          </div>
        )}
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
