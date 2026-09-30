import { string, type ZodType } from 'zod';

/** One contract generates both faces; strict factories also work on source-mode hosts. */
export function rpcContribution(packageName: string, service: string) {
  const id = `${packageName}#${service}/request`;
  const codec = (label: string) => {
    const schema = string();
    return { mode: 'strict' as const, typeSymbol: `${id}:${label}`, create: () => schema, schema };
  };
  const descriptor = {
    id, service, namespace: service, method: 'request', invocation: { kind: 'direct' as const },
    parameters: [{ name: 'payload', wire: 'payload', source: 'json' as const, codec: codec('payload') }],
    result: codec('result'),
  };
  return {
    host: { package: packageName, face: 'host' as const, schemas: [], invocations: [descriptor], model: { services: [], events: [], objects: [] } },
    client: { package: packageName, descriptors: [descriptor] },
  };
}

export function parseRequest<T>(schema: ZodType<T>, payload: string): T {
  if (Buffer.byteLength(payload, 'utf8') > 65536) throw new Error('请求过大');
  return schema.parse(JSON.parse(payload));
}
