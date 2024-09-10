import { PluginDefinition, setupPluginServer } from 'connery';
import askCodaTable from "./actions/askCodaTable.js";

const pluginDefinition: PluginDefinition = {
  name: 'Coda',
  description: 'Connery plugin for Coda',
  actions: [askCodaTable],
};

const handler = await setupPluginServer(pluginDefinition);
export default handler;
