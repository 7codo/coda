import { ActionDefinition, ActionContext, OutputObject } from 'connery';
import axios from 'axios';
import OpenAI from 'openai';

const actionDefinition: ActionDefinition = {
  key: 'askCodaTable',
  name: 'Ask Coda Table',
  description: 'This action enables users to ask questions and receive answers from a table in a Coda document with question and answer columns.',
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
      key: 'openAiApiKey',
      name: 'OpenAI API Key',
      description: 'Your OpenAI API key without any restirctions',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'openAiModel',
      name: 'OpenAI Model',
      description: 'The OpenAI model to use (e.g., gpt-4o-mini)',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'userQuestion',
      name: 'User Question',
      description: 'The question to be answered based on the Coda Q&A table',
      type: 'string',
      validation: {
        required: true,
      },
    },
  ],
  operation: {
    handler: handler,
  },
  outputParameters: [
    {
      key: 'textResponse',
      name: 'Text Response',
      description: 'The answer to the user question based on the Coda Q&A table',
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
    // Extract Doc ID and Page Name from the provided Coda URL
    const { docId, pageName } = extractIdsFromUrl(input.codaUrl);

    // Get the correct Page ID
    const pageId = await getPageId(docId, pageName, input.codaApiKey);

    // Get page details
    const pageDetails = await getPageDetails(docId, pageId, input.codaApiKey);

    // Fetch table IDs
    const tableIds = await fetchTableIds(docId, pageId, input.codaApiKey);

    // Fetch Q&A content
    const qaContent = await fetchQAContent(docId, tableIds, input.codaApiKey);

    // Get answer from OpenAI
    const answer = await getOpenAiAnswer(qaContent, input.userQuestion, input.openAiApiKey, input.openAiModel);

    return {
      textResponse: answer,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process the request: ${errorMessage}`);
  }
}

function extractIdsFromUrl(url: string): { docId: string, pageName: string } {
  console.log('Extracting IDs from URL:', url);
  const urlObj = new URL(url);
  console.log('URL object:', urlObj);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  console.log('Path parts:', pathParts);

  if (pathParts.length < 2) {
    throw new Error('Invalid Coda URL format');
  }

  let docId = '';
  let pageName = '';

  console.log('First path part:', pathParts[0]);
  console.log('Second path part:', pathParts[1]);

  if (pathParts[0] === 'd') {
    const docIdParts = pathParts[1].split('_');
    if (docIdParts.length > 1) {
      docId = docIdParts[docIdParts.length - 1];  // Get the last part after splitting by '_'
      docId = docId.startsWith('d') ? docId.slice(1) : docId;  // Remove leading 'd' if present
      pageName = pathParts[2] || '';  // Page name is the third part, if present
      console.log('Extracted Doc ID:', docId);
      console.log('Extracted Page Name:', pageName);
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

    const rowsUrl = `https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows`;
    const rowsResponse = await axios.get(rowsUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const rows = rowsResponse.data.items;

    if (rows.length > 0) {
      const columnNames = Object.keys(rows[0].values).map(id => columnMap.get(id) || id);

      // Try to identify question and answer columns
      const questionColumn = Object.keys(rows[0].values).find(id => {
        const columnName = columnMap.get(id);
        return typeof columnName === 'string' && 
               (columnName.toLowerCase().includes('question'));
      });
      const answerColumn = Object.keys(rows[0].values).find(id => {
        const columnName = columnMap.get(id);
        return typeof columnName === 'string' && 
               (columnName.toLowerCase().includes('answer'));
      });

      if (questionColumn && answerColumn) {
        for (const row of rows) {
          const question = row.values[questionColumn];
          const answer = row.values[answerColumn];
          if (typeof question === 'string' && typeof answer === 'string') {
            qaContent += `Q: ${question}\nA: ${answer}\n\n`;
          } else {
            console.log(`Skipped row: Invalid question or answer type`);
          }
        }
      } else {
        console.log('Could not identify question and answer columns. Using first two columns as fallback.');
        const columnIds = Object.keys(rows[0].values);
        for (const row of rows) {
          const question = row.values[columnIds[0]];
          const answer = row.values[columnIds[1]];
          if (typeof question === 'string' && typeof answer === 'string') {
            qaContent += `Q: ${question}\nA: ${answer}\n\n`;
          } else {
            console.log(`Skipped row: Invalid question or answer type`);
          }
        }
      }
    } else {
      console.log('No rows found in the table.');
    }
  }

  return qaContent.trim();
}

async function getOpenAiAnswer(content: string, question: string, apiKey: string, model: string): Promise<string> {
  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: "You are a helpful assistant that answers questions based strictly on the provided Q&A content source document. Only use the information explicitly provided in the document to answer questions. If the answer is not available in the content, respond with: 'I don't have enough information to answer that question'. Ensure you include all relevant details and nuances from the content. Do not omit important information, such as further details or links, which should be properly formatted in your response. If the content contains links, display them clearly in your answer.For longer responses, improve readability by organizing your answers into clear paragraphs."},
        { role: "user", content: `Q&A Content:\n${content}\n\nQuestion: ${question}` },
      ],
    });

    return completion.choices[0]?.message?.content?.trim() ?? "No response generated";
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get OpenAI answer: ${errorMessage}`);
  }
}

async function getPageDetails(docId: string, pageId: string, apiKey: string): Promise<any> {
  const url = `https://coda.io/apis/v1/docs/${docId}/pages/${pageId}`;
  
  const response = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  return response.data;
}