import 'reflect-metadata';

export function Tool(params: {
  description: string;
  dataSchema: Array<{ key: string; type: string; description: string }>;
  lookup?: {
    name: string;
    title: string;
    description: string;
    optionalFields?: string[];
    // Inputs the method reads that its dataSchema doesn't declare
    fields?: Array<{ key: string; type: string; description: string }>;
  };
}) {
  return function (target: any, propertyKey: string | symbol) {
    // The lookup is kept out of custom:tool, which the dashboard and the agent
    // tools return as is, and stored under its own key
    const { lookup, ...tool } = params;

    // Retrieve existing metadata or initialize an empty array
    const existingMetadata = Reflect.getMetadata('custom:tool', target) || [];

    // Add the metadata information for this method
    existingMetadata.push({ methodName: propertyKey, ...tool });

    // Define metadata on the class prototype (so it can be retrieved from the class)
    Reflect.defineMetadata('custom:tool', existingMetadata, target);

    if (lookup) {
      const existingLookups =
        Reflect.getMetadata('custom:tool:lookup', target) || [];

      existingLookups.push({
        methodName: propertyKey,
        dataSchema: tool.dataSchema,
        ...lookup,
      });

      Reflect.defineMetadata('custom:tool:lookup', existingLookups, target);
    }
  };
}
