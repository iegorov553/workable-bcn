import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TransitNetwork } from '../src/types/transit.ts';

const network = JSON.parse(
  readFileSync(new URL('../src/data/bcn-transit-network.json', import.meta.url), 'utf8')
) as TransitNetwork;

test('transit network includes major BCN metro/train lines and valid coordinates', () => {
  assert.ok(network.stations.length >= 150, 'Network should contain >= 150 stations');
  assert.equal(network.transferPenaltyMinutes, 3.5);

  const lines = new Set(network.stations.flatMap(s => s.lines));
  for (const requiredLine of ['L1', 'L2', 'L3', 'L4', 'L5', 'L9N', 'L9S', 'L10N', 'L10S', 'L6', 'L7', 'L8', 'L11', 'L12', 'T1', 'T4']) {
    assert.ok(lines.has(requiredLine), `Missing line ${requiredLine}`);
  }

  // Check key transfer stations
  const catalunya = network.stations.find(s => s.id === 'catalunya');
  assert.ok(catalunya, 'Catalunya station must exist');
  assert.ok(catalunya.lines.includes('L1') && catalunya.lines.includes('L3'));

  // Ensure coordinates fall within AMB bounding box
  for (const station of network.stations) {
    assert.ok(station.latitude >= 41.28 && station.latitude <= 41.48, `${station.name} lat out of range`);
    assert.ok(station.longitude >= 2.00 && station.longitude <= 2.26, `${station.name} lon out of range`);
    assert.ok(station.connections.length > 0, `${station.name} has no connections`);
  }
});

test('connections are bidirectional and specify positive travel times', () => {
  const stationMap = new Map(network.stations.map(s => [s.id, s]));
  for (const station of network.stations) {
    for (const conn of station.connections) {
      assert.ok(conn.travelMinutes > 0, `Connection from ${station.id} to ${conn.targetId} has invalid minutes`);
      const target = stationMap.get(conn.targetId);
      assert.ok(target, `Target station ${conn.targetId} not found`);
      const returnConn = target.connections.find(c => c.targetId === station.id && c.line === conn.line);
      assert.ok(returnConn, `Connection between ${station.id} and ${target.id} on line ${conn.line} must be bidirectional`);
      assert.equal(returnConn.travelMinutes, conn.travelMinutes, `Connection travel time between ${station.id} and ${target.id} on ${conn.line} must be symmetric`);
    }
  }
});

test('key interchange stations exist and have correct lines', () => {
  const check = (id: string, requiredLines: string[]) => {
    const station = network.stations.find(s => s.id === id);
    assert.ok(station, `Station ${id} must exist`);
    for (const line of requiredLines) {
      assert.ok(station.lines.includes(line), `Station ${id} must include line ${line}`);
    }
  };

  check('catalunya', ['L1', 'L3']);
  check('diagonal', ['L3', 'L5']);
  check('passeig-de-gracia', ['L2', 'L3', 'L4']);
  check('sagrera', ['L1', 'L5']);
  check('sants-estacio', ['L3', 'L5']);
  check('espanya', ['L1', 'L3', 'L8']);
});
