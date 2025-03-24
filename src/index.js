require("dotenv").config(); // Load biến môi trường
const startBot = require("./bot"); // Khởi động bot Discord
//const startServer = require("./server"); // Khởi động Express server

// Chạy bot và server
startBot();
//startServer();
