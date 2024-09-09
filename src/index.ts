import { PluginDefinition, setupPluginServer } from 'connery';
import askcoda from "./actions/askcoda.js";

const pluginDefinition: PluginDefinition = {
  name: 'Coda',
  description: 'Connery plugin for Coda',
  actions: [askcoda],
};

const handler = await setupPluginServer(pluginDefinition);
export default handler;
