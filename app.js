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
  changeNicknameBtn: $("#changeNicknameBtn"),
  memberList: $("#memberList"),
  memberCountBadge: $("#memberCountBadge"),
  currentOrderCount: $("#currentOrderCount"),
  foodOptions: $("#foodOptions"),
  customFoodForm: $("#customFoodForm"),
  customFoodName: $("#customFoodName"),
  customFoodPrice: $("#customFoodPrice"),
  customFoodQty: $("#customFoodQty"),
  selectedFoods: $("#selectedFoods"),
  joinOrderBtn: $("#joinOrderBtn"),
  orderConfirmHint: $("#orderConfirmHint"),
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
  qrDropzone: $("#qrDropzone"),
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
  profileButton: $("#profileButton"),
  profileAvatar: $("#profileAvatar"),
  profileName: $("#profileName"),
  profileStatus: $("#profileStatus"),
  profileModal: $("#profileModal"),
  profileForm: $("#profileForm"),
  profileNicknameInput: $("#profileNicknameInput"),
  profileAuthHint: $("#profileAuthHint"),
  profileCancelBtn: $("#profileCancelBtn"),
  toast: $("#toast")
};

let supabaseClient = null;
let profileModalRequired = false;
let remoteSessionIds = new Set();
let remoteSyncTimer = null;
let appState = loadState();
let currentView = "dashboard";
let toastTimer;

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function colorForIdentity(identity = "") {
  const hash = [...String(identity)].reduce((value, character) => ((value << 5) - value) + character.charCodeAt(0), 0);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function normalizeProfile(profile) {
  if (!profile?.id || !profile?.nickname?.trim()) return null;
  return {
    id: String(profile.id),
    nickname: profile.nickname.trim().slice(0, 30),
    color: profile.color || colorForIdentity(profile.id),
    provider: profile.provider || "nickname",
    avatarUrl: profile.avatarUrl || "",
    updatedAt: profile.updatedAt || new Date().toISOString()
  };
}

function currentProfile() {
  return normalizeProfile(appState.profile);
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

function makeMember(profile, index) {
  const memberProfile = typeof profile === "string"
    ? { id: id("member"), nickname: profile, color: AVATAR_COLORS[index % AVATAR_COLORS.length] }
    : profile;
  return {
    id: memberProfile.id,
    profileId: memberProfile.id?.startsWith("profile_") || /^[0-9a-f-]{36}$/i.test(memberProfile.id) ? memberProfile.id : null,
    name: memberProfile.nickname.trim(),
    color: memberProfile.color || AVATAR_COLORS[index % AVATAR_COLORS.length],
    paid: false,
    paidAt: null,
    orderConfirmedAt: null,
    selections: []
  };
}

function normalizeSession(session) {
  session.archived = Boolean(session.archived);
  session.menu = Array.isArray(session.menu) ? session.menu : defaultMenu();
  session.members = Array.isArray(session.members) ? session.members : [];
  session.members.forEach((member, index) => {
    member.color ||= AVATAR_COLORS[index % AVATAR_COLORS.length];
    member.profileId ||= null;
    member.selections = Array.isArray(member.selections) ? member.selections : [];
    member.paid = Boolean(member.paid);
    member.orderConfirmedAt ||= null;
  });
  session.creatorMemberId ||= session.members[0]?.id || null;
  const legacyCreator = session.members.find((member) => member.id === session.creatorMemberId);
  session.creatorProfileId ||= legacyCreator?.profileId || null;
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
        activeSessionId: sessions.find((session) => !session.archived && session.status === "open")?.id || saved.activeSessionId || sessions.find((session) => !session.archived)?.id || null,
        selectedMemberId: saved.selectedMemberId || null,
        profile: normalizeProfile(saved.profile)
      };
    }
  } catch (error) {
    console.warn("Không thể đọc dữ liệu cũ", error);
  }

  return { sessions: [], activeSessionId: null, selectedMemberId: null, profile: null };
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

function renderProfileControl() {
  const profile = currentProfile();
  dom.profileAvatar.textContent = profile ? initials(profile.nickname) : "?";
  dom.profileAvatar.style.background = profile?.color || "#a9b3ac";
  dom.profileName.textContent = profile?.nickname || "Chọn nickname";
  dom.profileStatus.textContent = profile ? "Nickname đã lưu" : "Chưa thiết lập";
}

function openProfileModal(required = !currentProfile()) {
  profileModalRequired = required;
  const profile = currentProfile();
  dom.profileNicknameInput.value = profile?.nickname || "";
  dom.profileAuthHint.textContent = "Nickname được lưu trên trình duyệt này và tự dùng lại khi bạn quay lại website.";
  dom.profileCancelBtn.hidden = !profile || required;
  dom.profileModal.hidden = false;
  dom.profileModal.setAttribute("aria-hidden", "false");
  setTimeout(() => dom.profileNicknameInput.focus(), 20);
}

function closeProfileModal() {
  if (profileModalRequired && !currentProfile()) return;
  dom.profileModal.hidden = true;
  dom.profileModal.setAttribute("aria-hidden", "true");
  profileModalRequired = false;
}

function saveProfile(event) {
  event.preventDefault();
  const nickname = dom.profileNicknameInput.value.trim();
  if (!nickname) return showToast("Hãy nhập nickname để tiếp tục.");
  const previous = currentProfile();
  const profile = normalizeProfile({
    id: previous?.id || id("profile"),
    nickname,
    color: previous?.color || colorForIdentity(nickname),
    provider: "nickname"
  });

  appState.profile = profile;
  appState.selectedMemberId = profile.id;
  appState.sessions.forEach((session) => {
    if (session.creatorProfileId === profile.id || session.creatorMemberId === profile.id) {
      session.creatorName = profile.nickname;
      session.creatorColor = profile.color;
    }
    session.members.forEach((member) => {
      if (member.profileId === profile.id || member.id === profile.id) {
        member.name = profile.nickname;
        member.color = profile.color;
      }
    });
  });
  saveState();
  renderAll();
  closeProfileModal();
  showToast("Đã lưu nickname trên thiết bị này.");
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
    const prioritizedSessions = sortSessionsByPriority(appState.sessions.filter((session) => !session.archived));
    const currentSession = appState.sessions.find((session) => session.id === appState.activeSessionId);
    if (!activeExists || (prioritizedSessions[0] && sessionPriority(currentSession) > sessionPriority(prioritizedSessions[0]))) {
      appState.activeSessionId = prioritizedSessions[0]?.id || null;
    }
    appState.selectedMemberId = currentProfile()?.id || null;
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
    if (!currentProfile()) openProfileModal(true);
    return;
  }
  try {
    setConnectionNote("Đang kết nối Supabase...");
    supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
    await loadRemoteSessions();
    subscribeToRemoteSessions();
    renderAll();
    setConnectionNote("Supabase · đang đồng bộ", true);
    if (!currentProfile()) openProfileModal(true);
  } catch (error) {
    console.error("Không thể khởi tạo Supabase", error);
    supabaseClient = null;
    setConnectionNote("Không kết nối được Supabase");
    showToast("Supabase chưa sẵn sàng. Hãy chạy schema SQL và kiểm tra lại cấu hình.");
    if (!currentProfile()) openProfileModal(true);
  }
}

function activeSession() {
  const availableSessions = appState.sessions.filter((item) => !item.archived);
  let session = availableSessions.find((item) => item.id === appState.activeSessionId);
  if (!session) {
    session = sortSessionsByPriority(availableSessions)[0];
    appState.activeSessionId = session?.id || null;
  }
  return session;
}

function selectedMember(session = activeSession()) {
  const profile = currentProfile();
  if (!session || !profile) return null;
  let member = session.members.find((item) => item.profileId === profile.id || item.id === profile.id);
  if (!member) {
    const matchingLegacyMember = session.members.find((item) => item.name.toLocaleLowerCase("vi-VN") === profile.nickname.toLocaleLowerCase("vi-VN"));
    if (matchingLegacyMember) {
      matchingLegacyMember.profileId = profile.id;
      member = matchingLegacyMember;
    }
  }
  return member || null;
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

function sessionTone(session) {
  if (session.archived) return "archived";
  return session.status === "locked" ? "locked" : session.status === "completed" ? "completed" : "open";
}

function sessionPriority(session) {
  return ({ open: 0, locked: 1, completed: 2, archived: 3 })[sessionTone(session)] ?? 4;
}

function sortSessionsByPriority(sessions) {
  return [...sessions].sort((left, right) => {
    const priorityDifference = sessionPriority(left) - sessionPriority(right);
    if (priorityDifference) return priorityDifference;
    return new Date(right.createdAt) - new Date(left.createdAt);
  });
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
  const profile = currentProfile();
  if (!session || !profile) return false;
  const sameCreatorNickname = session.creatorName?.toLocaleLowerCase("vi-VN") === profile.nickname.toLocaleLowerCase("vi-VN");
  if (sameCreatorNickname && session.creatorProfileId !== profile.id) session.creatorProfileId = profile.id;
  return session.creatorProfileId === profile.id || session.creatorMemberId === profile.id || sameCreatorNickname;
}

function canManageSettlement(session) {
  return Boolean(isSessionCreator(session) || selectedMember(session));
}

function showNoPermission() {
  showToast("Bạn không có quyền sửa.");
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
  renderProfileControl();
  renderDashboard();
  renderSession();
  renderHistory();
}

function renderDashboard() {
  const session = activeSession();
  const today = new Date();
  dom.todayLabel.textContent = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "long" }).format(today);

  const visibleSessions = appState.sessions.filter((item) => !item.archived);
  const openSessions = visibleSessions.filter((item) => item.status === "open");
  const lockedSessions = visibleSessions.filter((item) => item.status === "locked");
  const totalOwed = lockedSessions.reduce((total, item) => total + (totalForSession(item) - paidForSession(item)), 0);
  const paidCount = session ? session.members.filter((member) => member.paid).length : 0;
  const peopleCount = session?.members.length || 0;
  const statCards = [
    ["Phiên đang mở", openSessions.length, openSessions.length ? "Ưu tiên hiển thị đầu tiên" : "Chưa có phiên cần chọn món"],
    ["Cần chuyển lại", money(totalOwed), totalOwed ? "Tổng tiền nhóm chưa thanh toán" : "Mọi khoản đã đủ"],
    ["Đã chuyển trong phiên", `${paidCount}/${peopleCount}`, peopleCount ? "Cập nhật theo thời gian thực" : "Chưa có thành viên"],
    ["Phiên đã chốt", lockedSessions.length, "Tính từ lịch sử đã lưu"]
  ];
  dom.statsGrid.innerHTML = statCards.map(([label, value, note]) => `
    <article class="stat-card"><p>${label}</p><strong>${value}</strong><div class="stat-note">${note}</div></article>
  `).join("");

  if (!session) {
    dom.activeSessionSummary.className = "card active-session-summary";
    dom.activeSessionSummary.innerHTML = `<div class="active-summary-top"><div><p class="eyebrow">PHIÊN ĐANG MỞ</p><h3 class="active-summary-name">Chưa có phiên đặt đồ</h3><p class="active-summary-restaurant">Bắt đầu một phiên mới cho cả nhóm.</p></div></div><div class="summary-footer"><span></span><button class="text-button" data-open-modal="true">Tạo phiên →</button></div>`;
  } else {
    const payments = calculatePayments(session);
    const tone = sessionTone(session);
    dom.activeSessionSummary.className = `card active-session-summary session-surface tone-${tone}`;
    dom.activeSessionSummary.innerHTML = `
      <div class="active-summary-top">
        <div><p class="eyebrow">${tone === "open" ? "ƯU TIÊN XỬ LÝ" : "PHIÊN ĐANG XEM"}</p><h3 class="active-summary-name">${escapeHtml(session.title)}</h3><p class="active-summary-restaurant">${escapeHtml(session.restaurant)} · Chốt lúc ${formatDeadline(session.deadline)}</p></div>
        <span class="status-chip tone-${tone}">${tone === "archived" ? "Lưu trữ" : statusLabel(session.status)}</span>
      </div>
      <div class="summary-amounts"><div><span>Tổng cần thanh toán</span><strong>${money(totalForSession(session))}</strong></div><div><span>Còn chờ</span><strong>${money(totalForSession(session) - paidForSession(session))}</strong></div></div>
      <div class="summary-footer"><div class="avatar-stack">${session.members.slice(0, 5).map((member) => `<span class="avatar" style="background:${member.color}">${escapeHtml(initials(member.name))}</span>`).join("")}</div><button class="text-button" data-view-target="session">Mở phiên →</button></div>`;
  }

  const latest = sortSessionsByPriority(appState.sessions).slice(0, 6);
  dom.miniHistory.innerHTML = latest.length ? latest.map((item) => `
    <div class="mini-history-row session-row tone-${sessionTone(item)}"><span class="history-icon">${item.status === "completed" ? "✓" : sessionTone(item) === "archived" ? "⌑" : "⌁"}</span><div><strong>${escapeHtml(item.title)}</strong><small>${sessionTone(item) === "archived" ? "Đã lưu trữ" : statusLabel(item.status)} · ${item.members.length} người</small></div><b>${money(totalForSession(item))}</b></div>
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
    dom.joinOrderBtn.disabled = true;
    dom.joinOrderBtn.textContent = "✓ Tham gia để đặt món";
    dom.orderConfirmHint.textContent = "Tạo phiên mới để bắt đầu.";
    [dom.memberPicker, dom.totalBillInput, dom.deliveryFeeInput, dom.discountInput, dom.bankNameInput, dom.bankAccountInput, dom.bankOwnerInput, dom.transferNoteInput, dom.qrFileInput].forEach((input) => { input.disabled = true; });
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
  dom.sessionSwitcher.innerHTML = sortSessionsByPriority(appState.sessions.filter((item) => !item.archived)).map((item) => `<option value="${item.id}" ${item.id === session.id ? "selected" : ""}>${item.status === "open" ? "●" : item.status === "locked" ? "◆" : "■"} ${escapeHtml(item.title)} · ${statusLabel(item.status)}</option>`).join("");
  dom.sessionMeta.textContent = `${session.restaurant} · Tạo ngày ${shortDate(session.createdAt)} · Hạn chốt ${formatDeadline(session.deadline)}`;
  dom.memberCountBadge.textContent = `${session.members.length} người`;
  dom.currentOrderCount.textContent = `${selectedCount} phần`;
  dom.billingModeBadge.textContent = session.splitMethod === "equal" ? "Chia đều" : "Theo món";
  dom.paymentLockLabel.textContent = session.status === "open" ? "Đang mở" : session.status === "locked" ? "Đã chốt" : "Hoàn tất";
  dom.paymentLockLabel.style.color = session.status === "open" ? "#16834f" : session.status === "locked" ? "#2563b8" : "#7a1f40";
  dom.paymentLockLabel.style.borderColor = session.status === "open" ? "#a9ddbb" : session.status === "locked" ? "#b7d3f4" : "#e4b7c6";

  dom.statusNotice.className = `notice-strip show tone-${sessionTone(session)}`;
  if (session.status === "open") {
    dom.statusNotice.innerHTML = member
      ? `Bạn đang tham gia bằng <strong>${escapeHtml(currentProfile()?.nickname || "nickname")}</strong>. Tổng tiền tự cập nhật theo số người đã tham gia.`
      : `Phiên đang mở — bấm <strong>“Tham gia”</strong> để cùng chọn món bằng nickname đã lưu. Tổng tiền tự cập nhật theo số người tham gia.`;
  } else if (session.status === "locked") {
    dom.statusNotice.innerHTML = `<strong>Đã chốt số tiền.</strong> Chuyển khoản xong, chính bạn có thể tick “Đã chuyển”.`;
  } else {
    dom.statusNotice.innerHTML = `<strong>Phiên đã hoàn tất.</strong> Dữ liệu vẫn được lưu trong lịch sử để tra cứu theo thời gian.`;
  }

  dom.saveSessionBtn.disabled = session.status === "completed";
  dom.lockSessionBtn.disabled = session.status === "completed";
  dom.closeSessionBtn.disabled = session.status === "completed";
  dom.archiveSessionBtn.disabled = false;
  dom.deleteSessionBtn.disabled = false;
  dom.lockSessionBtn.textContent = session.status === "open" ? "Chốt & gửi tổng tiền" : session.status === "locked" ? "Đã chốt tổng tiền" : "Đã hoàn tất";

  const profile = currentProfile();
  dom.memberPicker.disabled = true;
  dom.memberPicker.innerHTML = `<option>${escapeHtml(profile?.nickname || "Chưa có nickname")}${member ? " · đã tham gia phiên" : " · chưa tham gia"}</option>`;
  const isOrderConfirmed = Boolean(member?.orderConfirmedAt);
  dom.joinOrderBtn.disabled = !profile || locked || (Boolean(member) && (!selectedCount || isOrderConfirmed));
  dom.joinOrderBtn.textContent = !profile ? "Tạo nickname để đặt món" : !member ? "✓ Tham gia để đặt món" : isOrderConfirmed ? "✓ Đã xác nhận món" : selectedCount ? `✓ Xác nhận ${selectedCount} phần đã chọn` : "Chọn món để xác nhận";
  dom.orderConfirmHint.textContent = !profile ? "Hãy tạo nickname trước." : !member ? "Bấm một lần để tham gia phiên bằng nickname đã lưu." : isOrderConfirmed ? "Món của bạn đã được ghi nhận. Nếu chỉnh món, hãy xác nhận lại." : selectedCount ? "Kiểm tra món rồi bấm xác nhận để người tạo dễ chốt đơn." : "Hãy tick ít nhất một món trước khi xác nhận.";
  const creatorIsParticipant = session.members.some((item) => item.profileId === session.creatorProfileId || item.id === session.creatorMemberId);
  const creatorRow = creatorIsParticipant ? "" : `<div class="member-row ${isCreator ? "current" : ""}"><span class="avatar" style="background:${session.creatorColor}">${escapeHtml(initials(session.creatorName))}</span><span><span class="member-name">${escapeHtml(session.creatorName)} <small>(người tạo)</small></span><small>Quản lý món, giá và thanh toán</small></span></div>`;
  const participantRows = session.members.map((item) => {
    const count = item.selections.reduce((total, selection) => total + selection.quantity, 0);
    return `<div class="member-row ${item.id === member?.id ? "current" : ""}"><span class="avatar" style="background:${item.color}">${escapeHtml(initials(item.name))}</span><span><span class="member-name">${escapeHtml(item.name)} ${item.id === session.creatorMemberId ? '<small>(người tạo)</small>' : ""}</span><small>${item.orderConfirmedAt ? `✓ Đã xác nhận ${count} phần` : count ? `${count} phần chờ xác nhận` : "Chưa chọn món"}</small></span>${!locked && isCreator && session.members.length > 1 && item.id !== member?.id ? `<button class="remove-member" data-remove-member="${item.id}" title="Xóa ${escapeHtml(item.name)}">×</button>` : ""}</div>`;
  }).join("");
  dom.memberList.innerHTML = creatorRow + participantRows;

  const selectedMenuIds = new Set(member?.selections.filter((item) => !item.custom).map((item) => item.sourceMenuId));
  dom.foodOptions.innerHTML = session.menu.map((menuItem) => {
    const selection = member?.selections.find((item) => item.sourceMenuId === menuItem.id);
    return `<label class="food-option"><input type="checkbox" data-menu-checkbox="${menuItem.id}" ${selectedMenuIds.has(menuItem.id) ? "checked" : ""} ${canOrder ? "" : "disabled"}/><span class="food-option-copy"><strong>${escapeHtml(menuItem.name)}</strong><small>${escapeHtml(menuItem.note || "")} · ${money(menuItem.price)}</small></span><span class="food-qty"><button type="button" class="qty-button" data-qty-change="-1" data-menu-id="${menuItem.id}" ${canOrder ? "" : "disabled"}>−</button><input type="number" min="1" max="20" value="${selection?.quantity || 1}" data-qty-input="${menuItem.id}" ${canOrder ? "" : "disabled"}/><button type="button" class="qty-button" data-qty-change="1" data-menu-id="${menuItem.id}" ${canOrder ? "" : "disabled"}>+</button></span></label>`;
  }).join("");
  dom.customFoodForm.querySelectorAll("input, button").forEach((element) => { element.disabled = !canOrder; });
  dom.selectedFoods.innerHTML = member?.selections.length ? member.selections.map((item) => `<div class="selected-food-row"><span>${escapeHtml(item.name)} ${item.custom ? '<em class="custom-mark">MÓN KHÁC</em>' : ""} <small>× ${item.quantity}</small></span><b>${money(item.price * item.quantity)}</b>${canOrder ? `<button class="delete-food" data-remove-selection="${item.id}" title="Bỏ món">×</button>` : ""}</div>`).join("") : `<p class="hint-text">${member ? "Chưa chọn món nào." : "Bấm nút “Tham gia để đặt món” ngay phía trên để bắt đầu."}</p>`;

  $$("#equalSplitOption, #itemSplitOption").forEach((option) => { option.dataset.noEdit = String(!isCreator && !locked); });
  $$("input[name=\"splitMethod\"]").forEach((input) => { input.checked = input.value === session.splitMethod; input.disabled = locked; });
  dom.equalFields.classList.toggle("visible", session.splitMethod === "equal");
  dom.itemFields.classList.toggle("visible", session.splitMethod === "item");
  dom.totalBillInput.value = session.equalTotal || "";
  dom.deliveryFeeInput.value = session.deliveryFee || "";
  dom.discountInput.value = session.discount || "";
  [dom.totalBillInput, dom.deliveryFeeInput, dom.discountInput].forEach((input) => {
    input.disabled = locked;
    input.readOnly = !isCreator;
    input.dataset.noEdit = String(!isCreator && !locked);
  });
  renderPricingList(session, locked, !isCreator);

  const amountDescription = session.splitMethod === "equal" ? `Mỗi người nhận ${money(payments[0]?.amount || 0)}` : `Tổng giá món ${money(session.members.reduce((total, item) => total + itemSubtotal(item), 0))}`;
  dom.billingTotal.innerHTML = `<span>${amountDescription}</span><b>${money(totalForSession(session))}</b>`;

  dom.bankNameInput.value = session.payment.bankName || "";
  dom.bankAccountInput.value = session.payment.accountNumber || "";
  dom.bankOwnerInput.value = session.payment.accountOwner || "";
  dom.transferNoteInput.value = session.payment.transferNote || "";
  [dom.bankNameInput, dom.bankAccountInput, dom.bankOwnerInput, dom.transferNoteInput].forEach((input) => {
    input.disabled = locked;
    input.readOnly = !isCreator;
    input.dataset.noEdit = String(!isCreator && !locked);
  });
  dom.qrFileInput.disabled = locked || !isCreator;
  dom.qrDropzone.dataset.noEdit = String(!isCreator && !locked);
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

function renderPricingList(session, locked, readOnly = false) {
  const menuRows = session.menu.map((menuItem) => `<div class="pricing-row"><span title="${escapeHtml(menuItem.name)}">${escapeHtml(menuItem.name)}</span><div class="money-input"><input type="number" min="0" step="1000" data-menu-price="${menuItem.id}" value="${menuItem.price}" ${locked ? "disabled" : ""} ${readOnly ? "readonly" : ""} data-no-edit="${String(readOnly && !locked)}"/><span>đ</span></div></div>`);
  const customRows = session.members.flatMap((member) => member.selections.filter((selection) => selection.custom).map((selection) => `<div class="pricing-row"><span title="${escapeHtml(selection.name)}">${escapeHtml(selection.name)} · ${escapeHtml(member.name)}</span><div class="money-input"><input type="number" min="0" step="1000" data-selection-price="${selection.id}" value="${selection.price}" ${locked ? "disabled" : ""} ${readOnly ? "readonly" : ""} data-no-edit="${String(readOnly && !locked)}"/><span>đ</span></div></div>`));
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
  const allSessions = appState.sessions.filter((session) => !session.archived);
  dom.historyStats.innerHTML = [
    ["Hôm nay", "day"],
    ["Tuần này", "week"],
    ["Tháng này", "month"],
    ["Năm nay", "year"]
  ].map(([label, period]) => {
    const periodSessions = allSessions.filter((session) => isWithinFilter(session.createdAt, period));
    return `<article class="history-stat"><p>${label}</p><strong>${periodSessions.length} phiên</strong><small>${money(periodSessions.reduce((total, session) => total + totalForSession(session), 0))}</small></article>`;
  }).join("");
  dom.historyTable.innerHTML = sessions.length ? `
    <div class="history-head"><span>PHIÊN ĐẶT ĐỒ</span><span>THỜI GIAN</span><span>THÀNH VIÊN</span><span>TRẠNG THÁI</span><span>TỔNG TIỀN</span><span>THAO TÁC</span></div>
    ${sessions.map((session) => `<div class="history-row tone-${sessionTone(session)} ${session.archived ? "" : "is-clickable"}" ${session.archived ? "" : `data-open-session="${session.id}"`}><span><strong>${escapeHtml(session.title)}</strong><small>${escapeHtml(session.restaurant)}${session.archived ? "" : " · Bấm để xem chi tiết"}</small></span><span>${shortDate(session.createdAt)}</span><span>${session.members.length} người</span><span><span class="status-chip tone-${sessionTone(session)}">${session.archived ? "Lưu trữ" : statusLabel(session.status)}</span></span><b>${money(totalForSession(session))}</b><span class="history-actions">${session.archived ? `<button class="history-action restore" data-restore-session="${session.id}">Khôi phục</button><button class="history-action delete" data-delete-session="${session.id}">Xóa</button>` : ""}</span></div>`).join("")}
  ` : `<div class="history-empty">${archiveOnly ? "Kho lưu trữ đang trống." : "Không có phiên nào trong khoảng thời gian này."}</div>`;
}

function markOrderAsChanged(member) {
  if (member) member.orderConfirmedAt = null;
}

function confirmCurrentOrder() {
  const session = activeSession();
  const member = selectedMember(session);
  if (!session || !member || isLocked(session)) return;
  const quantity = member.selections.reduce((total, item) => total + Number(item.quantity || 0), 0);
  if (!quantity) return showToast("Hãy chọn ít nhất một món trước khi xác nhận.");
  member.orderConfirmedAt = new Date().toISOString();
  saveState();
  renderAll();
  showToast(`Đã xác nhận ${quantity} phần của bạn.`);
}

function addMenuSelection(menuId) {
  const session = activeSession();
  const member = selectedMember(session);
  if (!session || !member || isLocked(session)) return;
  const menuItem = session.menu.find((item) => item.id === menuId);
  if (!menuItem) return;
  member.selections.push({ id: id("pick"), sourceMenuId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1, custom: false });
  markOrderAsChanged(member);
  saveState(); renderAll();
}

function removeSelection(selectionId) {
  const session = activeSession();
  const member = selectedMember(session);
  if (!member || isLocked(session)) return;
  member.selections = member.selections.filter((selection) => selection.id !== selectionId);
  markOrderAsChanged(member);
  saveState(); renderAll();
}

function setMenuQuantity(menuId, value) {
  const session = activeSession();
  const member = selectedMember(session);
  const selection = member?.selections.find((item) => item.sourceMenuId === menuId);
  if (!selection || isLocked(session)) return;
  if (value < 1) return removeSelection(selection.id);
  selection.quantity = Math.max(1, Math.min(20, Number(value) || 1));
  markOrderAsChanged(member);
  saveState(); renderAll();
}

function updatePaymentInfo() {
  const session = activeSession();
  if (!session || isLocked(session)) return;
  if (!isSessionCreator(session)) {
    showNoPermission();
    renderAll();
    return;
  }
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
  const profile = currentProfile();
  if (!profile) {
    openProfileModal(true);
    return;
  }
  dom.sessionTitleInput.value = "";
  dom.restaurantInput.value = "";
  dom.initialMembersInput.value = profile.nickname;
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
  const profile = currentProfile();
  if (!profile) return openProfileModal(true);
  const deadline = new Date(dom.deadlineInput.value);
  if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) return showToast("Hạn chốt món phải ở thời điểm sau hiện tại.");
  const draftMenu = collectDraftMenu();
  if (draftMenu.error) return showToast(draftMenu.error);
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
    members: [],
    creatorMemberId: profile.id,
    creatorProfileId: profile.id,
    creatorName: profile.nickname,
    creatorColor: profile.color,
    payment: { bankName: "", accountNumber: "", accountOwner: "", transferNote: "", qrImage: "" }
  };
  appState.sessions.unshift(session);
  appState.activeSessionId = session.id;
  appState.selectedMemberId = profile.id;
  saveState();
  closeNewSessionModal();
  renderAll();
  setView("session");
  showToast("Đã tạo phiên mới. Bạn và mọi người có thể bấm Tham gia để chọn món!");
}

function joinWithNickname() {
  const session = activeSession();
  const profile = currentProfile();
  if (!session) return;
  if (!profile) return openProfileModal(true);
  if (isLocked(session)) return showToast("Phiên đã chốt nên không thể tham gia thêm.");
  if (selectedMember(session)) return showToast("Bạn đã tham gia phiên này rồi.");
  const newMember = makeMember(profile, session.members.length);
  session.members.push(newMember);
  appState.selectedMemberId = newMember.id;
  saveState();
  renderAll();
  showToast(`Đã tham gia phiên với nickname ${profile.nickname}.`);
}

function archiveActiveSession() {
  const session = activeSession();
  if (!session || !canManageSettlement(session)) return showNoPermission();
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
  appState.selectedMemberId = currentProfile()?.id || null;
  saveState();
  renderAll();
  setView("session");
  showToast("Đã khôi phục phiên đặt đồ.");
}

function openSessionFromHistory(sessionId) {
  const session = appState.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  if (session.archived) return showToast("Hãy khôi phục phiên lưu trữ trước khi xem chi tiết.");
  appState.activeSessionId = session.id;
  appState.selectedMemberId = currentProfile()?.id || null;
  saveState();
  renderAll();
  setView("session");
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const protectedControl = event.target.closest("[data-no-edit='true']");
    if (protectedControl) {
      event.preventDefault();
      showNoPermission();
      return;
    }
    const viewButton = event.target.closest("[data-view-target]");
    if (viewButton) setView(viewButton.dataset.viewTarget);
    if (event.target.closest("[data-open-modal]")) openNewSessionModal();
  });
  $$("#newSessionBtn, #heroCreateBtn").forEach((button) => button.addEventListener("click", openNewSessionModal));
  $("#closeModalBtn").addEventListener("click", closeNewSessionModal);
  $("#cancelModalBtn").addEventListener("click", closeNewSessionModal);
  dom.sessionModal.addEventListener("click", (event) => { if (event.target === dom.sessionModal) closeNewSessionModal(); });
  dom.profileButton.addEventListener("click", () => openProfileModal(false));
  dom.profileForm.addEventListener("submit", saveProfile);
  dom.profileCancelBtn.addEventListener("click", closeProfileModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.sessionModal.hidden) closeNewSessionModal();
    if (event.key === "Escape" && !dom.profileModal.hidden) closeProfileModal();
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
    appState.selectedMemberId = currentProfile()?.id || null;
    saveState(); renderAll();
  });
  dom.changeNicknameBtn.addEventListener("click", () => openProfileModal(false));
  dom.joinOrderBtn.addEventListener("click", () => {
    if (selectedMember()) confirmCurrentOrder();
    else joinWithNickname();
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
    appState.selectedMemberId = currentProfile()?.id || null;
    saveState(); renderAll();
  });

  dom.foodOptions.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-menu-checkbox]");
    const quantityInput = event.target.closest("[data-qty-input]");
    if (checkbox) {
      const session = activeSession();
      const member = selectedMember(session);
      if (!member) return;
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
    markOrderAsChanged(member);
    dom.customFoodForm.reset(); dom.customFoodQty.value = 1;
    saveState(); renderAll(); showToast("Đã thêm món khác.");
  });
  dom.selectedFoods.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-selection]");
    if (button) removeSelection(button.dataset.removeSelection);
  });

  $$('input[name="splitMethod"]').forEach((radio) => radio.addEventListener("change", () => {
    const session = activeSession();
    if (isLocked(session)) return;
    if (!isSessionCreator(session)) {
      showNoPermission();
      renderAll();
      return;
    }
    session.splitMethod = radio.value;
    saveState(); renderAll();
  }));
  dom.totalBillInput.addEventListener("change", () => { const session = activeSession(); if (isLocked(session)) return; if (!isSessionCreator(session)) { showNoPermission(); renderAll(); return; } session.equalTotal = Number(dom.totalBillInput.value || 0); saveState(); renderAll(); });
  dom.deliveryFeeInput.addEventListener("change", () => { const session = activeSession(); if (isLocked(session)) return; if (!isSessionCreator(session)) { showNoPermission(); renderAll(); return; } session.deliveryFee = Number(dom.deliveryFeeInput.value || 0); saveState(); renderAll(); });
  dom.discountInput.addEventListener("change", () => { const session = activeSession(); if (isLocked(session)) return; if (!isSessionCreator(session)) { showNoPermission(); renderAll(); return; } session.discount = Number(dom.discountInput.value || 0); saveState(); renderAll(); });
  dom.pricingList.addEventListener("change", (event) => {
    const session = activeSession();
    if (isLocked(session)) return;
    if (!isSessionCreator(session)) {
      showNoPermission();
      renderAll();
      return;
    }
    const input = event.target;
    const price = Math.max(0, Number(input.value || 0));
    if (input.dataset.menuPrice) {
      const menuItem = session.menu.find((item) => item.id === input.dataset.menuPrice);
      if (menuItem) {
        menuItem.price = price;
        session.members.forEach((member) => {
          const affectedSelections = member.selections.filter((selection) => selection.sourceMenuId === menuItem.id);
          affectedSelections.forEach((selection) => { selection.price = price; });
          if (affectedSelections.length) markOrderAsChanged(member);
        });
      }
    }
    if (input.dataset.selectionPrice) {
      session.members.forEach((member) => {
        const affectedSelections = member.selections.filter((selection) => selection.id === input.dataset.selectionPrice);
        affectedSelections.forEach((selection) => { selection.price = price; });
        if (affectedSelections.length) markOrderAsChanged(member);
      });
    }
    saveState(); renderAll();
  });

  [dom.bankNameInput, dom.bankAccountInput, dom.bankOwnerInput, dom.transferNoteInput].forEach((input) => input.addEventListener("input", updatePaymentInfo));
  dom.qrFileInput.addEventListener("change", () => {
    const session = activeSession();
    const file = dom.qrFileInput.files?.[0];
    if (!file || isLocked(session)) return;
    if (!isSessionCreator(session)) return showNoPermission();
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
    const currentMember = selectedMember(session);
    if (!member || !currentMember || !isLocked(session) || member.id !== currentMember.id) return;
    member.paid = checkbox.checked;
    member.paidAt = checkbox.checked ? new Date().toISOString() : null;
    saveState(); renderAll();
    showToast(checkbox.checked ? "Đã ghi nhận chuyển khoản." : "Đã bỏ trạng thái chuyển khoản.");
  });

  dom.saveSessionBtn.addEventListener("click", () => { const session = activeSession(); if (!isSessionCreator(session)) return showNoPermission(); saveState(); showToast("Đã lưu thay đổi trên trình duyệt này."); });
  dom.lockSessionBtn.addEventListener("click", () => {
    const session = activeSession();
    if (!session) return showToast("Hãy tạo phiên đặt đồ trước.");
    if (!canManageSettlement(session)) return showNoPermission();
    if (session.status !== "open") return showToast("Số tiền của phiên này đã được chốt.");
    if (!session.members.length) return showToast("Cần ít nhất một thành viên.");
    const unconfirmedMembers = session.members.filter((member) => !member.orderConfirmedAt);
    if (unconfirmedMembers.length) return showToast(`Còn ${unconfirmedMembers.length} người chưa xác nhận món.`);
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
    if (!isSessionCreator(session)) return showNoPermission();
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
    if (!session || !isSessionCreator(session)) return showNoPermission();
    deleteSession(session.id);
  });
  dom.historyFilter.addEventListener("change", renderHistory);
  dom.historyTable.addEventListener("click", (event) => {
    const restoreButton = event.target.closest("[data-restore-session]");
    const deleteButton = event.target.closest("[data-delete-session]");
    if (restoreButton) return restoreSession(restoreButton.dataset.restoreSession);
    if (deleteButton) return deleteSession(deleteButton.dataset.deleteSession);
    const sessionRow = event.target.closest("[data-open-session]");
    if (sessionRow) openSessionFromHistory(sessionRow.dataset.openSession);
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
