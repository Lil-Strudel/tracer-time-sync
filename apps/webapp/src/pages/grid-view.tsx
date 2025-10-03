import {
  type Component,
  createSignal,
  createMemo,
  createResource,
  For,
  Show,
} from "solid-js";
import LogsViewer from "../components/log-viewer";

type TimeStatus = "synced" | "unsynced" | "missing";

interface TimeEntry {
  in: { value: string | null; status: TimeStatus };
  out: { value: string | null; status: TimeStatus };
}

interface Runner {
  bib: number;
  name: string;
  aidStations: Record<string, TimeEntry>;
}

const GridView: Component = () => {
  const [sortBy, setSortBy] = createSignal<"bib" | "progress">("bib");
  const [isSyncing, setIsSyncing] = createSignal(false);

  const fetchSyncStatus = async () => {
    const response = await fetch("/api/sync-status");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Extract runners data
    const runners = data.runners || data;

    // Derive aid stations from the response
    let aidStations: string[] = [];
    if (data.aidStations) {
      aidStations = data.aidStations;
    } else if (data.runners?.length > 0) {
      const firstRunner = data.runners[0];
      aidStations = Object.keys(firstRunner.aidStations || {});
    } else if (Array.isArray(data) && data.length > 0) {
      const firstRunner = data[0];
      aidStations = Object.keys(firstRunner.aidStations || {});
    }

    return { runners, aidStations };
  };

  const [syncData, { refetch }] = createResource(fetchSyncStatus);

  const formatTime = (timeValue: string | null): string => {
    if (!timeValue) return "—";

    if (/^\d{2}:\d{2}$/.test(timeValue)) {
      return timeValue;
    }

    try {
      const date = new Date(timeValue);
      if (isNaN(date.getTime())) {
        return timeValue;
      }
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return timeValue;
    }
  };

  const sortedRunners = createMemo(() => {
    const data = syncData();
    if (!data?.runners) return [];

    let list = [...data.runners];
    if (sortBy() === "bib") {
      return list.sort((a, b) => a.bib - b.bib);
    }
    if (sortBy() === "progress") {
      const progress = (runner: Runner) =>
        (data.aidStations || []).reduce((count, station) => {
          const entry = runner.aidStations[station];
          return entry?.out.value ? count + 1 : count;
        }, 0);
      return list.sort((a, b) => progress(b) - progress(a));
    }
    return list;
  });

  const syncAll = async () => {
    if (isSyncing()) return;

    setIsSyncing(true);
    try {
      const response = await fetch("/api/sync-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log("Sync completed successfully");
      // Refetch the sync status to get updated data
      refetch();
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncRunner = (bib: number) => {
    console.log(`Syncing runner ${bib}...`);
  };

  const statusColor = (status: TimeStatus) => {
    switch (status) {
      case "synced":
        return "bg-green-200";
      case "unsynced":
        return "bg-yellow-200";
      default:
        return "";
    }
  };

  return (
    <div class="flex flex-col lg:flex-row gap-4 justify-between min-h-screen">
      <div class="flex-1 p-2 sm:p-4 space-y-4">
        <Show when={syncData.loading}>
          <div class="flex justify-center items-center p-8">
            <div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <span class="ml-2">Loading sync status...</span>
          </div>
        </Show>
        <Show when={syncData.error}>
          <div class="flex justify-center items-center p-8 text-red-600">
            <span>Error loading sync status: {syncData.error.message}</span>
          </div>
        </Show>
        <Show when={syncData() && !syncData.loading}>
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 class="text-lg sm:text-xl font-bold">Aid Station Sync</h1>
            <div class="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => refetch()}
                disabled={syncData.loading}
                class={`px-3 py-2 text-sm sm:text-base rounded-lg shadow flex items-center gap-2 whitespace-nowrap ${
                  syncData.loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-gray-600 hover:bg-gray-700"
                } text-white`}
              >
                <Show when={syncData.loading}>
                  <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                </Show>
                {syncData.loading ? "Refreshing..." : "Refresh"}
              </button>
              <button
                onClick={syncAll}
                disabled={isSyncing()}
                class={`px-3 py-2 sm:px-4 text-sm sm:text-base rounded-lg shadow flex items-center gap-2 whitespace-nowrap ${
                  isSyncing()
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                } text-white`}
              >
                <Show when={isSyncing()}>
                  <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                </Show>
                {isSyncing() ? "Syncing..." : "Sync All"}
              </button>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              onClick={() => setSortBy("bib")}
              class={`px-2 py-1 sm:px-3 text-sm rounded ${
                sortBy() === "bib" ? "bg-blue-500 text-white" : "bg-gray-200"
              }`}
            >
              Sort by Bib
            </button>
            <button
              onClick={() => setSortBy("progress")}
              class={`px-2 py-1 sm:px-3 text-sm rounded ${
                sortBy() === "progress"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200"
              }`}
            >
              Sort by Progress
            </button>
          </div>
          <div class="w-full overflow-x-auto border border-gray-300 rounded-lg shadow-sm">
            <table class="table-auto border-collapse border-0 w-full text-xs sm:text-sm min-w-max">
              <thead>
                <tr class="bg-gray-100">
                  <th class="border border-gray-300 px-1 py-1 sm:px-2 sticky left-0 bg-gray-100 z-10 min-w-[50px]">
                    Bib
                  </th>
                  <th class="border border-gray-300 px-1 py-1 sm:px-2 sticky left-[50px] bg-gray-100 z-10 min-w-[80px] sm:min-w-[100px]">
                    Name
                  </th>
                  <For each={syncData()?.aidStations || []}>
                    {(station) => (
                      <th
                        class="border border-gray-300 px-1 py-1 sm:px-2 min-w-[100px] sm:min-w-[120px]"
                        colspan={2}
                      >
                        {station}
                      </th>
                    )}
                  </For>
                </tr>
                <tr class="bg-gray-50">
                  <th class="sticky left-0 bg-gray-50 z-10"></th>
                  <th class="sticky left-[50px] bg-gray-50 z-10"></th>
                  <For each={syncData()?.aidStations || []}>
                    {() => (
                      <>
                        <th class="border border-gray-300 px-1 py-1 sm:px-2 text-xs">
                          In
                        </th>
                        <th class="border border-gray-300 px-1 py-1 sm:px-2 text-xs">
                          Out
                        </th>
                      </>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={sortedRunners()}>
                  {(runner) => (
                    <tr>
                      <td class="border border-gray-300 px-1 py-1 sm:px-2 sticky left-0 bg-white z-10 font-medium">
                        {runner.bib}
                      </td>
                      <td
                        class="border border-gray-300 px-1 py-1 sm:px-2 sticky left-[50px] bg-white z-10 font-medium truncate max-w-[80px] sm:max-w-[100px]"
                        title={runner.name}
                      >
                        {runner.name}
                      </td>
                      <For each={syncData()?.aidStations || []}>
                        {(station) => (
                          <>
                            <td
                              class={`border border-gray-300 px-1 py-1 sm:px-2 text-center text-xs sm:text-sm ${statusColor(
                                runner.aidStations[station]?.in.status,
                              )}`}
                            >
                              <Show
                                when={runner.aidStations[station]?.in.value}
                                fallback={formatTime(null)}
                              >
                                {formatTime(
                                  runner.aidStations[station]?.in.value,
                                )}
                              </Show>
                            </td>
                            <td
                              class={`border border-gray-300 px-1 py-1 sm:px-2 text-center text-xs sm:text-sm ${statusColor(
                                runner.aidStations[station]?.out.status,
                              )}`}
                            >
                              <Show
                                when={runner.aidStations[station]?.out.value}
                                fallback={formatTime(null)}
                              >
                                {formatTime(
                                  runner.aidStations[station]?.out.value,
                                )}
                              </Show>
                            </td>
                          </>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
      <div class="w-full lg:w-80 xl:w-96">
        <LogsViewer />
      </div>
    </div>
  );
};

export default GridView;
