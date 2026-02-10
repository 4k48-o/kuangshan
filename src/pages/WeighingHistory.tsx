import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Search, ChevronDown, ChevronRight, Trash2, ChevronLeft } from 'lucide-react';
import { apiClient } from '../api/client';
import { DatePicker } from '../components/ui/DatePicker';

type SummaryRow = { date: string; grossWeight: number; tareWeight: number; netWeight: number; count: number };
type DetailRow = { id: string; vehicleNo: string; grossWeight: number; tareWeight: number; netWeight: number };

/** 库存为 kg，页面上按吨显示 */
function kgToTone(kg: number): string {
  return (Number(kg) / 1000).toFixed(2);
}

export const WeighingHistory: React.FC = () => {
  const [date, setDate] = useState<Date | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [vehicleNo, setVehicleNo] = useState('');
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [detailCache, setDetailCache] = useState<Record<string, DetailRow[]>>({});
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [queryMode, setQueryMode] = useState<'day' | 'range'>('day');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const fetchSummary = useCallback(async (overrides?: { page?: number }) => {
    setLoading(true);
    setError(null);
    const currentPage = overrides?.page ?? page;
    const params: { startDate?: string; endDate?: string; vehicleNo?: string; page: number; pageSize: number } = {
      page: currentPage,
      pageSize
    };
    if (queryMode === 'day' && date) {
      params.startDate = format(date, 'yyyy-MM-dd');
      params.endDate = format(date, 'yyyy-MM-dd');
    } else if (queryMode === 'range' && startDate && endDate) {
      params.startDate = format(startDate, 'yyyy-MM-dd');
      params.endDate = format(endDate, 'yyyy-MM-dd');
    }
    if (vehicleNo.trim()) params.vehicleNo = vehicleNo.trim();

    try {
      const res = await apiClient.getWeighingSummary(params);
      setSummary(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setExpandedDate(null);
    } catch (err: any) {
      try {
        const recordsParams: { startDate?: string; endDate?: string; vehicleNo?: string; limit: number } = { limit: 5000 };
        if (params.startDate) recordsParams.startDate = params.startDate;
        if (params.endDate) recordsParams.endDate = params.endDate;
        if (params.vehicleNo) recordsParams.vehicleNo = params.vehicleNo;
        const res = await apiClient.getWeighingRecords(recordsParams);
        const list = res.data || [];
        const byDate = new Map<string, { grossWeight: number; tareWeight: number; netWeight: number; count: number }>();
        list.forEach((r: any) => {
          const key = r.recordDate ? String(r.recordDate).slice(0, 10) : '';
          if (!key) return;
          if (!byDate.has(key)) byDate.set(key, { grossWeight: 0, tareWeight: 0, netWeight: 0, count: 0 });
          const row = byDate.get(key)!;
          row.grossWeight += Number(r.grossWeight || 0);
          row.tareWeight += Number(r.tareWeight || 0);
          row.netWeight += Number(r.netWeight || 0);
          row.count += 1;
        });
        const fullSummary: SummaryRow[] = Array.from(byDate.entries())
          .map(([dateStr, row]) => ({
            date: dateStr,
            grossWeight: Number(row.grossWeight.toFixed(2)),
            tareWeight: Number(row.tareWeight.toFixed(2)),
            netWeight: Number(row.netWeight.toFixed(2)),
            count: row.count
          }))
          .sort((a, b) => b.date.localeCompare(a.date));
        setTotal(fullSummary.length);
        const skip = (currentPage - 1) * pageSize;
        setSummary(fullSummary.slice(skip, skip + pageSize));
        setExpandedDate(null);
      } catch (fallbackErr: any) {
        setError(err.message || '查询失败');
        setSummary([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [queryMode, date, startDate, endDate, vehicleNo, page, pageSize]);

  useEffect(() => {
    fetchSummary();
  }, [page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [queryMode, date, startDate, endDate, vehicleNo]);

  const handleSearch = () => {
    if (queryMode === 'day' && !date) {
      setError('请选择查询日期');
      return;
    }
    if (queryMode === 'range' && (!startDate || !endDate)) {
      setError('请选择开始和结束日期');
      return;
    }
    setError(null);
    setPage(1);
    fetchSummary({ page: 1 });
  };

  const fetchDetail = async (dateStr: string) => {
    if (detailCache[dateStr]) {
      setExpandedDate((prev) => (prev === dateStr ? null : dateStr));
      return;
    }
    setDetailLoading(dateStr);
    try {
      const res = await apiClient.getWeighingRecords({ date: dateStr, limit: 500 });
      setDetailCache((prev) => ({ ...prev, [dateStr]: res.data }));
      setExpandedDate(dateStr);
    } catch (_) {
      setExpandedDate(null);
    } finally {
      setDetailLoading(null);
    }
  };

  const toggleExpand = (dateStr: string) => {
    if (expandedDate === dateStr) {
      setExpandedDate(null);
      return;
    }
    fetchDetail(dateStr);
  };

  const handleDeleteRow = async (dateStr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`确定删除 ${format(new Date(dateStr + 'T12:00:00'), 'yyyy年M月d日')} 的称重记录吗？`)) return;
    setDeletingDate(dateStr);
    setError(null);
    try {
      await apiClient.deleteWeighingRecords({ date: dateStr });
      setSummary((prev) => prev.filter((r) => r.date !== dateStr));
      setTotal((prev) => Math.max(0, prev - 1));
      setDetailCache((prev) => {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
      if (expandedDate === dateStr) setExpandedDate(null);
    } catch (err: any) {
      setError(err.message || '删除失败');
    } finally {
      setDeletingDate(null);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">称重数据历史</h1>
      <p className="text-slate-600 mb-6">按日期查看汇总，展开可查看当日各车次明细。</p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">查询方式</label>
            <select
              value={queryMode}
              onChange={(e) => setQueryMode(e.target.value as 'day' | 'range')}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm"
            >
              <option value="day">按日查询</option>
              <option value="range">按区间查询</option>
            </select>
          </div>
          {queryMode === 'day' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">日期</label>
              <DatePicker date={date} onChange={setDate} />
            </div>
          )}
          {queryMode === 'range' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>
                <DatePicker date={startDate} onChange={setStartDate} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>
                <DatePicker date={endDate} onChange={setEndDate} />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">车号</label>
            <input
              type="text"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              placeholder="可选"
              className="px-3 py-2 border border-slate-300 rounded-md text-sm w-32"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
          >
            <Search className="w-4 h-4 mr-2" /> 查询
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">加载中...</div>
        ) : summary.length === 0 ? (
          <div className="p-8 text-center text-slate-500">暂无数据，请选择日期或上传称重 Excel。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-10" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">日期</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">毛重 (t)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">皮重 (t)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">净重 (t)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">车次</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase w-20">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {summary.map((row) => {
                  const isExpanded = expandedDate === row.date;
                  const details = detailCache[row.date];
                  const isLoadingDetail = detailLoading === row.date;
                  return (
                    <React.Fragment key={row.date}>
                      <tr
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => (isLoadingDetail ? undefined : toggleExpand(row.date))}
                      >
                        <td className="px-4 py-3 text-slate-500">
                          {isLoadingDetail ? (
                            <span className="text-xs">加载中</span>
                          ) : (
                            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {format(new Date(row.date + 'T12:00:00'), 'yyyy年M月d日')}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium">
                          {kgToTone(row.grossWeight)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium">
                          {kgToTone(row.tareWeight)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium">
                          {kgToTone(row.netWeight)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 text-center">{row.count}</td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteRow(row.date, e)}
                            disabled={deletingDate === row.date}
                            className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                            title="删除该日期的称重记录"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && details && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="pl-8 pr-4">
                              <table className="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden bg-white">
                                <thead>
                                  <tr className="bg-slate-100">
                                    <th className="px-3 py-2 text-left font-medium text-slate-600">车号</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">毛重 (t)</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">皮重 (t)</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">净重 (t)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {details.map((d) => (
                                    <tr key={d.id}>
                                      <td className="px-3 py-2 text-slate-800">{d.vehicleNo}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{kgToTone(d.grossWeight)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{kgToTone(d.tareWeight)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{kgToTone(d.netWeight)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && summary.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t border-slate-200 bg-slate-50/80">
            <span className="text-sm text-slate-600">共 {total} 条</span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600">每页</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPageSize(v);
                  setPage(1);
                }}
                className="px-2 py-1 border border-slate-300 rounded text-sm"
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-sm text-slate-600">条</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-2 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="上一页"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 text-sm text-slate-700 min-w-[6rem] text-center">
                  第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页
                </span>
                <button
                  type="button"
                  disabled={page >= Math.ceil(total / pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-2 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="下一页"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
