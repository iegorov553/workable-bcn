/* Runs inside the bundled map document on both native and web. */
(function () {
  const send = (message) => {
    const data = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
    else window.parent.postMessage(data, '*');
  };
  window.addEventListener('error', () => send({ type: 'error' }));
  const map = L.map('map', { center: [41.389, 2.169], zoom: 13, minZoom: 3, maxZoom: 19, zoomControl: false });
  const notice = document.getElementById('tile-error');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
  }).on('tileerror', () => { notice.hidden = false; })
    .on('tileload', () => { notice.hidden = true; }).addTo(map);
  const markers = new Map();
  let userMarker = null;
  let lastCamera = null;
  const popup = (place) => {
    const root = document.createElement('div');
    const name = document.createElement('strong');
    name.className = 'popup-name';
    name.textContent = place.name;
    const chain = document.createElement('span');
    chain.className = 'popup-chain';
    chain.textContent = place.chain;
    root.append(name, chain);
    return root;
  };
  window.workableMapUpdate = (encoded) => {
    const state = JSON.parse(decodeURIComponent(encoded));
    const ids = new Set(state.places.map(place => place.id));
    for (const [id, marker] of markers) {
      if (!ids.has(id)) { marker.remove(); markers.delete(id); }
    }
    for (const place of state.places) {
      let marker = markers.get(place.id);
      if (!marker) {
        marker = L.circleMarker([place.latitude, place.longitude]).bindPopup(popup(place)).addTo(map);
        marker.on('click', () => send({ type: 'select', id: place.id }));
        markers.set(place.id, marker);
      }
      const selected = place.id === state.selectedId;
      marker.setRadius(selected ? 10 : 6).setStyle({
        color: selected ? '#17211B' : '#FFFDF7', weight: selected ? 4 : 2,
        fillColor: state.chainColors[place.chain] || '#6D776F', fillOpacity: 1,
      });
      if (selected) marker.bringToFront();
    }
    if (state.userLocation) {
      const position = [state.userLocation.latitude, state.userLocation.longitude];
      if (!userMarker) userMarker = L.circleMarker(position, { radius: 8, color: '#FFFFFF', weight: 4, fillColor: '#1479D3', fillOpacity: 1 }).bindPopup('You are here').addTo(map);
      else userMarker.setLatLng(position);
      userMarker.bringToFront();
    } else if (userMarker) { userMarker.remove(); userMarker = null; }
    const command = state.cameraCommand;
    if (command && (!lastCamera || command.requestId !== lastCamera.requestId || command.latitude !== lastCamera.latitude || command.longitude !== lastCamera.longitude)) {
      map.stop();
      map.closePopup();
      map.flyTo([command.latitude, command.longitude], 16, { duration: 0.45 });
      lastCamera = command;
    }
    if (!state.selectedId) map.closePopup();
    map.invalidateSize({ pan: false });
    send({ type: 'updated', count: markers.size });
  };
  window.addEventListener('message', event => {
    if (event.source === window.parent && typeof event.data === 'string') window.workableMapUpdate(event.data);
  });
  window.addEventListener('resize', () => map.invalidateSize({ pan: false }));
  if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(document.getElementById('map'));
  send({ type: 'ready' });
})();
