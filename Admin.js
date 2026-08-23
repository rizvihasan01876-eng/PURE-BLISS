/* ==========================================================================
   PURE BLISS — ADMIN PANEL LOGIC
   Talks to the Apps Script backend (pure-bliss-backend.gs) deployed as a
   Web App. Set ADMIN_API_URL to that deployment URL — the same URL used
   as GOOGLE_SCRIPT_URL in script.js.
   ========================================================================== */

const ADMIN_API_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";

const CURRENCY_DEFAULT = "৳";
let SETTINGS = { storeName: "Pure Bliss", bkashNumber: "", deliveryCharge: 60, advancePercentage: 20, currency: CURRENCY_DEFAULT };
let PRODUCTS = [];
let ORDERS = [];
let sessionToken = sessionStorage.getItem("pb_admin_token") || "";

let ordersPage = 1;
const ORDERS_PER_PAGE = 15;
let chartRangeDays = 7;
let pollTimer = null;
let lastKnownOrderCount = null;

/* ---------------- API HELPERS ---------------- */

async function apiGet(action, params = {}) {
  const url = new URL(ADMIN_API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(action, body = {}) {
  const res = await fetch(ADMIN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // keeps request "simple" (no CORS preflight)
    body: JSON.stringify({ action, ...body })
  });
  return res.json();
}

function requireAuthOrLogout(result) {
  if (result && result.authError) {
    showToast("Session expired", "Please log in again.");
    logout();
    return true;
  }
  return false;
}

/* ---------------- AUTH ---------------- */

const loginScreen = document.getElementById("loginScreen");
const adminApp = document.getElementById("adminApp");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  loginError.classList.remove("show");
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = "Signing in…";

  try {
    if (ADMIN_API_URL.includes("PASTE_YOUR")) {
      throw new Error("Backend not configured yet — set ADMIN_API_URL in admin.js.");
    }
    const result = await apiPost("login", { username, password });
    if (result.success) {
      sessionToken = result.token;
      sessionStorage.setItem("pb_admin_token", sessionToken);
      sessionStorage.setItem("pb_admin_user", result.username || username);
      enterApp();
    } else {
      loginError.textContent = result.error || "Invalid username or password.";
      loginError.classList.add("show");
    }
  } catch (err) {
    loginError.textContent = err.message || "Could not reach the server. Check your connection.";
    loginError.classList.add("show");
  } finally {
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = "LOGIN TO DASHBOARD";
  }
});

function logout() {
  sessionToken = "";
  sessionStorage.removeItem("pb_admin_token");
  sessionStorage.removeItem("pb_admin_user");
  clearInterval(pollTimer);
  adminApp.classList.remove("is-active");
  loginScreen.style.display = "flex";
}

document.getElementById("logoutBtn").addEventListener("click", logout);

async function enterApp() {
  loginScreen.style.display = "none";
  adminApp.classList.add("is-active");
  await Promise.all([loadSettings(), loadProducts(), loadOrders()]);
  renderAll();
  startPolling();
}

// Auto-resume session if a token is already stored
if (sessionToken && !ADMIN_API_URL.includes("PASTE_YOUR")) {
  enterApp().catch(() => logout());
}

/* ---------------- DATA LOADING ---------------- */

async function loadOrders() {
  const result = await apiGet("listOrders", { token: sessionToken });
  if (requireAuthOrLogout(result)) return;
  if (result.success) {
    const previousCount = ORDERS.length;
    ORDERS = result.orders || [];
    if (lastKnownOrderCount !== null && ORDERS.length > lastKnownOrderCount) {
      const newest = ORDERS[0];
      showToast("New Order Received", `${newest["Order ID"]} — ${newest["Product"]} — ${SETTINGS.currency}${newest["Total"]}`);
      document.getElementById("notifDot").classList.add("show");
    }
    lastKnownOrderCount = ORDERS.length;
  }
}

async function loadSettings() {
  const result = await apiGet("getSettings", { token: sessionToken });
  if (requireAuthOrLogout(result)) return;
  if (result.success && result.settings) SETTINGS = Object.assign(SETTINGS, result.settings);
}

async function loadProducts() {
  const result = await apiGet("getProducts");
  if (result.success && result.products) PRODUCTS = result.products;
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    await loadOrders();
    renderAll();
  }, 45000);
}

document.getElementById("refreshBtn").addEventListener("click", async () => {
  await Promise.all([loadOrders(), loadProducts()]);
  renderAll();
  showToast("Refreshed", "Latest data loaded.");
});

document.getElementById("notifBtn").addEventListener("click", () => {
  document.getElementById("notifDot").classList.remove("show");
  switchSection("orders");
});

/* ---------------- NAVIGATION ---------------- */

function switchSection(name) {
  document.querySelectorAll(".admin-nav button").forEach(b => b.classList.toggle("is-active", b.dataset.section === name));
  document.querySelectorAll(".admin-section").forEach(s => s.classList.toggle("is-active", s.dataset.section === name));
  const titles = { dashboard: "Dashboard", orders: "Orders", customers: "Customers", products: "Products", payments: "Payments", analytics: "Analytics", settings: "Settings" };
  document.getElementById("topbarTitle").textContent = titles[name] || name;
  closeSidebarMobile();
}

document.querySelectorAll(".admin-nav button").forEach(btn => {
  btn.addEventListener("click", () => switchSection(btn.dataset.section));
});

const sidebar = document.getElementById("adminSidebar");
const scrim = document.getElementById("sidebarScrim");
document.getElementById("hamburgerBtn").addEventListener("click", () => {
  sidebar.classList.add("is-open");
  scrim.classList.add("show");
});
function closeSidebarMobile() { sidebar.classList.remove("is-open"); scrim.classList.remove("show"); }
scrim.addEventListener("click", closeSidebarMobile);

/* ---------------- HELPERS ---------------- */

function fmt(n) { return `${SETTINGS.currency}${Math.round(Number(n) || 0).toLocaleString()}`; }
function statusSlug(s) { return String(s || "").toLowerCase().replace(/\s+/g, "-"); }

function orderDate(o) {
  const t = o["Timestamp"];
  return t ? new Date(t) : null;
}

function isSameDay(d1, d2) { return d1.toDateString() === d2.toDateString(); }

function withinDays(date, days) {
  if (!date) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

function showToast(title, msg) {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<strong>${title}</strong>${msg}`;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

/* ---------------- RENDER: EVERYTHING ---------------- */

function renderAll() {
  renderDashboard();
  renderOrders();
  renderCustomers();
  renderProducts();
  renderPayments();
  renderAnalytics();
  renderSettingsForm();
}

/* ---------------- DASHBOARD ---------------- */

function renderDashboard() {
  const totalOrders = ORDERS.length;
  const totalSales = ORDERS.reduce((s, o) => s + (Number(o["Total"]) || 0), 0);
  const pending = ORDERS.filter(o => !["Delivered", "Cancelled"].includes(o["Order Status"])).length;
  const delivered = ORDERS.filter(o => o["Order Status"] === "Delivered").length;
  const bkashTotal = ORDERS.filter(o => o["Payment Method"] === "bKash Advance Payment").reduce((s, o) => s + (Number(o["Advance Amount"]) || 0), 0);
  const codCount = ORDERS.filter(o => o["Payment Method"] === "Cash on Delivery").length;

  const cards = [
    { icon: "🛒", label: "Total Orders", value: totalOrders.toLocaleString() },
    { icon: "💰", label: "Total Sales", value: fmt(totalSales) },
    { icon: "⏳", label: "Pending Orders", value: pending.toLocaleString() },
    { icon: "✅", label: "Delivered Orders", value: delivered.toLocaleString() },
    { icon: "💳", label: "bKash Payments", value: fmt(bkashTotal) },
    { icon: "📦", label: "COD Orders", value: codCount.toLocaleString() }
  ];
  document.getElementById("statGrid").innerHTML = cards.map(c => `
    <div class="stat-card"><span class="stat-icon">${c.icon}</span><span class="stat-label">${c.label}</span><span class="stat-value">${c.value}</span></div>
  `).join("");

  const today = new Date();
  const todaysOrders = ORDERS.filter(o => { const d = orderDate(o); return d && isSameDay(d, today); });
  const todaysSales = todaysOrders.reduce((s, o) => s + (Number(o["Total"]) || 0), 0);
  const overview = [
    { label: "Today's Orders", value: todaysOrders.length },
    { label: "Today's Sales", value: fmt(todaysSales) },
    { label: "Today's Delivered", value: todaysOrders.filter(o => o["Order Status"] === "Delivered").length },
    { label: "Today's Pending", value: todaysOrders.filter(o => !["Delivered", "Cancelled"].includes(o["Order Status"])).length },
    { label: "Today's Cancelled", value: todaysOrders.filter(o => o["Order Status"] === "Cancelled").length }
  ];
  document.getElementById("overviewStrip").innerHTML = overview.map(o => `
    <div class="overview-item"><span class="label">${o.label}</span><span class="value">${o.value}</span></div>
  `).join("");

  renderSalesChart();
  renderBestSellers();
  renderRecentOrders();
}

function renderRecentOrders() {
  const rows = ORDERS.slice(0, 10);
  const tbody = document.querySelector("#recentOrdersTable tbody");
  tbody.innerHTML = rows.length ? rows.map(o => `
    <tr onclick="openOrderModal('${o["Order ID"]}')">
      <td>${o["Order ID"]}</td><td>${o["Customer Name"]}</td><td>${o["Product"]}</td>
      <td>${fmt(o["Total"])}</td>
      <td>${o["Payment Method"] === "bKash Advance Payment" ? "bKash" : "COD"}</td>
      <td><span class="status-pill status-${statusSlug(o["Order Status"])}">${o["Order Status"] || "New"}</span></td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-state">No orders yet.</td></tr>`;
}

function renderBestSellers() {
  const tally = {};
  ORDERS.forEach(o => {
    const key = o["Product"] || "Unknown";
    if (!tally[key]) tally[key] = { sold: 0, revenue: 0 };
    tally[key].sold += Number(o["Quantity"]) || 0;
    tally[key].revenue += Number(o["Total"]) || 0;
  });
  const ranked = Object.entries(tally).sort((a, b) => b[1].sold - a[1].sold).slice(0, 5);
  const list = document.getElementById("bestSellersList");
  if (!ranked.length) { list.innerHTML = `<div class="empty-state">No sales yet.</div>`; return; }
  list.innerHTML = ranked.map(([name, data], i) => {
    const prod = PRODUCTS.find(p => name.includes(p.name.replace(/^\d+ — /, "")));
    const img = prod ? prod.image : "";
    return `<div class="mini-list-item">
      <span class="mini-list-rank">${i + 1}</span>
      <span class="mini-list-thumb">${img ? `<img src="${img}" alt="${name}">` : ""}</span>
      <span class="mini-list-copy"><strong>${name}</strong><span>${data.sold} sold</span></span>
      <span class="mini-list-value">${fmt(data.revenue)}</span>
    </div>`;
  }).join("");
}

/* ---------------- SALES CHART (hand-drawn SVG, no dependency) ---------------- */

document.querySelectorAll("#chartRangeTabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#chartRangeTabs button").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    chartRangeDays = parseInt(btn.dataset.range, 10);
    renderSalesChart();
  });
});

function renderSalesChart() {
  const days = chartRangeDays;
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    buckets.push({ date: d, total: 0 });
  }
  ORDERS.forEach(o => {
    const d = orderDate(o);
    if (!d) return;
    const dd = new Date(d); dd.setHours(0, 0, 0, 0);
    const bucket = buckets.find(b => b.date.getTime() === dd.getTime());
    if (bucket) bucket.total += Number(o["Total"]) || 0;
  });

  const w = 900, h = 260, padL = 50, padB = 30, padT = 20, padR = 20;
  const max = Math.max(1, ...buckets.map(b => b.total));
  const stepX = (w - padL - padR) / Math.max(1, buckets.length - 1);
  const pts = buckets.map((b, i) => {
    const x = padL + i * stepX;
    const y = padT + (h - padT - padB) * (1 - b.total / max);
    return { x, y, b };
  });
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${h - padB} L${pts[0].x.toFixed(1)},${h - padB} Z`;

  const labelEvery = Math.ceil(buckets.length / 8);
  const labels = pts.map((p, i) => i % labelEvery === 0 ? `<text x="${p.x}" y="${h - 8}" font-size="10" fill="var(--text-secondary)" text-anchor="middle">${p.b.date.getDate()}/${p.b.date.getMonth() + 1}</text>` : "").join("");
  const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--gold-primary)"><title>${p.b.date.toDateString()}: ${fmt(p.b.total)}</title></circle>`).join("");

  document.getElementById("salesChartWrap").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D4AF37" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#D4AF37" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#areaGrad)" />
      <path d="${linePath}" fill="none" stroke="#D4AF37" stroke-width="2" />
      ${dots}
      ${labels}
    </svg>`;
}

/* ---------------- ORDERS TABLE ---------------- */

function getFilteredOrders() {
  const q = document.getElementById("orderSearch").value.trim().toLowerCase();
  const status = document.getElementById("filterStatus").value;
  const payment = document.getElementById("filterPayment").value;
  const payStatus = document.getElementById("filterPaymentStatus").value;
  const dateFilter = document.getElementById("filterDate").value;

  return ORDERS.filter(o => {
    if (q) {
      const hay = `${o["Order ID"]} ${o["Customer Name"]} ${o["Phone"]} ${o["Product"]}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (status && o["Order Status"] !== status) return false;
    if (payment && o["Payment Method"] !== payment) return false;
    if (payStatus && o["Payment Status"] !== payStatus) return false;
    if (dateFilter) {
      const d = orderDate(o);
      if (!d) return false;
      if (dateFilter === "today" && !isSameDay(d, new Date())) return false;
      if (dateFilter === "yesterday") {
        const y = new Date(); y.setDate(y.getDate() - 1);
        if (!isSameDay(d, y)) return false;
      }
      if (dateFilter === "7" && !withinDays(d, 7)) return false;
      if (dateFilter === "30" && !withinDays(d, 30)) return false;
    }
    return true;
  });
}

["orderSearch", "filterStatus", "filterPayment", "filterPaymentStatus", "filterDate"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => { ordersPage = 1; renderOrders(); });
  document.getElementById(id).addEventListener("change", () => { ordersPage = 1; renderOrders(); });
});

function renderOrders() {
  const filtered = getFilteredOrders();
  const totalPages = Math.max(1, Math.ceil(filtered.length / ORDERS_PER_PAGE));
  ordersPage = Math.min(ordersPage, totalPages);
  const start = (ordersPage - 1) * ORDERS_PER_PAGE;
  const pageRows = filtered.slice(start, start + ORDERS_PER_PAGE);

  const tbody = document.querySelector("#ordersTable tbody");
  tbody.innerHTML = pageRows.length ? pageRows.map(o => `
    <tr onclick="openOrderModal('${o["Order ID"]}')">
      <td data-label="Order ID">${o["Order ID"]}</td>
      <td data-label="Customer">${o["Customer Name"]}</td>
      <td data-label="Phone">${o["Phone"]}</td>
      <td data-label="Product">${o["Product"]}</td>
      <td data-label="Qty">${o["Quantity"]}</td>
      <td data-label="Total">${fmt(o["Total"])}</td>
      <td data-label="Payment">${o["Payment Method"] === "bKash Advance Payment" ? "bKash" : "COD"}</td>
      <td data-label="Status"><span class="status-pill status-${statusSlug(o["Order Status"])}">${o["Order Status"] || "New"}</span></td>
      <td data-label="Date">${orderDate(o) ? orderDate(o).toLocaleDateString() : "—"}</td>
    </tr>`).join("") : `<tr><td colspan="9" class="empty-state">No matching orders.</td></tr>`;

  document.getElementById("ordersPageInfo").textContent = `Page ${ordersPage} of ${totalPages} · ${filtered.length} orders`;
  document.getElementById("ordersPrevBtn").disabled = ordersPage <= 1;
  document.getElementById("ordersNextBtn").disabled = ordersPage >= totalPages;
}
document.getElementById("ordersPrevBtn").addEventListener("click", () => { ordersPage--; renderOrders(); });
document.getElementById("ordersNextBtn").addEventListener("click", () => { ordersPage++; renderOrders(); });

/* ---------------- CUSTOMERS ---------------- */

function renderCustomers() {
  const map = {};
  ORDERS.forEach(o => {
    const phone = o["Phone"] || "unknown";
    if (!map[phone]) map[phone] = { name: o["Customer Name"], phone, orders: 0, spent: 0, last: null };
    map[phone].orders += 1;
    map[phone].spent += Number(o["Total"]) || 0;
    const d = orderDate(o);
    if (d && (!map[phone].last || d > map[phone].last)) map[phone].last = d;
  });
  const rows = Object.values(map).sort((a, b) => b.spent - a.spent);
  const tbody = document.querySelector("#customersTable tbody");
  tbody.innerHTML = rows.length ? rows.map(c => `
    <tr><td data-label="Customer">${c.name}</td><td data-label="Phone">${c.phone}</td>
      <td data-label="Orders">${c.orders}</td><td data-label="Total Spent">${fmt(c.spent)}</td>
      <td data-label="Last Order">${c.last ? c.last.toLocaleDateString() : "—"}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty-state">No customers yet.</td></tr>`;
}

/* ---------------- PRODUCTS ---------------- */

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  if (!PRODUCTS.length) { grid.innerHTML = `<div class="empty-state">No products loaded.</div>`; return; }
  grid.innerHTML = PRODUCTS.map((p, i) => `
    <div class="admin-product-card">
      <div class="admin-product-thumb"><img src="${p.image}" alt="${p.name}"></div>
      <div class="admin-product-body">
        <h4>${p.name}</h4>
        <div class="form-group"><label>Price (৳)</label><input type="number" data-idx="${i}" data-field="price" value="${p.price}"></div>
        <div class="form-group"><label>Old / Compare-at Price (৳)</label><input type="number" data-idx="${i}" data-field="oldPrice" value="${p.oldPrice}"></div>
        <div class="form-group"><label>Stock</label><input type="number" data-idx="${i}" data-field="stock" value="${p.stock ?? 0}"></div>
        <label class="admin-product-toggle">
          <span>Active</span>
          <input type="checkbox" data-idx="${i}" data-field="active" ${p.active !== false ? "checked" : ""}>
        </label>
      </div>
    </div>`).join("");
}

document.getElementById("productsGrid").addEventListener("input", (e) => {
  const idx = e.target.dataset.idx;
  const field = e.target.dataset.field;
  if (idx === undefined || !field) return;
  const val = field === "active" ? e.target.checked : (field === "price" || field === "oldPrice" || field === "stock" ? Number(e.target.value) : e.target.value);
  PRODUCTS[idx][field] = val;
});

document.getElementById("saveProductsBtn").addEventListener("click", async () => {
  const btn = document.getElementById("saveProductsBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  const result = await apiPost("updateProducts", { token: sessionToken, products: PRODUCTS });
  btn.disabled = false; btn.textContent = "Save Product Changes";
  if (requireAuthOrLogout(result)) return;
  showToast(result.success ? "Products updated" : "Save failed", result.success ? "Live on the website now." : (result.error || ""));
});

/* ---------------- PAYMENTS ---------------- */

function renderPayments() {
  const bkashOrders = ORDERS.filter(o => o["Payment Method"] === "bKash Advance Payment");
  const tbody = document.querySelector("#paymentsTable tbody");
  tbody.innerHTML = bkashOrders.length ? bkashOrders.map(o => `
    <tr>
      <td data-label="Order ID">${o["Order ID"]}</td>
      <td data-label="Customer">${o["Customer Name"]}</td>
      <td data-label="Advance">${fmt(o["Advance Amount"])}</td>
      <td data-label="Sender No.">${o["bKash Sender Number"]}</td>
      <td data-label="Transaction ID">${o["bKash Transaction ID"]}</td>
      <td data-label="Status"><span class="status-pill pay-${statusSlug(o["Payment Status"])}">${o["Payment Status"] || "Advance Submitted"}</span></td>
      <td data-label="">
        ${o["Payment Status"] !== "Verified" ? `<button class="icon-btn" title="Open order" onclick="openOrderModal('${o["Order ID"]}')">↗</button>` : ""}
      </td>
    </tr>`).join("") : `<tr><td colspan="7" class="empty-state">No bKash payments yet.</td></tr>`;
}

/* ---------------- ANALYTICS ---------------- */

function renderAnalytics() {
  const delivered = ORDERS.filter(o => o["Order Status"] === "Delivered").length;
  const cancelled = ORDERS.filter(o => o["Order Status"] === "Cancelled").length;
  const pending = ORDERS.length - delivered - cancelled;
  const bkashRevenue = ORDERS.filter(o => o["Payment Method"] === "bKash Advance Payment").reduce((s, o) => s + (Number(o["Total"]) || 0), 0);
  const codRevenue = ORDERS.filter(o => o["Payment Method"] === "Cash on Delivery").reduce((s, o) => s + (Number(o["Total"]) || 0), 0);
  const pendingAdvance = ORDERS.filter(o => o["Payment Status"] === "Advance Submitted").reduce((s, o) => s + (Number(o["Advance Amount"]) || 0), 0);

  const cards = [
    { icon: "✅", label: "Delivered", value: delivered },
    { icon: "❌", label: "Cancelled", value: cancelled },
    { icon: "⏳", label: "Pending", value: pending },
    { icon: "💳", label: "bKash Revenue", value: fmt(bkashRevenue) },
    { icon: "📦", label: "COD Revenue", value: fmt(codRevenue) },
    { icon: "🕓", label: "Pending Advance", value: fmt(pendingAdvance) }
  ];
  document.getElementById("analyticsStatGrid").innerHTML = cards.map(c => `
    <div class="stat-card"><span class="stat-icon">${c.icon}</span><span class="stat-label">${c.label}</span><span class="stat-value">${c.value}</span></div>
  `).join("");

  const byProduct = {};
  ORDERS.forEach(o => { const k = o["Product"] || "Unknown"; byProduct[k] = (byProduct[k] || 0) + (Number(o["Total"]) || 0); });
  const ranked = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 8);
  document.getElementById("revenueByProductList").innerHTML = ranked.length ? ranked.map(([name, rev], i) => `
    <div class="mini-list-item"><span class="mini-list-rank">${i + 1}</span>
      <span class="mini-list-copy" style="flex:1"><strong>${name}</strong></span>
      <span class="mini-list-value">${fmt(rev)}</span></div>`).join("") : `<div class="empty-state">No data yet.</div>`;

  const total = ORDERS.length || 1;
  const bkashCount = ORDERS.filter(o => o["Payment Method"] === "bKash Advance Payment").length;
  const codCount = ORDERS.length - bkashCount;
  document.getElementById("paymentMixList").innerHTML = `
    <div class="mini-list-item"><span class="mini-list-copy" style="flex:1"><strong>bKash Advance</strong><span>${bkashCount} orders</span></span><span class="mini-list-value">${Math.round(bkashCount / total * 100)}%</span></div>
    <div class="mini-list-item"><span class="mini-list-copy" style="flex:1"><strong>Cash on Delivery</strong><span>${codCount} orders</span></span><span class="mini-list-value">${Math.round(codCount / total * 100)}%</span></div>`;
}

/* ---------------- SETTINGS ---------------- */

function renderSettingsForm() {
  document.getElementById("setStoreName").value = SETTINGS.storeName || "";
  document.getElementById("setBkashNumber").value = SETTINGS.bkashNumber || "";
  document.getElementById("setDeliveryCharge").value = SETTINGS.deliveryCharge ?? 60;
  document.getElementById("setAdvancePercentage").value = SETTINGS.advancePercentage ?? 20;
  document.getElementById("setCurrency").value = SETTINGS.currency || CURRENCY_DEFAULT;
}

document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
  const newSettings = {
    storeName: document.getElementById("setStoreName").value.trim(),
    bkashNumber: document.getElementById("setBkashNumber").value.trim(),
    deliveryCharge: Number(document.getElementById("setDeliveryCharge").value) || 0,
    advancePercentage: Number(document.getElementById("setAdvancePercentage").value) || 0,
    currency: document.getElementById("setCurrency").value.trim() || CURRENCY_DEFAULT
  };
  const btn = document.getElementById("saveSettingsBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  const result = await apiPost("updateSettings", { token: sessionToken, settings: newSettings });
  btn.disabled = false; btn.textContent = "Save Settings";
  if (requireAuthOrLogout(result)) return;
  if (result.success) {
    SETTINGS = result.settings;
    const msg = document.getElementById("settingsSavedMsg");
    msg.style.display = "block";
    setTimeout(() => msg.style.display = "none", 2500);
  } else {
    showToast("Save failed", result.error || "");
  }
});

/* ---------------- ORDER DETAILS MODAL ---------------- */

const orderModalOverlay = document.getElementById("orderModalOverlay");
document.getElementById("modalCloseBtn").addEventListener("click", () => orderModalOverlay.classList.remove("show"));
orderModalOverlay.addEventListener("click", (e) => { if (e.target === orderModalOverlay) orderModalOverlay.classList.remove("show"); });

const STATUS_FLOW = ["New", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];

function openOrderModal(orderId) {
  const o = ORDERS.find(x => String(x["Order ID"]) === String(orderId));
  if (!o) return;
  document.getElementById("modalOrderId").textContent = o["Order ID"];

  const isBkash = o["Payment Method"] === "bKash Advance Payment";
  const statusOptions = STATUS_FLOW.map(s => `<option value="${s}" ${o["Order Status"] === s ? "selected" : ""}>${s}</option>`).join("");

  document.getElementById("modalBody").innerHTML = `
    <div class="modal-block">
      <h4>Customer</h4>
      <div class="modal-row"><span>Name</span><span>${o["Customer Name"]}</span></div>
      <div class="modal-row"><span>Phone</span><span>${o["Phone"]}</span></div>
      <div class="modal-row"><span>Address</span><span>${o["Address"]}</span></div>
    </div>
    <div class="modal-block">
      <h4>Product</h4>
      <div class="modal-row"><span>Product</span><span>${o["Product"]}</span></div>
      <div class="modal-row"><span>Quantity</span><span>${o["Quantity"]}</span></div>
      <div class="modal-row"><span>Unit Price</span><span>${fmt(o["Unit Price"])}</span></div>
    </div>
    <div class="modal-block">
      <h4>Payment</h4>
      <div class="modal-row"><span>Method</span><span>${o["Payment Method"] || "—"}</span></div>
      ${isBkash ? `
        <div class="modal-row"><span>Advance Amount</span><span>${fmt(o["Advance Amount"])}</span></div>
        <div class="modal-row"><span>Remaining Amount</span><span>${fmt(o["Remaining Amount"])}</span></div>
        <div class="modal-row"><span>bKash Sender Number</span><span>${o["bKash Sender Number"] || "—"}</span></div>
        <div class="modal-row"><span>Transaction ID</span><span>${o["bKash Transaction ID"] || "—"}</span></div>
      ` : ""}
      <div class="modal-row"><span>Payment Status</span><span><span class="status-pill pay-${statusSlug(o["Payment Status"])}">${o["Payment Status"] || "—"}</span></span></div>
    </div>
    <div class="modal-block">
      <h4>Order Summary</h4>
      <div class="modal-row"><span>Subtotal</span><span>${fmt(o["Subtotal"])}</span></div>
      <div class="modal-row"><span>Delivery</span><span>${fmt(o["Delivery"])}</span></div>
      <div class="modal-row total"><span>Total</span><span>${fmt(o["Total"])}</span></div>
      ${o["Notes"] ? `<div class="modal-row"><span>Notes</span><span>${o["Notes"]}</span></div>` : ""}
    </div>
    <div class="modal-block">
      <h4>Update Order Status</h4>
      <select id="statusUpdateSelect" style="width:100%; padding:0.65rem; background:var(--bg-black); border:1px solid var(--border-gold); color:var(--text-primary); border-radius:5px;">
        ${statusOptions}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="modalUpdateStatusBtn">Update Status</button>
      <button class="btn btn-outline" id="modalWhatsappBtn">Contact Customer</button>
    </div>
    ${isBkash && o["Payment Status"] !== "Verified" ? `
      <div class="modal-actions">
        <button class="btn btn-verify" id="modalVerifyBtn">Verify Payment</button>
        <button class="btn btn-reject" id="modalRejectBtn">Reject Payment</button>
      </div>` : ""}
    ${!isBkash && o["Payment Status"] !== "Paid" ? `
      <div class="modal-actions">
        <button class="btn btn-verify" id="modalMarkPaidBtn">Mark as Paid</button>
      </div>` : ""}
  `;

  document.getElementById("modalUpdateStatusBtn").addEventListener("click", () => {
    const newStatus = document.getElementById("statusUpdateSelect").value;
    updateOrderRemote(o["Order ID"], { status: newStatus });
  });
  document.getElementById("modalWhatsappBtn").addEventListener("click", () => {
    const phone = String(o["Phone"] || "").replace(/\D/g, "");
    const msg = `Hello ${o["Customer Name"]}, this is Pure Bliss. We are contacting you regarding your order ${o["Order ID"]}.`;
    window.open(`https://wa.me/88${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  });
  const verifyBtn = document.getElementById("modalVerifyBtn");
  if (verifyBtn) verifyBtn.addEventListener("click", () => updateOrderRemote(o["Order ID"], { paymentStatus: "Verified" }));
  const rejectBtn = document.getElementById("modalRejectBtn");
  if (rejectBtn) rejectBtn.addEventListener("click", () => updateOrderRemote(o["Order ID"], { paymentStatus: "Rejected" }));
  const markPaidBtn = document.getElementById("modalMarkPaidBtn");
  if (markPaidBtn) markPaidBtn.addEventListener("click", () => updateOrderRemote(o["Order ID"], { paymentStatus: "Paid" }));

  orderModalOverlay.classList.add("show");
}

async function updateOrderRemote(orderId, changes) {
  const result = await apiPost("updateOrder", { token: sessionToken, orderId, ...changes });
  if (requireAuthOrLogout(result)) return;
  if (result.success) {
    const o = ORDERS.find(x => String(x["Order ID"]) === String(orderId));
    if (o) Object.assign(o, changes.status ? { "Order Status": changes.status } : {}, changes.paymentStatus ? { "Payment Status": changes.paymentStatus } : {});
    showToast("Order updated", `${orderId} saved.`);
    orderModalOverlay.classList.remove("show");
    renderAll();
  } else {
    showToast("Update failed", result.error || "");
  }
}
