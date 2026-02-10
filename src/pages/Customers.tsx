import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiClient } from '../api/client';

type Customer = { id: string; name: string; contact: string; phone: string; code: string; createdAt: string; updatedAt: string };

const emptyForm = () => ({ name: '', contact: '', phone: '', code: '' });

export const Customers: React.FC = () => {
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getCustomers();
      setList(data);
    } catch (err: any) {
      setError(err?.message || '加载失败');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('请填写客户名称');
      return;
    }
    if (!form.code.trim()) {
      setError('请填写客户编码');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.createCustomer({
        name: form.name.trim(),
        code: form.code.trim(),
        contact: form.contact.trim() || undefined,
        phone: form.phone.trim() || undefined,
      });
      setForm(emptyForm());
      await fetchList();
    } catch (err: any) {
      setError(err?.message || '新增失败');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({ name: c.name, contact: c.contact || '', phone: c.phone || '', code: c.code });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    if (!form.name.trim()) {
      setError('请填写客户名称');
      return;
    }
    if (!form.code.trim()) {
      setError('请填写客户编码');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.updateCustomer(editingId, {
        name: form.name.trim(),
        code: form.code.trim(),
        contact: form.contact.trim() || undefined,
        phone: form.phone.trim() || undefined,
      });
      setEditingId(null);
      setForm(emptyForm());
      await fetchList();
    } catch (err: any) {
      setError(err?.message || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除该客户吗？')) return;
    setDeletingId(id);
    setError(null);
    try {
      await apiClient.deleteCustomer(id);
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm());
      }
      await fetchList();
    } catch (err: any) {
      setError(err?.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">客户维护</h1>
      <p className="text-slate-600 mb-6">手动录入并维护客户信息：客户名称、客户联系人、联系电话、客户编码。</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* 新增表单 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
          <Plus className="w-4 h-4 mr-2" /> 新增客户
        </h2>
        <form onSubmit={handleSubmitAdd} className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">客户名称 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm w-40"
              placeholder="必填"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">客户编码 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm w-32"
              placeholder="必填，唯一"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">客户联系人</label>
            <input
              type="text"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm w-32"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">联系电话</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm w-36"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </form>
      </div>

      {/* 客户列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">加载中...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-slate-500">暂无客户，请在上方新增。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">客户编码</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">客户名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">客户联系人</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">联系电话</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase w-28">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    {editingId === c.id ? (
                      <>
                        <td colSpan={5} className="px-4 py-3 bg-slate-50">
                          <form onSubmit={handleSubmitEdit} className="flex flex-wrap items-center gap-3">
                            <input
                              type="text"
                              value={form.code}
                              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                              className="px-2 py-1.5 border border-slate-300 rounded text-sm w-28"
                              placeholder="客户编码"
                            />
                            <input
                              type="text"
                              value={form.name}
                              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                              className="px-2 py-1.5 border border-slate-300 rounded text-sm w-32"
                              placeholder="客户名称"
                            />
                            <input
                              type="text"
                              value={form.contact}
                              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                              className="px-2 py-1.5 border border-slate-300 rounded text-sm w-28"
                              placeholder="联系人"
                            />
                            <input
                              type="text"
                              value={form.phone}
                              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                              className="px-2 py-1.5 border border-slate-300 rounded text-sm w-32"
                              placeholder="联系电话"
                            />
                            <button type="submit" disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
                              {saving ? '保存中...' : '保存'}
                            </button>
                            <button type="button" onClick={cancelEdit} className="px-3 py-1.5 border border-slate-300 rounded text-sm">
                              取消
                            </button>
                          </form>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.code}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{c.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{c.contact || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{c.phone || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-md"
                            title="编辑"
                          >
                            <Pencil className="w-4 h-4 inline" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
                            disabled={deletingId === c.id}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
