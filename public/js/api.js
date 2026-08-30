/**
 * API 客户端（真实接入后端）
 */
const API_BASE = '/api';

let token: string | null = localStorage.getItem('stzero_token');

function getToken(): string | null {
  return token;
}

function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('stzero_token', t);
  else localStorage.removeItem('stzero_token');
}

function isLoggedIn(): boolean {
  return !!token;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('stzero:logout'));
    throw new Error('未登录或登录已过期');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const api = {
  // 认证
  login: (username: string, password: string) =>
    request<{ token: string; user: unknown }>('POST', '/auth/login', { username, password }),
  register: (username: string, password: string, display_name?: string) =>
    request<{ token: string; user: unknown }>('POST', '/auth/register', { username, password, display_name }),
  me: () => request<{ user: unknown }>('GET', '/auth/me'),

  // 角色卡
  listCharacters: () => request<{ characters: Array<Record<string, unknown>> }>('GET', '/characters'),
  getCharacter: (id: string) => request<{ character: Record<string, unknown>; card: unknown }>('GET', `/characters/${id}`),
  createCharacter: (data: Record<string, unknown>) => request<{ id: string; avatar_path: string }>('POST', '/characters', data),
  updateCharacter: (id: string, data: Record<string, unknown>) => request<{ ok: boolean; name: string }>('PATCH', `/characters/${id}`, data),
  deleteCharacter: (id: string, deleteChats = false) =>
    request<{ ok: boolean }>('DELETE', `/characters/${id}?delete_chats=${deleteChats}`),
  importCharacter: (file: File, fileType: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('file_type', fileType);
    return fetch(`${API_BASE}/characters/import`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || '导入失败');
      }
      return res.json();
    });
  },

  // 聊天
  listChats: (characterId?: string) =>
    request<{ chats: Array<Record<string, unknown>> }>('GET', `/chats${characterId ? `?characterId=${characterId}` : ''}`),
  createChat: (characterId: string, title?: string) =>
    request<{ id: string }>('POST', '/chats', { character_id: characterId, title }),
  getChat: (id: string) => request<{ chat: Record<string, unknown>; header: unknown; messages: unknown[] }>('GET', `/chats/${id}`),
  deleteChat: (id: string) => request<{ ok: boolean }>('DELETE', `/chats/${id}`),

  // 世界书
  listWorlds: () => request<{ worlds: Array<Record<string, unknown>> }>('GET', '/worlds'),
  getWorld: (id: string) => request<{ world: Record<string, unknown>; data: unknown }>('GET', `/worlds/${id}`),
  createWorld: (name: string) => request<{ id: string }>('POST', '/worlds', { name }),
  updateWorld: (id: string, data: unknown) => request<{ ok: boolean }>('PUT', `/worlds/${id}`, data),
  deleteWorld: (id: string) => request<{ ok: boolean }>('DELETE', `/worlds/${id}`),

  // 设置
  getSettings: () => request<{ settings: Record<string, unknown> }>('GET', '/settings'),
  updateSettings: (data: Record<string, unknown>) => request<{ ok: boolean; settings: Record<string, unknown> }>('PUT', '/settings', data),

  // 管理
  adminUsers: () => request<{ users: Array<Record<string, unknown>> }>('GET', '/admin/users'),
  adminCreateUser: (data: Record<string, unknown>) => request<{ user: Record<string, unknown> }>('POST', '/admin/users', data),
  adminUpdateUser: (id: string, data: Record<string, unknown>) => request<{ user: Record<string, unknown> }>('PATCH', `/admin/users/${id}`, data),
  adminDeleteUser: (id: string) => request<{ ok: boolean }>('DELETE', `/admin/users/${id}`),
};

/** 角色卡图片 URL */
function avatarUrl(path: string): string {
  return `/files/${path}`;
}

// 挂载到全局（普通 script 加载，非 ES module）
window.api = api;
window.getToken = getToken;
window.setToken = setToken;
window.isLoggedIn = isLoggedIn;
window.avatarUrl = avatarUrl;
