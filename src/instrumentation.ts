export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Print what still needs configuring before the tracker starts, so it is the first thing in the log.
    const { readinessReport, logReport } = await import("./server/preflight");
    const { unfilledSiteFields } = await import("./config/site");
    logReport(readinessReport(process.env, unfilledSiteFields(), process.versions.node));

    const { startJob } = await import("./server/job");
    startJob();
  }
}
