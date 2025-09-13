
'use strict';              // optional but recommended

// ---- Globals ----
let qlvimData = [];
let swayBarIssue = null;   // null = unanswered, true = issue, false = compliant

/* ---------------- Tabs ---------------- */
function openTab(evt, tabName) {
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
function parseTyreSize(sizeStr) {
  if (!sizeStr) return { ok: false, reason: "empty" };
  const s = sizeStr.trim().toUpperCase().replace(/\s+/g, "");

  // Metric: 265/75R16  or  265/75 16
  const metricRe = /^(\d{3})\/(\d{2,3})R?(\d{2}(?:\.\d+)?)$/;

  // Imperial: 35/12.5R16  or  35x12.5R16
  const imperialRe = /^(\d{2}(?:\.\d+)?)[X\/](\d{1,2}(?:\.\d+)?)R?(\d{2}(?:\.\d+)?)$/;

  // Metric?
  let m = s.match(metricRe);
  if (m) {
    const width = parseFloat(m[1]);   // mm
    const aspect = parseFloat(m[2]);  // %
    const rimIn = parseFloat(m[3]);   // in
    const overall = (2 * (width * aspect / 100)) + (rimIn * 25.4); // mm
    return {
      ok: true, type: "metric",
      width_mm: width, aspect, rim_in: rimIn, overall_mm: overall,
      normalized: `${width}/${aspect}R${rimIn}`
    };
  }

  // Imperial?
  m = s.match(imperialRe);
  if (m) {
    const overallIn = parseFloat(m[1]); // overall dia in
    const sectionIn = parseFloat(m[2]); // section width in (info only)
    const rimIn     = parseFloat(m[3]); // in
    const overall   = overallIn * 25.4; // mm
    return {
      ok: true, type: "imperial",
      width_mm: sectionIn * 25.4, aspect: null, rim_in: rimIn, overall_mm: overall,
      normalized: `${overallIn.toString().replace(/\.0+$/,"")}x${sectionIn.toString().replace(/\.0+$/,"")}R${rimIn}`
    };
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
  const tyreWidth  = document.getElementById("tyreWidth").value.trim();
  const tyreAspect = document.getElementById("tyreAspect").value.trim();
  const tyreRim    = document.getElementById("tyreRim").value.trim();
  const tyrePlacard = (tyreWidth && tyreAspect && tyreRim) ? `${tyreWidth}/${tyreAspect}R${tyreRim}` : "-";

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
  openTab({ currentTarget: null }, 'results');

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
function compileResults(silent = false, stayHere = false) {
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
  const frontMsg = checkLiftValues(stockFront, measuredFront);
  const rearMsg  = checkLiftValues(stockRear,  measuredRear);

  frontDiv.innerText = frontMsg.text; 
  frontDiv.className = `result ${frontMsg.className}`;
  rearDiv.innerText  = rearMsg.text;  
  rearDiv.className  = `result ${rearMsg.className}`;

  const originalRelationship = stockFront - stockRear;
  const currentRelationship  = measuredFront - measuredRear;

  if (originalRelationship !== currentRelationship) {
  summaryDiv.innerHTML =
    `<p><strong><span style="color:red;">Unequal Lift</span></strong> – ` +
    `<strong>The original relationship between the front and rear suspension is ${originalRelationship} mm and must not be changed. ` +
    `Currently the relationship is ${currentRelationship} mm. ` +
    `Rectify the vehicle’s suspension relationship to comply with s.5, LS9, QCOP or s6.12.i QLVIM.</strong></p>`;
} else {
  summaryDiv.innerHTML = "";
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


  // Tyre Diameter increase check (>50 mm)
  // Tyre Diameter (paragraph style, only "Tyre Diameter" coloured)
const tyreDiaAlert = document.getElementById("tyreDiaAlert");
if (tyreDiaAlert) {
  tyreDiaAlert.innerHTML = "";
  tyreDiaAlert.className = "result";

  // Home placard (metric numeric fields)
  const sw = parseFloat(document.getElementById("tyreWidth").value);   // mm
  const sa = parseFloat(document.getElementById("tyreAspect").value);  // %
  const sr = parseFloat(document.getElementById("tyreRim").value);     // inches

  // Measured (auto-detected metric/imperial string)
  const measuredStr = document.getElementById("m_tyreSize")?.value || "";
  const p = parseTyreSize(measuredStr);

  if (![sw, sa, sr].some(isNaN) && p?.ok) {
    const stockDia    = (2 * (sw * sa / 100)) + (sr * 25.4); // mm
    const measuredDia = p.overall_mm;                        // mm
    const delta       = measuredDia - stockDia;              // mm
    const incStr      = `${delta >= 0 ? "+" : ""}${delta.toFixed(0)} mm`;
    const compliant   = delta <= 50; // increase > 50 mm is NOT compliant

    if (compliant) {
      tyreDiaAlert.innerHTML =
        `<p><strong><span style="color:green;">Tyre Diameter</span></strong> – ` +
        `Stock Diameter: ~${stockDia.toFixed(0)} mm, ` +
        `Measured Diameter: ~${measuredDia.toFixed(0)} mm, ` +
        `Increase: ${incStr} (within 50 mm limit).</p>`;
    } else {
      tyreDiaAlert.innerHTML =
        `<p><strong><span style="color:red;">Tyre Diameter</span></strong> – ` +
        `Stock Diameter: ~${stockDia.toFixed(0)} mm, ` +
        `Measured Diameter: ~${measuredDia.toFixed(0)} mm, ` +
        `Increase: ${incStr} (exceeds 50 mm limit). ` +
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
  function sectionTitle(section) { return `Section ${section}`; }
  function qlvimLink(page) {
  // Always relative from viewer/ → assets/
  const file = encodeURIComponent(`../assets/QLVIM.pdf?nocache=${Date.now()}`);
  return `viewer/viewer.html?file=${file}#page=${page}`;
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
      out.innerHTML = "<p><em>No relevant sections found. Try a simpler phrase.</em></p>";
      return;
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
  wrap.style.marginBottom = "14px";
  wrap.innerHTML = `
    <div>
      <strong><span style="color:red;">${category}</span></strong>
      – ${clause}
      – ensure vehicle complies with
      <strong><a href="${link}" target="_blank" rel="noopener" style="color:blue; text-decoration:underline;">[${secText}]</a></strong>
      of QLVIM.
    </div>

    <div style="margin-top:6px;">
      <em>Note:</em>
      <input id="note-${i}" type="text" placeholder="optional note" style="width:70%; max-width:640px; padding:6px; margin-left:6px;">
    </div>

    <div style="margin-top:8px;">
  <button type="button" class="action"
    onclick="addToResults(
      '${category.replace(/'/g, "\\'")}',
      '${sec.replace(/'/g, "\\'")}',
      '${clause.replace(/'/g, "\\'")}',
      ${page},
      'note-${i}',
      this
    )">
    Add to Results
  </button>
</div>

  `;
  out.appendChild(wrap);
});
  }

document.addEventListener("DOMContentLoaded", () => {
  // ✅ Wire the Mod Codes buttons
  document.getElementById("modCodeButton")
    ?.addEventListener("click", showModDescriptions);
  document.getElementById("modCodeClear")
    ?.addEventListener("click", clearModCodes);

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
        hdr.style.margin = "8px 0 10px";
        hdr.style.fontSize = "13px";
        hdr.style.color = "#555";
        hdr.textContent = "Top 3 results";
        out.insertBefore(hdr, out.firstChild);
      }
    };
  } else {
    console.warn("searchQLVIM() not defined yet. Make sure the base function is declared above this script.");
  }
});
