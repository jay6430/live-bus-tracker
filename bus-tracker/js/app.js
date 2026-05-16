/**
 * Bus Tracker — Main Application
 * Handles API calls (JSONP), data parsing, and app state.
 */

const CONFIG = {
  API_URL: 'https://fms.locanix.net/TrackingTool/src/getPosition.ashx',
  API_PARAMS: {
    format: 'json',
    t: '62938I5148639916835328'
  },
  REFRESH_INTERVAL: 10000,        // 10 seconds
  MAP_CENTER: { lat: 20.9500, lng: 72.9300 }, // Navsari, Gujarat, India
  MAP_ZOOM: 13,
  SPEED_THRESHOLD: 0.5            // km/h — below this the bus is treated as stopped
};

const state = {
  buses: [],
  markers: {},
  map: null,
  lastFetch: null,
  isRefreshing: false,
  history: {}
};

const elements = {
  refreshBtn:       document.getElementById('refreshBtn'),
  lastUpdate:       document.getElementById('lastUpdate'),
  connectionStatus: document.getElementById('connectionStatus'),
  totalBuses:       document.getElementById('totalBuses'),
  movingBuses:      document.getElementById('movingBuses'),
  stoppedBuses:     document.getElementById('stoppedBuses'),
  avgSpeed:         document.getElementById('avgSpeed'),
  busList:          document.getElementById('busList'),
  searchBus:        document.getElementById('searchBus'),
  modal:            document.getElementById('busModal'),
  modalClose:       document.querySelector('.modal-close')
};

/**
 * Fetch live bus positions via JSONP (avoids CORS restriction on the fleet API)
 */
async function fetchBusData() {
  if (state.isRefreshing) return;

  state.isRefreshing = true;
  updateConnectionStatus('loading');

  try {
    const callbackName = `_bt_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

    window[callbackName] = function(response) {
      delete window[callbackName];
      if (response && Array.isArray(response.markers)) {
        processBusData(response.markers);
        updateConnectionStatus('online');
      } else {
        handleError('Unexpected API response structure');
        updateConnectionStatus('offline');
      }
      state.isRefreshing = false;
    };

    const params = new URLSearchParams({
      ...CONFIG.API_PARAMS,
      callback: callbackName,
      _: Date.now()
    });

    const script = document.createElement('script');
    script.src = `${CONFIG.API_URL}?${params.toString()}`;
    script.onerror = () => {
      delete window[callbackName];
      handleError('Failed to load bus data from API');
      state.isRefreshing = false;
      updateConnectionStatus('offline');
    };

    // Self-clean the script tag after 15 s to avoid DOM build-up
    setTimeout(() => { if (script.parentNode) script.parentNode.removeChild(script); }, 15000);

    document.body.appendChild(script);

  } catch (error) {
    console.error('fetchBusData error:', error);
    handleError('Network error');
    state.isRefreshing = false;
    updateConnectionStatus('offline');
  }
}

/**
 * Normalise raw API markers into a consistent bus object shape
 */
function processBusData(markers) {
  state.buses = markers.map(bus => {
    const speedKmh = parseFloat(bus.viteza) * 3.6;
    const direction = parseFloat(bus.directie) || 0;
    const timestamp = parseInt(bus.ora, 10) * 1000;

    return {
      uid:              String(bus.uid),
      name:             bus.nume || `Bus ${bus.uid}`,
      lat:              parseFloat(bus.lat),
      lng:              parseFloat(bus.lng),
      altitude:         parseFloat(bus.altitudine) || 0,
      direction,
      speed:            speedKmh,
      timestamp,
      isMoving:         speedKmh > CONFIG.SPEED_THRESHOLD,
      lastUpdate:       formatTimeAgo(timestamp),
      speedDisplay:     `${speedKmh.toFixed(1)} km/h`,
      directionDisplay: `${Math.round(direction)}° ${getCardinalDirection(direction)}`
    };
  });

  // Append to per-bus coordinate history (used for polyline trails)
  state.buses.forEach(bus => {
    if (!state.history[bus.uid]) state.history[bus.uid] = [];

    const history = state.history[bus.uid];
    const newPos  = [bus.lat, bus.lng];
    const last    = history[history.length - 1];

    if (!last || last[0] !== newPos[0] || last[1] !== newPos[1]) {
      history.push(newPos);
    }

    // Cap trail length to keep memory bounded
    if (history.length > 100) history.shift();
  });

  state.lastFetch = new Date();

  updateDashboard();
  updateMapMarkers();
  updateBusList();
  updateLastUpdateTime();
}

/**
 * Refresh the summary metric cards in the sidebar
 */
function updateDashboard() {
  const total   = state.buses.length;
  const moving  = state.buses.filter(b => b.isMoving).length;
  const stopped = total - moving;
  const avgSpeed = total > 0
    ? (state.buses.reduce((sum, b) => sum + b.speed, 0) / total).toFixed(1)
    : 0;

  elements.totalBuses.textContent  = total;
  elements.movingBuses.textContent = moving;
  elements.stoppedBuses.textContent = stopped;
  elements.avgSpeed.textContent    = `${avgSpeed} km/h`;
}

/**
 * Human-readable "time ago" string from a Unix-ms timestamp
 */
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60)    return 'Just now';
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Convert a compass bearing (degrees) to an 8-point cardinal label
 */
function getCardinalDirection(degrees) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((degrees % 360) + 360) % 360 / 45) % 8];
}

function updateLastUpdateTime() {
  if (state.lastFetch) {
    elements.lastUpdate.textContent = `Last update: ${state.lastFetch.toLocaleTimeString()}`;
  }
}

function updateConnectionStatus(status) {
  const labels = { online: 'Online', offline: 'Offline', loading: 'Loading...' };
  elements.connectionStatus.className = `status-indicator ${status}`;
  elements.connectionStatus.textContent = `● ${labels[status] || status}`;
}

function handleError(message) {
  console.error('[BusTracker]', message);
}

/**
 * Bootstrap the application
 */
function init() {
  elements.refreshBtn.addEventListener('click', fetchBusData);

  elements.modalClose.addEventListener('click', () => {
    elements.modal.classList.remove('active');
  });

  elements.searchBus.addEventListener('input', updateBusList);

  fetchBusData();
  setInterval(fetchBusData, CONFIG.REFRESH_INTERVAL);
}

document.addEventListener('DOMContentLoaded', init);

// Shared state exposed to map and dashboard modules
window.BusTracker = { state, CONFIG, fetchBusData, processBusData };
