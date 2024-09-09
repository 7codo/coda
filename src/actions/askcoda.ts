import { ActionDefinition, ActionContext, OutputObject } from 'connery';
import axios from 'axios';
import OpenAI from 'openai';

const actionDefinition: ActionDefinition = {
  key: 'askCodaDocument',
  name: 'Ask Coda Document',
  description:
    'This action enables users to ask questions and receive answers from a knowledge base hosted on a private Coda document. The action accesses the document via its document ID using the Coda API and an API key. Users’ questions are processed by OpenAI, which generates answers based on the content retrieved from the document.',
  type: 'read',
  inputParameters: [
    {
      key: 'codaDocumentId',
      name: 'Coda Document ID',
      description: 'The ID of the private Coda document to fetch knowledge content from.',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'codaApiKey',
      name: 'Coda API Key',
      description: 'API key to authenticate with the Coda API',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'openaiApiKey',
      name: 'OpenAI API Key',
      description: 'API key to authenticate with OpenAI',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'openaiModel',
      name: 'OpenAI Model',
      description: 'The model to use for generating the answer (e.g. gpt-4-turbo, gpt-4o-mini, etc.).',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'question',
      name: 'User Question',
      description: 'The question asked by the user about the particular knowledge base.',
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
      name: 'Text response',
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
    // Use the provided document ID
    const codaDocumentId = input.codaDocumentId;
    console.log('Coda Document ID:', codaDocumentId);

    // Fetch rows from the desired table (FAQ CRB Project)
    const tableId = "grid-n_-oLU0toU";  // This is the ID of the FAQ CRB Project table, should remain hardcoded
    const tableContent = await fetchCodaTableRows(codaDocumentId, tableId, input.codaApiKey);

    // Combine the questions and answers from the rows into a single string
    let combinedContent = "";
    tableContent.items.forEach((row: { values: { [key: string]: string } }) => {
      const question = row.values['c-VNOaxJ-We5'];  // Assuming this is the question
      const answer = row.values['c-FeXd2vbanx'];   // Assuming this is the answer
      if (question && answer) {
        combinedContent += `Q: ${question}\nA: ${answer}\n\n`;
      }
    });

    // Ensure the combined content is sufficient
    if (combinedContent.length < 5) {
      throw new Error('The extracted content is too short or insufficient.');
    }

    // Ask OpenAI for an answer
    const answer = await askOpenAI(input.openaiApiKey, input.openaiModel, combinedContent, input.question);

    // Return the model's answer
    return { textResponse: answer };
  } catch (error: any) {
    console.error('An error occurred:', error.message);
    throw new Error(`Error occurred: ${error.message}`);
  }
}

async function fetchCodaTableRows(documentId: string, tableId: string, apiKey: string): Promise<any> {
  const codaApiUrl = `https://coda.io/apis/v1/docs/${documentId}/tables/${tableId}/rows`;

  try {
    const response = await axios.get(codaApiUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.data) {
      throw new Error('No rows found in the table.');
    }

    return response.data;
  } catch (error: any) {
    if (error.response && error.response.status === 401) {
      throw new Error('Unauthorized: Please check your API key or document permissions.');
    }
    console.error('Error fetching table rows from Coda:', error);
    throw new Error('Failed to retrieve table rows from Coda.');
  }
}

async function askOpenAI(
  openaiApiKey: string,
  openaiModel: string,
  documentContent: string,
  question: string,
): Promise<string> {
  // Initialize OpenAI with the provided API key
  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Prepare the system and user messages for OpenAI
  const systemMessage = `You are an FAQ expert. Answer questions based strictly on the content provided:
    ”${documentContent}”`;

  const userQuestion = `Based on this content, answer the following question:
    ”${question}”. If there's insufficient info, respond with 'I don’t have enough information.'`;

  // Request a response from OpenAI
  const response = await openai.chat.completions.create({
    model: openaiModel,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userQuestion },
    ],
  });

  const messageContent = response.choices[0]?.message?.content?.trim();

  if (!messageContent) {
    throw new Error('OpenAI response is empty.');
  }

  return messageContent;
}