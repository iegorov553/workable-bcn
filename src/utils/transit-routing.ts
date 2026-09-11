import type { Coordinates } from '../types';
import type { TransitNetwork, TransitStation, TransitConnection } from '../types/transit';
import defaultNetworkJson from '../data/bcn-transit-network.json' with { type: 'json' };

export type RouteEstimate = {
  minutes: number;
  mode: 'walk' | 'transit';
  stationIn?: string;
  stationOut?: string;
};

const EARTH_RADIUS_METERS = 6371000;
const WALK_SPEED_METERS_PER_MIN = 80;
const URBAN_GRID_FACTOR = 1.25;
const MAX_ACCESS_METERS = 1200;
const INITIAL_WAIT_MINUTES = 3;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Calculates straight-line Haversine distance in meters between two coordinates.
 */
export function haversineDistanceMeters(c1: Coordinates, c2: Coordinates): number {
  const dLat = radians(c2.latitude - c1.latitude);
  const dLon = radians(c2.longitude - c1.longitude);
  const lat1 = radians(c1.latitude);
  const lat2 = radians(c2.latitude);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, haversine));
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}

/**
 * Computes walking travel time in minutes applying a 1.25 urban street factor
 * and standard 80 m/min (4.8 km/h) walking speed. Minimum is 1 minute.
 */
export function estimateWalkingMinutes(origin: Coordinates, destination: Coordinates): number {
  const dHaversine = haversineDistanceMeters(origin, destination);
  const dUrban = dHaversine * URBAN_GRID_FACTOR;
  return Math.max(1, Math.round(dUrban / WALK_SPEED_METERS_PER_MIN));
}

/**
 * Walking time between a coordinate and a station entrance.
 * Returns 0 if distance is negligible.
 */
function stationAccessMinutes(coord: Coordinates, station: Coordinates): number {
  const dHaversine = haversineDistanceMeters(coord, station);
  const dUrban = dHaversine * URBAN_GRID_FACTOR;
  return Math.round(dUrban / WALK_SPEED_METERS_PER_MIN);
}

interface IndexedConnection {
  targetIdx: number;
  travelMinutes: number;
  lineIdx: number;
}

interface IndexedStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  connections: IndexedConnection[];
}

interface IndexedNetwork {
  network: TransitNetwork;
  stations: IndexedStation[];
  stationIdToIdx: Map<string, number>;
  lineNameToIdx: Map<string, number>;
  numStations: number;
  numLines: number;
  stride: number;
  transferPenaltyMinutes: number;
}

function indexNetwork(network: TransitNetwork): IndexedNetwork {
  const stationIdToIdx = new Map<string, number>();
  const lineNameToIdx = new Map<string, number>();
  let lineCount = 0;

  for (let i = 0; i < network.stations.length; i++) {
    const s = network.stations[i];
    stationIdToIdx.set(s.id, i);
    for (const line of s.lines) {
      if (!lineNameToIdx.has(line)) {
        lineNameToIdx.set(line, ++lineCount);
      }
    }
  }

  const stations: IndexedStation[] = [];
  for (let i = 0; i < network.stations.length; i++) {
    const s = network.stations[i];
    const connections: IndexedConnection[] = [];
    for (const conn of s.connections) {
      const targetIdx = stationIdToIdx.get(conn.targetId);
      let lineIdx = lineNameToIdx.get(conn.line);
      if (lineIdx === undefined) {
        lineNameToIdx.set(conn.line, ++lineCount);
        lineIdx = lineCount;
      }
      if (targetIdx !== undefined) {
        connections.push({
          targetIdx,
          travelMinutes: conn.travelMinutes,
          lineIdx,
        });
      }
    }
    stations.push({
      id: s.id,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      connections,
    });
  }

  const numStations = stations.length;
  const numLines = lineCount;
  const stride = numLines + 1;

  return {
    network,
    stations,
    stationIdToIdx,
    lineNameToIdx,
    numStations,
    numLines,
    stride,
    transferPenaltyMinutes: network.transferPenaltyMinutes,
  };
}

const defaultNetwork = defaultNetworkJson as unknown as TransitNetwork;
const defaultIndexedNetwork: IndexedNetwork = indexNetwork(defaultNetwork);
const networkIndexCache = new WeakMap<TransitNetwork, IndexedNetwork>();
networkIndexCache.set(defaultNetwork, defaultIndexedNetwork);

function getIndexedNetwork(network?: TransitNetwork): IndexedNetwork {
  if (!network || network === defaultNetwork) {
    return defaultIndexedNetwork;
  }
  let indexed = networkIndexCache.get(network);
  if (!indexed) {
    indexed = indexNetwork(network);
    networkIndexCache.set(network, indexed);
  }
  return indexed;
}

// Reusable Dijkstra state structures for zero-allocation routing queries
class DijkstraState {
  public dist: Float64Array = new Float64Array(8192);
  public epoch: Int32Array = new Int32Array(8192);
  public exitEpoch: Int32Array = new Int32Array(1024);
  public exitWalkMinutes: Float64Array = new Float64Array(1024);
  public currentEpoch: number = 0;

  // Min-heap arrays
  public heapCosts: Float64Array = new Float64Array(4096);
  public heapStations: Int16Array = new Int16Array(4096);
  public heapLines: Int8Array = new Int8Array(4096);
  public heapOrigins: Int16Array = new Int16Array(4096);
  public heapSize: number = 0;

  public ensureCapacity(totalStates: number, numStations: number) {
    if (totalStates > this.dist.length) {
      const newCap = Math.max(totalStates, this.dist.length * 2);
      this.dist = new Float64Array(newCap);
      this.epoch = new Int32Array(newCap);
    }
    if (numStations > this.exitEpoch.length) {
      const newCap = Math.max(numStations, this.exitEpoch.length * 2);
      this.exitEpoch = new Int32Array(newCap);
      this.exitWalkMinutes = new Float64Array(newCap);
    }
  }

  public nextEpoch(): number {
    this.currentEpoch++;
    if (this.currentEpoch > 2000000000) {
      this.epoch.fill(0);
      this.exitEpoch.fill(0);
      this.currentEpoch = 1;
    }
    this.heapSize = 0;
    return this.currentEpoch;
  }

  public push(cost: number, stationIdx: number, lineIdx: number, originIdx: number) {
    if (this.heapSize >= this.heapCosts.length) {
      const newCap = this.heapCosts.length * 2;
      const c = new Float64Array(newCap); c.set(this.heapCosts); this.heapCosts = c;
      const s = new Int16Array(newCap); s.set(this.heapStations); this.heapStations = s;
      const l = new Int8Array(newCap); l.set(this.heapLines); this.heapLines = l;
      const o = new Int16Array(newCap); o.set(this.heapOrigins); this.heapOrigins = o;
    }
    let i = this.heapSize++;
    this.heapCosts[i] = cost;
    this.heapStations[i] = stationIdx;
    this.heapLines[i] = lineIdx;
    this.heapOrigins[i] = originIdx;

    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heapCosts[i] < this.heapCosts[parent]) {
        this.swap(i, parent);
        i = parent;
      } else {
        break;
      }
    }
  }

  public pop(out: { cost: number; stationIdx: number; lineIdx: number; originIdx: number }): boolean {
    if (this.heapSize === 0) return false;
    out.cost = this.heapCosts[0];
    out.stationIdx = this.heapStations[0];
    out.lineIdx = this.heapLines[0];
    out.originIdx = this.heapOrigins[0];

    this.heapSize--;
    if (this.heapSize > 0) {
      this.heapCosts[0] = this.heapCosts[this.heapSize];
      this.heapStations[0] = this.heapStations[this.heapSize];
      this.heapLines[0] = this.heapLines[this.heapSize];
      this.heapOrigins[0] = this.heapOrigins[this.heapSize];
      this.down(0);
    }
    return true;
  }

  private down(i: number) {
    const half = this.heapSize >> 1;
    while (i < half) {
      let left = (i << 1) + 1;
      const right = left + 1;
      let smallest = i;

      if (left < this.heapSize && this.heapCosts[left] < this.heapCosts[smallest]) {
        smallest = left;
      }
      if (right < this.heapSize && this.heapCosts[right] < this.heapCosts[smallest]) {
        smallest = right;
      }
      if (smallest !== i) {
        this.swap(i, smallest);
        i = smallest;
      } else {
        break;
      }
    }
  }

  private swap(a: number, b: number) {
    const c = this.heapCosts[a];
    this.heapCosts[a] = this.heapCosts[b];
    this.heapCosts[b] = c;

    const s = this.heapStations[a];
    this.heapStations[a] = this.heapStations[b];
    this.heapStations[b] = s;

    const l = this.heapLines[a];
    this.heapLines[a] = this.heapLines[b];
    this.heapLines[b] = l;

    const o = this.heapOrigins[a];
    this.heapOrigins[a] = this.heapOrigins[b];
    this.heapOrigins[b] = o;
  }
}

const dijkstraState = new DijkstraState();
const popNode = { cost: 0, stationIdx: 0, lineIdx: 0, originIdx: 0 };

// Bounding box delta for ~1200m in Barcelona area (lat ~41.4)
const MAX_LAT_DELTA = 0.013;
const MAX_LON_DELTA = 0.018;

/**
 * Finds the optimal route (fastest travel time) between origin and destination,
 * choosing between direct urban walking and rapid transit.
 */
export function findOptimalRoute(
  origin: Coordinates,
  destination: Coordinates,
  network?: TransitNetwork
): RouteEstimate {
  const walkMinutes = estimateWalkingMinutes(origin, destination);

  const indexed = getIndexedNetwork(network);
  const { stations, numStations, stride, transferPenaltyMinutes } = indexed;
  const totalStates = numStations * stride;

  dijkstraState.ensureCapacity(totalStates, numStations);
  const epochId = dijkstraState.nextEpoch();

  // Find candidate exit stations within 1.2 km of destination
  let exitCount = 0;
  for (let i = 0; i < numStations; i++) {
    const s = stations[i];
    if (
      Math.abs(destination.latitude - s.latitude) <= MAX_LAT_DELTA &&
      Math.abs(destination.longitude - s.longitude) <= MAX_LON_DELTA
    ) {
      const dMeters = haversineDistanceMeters(destination, s);
      if (dMeters <= MAX_ACCESS_METERS) {
        dijkstraState.exitEpoch[i] = epochId;
        dijkstraState.exitWalkMinutes[i] = stationAccessMinutes(destination, s);
        exitCount++;
      }
    }
  }

  if (exitCount === 0) {
    return { minutes: walkMinutes, mode: 'walk' };
  }

  // Find candidate entry stations within 1.2 km of origin
  let entryCount = 0;
  for (let i = 0; i < numStations; i++) {
    const s = stations[i];
    if (
      Math.abs(origin.latitude - s.latitude) <= MAX_LAT_DELTA &&
      Math.abs(origin.longitude - s.longitude) <= MAX_LON_DELTA
    ) {
      const dMeters = haversineDistanceMeters(origin, s);
      if (dMeters <= MAX_ACCESS_METERS) {
        const walkIn = stationAccessMinutes(origin, s);
        const initialCost = walkIn + INITIAL_WAIT_MINUTES;
        const stateId = i * stride; // lineIdx = 0
        dijkstraState.dist[stateId] = initialCost;
        dijkstraState.epoch[stateId] = epochId;
        dijkstraState.push(initialCost, i, 0, i);
        entryCount++;
      }
    }
  }

  if (entryCount === 0) {
    return { minutes: walkMinutes, mode: 'walk' };
  }

  let bestTransitCost = Infinity;
  let bestStationInIdx = -1;
  let bestStationOutIdx = -1;

  while (dijkstraState.pop(popNode)) {
    const { cost, stationIdx: u, lineIdx, originIdx } = popNode;

    // Prune if current cost cannot beat current best transit or direct walking
    if (cost >= bestTransitCost || cost >= walkMinutes) {
      break;
    }

    const stateId = u * stride + lineIdx;
    if (cost > dijkstraState.dist[stateId]) {
      continue;
    }

    // Check if station u is a valid exit station (must have completed at least 1 transit hop)
    if (lineIdx !== 0 && dijkstraState.exitEpoch[u] === epochId) {
      const totalCost = cost + dijkstraState.exitWalkMinutes[u];
      if (totalCost < bestTransitCost) {
        bestTransitCost = totalCost;
        bestStationInIdx = originIdx;
        bestStationOutIdx = u;
      }
    }

    // Relax connections from station u
    const connections = stations[u].connections;
    for (let c = 0; c < connections.length; c++) {
      const conn = connections[c];
      const v = conn.targetIdx;
      const connLineIdx = conn.lineIdx;

      let edgeCost: number;
      if (lineIdx === 0) {
        // Initial boarding has no transfer penalty
        edgeCost = conn.travelMinutes;
      } else if (lineIdx === connLineIdx) {
        // Continuing on the same line
        edgeCost = conn.travelMinutes;
      } else {
        // Transferring between lines
        edgeCost = transferPenaltyMinutes + conn.travelMinutes;
      }

      const nextCost = cost + edgeCost;
      const nextStateId = v * stride + connLineIdx;

      if (dijkstraState.epoch[nextStateId] !== epochId || nextCost < dijkstraState.dist[nextStateId]) {
        dijkstraState.dist[nextStateId] = nextCost;
        dijkstraState.epoch[nextStateId] = epochId;
        dijkstraState.push(nextCost, v, connLineIdx, originIdx);
      }
    }
  }

  const transitMinutes = Math.round(bestTransitCost);

  if (bestStationInIdx !== -1 && transitMinutes < walkMinutes) {
    return {
      minutes: transitMinutes,
      mode: 'transit',
      stationIn: stations[bestStationInIdx].id,
      stationOut: stations[bestStationOutIdx].id,
    };
  }

  return {
    minutes: walkMinutes,
    mode: 'walk',
  };
}
