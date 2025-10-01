import { Context, APIGatewayProxyCallback, APIGatewayEvent } from "aws-lambda";
import { db } from "./db";
import { TrackMyRacerAPI } from "./sdks/tracer";
import {
  OpenSplitTimeAPI,
  PostRawTimesRequest,
  RawTimePayload,
} from "./sdks/ost";
import { timeSyncsTable } from "./db/schema";

type APIGatewayHandler = (
  event: APIGatewayEvent,
  context: Context,
  callback: APIGatewayProxyCallback,
) => Promise<void>;

function logRequest(event: APIGatewayEvent, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);
}

const REPLACEME_VALUES = {
  openSplitTimeGroupId: "",
  openSplitTimeAPIKey: "",
  tracerEventId: "670136deec99861e39ee339f",
} as const;

const tracer = new TrackMyRacerAPI();
const ost = new OpenSplitTimeAPI();

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

export const postSyncAll: APIGatewayHandler = async (
  event,
  context,
  callback,
) => {
  logRequest(event, context);

  const participants = await tracer.getParticipants(
    REPLACEME_VALUES.tracerEventId,
  );
  const entries = await tracer.getEntries(REPLACEME_VALUES.tracerEventId);
  const stations = await tracer.getStations(REPLACEME_VALUES.tracerEventId);

  const requestBody: PostRawTimesRequest = {
    data: [],
    data_format: "jsonapi_batch",
    limited_response: "true",
  };

  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const stationMap = new Map(stations.map((s) => [s.id, s]));

  const timeSyncs = await db.select().from(timeSyncsTable);
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
        console.log(JSON.stringify({ station, participant, entry }, null, 2));
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
        console.log(JSON.stringify({ station, participant, entry }, null, 2));
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
    await ost.postRawTimes(
      REPLACEME_VALUES.openSplitTimeGroupId,
      requestBody,
      REPLACEME_VALUES.openSplitTimeAPIKey,
    );
    await db.insert(timeSyncsTable).values(newSyncedRows);
  }

  console.log(
    `Values: ${JSON.stringify(
      {
        requestBody,
        newSyncedRows,
      },
      null,
      2,
    )}`,
  );

  callback(null, {
    statusCode: 200,
    body: JSON.stringify({ message: "Success" }),
  });
};
