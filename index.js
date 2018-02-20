var settings = {
    mqtt: {
        host: process.env.MQTT_HOST || 'http://localhost:1883',
        user: process.env.MQTT_USER || 'maison',
        password: process.env.MQTT_PASS || 'SonOffMot',
        clientId: process.env.MQTT_CLIENT_ID || null
    },
    keepalive: {
        topic: process.env.KEEP_ALIVE_TOPIC || 'keep_alive',
        message: process.env.KEEP_ALIVE_MESSAGE || 'keep_alive'
    },
    debug: process.env.DEBUG_MODE || false,
    auth_key: process.env.AUTH_KEY || 'weiury23784wyrue2736tr',
    http_port: process.env.PORT || 5000
}

var mqtt = require('mqtt');
var express = require('express');
var bodyParser = require('body-parser');
var multer = require('multer');

var app = express();

function getMqttClient() {

    var options = {
        username: settings.mqtt.user,
        password: settings.mqtt.password
    };

    if (settings.mqtt.clientId) {
        options.clientId = settings.mqtt.clientId
    }

    return mqtt.connect(settings.mqtt.host, options);
}

var mqttClient = getMqttClient();

app.set('port', settings.http_port);
app.use(bodyParser.json());

function logRequest(req, res, next) {
    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress;
    var message = 'Received request [' + req.originalUrl +
        '] from [' + ip + ']';

    if (settings.debug) {
        message += ' with payload [' + JSON.stringify(req.body) + ']';
    } else {
        message += '.';
    }
    console.log(message);

    next();
}

function authorizeUser(req, res, next) {
    if (settings.auth_key) {
		if (req.body['key'] && req.body['key'] != settings.auth_key) {
			console.log('Request is not authorized (post).');
			res.sendStatus(401);
		}
		else if (req.query.key && req.query.key != settings.auth_key) { 
			console.log('Request is not authorized (get).');
			res.sendStatus(401);
		}
		else {		
			next();
		}
    }
    else {
        next();
    }
}

function checkSingleFileUpload(req, res, next) {
    if (req.query.single) {
        var upload = multer().single(req.query.single);

        upload(req, res, next);
    }
    else {
        next();
    }
}

function checkMessagePathQueryParameter(req, res, next) {
    if (req.query.path) {
        req.body.message = req.body[req.query.path];
    }
    next();
}

function checkTopicQueryParameter(req, res, next) {

    if (req.query.topic) {
        req.body.topic = req.query.topic;
    }

    next();
}

function ensureTopicSpecified(req, res, next) {
    if (!req.body.topic) {
        res.status(500).send('Topic not specified');
    }
    else {
        next();
    }
}

app.get('/keep_alive/', logRequest, function (req, res) {
    mqttClient.publish(settings.keepalive.topic, settings.keepalive.message);
    res.sendStatus(200);
});

app.post('/post/', logRequest, authorizeUser, checkSingleFileUpload, checkMessagePathQueryParameter, checkTopicQueryParameter, ensureTopicSpecified, function (req, res) {
    mqttClient.publish(req.body['topic'], req.body['message']);
    res.sendStatus(200);
});

app.get('/get/', logRequest, authorizeUser, checkSingleFileUpload, checkMessagePathQueryParameter, checkTopicQueryParameter, ensureTopicSpecified, function (req, res) {
    mqttClient.publish(req.query.topic, req.query.message,{qos: 0, retain: true, dup: false}); 
    res.sendStatus(200);
});


app.get('/subscribe/', logRequest, authorizeUser, function (req, res) {

    var topic = req.query.topic;

    if (!topic) {
        res.status(500).send('topic not specified');
    }
    else {
        // get a new mqttClient
        // so we dont constantly add listeners on the 'global' mqttClient
        var mqttClient = getMqttClient();

        mqttClient.on('connect', function () {
            mqttClient.subscribe(topic);
        });

        mqttClient.on('message', function (t, m) {
            if (t === topic) {
                res.write(m);
            }
        });

        req.on("close", function () {
            mqttClient.end();
        });

        req.on("end", function () {
            mqttClient.end();
        });
    }
});

app.listen(app.get('port'), "0.0.0.0", function () {
	// "0.0.0.0" will listen to IPv4 interface
	// "::1" will listen to IPv6 interface
    console.log('Node app is running on port', app.get('port'));
});
