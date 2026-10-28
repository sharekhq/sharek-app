// CJS stand-in for `jose`, which ships ESM only, for the same reason as
// tokenx.stub.ts: @mastra/core's A2A build requires @a2a-js/sdk, which requires
// jose, and under --experimental-vm-modules jest will not require an ES module.
// The SDK uses it only to sign and verify A2A agent cards, which the agent
// never does, so nothing is exported.
export {};
