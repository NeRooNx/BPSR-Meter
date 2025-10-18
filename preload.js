const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    closeWindow: () => ipcRenderer.send('close-window'),
    toggleLockState: () => ipcRenderer.send('toggle-lock-state'),
    onLockStateChanged: (callback) => ipcRenderer.on('lock-state-changed', (event, isLocked) => callback(isLocked)),
    setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
    getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
    setWindowPosition: (x, y) => ipcRenderer.send('set-window-position', x, y),
});

window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector, text) => {
        const element = document.getElementById(selector);
        if (element) element.innerText = text;
    };

    for (const type of ['chrome', 'node', 'electron']) {
        replaceText(`${type}-version`, process.versions[type]);
    }
});
