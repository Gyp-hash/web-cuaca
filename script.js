// Base API
const geocodeBase = "https://geocoding-api.open-meteo.com/v1/search";
const weatherBase = "https://api.open-meteo.com/v1/forecast";

// DOM
const cityEl = document.getElementById("city");
const suggestionsEl = document.getElementById("suggestions");
const searchBtn = document.getElementById("searchBtn");
const geoBtn = document.getElementById("geoBtn");
const clearBtn = document.getElementById("clearBtn");
const output = document.getElementById("output");
const map = document.getElementById("map");
const historyEl = document.getElementById("history");
const darkToggle = document.getElementById("darkToggle");

// Init
initTheme();
loadHistory();
attachEvents();

/* -------------------------------------------
   EVENTS
------------------------------------------- */
function attachEvents() {
  searchBtn.addEventListener("click", onSearch);
  cityEl.addEventListener("input", debounce(loadSuggestions, 250));
  cityEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") chooseFirstSuggestion();
  });
  
  suggestionsEl.addEventListener("click", (e) => {
    const s = e.target.closest(".suggestion");
    if (!s) return;
    cityEl.value = s.dataset.name;
    hideSuggestions();
    searchWeatherByCoords(s.dataset.lat, s.dataset.lon, s.dataset.name);
  });

  geoBtn.addEventListener("click", useGeolocation);
  clearBtn.addEventListener("click", clearHistory);
  darkToggle.addEventListener("change", toggleTheme);

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) hideSuggestions();
  });
}

/* -------------------------------------------
   THEME
------------------------------------------- */
function initTheme() {
  const t = localStorage.getItem("theme") || "light";
  if (t === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    darkToggle.checked = true;
  }
}

function toggleTheme() {
  const dark = darkToggle.checked;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "");
  localStorage.setItem("theme", dark ? "dark" : "light");
}

/* -------------------------------------------
   AUTOCOMPLETE
------------------------------------------- */
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function loadSuggestions() {
  const q = cityEl.value.trim();
  if (!q) return hideSuggestions();

  suggestionsEl.style.display = "block";
  suggestionsEl.innerHTML = `<div class="suggestion small">Mencari...</div>`;

  try {
    const url = `${geocodeBase}?name=${encodeURIComponent(q)}&count=6&language=id`;
    const r = await fetch(url);
    const j = await r.json();

    if (!j.results || j.results.length === 0) {
      suggestionsEl.innerHTML = `<div class="suggestion small">Tidak ada hasil</div>`;
      return;
    }

    suggestionsEl.innerHTML = j.results
      .map((r) => {
        const label = `${r.name}${
          r.admin1 ? ", " + r.admin1 : ""
        }${r.country ? ", " + r.country : ""}`;
        return `<div class="suggestion" data-name="${escapeHtml(
          label
        )}" data-lat="${r.latitude}" data-lon="${r.longitude}">
          ${escapeHtml(label)}
        </div>`;
      })
      .join("");
  } catch (err) {
    console.error(err);
    suggestionsEl.innerHTML = `<div class="suggestion small">Gagal mengambil saran</div>`;
  }
}

function hideSuggestions() {
  suggestionsEl.style.display = "none";
  suggestionsEl.innerHTML = "";
}

function chooseFirstSuggestion() {
  const first = suggestionsEl.querySelector(".suggestion");
  if (first) {
    cityEl.value = first.dataset.name;
    hideSuggestions();
    searchWeatherByCoords(
      first.dataset.lat,
      first.dataset.lon,
      first.dataset.name
    );
  } else {
    onSearch();
  }
}

/* -------------------------------------------
   MAIN SEARCH
------------------------------------------- */
async function onSearch() {
  const q = cityEl.value.trim();
  if (!q) return showError("Masukkan nama kota.");

  output.innerHTML = `Mencari lokasi... <span class="spinner"></span>`;
  hideSuggestions();

  try {
    const url = `${geocodeBase}?name=${encodeURIComponent(
      q
    )}&count=1&language=id`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Geocoding error");

    const j = await r.json();
    if (!j.results || j.results.length === 0)
      return showError("Kota tidak ditemukan.");

    const loc = j.results[0];
    const name = `${loc.name}${
      loc.admin1 ? ", " + loc.admin1 : ""
    }${loc.country ? ", " + loc.country : ""}`;

    searchWeatherByCoords(loc.latitude, loc.longitude, name);
  } catch (err) {
    console.error(err);
    showError("Gagal mengambil data.");
  }
}

/* -------------------------------------------
   WEATHER FETCH
------------------------------------------- */
async function searchWeatherByCoords(lat, lon, name) {
  output.innerHTML = `Mengambil cuaca... <span class="spinner"></span>`;

  try {
    const url = `${weatherBase}?latitude=${lat}&longitude=${lon}&current_weather=true`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Weather API error");

    const j = await r.json();
    const cw = j.current_weather;

    if (!cw) throw new Error("Data kosong");

    renderResult(name, lat, lon, cw);
    setMapCoords(lat, lon);
    pushHistory(name);
  } catch (err) {
    console.error(err);
    showError("Gagal mengambil data cuaca.");
  }
}

/* -------------------------------------------
   GEOLOCATION
------------------------------------------- */
function useGeolocation() {
  if (!navigator.geolocation)
    return showError("Geolocation tidak didukung.");

  output.innerHTML = `Mendeteksi lokasi... <span class="spinner"></span>`;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      try {
        const url = `${geocodeBase}?latitude=${lat}&longitude=${lon}&count=1`;
        const r = await fetch(url);
        const j = await r.json();

        const label = j.results && j.results[0]
          ? `${j.results[0].name}${
              j.results[0].country ? ", " + j.results[0].country : ""
            }`
          : `${lat}, ${lon}`;

        cityEl.value = label;
        searchWeatherByCoords(lat, lon, label);
      } catch (err) {
        console.error(err);
        searchWeatherByCoords(lat, lon, `${lat}, ${lon}`);
      }
    },
    () => showError("Gagal mendeteksi lokasi."),
    { timeout: 10000 }
  );
}

/* -------------------------------------------
   RENDER UI
------------------------------------------- */
function renderResult(name, lat, lon, cw) {
  const icon = mapWeatherCodeToEmoji(cw.weathercode);

  output.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center">
      <div class="iconBox">${icon.char}</div>
      <div>
        <div style="font-weight:700;font-size:18px">${escapeHtml(name)}</div>
        <div class="small">Lat: ${lat}, Lon: ${lon}</div>
        <div class="bigTemp">${cw.temperature}°C</div>
        <div class="small">Angin: ${cw.windspeed} km/h · ${icon.label}</div>
      </div>
    </div>
  `;
}

function setMapCoords(lat, lon) {
  map.src = `https://www.google.com/maps?q=${lat},${lon}&hl=id&z=12&output=embed`;
}

/* -------------------------------------------
   HISTORY
------------------------------------------- */
function loadHistory() {
  const raw = localStorage.getItem("wc_cities");
  const arr = raw ? JSON.parse(raw) : [];

  historyEl.innerHTML = "";
  if (!arr.length) {
    historyEl.textContent = "Belum ada riwayat";
    return;
  }

  arr.slice().reverse().forEach((c) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = c;
    chip.onclick = () => {
      cityEl.value = c;
      onSearch();
    };
    historyEl.appendChild(chip);
  });
}

function pushHistory(name) {
  let arr = JSON.parse(localStorage.getItem("wc_cities") || "[]");

  arr = arr.filter((x) => x.toLowerCase() !== name.toLowerCase());
  arr.push(name);

  if (arr.length > 12) arr = arr.slice(arr.length - 12);

  localStorage.setItem("wc_cities", JSON.stringify(arr));
  loadHistory();
}

function clearHistory() {
  localStorage.removeItem("wc_cities");
  loadHistory();
}

/* -------------------------------------------
   UTILITIES
------------------------------------------- */
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

function mapWeatherCodeToEmoji(code) {
  const map = {
    0: { char: "☀️", label: "Cerah" },
    1: { char: "🌤️", label: "Cerah berawan" },
    2: { char: "⛅", label: "Berawan sebagian" },
    3: { char: "☁️", label: "Mendung" },
    45: { char: "🌫️", label: "Berkabut" },
    48: { char: "🌫️", label: "Kabut es" },
    51: { char: "🌦️", label: "Gerimis ringan" },
    53: { char: "🌧️", label: "Gerimis sedang" },
    55: { char: "🌧️", label: "Gerimis lebat" },
    56: { char: "🌧️", label: "Gerimis beku" },
    57: { char: "🌧️", label: "Gerimis beku lebat" },
    61: { char: "🌧️", label: "Hujan ringan" },
    63: { char: "🌧️", label: "Hujan sedang" },
    65: { char: "🌧️", label: "Hujan lebat" },
    66: { char: "🌧️", label: "Hujan beku" },
    67: { char: "🌧️", label: "Hujan beku lebat" },
    71: { char: "❄️", label: "Salju ringan" },
    73: { char: "❄️", label: "Salju sedang" },
    75: { char: "❄️", label: "Salju lebat" },
    77: { char: "❄️", label: "Butiran salju" },
    80: { char: "🌧️", label: "Hujan lokal" },
    81: { char: "🌧️", label: "Hujan deras" },
    82: { char: "⛈️", label: "Hujan badai" },
    85: { char: "❄️", label: "Hujan salju ringan" },
    86: { char: "❄️", label: "Hujan salju lebat" },
    95: { char: "⛈️", label: "Badai petir" },
    96: { char: "⛈️", label: "Badai petir (es ringan)" },
    99: { char: "⛈️", label: "Badai petir (es lebat)" },
  };
  return map[code] || { char: "🌤️", label: "Tidak diketahui" };
}
