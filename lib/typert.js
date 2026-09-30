// shared/rpc.ts
import { string } from "zod";
function rpcContribution(packageName, service) {
  const id = `${packageName}#${service}/request`;
  const codec = (label) => {
    const schema = string();
    return { mode: "strict", typeSymbol: `${id}:${label}`, create: () => schema, schema };
  };
  const descriptor = {
    id,
    service,
    namespace: service,
    method: "request",
    invocation: { kind: "direct" },
    parameters: [{ name: "payload", wire: "payload", source: "json", codec: codec("payload") }],
    result: codec("result")
  };
  return {
    host: { package: packageName, face: "host", schemas: [], invocations: [descriptor], model: { services: [], events: [], objects: [] } },
    client: { package: packageName, descriptors: [descriptor] }
  };
}

// src/typert.ts
var { host: TYPERT, client: TYPERT_REMOTE } = rpcContribution("dsh-autocompose", "autocomposeUI");
export {
  TYPERT,
  TYPERT_REMOTE
};
//# sourceMappingURL=typert.js.map
