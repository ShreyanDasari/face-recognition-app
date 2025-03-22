# Use a base image that includes both Node.js and Python
FROM python:3.10

# Install Node.js
RUN apt-get update && apt-get install -y nodejs npm cmake g++

# Set the working directory
WORKDIR /app

# Install Python dependencies inside a virtual environment
RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"
RUN pip install --no-cache-dir numpy dlib face-recognition

# Copy project files
COPY . .
RUN mkdir -p /app/uploads

# Install Node.js dependencies
RUN npm install

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
