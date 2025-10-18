
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec, fork } = require('child_process');
const net = require('net'); // Necesario para checkPort
const fs = require('fs');

// Función para loguear en archivo seguro para entorno empaquetado
function logToFile(msg) {
    try {
        const userData = app.getPath('userData');
        const logPath = path.join(userData, 'iniciar_log.txt');
        const timestamp = new Date().toISOString();
        fs.mkdirSync(userData, { recursive: true });
        fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
        console.log(msg); // También mostrar en consola
    } catch (e) {
        // Si hay error, mostrar en consola y intentar log local
        console.error('Error escribiendo log:', e);
        console.log(msg); // Al menos mostrar el mensaje original
        try {
            // Fallback: intentar escribir en el directorio actual
            fs.appendFileSync('./iniciar_log.txt', `[${timestamp}] ${msg}\n`);
        } catch (e2) {
            // Si todo falla, solo consola
            console.error('Fallback log también falló:', e2);
        }
    }
}


let mainWindow;
let serverProcess;
let server_port = 8989; // Puerto inicial
let isLocked = false; // Estado inicial del candado: desbloqueado
logToFile('==== ELECTRON START ====');

    // Función para verificar si un puerto está en uso
    const checkPort = (port) => {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close(() => resolve(true));
            });
            server.listen(port);
        });
    };

    async function findAvailablePort() {
        let port = 8989;
        logToFile('Searching for available port starting from: ' + port);
        while (true) {
            logToFile('Checking port availability: ' + port);
            if (await checkPort(port)) {
                logToFile('Port ' + port + ' is available');
                return port;
            }
            logToFile('Port ' + port + ' is in use, trying next...');
            port++;
            if (port > 9000) {
                logToFile('ERROR: No available port found up to 9000');
                throw new Error('No available ports');
            }
        }
    }

    // Función para matar el proceso que está usando un puerto específico
    async function killProcessUsingPort(port) {
        return new Promise((resolve) => {
            exec(`netstat -ano | findstr :${port}`, (error, stdout, stderr) => {
                if (stdout) {
                    const lines = stdout.split('\n').filter(line => line.includes('LISTENING'));
                    if (lines.length > 0) {
                        const pid = lines[0].trim().split(/\s+/).pop();
                        if (pid) {
                            console.log(`Killing process ${pid} using port ${port}...`);
                            exec(`taskkill /PID ${pid} /F`, (killError, killStdout, killStderr) => {
                                if (killError) {
                                    console.error(`Error killing process ${pid}: ${killError.message}`);
                                } else {
                                    console.log(`Process ${pid} killed successfully.`);
                                }
                                resolve();
                            });
                        } else {
                            resolve();
                        }
                    } else {
                        resolve();
                    }
                } else {
                    resolve();
                }
            });
        });
    }

    async function createWindow() {
        logToFile('=== STARTING CREATEWINDOW ===');
        logToFile('Node.js process: ' + process.version);
        logToFile('Electron version: ' + process.versions.electron);
        logToFile('Current directory: ' + __dirname);

        logToFile('Attempting to kill processes on port 8989...');
        await killProcessUsingPort(8989);

        server_port = await findAvailablePort();
        logToFile('Available port found: ' + server_port);

        mainWindow = new BrowserWindow({
            width: 650,
            height: 600,
            transparent: true,
            frame: false,
            alwaysOnTop: true,
            resizable: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
            },
            icon: path.join(__dirname, 'icon.ico'),
        });

        // Configurar ventana para que siempre esté encima con máxima prioridad
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        
        // Hacer la ventana click-through por defecto
        mainWindow.setIgnoreMouseEvents(true, { forward: true });

        // Iniciar el servidor Node.js, pasando el puerto como argumento

        // Determinar ruta absoluta a server.js según entorno
        let serverPath;
        if (process.defaultApp || process.env.NODE_ENV === 'development') {
            // Modo desarrollo
            serverPath = path.join(__dirname, 'server.js');
        } else {
            // Modo empaquetado: usar app.getAppPath() para acceder dentro del asar
            serverPath = path.join(app.getAppPath(), 'server.js');
        }
        logToFile('Launching server.js on port ' + server_port + ' with path: ' + serverPath);

        // Usar fork para lanzar el servidor como proceso hijo
        const { fork } = require('child_process');
        serverProcess = fork(serverPath, [server_port], {
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            execArgv: []
        });

        // Variables para controlar el arranque del servidor
        let serverLoaded = false;
        let serverTimeout = setTimeout(() => {
            if (!serverLoaded) {
                logToFile('ERROR: Server did not respond in time (10s timeout)');
                mainWindow.loadURL('data:text/html,<h2 style="color:red">Error: Server did not respond in time.<br>Check iniciar_log.txt for details.</h2>');
            }
        }, 10000); // 10 segundos de espera

        serverProcess.stdout.on('data', (data) => {
            logToFile('SERVER STDOUT: ' + data.toString().trim());
            // Buscar la URL del servidor en la salida del servidor
            const match = data.toString().match(/Servidor web iniciado en (http:\/\/localhost:\d+)/);
            if (match && match[1]) {
                const serverUrl = match[1];
                logToFile('Server started successfully. Loading URL: ' + serverUrl + '/index.html');
                mainWindow.loadURL(`${serverUrl}/index.html`);
                serverLoaded = true;
                clearTimeout(serverTimeout);
            }
        });
        
        serverProcess.stderr.on('data', (data) => {
            logToFile('SERVER STDERR: ' + data.toString().trim());
        });
        
        serverProcess.on('error', (error) => {
            logToFile('SERVER ERROR: ' + error.message);
            logToFile('ERROR STACK: ' + error.stack);
        });
        
        serverProcess.on('close', (code) => {
            logToFile('SERVER PROCESS CLOSED with code: ' + code);
        });
        
        serverProcess.on('exit', (code, signal) => {
            logToFile('SERVER PROCESS EXITED with code: ' + code + ', signal: ' + signal);
        });

        mainWindow.on('closed', () => {
            mainWindow = null;
            if (serverProcess) {
                // Enviar SIGTERM para un cierre limpio
                serverProcess.kill('SIGTERM');
                // Forzar la terminación si no se cierra después de un tiempo
                setTimeout(() => {
                    if (!serverProcess.killed) {
                        serverProcess.kill('SIGKILL');
                    }
                }, 5000);
            }
        });

    // Manejar el evento para cerrar la ventana
    ipcMain.on('close-window', () => {
        if (mainWindow) {
            mainWindow.close();
        }
    });

    // Manejar eventos de mouse para hacer la ventana interactiva o click-through
    ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
        if (mainWindow) {
            mainWindow.setIgnoreMouseEvents(ignore, options);
        }
    });

    // Manejar posición de ventana para arrastre manual
    ipcMain.handle('get-window-position', () => {
        if (mainWindow) {
            return mainWindow.getPosition();
        }
        return [0, 0];
    });

    ipcMain.on('set-window-position', (event, x, y) => {
        if (mainWindow) {
            mainWindow.setPosition(x, y);
        }
    });

    // Manejar el evento para alternar el estado del candado
    ipcMain.on('toggle-lock-state', () => {
        if (mainWindow) {
            isLocked = !isLocked;
            mainWindow.setMovable(!isLocked); // Hacer la ventana movible o no
            // NO usar setIgnoreMouseEvents - dejamos que el CSS maneje el click-through
            // El CSS ya tiene pointer-events configurado correctamente
            mainWindow.webContents.send('lock-state-changed', isLocked); // Notificar al renderizador
            console.log(`Lock: ${isLocked ? 'Locked' : 'Unlocked'}`);
        }
    });

    // Enviar el estado inicial del candado al renderizador una vez que la ventana esté lista
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('lock-state-changed', isLocked);
    });
}

app.whenReady().then(() => {
    logToFile('Electron app ready, starting createWindow()');
    createWindow();

    app.on('activate', () => {
        logToFile('App activated');
        if (BrowserWindow.getAllWindows().length === 0) {
            logToFile('No hay ventanas, creando nueva ventana');
            createWindow();
        }
    });
}).catch((error) => {
    logToFile('ERROR en app.whenReady(): ' + error.message);
    logToFile('ERROR STACK: ' + error.stack);
});

app.on('window-all-closed', () => {
    logToFile('Todas las ventanas cerradas');
    if (process.platform !== 'darwin') {
        logToFile('Cerrando aplicación (no macOS)');
        app.quit();
    }
});

app.on('before-quit', () => {
    logToFile('App cerrándose, limpiando procesos...');
});
