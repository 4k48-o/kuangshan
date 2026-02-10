import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Search, ChevronDown, ChevronRight, Trash2, ChevronLeft } from 'lucide-react';
import { apiClient } from '../api/client';
import { DatePicker } from '../components/ui/DatePicker';

type SummaryRow = {
  id: string;
  reportDate: string;
  productName: string;
  customerName: string;
  vehicleCount: number;
  sourceFile: string;
  createdAt: string;
  wetWeightSum: number;
  moistureAvg: number;
  dryWeightSum: number;
  pbGradeAvg: number;
  znGradeAvg: number;
  cuGradeAvg: number;
  agGptAvg: number;
  pbMetalSum: number;
  znMetalSum: number;
  cuMetalSum: number;
  agKgSum: number;
};

type DetailRow = {
  id: string;
  seqNo: string | null;
  vehicleNo: string | null;
  customerCode: string | null;
  customerId?: string | null;
  customer?: { id: string; name: string; code: string } | null;
  wetWeight: number | null;
  moisture: number | null;
  dryWeight: number | null;
  pbGrade: number | null;
  znGrade: number | null;
  cuGrade: number | null;
  agGpt: number | null;
  pbMetal: number | null;
  znMetal: number | null;
  cuMetal: number | null;
  agKg: number | null;
};

function num(v: number | null): string {
  if (v == null) return '—';
  return Number(v).toFixed(2);
}

type CustomerOption = { id: string; name: string; code: string };

export const SalesAssayHistory: React.FC = () => {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [customerId, setCustomerId] = useState<string>('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailCache, setDetailCache] = useState<Record<string, DetailRow[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    apiClient.getCustomers().then((list) => {
      setCustomers(list.map((c) => ({ id: c.id, name: c.name, code: c.code })));
    }).catch(() => setCustomers([]));
  }, []);

  const fetchSummary = useCallback(async (p: number = page, size: number = pageSize) => {
    setLoading(true);
    setError(null);
    const params: { startDate?: string; endDate?: string; customerId?: string; page?: number; pageSize?: number } = {};
    if (startDate) params.startDate = format(startDate, 'yyyy-MM-dd');
    if (endDate) params.endDate = format(endDate, 'yyyy-MM-dd');
    if (customerId) params.customerId = customerId;
    params.page = p;
    params.pageSize = size;
    try {
      const data = await apiClient.getSalesAssayReports(params);
      setSummary(data.list ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setPageSize(data.pageSize ?? size);
      setExpandedId(null);
    } catch (err: any) {
      setError(err?.message || '查询失败');
      setSummary([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, customerId, page, pageSize]);

  useEffect(() => {
    fetchSummary(1, pageSize);
  }, []);

  const handleSearch = () => {
    setError(null);
    setPage(1);
    fetchSummary(1, pageSize);
  };

  const goToPage = (p: number) => {
    const next = Math.max(1, Math.min(p, totalPages));
    setPage(next);
    fetchSummary(next, pageSize);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
    fetchSummary(1, size);
  };

  const fetchDetail = async (id: string) => {
    if (detailCache[id]) {
      setExpandedId((prev) => (prev === id ? null : id));
      return;
    }
    setDetailLoading(id);
    try {
      const res = await apiClient.getSalesAssayReport(id);
      setDetailCache((prev) => ({ ...prev, [id]: res.details }));
      setExpandedId(id);
    } catch (_) {
      setExpandedId(null);
    } finally {
      setDetailLoading(null);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    fetchDetail(id);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('确定删除该条出厂化验单记录吗？删除后无法恢复。')) return;
    setDeletingId(id);
    setError(null);
    try {
      await apiClient.deleteSalesAssayReport(id);
      setDetailCache((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (expandedId === id) setExpandedId(null);
      const newTotal = total - 1;
      setTotal(newTotal);
      const maxPage = Math.max(1, Math.ceil(newTotal / pageSize));
      if (summary.length <= 1 && page > 1) {
        const prevPage = Math.min(page - 1, maxPage);
        setPage(prevPage);
        fetchSummary(prevPage, pageSize);
      } else {
        fetchSummary(page, pageSize);
      }
    } catch (err: any) {
      setError(err?.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">出厂化验单历史</h1>
      <p className="text-slate-600 mb-6">按日期范围查询，展开可查看单内每车明细。</p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>
            <DatePicker date={startDate} onChange={setStartDate} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>
            <DatePicker date={endDate} onChange={setEndDate} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">客户</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="block w-[200px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.code}）
                </option>
              ))}
            </select>
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
          <div className="p-8 text-center text-slate-500">暂无数据，请上传出厂化验单或调整日期范围。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-10" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">报告日期</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">产品名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">客户</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">车数</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">湿重(t)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">水份%</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">干重(t)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">铅%</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">锌%</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">铜%</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">银g/t</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">铅(T)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">锌(T)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">铜(T)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">银(Kg)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase w-20">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {summary.map((row) => {
                  const isExpanded = expandedId === row.id;
                  const details = detailCache[row.id];
                  const isLoadingDetail = detailLoading === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => (isLoadingDetail ? undefined : toggleExpand(row.id))}
                      >
                        <td className="px-4 py-3 text-slate-500">
                          {isLoadingDetail ? (
                            <span className="text-xs">加载中</span>
                          ) : (
                            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {format(new Date(row.reportDate + 'T12:00:00'), 'yyyy年M月d日')}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.productName}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.customerName}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-center">{row.vehicleCount}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.wetWeightSum)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.moistureAvg)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.dryWeightSum)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.pbGradeAvg)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.znGradeAvg)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.cuGradeAvg)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.agGptAvg)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.pbMetalSum)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.znMetalSum)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.cuMetalSum)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{num(row.agKgSum)}</td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(row.id, e)}
                            disabled={deletingId === row.id}
                            className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                            title="删除该条记录"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && details && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={18} className="px-4 py-3">
                            <div className="pl-8 pr-4 overflow-x-auto">
                              <table className="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden bg-white">
                                <thead>
                                  <tr className="bg-slate-100">
                                    <th className="px-3 py-2 text-left font-medium text-slate-600">序号</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600">车号</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600">客户及编号</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600">关联客户</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">湿重(t)</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">水分%</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">干重(t)</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">铅%</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">锌%</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">银g/t</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">铅含量</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">锌含量</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600">银(Kg)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {[...details]
                                    .sort((a, b) => (Number(a.seqNo) || 0) - (Number(b.seqNo) || 0))
                                    .map((d) => (
                                    <tr key={d.id}>
                                      <td className="px-3 py-2 text-slate-800">{d.seqNo ?? '—'}</td>
                                      <td className="px-3 py-2 text-slate-800">{d.vehicleNo ?? '—'}</td>
                                      <td className="px-3 py-2 text-slate-700">{d.customerCode ?? '—'}</td>
                                      <td className="px-3 py-2 text-slate-700">{d.customer?.name ?? '—'}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{num(d.wetWeight)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{num(d.moisture)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{num(d.dryWeight)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{num(d.pbGrade)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{num(d.znGrade)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{num(d.agGpt)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{num(d.pbMetal)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{num(d.znMetal)}</td>
                                      <td className="px-3 py-2 text-slate-600 text-right">{num(d.agKg)}</td>
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
        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span>共 {total} 条</span>
              <label className="flex items-center gap-2">
                每页
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                条
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="inline-flex items-center px-3 py-1.5 rounded border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4 mr-0.5" /> 上一页
              </button>
              <span className="px-3 py-1.5 text-sm text-slate-600">
                第 {page} / {totalPages} 页
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="inline-flex items-center px-3 py-1.5 rounded border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页 <ChevronRight className="w-4 h-4 ml-0.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
