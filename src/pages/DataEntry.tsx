import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { Save, AlertCircle, Upload } from 'lucide-react';
import { apiClient, ShiftReportInput } from '../api/client';

export const DataEntry: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue } = useForm<ShiftReportInput>({
    defaultValues: {
      shiftDate: format(new Date(), 'yyyy-MM-dd'), // 保留今天的日期作为默认值
      shiftType: '', // 班次为空，用户需选择
      runTime: undefined, // 作业时间为空
      rawOre: {
        wetWeight: undefined,
        moisture: undefined,
        pbGrade: undefined,
        znGrade: undefined,
        agGrade: undefined
      },
      concentrate: {
        wetWeight: undefined,
        moisture: undefined,
        pbGrade: undefined,
        znGrade: undefined,
        agGrade: undefined
      },
      tailings: {
        pbGrade: undefined,
        znGrade: undefined,
        agGrade: undefined
      }
    }
  });
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setSubmitError(null);

    try {
      const parsed = await apiClient.parseTestReport(file);
      
      // Fill form with parsed data
      if (parsed.shiftDate) setValue('shiftDate', parsed.shiftDate);
      if (parsed.shiftType) setValue('shiftType', parsed.shiftType);
      
      if (parsed.rawOre) {
        if (parsed.rawOre.pbGrade !== undefined) setValue('rawOre.pbGrade', parsed.rawOre.pbGrade);
        if (parsed.rawOre.znGrade !== undefined) setValue('rawOre.znGrade', parsed.rawOre.znGrade);
        if (parsed.rawOre.agGrade !== undefined) setValue('rawOre.agGrade', parsed.rawOre.agGrade);
      }
      
      if (parsed.concentrate) {
        if (parsed.concentrate.pbGrade !== undefined) setValue('concentrate.pbGrade', parsed.concentrate.pbGrade);
        if (parsed.concentrate.znGrade !== undefined) setValue('concentrate.znGrade', parsed.concentrate.znGrade);
        if (parsed.concentrate.agGrade !== undefined) setValue('concentrate.agGrade', parsed.concentrate.agGrade);
        if (parsed.concentrate.moisture !== undefined) setValue('concentrate.moisture', parsed.concentrate.moisture);
      }
      
      if (parsed.tailings) {
        if (parsed.tailings.pbGrade !== undefined) setValue('tailings.pbGrade', parsed.tailings.pbGrade);
        if (parsed.tailings.znGrade !== undefined) setValue('tailings.znGrade', parsed.tailings.znGrade);
        if (parsed.tailings.agGrade !== undefined) setValue('tailings.agGrade', parsed.tailings.agGrade);
        if (parsed.tailings.fineness !== undefined) setValue('tailings.fineness', parsed.tailings.fineness);
      }
      
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : '文件解析失败');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const onSubmit = async (data: ShiftReportInput) => {
    setLoading(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      // Convert string inputs to numbers
      const processedData: ShiftReportInput = {
        ...data,
        rawOre: {
          wetWeight: Number(data.rawOre.wetWeight),
          moisture: Number(data.rawOre.moisture),
          pbGrade: Number(data.rawOre.pbGrade),
          znGrade: Number(data.rawOre.znGrade),
          agGrade: Number(data.rawOre.agGrade),
        },
        concentrate: {
          wetWeight: Number(data.concentrate.wetWeight),
          moisture: Number(data.concentrate.moisture),
          pbGrade: Number(data.concentrate.pbGrade),
          znGrade: Number(data.concentrate.znGrade),
          agGrade: Number(data.concentrate.agGrade),
        },
        tailings: data.tailings ? {
          wetWeight: Number(data.tailings.wetWeight || 0),
          moisture: Number(data.tailings.moisture || 0),
          pbGrade: Number(data.tailings.pbGrade),
          znGrade: Number(data.tailings.znGrade),
          agGrade: Number(data.tailings.agGrade),
        } : undefined
      };

      await apiClient.createReport(processedData);
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
      reset({
        shiftDate: format(new Date(), 'yyyy-MM-dd'),
        shiftType: '',
        runTime: undefined,
        rawOre: {
          wetWeight: undefined,
          moisture: undefined,
          pbGrade: undefined,
          znGrade: undefined,
          agGrade: undefined
        },
        concentrate: {
          wetWeight: undefined,
          moisture: undefined,
          pbGrade: undefined,
          znGrade: undefined,
          agGrade: undefined
        },
        tailings: {
          pbGrade: undefined,
          znGrade: undefined,
          agGrade: undefined
        }
      });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const InputGroup = ({ prefix, registerName, showFineness }: { prefix: string, registerName: string, showFineness?: boolean }) => (
    <div className={`grid grid-cols-1 ${showFineness ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-4`}>
      {showFineness && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">细度 (%)</label>
          <input
            type="number"
            step="0.01"
            {...register(`${prefix}.fineness` as any)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.00"
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">铅品位 (%)</label>
        <input
          type="number"
          step="0.0001"
          {...register(`${prefix}.pbGrade` as any)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.0000"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">锌品位 (%)</label>
        <input
          type="number"
          step="0.0001"
          {...register(`${prefix}.znGrade` as any)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.0000"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">银品位 (g/t)</label>
        <input
          type="number"
          step="0.0001"
          {...register(`${prefix}.agGrade` as any)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.0000"
        />
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">生产数据录入</h1>
        <p className="text-slate-500">可先上传化验单自动填充品位数据，或直接手动录入后点击保存并计算</p>
      </div>

      {/* 上传化验单（可选）：解析后覆盖表单中的品位等数据 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Upload className="w-5 h-5 mr-2 text-slate-500" />
          上传化验单（可选）
        </h2>
        <div className="space-y-4">
          <label className="block cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <div className="px-4 py-3 border-2 border-dashed border-slate-300 rounded-md hover:border-blue-500 transition-colors text-center">
              {uploading ? (
                <span className="text-blue-600">解析中...</span>
              ) : (
                <span className="text-slate-600">点击选择 Excel 文件（.xlsx / .xls），化验单数据将覆盖下方手动录入的品位数据</span>
              )}
            </div>
          </label>
          <p className="text-xs text-slate-500">
            上传后系统将自动填充日期、班次及原矿/精矿/尾矿品位；未上传则直接在下表手动录入后保存并计算即可。
          </p>
          {uploadError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md flex items-center text-red-700">
              <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
              {uploadError}
            </div>
          )}
          {uploadSuccess && !uploading && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md flex items-center text-green-700">
              <Save className="w-5 h-5 mr-2 shrink-0" />
              化验单数据已填充，请补充基础数据（处理量、水分等）后点击「保存并计算」
            </div>
          )}
        </div>
      </div>

      {submitError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center text-red-700">
          <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md flex items-center text-green-700">
          <Save className="w-5 h-5 mr-2 shrink-0" />
          保存成功！
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-slate-100">班次信息</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">日期</label>
              <input
                type="date"
                {...register('shiftDate', { required: true })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">班次</label>
              <select
                {...register('shiftType', { required: true })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">请选择班次</option>
                <option value="甲班">甲班</option>
                <option value="乙班">乙班</option>
                <option value="丙班">丙班</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">作业时间 (小时)</label>
              <input
                type="number"
                step="0.1"
                {...register('runTime', { required: true, min: 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.0"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-slate-100">基础数据</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">处理量湿量 (吨)</label>
              <input
                type="number"
                step="0.01"
                {...register('rawOre.wetWeight', { required: true, min: 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">原矿水分 (%)</label>
              <input
                type="number"
                step="0.01"
                {...register('rawOre.moisture', { required: true, min: 0, max: 100 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">铅精矿水分 (%)</label>
              <input
                type="number"
                step="0.01"
                {...register('concentrate.moisture', { required: true, min: 0, max: 100 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-slate-100">原矿数据</h2>
          <InputGroup prefix="rawOre" registerName="rawOre" />
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-slate-100">精矿数据</h2>
          <InputGroup prefix="concentrate" registerName="concentrate" />
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-slate-100">尾矿数据</h2>
          <InputGroup prefix="tailings" registerName="tailings" showFineness />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? '保存中...' : (
              <>
                <Save className="w-5 h-5 mr-2" />
                保存并计算
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
