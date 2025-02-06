import { PluginDefinition, setupPluginServer } from 'connery';
import askCodaTable from "./actions/askCodaTable.js";

/*
Runtime types

interface PluginRuntime {
  name: string;
  description?: string;
  actions: ActionRuntime[];

  findActionByKey(key: string): ActionRuntime | undefined;
}

interface ActionRuntime {
  key: string;
  name: string;
  description?: string;
  type: 'create' | 'read' | 'update' | 'delete';
  inputParameters: InputParameterDefinition[];
  outputParameters: OutputParameterDefinition[];
  operation: OperationDefinition;
  plugin: PluginRuntime;

  run(input: InputObject): Promise<RunActionResponse>;
}

*/

const pluginDefinition: PluginDefinition = {
  name: 'Coda',
  description: 'Connery plugin for Coda',
  actions: [askCodaTable],
};

const handler = await setupPluginServer(pluginDefinition);
export default handler;
