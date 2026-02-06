import React from 'react';
import { MetalBalance } from './MetalBalance';

export const History: React.FC = () => {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">历史记录</h1>
        <p className="text-slate-500">查看历史报表数据</p>
      </div>
      <MetalBalance />
    </div>
  );
};
