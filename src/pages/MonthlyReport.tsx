import React, { useEffect, useState } from 'react';
import { apiClient, MonthlyReportData } from '../api/client';
import { ChevronLeft, ChevronRight, Printer, Search } from 'lucide-react';
import { subMonths, addMonths, format } from 'date-fns';

export const MonthlyReport: React.FC = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Initialize with latest data date
  useEffect(() => {
    const initDate = async () => {
      try {
        const res = await apiClient.getReports(1, 1);
        if (res.data && res.data.length > 0) {
          const latestDate = new Date(res.data[0].shiftDate);
          setYear(latestDate.getFullYear());
          setMonth(latestDate.getMonth() + 1);
        }
      } catch (e) {
        console.error("Failed to fetch latest date", e);
      }
    };
    initDate();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getMonthlyStats(year, month);
      setData(res);
    } catch (err) {
      console.error(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [year, month]);

  const handlePrevMonth = () => {
    const date = new Date(year, month - 1 - 1, 1); // Current year/month(1-based) -> Date object
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  };

  const handleNextMonth = () => {
    const date = new Date(year, month - 1 + 1, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper for cells
  const Cell = ({ value, bold = false, yellow = false }: { value?: string | number, bold?: boolean, yellow?: boolean }) => (
    <td className={`border border-black px-1 py-1 text-center text-xs whitespace-nowrap ${bold ? 'font-bold' : ''} ${yellow ? 'bg-yellow-100' : ''}`}>
      {value}
    </td>
  );

  const HeaderCell = ({ children, rowSpan, colSpan }: { children: React.ReactNode, rowSpan?: number, colSpan?: number }) => (
    <th className="border border-black px-1 py-1 text-center bg-gray-100 text-sm font-semibold" rowSpan={rowSpan} colSpan={colSpan}>
      {children}
    </th>
  );

  return (
    <div className="p-6 bg-slate-50 min-h-screen print:bg-white print:p-0">
      <div className="mx-auto bg-white p-4 shadow-lg print:shadow-none print:p-2 min-w-[297mm]">
        
        {/* Controls */}
        <div className="mb-6 flex justify-between items-center print:hidden bg-slate-100 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-slate-700">选择月份:</span>
            <button onClick={handlePrevMonth} className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-300">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <select 
              value={year} 
              onChange={e => setYear(Number(e.target.value))}
              className="p-2 border rounded border-slate-300"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            <select 
              value={month} 
              onChange={e => setMonth(Number(e.target.value))}
              className="p-2 border rounded border-slate-300"
            >
              {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
            </select>
            <button onClick={handleNextMonth} className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-300">
                <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
            <button 
              onClick={fetchData}
              className="ml-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center font-medium"
            >
              <Search className="w-4 h-4 mr-2" /> 查询
            </button>
          </div>
          <button 
            onClick={handlePrint}
            className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 flex items-center font-medium shadow-sm"
          >
            <Printer className="w-4 h-4 mr-2" /> 打印月报
          </button>
        </div>

        {/* Loading & Content */}
        {loading ? (
             <div className="p-8 text-center text-blue-600 print:hidden">加载中...</div>
        ) : !data ? (
             <div className="p-8 text-center text-slate-500 print:hidden">暂无数据</div>
        ) : (
            <>
            <div className="text-center mb-4">
                <h1 className="text-2xl font-serif font-bold mb-2">选矿厂生产综合统计月报表</h1>
                <div className="text-lg font-medium">{year}年{month}月</div>
                <div className="text-sm text-slate-500 mt-1">
                    统计周期：{format(new Date(year, month - 2, 26), 'yyyy年M月d日')} ～ {format(new Date(year, month - 1, 25), 'yyyy年M月d日')}
                </div>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-black text-xs">
                <thead>
                    <tr>
                        <HeaderCell rowSpan={3}>日期</HeaderCell>
                        <HeaderCell colSpan={7}>原矿</HeaderCell>
                        <HeaderCell colSpan={7}>铅精矿</HeaderCell>
                        <HeaderCell colSpan={5}>尾矿</HeaderCell>
                        <HeaderCell colSpan={2}>回收率 %</HeaderCell>
                    </tr>
                    <tr>
                        <HeaderCell rowSpan={2}>湿重<br/>(t)</HeaderCell>
                        <HeaderCell rowSpan={2}>水分<br/>(%)</HeaderCell>
                        <HeaderCell rowSpan={2}>干重<br/>(t)</HeaderCell>
                        <HeaderCell colSpan={2}>铅 Pb</HeaderCell>
                        <HeaderCell colSpan={2}>银 Ag</HeaderCell>
                        
                        <HeaderCell rowSpan={2}>湿重<br/>(t)</HeaderCell>
                        <HeaderCell rowSpan={2}>水分<br/>(%)</HeaderCell>
                        <HeaderCell rowSpan={2}>干重<br/>(t)</HeaderCell>
                        <HeaderCell colSpan={2}>铅 Pb</HeaderCell>
                        <HeaderCell colSpan={2}>银 Ag</HeaderCell>

                        <HeaderCell rowSpan={2}>干重<br/>(t)</HeaderCell>
                        <HeaderCell colSpan={2}>铅 Pb</HeaderCell>
                        <HeaderCell colSpan={2}>银 Ag</HeaderCell>

                        <HeaderCell rowSpan={2}>Pb</HeaderCell>
                        <HeaderCell rowSpan={2}>Ag</HeaderCell>
                    </tr>
                    <tr>
                        <HeaderCell>%</HeaderCell>
                        <HeaderCell>t</HeaderCell>
                        <HeaderCell>g/t</HeaderCell>
                        <HeaderCell>kg</HeaderCell>

                        <HeaderCell>%</HeaderCell>
                        <HeaderCell>t</HeaderCell>
                        <HeaderCell>g/t</HeaderCell>
                        <HeaderCell>kg</HeaderCell>

                        <HeaderCell>%</HeaderCell>
                        <HeaderCell>t</HeaderCell>
                        <HeaderCell>g/t</HeaderCell>
                        <HeaderCell>kg</HeaderCell>
                    </tr>
                </thead>
                <tbody>
                    {data.daily.map((item, index) => {
                        const { raw, conc, tail } = item.data;
                        const pbRec = raw.pbMetal > 0 ? (conc.pbMetal / raw.pbMetal * 100) : 0;
                        const agRec = raw.agMetal > 0 ? (conc.agMetal / raw.agMetal * 100) : 0;
                        
                        return (
                            <tr key={item.date} className="hover:bg-slate-50">
                                <Cell value={format(new Date(item.date), 'M月d日')} />
                                {/* Raw */}
                                <Cell value={raw.wet.toFixed(2)} />
                                <Cell value={raw.moisture.toFixed(2)} />
                                <Cell value={raw.dry.toFixed(2)} />
                                <Cell value={raw.pbGrade.toFixed(2)} />
                                <Cell value={raw.pbMetal.toFixed(3)} />
                                <Cell value={raw.agGrade.toFixed(2)} />
                                <Cell value={raw.agMetal.toFixed(4)} />
                                
                                {/* Conc */}
                                <Cell value={conc.wet.toFixed(2)} />
                                <Cell value={conc.moisture.toFixed(2)} />
                                <Cell value={conc.dry.toFixed(2)} />
                                <Cell value={conc.pbGrade.toFixed(2)} />
                                <Cell value={conc.pbMetal.toFixed(3)} />
                                <Cell value={conc.agGrade.toFixed(2)} />
                                <Cell value={conc.agMetal.toFixed(4)} />

                                {/* Tail */}
                                <Cell value={tail.dry.toFixed(2)} />
                                <Cell value={tail.pbGrade.toFixed(2)} />
                                <Cell value={tail.pbMetal.toFixed(3)} />
                                <Cell value={tail.agGrade.toFixed(2)} />
                                <Cell value={tail.agMetal.toFixed(4)} />

                                {/* Recovery */}
                                <Cell value={pbRec.toFixed(2)} />
                                <Cell value={agRec.toFixed(2)} />
                            </tr>
                        );
                    })}
                    
                    {/* Total Row */}
                    <tr className="bg-gray-100 font-bold">
                        <Cell value="合计" bold />
                        <Cell value={data.total.raw.wet.toFixed(2)} bold />
                        <Cell value={data.total.raw.moisture.toFixed(2)} bold />
                        <Cell value={data.total.raw.dry.toFixed(2)} bold />
                        <Cell value={data.total.raw.pbGrade.toFixed(2)} bold />
                        <Cell value={data.total.raw.pbMetal.toFixed(3)} bold />
                        <Cell value={data.total.raw.agGrade.toFixed(2)} bold />
                        <Cell value={data.total.raw.agMetal.toFixed(4)} bold />

                        <Cell value={data.total.conc.wet.toFixed(2)} bold />
                        <Cell value={data.total.conc.moisture.toFixed(2)} bold />
                        <Cell value={data.total.conc.dry.toFixed(2)} bold />
                        <Cell value={data.total.conc.pbGrade.toFixed(2)} bold />
                        <Cell value={data.total.conc.pbMetal.toFixed(3)} bold />
                        <Cell value={data.total.conc.agGrade.toFixed(2)} bold />
                        <Cell value={data.total.conc.agMetal.toFixed(4)} bold />

                        <Cell value={data.total.tail.dry.toFixed(2)} bold />
                        <Cell value={data.total.tail.pbGrade.toFixed(2)} bold />
                        <Cell value={data.total.tail.pbMetal.toFixed(3)} bold />
                        <Cell value={data.total.tail.agGrade.toFixed(2)} bold />
                        <Cell value={data.total.tail.agMetal.toFixed(4)} bold />
                        
                        {/* Rec Calc for Total */}
                        <Cell value={(data.total.raw.pbMetal > 0 ? (data.total.conc.pbMetal / data.total.raw.pbMetal * 100) : 0).toFixed(2)} bold />
                        <Cell value={(data.total.raw.agMetal > 0 ? (data.total.conc.agMetal / data.total.raw.agMetal * 100) : 0).toFixed(2)} bold />
                    </tr>
                </tbody>
            </table>
            </div>
            </>
        )}
      </div>
      
      <style>{`
        @media print {
            @page {
                size: landscape;
                margin: 10mm;
            }
        }
      `}</style>
    </div>
  );
};
