import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { BarChart3, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaValue, setCaptchaValue] = useState('');
  const [captcha, setCaptcha] = useState<{ captchaId: string; svg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const fetchCaptcha = useCallback(async () => {
    try {
      const data = await apiClient.getCaptcha();
      setCaptcha(data);
      setCaptchaValue('');
    } catch {
      setCaptcha(null);
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!captcha) {
      setError('验证码加载失败，请刷新页面');
      return;
    }
    if (!captchaValue.trim()) {
      setError('请输入验证码');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.login(username.trim(), password, captcha.captchaId, captchaValue.trim());
      login(res.token, res.username);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || '登录失败');
      fetchCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center gap-2 mb-8">
          <BarChart3 className="w-8 h-8 text-blue-600" />
          <span className="text-xl font-bold text-slate-800">超凡选矿厂管理系统</span>
        </div>
        <h1 className="text-lg font-semibold text-slate-800 text-center mb-6">用户登录</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入用户名"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入密码"
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">验证码</label>
            <div className="flex gap-2 items-center">
              <div className="flex-1 min-h-[50px] border border-slate-300 rounded-lg bg-slate-50 overflow-hidden flex items-center justify-center [&_svg]:max-w-full [&_svg]:max-h-[50px]">
                {captcha ? (
                  <div
                    className="select-none"
                    dangerouslySetInnerHTML={{ __html: captcha.svg }}
                    role="img"
                    aria-label="验证码"
                  />
                ) : (
                  <span className="text-slate-500 text-sm">加载中...</span>
                )}
              </div>
              <button
                type="button"
                onClick={fetchCaptcha}
                className="p-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 shrink-0"
                title="刷新验证码"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <input
                type="text"
                value={captchaValue}
                onChange={(e) => setCaptchaValue(e.target.value.slice(0, 8))}
                className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-mono"
                placeholder="请输入"
                maxLength={8}
                autoComplete="off"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
};
