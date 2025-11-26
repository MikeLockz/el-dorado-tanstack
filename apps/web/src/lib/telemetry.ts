
export interface TelemetryEvent {
    event: string;
    metadata: Record<string, string | number | boolean | undefined>;
}

export function recordUiEvent(event: string, metadata: Record<string, string | number | boolean | undefined> = {}) {
    const enrichedMetadata = {
        ...metadata,
        featureFlag_lobbyView: import.meta.env.VITE_SHOW_LOBBY_VIEW,
    };

    // In a real app, this would send data to an analytics service (e.g., PostHog, Segment, GA).
    // For now, we'll log it to the console in development.
    if (import.meta.env.DEV) {
        console.groupCollapsed(`[Telemetry] ${event}`);
        console.table(enrichedMetadata);
        console.groupEnd();
    }

    // TODO: Hook up to real analytics provider
}
