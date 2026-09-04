/* ============================================================
   ST-Zero 极简版 · 全新前端逻辑
   纯 JS（无框架），API 客户端 + 全部交互
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(s)); };

  /* ==================== API 客户端 ==================== */
  var API_BASE = '/api';
  var token = localStorage.getItem('stzero_token');

  function getToken() { return token; }
  function setToken(t) {
    token = t;
    if (t) localStorage.setItem('stzero_token', t);
    else localStorage.removeItem('stzero_token');
  }
  function isLoggedIn() { return !!token; }

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
        showLogin();
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
    login: function (username, password) { return request('POST', '/auth/login', { username: username, password: password }); },
    logout: function () { return request('POST', '/auth/logout'); },
    me: function () { return request('GET', '/auth/me'); },
    listCharacters: function () { return request('GET', '/characters'); },
    getCharacter: function (id) { return request('GET', '/characters/' + id); },
    createCharacter: function (data) { return request('POST', '/characters', data); },
    updateCharacter: function (id, data) { return request('PATCH', '/characters/' + id, data); },
    deleteCharacter: function (id, deleteChats) { return request('DELETE', '/characters/' + id + '?delete_chats=' + (deleteChats ? 'true' : 'false')); },
    toggleFav: function (id, fav) { return request('POST', '/characters/' + id + '/fav', { fav: fav }); },
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
    listChats: function (characterId) { return request('GET', '/chats' + (characterId ? '?characterId=' + characterId : '')); },
    createChat: function (characterId, title) { return request('POST', '/chats', { character_id: characterId, title: title }); },
    getChat: function (id) { return request('GET', '/chats/' + id); },
    deleteChat: function (id) { return request('DELETE', '/chats/' + id); },
    editMessage: function (chatId, idx, mes) { return request('PATCH', '/chats/' + chatId + '/messages/' + idx, { mes: mes }); },
    deleteMessage: function (chatId, idx) { return request('DELETE', '/chats/' + chatId + '/messages/' + idx); },
    getChatSettings: function (chatId) { return request('GET', '/chats/' + chatId + '/settings'); },
    updateChatSettings: function (chatId, data) { return request('PUT', '/chats/' + chatId + '/settings', data); },
    exportChat: function (id) {
      return fetch(API_BASE + '/chats/' + id + '/export', {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      }).then(function (res) {
        if (!res.ok) throw new Error('导出失败');
        return res.text();
      });
    },
    importChat: function (characterId, content) { return request('POST', '/chats/import', { character_id: characterId, content: content }); },
    listWorlds: function () { return request('GET', '/worlds'); },
    getWorld: function (id) { return request('GET', '/worlds/' + id); },
    createWorld: function (name) { return request('POST', '/worlds', { name: name }); },
    updateWorld: function (id, data) { return request('PUT', '/worlds/' + id, data); },
    deleteWorld: function (id) { return request('DELETE', '/worlds/' + id); },
    getSettings: function () { return request('GET', '/settings'); },
    updateSettings: function (data) { return request('PUT', '/settings', data); },
    listRegex: function () { return request('GET', '/regex'); },
    createRegex: function (data) { return request('POST', '/regex', data); },
    updateRegex: function (id, data) { return request('PUT', '/regex/' + id, data); },
    deleteRegex: function (id) { return request('DELETE', '/regex/' + id); },
    importRegex: function (data) { return request('POST', '/regex/import', data); },
    listPresets: function () { return request('GET', '/presets'); },
    savePreset: function (data) { return request('POST', '/presets', data); },
    activatePreset: function (name) { return request('POST', '/presets/' + encodeURIComponent(name) + '/activate'); },
    deletePreset: function (name) { return request('DELETE', '/presets/' + encodeURIComponent(name)); },
    listGroups: function () { return request('GET', '/groups'); },
    createGroup: function (name, memberIds) { return request('POST', '/groups', { name: name, member_ids: memberIds }); },
    getGroup: function (id) { return request('GET', '/groups/' + id); },
    updateGroup: function (id, data) { return request('PUT', '/groups/' + id, data); },
    deleteGroup: function (id) { return request('DELETE', '/groups/' + id); },
    getGroupMessages: function (id) { return request('GET', '/groups/' + id + '/messages'); },
    sendGroupMessage: function (id, content, characterId) { return request('POST', '/groups/' + id + '/messages', { content: content, character_id: characterId }); },
    listQuickReplies: function () { return request('GET', '/quick-replies'); },
    createQuickReply: function (label, message) { return request('POST', '/quick-replies', { label: label, message: message }); },
    deleteQuickReply: function (id) { return request('DELETE', '/quick-replies/' + id); },
    adminUsers: function () { return request('GET', '/admin/users'); },
    adminCreateUser: function (data) { return request('POST', '/admin/users', data); },
    adminUpdateUser: function (id, data) { return request('PATCH', '/admin/users/' + id, data); },
    adminDeleteUser: function (id) { return request('DELETE', '/admin/users/' + id); },
  };

  function avatarUrl(path) { return '/files/' + path; }

  /* ==================== 工具 ==================== */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function now() { var d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function toast(type, icon, msg) {
    var t = document.createElement('div');
    t.className = 'toast' + (type === 'success' ? ' toast-success' : type === 'danger' ? ' toast-danger' : '');
    t.innerHTML = '<svg class="ic"><use href="#' + icon + '"/></svg><span>' + esc(msg) + '</span>';
    $('#toast-wrap').appendChild(t);
    setTimeout(function () {
      t.style.transition = 'all 0.4s ease';
      t.style.opacity = '0';
      t.style.transform = 'translateX(24px)';
      setTimeout(function () { t.remove(); }, 400);
    }, 2500);
  }

  /* ==================== 弹窗 ==================== */
  function openModal(title, bodyHtml, footerHtml) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHtml;
    $('#modal-footer').innerHTML = footerHtml || '';
    $('#modal-overlay').classList.add('show');
  }
  function closeModal() { $('#modal-overlay').classList.remove('show'); }
  window.closeModal = closeModal; // 供弹窗内联 onclick 使用
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', function (e) { if (e.target === $('#modal-overlay')) closeModal(); });

  /* ==================== 登录 ==================== */
  function showLogin() {
    $('#main-page').style.display = 'none';
    $('#login-page').style.display = 'flex';
  }
  function showMain() {
    $('#login-page').style.display = 'none';
    $('#main-page').style.display = 'flex';
  }
  function showLoginError(msg) {
    var el = $('#login-error');
    el.textContent = msg;
    el.classList.add('show');
  }
  function doLogin() {
    var username = $('#login-username').value.trim();
    var password = $('#login-password').value;
    if (!username || !password) { showLoginError('请输入用户名和密码'); return; }
    api.login(username, password).then(function (data) {
      setToken(data.token);
      $('#login-error').classList.remove('show');
      $('#login-password').value = '';
      initApp();
    }).catch(function (e) { showLoginError(e.message); });
  }
  $('#login-btn').addEventListener('click', doLogin);
  $('#login-password').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  $('#login-username').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

  /* ==================== 状态 ==================== */
  var state = {
    user: null,
    characters: [],
    currentChar: null,
    chats: [],
    currentChat: null,
    messages: [],
    worlds: [],
    regex: [],
    presets: [],
    activePreset: null,
    groups: [],
    groupMode: false,
    currentGroup: null,
    groupMembers: [],
    sortMode: 'recent',
    charSearch: '',
    isGenerating: false,
    currentCard: null,
  };

  /* ==================== 初始化 ==================== */
  function initApp() {
    showMain();
    api.me().then(function (data) {
      state.user = data.user;
      $('#um-user-info').innerHTML = '<strong>' + esc(data.user.display_name || data.user.username) + '</strong>' + esc(data.user.username) + (data.user.role === 'admin' ? ' · 管理员' : '');
      $('#um-admin').style.display = data.user.role === 'admin' ? 'flex' : 'none';
      $('#user-avatar').textContent = (data.user.display_name || data.user.username)[0].toUpperCase();
      loadAll();
    }).catch(function () { showLogin(); });
  }

  function loadAll() {
    loadCharacters();
    loadWorlds();
    loadRegex();
    loadPresets();
    loadGroups();
    loadSettings();
    loadQuickReplies();
  }

  /* ==================== 角色 ==================== */
  function loadCharacters() {
    api.listCharacters().then(function (data) {
      state.characters = data.characters;
      renderChars();
      if (!state.currentChar && state.characters.length) selectChar(state.characters[0].id);
      else if (!state.characters.length) renderEmptyChat();
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  }

  function renderChars() {
    var list = $('#char-list');
    var chars = state.characters.slice();
    var q = state.charSearch.toLowerCase();
    if (q) chars = chars.filter(function (c) { return (c.name || '').toLowerCase().includes(q) || (c.tags || '').toLowerCase().includes(q); });
    if (state.sortMode === 'az') chars.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    else if (state.sortMode === 'fav') chars.sort(function (a, b) { return (b.fav || 0) - (a.fav || 0); });
    else chars.sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); });

    if (!chars.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon"><svg class="ic"><use href="#i-users"/></svg></div><div class="empty-title">暂无角色</div><div class="empty-desc">点击"新建"创建第一个角色</div></div>';
      return;
    }
    list.innerHTML = chars.map(function (c) {
      var active = state.currentChar && c.id === state.currentChar.id;
      return '<div class="char-item' + (active ? ' active' : '') + '" data-id="' + c.id + '">' +
        '<div class="char-avatar">' + (c.avatar_path ? '<img src="' + avatarUrl(c.avatar_path) + '" alt="">' : esc((c.name || '?')[0])) + '</div>' +
        '<div class="char-info"><div class="char-name">' + esc(c.name) + '</div><div class="char-desc">' + esc(c.description || '') + '</div></div>' +
        (c.fav ? '<div class="char-fav"><svg class="ic ic-fill"><use href="#i-star"/></svg></div>' : '') +
      '</div>';
    }).join('');
    $$('#char-list .char-item').forEach(function (el) {
      el.addEventListener('click', function () { selectChar(el.getAttribute('data-id')); });
    });
  }

  function selectChar(id) {
    state.groupMode = false;
    state.currentGroup = null;
    state.currentChar = state.characters.find(function (c) { return c.id === id; });
    if (!state.currentChar) return;
    renderChars();
    $('#chat-char-name').textContent = state.currentChar.name;
    $('#chat-title').textContent = '· ' + (state.currentChar.description || '');
    loadChats(id);
    loadCharDetail(id);
  }

  function loadCharDetail(id) {
    api.getCharacter(id).then(function (data) {
      state.currentCard = data.card;
      var d = (data.card && data.card.data) || {};
      $('#edit-name').value = d.name || '';
      $('#edit-desc').value = d.description || '';
      $('#edit-personality').value = d.personality || '';
      $('#edit-scenario').value = d.scenario || '';
      $('#edit-first').value = d.first_mes || '';
      $('#edit-example').value = d.mes_example || '';
      renderTags(d.tags || []);
    }).catch(function () {});
  }

  /* ==================== 标签 ==================== */
  var currentTags = [];
  function renderTags(tags) {
    currentTags = Array.isArray(tags) ? tags.slice() : [];
    $('#edit-tags').innerHTML = currentTags.map(function (t) {
      return '<span class="tag">' + esc(t) + '<button class="tag-x" data-tag="' + esc(t) + '"><svg class="ic"><use href="#i-x"/></svg></button></span>';
    }).join('');
    $$('#edit-tags .tag-x').forEach(function (b) {
      b.addEventListener('click', function () {
        currentTags = currentTags.filter(function (t) { return t !== b.getAttribute('data-tag'); });
        renderTags(currentTags);
      });
    });
  }
  $('#edit-tag-field').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && this.value.trim()) {
      e.preventDefault();
      var t = this.value.trim();
      if (currentTags.indexOf(t) === -1) currentTags.push(t);
      this.value = '';
      renderTags(currentTags);
    }
  });

  /* ==================== 聊天 ==================== */
  function loadChats(characterId) {
    api.listChats(characterId).then(function (data) {
      state.chats = data.chats || [];
      if (state.chats.length) loadChat(state.chats[0].id);
      else renderEmptyChat();
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  }

  function renderEmptyChat() {
    state.messages = [];
    state.currentChat = null;
    $('#chat-inner').innerHTML = '<div class="empty"><div class="empty-icon"><svg class="ic"><use href="#i-message"/></svg></div><div class="empty-title">开始一段新的对话</div><div class="empty-line"></div><div class="empty-desc">发送第一条消息开始</div></div>';
  }

  function loadChat(id) {
    api.getChat(id).then(function (data) {
      state.currentChat = data.chat;
      state.messages = data.messages || [];
      renderMessages();
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  }

  function renderMessages() {
    var box = $('#chat-inner');
    if (!state.messages.length) { renderEmptyChat(); return; }
    box.innerHTML = state.messages.map(function (m, i) {
      var isUser = !!m.is_user;
      var name = m.name || (isUser ? '你' : (state.currentChar ? state.currentChar.name : ''));
      var html = '<div class="msg' + (isUser ? ' user' : '') + '" data-idx="' + i + '">' +
        '<div class="msg-avatar">' + esc((name || '?')[0]) + '</div>' +
        '<div class="msg-body">' +
          '<div class="msg-meta"><span class="m-name">' + esc(name) + '</span><span>' + fmtTime(m.send_date) + '</span></div>' +
          '<div class="msg-bubble">' + esc(m.mes) + '</div>';
      if (!isUser && m.swipes && m.swipes.length > 1) {
        html += '<div class="swipe-row">' +
          '<button class="swipe-btn" data-swipe="-1"><svg class="ic"><use href="#i-chevron-left"/></svg></button>' +
          '<span class="swipe-count">' + ((m.swipe_id || 0) + 1) + '/' + m.swipes.length + '</span>' +
          '<button class="swipe-btn" data-swipe="1"><svg class="ic"><use href="#i-chevron-right"/></svg></button>' +
        '</div>';
      }
      html += '<div class="msg-actions">' +
        '<button class="msg-act" data-act="copy"><svg class="ic"><use href="#i-copy"/></svg></button>' +
        '<button class="msg-act" data-act="edit"><svg class="ic"><use href="#i-pencil"/></svg></button>' +
        '<button class="msg-act" data-act="del"><svg class="ic"><use href="#i-trash"/></svg></button>' +
      '</div></div></div>';
      return html;
    }).join('');
    box.scrollIntoView({ block: 'end' });
    bindMsgActions();
  }

  function bindMsgActions() {
    $$('#chat-inner .swipe-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = parseInt(b.closest('.msg').getAttribute('data-idx'));
        var m = state.messages[idx];
        var dir = parseInt(b.getAttribute('data-swipe'));
        var next = Math.max(0, Math.min(m.swipes.length - 1, (m.swipe_id || 0) + dir));
        m.swipe_id = next;
        m.mes = m.swipes[next];
        renderMessages();
      });
    });
    $$('#chat-inner .msg-act').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = parseInt(b.closest('.msg').getAttribute('data-idx'));
        var act = b.getAttribute('data-act');
        var m = state.messages[idx];
        if (act === 'copy') {
          navigator.clipboard && navigator.clipboard.writeText(m.mes);
          toast('success', 'i-check', '已复制');
        }
        if (act === 'del') {
          if (!state.currentChat) return;
          api.deleteMessage(state.currentChat.id, idx).then(function () {
            state.messages.splice(idx, 1);
            renderMessages();
          }).catch(function (e) { toast('danger', 'i-alert', e.message); });
        }
        if (act === 'edit') {
          openModal('编辑消息',
            '<div class="field"><label class="field-label">内容</label><textarea id="edit-msg-text" style="min-height:120px">' + esc(m.mes) + '</textarea></div>',
            '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-ok-edit-msg">保存</button>');
          $('#modal-ok-edit-msg').addEventListener('click', function () {
            var text = $('#edit-msg-text').value;
            api.editMessage(state.currentChat.id, idx, text).then(function () {
              m.mes = text;
              renderMessages();
              closeModal();
              toast('success', 'i-check', '已保存');
            }).catch(function (e) { toast('danger', 'i-alert', e.message); });
          });
        }
      });
    });
  }

  /* ==================== 发送消息（SSE 流式） ==================== */
  function send() {
    var input = $('#chat-input');
    var text = input.value.trim();
    if (!text || state.isGenerating) return;
    if (state.groupMode) { sendGroup(text); return; }
    if (!state.currentChat) {
      // 无聊天时自动创建
      api.createChat(state.currentChar.id, text.slice(0, 20)).then(function (data) {
        state.currentChat = { id: data.id };
        doSend(text);
      }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      return;
    }
    doSend(text);
  }

  function doSend(text) {
    var input = $('#chat-input');
    input.value = '';
    state.isGenerating = true;
    $('#send-btn').disabled = true;

    // 本地追加用户消息
    var userMsg = { name: state.user.display_name || state.user.username, is_user: true, send_date: Date.now(), mes: text };
    state.messages.push(userMsg);
    renderMessages();

    // 追加 typing 指示
    var typing = document.createElement('div');
    typing.className = 'msg';
    typing.id = 'typing-msg';
    typing.innerHTML = '<div class="msg-avatar">' + esc((state.currentChar ? state.currentChar.name : '?')[0]) + '</div><div class="msg-body"><div class="typing"><span></span><span></span><span></span></div></div>';
    $('#chat-inner').appendChild(typing);
    typing.scrollIntoView({ block: 'end' });

    var chatId = state.currentChat.id;
    fetch(API_BASE + '/chats/' + chatId + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ content: text }),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(data.error || '发送失败');
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var aiMsg = { name: state.currentChar.name, is_user: false, send_date: Date.now(), mes: '', swipes: [], swipe_id: 0 };
      state.messages.push(aiMsg);
      typing.remove();
      renderMessages();
      var bubble = document.querySelector('.msg[data-idx="' + (state.messages.length - 1) + '"] .msg-bubble');
      var full = '';
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          var text2 = decoder.decode(r.value, { stream: true });
          var lines = text2.split('\n');
          lines.forEach(function (line) {
            if (!line.startsWith('data: ')) return;
            var data;
            try { data = JSON.parse(line.slice(6)); } catch (e) { return; }
            if (data.delta) {
              full += data.delta;
              aiMsg.mes = full;
              if (bubble) bubble.textContent = full;
              bubble && bubble.scrollIntoView({ block: 'end' });
            }
            if (data.done && data.message) {
              aiMsg.mes = data.message.mes;
              aiMsg.swipes = data.message.swipes || [data.message.mes];
              aiMsg.swipe_id = data.message.swipe_id || 0;
              if (bubble) bubble.textContent = data.message.mes;
              renderMessages();
            }
            if (data.error) {
              toast('danger', 'i-alert', data.error);
              state.messages.pop();
              renderMessages();
            }
          });
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      typing.remove();
      state.messages.pop();
      renderMessages();
      toast('danger', 'i-alert', e.message);
    }).finally(function () {
      state.isGenerating = false;
      $('#send-btn').disabled = false;
    });
  }

  $('#send-btn').addEventListener('click', send);
  $('#chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  /* ==================== 快捷回复 ==================== */
  var quickReplies = [];
  function loadQuickReplies() {
    api.listQuickReplies().then(function (data) {
      quickReplies = data.quickReplies || [];
      renderQuickReplies();
    }).catch(function () {});
  }
  function renderQuickReplies() {
    var menu = $('#qr-menu');
    if (!quickReplies.length) {
      menu.innerHTML = '<div class="qr-empty">暂无快捷回复</div>' +
        '<div class="dropdown-sep"></div>' +
        '<button class="qr-item" id="qr-manage"><svg class="ic"><use href="#i-settings"/></svg>管理快捷回复</button>';
    } else {
      menu.innerHTML = quickReplies.map(function (q) {
        return '<button class="qr-item" data-qr="' + esc(q.id) + '"><span class="qr-label">' + esc(q.label) + '</span><span class="qr-msg">' + esc(q.message) + '</span></button>';
      }).join('') +
      '<div class="dropdown-sep"></div>' +
      '<button class="qr-item" id="qr-manage"><svg class="ic"><use href="#i-settings"/></svg>管理快捷回复</button>';
    }
    $$('#qr-menu [data-qr]').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = quickReplies.find(function (x) { return x.id === b.getAttribute('data-qr'); });
        if (q) {
          var input = $('#chat-input');
          input.value = q.message;
          input.focus();
          input.dispatchEvent(new Event('input'));
        }
        $('#qr-wrap').classList.remove('open');
      });
    });
    var manage = $('#qr-manage');
    if (manage) manage.addEventListener('click', function () { openQrManager(); });
  }
  function openQrManager() {
    var body = '<div class="btn-row" style="margin-bottom:12px"><button class="btn primary" id="qr-add" style="flex:1"><svg class="ic"><use href="#i-plus"/></svg> 添加快捷回复</button></div>' +
      '<div class="wi-list" id="qr-list">' +
      (quickReplies.length ? quickReplies.map(function (q) {
        return '<div class="wi-item" data-qr="' + q.id + '"><div class="wi-k">' + esc(q.label) + '</div><div class="wi-c">' + esc(q.message) + '</div></div>';
      }).join('') : '<div class="qr-empty">暂无快捷回复</div>') +
      '</div>';
    openModal('快捷回复', body, '<button class="btn" onclick="closeModal()">关闭</button>');
    $('#qr-add').addEventListener('click', function () {
      openModal('添加快捷回复',
        '<div class="field"><label class="field-label">标签</label><input id="qr-label" placeholder="如：早安问候"></div>' +
        '<div class="field"><label class="field-label">内容</label><textarea id="qr-message" style="min-height:80px" placeholder="回复内容…"></textarea></div>',
        '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="qr-ok">添加</button>');
      $('#qr-ok').addEventListener('click', function () {
        var label = $('#qr-label').value.trim();
        var message = $('#qr-message').value.trim();
        if (!label || !message) { toast('danger', 'i-alert', '标签和内容不能为空'); return; }
        api.createQuickReply(label, message).then(function (data) {
          if (data && data.quickReply) quickReplies.push(data.quickReply);
          closeModal();
          openQrManager();
          renderQuickReplies();
          toast('success', 'i-check', '已添加');
        }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      });
    });
    $$('#qr-list [data-qr]').forEach(function (el) {
      el.addEventListener('click', function () {
        var qid = el.getAttribute('data-qr');
        var q = quickReplies.find(function (x) { return x.id === qid; });
        openModal('删除快捷回复',
          '<p style="font-size:13px;color:var(--ink-2)">删除「' + esc(q.label) + '」？</p>',
          '<button class="btn" onclick="closeModal()">取消</button><button class="btn danger" id="qr-del">删除</button>');
        $('#qr-del').addEventListener('click', function () {
          api.deleteQuickReply(qid).then(function () {
            quickReplies = quickReplies.filter(function (x) { return x.id !== qid; });
            closeModal();
            openQrManager();
            renderQuickReplies();
            toast('success', 'i-check', '已删除');
          }).catch(function (e) { toast('danger', 'i-alert', e.message); });
        });
      });
    });
  }
  $('#btn-qr').addEventListener('click', function (e) {
    e.stopPropagation();
    $('#qr-wrap').classList.toggle('open');
  });
  document.addEventListener('click', function () { $('#qr-wrap').classList.remove('open'); });
  $('#chat-input').addEventListener('input', function () {
    var hasText = this.value.trim().length > 0;
    var btn = $('#send-btn');
    if (hasText) {
      btn.style.color = 'var(--ink-1)';
      btn.style.background = document.documentElement.getAttribute('data-theme') === 'light' ? '#e8e6e2' : '#3a3a3a';
    } else {
      btn.style.color = '';
      btn.style.background = '';
    }
  });

  /* ==================== 世界书 ==================== */
  function loadWorlds() {
    api.listWorlds().then(function (data) {
      state.worlds = data.worlds || [];
      renderWorlds();
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  }

  function renderWorlds() {
    var list = $('#world-list');
    if (!state.worlds.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon"><svg class="ic"><use href="#i-book"/></svg></div><div class="empty-title">暂无世界书</div><div class="empty-desc">创建第一个世界书</div></div>';
      return;
    }
    list.innerHTML = state.worlds.map(function (w) {
      return '<div class="wi-item" data-id="' + w.id + '"><div class="wi-k">' + esc(w.name) + '</div><div class="wi-c">' + esc(w.updated_at ? '更新于 ' + fmtTime(w.updated_at) : '') + '</div></div>';
    }).join('');
    $$('#world-list .wi-item').forEach(function (el) {
      el.addEventListener('click', function () { openWorldEditor(el.getAttribute('data-id')); });
    });
  }

  function openWorldEditor(id) {
    api.getWorld(id).then(function (data) {
      var entries = Object.values(data.data.entries || {});
      var body = '<div class="field"><label class="field-label">世界书名称</label><input id="world-name" value="' + esc(data.world.name) + '"></div>' +
        '<div class="section-title">条目（' + entries.length + '）</div>' +
        '<div class="wi-list" id="world-entries">' +
        entries.map(function (e) {
          return '<div class="wi-item" data-uid="' + e.uid + '"><div class="wi-k">' + esc((e.key || []).join(', ')) + '</div><div class="wi-c">' + esc((e.content || '').slice(0, 60)) + '</div></div>';
        }).join('') +
        '</div>';
      openModal('世界书', body,
        '<button class="btn" onclick="closeModal()">关闭</button><button class="btn primary" id="modal-save-world">保存</button>');
      $$('#world-entries .wi-item').forEach(function (el) {
        el.addEventListener('click', function () { openEntryEditor(data, parseInt(el.getAttribute('data-uid'))); });
      });
      $('#modal-save-world').addEventListener('click', function () {
        var name = $('#world-name').value.trim();
        if (!name) { toast('danger', 'i-alert', '请输入名称'); return; }
        data.data.name = name;
        api.updateWorld(id, data.data).then(function () {
          closeModal();
          loadWorlds();
          toast('success', 'i-check', '已保存');
        }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      });
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  }

  function openEntryEditor(worldData, uid) {
    var entries = worldData.data.entries || {};
    var e = entries[uid] || { uid: uid, key: [], content: '' };
    var body =
      '<div class="field"><label class="field-label">触发词（逗号分隔）</label><input id="entry-keys" value="' + esc((e.key || []).join(', ')) + '"></div>' +
      '<div class="field"><label class="field-label">内容</label><textarea id="entry-content" style="min-height:120px">' + esc(e.content || '') + '</textarea></div>' +
      '<label class="check-row"><input type="checkbox" id="entry-constant"' + (e.constant ? ' checked' : '') + '> 常驻</label>';
    openModal('世界书条目', body,
      '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-save-entry">保存</button>');
    $('#modal-save-entry').addEventListener('click', function () {
      e.key = $('#entry-keys').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      e.content = $('#entry-content').value;
      e.constant = $('#entry-constant').checked;
      entries[uid] = e;
      api.updateWorld(worldData.world.id, worldData.data).then(function () {
        closeModal();
        openWorldEditor(worldData.world.id);
        toast('success', 'i-check', '已保存');
      }).catch(function (err) { toast('danger', 'i-alert', err.message); });
    });
  }

  $('#btn-new-world').addEventListener('click', function () {
    openModal('新建世界书', '<div class="field"><label class="field-label">名称</label><input id="new-world-name" placeholder="世界书名称"></div>',
      '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-ok-world">创建</button>');
    $('#modal-ok-world').addEventListener('click', function () {
      var name = $('#new-world-name').value.trim();
      if (!name) { toast('danger', 'i-alert', '请输入名称'); return; }
      api.createWorld(name).then(function () {
        closeModal();
        loadWorlds();
        toast('success', 'i-check', '已创建');
      }).catch(function (e) { toast('danger', 'i-alert', e.message); });
    });
  });

  $('#btn-import-world').addEventListener('click', function () { $('#import-world-json').click(); });
  $('#import-world-json').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        api.createWorld(data.name || '导入世界书').then(function (res) {
          return api.updateWorld(res.id, data);
        }).then(function () {
          loadWorlds();
          toast('success', 'i-check', '已导入');
        }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      } catch (e) { toast('danger', 'i-alert', '无效的 JSON'); }
    };
    r.readAsText(f);
    this.value = '';
  });

  /* ==================== 正则 ==================== */
  function loadRegex() {
    api.listRegex().then(function (data) {
      state.regex = data.scripts || [];
      renderRegex();
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  }

  function renderRegex() {
    var list = $('#regex-list');
    if (!state.regex.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon"><svg class="ic"><use href="#i-wrench"/></svg></div><div class="empty-title">暂无正则脚本</div></div>';
      return;
    }
    list.innerHTML = state.regex.map(function (r) {
      return '<div class="rx-item" data-id="' + r.id + '">' +
        '<div class="rx-body"><div class="rx-name">' + esc(r.scriptName) + '</div><div class="rx-desc">' + esc(r.findRegex || '') + '</div></div>' +
        '<div class="' + (r.disabled ? 'rx-off' : 'rx-on') + '" data-toggle="' + r.id + '"></div>' +
      '</div>';
    }).join('');
    $$('#regex-list .rx-item .rx-on, #regex-list .rx-item .rx-off').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-toggle');
        var script = state.regex.find(function (r) { return r.id === id; });
        if (!script) return;
        api.updateRegex(id, { disabled: !script.disabled }).then(function () {
          script.disabled = !script.disabled;
          renderRegex();
        }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      });
    });
    $$('#regex-list .rx-item .rx-name').forEach(function (el) {
      el.addEventListener('click', function () { openRegexEditor(el.closest('.rx-item').getAttribute('data-id')); });
    });
  }

  function openRegexEditor(id) {
    var r = state.regex.find(function (s) { return s.id === id; });
    if (!r) return;
    var body =
      '<div class="field"><label class="field-label">名称</label><input id="rx-name" value="' + esc(r.scriptName) + '"></div>' +
      '<div class="field"><label class="field-label">查找</label><input id="rx-find" value="' + esc(r.findRegex || '') + '"></div>' +
      '<div class="field"><label class="field-label">替换</label><input id="rx-replace" value="' + esc(r.replaceString || '') + '"></div>' +
      '<label class="check-row"><input type="checkbox" id="rx-disabled"' + (r.disabled ? ' checked' : '') + '> 禁用</label>' +
      '<label class="check-row"><input type="checkbox" id="rx-prompt-only"' + (r.promptOnly ? ' checked' : '') + '> 仅提示词</label>';
    openModal('正则脚本', body,
      '<button class="btn" onclick="closeModal()">取消</button><button class="btn danger" id="modal-del-rx">删除</button><button class="btn primary" id="modal-save-rx">保存</button>');
    $('#modal-save-rx').addEventListener('click', function () {
      api.updateRegex(id, {
        scriptName: $('#rx-name').value.trim(),
        findRegex: $('#rx-find').value,
        replaceString: $('#rx-replace').value,
        disabled: $('#rx-disabled').checked,
        promptOnly: $('#rx-prompt-only').checked,
      }).then(function () {
        closeModal();
        loadRegex();
        toast('success', 'i-check', '已保存');
      }).catch(function (e) { toast('danger', 'i-alert', e.message); });
    });
    $('#modal-del-rx').addEventListener('click', function () {
      api.deleteRegex(id).then(function () {
        closeModal();
        loadRegex();
        toast('success', 'i-check', '已删除');
      }).catch(function (e) { toast('danger', 'i-alert', e.message); });
    });
  }

  $('#btn-new-regex').addEventListener('click', function () {
    openModal('新建正则脚本',
      '<div class="field"><label class="field-label">名称</label><input id="new-regex-name" placeholder="脚本名称"></div>' +
      '<div class="field"><label class="field-label">查找</label><input id="new-regex-find" placeholder="正则表达式"></div>' +
      '<div class="field"><label class="field-label">替换</label><input id="new-regex-replace" placeholder="替换为"></div>',
      '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-ok-regex">创建</button>');
    $('#modal-ok-regex').addEventListener('click', function () {
      var name = $('#new-regex-name').value.trim();
      if (!name) { toast('danger', 'i-alert', '请输入名称'); return; }
      api.createRegex({ scriptName: name, findRegex: $('#new-regex-find').value, replaceString: $('#new-regex-replace').value }).then(function () {
        closeModal();
        loadRegex();
        toast('success', 'i-check', '已创建');
      }).catch(function (e) { toast('danger', 'i-alert', e.message); });
    });
  });

  $('#btn-import-regex').addEventListener('click', function () { $('#import-regex-json').click(); });
  $('#import-regex-json').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        api.importRegex(JSON.parse(r.result)).then(function () {
          loadRegex();
          toast('success', 'i-check', '已导入');
        }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      } catch (e) { toast('danger', 'i-alert', '无效的 JSON'); }
    };
    r.readAsText(f);
    this.value = '';
  });

  /* ==================== 预设 ==================== */
  function loadPresets() {
    api.listPresets().then(function (data) {
      state.presets = data.presets || [];
      state.activePreset = data.active || null;
      renderPresets();
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  }

  function renderPresets() {
    var menu = $('#preset-menu');
    var name = state.activePreset || '默认';
    $('#preset-name').textContent = name;
    menu.innerHTML = '<button class="preset-item' + (!state.activePreset ? ' selected' : '') + '" data-name=""><svg class="ic"><use href="#i-check"/></svg>默认</button>' +
      state.presets.map(function (p) {
        return '<button class="preset-item' + (p.name === state.activePreset ? ' selected' : '') + '" data-name="' + esc(p.name) + '"><svg class="ic"><use href="#i-check"/></svg>' + esc(p.name) + '</button>';
      }).join('');
    $$('#preset-menu .preset-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var pname = el.getAttribute('data-name');
        if (!pname) {
          state.activePreset = null;
          api.updateSettings({ activePreset: null }).then(loadPresets);
        } else {
          api.activatePreset(pname).then(function () {
            state.activePreset = pname;
            renderPresets();
            toast('success', 'i-check', '已激活 ' + pname);
          }).catch(function (e) { toast('danger', 'i-alert', e.message); });
        }
        $('#preset-select').classList.remove('open');
      });
    });
    // 填充当前预设参数
    var active = state.presets.find(function (p) { return p.name === state.activePreset; });
    var sampling = (active && active.sampling) || {};
    $('#temp').value = sampling.temperature != null ? sampling.temperature : 0.9;
    $('#temp-num').value = sampling.temperature != null ? sampling.temperature : 0.9;
    $('#top-p').value = sampling.topP != null ? sampling.topP : 0.95;
    $('#top-p-num').value = sampling.topP != null ? sampling.topP : 0.95;
    var instruct = (active && active.instruct) || {};
    $('#instruct-input').textContent = instruct.input_sequence || '<|im_start|>user';
    $('#instruct-output').textContent = instruct.output_sequence || '<|im_start|>assistant';
    $('#instruct-stop').textContent = instruct.stop_sequence || '<|im_end|>';
  }

  $('#preset-select').addEventListener('click', function (e) {
    e.stopPropagation();
    if (e.target.closest('.preset-item')) return;
    this.classList.toggle('open');
  });
  document.addEventListener('click', function () { $('#preset-select').classList.remove('open'); });

  $('#btn-save-preset').addEventListener('click', function () {
    var name = state.activePreset || '自定义预设';
    api.savePreset({
      name: name,
      sampling: { temperature: parseFloat($('#temp').value), topP: parseFloat($('#top-p').value) },
      instruct: {
        input_sequence: $('#instruct-input').textContent,
        output_sequence: $('#instruct-output').textContent,
        stop_sequence: $('#instruct-stop').textContent,
      },
    }).then(function () {
      loadPresets();
      toast('success', 'i-check', '已保存');
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  });

  $('#btn-del-preset').addEventListener('click', function () {
    if (!state.activePreset) { toast('danger', 'i-alert', '当前无激活预设'); return; }
    api.deletePreset(state.activePreset).then(function () {
      state.activePreset = null;
      loadPresets();
      toast('success', 'i-check', '已删除');
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  });

  /* ==================== 群聊 ==================== */
  function loadGroups() {
    api.listGroups().then(function (data) {
      state.groups = data.groups || [];
      renderGroups();
    }).catch(function () {});
  }

  function renderGroups() {
    var gl = $('#group-list');
    if (!state.groups.length) { gl.classList.remove('show'); gl.innerHTML = ''; return; }
    gl.classList.add('show');
    gl.innerHTML = '<div class="group-label">群聊</div>' +
      state.groups.map(function (g) {
        return '<div class="char-item' + (state.groupMode && state.currentGroup && g.id === state.currentGroup.id ? ' active' : '') + '" data-gid="' + g.id + '">' +
          '<div class="char-avatar"><svg class="ic"><use href="#i-users"/></svg></div>' +
          '<div class="char-info"><div class="char-name">' + esc(g.name) + '</div><div class="char-desc">群聊</div></div>' +
          '<button class="icon-btn" data-edit-group="' + g.id + '" title="管理群聊" style="flex-shrink:0"><svg class="ic"><use href="#i-settings"/></svg></button>' +
        '</div>';
      }).join('');
    $$('#group-list .char-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-edit-group]')) return;
        selectGroup(el.getAttribute('data-gid'));
      });
    });
    $$('#group-list [data-edit-group]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        openGroupManager(b.getAttribute('data-edit-group'));
      });
    });
  }

  function openGroupManager(gid) {
    var g = state.groups.find(function (x) { return x.id === gid; });
    if (!g) return;
    api.getGroup(gid).then(function (data) {
      var members = data.members || [];
      var body =
        '<div class="field"><label class="field-label">群聊名称</label><input id="edit-group-name" value="' + esc(data.group.name) + '"></div>' +
        '<div class="field"><label class="field-label">成员</label>' +
        '<div class="wi-list" style="max-height:160px;overflow-y:auto" id="edit-group-members">' +
        members.map(function (m) {
          return '<div class="admin-item"><div class="char-avatar">' + (m.avatar_path ? '<img src="' + avatarUrl(m.avatar_path) + '" alt="">' : esc((m.name || '?')[0])) + '</div>' +
            '<div class="wi-k">' + esc(m.name) + '</div></div>';
        }).join('') +
        '</div></div>';
      openModal('管理群聊', body,
        '<button class="btn" onclick="closeModal()">取消</button><button class="btn danger" id="modal-del-group">删除群聊</button><button class="btn primary" id="modal-save-group">保存</button>');
      $('#modal-save-group').addEventListener('click', function () {
        var name = $('#edit-group-name').value.trim();
        if (!name) { toast('danger', 'i-alert', '请输入名称'); return; }
        api.updateGroup(gid, { name: name }).then(function () {
          closeModal();
          loadGroups();
          toast('success', 'i-check', '已保存');
        }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      });
      $('#modal-del-group').addEventListener('click', function () {
        openModal('删除群聊',
          '<p style="font-size:13px;color:var(--ink-2)">确定删除群聊「' + esc(g.name) + '」？</p>',
          '<button class="btn" onclick="closeModal()">取消</button><button class="btn danger" id="modal-ok-del-group">删除</button>');
        $('#modal-ok-del-group').addEventListener('click', function () {
          api.deleteGroup(gid).then(function () {
            closeModal();
            loadGroups();
            if (state.groupMode && state.currentGroup && state.currentGroup.id === gid) {
              state.groupMode = false;
              state.currentGroup = null;
              state.messages = [];
              renderEmptyChat();
              $('#chat-char-name').textContent = '—';
              $('#chat-title').textContent = '';
            }
            toast('success', 'i-check', '已删除');
          }).catch(function (e) { toast('danger', 'i-alert', e.message); });
        });
      });
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  }

  function selectGroup(id) {
    state.groupMode = true;
    state.currentGroup = state.groups.find(function (g) { return g.id === id; });
    if (!state.currentGroup) return;
    renderChars();
    renderGroups();
    api.getGroup(id).then(function (data) {
      state.groupMembers = data.members || [];
      $('#chat-char-name').textContent = data.group.name;
      $('#chat-title').textContent = '· 群聊 · ' + state.groupMembers.length + ' 位成员';
      return api.getGroupMessages(id);
    }).then(function (data) {
      state.messages = data.messages || [];
      renderMessages();
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  }

  function sendGroup(text) {
    var input = $('#chat-input');
    input.value = '';
    state.isGenerating = true;
    $('#send-btn').disabled = true;
    var userMsg = { name: state.user.display_name || state.user.username, is_user: true, send_date: Date.now(), mes: text };
    state.messages.push(userMsg);
    renderMessages();
    api.sendGroupMessage(state.currentGroup.id, text, null).then(function (data) {
      state.messages = data.messages || state.messages;
      renderMessages();
    }).catch(function (e) { toast('danger', 'i-alert', e.message); }).finally(function () {
      state.isGenerating = false;
      $('#send-btn').disabled = false;
    });
  }

  $('#btn-groups').addEventListener('click', function () {
    openModal('新建群聊',
      '<div class="field"><label class="field-label">群聊名称</label><input id="group-name" placeholder="群聊名称"></div>' +
      '<div class="field"><label class="field-label">成员</label><div id="group-members"></div></div>',
      '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-ok-group">创建</button>');
    $('#group-members').innerHTML = state.characters.map(function (c) {
      return '<label class="check-row"><input type="checkbox" value="' + c.id + '"> ' + esc(c.name) + '</label>';
    }).join('');
    $('#modal-ok-group').addEventListener('click', function () {
      var name = $('#group-name').value.trim();
      var ids = $$('#group-members input:checked').map(function (i) { return i.value; });
      if (!name) { toast('danger', 'i-alert', '请输入名称'); return; }
      if (!ids.length) { toast('danger', 'i-alert', '请选择成员'); return; }
      api.createGroup(name, ids).then(function () {
        closeModal();
        loadGroups();
        toast('success', 'i-check', '已创建');
      }).catch(function (e) { toast('danger', 'i-alert', e.message); });
    });
  });

  /* ==================== 设置 ==================== */
  function loadSettings() {
    api.getSettings().then(function (data) {
      var s = data.settings || {};
      if (s.backend) {
        $('#backend-type .sel-value').textContent = s.backend.type || 'openai';
        $('#backend-url').value = s.backend.baseUrl || '';
        $('#backend-model').value = s.backend.model || '';
        $('#backend-key').value = s.backend.apiKey || '';
      }
      if (s.persona) {
        $('#persona-name').value = s.persona.name || '';
        $('#persona-desc').value = s.persona.description || '';
      }
    }).catch(function () {});
  }

  $('#btn-save-settings').addEventListener('click', function () {
    api.updateSettings({
      backend: {
        type: $('#backend-type .sel-value').textContent,
        baseUrl: $('#backend-url').value.trim() || 'http://localhost:11434/v1',
        model: $('#backend-model').value.trim() || 'qwen2.5',
        apiKey: $('#backend-key').value.trim(),
      },
    }).then(function () { toast('success', 'i-check', '设置已保存'); })
      .catch(function (e) { toast('danger', 'i-alert', e.message); });
  });

  $('#btn-save-persona').addEventListener('click', function () {
    api.updateSettings({
      persona: { name: $('#persona-name').value.trim(), description: $('#persona-desc').value.trim() },
    }).then(function () { toast('success', 'i-check', 'Persona 已保存'); })
      .catch(function (e) { toast('danger', 'i-alert', e.message); });
  });

  /* ==================== 角色操作 ==================== */
  $('#btn-new-char').addEventListener('click', function () {
    openModal('新建角色',
      '<div class="field"><label class="field-label">角色名称</label><input id="new-char-name" placeholder="输入角色名称…"></div>' +
      '<div class="field"><label class="field-label">角色描述</label><textarea id="new-char-desc" placeholder="描述角色的性格、背景…"></textarea></div>',
      '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-ok-char">创建</button>');
    $('#modal-ok-char').addEventListener('click', function () {
      var name = $('#new-char-name').value.trim();
      if (!name) { toast('danger', 'i-alert', '请输入角色名称'); return; }
      api.createCharacter({ name: name, description: $('#new-char-desc').value.trim() }).then(function () {
        closeModal();
        loadCharacters();
        toast('success', 'i-check', '已创建');
      }).catch(function (e) { toast('danger', 'i-alert', e.message); });
    });
  });

  $('#btn-import-char').addEventListener('click', function () { $('#import-file').click(); });
  $('#import-file').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    var type = ext === 'json' ? 'json' : ext === 'jsonl' ? 'jsonl' : 'png';
    api.importCharacter(f, type).then(function () {
      loadCharacters();
      toast('success', 'i-check', '已导入');
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
    this.value = '';
  });

  $('#btn-save-char').addEventListener('click', function () {
    if (!state.currentChar) return;
    var data = {
      name: $('#edit-name').value.trim(),
      description: $('#edit-desc').value,
      personality: $('#edit-personality').value,
      scenario: $('#edit-scenario').value,
      first_mes: $('#edit-first').value,
      mes_example: $('#edit-example').value,
      tags: currentTags,
    };
    api.updateCharacter(state.currentChar.id, data).then(function (res) {
      if (res.name) state.currentChar.name = res.name;
      state.currentChar.description = data.description;
      renderChars();
      $('#chat-char-name').textContent = state.currentChar.name;
      toast('success', 'i-check', '已保存');
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  });

  $('#btn-export-char').addEventListener('click', function () {
    if (!state.currentChar) return;
    api.getCharacter(state.currentChar.id).then(function (data) {
      var blob = new Blob([JSON.stringify(data.card, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (data.card.data.name || 'character') + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  });

  $('#btn-del-char').addEventListener('click', function () {
    if (!state.currentChar) return;
    openModal('删除角色',
      '<p style="font-size:13px;color:var(--ink-2)">确定删除角色「' + esc(state.currentChar.name) + '」？</p>' +
      '<label class="check-row" style="margin-top:12px"><input type="checkbox" id="del-chats"> 同时删除聊天记录</label>',
      '<button class="btn" onclick="closeModal()">取消</button><button class="btn danger" id="modal-ok-del-char">删除</button>');
    $('#modal-ok-del-char').addEventListener('click', function () {
      api.deleteCharacter(state.currentChar.id, $('#del-chats').checked).then(function () {
        closeModal();
        state.currentChar = null;
        state.currentChat = null;
        state.messages = [];
        loadCharacters();
        toast('success', 'i-check', '已删除');
      }).catch(function (e) { toast('danger', 'i-alert', e.message); });
    });
  });

  /* ==================== 聊天管理 ==================== */
  $('#btn-chat-manage').addEventListener('click', function () {
    if (!state.currentChar) return;
    api.listChats(state.currentChar.id).then(function (data) {
      var chats = data.chats || [];
      var body = '<div class="field"><label class="field-label">新聊天标题</label><input id="new-chat-title" placeholder="聊天标题"></div>' +
        '<div class="btn-row" style="margin-bottom:16px"><button class="btn primary" id="modal-new-chat" style="flex:1">新建聊天</button></div>' +
        '<div class="section-title">聊天记录（' + chats.length + '）</div>' +
        '<div class="wi-list">' +
        (chats.length ? chats.map(function (c) {
          return '<div class="wi-item" data-chat="' + c.id + '" style="display:flex;align-items:center;gap:8px">' +
            '<div style="flex:1;min-width:0"><div class="wi-k">' + esc(c.title || '未命名') + '</div><div class="wi-c">' + fmtTime(c.updated_at) + '</div></div>' +
            '<button class="icon-btn" data-del-chat="' + c.id + '" title="删除聊天" style="flex-shrink:0"><svg class="ic"><use href="#i-trash"/></svg></button>' +
          '</div>';
        }).join('') : '<div class="empty-desc" style="padding:20px">暂无聊天记录</div>') +
        '</div>';
      openModal('聊天管理', body,
        '<button class="btn" onclick="closeModal()">关闭</button><button class="btn" id="modal-export-chat">导出</button><button class="btn" id="modal-import-chat">导入</button>');
      $('#modal-new-chat').addEventListener('click', function () {
        var title = $('#new-chat-title').value.trim();
        api.createChat(state.currentChar.id, title || null).then(function (data) {
          closeModal();
          loadChats(state.currentChar.id);
          toast('success', 'i-check', '已创建');
        }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      });
      $$('#modal-body .wi-item[data-chat]').forEach(function (el) {
        el.addEventListener('click', function () {
          var cid = el.getAttribute('data-chat');
          closeModal();
          loadChat(cid);
        });
      });
      $$('#modal-body [data-del-chat]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var cid = b.getAttribute('data-del-chat');
          var chat = chats.find(function (x) { return x.id === cid; });
          openModal('删除聊天',
            '<p style="font-size:13px;color:var(--ink-2)">确定删除聊天「' + esc(chat ? (chat.title || '未命名') : '') + '」？此操作不可恢复。</p>',
            '<button class="btn" onclick="closeModal()">取消</button><button class="btn danger" id="modal-ok-del-chat">删除</button>');
          $('#modal-ok-del-chat').addEventListener('click', function () {
            api.deleteChat(cid).then(function () {
              closeModal();
              if (state.currentChat && state.currentChat.id === cid) {
                state.currentChat = null;
                state.messages = [];
              }
              loadChats(state.currentChar.id);
              toast('success', 'i-check', '已删除');
            }).catch(function (e) { toast('danger', 'i-alert', e.message); });
          });
        });
      });
      $('#modal-export-chat').addEventListener('click', function () {
        if (!state.currentChat) { toast('danger', 'i-alert', '无当前聊天'); return; }
        api.exportChat(state.currentChat.id).then(function (text) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([text], { type: 'application/jsonl' }));
          a.download = (state.currentChar.name || 'chat') + '.jsonl';
          a.click();
          URL.revokeObjectURL(a.href);
        }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      });
      $('#modal-import-chat').addEventListener('click', function () {
        openModal('导入聊天',
          '<div class="field"><label class="field-label">JSONL 内容</label><textarea id="import-chat-jsonl" style="min-height:160px" placeholder="粘贴聊天 JSONL…"></textarea></div>',
          '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-ok-import-chat">导入</button>');
        $('#modal-ok-import-chat').addEventListener('click', function () {
          api.importChat(state.currentChar.id, $('#import-chat-jsonl').value).then(function () {
            closeModal();
            loadChats(state.currentChar.id);
            toast('success', 'i-check', '已导入');
          }).catch(function (e) { toast('danger', 'i-alert', e.message); });
        });
      });
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  });

  /* ==================== 聊天设置 ==================== */
  $('#btn-chat-settings').addEventListener('click', function () {
    if (!state.currentChat) { toast('danger', 'i-alert', '请先选择聊天'); return; }
    api.getChatSettings(state.currentChat.id).then(function (data) {
      var s = data.settings || {};
      var body =
        '<div class="field"><label class="field-label">标题</label><input id="cs-title" value="' + esc(s.title || '') + '"></div>' +
        '<div class="field"><label class="field-label">场景覆盖</label><textarea id="cs-scenario">' + esc(s.scenario || '') + '</textarea></div>' +
        '<div class="field"><label class="field-label">作者注</label><textarea id="cs-author-note">' + esc(s.author_note || '') + '</textarea></div>';
      openModal('聊天设置', body,
        '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-save-cs">保存</button>');
      $('#modal-save-cs').addEventListener('click', function () {
        api.updateChatSettings(state.currentChat.id, {
          title: $('#cs-title').value.trim(),
          scenario: $('#cs-scenario').value,
          author_note: $('#cs-author-note').value,
        }).then(function () {
          closeModal();
          toast('success', 'i-check', '已保存');
        }).catch(function (e) { toast('danger', 'i-alert', e.message); });
      });
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  });

  /* ==================== 右侧 tab ==================== */
  $$('.rp-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.rp-tab').forEach(function (t) { t.classList.remove('active'); });
      $$('.rp-panel').forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      $('#panel-' + tab.getAttribute('data-tab')).classList.add('active');
    });
  });

  /* ==================== 设置弹窗 ==================== */
  $('#btn-settings').addEventListener('click', function () { $('#settings-overlay').classList.add('show'); });
  $('#settings-close').addEventListener('click', function () { $('#settings-overlay').classList.remove('show'); });
  $('#settings-overlay').addEventListener('click', function (e) { if (e.target === $('#settings-overlay')) $('#settings-overlay').classList.remove('show'); });
  $$('.set-nav-item').forEach(function (item) {
    item.addEventListener('click', function () {
      $$('.set-nav-item').forEach(function (i) { i.classList.remove('active'); });
      $$('.set-panel').forEach(function (p) { p.classList.remove('active'); });
      item.classList.add('active');
      document.querySelector('.set-panel[data-set-panel="' + item.getAttribute('data-set-tab') + '"]').classList.add('active');
    });
  });

  /* ==================== 自研下拉（select） ==================== */
  $$('.select').forEach(function (sel) {
    var trigger = sel.querySelector('.select-trigger');
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      sel.classList.toggle('open');
    });
    $$('.select-option', sel).forEach(function (opt) {
      opt.addEventListener('click', function () {
        $$('.select-option', sel).forEach(function (o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        sel.querySelector('.sel-value').textContent = opt.getAttribute('data-value');
        sel.classList.remove('open');
      });
    });
  });
  document.addEventListener('click', function () {
    $$('.select').forEach(function (s) { s.classList.remove('open'); });
  });

  /* ==================== 排序菜单 ==================== */
  $('#sort-menu .sort-trigger').addEventListener('click', function (e) {
    e.stopPropagation();
    $('#sort-menu').classList.toggle('open');
  });
  $$('#sort-menu .dropdown-item').forEach(function (item) {
    item.addEventListener('click', function () {
      $$('#sort-menu .dropdown-item').forEach(function (i) { i.classList.remove('selected'); });
      item.classList.add('selected');
      state.sortMode = item.getAttribute('data-sort');
      $('#sort-menu').classList.remove('open');
      renderChars();
    });
  });
  document.addEventListener('click', function () { $('#sort-menu').classList.remove('open'); });
  $('#char-search').addEventListener('input', function () {
    state.charSearch = this.value;
    renderChars();
  });
  $('#global-search').addEventListener('input', function () {
    state.charSearch = this.value;
    renderChars();
  });

  /* ==================== 主题切换 ==================== */
  $('#theme-toggle').addEventListener('click', function () {
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var icon = $('#theme-toggle use');
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      icon.setAttribute('href', '#i-moon');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      icon.setAttribute('href', '#i-sun');
    }
  });

  /* ==================== 用户菜单 ==================== */
  $('#user-avatar').addEventListener('click', function (e) {
    e.stopPropagation();
    $('#user-menu').classList.toggle('show');
  });
  document.addEventListener('click', function () { $('#user-menu').classList.remove('show'); });
  $('#um-logout').addEventListener('click', function () {
    setToken(null);
    api.logout().catch(function () {});
    $('#user-menu').classList.remove('show');
    showLogin();
  });
  $('#um-admin').addEventListener('click', function () {
    $('#user-menu').classList.remove('show');
    api.adminUsers().then(function (data) {
      var users = data.users || [];
      var body = '<div class="section-title">用户管理</div>' +
        '<div class="btn-row" style="margin-bottom:12px"><button class="btn primary" id="modal-add-user" style="flex:1">新建用户</button></div>' +
        '<div class="admin-list">' +
        users.map(function (u) {
          var isSelf = state.user && u.id === state.user.id;
          return '<div class="admin-item">' +
            '<div class="wi-k">' + esc(u.username) + ' <span class="tag ' + (u.role === 'admin' ? 'tag-accent' : '') + '">' + esc(u.role) + '</span></div>' +
            '<div class="wi-c">' + esc(u.display_name || '') + ' · ' + (u.enabled ? '启用' : '禁用') + (isSelf ? ' · 当前账号' : '') + '</div>' +
            '<button class="icon-btn" data-edit-user="' + u.id + '" title="编辑"><svg class="ic"><use href="#i-user"/></svg></button>' +
            '<button class="icon-btn" data-toggle-user="' + u.id + '" title="' + (u.enabled ? '禁用' : '启用') + '"><svg class="ic"><use href="#i-refresh"/></svg></button>' +
            (isSelf ? '' : '<button class="icon-btn" data-del-user="' + u.id + '" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>') +
          '</div>';
        }).join('') +
        '</div>';
      openModal('管理面板', body, '<button class="btn" onclick="closeModal()">关闭</button>');
      $('#modal-add-user').addEventListener('click', function () {
        openModal('新建用户',
          '<div class="field"><label class="field-label">用户名</label><input id="new-user-name"></div>' +
          '<div class="field"><label class="field-label">密码</label><input id="new-user-pass" type="password"></div>' +
          '<div class="field"><label class="field-label">显示名</label><input id="new-user-display"></div>',
          '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-ok-add-user">创建</button>');
        $('#modal-ok-add-user').addEventListener('click', function () {
          api.adminCreateUser({
            username: $('#new-user-name').value.trim(),
            password: $('#new-user-pass').value,
            display_name: $('#new-user-display').value.trim(),
          }).then(function () {
            closeModal();
            $('#um-admin').click();
            toast('success', 'i-check', '已创建');
          }).catch(function (e) { toast('danger', 'i-alert', e.message); });
        });
      });
      $$('#modal-body [data-edit-user]').forEach(function (b) {
        b.addEventListener('click', function () {
          var uid = b.getAttribute('data-edit-user');
          var u = users.find(function (x) { return x.id === uid; });
          if (!u) return;
          var isSelf = state.user && u.id === state.user.id;
          openModal('编辑用户 · ' + u.username,
            '<div class="field"><label class="field-label">显示名</label><input id="edit-user-display" value="' + esc(u.display_name || '') + '"></div>' +
            '<div class="field"><label class="field-label">角色</label>' +
            '<div class="select" id="edit-user-role">' +
            '<div class="select-trigger" tabindex="0" role="combobox" aria-expanded="false">' +
            '<span class="sel-value">' + esc(u.role) + '</span>' +
            '<span class="sel-arrow"><svg class="ic"><use href="#i-chevron-down"/></svg></span>' +
            '</div>' +
            '<div class="select-menu" role="listbox">' +
            '<div class="select-option' + (u.role === 'user' ? ' selected' : '') + '" data-value="user" role="option">用户<span class="sel-check"><svg class="ic"><use href="#i-check"/></svg></span></div>' +
            '<div class="select-option' + (u.role === 'admin' ? ' selected' : '') + '" data-value="admin" role="option">管理员<span class="sel-check"><svg class="ic"><use href="#i-check"/></svg></span></div>' +
            '</div></div></div>' +
            '<div class="field"><label class="field-label">重置密码（留空不修改）</label><input id="edit-user-pass" type="password" placeholder="新密码"></div>' +
            (isSelf ? '<p style="font-size:11px;color:var(--gold);margin-bottom:12px">不能修改自己的角色或禁用自己</p>' : ''),
            '<button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="modal-ok-edit-user">保存</button>');
          // 绑定角色下拉
          var sel = $('#edit-user-role');
          sel.querySelector('.select-trigger').addEventListener('click', function (e) {
            e.stopPropagation();
            sel.classList.toggle('open');
          });
          $$('.select-option', sel).forEach(function (opt) {
            opt.addEventListener('click', function () {
              $$('.select-option', sel).forEach(function (o) { o.classList.remove('selected'); });
              opt.classList.add('selected');
              sel.querySelector('.sel-value').textContent = opt.getAttribute('data-value');
              sel.classList.remove('open');
            });
          });
          $('#modal-ok-edit-user').addEventListener('click', function () {
            var payload = { display_name: $('#edit-user-display').value.trim() };
            if (!isSelf) payload.role = $('#edit-user-role .sel-value').textContent;
            var pw = $('#edit-user-pass').value;
            if (pw) payload.password = pw;
            api.adminUpdateUser(uid, payload).then(function () {
              closeModal();
              $('#um-admin').click();
              toast('success', 'i-check', '已保存');
            }).catch(function (e) { toast('danger', 'i-alert', e.message); });
          });
        });
      });
      $$('#modal-body [data-toggle-user]').forEach(function (b) {
        b.addEventListener('click', function () {
          var uid = b.getAttribute('data-toggle-user');
          var u = users.find(function (x) { return x.id === uid; });
          if (!u) return;
          if (u.enabled) {
            openModal('禁用用户',
              '<p style="font-size:13px;color:var(--ink-2)">禁用后「' + esc(u.username) + '」将无法登录。确定禁用？</p>',
              '<button class="btn" onclick="closeModal()">取消</button><button class="btn danger" id="modal-ok-disable-user">禁用</button>');
            $('#modal-ok-disable-user').addEventListener('click', function () {
              api.adminUpdateUser(uid, { enabled: 0 }).then(function () {
                closeModal();
                $('#um-admin').click();
              }).catch(function (e) { toast('danger', 'i-alert', e.message); });
            });
          } else {
            api.adminUpdateUser(uid, { enabled: 1 }).then(function () {
              closeModal();
              $('#um-admin').click();
            }).catch(function (e) { toast('danger', 'i-alert', e.message); });
          }
        });
      });
      $$('#modal-body [data-del-user]').forEach(function (b) {
        b.addEventListener('click', function () {
          var uid = b.getAttribute('data-del-user');
          var u = users.find(function (x) { return x.id === uid; });
          if (!u) return;
          openModal('删除用户',
            '<p style="font-size:13px;color:var(--ink-2)">将永久删除「' + esc(u.username) + '」及其所有角色、聊天、世界书数据，且不可恢复。确定删除？</p>',
            '<button class="btn" onclick="closeModal()">取消</button><button class="btn danger" id="modal-ok-del-user">删除</button>');
          $('#modal-ok-del-user').addEventListener('click', function () {
            api.adminDeleteUser(uid).then(function () {
              closeModal();
              $('#um-admin').click();
              toast('success', 'i-check', '已删除');
            }).catch(function (e) { toast('danger', 'i-alert', e.message); });
          });
        });
      });
    }).catch(function (e) { toast('danger', 'i-alert', e.message); });
  });

  /* ==================== 启动 ==================== */
  if (isLoggedIn()) {
    initApp();
  } else {
    showLogin();
  }
})();
