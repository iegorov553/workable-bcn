export type TransitConnection = {
  targetId: string;
  travelMinutes: number;
  line: string;
};

export type TransitStation = {
  id: string;
  name: string;
  lines: string[];
  latitude: number;
  longitude: number;
  connections: TransitConnection[];
};

export type TransitNetwork = {
  version: string;
  transferPenaltyMinutes: number;
  stations: TransitStation[];
};
