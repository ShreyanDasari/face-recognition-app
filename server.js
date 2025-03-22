const express = require("express");
const http = require("http");
const setupWebSocket = require("./websocketServer");
const setupSwagger = require('./config/swagger');

const app = express();
const port = 3000;
const server = http.createServer(app); // Attach HTTP server

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

setupWebSocket(server); // Attach WebSocket server to HTTP

// Import routes
const peopleRoutes = require("./routes/peopleRoutes");
const referenceRoutes = require("./routes/referenceRoutes");
const modelRoutes = require("./routes/modelRoutes");
const recognitionRoutes = require("./routes/recognitionRoutes");

// Use routes
app.use("/people", peopleRoutes);
app.use("/reference", referenceRoutes);
app.use("/model", modelRoutes);
app.use("/recognize", recognitionRoutes);

// Start server
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
