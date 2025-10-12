
'use strict';              // optional but recommended


// ---- Globals ----
let qlvimData = [];
let swayBarIssue = null;   // null = unanswered, true = issue, false = compliant
let shackleIssue = null; // null = unanswered, true = issue, false = compliant

// ---- QLVIM text fallback + synonyms ----
let qlvimText = [];
// ---- Mod code maps (loaded from JSON) ----
window.modLight = {};           // e.g. { LA1: "Equivalent engine installation", ... }
window.modHeavy = {};           // e.g. { A1: "Engine substitution", ... }
window.modCodeDescriptions = {}; // merged { code: title }
function normCode(x){ return String(x||"").toUpperCase().trim(); }

const synonyms = {
  "ride height": ["ground clearance", "suspension height"],
  "ground clearance": ["ride height"],
  "bullbar": ["nudge bar", "roo bar"],
  "tyre": ["tire", "tyres", "tires"],
  "seatbelt": ["safety belt", "seat belt"],
  "lift kit": ["raised suspension", "suspension lift"],
  "snorkel": ["air intake snorkel"],
  "winch": ["front winch", "electric winch"]
};

function expandTerms(term) {
  const t = term.toLowerCase().trim();
  const extra = synonyms[t] || [];
  return [t, ...extra.map(x => x.toLowerCase())];
}

// Highlight a short snippet around the hit
function getSnippet(fullText, terms, radius = 140) {
  const hay = fullText.toLowerCase();
  let hit = -1;
  for (const t of terms) { const i = hay.indexOf(t); if (i !== -1) { hit = i; break; } }
  const start = Math.max(0, (hit === -1 ? 0 : hit - Math.floor(radius / 2)));
  const slice = fullText.slice(start, start + radius);
  const pattern = new RegExp(`(${terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join("|")})`, "gi");
  return "…" + slice.replace(pattern, "<mark>$1</mark>") + "…";
}

/* ---------------- Tabs ---------------- */
function openTab(evt, tabName) {
    // If user manually changes tab, clear the saved lastTab
  localStorage.removeItem("lastTab");

  const contents = document.getElementsByClassName("tab-content");
  for (let i = 0; i < contents.length; i++) contents[i].classList.remove("active");

  const links = document.getElementsByClassName("tablink");
  for (let i = 0; i < links.length; i++) links[i].classList.remove("active");

  const tab = document.getElementById(tabName);
  if (tab) tab.classList.add("active");

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add("active");
  } else {
    const btn = Array.from(document.getElementsByClassName("tablink"))
      .find(b => (b.getAttribute("onclick") || "").includes("'" + tabName + "'"));
    if (btn) btn.classList.add("active");
  }
}

function showModDescriptions() {
  const input = document.getElementById("modCodes").value;
  const codes = input.split(",").map(s => normCode(s)).filter(Boolean);
  let html = "";

  if (!codes.length) {
    html = "Please enter at least one mod code.";
  } else {
    html = "<ul>";
    for (const code of codes) {
      const isHeavy = !!window.modHeavy[code];
      const title   = window.modCodeDescriptions[code];
      if (title) {
        if (isHeavy) {
          html += `<li><span style="color:red;"><strong>${code}</strong>: ${title} – Heavy vehicle mod code fitted</span></li>`;
        } else {
          html += `<li><strong>${code}</strong>: ${title}</li>`;
        }
      } else {
        html += `<li><strong>${code}</strong>: <span style="color:red;">Unknown code</span></li>`;
      }
    }
    html += "</ul>";
  }
  document.getElementById("modDescriptions").innerHTML = html;
}

// ----------------- QLVIM Helpers -----------------

// Try to pull a section ref like s18.5.1(a)(i) or "18 5.1"
function extractSectionRef(text) {
  const s = String(text || "");
  // matches: 6.17(a), 18 5.1, s18.5.1(a)(i)
  const re = /\b(?:s(?:ection)?\s*)?(\d{1,2}(?:[\s.]+\d+)+(?:\([a-z]\))*(?:\([ivx]+\))?)\b/i;
  const m = s.match(re);
  if (!m) return null;
  // turn spaces into dots and normalise multiple dots
  let token = m[1].replace(/(\d)\s+(?=\d)/g, "$1.").replace(/\.+/g, ".");
  return `s${token}`;
}
// Get a readable one-line snippet around the first matching term
function getSnippet(fullText, needles) {
  const text = String(fullText || "");
  const lower = text.toLowerCase();
  const term = needles.find(n => lower.includes(n)) || "";
  if (!term) return text.slice(0, 160).trim();

  const idx = lower.indexOf(term);
  const lb = text.lastIndexOf("\n", idx);
  const la = text.indexOf("\n", idx + term.length);
  if (lb >= 0 && la > lb) {
    return text.slice(lb + 1, la).trim();
  }
  const start = Math.max(0, idx - 60);
  const end   = Math.min(text.length, idx + term.length + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
// Same card UI as mapped results
function renderResultCard(item, out, idx = 0) {
  // item: { category, clause, page, linkText, linkHref, dataSection }
  const noteId = `note-${Date.now()}-${idx}`;
  const wrap = document.createElement("div");
  wrap.className = "result-item";
  wrap.innerHTML = `
    <div>
      <strong><span class="category-pill">${(item.category || "Uncategorized")}</span></strong>
      – ${item.clause}
      – ensure vehicle complies with
      <strong><a class="qlvim-link" href="${item.linkHref}" target="_blank" rel="noopener">${item.linkText}</a></strong>
      of QLVIM.
    </div>
    <div class="result-note"><em>Note:</em> <input id="${noteId}" class="note-input" type="text" placeholder="optional note"></div>
    <div class="result-actions">
      <button type="button" class="action result-add-btn"
        data-category="${(item.category || "Uncategorized").replace(/"/g,'&quot;')}"
        data-sec="${(item.dataSection || "").replace(/"/g,'&quot;')}"
        data-clause="${(item.clause || "").replace(/"/g,'&quot;')}"
        data-page="${item.page}"
        data-note-id="${noteId}"
      >Add to Results</button>
    </div>
  `;
  out.appendChild(wrap);
}


// Add the fallback item into the Results tab and flip the button state
function addFallbackToResults(page, sectionRef, btnEl) {
  const sec = sectionRef || "Manual (text search)";
  const clause = "—"; // no clause for fallback
  const noteId = `note-fallback-${page}`;

  // Use your existing pipeline
  addToResults("Unmapped", sec, clause, page, noteId);

  // Update button look
  if (btnEl) {
    btnEl.textContent = "Added in results";
    btnEl.style.backgroundColor = "red";
    btnEl.style.color = "white";
    btnEl.disabled = true; // optional, can remove if you want repeatable adds
  }
}
function fallbackQLVIMTextSearch(rawTerm) {
  if (!qlvimText?.length) return false;

  // STEP 1: expand + normalize the query
const q = (rawTerm || "").trim();
if (!q) return false;

const expanded = Array.from(new Set(expandTerms(q)));   // uses your synonyms()
const needles  = expanded.map(s => s.toLowerCase());


  
  // ✅ Get all matching pages, not just the first
  const pageHits = qlvimText.filter(p =>
  needles.some(n => p.text?.toLowerCase().includes(n))
);


  if (!pageHits.length) return false;

  const resultsEl = document.getElementById("searchResults");
  if (!resultsEl) return false;

  pageHits.forEach(pageHit => {
   const snippet = getSnippet(pageHit.text, needles);
    const link = qlvimLink(pageHit.page);
    const sectionRef = extractSectionRef(pageHit.text);
// Make Info Sheets look the same too
const isInfo = /information sheet/i.test((pageHit.title || pageHit.Heading || "") + " " + pageHit.text);
const category = isInfo ? "Information Sheets" : "Uncategorized";

let secRef = sectionRef;
// Optional page→section fallback (only if you added sectionFromPage):
// if (!secRef && !isInfo && typeof sectionFromPage === "function") {
//   secRef = sectionFromPage(pageHit.page); // e.g. "s18.5"
// }

const linkHref = link; // already built above
const linkText = isInfo
  ? `[${(pageHit.title || pageHit.Heading || "Information Sheet")} (p.${pageHit.page})]`
  : (secRef ? `[${secRef}]` : `[open manual page ${pageHit.page}]`);

renderResultCard({
  category,
  clause: snippet,
  page: pageHit.page,
  linkText,
  linkHref,
  dataSection: isInfo ? (pageHit.section || pageHit.Section || "") : (secRef || "")
}, resultsEl);

  });

  return true;
}

function clearModCodes() {
  const input = document.getElementById("modCodes");
  const out = document.getElementById("modDescriptions");
  if (input) input.value = "";
  if (out) out.innerHTML = "";
  input?.focus();
}

let measureTyreInMM = true;
function toggleTyreUnitsMeasure() {
  const width = parseFloat(document.getElementById("m_tyreWidth").value);
  const aspect = parseFloat(document.getElementById("m_tyreAspect").value);
  const rim = parseFloat(document.getElementById("m_tyreRim").value);
  const tyreLabel = document.getElementById("m_tyreUnitLabel");
  if (isNaN(width) || isNaN(aspect) || isNaN(rim)) { tyreLabel.innerText = "Enter full size first"; return; }
  if (measureTyreInMM) {
    const widthIn = (width / 25.4).toFixed(2);
    const sidewallIn = (width * aspect / 100 / 25.4);
    const overallDia = (2 * sidewallIn + rim).toFixed(0);
    tyreLabel.innerText = `${overallDia}x${widthIn}R${rim}`;
  } else {
    tyreLabel.innerText = `${width}/${aspect}R${rim}`;
  }
  measureTyreInMM = !measureTyreInMM;
}
// ===== Tyre parsing helpers (START) =====
// Returns { ok, type, width_mm, aspect, rim_in, overall_mm, normalized, reason }
// Returns { ok, type, width_mm, aspect, rim_in, overall_mm, normalized, reason }
function parseTyreSize(sizeStr) {
  if (!sizeStr) return { ok: false, reason: "empty" };
  // normalise: uppercase, remove spaces
  const s0 = sizeStr.trim().toUpperCase();
  const s  = s0.replace(/\s+/g, "");

  // 1) Modern metric with ratio: 265/75R16
  let m = s.match(/^(\d{3})\/(\d{2,3})R?(\d{2}(?:\.\d+)?)$/);
  if (m) {
    const width = parseFloat(m[1]);
    const aspect = parseFloat(m[2]);
    const rimIn = parseFloat(m[3]);
    const overall = 2 * (width * aspect / 100) + rimIn * 25.4;
    return { ok: true, type: "metric", width_mm: width, aspect, rim_in: rimIn,
             overall_mm: overall, normalized: `${width}/${aspect}R${rimIn}` };
  }

  // 2) Early metric without ratio: 205R16  → assume 82%
  m = s.match(/^(\d{3})R(\d{2})$/);
  if (m) {
    const width = parseFloat(m[1]);
    const rimIn = parseFloat(m[2]);
    const aspect = 82;
    const overall = 2 * (width * aspect / 100) + rimIn * 25.4;
    return { ok: true, type: "metric82", width_mm: width, aspect, rim_in: rimIn,
         overall_mm: overall, normalized: `${width}/${aspect}R${rimIn}`, assumed82: true };

  }

  // 3) Flotation (x): 31x10.5R15  → first number is OD (inches)
  m = s.match(/^(\d{2}(?:\.\d+)?)X(\d{1,2}(?:\.\d+)?)R?(\d{2})$/);
  if (m) {
    const odIn = parseFloat(m[1]);
    const secIn = parseFloat(m[2]);
    const rimIn = parseFloat(m[3]);
    const overall = odIn * 25.4;
    const secMm = secIn * 25.4;
    return { ok: true, type: "flotation", width_mm: secMm, aspect: null, rim_in: rimIn,
             overall_mm: overall, normalized: `${odIn}x${secIn}R${rimIn}`.replace(/\.0\b/g,"") };
  }

  // 4) Flotation (/): 33/12.5R16  → first number is OD (inches)
  m = s.match(/^(\d{2}(?:\.\d+)?)\/(\d{1,2}(?:\.\d+)?)R?(\d{2})$/);
  if (m) {
    const odIn = parseFloat(m[1]);
    const secIn = parseFloat(m[2]);
    const rimIn = parseFloat(m[3]);
    const overall = odIn * 25.4;
    const secMm = secIn * 25.4;
    return { ok: true, type: "flotation", width_mm: secMm, aspect: null, rim_in: rimIn,
             overall_mm: overall, normalized: `${odIn}/${secIn}R${rimIn}`.replace(/\.0\b/g,"") };
  }

  // 5) Old inch sizes: 7.50-16, 7.50R16, 6.00-16 → assume 100% profile
  m = s.match(/^(\d{1,2}(?:\.\d{1,2})?)[\-]?R?(\d{2})$/);
  if (m) {
    const widthIn = parseFloat(m[1]);
    const rimIn   = parseFloat(m[2]);
    if (widthIn > 0 && widthIn < 16) {
      const overall = rimIn * 25.4 + 2 * (widthIn * 25.4);
      return { ok: true, type: "inch100", width_mm: widthIn * 25.4, aspect: 100, rim_in: rimIn,
         overall_mm: overall, normalized: `${widthIn}R${rimIn}`.replace(/\.0\b/g,""), assumed100: true };

    }
  }

  return { ok: false, reason: "unrecognized format" };
}

// Live preview for measured tyre input
function updateMeasuredTyrePreview() {
  const s = document.getElementById("m_tyreSize")?.value || "";
  const out = document.getElementById("m_tyreParsed");
  if (!out) return;
  const p = parseTyreSize(s);
  if (!p.ok) {
    out.className = "result";
    out.innerText = s ? "Unrecognized tyre format." : "";
    return;
  }
  out.className = "result ok";
  out.innerText = `${p.normalized}  →  approx. ${p.overall_mm.toFixed(0)} mm overall diameter`;
}

// Attach the input handler NOW (script is at end of <body>, so elements exist)
(function initMeasuredTyreInput(){
  const inp = document.getElementById("m_tyreSize");
  if (inp) inp.addEventListener("input", updateMeasuredTyrePreview);
})();
// ===== Tyre parsing helpers (END) =====

/* ---------------- Save Vehicle Details ---------------- */
function saveVehicleDetails() {
  // Basic details
  const rego     = document.getElementById("rego").value.trim();
  const make     = document.getElementById("make").value.trim();
  const model    = document.getElementById("model").value.trim();
  const year     = document.getElementById("year").value.trim();
  const approval = document.getElementById("approval").value.trim();

  // Suspension & Track (for Home summary only)
  const suspensionFront = document.getElementById("suspensionFront").value.trim();
  const suspensionRear  = document.getElementById("suspensionRear").value.trim();
  const trackFront      = document.getElementById("trackFront").value.trim();
  const trackRear       = document.getElementById("trackRear").value.trim();

  // Tyres (for Home summary only)
let tyrePlacard = "-";
if (window._largestStockTyre) {
  tyrePlacard = `${window._largestStockTyre.label} (OD ~${window._largestStockTyre.odMm} mm)`;
}

  // Mod codes
  const modCodesRaw = (document.getElementById("modCodes")?.value || "").trim();
  const modCodes = modCodesRaw
    ? modCodesRaw.split(",").map(c => c.trim().toUpperCase()).filter(Boolean)
    : [];

  
  // Mod codes block (light + heavy visual)
const modCodesSection = `
  <h4 style="color:blue;">Engineering Mod Codes</h4>
  ${
    modCodes.length
      ? `<ul>${
          modCodes.map(code => {
            const c = code.trim().toUpperCase();
            const isHeavy = !!window.modHeavy?.[c];
            const title = window.modCodeDescriptions?.[c];
            if (title) {
              if (isHeavy) {
                return `<li><span style="color:red;"><strong>${c}</strong>: ${title} – Heavy vehicle mod code fitted</span></li>`;
              } else {
                return `<li><strong>${c}</strong>: ${title}</li>`;
              }
            } else {
              return `<li><strong>${c}</strong>: <span style="color:red;">Unknown code</span></li>`;
            }
          }).join("")
        }</ul>`
      : `<p><em>No Codes Found</em></p>`
  }
`;


  const now = new Date();

  // ---------------- Home tab (full) ----------------
  const fullOutput = `
    <h3>Vehicle Summary</h3>
    <p><strong>Registration:</strong> ${rego}</p>
    <p><strong>Make:</strong> ${make}</p>
    <p><strong>Model:</strong> ${model}</p>
    <p><strong>Year:</strong> ${year}</p>
    <p><strong>Approval Number:</strong> ${approval}</p>

    ${modCodesSection}

    <h4 style="color:blue;">Suspension</h4>
    <p><strong>Front:</strong> ${suspensionFront || "-"} mm</p>
    <p><strong>Rear:</strong> ${suspensionRear || "-"} mm</p>
    <p><strong>Track Front:</strong> ${trackFront || "-"} mm</p>
    <p><strong>Track Rear:</strong> ${trackRear || "-"} mm</p>

    <h4 style="color:blue;">Tyre Placard</h4>
    <p>${tyrePlacard}</p>

    <p><strong>Saved:</strong> ${now.toLocaleString()}</p>
  `;
  document.getElementById("vehicleSummary").innerHTML = fullOutput;

  // ---------------- Results tab (trimmed) ----------------
  const trimmedOutput = `
    <h3>Vehicle Summary</h3>
    <p><strong>Registration:</strong> ${rego}</p>
    <p><strong>Make:</strong> ${make}</p>
    <p><strong>Model:</strong> ${model}</p>
    <p><strong>Year:</strong> ${year}</p>
    <p><strong>Approval Number:</strong> ${approval}</p>

    ${modCodesSection}

    <p><strong>Saved:</strong> ${now.toLocaleString()}</p>
  `;
  const resSum = document.getElementById("resultsVehicleSummary");
  if (resSum) resSum.innerHTML = trimmedOutput;
}
// ---------------- Lift comparison helper ----------------
// Returns { text, className } for front/rear messages
// Tweak THRESH if you want a different limit for suspension-only lift.
function checkLiftValues(stock, measured) {
  const THRESH = 50; // mm – change this if your rule differs
  if (isNaN(stock) || isNaN(measured)) {
    return { text: "", className: "ok" };
  }

  const delta = measured - stock; // +ve = lift, -ve = lower
  const dir = delta >= 0 ? "Lift" : "Lowered";
  const absDelta = Math.abs(delta);

  // Build a clear message
  let text = `${dir}: ${absDelta} mm (stock ${stock} → measured ${measured})`;

  // Colouring: red if over threshold, else black
  let className = absDelta > THRESH ? "warning-red" : "ok";

  return { text, className };
}
// ---------------- Photos → Results + Save as PDF ----------------

// Build photo previews in the Results tab from the "Vehicle Photos" file input
async function loadPhotosIntoResults() {
  const photosInput = document.querySelector('#photos input[type="file"]');
  const container = document.getElementById('resultsPhotos');
  if (!container) return;

  // Clear previous render
  container.innerHTML = "";

  // If no photos selected, nothing to add
  if (!photosInput || !photosInput.files || photosInput.files.length === 0) return;

  // Title
  const title = document.createElement('h4');
  title.textContent = 'Photos';
  container.appendChild(title);

  // Simple grid
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
  grid.style.gap = '10px';
  container.appendChild(grid);

  // Render each selected image
  Array.from(photosInput.files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);

    const frame = document.createElement('div');
    frame.style.border = '1px solid #ddd';
    frame.style.borderRadius = '6px';
    frame.style.padding = '6px';
    frame.style.background = '#fafafa';

    const img = document.createElement('img');
    img.src = url;
    img.alt = file.name;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';

    const cap = document.createElement('div');
    cap.style.fontSize = '12px';
    cap.style.marginTop = '4px';
    cap.textContent = file.name;

    frame.appendChild(img);
    frame.appendChild(cap);
    grid.appendChild(frame);
  });
}

// Compile fresh results, pull photos in, then open Print (user picks “Save as PDF”)
async function saveReportPDF() {
  // Make sure latest numbers are reflected
  compileResults(true, true); // silent, stayHere=true
  // Ensure Results tab is visible for print CSS
 // openTab({ currentTarget: null }, 'results');

  // Bring photos into the Results tab
  await loadPhotosIntoResults();

  // Give the browser a moment to paint images, then print
  setTimeout(() => window.print(), 400);
}

// (Optional) Live preview photos in Results as soon as user selects them
document.addEventListener('DOMContentLoaded', () => {
  const photosInput = document.querySelector('#photos input[type="file"]');
  if (photosInput) {
    photosInput.addEventListener('change', () => {
      // Only build previews if user is looking at Results; harmless otherwise
      loadPhotosIntoResults();
    });
  }
});

/* ---------------- Compile Results ---------------- */
function compileResults(silent = false, stayHere = true) {

  // Suspension (stock/home)
  const stockFront = parseFloat(document.getElementById("suspensionFront").value);
  const stockRear  = parseFloat(document.getElementById("suspensionRear").value);
  // Suspension (measured)
  const measuredFront = parseFloat(document.getElementById("measFront").value);
  const measuredRear  = parseFloat(document.getElementById("measRear").value);

  const haveStockSusp    = !(isNaN(stockFront) || isNaN(stockRear));
  const haveMeasuredSusp = !(isNaN(measuredFront) || isNaN(measuredRear));

  const frontDiv   = document.getElementById("frontResult");
  const rearDiv    = document.getElementById("rearResult");
  const summaryDiv = document.getElementById("summary");

  // Suspension compare only when all four suspension values exist
if (haveStockSusp && haveMeasuredSusp) {
  // --- Vehicle Height Increase logic (replaces old "Lift: ..." lines) ---
  const FrontInc   = measuredFront - stockFront;   // mm
  const RearInc    = measuredRear  - stockRear;    // mm
  const OverallInc = Math.max(FrontInc, RearInc);  // use MAX, no rounding

  // Detect LS10 in Home → Mod Codes (case-insensitive, word boundary)
  const modCodesRaw = (document.getElementById("modCodes")?.value || "");
  const hasLS10 = /(^|[^A-Z0-9])LS10([^A-Z0-9]|$)/i.test(modCodesRaw);

  // Compliance & heading colour
  // Compliant: <50 OR (50–125 AND LS10 entered)
  // Non-compliant: (50–125 AND no LS10) OR >125
  const compliant  = (OverallInc < 50) || ((OverallInc >= 50 && OverallInc <= 125) && hasLS10);
  const labelClass = compliant ? "green" : "red";
  const heading    = `<strong><span class="${labelClass}">Vehicle Height Increase</span></strong>`;

  // Detailed lines for non-compliant blocks
  const detailsBlock =
    ` – Standard vertical measurement from wheel centre to top of wheel arch:<br>` +
    `• Front: ${measuredFront} mm (standard: ${stockFront} mm; increase: ${FrontInc} mm)<br>` +
    `• Rear: ${measuredRear}  mm (standard: ${stockRear} mm; increase: ${RearInc}  mm)`;

  // Branching text
  let html = "";
  if (OverallInc < 50) {
    html = `${heading} – This vehicle’s suspension/body height increase of <strong>${OverallInc} mm</strong> is within allowance for basic modification.`;
  } else if (OverallInc <= 125) {
    if (hasLS10) {
      html = `${heading} – This vehicle’s suspension/body height increase of <strong>${OverallInc} mm</strong> is within the scope of <strong>LS9/LS10</strong> modifications.`;
    } else {
      html =
        `${heading}${detailsBlock}<br><br>` +
        `This vehicle’s height increase of <strong>${OverallInc} mm</strong> exceeds the basic modification allowance. ` +
        `Rectify this vehicle’s height to standard, or ensure compliance with <strong>Vehicle Standards Instruction: Minor Modifications (VSIMM)</strong>, ` +
        `or have this vehicle certified to comply with <strong>Section 1, LS9 of the Queensland Code of Practice: Vehicle Modifications (QCOP)</strong>.`;
    }
  } else { // OverallInc > 125
    html =
      `${heading}${detailsBlock}<br><br>` +
      `This vehicle’s height increase of <strong>${OverallInc} mm</strong> exceeds the basic modification allowance ` +
      `and is outside the scope of <strong>LS9/LS10</strong> modifications. ` +
      `Rectify this vehicle’s height to standard, or ensure compliance with <strong>Vehicle Standards Instruction: Minor Modifications (VSIMM)</strong>, ` +
      `or have this vehicle certified to comply with <strong>Section 1, LS9 of the Queensland Code of Practice: Vehicle Modifications (QCOP)</strong>.`;
  }

  // Clear the old per-axle “Lift:” lines
  if (frontDiv) { frontDiv.innerText = ""; frontDiv.className = "result"; }
  if (rearDiv)  { rearDiv.innerText  = ""; rearDiv.className  = "result"; }

  // Insert our block into #summary
  if (summaryDiv) summaryDiv.innerHTML = `<p>${html}</p>`;

  // Preserve your Unequal Lift warning as an extra paragraph
  const originalRelationship = stockFront - stockRear;
  const currentRelationship  = measuredFront - measuredRear;
  if (originalRelationship !== currentRelationship && summaryDiv) {
    const unequal =
      `<p><strong><span style="color:red;">Unequal Lift</span></strong> – ` +
      `<strong>The original relationship between the front and rear suspension is ${originalRelationship} mm and must not be changed. ` +
      `Currently the relationship is ${currentRelationship} mm. ` +
      `Rectify the vehicle’s suspension relationship to comply with s.5, LS9, QCOP or s6.12.i QLVIM.</strong></p>`;
    summaryDiv.insertAdjacentHTML('beforeend', unequal);
  }

} else {
  // Missing suspension inputs → clear outputs
  if (frontDiv) { frontDiv.innerText = ""; frontDiv.className = "result"; }
  if (rearDiv)  { rearDiv.innerText  = ""; rearDiv.className  = "result"; }
  if (summaryDiv) summaryDiv.innerHTML = "";
}



  // Tyres (show measured string in Results - using new parser)
const resultsTyreEl = document.getElementById("resultsTyre");
if (resultsTyreEl) {
  // Get what the user typed in the Vehicle Measurements → Tyres input
  const measuredStr = document.getElementById("m_tyreSize")?.value || "";

  // Parse the string with our helper (handles both metric and imperial formats)
  const parsed = parseTyreSize(measuredStr);

  if (parsed?.ok) {
    // If the format is valid → show a clean summary in Results tab
    // Example output: "Measured tyre: 35x12.5R16  (~889 mm overall diameter)"
    resultsTyreEl.className = "result ok";
    resultsTyreEl.innerHTML =
      `<p><strong>Measured Tyre:</strong> ${parsed.normalized}</p>` +
      `<p><strong>Overall Diameter:</strong> ~${parsed.overall_mm.toFixed(0)} mm</p>` +
      `<p><em>Format detected:</em> ${parsed.type === "metric" ? "Metric" : "Imperial"}</p>`;
      // --- Add Engineering Mod Codes under Results ---
const modInput = document.getElementById("modCodes")?.value || "";
const modCodes = modInput.split(",").map(normCode).filter(Boolean);

if (modCodes.length) {
  let html = "<p><strong>Engineering Mod Codes:</strong></p><ul>";
  for (const code of modCodes) {
    const isHeavy = !!window.modHeavy[code];
    const title = window.modCodeDescriptions[code];
    if (title) {
      if (isHeavy) {
        html += `<li><span style="color:red;"><strong>${code}</strong>: ${title} – Heavy vehicle mod code fitted</span></li>`;
      } else {
        html += `<li><strong>${code}</strong>: ${title}</li>`;
      }
    } else {
      html += `<li><strong>${code}</strong>: <span style="color:red;">Unknown code</span></li>`;
    }
  }
  html += "</ul>";
  resultsTyreEl.innerHTML += html;
}

  } else {
    // If the input couldn’t be parsed → clear the Results area
    resultsTyreEl.innerHTML = "";
    resultsTyreEl.className = "result";
  }
}


 // ---- Tyre Diameter increase check (Home largest vs measured) ----
const tyreDiaAlert = document.getElementById("tyreDiaAlert");
if (tyreDiaAlert) {
  tyreDiaAlert.innerHTML = "";
  tyreDiaAlert.className = "result";

  // Largest stock from Home tab
  const largest = window._largestStockTyre; // { label, odMm } or null

  // Measured tyre from Vehicle Measurements tab
  const measuredStr = document.getElementById("m_tyreSize")?.value || "";
  const p = parseTyreSize(measuredStr);

  if (largest && p?.ok) {
    const stockDia    = largest.odMm;
    const measuredDia = Math.round(p.overall_mm);
    const delta       = measuredDia - stockDia;
    const incStr      = `${delta >= 0 ? "+" : ""}${delta} mm`;
    const exceeds     = delta > 50;
    const headingClr  = exceeds ? "red" : "green";
    const stockLabel  = "Largest Stock Diameter";

    if (!exceeds) {
      tyreDiaAlert.innerHTML =
        `<p><strong><span style="color:${headingClr};">Tyre Diameter</span></strong> – ` +
        `${stockLabel}: ~${stockDia} mm, ` +
        `Measured Diameter: ~${measuredDia} mm, ` +
        `Increase: ${incStr} (within 50 mm limit).</p>`;
    } else {
      tyreDiaAlert.innerHTML =
        `<p><strong><span style="color:${headingClr};">Tyre Diameter</span></strong> – ` +
        `${stockLabel}: ~${stockDia} mm, ` +
        `Measured Diameter: ~${measuredDia} mm, ` +
        `Increase: ${incStr} over 50mm limit. ` +
        `Rectify the tyre diameter to comply with s7.4.D QLVIM and s.4.4, LS9 QCOP.</p>`;
    }
  }
}


  // Wheel Track check (≤50 mm = compliant, >50 mm = not compliant)
const stockTrackFront = parseFloat(document.getElementById("trackFront").value);
const stockTrackRear  = parseFloat(document.getElementById("trackRear").value);
const measTrackFront  = parseFloat(document.getElementById("measTrackFront").value);
const measTrackRear   = parseFloat(document.getElementById("measTrackRear").value);
const trackAlertEl    = document.getElementById("trackAlert");

if (trackAlertEl) {
  trackAlertEl.innerHTML = "";
  trackAlertEl.className = "result";

  if ([stockTrackFront, stockTrackRear, measTrackFront, measTrackRear].every(v => !isNaN(v))) {
    const diffF = measTrackFront - stockTrackFront;
    const diffR = measTrackRear  - stockTrackRear;

    if (diffF > 50 || diffR > 50) {
      // Non-compliant (>50 mm)
      trackAlertEl.innerHTML =
        `<p><strong><span style="color:red;">Wheel Track</span></strong> – Standard wheel track measurements for this vehicle are ` +
        `${stockTrackFront} mm front and ${stockTrackRear} mm rear and must not be increased by more than 50 mm. ` +
        `The vehicle's wheel track measurements are front ${measTrackFront} mm and rear ${measTrackRear} mm. ` +
        `Rectify the wheel track to comply with s.4.4, LS9, QCOP.</p>`;
    } else {
      // Compliant (≤50 mm)
      trackAlertEl.innerHTML =
        `<p><strong><span style="color:green;">Wheel Track</span></strong> - modification within the allowable limit (less than 50 mm).</p>`;
    }
  }
}


// Inspection → Results

  // Open Results unless told to stay here
  if (!stayHere) {
    const resultsBtn = Array.from(document.getElementsByClassName("tablink"))
      .find(b => b.getAttribute("onclick")?.includes("'results'"));
    if (resultsBtn) {
      openTab({ currentTarget: resultsBtn }, "results");
    } else {
      Array.from(document.getElementsByClassName("tab-content")).forEach(el => el.classList.remove("active"));
      document.getElementById("results").classList.add("active");
    }
  }
}

function answerSwayBar(isYes) {
  const infoEl = document.getElementById("swayBarInfo");
  const inspResultsEl = document.getElementById("inspectionResults");

  if (isYes) {
    swayBarIssue = true;
    infoEl.innerHTML = `<span class="warning-red">Issue flagged. Added to Results automatically.</span>`;
    if (inspResultsEl) {
      inspResultsEl.className = "result warning-red";
      inspResultsEl.innerText =
        "Sway bar - Sway bar components are broken, loose, unduly worn, disconnected, or have been removed - ensure vehicle complies with s6.14 of QLVIM";
    }
    compileResults(true, true); // silent + stay on Inspection tab
  } else {
    swayBarIssue = false;
    infoEl.innerHTML = `<span class="green">Compliant.</span>`;
    if (inspResultsEl) {
      inspResultsEl.innerHTML = "";
      inspResultsEl.className = "result";
    }
    compileResults(true, true); // silent + stay on Inspection tab
  }
}


  // ---------- Data loaders (BASE + JSONs) ----------
const ASSET_BASE = location.pathname.includes("/DART/") ? "/DART/" : "./";


// ---- Mod codes map ----
// ---- Mod codes maps (light + heavy) ----
Promise.all([
  fetch(`${ASSET_BASE}assets/modcodes-light.json`, { cache: "no-store" }).then(r => r.ok ? r.json() : { codes: [] }),
  fetch(`${ASSET_BASE}assets/modcodes-heavy.json`, { cache: "no-store" }).then(r => r.ok ? r.json() : { codes: [] })
]).then(([light, heavy]) => {
  // both files use { codes: [ { code, title }, ... ] }
  (Array.isArray(light.codes) ? light.codes : []).forEach(({code, title}) => {
    const k = normCode(code);
    if (k) window.modLight[k] = String(title||"").trim();
  });
  (Array.isArray(heavy.codes) ? heavy.codes : []).forEach(({code, title}) => {
    const k = normCode(code);
    if (k) window.modHeavy[k] = String(title||"").trim();
  });

  // merged map (heavy overrides light on clashes)
  window.modCodeDescriptions = { ...window.modLight, ...window.modHeavy };

  console.log("Mod codes loaded:",
    "light:", Object.keys(window.modLight).length,
    "heavy:", Object.keys(window.modHeavy).length,
    "merged:", Object.keys(window.modCodeDescriptions).length
  );
}).catch(err => console.warn("Mod codes load failed:", err));


// ---- QLVIM mapping ----
const QLVIM_URL = `${ASSET_BASE}assets/QLVIM_mapping.json?nocache=${Date.now()}`;

fetch(QLVIM_URL, { cache: "no-store" })
  .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
  .then(rows => {
    if (!Array.isArray(rows)) throw new Error("QLVIM mapping: JSON is not an array");

    // Normalize column names (handles either lower/upper-case headers)
    qlvimData = rows.map(r => {
      const phrase   = String(r.phrase   ?? r.Phrase   ?? "").trim();
      const section  = String(r.section  ?? r.Section  ?? "").trim();
      const clause   = String(r.clause   ?? r.Clause   ?? "").trim();
      const category = String(r.category ?? r.Category ?? "").trim();
      const pageNum  = parseInt(r.page ?? r.Page ?? 1, 10);
      const page     = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
      return { phrase, section, clause, category, page };
    });

    console.log("QLVIM mapping loaded:", qlvimData.length, "rows");
  })
  .catch(err => console.error("QLVIM mapping failed to load:", err));

  // ---------- Helpers ----------
 function qlvimLink(page) {
  // Works locally (127.0.0.1:5500) and on GitHub Pages (/DART/)
  const BASE = location.pathname.includes("/DART/") ? "/DART/" : "/";
  const pdfUrl = new URL(`${BASE}assets/QLVIM.pdf?nocache=${Date.now()}`, location.origin).href;
  const viewerUrl = new URL(`${BASE}viewer/viewer.html`, location.origin).href;
  return `${viewerUrl}?file=${encodeURIComponent(pdfUrl)}#page=${page}`;
}
// === Body Blocks helpers ===
function hasLS10Mod() {
  const v = (document.getElementById("modCodes")?.value || "");
  return /(^|[^A-Z0-9])LS10([^A-Z0-9]|$)/i.test(v);
}

function setStatus(el, text, ok) {
  if (!el) return;
  el.textContent = text;
  el.className = `result ${ok ? 'green' : 'red'}`;
}

function setInspectionLine(lineId, htmlOrEmpty) {
  const container = document.getElementById("inspectionResults");
  if (!container) return;

  let line = document.getElementById(lineId);
  if (!htmlOrEmpty) { if (line) line.remove(); return; }
  if (!line) { 
    line = document.createElement("div");
    line.id = lineId;
    container.appendChild(line); 
  }
  line.innerHTML = htmlOrEmpty;
}


// Append a selected result to the Results tab (Inspection results area)
function addToResults(title, section, clause, page, noteInputId, btn) {
  const note = (document.getElementById(noteInputId)?.value || "").trim();
  const link = qlvimLink(page);
  const secText = `s${section}`;

  const resultsDiv = document.getElementById("inspectionResults");
  if (!resultsDiv) return;

  const row = document.createElement("div");
  row.style.margin = "8px 0";
  row.innerHTML = `
    <strong><a href="${link}" target="_blank" rel="noopener" style="color:red;">${title}</a></strong>
    – ${clause}
    – ensure vehicle complies with
    <strong><a href="${link}" target="_blank" rel="noopener" style="color:blue; text-decoration:underline;">[${secText}]</a></strong>
    of QLVIM.${note ? ` <em>Note: ${note.replace(/</g,"&lt;")}</em>` : "" }
  `;
  resultsDiv.appendChild(row);

  // 🔴 Change the button colour + text when clicked
  if (btn) {
    btn.style.background = "red";
    btn.textContent = "Added to Results";
    btn.disabled = true; // stops clicking twice
  }
}

  // ---------- Search ----------
  function searchQLVIM() {
    const q = (document.getElementById("dartSearch")?.value || "").trim().toLowerCase();
    const out = document.getElementById("searchResults");
    if (!out) return;
    out.innerHTML = "";

    if (!q) { out.innerHTML = "<p><em>Type something to search.</em></p>"; return; }
    if (!Array.isArray(qlvimData) || qlvimData.length === 0) {
      out.innerHTML = "<p><em>Mapping not loaded.</em></p>"; return;
    }
    // --- Mod code short-circuit (supports comma-separated codes) ---
(function () {
  const raw = (document.getElementById("dartSearch")?.value || "");
  const codes = raw.split(/[,\s]+/).map(normCode).filter(Boolean);
  if (!codes.length) return;

  // if EVERY token looks like a mod code (letters+digits), handle here
  const looksLikeCodes = codes.every(c => /^[A-Z]{1,3}\d{1,2}$/i.test(c));
  if (!looksLikeCodes) return;

  // Render matches (heavy in red with suffix)
  let any = false;
  let html = "<ul>";
  for (const code of codes) {
    const isHeavy = !!window.modHeavy[code];
    const titleL  = window.modLight[code];
    const titleH  = window.modHeavy[code];

    if (isHeavy) {
      html += `<li><span style="color:red;"><strong>${code}</strong>: ${titleH} – Heavy vehicle mod code fitted</span></li>`;
      any = true;
    } else if (titleL) {
      html += `<li><strong>${code}</strong>: ${titleL}</li>`;
      any = true;
    } else {
      html += `<li><strong>${code}</strong>: <span style="color:red;">Unknown code</span></li>`;
      any = true;
    }
  }
  html += "</ul>";

  if (any) {
    out.innerHTML = html;
    return; // stop here: don't run the QLVIM phrase search
  }
})();


    // Token-based matching: robust for queries like "faded plate", "headlamp aim"
    const tokens = q.split(/\s+/).filter(w => w.length >= 3);

    const results = Object.values(
  qlvimData
    .map(it => {
      const p = (it.phrase || it.Phrase || "").toLowerCase().trim();   // phrase
      const c = (it.clause || it.Clause || "").toLowerCase().trim();   // clause
      const g = (it.category || it.Category || "").toLowerCase().trim(); // category
      const s = (it.section  || it.Section  || "").toLowerCase().trim(); // section (for tie-breaks)
      const combined = [p, c, g].join(" ");

      let score = 0;

      // strong boost for exact phrase
      if (p === q) score += 10;

      // contains-boosts
      if (p.includes(q)) score += 5;   // phrase
     
      if (g.includes(q)) score += 4;   // category

      // token-based fuzzy scoring (prefer phrase/category)
      let tokenHits = 0;
      for (const t of tokens) {
        if (p.includes(t)) tokenHits += 2;
        if (g.includes(t)) tokenHits += 2;
        if (c.includes(t)) tokenHits += 1;
      }
      score += tokenHits;
// —— Clause-first boosts (normalized) ——
const qx = String(q || qNorm || "").toLowerCase().replace(/\s+/g, " ").trim();
const cX = String(c).toLowerCase();
const pX = String(p).toLowerCase();
const gX = String(g).toLowerCase();

// exact clause equals query (strongest)
if (cX === qx) score += 40;

// exact phrase appears in clause (very strong)
else if (cX.includes(qx)) score += 28;

// all query words in order within the clause (looser than exact)
const words = qx.split(" ").filter(Boolean);
if (words.length >= 2) {
  const inOrder = new RegExp(words.map(w => `\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).join(".*"), "i");
  if (inOrder.test(cX)) score += 12;
}

// demote if clause does not contain any query word
if (!words.some(w => cX.includes(w))) score -= 10;

// extra demotion if the hit is only in phrase/category but not clause
if ((pX.includes(qx) || gX.includes(qx)) && !cX.includes(qx)) score -= 6;
// 🔥 HARD CLAUSE PRIORITY — if the query phrase appears in clause text,
// give a massive override so it always ranks first.
if (cX.includes(qx)) {
  score += 200; // absolute dominance over phrase-only matches
}

// Safety: if phrase contains it but clause doesn’t, halve that score
if (pX.includes(qx) && !cX.includes(qx)) {
  score -= 40;
}


      // slight nudge for shorter (more specific) phrases
      if (p && (p.includes(q) || q.includes(p))) {
        score += Math.max(0, 3 - Math.min(3, Math.floor(p.length / 12)));
      }

      return { ...it, _score: score };
    })
    .filter(it => it._score > 0)
    // 🔑 Deduplicate by Section+Clause+Page, keep highest score
    .reduce((acc, cur) => {
      const section = (cur.Section || cur.section || "").trim();
      const clause  = (cur.Clause  || cur.clause  || "").trim();
      const page    = String(cur.Page || cur.page || "").trim();
      const key = `${section}::${clause}::${page}`;
      if (!acc[key] || cur._score > acc[key]._score) acc[key] = cur;
      return acc;
    }, {})
)
.sort((a, b) => {
    // clause-first tiebreaker (normalize and make stricter)
  const qa = String((q || qNorm || "")).toLowerCase().replace(/\s+/g, " ").trim();  // e.g. "seating capacity"
  const aC = String(a.Clause || a.clause || "").toLowerCase();
  const bC = String(b.Clause || b.clause || "").toLowerCase();
// prefer clause matches over phrase-only matches
const aP = String(a.Phrase || a.phrase || "").toLowerCase();
const bP = String(b.Phrase || b.phrase || "").toLowerCase();
const aPhraseOnly = aP.includes(qa) && !aC.includes(qa);
const bPhraseOnly = bP.includes(qa) && !bC.includes(qa);
if (aPhraseOnly !== bPhraseOnly) return aPhraseOnly ? 1 : -1; // push phrase-only below

  // exact phrase test and loose in-order test
  const words = qa.split(" ").filter(Boolean);
  const inOrder = words.length >= 2
    ? new RegExp(words.map(w => `\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).join(".*"), "i")
    : null;

  const aExact = qa && aC.includes(qa);
  const bExact = qa && bC.includes(qa);
  if (aExact !== bExact) return aExact ? -1 : 1;

  const aOrder = inOrder ? inOrder.test(aC) : false;
  const bOrder = inOrder ? inOrder.test(bC) : false;
  if (aOrder !== bOrder) return aOrder ? -1 : 1;


  // Then compare by score
  const scoreDiff = b._score - a._score;
  if (scoreDiff !== 0) return scoreDiff;

  // Then prefer shorter phrases
  const lenDiff = ((a.Phrase || a.phrase || "").length - (b.Phrase || b.phrase || "").length);
  if (lenDiff !== 0) return lenDiff;

  // Final fallback: alphabetical by section
  return String(a.Section || a.section || "").localeCompare(String(b.Section || b.section || ""));
})

.slice(0, 3);



   if (results.length === 0) {
  // Don’t exit — let the fallback text search run below
  out.innerHTML = "";
}


    results.forEach((it, i) => {
     // Read fields in a case-insensitive way
  const sec      = (it.section  || it.Section  || "").trim();
  const page     =  it.page     || it.Page     || 1;
    // ✅ Safe handling of Category field
  const categoryRaw = it.category || it.Category || "";
  const category = (categoryRaw && typeof categoryRaw === "string")
    ? categoryRaw.trim()
    : "Uncategorized";

  const clause   = (it.clause   || it.Clause   || "").trim();

  const link    = qlvimLink(page);
  const secText = `s${sec}`;

  const wrap = document.createElement("div");
// build result card
wrap.className = "result-item"; // styling via CSS, no inline styles
wrap.innerHTML = `
  <div>
    <strong><span class="category-pill">${category}</span></strong>
    – ${clause}
    – ensure vehicle complies with
    <strong><a class="qlvim-link" href="${link}" target="_blank" rel="noopener">[${secText}]</a></strong>
    of QLVIM.
  </div>

  <div class="result-note">
    <em>Note:</em>
    <input id="note-${i}" class="note-input" type="text" placeholder="optional note">
  </div>

  <div class="result-actions">
    <button
      type="button"
      class="action result-add-btn"
      data-category="${category.replace(/"/g, "&quot;")}"
      data-sec="${sec}"
      data-clause="${clause.replace(/"/g, "&quot;")}"
      data-page="${page}"
      data-note-id="note-${i}"
    >Add to Results</button>
  </div>
`;
out.appendChild(wrap);
}); // <-- closes your .forEach or .map loop

// ---- Fallback: if no mapping hits were rendered, try text search ----
const out2 = document.getElementById("searchResults");
const query =
  document.getElementById("searchQLVIM")?.value ||
  document.getElementById("dartSearch")?.value ||
  "";
if (out2 && out2.children.length === 0 && query.trim()) {
  const ok = fallbackQLVIMTextSearch(query.trim());
  if (!ok) {
    out2.innerHTML =
      `<div class="results-header">No results found for "${query.trim()}". Try a different term.</div>`;
  }
}
  }
 // <--- closes searchQLVIM()
// =====================================================
// DOMContentLoaded (runs after page load)
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    // ---- Disclaimer Check ----
  if (localStorage.getItem("dartDisclaimerAccepted") !== "true") {
    document.getElementById("disclaimerModal").style.display = "block";
    document.body.style.overflow = "hidden"; // Prevent background scroll
    return; // Halt other scripts until disclaimer accepted
  }

  // Load pre-extracted manual text for fallback search
  // ---------- Restore last tab after returning from external browser ----------
  const lastTab = localStorage.getItem("lastTab");
  if (lastTab && typeof openTab === "function") {
    // openTab(evt, tabName) – we can safely call it with just the tab name
    openTab(null, lastTab);
      }

 fetch(`${ASSET_BASE}assets/QLVIM_text.json?nocache=${Date.now()}`)

    .then(r => r.json())
    .then(data => { qlvimText = data; console.log(`QLVIM_text loaded: ${data.length} pages`); })
    .catch(err => console.warn("QLVIM_text.json load failed", err));

  // ✅ Wire the Mod Codes buttons
  document.getElementById("modCodeButton")?.addEventListener("click", showModDescriptions);
  document.getElementById("modCodeClear")?.addEventListener("click", clearModCodes);

  // 1) Enter → search
  const input = document.getElementById("dartSearch");
  if (input) {
    input.addEventListener("keyup", (e) => {
      if (e.key === "Enter" && typeof searchQLVIM === "function") {
        searchQLVIM();
      }
    });
  }

  // 2) Wrap searchQLVIM to add "Top 3 results" header
  if (typeof searchQLVIM === "function") {
    const _origSearch = searchQLVIM;
    window.searchQLVIM = function () {
      _origSearch();
      const out = document.getElementById("searchResults");
      if (!out) return;
      if (out.innerHTML.trim() && !document.getElementById("qlvim-top3-header")) {
        const hdr = document.createElement("div");
        hdr.id = "qlvim-top3-header";
        hdr.className = "results-header";
        hdr.textContent = "Top 3 results";
        out.insertBefore(hdr, out.firstChild);
      }
    };
  } else {
    console.warn("searchQLVIM() not defined yet. Make sure the base function is declared above this script.");
  }

  // 3) Delegate clicks for dynamically-created "Add to Results" buttons
  const resultsContainer = document.getElementById("searchResults");
  if (resultsContainer) {
    resultsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".result-add-btn");
      if (!btn) return;
      addToResults(
        btn.dataset.category,
        btn.dataset.sec,
        btn.dataset.clause,
        Number(btn.dataset.page),
        btn.dataset.noteId,
        btn
      );
    });
  } else {
    console.warn("#searchResults not found when wiring listener");
  }

  // 4) Tab button event listeners
  document.querySelectorAll(".tablink").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      openTab(e, btn.dataset.tab);
    });
  });

  // 5) (Optional) Search button click if you removed inline onclick
  document.getElementById("searchQLVIMBtn")?.addEventListener("click", searchQLVIM);

  // 6) Compile button behaviour
  const compileBtn = document.getElementById("compileBtn");
  if (compileBtn) {
    compileBtn.addEventListener("click", function () {
      compileResults();
      compileBtn.textContent = "Added in results";
      compileBtn.style.backgroundColor = "red";
      compileBtn.style.color = "white";
    });
  }

  // ---- Sway bar (Inspection) ----
  const swayYes    = document.getElementById("swayYes");
  const swayNo     = document.getElementById("swayNo");
  const swayStatus = document.getElementById("swayStatus");

  if (swayYes) {
    swayYes.addEventListener("click", () => {
      setStatus(swayStatus, "Issue flagged. Added to Results automatically.", false);
      setInspectionLine(
        "res-swaybar",
        `<p><strong><span class="red">Sway bar</span></strong>: ` +
        `One or more components broken, loose, unduly worn, disconnected, or removed. ` +
        `Rectify as per s.6.14 of QLVIM.</p>`
      );
    });
  }

  if (swayNo) {
    swayNo.addEventListener("click", () => {
      setStatus(swayStatus, "Compliant.", true);
      setInspectionLine("res-swaybar", "");
    });
  }

  // ---- Shackles (Inspection) ----
  const shackleYes    = document.getElementById("shackleYes");
  const shackleNo     = document.getElementById("shackleNo");
  const shackleStatus = document.getElementById("shackleStatus");

  if (shackleYes) {
    shackleYes.addEventListener("click", () => {
      setStatus(shackleStatus, "Issue flagged. Added to Results automatically.", false);
      setInspectionLine(
        "res-shackles",
        `<p><strong><span class="red">Suspension Shackles</span></strong>: ` +
        `This vehicle is fitted with extended shackles. Re-fit factory shackles as per s6.13.b of QLVIM.</p>`
      );
    });
  }

  if (shackleNo) {
    shackleNo.addEventListener("click", () => {
      setStatus(shackleStatus, "Compliant.", true);
      setInspectionLine("res-shackles", "");
    });
  }

  // ---- Body Blocks (Inspection) ----
  const bbYes      = document.getElementById("bbYes");
  const bbNo       = document.getElementById("bbNo");
  const bbFollow   = document.getElementById("bbFollow");
  const bbLe50Yes  = document.getElementById("bbLe50Yes");
  const bbLe50No   = document.getElementById("bbLe50No");
  const bbStatusEl = document.getElementById("bbStatus");

  function bbShowFollowup()  { if (bbFollow) bbFollow.style.display = "block"; }
  function bbHideFollowup()  { if (bbFollow) bbFollow.style.display = "none"; }

  // Q1: Are body blocks fitted?
  if (bbYes) bbYes.addEventListener("click", () => {
    if (!hasLS10Mod()) {
      if (bbFollow) bbFollow.style.display = "none";
      setStatus(bbStatusEl, "Issue flagged. Added to Results automatically.", false);
      setInspectionLine(
        "res-body-blocks",
        `<p><strong><span class="red">Body Blocks</span></strong>: ` +
        `This vehicle has body blocks. Remove or have this vehicle certified to comply with s.1, LS9, QCOP.</p>`
      );
    } else {
      if (bbFollow) bbFollow.style.display = "block";
      setStatus(bbStatusEl, "", true);
      setInspectionLine("res-body-blocks", "");
    }
  });

  if (bbLe50Yes) bbLe50Yes.addEventListener("click", () => {
    if (hasLS10Mod()) {
      setStatus(bbStatusEl, "Compliant – LS10 plate fitted.", true);
      setInspectionLine("res-body-blocks", "");
    } else {
      setStatus(bbStatusEl, "Issue flagged. Added to Results automatically.", false);
      setInspectionLine(
        "res-body-blocks",
        `<p><strong><span class="red">Body Blocks</span></strong>: ` +
        `This vehicle has body blocks. Remove or have this vehicle certified to comply with s.1, LS9, QCOP.</p>`
      );
    }
  });

  // Q1: No — body blocks not fitted
  if (bbNo) bbNo.addEventListener("click", () => {
    if (bbFollow) bbFollow.style.display = "none";
    setStatus(bbStatusEl, "Compliant.", true);
    setInspectionLine("res-body-blocks", "");
  });

  // Q2: No — NOT ≤ 50 mm (so > 50 mm)
  if (bbLe50No) bbLe50No.addEventListener("click", () => {
    setStatus(bbStatusEl, "Issue flagged. Added to Results automatically.", false);
    setInspectionLine(
      "res-body-blocks",
      `<p><strong><span class="red">Body Blocks</span></strong>: ` +
      `This vehicle has body blocks higher than 50 mm fitted and is out of scope for LS9/LS10. ` +
      `Remove or ensure blocks do not exceed 50 mm in height as per s.1, LS9, QCOP.</p>`
    );
  });

  // ---- Defect Clearance Wording ----
  const dcLocation = document.getElementById("dcLocation");
  const dcOutput   = document.getElementById("dcOutput");

  if (dcLocation && dcOutput) {
    dcLocation.addEventListener("change", () => {
      const loc = dcLocation.value;
      let text = "";

      if (loc === "Carseldine") {
        text = `
<p><strong>Self-Clearance:</strong><br>
The owner/owner representative must complete the "Defect Notice Clearance Declaration" where indicated on the rear of this notice and return by the due date to;<br>
TMR COMPLIANCE P.O BOX 212 Carseldine QLD 4034 or rce_bss@tmr.qld.gov.au</p>

<p><strong>Approved Inspection Station:</strong><br>
An Approved Inspection Station is required to verify the defects identified in this defect notice have been rectified and complete the "Defect Notice Clearance Declaration" on the rear of this notice where indicated and if fitted, remove and destroy the Defective Vehicle Label.<br>
TMR COMPLIANCE P.O BOX 212 Carseldine QLD 4034 or rce_bss@tmr.qld.gov.au</p>

<p><strong>TMR Clearance:</strong><br>
For booking contact rce_bss@tmr.qld.gov.au or call 13 23 80</p>

<p><strong>Request for Documentation:</strong><br>
Please provide copies of documentation evidence verifying identified defects have been rectified.</p>

<p><strong>Vehicle Use Restriction:</strong><br>
Vehicle must not be used on a road after the notice is issued other than to move it to –</p>
`;
      } else if (loc) {
        text = `<em>Address for ${loc} not yet configured.</em>`;
      }

      dcOutput.style.display = text ? "block" : "none";
      dcOutput.innerHTML = text;
    });
  } // <-- CLOSE the DC block here

  // ---- Tyre Calculator (Home Tab) ----
const tyreInput  = document.getElementById("tyreSizes");
const tyreBtn    = document.getElementById("calcLargestTyre");
const tyreResult = document.getElementById("largestTyreResult");


// Helper: format one line with inline assumption notes
function renderLine(p) {
  const noteTxt =
    p.assumed100 ? " (assumed ratio of 100%)" :
    p.assumed82  ? " (assumed ratio of 82%)"  :
    "";
  return `${p.normalized} \u2192 ~${Math.round(p.overall_mm)} mm${noteTxt}`;
}


if (tyreBtn) {
  tyreBtn.addEventListener("click", () => {
    const raw = (tyreInput?.value || "").trim();
    if (!raw) {
      tyreResult.textContent = "No tyre sizes entered.";
      window._largestStockTyre = undefined; // user can proceed without tyres
      return;
    }

    const items = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!items.length) {
      tyreResult.textContent = "No valid tyre sizes detected.";
      window._largestStockTyre = undefined;
      return;
    }

    const parsed = items.map(parseTyreSize).filter(p => p.ok);
if (!parsed.length) {
  tyreResult.textContent = "No valid tyre sizes detected.";
  window._largestStockTyre = undefined;
  return;
}

// Sort by OD (mm) descending
parsed.sort((a, b) => b.overall_mm - a.overall_mm);
const largest = parsed[0];

// Build output (with assumed-ratio notes)
const largestNote =
  largest.assumed100 ? " (assumed ratio of 100%)" :
  largest.assumed82  ? " (assumed ratio of 82%)"  : "";

let html = `Largest tyre: <strong>${largest.normalized}</strong> (OD ~<strong>${largest.overall_mm.toFixed(0)} mm</strong>${largestNote})<br><br>`;
html += `All entered sizes:<br>`;
html += parsed.map(renderLine).join("<br>");

tyreResult.innerHTML = html;

// Store for Save/Results use (no change needed beyond existing fields)
window._largestStockTyre = {
  label: largest.normalized,
  odMm: Math.round(largest.overall_mm)
};

  });
}



}); // <-- ONE AND ONLY closing brace for DOMContentLoaded
// ---- Disclaimer Button Actions ----
function acceptDisclaimer() {
  localStorage.setItem("dartDisclaimerAccepted", "true");
  document.getElementById("disclaimerModal").style.display = "none";
  document.body.style.overflow = "";
  location.reload(); // Force re-run of DOMContentLoaded to load DART
}

function rejectDisclaimer() {
  alert("You must accept the disclaimer to use this tool.");
  window.location.href = "https://www.qld.gov.au/transport";
}
