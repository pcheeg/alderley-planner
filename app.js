(function () {
  "use strict";

  const STORAGE_KEYS = {
    furniture: "alderleyPlanner:furnitureLibrary",
    layouts: "alderleyPlanner:layouts",
    activeLayouts: "alderleyPlanner:activeLayouts",
    selectedRoom: "alderleyPlanner:selectedRoom"
  };

  const state = {
    furnitureLibrary: loadFurnitureLibrary(),
    layouts: loadLayouts(),
    activeLayouts: loadJson(STORAGE_KEYS.activeLayouts, {}),
    selectedRoomId: localStorage.getItem(STORAGE_KEYS.selectedRoom) || ROOMS[0].id,
    selectedItem: null,
    drag: null,
    scale: 1
  };

  const els = {
    roomSelect: document.getElementById("roomSelect"),
    roomName: document.getElementById("roomName"),
    roomDimensions: document.getElementById("roomDimensions"),
    layoutSelect: document.getElementById("layoutSelect"),
    newLayoutBtn: document.getElementById("newLayoutBtn"),
    duplicateLayoutBtn: document.getElementById("duplicateLayoutBtn"),
    clearLayoutBtn: document.getElementById("clearLayoutBtn"),
    plan: document.getElementById("plan"),
    selectedName: document.getElementById("selectedName"),
    selectedDetails: document.getElementById("selectedDetails"),
    rotateBtn: document.getElementById("rotateBtn"),
    deleteBtn: document.getElementById("deleteBtn"),
    librarySelect: document.getElementById("librarySelect"),
    libraryList: document.getElementById("libraryList"),
    addToRoomBtn: document.getElementById("addToRoomBtn"),
    furnitureForm: document.getElementById("furnitureForm"),
    doorForm: document.getElementById("doorForm")
  };

  seedLayouts();
  bindEvents();
  renderAll();

  function bindEvents() {
    els.roomSelect.addEventListener("change", () => {
      state.selectedRoomId = els.roomSelect.value;
      clearSelection();
      localStorage.setItem(STORAGE_KEYS.selectedRoom, state.selectedRoomId);
      ensureActiveLayout();
      renderAll();
    });
    els.layoutSelect.addEventListener("change", () => {
      state.activeLayouts[state.selectedRoomId] = els.layoutSelect.value;
      clearSelection();
      saveActiveLayouts();
      renderAll();
    });
    els.newLayoutBtn.addEventListener("click", createLayout);
    els.duplicateLayoutBtn.addEventListener("click", duplicateLayout);
    els.clearLayoutBtn.addEventListener("click", clearLayout);
    els.addToRoomBtn.addEventListener("click", addFurnitureToRoom);
    els.rotateBtn.addEventListener("click", rotateSelected);
    els.deleteBtn.addEventListener("click", deleteSelected);
    els.furnitureForm.addEventListener("submit", saveCustomFurniture);
    els.doorForm.addEventListener("submit", addDoor);
    window.addEventListener("resize", renderPlan);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);
  }

  function renderAll() { renderRoomOptions(); renderLayoutOptions(); renderLibrary(); renderPlan(); renderSelection(); }
  function renderRoomOptions() { els.roomSelect.innerHTML = ROOMS.map((room) => '<option value="' + room.id + '">' + escapeHtml(room.name) + '</option>').join(""); els.roomSelect.value = state.selectedRoomId; }
  function renderLayoutOptions() { const layouts = getRoomLayouts(); ensureActiveLayout(); els.layoutSelect.innerHTML = layouts.map((layout) => '<option value="' + layout.id + '">' + escapeHtml(layout.name) + '</option>').join(""); els.layoutSelect.value = getActiveLayout().id; }
  function renderLibrary() { els.librarySelect.innerHTML = state.furnitureLibrary.length ? state.furnitureLibrary.map((item) => '<option value="' + item.id + '">' + escapeHtml(item.name) + ' (' + item.width + ' x ' + item.depth + 'cm)</option>').join("") : '<option value="">No furniture yet</option>'; els.addToRoomBtn.disabled = !state.furnitureLibrary.length; els.libraryList.innerHTML = state.furnitureLibrary.length ? state.furnitureLibrary.map(renderLibraryCard).join("") : '<p class="empty-state">Add your first furniture item below.</p>'; }
  function renderLibraryCard(item) { const meta = [item.category, item.width + ' x ' + item.depth + 'cm', item.height ? item.height + 'cm high' : '', formatStatus(item.status)].filter(Boolean).join(' | '); const link = item.retailerLink ? '<a href="' + escapeAttribute(item.retailerLink) + '" target="_blank" rel="noreferrer">Retailer</a>' : ''; const notes = item.notes ? '<span>' + escapeHtml(item.notes) + '</span>' : ''; return '<article class="library-card"><div class="library-card-header"><strong>' + escapeHtml(item.name) + '</strong><button type="button" class="library-delete danger" data-delete-furniture="' + item.id + '">Delete</button></div><span>' + escapeHtml(meta) + '</span>' + notes + link + '</article>';  }

  function renderPlan() {
    const room = getSelectedRoom();
    const layout = normalizeLayout(getActiveLayout());
    const shellWidth = Math.max(260, els.plan.parentElement.clientWidth - 36);
    const maxPlanWidth = Math.min(shellWidth, 760);
    const maxPlanHeight = window.innerWidth < 700 ? 520 : 620;
    state.scale = Math.min(maxPlanWidth / room.width, maxPlanHeight / room.depth);
    const planWidth = Math.round(room.width * state.scale);
    const planHeight = Math.round(room.depth * state.scale);
    const gridSize = Math.max(12, Math.round(50 * state.scale));
    els.roomName.textContent = room.name;
    els.roomDimensions.textContent = room.width + 'cm x ' + room.depth + 'cm';
    els.plan.style.setProperty('--plan-width', planWidth + 'px');
    els.plan.style.setProperty('--plan-height', planHeight + 'px');
    els.plan.style.setProperty('--grid-size', gridSize + 'px');
    layout.items.forEach(fitItemInsideRoom);
    layout.openings.forEach((opening) => opening.type === 'door' ? fitDoorInsideRoom(opening) : fitWindowInsideRoom(opening));
    const overlapIds = getOverlappingFurnitureIds(layout.items);
    els.plan.innerHTML = layout.openings.map(renderOpening).join("") + layout.items.map((item) => renderPlacedItem(item, overlapIds)).join("");
    els.plan.querySelectorAll('.furniture,.opening').forEach((node) => node.addEventListener('pointerdown', startDrag));
    els.libraryList.querySelectorAll('[data-delete-furniture]').forEach((button) => button.addEventListener('click', deleteFurnitureFromLibrary));
    saveLayouts();
  }

  function renderPlacedItem(item, overlapIds) { const libraryItem = findLibraryItem(item.furnitureId); const name = libraryItem ? libraryItem.name : 'Furniture'; const statusClass = libraryItem && normalizeStatus(libraryItem.status) === 'own' ? ' status-own' : ' status-dont-own'; const size = getPlacedSize(item); const selected = isSelected('furniture', item.id) ? ' selected' : ''; const overlap = overlapIds && overlapIds.has(item.id) ? ' overlap' : ''; return '<div class="furniture' + statusClass + selected + overlap + '" data-kind="furniture" data-id="' + item.id + '" style="left:' + (item.x * state.scale) + 'px;top:' + (item.y * state.scale) + 'px;width:' + (size.width * state.scale) + 'px;height:' + (size.depth * state.scale) + 'px;">' + escapeHtml(name) + '</div>'; }
  function renderOpening(opening) { return opening.type === 'door' ? renderDoor(opening) : renderWindow(opening); }
  function renderDoor(door) { const box = getDoorBox(door); const selected = isSelected('opening', door.id) ? ' selected' : ''; return '<div class="opening opening-door' + selected + '" data-kind="opening" data-id="' + door.id + '" style="left:' + (box.x * state.scale) + 'px;top:' + (box.y * state.scale) + 'px;width:' + (box.width * state.scale) + 'px;height:' + (box.depth * state.scale) + 'px;">' + renderDoorSwing(door) + 'Door</div>'; }
  function renderWindow(opening) { const box = getWindowBox(opening); const selected = isSelected('opening', opening.id) ? ' selected' : ''; return '<div class="opening opening-window' + selected + '" data-kind="opening" data-id="' + opening.id + '" style="left:' + (box.x * state.scale) + 'px;top:' + (box.y * state.scale) + 'px;width:' + (box.width * state.scale) + 'px;height:' + (box.depth * state.scale) + 'px;">Window</div>'; }
  function renderDoorSwing(door) { const path = getDoorArcPath(door); return '<svg class="opening-swing" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="door-arc" d="' + path.arc + '"></path><line class="door-leaf" x1="' + path.hx + '" y1="' + path.hy + '" x2="' + path.closedX + '" y2="' + path.closedY + '"></line><line class="door-leaf" x1="' + path.hx + '" y1="' + path.hy + '" x2="' + path.openX + '" y2="' + path.openY + '"></line></svg>'; }
  function getDoorArcPath(door) {
    const left = (door.swing || 'right') === 'left';
    const rotation = ((door.rotation || 0) % 360 + 360) % 360;
    const base = left
      ? { hinge: { x: 100, y: 0 }, closed: { x: 0, y: 0 }, open: { x: 100, y: 100 }, sweep: 0 }
      : { hinge: { x: 0, y: 0 }, closed: { x: 100, y: 0 }, open: { x: 0, y: 100 }, sweep: 1 };
    const hinge = rotateDoorPoint(base.hinge, rotation);
    const closed = rotateDoorPoint(base.closed, rotation);
    const open = rotateDoorPoint(base.open, rotation);
    return {
      hx: hinge.x,
      hy: hinge.y,
      closedX: closed.x,
      closedY: closed.y,
      openX: open.x,
      openY: open.y,
      arc: 'M' + closed.x + ' ' + closed.y + ' A100 100 0 0 ' + base.sweep + ' ' + open.x + ' ' + open.y
    };
  }
  function rotateDoorPoint(point, rotation) {
    if (rotation === 90) return { x: 100 - point.y, y: point.x };
    if (rotation === 180) return { x: 100 - point.x, y: 100 - point.y };
    if (rotation === 270) return { x: point.y, y: 100 - point.x };
    return point;
  }

  function renderSelection() {
    const selected = getSelectedThing();
    els.rotateBtn.disabled = !selected;
    els.deleteBtn.disabled = !selected;
    if (!selected) { els.selectedName.textContent = 'No item selected'; els.selectedDetails.textContent = 'Tap furniture, a door, or a window to edit it.'; return; }
    if (selected.kind === 'opening') {
      if (selected.item.type === 'door') { const size = getDoorSize(selected.item); els.selectedName.textContent = 'Door'; els.selectedDetails.textContent = size.width + 'cm x ' + size.depth + 'cm | opens ' + (selected.item.swing || 'right') + ' | ' + (selected.item.rotation || 0) + ' degrees'; return; }
      els.selectedName.textContent = 'Window'; els.selectedDetails.textContent = selected.item.wall + ' wall | ' + selected.item.width + 'cm wide'; return;
    }
    const item = findLibraryItem(selected.item.furnitureId); const size = getPlacedSize(selected.item); els.selectedName.textContent = item ? item.name : 'Furniture'; els.selectedDetails.textContent = size.width + 'cm x ' + size.depth + 'cm | ' + selected.item.rotation + ' degrees';
  }

  function startDrag(event) { const kind = event.currentTarget.dataset.kind; const id = event.currentTarget.dataset.id; const target = findThing(kind, id); if (!target) return; state.selectedItem = { kind, id }; const point = getPlanPoint(event); const pos = getThingPosition(kind, target); state.drag = { kind, id, offsetX: point.x - pos.x, offsetY: point.y - pos.y }; event.currentTarget.setPointerCapture(event.pointerId); renderPlan(); renderSelection(); }
  function onPointerMove(event) { if (!state.drag) return; const point = getPlanPoint(event); const nextX = point.x - state.drag.offsetX; const nextY = point.y - state.drag.offsetY; if (state.drag.kind === 'opening') moveOpening(state.drag.id, nextX, nextY); else moveFurniture(state.drag.id, nextX, nextY); saveLayouts(); renderPlan(); }
  function endDrag() { state.drag = null; }
  function getPlanPoint(event) { const rect = els.plan.getBoundingClientRect(); return { x: (event.clientX - rect.left - els.plan.clientLeft) / state.scale, y: (event.clientY - rect.top - els.plan.clientTop) / state.scale }; }
  function getThingPosition(kind, item) { if (kind !== 'opening') return item; return item.type === 'door' ? { x: item.x, y: item.y } : getWindowPosition(item); }
  function moveFurniture(id, nextX, nextY) { const room = getSelectedRoom(); const item = getActiveLayout().items.find((entry) => entry.id === id); if (!item) return; const size = getPlacedSize(item); item.x = clamp(Math.round(nextX), 0, Math.max(0, room.width - size.width)); item.y = clamp(Math.round(nextY), 0, Math.max(0, room.depth - size.depth)); }
  function moveOpening(id, nextX, nextY) { const opening = getActiveLayout().openings.find((entry) => entry.id === id); if (!opening) return; if (opening.type === 'door') { moveDoor(opening, nextX, nextY); } else { moveWindow(opening, nextX, nextY); } }
  function moveDoor(door, nextX, nextY) { const room = getSelectedRoom(); const size = getDoorSize(door); door.x = clamp(Math.round(nextX), 0, Math.max(0, room.width - size.width)); door.y = clamp(Math.round(nextY), 0, Math.max(0, room.depth - size.depth)); }
  function moveWindow(opening, nextX, nextY) { const room = getSelectedRoom(); const horizontal = opening.wall === 'top' || opening.wall === 'bottom'; const limit = horizontal ? room.width - opening.width : room.depth - opening.width; opening.offset = clamp(Math.round(horizontal ? nextX : nextY), 0, Math.max(0, limit)); }

  function deleteFurnitureFromLibrary(event) {
    const id = event.currentTarget.dataset.deleteFurniture;
    const item = findLibraryItem(id);
    if (!item) return;
    if (!confirm('Delete ' + item.name + ' from the library and all room layouts?')) return;
    state.furnitureLibrary = state.furnitureLibrary.filter((entry) => entry.id !== id);
    Object.values(state.layouts).forEach((layouts) => {
      layouts.forEach((layout) => {
        normalizeLayout(layout).items = layout.items.filter((placed) => placed.furnitureId !== id);
      });
    });
    if (state.selectedItem && state.selectedItem.kind === 'furniture') clearSelection();
    saveFurnitureLibrary();
    saveLayouts();
    renderAll();
  }
  function addFurnitureToRoom() { const libraryItem = findLibraryItem(els.librarySelect.value); if (!libraryItem) return; const room = getSelectedRoom(); const layout = normalizeLayout(getActiveLayout()); const item = { id: uniqueId('placed'), furnitureId: libraryItem.id, x: Math.max(0, Math.round((room.width - libraryItem.width) / 2)), y: Math.max(0, Math.round((room.depth - libraryItem.depth) / 2)), rotation: 0 }; layout.items.push(item); state.selectedItem = { kind: 'furniture', id: item.id }; fitItemInsideRoom(item); saveLayouts(); renderAll(); }
  function addDoor(event) { event.preventDefault(); const form = new FormData(els.doorForm); const room = getSelectedRoom(); const door = { id: uniqueId('opening'), type: 'door', x: Math.round(room.width / 2 - 40), y: Math.round(room.depth / 2 - 40), width: Number(form.get('width')) || 80, depth: Number(form.get('depth')) || 80, swing: form.get('swing') || 'right', rotation: 0 }; normalizeLayout(getActiveLayout()).openings.push(door); state.selectedItem = { kind: 'opening', id: door.id }; fitDoorInsideRoom(door); saveLayouts(); renderAll(); }
  function rotateSelected() { const selected = getSelectedThing(); if (!selected) return; if (selected.kind === 'opening') { if (selected.item.type === 'door') rotateDoor(selected.item); else rotateWindow(selected.item); } else { selected.item.rotation = (selected.item.rotation + 90) % 180; fitItemInsideRoom(selected.item); } saveLayouts(); renderAll(); }
  function rotateDoor(door) { door.rotation = ((door.rotation || 0) + 90) % 360; fitDoorInsideRoom(door); }
  function rotateWindow(opening) { const walls = ['top', 'right', 'bottom', 'left']; const index = walls.indexOf(opening.wall); opening.wall = walls[(index + 1) % walls.length]; fitWindowInsideRoom(opening); }
  function deleteSelected() { const layout = normalizeLayout(getActiveLayout()); if (!state.selectedItem) return; if (state.selectedItem.kind === 'opening') layout.openings = layout.openings.filter((item) => item.id !== state.selectedItem.id); else layout.items = layout.items.filter((item) => item.id !== state.selectedItem.id); clearSelection(); saveLayouts(); renderAll(); }
  function clearLayout() { const layout = normalizeLayout(getActiveLayout()); if (!layout.items.length && !layout.openings.length) return; if (confirm('Clear ' + layout.name + '?')) { layout.items = []; layout.openings = []; clearSelection(); saveLayouts(); renderAll(); } }
  function createLayout() { const layout = { id: uniqueId('layout'), name: nextLayoutName(), items: [], openings: [] }; getRoomLayouts().push(layout); state.activeLayouts[state.selectedRoomId] = layout.id; clearSelection(); saveLayouts(); saveActiveLayouts(); renderAll(); }
  function duplicateLayout() { const source = normalizeLayout(getActiveLayout()); const duplicate = { id: uniqueId('layout'), name: nextDuplicateName(source.name), items: source.items.map((item) => ({ ...item, id: uniqueId('placed') })), openings: source.openings.map((item) => ({ ...item, id: uniqueId('opening') })) }; getRoomLayouts().push(duplicate); state.activeLayouts[state.selectedRoomId] = duplicate.id; clearSelection(); saveLayouts(); saveActiveLayouts(); renderAll(); }
  function saveCustomFurniture(event) { event.preventDefault(); const form = new FormData(els.furnitureForm); const width = Number(form.get('width')); const depth = Number(form.get('depth')); if (!width || !depth) return; const item = { id: uniqueId('furniture'), name: form.get('name').trim(), category: form.get('category').trim(), width, depth, height: Number(form.get('height')) || '', price: form.get('price').trim(), retailerLink: form.get('retailerLink').trim(), notes: form.get('notes').trim(), status: normalizeStatus(form.get('status')) }; state.furnitureLibrary.push(item); saveFurnitureLibrary(); els.furnitureForm.reset(); renderLibrary(); els.librarySelect.value = item.id; }

  function getSelectedRoom() { return ROOMS.find((room) => room.id === state.selectedRoomId) || ROOMS[0]; }
  function getRoomLayouts() { if (!state.layouts[state.selectedRoomId]) state.layouts[state.selectedRoomId] = [{ id: uniqueId('layout'), name: 'Layout 1', items: [], openings: [] }]; state.layouts[state.selectedRoomId].forEach(normalizeLayout); return state.layouts[state.selectedRoomId]; }
  function getActiveLayout() { const layouts = getRoomLayouts(); const activeId = state.activeLayouts[state.selectedRoomId]; return layouts.find((layout) => layout.id === activeId) || layouts[0]; }
  function ensureActiveLayout() { const layouts = getRoomLayouts(); const active = layouts.find((layout) => layout.id === state.activeLayouts[state.selectedRoomId]); if (!active) { state.activeLayouts[state.selectedRoomId] = layouts[0].id; saveActiveLayouts(); } }
  function normalizeLayout(layout) { if (!layout.items) layout.items = []; if (!layout.openings) layout.openings = []; layout.openings.forEach(normalizeOpening); return layout; }
  function normalizeOpening(opening) { if (opening.type === 'door') { if (opening.x == null || opening.y == null) { const box = getLegacyDoorBox(opening); opening.x = box.x; opening.y = box.y; } if (!opening.swing) opening.swing = 'right'; if (!opening.rotation) opening.rotation = 0; } }
  function seedLayouts() { ROOMS.forEach((room) => { if (!state.layouts[room.id]) state.layouts[room.id] = [{ id: uniqueId('layout'), name: 'Layout 1', items: [], openings: [] }]; state.layouts[room.id].forEach(normalizeLayout); if (!state.activeLayouts[room.id]) state.activeLayouts[room.id] = state.layouts[room.id][0].id; }); saveLayouts(); saveActiveLayouts(); }

  function getSelectedThing() { if (!state.selectedItem) return null; const item = findThing(state.selectedItem.kind, state.selectedItem.id); return item ? { kind: state.selectedItem.kind, item } : null; }
  function findThing(kind, id) { const layout = normalizeLayout(getActiveLayout()); return kind === 'opening' ? layout.openings.find((item) => item.id === id) : layout.items.find((item) => item.id === id); }
  function isSelected(kind, id) { return !!state.selectedItem && state.selectedItem.kind === kind && state.selectedItem.id === id; }
  function clearSelection() { state.selectedItem = null; }
  function findLibraryItem(id) { return state.furnitureLibrary.find((item) => item.id === id); }
  function getPlacedSize(placedItem) { const item = findLibraryItem(placedItem.furnitureId); if (!item) return { width: 60, depth: 60 }; const rotated = placedItem.rotation % 180 !== 0; return { width: rotated ? item.depth : item.width, depth: rotated ? item.width : item.depth }; }
  function getDoorSize(door) { const rotated = (door.rotation || 0) % 180 !== 0; return { width: rotated ? door.depth : door.width, depth: rotated ? door.width : door.depth }; }
  function getDoorBox(door) { const size = getDoorSize(door); return { x: door.x || 0, y: door.y || 0, width: size.width, depth: size.depth }; }
  function getWindowBox(opening) { const room = getSelectedRoom(); const depth = 12; if (opening.wall === 'top') return { x: opening.offset, y: -depth / 2, width: opening.width, depth }; if (opening.wall === 'bottom') return { x: opening.offset, y: room.depth - depth / 2, width: opening.width, depth }; if (opening.wall === 'left') return { x: -depth / 2, y: opening.offset, width: depth, depth: opening.width }; return { x: room.width - depth / 2, y: opening.offset, width: depth, depth: opening.width }; }
  function getWindowPosition(opening) { const box = getWindowBox(opening); return { x: box.x, y: box.y }; }
  function getLegacyDoorBox(opening) { const room = getSelectedRoom(); const depth = Math.max(20, opening.depth || 80); if (opening.wall === 'top') return { x: opening.offset || 0, y: 0 }; if (opening.wall === 'bottom') return { x: opening.offset || 0, y: room.depth - depth }; if (opening.wall === 'left') return { x: 0, y: opening.offset || 0 }; return { x: room.width - depth, y: opening.offset || 0 }; }
  function fitItemInsideRoom(item) { const room = getSelectedRoom(); const size = getPlacedSize(item); item.x = clamp(item.x, 0, Math.max(0, room.width - size.width)); item.y = clamp(item.y, 0, Math.max(0, room.depth - size.depth)); }
  function fitDoorInsideRoom(door) { const room = getSelectedRoom(); door.width = Math.max(20, Number(door.width) || 80); door.depth = Math.max(20, Number(door.depth) || 80); const size = getDoorSize(door); door.x = clamp(Number(door.x) || 0, 0, Math.max(0, room.width - size.width)); door.y = clamp(Number(door.y) || 0, 0, Math.max(0, room.depth - size.depth)); }
  function fitWindowInsideRoom(opening) { const room = getSelectedRoom(); const horizontal = opening.wall === 'top' || opening.wall === 'bottom'; const maxWidth = horizontal ? room.width : room.depth; opening.width = clamp(opening.width, 20, maxWidth); opening.offset = clamp(opening.offset, 0, Math.max(0, maxWidth - opening.width)); opening.depth = 12; }
  function getFurnitureBox(item) { const size = getPlacedSize(item); return { id: item.id, x: item.x, y: item.y, width: size.width, depth: size.depth }; }
  function boxesOverlap(a, b) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.depth && a.y + a.depth > b.y; }
  function getOverlappingFurnitureIds(items) { const room = getSelectedRoom(); const boxes = items.map(getFurnitureBox); const ids = new Set(); boxes.forEach((box) => { if (box.width > room.width || box.depth > room.depth) ids.add(box.id); }); for (let i = 0; i < boxes.length; i += 1) { for (let j = i + 1; j < boxes.length; j += 1) { if (boxesOverlap(boxes[i], boxes[j])) { ids.add(boxes[i].id); ids.add(boxes[j].id); } } } return ids; }
  function nextLayoutName() { const layouts = getRoomLayouts(); let n = layouts.length + 1; while (layouts.some((layout) => layout.name === 'Layout ' + n)) n += 1; return 'Layout ' + n; }
  function nextDuplicateName(name) { const layouts = getRoomLayouts(); let n = 2; let candidate = name + ' copy'; while (layouts.some((layout) => layout.name === candidate)) { candidate = name + ' copy ' + n; n += 1; } return candidate; }

  function normalizeStatus(status) { return status === 'own' || status === 'bought' || status === 'already own' ? 'own' : 'dont-own'; }
  function formatStatus(status) { return normalizeStatus(status) === 'own' ? 'Own' : "Don't own"; }
  function loadFurnitureLibrary() { const saved = loadJson(STORAGE_KEYS.furniture, null); const library = Array.isArray(saved) ? saved : DEFAULT_FURNITURE; library.forEach((item) => { item.status = normalizeStatus(item.status); }); return library; }
  function loadLayouts() { return loadJson(STORAGE_KEYS.layouts, {}); }
  function loadJson(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (error) { console.warn('Could not load ' + key, error); return fallback; } }
  function saveFurnitureLibrary() { localStorage.setItem(STORAGE_KEYS.furniture, JSON.stringify(state.furnitureLibrary)); }
  function saveLayouts() { localStorage.setItem(STORAGE_KEYS.layouts, JSON.stringify(state.layouts)); }
  function saveActiveLayouts() { localStorage.setItem(STORAGE_KEYS.activeLayouts, JSON.stringify(state.activeLayouts)); }
  function uniqueId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function escapeAttribute(value) { return escapeHtml(value); }
})();
