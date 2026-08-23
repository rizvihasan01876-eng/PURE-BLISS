/* ==========================================================================
   PURE BLISS — E-COMMERCE LOGIC & DYNAMIC BINDINGS
   ========================================================================== */

// Editable Product Catalog Data Placeholder (fallback used if the backend isn't reachable)
let products = [
  {
    id: "saffron-glow",
    image: "https://www.argana.sk/cdn/shop/files/Safrnovemydlo3.jpg?v=1769622581&width=1445",
    name: "01 — Saffron Glow",
    hero: "Saffron Threads",
    desc: "Infused with botanical lipids to gently cleanse while supporting soft, radiant-feeling skin.",
    price: 550,
    oldPrice: 650,
    rating: "★ 4.9"
  },
  {
    id: "rice-silk",
    image: "https://www.ohkala.com/cdn/shop/files/rice-soap-mockup.png?v=1766942332&width=1445",
    name: "02 — Rice Silk",
    hero: "Rice Bran Extract",
    desc: "A soothing bar that creates a silky lather to keep skin feeling calm, smooth, and supple.",
    price: 490,
    oldPrice: 590,
    rating: "★ 4.8"
  },
  {
    id: "fruit-bloom",
    image: "https://hudsonvalleyskincare.com/cdn/shop/files/ZNLCreative_HV_03_6.jpg?v=1764950751&width=4000",
    name: "03 — Fruit Bloom",
    hero: "Botanical Fruit Blend",
    desc: "Enriched with plant antioxidants for a refreshing wash and clean sensory experience.",
    price: 520,
    oldPrice: 600,
    rating: "★ 4.7"
  },
  {
    id: "honey-oat",
    image: "https://static.wixstatic.com/media/9deddb_78f84ab2e6c24730acf161cf16a8f26a~mv2.jpg/v1/fit/w_500%2Ch_500%2Cq_90/file.jpg",
    name: "04 — Honey Oat",
    hero: "Wild Honey & Oats",
    desc: "Combines gentle oat conditioning with honey humectants for dry, delicate skin routines.",
    price: 490,
    oldPrice: 580,
    rating: "★ 4.9"
  },
  {
    id: "aloe-botanica",
    image: "https://static1.squarespace.com/static/5b7e8ed871069925a1a51d08/5e9ed618be60960cf66835c9/5f01da62b96a062512edb869/1760952738132/aloe-vera-soap-penlanlas-cymru.jpg?format=1500w",
    name: "05 — Aloe Botanica",
    hero: "Pure Aloe Vera",
    desc: "Cooling botanical cleansing bar formulated to soothe everyday moisture loss.",
    price: 490,
    oldPrice: 550,
    rating: "★ 4.8"
  },
  {
    id: "rose-elixir",
    image: "https://seekbamboo.com/cdn/shop/files/rose-soap_13029652-1122-40ed-8e7d-9dcff0649020.webp?v=1778772292&width=2048",
    name: "06 — Rose Elixir",
    hero: "Rose Distillate",
    desc: "Delicately scented with natural rose water for a pampering, luxurious shower ritual.",
    price: 550,
    oldPrice: 650,
    rating: "★ 4.9"
  }
];

const DELIVERY_CHARGE_DEFAULT = 60;
let DELIVERY_CHARGE = DELIVERY_CHARGE_DEFAULT;

/* ---- Payment configuration (defaults; overridden live from Settings if backend is reachable) ---- */
let ADVANCE_PERCENTAGE = 20;          // % of order total required as bKash advance
let BKASH_NUMBER = "01876954397";     // bKash Personal/Merchant number customers send advance to

// Dynamic Product Catalog Render
document.addEventListener("DOMContentLoaded", async () => {
  renderCollection();
  updateCalculations();
  if (document.querySelector('input[name="paymentMethod"]')) {
    handlePaymentMethodChange();
  }
  await loadRemoteConfig();
});

// Pull live settings/products from the Apps Script backend (same URL as GOOGLE_SCRIPT_URL below).
// If the backend isn't reachable or not yet deployed, the site keeps working with the defaults above.
async function loadRemoteConfig() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) return;
  try {
    const [settingsRes, productsRes] = await Promise.all([
      fetch(`${GOOGLE_SCRIPT_URL}?action=getPublicSettings`).then(r => r.json()).catch(() => null),
      fetch(`${GOOGLE_SCRIPT_URL}?action=getProducts`).then(r => r.json()).catch(() => null)
    ]);

    if (settingsRes && settingsRes.success && settingsRes.settings) {
      const s = settingsRes.settings;
      if (s.deliveryCharge != null) DELIVERY_CHARGE = Number(s.deliveryCharge);
      if (s.advancePercentage != null) ADVANCE_PERCENTAGE = Number(s.advancePercentage);
      if (s.bkashNumber) {
        BKASH_NUMBER = s.bkashNumber;
        const el = document.getElementById("bkashNumberDisplay");
        if (el) el.textContent = BKASH_NUMBER;
      }
    }

    if (productsRes && productsRes.success && Array.isArray(productsRes.products) && productsRes.products.length) {
      products = productsRes.products.filter(p => p.active !== false);
      rebuildProductIndexes();
      renderCollection();
    }

    updateCalculations();
  } catch (err) {
    console.warn("Live config unavailable, using site defaults:", err);
  }
}

function renderCollection() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  grid.innerHTML = products.map(prod => `
    <div class="product-card">
      <div class="product-img-wrap">
        <div class="product-photo-frame">
          <img class="product-photo" src="${prod.image}" alt="${prod.name} natural soap" loading="lazy" referrerpolicy="no-referrer">
        </div>
      </div>
      <div class="product-details">
        <span class="hero-ing">${prod.hero}</span>
        <h3>${prod.name}</h3>
        <p>${prod.desc}</p>
        <div class="product-price">
          ৳${prod.price} <del>৳${prod.oldPrice}</del>
        </div>
        <button class="btn btn-primary btn-full" onclick="selectProductAndScroll('${prod.name}', ${prod.price})">Order Now</button>
      </div>
    </div>
  `).join('');
}

let productImageMap = Object.fromEntries(products.map(p => [p.name.replace(/^\d+ — /, ""), p.image]));
let bundleImages = {
  "Duo Bundle (2 Soaps)": [products[0].image, products[1].image],
  "Trio Bundle (3 Soaps)": [products[0].image, products[1].image, products[2].image],
  "Full Collection (6 Soaps)": products.map(p => p.image)
};

function rebuildProductIndexes() {
  productImageMap = Object.fromEntries(products.map(p => [p.name.replace(/^\d+ — /, ""), p.image]));
  bundleImages = {
    "Duo Bundle (2 Soaps)": [products[0].image, products[1].image],
    "Trio Bundle (3 Soaps)": [products[0].image, products[1].image, products[2].image],
    "Full Collection (6 Soaps)": products.map(p => p.image)
  };
}

function updateSelectedProductPreview() {
  const select = document.getElementById("productSelect");
  const preview = document.getElementById("selectedProductPreview");
  const image = document.getElementById("selectedProductImage");
  const name = document.getElementById("selectedProductName");
  const price = document.getElementById("selectedProductPrice");
  if (!select || !preview || !image || !name || !price) return;

  const [rawName, unitPrice] = select.value.split('|');
  const cleanName = rawName.replace(/^\d+ — /, "");
  name.textContent = cleanName;
  price.textContent = `৳${unitPrice}`;

  const bundle = bundleImages[cleanName];
  if (bundle) {
    preview.classList.add("bundle-preview");
    image.src = bundle[0];
    image.alt = cleanName;
    preview.dataset.bundleCount = bundle.length;
  } else {
    preview.classList.remove("bundle-preview");
    image.src = productImageMap[cleanName] || "";
    image.alt = `${cleanName} soap`;
    preview.dataset.bundleCount = "1";
  }
  preview.classList.add("is-visible");
}

// Order calculations logic
function updateCalculations() {
  const select = document.getElementById("productSelect");
  const qtyInput = document.getElementById("quantity");
  if (!select || !qtyInput) return;

  const [_, unitPrice] = select.value.split('|');
  const qty = parseInt(qtyInput.value) || 1;

  const subtotal = parseInt(unitPrice) * qty;
  const total = subtotal + DELIVERY_CHARGE;
  const advance = Math.round(total * (ADVANCE_PERCENTAGE / 100));
  const remaining = total - advance;

  document.getElementById("subtotal").innerText = `৳${subtotal}`;
  document.getElementById("total").innerText = `৳${total}`;

  const bkashAmountEl = document.getElementById("bkashAdvanceAmount");
  if (bkashAmountEl) bkashAmountEl.innerText = `৳${advance}`;

  const summaryAdvanceEl = document.getElementById("summaryAdvance");
  const summaryRemainingEl = document.getElementById("summaryRemaining");
  if (summaryAdvanceEl) summaryAdvanceEl.innerText = `৳${advance}`;
  if (summaryRemainingEl) summaryRemainingEl.innerText = `৳${remaining}`;

  updateSelectedProductPreview();
}

// Payment method logic
function getSelectedPaymentMethod() {
  const checked = document.querySelector('input[name="paymentMethod"]:checked');
  return checked ? checked.value : "COD";
}

function handlePaymentMethodChange() {
  const method = getSelectedPaymentMethod();
  const panel = document.getElementById("bkashPanel");
  const advanceLines = document.getElementById("advanceSummaryLines");
  const methodLabel = document.getElementById("paymentMethodLabel");
  const submitBtn = document.getElementById("submitOrderBtn");
  const bkashError = document.getElementById("bkashError");

  const isBkash = method === "BKASH";

  if (panel) {
    panel.classList.toggle("is-open", isBkash);
    panel.setAttribute("aria-hidden", isBkash ? "false" : "true");
  }
  if (advanceLines) {
    advanceLines.classList.toggle("show", isBkash);
    advanceLines.setAttribute("aria-hidden", isBkash ? "false" : "true");
  }
  if (methodLabel) {
    methodLabel.textContent = isBkash ? "Payment: bKash Advance Payment" : "Payment: Cash on Delivery";
  }
  if (submitBtn) {
    submitBtn.textContent = isBkash ? "Confirm bKash Advance Order" : "Complete Cash on Delivery Order";
  }
  if (!isBkash && bkashError) {
    bkashError.classList.remove("show");
    bkashError.textContent = "";
  }

  updateCalculations();
}

// Select helpers
function selectProductAndScroll(name, price) {
  const select = document.getElementById("productSelect");
  if (!select) return;

  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i].text.includes(name)) {
      select.selectedIndex = i;
      break;
    }
  }
  updateCalculations();
  document.getElementById("order").scrollIntoView({ behavior: 'smooth' });
}

function selectBundle(bundleName, price) {
  selectProductAndScroll(bundleName, price);
}

// WhatsApp Order Integration
function sendWhatsAppOrder() {
  const name = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const select = document.getElementById("productSelect");
  const qty = document.getElementById("quantity").value;
  const notes = document.getElementById("notes").value.trim();

  if (!name || !phone || !address) {
    alert("Please fill in your Name, Phone Number, and Address before ordering via WhatsApp.");
    return;
  }

  const productName = select.options[select.selectedIndex].text;
  const total = document.getElementById("total").innerText;
  const method = getSelectedPaymentMethod();
  const isBkash = method === "BKASH";

  let paymentBlock = `*Payment Method:* Cash on Delivery`;
  if (isBkash) {
    const advance = document.getElementById("summaryAdvance").innerText;
    const remaining = document.getElementById("summaryRemaining").innerText;
    paymentBlock = `*Payment Method:* bKash Advance Payment\n` +
      `*Advance Payment:* ${advance}\n` +
      `*Remaining on Delivery:* ${remaining}`;
  }

  const text = `*NEW ORDER — PURE BLISS PREMIUM SOAPS*\n\n` +
    `*Customer Name:* ${name}\n` +
    `*Phone:* ${phone}\n` +
    `*Address:* ${address}\n\n` +
    `*Product Selection:* ${productName}\n` +
    `*Quantity:* ${qty}\n` +
    `*Total Amount (with Delivery):* ${total}\n` +
    (notes ? `*Notes:* ${notes}\n` : '') +
    `\n${paymentBlock}`;

  const encodedText = encodeURIComponent(text);
  window.open(`https://wa.me/8801876954397?text=${encodedText}`, '_blank');
}

// Unified Google Apps Script backend (order intake + admin API) — see pure-bliss-backend.gs
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxhRhUS0lHYHXkRmNpkpAZzI8O4brL6u2GITa2u8TKcEe95Gcq8UIMw9V4JDDEjEgj6Cw/exec";

async function handleOrderSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const select = document.getElementById("productSelect");
  const qty = parseInt(document.getElementById("quantity").value, 10) || 1;
  const notes = document.getElementById("notes").value.trim();

  if (!name || !phone || !address) {
    alert("Please fill in your Name, Phone Number, and Address.");
    return;
  }

  const paymentMethod = getSelectedPaymentMethod();
  const isBkash = paymentMethod === "BKASH";
  const bkashError = document.getElementById("bkashError");
  const bkashSender = document.getElementById("bkashSender") ? document.getElementById("bkashSender").value.trim() : "";
  const bkashTxnId = document.getElementById("bkashTxnId") ? document.getElementById("bkashTxnId").value.trim() : "";

  if (isBkash && (!bkashSender || !bkashTxnId)) {
    if (bkashError) {
      bkashError.textContent = "Please enter your bKash sender number and transaction ID to continue.";
      bkashError.classList.add("show");
      bkashError.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }
  if (bkashError) {
    bkashError.classList.remove("show");
    bkashError.textContent = "";
  }

  const [productName, unitPriceRaw] = select.value.split("|");
  const unitPrice = parseInt(unitPriceRaw, 10) || 0;
  const subtotal = unitPrice * qty;
  const total = subtotal + DELIVERY_CHARGE;
  const advanceAmount = isBkash ? Math.round(total * (ADVANCE_PERCENTAGE / 100)) : 0;
  const remainingAmount = isBkash ? total - advanceAmount : total;
  const orderId = "PB-" + Date.now().toString().slice(-8);
  const paymentStatus = isBkash ? "Advance Submitted" : "COD";

  const orderData = {
    orderId: orderId,
    name: name,
    phone: phone,
    address: address,
    product: productName,
    quantity: qty,
    unitPrice: unitPrice,
    subtotal: subtotal,
    delivery: DELIVERY_CHARGE,
    total: total,
    payment: isBkash ? "bKash Advance Payment" : "Cash on Delivery",
    advanceAmount: advanceAmount,
    remainingAmount: remainingAmount,
    bkashSender: isBkash ? bkashSender : "",
    bkashTransactionId: isBkash ? bkashTxnId : "",
    paymentStatus: paymentStatus,
    notes: notes,
    status: "New"
  };

  const submitButton = document.querySelector('#checkoutForm button[type="submit"]');
  const originalText = submitButton ? submitButton.textContent : "";

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Submitting Order...";
  }

  try {
    // Apps Script accepts this as a simple POST request without CORS preflight.
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(orderData)
    });

    const loading = document.getElementById("orderLoading");
    if (loading) {
      loading.classList.add("show");
      loading.setAttribute("aria-hidden", "false");
    }

    setTimeout(() => {
      let successUrl =
        "order-success.html?order=" + encodeURIComponent(orderId) +
        "&total=" + encodeURIComponent(total) +
        "&payment=" + encodeURIComponent(orderData.payment);
      if (isBkash) {
        successUrl += "&advance=" + encodeURIComponent(advanceAmount) +
          "&remaining=" + encodeURIComponent(remainingAmount);
      }
      window.location.href = successUrl;
    }, 1100);

  } catch (error) {
    console.error("Google Sheets order submission failed:", error);
    alert("We could not submit the order right now. Please try again or order via WhatsApp.");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }
}
