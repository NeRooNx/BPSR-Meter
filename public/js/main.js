// Estado global para vista
let viewMode = 'nearby'; // 'nearby' o 'solo'

// Estado de ordenamiento
let sortColumn = 'totalDmg'; // Columna por defecto
let sortDirection = 'desc'; // 'asc' o 'desc'

const professionMap = {
    // Clases Principales
    '雷影剑士': { name: 'Stormblade', icon: 'Stormblade.png', role: 'dps' },
    '冰魔导师': { name: 'Frost Mage', icon: 'Frost Mage.png', role: 'dps' },
    '涤罪恶火·战斧': { name: 'Fire Axe', icon: 'Fire Axe.png', role: 'dps' },
    '青岚骑士': { name: 'Wind Knight', icon: 'Wind Knight.png', role: 'tank' },
    '森语者': { name: 'Verdant Oracle', icon: 'Verdant Oracle.png', role: 'dps' },
    '雷霆一闪·手炮': { name: 'Gunner', icon: 'desconocido.png', role: 'dps' },
    '巨刃守护者': { name: 'Heavy Guardian', icon: 'baluarte_ferreo.png', role: 'tank' },
    '暗灵祈舞·仪刀/仪仗': { name: 'Spirit Dancer', icon: 'desconocido.png', role: 'dps' },
    '神射手': { name: 'Marksman', icon: 'arco_halcon.png', role: 'dps' },
    '神盾骑士': { name: 'Shield Knight', icon: 'guardian.png', role: 'tank' },
    '灵魂乐手': { name: 'Soul Musician', icon: 'sonido_feroz.png', role: 'dps' },

    // Especializaciones
    '居合': { name: 'laido Slash', icon: 'Stormblade.png', role: 'dps' },
    '月刃': { name: 'MoonStrike', icon: 'MoonStrike.png', role: 'dps' },
    '冰矛': { name: 'Icicle', icon: 'lanza_hielo.png', role: 'dps' },
    '射线': { name: 'Frostbeam', icon: 'Frost Mage.png', role: 'dps' },
    '防盾': { name: 'Vanguard', icon: 'guardian.png', role: 'tank' },
    '岩盾': { name: 'Skyward', icon: 'Fire Axe.png', role: 'tank' },
    '惩戒': { name: 'Smite', icon: 'castigo.png', role: 'dps' },
    '愈合': { name: 'Lifebind', icon: 'Verdant Oracle.png', role: 'healer' },
    '格挡': { name: 'Block', icon: 'guardian.png', role: 'tank' },
    '狼弓': { name: 'Wildpack', icon: 'arco_lobo.png', role: 'dps' },
    '鹰弓': { name: 'Falconry', icon: 'arco_halcon.png', role: 'dps' },
    '光盾': { name: 'Shield', icon: 'egida_luz.png', role: 'tank' },
    '协奏': { name: 'Concerto', icon: 'Concierto.png', role: 'dps' },
    '狂音': { name: 'Dissonance', icon: 'sonido_feroz.png', role: 'dps' },
    '空枪': { name: 'Empty Gun', icon: 'francotirador.png', role: 'dps' },
    '重装': { name: 'Heavy Armor', icon: 'Wind Knight.png', role: 'dps' },

};

const defaultProfession = { name: 'Unknown', icon: 'desconocido.png', role: 'dps' };

let lastTotalDamage = 0;
let lastStartTime = 0; // Timestamp para detectar resets del servidor
let isLocked = false; // Estado de bloqueo de la ventana

const playerBarsContainer = document.getElementById('player-bars-container');
const syncButton = document.getElementById('sync-button');
const lockButton = document.getElementById('lock-button');
const loadingIndicator = document.getElementById('loading-indicator'); // Indicador de carga

    // Permitir interacción con Alt cuando está bloqueado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Alt') {
            if (document.body.classList.contains('locked')) {
                document.body.classList.add('alt-pressed');
            }
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') {
            document.body.classList.remove('alt-pressed');
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        const resetButton = document.getElementById('reset-button');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                resetDpsMeter();
            });
        }


        // Botón Nearby/Solo
        const nearbyGroupBtn = document.getElementById('nearby-group-btn');
        const sortDmgBtn = document.getElementById('sort-dmg-btn');
        const sortTankBtn = document.getElementById('sort-tank-btn');
        const sortHealBtn = document.getElementById('sort-heal-btn');
        
        if (nearbyGroupBtn) {
            nearbyGroupBtn.addEventListener('click', () => {
                // Cambiar modo
                viewMode = viewMode === 'nearby' ? 'solo' : 'nearby';
                nearbyGroupBtn.textContent = viewMode === 'nearby' ? 'Nearby' : 'Solo';
                nearbyGroupBtn.classList.toggle('solo', viewMode === 'solo');
                
                // Mostrar/ocultar botones de ordenamiento según el modo
                const sortButtons = [sortDmgBtn, sortTankBtn, sortHealBtn];
                sortButtons.forEach(btn => {
                    if (btn) {
                        btn.style.display = viewMode === 'solo' ? 'none' : 'block';
                    }
                });
                
                // Re-renderizar con los mismos datos
                fetchDataAndRender();
            });
        }

        // Botones de ordenamiento
        
        function updateSortButtons(activeButton) {
            [sortDmgBtn, sortTankBtn, sortHealBtn].forEach(btn => {
                if (btn) btn.classList.remove('active');
            });
            if (activeButton) activeButton.classList.add('active');
        }

        if (sortDmgBtn) {
            sortDmgBtn.addEventListener('click', () => {
                sortColumn = 'totalDmg';
                sortDirection = 'desc';
                updateSortButtons(sortDmgBtn);
                fetchDataAndRender();
            });
        }

        if (sortTankBtn) {
            sortTankBtn.addEventListener('click', () => {
                sortColumn = 'dmgTaken';
                sortDirection = 'desc';
                updateSortButtons(sortTankBtn);
                fetchDataAndRender();
            });
        }

        if (sortHealBtn) {
            sortHealBtn.addEventListener('click', () => {
                sortColumn = 'totalHeal';
                sortDirection = 'desc';
                updateSortButtons(sortHealBtn);
                fetchDataAndRender();
            });
        }

        if (syncButton) {
            syncButton.addEventListener('click', async () => {
                // Show visual feedback
                syncButton.style.opacity = '0.5';
                syncButton.style.pointerEvents = 'none';
                
                // Reset statistics (keeps names, HP, profession)
                await fetch('/api/reset');
                console.log('Statistics reset (player info preserved).');
                
                // Reset local tracking variables
                lastTotalDamage = 0;
                
                // Force an immediate data refresh
                await fetchDataAndRender();
                
                // Restore button after a short delay
                setTimeout(() => {
                    syncButton.style.opacity = '1';
                    syncButton.style.pointerEvents = 'auto';
                }, 300);
            });
        }

        if (lockButton) {
            lockButton.addEventListener('click', () => {
                if (window.electronAPI) {
                    window.electronAPI.toggleLockState();
                }
            });

            // Escuchar cambios de estado del candado desde el proceso principal
            if (window.electronAPI) {
                window.electronAPI.onLockStateChanged((locked) => {
                    isLocked = locked;
                    lockButton.innerHTML = isLocked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
                    lockButton.title = isLocked ? 'Unlock position' : 'Lock position';
                    
                    // Aplicar estado locked al overlay principal
                    const dpsMeter = document.querySelector('.dps-meter');
                    if (dpsMeter) {
                        dpsMeter.classList.toggle('locked', isLocked);
                    }
                    
                    // Controlar click-through basado en el estado del candado
                    console.log('Lock state changed:', isLocked ? 'LOCKED' : 'UNLOCKED');
                    updateClickThroughState();
                });
            }
        }

        const closeButton = document.getElementById('close-button');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                if (window.electronAPI) {
                    window.electronAPI.closeWindow();
                }
            });
        }

        // Configurar arrastre manual
        setupManualDrag();
        
        // Configurar el control de click-through
        setupClickThroughControl();
        
        // Inicializar en modo click-through (desbloqueado por defecto)
        if (window.electronAPI) {
            window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
            currentMouseEventsState = true;
            console.log('Initial state: click-through ENABLED');
        }

    });

    // Sistema de arrastre manual
    function setupManualDrag() {
        const dragIndicator = document.getElementById('drag-indicator');
        if (!dragIndicator || !window.electronAPI) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startWindowX = 0;
        let startWindowY = 0;

        dragIndicator.addEventListener('mousedown', async (e) => {
            if (isLocked) return; // No permitir arrastre cuando está bloqueado
            
            isDragging = true;
            startX = e.screenX;
            startY = e.screenY;
            
            // Obtener posición actual de la ventana
            const [windowX, windowY] = await window.electronAPI.getWindowPosition();
            startWindowX = windowX;
            startWindowY = windowY;
            
            // Asegurar que los eventos de mouse estén habilitados durante el arrastre
            enableMouseEvents();
            
            console.log('Drag started at:', startX, startY);
            
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging || isLocked) return;
            
            const deltaX = e.screenX - startX;
            const deltaY = e.screenY - startY;
            
            const newX = startWindowX + deltaX;
            const newY = startWindowY + deltaY;
            
            window.electronAPI.setWindowPosition(newX, newY);
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                console.log('Drag ended');
                
                // Pequeño delay antes de volver al click-through
                setTimeout(() => {
                    if (!isDragging) {
                        disableMouseEvents();
                    }
                }, 100);
            }
        });
    }

    // Variables para control de click-through
    let currentMouseEventsState = true; // true = ignorando eventos, false = permitiendo eventos

    // Función para habilitar eventos de mouse
    function enableMouseEvents() {
        if (window.electronAPI && currentMouseEventsState) {
            window.electronAPI.setIgnoreMouseEvents(false);
            currentMouseEventsState = false;
            console.log('Mouse events ENABLED');
        }
    }

    // Función para deshabilitar eventos de mouse (click-through)
    function disableMouseEvents() {
        if (window.electronAPI && !currentMouseEventsState) {
            window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
            currentMouseEventsState = true;
            console.log('Mouse events DISABLED (click-through)');
        }
    }

    // Controlar click-through basado en el estado del candado
    function updateClickThroughState() {
        if (!window.electronAPI) return;
        
        if (isLocked) {
            // Cuando el candado está bloqueado, activar click-through inmediatamente
            window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
            currentMouseEventsState = true;
            console.log('Locked mode: click-through ENABLED');
        } else {
            // Cuando está desbloqueado, activar click-through también
            // (solo se desactivará cuando hagas hover sobre elementos)
            window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
            currentMouseEventsState = true;
            console.log('Unlocked mode: click-through ENABLED (will disable on hover)');
        }
    }

    // Configurar click-through inteligente
    function setupClickThroughControl() {
        if (!window.electronAPI) return;

        // Event listener para detectar hover sobre elementos interactivos
        document.addEventListener('mouseover', (e) => {
            let shouldEnableEvents = false;
            
            if (isLocked) {
                // Solo botones esenciales cuando está bloqueado (muy restrictivo)
                const essentialSelectors = ['.controls', '.control-button', '.sync-button', '.advanced-lite-btn'];
                shouldEnableEvents = essentialSelectors.some(selector => 
                    e.target.closest(selector) !== null
                );
            } else {
                // Solo controles y drag cuando está desbloqueado (NO barras de jugadores)
                const allSelectors = ['.controls', '.drag-indicator'];
                shouldEnableEvents = allSelectors.some(selector => 
                    e.target.closest(selector) !== null
                );
            }
            
            if (shouldEnableEvents) {
                enableMouseEvents();
            }
        });

        document.addEventListener('mouseout', (e) => {
            // Usar setTimeout para evitar flickering
            setTimeout(() => {
                let shouldKeepEvents = false;
                
                // Verificar si el mouse está sobre algún elemento interactivo
                const mouseX = e.clientX;
                const mouseY = e.clientY;
                const elementUnderMouse = document.elementFromPoint(mouseX, mouseY);
                
                if (elementUnderMouse) {
                    if (isLocked) {
                        const essentialSelectors = ['.controls', '.control-button', '.sync-button', '.advanced-lite-btn'];
                        shouldKeepEvents = essentialSelectors.some(selector => 
                            elementUnderMouse.closest(selector) !== null
                        );
                    } else {
                        const allSelectors = ['.controls', '.drag-indicator'];
                        shouldKeepEvents = allSelectors.some(selector => 
                            elementUnderMouse.closest(selector) !== null
                        );
                    }
                }
                
                if (!shouldKeepEvents) {
                    disableMouseEvents();
                }
            }, 50);
        });

        // Cuando el mouse sale completamente de la ventana
        document.addEventListener('mouseleave', () => {
            disableMouseEvents();
        });
    }

    // Note: Manual reset removed to prevent accidental data loss
    // Statistics are automatically reset when changing instance/channel

    function formatStat(value) {
        if (value >= 1000000000000) {
            return (value / 1000000000000).toFixed(1) + 'T';
        }
        if (value >= 1000000000) {
            return (value / 1000000000).toFixed(1) + 'G';
        }
        if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
        }
        if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'k';
        }
        return value.toFixed(0);
    }

    // Colores de fondo según posición (1º, 2º, 3º, etc.) - Temática oscura con buena visibilidad
    const positionBackgroundColors = [
        'rgba(180, 50, 60, 0.35)',     // 1º - Rojo oscuro
        'rgba(170, 60, 70, 0.32)',     // 2º - Rojo medio oscuro
        'rgba(160, 70, 80, 0.29)',     // 3º - Rojo medio
        'rgba(150, 80, 90, 0.26)',     // 4º - Rojo apagado
        'rgba(140, 90, 100, 0.23)',    // 5º - Gris rojizo
        'rgba(120, 100, 110, 0.20)',   // 6º - Gris medio
        'rgba(100, 110, 120, 0.17)',   // 7º - Gris azulado
        'rgba(80, 120, 130, 0.14)',    // 8º - Azul grisáceo
        'rgba(70, 130, 140, 0.11)',    // 9º - Azul oscuro
        'rgba(60, 140, 150, 0.08)'     // 10º - Azul muy oscuro
    ];

    // Función para obtener el color según la posición (index)
    function getPositionBackgroundColor(index) {
        return positionBackgroundColors[index] || positionBackgroundColors[9];
    }

    // Función para ordenar el array de usuarios según la columna activa
    function sortUserArray(userArray) {
        userArray.sort((a, b) => {
            let aVal, bVal;
            
            switch(sortColumn) {
                case 'gs':
                    aVal = Number(a.fight_point) || 0;
                    bVal = Number(b.fight_point) || 0;
                    break;
                
                case 'dps':
                    aVal = Number(a.total_dps) || 0;
                    bVal = Number(b.total_dps) || 0;
                    break;
                
                case 'totalDmg':
                    aVal = a.total_damage?.total ? Number(a.total_damage.total) : 0;
                    bVal = b.total_damage?.total ? Number(b.total_damage.total) : 0;
                    break;
                
                case 'dmgTaken':
                    aVal = Number(a.taken_damage) || 0;
                    bVal = Number(b.taken_damage) || 0;
                    break;
                
                case 'hps':
                    aVal = Number(a.total_hps) || 0;
                    bVal = Number(b.total_hps) || 0;
                    break;
                
                case 'totalHeal':
                    aVal = a.total_healing?.total ? Number(a.total_healing.total) : 0;
                    bVal = b.total_healing?.total ? Number(b.total_healing.total) : 0;
                    break;
                
                default:
                    aVal = Number(a.total_dps) || 0;
                    bVal = Number(b.total_dps) || 0;
            }
            
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });
    }



    async function fetchDataAndRender() {
        const container = document.getElementById('player-bars-container');
        try {
            // Usar API correcta según el modo de vista
            const apiEndpoint = viewMode === 'solo' ? '/api/solo-user' : '/api/data';
            
            const [dataRes, diccRes, settingsRes] = await Promise.all([
                fetch(apiEndpoint),
                fetch('/api/diccionario'),
                fetch('/api/settings')
            ]);
            const userData = await dataRes.json();
            const diccionarioData = await diccRes.json();
            const currentGlobalSettings = await settingsRes.json();

            // Detectar reset del servidor (cambio de canal o manual)
            if (userData.startTime && userData.startTime !== lastStartTime) {
                console.log('Server reset detected. Clearing local state.');
                lastStartTime = userData.startTime;
                lastTotalDamage = 0;
            }

            // Convertir objeto de usuarios a array y agregar el UID como propiedad
            let userArray = Object.entries(userData.user).map(([uid, data]) => ({
                ...data,
                uid: parseInt(uid, 10) // Agregar UID como propiedad del objeto
            }));
            
            userArray = userArray.filter(u => 
                (u.total_damage && u.total_damage.total > 0) || 
                (u.taken_damage > 0) || 
                (u.total_healing && u.total_healing.total > 0)
            );

            if (!userArray || userArray.length === 0) {
                loadingIndicator.style.display = 'flex'; // Mostrar el indicador de carga
                playerBarsContainer.style.display = 'none'; // Ocultar el contenedor de barras
                return;
            }

            loadingIndicator.style.display = 'none'; // Ocultar el indicador de carga
            playerBarsContainer.style.display = 'flex'; // Mostrar el contenedor de barras

            const sumaTotalDamage = userArray.reduce((acc, u) => acc + (u.total_damage && u.total_damage.total ? Number(u.total_damage.total) : 0), 0);

            // Actualizar lastTotalDamage para detectar cambios de canal
            if (sumaTotalDamage !== lastTotalDamage) {
                lastTotalDamage = sumaTotalDamage;
            }

            // Cálculo de damagePercent para todos los usuarios
            userArray.forEach(u => {
                const userDamage = u.total_damage && u.total_damage.total ? Number(u.total_damage.total) : 0;
                u.damagePercent = sumaTotalDamage > 0 ? Math.max(0, Math.min(100, (userDamage / sumaTotalDamage) * 100)) : 0;
            });

            // Obtener el UID del usuario local
            let localUid = null;
            if (viewMode === 'solo') {
                // En modo solo, ya tenemos el usuario local en userData
                const uidKey = Object.keys(userData.user)[0];
                localUid = uidKey ? parseInt(uidKey, 10) : null;
            } else {
                // En modo nearby, obtener el UID del jugador local
                try {
                    const localUserResponse = await fetch('/api/solo-user');
                    const localUserData = await localUserResponse.json();
                    if (localUserData.user && Object.keys(localUserData.user).length > 0) {
                        localUid = Object.keys(localUserData.user)[0];
                        // Convertir a número para comparación correcta
                        localUid = parseInt(localUid, 10);
                    }
                } catch (err) {
                    console.log('Could not get local user:', err);
                }
            }

            // Ordenar según la columna seleccionada
            sortUserArray(userArray);
            
            // En modo Nearby: limitar a top 10 y añadir usuario local como 11º si no está en el top
            let localUserExtra = null;
            if (viewMode === 'nearby' && localUid) {
                // Verificar si el usuario local está en el top 10
                const top10 = userArray.slice(0, 10);
                const isLocalInTop10 = top10.some(u => u.uid === localUid);
                
                // Si hay más de 10 jugadores y el local no está en el top 10, guardarlo
                if (userArray.length > 10 && !isLocalInTop10) {
                    localUserExtra = userArray.find(u => u.uid === localUid);
                }
                
                // Limitar a top 10 solo si hay más de 10 jugadores
                if (userArray.length > 10) {
                    userArray = top10;
                }
            }

            if(localUserExtra){
                userArray.push(localUserExtra);
            }

            // Renderizar barras de jugadores
            container.innerHTML = userArray.map((u, index) => {
                    const professionParts = (u.profession || '-').split('-');
                    const mainProfessionKey = professionParts[0];
                    const subProfessionKey = professionParts[1];
                    const mainProf = professionMap[mainProfessionKey] || defaultProfession;
                    const subProf = professionMap[subProfessionKey];
                    let prof = subProf || mainProf;
                    let professionName = mainProf.name;
                    if (subProf) {
                        professionName += ` - ${subProf.name}`;
                    }
                    const dps = Number(u.total_dps) || 0;
                    const totalHealing = u.total_healing ? (Number(u.total_healing.total) || 0) : 0;
                    const nombre = u.name || 'Unknown';
                    const hpPercent = ((u.hp || 0) / (u.max_hp || 1)) * 100;
                    const hpColor = hpPercent > 50 ? '#1db954' : hpPercent > 25 ? '#f39c12' : '#e74c3c';
                    const bgColor = getPositionBackgroundColor(index);
                    
                    // Determinar clases CSS para la posición
                    const position = index + 1;
                    const isLocalPlayer = localUid && u.uid === localUid;
                    let positionClasses = 'player-position';
                    
                    // Agregar clase de rank primero
                    if (position === 1) {
                        positionClasses += ' rank-1';
                    } else if (position === 2) {
                        positionClasses += ' rank-2';
                    } else if (position === 3) {
                        positionClasses += ' rank-3';
                    }
                    
                    // Agregar clase de local player (se combina con rank si está en top 3)
                    if (isLocalPlayer) {
                        positionClasses += ' local-player';
                    }
                    
                    return `<div class="player-bar" data-rank="${u.rank}" style="--damage-percent: ${u.damagePercent}%; --damage-bg-color: ${bgColor};">
                        <div class="player-info">
                            <span class="${positionClasses}">${position}</span>
                            <img class="class-icon" src="icons/${prof.icon}" alt="${professionName}" title="${professionName}">
                            <div class="player-details">
                                <span class="player-name">${nombre} <span style="color: var(--text-secondary); font-size: 9px; font-weight: 400;">(GS: ${u.fightPoint})</span></span>
                                <div class="hp-bar">
                                    <div class="hp-fill" style="width: ${hpPercent}%; background: ${hpColor};"></div>
                                    <span class="hp-text">${formatStat(u.hp || 0)}/${formatStat(u.max_hp || 0)}</span>
                                </div>
                            </div>
                            <div class="player-stats-main">
                                <div class="stat">
                                    <span class="stat-label">DPS</span>
                                    <span class="stat-value">${formatStat(dps)}</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">HPS</span>
                                    <span class="stat-value">${formatStat(u.total_hps || 0)}</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">TOTAL DMG</span>
                                    <span class="stat-value">${formatStat((u.total_damage && u.total_damage.total) || 0)}</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">DMG TAKEN</span>
                                    <span class="stat-value">${formatStat(u.taken_damage || 0)}</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">% DMG</span>
                                    <span class="stat-value">${Math.round(u.damagePercent)}%</span>
                                </div>
                                <div class="stat">
                                    <span class="stat-label">TOTAL HEAL</span>
                                    <span class="stat-value">${formatStat(totalHealing)}</span>
                                </div>
                        </div>
                    </div>
                    </div>`;
                }).join('');
                
        } catch (err) {
            console.error('Error in fetchDataAndRender:', err);
            if (container) {
                container.innerHTML = '<div id="message-display">Waiting for game data...</div>';
            }
            // Mostrar el indicador de carga en caso de error
            loadingIndicator.style.display = 'flex';
            playerBarsContainer.style.display = 'none';
        }
    }

    // Actualizar UI cada 50ms
    setInterval(fetchDataAndRender, 50);
    fetchDataAndRender();

    // Script para eliminar el texto de depuración de VSCode
    document.addEventListener('DOMContentLoaded', () => {
        const debugTexts = [
            '# VSCode Visible Files',
            '# VSCode Open Tabs',
            '# Current Time',
            '# Context Window Usage',
            '# Current Mode'
        ];

        // Función para buscar y eliminar nodos de texto o elementos que contengan el texto
        function removeDebugText() {
            const allElements = document.body.querySelectorAll('*');
            allElements.forEach(element => {
                debugTexts.forEach(debugText => {
                    if (element.textContent.includes(debugText)) {
                        // Si el texto está directamente en el elemento, o es un elemento que contiene solo ese texto
                        if (element.childNodes.length === 1 && element.firstChild.nodeType === Node.TEXT_NODE && element.firstChild.textContent.includes(debugText)) {
                            element.remove();
                        } else {
                            // Si el texto es parte de un nodo de texto más grande, intentar eliminar solo el nodo de texto
                            Array.from(element.childNodes).forEach(node => {
                                if (node.nodeType === Node.TEXT_NODE && node.textContent.includes(debugText)) {
                                    node.remove();
                                }
                            });
                        }
                    }
                });
            });

            // También buscar directamente en el body si hay nodos de texto sueltos
            Array.from(document.body.childNodes).forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    debugTexts.forEach(debugText => {
                        if (node.textContent.includes(debugText)) {
                            node.remove();
                        }
                    });
                }
            });
        }

        // Ejecutar la función inmediatamente y luego con un pequeño retraso para capturar inyecciones tardías
        removeDebugText();
        setTimeout(removeDebugText, 500); // Reintentar después de 500ms
    });

