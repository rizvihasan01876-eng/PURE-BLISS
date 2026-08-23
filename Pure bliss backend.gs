/**
 * ==========================================================================
 * PURE BLISS — UNIFIED BACKEND (Order Intake + Admin API)
 * ==========================================================================
 *
 * This single script replaces your old order-only Apps Script. It still
 * accepts orders from the customer website exactly as before, and adds a
 * small JSON API that the new admin.html panel uses to log in, list orders,
 * update order/payment status, and manage settings + products — all backed
 * by this same Google Sheet. No password or secret ever lives in the
 * website's frontend code; the admin password is checked here, server-side.
 *
 * ---- ONE-TIME SETUP ----
 * 1. Open your Google Sheet → Extensions → Apps Script.
 * 2. Delete whatever is in Code.gs and paste this entire file in its place.
 * 3. Scroll down to DEFAULT_ADMIN_USERNAME / DEFAULT_ADMIN_PASSWORD below
 *    and change the password to something only you know.
 * 4. In the function dropdown at the top, choose "setup", then click Run.
 *    (First run will ask you to authorize the script — approve it.)
 *    This creates the "Orders" sheet with the right column headers and
 *    stores your admin login + starting settings + product catalog.
 * 5. Deploy → New deployment → type "Web app".
 *      Execute as:      Me
 *      Who has access:  Anyone
 *    Click Deploy, authorize again if asked, and copy the Web App URL.
 * 6. Paste that URL into GOOGLE_SCRIPT_URL in script.js AND into
 *    ADMIN_API_URL in admin.js (both are the same URL).
 *
 * If you ever change the admin password later, just run setup() again
 * after updating DEFAULT_ADMIN_PASSWORD — it only overwrites the password
 * if you also bump ADMIN_CREDENTIAL_VERSION below by 1.
 * ==========================================================================
 */

const SHEET_NAME = "Orders";
const HEADERS = [
  "Timestamp", "Order ID", "Customer Name", "Phone", "Address", "Product",
  "Quantity", "Unit Price", "Subtotal", "Delivery", "Total", "Payment Method",
  "Advance Amount", "Remaining Amount", "bKash Sender Number",
  "bKash Transaction ID", "Payment Status", "Notes", "Order Status"
];

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "changeme123"; // <-- CHANGE THIS before running setup()
const ADMIN_CREDENTIAL_VERSION = 1;           // bump this + change password + re-run setup() to rotate

const SESSION_TTL_SECONDS = 6 * 60 * 60; // 6 hour admin session

const DEFAULT_SETTINGS = {
  storeName: "Pure Bliss",
  bkashNumber: "01876954397",
  deliveryCharge: 60,
  advancePercentage: 20,
  currency: "৳"
};

const DEFAULT_PRODUCTS = [
  { id: "saffron-glow", image: "https://www.argana.sk/cdn/shop/files/Safrnovemydlo3.jpg?v=1769622581&width=1445", name: "01 — Saffron Glow", hero: "Saffron Threads", desc: "Infused with botanical lipids to gently cleanse while supporting soft, radiant-feeling skin.", price: 550, oldPrice: 650, rating: "★ 4.9", stock: 50, active: true },
  { id: "rice-silk", image: "https://www.ohkala.com/cdn/shop/files/rice-soap-mockup.png?v=1766942332&width=1445", name: "02 — Rice Silk", hero: "Rice Bran Extract", desc: "A soothing bar that creates a silky lather to keep skin feeling calm, smooth, and supple.", price: 490, oldPrice: 590, rating: "★ 4.8", stock: 50, active: true },
  { id: "fruit-bloom", image: "https://hudsonvalleyskincare.com/cdn/shop/files/ZNLCreative_HV_03_6.jpg?v=1764950751&width=4000", name: "03 — Fruit Bloom", hero: "Botanical Fruit Blend", desc: "Enriched with plant antioxidants for a refreshing wash and clean sensory experience.", price: 520, oldPrice: 600, rating: "★ 4.7", stock: 50, active: true },
  { id: "honey-oat", image: "https://static.wixstatic.com/media/9deddb_78f84ab2e6c24730acf161cf16a8f26a~mv2.jpg/v1/fit/w_500%2Ch_500%2Cq_90/file.jpg", name: "04 — Honey Oat", hero: "Wild Honey & Oats", desc: "Combines gentle oat conditioning with honey humectants for dry, delicate skin routines.", price: 490, oldPrice: 580, rating: "★ 4.9", stock: 50, active: true },
  { id: "aloe-botanica", image: "https://static1.squarespace.com/static/5b7e8ed871069925a1a51d08/5e9ed618be60960cf66835c9/5f01da62b96a062512edb869/1760952738132/aloe-vera-soap-penlanlas-cymru.jpg?format=1500w", name: "05 — Aloe Botanica", hero: "Pure Aloe Vera", desc: "Cooling botanical cleansing bar formulated to soothe everyday moisture loss.", price: 490, oldPrice: 550, rating: "★ 4.8", stock: 50, active: true },
  { id: "rose-elixir", image: "https://seekbamboo.com/cdn/shop/files/rose-soap_13029652-1122-40ed-8e7d-9dcff0649020.webp?v=1778772292&width=2048", name: "06 — Rose Elixir", hero: "Rose Distillate", desc: "Delicately scented with natural rose water for a pampering, luxurious shower ritual.", price: 550, oldPrice: 650, rating: "★ 4.9", stock: 50, active: true }
];

/* ---------------- SETUP ---------------- */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }

  const props = PropertiesService.getScriptProperties();
  const storedVersion = parseInt(props.getProperty("ADMIN_CREDENTIAL_VERSION") || "0", 10);
  if (storedVersion < ADMIN_CREDENTIAL_VERSION) {
    props.setProperty("ADMIN_USERNAME", DEFAULT_ADMIN_USERNAME);
    props.setProperty("ADMIN_PASSWORD_HASH", hashPassword(DEFAULT_ADMIN_PASSWORD));
    props.setProperty("ADMIN_CREDENTIAL_VERSION", String(ADMIN_CREDENTIAL_VERSION));
  }
  if (!props.getProperty("STORE_SETTINGS")) {
    props.setProperty("STORE_SETTINGS", JSON.stringify(DEFAULT_SETTINGS));
  }
  if (!props.getProperty("PRODUCTS_JSON")) {
    props.setProperty("PRODUCTS_JSON", JSON.stringify(DEFAULT_PRODUCTS));
  }
  Logger.log("Setup complete. Admin username: " + props.getProperty("ADMIN_USERNAME"));
}

function hashPassword(pw) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw, Utilities.Charset.UTF_8);
  return digest.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, "0")).join("");
}

/* ---------------- HTTP ENTRY POINTS ---------------- */

function doGet(e) {
  const action = (e.parameter.action || "").trim();
  try {
    if (action === "getPublicSettings") return json(getPublicSettings());
    if (action === "getProducts") return json(getProducts());
    if (action === "listOrders") return json(withAuth(e.parameter.token, listOrders));
    if (action === "getSettings") return json(withAuth(e.parameter.token, getSettings));
    return json({ success: false, error: "Unknown action" });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { /* ignore */ }
  const action = body.action || "createOrder"; // no action = legacy order submit, stays backward compatible
  try {
    if (action === "createOrder") return json(createOrder(body));
    if (action === "login") return json(login(body.username, body.password));
    if (action === "updateOrder") return json(withAuth(body.token, () => updateOrder(body)));
    if (action === "updateSettings") return json(withAuth(body.token, () => updateSettings(body.settings)));
    if (action === "updateProducts") return json(withAuth(body.token, () => updateProducts(body.products)));
    return json({ success: false, error: "Unknown action" });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

/* ---------------- ORDERS ---------------- */

function createOrder(data) {
  const sheet = getSheet();
  sheet.appendRow([
    new Date(), data.orderId || "", data.name || "", data.phone || "", data.address || "",
    data.product || "", data.quantity || 0, data.unitPrice || 0, data.subtotal || 0,
    data.delivery || 0, data.total || 0, data.payment || "", data.advanceAmount || 0,
    data.remainingAmount || 0, data.bkashSender || "", data.bkashTransactionId || "",
    data.paymentStatus || "", data.notes || "", data.status || "New"
  ]);
  return { success: true, orderId: data.orderId };
}

function listOrders() {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const orders = values.map(row => {
    const o = {};
    headers.forEach((h, i) => { o[h] = row[i] instanceof Date ? row[i].toISOString() : row[i]; });
    return o;
  }).reverse();
  return { success: true, orders: orders };
}

function updateOrder(body) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf("Order ID");
  const statusCol = headers.indexOf("Order Status");
  const payStatusCol = headers.indexOf("Payment Status");
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(body.orderId)) {
      if (body.status) sheet.getRange(r + 1, statusCol + 1).setValue(body.status);
      if (body.paymentStatus) sheet.getRange(r + 1, payStatusCol + 1).setValue(body.paymentStatus);
      return { success: true };
    }
  }
  return { success: false, error: "Order not found" };
}

/* ---------------- AUTH ---------------- */

function login(username, password) {
  const props = PropertiesService.getScriptProperties();
  const validUser = props.getProperty("ADMIN_USERNAME");
  const validHash = props.getProperty("ADMIN_PASSWORD_HASH");
  if (!username || !password || username !== validUser || hashPassword(password) !== validHash) {
    return { success: false, error: "Invalid username or password" };
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put("session_" + token, username, SESSION_TTL_SECONDS);
  return { success: true, token: token, username: username };
}

function withAuth(token, fn) {
  const cache = CacheService.getScriptCache();
  const user = token && cache.get("session_" + token);
  if (!user) return { success: false, error: "Session expired. Please log in again.", authError: true };
  return fn();
}

/* ---------------- SETTINGS ---------------- */

function getPublicSettings() {
  const s = JSON.parse(PropertiesService.getScriptProperties().getProperty("STORE_SETTINGS") || "{}");
  return { success: true, settings: { bkashNumber: s.bkashNumber, deliveryCharge: s.deliveryCharge, advancePercentage: s.advancePercentage, currency: s.currency } };
}

function getSettings() {
  return { success: true, settings: JSON.parse(PropertiesService.getScriptProperties().getProperty("STORE_SETTINGS") || "{}") };
}

function updateSettings(settings) {
  const props = PropertiesService.getScriptProperties();
  const merged = Object.assign(JSON.parse(props.getProperty("STORE_SETTINGS") || "{}"), settings || {});
  props.setProperty("STORE_SETTINGS", JSON.stringify(merged));
  return { success: true, settings: merged };
}

/* ---------------- PRODUCTS ---------------- */

function getProducts() {
  return { success: true, products: JSON.parse(PropertiesService.getScriptProperties().getProperty("PRODUCTS_JSON") || "[]") };
}

function updateProducts(products) {
  PropertiesService.getScriptProperties().setProperty("PRODUCTS_JSON", JSON.stringify(products || []));
  return { success: true };
}
