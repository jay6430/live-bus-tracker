/**
 * Bus Tracker — Dashboard Module
 * Manages the sidebar bus list, search, and selection behaviour.
 */

/**
 * Re-render the bus list in the sidebar, applying the current search filter
 */
function updateBusList() {
  const { buses } = BusTracker.state;
  const searchTerm = document.getElementById('searchBus').value.toLowerCase().trim();
  const container  = document.getElementById('busList');

  const filtered = buses.filter(bus =>
    bus.name.toLowerCase().includes(searchTerm) ||
    bus.uid.toString().includes(searchTerm)
  );

  // Moving buses first, then sort by most-recently updated
  filtered.sort((a, b) => {
    if (a.isMoving !== b.isMoving) return a.isMoving ? -1 : 1;
    return b.timestamp - a.timestamp;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">No buses found</div>';
    return;
  }

  container.innerHTML = filtered.map(bus => `
    <div class="bus-item ${bus.isMoving ? 'moving' : 'stopped'}"
         data-uid="${bus.uid}"
         onclick="BusTrackerDashboard.selectBus('${bus.uid}')">
      <div class="bus-icon">${bus.name.slice(-2).toUpperCase()}</div>
      <div class="bus-info">
        <div class="bus-name">${bus.name}</div>
        <div class="bus-meta">
          <span class="bus-speed">${bus.speedDisplay}</span>
          <span>${bus.directionDisplay}</span>
        </div>
      </div>
      <span class="bus-status ${bus.isMoving ? 'moving' : 'stopped'}">
        ${bus.isMoving ? '&#9679; Moving' : '&#9675; Stopped'}
      </span>
    </div>
  `).join('');
}

/**
 * Pan the map to a selected bus and open its detail modal
 */
function selectBus(uid) {
  // uid arrives as a string from the onclick attribute
  const bus = BusTracker.state.buses.find(b => b.uid === String(uid));
  if (!bus) return;

  if (BusTracker.state.map) {
    BusTracker.state.map.panTo({ lat: bus.lat, lng: bus.lng });
    BusTracker.state.map.setZoom(15);
  }

  if (window.MapModule?.openBusModal) {
    MapModule.openBusModal(bus);
  }

  // Highlight selected row
  document.querySelectorAll('.bus-item').forEach(el => {
    el.classList.remove('selected');
    el.style.boxShadow = '';
  });
  const row = document.querySelector(`.bus-item[data-uid="${uid}"]`);
  if (row) {
    row.classList.add('selected');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Wire up dashboard event listeners
 */
function initDashboard() {
  document.getElementById('searchBus')?.addEventListener('input', updateBusList);

  // Close modal when clicking the backdrop
  document.getElementById('busModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'busModal') e.target.classList.remove('active');
  });

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('busModal')?.classList.remove('active');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}

window.BusTrackerDashboard = { updateBusList, selectBus };
