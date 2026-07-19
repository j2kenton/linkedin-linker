import "./background";
import { handleCareerMessage, initializeCareerTools, subscribeCareerJob, type CareerJob } from "./aiClient";
import { respondAfterCareerInitialization } from "./careerStatus";

let careerStatus: Promise<{ locked: boolean; reason?: string }> = initializeCareerTools();
chrome.runtime.onInstalled.addListener(() => { careerStatus = initializeCareerTools(); });

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "setMaxConnections" && typeof request.maxConnections === "string") { chrome.storage.local.set({ maxConnections: request.maxConnections }); sendResponse({ status: "received" }); return; }
  if (request.action === "CAREER_TOOLS_STATUS") return respondAfterCareerInitialization(careerStatus, sendResponse);
  if (String(request.action || "").startsWith("CAREER_") || request.action === "ENSURE_JOB") { careerStatus.then(status => handleCareerMessage(request, status).then(sendResponse)); return true; }
  return undefined;
});

// A report page keeps one port open while a job is active. Delta updates use
// this channel for progressive rendering; storage is still read on subscribe
// and after reconnect, so a worker restart cannot lose report state.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "career-report") return;
  let connected = true;
  let unsubscribe: (() => void) | undefined;
  const post = (message: object) => {
    if (!connected) return;
    try { port.postMessage(message); } catch { connected = false; unsubscribe?.(); }
  };
  const cleanup = () => { connected = false; unsubscribe?.(); unsubscribe = undefined; };
  port.onDisconnect.addListener(cleanup);
  port.onMessage.addListener(request => {
    if (request?.action !== "CAREER_SUBSCRIBE" || typeof request.id !== "string") return;
    unsubscribe?.();
    careerStatus.then(async status => {
      if (!connected) return;
      const response = await handleCareerMessage({ action:"ENSURE_JOB", id:request.id }, status) as { ok?:boolean; error?:string; job?: CareerJob };
      if (!connected) return;
      if (!response.ok || !response.job) { post({ type:"CAREER_ERROR", error:response.error || "Report not found." }); return; }
      unsubscribe = subscribeCareerJob(request.id, job => post({ type:"CAREER_JOB", job }));
      post({ type:"CAREER_JOB", job:response.job });
    }).catch(() => post({ type:"CAREER_ERROR", error:"Unable to restore the report connection." }));
  });
});
