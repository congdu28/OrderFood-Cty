const STORAGE_KEY = "an-chung-food-order-v1";
const SUPABASE_TABLE = "food_order_sessions";
const AVATAR_COLORS = ["#f36b45", "#628d76", "#6d7bc0", "#d78c38", "#b76c91", "#4d99a7"];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const dom = {
  sidebar: $(".sidebar"),
  connectionNote: $("#connectionNote"),
  pageTitle: $("#pageTitle"),
  todayLabel: $("#todayLabel"),
  statsGrid: $("#statsGrid"),
  activeSessionSummary: $("#activeSessionSummary"),
  miniHistory: $("#miniHistory"),
  sessionSwitcher: $("#sessionSwitcher"),
  sessionMeta: $("#sessionMeta"),
  statusNotice: $("#statusNotice"),
  saveSessionBtn: $("#saveSessionBtn"),
  lockSessionBtn: $("#lockSessionBtn"),
  archiveSessionBtn: $("#archiveSessionBtn"),
  deleteSessionBtn: $("#deleteSessionBtn"),
  closeSessionBtn: $("#closeSessionBtn"),
  memberPicker: $("#memberPicker"),
  newMemberName: $("#newMemberName"),
  memberList: $("#memberList"),
  memberCountBadge: $("#memberCountBadge"),
  currentOrderCount: $("#currentOrderCount"),
  foodOptions: $("#foodOptions"),
  customFoodForm: $("#customFoodForm"),
  customFoodName: $("#customFoodName"),
  customFoodPrice: $("#customFoodPrice"),
  customFoodQty: $("#customFoodQty"),
  selectedFoods: $("#selectedFoods"),
  equalFields: $("#equalFields"),
  itemFields: $("#itemFields"),
  totalBillInput: $("#totalBillInput"),
  deliveryFeeInput: $("#deliveryFeeInput"),
  discountInput: $("#discountInput"),
  pricingList: $("#pricingList"),
  billingModeBadge: $("#billingModeBadge"),
  billingTotal: $("#billingTotal"),
  bankNameInput: $("#bankNameInput"),
  bankAccountInput: $("#bankAccountInput"),
  bankOwnerInput: $("#bankOwnerInput"),
  transferNoteInput: $("#transferNoteInput"),
  qrFileInput: $("#qrFileInput"),
  qrPreview: $("#qrPreview"),
  qrPlaceholder: $("#qrPlaceholder"),
  paymentLockLabel: $("#paymentLockLabel"),
  paymentMembers: $("#paymentMembers"),
  paidSummary: $("#paidSummary"),
  historyFilter: $("#historyFilter"),
  historyStats: $("#historyStats"),
  historyTable: $("#historyTable"),
  sessionModal: $("#sessionModal"),
  newSessionForm: $("#newSessionForm"),
  sessionTitleInput: $("#sessionTitleInput"),
  restaurantInput: $("#restaurantInput"),
  deadlineInput: $("#deadlineInput"),
  initialMembersInput: $("#initialMembersInput"),
  createMenuRows: $("#createMenuRows"),
  addCreateMenuBtn: $("#addCreateMenuBtn"),
  toast: $("#toast")
};

let supabaseClient = null;
let remoteSessionIds = new Set();
let remoteSyncTimer = null;
let appState = loadState();
let currentView = "dashboard";
let toastTimer;

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function localDateTimeValue(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultMenu() {
  return [
    { id: "menu_com_ga", name: "Cơm gà xối mỡ", price: 45000, note: "Kèm canh" },
    { id: "menu_bun_bo", name: "Bún bò Huế", price: 40000, note: "Ít cay" },
    { id: "menu_com_suon", name: "Cơm sườn nướng", price: 50000, note: "Thêm trứng +8k" },
    { id: "menu_tra_sua", name: "Trà sữa trân châu", price: 35000, note: "Size M" }
  ];
}

function makeMember(name, index) {
  return {
    id: id("member"),
    name: name.trim(),
    color: AVATAR_COLORS[index % AVATAR_COLORS.length],
    paid: false,
    paidAt: null,
    selections: []
  };
}

function normalizeSession(session) {
  session.archived = Boolean(session.archived);
  session.menu = Array.isArray(session.menu) ? session.menu : defaultMenu();
  session.members = Array.isArray(session.members) ? session.members : [];
  session.members.forEach((member, index) => {
    member.color ||= AVATAR_COLORS[index % AVATAR_COLORS.length];
    member.selections = Array.isArray(member.selections) ? member.selections : [];
    member.paid = Boolean(member.paid);
  });
  session.creatorMemberId ||= session.members[0]?.id || null;
  const legacyCreator = session.members.find((member) => member.id === session.creatorMemberId);
  session.creatorName ||= legacyCreator?.name || "Người tạo phiên";
  session.creatorColor ||= legacyCreator?.color || AVATAR_COLORS[0];
  session.payment ||= { bankName: "", accountNumber: "", accountOwner: "", transferNote: "", qrImage: "" };
  return session;
}

function createSeedSession() {
  const menu = defaultMenu();
  const members = [makeMember("An", 0), makeMember("Bình", 1), makeMember("Chi", 2)];
  members[0].selections.push({ id: id("pick"), sourceMenuId: menu[0].id, name: menu[0].name, price: menu[0].price, quantity: 1, custom: false });
  members[1].selections.push({ id: id("pick"), sourceMenuId: menu[1].id, name: menu[1].name, price: menu[1].price, quantity: 1, custom: false });
  members[2].selections.push({ id: id("pick"), sourceMenuId: null, name: "Mì cay cấp 1", price: 55000, quantity: 1, custom: true });

  return {
    id: id("session"),
    title: "Ăn trưa thứ Sáu",
    restaurant: "Quán Cơm Nhà Mình",
    createdAt: new Date().toISOString(),
    deadline: new Date(Date.now() + 1000 * 60 * 90).toISOString(),
    status: "open",
    splitMethod: "item",
    equalTotal: 0,
    deliveryFee: 15000,
    discount: 0,
    menu,
    members,
    creatorMemberId: members[0].id,
    payment: {
      bankName: "Vietcombank",
      accountNumber: "0123 456 789",
      accountOwner: "NGUYEN VAN AN",
      transferNote: "AN TRUA THU 6",
      qrImage: ""
    }
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.sessions)) {
      const sessions = saved.sessions.map(normalizeSession);
      return {
        sessions,
        activeSessionId: saved.activeSessionId || sessions.find((session) => !session.archived)?.id || null,
        selectedMemberId: saved.selectedMemberId || null
      };
    }
  } catch (error) {
    console.warn("Không thể đọc dữ liệu cũ", error);
  }

  return { sessions: [], activeSessionId: null, selectedMemberId: null };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    if (supabaseClient) queueRemoteSync();
    return true;
  } catch (error) {
    console.error("Không thể lưu dữ liệu", error);
    showToast("Không thể lưu dữ liệu trên trình duyệt. Hãy thử bỏ ảnh QR quá lớn.");
    return false;
  }
}

function setConnectionNote(message, connected = false) {
  if (!dom.connectionNote) return;
  dom.connectionNote.textContent = message;
  dom.connectionNote.parentElement?.classList.toggle("is-connected", connected);
}

function getSupabaseConfig() {
  const config = window.SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) return null;
  if (!window.supabase?.createClient) return null;
  return config;
}

function queueRemoteSync() {
  clearTimeout(remoteSyncTimer);
  remoteSyncTimer = setTimeout(syncRemoteSessions, 450);
}

async function syncRemoteSessions() {
  if (!supabaseClient) return;
  const currentIds = new Set(appState.sessions.map((session) => session.id));
  const rows = appState.sessions.map((session) => ({
    id: session.id,
    payload: session,
    created_at: session.createdAt,
    updated_at: new Date().toISOString()
  }));

  if (rows.length) {
    const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert(rows, { onConflict: "id" });
    if (error) {
      console.error("Không thể đồng bộ Supabase", error);
      setConnectionNote("Lỗi đồng bộ dữ liệu", false);
      showToast("Không thể đồng bộ Supabase. Kiểm tra URL, key và SQL schema.");
      return;
    }
  }

  const removedIds = [...remoteSessionIds].filter((sessionId) => !currentIds.has(sessionId));
  if (removedIds.length) {
    const { error } = await supabaseClient.from(SUPABASE_TABLE).delete().in("id", removedIds);
    if (error) console.error("Không thể xóa phiên trên Supabase", error);
  }
  remoteSessionIds = currentIds;
  setConnectionNote("Supabase · đang đồng bộ", true);
}

function applyRemoteRow(row) {
  const session = normalizeSession({ ...row.payload, id: row.id });
  const index = appState.sessions.findIndex((item) => item.id === session.id);
  if (index >= 0) appState.sessions[index] = session;
  else appState.sessions.unshift(session);
  remoteSessionIds.add(session.id);
}

async function loadRemoteSessions() {
  const { data, error } = await supabaseClient.from(SUPABASE_TABLE).select("id, payload, created_at, updated_at").order("created_at", { ascending: false });
  if (error) throw error;
  remoteSessionIds = new Set(data.map((row) => row.id));
  if (data.length) {
    appState.sessions = data.map((row) => normalizeSession({ ...row.payload, id: row.id }));
    const activeExists = appState.sessions.some((session) => session.id === appState.activeSessionId && !session.archived);
    if (!activeExists) appState.activeSessionId = appState.sessions.find((session) => !session.archived)?.id || null;
    const active = activeSession();
    if (active && active.creatorMemberId !== appState.selectedMemberId && !active.members.some((member) => member.id === appState.selectedMemberId)) {
      appState.selectedMemberId = active.creatorMemberId || null;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } else if (appState.sessions.length) {
    queueRemoteSync();
  }
}

function subscribeToRemoteSessions() {
  supabaseClient
    .channel("food-order-session-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: SUPABASE_TABLE }, (payload) => {
      if (payload.eventType === "DELETE") {
        appState.sessions = appState.sessions.filter((session) => session.id !== payload.old.id);
        remoteSessionIds.delete(payload.old.id);
      } else {
        applyRemoteRow(payload.new);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
      renderAll();
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setConnectionNote("Supabase · đồng bộ trực tiếp", true);
    });
}

async function initializeSupabase() {
  const config = getSupabaseConfig();
  if (!config) {
    setConnectionNote("Dữ liệu trên trình duyệt · chưa kết nối Supabase");
    return;
  }
  try {
    setConnectionNote("Đang kết nối Supabase...");
    supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
    await loadRemoteSessions();
    subscribeToRemoteSessions();
    renderAll();
    setConnectionNote("Supabase · đang đồng bộ", true);
  } catch (error) {
    console.error("Không thể khởi tạo Supabase", error);
    supabaseClient = null;
    setConnectionNote("Không kết nối được Supabase");
    showToast("Supabase chưa sẵn sàng. Hãy chạy schema SQL và kiểm tra lại cấu hình.");
  }
}

function activeSession() {
  const availableSessions = appState.sessions.filter((item) => !item.archived);
  let session = availableSessions.find((item) => item.id === appState.activeSessionId);
  if (!session) {
    session = availableSessions.find((item) => item.status !== "completed") || availableSessions[0];
    appState.activeSessionId = session?.id || null;
  }
  return session;
}

function selectedMember(session = activeSession()) {
  if (!session) return null;
  if (!appState.selectedMemberId) appState.selectedMemberId = session.creatorMemberId || null;
  return session.members.find((item) => item.id === appState.selectedMemberId) || null;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  })[char]);
}

function money(value) {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(Number(value) || 0))}đ`;
}

function shortDate(value) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatDeadline(value) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function initials(name) {
  return name.trim().split(/\s+/).slice(-1)[0].slice(0, 1).toUpperCase() || "?";
}

function statusLabel(status) {
  return ({ open: "Đang chọn món", locked: "Đã chốt", completed: "Hoàn tất" })[status] || status;
}

function splitExact(total, count) {
  if (!count) return [];
  if (total < 0) return splitExact(-total, count).map((value) => -value);
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function itemSubtotal(member) {
  return member.selections.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
}

function calculatePayments(session) {
  if (!session || !session.members.length) return [];
  const members = session.members;
  const subtotals = members.map(itemSubtotal);

  if (session.splitMethod === "equal") {
    const shares = splitExact(Number(session.equalTotal || 0), members.length);
    return members.map((member, index) => ({
      member,
      foodSubtotal: subtotals[index],
      adjustment: shares[index] - subtotals[index],
      amount: shares[index]
    }));
  }

  const adjustments = splitExact(Number(session.deliveryFee || 0) - Number(session.discount || 0), members.length);
  return members.map((member, index) => ({
    member,
    foodSubtotal: subtotals[index],
    adjustment: adjustments[index],
    amount: subtotals[index] + adjustments[index]
  }));
}

function totalForSession(session) {
  return calculatePayments(session).reduce((total, person) => total + person.amount, 0);
}

function paidForSession(session) {
  return calculatePayments(session).reduce((total, person) => total + (person.member.paid ? person.amount : 0), 0);
}

function isLocked(session) {
  return Boolean(session && (session.status === "locked" || session.status === "completed"));
}

function isSessionCreator(session) {
  return Boolean(session && session.creatorMemberId === appState.selectedMemberId);
}

function showToast(message) {
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2500);
}

function setView(view) {
  currentView = view;
  $$(".view").forEach((section) => section.classList.toggle("is-active", section.id === `${view}View`));
  $$(".nav-link").forEach((button) => button.classList.toggle("is-active", button.dataset.viewTarget === view));
  const titles = { dashboard: "Ăn trưa thật gọn", session: "Phiên đặt đồ", history: "Lịch sử đơn ăn" };
  dom.pageTitle.textContent = titles[view];
  dom.sidebar.classList.remove("mobile-open");
  if (view === "session") renderSession();
  if (view === "history") renderHistory();
}

function renderAll() {
  renderDashboard();
  renderSession();
  renderHistory();
}

function renderDashboard() {
  const session = activeSession();
  const today = new Date();
  dom.todayLabel.textContent = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "long" }).format(today);

  const visibleSessions = appState.sessions.filter((item) => !item.archived);
  const openSessions = visibleSessions.filter((item) => item.status !== "completed");
  const lockedSessions = visibleSessions.filter((item) => isLocked(item));
  const totalOwed = openSessions.reduce((total, item) => total + (totalForSession(item) - paidForSession(item)), 0);
  const paidCount = session ? session.members.filter((member) => member.paid).length : 0;
  const peopleCount = session?.members.length || 0;
  const statCards = [
    ["Phiên đang hoạt động", openSessions.length, openSessions.length ? "Có đơn đang cần xử lý" : "Chưa có phiên nào"],
    ["Cần chuyển lại", money(totalOwed), totalOwed ? "Tổng tiền nhóm chưa thanh toán" : "Mọi khoản đã đủ"],
    ["Đã chuyển trong phiên", `${paidCount}/${peopleCount}`, peopleCount ? "Cập nhật theo thời gian thực" : "Chưa có thành viên"],
    ["Phiên đã chốt", lockedSessions.length, "Tính từ lịch sử đã lưu"]
  ];
  dom.statsGrid.innerHTML = statCards.map(([label, value, note]) => `
    <article class="stat-card"><p>${label}</p><strong>${value}</strong><div class="stat-note">${note}</div></article>
  `).join("");

  if (!session) {
    dom.activeSessionSummary.innerHTML = `<div class="active-summary-top"><div><p class="eyebrow">PHIÊN ĐANG MỞ</p><h3 class="active-summary-name">Chưa có phiên đặt đồ</h3><p class="active-summary-restaurant">Bắt đầu một phiên mới cho cả nhóm.</p></div></div><div class="summary-footer"><span></span><button class="text-button" data-open-modal="true">Tạo phiên →</button></div>`;
  } else {
    const payments = calculatePayments(session);
    const statusClass = session.status === "open" ? "" : session.status === "locked" ? "locked" : "done";
    dom.activeSessionSummary.innerHTML = `
      <div class="active-summary-top">
        <div><p class="eyebrow">PHIÊN ĐANG MỞ</p><h3 class="active-summary-name">${escapeHtml(session.title)}</h3><p class="active-summary-restaurant">${escapeHtml(session.restaurant)} · Chốt lúc ${formatDeadline(session.deadline)}</p></div>
        <span class="status-chip ${statusClass}">${statusLabel(session.status)}</span>
      </div>
      <div class="summary-amounts"><div><span>Tổng cần thanh toán</span><strong>${money(totalForSession(session))}</strong></div><div><span>Còn chờ</span><strong>${money(totalForSession(session) - paidForSession(session))}</strong></div></div>
      <div class="summary-footer"><div class="avatar-stack">${session.members.slice(0, 5).map((member) => `<span class="avatar" style="background:${member.color}">${escapeHtml(initials(member.name))}</span>`).join("")}</div><button class="text-button" data-view-target="session">Mở phiên →</button></div>`;
  }

  const latest = [...visibleSessions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
  dom.miniHistory.innerHTML = latest.length ? latest.map((item) => `
    <div class="mini-history-row"><span class="history-icon">${item.status === "completed" ? "✓" : "⌁"}</span><div><strong>${escapeHtml(item.title)}</strong><small>${shortDate(item.createdAt)} · ${item.members.length} người</small></div><b>${money(totalForSession(item))}</b></div>
  `).join("") : `<div class="history-empty">Chưa có dữ liệu.</div>`;
}

function renderSession() {
  const session = activeSession();
  if (!session) {
    dom.sessionSwitcher.innerHTML = `<option>Chưa có phiên đang hoạt động</option>`;
    dom.sessionSwitcher.disabled = true;
    dom.sessionMeta.textContent = "Tạo phiên mới để bắt đầu đặt đồ.";
    dom.statusNotice.classList.add("show");
    dom.statusNotice.innerHTML = `Chưa có phiên đang hoạt động. Bấm <strong>“Tạo phiên mới”</strong> để bắt đầu.`;
    [dom.saveSessionBtn, dom.lockSessionBtn, dom.archiveSessionBtn, dom.deleteSessionBtn, dom.closeSessionBtn].forEach((button) => { button.disabled = true; });
    dom.memberPicker.innerHTML = "";
    dom.memberList.innerHTML = "";
    dom.foodOptions.innerHTML = "";
    dom.selectedFoods.innerHTML = "";
    dom.pricingList.innerHTML = "";
    dom.paymentMembers.innerHTML = "";
    [dom.memberPicker, dom.newMemberName, dom.totalBillInput, dom.deliveryFeeInput, dom.discountInput, dom.bankNameInput, dom.bankAccountInput, dom.bankOwnerInput, dom.transferNoteInput, dom.qrFileInput].forEach((input) => { input.disabled = true; });
    dom.customFoodForm.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
    return;
  }
  const member = selectedMember(session);
  const locked = isLocked(session);
  const isCreator = isSessionCreator(session, member);
  const canOrder = Boolean(member) && !locked;
  const payments = calculatePayments(session);
  const selectedCount = member?.selections.reduce((total, item) => total + item.quantity, 0) || 0;

  dom.sessionSwitcher.disabled = false;
  dom.sessionSwitcher.innerHTML = appState.sessions.filter((item) => !item.archived).map((item) => `<option value="${item.id}" ${item.id === session.id ? "selected" : ""}>${escapeHtml(item.title)} · ${statusLabel(item.status)}</option>`).join("");
  dom.sessionMeta.textContent = `${session.restaurant} · Tạo ngày ${shortDate(session.createdAt)} · Hạn chốt ${formatDeadline(session.deadline)}`;
  dom.memberCountBadge.textContent = `${session.members.length} người`;
  dom.currentOrderCount.textContent = `${selectedCount} phần`;
  dom.billingModeBadge.textContent = session.splitMethod === "equal" ? "Chia đều" : "Theo món";
  dom.paymentLockLabel.textContent = locked ? "Đã chốt" : "Đang mở";
  dom.paymentLockLabel.style.color = locked ? "#218958" : "#76817d";
  dom.paymentLockLabel.style.borderColor = locked ? "#bce4c9" : "#dde3de";

  dom.statusNotice.classList.toggle("show", true);
  if (session.status === "open") {
    dom.statusNotice.innerHTML = `Phiên đang mở — nhập nickname rồi bấm <strong>“Tham gia”</strong> để cùng chọn món. Tổng tiền tự cập nhật theo số người tham gia.`;
  } else if (session.status === "locked") {
    dom.statusNotice.innerHTML = `<strong>Đã chốt số tiền.</strong> Mỗi thành viên chọn tên mình ở cột trái, chuyển khoản xong rồi tick “Đã chuyển”.`;
  } else {
    dom.statusNotice.innerHTML = `<strong>Phiên đã hoàn tất.</strong> Dữ liệu vẫn được lưu trong lịch sử để tra cứu theo thời gian.`;
  }

  dom.saveSessionBtn.disabled = session.status === "completed" || !isCreator;
  dom.lockSessionBtn.disabled = session.status === "completed" || !isCreator;
  dom.closeSessionBtn.disabled = session.status === "completed" || !isCreator;
  dom.archiveSessionBtn.disabled = !isCreator;
  dom.deleteSessionBtn.disabled = !isCreator;
  dom.lockSessionBtn.textContent = session.status === "open" ? "Chốt & gửi tổng tiền" : session.status === "locked" ? "Đã chốt tổng tiền" : "Đã hoàn tất";

  dom.memberPicker.disabled = false;
  dom.newMemberName.disabled = locked;
  $("#addMemberBtn").disabled = locked;
  dom.memberPicker.innerHTML = [
    `<option value="${session.creatorMemberId}" ${session.creatorMemberId === appState.selectedMemberId ? "selected" : ""}>${escapeHtml(session.creatorName)} (người tạo)</option>`,
    ...session.members.filter((item) => item.id !== session.creatorMemberId).map((item) => `<option value="${item.id}" ${item.id === appState.selectedMemberId ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
  ].join("");
  const creatorIsParticipant = session.members.some((item) => item.id === session.creatorMemberId);
  const creatorRow = creatorIsParticipant ? "" : `<div class="member-row ${session.creatorMemberId === appState.selectedMemberId ? "current" : ""}"><span class="avatar" style="background:${session.creatorColor}">${escapeHtml(initials(session.creatorName))}</span><span><span class="member-name">${escapeHtml(session.creatorName)} <small>(người tạo)</small></span><small>Quản lý món, giá và thanh toán</small></span></div>`;
  const participantRows = session.members.map((item) => {
    const count = item.selections.reduce((total, selection) => total + selection.quantity, 0);
    return `<div class="member-row ${item.id === appState.selectedMemberId ? "current" : ""}"><span class="avatar" style="background:${item.color}">${escapeHtml(initials(item.name))}</span><span><span class="member-name">${escapeHtml(item.name)} ${item.id === session.creatorMemberId ? '<small>(người tạo)</small>' : ""}</span><small>${count ? `${count} phần đã chọn` : "Chưa chọn món"}</small></span>${!locked && isCreator && session.members.length > 1 ? `<button class="remove-member" data-remove-member="${item.id}" title="Xóa ${escapeHtml(item.name)}">×</button>` : ""}</div>`;
  }).join("");
  dom.memberList.innerHTML = creatorRow + participantRows;

  const selectedMenuIds = new Set(member?.selections.filter((item) => !item.custom).map((item) => item.sourceMenuId));
  dom.foodOptions.innerHTML = session.menu.map((menuItem) => {
    const selection = member?.selections.find((item) => item.sourceMenuId === menuItem.id);
    return `<label class="food-option"><input type="checkbox" data-menu-checkbox="${menuItem.id}" ${selectedMenuIds.has(menuItem.id) ? "checked" : ""} ${canOrder ? "" : "disabled"}/><span class="food-option-copy"><strong>${escapeHtml(menuItem.name)}</strong><small>${escapeHtml(menuItem.note || "")} · ${money(menuItem.price)}</small></span><span class="food-qty"><button type="button" class="qty-button" data-qty-change="-1" data-menu-id="${menuItem.id}" ${canOrder ? "" : "disabled"}>−</button><input type="number" min="1" max="20" value="${selection?.quantity || 1}" data-qty-input="${menuItem.id}" ${canOrder ? "" : "disabled"}/><button type="button" class="qty-button" data-qty-change="1" data-menu-id="${menuItem.id}" ${canOrder ? "" : "disabled"}>+</button></span></label>`;
  }).join("");
  dom.customFoodForm.querySelectorAll("input, button").forEach((element) => { element.disabled = !canOrder; });
  dom.selectedFoods.innerHTML = member?.selections.length ? member.selections.map((item) => `<div class="selected-food-row"><span>${escapeHtml(item.name)} ${item.custom ? '<em class="custom-mark">MÓN KHÁC</em>' : ""} <small>× ${item.quantity}</small></span><b>${money(item.price * item.quantity)}</b>${canOrder ? `<button class="delete-food" data-remove-selection="${item.id}" title="Bỏ món">×</button>` : ""}</div>`).join("") : `<p class="hint-text">${member ? "Chưa chọn món nào." : "Nhập nickname rồi bấm “Tham gia” để chọn món."}</p>`;

  $$('input[name="splitMethod"]').forEach((input) => { input.checked = input.value === session.splitMethod; input.disabled = locked || !isCreator; });
  dom.equalFields.classList.toggle("visible", session.splitMethod === "equal");
  dom.itemFields.classList.toggle("visible", session.splitMethod === "item");
  dom.totalBillInput.value = session.equalTotal || "";
  dom.deliveryFeeInput.value = session.deliveryFee || "";
  dom.discountInput.value = session.discount || "";
  [dom.totalBillInput, dom.deliveryFeeInput, dom.discountInput].forEach((input) => { input.disabled = locked || !isCreator; });
  renderPricingList(session, locked || !isCreator);

  const amountDescription = session.splitMethod === "equal" ? `Mỗi người nhận ${money(payments[0]?.amount || 0)}` : `Tổng giá món ${money(session.members.reduce((total, item) => total + itemSubtotal(item), 0))}`;
  dom.billingTotal.innerHTML = `<span>${amountDescription}</span><b>${money(totalForSession(session))}</b>`;

  dom.bankNameInput.value = session.payment.bankName || "";
  dom.bankAccountInput.value = session.payment.accountNumber || "";
  dom.bankOwnerInput.value = session.payment.accountOwner || "";
  dom.transferNoteInput.value = session.payment.transferNote || "";
  [dom.bankNameInput, dom.bankAccountInput, dom.bankOwnerInput, dom.transferNoteInput, dom.qrFileInput].forEach((input) => { input.disabled = locked || !isCreator; });
  dom.qrPreview.hidden = !session.payment.qrImage;
  dom.qrPlaceholder.hidden = Boolean(session.payment.qrImage);
  if (session.payment.qrImage) dom.qrPreview.src = session.payment.qrImage;

  const paidPeople = payments.filter((person) => person.member.paid).length;
  dom.paidSummary.textContent = `${paidPeople}/${payments.length} đã chuyển`;
  dom.paymentMembers.innerHTML = payments.map(({ member: paymentMember, amount, foodSubtotal, adjustment }) => {
    const canTick = locked && paymentMember.id === member?.id && session.status !== "completed";
    const detail = session.splitMethod === "equal" ? "Chia đều hóa đơn" : `${money(foodSubtotal)} món${adjustment ? ` ${adjustment > 0 ? "+" : "−"} ${money(Math.abs(adjustment))}` : ""}`;
    return `<div class="payment-member"><div class="payment-person"><span class="avatar" style="background:${paymentMember.color}">${escapeHtml(initials(paymentMember.name))}</span><span><strong>${escapeHtml(paymentMember.name)} ${paymentMember.id === member?.id ? "(bạn)" : ""}</strong><small>${detail}</small></span></div><span class="payment-amount">${money(amount)}</span><label class="paid-control"><input type="checkbox" data-payment-member="${paymentMember.id}" ${paymentMember.paid ? "checked" : ""} ${canTick ? "" : "disabled"}/>${paymentMember.paid ? "Đã chuyển" : (locked ? "Chưa chuyển" : "Chờ chốt")}</label></div>`;
  }).join("");
}

function renderPricingList(session, locked) {
  const menuRows = session.menu.map((menuItem) => `<div class="pricing-row"><span title="${escapeHtml(menuItem.name)}">${escapeHtml(menuItem.name)}</span><div class="money-input"><input type="number" min="0" step="1000" data-menu-price="${menuItem.id}" value="${menuItem.price}" ${locked ? "disabled" : ""}/><span>đ</span></div></div>`);
  const customRows = session.members.flatMap((member) => member.selections.filter((selection) => selection.custom).map((selection) => `<div class="pricing-row"><span title="${escapeHtml(selection.name)}">${escapeHtml(selection.name)} · ${escapeHtml(member.name)}</span><div class="money-input"><input type="number" min="0" step="1000" data-selection-price="${selection.id}" value="${selection.price}" ${locked ? "disabled" : ""}/><span>đ</span></div></div>`));
  dom.pricingList.innerHTML = [...menuRows, ...customRows].join("") || `<p class="hint-text">Chưa có món để nhập giá.</p>`;
}

function isWithinFilter(dateValue, filter) {
  if (filter === "all") return true;
  const date = new Date(dateValue);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "day") return date >= startToday;
  if (filter === "week") {
    const weekday = (startToday.getDay() + 6) % 7;
    const startWeek = new Date(startToday);
    startWeek.setDate(startToday.getDate() - weekday);
    return date >= startWeek;
  }
  if (filter === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  return date.getFullYear() === now.getFullYear();
}

function renderHistory() {
  const filter = dom.historyFilter.value;
  const archiveOnly = filter === "archive";
  const sessions = [...appState.sessions]
    .filter((session) => archiveOnly ? session.archived : !session.archived && isWithinFilter(session.createdAt, filter))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const totalSpend = sessions.reduce((total, session) => total + totalForSession(session), 0);
  const totalPaid = sessions.reduce((total, session) => total + paidForSession(session), 0);
  const completed = sessions.filter((session) => session.status === "completed").length;
  dom.historyStats.innerHTML = [
    ["Tổng phiên", sessions.length],
    ["Tổng giá trị", money(totalSpend)],
    ["Đã được chuyển", money(totalPaid)],
    ["Đã hoàn tất", completed]
  ].map(([label, value]) => `<article class="history-stat"><p>${label}</p><strong>${value}</strong></article>`).join("");
  dom.historyTable.innerHTML = sessions.length ? `
    <div class="history-head"><span>PHIÊN ĐẶT ĐỒ</span><span>THỜI GIAN</span><span>THÀNH VIÊN</span><span>TRẠNG THÁI</span><span>TỔNG TIỀN</span><span>THAO TÁC</span></div>
    ${sessions.map((session) => `<div class="history-row"><span><strong>${escapeHtml(session.title)}</strong><small>${escapeHtml(session.restaurant)}</small></span><span>${shortDate(session.createdAt)}</span><span>${session.members.length} người</span><span><span class="status-chip ${session.status === "open" ? "" : session.status === "locked" ? "locked" : "done"}">${session.archived ? "Lưu trữ" : statusLabel(session.status)}</span></span><b>${money(totalForSession(session))}</b><span class="history-actions">${session.archived ? `<button class="history-action restore" data-restore-session="${session.id}">Khôi phục</button><button class="history-action delete" data-delete-session="${session.id}">Xóa</button>` : ""}</span></div>`).join("")}
  ` : `<div class="history-empty">${archiveOnly ? "Kho lưu trữ đang trống." : "Không có phiên nào trong khoảng thời gian này."}</div>`;
}

function addMenuSelection(menuId) {
  const session = activeSession();
  const member = selectedMember(session);
  if (!session || !member || isLocked(session)) return;
  const menuItem = session.menu.find((item) => item.id === menuId);
  if (!menuItem) return;
  member.selections.push({ id: id("pick"), sourceMenuId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1, custom: false });
  saveState(); renderAll();
}

function removeSelection(selectionId) {
  const session = activeSession();
  const member = selectedMember(session);
  if (!member || isLocked(session)) return;
  member.selections = member.selections.filter((selection) => selection.id !== selectionId);
  saveState(); renderAll();
}

function setMenuQuantity(menuId, value) {
  const session = activeSession();
  const member = selectedMember(session);
  const selection = member?.selections.find((item) => item.sourceMenuId === menuId);
  if (!selection || isLocked(session)) return;
  if (value < 1) return removeSelection(selection.id);
  selection.quantity = Math.max(1, Math.min(20, Number(value) || 1));
  saveState(); renderAll();
}

function updatePaymentInfo() {
  const session = activeSession();
  if (!session || isLocked(session) || !isSessionCreator(session)) return;
  session.payment.bankName = dom.bankNameInput.value.trim();
  session.payment.accountNumber = dom.bankAccountInput.value.trim();
  session.payment.accountOwner = dom.bankOwnerInput.value.trim();
  session.payment.transferNote = dom.transferNoteInput.value.trim();
  saveState();
}

async function uploadQrToSupabase(session, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const filePath = `${session.id}/${Date.now()}-${safeName}`;
  const { error } = await supabaseClient.storage.from("payment-qr").upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from("payment-qr").getPublicUrl(filePath);
  return data.publicUrl;
}

function createMenuRowMarkup(menuItem = {}) {
  return `<div class="create-menu-row"><input type="text" data-draft-menu-name placeholder="Tên món" maxlength="60" value="${escapeHtml(menuItem.name || "")}" /><input type="number" data-draft-menu-price min="0" step="1000" placeholder="Giá (đ)" value="${Number.isFinite(menuItem.price) ? menuItem.price : ""}" /><button class="remove-menu-row" type="button" data-remove-draft-menu title="Bỏ món">×</button></div>`;
}

function renderCreateMenuRows(menu = defaultMenu()) {
  dom.createMenuRows.innerHTML = menu.map(createMenuRowMarkup).join("");
}

function collectDraftMenu() {
  const rows = [...dom.createMenuRows.querySelectorAll(".create-menu-row")];
  const menu = [];
  const names = new Set();
  for (const row of rows) {
    const name = row.querySelector("[data-draft-menu-name]").value.trim();
    const priceText = row.querySelector("[data-draft-menu-price]").value;
    if (!name && !priceText) continue;
    const normalizedName = name.toLocaleLowerCase("vi-VN");
    const price = Number(priceText);
    if (!name || priceText === "" || !Number.isFinite(price) || price < 0) {
      return { error: "Mỗi món cần có đầy đủ tên và giá hợp lệ." };
    }
    if (names.has(normalizedName)) return { error: "Tên món không được trùng trong cùng một phiên." };
    names.add(normalizedName);
    menu.push({ id: id("menu"), name, price, note: "" });
  }
  if (!menu.length) return { error: "Hãy thêm ít nhất một món kèm giá trước khi tạo phiên." };
  return { menu };
}

function openNewSessionModal() {
  dom.sessionTitleInput.value = "";
  dom.restaurantInput.value = "";
  dom.initialMembersInput.value = "";
  dom.deadlineInput.value = localDateTimeValue(new Date(Date.now() + 1000 * 60 * 90));
  renderCreateMenuRows([{ name: "", price: undefined }]);
  dom.sessionModal.hidden = false;
  dom.sessionModal.setAttribute("aria-hidden", "false");
  setTimeout(() => dom.sessionTitleInput.focus(), 20);
}

function closeNewSessionModal() {
  dom.sessionModal.hidden = true;
  dom.sessionModal.setAttribute("aria-hidden", "true");
}

function createSession(event) {
  event.preventDefault();
  const nickname = dom.initialMembersInput.value.trim();
  if (!nickname) return showToast("Hãy đặt nickname cho phiên này.");
  const deadline = new Date(dom.deadlineInput.value);
  if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) return showToast("Hạn chốt món phải ở thời điểm sau hiện tại.");
  const draftMenu = collectDraftMenu();
  if (draftMenu.error) return showToast(draftMenu.error);
  const members = [makeMember(nickname, 0)];
  const session = {
    id: id("session"),
    title: dom.sessionTitleInput.value.trim(),
    restaurant: dom.restaurantInput.value.trim(),
    createdAt: new Date().toISOString(),
    deadline: deadline.toISOString(),
    status: "open",
    splitMethod: "item",
    equalTotal: 0,
    deliveryFee: 0,
    discount: 0,
    menu: draftMenu.menu,
    members,
    creatorMemberId: members[0].id,
    payment: { bankName: "", accountNumber: "", accountOwner: "", transferNote: "", qrImage: "" }
  };
  appState.sessions.unshift(session);
  appState.activeSessionId = session.id;
  appState.selectedMemberId = members[0].id;
  saveState();
  closeNewSessionModal();
  renderAll();
  setView("session");
  showToast("Đã tạo phiên mới. Mời mọi người chọn món!");
}

function joinWithNickname() {
  const session = activeSession();
  const nickname = dom.newMemberName.value.trim();
  if (!session) return;
  if (!nickname) return showToast("Nhập nickname trước nhé.");
  if (isLocked(session)) return showToast("Phiên đã chốt nên không thể tạo nickname mới.");
  if (session.members.some((member) => member.name.toLocaleLowerCase("vi-VN") === nickname.toLocaleLowerCase("vi-VN"))) return showToast("Nickname này đã có trong phiên. Hãy chọn tên khác.");
  const isCreatorJoining = nickname.toLocaleLowerCase("vi-VN") === session.creatorName.toLocaleLowerCase("vi-VN");
  const newMember = isCreatorJoining
    ? { id: session.creatorMemberId, name: session.creatorName, color: session.creatorColor, paid: false, paidAt: null, selections: [] }
    : makeMember(nickname, session.members.length + 1);
  session.members.push(newMember);
  appState.selectedMemberId = newMember.id;
  dom.newMemberName.value = "";
  saveState();
  renderAll();
  showToast(`Đã tham gia phiên với nickname ${nickname}.`);
}

function archiveActiveSession() {
  const session = activeSession();
  if (!session || !isSessionCreator(session)) return showToast("Chỉ người tạo phiên mới có thể lưu trữ.");
  if (!window.confirm(`Đưa “${session.title}” vào kho lưu trữ? Bạn có thể khôi phục lại sau.`)) return;
  session.archived = true;
  session.archivedAt = new Date().toISOString();
  appState.activeSessionId = null;
  saveState();
  renderAll();
  dom.historyFilter.value = "archive";
  setView("history");
  showToast("Đã đưa phiên vào kho lưu trữ.");
}

function deleteSession(sessionId) {
  const session = appState.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  if (!window.confirm(`Xóa hẳn “${session.title}”? Dữ liệu phiên này sẽ không thể khôi phục.`)) return;
  appState.sessions = appState.sessions.filter((item) => item.id !== sessionId);
  if (appState.activeSessionId === sessionId) appState.activeSessionId = null;
  saveState();
  renderAll();
  setView("dashboard");
  showToast("Đã xóa hẳn phiên đặt đồ.");
}

function restoreSession(sessionId) {
  const session = appState.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  session.archived = false;
  session.archivedAt = null;
  appState.activeSessionId = session.id;
  appState.selectedMemberId = session.members.some((member) => member.id === appState.selectedMemberId)
    ? appState.selectedMemberId
    : session.creatorMemberId;
  saveState();
  renderAll();
  setView("session");
  showToast("Đã khôi phục phiên đặt đồ.");
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-target]");
    if (viewButton) setView(viewButton.dataset.viewTarget);
    if (event.target.closest("[data-open-modal]")) openNewSessionModal();
  });
  $$("#newSessionBtn, #heroCreateBtn").forEach((button) => button.addEventListener("click", openNewSessionModal));
  $("#closeModalBtn").addEventListener("click", closeNewSessionModal);
  $("#cancelModalBtn").addEventListener("click", closeNewSessionModal);
  dom.sessionModal.addEventListener("click", (event) => { if (event.target === dom.sessionModal) closeNewSessionModal(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.sessionModal.hidden) closeNewSessionModal();
  });
  dom.newSessionForm.addEventListener("submit", createSession);
  dom.addCreateMenuBtn.addEventListener("click", () => {
    dom.createMenuRows.insertAdjacentHTML("beforeend", createMenuRowMarkup());
  });
  dom.createMenuRows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-draft-menu]");
    if (button) button.closest(".create-menu-row")?.remove();
  });
  $("#mobileMenuBtn").addEventListener("click", () => dom.sidebar.classList.toggle("mobile-open"));

  dom.sessionSwitcher.addEventListener("change", () => {
    appState.activeSessionId = dom.sessionSwitcher.value;
    appState.selectedMemberId = activeSession().creatorMemberId || null;
    saveState(); renderAll();
  });
  dom.memberPicker.addEventListener("change", () => { appState.selectedMemberId = dom.memberPicker.value; saveState(); renderAll(); });
  $("#addMemberBtn").addEventListener("click", joinWithNickname);
  dom.newMemberName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); joinWithNickname(); }
  });
  dom.memberList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-member]");
    if (!button) return;
    const session = activeSession();
    const memberId = button.dataset.removeMember;
    const member = session.members.find((item) => item.id === memberId);
    if (!member || isLocked(session) || !isSessionCreator(session)) return;
    if (!window.confirm(`Xóa ${member.name} khỏi phiên này?`)) return;
    session.members = session.members.filter((item) => item.id !== memberId);
    appState.selectedMemberId = session.members[0]?.id || null;
    saveState(); renderAll();
  });

  dom.foodOptions.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-menu-checkbox]");
    const quantityInput = event.target.closest("[data-qty-input]");
    if (checkbox) {
      const session = activeSession();
      const member = selectedMember(session);
      const selection = member.selections.find((item) => item.sourceMenuId === checkbox.dataset.menuCheckbox);
      if (checkbox.checked && !selection) addMenuSelection(checkbox.dataset.menuCheckbox);
      if (!checkbox.checked && selection) removeSelection(selection.id);
    }
    if (quantityInput) setMenuQuantity(quantityInput.dataset.qtyInput, Number(quantityInput.value));
  });
  dom.foodOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-qty-change]");
    if (!button) return;
    const member = selectedMember();
    const selection = member?.selections.find((item) => item.sourceMenuId === button.dataset.menuId);
    if (selection) setMenuQuantity(button.dataset.menuId, selection.quantity + Number(button.dataset.qtyChange));
  });
  dom.customFoodForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const session = activeSession();
    const member = selectedMember(session);
    if (!session || !member || isLocked(session)) return;
    const name = dom.customFoodName.value.trim();
    const price = Number(dom.customFoodPrice.value);
    const quantity = Number(dom.customFoodQty.value || 1);
    if (!name || price < 0) return showToast("Hãy nhập tên và giá món khác.");
    member.selections.push({ id: id("pick"), sourceMenuId: null, name, price, quantity, custom: true });
    dom.customFoodForm.reset(); dom.customFoodQty.value = 1;
    saveState(); renderAll(); showToast("Đã thêm món khác.");
  });
  dom.selectedFoods.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-selection]");
    if (button) removeSelection(button.dataset.removeSelection);
  });

  $$('input[name="splitMethod"]').forEach((radio) => radio.addEventListener("change", () => {
    const session = activeSession();
    if (isLocked(session) || !isSessionCreator(session)) return;
    session.splitMethod = radio.value;
    saveState(); renderAll();
  }));
  dom.totalBillInput.addEventListener("change", () => { const session = activeSession(); if (!isLocked(session) && isSessionCreator(session)) { session.equalTotal = Number(dom.totalBillInput.value || 0); saveState(); renderAll(); } });
  dom.deliveryFeeInput.addEventListener("change", () => { const session = activeSession(); if (!isLocked(session) && isSessionCreator(session)) { session.deliveryFee = Number(dom.deliveryFeeInput.value || 0); saveState(); renderAll(); } });
  dom.discountInput.addEventListener("change", () => { const session = activeSession(); if (!isLocked(session) && isSessionCreator(session)) { session.discount = Number(dom.discountInput.value || 0); saveState(); renderAll(); } });
  dom.pricingList.addEventListener("change", (event) => {
    const session = activeSession();
    if (isLocked(session) || !isSessionCreator(session)) return;
    const input = event.target;
    const price = Math.max(0, Number(input.value || 0));
    if (input.dataset.menuPrice) {
      const menuItem = session.menu.find((item) => item.id === input.dataset.menuPrice);
      if (menuItem) {
        menuItem.price = price;
        session.members.forEach((member) => member.selections.filter((selection) => selection.sourceMenuId === menuItem.id).forEach((selection) => { selection.price = price; }));
      }
    }
    if (input.dataset.selectionPrice) {
      session.members.forEach((member) => member.selections.filter((selection) => selection.id === input.dataset.selectionPrice).forEach((selection) => { selection.price = price; }));
    }
    saveState(); renderAll();
  });

  [dom.bankNameInput, dom.bankAccountInput, dom.bankOwnerInput, dom.transferNoteInput].forEach((input) => input.addEventListener("input", updatePaymentInfo));
  dom.qrFileInput.addEventListener("change", () => {
    const session = activeSession();
    const file = dom.qrFileInput.files?.[0];
    if (!file || isLocked(session) || !isSessionCreator(session)) return;
    if (!file.type.startsWith("image/")) { dom.qrFileInput.value = ""; return showToast("Chỉ có thể dùng ảnh PNG, JPG hoặc WEBP làm mã QR."); }
    if (file.size > 1_000_000) { dom.qrFileInput.value = ""; return showToast("Ảnh QR nên nhỏ hơn 1 MB để dễ lưu trên trình duyệt."); }
    if (supabaseClient) {
      showToast("Đang tải ảnh QR lên Supabase...");
      uploadQrToSupabase(session, file)
        .then((url) => {
          session.payment.qrImage = url;
          saveState();
          renderAll();
          showToast("Đã tải ảnh QR và đồng bộ cho cả nhóm.");
        })
        .catch((error) => {
          console.error("Không thể tải QR lên Supabase", error);
          showToast("Không thể tải QR. Hãy kiểm tra bucket payment-qr và quyền Storage.");
        });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { session.payment.qrImage = reader.result; saveState(); renderAll(); showToast("Đã lưu ảnh QR."); };
    reader.onerror = () => showToast("Không thể đọc ảnh QR. Hãy thử một ảnh khác.");
    reader.readAsDataURL(file);
  });

  dom.paymentMembers.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-payment-member]");
    if (!checkbox) return;
    const session = activeSession();
    const member = session.members.find((item) => item.id === checkbox.dataset.paymentMember);
    if (!member || !isLocked(session) || member.id !== selectedMember(session).id) return;
    member.paid = checkbox.checked;
    member.paidAt = checkbox.checked ? new Date().toISOString() : null;
    saveState(); renderAll();
    showToast(checkbox.checked ? "Đã ghi nhận chuyển khoản." : "Đã bỏ trạng thái chuyển khoản.");
  });

  dom.saveSessionBtn.addEventListener("click", () => { const session = activeSession(); if (!isSessionCreator(session)) return showToast("Chỉ người tạo phiên mới có thể cập nhật thông tin chung."); saveState(); showToast("Đã lưu thay đổi trên trình duyệt này."); });
  dom.lockSessionBtn.addEventListener("click", () => {
    const session = activeSession();
    if (!session) return showToast("Hãy tạo phiên đặt đồ trước.");
    if (!isSessionCreator(session)) return showToast("Chỉ người tạo phiên mới có thể chốt tổng tiền.");
    if (session.status !== "open") return showToast("Số tiền của phiên này đã được chốt.");
    if (!session.members.length) return showToast("Cần ít nhất một thành viên.");
    const payments = calculatePayments(session);
    if (totalForSession(session) <= 0) return showToast(session.splitMethod === "equal" ? "Hãy nhập tổng hóa đơn trước khi chốt." : "Hãy thêm món hoặc nhập phí phát sinh trước khi chốt.");
    if (payments.some((payment) => payment.amount < 0)) return showToast("Giảm giá đang lớn hơn tiền món của một thành viên. Hãy kiểm tra lại trước khi chốt.");
    if (!window.confirm(`Chốt tổng ${money(totalForSession(session))}? Sau khi chốt, danh sách món và giá sẽ được khóa.`)) return;
    session.status = "locked";
    session.lockedAt = new Date().toISOString();
    saveState(); renderAll(); showToast("Đã chốt tổng tiền và mở ô “Đã chuyển”.");
  });
  dom.closeSessionBtn.addEventListener("click", () => {
    const session = activeSession();
    if (!session) return showToast("Hãy tạo phiên đặt đồ trước.");
    if (!isSessionCreator(session)) return showToast("Chỉ người tạo phiên mới có thể hoàn tất phiên.");
    if (session.status === "open") return showToast("Hãy chốt tổng tiền trước khi hoàn tất phiên.");
    if (session.status === "completed") return;
    const unpaid = session.members.filter((member) => !member.paid).length;
    if (!window.confirm(unpaid ? `Còn ${unpaid} người chưa tick đã chuyển. Vẫn hoàn tất phiên?` : "Hoàn tất phiên và đưa vào lịch sử?")) return;
    session.status = "completed";
    session.completedAt = new Date().toISOString();
    saveState(); renderAll(); showToast("Phiên đã hoàn tất và lưu vào lịch sử.");
  });
  dom.archiveSessionBtn.addEventListener("click", archiveActiveSession);
  dom.deleteSessionBtn.addEventListener("click", () => {
    const session = activeSession();
    if (!session || !isSessionCreator(session)) return showToast("Chỉ người tạo phiên mới có thể xóa phiên.");
    deleteSession(session.id);
  });
  dom.historyFilter.addEventListener("change", renderHistory);
  dom.historyTable.addEventListener("click", (event) => {
    const restoreButton = event.target.closest("[data-restore-session]");
    const deleteButton = event.target.closest("[data-delete-session]");
    if (restoreButton) restoreSession(restoreButton.dataset.restoreSession);
    if (deleteButton) deleteSession(deleteButton.dataset.deleteSession);
  });
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(appState.sessions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `an-chung-${localDateTimeValue(new Date()).slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(url);
    showToast("Đã xuất dữ liệu JSON.");
  });
}

bindEvents();
renderAll();
initializeSupabase();
