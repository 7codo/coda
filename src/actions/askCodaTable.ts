import { ActionDefinition, ActionContext, OutputObject } from 'connery';
import axios from 'axios';

const actionDefinition: ActionDefinition = {
  key: 'askCodaTable',
  name: 'Ask Coda Table',
  description: 'This action retrieves Q&A content from a table in a Coda document.',
  type: 'read',
  inputParameters: [
    {
      key: 'codaUrl',
      name: 'Coda Page URL',
      description: 'The full URL of the Coda page containing the Q&A table',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'codaApiKey',
      name: 'Coda API Key',
      description: 'Your Coda API key',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'instructions',
      name: 'Instructions',
      description: 'Optional instructions for the content processing.',
      type: 'string',
      validation: {
        required: false,
      },
    },
  ],
  operation: {
    handler: handler,
  },
  outputParameters: [
    {
      key: 'qaContent',
      name: 'Q&A Content',
      description: 'The Q&A content retrieved from the Coda table',
      type: 'string',
      validation: {
        required: true,
      },
    },
  ],
};

export default actionDefinition;

export async function handler({ input }: ActionContext): Promise<OutputObject> {
  try {
    const { docId, pageName } = extractIdsFromUrl(input.codaUrl);
    const pageId = await getPageId(docId, pageName, input.codaApiKey);
    const tableIds = await fetchTableIds(docId, pageId, input.codaApiKey);
    let qaContent = await fetchQAContent(docId, tableIds, input.codaApiKey);

    if (input.instructions) {
      qaContent = `Instructions for the following content: ${input.instructions}\n\n${qaContent}`;
    }

    return {
      qaContent: qaContent,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process the request: ${errorMessage}`);
  }
}

function extractIdsFromUrl(url: string): { docId: string, pageName: string } {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);

  if (pathParts.length < 2) {
    throw new Error('Invalid Coda URL format');
  }

  let docId = '';
  let pageName = '';

  if (pathParts[0] === 'd') {
    const docIdParts = pathParts[1].split('_');
    if (docIdParts.length > 1) {
      docId = docIdParts[docIdParts.length - 1];  // Get the last part after splitting by '_'
      docId = docId.startsWith('d') ? docId.slice(1) : docId;  // Remove leading 'd' if present
      pageName = pathParts[2] || '';  // Page name is the third part, if present
    } else {
      throw new Error('Unable to extract Doc ID from the provided URL');
    }
  } else {
    throw new Error('Invalid Coda URL format');
  }

  return { docId, pageName };
}

async function getPageId(docId: string, urlPageName: string, apiKey: string): Promise<string> {
  const url = `https://coda.io/apis/v1/docs/${docId}/pages`;
  const response = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  // Function to normalize strings for comparison
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Extract the main part of the URL page name (before the underscore)
  const mainUrlPageName = urlPageName.split('_')[0];

  const page = response.data.items.find((p: any) => 
    normalize(p.name) === normalize(mainUrlPageName) ||
    p.browserLink.includes(urlPageName)
  );

  if (!page) {
    throw new Error(`Page "${urlPageName}" not found in the document`);
  }

  return page.id;
}

async function fetchTableIds(docId: string, pageId: string, apiKey: string): Promise<string[]> {
  const url = `https://coda.io/apis/v1/docs/${docId}/tables?pageId=${pageId}`;
  
  const response = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  
  const filteredTables = response.data.items.filter((table: any) => table.parent?.id === pageId);

  return filteredTables.map((table: any) => table.id);
}

async function fetchQAContent(docId: string, tableIds: string[], apiKey: string): Promise<string> {
  let qaContent = '';

  for (const tableId of tableIds) {
    // Fetch column information
    const columnsUrl = `https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/columns`;
    const columnsResponse = await axios.get(columnsUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    
    const columnMap = new Map(columnsResponse.data.items.map((col: any) => [col.id, col.name as string]));

    let nextPageToken: string | null = null;
    do {
      const rowsUrl: string = `https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows?limit=100${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
      const rowsResponse = await axios.get(rowsUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      const rows = rowsResponse.data.items;
      nextPageToken = rowsResponse.data.nextPageToken || null;

      if (rows.length > 0) {
        const columnIds = Object.keys(rows[0].values).slice(0, 10);  // Get up to first 10 column IDs

        rows.forEach((row: { values: Record<string, any> }) => {
          const values = columnIds.map(id => {
            const columnName = columnMap.get(id) || id;
            const value = row.values[id];
            return `${columnName}: ${value}`;
          });
          qaContent += values.join('\n') + '\n\n';
        });
      }
    } while (nextPageToken);

    // Optionally, we can add a note about empty tables or skipped rows to the qaContent
    if (qaContent === '') {
      qaContent += "Note: No rows found in this table.\n\n";
    }
  }

  return qaContent.trim();
}
