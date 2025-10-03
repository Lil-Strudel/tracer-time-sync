import { createResource, createSignal, For, Show, Component } from "solid-js";

interface Log {
  id: number;
  variant: "success" | "error";
  message: string;
  details: string;
  time: string; // ISO timestamp string from database
}

const LogsViewer: Component = () => {
  const [expandedLogs, setExpandedLogs] = createSignal<Set<number>>(new Set());

  const fetchLogs = async (): Promise<Log[]> => {
    const response = await fetch("/api/logs");

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const logs: Log[] = await response.json();
    // Sort logs by time (newest first)
    return logs.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
    );
  };

  const [logs, { refetch }] = createResource<Log[]>(fetchLogs);

  const toggleDetails = (logId: number): void => {
    setExpandedLogs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const formatTime = (timeString: string): string => {
    const date = new Date(timeString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  interface LogItemProps {
    log: Log;
  }

  const LogItem: Component<LogItemProps> = (props) => {
    const isError = (): boolean => props.log.variant === "error";
    const isExpanded = (): boolean => expandedLogs().has(props.log.id);

    const variantClasses = (): string =>
      isError() ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200";

    const iconColor = (): string =>
      isError() ? "text-red-500" : "text-green-500";
    const timeColor = (): string =>
      isError() ? "text-red-600" : "text-green-600";

    const ErrorIcon: Component = () => (
      <svg
        class={`h-5 w-5 ${iconColor()}`}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fill-rule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"
        />
      </svg>
    );

    const SuccessIcon: Component = () => (
      <svg
        class={`h-5 w-5 ${iconColor()}`}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fill-rule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clip-rule="evenodd"
        />
      </svg>
    );

    const handleToggleClick = (e: MouseEvent): void => {
      e.preventDefault();
      toggleDetails(props.log.id);
    };

    return (
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div class={`${variantClasses()} px-4 py-3 border-b`}>
          <div class="flex items-start justify-between">
            <div class="flex items-start space-x-3 flex-1">
              <div class="flex-shrink-0">
                <Show when={isError()} fallback={<SuccessIcon />}>
                  <ErrorIcon />
                </Show>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900">
                  {props.log.message}
                </p>
                <p class={`text-xs ${timeColor()} mt-1`}>
                  {formatTime(props.log.time)}
                </p>
              </div>
            </div>
            <button
              class="ml-4 inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              onClick={handleToggleClick}
              type="button"
            >
              <span>{isExpanded() ? "Hide Details" : "Show Details"}</span>
              <svg
                class={`ml-1 h-3 w-3 transform transition-transform ${isExpanded() ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        <Show when={isExpanded()}>
          <div class="px-4 py-3 bg-gray-50">
            <h4 class="text-sm font-medium text-gray-900 mb-2">
              Detailed Log:
            </h4>
            <pre class="text-xs text-gray-600 bg-white p-3 rounded border overflow-x-auto whitespace-pre-wrap">
              {props.log.details}
            </pre>
          </div>
        </Show>
      </div>
    );
  };

  const LoadingSpinner: Component = () => (
    <div class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span class="ml-2 text-gray-600">Loading logs...</span>
    </div>
  );

  interface ErrorDisplayProps {
    error: Error;
  }

  const ErrorDisplay: Component<ErrorDisplayProps> = (props) => (
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg
            class="h-5 w-5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-red-800">Error loading logs</h3>
          <p class="mt-1 text-sm text-red-600">{props.error.message}</p>
        </div>
      </div>
    </div>
  );

  const EmptyState: Component = () => (
    <div class="text-center py-12 text-gray-500">
      <svg
        class="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p class="mt-2">No logs found</p>
    </div>
  );

  return (
    <div class="bg-gray-100 min-h-screen py-8">
      <div class="max-w-4xl mx-auto px-4">
        <div class="flex items-center justify-between mb-8">
          <h1 class="text-3xl font-bold text-gray-900">
            Application Logs
          </h1>
          <button
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={refetch}
            disabled={logs.loading}
            type="button"
          >
            <svg
              class={`-ml-1 mr-2 h-4 w-4 ${logs.loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {logs.loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <Show when={logs.loading}>
          <LoadingSpinner />
        </Show>

        <Show when={logs.error}>
          <ErrorDisplay error={logs.error as Error} />
        </Show>

        <Show when={logs() && !logs.loading && !logs.error}>
          <Show when={logs()!.length > 0} fallback={<EmptyState />}>
            <div class="space-y-4">
              <For each={logs()}>{(log: Log) => <LogItem log={log} />}</For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default LogsViewer;
