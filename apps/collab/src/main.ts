import { WebSocketServer } from "ws";

const port = Number(process.env.COLLAB_PORT ?? 3002);
const server = new WebSocketServer({ port });

server.on("connection", (socket) => {
  socket.close(1013, "Collaboration rooms are not implemented yet");
});

console.info(JSON.stringify({ service: "collab", event: "listening", port }));
