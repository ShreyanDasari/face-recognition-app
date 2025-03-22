const WebSocket = require('ws');

module.exports = function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws) => {
        console.log('Client connected');

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                
                if (!data.observerId || !data.frameId || !data.timestamp) {
                    console.error('Invalid data format received', data);
                    return;
                }
                
                console.log('Received data:', data);
                
            } catch (error) {
                console.error('Error parsing JSON:', error);
            }
        });

        ws.on('close', () => {
            console.log('Client disconnected');
        });
    });

    return wss;
};
