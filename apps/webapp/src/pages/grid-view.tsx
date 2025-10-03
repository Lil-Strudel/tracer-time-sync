import { type Component, createSignal, createMemo, For, Show } from "solid-js";

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

const aidStations = ["Start", "Aid 1", "Aid 2", "Finish"];

const initialData: Runner[] = [
  {
    bib: 101,
    name: "Alice",
    aidStations: {
      Start: {
        in: { value: "08:00", status: "synced" },
        out: { value: "08:05", status: "synced" },
      },
      "Aid 1": {
        in: { value: "09:10", status: "unsynced" },
        out: { value: null, status: "missing" },
      },
      "Aid 2": {
        in: { value: null, status: "missing" },
        out: { value: null, status: "missing" },
      },
      Finish: {
        in: { value: null, status: "missing" },
        out: { value: null, status: "missing" },
      },
    },
  },
  {
    bib: 202,
    name: "Bob",
    aidStations: {
      Start: {
        in: { value: "08:00", status: "synced" },
        out: { value: "08:03", status: "synced" },
      },
      "Aid 1": {
        in: { value: "09:00", status: "synced" },
        out: { value: "09:05", status: "unsynced" },
      },
      "Aid 2": {
        in: { value: null, status: "missing" },
        out: { value: null, status: "missing" },
      },
      Finish: {
        in: { value: null, status: "missing" },
        out: { value: null, status: "missing" },
      },
    },
  },
];

const GridView: Component = () => {
  const [runners, setRunners] = createSignal<Runner[]>(initialData);
  const [sortBy, setSortBy] = createSignal<"bib" | "progress">("bib");

  const sortedRunners = createMemo(() => {
    let list = [...runners()];
    if (sortBy() === "bib") {
      return list.sort((a, b) => a.bib - b.bib);
    }
    if (sortBy() === "progress") {
      const progress = (runner: Runner) =>
        aidStations.reduce((count, station) => {
          const entry = runner.aidStations[station];
          return entry?.out.value ? count + 1 : count;
        }, 0);
      return list.sort((a, b) => progress(b) - progress(a));
    }
    return list;
  });

  const syncAll = () => {
    console.log("Syncing all times...");
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
    <div class="p-4 space-y-4">
      The Deploy Worked!!
      <div class="flex justify-between items-center">
        <h1 class="text-xl font-bold">Aid Station Sync</h1>
        <button
          onClick={syncAll}
          class="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
        >
          Sync All
        </button>
      </div>
      <div class="flex space-x-2">
        <button
          onClick={() => setSortBy("bib")}
          class={`px-3 py-1 rounded ${
            sortBy() === "bib" ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          Sort by Bib
        </button>
        <button
          onClick={() => setSortBy("progress")}
          class={`px-3 py-1 rounded ${
            sortBy() === "progress" ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          Sort by Progress
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="table-auto border-collapse border border-gray-300 w-full text-sm">
          <thead>
            <tr class="bg-gray-100">
              <th class="border border-gray-300 px-2 py-1">Bib</th>
              <th class="border border-gray-300 px-2 py-1">Name</th>
              <For each={aidStations}>
                {(station) => (
                  <th class="border border-gray-300 px-2 py-1" colspan={2}>
                    {station}
                  </th>
                )}
              </For>
              <th class="border border-gray-300 px-2 py-1">Actions</th>
            </tr>
            <tr class="bg-gray-50">
              <th></th>
              <th></th>
              <For each={aidStations}>
                {() => (
                  <>
                    <th class="border border-gray-300 px-2 py-1">In</th>
                    <th class="border border-gray-300 px-2 py-1">Out</th>
                  </>
                )}
              </For>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <For each={sortedRunners()}>
              {(runner) => (
                <tr>
                  <td class="border border-gray-300 px-2 py-1">{runner.bib}</td>
                  <td class="border border-gray-300 px-2 py-1">
                    {runner.name}
                  </td>
                  <For each={aidStations}>
                    {(station) => (
                      <>
                        <td
                          class={`border border-gray-300 px-2 py-1 text-center ${statusColor(
                            runner.aidStations[station]?.in.status,
                          )}`}
                        >
                          <Show
                            when={runner.aidStations[station]?.in.value}
                            fallback={"—"}
                          >
                            {runner.aidStations[station]?.in.value}
                          </Show>
                        </td>
                        <td
                          class={`border border-gray-300 px-2 py-1 text-center ${statusColor(
                            runner.aidStations[station]?.out.status,
                          )}`}
                        >
                          <Show
                            when={runner.aidStations[station]?.out.value}
                            fallback={"—"}
                          >
                            {runner.aidStations[station]?.out.value}
                          </Show>
                        </td>
                      </>
                    )}
                  </For>
                  <td class="border border-gray-300 px-2 py-1 text-center">
                    <button
                      onClick={() => syncRunner(runner.bib)}
                      class="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Sync
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GridView;
