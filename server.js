const express = require("express");
const app = express();
const port = 3000;

app.use(express.json());

// Import routes
const peopleRoutes = require("./routes/peopleRoutes");
const referenceRoutes = require("./routes/referenceRoutes");
const modelRoutes = require("./routes/modelRoutes");
const recognitionRoutes = require("./routes/recognitionRoutes");

// Use routes
app.use("/people", peopleRoutes);
app.use("/people", referenceRoutes);
app.use("/model", modelRoutes);
app.use("/recognize", recognitionRoutes);

// Start server
app.listen(port, () => {
  console.log(`Face recognition API running on http://localhost:${port}`);
});
