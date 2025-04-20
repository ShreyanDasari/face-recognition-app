const express = require("express");
const http = require("http");
const setupWebSocket = require("./websocketServer");
const setupSwagger = require('./config/swagger');
const jwt = require("jsonwebtoken");
const cors = require("cors");
const morgan = require("morgan");
const { SECRET_KEY, authenticateToken } = require("./middleware/auth"); 

const app = express();
const port = 3000;
const server = http.createServer(app); 
app.use(morgan("combined")); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
setupWebSocket(server);

const peopleRoutes = require("./routes/peopleRoutes");
const referenceRoutes = require("./routes/referenceRoutes");
const modelRoutes = require("./routes/modelRoutes");
const recognitionRoutes = require("./routes/recognitionRoutes");
const notificationRoutes = require("./routes/notificationRouter");
const observerRoutes = require("./routes/observerRoutes");
// Use routes
app.use("/people", authenticateToken, peopleRoutes);
app.use("/reference", authenticateToken, referenceRoutes);
app.use("/model", authenticateToken, modelRoutes);
app.use("/recognize", authenticateToken, recognitionRoutes);
app.use("/notifications", authenticateToken, notificationRoutes);
app.use("/observers", authenticateToken, observerRoutes);

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "admin") {
    const user = { username };
    const token = jwt.sign(user, SECRET_KEY, { expiresIn: "1h" });
    res.json({ token });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});




// Start server
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
