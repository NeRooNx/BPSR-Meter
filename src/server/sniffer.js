const cap = require('cap');
const decoders = cap.decoders;
const PROTOCOL = decoders.PROTOCOL;
const Readable = require('stream').Readable;
const findDefaultNetworkDevice = require('../../algo/netInterfaceUtil'); // Ajustar la ruta
const { Lock } = require('./dataManager'); // Importar Lock desde dataManager

const Cap = cap.Cap;

const NPCAP_INSTALLER_PATH = require('path').join(__dirname, '..', '..', 'Dist', 'npcap-1.83.exe'); // Ajustar la ruta
const fs = require('fs');
const { spawn } = require('child_process');

async function checkAndInstallNpcap(logger) {
    try {
        const devices = Cap.deviceList();
        if (!devices || devices.length === 0 || devices.every(d => d.name.includes('Loopback'))) {
            throw new Error('Npcap not detected or not functional.');
        }
        logger.info('Npcap detected and functional.');
        return true;
    } catch (e) {
        logger.warn(`Npcap not detected or not functional: ${e.message}`);
        logger.info('Attempting to install Npcap...');

        if (!fs.existsSync(NPCAP_INSTALLER_PATH)) {
            logger.error(`Npcap installer not found at: ${NPCAP_INSTALLER_PATH}`);
            logger.info('Please install Npcap manually from the Dist/ folder and restart the application.');
            return false;
        }

        try {
            logger.info('Running Npcap installer. Please follow the on-screen instructions.');
            const npcapProcess = spawn(NPCAP_INSTALLER_PATH, [], { detached: true, stdio: 'ignore' });
            npcapProcess.unref();

            logger.info('Npcap installer launched. Please install Npcap and then restart this application.');
            return false;
        } catch (spawnError) {
            logger.error(`Error running Npcap installer: ${spawnError.message}`);
            logger.info('Please install Npcap manually from the Dist/ folder and restart the application.');
            return false;
        }
    }
}

class Sniffer {
    constructor(logger, userDataManager, globalSettings) {
        this.logger = logger;
        this.userDataManager = userDataManager;
        this.globalSettings = globalSettings; // Pasar globalSettings al sniffer
        this.current_server = '';
        this._data = Buffer.alloc(0);
        this.tcp_next_seq = -1;
        this.tcp_cache = new Map();
        this.tcp_last_time = 0;
        this.tcp_lock = new Lock();
        this.fragmentIpCache = new Map();
        this.FRAGMENT_TIMEOUT = 30000;
        this.eth_queue = [];
        this.capInstance = null;
        this.packetProcessor = null;
        this.isPaused = false; // Estado de pausa para el sniffer
    }

    setPaused(paused) {
        this.isPaused = paused;
    }

    clearTcpCache() {
        this._data = Buffer.alloc(0);
        this.tcp_next_seq = -1;
        this.tcp_last_time = 0;
        this.tcp_cache.clear();
    }

    getTCPPacket(frameBuffer, ethOffset) {
        const ipPacket = decoders.IPV4(frameBuffer, ethOffset);
        const ipId = ipPacket.info.id;
        const isFragment = (ipPacket.info.flags & 0x1) !== 0;
        const _key = `${ipId}-${ipPacket.info.srcaddr}-${ipPacket.info.dstaddr}-${ipPacket.info.protocol}`;
        const now = Date.now();

        if (isFragment || ipPacket.info.fragoffset > 0) {
            if (!this.fragmentIpCache.has(_key)) {
                this.fragmentIpCache.set(_key, {
                    fragments: [],
                    timestamp: now,
                });
            }

            const cacheEntry = this.fragmentIpCache.get(_key);
            const ipBuffer = Buffer.from(frameBuffer.subarray(ethOffset));
            cacheEntry.fragments.push(ipBuffer);
            cacheEntry.timestamp = now;

            if (isFragment) {
                return null;
            }

            const fragments = cacheEntry.fragments;
            if (!fragments) {
                this.logger.error(`Can't find fragments for ${_key}`);
                return null;
            }

            let totalLength = 0;
            const fragmentData = [];

            for (const buffer of fragments) {
                const ip = decoders.IPV4(buffer);
                const fragmentOffset = ip.info.fragoffset * 8;
                const payloadLength = ip.info.totallen - ip.hdrlen;
                const payload = Buffer.from(buffer.subarray(ip.offset, ip.offset + payloadLength));

                fragmentData.push({
                    offset: fragmentOffset,
                    payload: payload,
                });

                const endOffset = fragmentOffset + payloadLength;
                if (endOffset > totalLength) {
                    totalLength = endOffset;
                }
            }

            const fullPayload = Buffer.alloc(totalLength);
            for (const fragment of fragmentData) {
                fragment.payload.copy(fullPayload, fragment.offset);
            }

            this.fragmentIpCache.delete(_key);
            return fullPayload;
        }

        return Buffer.from(frameBuffer.subarray(ipPacket.offset, ipPacket.offset + (ipPacket.info.totallen - ipPacket.hdrlen)));
    }

    async processEthPacket(frameBuffer) {
        if (this.isPaused) return; // No procesar paquetes si está pausado

        var ethPacket = decoders.Ethernet(frameBuffer);

        if (ethPacket.info.type !== PROTOCOL.ETHERNET.IPV4) return;

        const ipPacket = decoders.IPV4(frameBuffer, ethPacket.offset);
        const srcaddr = ipPacket.info.srcaddr;
        const dstaddr = ipPacket.info.dstaddr;

        const tcpBuffer = this.getTCPPacket(frameBuffer, ethPacket.offset);
        if (tcpBuffer === null) return;
        const tcpPacket = decoders.TCP(tcpBuffer);

        const buf = Buffer.from(tcpBuffer.subarray(tcpPacket.hdrlen));

        const srcport = tcpPacket.info.srcport;
        const dstport = tcpPacket.info.dstport;
        const src_server = srcaddr + ':' + srcport + ' -> ' + dstaddr + ':' + dstport;

        await this.tcp_lock.acquire();
        try {
            if (this.current_server !== src_server) {
                try {
                    if (buf[4] == 0) {
                        const data = buf.subarray(10);
                        if (data.length) {
                            const stream = Readable.from(data, { objectMode: false });
                            let data1;
                            do {
                                const len_buf = stream.read(4);
                                if (!len_buf) break;
                                data1 = stream.read(len_buf.readUInt32BE() - 4);
                                const signature = Buffer.from([0x00, 0x63, 0x33, 0x53, 0x42, 0x00]);
                                if (Buffer.compare(data1.subarray(5, 5 + signature.length), signature)) break;
                                try {
                                    if (this.current_server !== src_server) {
                                        this.current_server = src_server;
                                        this.clearTcpCache();
                                        this.tcp_next_seq = tcpPacket.info.seqno + buf.length;
                                        this.userDataManager.refreshEnemyCache();
                                        if (this.globalSettings.autoClearOnServerChange && this.userDataManager.lastLogTime !== 0 && this.userDataManager.users.size !== 0) {
                                            this.userDataManager.clearAll(this.globalSettings);
                                            console.log('Server changed, statistics cleared!');
                                        }
                                        console.log('Game server detected. Measuring DPS...');
                                    }
                                } catch (e) {}
                            } while (data1 && data1.length);
                        }
                    }
                    if (buf.length === 0x62) {
                        const signature = Buffer.from([
                            0x00, 0x00, 0x00, 0x62,
                            0x00, 0x03,
                            0x00, 0x00, 0x00, 0x01,
                            0x00, 0x11, 0x45, 0x14,
                            0x00, 0x00, 0x00, 0x00,
                            0x0a, 0x4e, 0x08, 0x01, 0x22, 0x24
                        ]);
                        if (
                            Buffer.compare(buf.subarray(0, 10), signature.subarray(0, 10)) === 0 &&
                            Buffer.compare(buf.subarray(14, 14 + 6), signature.subarray(14, 14 + 6)) === 0
                        ) {
                            if (this.current_server !== src_server) {
                                this.current_server = src_server;
                                this.clearTcpCache();
                                this.tcp_next_seq = tcpPacket.info.seqno + buf.length;
                                this.userDataManager.refreshEnemyCache();
                                if (this.globalSettings.autoClearOnServerChange && this.userDataManager.lastLogTime !== 0 && this.userDataManager.users.size !== 0) {
                                    this.userDataManager.clearAll(this.globalSettings);
                                    console.log('Server changed, statistics cleared!');
                                }
                                console.log('Game server detected by login packet. Measuring DPS...');
                            }
                        }
                    }
                } catch (e) {}
                return;
            }

            if (this.tcp_next_seq === -1) {
                this.logger.error('Unexpected TCP capture error! tcp_next_seq is -1');
                if (buf.length > 4 && buf.readUInt32BE() < 0x0fffff) {
                    this.tcp_next_seq = tcpPacket.info.seqno;
                }
            }

            if ((this.tcp_next_seq - tcpPacket.info.seqno) << 0 <= 0 || this.tcp_next_seq === -1) {
                this.tcp_cache.set(tcpPacket.info.seqno, buf);
            }
            while (this.tcp_cache.has(this.tcp_next_seq)) {
                const seq = this.tcp_next_seq;
                const cachedTcpData = this.tcp_cache.get(seq);
                this._data = this._data.length === 0 ? cachedTcpData : Buffer.concat([this._data, cachedTcpData]);
                this.tcp_next_seq = (seq + cachedTcpData.length) >>> 0;
                this.tcp_cache.delete(seq);
                this.tcp_last_time = Date.now();
            }

            while (this._data.length > 4) {
                let packetSize = this._data.readUInt32BE();

                if (this._data.length < packetSize) break;

                if (this._data.length >= packetSize) {
                    const packet = this._data.subarray(0, packetSize);
                    this._data = this._data.subarray(packetSize);
                    if (this.packetProcessor) {
                        this.packetProcessor.processPacket(packet, this.isPaused, this.globalSettings); // Pasar isPaused y globalSettings
                    }
                } else if (packetSize > 0x0fffff) {
                    this.logger.error(`Invalid Length!! ${this._data.length},${packetSize},${this._data.toString('hex')},${this.tcp_next_seq}`);
                    process.exit(1);
                    break;
                }
            }
        } finally {
            this.tcp_lock.release();
        }
    }

    async start(deviceNum, PacketProcessorClass) {
        const npcapReady = await checkAndInstallNpcap(this.logger);
        if (!npcapReady) {
            throw new Error('Npcap no está listo. La aplicación debe salir.');
        }

        const devices = Cap.deviceList();

        let num = deviceNum;
        if (num === undefined || num === 'auto') {
            let deviceFound = false;
            while (!deviceFound) {
                const device_num = await findDefaultNetworkDevice(devices);
                if (device_num !== undefined) {
                    num = device_num;
                    deviceFound = true;
                } else {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }

        if (num === undefined || !devices[num]) {
            this.logger.error('Could not automatically detect a valid network interface.');
            this.logger.error('Make sure the game is running and try again.');
            throw new Error('No se pudo detectar una interfaz de red válida.');
        }

        this.packetProcessor = new PacketProcessorClass({ logger: this.logger, userDataManager: this.userDataManager });

        const device = devices[num].name;
        const filter = 'ip and tcp';
        const bufSize = 10 * 1024 * 1024;
        const buffer = Buffer.alloc(65535);
        this.capInstance = new Cap();
        const linkType = this.capInstance.open(device, filter, bufSize, buffer);
        if (linkType !== 'ETHERNET') {
            this.logger.error('The device seems to be WRONG! Please check the device! Device type: ' + linkType);
        }
        this.capInstance.setMinBytes && this.capInstance.setMinBytes(0);
        this.capInstance.on('packet', async (nbytes, trunc) => {
            this.eth_queue.push(Buffer.from(buffer.subarray(0, nbytes)));
        });

        (async () => {
            while (true) {
                if (this.eth_queue.length) {
                    const pkt = this.eth_queue.shift();
                    this.processEthPacket(pkt);
                } else {
                    await new Promise((r) => setTimeout(r, 1));
                }
            }
        })();

        setInterval(async () => {
            const now = Date.now();
            let clearedFragments = 0;
            for (const [key, cacheEntry] of this.fragmentIpCache) {
                if (now - cacheEntry.timestamp > this.FRAGMENT_TIMEOUT) {
                    this.fragmentIpCache.delete(key);
                    clearedFragments++;
                }
            }
            if (clearedFragments > 0) {
                this.logger.debug(`Cleared ${clearedFragments} expired IP fragment caches`);
            }

            if (this.tcp_last_time && Date.now() - this.tcp_last_time > this.FRAGMENT_TIMEOUT) {
                this.logger.warn('Cannot capture the next packet! Is the game closed or disconnected? seq: ' + this.tcp_next_seq);
                this.current_server = '';
                this.clearTcpCache();
            }
        }, 10000);
    }
}

module.exports = Sniffer;
