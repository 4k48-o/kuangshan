import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { apiClient } from '../api/client';

export const WeighingUpload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; count?: number; message?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setResult(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('请先选择 Excel 文件');
      return;
    }
    const ext = (file.name || '').toLowerCase();
    if (!ext.endsWith('.xls') && !ext.endsWith('.xlsx')) {
      setError('仅支持 .xls 或 .xlsx 文件');
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiClient.uploadWeighingExcel(file);
      setResult({ success: true, count: res.count, message: res.message });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">称重数据上传</h1>
      <p className="text-slate-600 mb-6">上传原矿入库称重记录 Excel，表格需包含表头：车号、上传时间、毛重、皮重、净重。表格中填写千克(kg)，系统按吨(t)展示。</p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          onChange={handleSelect}
          className="hidden"
        />
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-slate-50 transition-colors"
        >
          <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <p className="text-slate-600 mb-1">点击选择或拖拽 Excel 文件到此处</p>
          <p className="text-sm text-slate-400">支持 .xls、.xlsx</p>
          {file && <p className="mt-3 text-blue-600 font-medium">{file.name}</p>}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? '上传中...' : '上传'}
          </button>
        </div>

        {result?.success && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-green-50 text-green-800 rounded-lg">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>{result.message}</span>
          </div>
        )}
        {error && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 text-red-800 rounded-lg">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
