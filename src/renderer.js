'use strict';

// ════════════════════════════════════════════════════════════════════════════
// 常量
// ════════════════════════════════════════════════════════════════════════════

const NOTE_COLORS = [
  '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#6366f1',
];

const DEFAULT_SETTINGS = {
  opacity: 0.93,
  alwaysOnTop: true,
  autoStart: false,
  activeNoteId: null,
  windowBounds: null,
};

// ════════════════════════════════════════════════════════════════════════════
// 状态
// ════════════════════════════════════════════════════════════════════════════

const state = {
  notes: [],
  activeId: null,
  settings: { ...DEFAULT_SETTINGS },
  ui: {
    pinned: true,
    selectedType: 'text',
    selectedColor: NOTE_COLORS[0],
  },
};

// 拖拽状态
let _dragId   = null;
let _dragOver = null;
let _dragAbove = false;

// ════════════════════════════════════════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════════════════════════════════════════

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


function $(id) { return document.getElementById(id); }

// ════════════════════════════════════════════════════════════════════════════
// 数据持久化
// ════════════════════════════════════════════════════════════════════════════

let _saveTimer = null;

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveNow, 800);
}

async function saveNow() {
  clearTimeout(_saveTimer);
  const data = {
    version: '1.0.0',
    notes: state.notes,
    settings: {
      ...state.settings,
      alwaysOnTop: state.ui.pinned,
      activeNoteId: state.activeId,
    },
  };
  await window.electronAPI.saveData(data);
}

// ════════════════════════════════════════════════════════════════════════════
// 便签 CRUD
// ════════════════════════════════════════════════════════════════════════════

function getActiveNote() {
  const note = state.notes.find(n => n.id === state.activeId);
  if (!note) return null;
  if (!note.content) note.content = { text: '', items: [] };
  if (!Array.isArray(note.content.items)) note.content.items = [];
  if (note.content.text === undefined) note.content.text = '';
  return note;
}

function createNote(type, title, color) {
  const fallbackColor = NOTE_COLORS[state.notes.length % NOTE_COLORS.length];
  const note = {
    id: generateId(),
    title: title || (type === 'list' ? '新列表' : '新便签'),
    type,
    color: color || fallbackColor,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    content: { text: '', items: [] },
  };
  state.notes.unshift(note);
  return note;
}

function reorderNotes(fromId, toId, insertBefore) {
  const fromIdx = state.notes.findIndex(n => n.id === fromId);
  if (fromIdx === -1) return;
  const [moved] = state.notes.splice(fromIdx, 1);
  const toIdx = state.notes.findIndex(n => n.id === toId);
  if (toIdx === -1) { state.notes.unshift(moved); return; }
  state.notes.splice(insertBefore ? toIdx : toIdx + 1, 0, moved);
}

function deleteNote(id) {
  state.notes = state.notes.filter(n => n.id !== id);
  if (state.activeId === id) {
    state.activeId = state.notes[0]?.id ?? null;
  }
}

function updateNoteTitle(id, title) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  note.title = title.trim() || (note.type === 'list' ? '新列表' : '新便签');
  note.updatedAt = Date.now();
}

function updateNoteText(id, text) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  note.content.text = text;
  note.updatedAt = Date.now();
}

// ─ 列表项操作 ─────────────────────────────────────────────────────────────

function addListItem(noteId, text) {
  if (!text.trim()) return;
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  note.content.items.push({
    id: generateId(),
    text: text.trim(),
    completed: false,
    createdAt: Date.now(),
  });
  note.updatedAt = Date.now();
}

function toggleListItem(noteId, itemId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  const item = note.content.items.find(i => i.id === itemId);
  if (item) { item.completed = !item.completed; note.updatedAt = Date.now(); }
}

function deleteListItem(noteId, itemId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  note.content.items = note.content.items.filter(i => i.id !== itemId);
  note.updatedAt = Date.now();
}

function clearCompleted(noteId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  note.content.items = note.content.items.filter(i => !i.completed);
  note.updatedAt = Date.now();
}

// ════════════════════════════════════════════════════════════════════════════
// 渲染：侧边栏标签
// ════════════════════════════════════════════════════════════════════════════

function renderTabs() {
  const container = $('sidebarTabs');
  if (!container) return;

  const addBtn = `
    <button class="add-tab-btn" id="addNoteBtn" title="新建便签">
      <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
      </svg>
      新建
    </button>`;

  if (state.notes.length === 0) {
    container.innerHTML = addBtn;
    $('addNoteBtn')?.addEventListener('click', showAddModal);
    return;
  }

  const tabsHtml = state.notes.map(note => {
    const isActive = note.id === state.activeId;
    const items = note.content?.items ?? [];
    const done = items.filter(i => i.completed).length;
    const total = items.length;

    return `
      <div class="tab-item ${isActive ? 'active' : ''}" data-id="${note.id}"
           style="--note-color:${note.color}" draggable="true">
        <div class="tab-color-bar"></div>
        <div class="tab-content">
          <div class="tab-title">${escHtml(note.title)}</div>
          ${note.type === 'list' && total > 0
            ? `<div class="tab-list-progress">
                 <div class="tab-progress-bar"><div class="tab-progress-fill" style="width:${Math.round(done/total*100)}%"></div></div>
                 <span class="tab-count">${done}/${total}</span>
               </div>`
            : ''}
        </div>
        <button class="tab-delete" data-id="${note.id}" title="删除" draggable="false">
          <svg viewBox="0 0 16 16" fill="currentColor" width="10" height="10">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>`;
  }).join('');

  container.innerHTML = addBtn + tabsHtml;

  // ─ 点击 / 删除 事件 ───────────────────────────────────────────────────────
  $('addNoteBtn')?.addEventListener('click', showAddModal);

  container.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', e => {
      if (e.target.closest('.tab-delete')) return;
      selectNote(tab.dataset.id);
    });
  });

  container.querySelectorAll('.tab-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      doDeleteNote(btn.dataset.id);
    });
  });

  // ─ 拖拽排序 ──────────────────────────────────────────────────────────────
  function clearDragStyles() {
    container.querySelectorAll('.tab-item').forEach(el => {
      el.classList.remove('drag-above', 'drag-below', 'dragging');
    });
  }

  container.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('dragstart', e => {
      _dragId = tab.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      // 延迟添加 dragging 类，否则 ghost image 也会变透明
      setTimeout(() => tab.classList.add('dragging'), 0);
    });

    tab.addEventListener('dragend', () => {
      clearDragStyles();
      _dragId = null;
      _dragOver = null;
    });

    tab.addEventListener('dragover', e => {
      e.preventDefault();
      if (!_dragId || tab.dataset.id === _dragId) return;
      e.dataTransfer.dropEffect = 'move';
      const rect = tab.getBoundingClientRect();
      const isAbove = e.clientY < rect.top + rect.height / 2;
      clearDragStyles();
      container.querySelector(`.tab-item[data-id="${_dragId}"]`)?.classList.add('dragging');
      tab.classList.add(isAbove ? 'drag-above' : 'drag-below');
      _dragOver = tab.dataset.id;
      _dragAbove = isAbove;
    });

    tab.addEventListener('drop', e => {
      e.preventDefault();
      if (_dragId && _dragOver && _dragId !== _dragOver) {
        reorderNotes(_dragId, _dragOver, _dragAbove);
        renderTabs();
        scheduleSave();
      }
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 渲染：内容区
// ════════════════════════════════════════════════════════════════════════════

function renderContent() {
  const container = $('contentArea');
  if (!container) return;

  const note = getActiveNote();

  if (!note) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✦</div>
        <div class="empty-title">随时记录，随时回顾</div>
        <div class="empty-desc">点击左侧「新建」按钮创建你的第一条便签</div>
        <button class="btn-primary" id="emptyAddBtn" style="margin-top:8px">+ 新建便签</button>
      </div>`;
    $('emptyAddBtn')?.addEventListener('click', showAddModal);
    return;
  }

  note.type === 'list' ? renderListNote(container, note) : renderTextNote(container, note);
}

// ─ 文本便签 ────────────────────────────────────────────────────────────────
function renderTextNote(container, note) {
  container.innerHTML = `
    <div class="note-header">
      <div class="note-title-row">
        <div class="note-color-dot" style="background:${note.color};--dot-glow:${note.color}44"></div>
        <input type="text" class="note-title-input" id="noteTitleInput"
               value="${escHtml(note.title)}" maxlength="30" placeholder="便签标题">
        <span class="note-type-badge">文本</span>
      </div>
    </div>
    <div class="text-content-wrap">
      <textarea class="text-editor" id="textEditor"
                placeholder="开始输入…" spellcheck="false">${escHtml(note.content.text)}</textarea>
    </div>`;

  const titleInput = $('noteTitleInput');
  if (titleInput) {
    titleInput.addEventListener('change', () => {
      updateNoteTitle(note.id, titleInput.value);
      renderTabs();
      scheduleSave();
    });
  }

  const textarea = $('textEditor');
  if (textarea) {
    textarea.addEventListener('input', () => {
      updateNoteText(note.id, textarea.value);
      scheduleSave();
    });
    // 自动聚焦
    setTimeout(() => textarea.focus(), 50);
  }
}

// ─ 列表便签 ────────────────────────────────────────────────────────────────
function renderListNote(container, note) {
  const items = note.content.items ?? [];
  const pending   = items.filter(i => !i.completed);
  const completed = items.filter(i => i.completed);
  const pct = items.length ? Math.round((completed.length / items.length) * 100) : 0;
  const hasDone = completed.length > 0;

  const renderItem = item => `
    <div class="list-item ${item.completed ? 'completed' : ''}" data-item-id="${item.id}">
      <label class="item-check-wrap">
        <input type="checkbox" class="item-checkbox" data-item-id="${item.id}" ${item.completed ? 'checked' : ''}>
        <span class="item-checkmark"></span>
      </label>
      <span class="item-text">${escHtml(item.text)}</span>
      <button class="item-delete" data-item-id="${item.id}" title="删除">
        <svg viewBox="0 0 16 16" fill="currentColor" width="10" height="10">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>`;

  const pendingHtml   = pending.map(renderItem).join('');
  const completedHtml = completed.length > 0
    ? `<div class="items-divider">已完成 ${completed.length}</div>${completed.map(renderItem).join('')}`
    : '';

  const emptyHint = items.length === 0
    ? `<div class="list-empty"><span>暂无任务，在上方输入添加</span></div>` : '';

  container.innerHTML = `
    <div class="note-header">
      <div class="note-title-row">
        <div class="note-color-dot" style="background:${note.color};--dot-glow:${note.color}44"></div>
        <input type="text" class="note-title-input" id="noteTitleInput"
               value="${escHtml(note.title)}" maxlength="30" placeholder="列表标题">
        <span class="note-type-badge list">列表</span>
      </div>
      ${items.length > 0 ? `
      <div class="list-actions-row">
        <div class="list-progress-wrap">
          <div class="list-progress-text">${completed.length}/${items.length} 已完成</div>
          <div class="list-progress-bar">
            <div class="list-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        ${hasDone ? `<button class="btn-clear" id="clearDoneBtn">清除已完成</button>` : ''}
      </div>` : ''}
    </div>
    <div class="list-content-wrap">
      <div class="list-add-wrap">
        <input type="text" class="list-add-input" id="listAddInput"
               placeholder="+ 输入任务，按 Enter 添加" maxlength="200" autocomplete="off">
      </div>
      <div class="list-items" id="listItems">
        ${emptyHint}${pendingHtml}${completedHtml}
      </div>
    </div>`;

  // 标题
  const titleInput = $('noteTitleInput');
  if (titleInput) {
    titleInput.addEventListener('change', () => {
      updateNoteTitle(note.id, titleInput.value);
      renderTabs();
      scheduleSave();
    });
  }

  // 添加任务
  const addInput = $('listAddInput');
  if (addInput) {
    addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && addInput.value.trim()) {
        addListItem(note.id, addInput.value);
        addInput.value = '';
        renderContent();
        renderTabs();
        scheduleSave();
      }
    });
    setTimeout(() => addInput.focus(), 50);
  }

  // 清除已完成
  $('clearDoneBtn')?.addEventListener('click', () => {
    clearCompleted(note.id);
    renderContent();
    renderTabs();
    scheduleSave();
  });

  // 列表项事件（委托）
  const listEl = $('listItems');
  if (listEl) {
    listEl.addEventListener('change', e => {
      const cb = e.target.closest('.item-checkbox');
      if (cb) {
        toggleListItem(note.id, cb.dataset.itemId);
        renderContent();
        renderTabs();
        scheduleSave();
      }
    });
    listEl.addEventListener('click', e => {
      const del = e.target.closest('.item-delete');
      if (del) {
        deleteListItem(note.id, del.dataset.itemId);
        renderContent();
        renderTabs();
        scheduleSave();
      }
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 弹窗 & 设置
// ════════════════════════════════════════════════════════════════════════════

function renderColorPicker() {
  const row = $('colorPickerRow');
  if (!row) return;
  row.innerHTML = NOTE_COLORS.map(c =>
    `<span class="color-swatch${c === state.ui.selectedColor ? ' active' : ''}"
           data-color="${c}" style="background:${c}" title="${c}" tabindex="0"></span>`
  ).join('');
  row.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      state.ui.selectedColor = sw.dataset.color;
      renderColorPicker();
    });
  });
}

function showAddModal() {
  state.ui.selectedType = 'text';
  // 默认颜色：按当前便签数量循环选取
  state.ui.selectedColor = NOTE_COLORS[state.notes.length % NOTE_COLORS.length];
  updateTypeSelector();
  renderColorPicker();
  $('newNoteTitle').value = '';
  $('addModal').classList.remove('hidden');
  setTimeout(() => $('newNoteTitle')?.focus(), 80);
}

function hideAddModal() {
  $('addModal').classList.add('hidden');
}

function updateTypeSelector() {
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === state.ui.selectedType);
  });
}

function confirmAddNote() {
  const title = $('newNoteTitle')?.value?.trim() ?? '';
  const note = createNote(state.ui.selectedType, title, state.ui.selectedColor);
  state.activeId = note.id;
  hideAddModal();
  renderTabs();
  renderContent();
  scheduleSave();
}

function showSettingsPanel() {
  $('settingsPanel').classList.remove('hidden');
}

function hideSettingsPanel() {
  $('settingsPanel').classList.add('hidden');
}

function selectNote(id) {
  state.activeId = id;
  renderTabs();
  renderContent();
  scheduleSave();
}

function doDeleteNote(id) {
  deleteNote(id);
  renderTabs();
  renderContent();
  scheduleSave();
}

// ════════════════════════════════════════════════════════════════════════════
// 事件绑定
// ════════════════════════════════════════════════════════════════════════════

function bindEvents() {
  // 窗口控件
  $('btnMinimize')?.addEventListener('click', () => window.electronAPI.minimizeWindow());

  $('btnClose')?.addEventListener('click', async () => {
    await saveNow();
    window.electronAPI.closeWindow();
  });

  $('btnPin')?.addEventListener('click', async () => {
    state.ui.pinned = !state.ui.pinned;
    await window.electronAPI.setAlwaysOnTop(state.ui.pinned);
    $('btnPin').classList.toggle('active', state.ui.pinned);
    // 同步设置面板
    const tog = $('alwaysOnTopToggle');
    if (tog) tog.checked = state.ui.pinned;
    state.settings.alwaysOnTop = state.ui.pinned;
    scheduleSave();
  });

  // 透明度
  const slider = $('opacitySlider');
  const valLabel = $('opacityValue');
  if (slider) {
    slider.addEventListener('input', () => {
      const val = slider.value / 100;
      if (valLabel) valLabel.textContent = `${slider.value}%`;
      window.electronAPI.setOpacity(val);
      state.settings.opacity = val;
      scheduleSave();
    });
  }

  // 设置面板
  $('btnSettings')?.addEventListener('click', showSettingsPanel);
  $('closeSettings')?.addEventListener('click', hideSettingsPanel);
  $('settingsPanel')?.addEventListener('click', e => {
    if (e.target === $('settingsPanel')) hideSettingsPanel();
  });

  // 开机自启
  $('autoStartToggle')?.addEventListener('change', async e => {
    await window.electronAPI.setAutoStart(e.target.checked);
    state.settings.autoStart = e.target.checked;
    scheduleSave();
  });

  // 固定置顶（设置面板内）
  $('alwaysOnTopToggle')?.addEventListener('change', async e => {
    state.ui.pinned = e.target.checked;
    await window.electronAPI.setAlwaysOnTop(e.target.checked);
    $('btnPin')?.classList.toggle('active', e.target.checked);
    state.settings.alwaysOnTop = e.target.checked;
    scheduleSave();
  });

  // 新建弹窗
  $('cancelAdd')?.addEventListener('click', hideAddModal);
  $('confirmAdd')?.addEventListener('click', confirmAddNote);
  $('addModal')?.addEventListener('click', e => {
    if (e.target === $('addModal')) hideAddModal();
  });

  $('typeSelector')?.addEventListener('click', e => {
    const btn = e.target.closest('.type-btn');
    if (btn) { state.ui.selectedType = btn.dataset.type; updateTypeSelector(); }
  });

  $('newNoteTitle')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmAddNote();
    if (e.key === 'Escape') hideAddModal();
  });

  // Escape 关闭所有弹窗
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideAddModal(); hideSettingsPanel(); }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 初始化
// ════════════════════════════════════════════════════════════════════════════

async function init() {
  const data = await window.electronAPI.loadData();

  if (data) {
    state.notes = Array.isArray(data.notes) ? data.notes : [];
    if (data.settings) {
      state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      state.ui.pinned = state.settings.alwaysOnTop ?? true;
    }
    // 恢复上次激活的便签
    const lastId = data.settings?.activeNoteId;
    if (lastId && state.notes.find(n => n.id === lastId)) {
      state.activeId = lastId;
    } else {
      state.activeId = state.notes[0]?.id ?? null;
    }
  }

  // 应用保存的设置到 UI
  const slider = $('opacitySlider');
  const valLabel = $('opacityValue');
  if (slider) {
    const pct = Math.round((state.settings.opacity ?? 0.93) * 100);
    slider.value = pct;
    if (valLabel) valLabel.textContent = `${pct}%`;
  }

  $('btnPin')?.classList.toggle('active', state.ui.pinned);

  // 获取并显示开机自启状态
  try {
    const autoStart = await window.electronAPI.getAutoStart();
    const tog = $('autoStartToggle');
    if (tog) tog.checked = autoStart;
    state.settings.autoStart = autoStart;
  } catch (e) {}

  const atTog = $('alwaysOnTopToggle');
  if (atTog) atTog.checked = state.ui.pinned;

  // 绑定事件
  bindEvents();

  // 初始渲染
  renderTabs();
  renderContent();
}

init();
