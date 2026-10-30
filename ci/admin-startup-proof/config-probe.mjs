//#region ../auth-continuation/white-screen-fix/source/src/buildIdentity.ts
function text(value, field) {
	if (value === void 0 || value === null || value === "") return void 0;
	if (typeof value !== "string") throw new Error("Invalid build identity field: " + field);
	return value.trim() || void 0;
}
function sourceCommit(value, field) {
	const commit = text(value, field);
	if (commit && !/^[0-9a-f]{40}$/i.test(commit)) throw new Error("Invalid 40-hex source commit: " + field);
	return commit?.toLowerCase();
}
function resolveBuildIdentity(input) {
	const buildSha = sourceCommit(input.buildSha, "VITE_FASTLINK_BUILD_SHA");
	const runtimeSha = sourceCommit(input.runtimeBuildSha, "runtime.buildSha");
	const candidateId = text(input.candidateId, "VITE_FASTLINK_CANDIDATE_ID");
	if (candidateId && !/^FL-LAUNCH-B[1-9][0-9]*-[0-9]{8}(?:-[a-z0-9]+)*$/.test(candidateId)) throw new Error("Invalid candidate ID; it is not a Git SHA");
	if (candidateId && !buildSha) throw new Error("UNBOUND_CANDIDATE: missing build-time source commit");
	if (buildSha && runtimeSha && buildSha !== runtimeSha) throw new Error("Conflicting build-time and runtime source commits");
	const commit = buildSha || runtimeSha;
	if (!commit) throw new Error("UNBOUND_SOURCE_COMMIT");
	const snapshot = text(input.sourceSnapshot, "VITE_FASTLINK_SOURCE_SNAPSHOT");
	if (snapshot && !/^[0-9a-f]{64}$/.test(snapshot)) throw new Error("Invalid source snapshot");
	if (snapshot && !candidateId) throw new Error("UNBOUND_CANDIDATE");
	const status = snapshot ? "PREVIEW_SOURCE_SNAPSHOT_BOUND_NOT_DEPLOYED" : candidateId ? "CANDIDATE_VERSION_BOUND_NOT_DEPLOYED" : "SOURCE_COMMIT_ONLY_NOT_CANDIDATE_BOUND";
	const deployment = candidateId ? "NOT_DEPLOYED" : "NOT_VERIFIED";
	return Object.freeze({
		sourceCommit: commit,
		sourceSnapshot: snapshot || null,
		source: buildSha ? "BUILD_TIME" : "RUNTIME_SOURCE_ONLY",
		candidateId: candidateId || null,
		status,
		deployment,
		displayLabel: "Candidate: " + (candidateId || "UNBOUND") + " · Base: " + commit.slice(0, 12) + " · " + (snapshot ? "Snapshot: " + snapshot.slice(0, 12) + " · Stage: PREVIEW_BUILD · Release: UNBOUND" : deployment)
	});
}
//#endregion
//#region ../auth-continuation/white-screen-fix/source/src/runtimeConfig.ts
function required(name) {
	const value = {
		"BASE_URL": "/",
		"DEV": false,
		"MODE": "production",
		"PROD": true,
		"SSR": false,
		"VITE_FASTLINK_API_URL": "/api",
		"VITE_FASTLINK_BUILD_SHA": "bf72fcc33962576049ae077e80286a06b9f46fb5",
		"VITE_FASTLINK_CANDIDATE_ID": "FL-LAUNCH-B17-20261030-revenue-read-startup-fix",
		"VITE_FASTLINK_ENVIRONMENT": "TEST",
		"VITE_FASTLINK_PREVIEW_MODE": "READ_ONLY",
		"VITE_FASTLINK_SOURCE_SNAPSHOT": "72e2068f3da57751c3e779ceb2315391df568777f9cdb9c6f712b471828aca33"
	}[name];
	if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing required build variable: ${name}`);
	return value.trim();
}
var buildEnvironment = required("VITE_FASTLINK_ENVIRONMENT");
var environment = window.__FASTLINK_RUNTIME__?.environment?.trim() || buildEnvironment;
if (![
	"LOCAL",
	"SANDBOX",
	"TEST",
	"UAT",
	"PRODUCTION"
].includes(environment)) throw new Error("VITE_FASTLINK_ENVIRONMENT must be LOCAL, SANDBOX, TEST, UAT, or PRODUCTION");
var buildApiUrl = required("VITE_FASTLINK_API_URL");
var apiUrl = (window.__FASTLINK_RUNTIME__?.apiUrl?.trim() || buildApiUrl).replace(/\/$/, "");
if (apiUrl !== "/api" && !/^https:\/\//.test(apiUrl)) throw new Error("VITE_FASTLINK_API_URL must be same-origin /api or an absolute HTTPS URL");
if ([
	"SANDBOX",
	"TEST",
	"PRODUCTION"
].includes(environment) && apiUrl !== "/api") throw new Error(`${environment} Cloudflare Admin must use same-origin /api`);
var buildIdentity = resolveBuildIdentity({
	buildSha: "bf72fcc33962576049ae077e80286a06b9f46fb5",
	runtimeBuildSha: window.__FASTLINK_RUNTIME__?.buildSha,
	candidateId: "FL-LAUNCH-B17-20261030-revenue-read-startup-fix",
	sourceSnapshot: "72e2068f3da57751c3e779ceb2315391df568777f9cdb9c6f712b471828aca33"
});
var runtimeConfig = Object.freeze({
	environment,
	apiUrl,
	buildSha: buildIdentity.sourceCommit,
	buildIdentity,
	previewReadOnly: true
});
//#endregion
export { runtimeConfig };
