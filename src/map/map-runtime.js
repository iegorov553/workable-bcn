/* Runs inside the bundled map document on both native and web. */
(function () {
  const send = (message) => {
    const data = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
    else window.parent.postMessage(data, '*');
  };
  window.addEventListener('error', () => send({ type: 'error' }));
  const map = L.map('map', { center: [41.389, 2.169], zoom: 13, minZoom: 3, maxZoom: 19, zoomControl: false });
  let currentOrientation = 'north';
  if (typeof L !== 'undefined' && L.DomUtil && typeof L.DomUtil.getScale === 'function') {
    const originalGetScale = L.DomUtil.getScale;
    L.DomUtil.getScale = function (element) {
      if (currentOrientation === 'grid' && element && (element.id === 'map' || (typeof map !== 'undefined' && typeof map.getContainer === 'function' && element === map.getContainer()))) {
        const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { width: element.offsetWidth || 0, height: element.offsetHeight || 0 };
        return {
          x: 1,
          y: 1,
          boundingClientRect: rect,
        };
      }
      return originalGetScale(element);
    };
  }
  if (typeof L !== 'undefined' && L.DomEvent && typeof L.DomEvent.getMousePosition === 'function') {
    const originalGetMousePosition = L.DomEvent.getMousePosition;
    L.DomEvent.getMousePosition = function (e, container) {
      if (currentOrientation === 'grid' && container && (container.id === 'map' || (typeof map !== 'undefined' && typeof map.getContainer === 'function' && container === map.getContainer()))) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const size = typeof map !== 'undefined' && typeof map.getSize === 'function' ? map.getSize() : { x: window.innerWidth, y: window.innerHeight };
        const mx = size.x / 2;
        const my = size.y / 2;
        const first = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0]) || e;
        const dx = (first && typeof first.clientX === 'number' ? first.clientX : cx) - cx;
        const dy = (first && typeof first.clientY === 'number' ? first.clientY : cy) - cy;
        const cos = Math.SQRT1_2;
        const localDx = (dx + dy) * cos;
        const localDy = (dy - dx) * cos;
        return typeof L !== 'undefined' && L.Point ? new L.Point(mx + localDx, my + localDy) : { x: mx + localDx, y: my + localDy };
      }
      return originalGetMousePosition(e, container);
    };
  }
  if (typeof map.mouseEventToContainerPoint === 'function') {
    const originalMouseEventToContainerPoint = map.mouseEventToContainerPoint.bind(map);
    map.mouseEventToContainerPoint = function (e) {
      if (currentOrientation !== 'grid') {
        return originalMouseEventToContainerPoint(e);
      }
      if (typeof L !== 'undefined' && L.DomEvent && typeof L.DomEvent.getMousePosition === 'function') {
        const container = typeof map.getContainer === 'function' ? map.getContainer() : document.getElementById('map');
        return L.DomEvent.getMousePosition(e, container);
      }
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const size = typeof map.getSize === 'function' ? map.getSize() : { x: window.innerWidth, y: window.innerHeight };
      const mx = size.x / 2;
      const my = size.y / 2;
      const first = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0]) || e;
      const dx = (first && typeof first.clientX === 'number' ? first.clientX : cx) - cx;
      const dy = (first && typeof first.clientY === 'number' ? first.clientY : cy) - cy;
      const cos = Math.SQRT1_2;
      const localDx = (dx + dy) * cos;
      const localDy = (dy - dx) * cos;
      return typeof L !== 'undefined' && L.Point ? new L.Point(mx + localDx, my + localDy) : { x: mx + localDx, y: my + localDy };
    };
  }
  const wrapDraggable = (target) => {
    if (!target || target._workableDragWrapped || typeof target._updatePosition !== 'function') return;
    target._workableDragWrapped = true;
    const originalUpdatePosition = target._updatePosition;
    target._updatePosition = function () {
      if (currentOrientation === 'grid' && this._startPos && this._newPos && typeof this._startPos.x === 'number' && typeof this._newPos.x === 'number') {
        const handle = this._dragStartTarget || this._dragHandle;
        const isMapDrag = !this._element || (typeof map !== 'undefined' && (this._element === map._mapPane || (typeof map.getPane === 'function' && this._element === map.getPane('mapPane')))) ||
          (handle && (handle.id === 'map' || (typeof map !== 'undefined' && typeof map.getContainer === 'function' && handle === map.getContainer())));
        if (isMapDrag) {
          const scaleX = (this._parentScale && typeof this._parentScale.x === 'number') ? this._parentScale.x : 1;
          const scaleY = (this._parentScale && typeof this._parentScale.y === 'number') ? this._parentScale.y : 1;
          const dx = (this._newPos.x - this._startPos.x) * scaleX;
          const dy = (this._newPos.y - this._startPos.y) * scaleY;
          const cos = Math.SQRT1_2;
          const localDx = (dx + dy) * cos;
          const localDy = (dy - dx) * cos;
          this._newPos = typeof L !== 'undefined' && L.Point
            ? new L.Point(this._startPos.x + localDx, this._startPos.y + localDy)
            : { x: this._startPos.x + localDx, y: this._startPos.y + localDy };
        }
      }
      return originalUpdatePosition.call(this);
    };
  };
  if (typeof L !== 'undefined' && L.Draggable && L.Draggable.prototype) {
    wrapDraggable(L.Draggable.prototype);
  }
  if (typeof map !== 'undefined' && map.dragging && map.dragging._draggable) {
    wrapDraggable(map.dragging._draggable);
  }
  const notice = document.getElementById('tile-error');
  const cartoKey = typeof __CARTO_API_KEY__ !== 'undefined' && __CARTO_API_KEY__ ? __CARTO_API_KEY__ : '';
  const keyParam = cartoKey ? `?key=${encodeURIComponent(cartoKey)}` : '';
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${keyParam}`, {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
  }).on('tileerror', () => { notice.hidden = false; })
    .on('tileload', () => { notice.hidden = true; }).addTo(map);
  if (typeof map.createPane === 'function') {
    const metroPane = map.createPane('metroPane');
    if (metroPane && metroPane.style) metroPane.style.zIndex = '350';
  }
  const updateZoomClass = () => {
    if (!map || typeof map.getZoom !== 'function' || typeof map.getContainer !== 'function') return;
    const container = map.getContainer();
    if (!container || !container.classList || typeof container.classList.toggle !== 'function') return;
    const z = map.getZoom();
    container.classList.toggle('zoom-lt-14', z < 14);
    container.classList.toggle('zoom-14', z === 14);
    container.classList.toggle('zoom-gte-15', z >= 15);
  };
  if (map.on) {
    map.on('zoomend', updateZoomClass);
  }
  updateZoomClass();
  const lineColors = {
    L1: '#E1251B', L2: '#90278E', L3: '#509E2F', L4: '#F7B500', L5: '#0078C1',
    L6: '#7874B2', L7: '#B45823', L8: '#EA5399', L9N: '#F37920', L9S: '#F37920',
    L10N: '#009EE0', L10S: '#009EE0', L11: '#98C222', L12: '#BD93C8', T1: '#009A44', T4: '#009A44',
  };
  let metroLayer = null;
  let isMetroVisible = false;
  const stationMarkers = [];
  const transitData = typeof __TRANSIT_OVERLAY__ !== 'undefined' ? __TRANSIT_OVERLAY__ : null;
  const getMetroLayer = () => {
    if (metroLayer) return metroLayer;
    if (!transitData || typeof L === 'undefined' || typeof L.layerGroup !== 'function') return null;
    metroLayer = L.layerGroup();
    stationMarkers.length = 0;
    if (Array.isArray(transitData.segments) && typeof L.polyline === 'function') {
      for (let i = 0; i < transitData.segments.length; i++) {
        const seg = transitData.segments[i];
        const isTram = seg.isTram || (seg.line && seg.line.startsWith('T'));
        const lineOptions = {
          color: lineColors[seg.line] || (isTram ? '#009A44' : '#777777'),
          weight: isTram ? 3 : 3.5,
          opacity: isTram ? 0.85 : 0.75,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          pane: 'metroPane',
        };
        if (isTram) {
          lineOptions.dashArray = '6, 5';
        }
        const line = L.polyline(seg.coords, lineOptions);
        metroLayer.addLayer(line);
      }
    }
    if (Array.isArray(transitData.stations) && typeof L.circleMarker === 'function') {
      for (let i = 0; i < transitData.stations.length; i++) {
        const station = transitData.stations[i];
        const isTramOnly = station.isTramOnly ?? station.lines.every(l => l.startsWith('T'));
        const isInterchange = station.isInterchange ?? (station.lines.length > 1);
        const hasTram = station.lines.some(l => l.startsWith('T'));
        const hasMetro = station.lines.some(l => !l.startsWith('T'));

        let markerOptions;
        if (isTramOnly) {
          markerOptions = {
            radius: 3,
            color: '#009A44',
            weight: 2,
            fillColor: '#FFFFFF',
            fillOpacity: 1,
            bubblingMouseEvents: false,
            pane: 'metroPane',
          };
        } else if (isInterchange) {
          markerOptions = {
            radius: 4.5,
            color: '#FFFFFF',
            weight: 2,
            fillColor: '#111827',
            fillOpacity: 0.95,
            bubblingMouseEvents: false,
            pane: 'metroPane',
          };
        } else {
          markerOptions = {
            radius: 3.5,
            color: '#FFFFFF',
            weight: 1.5,
            fillColor: '#2D3748',
            fillOpacity: 0.9,
            bubblingMouseEvents: false,
            pane: 'metroPane',
          };
        }

        const stMarker = L.circleMarker(station.coords, markerOptions);

        if (typeof stMarker.bindTooltip === 'function') {
          let labelClass = 'transit-label';
          if (isTramOnly) {
            labelClass += ' transit-label-tram';
          } else if (isInterchange) {
            labelClass += ' transit-label-hub';
          }
          stMarker.bindTooltip('<span class="transit-label-text">' + station.name + '</span>', {
            permanent: true,
            direction: 'right',
            offset: [isInterchange ? 6 : 5, 0],
            className: labelClass,
          });
          if (typeof stMarker.on === 'function') {
            stMarker.on('tooltipopen', (ev) => {
              const el = ev?.tooltip?.getElement ? ev.tooltip.getElement() : (ev?.tooltip?._container || null);
              if (el && !el._workableTap) {
                el._workableTap = true;
                el.addEventListener('click', (te) => {
                  if (typeof L !== 'undefined' && L.DomEvent && L.DomEvent.stopPropagation) {
                    L.DomEvent.stopPropagation(te);
                  }
                  if (typeof stMarker.openPopup === 'function') {
                    stMarker.openPopup();
                  }
                });
              }
            });
          }
        }

        const root = document.createElement('div');
        root.className = 'transit-popup';
        const typeBadge = document.createElement('span');
        typeBadge.className = 'transit-type';
        typeBadge.textContent = isTramOnly ? 'TRAM' : (hasTram && hasMetro ? 'METRO · TRAM' : 'METRO');
        const name = document.createElement('strong');
        name.className = 'transit-name';
        name.textContent = station.name;
        const lines = document.createElement('span');
        lines.className = 'transit-lines';
        lines.textContent = station.lines.join(' · ');
        root.append(typeBadge, name, lines);
        stMarker.bindPopup(root);
        stMarker._stationData = station;
        stationMarkers.push(stMarker);
        metroLayer.addLayer(stMarker);
      }
    }
    return metroLayer;
  };
  let currentPlaces = [];
  if (map.on) {
    map.on('click', (e) => {
      if (e?.latlng && typeof map.latLngToContainerPoint === 'function') {
        const clickPoint = map.latLngToContainerPoint(e.latlng);
        let closestPlace = null;
        let minPlaceDist = Infinity;
        for (let i = 0; i < currentPlaces.length; i++) {
          const place = currentPlaces[i];
          const placePoint = map.latLngToContainerPoint([place.latitude, place.longitude]);
          const dist = Math.hypot(clickPoint.x - placePoint.x, clickPoint.y - placePoint.y);
          if (dist < minPlaceDist) {
            minPlaceDist = dist;
            closestPlace = place;
          }
        }

        let closestStationMarker = null;
        let minStationDist = Infinity;
        if (isMetroVisible && stationMarkers.length > 0) {
          for (let i = 0; i < stationMarkers.length; i++) {
            const sm = stationMarkers[i];
            const smCoords = sm.getLatLng ? sm.getLatLng() : sm._latlng || (sm._stationData && sm._stationData.coords);
            if (smCoords) {
              const smPoint = map.latLngToContainerPoint(smCoords);
              const dist = Math.hypot(clickPoint.x - smPoint.x, clickPoint.y - smPoint.y);
              if (dist < minStationDist) {
                minStationDist = dist;
                closestStationMarker = sm;
              }
            }
          }
        }

        const placeHit = closestPlace && minPlaceDist <= 26;
        const stationHit = closestStationMarker && minStationDist <= 26;

        if (placeHit && stationHit) {
          if (minStationDist < minPlaceDist) {
            if (typeof closestStationMarker.openPopup === 'function') {
              closestStationMarker.openPopup();
            }
            return;
          } else {
            send({ type: 'select', id: closestPlace.id });
            return;
          }
        } else if (stationHit) {
          if (typeof closestStationMarker.openPopup === 'function') {
            closestStationMarker.openPopup();
          }
          return;
        } else if (placeHit) {
          send({ type: 'select', id: closestPlace.id });
          return;
        }

        send({ type: 'mapClick', latitude: e.latlng.lat, longitude: e.latlng.lng });
      } else if (e?.latlng) {
        send({ type: 'mapClick', latitude: e.latlng.lat, longitude: e.latlng.lng });
      }
    });
  }
  const markers = new Map();
  let userMarker = null;
  let friendMarker = null;
  let lastCamera = null;
  let lastBoundsKey = null;
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
    const newOrientation = state.orientation || 'north';
    if (newOrientation !== currentOrientation) {
      currentOrientation = newOrientation;
      const mapEl = document.getElementById('map');
      if (mapEl && mapEl.classList) {
        if (currentOrientation === 'grid') {
          mapEl.classList.add('rotated-grid');
        } else {
          mapEl.classList.remove('rotated-grid');
        }
      }
    }
    currentPlaces = state.places || [];
    const ids = new Set(state.places.map(place => place.id));
    for (const [id, marker] of markers) {
      if (!ids.has(id)) { marker.remove(); markers.delete(id); }
    }
    for (const place of state.places) {
      const selected = place.id === state.selectedId;
      const isFav = Boolean(state.favoriteIds && state.favoriteIds.includes(place.id));
      let marker = markers.get(place.id);
      if (marker && marker._isFav !== isFav) {
        marker.remove();
        marker = null;
        markers.delete(place.id);
      }
      if (isFav) {
        const color = (state.chainColors && state.chainColors[place.chain]) || '#6D776F';
        if (!marker) {
          const icon = typeof L.divIcon === 'function' ? L.divIcon({
            className: 'fav-marker-div',
            html: `<div class="fav-marker-wrap${selected ? ' is-selected' : ''}" style="background-color:${color};"><svg width="10" height="10" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }) : undefined;
          marker = typeof L.marker === 'function'
            ? L.marker([place.latitude, place.longitude], { icon, bubblingMouseEvents: false }).bindPopup(popup(place)).addTo(map)
            : L.circleMarker([place.latitude, place.longitude], { bubblingMouseEvents: false }).bindPopup(popup(place)).addTo(map);
          marker.on('click', (e) => {
            if (e && e.originalEvent && typeof L !== 'undefined' && L.DomEvent && L.DomEvent.stopPropagation) {
              L.DomEvent.stopPropagation(e);
            }
            send({ type: 'select', id: place.id });
          });
          marker._isFav = true;
          markers.set(place.id, marker);
        } else {
          const el = typeof marker.getElement === 'function' ? marker.getElement() : null;
          const wrap = el && typeof el.querySelector === 'function' ? el.querySelector('.fav-marker-wrap') : null;
          if (wrap && wrap.classList) {
            wrap.classList.toggle('is-selected', selected);
          } else if (typeof marker.setIcon === 'function' && typeof L.divIcon === 'function') {
            marker.setIcon(L.divIcon({
              className: 'fav-marker-div',
              html: `<div class="fav-marker-wrap${selected ? ' is-selected' : ''}" style="background-color:${color};"><svg width="10" height="10" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }));
          }
        }
        if (typeof marker.setZIndexOffset === 'function') {
          marker.setZIndexOffset(selected ? 500 : 200);
        }
      } else {
        if (!marker) {
          marker = L.circleMarker([place.latitude, place.longitude], { bubblingMouseEvents: false }).bindPopup(popup(place)).addTo(map);
          marker.on('click', (e) => {
            if (e && e.originalEvent && typeof L !== 'undefined' && L.DomEvent && L.DomEvent.stopPropagation) {
              L.DomEvent.stopPropagation(e);
            }
            send({ type: 'select', id: place.id });
          });
          marker._isFav = false;
          markers.set(place.id, marker);
        }
        const isTopMatch = !selected && Boolean(state.topMatchIds && state.topMatchIds.includes(place.id));
        marker.setRadius(selected ? 10 : (isTopMatch ? 8 : 6)).setStyle({
          color: selected ? '#17211B' : (isTopMatch ? '#F4C344' : '#FFFDF7'),
          weight: selected ? 4 : (isTopMatch ? 3 : 2),
          fillColor: (state.chainColors && state.chainColors[place.chain]) || '#6D776F', fillOpacity: 1,
        });
        if (isTopMatch) marker.bringToFront();
        if (selected) marker.bringToFront();
      }
    }
    if (state.userLocation) {
      const position = [state.userLocation.latitude, state.userLocation.longitude];
      if (!userMarker) {
        if (typeof L.marker === 'function') {
          const icon = typeof L.divIcon === 'function' ? L.divIcon({
            className: 'location-marker user-location-marker',
            html: '<div class="location-pulse location-pulse-user"></div><div class="location-dot location-dot-user"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -14],
          }) : undefined;
          userMarker = L.marker(position, { icon, zIndexOffset: 1000, bubblingMouseEvents: false }).bindPopup('You are here').addTo(map);
        } else {
          userMarker = L.circleMarker(position, { radius: 8, color: '#FFFFFF', weight: 4, fillColor: '#007AFF', fillOpacity: 1, bubblingMouseEvents: false }).bindPopup('You are here').addTo(map);
        }
      } else {
        userMarker.setLatLng(position);
      }
      if (typeof userMarker.bringToFront === 'function') userMarker.bringToFront();
    } else if (userMarker) { userMarker.remove(); userMarker = null; }
    if (state.friendLocation) {
      const friendPos = [state.friendLocation.latitude, state.friendLocation.longitude];
      if (!friendMarker) {
        if (typeof L.marker === 'function') {
          const icon = typeof L.divIcon === 'function' ? L.divIcon({
            className: 'location-marker friend-location-marker',
            html: '<div class="location-pulse location-pulse-friend"></div><div class="location-dot location-dot-friend"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -14],
          }) : undefined;
          friendMarker = L.marker(friendPos, { icon, zIndexOffset: 900, bubblingMouseEvents: false }).bindPopup('Friend is here').addTo(map);
        } else {
          friendMarker = L.circleMarker(friendPos, { radius: 8, color: '#FFFFFF', weight: 4, fillColor: '#7C3AED', fillOpacity: 1, bubblingMouseEvents: false }).bindPopup('Friend is here').addTo(map);
        }
      } else {
        friendMarker.setLatLng(friendPos);
      }
      if (typeof friendMarker.bringToFront === 'function') friendMarker.bringToFront();
    } else if (friendMarker) { friendMarker.remove(); friendMarker = null; }
    if (state.userLocation && state.friendLocation) {
      const boundsKey = `${state.userLocation.latitude},${state.userLocation.longitude};${state.friendLocation.latitude},${state.friendLocation.longitude}`;
      if (boundsKey !== lastBoundsKey) {
        lastBoundsKey = boundsKey;
        if (map.fitBounds) {
          map.fitBounds([
            [state.userLocation.latitude, state.userLocation.longitude],
            [state.friendLocation.latitude, state.friendLocation.longitude],
          ], { padding: [60, 60], maxZoom: 15 });
        }
      }
    } else {
      lastBoundsKey = null;
    }
    isMetroVisible = Boolean(state.showMetro);
    const transit = getMetroLayer();
    if (transit) {
      const isLayerOnMap = typeof map.hasLayer === 'function' ? map.hasLayer(transit) : Boolean(transit._map);
      if (state.showMetro) {
        if (!isLayerOnMap && typeof transit.addTo === 'function') transit.addTo(map);
      } else {
        if (isLayerOnMap && typeof transit.remove === 'function') transit.remove();
      }
    }
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
