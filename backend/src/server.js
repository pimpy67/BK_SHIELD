const app = require('./app');
const env = require('./config/env');
const db = require('./config/db');

app.listen(env.port, () => {
    console.log(`Server avviato su http://localhost:${env.port}`);
    console.log(`Ambiente: ${env.nodeEnv}`);
    console.log(`Database: ${db.name}`);
});