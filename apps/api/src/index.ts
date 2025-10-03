import { Context, APIGatewayProxyCallback, APIGatewayEvent } from "aws-lambda";
import { db } from "./db";
import { Entry, Station, TrackMyRacerAPI } from "./sdks/tracer";
import {
  OpenSplitTimeAPI,
  PostRawTimesRequest,
  RawTimePayload,
} from "./sdks/ost";
import { appStatesTable, logsTable, timeSyncsTable } from "./db/schema";

type APIGatewayHandler = (
  event: APIGatewayEvent,
  context: Context,
  callback: APIGatewayProxyCallback,
) => Promise<void>;

function logRequest(event: APIGatewayEvent, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);
}

const tracer = new TrackMyRacerAPI();
const ost = new OpenSplitTimeAPI();

async function getAppState() {
  const data = await db.select().from(appStatesTable);
  const appState = data[0];
  if (!appState) {
    throw new Error("App state has not been configured");
  }

  return appState;
}

export const trytm = async <T>(
  promise: Promise<T>,
): Promise<[T, null] | [null, Error]> => {
  try {
    const data = await promise;
    return [data, null];
  } catch (throwable) {
    if (throwable instanceof Error) return [null, throwable];

    throw throwable;
  }
};

function formatUtahTime(date: Date): string {
  const year = date.getUTCFullYear();

  const dstStart = new Date(year, 2, 1); // March 1st
  dstStart.setUTCDate(dstStart.getUTCDate() + (7 - dstStart.getUTCDay()) + 7); // Second Sunday
  dstStart.setUTCHours(9, 0, 0, 0); // 2 AM MST = 9 AM UTC

  const dstEnd = new Date(year, 10, 1); // November 1st
  dstEnd.setUTCDate(dstEnd.getUTCDate() + (7 - dstEnd.getUTCDay())); // First Sunday
  dstEnd.setUTCHours(8, 0, 0, 0); // 2 AM MDT = 8 AM UTC

  const isDST = date >= dstStart && date < dstEnd;
  const offsetHours = isDST ? -6 : -7;
  const offsetString = isDST ? "-06:00" : "-07:00";

  const mountainTime = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);

  const formatted = mountainTime
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  return formatted + offsetString;
}

interface RawTimeData {
  bibNumber: string;
  splitName: string;
  stoppedHere: "true" | "false";
}
function makeRawTimePayload(
  entryTime: Date,
  subSplitKind: "in" | "out",
  data: RawTimeData,
): RawTimePayload {
  return {
    type: "raw_time",
    attributes: {
      source: "dcp-time-sync",
      sub_split_kind: subSplitKind,
      with_pacer: "false",
      entered_time: formatUtahTime(entryTime),
      split_name: data.splitName,
      bib_number: data.bibNumber,
      stopped_here: data.stoppedHere,
    },
  };
}

async function handleError(
  message: string,
  err: Error,
  callback: APIGatewayProxyCallback,
) {
  await db.insert(logsTable).values({
    variant: "error",
    message,
    details: JSON.stringify(err, Object.getOwnPropertyNames(err), 2),
  });
  callback(err, { statusCode: 500, body: JSON.stringify({ message }) });

  return;
}

export const getPing: APIGatewayHandler = async (event, context, callback) => {
  logRequest(event, context);

  callback(null, {
    statusCode: 200,
    body: JSON.stringify({ message: "Pong!" }),
  });
};

export const postSyncAll: APIGatewayHandler = async (
  event,
  context,
  callback,
) => {
  logRequest(event, context);
  const [appState, err] = await trytm(getAppState());
  if (err !== null) {
    const message = `Error fetching app state`;
    await handleError(message, err, callback);
    return;
  }

  const [participants, err1] = await trytm(
    tracer.getParticipants(appState.tracer_event_id),
  );
  if (err1 !== null) {
    const message = `Could not fetch participants from tracer. Event ID: ${appState.tracer_event_id}`;
    await handleError(message, err1, callback);
    return;
  }

  const [entries, err2] = await trytm(
    tracer.getEntries(appState.tracer_event_id),
  );
  if (err2 !== null) {
    const message = `Could not fetch entries from tracer. Event ID: ${appState.tracer_event_id}`;
    await handleError(message, err2, callback);
    return;
  }

  const [stations, err3] = await trytm(
    tracer.getStations(appState.tracer_event_id),
  );
  if (err3 !== null) {
    const message = `Could not fetch stations from tracer. Event ID: ${appState.tracer_event_id}`;
    await handleError(message, err3, callback);
    return;
  }

  const requestBody: PostRawTimesRequest = {
    data: [],
    data_format: "jsonapi_batch",
    limited_response: "true",
  };

  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const stationMap = new Map(stations.map((s) => [s.id, s]));

  const [timeSyncs, err4] = await trytm(db.select().from(timeSyncsTable));
  if (err4 !== null) {
    const message = `Could not fetch time syncs from the db.`;
    handleError(message, err4, callback);
    return;
  }

  const timeSyncSet = new Set(
    timeSyncs.map((r) => `${r.tracer_entry_id}-${r.split_kind}`),
  );

  const newSyncedRows: (typeof timeSyncsTable.$inferInsert)[] = [];

  for (const entry of entries) {
    const participant = participantMap.get(entry.participantId);
    const station = stationMap.get(entry.stationId);
    if (!participant || !station) continue;

    const stoppedHere =
      participant.dnfStation !== null &&
      station.stationNumber === participant.dnfStation
        ? "true"
        : "false";

    const rawTimeData: RawTimeData = {
      bibNumber: participant.bibNumber.toString(),
      splitName: station.name,
      stoppedHere,
    };

    if (entry.timeIn) {
      const key = `${entry.id}-in`;
      if (!timeSyncSet.has(key)) {
        requestBody.data.push(
          makeRawTimePayload(new Date(entry.timeIn), "in", rawTimeData),
        );
        newSyncedRows.push({
          tracer_entry_id: entry.id,
          tracer_participant_id: participant.id,
          tracer_station_id: station.id,
          split_kind: "in",
        });
      }
    }

    if (entry.timeOut) {
      const key = `${entry.id}-out`;
      if (!timeSyncSet.has(key)) {
        requestBody.data.push(
          makeRawTimePayload(new Date(entry.timeOut), "out", rawTimeData),
        );
        newSyncedRows.push({
          tracer_entry_id: entry.id,
          tracer_participant_id: participant.id,
          tracer_station_id: station.id,
          split_kind: "out",
        });
      }
    }
  }

  if (newSyncedRows.length > 0 && requestBody.data.length > 0) {
    const [, err5] = await trytm(
      ost.postRawTimes(
        appState.ost_group_id,
        requestBody,
        appState.ost_api_key,
      ),
    );
    if (err5 !== null) {
      const message = `There was an error while pushing the times to open split time.`;

      const details = {
        requestBody,
        error: JSON.stringify(err, Object.getOwnPropertyNames(err), 2),
      };

      await db.insert(logsTable).values({
        variant: "error",
        message,
        details: JSON.stringify(details, null, 2),
      });

      callback(err, { statusCode: 500, body: JSON.stringify({ message }) });
      return;
    }

    const [, err6] = await trytm(
      db.insert(timeSyncsTable).values(newSyncedRows),
    );

    if (err6 !== null) {
      const message = `There was an error when saving the synced times to the db.`;
      await handleError(message, err6, callback);
      return;
    }
  }

  const [, err7] = await trytm(
    db.insert(logsTable).values({
      variant: "success",
      message: "Successfully synced all times",
      details: JSON.stringify({ requestBody }, null, 2),
    }),
  );

  if (err7 !== null) {
    const message = `There was an error when trying to create the success log`;
    await handleError(message, err7, callback);
    return;
  }

  callback(null, {
    statusCode: 200,
    body: JSON.stringify({ message: "Success" }),
  });
};

export const getLogs: APIGatewayHandler = async (event, context, callback) => {
  logRequest(event, context);

  const logs = await db.select().from(logsTable);

  callback(null, {
    statusCode: 200,
    body: JSON.stringify(logs),
  });
};

type TimeStatus = "synced" | "unsynced" | "missing";

interface TimeValue {
  value: string | null;
  status: TimeStatus;
}

interface AidStationTimes {
  in: TimeValue;
  out: TimeValue;
}

interface ParticipantResult {
  bib: number;
  name: string;
  aidStations: Record<string, AidStationTimes>;
}
export const getSyncStatus: APIGatewayHandler = async (
  event,
  context,
  callback,
) => {
  logRequest(event, context);
  const appState = await getAppState();

  const [participants, stations, entries, timeSyncs] = await Promise.all([
    tracer.getParticipants(appState.tracer_event_id),
    tracer.getStations(appState.tracer_event_id),
    tracer.getEntries(appState.tracer_event_id),
    db.select().from(timeSyncsTable),
  ]);

  const stationMap = new Map<string, Station>();
  stations.forEach((s) => stationMap.set(s.id, s));

  const entryMap = new Map<string, Entry[]>();
  entries.forEach((entry) => {
    if (!entryMap.has(entry.participantId)) {
      entryMap.set(entry.participantId, []);
    }
    entryMap.get(entry.participantId)!.push(entry);
  });

  const syncedLookup = new Map<string, Set<string>>();
  timeSyncs.forEach((sync) => {
    const key = `${sync.tracer_participant_id}:${sync.tracer_station_id}:${sync.split_kind}`;
    if (!syncedLookup.has(key)) {
      syncedLookup.set(key, new Set());
    }
    syncedLookup.get(key)!.add(sync.tracer_entry_id);
  });

  const results: ParticipantResult[] = participants.map((participant) => {
    const participantEntries = entryMap.get(participant.id) ?? [];

    const entriesByStation = new Map<string, Entry>();
    participantEntries.forEach((e) => {
      entriesByStation.set(e.stationId, e);
    });

    const aidStations: Record<string, AidStationTimes> = {};
    stations.forEach((station) => {
      const entry = entriesByStation.get(station.id);

      const getStatus = (
        value: string | null,
        splitKind: "in" | "out",
      ): TimeStatus => {
        if (!value) return "missing";
        const key = `${participant.id}:${station.id}:${splitKind}`;
        const synced = syncedLookup.get(key);
        return synced && synced.has(entry?._id ?? "") ? "synced" : "unsynced";
      };

      aidStations[station.name] = {
        in: {
          value: entry?.timeIn ?? null,
          status: getStatus(entry?.timeIn ?? null, "in"),
        },
        out: {
          value: entry?.timeOut ?? null,
          status: getStatus(entry?.timeOut ?? null, "out"),
        },
      };
    });

    return {
      bib: participant.bibNumber,
      name: `${participant.firstName} ${participant.lastName}`,
      aidStations,
    };
  });

  callback(null, {
    statusCode: 200,
    body: JSON.stringify(results),
  });
};
