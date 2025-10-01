import axios from "redaxios";

export interface Entry {
  _id: string;
  eventId: string;
  participantId: string;
  stationId: string;
  timeIn: string | null;
  timeOut: string | null;
  createdAt: string;
  updatedAt: string;
  __v: number;
  id: string;
}

export interface Participant {
  _id: string;
  bibNumber: number;
  dnfReason: string;
  dnfStation: number;
  eventId: string;
  firstName: string;
  lastName: string;
  raceId: string;
  id: string;
}

export interface Station {
  _id: string;
  eventId: string;
  name: string;
  distance: number;
  stationNumber: number;
  stationNumberDisplayed: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
  id: string;
}

export interface Race {
  _id: string;
  eventId: string;
  name: string;
  stations: { id: string }[];
  createdAt: string;
  updatedAt: string;
  __v: number;
  stationsPopulated: Station[];
  id: string;
}

export class TrackMyRacerAPI {
  private baseUrl = "https://trackmyracer.live/api/v1/events";

  async getEntries(eventId: string): Promise<Entry[]> {
    const res = await axios.get<Entry[]>(`${this.baseUrl}/${eventId}/entries`);
    return res.data;
  }

  async getParticipants(eventId: string): Promise<Participant[]> {
    const res = await axios.get<Participant[]>(
      `${this.baseUrl}/${eventId}/participants`,
    );
    return res.data;
  }

  async getStations(eventId: string): Promise<Station[]> {
    const res = await axios.get<Station[]>(
      `${this.baseUrl}/${eventId}/stations`,
    );
    return res.data;
  }

  async getRaces(eventId: string): Promise<Race[]> {
    const res = await axios.get<Race[]>(`${this.baseUrl}/${eventId}/races`);
    return res.data;
  }
}
