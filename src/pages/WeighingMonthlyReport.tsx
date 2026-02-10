import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Printer } from 'lucide-react';
import { format, addMonths, subMonths } from 'date-fns';
import { apiClient } from '../api/client';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - 2 + i);
const months = Array.from({ length: 12 }, (_, i) => i + 1);

/** 千克转吨显示 */
function kgToTone(kg: number): string {
  return (Number(kg) / 1000).toFixed(2);
}

type Row = { vehicleNo: string; count: number; grossWeight: number; tareWeight: number; netWeight: number };

export const WeighingMonthlyReport: React.FC = () => {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<{ year: number; month: number; startDate: string; endDate: string; data: Row[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getWeighingMonthlyReport({ year, month });
      setData(res);
    } catch (err: any) {
      setError(err?.message || '查询失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [year, month]);

  const handlePrevMonth = () => {
    const d = subMonths(new Date(year, month - 1, 1), 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const handleNextMonth = () => {
    const d = addMonths(new Date(year, month - 1, 1), 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const handlePrint = () => {
    window.print();
  };

  const Cell = ({ value, bold = false }: { value?: string | number; bold?: boolean }) => (
    <td className={`border border-black px-2 py-1 text-center text-sm ${bold ? 'font-bold' : ''}`}>
      {value}
    </td>
  );

  if (loading) {
    return (
      <div className="p-6 bg-slate-50 min-h-screen print:bg-white print:p-0">
        <div className="max-w-[210mm] mx-auto bg-white p-8 shadow-lg">
          <div className="p-8 text-center text-slate-500">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen print:bg-white print:p-0">
      <div className="max-w-[210mm] mx-auto bg-white p-8 shadow-lg print:shadow-none print:p-4">
        {/* 查询区域 - 打印时隐藏 */}
        <div className="mb-6 flex justify-between items-center print:hidden bg-slate-100 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-slate-700">报表月份:</span>
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-300"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-2 py-1.5 border border-slate-300 rounded text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-2 py-1.5 border border-slate-300 rounded text-sm"
            >
              {months.map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
            <button
              onClick={handleNextMonth}
              className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-300"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
            <button
              onClick={fetchReport}
              className="ml-2 px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center font-medium"
            >
              <Calendar className="w-4 h-4 mr-2" /> 查询
            </button>
          </div>
          <button
            onClick={handlePrint}
            className="px-4 py-1.5 bg-slate-800 text-white rounded hover:bg-slate-900 flex items-center font-medium shadow-sm"
          >
            <Printer className="w-4 h-4 mr-2" /> 打印月报
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm print:hidden">{error}</div>
        )}

        {!data ? (
          <div className="p-8 text-center text-red-500 border border-dashed border-red-300 rounded bg-red-50">
            请选择年月后点击「查询」，或暂无该区间称重数据。
          </div>
        ) : (
          <>
            {/* 报表表头 - 与日报表一致 */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-serif font-bold mb-2">称重数据月报表</h1>
              <div className="text-red-600 font-medium mb-4">
                {year}年{month}月（{data.startDate} 至 {data.endDate}，上月26日—本月25日）
              </div>
              <div className="flex justify-between text-sm font-medium">
                <div>填报单位: 选矿厂</div>
                <div>填报时间: {format(new Date(), 'yyyy年MM月dd日')}</div>
              </div>
            </div>

            {/* 主表 - 与日报表一致的边框样式 */}
            <table className="w-full border-collapse border border-black">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black px-2 py-1 w-12">序号</th>
                  <th className="border border-black px-2 py-1">车号</th>
                  <th className="border border-black px-2 py-1 w-20">次数</th>
                  <th className="border border-black px-2 py-1 w-24">毛重(t)</th>
                  <th className="border border-black px-2 py-1 w-24">皮重(t)</th>
                  <th className="border border-black px-2 py-1 w-24">净重(t)</th>
                </tr>
              </thead>
              <tbody>
                {data.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border border-black px-2 py-4 text-center text-slate-500">
                      该区间暂无称重数据
                    </td>
                  </tr>
                ) : (
                  data.data.map((row, index) => (
                    <tr key={row.vehicleNo}>
                      <Cell value={index + 1} />
                      <Cell value={row.vehicleNo} />
                      <Cell value={row.count} />
                      <Cell value={kgToTone(row.grossWeight)} />
                      <Cell value={kgToTone(row.tareWeight)} />
                      <Cell value={kgToTone(row.netWeight)} />
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
};
