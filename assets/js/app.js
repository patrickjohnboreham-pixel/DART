
'use strict';              // optional but recommended

// ---- Globals ----
let qlvimData = [];
let swayBarIssue = null;   // null = unanswered, true = issue, false = compliant
let shackleIssue = null; // null = unanswered, true = issue, false = compliant

// ---- QLVIM text fallback + synonyms ----
let qlvimText = [];

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
  const codes = input.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const map = window.modCodeDescriptions || {};
  let html = "";

  if (!codes.length) {
    html = "Please enter at least one mod code.";
  } else {
    html = "<ul>";
    for (const code of codes) {
      const desc = map[code];
      html += `<li><strong>${code}</strong>: ${desc ? desc : '<span style="color:red;">Unknown code</span>'}</li>`;
    }
    html += "</ul>";
  }
  document.getElementById("modDescriptions").innerHTML = html;
}
// ----------------- QLVIM Helpers -----------------

// Try to pull a section ref like s2.6.3 from nearby text (best-effort)
function extractSectionRef(text) {
  const m = text.match(/\b(?:s(?:ection)?\s*)?(\d+(?:\.\d+)+)\b/i);
  return m ? `s${m[1]}` : null;
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

  const terms = expandTerms(rawTerm);

  // ✅ Get all matching pages, not just the first
  const pageHits = qlvimText.filter(p =>
    terms.some(t => p.text?.toLowerCase().includes(t))
  );

  if (!pageHits.length) return false;

  const resultsEl = document.getElementById("searchResults");
  if (!resultsEl) return false;

  pageHits.forEach(pageHit => {
    const snippet = getSnippet(pageHit.text, terms);
    const link = qlvimLink(pageHit.page);
    const sectionRef = extractSectionRef(pageHit.text);

    const ensureHtml = sectionRef
      ? `ensure complies with <a class="qlvim-link" href="${link}" target="_blank">${sectionRef}</a>`
      : `ensure complies with <a class="qlvim-link" href="${link}" target="_blank">manual (page ${pageHit.page})</a>`;

    const html = `
      <div class="result-item">
        <div class="results-header">Unmapped match (text search) — page ${pageHit.page}</div>
        <div class="result-note" style="margin-top:6px;">${snippet}</div>
        <div class="photo-note" style="margin-top:8px;">${ensureHtml}</div>
        <div style="margin-top:8px;">
          <button type="button" class="action"
            onclick="addFallbackToResults(${pageHit.page}, ${sectionRef ? `'${sectionRef}'` : null}, this)">
            Add to Results
          </button>
          <a class="qlvim-link" href="${link}" target="_blank" style="margin-left:8px; text-decoration:underline;">
            Open manual to page ${pageHit.page}
          </a>
        </div>
      </div>
    `;
    resultsEl.insertAdjacentHTML("beforeend", html);
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
             overall_mm: overall, normalized: `${width}/${aspect}R${rimIn}` };
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
               overall_mm: overall, normalized: `${widthIn}R${rimIn}`.replace(/\.0\b/g,"") };
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

  // Validate required vehicle fields
  if (!rego || !make || !model || !year || !approval) {
    document.getElementById("vehicleSummary").innerHTML =
      `<span style="color:red;">Please fill in all vehicle detail fields.</span>`;
    return;
  }

  // Mod codes block
  const modCodesSection = `
    <h4 style="color:blue;">Engineering Mod Codes</h4>
    ${
      modCodes.length
        ? `<ul>${
            modCodes.map(code => {
              const desc = (typeof modCodeDescriptions !== "undefined" && modCodeDescriptions[code])
                ? modCodeDescriptions[code]
                : `<span style="color:red;">Unknown code</span>`;
              return `<li><strong>${code}</strong>: ${desc}</li>`;
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


  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./service-worker.js', { scope: './' })
        .then(r => console.log('SW scope:', r.scope))
        .catch(e => console.error('SW registration failed', e));
    });
  }

  // ---------- Data loaders (BASE + JSONs) ----------
const BASE = location.pathname.includes("/DART/") ? "/DART/" : "./";

// ---- Mod codes map ----
window.modCodeDescriptions = {}; // exists even if fetch fails

fetch(`${BASE}assets/mod-codes.json?v=2`, { cache: "no-store" })
  .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
  .then(data => {
    // Accept object map OR array of {code, desc}
    window.modCodeDescriptions = Array.isArray(data)
      ? data.reduce((acc, it) => {
          const code = String(it.code ?? it.Code ?? "").toUpperCase().trim();
          const desc = String(it.desc ?? it.description ?? it.Desc ?? "");
          if (code) acc[code] = desc;
          return acc;
        }, {})
      : (data || {});
    console.log("Mod codes loaded:", Object.keys(window.modCodeDescriptions).length);
  })
  .catch(err => console.warn("Could not load mod-codes.json; showing 'Unknown code'.", err));

// ---- QLVIM mapping ----
const QLVIM_URL = `${BASE}assets/QLVIM_mapping.json?nocache=${Date.now()}`;

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
      if (c.includes(q)) score += 3;   // clause
      if (g.includes(q)) score += 4;   // category

      // token-based fuzzy scoring (prefer phrase/category)
      let tokenHits = 0;
      for (const t of tokens) {
        if (p.includes(t)) tokenHits += 2;
        if (g.includes(t)) tokenHits += 2;
        if (c.includes(t)) tokenHits += 1;
      }
      score += tokenHits;

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
// convert object → array, then sort and take top 3
.sort((a, b) =>
  b._score - a._score ||
  ((a.Phrase || a.phrase || "").length - (b.Phrase || b.phrase || "").length) ||
  String(a.Section || a.section || "").localeCompare(String(b.Section || b.section || ""))
)
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
  // Load pre-extracted manual text for fallback search
  // ---------- Restore last tab after returning from external browser ----------
  const lastTab = localStorage.getItem("lastTab");
  if (lastTab && typeof openTab === "function") {
    // openTab(evt, tabName) – we can safely call it with just the tab name
    openTab(null, lastTab);
      }

  fetch(`${BASE}assets/QLVIM_text.json?nocache=${Date.now()}`)
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
  const notes = [];
  if (p.assumed100) notes.push("assumed 100% profile");
  if (p.assumed82)  notes.push("assumed 82% profile");
  const noteTxt = notes.length ? ` (${notes.join("; ")})` : "";
  return `${p.label} \u2192 ~${p.odMm} mm${noteTxt}`;
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

// Build output
let html = `Largest tyre: <strong>${largest.normalized}</strong> (OD ~<strong>${largest.overall_mm.toFixed(0)} mm</strong>)<br><br>`;
html += `All entered sizes:<br>`;
html += parsed.map(p => `${p.normalized} → ~${p.overall_mm.toFixed(0)} mm`).join("<br>");

tyreResult.innerHTML = html;

// Store for Save/Results use
window._largestStockTyre = {
  label: largest.normalized,
  odMm: Math.round(largest.overall_mm)
};

  });
}



}); // <-- ONE AND ONLY closing brace for DOMContentLoaded
