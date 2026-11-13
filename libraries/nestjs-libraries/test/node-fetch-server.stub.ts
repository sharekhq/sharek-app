// CJS stand-in for `@remix-run/node-fetch-server`, which ships ESM only, for the
// same reason as tokenx.stub.ts: @copilotkit/runtime/v2, which sharek.agent
// loads for its runner, requires it, and under --experimental-vm-modules jest
// will not require an ES module. The runtime uses it only in the HTTP endpoints
// it serves (createRequest, sendResponse), which these specs never start, so
// nothing is exported.
export {};
