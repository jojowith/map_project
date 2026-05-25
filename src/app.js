const TAIPEI_CENTER = [25.0478, 121.5319];
const DISTRICT_CODES = {
  "63000010": "松山區",
  "63000020": "信義區",
  "63000030": "大安區",
  "63000040": "中山區",
  "63000050": "中正區",
  "63000060": "大同區",
  "63000070": "萬華區",
  "63000080": "文山區",
  "63000090": "南港區",
  "63000100": "內湖區",
  "63000110": "士林區",
  "63000120": "北投區"
};

const FALLBACK_SMOKING = [
  { id: "demo-1", district: "信義區", name: "臺北市政府1", address: "市府路1號", openTime: "週一至週五 07:00-19:00", lat: 25.03836, lng: 121.56394, crowd: 38 },
  { id: "demo-2", district: "中正區", name: "臺北車站東側廣場", address: "北平西路3號", openTime: "24小時開放", lat: 25.047989, lng: 121.518077, crowd: 64 },
  { id: "demo-3", district: "松山區", name: "臺北小巨蛋", address: "南京東路4段2號", openTime: "24小時開放", lat: 25.049929, lng: 121.549278, crowd: 81 },
  { id: "demo-4", district: "萬華區", name: "臺北市萬華區行政中心", address: "和平西路3段120號", openTime: "06:00-23:00", lat: 25.03502, lng: 121.5002, crowd: 45 }
];

const FALLBACK_RESTRICTED = [
  { id: "tpe-demo-1", city: "臺北市", district: "松山區", name: "健康國小周邊人行道", address: "延壽街168號", lat: 25.05662219, lng: 121.5629231, radius: 80 },
  { id: "ntpc-1", city: "新北市", district: "蘆洲區", name: "永康公園", address: "蘆洲區長安街204號", lat: 25.0842, lng: 121.4628, radius: 95 }
];

const state = {
  mode: "smoker",
  user: { lat: 25.0478, lng: 121.5319 },
  smokingAreas: [],
  restrictedAreas: [],
  mobilityNodes: [],
  ranked: [],
  district: "all",
  search: "",
  showRestricted: true,
  showMobility: false,
  smokingMarkers: [],
  restrictedLayers: [],
  mobilityLayers: [],
  routeLayer: null,
  userMarker: null,
  selectedTarget: null,
  metadata: {}
};

const map = L.map("map", { zoomControl: false }).setView(TAIPEI_CENTER, 13);
L.control.zoom({ position: "bottomleft" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const els = {
  nearestName: document.querySelector("#nearest-name"),
  nearestDistance: document.querySelector("#nearest-distance"),
  nearestCrowd: document.querySelector("#nearest-crowd"),
  smokingCount: document.querySelector("#smoking-count"),
  restrictedCount: document.querySelector("#restricted-count"),
  warningCount: document.querySelector("#warning-count"),
  mobilityCount: document.querySelector("#mobility-count"),
  loadList: document.querySelector("#load-list"),
  candidateList: document.querySelector("#candidate-list"),
  districtBars: document.querySelector("#district-bars"),
  sparkline: document.querySelector("#sparkline"),
  reasonList: document.querySelector("#reason-list"),
  alertBanner: document.querySelector("#alert-banner"),
  alertText: document.querySelector("#alert-text"),
  locateButton: document.querySelector("#locate-button"),
  districtFilter: document.querySelector("#district-filter"),
  searchInput: document.querySelector("#search-input"),
  toggleRestricted: document.querySelector("#toggle-restricted"),
  toggleMobility: document.querySelector("#toggle-mobility"),
  freshness: document.querySelector("#freshness"),
  riskLevel: document.querySelector("#risk-level"),
  chatForm: document.querySelector("#chat-form"),
  chatMessage: document.querySelector("#chat-message"),
  chatLog: document.querySelector("#chat-log")
};

init();

async function init() {
  const [smokingAreas, restrictedAreas, mobilityNodes, metadata] = await Promise.all([
    loadJson("./data/smoking_areas.json", FALLBACK_SMOKING),
    loadJson("./data/no_smoking_areas.json", FALLBACK_RESTRICTED),
    loadJson("./data/mobility_nodes.json", []),
    loadJson("./data/source_manifest.json", {})
  ]);

  state.smokingAreas = smokingAreas
    .map((area, index) => ({ ...area, crowd: area.crowd ?? simulatedCrowd(index) }))
    .filter(hasLatLng);
  state.restrictedAreas = restrictedAreas.filter(hasLatLng);
  state.mobilityNodes = mobilityNodes.filter(hasLatLng);
  state.metadata = metadata;

  bindEvents();
  hydrateDistricts();
  render();
  locateUser(false);
}

async function loadJson(url, fallback) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("missing data");
    return await response.json();
  } catch {
    return fallback;
  }
}

function hasLatLng(item) {
  return Number.isFinite(item.lat) && Number.isFinite(item.lng);
}

function bindEvents() {
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      if (state.mode === "clean") {
        state.showMobility = true;
        els.toggleMobility.checked = true;
      }
      document.querySelectorAll(".mode-button").forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });

  document.querySelectorAll(".city-pill").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".city-pill").forEach((item) => item.classList.toggle("active", item === button));
    });
  });

  els.districtFilter.addEventListener("change", (event) => {
    state.district = event.target.value;
    render();
  });
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });
  els.toggleRestricted.addEventListener("change", (event) => {
    state.showRestricted = event.target.checked;
    render();
  });
  els.toggleMobility.addEventListener("change", (event) => {
    state.showMobility = event.target.checked;
    render();
  });
  els.locateButton.addEventListener("click", () => locateUser(true));
  els.chatForm.addEventListener("submit", handleChat);
}

function hydrateDistricts() {
  const districts = [...new Set(state.smokingAreas.map((area) => area.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  districts.forEach((district) => {
    const option = document.createElement("option");
    option.value = district;
    option.textContent = district;
    els.districtFilter.appendChild(option);
  });
}

function locateUser(shouldPan) {
  if (!navigator.geolocation) {
    render();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.user = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (shouldPan) map.setView([state.user.lat, state.user.lng], 15);
      render();
    },
    () => render(),
    { enableHighAccuracy: true, timeout: 6500, maximumAge: 60000 }
  );
}

function render() {
  clearMap();
  renderUser();
  state.ranked = rankCandidates();
  state.selectedTarget = state.ranked[0] || null;
  renderSmokingAreas();
  renderRestrictedAreas();
  renderMobility();
  renderRecommendation();
  renderStats();
  renderOps();
  requestAnimationFrame(() => map.invalidateSize());
}

function clearMap() {
  [...state.smokingMarkers, ...state.restrictedLayers, ...state.mobilityLayers].forEach((layer) => layer.remove());
  state.smokingMarkers = [];
  state.restrictedLayers = [];
  state.mobilityLayers = [];
  if (state.routeLayer) state.routeLayer.remove();
  state.routeLayer = null;
}

function filteredSmokingAreas() {
  return state.smokingAreas.filter((area) => {
    const districtOk = state.district === "all" || area.district === state.district;
    const haystack = `${area.name} ${area.address} ${area.district}`.toLowerCase();
    return districtOk && (!state.search || haystack.includes(state.search));
  });
}

function renderUser() {
  if (state.userMarker) state.userMarker.remove();
  state.userMarker = L.marker([state.user.lat, state.user.lng], {
    icon: L.divIcon({ className: "user-marker", iconSize: [18, 18] })
  }).addTo(map).bindPopup("目前位置");
}

function renderSmokingAreas() {
  const visibleAreas = filteredSmokingAreas()
    .map((area) => ({ ...area, distance: distanceMeters(state.user, area) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 220);

  visibleAreas.forEach((area) => {
    const marker = L.marker([area.lat, area.lng], {
      icon: L.divIcon({ className: `smoking-marker ${crowdClass(area.crowd)}`, iconSize: [18, 18] })
    }).addTo(map);
    marker.bindPopup(`<strong>${escapeHtml(area.name)}</strong><br>${escapeHtml(area.address)}<br>開放時間：${escapeHtml(area.openTime || "未提供")}<br>承載率：${area.crowd}%`);
    marker.on("click", () => {
      state.selectedTarget = scoreSmokingCandidate(area);
      renderRecommendation();
    });
    state.smokingMarkers.push(marker);
  });
}

function renderRestrictedAreas() {
  if (!state.showRestricted) return;
  state.restrictedAreas
    .map((area) => ({ ...area, distance: distanceMeters(state.user, area) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 420)
    .forEach((area) => {
      const layer = L.circle([area.lat, area.lng], {
        radius: area.radius || 70,
        color: "#ff675f",
        fillColor: "#ff675f",
        fillOpacity: 0.15,
        weight: 1.5
      }).addTo(map);
      layer.bindPopup(`<strong>${escapeHtml(area.name)}</strong><br>${escapeHtml(area.address)}<br>公告禁菸區，違規可處新臺幣 2,000 至 10,000 元罰鍰`);
      state.restrictedLayers.push(layer);
    });
}

function renderMobility() {
  if (!state.showMobility) return;
  state.mobilityNodes
    .map((node) => ({ ...node, distance: distanceMeters(state.user, node) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 160)
    .forEach((node) => {
      const radius = 18 + Math.round((node.pressure || 0) * 26);
      const layer = L.circle([node.lat, node.lng], {
        radius,
        color: "#f2b84b",
        fillColor: "#f2b84b",
        fillOpacity: 0.13,
        weight: 1
      }).addTo(map);
      layer.bindPopup(`<strong>${escapeHtml(node.name)}</strong><br>${escapeHtml(node.address || "")}<br>代理熱度：${Math.round((node.pressure || 0) * 100)}%`);
      state.mobilityLayers.push(layer);
    });
}

function rankCandidates() {
  if (state.mode === "clean") {
    return filteredCleanWaypoints()
      .map(scoreCleanWaypoint)
      .sort((a, b) => a.score - b.score);
  }

  return filteredSmokingAreas()
    .map(scoreSmokingCandidate)
    .sort((a, b) => a.score - b.score);
}

function filteredCleanWaypoints() {
  return state.mobilityNodes.filter((node) => {
    const districtOk = state.district === "all" || node.district === state.district;
    const haystack = `${node.name} ${node.address} ${node.district}`.toLowerCase();
    return districtOk && (!state.search || haystack.includes(state.search));
  });
}

function scoreSmokingCandidate(area) {
  const distance = distanceMeters(state.user, area);
  const nearbyRestricted = nearestDistance(area, state.restrictedAreas, 260);
  const nearbyMobility = nearestDistance(area, state.mobilityNodes, 320);
  const crowd = normalizeCrowd(area.crowd);
  const restrictedPenalty = nearbyRestricted ? Math.max(0, 260 - nearbyRestricted.distance) * 5 : 0;
  const mobilityPenalty = nearbyMobility ? (nearbyMobility.node.pressure || 0.4) * Math.max(0, 320 - nearbyMobility.distance) * 2.4 : 0;
  const crowdPenalty = crowd * 580;
  const score = distance + crowdPenalty + restrictedPenalty + mobilityPenalty;

  return {
    ...area,
    kind: "smoking",
    distance,
    score,
    loadLabel: `承載率 ${area.crowd}%`,
    restrictedPenalty,
    mobilityPenalty,
    nearbyRestricted,
    nearbyMobility,
    reasons: buildSmokingReasons({ distance, crowd, nearbyRestricted, nearbyMobility, restrictedPenalty, mobilityPenalty })
  };
}

function scoreCleanWaypoint(node) {
  const distance = distanceMeters(state.user, node);
  const nearbySmoking = nearestDistance(node, state.smokingAreas, 360);
  const nearbyRestricted = nearestDistance(node, state.restrictedAreas, 220);
  const pressure = node.pressure || 0.45;
  const smokingPenalty = nearbySmoking ? Math.max(0, 360 - nearbySmoking.distance) * 6 : 0;
  const restrictedPenalty = nearbyRestricted ? Math.max(0, 220 - nearbyRestricted.distance) * 3 : 0;
  const pressurePenalty = pressure * 520;
  const distancePenalty = distance > 1400 ? (distance - 1400) * 0.65 : distance;
  const score = distancePenalty + smokingPenalty + restrictedPenalty + pressurePenalty;

  return {
    ...node,
    kind: "clean",
    crowd: Math.round(pressure * 100),
    distance,
    score,
    loadLabel: `人流代理 ${Math.round(pressure * 100)}%`,
    nearbySmoking,
    nearbyRestricted,
    reasons: buildCleanReasons({ distance, pressure, nearbySmoking, nearbyRestricted, smokingPenalty, restrictedPenalty })
  };
}

function renderRecommendation() {
  const target = state.selectedTarget || state.ranked[0];
  if (!target) {
    els.nearestName.textContent = "沒有符合條件的點位";
    els.nearestDistance.textContent = "-- m";
    els.nearestCrowd.textContent = "調整篩選條件";
    els.reasonList.innerHTML = "";
    return;
  }

  els.nearestName.textContent = target.name;
  els.nearestDistance.textContent = `${formatDistance(target.distance)}`;
  els.nearestCrowd.textContent = target.loadLabel || `承載率 ${target.crowd}%`;
  els.reasonList.innerHTML = target.reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("");

  const route = makeRoute(target);
  if (state.routeLayer) state.routeLayer.remove();
  state.routeLayer = L.polyline(route, {
    color: target.kind === "clean" ? "#2ee58f" : "#4cc9ff",
    weight: 5,
    opacity: 0.88,
    dashArray: "10 10"
  }).addTo(map);

  const warning = nearestRestrictedDistance(state.user);
  const isWarning = warning && warning.distance < 180;
  els.alertBanner.hidden = !isWarning;
  els.alertText.textContent = isWarning ? `你距離 ${warning.node.name} 約 ${Math.round(warning.distance)} 公尺，請避開公告禁菸範圍。` : "";
}

function renderStats() {
  const warningCount = state.restrictedAreas.filter((area) => distanceMeters(state.user, area) - (area.radius || 70) < 180).length;
  els.smokingCount.textContent = state.smokingAreas.length;
  els.restrictedCount.textContent = state.restrictedAreas.length;
  els.warningCount.textContent = warningCount;
  els.mobilityCount.textContent = state.mobilityNodes.length;

  els.candidateList.innerHTML = state.ranked.slice(0, 5).map((area, index) => `
    <button class="candidate-item" data-id="${escapeHtml(area.id)}">
      <span class="rank">${index + 1}</span>
      <span class="candidate-main">
        <strong>${escapeHtml(area.name)}</strong>
        <small>${formatDistance(area.distance)} · ${escapeHtml(area.district || "未分區")} · ${escapeHtml(area.kind === "clean" ? "清淨路線錨點" : "合法吸菸點")}</small>
      </span>
      <span class="score">${Math.round(area.score)}</span>
    </button>
  `).join("");
  els.candidateList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTarget = state.ranked.find((area) => area.id === button.dataset.id);
      if (state.selectedTarget) {
        map.setView([state.selectedTarget.lat, state.selectedTarget.lng], 16);
        renderRecommendation();
      }
    });
  });

  els.loadList.innerHTML = state.smokingAreas
    .slice()
    .sort((a, b) => b.crowd - a.crowd)
    .slice(0, 6)
    .map((area) => {
      const color = area.crowd > 80 ? "var(--red)" : area.crowd > 60 ? "var(--amber)" : "var(--green)";
      return `
        <div class="load-item">
          <div class="load-top">
            <span>${escapeHtml(area.name)}</span>
            <strong>${area.crowd}%</strong>
          </div>
          <div class="load-bar"><div class="load-fill" style="width:${area.crowd}%;background:${color}"></div></div>
        </div>
      `;
    }).join("");
}

function renderOps() {
  const updatedAt = state.metadata.generatedAt || "未同步";
  els.freshness.textContent = updatedAt === "未同步" ? updatedAt : updatedAt.replace("T", " ").slice(0, 16);
  const maxCrowd = Math.max(...state.ranked.slice(0, 8).map((area) => area.crowd || 0), 0);
  els.riskLevel.textContent = maxCrowd > 80 ? "高" : maxCrowd > 60 ? "中" : "低";

  const byDistrict = new Map();
  state.smokingAreas.forEach((area) => {
    byDistrict.set(area.district || "未分區", (byDistrict.get(area.district || "未分區") || 0) + 1);
  });
  const max = Math.max(...byDistrict.values(), 1);
  els.districtBars.innerHTML = [...byDistrict.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([district, count]) => `
      <div class="district-bar">
        <span>${escapeHtml(district)}</span>
        <div><i style="width:${Math.max(7, count / max * 100)}%"></i></div>
        <strong>${count}</strong>
      </div>
    `).join("");

  const points = [42, 50, 62, 73, 69, 58, 51].map((value, index) => {
    const height = Math.max(16, value);
    return `<i style="height:${height}%" title="+${index * 10} 分鐘 ${value}%"></i>`;
  }).join("");
  els.sparkline.innerHTML = points;
}

function makeRoute(target) {
  const start = [state.user.lat, state.user.lng];
  const end = [target.lat, target.lng];
  const blocker = nearestRestrictedDistance(midpoint(state.user, target));
  if (!blocker || blocker.distance > 300) return [start, end];

  const offset = target.kind === "clean" ? 0.0046 : -0.0046;
  return [start, [blocker.node.lat + offset, blocker.node.lng + offset], end];
}

function buildSmokingReasons({ distance, crowd, nearbyRestricted, nearbyMobility, restrictedPenalty, mobilityPenalty }) {
  const reasons = [`步行約 ${Math.max(1, Math.round(distance / 78))} 分鐘`];
  reasons.push(crowd > 0.75 ? "高負載，已加入分流懲罰" : crowd > 0.55 ? "中等負載，仍可前往" : "低負載，建議前往");
  if (restrictedPenalty > 0 && nearbyRestricted) reasons.push(`鄰近 ${nearbyRestricted.node.name}，路線避讓`);
  if (mobilityPenalty > 0 && nearbyMobility) reasons.push(`鄰近 ${nearbyMobility.node.name} 人流代理熱點`);
  return reasons.slice(0, 4);
}

function buildCleanReasons({ distance, pressure, nearbySmoking, nearbyRestricted, smokingPenalty, restrictedPenalty }) {
  const reasons = [`步行約 ${Math.max(1, Math.round(distance / 78))} 分鐘`];
  reasons.push(pressure > 0.7 ? "人流偏高，降低排序" : pressure > 0.45 ? "人流中等，可作替代路徑" : "人流較低，適合淨步");
  if (smokingPenalty > 0 && nearbySmoking) reasons.push(`避開 ${nearbySmoking.node.name} 周邊煙霧緩衝`);
  if (restrictedPenalty > 0 && nearbyRestricted) reasons.push(`避開 ${nearbyRestricted.node.name} 管制熱點`);
  if (!smokingPenalty && !restrictedPenalty) reasons.push("周邊吸菸/禁菸衝突較低");
  return reasons.slice(0, 4);
}

function nearestDistance(origin, nodes, maxDistance = Infinity) {
  let best = null;
  nodes.forEach((node) => {
    const distance = distanceMeters(origin, node) - (node.radius || 0);
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { node, distance };
  });
  return best;
}

function nearestRestrictedDistance(origin) {
  return nearestDistance(origin, state.restrictedAreas);
}

function midpoint(a, b) {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

function normalizeCrowd(value) {
  return Math.max(0, Math.min(1, (value || 0) / 100));
}

function distanceMeters(a, b) {
  const earth = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function toRad(value) {
  return value * Math.PI / 180;
}

function simulatedCrowd(index) {
  return [36, 64, 82, 45, 55, 72, 28, 91, 49, 67, 31, 77][index % 12];
}

function crowdClass(crowd) {
  if (crowd > 80) return "crowd-high";
  if (crowd > 60) return "crowd-mid";
  return "crowd-low";
}

function formatDistance(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.round(value)} m`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function handleChat(event) {
  event.preventDefault();
  const text = els.chatMessage.value.trim();
  if (!text) return;
  appendMessage(text, "user");
  els.chatMessage.value = "";
  appendMessage(localAiReply(text), "ai");
}

function appendMessage(text, type) {
  const node = document.createElement("div");
  node.className = `message ${type}`;
  node.textContent = text;
  els.chatLog.appendChild(node);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function localAiReply(text) {
  if (text.includes("AQI") || text.includes("空氣") || text.includes("空品")) {
    return "AQI 已預留 API 位置。環境部正式 API 需要會員 API key；接上後可把 AQI 101 以上列為健康提醒，150 以上提高停留風險。";
  }
  if (text.includes("施工") || text.includes("繞路")) {
    return "正式版可接臺北市今日施工資訊，將影響通行的路段加入路徑懲罰。這版先把規則與 UI 放好。";
  }
  if (text.includes("罰") || text.includes("禁菸")) {
    return "公告禁菸場所違規吸菸可處新臺幣 2,000 至 10,000 元罰鍰。地圖紅色範圍是避讓與警示圖層。";
  }
  if (text.includes("門診") || text.includes("戒菸")) {
    return "正式版可串接戒菸門診或衛福部戒菸服務資料。現在可先撥打戒菸專線 0800-636363，或搜尋附近醫療院所戒菸服務。";
  }
  return "我可以說明推薦原因、禁菸規則、人流分流與戒菸資訊。接上 AI API 後會改為 RAG 回覆。";
}
