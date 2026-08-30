/**
 * API 客户端（真实接入后端）· 纯 JS 版本
 */
var API_BASE = '/api';

var token = localStorage.getItem('stzero_token');

function getToken() {
  return token;
}

function setToken(t) {
  token = t;
  if (t) localStorage.setItem('stzero_token', t);
  else localStorage.removeItem('stzero_token');
}

function isLoggedIn() {
  return !!token;
}

function request(method, path, body) {
  var headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(API_BASE + path, {
    method: method,
    headers: headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(function (res) {
    if (res.status === 401) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('stzero:logout'));
      throw new Error('未登录或登录已过期');
    }
    if (!res.ok) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        throw new Error(data.error || '请求失败 (' + res.status + ')');
      });
    }
    return res.json();
  });
}

var api = {
  // 认证
  login: function (username, password) {
    return request('POST', '/auth/login', { username: username, password: password });
  },
  register: function (username, password, display_name) {
    return request('POST', '/auth/register', { username: username, password: password, display_name: display_name });
  },
  me: function () {
    return request('GET', '/auth/me');
  },

  // 角色卡
  listCharacters: function () {
    return request('GET', '/characters');
  },
  getCharacter: function (id) {
    return request('GET', '/characters/' + id);
  },
  createCharacter: function (data) {
    return request('POST', '/characters', data);
  },
  updateCharacter: function (id, data) {
    return request('PATCH', '/characters/' + id, data);
  },
  deleteCharacter: function (id, deleteChats) {
    return request('DELETE', '/characters/' + id + '?delete_chats=' + (deleteChats ? 'true' : 'false'));
  },
  importCharacter: function (file, fileType) {
    var fd = new FormData();
    fd.append('file', file);
    fd.append('file_type', fileType);
    return fetch(API_BASE + '/characters/import', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: fd,
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(data.error || '导入失败');
        });
      }
      return res.json();
    });
  },

  // 聊天
  listChats: function (characterId) {
    return request('GET', '/chats' + (characterId ? '?characterId=' + characterId : ''));
  },
  createChat: function (characterId, title) {
    return request('POST', '/chats', { character_id: characterId, title: title });
  },
  getChat: function (id) {
    return request('GET', '/chats/' + id);
  },
  deleteChat: function (id) {
    return request('DELETE', '/chats/' + id);
  },

  // 世界书
  listWorlds: function () {
    return request('GET', '/worlds');
  },
  getWorld: function (id) {
    return request('GET', '/worlds/' + id);
  },
  createWorld: function (name) {
    return request('POST', '/worlds', { name: name });
  },
  updateWorld: function (id, data) {
    return request('PUT', '/worlds/' + id, data);
  },
  deleteWorld: function (id) {
    return request('DELETE', '/worlds/' + id);
  },

  // 设置
  getSettings: function () {
    return request('GET', '/settings');
  },
  updateSettings: function (data) {
    return request('PUT', '/settings', data);
  },

  // 管理
  adminUsers: function () {
    return request('GET', '/admin/users');
  },
  adminCreateUser: function (data) {
    return request('POST', '/admin/users', data);
  },
  adminUpdateUser: function (id, data) {
    return request('PATCH', '/admin/users/' + id, data);
  },
  adminDeleteUser: function (id) {
    return request('DELETE', '/admin/users/' + id);
  },
};

/** 角色卡图片 URL */
function avatarUrl(path) {
  return '/files/' + path;
}

// 挂载到全局（普通 script 加载，非 ES module）
window.api = api;
window.getToken = getToken;
window.setToken = setToken;
window.isLoggedIn = isLoggedIn;
window.avatarUrl = avatarUrl;
