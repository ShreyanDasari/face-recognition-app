# Base image for Node.js
FROM node:18 AS node-base

# Set working directory for Node.js app
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the Node.js app
COPY . .

# Base image for Python 3.10
FROM python:3.10 AS python-base

# Set working directory for Python scripts
WORKDIR /python

# Install system dependencies required for dlib
RUN apt-get update && apt-get install -y cmake g++ make

# Copy Python requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python scripts
COPY *.py .  

# Final image (based on Python, with Node.js copied)
FROM python:3.10  

# Install Node.js manually in the final container
RUN apt-get update && apt-get install -y nodejs npm

# Set working directory
WORKDIR /app

# Copy Node.js app from first stage
COPY --from=node-base /app /app

# Copy Python scripts from second stage
COPY --from=python-base /python /python

# Reinstall Node.js dependencies to ensure proper versioning
RUN npm install

# Set Python environment
ENV PYTHONPATH="/python"
ENV PATH="/usr/local/bin:$PATH"

# Expose port (change if necessary)
EXPOSE 3000

# Start Node.js server
CMD ["node", "server.js"]
