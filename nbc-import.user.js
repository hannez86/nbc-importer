// ==UserScript==
// @name         NBC Board Import (from Taskcards)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Importiert Taskcards-Boards in die Niedersächsische Bildungscloud (NBC) - Whiteboard → Einzelspalte, Kanban → Mehrspaltig
// @author       HSander
// @match        https://*.niedersachsen.cloud/*
// @match        https://*.hpi-schul-cloud.de/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[NBC Import] Script geladen');

    /**
     * Hilfsfunktion für Verzögerungen
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Wartet auf ein Element, das der Selector-Funktion entspricht
     */
    async function waitForElement(selectorFn, timeoutMs = 4000, intervalMs = 150) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const el = selectorFn();
            if (el) {
                return el;
            }
            await sleep(intervalMs);
        }
        return null;
    }

    function isButtonDisabled(button) {
        if (!button) {
            return true;
        }
        return button.disabled || button.getAttribute('aria-disabled') === 'true';
    }

    function isElementVisible(element) {
        if (!element) {
            return false;
        }
        return element.offsetParent !== null;
    }

    function hoverElement(element) {
        if (!element) {
            return;
        }
        const events = ['mouseenter', 'mouseover', 'mousemove'];
        events.forEach((type) => {
            element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
    }

    function getBoardSurface(columnHost) {
        if (columnHost) {
            const surface = columnHost.closest('.multi-column-board');
            if (surface) {
                return surface;
            }
        }
        return document.querySelector('.multi-column-board')
            || document.querySelector('[class*="multi-column-board"]')
            || document.querySelector('[class*="board"]');
    }

    function clickEmptyBoardArea(columnHost) {
        const boardSurface = getBoardSurface(columnHost);
        if (!boardSurface) {
            return false;
        }
        const rect = boardSurface.getBoundingClientRect();
        const offsets = [
            { x: 10, y: 10 },
            { x: rect.width - 10, y: 10 },
            { x: 10, y: rect.height - 10 },
            { x: rect.width - 10, y: rect.height - 10 }
        ];

        for (const offset of offsets) {
            const clientX = Math.max(rect.left + offset.x, rect.left + 5);
            const clientY = Math.max(rect.top + offset.y, rect.top + 5);
            const target = document.elementFromPoint(clientX, clientY);
            if (target && (target.closest('[data-testid^="board-card-"]') || target.closest('[data-testid^="board-column-"]'))) {
                continue;
            }
            boardSurface.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX,
                clientY
            }));
            return true;
        }

        boardSurface.click();
        return true;
    }

    function getColumnHost(column, columnIndex) {
        if (column && column.titleElement) {
            const host = column.titleElement.closest('[data-testid^="board-column-"]');
            if (host) {
                return host;
            }
        }
        const byId = document.querySelector(`[data-testid="board-column-${columnIndex}"]`);
        if (byId) {
            return byId;
        }
        const all = Array.from(document.querySelectorAll('[data-testid^="board-column-"]'));
        if (all.length > columnIndex) {
            return all[columnIndex];
        }
        return null;
    }

    function getColumnTitleElement(columnIndex) {
        return document.querySelector(`[data-testid="column-title-${columnIndex}"]`);
    }

    async function setColumnTitle(columnIndex, title) {
        if (!title) {
            return;
        }
        const titleHost = await waitForElement(() => getColumnTitleElement(columnIndex), 3000, 150);
        if (!titleHost) {
            console.warn('[NBC Import] Spaltentitel-Element nicht gefunden für Index', columnIndex);
            return;
        }

        const input = titleHost.querySelector('textarea, input[type="text"]') || titleHost;
        input.focus();
        await sleep(80);

        try {
            input.select?.();
            const success = document.execCommand('insertText', false, title);
            if (success) {
                input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true
                }));
                await sleep(200);
                return;
            }
        } catch (error) {
            console.warn('[NBC Import] execCommand für Spaltentitel fehlgeschlagen:', error);
        }

        input.value = title;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: title }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            bubbles: true
        }));
        await sleep(200);
    }

    function findAddCardButton(column, columnIndex) {
        const columnHost = getColumnHost(column, columnIndex);
        if (columnHost) {
            const btnByTestId = columnHost.querySelector('[data-testid*="add-card"]');
            if (btnByTestId) {
                return btnByTestId;
            }
            const buttons = Array.from(columnHost.querySelectorAll('button'));
            const btnByText = buttons.find((btn) =>
                btn.textContent && btn.textContent.trim().includes('Karte hinzufügen')
            );
            if (btnByText) {
                return btnByText;
            }
        }

        return document.querySelector(`[data-testid="column-${columnIndex}-add-card-btn"]`);
    }

    async function ensureAddCardButtonVisible(column, columnIndex) {
        const columnHost = getColumnHost(column, columnIndex);
        if (columnHost) {
            columnHost.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            hoverElement(columnHost);
        }
        const boardSurface = getBoardSurface(columnHost);
        if (boardSurface) {
            hoverElement(boardSurface);
        }
        const button = await waitForElement(() => {
            const btn = findAddCardButton(column, columnIndex);
            return isElementVisible(btn) ? btn : null;
        }, 3000, 150);
        return button || findAddCardButton(column, columnIndex);
    }

    async function ensureReadyForNextCard(column, columnIndex) {
        const columnHost = getColumnHost(column, columnIndex);
        const boardSurface = getBoardSurface(columnHost);

        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (active) {
            active.blur();
        }
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            bubbles: true
        }));
        const titleEl = getColumnTitleElement(columnIndex);
        if (titleEl) {
            titleEl.click();
        }
        if (columnHost) {
            columnHost.click();
        }
        if (boardSurface) {
            boardSurface.click();
        }
        clickEmptyBoardArea(columnHost);
        await sleep(250);

        const button = await waitForElement(() => {
            const btn = findAddCardButton(column, columnIndex);
            return btn || null;
        }, 4000, 200);

        if (button && !isElementVisible(button)) {
            if (columnHost) {
                hoverElement(columnHost);
            }
            if (boardSurface) {
                hoverElement(boardSurface);
            }
            await sleep(150);
        }

        return button || findAddCardButton(column, columnIndex);
    }

    /**
     * Simuliert Tastatureingabe für ein Zeichen (für CKEditor)
     */
    function simulateKeyPress(element, char) {
        const keydownEvent = new KeyboardEvent('keydown', {
            key: char,
            code: `Key${char.toUpperCase()}`,
            charCode: char.charCodeAt(0),
            keyCode: char.charCodeAt(0),
            which: char.charCodeAt(0),
            bubbles: true,
            cancelable: true
        });
        const keypressEvent = new KeyboardEvent('keypress', {
            key: char,
            code: `Key${char.toUpperCase()}`,
            charCode: char.charCodeAt(0),
            keyCode: char.charCodeAt(0),
            which: char.charCodeAt(0),
            bubbles: true,
            cancelable: true
        });
        const inputEvent = new InputEvent('beforeinput', {
            data: char,
            inputType: 'insertText',
            bubbles: true,
            cancelable: true
        });
        const inputEvent2 = new InputEvent('input', {
            data: char,
            inputType: 'insertText',
            bubbles: true,
            cancelable: true
        });
        const keyupEvent = new KeyboardEvent('keyup', {
            key: char,
            code: `Key${char.toUpperCase()}`,
            charCode: char.charCodeAt(0),
            keyCode: char.charCodeAt(0),
            which: char.charCodeAt(0),
            bubbles: true,
            cancelable: true
        });

        element.dispatchEvent(keydownEvent);
        element.dispatchEvent(keypressEvent);
        element.dispatchEvent(inputEvent);
        element.dispatchEvent(inputEvent2);
        element.dispatchEvent(keyupEvent);
    }

    /**
     * Setzt den Inhalt eines CKEditor-Elements (bewährte Methode)
     */
    async function setCKEditorContent(editorElement, content) {
        editorElement.focus();

        // Methode 1: Versuche über CKEditor-Instanz (falls verfügbar)
        try {
            const ckeditorInstance = editorElement.ckeditorInstance;
            if (ckeditorInstance) {
                console.log('[NBC Import] CKEditor-Instanz gefunden');
                ckeditorInstance.setData(`<p>${content}</p>`);
                return true;
            }
        } catch (e) {
            console.log('[NBC Import] Keine CKEditor-Instanz:', e);
        }

        // Methode 2: execCommand
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editorElement);
        selection.removeAllRanges();
        selection.addRange(range);

        const success = document.execCommand('insertText', false, content);
        console.log('[NBC Import] execCommand Erfolg:', success);

        if (editorElement.textContent.includes(content)) {
            return true;
        }

        // Methode 3: Simuliere Tastatureingabe Zeichen für Zeichen
        console.log('[NBC Import] Verwende Keyboard-Simulation');

        editorElement.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        for (const char of content) {
            simulateKeyPress(editorElement, char);
            await sleep(10);
        }

        // Methode 4: Falls immer noch nichts, direkte DOM-Manipulation
        if (!editorElement.textContent.includes(content)) {
            console.log('[NBC Import] Verwende direkte DOM-Manipulation');
            const p = editorElement.querySelector('p');
            if (p) {
                p.textContent = content;
            } else {
                editorElement.innerHTML = `<p>${content}</p>`;
            }
            editorElement.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return editorElement.textContent.includes(content);
    }

    function htmlToPlainText(html) {
        if (!html) {
            return '';
        }
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return (temp.textContent || '').replace(/\s+\n/g, '\n').trim();
    }

    /**
     * Zeigt eine Benachrichtigung an
     */
    function showNotification(message, type = 'info') {
        console.log(`[NBC Import] ${type.toUpperCase()}: ${message}`);

        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 16px 24px;
            border-radius: 4px;
            z-index: 10000;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            max-width: 400px;
            word-wrap: break-word;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * Debug: Beobachtet DOM-Änderungen und Editor-Events für manuelle Aktionen
     */
    function startDebugObserver() {
        if (window.__nbcDebugObserver) {
            console.log('[NBC Debug] Observer läuft bereits');
            return;
        }

        const target = document.body;
        if (!target) {
            console.warn('[NBC Debug] Kein document.body gefunden');
            return;
        }

        const seen = new WeakSet();
        const lastLogTime = new Map();

        function summarizeNode(node) {
            if (!(node instanceof Element)) {
                return null;
            }

            const testId = node.getAttribute('data-testid');
            const cls = node.className && typeof node.className === 'string' ? node.className.trim() : '';
            const tag = node.tagName.toLowerCase();

            let text = '';
            if (node.matches('[contenteditable="true"], textarea, input')) {
                text = node.value || node.textContent || '';
            } else {
                text = node.textContent || '';
            }
            text = text.replace(/\s+/g, ' ').trim().slice(0, 120);

            let html = '';
            if (node.matches('[contenteditable="true"]')) {
                html = node.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 120);
            }

            return {
                tag,
                testId: testId || null,
                className: cls || null,
                text: text || null,
                html: html || null
            };
        }

        function isInterestingNode(node) {
            if (!(node instanceof Element)) {
                return false;
            }

            return (
                node.matches('[data-testid^="column-"], [data-testid^="card-"], [data-testid^="rich-text-edit-"], .ck-content, [contenteditable="true"]') ||
                node.querySelector('[data-testid^="column-"], [data-testid^="card-"], [data-testid^="rich-text-edit-"], .ck-content, [contenteditable="true"]')
            );
        }

        function shouldRateLimit(key, ms) {
            const now = Date.now();
            const last = lastLogTime.get(key) || 0;
            if (now - last < ms) {
                return true;
            }
            lastLogTime.set(key, now);
            return false;
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (!(node instanceof Element)) {
                            return;
                        }
                        if (seen.has(node)) {
                            return;
                        }
                        seen.add(node);

                        if (isInterestingNode(node)) {
                            console.log('[NBC Debug] added', summarizeNode(node));
                        }
                    });
                } else if (mutation.type === 'attributes') {
                    const info = summarizeNode(mutation.target);
                    if (info && !shouldRateLimit(`attr:${mutation.attributeName}:${info.testId || info.tag}`, 200)) {
                        console.log('[NBC Debug] attr', mutation.attributeName, info);
                    }
                } else if (mutation.type === 'characterData') {
                    const parent = mutation.target.parentElement;
                    if (parent) {
                        const info = summarizeNode(parent);
                        if (info && !shouldRateLimit(`text:${info.testId || info.tag}`, 200)) {
                            console.log('[NBC Debug] text', info);
                        }
                    }
                }
            }
        });

        observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });

        function logEditorEvent(event) {
            const targetNode = event.target;
            if (!(targetNode instanceof Element)) {
                return;
            }

            if (!targetNode.matches('[contenteditable="true"], textarea, input')) {
                return;
            }

            const info = summarizeNode(targetNode);
            if (info && !shouldRateLimit(`event:${event.type}:${info.testId || info.tag}`, 100)) {
                console.log('[NBC Debug] event', event.type, info);
            }
        }

        document.addEventListener('input', logEditorEvent, true);
        document.addEventListener('change', logEditorEvent, true);
        document.addEventListener('blur', logEditorEvent, true);
        document.addEventListener('focus', logEditorEvent, true);
        document.addEventListener('keydown', logEditorEvent, true);
        document.addEventListener('paste', logEditorEvent, true);

        function observeEditorIframes() {
            const frames = Array.from(document.querySelectorAll('iframe'));
            frames.forEach((frame) => {
                try {
                    const doc = frame.contentDocument;
                    if (!doc || frame.__nbcObserved) {
                        return;
                    }
                    frame.__nbcObserved = true;
                    doc.addEventListener('input', logEditorEvent, true);
                    doc.addEventListener('change', logEditorEvent, true);
                    doc.addEventListener('blur', logEditorEvent, true);
                    doc.addEventListener('focus', logEditorEvent, true);
                    doc.addEventListener('keydown', logEditorEvent, true);
                    doc.addEventListener('paste', logEditorEvent, true);
                    console.log('[NBC Debug] Editor-iframe beobachtet');
                } catch (err) {
                    // Cross-origin iframes können nicht beobachtet werden
                }
            });
        }

        observeEditorIframes();
        setInterval(observeEditorIframes, 1500);

        window.__nbcDebugObserver = observer;
        window.__nbcDebugObserverStop = () => {
            document.removeEventListener('input', logEditorEvent, true);
            document.removeEventListener('change', logEditorEvent, true);
            document.removeEventListener('blur', logEditorEvent, true);
            document.removeEventListener('focus', logEditorEvent, true);
            document.removeEventListener('keydown', logEditorEvent, true);
            document.removeEventListener('paste', logEditorEvent, true);
            observer.disconnect();
            window.__nbcDebugObserver = null;
            window.__nbcDebugObserverStop = null;
            console.log('[NBC Debug] Observer gestoppt');
        };

        console.log('[NBC Debug] Observer läuft. Stoppen mit: window.__nbcDebugObserverStop()');
    }

    /**
     * Erstellt den Import-Button im NBC-Interface
     */
    function createImportButton() {
        // Warte auf die NBC-Seite (Board-Seite)
        const checkInterval = setInterval(() => {
            // Suche nach einem Board-Element (NBC verwendet Vuetify)
            const boardTitle = document.querySelector('h1, h2, [class*="board"]');
            const entwurfButton = Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent.includes('Entwurf')
            );

            if (boardTitle || entwurfButton) {
                clearInterval(checkInterval);

                // Prüfe ob Button bereits existiert
                if (document.getElementById('nbc-taskcards-import-btn')) {
                    return;
                }

                const importBtn = document.createElement('button');
                importBtn.id = 'nbc-taskcards-import-btn';
                importBtn.textContent = '📥 Taskcards importieren';
                importBtn.style.cssText = `
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 12px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    z-index: 9999;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                `;

                importBtn.addEventListener('click', () => {
                    openImportDialog();
                });

                document.body.appendChild(importBtn);
                console.log('[NBC Import] Import-Button hinzugefügt');
            }
        }, 1000);

        // Stoppe nach 10 Sekunden
        setTimeout(() => clearInterval(checkInterval), 10000);
    }

    /**
     * Öffnet den Import-Dialog
     */
    function openImportDialog() {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10001;
            min-width: 400px;
        `;

        dialog.innerHTML = `
            <h2 style="margin-top: 0;">Taskcards Board importieren</h2>
            <p>Wähle eine JSON-Datei mit exportierten Taskcards-Daten:</p>
            <input type="file" id="nbc-import-file" accept=".json" style="margin: 20px 0;">
            <div style="margin-top: 20px; text-align: right;">
                <button id="nbc-import-cancel" style="padding: 8px 16px; margin-right: 10px; cursor: pointer;">Abbrechen</button>
                <button id="nbc-import-start" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Importieren</button>
            </div>
        `;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(dialog);

        document.getElementById('nbc-import-cancel').addEventListener('click', () => {
            overlay.remove();
            dialog.remove();
        });

        document.getElementById('nbc-import-start').addEventListener('click', async () => {
            const fileInput = document.getElementById('nbc-import-file');
            const file = fileInput.files[0];

            if (!file) {
                showNotification('Bitte wähle eine Datei aus', 'error');
                return;
            }

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                overlay.remove();
                dialog.remove();

                await importBoard(data);
            } catch (error) {
                showNotification('Fehler beim Lesen der Datei: ' + error.message, 'error');
                console.error('[NBC Import] Fehler:', error);
            }
        });
    }

    /**
     * Hauptfunktion für den Import
     */
    async function importBoard(data) {
        console.log('[NBC Import] Starte Import:', data);

        if (!data.board) {
            showNotification('Ungültige Datei: Kein Board gefunden', 'error');
            return;
        }

        const boardType = data.board.type;

        showNotification(`Importiere ${boardType === 'chalkboard' ? 'Whiteboard' : 'Mehrspaltig'}-Board: ${data.board.title}`, 'info');

        try {
            if (boardType === 'chalkboard') {
                await importWhiteboardAsColumn(data.board);
            } else if (boardType === 'kanban') {
                await importKanbanWithColumns(data.board);
            } else {
                throw new Error(`Unbekannter Board-Typ: ${boardType}`);
            }

            showNotification('Import erfolgreich abgeschlossen!', 'success');
        } catch (error) {
            showNotification('Fehler beim Import: ' + error.message, 'error');
            console.error('[NBC Import] Fehler:', error);
        }
    }

    /**
     * Importiert ein Whiteboard-Board als einzelne Spalte
     */
    async function importWhiteboardAsColumn(board) {
        console.log('[NBC Import] Importiere Whiteboard als Spalte:', board);

        // 1. Erstelle neue Spalte mit Board-Titel
        const column = await createColumn(board.title);
        if (!column) {
            throw new Error('Spalte konnte nicht erstellt werden');
        }

        showNotification(`Spalte "${board.title}" erstellt`, 'info');

        // 2. Sortiere Karten nach Y-Position (von oben nach unten)
        const sortedCards = [...board.cards].sort((a, b) => {
            if (a.position && b.position) {
                return a.position.y - b.position.y;
            }
            return 0;
        });

        // 3. Erstelle jede Karte untereinander
        let importedCards = 0;
        for (const cardData of sortedCards) {
            try {
                await createCard(column, cardData);
                importedCards++;

                if (importedCards % 3 === 0) {
                    showNotification(`${importedCards}/${sortedCards.length} Karten importiert...`, 'info');
                }

                await sleep(800);
            } catch (error) {
                console.error(`[NBC Import] Fehler bei Karte "${cardData.title}":`, error);
            }
        }

        showNotification(`Whiteboard-Import abgeschlossen: ${importedCards} Karten`, 'success');
    }

    /**
     * Importiert ein Kanban-Board mit vollständiger Spaltenstruktur
     */
    async function importKanbanWithColumns(board) {
        console.log('[NBC Import] Importiere Kanban-Board mit Spalten:', board);

        let importedColumns = 0;
        let importedCards = 0;

        // Iteriere durch alle Spalten
        for (const columnData of board.columns) {
            try {
                // Erstelle Spalte OHNE Titel zu setzen
                const column = await createColumn(columnData.title);
                if (!column) {
                    throw new Error(`Spalte konnte nicht erstellt werden`);
                }

                importedColumns++;
                showNotification(`Spalte ${importedColumns}/${board.columns.length} erstellt`, 'info');

                // Erstelle Karten in der Spalte
                for (const cardData of columnData.cards) {
                    try {
                        await createCard(column, cardData);
                        importedCards++;
                        await sleep(800);
                    } catch (cardError) {
                        console.error(`[NBC Import] Fehler bei Karte "${cardData.title}":`, cardError);
                    }
                }

                // Pause zwischen Spalten
                await sleep(500);

            } catch (columnError) {
                console.error(`[NBC Import] Fehler bei Spalte "${columnData.title}":`, columnError);
            }
        }

        showNotification(`Kanban-Import abgeschlossen!\n${importedColumns} Spalten, ${importedCards} Karten`, 'success');
    }

    /**
     * Erstellt eine neue Spalte in der NBC (ohne Titel zu setzen)
     */
    async function createColumn(title) {
        console.log('[NBC Import] Erstelle Spalte');

        // Zähle die vorhandenen Spalten VOR dem Hinzufügen
        const columnCountBefore = document.querySelectorAll('[data-testid^="column-title-"]').length;
        console.log('[NBC Import] Spalten vor dem Hinzufügen:', columnCountBefore);

        // Finde den "Abschnitt hinzufügen"-Button
        const addColumnBtn = Array.from(document.querySelectorAll('button')).find(btn =>
            btn.textContent.includes('Abschnitt hinzufügen')
        );

        if (!addColumnBtn) {
            throw new Error('Abschnitt-hinzufügen-Button nicht gefunden');
        }

        // Klicke den Button
        addColumnBtn.click();
        await sleep(1000);

        // Finde die neu erstellte Spalte (die letzte mit column-title)
        const allColumnTitles = document.querySelectorAll('[data-testid^="column-title-"]');
        const lastColumnTitle = allColumnTitles[allColumnTitles.length - 1];
        const newColumnIndex = allColumnTitles.length - 1;

        console.log('[NBC Import] Neue Spalte hat Index:', newColumnIndex);

        if (!lastColumnTitle) {
            throw new Error('Neue Spalte nicht gefunden');
        }

        if (title) {
            await setColumnTitle(newColumnIndex, title);
        }

        // Gib ein Objekt zurück mit dem Index und dem Titel-Element als Referenz
        return {
            columnIndex: newColumnIndex,
            titleElement: lastColumnTitle,
            title: title
        };
    }

    /**
     * Erstellt eine neue Karte in einer Spalte
     */
    async function createCard(column, cardData) {
        console.log('[NBC Import] Erstelle Karte:', cardData.title, 'in Spalte:', column.title || column.columnIndex);

        // WICHTIG: Ermittle den aktuellen Index dynamisch aus dem DOM
        // Der gespeicherte Index kann sich geändert haben, wenn NBC die Spalten neu nummeriert
        let actualColumnIndex;

        if (column.titleElement) {
            // Ermittle den aktuellen Index aus dem data-testid des Titel-Elements
            const currentTestId = column.titleElement.getAttribute('data-testid');
            const match = currentTestId ? currentTestId.match(/column-title-(\d+)/) : null;

            if (match) {
                actualColumnIndex = parseInt(match[1]);
                console.log('[NBC Import] Aktueller Index aus DOM:', actualColumnIndex);
            }
        }

        // Fallback: Versuche über das gespeicherte titleElement zu suchen
        if (actualColumnIndex === undefined && column.titleElement) {
            // Finde alle Spalten-Titel und ermittle die Position
            const allTitles = document.querySelectorAll('[data-testid^="column-title-"]');
            for (let i = 0; i < allTitles.length; i++) {
                if (allTitles[i] === column.titleElement) {
                    actualColumnIndex = i;
                    console.log('[NBC Import] Index aus Position gefunden:', actualColumnIndex);
                    break;
                }
            }
        }

        // Fallback: Verwende den ursprünglich gespeicherten Index
        if (actualColumnIndex === undefined) {
            actualColumnIndex = column.columnIndex || 0;
            console.log('[NBC Import] Verwende gespeicherten Index:', actualColumnIndex);
        }

        console.log('[NBC Import] Finale Spaltenindex:', actualColumnIndex);

        // Finde den "Karte hinzufügen"-Button für diese Spalte
        const addCardBtn = await ensureReadyForNextCard(column, actualColumnIndex);

        if (!addCardBtn) {
            console.error('[NBC Import] Verfügbare Spalten:', document.querySelectorAll('[data-testid^="column-"]').length);
            throw new Error(`Karte-hinzufügen-Button für Spalte ${actualColumnIndex} nicht gefunden`);
        }

        // Zähle bestehende Karten in der Spalte
        const cardSelector = `[data-testid^="board-card-${actualColumnIndex}-"]`;
        const cardsBefore = document.querySelectorAll(cardSelector).length;

        // Klicke den Button (ggf. Retry, falls Editor noch offen ist)
        addCardBtn.click();
        await sleep(1200);

        // Warte auf neue Karte in dieser Spalte (oder fallback auf Dokument)
        let newCardHost = await waitForElement(() => {
            const cards = Array.from(document.querySelectorAll(cardSelector));
            if (cards.length > cardsBefore) {
                return cards[cards.length - 1];
            }
            return null;
        }, 3000, 150);

        if (!newCardHost) {
            await sleep(400);
            addCardBtn.click();
            newCardHost = await waitForElement(() => {
                const cards = Array.from(document.querySelectorAll(cardSelector));
                if (cards.length > cardsBefore) {
                    return cards[cards.length - 1];
                }
                return null;
            }, 3000, 150);
        }

        const scope = newCardHost || document;
        const queryInScope = (selector) => (
            scope === document ? document.querySelector(selector) : scope.querySelector(selector)
        );

        // Finde das Textarea für den Titel (neu erstellt nach dem Klick)
        const titleTextarea = queryInScope('textarea[placeholder*="Titel hinzufügen"]');

        if (titleTextarea) {
            // Setze den Titel
            titleTextarea.focus();
            await sleep(150);
            titleTextarea.value = cardData.title || '';
            titleTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            await sleep(200);
        }

        if (newCardHost) {
            newCardHost.click();
            await sleep(150);
        }

        // Warte und suche dann das Content-Feld (CKEditor Inline)
        const expectedEditorTestId = `rich-text-edit-${actualColumnIndex}-${cardsBefore}`;
        const contentElement = await waitForElement(() => {
            const expected = document.querySelector(`[data-testid="${expectedEditorTestId}"]`);
            if (expected) {
                return expected;
            }
            const focused = document.querySelector('[data-testid^="rich-text-edit-"].ck-editor__editable_inline.ck-focused');
            if (focused) {
                return focused;
            }
            const anyEditor = document.querySelector('[data-testid^="rich-text-edit-"].ck-editor__editable_inline');
            if (anyEditor) {
                return anyEditor;
            }
            const ckContent = document.querySelector('.ck-content[contenteditable="true"]');
            if (ckContent) {
                return ckContent;
            }
            return document.querySelector('[contenteditable="true"]:not(textarea)');
        }, 5000, 200);

        console.log('[NBC Import] Content-Element gefunden:', contentElement);

        if (contentElement && (cardData.content || cardData.htmlContent)) {
            // Bereite den Content vor
            const plainText = cardData.content || htmlToPlainText(cardData.htmlContent) || '';

            // Editor aktivieren
            contentElement.click();
            await sleep(200);
            contentElement.focus();
            await sleep(100);

            // Verwende die bewährte setCKEditorContent-Funktion
            const success = await setCKEditorContent(contentElement, plainText);
            console.log('[NBC Import] Content gesetzt:', success, plainText.substring(0, 50));

            await sleep(200);
        } else {
            console.warn('[NBC Import] Content-Element nicht gefunden oder kein Content vorhanden');
        }

        // WICHTIG: Wir müssen NBC Zeit geben, den Content zu speichern, bevor wir die Karte schließen
        // Warte länger, damit der Content verarbeitet wird
        await sleep(1000);

        // Klicke auf die Spaltenüberschrift, um die Karte zu schließen
        // Das ist sicherer als Escape oder außerhalb zu klicken
        if (column.titleElement) {
            column.titleElement.click();
            await sleep(400);
        }

        // Versuche den Editor explizit zu schließen
        const columnHost = column.titleElement
            ? column.titleElement.closest('[data-testid^="board-column-"]')
            : null;
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            bubbles: true
        }));
        if (columnHost) {
            columnHost.click();
        }
        await sleep(200);

        // Warte, bis der Editor geschlossen ist und der Add-Button wieder aktiv ist
        await waitForElement(() => {
            const focusedEditor = document.querySelector('[data-testid^="rich-text-edit-"].ck-focused');
            if (focusedEditor) {
                return null;
            }
            if (isButtonDisabled(addCardBtn)) {
                return null;
            }
            return isElementVisible(addCardBtn) ? true : null;
        }, 4000, 200);

        await ensureReadyForNextCard(column, actualColumnIndex);

        console.log('[NBC Import] Karte erstellt und gespeichert');
        return true;
    }

    // Initialisierung
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createImportButton);
    } else {
        createImportButton();
    }

    // Debug-Observer bei Bedarf starten (z. B. manuell in der Konsole aufrufen)
    window.__nbcDebugObserverStart = startDebugObserver;

})();
