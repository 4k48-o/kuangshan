import React, { useState } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import {
  ClipboardList,
  BarChart3,
  LineChart,
  FileText,
  LogOut,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Activity,
  TrendingUp,
  Settings,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';

type NavItemBase = { label: string; icon: React.ComponentType<{ className?: string }> };
type NavItemLink = NavItemBase & { path: string; comingSoon?: false };
type NavItemComingSoon = NavItemBase & { path?: string; comingSoon: true };
type NavItemOne = NavItemLink | NavItemComingSoon;
type NavItemGroup = NavItemBase & { children: NavItemOne[] };

const menuConfig: (NavItemLink | NavItemGroup | NavItemComingSoon)[] = [
  { path: '/', label: '数据录入', icon: ClipboardList },
  { path: '/balance', label: '金属平衡表', icon: BarChart3 },
  {
    label: '报表',
    icon: FileText,
    children: [
      { path: '/daily-report', label: '日报表', icon: FileText },
      { path: '/monthly-report', label: '月报表', icon: FileText },
      { label: '年报表', icon: FileText, comingSoon: true },
    ],
  },
  {
    label: '数据分析',
    icon: LineChart,
    children: [
      { path: '/analysis/overview', label: '综合概览', icon: LayoutDashboard },
      { path: '/analysis/efficiency', label: '生产效率', icon: Activity },
      { path: '/analysis/quality', label: '质量指标', icon: TrendingUp },
      { path: '/analysis/shift', label: '班次对比', icon: BarChart3 },
    ],
  },
  { label: '系统设计', icon: Settings, comingSoon: true },
];

const isGroup = (item: NavItemOne | NavItemGroup): item is NavItemGroup =>
  'children' in item && Array.isArray((item as NavItemGroup).children);

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { username, logout } = useAuth();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    报表: location.pathname.startsWith('/daily-report') || location.pathname.startsWith('/monthly-report'),
    数据分析: location.pathname.startsWith('/analysis'),
  }));

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = async () => {
    await apiClient.logout();
    logout();
    navigate('/login', { replace: true });
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isGroupOpen = (group: NavItemGroup) => {
    return group.children.some((c) => !c.comingSoon && c.path && isActive(c.path));
  };

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white flex print:block">
      {/* Left Sidebar */}
      <aside className="w-56 bg-slate-900 text-white flex flex-col flex-shrink-0 print:hidden">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-blue-400" />
            <span className="text-base font-bold truncate">超凡选矿厂管理系统</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {menuConfig.map((item, idx) => {
            if (isGroup(item)) {
              const open = expanded[item.label] ?? isGroupOpen(item);
              return (
                <div key={item.label} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.label)}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium rounded-none transition-colors',
                      open ? 'text-blue-400 bg-slate-800' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {item.label}
                    </span>
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {open && (
                    <div className="bg-slate-800/50">
                      {item.children.map((child) => {
                        if (child.comingSoon) {
                          return (
                            <div
                              key={child.label}
                              className="flex items-center gap-2 px-4 py-2 pl-8 text-slate-500 text-sm"
                            >
                              <child.icon className="w-4 h-4 flex-shrink-0" />
                              {child.label}
                              <span className="text-xs text-slate-500">（待开发）</span>
                            </div>
                          );
                        }
                        const path = (child as NavItemLink).path;
                        const active = isActive(path);
                        return (
                          <NavLink
                            key={path}
                            to={path}
                            className={({ isActive: a }) =>
                              clsx(
                                'flex items-center gap-2 px-4 py-2 pl-8 text-sm transition-colors',
                                a ? 'bg-slate-700 text-blue-400' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                              )
                            }
                          >
                            <child.icon className="w-4 h-4 flex-shrink-0" />
                            {child.label}
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            if ((item as NavItemComingSoon).comingSoon) {
              return (
                <div
                  key={item.label}
                  className="flex items-center gap-2 px-4 py-2.5 text-slate-500 text-sm"
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                  <span className="text-xs">（待开发）</span>
                </div>
              );
            }
            const path = (item as NavItemLink).path;
            return (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-none transition-colors',
                    isActive ? 'bg-slate-800 text-blue-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )
                }
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <div className="flex items-center justify-between px-2 py-1.5 text-slate-400 text-sm">
            <span className="truncate">{username}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-slate-400 hover:text-white transition-colors"
              title="退出"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 print:contents">
        <main className="flex-1 container mx-auto px-4 py-8 print:p-0 print:max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
};
