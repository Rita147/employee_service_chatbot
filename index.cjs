const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const { OpenAI } = require("@langchain/openai");
require('dotenv').config(); // To load .env variables

const app = express();
const port = process.env.PORT || 3001;

// MongoDB connection URL and database name
const mongoUrl = process.env.MONGO_URL; // Using environment variable
const dbName = 'AttendanceDatabase';

// OpenAI API key
const openaiApiKey = process.env.OPENAI_API_KEY; // Using environment variable

// MongoDB client
let db;

async function connectToMongoDB() {
  try {
    const client = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    db = client.db(dbName);
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

app.post('/chat', async (req, res) => {
  const userMessage = req.body.message;
  try {
    const response = await getResponseFromQuery(userMessage);
    res.json({ reply: response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function getResponseFromQuery(query) {
  // Extract email from the query
  const emailMatch = query.match(/(?:\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!emailMatch) {
    return "Please provide a valid email address.";
  }
  const email = emailMatch[0];

  try {
    // Query the database to get the employee ID based on the email
    const employeeCollection = db.collection('employee'); // Collection containing email and employee ID
    const employee = await employeeCollection.findOne({ email: email });

    if (!employee || !employee.emp_id) {
      return `I couldn't find any information for the email ${email}.`;
    }

    const emp_id = employee.emp_id;

    // Query the database to get the deduction reason based on the employee ID
    const deductionsCollection = db.collection('attendance'); // Collection containing employee ID and deduction reason
    const deduction = await deductionsCollection.findOne({ emp_id: emp_id });

    let context = "";
    if (deduction && deduction.deduction_reason) {
      context = `The reason for the deduction for email ${email} is: ${deduction.deduction_reason}`;
    } else {
      context = `I couldn't find any deduction reason for the email ${email}.`;
    }

    // Construct the prompt
    const prompt = `You are Rafeeq, an AI assistant for Jawwal. Your task is to answer questions related to the reasons for deductions provided to employees. Please use the following context to answer the employee's query: ${context} User: ${query}`;

    // Instantiate ChatOpenAI model from LangChain
    const languageModel = new ChatOpenAI({
        modelName: 'gpt-4-mini',
        apiKey: openaiApiKey,
        temperature: 0.4,
        max_tokens: 600,
        verbose: true
    });

    // Call the model with the constructed prompt
    const response = await languageModel.call(prompt);

    return response.trim();
  } catch (error) {
    console.error('Error querying the database or OpenAI API:', error);
    return `There was an error processing your request.`;
  }
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  connectToMongoDB(); // Connect to MongoDB when the server starts
});
