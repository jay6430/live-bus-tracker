/**
 * Bus Tracker - Map Module
 * Leaflet + OpenStreetMap, no API key required.
 */

let map;
let markers = {};
let polylines = {};
let markerClusterGroup;
let currentBaseLayer;

const MAP_CONFIG = {
  defaultCenter: [20.9500, 72.9300], // Navsari, Gujarat, India
  defaultZoom: 13,
  maxZoom: 19,
  minZoom: 6,
  tileLayers: {
    osm: {
      name: 'OpenStreetMap',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    osmHot: {
      name: 'OSM Humanitarian',
      url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, Tiles by <a href="https://www.hotosm.org/">HOT</a>'
    },
    opentopomap: {
      name: 'OpenTopoMap',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
    }
  }
};

/**
 * Initialize Leaflet Map
 */
function initMap() {
  map = L.map('map', {
    center: MAP_CONFIG.defaultCenter,
    zoom: MAP_CONFIG.defaultZoom,
    maxZoom: MAP_CONFIG.maxZoom,
    minZoom: MAP_CONFIG.minZoom,
    zoomControl: true,
    attributionControl: true
  });

  currentBaseLayer = L.tileLayer(MAP_CONFIG.tileLayers.osm.url, {
    attribution: MAP_CONFIG.tileLayers.osm.attribution,
    maxZoom: 19
  }).addTo(map);

  markerClusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 15,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div class="cluster-icon"><span>${count}</span></div>`,
        className: 'marker-cluster-custom',
        iconSize: L.point(40, 40)
      });
    }
  });
  map.addLayer(markerClusterGroup);

  const baseMaps = {};
  Object.entries(MAP_CONFIG.tileLayers).forEach(([key, layer]) => {
    const tileLayer = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: 19
    });
    baseMaps[layer.name] = tileLayer;
    if (key === 'osm') tileLayer.addTo(map);
  });

  const layerControl = L.control.layers(baseMaps, null, {
    collapsed: true,
    position: 'topright'
  }).addTo(map);

  BusTracker.state.map = map;
  BusTracker.state.markerClusterGroup = markerClusterGroup;

  injectMarkerStyles();
  setupMapControls(layerControl);
}

/**
 * Setup map control buttons
 */
function setupMapControls(layerControl) {
  document.getElementById('centerMapBtn')?.addEventListener('click', centerMapOnBuses);

  let layerControlVisible = false;
  document.getElementById('toggleLayersBtn')?.addEventListener('click', () => {
    const container = layerControl.getContainer();
    layerControlVisible = !layerControlVisible;
    container.style.display = layerControlVisible ? 'block' : 'none';
    if (layerControlVisible) container.querySelector('a')?.click();
  });

  let clusteringEnabled = true;
  document.getElementById('toggleClusterBtn')?.addEventListener('click', function() {
    clusteringEnabled = !clusteringEnabled;
    if (clusteringEnabled) {
      map.addLayer(markerClusterGroup);
      this.innerHTML = '<i class="fas fa-object-group"></i>';
      this.title = 'Clustering: ON';
    } else {
      map.removeLayer(markerClusterGroup);
      Object.values(markers).forEach(marker => marker.addTo(map));
      this.innerHTML = '<i class="fas fa-dot-circle"></i>';
      this.title = 'Clustering: OFF';
    }
    updateMapMarkers();
  });

  map.on('click', () => {
    const container = layerControl.getContainer();
    if (layerControlVisible) {
      container.style.display = 'none';
      layerControlVisible = false;
    }
  });
}

/**
 * Create or update markers for all buses
 */
function updateMapMarkers() {
  const { buses, history } = BusTracker.state;
  const isClusteringEnabled = map.hasLayer(markerClusterGroup);

  if (isClusteringEnabled) {
    markerClusterGroup.clearLayers();
  } else {
    Object.values(markers).forEach(marker => marker.remove());
  }
  markers = {};

  buses.forEach(bus => {
    const marker = createBusMarker(bus);
    markers[bus.uid] = marker;

    if (isClusteringEnabled) {
      markerClusterGroup.addLayer(marker);
    } else {
      marker.addTo(map);
    }

    // Draw polyline trail
    if (history && history[bus.uid] && history[bus.uid].length > 1) {
      const path = history[bus.uid];
      if (!polylines[bus.uid]) {
        polylines[bus.uid] = L.polyline(path, {
          color: bus.isMoving ? '#3b82f6' : '#9ca3af',
          weight: 3,
          opacity: 0.55,
          smoothFactor: 1.5
        }).addTo(map);
      } else {
        polylines[bus.uid].setLatLngs(path);
        polylines[bus.uid].setStyle({
          color: bus.isMoving ? '#3b82f6' : '#9ca3af'
        });
      }
    }
  });

  // Remove polylines for buses no longer in feed
  const currentUids = buses.map(b => b.uid);
  Object.keys(polylines).forEach(uid => {
    if (!currentUids.includes(uid)) {
      polylines[uid].remove();
      delete polylines[uid];
    }
  });

  if (buses.length > 0 && Object.keys(markers).length === buses.length) {
    if (!map._loaded || map.getZoom() === MAP_CONFIG.defaultZoom) {
      centerMapOnBuses();
    }
  }
}

/**
 * Build an SVG-based directional bus marker.
 *
 * The arrow nose and body are inside a rotated <g> element so the whole
 * vehicle shape points in the direction of travel.  The text label sits
 * outside that group so it always stays upright and readable.
 *
 * Compass convention: 0 = North (up), 90 = East (right) — SVG rotate()
 * uses the same clockwise convention, so we feed the heading directly.
 */
function createBusMarker(bus) {
  const color = bus.isMoving ? '#22c55e' : '#f59e0b';
  const label = bus.name.slice(-2).toUpperCase();
  const heading = bus.direction || 0;

  // Pulse ring animates only when the bus is moving
  const pulseRing = bus.isMoving
    ? `<circle cx="0" cy="0" r="18" fill="${color}" opacity="0">
         <animate attributeName="r"       from="16" to="26" dur="1.8s" repeatCount="indefinite"/>
         <animate attributeName="opacity" from="0.35" to="0" dur="1.8s" repeatCount="indefinite"/>
       </circle>`
    : '';

  const svgHtml = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="44" height="44" viewBox="-22 -22 44 44"
         style="overflow:visible">
      ${pulseRing}
      <!-- Rotate arrow + body to heading (0=North, clockwise) -->
      <g transform="rotate(${heading})">
        <!-- Arrow nose pointing upward = forward direction -->
        <polygon points="0,-21 -8,-7 8,-7"
                 fill="${color}" stroke="white" stroke-width="1.5"
                 stroke-linejoin="round"/>
        <!-- Bus body circle -->
        <circle cx="0" cy="4" r="14"
                fill="${color}" stroke="white" stroke-width="2"/>
      </g>
      <!-- Label stays horizontal regardless of heading -->
      <text x="0" y="7"
            text-anchor="middle" dominant-baseline="middle"
            fill="white" font-weight="700" font-size="10"
            font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
            style="pointer-events:none">
        ${label}
      </text>
    </svg>`;

  const icon = L.divIcon({
    className: 'bus-marker-icon',
    html: svgHtml,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -26]
  });

  const marker = L.marker([bus.lat, bus.lng], { icon });

  const popupContent = `
    <div class="popup-content">
      <div class="popup-header">
        <strong class="popup-title">${bus.name}</strong>
        <span class="popup-status ${bus.isMoving ? 'moving' : 'stopped'}">
          ${bus.isMoving ? '&#9679; Moving' : '&#9675; Stopped'}
        </span>
      </div>
      <div class="popup-details">
        <div class="detail-row">
          <i class="fas fa-tachometer-alt"></i>
          <span><strong>Speed:</strong> ${bus.speedDisplay}</span>
        </div>
        <div class="detail-row">
          <i class="fas fa-compass"></i>
          <span><strong>Direction:</strong> ${bus.directionDisplay}</span>
        </div>
        <div class="detail-row">
          <i class="fas fa-clock"></i>
          <span><strong>Updated:</strong> ${bus.lastUpdate}</span>
        </div>
        <div class="detail-row">
          <i class="fas fa-map-marker-alt"></i>
          <span><strong>Location:</strong><br>
            <small>${bus.lat.toFixed(5)}, ${bus.lng.toFixed(5)}</small>
          </span>
        </div>
      </div>
      <button class="btn-popup-details" data-uid="${bus.uid}">
        <i class="fas fa-info-circle"></i> View Full Details
      </button>
    </div>`;

  marker.bindPopup(popupContent, { maxWidth: 280, minWidth: 240, closeButton: true });

  marker.on('popupopen', function() {
    document.querySelector('.btn-popup-details')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openBusModal(bus);
      marker.closePopup();
    });
  });

  return marker;
}

/**
 * Fit map bounds to show all active buses
 */
function centerMapOnBuses() {
  const { buses } = BusTracker.state;
  if (buses.length === 0) return;

  const bounds = L.latLngBounds(buses.map(bus => [bus.lat, bus.lng]));
  map.fitBounds(bounds.pad(0.12), { animate: true, duration: 0.5 });
  if (map.getZoom() > 15) map.setZoom(15);
}

/**
 * Open the bus detail modal
 */
function openBusModal(bus) {
  const modal = document.getElementById('busModal');

  document.getElementById('modalBusName').textContent = bus.name;
  document.getElementById('modalBusId').textContent = bus.uid;
  document.getElementById('modalSpeed').textContent = bus.speedDisplay;
  document.getElementById('modalDirection').textContent = bus.directionDisplay;
  document.getElementById('modalLastUpdate').textContent = bus.lastUpdate;
  document.getElementById('modalCoords').textContent =
    `${bus.lat.toFixed(5)}, ${bus.lng.toFixed(5)}`;

  const statusEl = document.getElementById('modalBusStatus');
  statusEl.textContent = bus.isMoving ? 'Moving' : 'Stopped';
  statusEl.className = `status-badge ${bus.isMoving ? 'moving' : 'stopped'}`;

  const osmLink =
    `https://www.openstreetmap.org/?mlat=${bus.lat}&mlon=${bus.lng}#map=16/${bus.lat}/${bus.lng}`;
  document.getElementById('modalMapPreview').innerHTML = `
    <a href="${osmLink}" target="_blank" rel="noopener" class="osm-link">
      <i class="fas fa-external-link-alt"></i> View on OpenStreetMap
    </a>`;

  modal.classList.add('active');
}

/**
 * Inject CSS needed for map markers and popups
 */
function injectMarkerStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .bus-marker-icon {
      background: transparent !important;
      border: none !important;
    }

    /* Custom cluster bubble */
    .marker-cluster-custom {
      background: rgba(37, 99, 235, 0.92);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .cluster-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    .marker-cluster-custom span {
      color: white;
      font-weight: 800;
      font-size: 14px;
    }

    /* Popup */
    .popup-content {
      padding: 4px 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #eee;
    }
    .popup-title { font-size: 1.05rem; color: #1e293b; }
    .popup-status {
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 600;
    }
    .popup-status.moving  { background: #dcfce7; color: #166534; }
    .popup-status.stopped { background: #fef3c7; color: #92400e; }

    .popup-details {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
      font-size: 0.875rem;
    }
    .detail-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      color: #475569;
    }
    .detail-row i { width: 16px; color: #64748b; margin-top: 2px; }

    .btn-popup-details {
      width: 100%;
      padding: 8px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .btn-popup-details:hover { background: #1d4ed8; }

    .osm-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: #2563eb;
      text-decoration: none;
      font-weight: 600;
      padding: 12px;
      background: #f1f5f9;
      border-radius: 8px;
      transition: background 0.2s;
    }
    .osm-link:hover { background: #e2e8f0; }
  `;
  document.head.appendChild(style);
}

// Initialize after Leaflet is ready
if (typeof L !== 'undefined') {
  initMap();
} else {
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof L !== 'undefined') initMap();
  });
}

window.MapModule = { initMap, updateMapMarkers, openBusModal, centerMapOnBuses, map: () => map };
