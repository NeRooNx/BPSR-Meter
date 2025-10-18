const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const fsPromises = require('fs').promises;
const fs = require('fs');

const SETTINGS_PATH = path.join('./settings.json');

function initializeApi(app, server, io, userDataManager, logger, globalSettings) {
    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '..', '..', 'public'))); // Ajustar la ruta

    app.get('/icon.png', (req, res) => {
        res.sendFile(path.join(__dirname, '..', '..', 'icon.png')); // Ajustar la ruta
    });

    app.get('/favicon.ico', (req, res) => {
        res.sendFile(path.join(__dirname, '..', '..', 'icon.ico')); // Ajustar la ruta
    });

    app.get('/api/data', (req, res) => {
        const userData = userDataManager.getAllUsersData();
        const data = {
            code: 0,
            user: userData,
            timestamp: Date.now(),
            startTime: userDataManager.startTime
        };
        res.json(data);
    });

    app.get('/api/solo-user', (req, res) => {
        const soloData = userDataManager.getSoloUserData();
        const data = {
            code: 0,
            user: soloData,
            timestamp: Date.now(),
            startTime: userDataManager.startTime
        };
        res.json(data);
    });

    // Debug endpoint para verificar estado del tracker
    app.get('/api/debug/status', (req, res) => {
        const allUsers = userDataManager.getAllUsersData();
        const localUid = userDataManager.localPlayerUid;
        const userCount = Object.keys(allUsers).length;
        
        res.json({
            code: 0,
            localPlayerUid: localUid,
            totalUsersTracked: userCount,
            userIds: Object.keys(allUsers),
            hasLocalPlayer: localUid ? allUsers.hasOwnProperty(localUid) : false
        });
    });

    app.get('/api/enemies', (req, res) => {
        const enemiesData = userDataManager.getAllEnemiesData();
        const data = {
            code: 0,
            enemy: enemiesData,
        };
        res.json(data);
    });

    app.get('/api/clear', (req, res) => {
        userDataManager.clearAll(globalSettings); // Pasar globalSettings
        console.log('Statistics cleared!');
        res.json({
            code: 0,
            msg: 'Statistics cleared!',
        });
    });

    app.get('/api/reset', (req, res) => {
        userDataManager.resetStatistics();
        console.log('Statistics reset (keeping player info)!');
        res.json({
            code: 0,
            msg: 'Statistics reset!',
        });
    });

    app.post('/api/pause', (req, res) => {
        const { paused } = req.body;
        globalSettings.isPaused = paused; // Actualizar el estado de pausa en globalSettings
        console.log(`Statistics ${globalSettings.isPaused ? 'paused' : 'resumed'}!`);
        res.json({
            code: 0,
            msg: `Statistics ${globalSettings.isPaused ? 'paused' : 'resumed'}!`,
            paused: globalSettings.isPaused,
        });
    });

    app.get('/api/pause', (req, res) => {
        res.json({
            code: 0,
            paused: globalSettings.isPaused,
        });
    });

    app.post('/api/set-username', (req, res) => {
        const { uid, name } = req.body;
        if (uid && name) {
            const userId = parseInt(uid, 10);
            if (!isNaN(userId)) {
                userDataManager.setName(userId, name);
                console.log(`Manually assigned name '${name}' to UID ${userId}`);
                res.json({ code: 0, msg: 'Username updated successfully.' });
            } else {
                res.status(400).json({ code: 1, msg: 'Invalid UID.' });
            }
        } else {
            res.status(400).json({ code: 1, msg: 'Missing UID or name.' });
        }
    });

    app.get('/api/skill/:uid', (req, res) => {
        const uid = parseInt(req.params.uid);
        const skillData = userDataManager.getUserSkillData(uid);

        if (!skillData) {
            return res.status(404).json({
                code: 1,
                msg: 'User not found',
            });
        }

        res.json({
            code: 0,
            data: skillData,
        });
    });

    app.get('/api/history/:timestamp/summary', async (req, res) => {
        const { timestamp } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'summary.json'); // Ajustar la ruta

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            const summaryData = JSON.parse(data);
            res.json({
                code: 0,
                data: summaryData,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History summary file not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'History summary file not found',
                });
            } else {
                logger.error('Failed to read history summary file:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read history summary file',
                });
            }
        }
    });

    app.get('/api/history/:timestamp/data', async (req, res) => {
        const { timestamp } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'allUserData.json'); // Ajustar la ruta

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            const userData = JSON.parse(data);
            res.json({
                code: 0,
                user: userData,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History data file not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'History data file not found',
                });
            } else {
                logger.error('Failed to read history data file:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read history data file',
                });
            }
        }
    });

    app.get('/api/history/:timestamp/skill/:uid', async (req, res) => {
        const { timestamp, uid } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'users', `${uid}.json`); // Ajustar la ruta

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            const skillData = JSON.parse(data);
            res.json({
                code: 0,
                data: skillData,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History skill file not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'History skill file not found',
                });
            } else {
                logger.error('Failed to read history skill file:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to load history skill file',
                });
            }
        }
    });

    app.get('/api/history/:timestamp/download', async (req, res) => {
        const { timestamp } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'fight.log'); // Ajustar la ruta
        res.download(historyFilePath, `fight_${timestamp}.log`);
    });

    app.get('/api/history/list', async (req, res) => {
        try {
            const data = (await fsPromises.readdir('./logs', { withFileTypes: true })) // Ajustar la ruta
                .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
                .map((e) => e.name);
            res.json({
                code: 0,
                data: data,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History path not found:', error);
                res.status(404).json({
                    code: 1,
                    msg: 'History path not found',
                });
            } else {
                logger.error('Failed to load history path:', error);
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to load history path',
                });
            }
        }
    });

    app.get('/api/settings', async (req, res) => {
        res.json({ code: 0, data: globalSettings });
    });

    app.post('/api/settings', async (req, res) => {
        const newSettings = req.body;
        Object.assign(globalSettings, newSettings); // Actualizar globalSettings directamente
        await fsPromises.writeFile(SETTINGS_PATH, JSON.stringify(globalSettings, null, 2), 'utf8');
        res.json({ code: 0, data: globalSettings });
    });

    app.get('/api/diccionario', async (req, res) => {
        const diccionarioPath = path.join(__dirname, '..', '..', 'diccionario.json'); // Ajustar la ruta
        try {
            const data = await fsPromises.readFile(diccionarioPath, 'utf8');
            if (data.trim() === '') {
                res.json({});
            } else {
                res.json(JSON.parse(data));
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('diccionario.json not found, returning empty object.');
                res.json({});
            } else {
                logger.error('Failed to read or parse diccionario.json:', error);
                res.status(500).json({ code: 1, msg: 'Failed to load diccionario', error: error.message });
            }
        }
    });

    io.on('connection', (socket) => {
        console.log('WebSocket client connected: ' + socket.id);

        socket.on('disconnect', () => {
            console.log('WebSocket client disconnected: ' + socket.id);
        });
    });

    setInterval(() => {
        if (!globalSettings.isPaused) {
            const userData = userDataManager.getAllUsersData();
            const data = {
                code: 0,
                user: userData,
            };
            io.emit('data', data);
        }
    }, 100);
}

module.exports = initializeApi;
