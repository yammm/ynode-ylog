import ylog from "../src/plugin.js";

// Initialize a standardized, robust command-line/systemd logger
// The 'import.meta' automatically tags output with the invoking file baseline.
const log = ylog(import.meta);

log.info("Application starting up...");

// Supports multiple dynamic arguments and contextual variables
const session = { id: 4891, role: "admin" };
log.debug("User session established:", session);

log.warn("Warning! Memory usage is approaching threshold.");

try {
    throw new Error("Simulated critical infrastructure failure.");
} catch (err) {
    // Shows the error suppression algorithm capping duplicate logs over time
    log.error(err);
    log.error(err);
    log.error(err); // Throttled from output to prevent log flooding
}

log.info("Demo complete. Shutting down.");
