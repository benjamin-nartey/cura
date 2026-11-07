import {isCancellation, proxyActivities, CancellationScope} from "@temporalio/workflow";

type Activities = {
  advance(runId:string):Promise<string>;
  stop(runId:string,reason:"cancelled"|"workflow-failed"):Promise<void>;
};

const {advance,stop} = proxyActivities<Activities>({
  startToCloseTimeout:"8 seconds",
  scheduleToCloseTimeout:"75 seconds",
  retry:{maximumAttempts:3,initialInterval:"1 second"},
});

export async function chartReviewWorkflow(runId:string):Promise<string> {
  try {
    return await advance(runId);
  } catch (error) {
    await CancellationScope.nonCancellable(() => stop(runId,isCancellation(error) ? "cancelled" : "workflow-failed"));
    throw error;
  }
}
