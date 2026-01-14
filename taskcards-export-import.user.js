// ==UserScript==
// @name         Taskcards Board Export/Import für NBC
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Exportiert und importiert Taskcards Boards im JSON-Format für die Niedersächsische Bildungscloud
// @author       Hannes
// @match        https://www.taskcards.de/*
// @match        https://taskcards.de/*
// @grant        GM_download
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // CSS für die UI-Buttons
    GM_addStyle(`
        .taskcards-export-btn, .taskcards-import-btn {
            position: fixed;
            z-index: 10000;
            padding: 12px 20px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        }

        .taskcards-export-btn {
            top: 80px;
            right: 20px;
        }

        .taskcards-import-btn {
            top: 130px;
            right: 20px;
            background: #2196F3;
        }

        .taskcards-export-btn:hover {
            background: #45a049;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }

        .taskcards-import-btn:hover {
            background: #0b7dda;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }

        .taskcards-export-btn:disabled, .taskcards-import-btn:disabled {
            background: #cccccc;
            cursor: not-allowed;
            transform: none;
        }

        .taskcards-modal {
            display: none;
            position: fixed;
            z-index: 10001;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }

        .taskcards-modal-content {
            background-color: #fefefe;
            margin: 10% auto;
            padding: 20px;
            border: 1px solid #888;
            border-radius: 10px;
            width: 80%;
            max-width: 600px;
            max-height: 70vh;
            overflow-y: auto;
        }

        .taskcards-modal-close {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
        }

        .taskcards-modal-close:hover {
            color: #000;
        }

        .taskcards-progress {
            margin: 20px 0;
            text-align: center;
            font-size: 14px;
            color: #666;
        }
    `);

    /**
     * Extrahiert Board-Daten aus der aktuellen Seite
     */
    function extractBoardData() {
        try {
            const boardData = {
                version: "2.0.0",
                exportDate: new Date().toISOString(),
                platform: "taskcards",
                targetPlatform: "niedersaechsische-bildungscloud",
                board: {}
            };

            // Board-Titel extrahieren (aus Header)
            const titleElement = document.querySelector('.board-header-container .text-h5, .board-information-title');
            boardData.board.title = titleElement ? titleElement.textContent.trim() :
                document.title.replace(' - TaskCards', '').trim() || 'Unbenanntes Board';

            // Board-Beschreibung extrahieren
            const descElement = document.querySelector('.board-header-container .text-subtitle2, .board-information-description');
            boardData.board.description = descElement ? descElement.textContent.trim() : '';

            // Board-ID extrahieren (aus URL)
            const urlMatch = window.location.hash.match(/\/board\/([a-f0-9-]+)/);
            boardData.board.id = urlMatch ? urlMatch[1] : generateId();

            // Board-Typ erkennen (Tafel vs. Kanban/Pinnwand)
            const isChalkboard = document.querySelector('.board-container .chalkboard-card') !== null;
            const isKanban = document.querySelector('.kanban-list-container') !== null;

            boardData.board.type = isChalkboard ? 'chalkboard' : isKanban ? 'kanban' : 'unknown';

            // Autor/Ersteller extrahieren
            const authorElement = document.querySelector('.board-information-user');
            boardData.board.author = authorElement ? authorElement.textContent.replace('Von', '').trim() : '';

            // Board-Metadaten aus Informations-Panel
            const metadataElements = document.querySelectorAll('.board-information-trends');
            boardData.board.metadata = {};

            metadataElements.forEach(elem => {
                const text = elem.textContent.trim();
                if (text.includes('Trendscore')) {
                    const score = elem.querySelector('span:last-child');
                    boardData.board.metadata.trendscore = score ? score.textContent.trim() : null;
                } else if (text.includes('Zuletzt geänderte')) {
                    const date = elem.querySelector('span:last-child');
                    boardData.board.metadata.lastModified = date ? date.textContent.trim() : null;
                }
            });

            if (isChalkboard) {
                // Tafel-Typ: Karten mit Positionen und Verbindungen
                extractChalkboardData(boardData);
            } else if (isKanban) {
                // Kanban/Pinnwand-Typ: Spalten mit Karten
                extractKanbanData(boardData);
            }

            // Board-Hintergrund
            const boardContainer = document.querySelector('.board-container');
            if (boardContainer) {
                boardData.board.settings = {
                    backgroundImage: boardContainer.style.backgroundImage || '',
                    backgroundColor: boardContainer.style.backgroundColor || '',
                    backgroundSize: boardContainer.style.backgroundSize || 'cover',
                    backgroundAttachment: boardContainer.style.backgroundAttachment || 'fixed'
                };
            }

            // Statistiken berechnen
            calculateStats(boardData);

            return boardData;
        } catch (error) {
            console.error('Fehler beim Extrahieren der Board-Daten:', error);
            throw error;
        }
    }

    /**
     * Extrahiert Daten für Chalkboard/Tafel-Typ
     */
    function extractChalkboardData(boardData) {
        boardData.board.cards = [];
        boardData.board.connections = [];

        const cards = document.querySelectorAll('.chalkboard-card');

        cards.forEach((card) => {
            const cardData = {
                id: generateId(),
                position: {
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 0
                },
                title: '',
                content: '',
                htmlContent: '',
                attachments: [],
                embeds: [],
                style: {}
            };

            // Position und Größe extrahieren
            const transform = card.style.transform;
            const transformMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
            if (transformMatch) {
                cardData.position.x = parseInt(transformMatch[1]);
                cardData.position.y = parseInt(transformMatch[2]);
            }
            cardData.position.width = parseInt(card.style.width) || 250;
            cardData.position.height = parseInt(card.style.height) || 200;

            // Karten-Stil (Hintergrund, Farbe)
            const boardCard = card.querySelector('.board-card');
            if (boardCard) {
                cardData.style = {
                    backgroundColor: boardCard.style.backgroundColor || '',
                    color: boardCard.style.color || '',
                    zoom: boardCard.style.zoom || '1'
                };
            }

            // Titel extrahieren
            const titleElement = card.querySelector('.board-card-header .contenteditable');
            cardData.title = titleElement ? titleElement.textContent.trim() : '';

            // Inhalt extrahieren
            const contentElement = card.querySelector('.board-card-content .contenteditable');
            if (contentElement) {
                cardData.content = contentElement.textContent.trim();
                cardData.htmlContent = contentElement.innerHTML;
            }

            // Bilder/Anhänge extrahieren
            extractAttachments(card, cardData);

            // Board-Thumbnails (Links zu anderen Boards)
            const boardThumbnails = card.querySelectorAll('.board-thumbnail');
            boardThumbnails.forEach(thumb => {
                const boardTitle = thumb.querySelector('.text-subtitle1');
                const boardAuthor = thumb.querySelector('.text-caption b');
                if (boardTitle) {
                    cardData.embeds.push({
                        type: 'board-link',
                        title: boardTitle.textContent.trim(),
                        author: boardAuthor ? boardAuthor.textContent.trim() : '',
                        backgroundImage: thumb.style.backgroundImage || ''
                    });
                }
            });

            // Video/Embed-Elemente (Skeleton-Placeholder für Videos)
            const videoPlaceholders = card.querySelectorAll('.q-skeleton');
            if (videoPlaceholders.length > 0) {
                cardData.embeds.push({
                    type: 'video-placeholder',
                    count: videoPlaceholders.length
                });
            }

            boardData.board.cards.push(cardData);
        });

        // Verbindungen zwischen Karten extrahieren
        const connections = document.querySelectorAll('.card-connection');
        connections.forEach(conn => {
            const connectionData = {
                id: generateId(),
                position: {
                    left: parseInt(conn.style.left) || 0,
                    top: parseInt(conn.style.top) || 0,
                    width: parseInt(conn.style.width) || 0,
                    height: parseInt(conn.style.height) || 0
                },
                label: '',
                style: {}
            };

            // Verbindungs-Label
            const label = conn.querySelector('.connection-label');
            if (label) {
                connectionData.label = label.textContent.trim();
            }

            // SVG-Pfad-Daten
            const path = conn.querySelector('path');
            if (path) {
                connectionData.style = {
                    d: path.getAttribute('d'),
                    stroke: path.getAttribute('stroke'),
                    strokeWidth: path.getAttribute('stroke-width'),
                    strokeDasharray: path.getAttribute('stroke-dasharray')
                };
            }

            boardData.board.connections.push(connectionData);
        });
    }

    /**
     * Extrahiert Daten für Kanban/Pinnwand-Typ
     */
    function extractKanbanData(boardData) {
        boardData.board.columns = [];
        const columns = document.querySelectorAll('.draggableList');

        columns.forEach((column, columnIndex) => {
            const columnData = {
                id: generateId(),
                position: columnIndex,
                title: '',
                cards: []
            };

            // Spalten-Titel
            const columnTitle = column.querySelector('.board-list-header .contenteditable');
            columnData.title = columnTitle ? columnTitle.textContent.trim() : `Spalte ${columnIndex + 1}`;

            // Karten in der Spalte
            const cards = column.querySelectorAll('.draggableCard');
            cards.forEach((cardWrapper, cardIndex) => {
                const card = cardWrapper.querySelector('.board-card');
                if (card) {
                    const cardData = {
                        id: generateId(),
                        position: cardIndex,
                        title: '',
                        content: '',
                        htmlContent: '',
                        attachments: [],
                        embeds: [],
                        style: {}
                    };

                    // Titel
                    const titleElement = card.querySelector('.board-card-header .contenteditable');
                    cardData.title = titleElement ? titleElement.textContent.trim() : '';

                    // Inhalt
                    const contentElement = card.querySelector('.board-card-content .contenteditable');
                    if (contentElement) {
                        cardData.content = contentElement.textContent.trim();
                        cardData.htmlContent = contentElement.innerHTML;
                    }

                    // Stil
                    cardData.style = {
                        backgroundColor: card.style.backgroundColor || '',
                        color: card.style.color || '',
                        zoom: card.style.zoom || '1'
                    };

                    // Anhänge extrahieren
                    extractAttachments(card, cardData);

                    // Board-Thumbnails
                    const boardThumbnails = card.querySelectorAll('.board-thumbnail');
                    boardThumbnails.forEach(thumb => {
                        const boardTitle = thumb.querySelector('.text-subtitle1');
                        const boardAuthor = thumb.querySelector('.text-caption b');
                        if (boardTitle) {
                            cardData.embeds.push({
                                type: 'board-link',
                                title: boardTitle.textContent.trim(),
                                author: boardAuthor ? boardAuthor.textContent.trim() : '',
                                backgroundImage: thumb.style.backgroundImage || ''
                            });
                        }
                    });

                    // Video-Platzhalter
                    const videoPlaceholders = card.querySelectorAll('.q-skeleton');
                    if (videoPlaceholders.length > 0) {
                        cardData.embeds.push({
                            type: 'video-placeholder',
                            count: videoPlaceholders.length
                        });
                    }

                    columnData.cards.push(cardData);
                }
            });

            boardData.board.columns.push(columnData);
        });
    }

    /**
     * Extrahiert Anhänge aus einer Karte
     */
    function extractAttachments(card, cardData) {
        // Bilder aus dem Attachment-Bereich
        const attachmentImages = card.querySelectorAll('.board-card-content img[src*="taskcards.s3"]');
        attachmentImages.forEach(img => {
            if (!img.src.includes('icon') && !img.src.includes('avatar')) {
                cardData.attachments.push({
                    type: 'image',
                    url: img.src,
                    alt: img.alt || '',
                    filename: extractFilenameFromUrl(img.src)
                });
            }
        });

        // Bilder direkt im Content
        const contentImages = card.querySelectorAll('.contenteditable img');
        contentImages.forEach(img => {
            const alreadyExists = cardData.attachments.some(att => att.url === img.src);
            if (!alreadyExists && img.src && !img.src.includes('icon')) {
                cardData.attachments.push({
                    type: 'image',
                    url: img.src,
                    alt: img.alt || '',
                    filename: extractFilenameFromUrl(img.src) || 'bild'
                });
            }
        });
    }

    /**
     * Berechnet Statistiken für das Board
     */
    function calculateStats(boardData) {
        if (boardData.board.type === 'chalkboard') {
            boardData.stats = {
                type: 'chalkboard',
                totalCards: boardData.board.cards.length,
                totalConnections: boardData.board.connections.length,
                totalAttachments: boardData.board.cards.reduce((sum, card) =>
                    sum + card.attachments.length, 0),
                totalEmbeds: boardData.board.cards.reduce((sum, card) =>
                    sum + card.embeds.length, 0)
            };
        } else if (boardData.board.type === 'kanban') {
            boardData.stats = {
                type: 'kanban',
                totalColumns: boardData.board.columns?.length || 0,
                totalCards: boardData.board.columns?.reduce((sum, col) => sum + col.cards.length, 0) || 0,
                totalAttachments: boardData.board.columns?.reduce((sum, col) =>
                    sum + col.cards.reduce((cardSum, card) => cardSum + card.attachments.length, 0), 0) || 0,
                totalEmbeds: boardData.board.columns?.reduce((sum, col) =>
                    sum + col.cards.reduce((cardSum, card) => cardSum + card.embeds.length, 0), 0) || 0
            };
        }
    }

    /**
     * Extrahiert Dateinamen aus S3-URL
     */
    function extractFilenameFromUrl(url) {
        try {
            const match = url.match(/filename[=%]([^&]+)/);
            if (match) {
                return decodeURIComponent(match[1]);
            }
            return url.split('/').pop().split('?')[0];
        } catch (e) {
            return 'anhang';
        }
    }

    /**
     * Generiert eine eindeutige ID
     */
    function generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Exportiert das Board als JSON-Datei
     */
    function exportBoard() {
        try {
            const exportBtn = document.querySelector('.taskcards-export-btn');
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exportiere...';

            const boardData = extractBoardData();
            const jsonString = JSON.stringify(boardData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const filename = `taskcards_${boardData.board.type}_${boardData.board.title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.json`;

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            let message = `Board "${boardData.board.title}" erfolgreich exportiert!\n`;
            if (boardData.board.type === 'chalkboard') {
                message += `${boardData.stats.totalCards} Karten, ${boardData.stats.totalConnections} Verbindungen`;
            } else {
                message += `${boardData.stats.totalCards} Karten in ${boardData.stats.totalColumns} Spalten`;
            }

            showNotification(message, 'success');

            exportBtn.disabled = false;
            exportBtn.textContent = '📥 Board exportieren';
        } catch (error) {
            console.error('Export-Fehler:', error);
            showNotification('Fehler beim Exportieren: ' + error.message, 'error');

            const exportBtn = document.querySelector('.taskcards-export-btn');
            exportBtn.disabled = false;
            exportBtn.textContent = '📥 Board exportieren';
        }
    }

    /**
     * Öffnet einen Datei-Dialog zum Importieren
     */
    function openImportDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const importBtn = document.querySelector('.taskcards-import-btn');
                importBtn.disabled = true;
                importBtn.textContent = 'Importiere...';

                const text = await file.text();
                const boardData = JSON.parse(text);

                await importBoard(boardData);

                importBtn.disabled = false;
                importBtn.textContent = '📤 Board importieren';
            } catch (error) {
                console.error('Import-Fehler:', error);
                showNotification('Fehler beim Importieren: ' + error.message, 'error');

                const importBtn = document.querySelector('.taskcards-import-btn');
                importBtn.disabled = false;
                importBtn.textContent = '📤 Board importieren';
            }
        };

        input.click();
    }

    /**
     * Importiert Board-Daten
     */
    async function importBoard(boardData) {
        try {
            // Validierung
            if (!boardData.board) {
                throw new Error('Ungültiges Board-Format: "board" fehlt');
            }

            // Modal für Import-Vorschau erstellen
            const modal = createImportModal(boardData);
            document.body.appendChild(modal);
            modal.style.display = 'block';

            let message = `Board-Import vorbereitet: "${boardData.board.title}"\n`;
            if (boardData.stats) {
                if (boardData.stats.type === 'chalkboard') {
                    message += `${boardData.stats.totalCards} Karten, ${boardData.stats.totalConnections} Verbindungen`;
                } else {
                    message += `${boardData.stats.totalCards} Karten in ${boardData.stats.totalColumns} Spalten`;
                }
            }

            showNotification(message, 'success');

            // Hinweis für manuellen Import in NBC
            console.log('=== TASKCARDS BOARD DATEN FÜR NBC-IMPORT ===');
            console.log(JSON.stringify(boardData, null, 2));
            console.log('=== ENDE DER DATEN ===');

            // Füge "Automatisch importieren"-Button zum Modal hinzu
            addAutoImportButton(modal, boardData);

        } catch (error) {
            console.error('Import-Fehler:', error);
            throw error;
        }
    }

    /**
     * Fügt Auto-Import-Button zum Modal hinzu
     */
    function addAutoImportButton(modal, boardData) {
        const modalContent = modal.querySelector('.taskcards-modal-content');
        const buttonContainer = modalContent.querySelector('div[style*="text-align: right"]');

        if (buttonContainer && boardData.board.type === 'kanban') {
            const autoImportBtn = document.createElement('button');
            autoImportBtn.textContent = '🤖 Automatisch importieren';
            autoImportBtn.style.cssText = 'padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;';

            autoImportBtn.onclick = async () => {
                modal.style.display = 'none';
                await performAutomaticImport(boardData);
                document.body.removeChild(modal);
            };

            buttonContainer.insertBefore(autoImportBtn, buttonContainer.firstChild);
        }
    }

    /**
     * Führt automatischen Import durch (UI-Automation)
     */
    async function performAutomaticImport(boardData) {
        try {
            showNotification('Starte automatischen Import...', 'info');

            if (boardData.board.type === 'kanban') {
                await importKanbanBoard(boardData);
            } else if (boardData.board.type === 'chalkboard') {
                showNotification('Automatischer Import für Tafel-Boards noch nicht implementiert', 'error');
            }

        } catch (error) {
            console.error('Automatischer Import fehlgeschlagen:', error);
            showNotification('Fehler beim automatischen Import: ' + error.message, 'error');
        }
    }

    /**
     * Importiert Kanban-Board automatisch
     */
    async function importKanbanBoard(boardData) {
        const columns = boardData.board.columns || [];
        let importedColumns = 0;
        let importedCards = 0;

        for (const columnData of columns) {
            try {
                // Neue Spalte erstellen
                const column = await createColumn(columnData.title);
                if (!column) {
                    throw new Error(`Spalte "${columnData.title}" konnte nicht erstellt werden`);
                }

                importedColumns++;
                showNotification(`Spalte "${columnData.title}" erstellt (${importedColumns}/${columns.length})`, 'info');

                // Karten in der Spalte erstellen
                for (const cardData of columnData.cards) {
                    try {
                        await createCard(column, cardData);
                        importedCards++;

                        // Kurze Pause zwischen Karten
                        await sleep(300);
                    } catch (cardError) {
                        console.error(`Fehler beim Erstellen der Karte "${cardData.title}":`, cardError);
                    }
                }

                // Kurze Pause zwischen Spalten
                await sleep(500);

            } catch (columnError) {
                console.error(`Fehler beim Erstellen der Spalte "${columnData.title}":`, columnError);
            }
        }

        showNotification(`Import abgeschlossen!\n${importedColumns} Spalten, ${importedCards} Karten erstellt`, 'success');
    }

    /**
     * Erstellt eine neue Spalte
     */
    async function createColumn(title) {
        // Finde den "Spalte hinzufügen"-Button
        const addColumnBtn = document.querySelector('.notice-list-add');
        if (!addColumnBtn) {
            throw new Error('Spalte-hinzufügen-Button nicht gefunden');
        }

        // Klicke den Button
        addColumnBtn.click();

        // Warte bis die neue Spalte erscheint
        await sleep(500);

        // Finde die neu erstellte Spalte (die letzte .draggableList vor .kanban-list-add-scroll)
        const allColumns = document.querySelectorAll('.draggableList');
        const newColumn = allColumns[allColumns.length - 1];

        if (!newColumn) {
            throw new Error('Neue Spalte nicht gefunden');
        }

        // Setze den Titel
        const titleElement = newColumn.querySelector('.board-list-header .contenteditable');
        if (titleElement) {
            titleElement.focus();
            titleElement.textContent = title;

            // Trigger input event für Vue.js
            titleElement.dispatchEvent(new Event('input', { bubbles: true }));
            titleElement.blur();
        }

        await sleep(300);
        return newColumn;
    }

    /**
     * Erstellt eine neue Karte in einer Spalte
     */
    async function createCard(column, cardData) {
        // Finde den "Karte hinzufügen"-Button in der Spalte
        const addCardBtn = column.querySelector('.kanban-card-add');
        if (!addCardBtn) {
            throw new Error('Karte-hinzufügen-Button nicht gefunden');
        }

        // Zähle vorhandene Karten vor dem Klick
        const cardsBefore = column.querySelectorAll('.draggableCard').length;

        // Klicke den Button
        addCardBtn.click();

        // Warte bis die neue Karte erscheint
        await sleep(800);

        // Finde die neu erstellte Karte (die letzte in der list-content-container)
        const allCards = column.querySelectorAll('.draggableCard');

        // Die neue Karte sollte die letzte sein (oder die einzige, wenn vorher keine da war)
        const cardWrapper = allCards[allCards.length - 1];

        if (!cardWrapper) {
            throw new Error('Neue Karte nicht gefunden');
        }

        // Warte zusätzlich, bis die Karte vollständig gerendert ist
        await sleep(300);

        const card = cardWrapper.querySelector('.board-card');
        if (!card) {
            throw new Error('Board-Card Element nicht gefunden');
        }

        // Setze den Titel
        const titleElement = card.querySelector('.board-card-header .contenteditable');
        if (titleElement && cardData.title) {
            titleElement.focus();
            await sleep(100);

            titleElement.textContent = cardData.title;

            // Trigger input event für Vue.js
            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            titleElement.dispatchEvent(inputEvent);

            // Trigger blur für Speicherung
            await sleep(150);
            titleElement.blur();
            await sleep(100);
        }

        // Setze den Inhalt
        const contentElement = card.querySelector('.board-card-content .contenteditable');
        if (contentElement && (cardData.content || cardData.htmlContent)) {
            contentElement.focus();
            await sleep(100);

            // Nutze HTML-Content wenn vorhanden, sonst Text
            if (cardData.htmlContent) {
                contentElement.innerHTML = cardData.htmlContent;
            } else {
                contentElement.textContent = cardData.content;
            }

            // Trigger input event für Vue.js
            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            contentElement.dispatchEvent(inputEvent);

            await sleep(150);
            contentElement.blur();
            await sleep(100);
        }

        // Klicke außerhalb der Karte um sie zu speichern
        const boardContainer = document.querySelector('.board-container');
        if (boardContainer) {
            boardContainer.click();
        }

        await sleep(200);

        return card;
    }

    /**
     * Hilfsfunktion: Wartet X Millisekunden
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Erstellt ein Modal für die Import-Vorschau
     */
    function createImportModal(boardData) {
        const modal = document.createElement('div');
        modal.className = 'taskcards-modal';

        let contentHTML = '';

        if (boardData.board.type === 'chalkboard') {
            contentHTML = '<h4>Karten auf der Tafel:</h4><ul style="margin-left: 20px;">';
            boardData.board.cards.forEach(card => {
                contentHTML += `<li><strong>${card.title || 'Ohne Titel'}</strong>`;
                contentHTML += ` (Position: ${card.position.x}, ${card.position.y})`;
                if (card.attachments.length > 0) {
                    contentHTML += ` - ${card.attachments.length} Anhänge`;
                }
                contentHTML += '</li>';
            });
            contentHTML += '</ul>';

            if (boardData.board.connections.length > 0) {
                contentHTML += `<h4>Verbindungen: ${boardData.board.connections.length}</h4>`;
            }
        } else if (boardData.board.type === 'kanban') {
            boardData.board.columns.forEach(column => {
                contentHTML += `<h4>${column.title} (${column.cards.length} Karten)</h4>`;
                contentHTML += '<ul style="margin-left: 20px; margin-bottom: 15px;">';
                column.cards.forEach(card => {
                    contentHTML += `<li><strong>${card.title || 'Ohne Titel'}</strong>`;
                    if (card.attachments.length > 0) {
                        contentHTML += ` (${card.attachments.length} Anhänge)`;
                    }
                    contentHTML += '</li>';
                });
                contentHTML += '</ul>';
            });
        }

        modal.innerHTML = `
            <div class="taskcards-modal-content">
                <span class="taskcards-modal-close">&times;</span>
                <h2>📋 Board Import-Vorschau</h2>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
                    <h3>${boardData.board.title}</h3>
                    <p><strong>Typ:</strong> ${boardData.board.type === 'chalkboard' ? 'Tafel' : 'Kanban/Pinnwand'}</p>
                    <p><strong>Autor:</strong> ${boardData.board.author || 'Unbekannt'}</p>
                    <p><strong>Exportiert:</strong> ${new Date(boardData.exportDate).toLocaleString('de-DE')}</p>
                    ${boardData.stats ? `
                        <p><strong>${boardData.stats.type === 'chalkboard' ? 'Karten' : 'Spalten'}:</strong>
                        ${boardData.stats.type === 'chalkboard' ? boardData.stats.totalCards : boardData.stats.totalColumns}</p>
                        ${boardData.stats.type === 'kanban' ? `<p><strong>Karten:</strong> ${boardData.stats.totalCards}</p>` : ''}
                        ${boardData.stats.totalConnections ? `<p><strong>Verbindungen:</strong> ${boardData.stats.totalConnections}</p>` : ''}
                        <p><strong>Anhänge:</strong> ${boardData.stats.totalAttachments || 0}</p>
                    ` : ''}
                </div>

                <h3>Inhalte:</h3>
                <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                    ${contentHTML}
                </div>

                <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 5px;">
                    <h3>📌 Hinweis für NBC-Import</h3>
                    <p>Die Board-Daten wurden erfolgreich geladen und in der Browser-Konsole ausgegeben.</p>
                    <p><strong>Für den Import in die Niedersächsische Bildungscloud:</strong></p>
                    <ol style="margin-left: 20px;">
                        <li>Öffne die Browser-Entwicklertools (F12)</li>
                        <li>Wechsle zur Konsole</li>
                        <li>Kopiere die JSON-Daten zwischen den Markierungen</li>
                        <li>Nutze die NBC-Import-Funktion</li>
                    </ol>
                    <button onclick="navigator.clipboard.writeText(JSON.stringify(${JSON.stringify(boardData)}, null, 2)).then(() => alert('Daten in Zwischenablage kopiert!'))"
                            style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 10px;">
                        📋 JSON in Zwischenablage kopieren
                    </button>
                </div>

                <div style="text-align: right; margin-top: 20px;">
                    <button class="taskcards-modal-close" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Schließen
                    </button>
                </div>
            </div>
        `;

        const closeBtn = modal.querySelectorAll('.taskcards-modal-close');
        closeBtn.forEach(btn => {
            btn.onclick = () => {
                modal.style.display = 'none';
                document.body.removeChild(modal);
            };
        });

        return modal;
    }

    /**
     * Zeigt eine Benachrichtigung an
     */
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10002;
            padding: 15px 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            font-size: 14px;
            max-width: 400px;
            white-space: pre-line;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    /**
     * Initialisierung - Buttons hinzufügen
     */
    function init() {
        // Warte bis die Seite vollständig geladen ist
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        // Warte bis Board-Container vorhanden ist
        const checkBoardLoaded = setInterval(() => {
            const boardContainer = document.querySelector('.board-container');
            if (boardContainer) {
                clearInterval(checkBoardLoaded);

                // Export-Button
                const exportBtn = document.createElement('button');
                exportBtn.className = 'taskcards-export-btn';
                exportBtn.textContent = '📥 Board exportieren';
                exportBtn.onclick = exportBoard;
                document.body.appendChild(exportBtn);

                // Import-Button
                const importBtn = document.createElement('button');
                importBtn.className = 'taskcards-import-btn';
                importBtn.textContent = '📤 Board importieren';
                importBtn.onclick = openImportDialog;
                document.body.appendChild(importBtn);

                console.log('Taskcards Export/Import Script v2.0 geladen');
                console.log('Nutze die Buttons rechts oben zum Exportieren/Importieren');
            }
        }, 500);

        // Timeout nach 10 Sekunden
        setTimeout(() => clearInterval(checkBoardLoaded), 10000);
    }

    // CSS Animation hinzufügen
    GM_addStyle(`
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `);

    // Script starten
    init();
})();
