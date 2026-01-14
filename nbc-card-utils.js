/**
 * NBC Board Card Utilities
 * Wiederverwendbare Funktionen zum Bearbeiten von Karten in NBC Boards
 *
 * Nutzung in anderen Tampermonkey-Skripten:
 * 1. Kopiere diesen Code an den Anfang deines Skripts (innerhalb der IIFE)
 * 2. Oder verwende @require mit einer URL zu dieser Datei
 */

const NBCCardUtils = (function() {
    'use strict';

    /**
     * Hilfsfunktion für Verzögerungen
     * @param {number} ms - Millisekunden
     * @returns {Promise<void>}
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Wartet auf ein Element
     * @param {Function} selectorFn - Funktion, die das Element zurückgibt
     * @param {number} timeoutMs - Timeout in Millisekunden
     * @param {number} intervalMs - Prüfintervall in Millisekunden
     * @returns {Promise<Element|null>}
     */
    async function waitForElement(selectorFn, timeoutMs = 5000, intervalMs = 100) {
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

    /**
     * Setzt den Wert eines Textareas und triggert Vue-Events
     * @param {HTMLTextAreaElement} textarea
     * @param {string} value
     */
    function setTextareaValue(textarea, value) {
        textarea.focus();
        textarea.value = value;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * Simuliert Tastatureingabe für ein Zeichen
     * @param {Element} element
     * @param {string} char
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
     * Setzt den Inhalt eines CKEditor-Elements
     * @param {Element} editorElement
     * @param {string} content
     */
    async function setCKEditorContent(editorElement, content) {
        editorElement.focus();

        // Methode 1: Versuche über CKEditor-Instanz (falls verfügbar)
        try {
            const ckeditorInstance = editorElement.ckeditorInstance;
            if (ckeditorInstance) {
                console.log('[NBCCardUtils] CKEditor-Instanz gefunden');
                ckeditorInstance.setData(`<p>${content}</p>`);
                return;
            }
        } catch (e) {
            console.log('[NBCCardUtils] Keine CKEditor-Instanz:', e);
        }

        // Methode 2: execCommand
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editorElement);
        selection.removeAllRanges();
        selection.addRange(range);

        const success = document.execCommand('insertText', false, content);
        console.log('[NBCCardUtils] execCommand Erfolg:', success);

        if (editorElement.textContent.includes(content)) {
            return;
        }

        // Methode 3: Simuliere Tastatureingabe Zeichen für Zeichen
        console.log('[NBCCardUtils] Verwende Keyboard-Simulation');

        editorElement.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        for (const char of content) {
            simulateKeyPress(editorElement, char);
            await sleep(10);
        }

        // Methode 4: Falls immer noch nichts, direkte DOM-Manipulation
        if (!editorElement.textContent.includes(content)) {
            console.log('[NBCCardUtils] Verwende direkte DOM-Manipulation');
            const p = editorElement.querySelector('p');
            if (p) {
                p.textContent = content;
            } else {
                editorElement.innerHTML = `<p>${content}</p>`;
            }
            editorElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /**
     * Findet eine Karte anhand von Spalten- und Kartenindex
     * @param {number} columnIndex - Index der Spalte (0-basiert)
     * @param {number} cardIndex - Index der Karte in der Spalte (0-basiert)
     * @returns {Element|null}
     */
    function getCard(columnIndex, cardIndex) {
        return document.querySelector(`[data-testid="board-card-${columnIndex}-${cardIndex}"]`);
    }

    /**
     * Findet eine Spalte anhand des Index
     * @param {number} columnIndex - Index der Spalte (0-basiert)
     * @returns {Element|null}
     */
    function getColumn(columnIndex) {
        return document.querySelector(`[data-testid="board-column-${columnIndex}"]`);
    }

    /**
     * Befüllt eine Karte mit Titel und Inhalt
     * @param {Object} options - Optionen
     * @param {number} options.columnIndex - Index der Spalte (0-basiert), Standard: 0
     * @param {number} options.cardIndex - Index der Karte (0-basiert), Standard: 0
     * @param {string} options.title - Titel der Karte (optional)
     * @param {string} options.content - Inhalt der Karte (optional)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function fillCard({ columnIndex = 0, cardIndex = 0, title, content }) {
        console.log(`[NBCCardUtils] Befülle Karte [${columnIndex}][${cardIndex}]...`);

        // 1. Spalte finden
        const column = getColumn(columnIndex);
        if (!column) {
            return { success: false, error: `Spalte ${columnIndex} nicht gefunden` };
        }

        // 2. Karte finden
        const card = getCard(columnIndex, cardIndex);
        if (!card) {
            return { success: false, error: `Karte [${columnIndex}][${cardIndex}] nicht gefunden` };
        }

        // 3. Menü öffnen
        const menuButton = column.querySelector(`[data-testid="card-menu-btn-${columnIndex}-${cardIndex}"]`);
        if (!menuButton) {
            return { success: false, error: 'Karten-Menü-Button nicht gefunden' };
        }
        menuButton.click();

        // 4. Bearbeiten klicken
        const editOption = await waitForElement(() =>
            document.querySelector('[data-testid="kebab-menu-action-edit"]')
        );
        if (!editOption) {
            return { success: false, error: '"Bearbeiten"-Option nicht gefunden' };
        }
        editOption.click();
        await sleep(300);

        // 5. Titel setzen (falls angegeben)
        if (title !== undefined) {
            const titleTextarea = await waitForElement(() =>
                card.querySelector('textarea[placeholder="Titel hinzufügen"]')
            );
            if (titleTextarea) {
                setTextareaValue(titleTextarea, title);
                console.log('[NBCCardUtils] Titel gesetzt');
            } else {
                console.warn('[NBCCardUtils] Titel-Eingabefeld nicht gefunden');
            }
        }

        // 6. Inhalt setzen (falls angegeben)
        if (content !== undefined) {
            await sleep(200);
            const contentEditor = await waitForElement(() =>
                card.querySelector(`[data-testid="rich-text-edit-${columnIndex}-${cardIndex}-0"]`) ||
                card.querySelector('[contenteditable="true"].ck-editor__editable')
            );
            if (contentEditor) {
                contentEditor.click();
                await sleep(200);
                contentEditor.focus();
                await sleep(100);
                await setCKEditorContent(contentEditor, content);
                console.log('[NBCCardUtils] Inhalt gesetzt');
            } else {
                console.warn('[NBCCardUtils] Inhalts-Editor nicht gefunden');
            }
        }

        // 7. Speichern durch Klick außerhalb
        await sleep(200);
        document.body.click();

        console.log('[NBCCardUtils] Karte erfolgreich befüllt');
        return { success: true };
    }

    /**
     * Befüllt mehrere Karten nacheinander
     * @param {Array<{columnIndex?: number, cardIndex?: number, title?: string, content?: string}>} cards
     * @returns {Promise<Array<{success: boolean, error?: string}>>}
     */
    async function fillCards(cards) {
        const results = [];
        for (const cardData of cards) {
            const result = await fillCard(cardData);
            results.push(result);
            await sleep(500); // Pause zwischen Karten
        }
        return results;
    }

    // Öffentliche API
    return {
        sleep,
        waitForElement,
        setTextareaValue,
        setCKEditorContent,
        getCard,
        getColumn,
        fillCard,
        fillCards
    };
})();

// Falls als Modul verwendet (z.B. mit @require)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NBCCardUtils;
}
