import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ClipboardList, BarChart3, History } from 'lucide-react';
import { clsx } from 'clsx';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: '数据录入', icon: ClipboardList },
    { path: '/balance', label: '金属平衡表', icon: BarChart3 },
    { path: '/history', label: '历史记录', icon: History },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-900 text-white shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-6 h-6 text-blue-400" />
              <span className="text-xl font-bold">选矿生产管理系统</span>
            </div>
            <div className="flex space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    location.pathname === item.path
                      ? 'bg-slate-800 text-blue-400'
                      : 'hover:bg-slate-800 text-slate-300'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
};
