import express from 'express';
import expressWs from 'express-ws';
import path from 'path';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import session from 'express-session'; 
import RedisStore from 'connect-redis';
import nodemailer from 'nodemailer';
import helmet from 'helmet';
import csrf from 'csurf'; 
import redis from 'redis';
import config from './config';
import api from './routes';

const port = 3000;
const devPort = 4000;
const wsInstant = expressWs(express());
const app = wsInstant.app;
const wsServer = wsInstant.getWss();
const wsClient = {};

/* websocket client connection */
wsServer.on('connection', (ws) => {
  console.log('connection')
  let clientUrl = ws.upgradeReq.url.replace('.websocket', '');
  wsClient[clientUrl] = ws;
});

app.ws('/ws/:rasp', (ws, req, next) => {
  ws.on('close', () => {
    delete wsClient[`/ws/${req.params.rasp}/`];
  });
  next();
});

/* mongodb connection */
const db = mongoose.connection;
db.on('error', console.error);
db.once('open', () => { 
  console.log('Connected to mongodb server'); 
});
const mongoUri = `${config.mongo.host}:${config.mongo.port}/${config.mongo.db}`
mongoose.connect(`mongodb://${config.mongo.user}:${config.mongo.password}@${mongoUri}`, {
  useMongoClient: true,
});

/* redis connection */
const redisStore = RedisStore(session);
const redisClient = redis.createClient(config.redis.port, config.redis.host, {auth_pass: config.redis.password, db: 5});

/* session configuration */
app.use(session({
store: new redisStore({ client: redisClient }),
  secret: config.redis.secret,
  resave: false,
  saveUninitialized: true,
  ttl: 60 * 60 * 4 // 4 hours 
}));

const smtpTransport = nodemailer.createTransport({
  host: config.mailer.host,
  port: 465,
  secure: true,
  auth: config.mailer.auth
});

app.set('smtpTransport', smtpTransport);
app.set('redisClient', redisClient);
app.set('wsClient', wsClient);
app.use('/', express.static(path.resolve(__dirname, './../dist/')));
app.use(helmet());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/api', api);

app.get('/api/notice', (req, res) => {
  let redisClient = req.app.get('redisClient');
  redisClient.get('notice', (err, reply) => {
    if (err) throw err;
    return res.json({ data: reply });
  });
});

/* csrf setting */
app.use(csrf());
app.use((req, res, next) => {
  let csrfToken = req.csrfToken()
  req.session._csrf = csrfToken;
  res.cookie('_csrf', csrfToken);
  return next();
});

app.get(/^.(?!ws).*$/, (req, res) => {
  res.sendFile(path.resolve(__dirname, './../dist/index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === 'EBADCSRFTOKEN') {
    res.status(403).json({
      error: "INVALID_REQUEST",
      code: -2
    });
  } else {
    res.status(500).json({
      error: "SOMETHING_BROKE",
      code: -1
    });
  };
});

app.listen(port, () => {
  console.log('Express is listening on port', port);
});
